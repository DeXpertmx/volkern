import { prisma } from '../db';
import { resumen_diario } from '../skills/hospitality-skills';
import { renderPlantilla, enviarComunicacion } from '../hospitality/comunicaciones';
import { monedaFormateada } from '../hospitality/booking-i18n';
import { CAPACIDADES_HOSPITALITY } from '../hospitality/capacidades';
import { hasPermisoDeRol } from '../permissions-core';

/**
 * Cron del briefing matutino de Hospitality (plan maestro §21 extendido).
 *
 * Cada mañana envía, a quien puede operar el PMS del tenant (misma capacidad
 * `operaciones.ver` que abre las incidencias y el día de la propiedad), la
 * plantilla activa `briefing_diario` por sus canales (whatsapp|email) con la
 * foto del día que ya sabe componer `resumen_diario`: ocupación, llegadas y
 * salidas, incidencias activas y mayores cobros pendientes.
 *
 * Tres decisiones de diseño:
 *
 * 1. **Sin plantilla, sin mensaje**: igual que la reseña — no se inventan
 *    mensajes por defecto. El hotel escribe SU plantilla con las variables
 *    {{...}} y decide el canal.
 * 2. **Idempotente por día**: un AuditLog (`hospitality_briefing_diario`,
 *    entidad `tenant`, metadata.fecha = hoy) evita el doble briefing si el
 *    cron se dispara dos veces. Con éxito parcial se da el día por servido.
 * 3. **El destinatario no es el huésped**: aquí el mensaje va al equipo
 *    (usuarios del tenant con permiso), así que el destinatario sale del
 *    User (email/telefono), no de `guestData` como en las demás plantillas.
 */
export const ACCION_BRIEFING = 'hospitality_briefing_diario';

/** Variables que entiende la plantilla `briefing_diario` (además de {{fecha}}). */
export function contextoBriefing(resumen: {
  fecha: string;
  ocupacionHoyPct: number;
  totalUnidades: number;
  unidadesOcupadas: number;
  llegadasHoy: number;
  detalleLlegadas: Array<{ huesped: string; unidad: string }>;
  salidasHoy: number;
  detalleSalidas: Array<{ huesped: string; unidad: string }>;
  /** Conteos ya calculados por resumen_diario (números, no arrays). */
  llegadasManana: number;
  salidasManana: number;
  incidenciasAbiertas: number;
  incidencias: Array<{ unidad: string; tipo: string; motivo: string | null }>;
  cobrosPendientes: number;
  mayoresPendientes: Array<{ referencia: string; moneda: string | null; pendiente: number }>;
  totalPendientePorMoneda: Record<string, number>;
}): Record<string, string> {
  const monedas = Object.keys(resumen.totalPendientePorMoneda);
  const moneda = monedas[0];
  return {
    fecha: resumen.fecha,
    ocupacion: `${resumen.ocupacionHoyPct}%`,
    total_unidades: String(resumen.totalUnidades),
    unidades_ocupadas: String(resumen.unidadesOcupadas),
    llegadas_hoy: String(resumen.llegadasHoy),
    detalle_llegadas: (resumen.detalleLlegadas || []).map((l) => `${l.huesped} · ${l.unidad}`).join('\n'),
    salidas_hoy: String(resumen.salidasHoy),
    detalle_salidas: (resumen.detalleSalidas || []).map((s) => `${s.huesped} · ${s.unidad}`).join('\n'),
    llegadas_manana: String(resumen.llegadasManana),
    salidas_manana: String(resumen.salidasManana),
    incidencias:
      resumen.incidenciasAbiertas > 0
        ? resumen.incidencias.map((i) => `${i.unidad} (${i.tipo}): ${i.motivo || 'sin motivo'}`).join('\n')
        : 'Sin incidencias',
    cobros_pendientes: String(resumen.cobrosPendientes),
    detalle_pendientes: (resumen.mayoresPendientes || [])
      .map((c) => `${c.referencia}: ${monedaFormateada(c.pendiente, c.moneda, 'es')}`)
      .join('\n'),
    total_pendiente: monedaFormateada(resumen.totalPendientePorMoneda[moneda] ?? 0, moneda, 'es'),
  };
}

/** Tenants con plantilla `briefing_diario` activa: sin plantilla no hay nada que enviar. */
async function tenantsConBriefing(): Promise<Set<string>> {
  const plantillas = await prisma.hospitalityCommunicationTemplate.findMany({
    where: { evento: 'briefing_diario', activo: true },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });
  return new Set(plantillas.map((t) => t.tenantId));
}

/**
 * Destinatarios del briefing: usuarios del tenant que pueden operar el PMS
 * (capacidad `operaciones.ver`, la misma que abre incidencias y el día de la
 * propiedad). Email siempre existe; el teléfono puede no llegar (WhatsApp).
 */
export async function destinatariosBriefing(
  tenantId: string,
): Promise<Array<{ email: string; telefono: string | null; nombre: string | null }>> {
  const cap = CAPACIDADES_HOSPITALITY['operaciones.ver'];
  const candidatos = await prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      email: true,
      name: true,
      telefono: true,
      role: { select: { nombre: true, permisos: true } },
    },
    take: 100,
  });
  return candidatos
    .filter((usuario) => hasPermisoDeRol(usuario.role as never, cap.modulo, cap.accion))
    .slice(0, 10)
    .map((u) => ({ email: u.email, telefono: u.telefono || null, nombre: u.name || null }));
}

export async function runHospitalityBriefingScan() {
  const hoy = new Date().toISOString().slice(0, 10);
  console.log(`[Cron] 🌅 Briefing matutino de hospitality para ${hoy}...`);

  try {
    const activos = await tenantsConBriefing();
    if (activos.size === 0) {
      console.log('[Cron] ✅ hospitality_briefing_diario: sin tenants con plantilla briefing_diario');
      return { tenants: 0, enviados: 0, fallidos: 0, omitidos: 0 };
    }

    let enviados = 0;
    let fallidos = 0;
    let omitidos = 0;

    for (const tenantId of activos) {
      // Guard por día: el briefing sale una vez al día aunque el cron se
      // dispare varias veces (mismo patrón que la reseña, clave distinta:
      // aquí el audit es por tenant y fecha, no por reserva).
      const yaEnviado = await prisma.auditLog.findFirst({
        where: {
          tenantId,
          accion: ACCION_BRIEFING,
          entidad: 'tenant',
          entidadId: tenantId,
          metadata: { path: ['fecha'], equals: hoy },
        },
        select: { id: true },
      });
      if (yaEnviado) {
        omitidos++;
        continue;
      }

      // La foto del día la compone el skill (única fuente): si falla, no hay
      // mensaje que enviar — un briefing con datos inventados no vale nada.
      let resumen;
      try {
        resumen = await resumen_diario({ tenantId });
      } catch (err: any) {
        console.error(`[Cron] briefing: resumen_diario falló para ${tenantId}:`, err?.message || err);
        fallidos++;
        continue;
      }

      const plantillas = await prisma.hospitalityCommunicationTemplate.findMany({
        where: { tenantId, evento: 'briefing_diario', activo: true },
      });
      if (plantillas.length === 0) {
        omitidos++;
        continue;
      }

      const contexto = contextoBriefing(resumen);
      contexto.fecha = hoy;

      const destinatarios = await destinatariosBriefing(tenantId);
      if (destinatarios.length === 0) {
        console.error(`[Cron] briefing: sin destinatarios con permisos en ${tenantId}; se reintentará`);
        fallidos++;
        continue;
      }

      let okTenant = 0;
      let failTenant = 0;
      for (const t of plantillas) {
        const contenido = renderPlantilla(t.contenido, contexto);
        const asunto = t.asunto ? renderPlantilla(t.asunto, contexto) : `Briefing del día ${hoy}`;
        for (const d of destinatarios) {
          const destinatario = t.canal === 'email' ? d.email : d.telefono;
          if (!destinatario) continue;
          const res = await enviarComunicacion({ tenantId, canal: t.canal, asunto, contenido, destinatario });
          if (res.ok) {
            okTenant++;
          } else {
            failTenant++;
            console.error(`[Cron] briefing falló (${t.canal} → ${destinatario}): ${res.error}`);
          }
        }
      }

      if (okTenant > 0) {
        enviados += okTenant;
        fallidos += failTenant;
        await prisma.auditLog.create({
          data: {
            tenantId,
            accion: ACCION_BRIEFING,
            entidad: 'tenant',
            entidadId: tenantId,
            descripcion: `Briefing matutino enviado (${okTenant} envío/s a ${destinatarios.length} destinatario/s)`,
            metadata: {
              fecha: hoy,
              ocupacionHoyPct: resumen.ocupacionHoyPct,
              llegadasHoy: resumen.llegadasHoy,
              salidasHoy: resumen.salidasHoy,
              incidenciasAbiertas: resumen.incidenciasAbiertas,
              cobrosPendientes: resumen.cobrosPendientes,
            },
          },
        });
      } else {
        // Sin éxito no se marca: el siguiente disparo del día lo reintenta en
        // vez de perder el briefing en silencio.
        fallidos += failTenant > 0 ? failTenant : 1;
        console.error(`[Cron] briefing sin envío exitoso para ${tenantId}; se reintentará`);
      }
    }

    console.log(`[Cron] ✅ hospitality_briefing_diario: ${enviados} enviados, ${fallidos} fallidos, ${omitidos} omitidos`);
    return { tenants: activos.size, enviados, fallidos, omitidos };
  } catch (err: any) {
    console.error('[Cron] ❌ Error fatal en scan hospitality_briefing_diario:', err);
    return { tenants: 0, enviados: 0, fallidos: 0, omitidos: 0, error: err?.message };
  }
}
