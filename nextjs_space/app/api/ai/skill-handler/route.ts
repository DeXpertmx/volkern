export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills, listSkills } from '@/lib/skills';

// Esquema de validación para el cuerpo de la petición
const SkillRequestSchema = z.object({
  action_name: z.string(),
  payload: z.record(z.any()),
  target_account_id: z.string().optional(),
});

/**
 * AI Skill Handler - Refactorizado para Multi-Tenancy
 * Ahora requiere una API Key válida del tenant en el header X-API-Key o Authorization: Bearer
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const availableSkills = listSkills();
    return NextResponse.json({
      success: true,
      manifest: {
        name: "Volkern Custom Skills",
        description: "Habilidades personalizadas para proactividad y entrenamiento",
        version: "1.0.0",
        endpoint: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/ai/skill-handler`,
        tools: availableSkills.map(s => ({
          name: s.name,
          description: s.description,
          category: s.category
        }))
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Error al listar skills' }, { status: 500 });
  }
});

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const body = await req.json();
    const result = SkillRequestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ 
        error: 'Formato de petición inválido', 
        details: result.error.format() 
      }, { status: 400 });
    }

    const { action_name, payload, target_account_id } = result.data;
    let tenantId = auth.tenant!.id;
    const userId = auth.user?.id || null;

    // --- LÓGICA DE AGENCIA: REGLA DE ORO (GOLDEN RULE) ---
    // Si hay un target_account_id, validamos que sea hijo de la agencia
    if (target_account_id && target_account_id !== tenantId) {
      const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
      const isAgency = auth.user?.accountType === 'AGENCY' || (auth.user as any)?.tenant?.accountType === 'AGENCY';

      if (!isSuperadmin && !isAgency) {
        return NextResponse.json({ error: 'Permisos insuficientes para ejecutar skills en otros tenants' }, { status: 403 });
      }

      if (!isSuperadmin) {
        // Regla de Oro: Solo se puede operar en hijos directos
        const isChild = await prisma.tenant.findFirst({
          where: { id: target_account_id, parentId: tenantId }
        });
        
        if (!isChild) {
          return NextResponse.json({ 
            error: 'Violación de jerarquía: El tenant destino no pertenece a tu agencia.' 
          }, { status: 403 });
        }
      }

      tenantId = target_account_id;
      console.log(`[Skill-Handler] Rerouting skill '${action_name}' to child tenant ${target_account_id}`);
    }

    // 2. Procesar acciones
    switch (action_name) {
      case 'save_interaction': {
        const { leadId, tipo, contenido, resultado, metadatos, creadoPor } = payload;

        if (!leadId || !tipo || !contenido) {
          return NextResponse.json({ error: 'Faltan campos obligatorios para save_interaction' }, { status: 400 });
        }

        // Verificar que el lead pertenezca al tenant (Seguridad extra)
        const lead = await prisma.lead.findFirst({
          where: { id: leadId, tenantId: tenantId }
        });

        if (!lead) {
          return NextResponse.json({ error: 'Lead no encontrado o no pertenece al tenant' }, { status: 404 });
        }

        const interaction = await prisma.interaction.create({
          data: {
            leadId,
            tenantId, // Guardamos explícitamente el tenantId
            tipo,
            contenido,
            resultado,
            metadatos: metadatos || {},
            creadoPor: creadoPor || userId || null, // Priorizamos el usuario de la API Key si existe
          } as any,
        });

        return NextResponse.json({ success: true, data: interaction });
      }

      case 'registrar_nota': {
        const { leadId, texto, sentimiento, creadoPor } = payload;

        if (!leadId || !texto) {
          return NextResponse.json({ error: 'Faltan campos leadId o texto' }, { status: 400 });
        }

        // Verificar pertenencia del lead
        const lead = await prisma.lead.findFirst({
          where: { id: leadId, tenantId: tenantId }
        });

        if (!lead) {
          return NextResponse.json({ error: 'Lead no encontrado o no pertenece al tenant' }, { status: 404 });
        }

        const nota = await prisma.note.create({
          data: {
            leadId,
            tenantId, // Guardamos explícitamente el tenantId
            contenido: texto,
            creadoPor: creadoPor || userId || null,
            metadata: {
              sentimiento: sentimiento || 'neutral',
              fuente: 'Gemma4',
              fechaIA: new Date().toISOString()
            }
          } as any
        });

        return NextResponse.json({ success: true, message: 'Nota registrada con éxito', data: nota });
      }

      case 'cambiar_etapa': {
        const { leadId, nuevaEtapa } = payload;

        if (!leadId || !nuevaEtapa) {
          return NextResponse.json({ error: 'Faltan campos leadId o nuevaEtapa' }, { status: 400 });
        }

        // El update se filtra por tenantId para asegurar aislamiento
        const leadUpdated = await prisma.lead.updateMany({
          where: { 
            id: leadId,
            tenantId: tenantId 
          },
          data: { 
            estado: nuevaEtapa,
            fechaUltimaActividad: new Date()
          }
        });

        if (leadUpdated.count === 0) {
          return NextResponse.json({ error: 'Lead no encontrado en este tenant' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: `Etapa cambiada a ${nuevaEtapa}` });
      }

      // --- ADVANCED COMPOSITE SKILLS ---

      case 'prequalify_lead': {
        const result = await (skills as any).prequalify_lead({
          tenantId,
          userId: userId || undefined,
          ...payload
        });
        return NextResponse.json(result);
      }

      case 'auto_schedule': {
        const result = await (skills as any).auto_schedule({
          tenantId,
          userId: userId || undefined,
          ...payload
        });
        return NextResponse.json(result);
      }

      case 'generate_landing_draft': {
        const result = await (skills as any).generate_landing_draft({
          tenantId,
          userId: userId || undefined,
          ...payload
        });
        return NextResponse.json(result);
      }

      // --- PROACTIVITY & TRAINING ---

      case 'detect_ghosting': {
        const result = await (skills as any).detect_ghosting(tenantId, payload.hours);
        return NextResponse.json({ success: true, data: result });
      }

      case 'generate_success_path': {
        const result = await (skills as any).generate_success_path(payload.leadId, tenantId);
        return NextResponse.json({ success: true, data: result });
      }

      case 'generate_customer_response': {
        const result = await (skills as any).generate_customer_response(
          payload.leadId, 
          tenantId, 
          payload.agentMessage, 
          payload.history
        );
        return NextResponse.json({ success: true, data: result });
      }

      case 'generate_post_mortem': {
        const result = await (skills as any).generate_post_mortem(
          payload.leadId, 
          tenantId, 
          userId || 'system', 
          payload.history
        );
        return NextResponse.json({ success: true, data: result });
      }

      default:
        return NextResponse.json({ error: `Acción '${action_name}' no soportada.` }, { status: 404 });
    }

    // --- AUDITORÍA DE USO (PHASE 2) ---
    // Registramos el uso en el tenant destino para facturación y auditoría de la agencia
    try {
      await (prisma as any).agentSkillLog.create({
        data: {
          userId: auth.user?.id || 'system',
          tenantId: tenantId, // El tenant donde ocurrió la acción
          apiKeyId: auth.apiKey?.id || null,
          toolExecuted: action_name,
          statusCode: 200,
          payloadSummary: { action: action_name, timestamp: new Date().toISOString() }
        }
      });
    } catch (logError) {
      console.error('[Skill-Handler] Failed to log usage:', logError);
    }

  } catch (error: any) {
    console.error('Error in AI Skill Handler:', error);
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      message: error.message 
    }, { status: 500 });
  }
});
