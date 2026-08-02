import { prisma } from '@/lib/db';
import { ChatMemoryService } from '@/lib/chat/chat-memory';

/**
 * Proactividad: forecast → chatbot.
 *
 * Cuando el forecast detecta una caída significativa (pendiente negativa + R²
 * alto), abre automáticamente una conversación proactiva con el chatbot
 * oferecendo revisar las pólizas sin renovación próxima. Reusa el sistema de
 * memoria multi-turno (`pendingIntent` en `hubMetadata.chatbotContext`) para
 * que cuando el broker responda "sí" o "claro", el chatbot ya tenga el intent
 * `renovaciones_pendientes` listo y los `collectedEntities` con `dias=60`,
 * de modo que el orquestador no le pida parámetros extra.
 *
 * Garantías:
 *  · Idempotente: si ya se disparó una alerta en los últimos 7 días para el
 *    tenant, no la repite. Esto se valida contra cualquier log del forecast,
 *    no solo el actual — porque el log "anterior" puede haber sido el primero
 *    en detectar la caída.
 *  · No destructivo: nunca borra mensajes ni datos del log; sólo añade.
 *  · Fire-and-forget: si falla, el forecast endpoint no se rompe. El error
 *    se loguea para diagnóstico pero el cliente recibe igual sus KPIs.
 */

// ─── Constantes ──────────────────────────────────────────────────────────
// Umbral de R² a partir del cual la pendiente se considera significativa.
// 0.4 = mínimo para que "tendencia a la baja" sea una afirmación defendible.
const R2_TRIGGER_THRESHOLD = 0.4;

// Ventana de deduplicación: no repetimos la misma alerta proactiva dentro de
// los últimos 7 días. Es suficientemente corto para que una nueva caída real
// (no ruido) sí dispare, pero suficientemente largo para no spamear.
const ALERT_COOLDOWN_DAYS = 7;

// Mensaje canónico que verá el broker. Markdown seguro para Telegram/web.
const ALERT_PROPOSAL_TEXT =
  '📉 *Detecté una caída en tu forecast mensual*\n' +
  'La pendiente del pronóstico es negativa con buen ajuste (R² > 0.4), ' +
  'así que es probable que el próximo mes emitas menos prima que los últimos 6.\n\n' +
  '¿Quieres que *detecte las pólizas sin renovación próxima* y te proponga *3 acciones* para recuperar margen?';

// Intent que quedará pre-armado en `pendingIntent`. Coincide literalmente con
// el nombre del intent registrado en `lib/agents/intents/insurance-intents.ts`,
// así que cuando el clasificador lo vea respetar el pendingIntent (vía
// lógica multi-turno en `intent-classifier.ts`), el orquestador ya sabe qué
// skill ejecutar — sin preguntas extra.
const PREARMED_INTENT = 'renovaciones_pendientes';

// Entidades que ya quedan "capturadas" para que el orquestador no pregunte.
// `dias=60` alinea con la guía estándar de ventana de renovación.
const PREARMED_ENTITIES: Record<string, string> = { dias: '60' };

export interface AlertTriggerResult {
  /** True cuando el alert fue enviado en esta llamada. */
  enviado: boolean;
  /** ID de la conversación creada/reusada si fue enviado. */
  conversationId?: string;
  /** Razón cuando NO se envió (idempotencia, falta de pendiente, etc.). */
  reason?:
    | 'slope_non_negative'
    | 'r2_too_low'
    | 'already_alerted_cooldown'
    | 'no_current_log'
    | 'error';
  /** Texto humano interpretativo, útil para el UI. */
  detail?: string;
}

/**
 * Evalúa si se cumplen las condiciones para disparar una alerta proactiva.
 * Helper puro / testeable sin tocar la BD.
 */
export function shouldTriggerAlert(
  slope: number,
  r2: number,
): { trigger: boolean; reason?: string } {
  if (slope >= 0) return { trigger: false, reason: 'slope_non_negative' };
  if (r2 <= R2_TRIGGER_THRESHOLD) return { trigger: false, reason: 'r2_too_low' };
  return { trigger: true };
}

/**
 * Punto de entrada principal: dispara la alerta proactiva si corresponde.
 *
 * @param tenantId   Tenant del broker.
 * @param slope      Pendiente del forecast (negativa = caída).
 * @param r2         Bondad de ajuste (0..1).
 * @param currentForecastLogId  ID del log que estamos escribiendo ahora;
 *                              necesario para el `update` idempotente.
 */
export async function triggerPortfolioRenewalsAlert(
  tenantId: string,
  slope: number,
  r2: number,
  currentForecastLogId: string | null,
): Promise<AlertTriggerResult> {
  try {
    // ─── 1. Evaluar reglas de negocio ──────────────────────────────
    const evalRes = shouldTriggerAlert(slope, r2);
    if (!evalRes.trigger) {
      return { enviado: false, reason: evalRes.reason as AlertTriggerResult['reason'] };
    }

    // ─── 2. Cooldown: si ya alertamos en los últimos 7d → skip ─────
    const cooldownCutoff = new Date(Date.now() - ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const recentAlert = await prisma.portfolioForecastLog.findFirst({
      where: {
        tenantId,
        alertaEnviadaAt: { gte: cooldownCutoff },
      },
      select: { id: true, alertaEnviadaAt: true, alertaConversacionId: true },
      orderBy: { alertaEnviadaAt: 'desc' },
    });
    if (recentAlert) {
      return {
        enviado: false,
        reason: 'already_alerted_cooldown',
        conversationId: recentAlert.alertaConversacionId ?? undefined,
        detail: `Última alerta: ${recentAlert.alertaEnviadaAt?.toISOString() ?? 'desconocida'}`,
      };
    }

    // ─── 3. Crear / reusar conversación proactiva ──────────────────
    // externalRef determinístico: 1 sola conversación proactiva por tenant.
    // Si ya existe (ej. el broker la cerró anteriormente y volvió a bajar
    // el forecast pasado el cooldown de 7d), la reusamos.
    const memory = new ChatMemoryService(tenantId);
    const conv = await memory.getOrCreateConversation({
      channel: 'alerts',
      externalRef: `portfolio-alert:renewals:${tenantId}`,
      contactName: 'Alertas del Portfolio',
    });

    // ─── 4. Inscribir el mensaje del bot (proposal) ────────────────
    await memory.addMessage({
      conversationId: conv.id,
      content: ALERT_PROPOSAL_TEXT,
      direction: 'saliente',
      channel: 'alerts',
      metadata: {
        source: 'forecast-proactive-alert',
        intent: PREARMED_INTENT,
        prearmedEntities: PREARMED_ENTITIES,
        slope,
        r2,
      },
    });

    // ─── 5. Pre-armar multi-turno ──────────────────────────────────
    // Cuando el broker responda "sí", el clasificador verá `pendingIntent`
    // y continuará con `renovaciones_pendientes` sin pedirle el `dias`. El
    // orquestador verá `collectedEntities.dias=60` y ejecutará directo.
    await memory.updateContext(conv.id, {
      pendingIntent: PREARMED_INTENT,
      collectedEntities: PREARMED_ENTITIES,
      missingEntities: [],
      // Chips visibles al broker en el hub para aceptar/rechazar.
      // El clasificador los detecta como "click" y enruta al intent.
      lastOfferedQuickReplies: ['Sí, detéctalas y propón 3 acciones', 'Ahora no'],
    });

    // ─── 6. Marcar el log actual como "alertado" ──────────────────
    // Permite que llamadas posteriores (refrescos del dashboard) salten
    // el chequeo de cooldown sin re-crear la conversación.
    if (currentForecastLogId) {
      await prisma.portfolioForecastLog.update({
        where: { id: currentForecastLogId },
        data: {
          alertaEnviadaAt: new Date(),
          alertaConversacionId: conv.id,
        },
      });
    }

    return {
      enviado: true,
      conversationId: conv.id,
      detail: `Conversación proactiva creada con pendingIntent='${PREARMED_INTENT}' y pre-armed entities: dias=60.`,
    };
  } catch (error) {
    // Fire-and-forget: nunca romper la respuesta del forecast.
    console.error('[forecast-alert] Error al disparar alerta proactiva:', error);
    return { enviado: false, reason: 'error', detail: (error as Error).message };
  }
}

/**
 * Constantes exportadas para tests y UI.
 */
export const FORECAST_ALERT_CONSTANTS = {
  R2_TRIGGER_THRESHOLD,
  ALERT_COOLDOWN_DAYS,
  ALERT_PROPOSAL_TEXT,
  PREARMED_INTENT,
  PREARMED_ENTITIES,
} as const;
