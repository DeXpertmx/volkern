export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { callGemma, GemmaMessage } from '@/lib/ai/gemma-client';
import { KnowledgeService } from '@/lib/knowledge/knowledge-service';

/**
 * POST /api/guide/context - Obtener ayuda contextual
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { path, hub, query, history = [] } = body;
    const tenantId = auth.tenant!.id;

    // 1. Buscar conocimiento relevante si hay consulta
    let relevantArticles: any[] = [];
    if (query) {
      relevantArticles = await KnowledgeService.searchSemantic(tenantId, query);
    }

    // 2. Construir Prompt Contextual
    const systemPrompt = `
      Eres el Guía de Volkern, un asistente inteligente que ayuda al usuario a navegar el ERP.
      CONTEXTO ACTUAL:
      - Hub: ${hub || 'Dashboard'}
      - URL: ${path}
      - Usuario: ${auth.user!.name} (Rol: ${auth.user!.role})

      ${relevantArticles.length > 0 ? `
      CONOCIMIENTO RELEVANTE ENCONTRADO EN EL KNOWLEDGE HUB:
      ${relevantArticles.map(a => `- ${a.title}: ${a.content}`).join('\n')}
      ` : 'No se encontró información específica en el Knowledge Hub para esta consulta.'}

      INSTRUCCIONES:
      1. Sé conciso y directo.
      2. Ofrece botones de acción ("Hazlo por mí") si detectas una intención clara (ej: crear factura, buscar lead).
      3. Si el usuario está perdido, sugiere los 3 pasos más comunes para el Hub ${hub}.
      4. Si la consulta es técnica o de política, usa la información del Knowledge Hub.

      Responde en JSON para que la UI pueda renderizar Cards y Botones:
      {
        "message": "Tu respuesta aquí",
        "suggestedActions": [
          { "label": "Crear Factura", "action": "open_modal", "target": "invoice" },
          { "label": "Ver Tutorial", "action": "redirect", "target": "/dashboard/academia/intro" }
        ],
        "category": "GUIDANCE|KNOWLEDGE|ERROR_FIX"
      }
    `;

    const messages: GemmaMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((h: any) => ({ 
        role: h.role === 'user' ? 'user' : 'model', 
        content: h.content 
      })),
      { role: 'user', content: query || `Dime qué puedo hacer aquí en el Hub ${hub}.` }
    ];

    const aiRes = await callGemma(messages, { responseMimeType: 'application/json' });

    if (aiRes.error) throw new Error(aiRes.error);

    const cleaned = aiRes.content.replace(/```json/g, '').replace(/```/g, '').trim();
    const response = JSON.parse(cleaned);

    // 3. Log de interacción para telemetría
    await (KnowledgeService as any).logGuidance(tenantId, {
      userId: auth.user!.id,
      hub: hub || 'GENERIC',
      query: query || 'PATH_CONTEXT_REQUEST',
      response: response.message
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[GuideAPI] Error:', error);
    return NextResponse.json({ 
      message: "Lo siento, mi conexión con el núcleo de inteligencia está intermitente. ¿En qué puedo ayudarte manualmente?",
      suggestedActions: [
        { label: "Ver Documentación", action: "redirect", target: "/dashboard/knowledge" }
      ]
    });
  }
}, ['knowledge:read']);
