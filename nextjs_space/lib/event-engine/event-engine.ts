import { prisma } from '../db'
import { VolkernEvent, ActionContext, PackAction } from './types'
import { PackSystem } from './pack-system'
import { VolkernActionRegistry } from './action-registry'

class VolkernEventEngine {
  private static instance: VolkernEventEngine

  static getInstance(): VolkernEventEngine {
    if (!VolkernEventEngine.instance) {
      VolkernEventEngine.instance = new VolkernEventEngine()
    }
    return VolkernEventEngine.instance
  }

  async emit(event: VolkernEvent): Promise<void> {
    console.log(`[EventEngine] Event received: ${event.event} for tenant ${event.tenant_id}`)

    await prisma.systemAlert.create({
      data: {
        level: 'INFO' as any,
        message: `Event: ${event.event} for tenant ${event.tenant_id}`,
        metadata: { event: event.event, data: event.data } as any
      } as any
    })

    const actions = await this.findMatchingActions(event)

    for (const action of actions) {
      if (action.only_if && !PackSystem.evaluateCondition(action.only_if, event.data)) {
        console.log(`[EventEngine] Action skipped - conditions not met: ${action.type}`)
        continue
      }

      console.log(`[EventEngine] Executing action: ${action.type}`)
      
      const context: ActionContext = {
        tenant_id: event.tenant_id,
        event,
        data: event.data
      }

      const result = await VolkernActionRegistry.execute(action.type, context, action.config)

      console.log(`[EventEngine] Action result: ${action.type} -> ${result.success}`)

      if (!result.success) {
        await prisma.systemAlert.create({
          data: {
            level: 'WARN' as any,
            message: `Action failed: ${action.type} - ${result.error}`,
            metadata: { event: event.event, action: action.type, error: result.error } as any
          } as any
        })
      }
    }
  }

  private async findMatchingActions(event: VolkernEvent): Promise<PackAction[]> {
    const triggers = await PackSystem.getTriggers(event.tenant_id, event.event)
    const actions: PackAction[] = []

    for (const trigger of triggers) {
      if (trigger.conditions && trigger.conditions.length > 0) {
        const allMet = trigger.conditions.every(c => PackSystem.evaluateCondition(c, event.data))
        if (!allMet) continue
      }
      actions.push(...trigger.actions)
    }

    return actions
  }

  async emitAsync(event: VolkernEvent): Promise<void> {
    setImmediate(() => this.emit(event).catch(err => console.error('[EventEngine] Async emit error:', err)))
  }

  async schedule(event: VolkernEvent, delayMs: number): Promise<void> {
    setTimeout(() => this.emit(event).catch(err => console.error('[EventEngine] Scheduled emit error:', err)), delayMs)
  }

  async scheduleRecurring(eventTemplate: VolkernEvent, intervalMs: number): Promise<string> {
    const intervalId = `interval_${Date.now()}`
    
    const run = async () => {
      const event: VolkernEvent = {
        ...eventTemplate,
        timestamp: new Date().toISOString(),
        correlation_id: `sched_${Date.now()}`
      }
      await this.emit(event).catch(err => console.error('[EventEngine] Recurring error:', err))
    }

    run()
    setInterval(run, intervalMs)

    return intervalId
  }

  stopRecurring(intervalId: string): void {
    clearInterval(intervalId as unknown as NodeJS.Timeout)
  }
}

export const eventEngine = VolkernEventEngine.getInstance()
export const emit = eventEngine.emit.bind(eventEngine)
export const emitAsync = eventEngine.emitAsync.bind(eventEngine)

export default VolkernEventEngine