import { callWebCreatorWithFallback } from '../lib/assistant/openrouter-client';

const SYSTEM_PROMPT = `Eres el Estratega de Marca y Arquitecto de Contenidos de Volkern AI. Tu misión es generar landing pages de ALTO IMPACTO VISUAL que parezcan diseñadas por un estudio de UX/UI premium.

ESTRUCTURA JSON REQUERIDA:
{
  "pages": [{
    "frames": [{
      "component": {
        "type": "wrapper",
        "components": [
          { "type": "hero-premium", "attributes": { "data-title": "TÍTULO", "data-desc": "DESC", "data-btn-1": "CTA1", "data-btn-2": "CTA2" } },
          { "type": "features-premium", "attributes": { "data-title": "Título", "data-f1-title": "F1", "data-f1-desc": "D1", "data-f2-title": "F2", "data-f2-desc": "D2", "data-f3-title": "F3", "data-f3-desc": "D3" } },
          { "type": "volkern-lead-form", "attributes": { "data-title": "Título Form", "data-subtitle": "Sub", "data-btn-text": "Enviar" } },
          { "type": "footer-premium", "attributes": { "data-company": "Empresa", "data-tagline": "Tagline" } }
        ]
      }
    }]
  }]
}

Responde ÚNICAMENTE con el objeto JSON válido.`;

async function test() {
  console.log('🚀 Probando callWebCreatorWithFallback con prompt de Tulum...\n');
  
  const prompt = "Una landing page para un desarrollo inmobiliario de lujo en Tulum, con sección de amenidades, mapa de ubicación y formulario de contacto, tema obscuro y moderno";
  
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT + '\n\nESTILO: Elegante / Dark Mode (#A855F7)' },
    { role: 'user' as const, content: `Genera landing page para: ${prompt}. Estilo: Elegante Dark Mode. Responde SOLO JSON.` }
  ];

  try {
    const response = await callWebCreatorWithFallback(messages);
    const content = response.choices[0].message.content;
    
    console.log('✅ Respuesta recibida!\n');
    
    // Parse JSON
    let parsed: any;
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```json\n?/gi, '').replace(/```\n?$/gi, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('❌ JSON inválido:', content.substring(0, 300));
      return;
    }
    
    const components = parsed?.pages?.[0]?.frames?.[0]?.component?.components;
    if (!components) {
      console.error('❌ Estructura incorrecta, no se encontraron components');
      console.log(JSON.stringify(parsed, null, 2).substring(0, 500));
      return;
    }
    
    console.log(`📦 Bloques generados: ${components.length}`);
    components.forEach((c: any, i: number) => {
      const type = c.type || c.tagName || 'unknown';
      const title = c.attributes?.['data-title'] || c.content || '';
      console.log(`  [${i+1}] ${type}${title ? ` - "${title}"` : ''}`);
    });
    
    console.log('\n✅ Prueba exitosa! El generador funciona correctamente.');
    
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

test();
