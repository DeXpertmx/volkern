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
  /**
   * Avisos del último resultado que hay que enseñar aunque el job haya ido
   * bien: cosas que no son un error del job —por eso no caben en `lastMessage`,
   * que el panel solo pinta en rojo— pero que alguien tiene que mirar. El job
   * los deja aquí y el panel los pinta en ámbar bajo la fila.
   *
   * Describen el ÚLTIMO resultado, no la historia: cada ejecución los deja como
   * los deja ella (vacío si no tiene nada que avisar).
   */
  lastAvisos: string[]
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
      lastAvisos: [],
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
    // Los avisos son del último resultado: mientras corre, el anterior ya no
    // describe nada y dejarlo puesto sería mentir sobre lo que está pasando.
    job.lastAvisos = []
  }
}

/**
 * Marca el fin exitoso de una ejecución.
 *
 * `avisos` es opcional: un job sin nada que avisar no los pasa (y así limpia los
 * de la pasada anterior, que ya no describen nada).
 */
export function cronJobCompleted(id: string, message: string, durationMs: number, avisos: string[] = []) {
  const job = store.get(id)
  if (job) {
    job.lastResult = 'success'
    job.lastMessage = message
    job.lastDurationMs = durationMs
    job.lastAvisos = avisos
  }
}

/** Marca el fin con error. */
export function cronJobFailed(id: string, message: string, durationMs: number) {
  const job = store.get(id)
  if (job) {
    job.lastResult = 'error'
    job.lastMessage = message
    job.lastDurationMs = durationMs
    // Un error se explica con su mensaje: los avisos de la pasada anterior ya no
    // son ciertos y mezclarlos confundiría la causa con un estado viejo.
    job.lastAvisos = []
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
