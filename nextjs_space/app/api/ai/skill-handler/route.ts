import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills, listSkills } from '@/lib/skills';

// Esquema de validación para el cuerpo de la petición
const SkillRequestSchema = z.object({
  action_name: z.string(),
  payload: z.record(z.any()),
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
    // 1. Validar cuerpo de la petición (el auth ya fue validado por el wrapper)
    const body = await req.json();
    const result = SkillRequestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ 
        error: 'Formato de petición inválido', 
        details: result.error.format() 
      }, { status: 400 });
    }

    const { action_name, payload } = result.data;
    const tenantId = auth.tenant!.id;
    const userId = auth.user?.id || null;

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
          },
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
          }
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
        const result = await skills.prequalify_lead({
          tenantId,
          userId: userId || undefined,
          ...payload
        });
        return NextResponse.json(result);
      }

      case 'auto_schedule': {
        const result = await skills.auto_schedule({
          tenantId,
          userId: userId || undefined,
          ...payload
        });
        return NextResponse.json(result);
      }

      case 'generate_landing_draft': {
        const result = await skills.generate_landing_draft({
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

  } catch (error: any) {
    console.error('Error in AI Skill Handler:', error);
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      message: error.message 
    }, { status: 500 });
  }
});
