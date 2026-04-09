export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma as proxyPrisma, globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { stripe } from '@/lib/stripe';
import { getPlanConfig } from '@/lib/plans';
import { provisionTenantDatabase } from '@/lib/tenant-provisioning';

// POST /api/admin/tenants/[id]/operations - Realizar operaciones administrativas sobre un tenant
export const POST = withTenantAuth(async (req, auth, params) => {
  try {
    // 1. Verificar si el usuario es superadmin (el rol ya viene en auth.user)
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado: requiere rol de Superadmin' }, { status: 403 });
    }

    const body = await req.json();
    const { operation, params: opParams } = body;

    // Los tenants viven en la Base de Datos Global (Control Plane)
    const tenant = await globalPrisma.tenant.findUnique({
      where: { id: params.id }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    let result: any = { success: true };

    switch (operation) {
      case 'provision_db':
        // OPERACIÓN CRÍTICA: Crear base de datos física y sincronizar esquema
        const provisionResult = await provisionTenantDatabase(params.id);
        result.success = provisionResult.success;
        result.message = provisionResult.message;
        result.dbUrl = provisionResult.dbUrl;
        if (!provisionResult.success) {
          return NextResponse.json(result, { status: 500 });
        }
        break;

      case 'extend_trial':
        const days = opParams?.days || 14;
        const newTrialEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        
        await globalPrisma.tenant.update({
          where: { id: params.id },
          data: {
            estado: 'trial',
            fechaTrialInicio: tenant.fechaTrialInicio || new Date(),
            fechaTrialFin: newTrialEnd
          }
        });

        result.message = `Trial extendido por ${days} días`;
        result.newTrialEnd = newTrialEnd;
        break;

      case 'suspend':
        await globalPrisma.tenant.update({
          where: { id: params.id },
          data: { estado: 'suspendido' }
        });

        result.message = 'Tenant suspendido';
        break;

      case 'reactivate':
        await globalPrisma.tenant.update({
          where: { id: params.id },
          data: { estado: 'activo' }
        });

        result.message = 'Tenant reactivado';
        break;

      case 'toggle_feature':
        const { feature, enabled } = opParams;
        if (!feature) {
          return NextResponse.json({ error: 'Feature es requerido' }, { status: 400 });
        }

        await globalPrisma.tenantFeature.upsert({
          where: {
            tenantId_feature: {
              tenantId: params.id,
              feature
            }
          },
          update: {
            habilitado: enabled,
            habilitadoPor: auth.user!.id,
            razon: opParams.razon
          },
          create: {
            tenantId: params.id,
            feature,
            habilitado: enabled,
            habilitadoPor: auth.user!.id,
            razon: opParams.razon
          }
        });

        result.message = `Feature ${feature} ${enabled ? 'habilitado' : 'deshabilitado'}`;
        break;

      case 'assign_plan':
        const { planId, withBilling, mrr, reason } = opParams;
        if (!planId) {
          return NextResponse.json({ error: 'Plan es requerido' }, { status: 400 });
        }

        const planConfig = await getPlanConfig(planId);
        const planLimits = planConfig.limites;

        if (withBilling) {
          try {
            let stripeCustomerId = tenant.stripeCustomerId;
            
            if (!stripeCustomerId) {
              const customer = await stripe.customers.create({
                email: tenant.billingEmail || undefined,
                name: tenant.nombre,
                metadata: {
                  tenantId: tenant.id,
                  tenantSlug: tenant.slug
                }
              });
              stripeCustomerId = customer.id;
              await globalPrisma.tenant.update({
                where: { id: params.id },
                data: { stripeCustomerId }
              });
            }

            const stripePriceId = planConfig.stripePriceId;
            if (!stripePriceId) {
              return NextResponse.json({ error: 'No se encontró el precio de Stripe para este plan' }, { status: 400 });
            }

            const existingSubscriptions = await stripe.subscriptions.list({
              customer: stripeCustomerId,
              status: 'active',
              limit: 1
            });

            let subscription;
            if (existingSubscriptions.data.length > 0) {
              const existingSub = existingSubscriptions.data[0];
              subscription = await stripe.subscriptions.update(existingSub.id, {
                items: [{ id: existingSub.items.data[0].id, price: stripePriceId }],
                proration_behavior: 'always_invoice',
                metadata: { assignedBy: auth.user!.id, assignmentReason: reason || 'Admin assignment' }
              });
            } else {
              subscription = await stripe.subscriptions.create({
                customer: stripeCustomerId,
                items: [{ price: stripePriceId }],
                metadata: { tenantId: tenant.id, assignedBy: auth.user!.id, assignmentReason: reason || 'Admin assignment' }
              });
            }

            await globalPrisma.tenant.update({
              where: { id: params.id },
              data: {
                plan: planId,
                estado: 'activo',
                limites: planLimits as any,
                mrr: planConfig.precio || 0,
                moneda: planConfig.moneda.toUpperCase() || 'EUR',
                fechaVencimiento: new Date((subscription as any).current_period_end * 1000)
              }
            });

            result.message = `Plan ${planId} asignado con facturación exitosamente`;
            result.subscriptionId = subscription.id;
            result.withBilling = true;
          } catch (stripeError: any) {
            console.error('Stripe error:', stripeError);
            return NextResponse.json({ error: `Error de Stripe: ${stripeError.message}` }, { status: 500 });
          }
        } else {
          await globalPrisma.tenant.update({
            where: { id: params.id },
            data: {
              plan: planId,
              estado: 'activo',
              limites: planLimits as any,
              mrr: mrr || 0,
              configuracion: {
                ...(tenant.configuracion as any || {}),
                cortesia: true,
                cortesiaReason: reason || 'Asignación manual del administrador',
                cortesiaAssignedBy: auth.user!.id,
                cortesiaAssignedAt: new Date().toISOString()
              }
            }
          });

          result.message = `Plan ${planId} asignado sin facturación (cortesía)`;
          result.withBilling = false;
        }
        break;

      default:
        return NextResponse.json({ error: 'Operación no válida' }, { status: 400 });
    }

    // Log audit (se registra en la DB física del tenant que realiza/recibe la operación para auditoría local, 
    // pero como superadmin estamos operando GLOBALMENTE).
    // Usamos el proxy para loguear en el contexto del tenant destino.
    await proxyPrisma.auditLog.create({
      data: {
        tenantId: params.id,
        userId: auth.user!.id,
        accion: 'operacion',
        entidad: 'tenant',
        entidadId: params.id,
        descripcion: `Superadmin ${auth.user?.name} ejecutó operación ${operation} en tenant ${tenant.nombre}`,
        cambiosDespues: JSON.stringify({ operation, params: opParams, result })
      }
    });

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error executing tenant operation:', error);
    return NextResponse.json({ error: 'Error al ejecutar operación' }, { status: 500 });
  }
}, ['admin:write'])
