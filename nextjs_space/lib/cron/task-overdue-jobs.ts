/**
 * Cron de Tareas Vencidas — avisa automáticamente por Telegram al usuario
 * asignado cuando una tarea suya pasa a vencida.
 *
 * Guard contra repetidos: cada tarea tiene `avisoVencimientoEnviado`; solo se
 * notifica una vez, con la fecha original de vencimiento y el motivo.
 */

import { prisma } from '@/lib/db';
import { loadTelegramCredentials, sendTelegramMessage } from '@/lib/telegram';

function formatFecha(fecha: Date): string {
  return fecha.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Escanea tareas vencidas sin notificar y envía el aviso por Telegram al
 * usuario asignado (chat vinculado en metadata.telegram_chat_id).
 *
 * Marca `avisoVencimientoEnviado = true` cuando:
 *  - el mensaje se envió correctamente, o
 *  - el usuario/tenant no tiene Telegram configurado (no hay nada que hacer;
 *    evita reintentar para siempre en cada ciclo).
 *
 * Si el envío falla por un error transitorio, la tarea queda sin marcar y se
 * reintenta en el siguiente ciclo.
 */
export async function runTaskOverdueScan(): Promise<{
  total: number;
  notified: number;
  skipped: number;
  failed: number;
  error?: string;
}> {
  const now = new Date();
  console.log(`[Cron] ⏰ Escaneando tareas vencidas (corte ${now.toISOString()})...`);

  let notified = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const overdue = await prisma.task.findMany({
      where: {
        completada: false,
        avisoVencimientoEnviado: false,
        fechaVencimiento: { lt: now },
        asignadoA: { not: null },
        tenantId: { not: null },
      },
      include: {
        asignadoUsuario: {
          select: { id: true, name: true, metadata: true },
        },
      },
      take: 200,
    });

    for (const task of overdue) {
      if (!task.tenantId) continue;

      const user = task.asignadoUsuario;
      const metadata = (user?.metadata as any) || {};
      const chatId = metadata.telegram_chat_id || metadata?.telegram?.chat_id;

      if (!chatId) {
        // Sin Telegram configurado para el usuario: marcar para no reintentar
        // para siempre (el aviso ya no puede llegar por este canal).
        await prisma.task.update({
          where: { id: task.id },
          data: { avisoVencimientoEnviado: true },
        });
        skipped++;
        console.log(`[Cron] ⏭ Tarea ${task.id} sin chat de Telegram para el asignado (${user?.name || task.asignadoA}) — omitida`);
        continue;
      }

      try {
        const creds = await loadTelegramCredentials(task.tenantId);
        const botToken = creds?.bot_token;

        if (!botToken) {
          await prisma.task.update({
            where: { id: task.id },
            data: { avisoVencimientoEnviado: true },
          });
          skipped++;
          console.log(`[Cron] ⏭ Tarea ${task.id}: tenant sin bot de Telegram configurado — omitida`);
          continue;
        }

        const lines = [
          '🚨 <b>Tarea vencida</b>',
          '',
          `📋 <b>${task.titulo}</b>`,
          `📅 Vencía el ${formatFecha(task.fechaVencimiento)}`,
        ];
        if (task.descripcion) {
          lines.push(`📝 ${task.descripcion}`);
        }
        lines.push(
          '',
          '¿Quieres gestionarla? Responde en el chat:',
          `✅ "completa ${task.titulo}"`,
          `📅 "reprograma ${task.titulo} para mañana"`,
        );

        const sendResult = await sendTelegramMessage(chatId, lines.join('\n'), botToken);

        if ((sendResult as any)?.success) {
          await prisma.task.update({
            where: { id: task.id },
            data: { avisoVencimientoEnviado: true },
          });
          notified++;
          console.log(`[Cron] ✅ Aviso de vencimiento enviado para tarea ${task.id} (${task.titulo}) → chat ${chatId}`);
        } else {
          failed++;
          console.error(`[Cron] ❌ Fallo al enviar aviso de tarea ${task.id}: ${(sendResult as any)?.error || 'error desconocido'} — se reintentará`);
        }
      } catch (err: any) {
        failed++;
        console.error(`[Cron] ❌ Error enviando aviso de tarea ${task.id}:`, err?.message || err);
      }
    }

    console.log(
      `[Cron] ✅ tareas_vencidas: ${notified} notificadas, ${skipped} omitidas (sin canal), ${failed} fallidas, ${overdue.length} candidatas`
    );
    return { total: overdue.length, notified, skipped, failed };
  } catch (err: any) {
    console.error('[Cron] ❌ Error fatal en escaneo de tareas vencidas:', err);
    return { total: 0, notified: 0, skipped: 0, failed: 0, error: err?.message };
  }
}
