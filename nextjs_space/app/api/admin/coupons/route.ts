import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth'
import crypto from 'crypto'

function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-'
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function getDefaultModules(): string[] {
  return [
    'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
    'mensajes', 'citas', 'catalogo',
    'campanas', 'email_marketing', 'cms', 'builder_premium',
    'mi_tarjeta',
    'equipo', 'configuracion',
    'telefonia',
    'social_manager',
    'rrhh', 'finanzas', 'calidad', 'produccion', 'inventario', 'proyectos', 'taskforce', 'activos', 'conocimiento', 'estrategia'
  ]
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const roleName = (session?.user as any)?.roleName || (session?.user as any)?.role?.nombre
    if (!session || (roleName !== 'Admin' && roleName !== 'Superadmin')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'

    const whereClause: any = {}
    if (activeOnly) {
      whereClause.isActive = true
    }

    const coupons = await prisma.giftCoupon.findMany({
      where: whereClause,
      include: {
        redemptions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ coupons })
  } catch (error: any) {
    console.error('[GET /api/admin/coupons] Error:', error)
    return NextResponse.json({ error: 'Error al obtener cupones' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const roleName = (session?.user as any)?.roleName || (session?.user as any)?.role?.nombre
    if (!session || (roleName !== 'Admin' && roleName !== 'Superadmin')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      descripcion, 
      justification, 
      durationDays = 30, 
      discountPercent = 0,
      modules,
      limiteLeads = 1000,
      limiteUsuarios = 5,
      maxUses,
      expiresAt
    } = body

    if (!justification) {
      return NextResponse.json({ error: 'La justificación es requerida' }, { status: 400 })
    }

    if (durationDays < 1 || durationDays > 365) {
      return NextResponse.json({ error: 'La duración debe ser entre 1 y 365 días' }, { status: 400 })
    }

    if (discountPercent < 0 || discountPercent > 100) {
      return NextResponse.json({ error: 'El descuento debe ser entre 0 y 100%' }, { status: 400 })
    }

    const code = generateCouponCode()
    
    const coupon = await prisma.giftCoupon.create({
      data: {
        code,
        descripcion,
        justification,
        durationDays,
        discountPercent,
        modules: modules || getDefaultModules(),
        limiteLeads,
        limiteUsuarios,
        maxUses: maxUses || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: session.user.id
      }
    })

    return NextResponse.json({ 
      success: true, 
      coupon,
      message: `Cupón creado: ${code}`
    })
  } catch (error: any) {
    console.error('[POST /api/admin/coupons] Error:', error)
    return NextResponse.json({ error: 'Error al crear cupón' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const roleName = (session?.user as any)?.roleName || (session?.user as any)?.role?.nombre
    if (!session || (roleName !== 'Admin' && roleName !== 'Superadmin')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { id, action, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: 'ID del cupón requerido' }, { status: 400 })
    }

    if (action === 'toggle') {
      const coupon = await prisma.giftCoupon.findUnique({ where: { id } })
      if (!coupon) {
        return NextResponse.json({ error: 'Cupón no encontrado' }, { status: 404 })
      }

      const updated = await prisma.giftCoupon.update({
        where: { id },
        data: { isActive: !coupon.isActive }
      })

      return NextResponse.json({ 
        success: true, 
        coupon: updated,
        message: updated.isActive ? 'Cupón activado' : 'Cupón desactivado'
      })
    }

    if (action === 'extend') {
      const { days } = body
      if (!days || days < 1) {
        return NextResponse.json({ error: 'Días de extensión requeridos' }, { status: 400 })
      }

      const coupon = await prisma.giftCoupon.findUnique({ where: { id } })
      if (!coupon) {
        return NextResponse.json({ error: 'Cupón no encontrado' }, { status: 404 })
      }

      const currentDuration = coupon.durationDays
      const updated = await prisma.giftCoupon.update({
        where: { id },
        data: { durationDays: currentDuration + days }
      })

      return NextResponse.json({ 
        success: true, 
        coupon: updated,
        message: `Duración extendida ${days} días`
      })
    }

    const allowedUpdates = ['descripcion', 'justification', 'discountPercent', 'limiteLeads', 'limiteUsuarios', 'maxUses', 'expiresAt', 'modules']
    const dataToUpdate: any = {}
    
    for (const key of allowedUpdates) {
      if (updateData[key] !== undefined) {
        if (key === 'expiresAt' && updateData[key]) {
          dataToUpdate[key] = new Date(updateData[key])
        } else if (key === 'modules') {
          dataToUpdate[key] = updateData[key] || getDefaultModules()
        } else {
          dataToUpdate[key] = updateData[key]
        }
      }
    }

    const updated = await prisma.giftCoupon.update({
      where: { id },
      data: dataToUpdate
    })

    return NextResponse.json({ 
      success: true, 
      coupon: updated,
      message: 'Cupón actualizado'
    })
  } catch (error: any) {
    console.error('[PUT /api/admin/coupons] Error:', error)
    return NextResponse.json({ error: 'Error al actualizar cupón' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const roleName = (session?.user as any)?.roleName || (session?.user as any)?.role?.nombre
    if (!session || (roleName !== 'Admin' && roleName !== 'Superadmin')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID del cupón requerido' }, { status: 400 })
    }

    await prisma.giftCoupon.delete({ where: { id } })

    return NextResponse.json({ 
      success: true, 
      message: 'Cupón eliminado' 
    })
  } catch (error: any) {
    console.error('[DELETE /api/admin/coupons] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar cupón' }, { status: 500 })
  }
}