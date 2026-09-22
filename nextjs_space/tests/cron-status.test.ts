import { describe, expect, it, beforeEach } from 'vitest'
import {
  registerCronJob,
  cronJobStarted,
  cronJobCompleted,
  cronJobFailed,
  cronJobSkipped,
  getAllCronStatus,
  getCronStatus,
} from '@/lib/cron/cron-status'

describe('Cron Status Store', () => {
  beforeEach(() => {
    // Limpiar el store entre tests (cada test crea sus propios jobs)
    getAllCronStatus().forEach((j) => registerCronJob(j.id, j.label, j.schedule))
  })

  it('registrar un job devuelve su estado con lastRunAt=null', () => {
    registerCronJob('test-job', 'Test Job', '0 * * * *')
    const status = getCronStatus('test-job')
    expect(status).toBeDefined()
    expect(status!.label).toBe('Test Job')
    expect(status!.lastRunAt).toBeNull()
    expect(status!.lastResult).toBeNull()
  })

  it('cronJobStarted marca lastRunAt y lastResult=null', () => {
    registerCronJob('job-2', 'Job 2', '*/5 * * * *')
    cronJobStarted('job-2')
    const status = getCronStatus('job-2')
    expect(status!.lastRunAt).toBeTruthy()
    expect(status!.lastResult).toBeNull()
    expect(status!.lastMessage).toBe('Ejecutando...')
  })

  it('cronJobCompleted marca success con mensaje y duración', () => {
    registerCronJob('job-3', 'Job 3', '0 8 * * *')
    cronJobStarted('job-3')
    cronJobCompleted('job-3', 'OK (150ms)', 150)
    const status = getCronStatus('job-3')
    expect(status!.lastResult).toBe('success')
    expect(status!.lastMessage).toBe('OK (150ms)')
    expect(status!.lastDurationMs).toBe(150)
    expect(status!.lastAvisos).toEqual([])
  })

  it('los avisos del último resultado viven en el job (y se limpian solos)', () => {
    registerCronJob('job-avisos', 'Job con avisos', '30 * * * *')
    cronJobStarted('job-avisos')
    cronJobCompleted('job-avisos', '2 enviadas', 20, ['Hotel Uno: 3 partes sin reintentar'])

    expect(getCronStatus('job-avisos')!.lastAvisos).toEqual(['Hotel Uno: 3 partes sin reintentar'])

    // Una pasada sin nada que avisar los retira: describen el ÚLTIMO resultado,
    // no la historia (si no, el panel avisaría de un problema ya resuelto).
    cronJobStarted('job-avisos')
    expect(getCronStatus('job-avisos')!.lastAvisos).toEqual([])
    cronJobCompleted('job-avisos', '0 enviadas', 18)
    expect(getCronStatus('job-avisos')!.lastAvisos).toEqual([])
  })

  it('un error no arrastra los avisos de la pasada anterior', () => {
    registerCronJob('job-avisos-error', 'Job con avisos y error', '30 * * * *')
    cronJobCompleted('job-avisos-error', 'ok', 10, ['aviso viejo'])
    cronJobFailed('job-avisos-error', 'servicio caído', 15)

    expect(getCronStatus('job-avisos-error')!.lastAvisos).toEqual([])
    expect(getCronStatus('job-avisos-error')!.lastMessage).toBe('servicio caído')
  })

  it('cronJobFailed marca error con mensaje', () => {
    registerCronJob('job-4', 'Job 4', '0 * * * *')
    cronJobStarted('job-4')
    cronJobFailed('job-4', 'DB connection failed', 50)
    const status = getCronStatus('job-4')
    expect(status!.lastResult).toBe('error')
    expect(status!.lastMessage).toBe('DB connection failed')
  })

  it('cronJobSkipped marca skipped', () => {
    registerCronJob('job-5', 'Job 5', '0 */6 * * *')
    cronJobStarted('job-5')
    cronJobSkipped('job-5', 'No tenants configured')
    const status = getCronStatus('job-5')
    expect(status!.lastResult).toBe('skipped')
    expect(status!.lastMessage).toBe('No tenants configured')
  })

  it('getAllCronStatus devuelve todos los jobs registrados', () => {
    registerCronJob('a', 'Job A', '0 * * * *')
    registerCronJob('b', 'Job B', '*/5 * * * *')
    const all = getAllCronStatus()
    expect(all.length).toBeGreaterThanOrEqual(2)
    expect(all.find((j) => j.id === 'a')).toBeDefined()
    expect(all.find((j) => j.id === 'b')).toBeDefined()
  })
})
