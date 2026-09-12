/**
 * Smoke test del clasificador determinista — se ejecuta DENTRO del contenedor
 * de la app, después de un despliegue.
 *
 * Qué comprueba
 * -------------
 * Que un conjunto de frases se resuelva por la RUTA DETERMINISTA contra el
 * entorno DESPLEGADO, no contra el código del repo. La evidencia es el marcador
 * '[determinista]' que escribe `completeDeterministic` en el audit log: esa
 * ruta retorna ANTES de llamar a ningún modelo, así que una fila con ese
 * prefijo demuestra que la frase no necesitó el LLM. Es exactamente la prueba
 * de "se resuelven sin claves", sin tener que apagar el LLM en producción.
 *
 * Por qué no basta con la guardia de vitest
 * -----------------------------------------
 * La guardia corre en local sobre el detector puro. Si el despliegue no
 * incorpora el arreglo (imagen vieja, build cacheado, tarball equivocado), la
 * guardia sigue verde y producción sigue roma. Esto mira el comportamiento
 * del servicio que está sirviendo de verdad.
 *
 * Aislamiento
 * -----------
 * Crea un tenant TEMPORAL y VACÍO (sin usuarios, leads, contactos, citas ni
 * inventario) y lo borra al terminar, pase lo que pase (`finally`). En un
 * tenant vacío las skills no pueden tocar datos reales: `send_message`, por
 * ejemplo, lanza error si no encuentra al destinatario en el CRM, de modo que
 * no se envía ningún correo ni WhatsApp.
 *
 * Uso (lo orquesta scripts/smoke-clasificador.sh, no hace falta a mano):
 *   node smoke-clasificador-agent.js --url https://volkern.app --casos /tmp/casos.json
 */

// El cliente de Prisma vive en el node_modules de la app; el wrapper pasa
// NODE_PATH pero se resuelve también por ruta absoluta por si acaso.
function cargarPrisma() {
  const intentos = ['@prisma/client', '/app/node_modules/@prisma/client'];
  for (const ruta of intentos) {
    try {
      return require(ruta).PrismaClient;
    } catch {
      /* siguiente intento */
    }
  }
  throw new Error('No se pudo cargar @prisma/client en el contenedor');
}

const fs = require('fs');
const PrismaClient = cargarPrisma();

const SLUG = 'zz-smoke-clasificador';
const TIMEOUT_MS = 90_000;

/** Argumentos de línea de comandos: --clave valor. */
function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

async function post(url, tenantId, mensaje, sessionId) {
  const res = await fetch(`${url}/api/chatbot/widget`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Widget-Key': tenantId },
    body: JSON.stringify({ message: mensaje, sessionId }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const texto = await res.text();
  let cuerpo = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    /* respuesta no-JSON: se reporta el texto crudo */
  }
  return { status: res.status, cuerpo, texto };
}

/**
 * Crea el tenant temporal con su config de chatbot activa y 24h de horario.
 * El horario completo es deliberado: si cae fuera del horario del tenant, el
 * servicio responde "fuera de horario" y nunca llega a clasificar, lo que
 * daría un falso fallo a las 3 de la mañana.
 */
async function preparar(prisma) {
  const previo = await prisma.tenant.findFirst({ where: { slug: SLUG } });
  if (previo) {
    console.log(`→ Resto de una ejecución anterior (${previo.id}); se elimina.`);
    await limpiar(prisma, previo.id, { silencioso: true });
  }

  const tenant = await prisma.tenant.create({
    data: { nombre: 'ZZ Smoke Clasificador', slug: SLUG },
  });
  await prisma.chatbotConfig.create({
    data: {
      tenantId: tenant.id,
      activo: true,
      horarioInicio: 0,
      horarioFin: 24,
      diasActivos: '0,1,2,3,4,5,6',
    },
  });
  return tenant.id;
}

/** Borra todo lo que la prueba pudo dejar en el tenant temporal. */
async function limpiar(prisma, tenantId, { silencioso = false } = {}) {
  const pasos = [
    ['chatbot_audit_logs', () => prisma.chatbotAuditLog.deleteMany({ where: { tenantId } })],
    ['conversaciones', () => prisma.conversation.deleteMany({ where: { tenantId } })],
    ['chatbot config', () => prisma.chatbotConfig.deleteMany({ where: { tenantId } })],
    ['leads', () => prisma.lead.deleteMany({ where: { tenantId } })],
    ['contactos', () => prisma.contact.deleteMany({ where: { tenantId } })],
  ];
  for (const [etiqueta, fn] of pasos) {
    try {
      const r = await fn();
      if (!silencioso && r && r.count) console.log(`   · ${etiqueta}: ${r.count} eliminado(s)`);
    } catch (e) {
      console.log(`   ⚠️  no se pudo limpiar ${etiqueta}: ${String(e.message).split('\n')[0]}`);
    }
  }
  await prisma.tenant.delete({ where: { id: tenantId } }).catch((e) => {
    console.log(`   ⚠️  no se pudo borrar el tenant: ${String(e.message).split('\n')[0]}`);
  });
}

(async () => {
  const { url, casos: rutaCasos } = args();
  if (!url || !rutaCasos) {
    console.error('Uso: node smoke-clasificador-agent.js --url <url> --casos <ruta.json>');
    process.exit(2);
  }

  const casos = JSON.parse(fs.readFileSync(rutaCasos, 'utf8')).deterministas || [];
  if (!casos.length) {
    console.error('✗ El archivo de casos no tiene entradas en "deterministas".');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  let tenantId = null;
  let fallos = 0;

  try {
    console.log(`→ Smoke del clasificador determinista contra ${url}`);
    console.log(`   · ${casos.length} frases (una sesión por frase: el contexto multi-turno se`);
    console.log('     comería las siguientes si compartieran conversación).');

    tenantId = await preparar(prisma);

    // 1. Enviar cada frase en su propia sesión.
    const respuestas = new Map();
    for (const [i, caso] of casos.entries()) {
      const sessionId = `smoke-${Date.now()}-${i}`;
      const r = await post(url, tenantId, caso.mensaje, sessionId);
      respuestas.set(caso.mensaje, r);
      if (r.status !== 200) {
        console.log(`   ⚠️  HTTP ${r.status} en "${caso.mensaje}": ${r.texto.slice(0, 120)}`);
      }
    }

    // 2. Leer lo que registró el clasificador (la evidencia real).
    const filas = await prisma.chatbotAuditLog.findMany({
      where: { tenantId },
      select: { intent: true, inputRaw: true, gemmaOutput: true },
    });

    console.log('');
    console.log('   RESULTADO                                   INTENT ESPERADO / OBTENIDO     RUTA');
    console.log('   ' + '─'.repeat(92));

    for (const caso of casos) {
      const fila = filas.find((f) => (f.inputRaw || '').trim() === caso.mensaje.trim());
      const determinista = !!fila && (fila.gemmaOutput || '').startsWith('[determinista]');
      const intentOk = !!fila && fila.intent === caso.intent;
      const ok = determinista && intentOk;
      if (!ok) fallos++;

      const estado = ok ? 'OK  ' : 'FALLA';
      const obtenido = fila ? fila.intent : 'sin registro';
      const ruta = !fila ? 'sin registro' : determinista ? 'determinista' : 'NO determinista';
      console.log(
        `   ${estado} ${caso.mensaje.slice(0, 38).padEnd(39)} ${caso.intent} / ${obtenido}`.padEnd(88) +
          ` ${ruta}`
      );
    }

    console.log('   ' + '─'.repeat(92));
    const okTotal = casos.length - fallos;
    console.log(`   ${okTotal}/${casos.length} resueltas por la ruta determinista`);

    // Señal secundaria: lo que devolvió el endpoint.
    const noRespondidas = [...respuestas.values()].filter((r) => r.status !== 200).length;
    if (noRespondidas) console.log(`   ⚠️  ${noRespondidas} petición(es) no respondieron HTTP 200`);

    if (fallos) {
      console.log('');
      console.log('   ✗ SMOKE FALLIDO: el despliegue no está resolviendo estas frases sin LLM.');
      console.log('     Revisa que la imagen desplegada incluya el arreglo del clasificador.');
    } else {
      console.log('');
      console.log('   ✓ SMOKE OK: las frases se resuelven por la ruta determinista en el entorno desplegado.');
    }
  } catch (e) {
    console.error(`✗ Error inesperado: ${e && e.message ? e.message : e}`);
    fallos++;
  } finally {
    if (tenantId) {
      console.log('');
      console.log('→ Limpieza del tenant temporal ...');
      await limpiar(prisma, tenantId);
      const queda = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
      console.log(queda ? '   ⚠️  EL TENANT TEMPORAL SIGUE EXISTIENDO' : '   ✓ tenant temporal eliminado');
      if (queda) fallos++;
    }
    await prisma.$disconnect();
  }

  process.exit(fallos ? 1 : 0);
})();
