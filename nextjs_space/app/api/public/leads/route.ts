export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma, globalPrisma } from '@/lib/db';
import { eventBus, EVENTS } from '@/lib/skills/event-bus';
import { TelegramWatchdog } from '@/lib/security/telegram-watchdog';

/**
 * POST /api/public/leads
 * Captura leads desde la landing page principal y los integra al ecosistema Volkern.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, name, empresa, rol, necesidad, fuente = 'landing_page' } = body;

    if (!email) {
      return NextResponse.json({ error: 'El email es obligatorio' }, { status: 400 });
    }

    // 1. Identificar el Tenant Maestro (Volkern)
    const masterTenant = await globalPrisma.tenant.findUnique({
      where: { slug: 'volkern' },
      select: { id: true }
    });

    if (!masterTenant) {
      // Fallback si no existe el slug 'volkern', buscamos el primer tenant o usamos uno por defecto
      console.warn('[Public Leads] Master tenant "volkern" not found. Falling back.');
    }

    const targetTenantId = masterTenant?.id || 'master';

    // 2. Crear el Lead en la base de datos
    // Nota: Usamos prisma (proxy) para que se guarde en el contexto correcto si es necesario,
    // pero aquí al ser la landing principal, solemos guardar en el Tenant de la Agencia/Empresa que opera Volkern.
    const lead = await prisma.lead.create({
      data: {
        email,
        nombre: name || email.split('@')[0],
        empresa: empresa || null,
        cargo: rol || null,
        notas: necesidad || null,
        fuente,
        tenantId: targetTenantId,
        estado: 'nuevo',
        metadataExterna: {
          captured_at: new Date().toISOString(),
          ip: req.headers.get('x-forwarded-for') || 'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown'
        }
      }
    });

    // 3. Disparar evento al Marketing Event Bridge
    // Esto activará secuencias de AutomationRuleEngine (secuencia de Nurturing)
    eventBus.emitEvent(EVENTS.LEAD_CREATED, {
      tenantId: targetTenantId,
      leadId: lead.id,
      email: lead.email,
      source: fuente,
      timestamp: new Date()
    } as any);

    // 4. Notificación inmediata vía Telegram Watchdog
    await TelegramWatchdog.sendLeadAlert(targetTenantId, {
      name: lead.nombre,
      email: lead.email,
      source: fuente
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Lead capturado e integrado con éxito',
      leadId: lead.id 
    });

  } catch (error: any) {
    console.error('[Public Leads] Error capturando lead:', error);
    return NextResponse.json({ 
      error: 'Error interno al procesar la solicitud',
      details: error.message 
    }, { status: 500 });
  }
}
