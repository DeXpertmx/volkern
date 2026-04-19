import { PrismaClient } from '@prisma/client';
import { confirm_digital_seal } from '../lib/skills/hr-management-skills';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando simulación de Firma Digital Inmutable...');
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';

  const bruno = await prisma.employee.findFirst({
    where: { tenantId, user: { role: 'OWNER' } },
    include: { user: true }
  });

  if (!bruno) {
    console.error('❌ No se encontró un usuario OWNER en este tenant.');
    return;
  }

  const userId = bruno.userId;

  try {
    const result = await confirm_digital_seal({
      tenantId,
      userId,
      documentType: 'ACTA_ENTREGA',
      context: {
        assetName: 'Kit de Sensores Avanzado (Vision-Core)',
        serialNumber: 'SN-VC-2026-001',
        from: 'Ana García',
        to: 'Carlos Jiménez'
      }
    });

    console.log('--- RESULTADO ---');
    console.log('Gemma Response:', result.text);
    console.log('Signature ID:', result.signatureId);
    console.log('Document Hash:', result.documentHash);
    console.log('------------------');

    // Verificar en la DB (Raw por si acaso)
    const sig: any[] = await (prisma as any).$queryRaw`
      SELECT * FROM erp_digital_signatures WHERE id = ${result.signatureId}
    `;

    if (sig.length > 0) {
      console.log('✅ VALIDACIÓN EXITOSA: La firma ha sido persistida en la DB.');
      console.log('Sello HMAC:', sig[0].signatureHash.substring(0, 16) + '...');
    } else {
      console.log('❌ FALLO: La firma no se encuentra en la DB.');
    }

  } catch (error: any) {
    console.error('❌ Error en la simulación:', error.message);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
