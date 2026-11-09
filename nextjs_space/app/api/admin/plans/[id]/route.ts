export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * PUT /api/admin/plans/[id]
 * Actualiza un plan de suscripción
 */
export async function PUT(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true }
    });

    if (user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await request.json();
    const {
      nombre,
      precio,
      moneda,
      limiteUsuarios,
      limiteLeads,
      limiteStorage,
      limiteCursos,
      limiteEstudiantes,
      modules, // Nuevo: Array de CrmModule ['leads', 'mensajes', etc]
      stripePriceId,
      ui_features,
      activo,
      esPublico,
      esPopular,
      ordenamiento
    } = body;

    // Obtener el plan actual para combinar el campo features JSON
    const currentPlan = await prisma.subscriptionPlan.findUnique({
      where: { id: params.id }
    });

    if (!currentPlan) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 });
    }

    // Sincronizar flags booleanos individuales para compatibilidad (basado en el array de modules)
    const hasModule = (id: string) => modules ? modules.includes(id) : undefined;

    // Actualizar el plan
    const updatedPlan = await prisma.subscriptionPlan.update({
      where: { id: params.id },
      data: {
        nombre: nombre ?? currentPlan.nombre,
        precio: precio ?? currentPlan.precio,
        moneda: moneda ?? currentPlan.moneda,
        limiteUsuarios: limiteUsuarios ?? currentPlan.limiteUsuarios,
        limiteLeads: limiteLeads ?? currentPlan.limiteLeads,
        limiteStorage: limiteStorage ?? currentPlan.limiteStorage,
        limiteCursos: limiteCursos ?? currentPlan.limiteCursos,
        limiteEstudiantes: limiteEstudiantes ?? currentPlan.limiteEstudiantes,
        
        // Sincronizar flags si se enviaron modules, de lo contrario mantener actuales
        whatsappHabilitado: modules ? (hasModule('whatsapp') || hasModule('chatbot_whatsapp')) : currentPlan.whatsappHabilitado,
        emailHabilitado: true,
        smsHabilitado: modules ? hasModule('sms') : currentPlan.smsHabilitado,
        telegramHabilitado: modules ? hasModule('telegram') : currentPlan.telegramHabilitado,
        facebookHabilitado: modules ? (hasModule('meta_integration') || hasModule('facebook')) : currentPlan.facebookHabilitado,
        instagramHabilitado: modules ? (hasModule('meta_integration') || hasModule('instagram')) : currentPlan.instagramHabilitado,
        lmsHabilitado: modules ? (hasModule('academy') || hasModule('cursos') || hasModule('estudiantes')) : currentPlan.lmsHabilitado,
        automationsHabilitado: modules ? (hasModule('automations') || hasModule('automatizaciones')) : currentPlan.automationsHabilitado,
        campaignsHabilitado: modules ? (hasModule('campanas') || hasModule('campaigns') || hasModule('email_marketing')) : currentPlan.campaignsHabilitado,
        whitelabelHabilitado: modules ? hasModule('white_label') : currentPlan.whitelabelHabilitado,
        dominioPersonalizadoHabilitado: modules ? hasModule('custom_domain') : currentPlan.dominioPersonalizadoHabilitado,
        apiAccessHabilitado: modules ? hasModule('api_access') : currentPlan.apiAccessHabilitado,
        
        activo: activo ?? currentPlan.activo,
        esPublico: esPublico ?? currentPlan.esPublico,
        esPopular: esPopular ?? currentPlan.esPopular,
        ordenamiento: ordenamiento ?? currentPlan.ordenamiento,
        features: {
          ...(currentPlan.features as any || {}),
          stripePriceId: stripePriceId ?? (currentPlan.features as any)?.stripePriceId,
          ui_features: ui_features ?? (currentPlan.features as any)?.ui_features,
          modules: modules ?? (currentPlan.features as any)?.modules, // Guardamos la lista oficial aquí
          // Guardamos una copia de los límites en el JSON por si acaso
          raw_limits: {
            users: limiteUsuarios ?? currentPlan.limiteUsuarios,
            leads: limiteLeads ?? currentPlan.limiteLeads,
            storage_gb: limiteStorage ?? currentPlan.limiteStorage,
            courses: limiteCursos ?? currentPlan.limiteCursos,
            students: limiteEstudiantes ?? currentPlan.limiteEstudiantes,
          }
        }
      }
    });

    return NextResponse.json(updatedPlan);

  } catch (error) {
    console.error('Error updating plan:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el plan' },
      { status: 500 }
    );
  }
}
