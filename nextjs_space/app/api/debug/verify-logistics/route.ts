export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateIntegrityHash } from '@/lib/security/integrity-service';

export async function GET(req: NextRequest) {
  const prisma = new PrismaClient();
  const assetId = 'cmo2s03mo0007mfpmaap0ckvr';
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';
  const userId = 'cmo09jwdj0001mf67wasd6cqp';

  try {
    // Usar queryRaw para saltarse el chequeo de modelos del cliente (bypass caché del dev server)
    const resultRaw: any[] = await prisma.$queryRaw`
      SELECT a.*, i.nombre as item_nombre, e."fullName" as employee_name
      FROM erp_employee_assets a
      JOIN catalogo_items i ON a."catalogoItemId" = i.id
      JOIN erp_employees e ON a."employeeId" = e.id
      WHERE a.id = ${assetId} AND a."tenantId" = ${tenantId}
    `;

    if (resultRaw.length === 0) throw new Error('Activo no encontrado en la base de datos (Raw Query)');

    const asset = resultRaw[0];

    const integrityData = {
      assetId: asset.id,
      serialNumber: asset.serialNumber,
      fromEmployee: asset.employee_name,
      action: 'RETURN',
      timestamp: new Date().toISOString()
    };
    
    const integrityHash = await generateIntegrityHash(integrityData, tenantId);

    // Registro en auditoría usando SQL directo (Respetando nombres de columnas de Prisma)
    await prisma.$executeRaw`
      INSERT INTO system_alerts (id, level, message, resolved, "createdAt")
      VALUES (
        ${'alert_' + Date.now()}, 
        'WARNING', 
        ${`[LOGISTICS_CMD] Orden de devolución emitida para ${asset.item_nombre} (S/N: ${asset.serialNumber}). Esperando confirmación GPS en Almacén.`},
        false, 
        NOW()
      )
    `;

    return NextResponse.json({
      simulated_command: "Gemma, solicita la devolución del Kit de Sensores de Ana",
      gemma_response: `Entendido. He generado la orden de devolución para el activo ${asset.item_nombre}. El técnico ha sido notificado para la entrega con VISION-LOCK.`,
      forensic_hash: integrityHash,
      trust_protocol_log: `[WARNING] [LOGISTICS_CMD] Orden de devolución emitida...`,
      raw_data_verified: true
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
