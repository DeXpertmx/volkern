/**
 * lib/cron/hospitality-promos-alertas.ts
 *
 * Avisa al equipo del hotel cuando un código promocional acumula consultas sin
 * conversión, para que lo apague o reescriba su mensaje antes de que siga
 * gastando intentos (y presupuesto de descuento) sin vender.
 *
 * El problema que resuelve: la tabla de Descuentos ya enseña la conversión de
 * cada código, pero hay que entrar a mirarla. Un código que se prueba mucho y no
 * cierra nada no avisa solo; este job rompe ese silencio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * GARANTÍAS
 * ────────────────────────────────────────────────────────────────────────────
 *   • **Muestra suficiente antes de juzgar**: la regla vive en el módulo puro
 *     `lib/hospitality/promos-alertas.ts` (`MINIMO_CONSULTAS_ALERTA`,
 *     `CONVERSION_MINIMA_PCT`). Un código recién creado no genera ruido.
 *   • **La ventana es de REGISTRO** (`fecha` de la consulta), no de la estancia:
 *     una consulta para dentro de seis meses es un intento de hoy.
 *   • **Un aviso por hotel, no por código**: el equipo recibe una notificación
 *     con la lista corta y el enlace a Descuentos.
 *   • **No se repite cada día**: cada hotel tiene su intervalo
 *     (`INTERVALO_ALERTA_MS`), y se adelanta si aparece un código que no estaba
 *     en el aviso anterior.
 *   • **La marca es el aviso**: cada aviso deja una fila en `HospitalitySyncLog`
 *     (tipo `aviso_promos_sin_conversion`), que es a la vez la auditoría del
 *     envío y el reloj del intervalo.
 *   • **Un hotel que falla no silencia a los demás.**
 *
 * Se invoca desde el scheduler (job diario) y desde
 * `GET /api/cron/hospitality-promos-alertas` (disparo a demanda con
 * `CRON_SECRET`).
 */

import { prisma } from '@/lib/db';
import { hasPermisoDeRol } from '@/lib/permissions-core';
import { CAPACIDADES_HOSPITALITY } from '@/lib/hospitality/capacidades';
import { CONSULTA_APLICADA } from '@/lib/hospitality/promos-consultas';
import {
  agruparAlertasPorTenant,
  codigosDeMarca,
  construirAvisoPromos,
  contarConsultas,
  decidirAvisoPromos,
  desdeVentanaAlertas,
  evaluarAlertasPromocion,
  type AlertaPromocion,
} from '@/lib/hospitality/promos-alertas';

export const JOB_ID_PROMOS_ALERTAS = 'hospitality-promos-alertas';
export const JOB_LABEL_PROMOS_ALERTAS = 'Hospitality Códigos sin Conversión';
export const JOB_SCHEDULE_PROMOS_ALERTAS = '30 9 * * *';

/** Tipo con el que se marca cada aviso en `HospitalitySyncLog`. */
export const TIPO_AVISO_PROMOS = 'aviso_promos_sin_conversion';

/** Consultas que se leen por corrida: un tope, no un muestreo. */
const MAX_CONSULTAS = 50_000;

/** Usuarios del hotel que pueden cambiar el código (misma capacidad que el CRUD). */
async function operadoresDePromos(tenantId: string): Promise<Array<{ id: string }>> {
  const capacidad = CAPACIDADES_HOSPITALITY['reservas.editar'];
  const candidatos = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, role: { select: { nombre: true, permisos: true } } },
    take: 100,
  });

  return candidatos
    .filter((usuario) =>
      hasPermisoDeRol(usuario.role as never, capacidad.modulo, capacidad.accion)
    )
    .slice(0, 10)
    .map((usuario) => ({ id: usuario.id }));
}

export interface HospitalityPromosAlertasResult {
  success: boolean;
  message: string;
  /** Cuentas con algún código activo que mira el barrido. */
  tenantsRevisados: number;
  /** Cuentas con al menos un código por debajo del umbral. */
  tenantsConAlertas: number;
  /** Cuentas a las que se les mandó el aviso. */
  tenantsAvisados: number;
  /** Cuentas con alertas silenciadas por el intervalo. */
  tenantsEnEspera: number;
  /** Códigos que entraron en la alerta (todas las cuentas). */
  codigosAlertados: number;
  /** Frases para el panel de estado (se pintan en ámbar, no en rojo). */
  avisos: string[];
  errores: string[];
  durationMs: number;
  /** Solo si la lectura falló: no hubo aviso ni marcas. */
  error?: string;
}

function enlacePanel(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://volkern.app';
  return `${base}/dashboard/hospitality/booking-engine`;
}

function lineaCodigos(alertas: AlertaPromocion[]): string {
  return alertas
    .slice(0, 5)
    .map((alerta) => `${alerta.codigo} (${alerta.consultas} consultas, ${alerta.conversionPct} %)`)
    .join(', ');
}

export async function runHospitalityPromosAlertasScan(
  ahora: Date = new Date()
): Promise<HospitalityPromosAlertasResult> {
  const startedAt = Date.now();
  const desde = desdeVentanaAlertas(ahora);

  const base = {
    success: true,
    message: '',
    tenantsRevisados: 0,
    tenantsConAlertas: 0,
    tenantsAvisados: 0,
    tenantsEnEspera: 0,
    codigosAlertados: 0,
    avisos: [] as string[],
    errores: [] as string[],
    durationMs: 0,
  };

  // La lectura es lo único que no se puede aislar por cuenta: si falla, no hay
  // aviso ni marcas, y se dice por qué en vez de fingir que no había nada.
  let codigos: Array<{ tenantId: string; codigo: string; activo: boolean }>;
  let consultas: Array<{ tenantId: string; codigo: string; reservationId: string | null }>;
  try {
    [codigos, consultas] = await Promise.all([
      prisma.hospitalityPromoCode.findMany({
        select: { tenantId: true, codigo: true, activo: true },
      }),
      // Solo las aplicadas: un rechazo no es una consulta que el huésped
      // pudiera convertir. La ventana es la fecha en que se intentó.
      prisma.hospitalityPromoConsulta.findMany({
        where: { fecha: { gte: desde }, resultado: CONSULTA_APLICADA },
        select: { tenantId: true, codigo: true, reservationId: true },
        take: MAX_CONSULTAS,
      }),
    ]);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      success: false,
      error: mensaje,
      message: `No se pudieron leer las consultas de los códigos: ${mensaje}`,
      durationMs: Date.now() - startedAt,
    };
  }

  const alertas = evaluarAlertasPromocion(contarConsultas(codigos, consultas));
  const porTenant = agruparAlertasPorTenant(alertas);
  const tenantsRevisados = new Set(
    codigos.filter((codigo) => codigo.activo !== false).map((codigo) => codigo.tenantId)
  ).size;

  if (alertas.length === 0) {
    return {
      ...base,
      tenantsRevisados,
      message:
        tenantsRevisados === 0
          ? 'Sin códigos promocionales activos que vigilar.'
          : `Sin códigos que avisar: ${tenantsRevisados} cuenta(s) y ninguna por debajo del umbral.`,
      durationMs: Date.now() - startedAt,
    };
  }

  const nombres = new Map(
    (
      await prisma.tenant
        .findMany({
          where: { id: { in: Array.from(porTenant.keys()) } },
          select: { id: true, nombre: true },
        })
        .catch(() => [] as Array<{ id: string; nombre: string }>)
    ).map((tenant) => [tenant.id, tenant.nombre])
  );

  let tenantsAvisados = 0;
  let tenantsEnEspera = 0;

  for (const [tenantId, lista] of porTenant) {
    try {
      const ultimo = await prisma.hospitalitySyncLog.findFirst({
        where: { tenantId, tipo: TIPO_AVISO_PROMOS },
        orderBy: { fechaCreacion: 'desc' },
        select: { fechaCreacion: true, responseBody: true },
      });

      const decision = decidirAvisoPromos({
        alertas: lista,
        ultimoAviso: ultimo?.fechaCreacion ?? null,
        codigosAvisados: codigosDeMarca(ultimo?.responseBody),
        ahora,
      });

      if (!decision.avisar) {
        tenantsEnEspera += 1;
        continue;
      }

      const operadores = await operadoresDePromos(tenantId);
      const enlace = enlacePanel();
      const { title, body } = construirAvisoPromos(lista, { enlace });

      if (operadores.length > 0) {
        const { sendPushNotification } = await import('@/lib/services/push-notification');
        await Promise.all(
          operadores.map((usuario) =>
            sendPushNotification(usuario.id, {
              title,
              body,
              url: '/dashboard/hospitality/booking-engine',
              tag: 'promos',
              data: { motivo: decision.motivo, codigos: lista.map((a) => a.codigo) },
            }).catch(() => ({ success: false }))
          )
        );
      }

      // La marca del intervalo —y la auditoría del envío— por cuenta avisada.
      await prisma.hospitalitySyncLog.create({
        data: {
          tenantId,
          propertyId: null,
          tipo: TIPO_AVISO_PROMOS,
          operacion: 'manual',
          estado: operadores.length > 0 ? 'exito' : 'pendiente',
          responseBody: {
            motivo: decision.motivo,
            codigos: lista.map((alerta) => alerta.codigo),
            consultas: lista.reduce((total, alerta) => total + alerta.consultas, 0),
            convertidas: lista.reduce(
              (total, alerta) => total + alerta.consultasConvertidas,
              0
            ),
            destinatarios: operadores.length,
            enlace,
          } as never,
        },
      });

      if (operadores.length === 0) {
        base.avisos.push(
          `${nombres.get(tenantId) ?? tenantId}: ${lista.length} código(s) sin conversión, ` +
            'pero nadie del equipo puede editarlos (el aviso quedó registrado).'
        );
      }
      tenantsAvisados += 1;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      base.errores.push(`${tenantId}: ${mensaje}`);
      console.error(`[Cron/PromosAlertas] Cuenta ${tenantId} falló:`, mensaje);
    }
  }

  if (tenantsAvisados > 0) {
    const detalle = Array.from(porTenant.entries())
      .map(([tenantId, lista]) => `${nombres.get(tenantId) ?? tenantId}: ${lineaCodigos(lista)}`)
      .slice(0, 5)
      .join(' · ');
    base.avisos.unshift(
      `${alertas.length} código(s) sin conversión en ${porTenant.size} cuenta(s) — ${detalle}`
    );
  }

  const codigosAlertados = alertas.length;
  console.log(
    `[Cron/PromosAlertas] DONE codigos=${codigosAlertados} cuentas=${porTenant.size} ` +
      `avisados=${tenantsAvisados} enEspera=${tenantsEnEspera} durationMs=${Date.now() - startedAt}`
  );

  return {
    ...base,
    tenantsRevisados,
    tenantsConAlertas: porTenant.size,
    tenantsAvisados,
    tenantsEnEspera,
    codigosAlertados,
    message:
      `Códigos sin conversión: ${codigosAlertados} en ${porTenant.size} cuenta(s); ` +
      `${tenantsAvisados} avisada(s), ${tenantsEnEspera} dentro del intervalo.`,
    durationMs: Date.now() - startedAt,
  };
}
