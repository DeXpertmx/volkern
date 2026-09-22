/**
 * Cron `hospitality_registro_viajeros` — comunicación al Ministerio del Interior.
 *
 * El RD 933/2021 (art. 6) obliga a comunicar la información de los viajeros
 * «de manera inmediata y, en todo caso, en un plazo no superior a 24 horas» a
 * partir del inicio del servicio. Este barrido es el que cumple ese plazo: no
 * depende de que alguien pulse un botón.
 *
 * Qué hace cada pasada, por tenant con configuración activa:
 *  1. **Alta de partes de viajeros** de las reservas cuyo servicio ya empezó
 *     (check-in alcanzado) y que aún no tienen una comunicación aceptada **ni
 *     una en vuelo**. `enviarRegistroDeReserva()` valida antes de llamar al
 *     servicio: si falta el documento del huésped o la dirección, la
 *     comunicación queda en `datos_incompletos` con el detalle y NO se envía
 *     nada. Lo que ya está en el Ministerio esperando lote NO se reenvía: se
 *     resuelve consultando el lote (paso 2). Reenviarlo duplicaría la
 *     comunicación del mismo huésped.
 *  2. **Consulta de lotes**: el alta es asíncrona. Este paso resuelve qué
 *     partes se registraron de verdad (código de comunicación) y cuáles
 *     traían errores, sin depender de nadie.
 *  3. **Anulación** de las comunicaciones de reservas canceladas.
 *  4. **Recuento de lo que el barrido ya NO va a reintentar**: los rechazados con
 *     los intentos agotados no aparecen en ningún otro contador (no se envían
 *     *porque no se van a enviar*), así que se cuentan al final y se publican por
 *     tenant para el panel de estado.
 *
 * REINTENTOS: sin retries ciegos (misma regla que la reconciliación de
 * conectividad). Una comunicación rechazada o incompleta se reintenta cuando
 * pasa un tiempo (el operador puede haber completado los datos) y se abandona
 * tras un número máximo de intentos: así un parte imposible no genera una
 * tormenta de peticiones contra el servicio del Ministerio.
 */

import { prisma } from '../db';
import {
  ESTADO_REGISTRO,
  VENTANA_LOTE_MS,
  consultarLotesPendientes,
  enviarRegistroDeReserva,
  enviarReservaHospedaje,
  anularComunicacion,
  getMirConfig,
} from '../hospitality/registro-viajeros-service';
import {
  ESTADOS_ACTIVOS_REGISTRO,
  TIPO_COMUNICACION,
  TIPO_OPERACION,
  reservasHospedajeHabilitadas,
} from '../hospitality/registro-viajeros';
import {
  ESTADOS_ABANDONABLES,
  MAX_INTENTOS_PARTE,
  esperaReintentoMs,
} from '../hospitality/parte-rechazo';
import {
  TIPO_AVISO_PARTES,
  asuntoAvisoPartes,
  cuerpoAvisoPartes,
  htmlAvisoPartes,
  type ParteParaAviso,
} from '../hospitality/aviso-partes';
import { sendEmail } from '@/lib/ses-email';

/**
 * Id del job en el panel de estado (`/api/cron-status`) y en el scheduler.
 * Una sola definición: la ruta del cron y el scheduler comparten el nombre.
 */
export const JOB_ID_REGISTRO_VIAJEROS = 'hospitality-registro-viajeros';

/** Etiqueta y cadencia del job, para el panel de estado. */
export const JOB_LABEL_REGISTRO_VIAJEROS = 'Hospitality Registro de Viajeros (MIR)';
/** Cada hora, desfasado del resto de jobs horarios (que van al minuto 0). */
export const JOB_SCHEDULE_REGISTRO_VIAJEROS = '30 * * * *';

/** Ventana hacia atrás para recuperar partes no enviados (una semana). */
const DIAS_VENTANA = 7;

/**
 * Máximo de intentos por comunicación antes de dejarla para revisión manual.
 *
 * La cifra vive en `parte-rechazo.ts` porque la pantalla de reservas tiene que
 * decir lo mismo que el barrido («ya no lo reintenta solo»): una sola
 * definición, y el módulo puro es el único que pueden leer los dos.
 */
export const MAX_REINTENTOS = MAX_INTENTOS_PARTE;

/** Tope de reservas y anulaciones por barrido. */
const LIMITE_POR_BARRIDO = 100;

/** Un tenant con partes que el barrido ya no va a reintentar. */
export interface PartesAbandonadosPorTenant {
  tenantId: string;
  /** Nombre del tenant, para que el panel lo enseñe sin cruzar ids a mano. */
  nombre: string;
  partes: number;
  /** De ellos, rechazados por el Ministerio (se corrige el dato del huésped). */
  rechazados: number;
  /** De ellos, entregas que el servicio no recibió (se reintenta). */
  sinEntregar: number;
}

export interface ResultadoBarridoRegistroViajeros {
  tenants: number;
  candidatas: number;
  enviadas: number;
  aceptadasAlConsultar: number;
  rechazadas: number;
  datosIncompletos: number;
  anuladas: number;
  /** Reservas de hospedaje (RH) enviadas en esta pasada. */
  reservasEnviadas: number;
  /** Reservas de hospedaje que no se han podido emitir (falta el XSD oficial). */
  reservasPendienteXsd: number;
  /**
   * Partes que el barrido ya no reintenta —rechazados por el Ministerio o sin
   * entregar— porque agotaron sus intentos: **nadie más lo va a hacer**. No son
   * «los que no se han enviado esta vez» (eso no aparecería en ningún contador),
   * sino los que se han quedado fuera del alcance del producto hasta que alguien
   * los toque.
   */
  abandonados: number;
  /** El mismo dato, por tenant, para el panel de estado. */
  abandonadosPorTenant: PartesAbandonadosPorTenant[];
  /**
   * Partes de esta pasada que se intentaron enviar y el servicio no llegó a
   * recibir (caída, red, timeout). No es un rechazo: el Ministerio no ha visto
   * esos partes. Se cuenta aparte para que una caída del servicio se vea en el
   * panel de estado como lo que es.
   */
  sinEntregar: number;
  errores: number;
  error?: string;
  /**
   * Resultado del aviso por email: a cuántos tenants se les avisó de sus partes
   * abandonados en esta pasada (y a cuántos no, con el motivo). `null` si no
   * había nada que avisar: el campo existe para el panel, no para presumir.
   */
  avisosEnviados?: number;
  avisosFallidos?: number;
  avisosEnEspera?: number;
}

export async function runRegistroViajerosScan(
  ahora: Date = new Date(),
  opts?: { limite?: number; diasVentana?: number }
): Promise<ResultadoBarridoRegistroViajeros> {
  const limite = opts?.limite ?? LIMITE_POR_BARRIDO;
  const diasVentana = opts?.diasVentana ?? DIAS_VENTANA;
  const resultado: ResultadoBarridoRegistroViajeros = {
    tenants: 0,
    candidatas: 0,
    enviadas: 0,
    aceptadasAlConsultar: 0,
    rechazadas: 0,
    datosIncompletos: 0,
    anuladas: 0,
    reservasEnviadas: 0,
    reservasPendienteXsd: 0,
    abandonados: 0,
    abandonadosPorTenant: [],
    sinEntregar: 0,
    errores: 0,
  };

  console.log(`[Cron] 🧾 Registro de viajeros (referencia ${ahora.toISOString()})...`);

  try {
    // Solo tenants con configuración activa: sin credenciales no hay nada que enviar.
    const configs = await prisma.hospitalityMirConfig.findMany({
      where: { activo: true },
      select: { tenantId: true, usuarioEnc: true, passwordEnc: true },
    });
    const tenants = configs
      .filter((c) => c.usuarioEnc && c.passwordEnc)
      .map((c) => c.tenantId);
    resultado.tenants = tenants.length;
    if (tenants.length === 0) {
      console.log('[Cron] ✅ hospitality_registro_viajeros: sin tenants configurados');
      return resultado;
    }

    const desde = new Date(ahora.getTime() - diasVentana * 24 * 60 * 60 * 1000);
    // La espera del reintento es CRECIENTE con los intentos ya gastados
    // (backoff): `limiteReintentoN` es la fecha antes de la cual el parte con
    // N-1 intentos todavía espera. La regla pura (`reintentoDisponible`) es la
    // misma; aquí se traduce a Prisma porque una consulta no puede llamarla.
    const limiteReintento1 = new Date(ahora.getTime() - esperaReintentoMs(1));
    const limiteReintento2 = new Date(ahora.getTime() - esperaReintentoMs(2));
    const limiteReintento3 = new Date(ahora.getTime() - esperaReintentoMs(3));
    const limiteReintento4 = new Date(ahora.getTime() - esperaReintentoMs(4));
    const limiteReintento5 = new Date(ahora.getTime() - esperaReintentoMs(5));
    // Un lote vencido (el servicio no lo resolvió en el plazo legal) deja de
    // estar «en vuelo»: la reserva vuelve a ser candidata y el parte se reenvía.
    const loteVencido = new Date(ahora.getTime() - VENTANA_LOTE_MS);
    const claveParte = { tipoComunicacion: TIPO_COMUNICACION.parteViajeros, tipoOperacion: TIPO_OPERACION.alta };

    // ── 1. Reservas con servicio ya iniciado y sin parte aceptado ────────────
    const candidatas = await prisma.hospitalityReservation.findMany({
      where: {
        tenantId: { in: tenants },
        // El parte de viajeros comunica la ENTRADA: un no-show o una cancelada
        // nunca entraron al establecimiento (misma lista que usa el check-in
        // online para decidir si ya toca enviar, en el módulo del registro).
        estado: { in: [...ESTADOS_ACTIVOS_REGISTRO] },
        checkIn: { lte: ahora, gte: desde },
        guestRegistryCommunications: {
          none: {
            ...claveParte,
            OR: [
              { estado: ESTADO_REGISTRO.aceptada },
              // En vuelo: ya entregado al servicio y pendiente de lote. Es la
              // MISMA regla que `enVuelo()` del servicio (una consulta Prisma no
              // puede llamar a la función): sin lote o con la ventana vencida
              // vuelve a ser candidata.
              {
                estado: ESTADO_REGISTRO.enviada,
                lote: { not: null },
                fechaEnvio: { gte: loteVencido },
              },
              // Reintento espaciado, no continuo, y con ESPERA CRECIENTE
              // (backoff 1h, 2h, 4h… según los intentos ya gastados): cada
              // peldaño tiene su fecha límite. El `error` (el servicio no
              // respondió) entra aquí: una caída se reintenta, pero cada vez
              // menos a menudo — si está caída una mañana, cada parte la
              // golpea una vez y las siguientes esperan más.
              {
                estado: {
                  in: [
                    ESTADO_REGISTRO.rechazada,
                    ESTADO_REGISTRO.datosIncompletos,
                    ESTADO_REGISTRO.error,
                  ],
                },
                OR: [
                  { intentos: { lte: 0 }, fechaEdicion: { gt: limiteReintento1 } },
                  { intentos: 1, fechaEdicion: { gt: limiteReintento2 } },
                  { intentos: 2, fechaEdicion: { gt: limiteReintento3 } },
                  { intentos: 3, fechaEdicion: { gt: limiteReintento4 } },
                  { intentos: 4, fechaEdicion: { gt: limiteReintento5 } },
                ],
              },
              // Tope de intentos: el barrido SE RINDE con lo que no consigue
              // entregar, sea porque el Ministerio lo rechaza o porque no llega.
              // Sin esta condición, un `error` se reintentaría para siempre.
              { estado: { in: [...ESTADOS_ABANDONABLES] }, intentos: { gte: MAX_REINTENTOS } },
            ],
          },
        },
      },
      select: { id: true, tenantId: true },
      orderBy: { checkIn: 'asc' },
      take: limite,
    });
    resultado.candidatas = candidatas.length;

    for (const reserva of candidatas) {
      try {
        const envio = await enviarRegistroDeReserva(reserva.tenantId, reserva.id);
        if (envio.estado === ESTADO_REGISTRO.enviada) resultado.enviadas++;
        else if (envio.estado === ESTADO_REGISTRO.datosIncompletos) resultado.datosIncompletos++;
        else if (envio.estado === ESTADO_REGISTRO.rechazada) resultado.rechazadas++;
        // El servicio no llegó a recibirla: no es un rechazo del Ministerio, y
        // el panel de estado lo cuenta aparte para que una caída se distinga de
        // un problema de datos.
        else if (envio.estado === ESTADO_REGISTRO.error) resultado.sinEntregar++;
      } catch (err) {
        resultado.errores++;
        console.error(`[Cron] Error enviando el parte de la reserva ${reserva.id}:`, err);
      }
    }

    // ── 1.b Reservas de hospedaje (RH) ──────────────────────────────────────
    // El RD obliga a comunicar también AL FORMALIZAR LA RESERVA. Este camino
    // está implementado de punta a punta salvo el namespace del XSD oficial
    // (ver NS_ALTA_RESERVA): mientras falte, se omite por completo —no se toca
    // la base de datos— y el resumen lo declara, en vez de llenar la traza de
    // filas pendientes cada hora.
    if (reservasHospedajeHabilitadas()) {
      const claveReserva = {
        tipoComunicacion: TIPO_COMUNICACION.reservaHospedaje,
        tipoOperacion: TIPO_OPERACION.alta,
      };
      const reservasCandidatas = await prisma.hospitalityReservation.findMany({
        where: {
          tenantId: { in: tenants },
          // Una reserva cancelada no se comunica: si ya se había comunicado,
          // lo que toca es anularla (paso 2).
          estado: { not: 'cancelled' },
          bookedOn: { lte: ahora, gte: desde },
          guestRegistryCommunications: {
            none: {
              ...claveReserva,
              OR: [
                { estado: ESTADO_REGISTRO.aceptada },
                // Misma regla que en el parte: lo que está en vuelo se resuelve
                // consultando el lote, no reenviando.
                {
                  estado: ESTADO_REGISTRO.enviada,
                  lote: { not: null },
                  fechaEnvio: { gte: loteVencido },
                },
                {
                  estado: {
                    in: [
                      ESTADO_REGISTRO.rechazada,
                      ESTADO_REGISTRO.datosIncompletos,
                      ESTADO_REGISTRO.error,
                    ],
                  },
                  OR: [
                    { intentos: { lte: 0 }, fechaEdicion: { gt: limiteReintento1 } },
                    { intentos: 1, fechaEdicion: { gt: limiteReintento2 } },
                    { intentos: 2, fechaEdicion: { gt: limiteReintento3 } },
                    { intentos: 3, fechaEdicion: { gt: limiteReintento4 } },
                    { intentos: 4, fechaEdicion: { gt: limiteReintento5 } },
                  ],
                },
                { estado: { in: [...ESTADOS_ABANDONABLES] }, intentos: { gte: MAX_REINTENTOS } },
              ],
            },
          },
        },
        select: { id: true, tenantId: true },
        orderBy: { bookedOn: 'asc' },
        take: limite,
      });

      for (const reserva of reservasCandidatas) {
        try {
          const envio = await enviarReservaHospedaje(reserva.tenantId, reserva.id);
          if (envio.estado === ESTADO_REGISTRO.enviada) resultado.reservasEnviadas++;
          else if (envio.estado === ESTADO_REGISTRO.pendienteXsd) resultado.reservasPendienteXsd++;
        } catch (err) {
          resultado.errores++;
          console.error(`[Cron] Error enviando la reserva de hospedaje ${reserva.id}:`, err);
        }
      }
    }

    // ── 2. Consulta de lotes + anulación de reservas canceladas ──────────────
    for (const tenantId of tenants) {
      try {
        const consulta = await consultarLotesPendientes(tenantId);
        resultado.aceptadasAlConsultar += consulta.aceptadas;
        resultado.rechazadas += consulta.rechazadas;
      } catch (err) {
        resultado.errores++;
        console.error(`[Cron] Error consultando lotes del tenant ${tenantId}:`, err);
      }

      try {
        const anulables = await prisma.hospitalityGuestRegistryCommunication.findMany({
          where: {
            tenantId,
            ...claveParte,
            estado: { in: [ESTADO_REGISTRO.aceptada, ESTADO_REGISTRO.enviada] },
            codigoComunicacion: { not: null },
            reservation: { estado: 'cancelled' },
          },
          select: { id: true },
          take: limite,
        });
        for (const comunicacion of anulables) {
          const anulacion = await anularComunicacion(tenantId, comunicacion.id);
          if (anulacion.ok) resultado.anuladas++;
        }
      } catch (err) {
        resultado.errores++;
        console.error(`[Cron] Error anulando comunicaciones del tenant ${tenantId}:`, err);
      }
    }

    // ── 3. Partes que el barrido ya NO va a reintentar ───────────────────────
    // El tope de intentos deja fuera del barrido a un parte imposible, y eso no
    // se ve en ningún otro contador: son partes que no se envían porque no se van
    // a enviar. Se cuentan al final —con los lotes ya resueltos, que es lo que
    // puede haber gastado el último intento— y se publican por tenant, para que
    // el panel de estado lo diga sin ir reserva a reserva.
    const abandonadas = await prisma.hospitalityGuestRegistryCommunication.findMany({
      where: {
        tenantId: { in: tenants },
        ...claveParte,
        // Las dos formas de quedarse sin comunicar: rechazado por el Ministerio
        // o sin entregar. Con un solo estado, una caída del servicio no se
        // vería nunca en este recuento.
        estado: { in: [...ESTADOS_ABANDONABLES] },
        intentos: { gte: MAX_INTENTOS_PARTE },
        // Misma regla que el resto del módulo: el parte de una cancelada o un
        // no-show no existe (no entraron al establecimiento).
        reservation: { estado: { in: [...ESTADOS_ACTIVOS_REGISTRO] } },
      },
      select: { tenantId: true, estado: true },
    });
    resultado.abandonados = abandonadas.length;
    if (abandonadas.length > 0) {
      const partesPorTenant = new Map<
        string,
        { partes: number; rechazados: number; sinEntregar: number }
      >();
      for (const fila of abandonadas) {
        const acumulado =
          partesPorTenant.get(fila.tenantId) ?? { partes: 0, rechazados: 0, sinEntregar: 0 };
        acumulado.partes += 1;
        if (fila.estado === ESTADO_REGISTRO.rechazada) acumulado.rechazados += 1;
        else acumulado.sinEntregar += 1;
        partesPorTenant.set(fila.tenantId, acumulado);
      }
      const tenantsConAbandonos = await prisma.tenant.findMany({
        where: { id: { in: [...partesPorTenant.keys()] } },
        select: { id: true, nombre: true },
      });
      const nombrePorId = new Map(tenantsConAbandonos.map((t) => [t.id, t.nombre]));
      resultado.abandonadosPorTenant = [...partesPorTenant.entries()]
        .map(([tenantId, conteo]) => ({
          tenantId,
          nombre: nombrePorId.get(tenantId) ?? tenantId,
          ...conteo,
        }))
        .sort((a, b) => b.partes - a.partes);
    }

    // ── 4. Aviso por email de los partes que acaban de agotar los intentos ───
    // La pantalla solo avisa a quien entra a mirar; un parte abandonado es una
    // estancia que nadie va a comunicar hasta que una persona actúe, así que el
    // hotel recibe un email por cada tenant con partes NUEVOS desde el último
    // aviso (los ya avisados no se repiten: la marca es la auditoría del envío).
    const aviso = await avisarPartesAbandonados({
      tenants,
      claveParte,
      ahora,
    });
    resultado.avisosEnviados = aviso.enviados;
    resultado.avisosFallidos = aviso.fallidos;
    resultado.avisosEnEspera = aviso.enEspera;

    console.log(
      `[Cron] ✅ hospitality_registro_viajeros: ${resultado.enviadas} partes enviados, ` +
        `${resultado.datosIncompletos} con datos incompletos, ${resultado.aceptadasAlConsultar} aceptadas al consultar, ` +
        `${resultado.rechazadas} rechazadas, ${resultado.anuladas} anuladas, ` +
        `${resultado.reservasEnviadas} reservas enviadas` +
        (resultado.sinEntregar > 0 ? ` · ${resultado.sinEntregar} sin entregar` : '') +
        (resultado.reservasPendienteXsd > 0 ? ` (${resultado.reservasPendienteXsd} reservas sin XSD oficial)` : '') +
        (resultado.abandonados > 0 ? ` · ${resultado.abandonados} partes sin reintentar` : '')
    );
    return resultado;
  } catch (error: unknown) {
    const mensaje = error instanceof Error ? error.message : 'error inesperado';
    console.error('[Cron] Error en hospitality_registro_viajeros:', error);
    return { ...resultado, error: mensaje };
  }
}

// ── Aviso por email de los partes sin reintentar ───────────────────────────

/** Resultado del aviso, por tenant, para el log y para las pruebas. */
interface ResultadoAvisoPartes {
  /** Tenants a los que salió un email en esta pasada. */
  enviados: number;
  /** Tenants con partes nuevos cuyo email no se pudo entregar. */
  fallidos: number;
  /** Tenants cuyos partes ya estaban en su último aviso: nada nuevo que decir. */
  enEspera: number;
  detalle: Array<{
    tenantId: string;
    avisado: boolean;
    partes: number;
    motivo?: string;
    error?: string;
  }>;
}

/** Tope de filas leídas para el aviso (un hotel con cientos de abandonados es patológico). */
const TOPE_ABANDONADOS_AVISO = 200;

/**
 * Avisa por email a cada tenant con partes sin reintentar NUEVOS desde su
 * último aviso exitoso.
 *
 * La marca del aviso es la fila que este propio bloque escribe en
 * `HospitalitySyncLog` (tipo `aviso_partes_sin_reintentar`, con los ids dentro):
 * sirve de deduplicación —no repetir el mismo email cada hora por el mismo
 * parte— y de auditoría —qué partes se le contaron a cada hotel y cuándo—. Un
 * intento FALLIDO no marca: si Resend o el SMTP del tenant fallaron, el email
 * se vuelve a intentar en la siguiente pasada — un aviso perdido no puede
 * asumirse entregado.
 *
 * El requisito es «no se puede pasar por alto»: un parte NUEVO siempre avisa,
 * aunque el último aviso sea de hace un minuto (por otros partes). Solo se
 * calla lo que el hotel ya le contaron.
 */
export async function avisarPartesAbandonados(input: {
  tenants: string[];
  claveParte: { tipoComunicacion: string; tipoOperacion: string };
  ahora: Date;
}): Promise<ResultadoAvisoPartes> {
  const detalle: ResultadoAvisoPartes['detalle'] = [];
  const base = { enviados: 0, fallidos: 0, enEspera: 0 };
  if (input.tenants.length === 0) return { ...base, detalle };

  // Los abandonados de los tenants de la pasada, con lo que hace falta para el
  // email. La regla es la MISMA del recuento del panel (estado + intentos, y el
  // parte de una cancelada o un no-show no existe): si el barrido lo dejó
  // fuera, aquí entra.
  const abandonados = await prisma.hospitalityGuestRegistryCommunication.findMany({
    where: {
      tenantId: { in: input.tenants },
      ...input.claveParte,
      estado: { in: [...ESTADOS_ABANDONABLES] },
      intentos: { gte: MAX_INTENTOS_PARTE },
      reservation: { estado: { in: [...ESTADOS_ACTIVOS_REGISTRO] } },
    },
    select: {
      id: true,
      tenantId: true,
      referencia: true,
      estado: true,
      descripcion: true,
      intentos: true,
      fechaEdicion: true,
    },
    orderBy: { fechaEdicion: 'desc' },
    take: TOPE_ABANDONADOS_AVISO,
  });
  if (abandonados.length === 0) return { ...base, detalle };

  const porTenant = new Map<string, typeof abandonados>();
  for (const fila of abandonados) {
    const lista = porTenant.get(fila.tenantId);
    if (lista) lista.push(fila);
    else porTenant.set(fila.tenantId, [fila]);
  }

  // Último aviso EXITOSO por tenant: los ids que ya se contaron. Solo el
  // éxito deduplica: un intento con error se reintenta entero en la siguiente
  // pasada, porque el fallo puede ser transitorio (proveedor de email caído
  // unos minutos) y dar por avisado a un hotel sin email es justo lo que no
  // puede pasar. Las filas sin payload no marcan nada: avisan de nuevo, que es
  // lo seguro cuando no se puede saber qué se llegó a contar.
  const avisosPrevios = await prisma.hospitalitySyncLog.findMany({
    where: { tenantId: { in: [...porTenant.keys()] }, tipo: TIPO_AVISO_PARTES, estado: 'exito' },
    orderBy: { fechaCreacion: 'desc' },
    select: { tenantId: true, requestPayload: true },
  });
  const idsYaAvisadosPorTenant = new Map<string, Set<string>>();
  for (const aviso of avisosPrevios) {
    if (idsYaAvisadosPorTenant.has(aviso.tenantId)) continue;
    const payload = aviso.requestPayload as { partes?: Array<{ id?: string }> } | null;
    const ids = new Set(
      (payload?.partes ?? []).map((p) => p.id ?? '').filter(Boolean)
    );
    if (ids.size > 0) idsYaAvisadosPorTenant.set(aviso.tenantId, ids);
  }

  const nombres = await prisma.tenant.findMany({
    where: { id: { in: [...porTenant.keys()] } },
    select: { id: true, nombre: true },
  });
  const nombrePorId = new Map(nombres.map((t) => [t.id, t.nombre]));

  for (const [tenantId, filas] of porTenant) {
    const yaAvisados = idsYaAvisadosPorTenant.get(tenantId) ?? new Set<string>();
    const nuevos = filas.filter((f) => !yaAvisados.has(f.id));
    if (nuevos.length === 0) {
      detalle.push({ tenantId, avisado: false, partes: filas.length, motivo: 'ya_avisados' });
      base.enEspera += 1;
      continue;
    }

    const tenantNombre = nombrePorId.get(tenantId) ?? tenantId;
    const partes: ParteParaAviso[] = nuevos.map((f) => ({
      id: f.id,
      referencia: f.referencia,
      estado: f.estado,
      descripcion: f.descripcion,
      intentos: f.intentos,
      fechaEdicion: f.fechaEdicion,
    }));
    // El email detalla los NUEVOS; los demás constan en el último aviso y se
    // mencionan de pasada, para no repetir lo ya contado ni disimular el total.
    const restoYaAvisados = filas.length - nuevos.length;

    try {
      // Destinatarios: los operadores del tenant, el mismo criterio que los
      // demás avisos del módulo (quien decide la configuración es quien tiene
      // que saber que hay estancias sin comunicar).
      const { operadoresDelTenant } = await import('@/lib/hospitality/incidencias');
      const operadores = await operadoresDelTenant(tenantId);
      const correos = (
        await prisma.user.findMany({
          where: { id: { in: operadores.map((u) => u.id) } },
          select: { email: true },
        })
      )
        .map((u) => u.email)
        .filter(Boolean);

      const cuerpo = cuerpoAvisoPartes({
        tenant: tenantNombre,
        partes,
        total: nuevos.length,
        yaAvisados: restoYaAvisados,
      });
      const html = htmlAvisoPartes({
        tenant: tenantNombre,
        partes,
        total: nuevos.length,
        yaAvisados: restoYaAvisados,
      });

      let entregado = false;
      let errorEnvio: string | null = null;
      if (!cuerpo) {
        errorEnvio = 'cuerpo vacío';
      } else if (correos.length === 0) {
        errorEnvio = 'sin destinatarios con email';
      } else {
        const res = await sendEmail({
          to: correos,
          subject: asuntoAvisoPartes(nuevos.length),
          text: cuerpo,
          html,
          tenantId,
        });
        entregado = res.success;
        if (!res.success) errorEnvio = res.error ?? 'error desconocido al enviar';
      }

      // La marca del próximo barrido, y la auditoría del envío. Queda aunque
      // fallara: saber que falló también importa (y con estado 'error' no
      // deduplica, así que la siguiente pasada lo reintenta).
      await prisma.hospitalitySyncLog.create({
        data: {
          tenantId,
          tipo: TIPO_AVISO_PARTES,
          operacion: 'manual',
          estado: entregado ? 'exito' : 'error',
          errorMensaje: errorEnvio,
          requestPayload: {
            partes: partes.map((p) => ({ id: p.id, referencia: p.referencia })),
          } as never,
        },
      });

      if (entregado) base.enviados += 1;
      else base.fallidos += 1;
      detalle.push({
        tenantId,
        avisado: entregado,
        partes: nuevos.length,
        motivo: entregado ? undefined : (errorEnvio ?? undefined),
        error: errorEnvio ?? undefined,
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      base.fallidos += 1;
      detalle.push({ tenantId, avisado: false, partes: nuevos.length, error: mensaje });
      // La excepción también audita y sin estado 'exito': la siguiente pasada
      // reintenta el aviso en vez de dar por avisado al hotel.
      try {
        await prisma.hospitalitySyncLog.create({
          data: {
            tenantId,
            tipo: TIPO_AVISO_PARTES,
            operacion: 'manual',
            estado: 'error',
            errorMensaje: mensaje,
            requestPayload: {
              partes: partes.map((p) => ({ id: p.id, referencia: p.referencia })),
            } as never,
          },
        });
      } catch {
        // Si hasta la auditoría falla, no queda más que el log: el aviso se
        // reintentará porque no hay marca exitosa que deduplique.
      }
      console.error(
        `[Cron] Error avisando por email del abandono de partes (${tenantId}):`,
        mensaje
      );
    }
  }

  return { ...base, detalle };
}

/**
 * El resumen de una pasada, en una línea: es lo que el panel de estado y la
 * respuesta HTTP enseñan. Una sola definición, para que el disparo por HTTP y el
 * programado digan lo mismo.
 */
export function resumenDelBarrido(resultado: ResultadoBarridoRegistroViajeros): string {
  return (
    `${resultado.enviadas} enviadas · ${resultado.datosIncompletos} incompletas · ` +
    `${resultado.aceptadasAlConsultar} aceptadas · ${resultado.anuladas} anuladas` +
    (resultado.sinEntregar > 0 ? ` · ${resultado.sinEntregar} sin entregar` : '') +
    (resultado.abandonados > 0 ? ` · ${resultado.abandonados} sin reintentar` : '')
  );
}

/**
 * Los avisos que el panel de estado tiene que enseñar aunque la pasada haya ido
 * bien: un parte con los intentos agotados ya no lo reintenta nadie, y eso es
 * justo lo que nadie ve mirando los contadores de la pasada.
 */
export function avisosDelBarrido(resultado: ResultadoBarridoRegistroViajeros): string[] {
  if (resultado.abandonados <= 0) return [];
  return resultado.abandonadosPorTenant.map((t) => {
    // Las dos causas se nombran porque se arreglan distinto: un rechazo pide
    // corregir el dato del huésped; una no-entrega, mirar el servicio. Decir
    // «el Ministerio sigue sin aceptarlos» de un parte que nunca le llegó
    // mandaría al equipo a buscar donde no está el problema.
    const causas: string[] = [];
    if (t.rechazados > 0) causas.push(`${t.rechazados} rechazado(s) por el Ministerio`);
    if (t.sinEntregar > 0) causas.push(`${t.sinEntregar} sin respuesta del servicio`);
    return (
      `${t.nombre}: ${t.partes} parte(s) sin reintentar (${causas.join(' · ') || 'sin detalle'}) — ` +
      `el barrido agotó sus ${MAX_INTENTOS_PARTE} intentos`
    );
  });
}

/**
 * Comprueba si un tenant puede enviar hoy (credenciales + al menos un código de
 * tipo de pago). Lo usa la UI para explicar qué falta antes de culpar al cron.
 */
export async function tenantPuedeComunicar(tenantId: string): Promise<boolean> {
  const config = await getMirConfig(tenantId);
  if (!config || !config.activo || !config.usuarioEnc || !config.passwordEnc) return false;
  const mapa = (config.mapaTiposPago as Record<string, string> | null) ?? {};
  return !!(config.tipoPagoDefecto || Object.keys(mapa).length > 0);
}
