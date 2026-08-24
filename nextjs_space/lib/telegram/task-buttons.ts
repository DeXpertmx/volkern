/**
 * Botones inline de acciones de tarea para Telegram
 * (✅ Completar / 📅 Reprogramar / ⏰ Recordar más tarde).
 *
 * Centraliza la construcción de la fila de 3 botones que antes vivía duplicada
 * en `app/api/webhooks/telegram/route.ts` y `lib/cron/task-overdue-jobs.ts`:
 *   - `buildTaskActionRow(taskId)` — fila única con los 3 botones.
 *   - `buildTaskButtonsMarkup(taskButtons)` — `inline_keyboard` completo para el
 *     listado (una fila por tarea, máx. 8), tal como lo consume el webhook.
 *
 * Callbacks:
 *   task:complete:<taskId> → completar
 *   task:resched:<taskId>  → reprogramar
 *   task:snooze:<taskId>   → recordar más tarde (snooze)
 */

export interface TaskButtonInfo {
  taskId: string
  titulo: string
}

/** Fila única con los 3 botones de acciones para una tarea. */
export function buildTaskActionRow(taskId: string) {
  return [
    { text: '✅ Completar', callback_data: `task:complete:${taskId}` },
    { text: '📅 Reprogramar', callback_data: `task:resched:${taskId}` },
    { text: '⏰ Recordar más tarde', callback_data: `task:snooze:${taskId}` },
  ];
}

/**
 * `inline_keyboard` completo a partir de la lista de tareas del pipeline
 * (`processMessage` → `taskButtons`). Una fila por tarea, máx. `maxRows`.
 */
export function buildTaskButtonsMarkup(taskButtons: TaskButtonInfo[], maxRows = 8) {
  return {
    inline_keyboard: taskButtons.slice(0, maxRows).map((t) => buildTaskActionRow(t.taskId)),
  };
}
