import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedMockFinance(tenantId: string) {
  console.log(`🚀 Iniciando Mock de Datos Financieros para el Tenant: ${tenantId}...`);

  try {
    // 1. Crear Cuentas Contables Básicas si no existen
    // Usamos códigos de 6 dígitos estándar (PGC)
    const accounts = [
      { code: '430000', name: 'Clientes (Ventas Nacionales)', type: 'Activo' },
      { code: '700000', name: 'Ventas de Servicios SaaS', type: 'Ingreso' },
      { code: '477000', name: 'Hacienda Pública, IVA Repercutido', type: 'Pasivo' },
      { code: '572000', name: 'Banco Santander (Principal)', type: 'Activo' }
    ];

    console.log('--- Creando Plan de Cuentas ---');
    for (const acc of accounts) {
      await (prisma as any).accountingAccount.upsert({
        where: { tenantId_code: { tenantId, code: acc.code } },
        update: {},
        create: { ...acc, tenantId }
      });
      console.log(`✅ Cuenta ${acc.code} lista.`);
    }

    // 2. Simular Factura Emitida y su Asiento Automático
    // Importe: 1.210€ (1.000€ base + 210€ IVA)
    console.log('--- Creando Asiento de Factura ---');
    const entryDate = new Date();
    const entry = await (prisma as any).accountingEntry.create({
      data: {
        tenantId,
        date: entryDate,
        description: 'Factura #V-2026-001: Suscripción Anual Cliente Alpha',
        reference: 'INV-001',
        status: 'POSTED',
        previousHash: 'GENESIS',
        entryHash: `mock_hash_${Date.now()}`,
        lines: {
          create: [
            { accountId: (await getAcc(tenantId, '430000')).id, debit: 1210, credit: 0 },
            { accountId: (await getAcc(tenantId, '700000')).id, debit: 0, credit: 1000 },
            { accountId: (await getAcc(tenantId, '477000')).id, debit: 0, credit: 210 }
          ]
        },
        taxImpact: {
          create: {
            tenantId,
            type: 'IVA_REPERCUTIDO',
            baseAmount: 1000,
            taxRate: 21,
            taxAmount: 210,
            periodMonth: entryDate.getMonth() + 1,
            periodYear: entryDate.getFullYear()
          }
        }
      }
    });
    console.log(`✅ Asiento creado: ${entry.id}`);

    // 3. Crear Conexión Bancaria Mock
    console.log('--- Creando Conexión Bancaria ---');
    const bankConn = await (prisma as any).bankConnection.create({
      data: {
        tenantId,
        provider: 'MockProvider',
        providerId: `mock_req_${Date.now()}`,
        bankName: 'SANTANDER_ES',
        status: 'ACTIVE',
        lastSync: new Date()
      }
    });

    // 4. Crear Transacción Bancaria que debería coincidir
    // Nota: Ponemos un nombre ligeramente distinto para probar la lógica de Gemma
    console.log('--- Creando Transacción Bancaria ---');
    await (prisma as any).bankTransaction.create({
      data: {
        bankConnectionId: bankConn.id,
        date: new Date(), 
        description: 'TRANSF. RECIBIDA: FACT V-2026-001 ALPHA SA', 
        amount: 1210, 
        reference: `TXN_MOCK_${Date.now()}`,
        isReconciled: false
      }
    });

    console.log('\n✨ Escenario financiero creado con éxito:');
    console.log('  - Plan General de Cuentas básico inicializado.');
    console.log('  - 1 Asiento contable de factura registrada (1.210€).');
    console.log('  - 1 Transacción bancaria recibida pendiente (1.210€).');
    console.log('\n👉 Acción: Abre el Dashboard de Conciliación y verás la magia de Gemma.');

  } catch (error) {
    console.error('❌ Error durante el seeding:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function getAcc(tenantId: string, code: string) {
  return await (prisma as any).accountingAccount.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code } }
  });
}

// Obtener Tenant ID de argumentos de línea de comandos
const targetTenantId = process.argv[2];

if (!targetTenantId) {
  console.error('❌ Error: Debes proporcionar un Tenant ID como argumento.');
  console.log('Ejemplo: ts-node scripts/seed-finance.ts cl_12345');
  process.exit(1);
}

seedMockFinance(targetTenantId);
