#!/usr/bin/env node
/**
 * scripts/homologacion-mir.mjs
 *
 * Lanzador de los casos de HOMOLOGACIÓN del registro de viajeros contra el
 * entorno de PRUEBAS REAL del Ministerio (hospedajes.pre-ses.mir.es) — el plan
 * completo está en docs/hospitality-mir-homologacion-plan.md.
 *
 * Este script NO envía nada por su cuenta: las peticiones salen SIEMPRE del
 * producto (postComunicacion), que es lo que se está homologando. Lo que hace
 * es orquestar el banco de pruebas:
 *
 *   1. Comprueba las precondiciones (configuración del tenant en entorno
 *      `pre`, credenciales presentes, código de establecimiento, apagador).
 *   2. Ejecuta los casos de la matriz por grupos (feliz, anulación, rechazos,
 *      RH, ciclo), leyendo el resultado de la traza del producto.
 *   3. Deja un informe en /tmp (y en consola) con cada caso: petición, HTTP,
 *      código de retorno, lote y estado final.
 *
 * APAGADOR: exige MIR_HOMOLOGACION=1 en el entorno. Sin él, no hace nada —
 * esta herramienta habla con un servicio REAL del Ministerio y no puede
 * ejecutarse por accidente, ni desde un CI, ni copiando un comando del doc.
 *
 * Uso (después de preparar la configuración del tenant, fase 2 del plan):
 *
 *   MIR_HOMOLOGACION=1 node scripts/homologacion-mir.mjs --tenant <id> --grupo feliz
 *   MIR_HOMOLOGACION=1 node scripts/homologacion-mir.mjs --tenant <id> --grupo rechazos
 *   MIR_HOMOLOGACION=1 node scripts/homologacion-mir.mjs --tenant <id> --informe
 *
 * Los casos necesitan reservas REALES del piloto con referencia `HOM-…`
 * (creadas a mano o por API); este script no las fabrica: los documentos de
 * viajeros los decide el hotel, no la herramienta.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Apagador ───────────────────────────────────────────────────────────────

if (process.env.MIR_HOMOLOGACION !== '1') {
  console.error(
    'Homologación desactivada: esta herramienta envía peticiones REALES al ' +
      'entorno de pruebas del Ministerio (hospedajes.pre-ses.mir.es).\n' +
      'Si es lo que quieres hacer ahora, lánzala con MIR_HOMOLOGACION=1 y el ' +
      '--tenant de homologación.\n' +
      'Para pruebas SIN servicio real, usa el ensayo E2E (test:e2e:booking), ' +
      'que trabaja contra el mock de loopback.'
  );
  process.exit(2);
}

// ─── Argumentos ─────────────────────────────────────────────────────────────

function argValor(nombre) {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice >= 0 ? process.argv[indice + 1] : null;
}
const tenantId = argValor('tenant');
const grupo = argValor('grupo') || 'todo';
const soloInforme = process.argv.includes('--informe');

if (!tenantId) {
  console.error('Falta --tenant <id> (el tenant de homologación, no el de producción).');
  process.exit(2);
}

// ─── Precondiciones (fase 2 del plan) ───────────────────────────────────────

const HOST_PRE = 'hospedajes.pre-ses.mir.es';

async function comprobarPrecondiciones() {
  const fallos = [];
  const config = await prisma.hospitalityMirConfig.findUnique({ where: { tenantId } });
  if (!config) fallos.push('El tenant no tiene configuración MIR (pantalla del registro o accion configurar).');
  if (config && !config.activo) fallos.push('La configuración no está activa.');
  if (config?.entorno !== 'pre') {
    fallos.push(
      `El entorno debe ser 'pre' (entorno de pruebas del Ministerio) y es '${config?.entorno ?? 'sin definir'}'.`
    );
  }
  if (config && (!config.usuarioEnc || !config.passwordEnc)) {
    fallos.push('Faltan las credenciales cifradas del servicio de pruebas.');
  }
  const propiedadesSinCodigo = await prisma.hospitalityProperty.count({
    where: { tenantId, estado: { in: ['activa', 'activado', 'published'] }, codigoEstablecimientoMIR: null },
  });
  if (propiedadesSinCodigo > 0) {
    fallos.push(
      `${propiedadesSinCodigo} propiedad(es) sin código de establecimiento MIR: las reservas de esas propiedades no se pueden comunicar.`
    );
  }

  // La guardia dura: el endpoint resuelto por el producto tiene que ser el del
  // entorno de pruebas del Ministerio. Si no, no se ejecuta ningún caso.
  const { endpointMIR } = await import('../lib/hospitality/registro-viajeros.ts');
  const endpoint = endpointMIR('pre');
  if (!endpoint.includes(HOST_PRE)) {
    fallos.push(`El endpoint de 'pre' no es el esperado: ${endpoint}`);
  }

  return { ok: fallos.length === 0, fallos, config };
}

// ─── Casos (matriz del plan, sección 3) ─────────────────────────────────────

const GRUPOS = {
  // 3.a Camino feliz del PV.
  feliz: {
    titulo: '3.a Camino feliz del parte (PV)',
    casos: [
      { id: 1, nombre: 'Alta PV con titular válido y consulta de lote hasta aceptada' },
      { id: 2, nombre: 'Alta PV con titular + acompañante (parentesco)' },
      { id: 3, nombre: 'Alta PV con dirección española completa (CP + municipio INE)' },
      { id: 4, nombre: 'Consulta inmediata: el lote aún no está resuelto (en vuelo)' },
      { id: 5, nombre: 'Consulta del lote resuelto: código de comunicación asignado' },
    ],
  },
  anulacion: {
    titulo: '3.b Anulación (operación B)',
    casos: [
      { id: 6, nombre: 'Anular una comunicación aceptada (reserva cancelada)' },
      { id: 7, nombre: 'Anular un código de comunicación inexistente (rechazo coherente)' },
    ],
  },
  rechazos: {
    titulo: '3.c Rechazos reales (tabla de códigos del apartado 5)',
    casos: [
      { id: 8, nombre: 'Arrendador vacío → 10100' },
      { id: 9, nombre: 'Documento inválido → 10121/10130 con la ruta del campo' },
      { id: 10, nombre: 'Municipio INE inexistente → código del servicio' },
      { id: 11, nombre: 'Credencial mala → 401/Fault, traza en error (no rechazada)' },
      { id: 12, nombre: 'ZIP con XML corrupto → error de formato (lote con errores)' },
    ],
  },
  rh: {
    titulo: '3.d Reserva de hospedaje (RH)',
    casos: [
      { id: 13, nombre: 'XSD/namespace de RH informado (NS_ALTA_RESERVA) y alta emitida' },
      { id: 14, nombre: 'Alta RH al formalizar (titular TI + contacto)' },
      { id: 15, nombre: 'Alta RH sin documento del titular (respuesta real del servicio)' },
    ],
  },
  ciclo: {
    titulo: '3.e Ciclo autónomo del producto (cron + abandono + reenvío)',
    casos: [
      { id: 16, nombre: 'Jornada completa del cron con datos reales (panel coherente)' },
      { id: 17, nombre: 'Parte rechazado agota los 5 intentos: email + tarjeta + panel' },
      { id: 18, nombre: 'Corrección del dato y reenvío → aceptado, avisos limpiados' },
    ],
  },
};

/**
 * Ejecuta un grupo leyendo SOLO de la traza del producto: las peticiones salen
 * del servicio (API o cron), y este banco comprueba qué quedó en la base de
 * datos. Un caso "manual" exige la intervención descrita en el plan; la
 * herramienta verifica el RESULTADO, no envía la petición directamente.
 */
async function ejecutarGrupo(nombreGrupo) {
  const definicion = GRUPOS[nombreGrupo];
  if (!definicion) {
    console.error(`Grupo desconocido: ${nombreGrupo}. Válidos: ${Object.keys(GRUPOS).join(', ')}, todo.`);
    process.exit(2);
  }

  console.log(`\n=== ${definicion.titulo} ===`);
  const filas = await prisma.hospitalityGuestRegistryCommunication.findMany({
    where: { tenantId, referencia: { startsWith: 'HOM-' } },
    orderBy: { fechaCreacion: 'desc' },
    take: 100,
    select: {
      referencia: true,
      estado: true,
      intentos: true,
      lote: true,
      codigoComunicacion: true,
      codigoRetorno: true,
      descripcion: true,
      fechaEnvio: true,
      fechaEdicion: true,
    },
  });

  if (filas.length === 0) {
    console.log(
      '  Sin trazas con referencia HOM-… todavía.\n' +
        '  Crea las reservas de homologación (ver plan §2 y §3) y lanza los envíos\n' +
        '  desde la configuración del registro o por API (accion enviar/consultar/anular).\n' +
        '  Después vuelve a ejecutar este comando para ver el estado de cada caso.'
    );
    return;
  }

  for (const fila of filas) {
    const lote = fila.lote ? ` · lote=${fila.lote}` : '';
    const codigo = fila.codigoComunicacion ? ` · codigoComunicacion=${fila.codigoComunicacion}` : '';
    const retorno = fila.codigoRetorno ? ` · retorno=${fila.codigoRetorno}` : '';
    const desc = fila.descripcion ? ` · ${String(fila.descripcion).slice(0, 100)}` : '';
    console.log(
      `  [${fila.estado.toUpperCase()}] ${fila.referencia} · intentos=${fila.intentos}` +
        `${lote}${codigo}${retorno}${desc}`
    );
  }
}

// ─── Informe ────────────────────────────────────────────────────────────────

async function informe() {
  const filas = await prisma.hospitalityGuestRegistryCommunication.findMany({
    where: { tenantId, referencia: { startsWith: 'HOM-' } },
    orderBy: { fechaCreacion: 'desc' },
    take: 500,
    select: {
      referencia: true,
      estado: true,
      intentos: true,
      lote: true,
      codigoComunicacion: true,
      codigoRetorno: true,
      descripcion: true,
      fechaCreacion: true,
      fechaEdicion: true,
    },
  });

  const porEstado = {};
  for (const fila of filas) porEstado[fila.estado] = (porEstado[fila.estado] ?? 0) + 1;

  const lineas = [
    `Informe de homologación MIR — tenant ${tenantId}`,
    `Fecha: ${new Date().toISOString()}`,
    `Trazas HOM-: ${filas.length}`,
    `Por estado: ${JSON.stringify(porEstado)}`,
    '',
    ...filas.map((f) =>
      `${f.fechaEdicion?.toISOString?.() ?? f.fechaEdicion} · ${f.referencia} · ${f.estado} · ` +
      `intentos=${f.intentos} · lote=${f.lote ?? '-'} · com=${f.codigoComunicacion ?? '-'} · ` +
      `retorno=${f.codigoRetorno ?? '-'} · ${f.descripcion ?? ''}`
    ),
  ];
  const texto = lineas.join('\n');
  console.log(texto);
  const destino = `/tmp/homologacion-mir-${tenantId}.txt`;
  const { writeFileSync } = await import('node:fs');
  writeFileSync(destino, texto, 'utf8');
  console.log(`\nGuardado en ${destino}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

try {
  const { ok, fallos } = await comprobarPrecondiciones();
  if (!ok) {
    console.error('Precondiciones incumplidas (plan §2):');
    for (const f of fallos) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('✔ Precondiciones OK (entorno pre, credenciales y códigos presentes)');

  if (soloInforme) {
    await informe();
  } else if (grupo === 'todo') {
    for (const nombre of Object.keys(GRUPOS)) await ejecutarGrupo(nombre);
  } else {
    await ejecutarGrupo(grupo);
  }
} catch (err) {
  console.error('Error del banco de homologación:', err?.message || err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
