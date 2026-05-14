import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PLANS } from '@/lib/plans'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, email, tenantId } = body

    if (!code || !email || !tenantId) {
      return NextResponse.json({ 
        error: 'Código, email y tenantId son requeridos' 
      }, { status: 400 })
    }

    const coupon = await prisma.giftCoupon.findUnique({
      where: { code: code.toUpperCase() }
    })

    if (!coupon) {
      return NextResponse.json({ 
        success: false,
        error: 'Cupón no encontrado' 
      }, { status: 404 })
    }

    if (!coupon.isActive) {
      return NextResponse.json({ 
        success: false,
        error: 'Cupón inactivo' 
      })
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return NextResponse.json({ 
        success: false,
        error: 'Cupón expirado' 
      })
    }

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ 
        success: false,
        error: 'Cupón alcanzado su límite de usos' 
      })
    }

    const existingRedemption = await prisma.giftCouponRedemption.findFirst({
      where: {
        couponId: coupon.id,
        userEmail: { equals: email, mode: 'insensitive' }
      }
    })

    if (existingRedemption) {
      return NextResponse.json({ 
        success: false,
        error: 'Este correo ya ha usado este cupón' 
      })
    }

    await prisma.$transaction([
      prisma.giftCouponRedemption.create({
        data: {
          couponId: coupon.id,
          tenantId,
          userEmail: email
        }
      }),
      prisma.giftCoupon.update({
        where: { id: coupon.id },
        data: {
          usedCount: { increment: 1 }
        }
      }),
      prisma.giftCoupon.update({
        where: { id: coupon.id },
        data: { isActive: false }
      })
    ])

    return NextResponse.json({
      success: true,
      message: 'Cupón redimido exitosamente',
      details: {
        durationDays: coupon.durationDays,
        discountPercent: coupon.discountPercent,
        modules: coupon.modules
      }
    })
  } catch (error: any) {
    console.error('[POST /api/coupons/redeem] Error:', error)
    return NextResponse.json({ 
      success: false,
      error: 'Error al redimir cupón' 
    }, { status: 500 })
  }
}