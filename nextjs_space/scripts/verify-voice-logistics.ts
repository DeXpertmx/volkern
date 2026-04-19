import { orchestrate_asset_transfer } from './lib/skills/hr-management-skills';

const assetId = 'cmo2s03mo0007mfpmaap0ckvr';
const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';
const userId = 'cmo09jwdj0001mf67wasd6cqp';

async function verify() {
  console.log('🎙️ Simulando comando de voz: "Gemma, solicita la devolución del Kit de Sensores de Ana"');
  
  try {
    const result = await orchestrate_asset_transfer({ 
      assetId, 
      action: 'RETURN', 
      tenantId, 
      userId 
    });
    
    console.log('\n✅ Respuesta de Gemma:');
    console.log(result.text);
    console.log('\n🔒 Hash de Integridad Veri*factu generado:');
    console.log(result.integrityHash);
    
    // Verificar si se creó la alerta de sistema
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const latestAlert = await prisma.systemAlert.findFirst({
      where: { tenantId, message: { contains: '[LOGISTICS_CMD]' } },
      orderBy: { createdAt: 'desc' }
    });
    
    if (latestAlert) {
      console.log('\n📡 Registro en el Trust Protocol (SystemAlert):');
      console.log(`[${latestAlert.level}] ${latestAlert.message}`);
    }
  } catch (error) {
    console.error('❌ Error en la simulación:', error);
  }
}

verify();
