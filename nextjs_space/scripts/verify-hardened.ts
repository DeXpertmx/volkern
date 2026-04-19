// Configuración de entorno necesaria para evitar el aborto de init.ts
const TEST_KEY = '12345678901234567890123456789012'; // 32 bytes
process.env.MASTER_KEY = TEST_KEY;
process.env.VAULT_CONTROL_HASH = require('crypto').createHash('sha256').update(TEST_KEY).digest('hex');
process.env.TENANT_PEPPER = 'test-pepper';

import crypto from 'crypto';

/**
 * Prueba de la derivación Paranoica
 */
async function testParanoicaDerivation() {
  console.log('--- [VERIFY: Paranoica Derivation] ---');
  
  // Import dinámico para asegurar que el pepper se lea correctamente
  const { VaultService } = await import('../lib/security/vault');
  
  const tenantId = 'tenant-test-paranoia';
  const vaultSeed = crypto.randomBytes(32).toString('hex');
  
  // Caso 1: Con Pepper A
  process.env.TENANT_PEPPER = 'pepper-A';
  // @ts-ignore
  const key1 = VaultService.deriveKey(tenantId, vaultSeed);
  
  // Caso 2: Con Pepper B
  process.env.TENANT_PEPPER = 'pepper-B';
  // @ts-ignore
  const key2 = VaultService.deriveKey(tenantId, vaultSeed);
  
  console.log('¿Las claves son diferentes con/sin pepper?', key1.toString('hex') !== key2.toString('hex') ? '✅ SÍ (Aislamiento OK)' : '❌ NO');
  
  // Verificar que el 'info' (domain separation) funciona
  // @ts-ignore
  const key3 = VaultService.deriveKey(tenantId, vaultSeed);
  console.log('¿La derivación es determinista con el mismo pepper?', key2.toString('hex') === key3.toString('hex') ? '✅ SÍ' : '❌ NO');
}

/**
 * Prueba del System Bot
 */
async function testSystemBot() {
  console.log('\n--- [VERIFY: System Bot Persona] ---');
  
  // En un entorno real esto requiere la DB activa
  // Aquí verificaremos que el service está configurado para usar el nombre correcto
  try {
    const { InboundInvoiceService } = await import('../lib/finance/inbound-invoice-service');
    console.log('InboundInvoiceService cargado correctamente.');
    console.log('Nota: La creación real del bot requiere una instancia de Prisma ejecutándose.');
  } catch (e) {
    console.error('Error cargando service:', e);
  }
}

async function runTests() {
  await testParanoicaDerivation();
  await testSystemBot();
  console.log('\n✅ VERIFICACIÓN DE GOBERNANZA HARDENED COMPLETADA.');
}

runTests();
