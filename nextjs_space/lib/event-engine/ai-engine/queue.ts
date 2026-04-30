import { prisma } from '../../db'
import { AIEngine } from './ai-engine'
import { VolkernEvent } from '../types'

const QUEUE: Array<{ event: VolkernEvent; resolve: (v: unknown) => void }> = []
let PROCESSOR_INTERVAL: NodeJS.Timeout | null = null

export class AIQueue {
  static enqueue(event: VolkernEvent): Promise<void> {
    return new Promise((resolve) => {
      QUEUE.push({ event, resolve })
      this.ensureProcessor()
    })
  }

  private static ensureProcessor(): void {
    if (PROCESSOR_INTERVAL) return

    PROCESSOR_INTERVAL = setInterval(async () => {
      if (QUEUE.length === 0) {
        clearInterval(PROCESSOR_INTERVAL!)
        PROCESSOR_INTERVAL = null
        return
      }

      const item = QUEUE.shift()
      if (!item) return

      try {
        const result = await AIEngine.chat({
          prompt: item.event.data.prompt as string,
          model: item.event.data.model as any
        }, item.event.tenant_id)

        await prisma.systemAlert.create({
          data: {
            level: 'INFO',
            message: `AI Queue processed: ${item.event.event}`,
            metadata: { result: result.content }
          }
        })

        item.resolve(result)
      } catch (error) {
        item.resolve({ error: String(error) })
      }
    }, 1000)
  }

  static getQueueSize(): number {
    return QUEUE.length
  }

  static clear(): void {
    QUEUE.length = 0
    if (PROCESSOR_INTERVAL) {
      clearInterval(PROCESSOR_INTERVAL)
      PROCESSOR_INTERVAL = null
    }
  }
}