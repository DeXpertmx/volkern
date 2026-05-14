import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, email } = body

    if (!code) {
      return NextResponse.json({ error: 'Código requerido' }, { status: 400 })
    }

    const coupon = await prisma.giftCoupon.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        redemptions: {
          where: { userEmail: email || '' }
        }
      }
    })

    if (!coupon) {
      return NextResponse.json({ 
        valid: false, 
        error: 'Cupón no encontrado' 
      }, { status: 404 })
    }

    if (!coupon.isActive) {
      return NextResponse.json({ 
        valid: false, 
        error: 'Cupón inactivo' 
      })
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return NextResponse.json({ 
        valid: false, 
        error: 'Cupón expirado' 
      })
    }

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ 
        valid: false, 
        error: 'Cupón alcanzado su límite de usos' 
      })
    }

    const alreadyRedeemed = coupon.redemptions.some(r => r.userEmail.toLowerCase() === (email || '').toLowerCase())
    if (alreadyRedeemed) {
      return NextResponse.json({ 
        valid: false, 
        error: 'Este correo ya ha usado este cupón' 
      })
    }

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        descripcion: coupon.descripcion,
        durationDays: coupon.durationDays,
        discountPercent: coupon.discountPercent,
        modules: coupon.modules || getDefaultModules(),
        limiteLeads: coupon.limiteLeads,
        limiteUsuarios: coupon.limiteUsuarios
      }
    })
  } catch (error: any) {
    console.error('[POST /api/coupons/validate] Error:', error)
    return NextResponse.json({ error: 'Error al validar cupón' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'Código requerido' }, { status: 400 })
  }

  try {
    const coupon = await prisma.giftCoupon.findUnique({
      where: { code: code.toUpperCase() },
      select: {
        code: true,
        descripcion: true,
        isActive: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
        durationDays: true,
        discountPercent: true
      }
    })

    if (!coupon) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json({
      exists: true,
      valid: coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date()) &&
             (!coupon.maxUses || coupon.usedCount < coupon.maxUses),
      ...coupon
    })
  } catch (error: any) {
    console.error('[GET /api/coupons/validate] Error:', error)
    return NextResponse.json({ error: 'Error al consultar cupón' }, { status: 500 })
  }
}