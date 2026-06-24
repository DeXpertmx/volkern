import { prisma } from '../db'

export interface PackListing {
  id: string
  tenantId: string
  packName: string
  description: string
  industry: string
  complexity: 'low' | 'medium' | 'high'
  pipeline: Array<{ id: string; name: string; order: number }>
  triggers: number
  downloads: number
  rating: number
  createdAt: Date
}

export class PackMarketplace {
  static async publishPack(tenantId: string, packName: string): Promise<void> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { configuracion: true }
    })

    const config = (tenant?.configuracion as any) || {}
    const pack = config.volkern_pack

    if (!pack) {
      throw new Error('No pack found to publish')
    }

    await prisma.systemAlert.create({
      data: {
        level: 'INFO',
        message: `Pack published: ${packName}`,
        metadata: { tenantId, packName, pack }
      } as any
    })
  }

  static async listPublicPacks(): Promise<PackListing[]> {
    const alerts = await prisma.systemAlert.findMany({
      where: {
        message: { contains: 'Pack published:' }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    return alerts.map(a => ({
      id: a.id,
      tenantId: (a as any).metadata?.tenantId as string,
      packName: (a as any).metadata?.packName as string,
      description: '',
      industry: 'general',
      complexity: 'medium' as const,
      pipeline: [],
      triggers: 0,
      downloads: 0,
      rating: 4.5,
      createdAt: a.createdAt
    }))
  }

  static async downloadPack(tenantId: string, sourceTenantId: string): Promise<void> {
    const sourceTenant = await prisma.tenant.findUnique({
      where: { id: sourceTenantId },
      select: { configuracion: true }
    })

    const config = (sourceTenant?.configuracion as any) || {}
    const pack = config.volkern_pack

    if (!pack) {
      throw new Error('Pack not found')
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { configuracion: { volkern_pack: pack } }
    })
  }
}