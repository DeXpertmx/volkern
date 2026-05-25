export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { PLANS, PLAN_LIMITS, TRIAL_DAYS, getPlanConfig } from '@/lib/plans'

function generateSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, fullName, companyName, couponCode } = body

    if (!email || !password || !fullName || !companyName) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }

    // Validación de seguridad de contraseña
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      )
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/
    if (!passwordRegex.test(password)) {
      return NextResponse.json(
        { error: 'La contraseña debe incluir mayúsculas, minúsculas y al menos un carácter especial' },
        { status: 400 }
      )
    }

    // Verificar si el usuario ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'El email ya está registrado' },
        { status: 400 }
      )
    }

    // Validar cupón si se proporcionó
    let couponData: any = null
    if (couponCode) {
      const coupon = await prisma.giftCoupon.findUnique({
        where: { code: couponCode.toUpperCase() }
      })

      if (!coupon) {
        return NextResponse.json(
          { error: 'Cupón no válido' },
          { status: 400 }
        )
      }

      if (!coupon.isActive) {
        return NextResponse.json(
          { error: 'Cupón inactivo' },
          { status: 400 }
        )
      }

      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        return NextResponse.json(
          { error: 'Cupón expirado' },
          { status: 400 }
        )
      }

      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
        return NextResponse.json(
          { error: 'Cupón alcanzado su límite de usos' },
          { status: 400 }
        )
      }

      const existingRedemption = await prisma.giftCouponRedemption.findFirst({
        where: {
          couponId: coupon.id,
          userEmail: { equals: email, mode: 'insensitive' }
        }
      })

      if (existingRedemption) {
        return NextResponse.json(
          { error: 'Este correo ya ha usado este cupón' },
          { status: 400 }
        )
      }

      couponData = coupon
    }

    // Generar slug único para el tenant
    let baseSlug = generateSlug(companyName)
    let slug = baseSlug
    let counter = 1

    // Verificar que el slug sea único
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    // Obtener configuración del plan (Trial por defecto)
    const trialConfig = await getPlanConfig(PLANS.TRIAL);

    // Calcular fecha de fin según cupón o trial
    const trialStart = new Date()
    const trialEnd = new Date()
    
    let planSlug = PLANS.TRIAL
    let limites = trialConfig.limites
    let modules = getDefaultModules()
    let fechaFin: Date
    
    if (couponData) {
      // Usar configuración del cupón de regalo
      trialEnd.setDate(trialEnd.getDate() + couponData.durationDays)
      fechaFin = trialEnd
      
      // Usar límites del cupón
      limites = {
        ...trialConfig.limites,
        leads: couponData.limiteLeads || trialConfig.limites.leads,
        usuarios: couponData.limiteUsuarios || trialConfig.limites.usuarios
      }
      
      // Usar módulos del cupón o los default
      modules = couponData.modules || getDefaultModules()
    } else {
      // Usar trial por defecto
      trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS)
      fechaFin = trialEnd
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 12)

    // Crear el tenant y el usuario en una transacción
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear el tenant
      const tenant = await tx.tenant.create({
        data: {
          nombre: companyName,
          slug,
          plan: couponData ? 'gift' : PLANS.TRIAL,
          estado: 'trial',
          limites,
          fechaTrialInicio: trialStart,
          fechaTrialFin: trialEnd,
          billingEmail: email,
          moneda: 'EUR'
        }
      })

      // 2. Crear roles básicos para el tenant
      const adminRole = await tx.role.create({
        data: {
          nombre: 'Admin',
          descripcion: 'Administrador del sistema',
          permisos: {
            usuarios: { crear: true, editar: true, eliminar: true, ver: true },
            leads: { crear: true, editar: true, eliminar: true, ver: true },
            contactos: { crear: true, editar: true, eliminar: true, ver: true },
            deals: { crear: true, editar: true, eliminar: true, ver: true },
            automatizaciones: { crear: true, editar: true, eliminar: true, ver: true },
            campanas: { crear: true, editar: true, eliminar: true, ver: true },
            cursos: { crear: true, editar: true, eliminar: true, ver: true },
            configuracion: { crear: true, editar: true, eliminar: true, ver: true },
            reportes: { ver: true }
          },
          tenantId: tenant.id
        }
      })

      // 3. Crear el usuario owner
      const user = await tx.user.create({
        data: {
          name: fullName,
          email,
          password: hashedPassword,
          tenantId: tenant.id,
          roleId: adminRole.id,
          estado: 'activo'
        },
        include: {
          role: true,
          tenant: true
        }
      })

      // 4. Crear pipeline stages por defecto
      const stages = [
        { nombre: 'Nuevo', color: '#3B82F6', probabilidad: 10, orden: 1 },
        { nombre: 'Calificación', color: '#8B5CF6', probabilidad: 20, orden: 2 },
        { nombre: 'Propuesta', color: '#EC4899', probabilidad: 40, orden: 3 },
        { nombre: 'Negociación', color: '#F59E0B', probabilidad: 60, orden: 4 },
        { nombre: 'Ganado', color: '#10B981', probabilidad: 100, orden: 5 },
        { nombre: 'Perdido', color: '#EF4444', probabilidad: 0, orden: 6 }
      ]

      for (const stage of stages) {
        await tx.pipelineStage.create({
          data: {
            ...stage,
            tenantId: tenant.id
          }
        })
      }

      // 5. Crear módulos/features del tenant
      const tenantFeatures = modules.map((modulo: string) => ({
        tenantId: tenant.id,
        feature: modulo,
        habilitado: true
      }))
      
      await tx.tenantFeature.createMany({
        data: tenantFeatures
      })

      // 6. Redimir el cupón de regalo si se usó
      if (couponData) {
        await tx.giftCouponRedemption.create({
          data: {
            couponId: couponData.id,
            tenantId: tenant.id,
            userEmail: email
          }
        })

        await tx.giftCoupon.update({
          where: { id: couponData.id },
          data: {
            usedCount: { increment: 1 },
            isActive: false
          }
        })
      }

      // 7. Crear log de auditoría
      await tx.auditLog.create({
        data: {
          accion: 'crear',
          entidad: 'Tenant',
          entidadId: tenant.id,
          descripcion: `Tenant creado: ${tenant.nombre} (${tenant.slug}) con plan ${tenant.plan}` + 
            (couponData ? ` [CUPÓN: ${couponData.code}, ${couponData.durationDays} días]` : ` [TRIAL: ${TRIAL_DAYS} días]`),
          cambiosDespues: {
            tenantName: tenant.nombre,
            slug: tenant.slug,
            plan: tenant.plan,
            trialEnds: fechaFin.toISOString(),
            modules: modules,
            couponCode: couponData?.code || null
          },
          userId: user.id,
          tenantId: tenant.id
        }
      })

      return { user, tenant, couponUsed: !!couponData }
    })

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        roleName: result.user.role?.nombre
      },
      tenant: {
        id: result.tenant.id,
        nombre: result.tenant.nombre,
        slug: result.tenant.slug,
        plan: result.tenant.plan,
        trialEndsAt: result.tenant.fechaTrialFin
      },
      couponUsed: result.couponUsed || false,
      giftInfo: result.couponUsed ? {
        durationDays: couponData?.durationDays,
        discountPercent: couponData?.discountPercent
      } : null
    })

  } catch (error) {
    console.error('Error in signup:', error)
    return NextResponse.json(
      { error: 'Error al crear la cuenta. Por favor intenta de nuevo.' },
      { status: 500 }
    )
  }
}
