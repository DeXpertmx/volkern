export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma, globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { SUPPORTED_CURRENCIES, type Currency } from '@/lib/insurance/currency';
import { MONEDA_MINIMA_ESQUEMA } from '@/lib/moneda';

/**
 * PATCH /api/tenant/moneda
 *
 * Cambia el campo `Tenant.moneda` (la "moneda de reporte" del tenant).
 *
 * Por qué existe: el campo defaults a 'MXN' en el schema. Si al crear el
 * tenant nadie lo cambió y luego se importan pólizas en otra moneda (EUR,
 * USD…), el portfolio ejecutivo de Seguros muestra el KPI global convertido
 * a la moneda del tenant — confundiendo al broker. Esta ruta permite al
 * propio tenant (no requiere admin) actualizar su moneda de reporte desde
 * `/dashboard/configuracion` → "Datos de la Empresa".
 *
 * Body: { moneda: 'EUR' | 'USD' | 'MXN' | ... (SUPPORTED_CURRENCIES) }
 *
 * Respuestas:
 *  - 200 OK con { tenantId, slug, moneda, anteriores } si se actualizó
 *  - 400 si la moneda no es válida
 *  - 401 si no hay sesión válida
 *  - 409 si el cambio está en cooldown (1 cambio cada 24h para evitar
 *    sabotaje del portfolio ejecutivo al navegar la UI)
 */
export const PATCH = withTenantAuth(async (request, auth) => {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const moneda = String(body?.moneda ?? '').toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(moneda as Currency)) {
      return NextResponse.json(
        {
          error: `Moneda no soportada: ${moneda}. Permitidas: ${SUPPORTED_CURRENCIES.join(', ')}`,
        },
        { status: 400 },
      );
    }

    const tenantId = auth.tenant!.id;
    const tenant = await globalPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, moneda: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    if (tenant.moneda === moneda) {
      return NextResponse.json({
        tenantId: tenant.id,
        slug: tenant.slug,
        moneda: tenant.moneda,
        sinCambios: true,
      });
    }

    // Cooldown defensivo de 24h para evitar sabotaje por crashloop de UI
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    try {
      const lastChange = await globalPrisma.auditLog.findFirst({
        where: {
          entidad: 'tenant',
          entidadId: tenantId,
          accion: 'actualizar',
          descripcion: { contains: 'Moneda del tenant cambiada' },
        },
        orderBy: { fechaCreacion: 'desc' },
      });
      if (lastChange && Date.now() - new Date(lastChange.fechaCreacion).getTime() < COOLDOWN_MS) {
        const minutosRestantes = Math.ceil(
          (COOLDOWN_MS - (Date.now() - new Date(lastChange.fechaCreacion).getTime())) / 60000,
        );
        return NextResponse.json(
          {
            error: `Ya cambiaste la moneda hace menos de 24h. Vuelve a intentarlo en ${minutosRestantes} minutos. Si necesitas un cambio urgente, contacta al superadmin.`,
          },
          { status: 429 },
        );
      }
    } catch {
      // Si auditLog falla, no bloqueamos el cambio (es defensivo).
    }

    const anteriores = tenant.moneda;
    const updated = await globalPrisma.tenant.update({
      where: { id: tenantId },
      data: {
        moneda,
        // Trazabilidad: cambios manuales via UI/curl/PATCH = EXPLICIT.
        // El bypass de cooldown (auto-fix del primer import) está en
        // lib/insurance/post-import-moneda-autofix.ts y usa IMPORT_AUTO.
        monedaInferida: moneda,
        monedaInferenciaSource: 'EXPLICIT',
      },
      select: { id: true, slug: true, moneda: true },
    });

    await globalPrisma.auditLog.create({
      data: {
        accion: 'actualizar',
        entidad: 'tenant',
        entidadId: tenantId,
        descripcion: `Moneda del tenant cambiada: ${anteriores ?? '(null)'} → ${moneda} (fuente=EXPLICIT, desde ${request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'UI'})`,
        cambiosAntes: { moneda: anteriores } as any,
        cambiosDespues: { moneda } as any,
      },
    });

    return NextResponse.json({
      tenantId: updated.id,
      slug: updated.slug,
      moneda: updated.moneda,
      anteriores,
      mensaje:
        `Moneda actualizada a ${moneda}. Recarga el dashboard ejecutivo para ver los KPIs en la nueva moneda.`,
    });
  } catch (e: any) {
    console.error('[PATCH /api/tenant/moneda]', e?.message || e);
    return NextResponse.json({ error: 'Error interno al actualizar la moneda' }, { status: 500 });
  }
}, ['config:write', 'settings:write']);

/**
 * GET /api/tenant/moneda
 * Devuelve la moneda actual del tenant y la lista de monedas soportadas.
 */
export const GET = withTenantAuth(async (_request, auth) => {
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: auth.tenant!.id },
    select: { id: true, slug: true, moneda: true },
  });
  return NextResponse.json({
    tenantId: tenant?.id,
    slug: tenant?.slug,
    // Sin moneda declarada se responde el mínimo del esquema, que se define una
    // sola vez en el módulo de dinero en vez de repetirse aquí como literal.
    moneda: tenant?.moneda ?? MONEDA_MINIMA_ESQUEMA,
    soportadas: SUPPORTED_CURRENCIES,
  });
}, ['config:read', 'settings:read']);
