import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const movements = await prisma.stockMovement.findMany({
      include: {
        catalogoItem: true,
        lot: true,
        warehouse: true
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
    return NextResponse.json(movements)
  } catch (error) {
    console.error('Error fetching movements:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
