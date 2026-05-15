export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { callAssistantWithFallback } from '@/lib/assistant/openrouter-client';

export async function GET(request: NextRequest) {
  const message = request.nextUrl.searchParams.get('msg') || 'crea un contacto llamado Juan con email juan@test.com';
  
  const intentsSchema = [
    { name: 'crear_lead', description: 'Crear un nuevo lead o contacto', requiredParams: ['nombre', 'email'] },
    { name: 'buscar_lead', description: 'Buscar un lead existente', requiredParams: [] },
    { name: 'agendar_cita', description: 'Agendar una cita o reunión', requiredParams: ['email', 'fecha', 'hora'] },
    { name: 'mis_citas', description: 'Consultar citas próximas', requiredParams: [] },
    { name: 'cancelar_cita', description: 'Cancelar una cita existente', requiredParams: ['citaId'] },
    { name: 'crear_tarea', description: 'Crear una nueva tarea', requiredParams: ['titulo'] },
    { name: 'registrar_gasto', description: 'Registrar un gasto', requiredParams: ['monto', 'concepto'] },
    { name: 'consulta_general', description: 'Consulta general o saludo', requiredParams: [] },
  ];

  const intentsList = intentsSchema.map(i => 
    `- ${i.name}: ${i.description}. Parámetros requeridos: ${i.requiredParams.join(', ') || 'ninguno'}`
  ).join('\n');

  const systemPrompt = `Eres un clasificador de intenciones para Volkern CRM.

INTENCIONES DISPONIBLES:
${intentsList}

REGLAS ESTRICTAS:
1. Devuelve SOLO JSON, nada más.
2. confidence debe ser un número entre 0 y 1.
3. Si faltan parámetros requeridos, needsMoreInfo = true y lista missingParams.
4. Si todos los parámetros requeridos están presentes, needsMoreInfo = false.
5. Para mensajes ambiguos, confidence < 0.7 y usa consulta_general.
6. Extrae los parámetros del mensaje en extractedParams.
7. Para fechas relativas ("mañana", "viernes"), conviértelas a YYYY-MM-DD.

FORMATO DE RESPUESTA:
{
  "intent": "nombre_intent",
  "confidence": 0.95,
  "needsMoreInfo": false,
  "missingParams": [],
  "extractedParams": {
    "nombre": "Juan Pérez",
    "email": "juan@email.com"
  }
}
`;

  const userPrompt = `Mensaje del usuario: "${message}"\n\nClasifica la intención y extrae los parámetros.`;

  try {
    console.log(`[TestClassifier] Testing with message: "${message}"`);
    console.log(`[TestClassifier] System prompt length: ${systemPrompt.length}`);
    
    const response = await callAssistantWithFallback([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const content = response.choices[0]?.message?.content;
    console.log(`[TestClassifier] Raw AI response: "${content}"`);

    let parsed = null;
    try {
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error(`[TestClassifier] Parse error:`, e);
    }

    return NextResponse.json({
      input: message,
      rawAIResponse: content,
      parsed,
      model: response.id || 'unknown',
      usage: response.usage
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      input: message
    }, { status: 500 });
  }
}
