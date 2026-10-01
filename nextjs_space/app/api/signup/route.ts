export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { PLANS, PLAN_LIMITS, TRIAL_DAYS, PLAN_MODULES, getPlanConfig } from '@/lib/plans'
import { getDefaultModules, PERFIL_SUGGESTED_MODULES } from '@/lib/onboarding-modules'
import { seedFormsForTenant } from '@/scripts/seed-formularios-demo'
import { AccountingInitializer } from '@/lib/accounting/initializer'
import { stripe, createSubscriptionCheckout } from '@/lib/stripe'
import { calcularPrecio } from '@/lib/pricing-engine'
import { sendEmail } from '@/lib/ses-email'
import { aplicarCatalogoRolesBasicos } from '@/lib/roles-basicos'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'

async function sendTrialWelcomeEmail(params: {
  email: string
  tenantName: string
  tenantId: string
  isCoupon: boolean
  durationDays: number
}): Promise<void> {
  const { email, tenantName, tenantId, isCoupon, durationDays } = params
  const checkoutUrl = `${APP_URL}/checkout?usuarios=5&contactos=5000&plan=scale&interval=yearly`
  const dashboardUrl = `${APP_URL}/dashboard/onboarding-quick`
  
  const subject = isCoupon
    ? `🎁 ¡Tu regalo Volkern está activo! — ${durationDays} días`
    : `🚀 ¡Bienvenido a Volkern! — ${durationDays} días de prueba gratis`

  const headerEmoji = isCoupon ? '🎁' : '🚀'
  const headerTitle = isCoupon
    ? '¡Tu regalo Volkern está activo!'
    : '¡Bienvenido a Volkern!'
  const headerSubtitle = isCoupon
    ? `Disfruta ${durationDays} días de acceso completo`
    : `Comienza tu prueba gratis de ${durationDays} días`

  const actionBlock = isCoupon
    ? `
      <p style="font-size: 16px; color: #374151; margin: 16px 0;">
        Tienes <strong>${durationDays} días</strong> de acceso completo a todas las funciones.
        Sin límites. Sin compromiso.
      </p>
    `
    : `
      <p style="font-size: 16px; color: #374151; margin: 16px 0;">
        Tienes <strong>${durationDays} días</strong> para explorar todas las funciones sin compromiso.
        Sin tarjeta de crédito. Sin permanencia.
      </p>
      <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 20px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #f59e0b; text-align: center;">
        <p style="margin: 0 0 8px 0; color: #92400e; font-weight: bold; font-size: 14px;">💡 ¿Listo para activar tu plan?</p>
        <p style="margin: 0 0 12px 0; color: #78350f; font-size: 13px;">
          Activa tu suscripción antes de que termine la prueba y conserva toda tu configuración.
        </p>
        <a href="${checkoutUrl}" target="_blank" style="display: inline-block; background: #f59e0b; color: #78350f; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
          Activar mi plan ahora →
        </a>
      </div>
    `

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0; font-size: 28px;">${headerEmoji} ${headerTitle}</h1>
        <p style="color: #6b7280; font-size: 16px; margin-top: 8px;">${headerSubtitle}</p>
      </div>

      <p style="font-size: 16px; color: #374151;">Hola <strong>${tenantName}</strong>,</p>
      
      ${actionBlock}

      <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #7c3aed;">
        <h2 style="margin: 0 0 12px 0; color: #5b21b6; font-size: 18px;">⚡ Tu plataforma incluye</h2>
        <ul style="margin: 0; padding-left: 20px; color: #374151; line-height: 1.8;">
          <li>CRM completo con pipeline de ventas</li>
          <li>Marketing automation y campañas</li>
          <li>Facturación y firma digital</li>
          <li>Integraciones y webhooks</li>
          <li>Academia y RRHH</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 32px 0;">        <a href="${dashboardUrl}" target="_blank" style="display: inline-block; background: #7c3aed; color: white; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 16px;">
          Ir a mi panel →</a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        Si tienes alguna duda, responde a este correo o contáctanos en 
        <a href="mailto:soporte@volkern.app" style="color: #7c3aed;">soporte@volkern.app</a>.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Volkern — La plataforma todo en uno para tu negocio
      </p>
    </div>
  `

  await sendEmail({
    to: email,
    subject,
    html,
    tenantSubdomain: tenantId,
  })
}

function generateSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, fullName, companyName, couponCode, pricing, legalConsent, vertical } = body

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
    const baseSlug = generateSlug(companyName)
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
    
    const planSlug = PLANS.TRIAL
    let limites = trialConfig.limites
    let modules = getDefaultModules()
    let fechaFin: Date

    // Si el usuario seleccionó una vertical, usar sus módulos sugeridos + core defaults
    if (vertical && PERFIL_SUGGESTED_MODULES[vertical]) {
      const verticalModules = PERFIL_SUGGESTED_MODULES[vertical]
      const coreSet = new Set(getDefaultModules())
      for (const mod of verticalModules) {
        coreSet.add(mod)
      }
      modules = Array.from(coreSet)
    }

    // Si el usuario contrató un plan específico (via checkout), activar sus módulos
    if (pricing?.plan && !couponData) {
      const planKey = pricing.plan as keyof typeof PLAN_MODULES
      if (PLAN_MODULES[planKey]) {
        modules = PLAN_MODULES[planKey]
      }
    }
    
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
            // `ver_todos` es el alcance del pipeline: sin ella, el dueño de la
            // cuenta recién creada vería solo los leads que él se asignara.
            leads: { crear: true, editar: true, eliminar: true, ver: true, ver_todos: true },
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

      // 2b. Catálogo básico de roles: Miembro y Solo lectura, y Admin
      // completado con las llaves modernas que le falten (equipo, roles,
      // analytics…). Idempotente y aditivo: nunca retira lo definido arriba.
      await aplicarCatalogoRolesBasicos(tx, tenant.id)

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
            vertical: vertical || null,
            modules: modules,
            couponCode: couponData?.code || null,
            legalConsent: legalConsent || null,
          },
          userId: user.id,
          tenantId: tenant.id
        }
      })

      return { user, tenant, couponUsed: !!couponData }
    })

    // Seed demo forms for the new tenant (fire-and-forget, non-blocking)
    seedFormsForTenant(result.tenant.id, { prisma }).catch(err => {
      console.error('[Signup] Error seeding demo forms:', err.message);
    });

    AccountingInitializer.initializeTenant(result.tenant.id, 'NORMAL', 'NINGUNO').catch(err =>
      console.error('[Signup] Error initializing chart of accounts:', err.message)
    );

    // ─── Enviar email de bienvenida (trial / cupón) ──────────────────────
    // Solo para signups sin checkout — los que pagan reciben welcome del webhook
    if (!pricing || couponData) {
      sendTrialWelcomeEmail({
        email: result.user.email,
        tenantName: result.tenant.nombre,
        tenantId: result.tenant.id,
        isCoupon: result.couponUsed,
        durationDays: couponData?.durationDays || TRIAL_DAYS,
      }).catch(err =>
        console.error('[Signup] Error sending trial welcome email:', err)
      )
    }

    // ─── Crear checkout de Stripe si hay pricing params y no hay cupón ──────
    let checkoutUrl: string | null = null

    if (pricing && !couponData) {
      try {
        const { usuarios, contactos, plan, interval } = pricing

        // Recalcular precio en servidor (no confiar en el cliente)
        const engineResult = calcularPrecio({
          usuarios: usuarios || 5,
          contactos: contactos || 5000,
          plan: plan === 'compliance' ? 'compliance' : 'scale',
        })
        const precioCalculado = interval === 'yearly'
          ? Math.round(engineResult.precio * 0.8)
          : engineResult.precio

        // Crear cliente en Stripe
        let customerId = result.tenant.stripeCustomerId
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: result.user.email,
            name: result.tenant.nombre,
            metadata: {
              tenantId: result.tenant.id,
              tenantSlug: result.tenant.slug,
            },
          })
          customerId = customer.id

          await prisma.tenant.update({
            where: { id: result.tenant.id },
            data: { stripeCustomerId: customerId },
          })
        }

        const planLabel = plan === 'compliance' ? 'Compliance Pro' : 'Scale'
        const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

        const checkoutResult = await createSubscriptionCheckout({
          customerId,
          tenantId: result.tenant.id,
          planLabel,
          usuarios: usuarios || 5,
          contactos: contactos || 5000,
          plan: plan || 'scale',
          interval: interval || 'monthly',
          precioMensual: precioCalculado,
          successUrl: `${origin}/dashboard?checkout=success`,
          cancelUrl: `${origin}/signup?checkout=canceled`,
        })

        if (checkoutResult.success && checkoutResult.session) {
          checkoutUrl = checkoutResult.session.url || null

          // Log de auditoría
          await prisma.auditLog.create({
            data: {
              accion: 'crear',
              entidad: 'Subscription',
              entidadId: checkoutResult.session.id,
              descripcion: `Checkout de suscripción iniciado en signup: ${planLabel} ${interval}`,
              cambiosDespues: {
                plan,
                interval,
                usuarios,
                contactos,
                precioMensual: precioCalculado,
                sessionId: checkoutResult.session.id,
              },
              userId: result.user.id,
              tenantId: result.tenant.id,
            },
          })
        }
      } catch (checkoutError) {
        console.error('[Signup] Error creating checkout session:', checkoutError)
        // No bloqueamos el signup si falla el checkout
      }
    }

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
      } : null,
      checkoutUrl
    })

  } catch (error) {
    console.error('Error in signup:', error)
    return NextResponse.json(
      { error: 'Error al crear la cuenta. Por favor intenta de nuevo.' },
      { status: 500 }
    )
  }
}
