/**
 * Diagnóstico de los 5 intents de insurance.
 * Llama a processMessage directamente con delay entre frases para respetar
 * el rate limit del free tier (Gemini 5 req/min) y muestra clasificación + respuesta.
 *
 * USO: npx tsx scripts/test-insurance-intents.ts
 */
import { prisma } from '../lib/db';
import { processMessage } from '../lib/chat/chatbot-service';
import { IntentClassifierAgent } from '../lib/agents/intent-classifier';

const PHRASES: { label: string; text: string }[] = [
  { label: 'crear_poliza', text: 'crea la póliza POL-001 para juan@mail.com con AXA vence 2026-12-31' },
  { label: 'mis_polizas', text: 'muéstrame las pólizas' },
  { label: 'polizas_por_vencer', text: '¿qué pólizas vencen en 30 días?' },
  { label: 'renovaciones_pendientes', text: 'qué renovaciones están pendientes' },
  { label: 'clientes_sin_contacto', text: 'qué clientes no tienen contacto hace tiempo' },
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'admin@dexpert.volkern.app' },
    select: { tenantId: true },
  });
  const tenantId = user?.tenantId;
  if (!tenantId) {
    console.log('❌ No se encontró el tenant de prueba');
    return;
  }
  console.log(`Tenant: ${tenantId}\n`);

  const classifier = new IntentClassifierAgent();

  for (const { label, text } of PHRASES) {
    console.log('========================================');
    console.log(`📨 [${label}] "${text}"`);
    try {
      const classification = await classifier.classify({
        message: text,
        userId: 'test',
        tenantId,
      });
      console.log(`🔍 CLASIFICACIÓN: intent=${classification.intent} conf=${classification.confidence.toFixed(2)} needsMoreInfo=${classification.needsMoreInfo}`);
      console.log(`   missingParams=${JSON.stringify(classification.missingParams)}`);
      console.log(`   extractedParams=${JSON.stringify(classification.extractedParams)}`);

      const result = await processMessage({
        tenantId,
        message: text,
        channel: 'api',
        metadata: { isTest: true },
      });
      console.log(`🤖 RESPUESTA: success=${result.success}`);
      console.log(`   response=${(result.response || '').slice(0, 400)}`);
      if (result.error) console.log(`   error=${result.error}`);
    } catch (e: any) {
      console.log(`❌ EXCEPCIÓN: ${e.message}`);
    }
    console.log('');
    // Esperar ~20s entre frases para no exceder el rate limit del free tier
    await delay(20000);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
