/**
 * Cron Status Store — almacén en memoria del estado de cada job programado.
 *
 * Cada job registra su nombre, horario, última ejecución, resultado y
 * próxima ejecución estimada. El store es un mapa en memoria (se resetea
 * al reiniciar el proceso, lo cual es aceptable: el panel muestra el
 * estado real del proceso vivo).
 */

export interface CronJobStatus {
  /** Identificador corto del job (ej: 'morning-briefing') */
  id: string
  /** Nombre legible */
  label: string
  /** Expresión cron (ej: '30 8 * * *') */
  schedule: string
  /** Timestamp de la última ejecución (ISO) */
  lastRunAt: string | null
  /** 'success' | 'error' | 'skipped' | null (nunca ejecutado) */
  lastResult: 'success' | 'error' | 'skipped' | null
  /** Mensaje del último resultado */
  lastMessage: string | null
  /** Duración de la última ejecución en ms */
  lastDurationMs: number | null
}

const store = new Map<string, CronJobStatus>()

/** Registra un job al iniciar el scheduler. */
export function registerCronJob(id: string, label: string, schedule: string) {
  if (!store.has(id)) {
    store.set(id, {
      id,
      label,
      schedule,
      lastRunAt: null,
      lastResult: null,
      lastMessage: null,
      lastDurationMs: null,
    })
  }
}

/** Marca el inicio de una ejecución. */
export function cronJobStarted(id: string) {
  const job = store.get(id)
  if (job) {
    job.lastRunAt = new Date().toISOString()
    job.lastResult = null
    job.lastMessage = 'Ejecutando...'
  }
}

/** Marca el fin exitoso de una ejecución. */
export function cronJobCompleted(id: string, message: string, durationMs: number) {
  const job = store.get(id)
  if (job) {
    job.lastResult = 'success'
    job.lastMessage = message
    job.lastDurationMs = durationMs
  }
}

/** Marca el fin con error. */
export function cronJobFailed(id: string, message: string, durationMs: number) {
  const job = store.get(id)
  if (job) {
    job.lastResult = 'error'
    job.lastMessage = message
    job.lastDurationMs = durationMs
  }
}

/** Marca como saltado (no-op). */
export function cronJobSkipped(id: string, message: string) {
  const job = store.get(id)
  if (job) {
    job.lastResult = 'skipped'
    job.lastMessage = message
  }
}

/** Devuelve el estado de todos los jobs registrados. */
export function getAllCronStatus(): CronJobStatus[] {
  return Array.from(store.values())
}

/** Devuelve el estado de un job concreto. */
export function getCronStatus(id: string): CronJobStatus | undefined {
  return store.get(id)
}
