import { prisma } from '../../db'

export interface CronJob {
  id: string
  tenantId: string
  name: string
  schedule: string // cron expression
  event: string
  data: Record<string, unknown>
  activo: boolean
  lastRun?: Date
  nextRun?: Date
  createdAt: Date
}

const CRON_JOBS: Map<string, CronJob> = new Map()
const CRON_INTERVALS: Map<string, NodeJS.Timeout> = new Map()

export class AutomationScheduler {
  static async createJob(job: Omit<CronJob, 'id' | 'createdAt'>): Promise<CronJob> {
    const id = `cron_${Date.now()}`
    const newJob: CronJob = {
      ...job,
      id,
      createdAt: new Date()
    }

    CRON_JOBS.set(id, newJob)
    
    if (job.activo) {
      this.startJob(newJob)
    }

    await prisma.systemAlert.create({
      data: {
        level: 'INFO',
        message: `Cron job created: ${job.name}`,
        metadata: { jobId: id, schedule: job.schedule }
      }
    })

    return newJob
  }

  static startJob(job: CronJob): void {
    if (CRON_INTERVALS.has(job.id)) {
      return
    }

    const interval = this.parseCronToMs(job.schedule)
    if (!interval) {
      console.error(`[Scheduler] Invalid schedule: ${job.schedule}`)
      return
    }

    const runJob = async () => {
      try {
        const { emit } = await import('../event-engine')
        await emit({
          event: job.event,
          tenant_id: job.tenantId,
          data: job.data,
          timestamp: new Date().toISOString()
        })

        job.lastRun = new Date()
        job.nextRun = new Date(Date.now() + interval)
        CRON_JOBS.set(job.id, job)

        await prisma.systemAlert.create({
          data: {
            level: 'INFO',
            message: `Cron job executed: ${job.name}`,
            metadata: { jobId: job.id, event: job.event }
          }
        })
      } catch (error) {
        console.error(`[Scheduler] Job error: ${job.id}`, error)
      }
    }

    runJob()
    CRON_INTERVALS.set(job.id, setInterval(runJob, interval))
  }

  static stopJob(jobId: string): void {
    const interval = CRON_INTERVALS.get(jobId)
    if (interval) {
      clearInterval(interval)
      CRON_INTERVALS.delete(jobId)
    }
  }

  static deleteJob(jobId: string): void {
    this.stopJob(jobId)
    CRON_JOBS.delete(jobId)
  }

  static getJob(jobId: string): CronJob | undefined {
    return CRON_JOBS.get(jobId)
  }

  static listJobs(tenantId?: string): CronJob[] {
    const jobs = Array.from(CRON_JOBS.values())
    if (tenantId) {
      return jobs.filter(j => j.tenantId === tenantId)
    }
    return jobs
  }

  private static parseCronToMs(schedule: string): number | null {
    const parts = schedule.split(' ')
    if (parts.length < 5) return null

    const [min, hour, day, month, weekday] = parts
    
    const defaults = { min: '*', hour: '*', day: '*', month: '*', weekday: '*' }
    const p = { ...defaults, ...{ min: min === '*' ? undefined : parseInt(min), hour: hour === '*' ? undefined : parseInt(hour), day: day === '*' ? undefined : parseInt(day), month: month === '*' ? undefined : parseInt(month), weekday: weekday === '*' ? undefined : parseInt(weekday) } }

    if (p.day || p.month || p.weekday !== undefined) {
      return 24 * 60 * 60 * 1000
    }

    if (p.hour !== undefined && p.min !== undefined) {
      return ((p.hour * 60) + p.min) * 60 * 1000
    }

    if (p.hour !== undefined) {
      return 60 * 60 * 1000
    }

    if (p.min !== undefined) {
      return p.min * 60 * 1000
    }

    return 60 * 60 * 1000
  }

  static async loadJobsFromDB(tenantId: string): Promise<void> {
    const alerts = await prisma.systemAlert.findMany({
      where: {
        message: { contains: 'Cron job created:' },
        metadata: { path: ['tenantId'], tenantId }
      },
      take: 50
    })

    for (const alert of alerts) {
      const job = alert.metadata as any
      if (job?.jobId && job?.schedule && job?.activo) {
        this.startJob(job)
      }
    }
  }

  static stopAll(): void {
    for (const interval of CRON_INTERVALS.values()) {
      clearInterval(interval)
    }
    CRON_INTERVALS.clear()
  }
}