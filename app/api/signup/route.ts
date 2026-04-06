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

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName, companyName } = await request.json()

    if (!email || !password || !fullName || !companyName) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
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

    // Generar slug único para el tenant
    let baseSlug = generateSlug(companyName)
    let slug = baseSlug
    let counter = 1

    // Verificar que el slug sea único
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    // Calcular fecha de fin de trial (14 días desde ahora)
    const trialStart = new Date()
    const trialEnd = new Date()
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS)

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 12)

    // Obtener configuración del plan (Trial por defecto)
    const trialConfig = await getPlanConfig(PLANS.TRIAL);

    // Crear el tenant y el usuario en una transacción
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear el tenant con trial de 14 días
      const tenant = await tx.tenant.create({
        data: {
          nombre: companyName,
          slug,
          plan: PLANS.TRIAL,
          estado: 'trial',
          limites: trialConfig.limites,
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

      // 5. Crear log de auditoría
      await tx.auditLog.create({
        data: {
          accion: 'crear',
          entidad: 'Tenant',
          entidadId: tenant.id,
          descripcion: `Tenant creado: ${tenant.nombre} (${tenant.slug}) con plan ${tenant.plan}`,
          cambiosDespues: {
            tenantName: tenant.nombre,
            slug: tenant.slug,
            plan: tenant.plan,
            trialEnds: trialEnd.toISOString()
          },
          userId: user.id,
          tenantId: tenant.id
        }
      })

      return { user, tenant }
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
      }
    })

  } catch (error) {
    console.error('Error in signup:', error)
    return NextResponse.json(
      { error: 'Error al crear la cuenta. Por favor intenta de nuevo.' },
      { status: 500 }
    )
  }
}
