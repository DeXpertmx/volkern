/**
 * Preflight de las credenciales del proveedor de conectividad.
 *
 * Por qué existe: la respuesta del proveedor llega una vez —URL, ID de socio,
 * usuario y contraseña— y se configura en una sola pega. Si esa pega trae un
 * espacio de más, unas comillas de un PDF o la contraseña dentro del campo del
 * usuario, el resultado no es un error claro sino un 401 que parece «las
 * credenciales no valen». Este script aplica la MISMA revisión pura que la API
 * (`lib/hospitality/connectivity-preflight.ts`) antes de tocar la variable del
 * servidor o la pantalla, y avisa si lo que se va a guardar no coincide byte a
 * byte con lo que ya está desplegado.
 *
 * Uso (una sola pega, campos separados por `|`):
 *   npx tsx scripts/preflight-conectividad.ts --pegado "https://host | id-socio | usuario | contraseña"
 *
 * Uso (campo a campo):
 *   npx tsx scripts/preflight-conectividad.ts --url https://host --partner-id id-socio \
 *     --usuario usuario --password contraseña
 *
 * Si falta `--url` se toma `CONNECTIVITY_BASE_URL` del entorno. No imprime la
 * contraseña (solo su longitud) y no escribe nada: solo informa y devuelve
 * código de salida 1 si hay errores bloqueantes.
 */
import {
  preflightConectividad,
  resumenPreflight,
  ETIQUETAS_CAMPO,
  type AvisoPreflight,
  type CampoPreflight,
} from '../lib/hospitality/connectivity-preflight';

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** «url | partner | usuario | contraseña» — el orden en que lo envía el proveedor. */
function desdePegado(pegado: string): {
  baseUrl?: string;
  partnerId?: string;
  username?: string;
  password?: string;
} {
  const partes = pegado
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (partes.length !== 4) {
    console.error(
      `❌ --pegado necesita los 4 campos separados por «|» (URL | ID de socio | usuario | contraseña); han llegado ${partes.length}.`,
    );
    process.exit(1);
  }
  const [baseUrl, partnerId, username, password] = partes;
  return { baseUrl, partnerId, username, password };
}

function icono(aviso: AvisoPreflight): string {
  return aviso.gravedad === 'error' ? '❌' : '⚠️ ';
}

function main(): void {
  const pegado = arg('pegado');
  const desdeBloque = pegado ? desdePegado(pegado) : {};

  const entrada = {
    baseUrl: arg('url') ?? desdeBloque.baseUrl ?? process.env.CONNECTIVITY_BASE_URL ?? '',
    partnerId: arg('partner-id') ?? arg('partnerId') ?? desdeBloque.partnerId,
    username: arg('usuario') ?? arg('username') ?? desdeBloque.username,
    password: arg('password') ?? desdeBloque.password,
    exigirTodo: true,
  };

  const resultado = preflightConectividad(entrada);

  console.log('Preflight de credenciales de Conectividad de Canales');
  console.log('─────────────────────────────────────────────────');
  for (const campo of ['baseUrl', 'partnerId', 'username', 'password'] as CampoPreflight[]) {
    const avisos = resultado.avisos.filter((a) => a.campo === campo);
    const estado = avisos.some((a) => a.gravedad === 'error')
      ? '❌'
      : avisos.length > 0
        ? '⚠️ '
        : '✅';
    console.log(`${estado} ${ETIQUETAS_CAMPO[campo]}`);
    for (const aviso of avisos) {
      console.log(`     ${icono(aviso)} ${aviso.mensaje}`);
      if (aviso.arreglo) console.log(`        → ${aviso.arreglo}`);
    }
  }

  console.log('');
  console.log(
    resultado.ok
      ? 'Valores normalizados (lo que se guardaría tal cual):'
      : 'Valores revisados (NO se ha guardado nada; corrígelos y repite):',
  );
  console.log(`  URL del servicio : ${resultado.valores.baseUrl ?? '—'}`);
  console.log(`  Ruta del contrato: ${resultado.urlContrato ?? '—'}`);
  console.log(`  ID de socio      : ${resultado.valores.partnerId ?? '—'}`);
  console.log(`  Usuario API      : ${resultado.valores.username ?? '—'}`);
  console.log(
    `  Contraseña API   : ${
      resultado.valores.password === null
        ? '—'
        : `${'•'.repeat(Math.min(resultado.valores.password.length, 12))} (${resultado.valores.password.length} caracteres, no se imprime)`
    }`,
  );

  // Comparación byte a byte con lo que ya está desplegado: la URL tiene que ser
  // la misma cadena, no «parecida».
  const desplegada = process.env.CONNECTIVITY_BASE_URL;
  if (desplegada !== undefined && desplegada !== '') {
    if (desplegada !== entrada.baseUrl) {
      console.log('');
      console.log('⚠️  La URL revisada NO es idéntica a CONNECTIVITY_BASE_URL del entorno actual:');
      console.log(`     entorno : ${desplegada}`);
      console.log(`     revisada: ${entrada.baseUrl ?? '—'}`);
      console.log('     Cambia la variable del servidor y redepliega antes de probar la conexión.');
    } else {
      console.log('');
      console.log('✅ La URL coincide byte a byte con CONNECTIVITY_BASE_URL del entorno actual.');
    }
  }

  console.log('');
  console.log(resumenPreflight(resultado));
  if (!resultado.ok) {
    console.log('Corrige los ❌ y vuelve a ejecutarlo: nada de esto se ha guardado.');
    process.exit(1);
  }
  console.log('Listo para configurar: variable del servidor para la URL y la pantalla para las credenciales.');
}

main();
