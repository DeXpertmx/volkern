import { prisma } from '../lib/db';
import { validateApiKey } from '../lib/api-key-auth';
import { NextRequest } from 'next/server';

async function main() {
  const agencyId = 'cmo0axgu30000mfux54c6mb30'; // ID de la Agencia Expert creada
  const slotId = 'cmo0axgug0004mfuxyi10zqes';   // ID del Slot Alfa creado
  const apiKey = 'vk_prod_9fb7d622a2bd0312812c63bbc328c8b2db51b97c441abb9313731cfbbb57f19b';

  console.log('🧪 Iniciando TEST DE JERARQUÍA: Skill context switching...');

  // Simulamos una request a la API de skills
  const req = new NextRequest(`http://localhost/api/ai/skill-handler?target_account_id=${slotId}`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  console.log(`📡 Llamando validateApiKey con target_account_id=${slotId}...`);
  
  const auth = await validateApiKey(req, ['agent:skill']);

  if (!auth.valid) {
    console.error('❌ Error de Autenticación:', auth.error);
    return;
  }

  console.log('✅ Autenticación y Cambio de Contexto EXITOSOS:');
  console.log(`   - Auth Method: ${auth.authMethod}`);
  console.log(`   - Agency Context detected: ${auth.agencyContext}`);
  console.log(`   - Operando en Tenant: ${auth.tenant?.nombre} (ID: ${auth.tenant?.id})`);
  console.log(`   - ¿El ID coincide con el Slot?: ${auth.tenant?.id === slotId ? 'SÍ (Correcto)' : 'NO'}`);

  if (auth.tenant?.id === slotId) {
    console.log('\n🌟 RESULTADO: El aislamiento jerárquico está operativo al 100%.');
  } else {
    console.log('\n⚠️ ADVERTENCIA: La jerarquía falló.');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
