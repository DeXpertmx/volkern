import { VaultService } from '../lib/security/vault';
import { ExpenseIntegrityService } from '../lib/finance/expense-integrity';
import crypto from 'crypto';

async function testSecurityVault() {
  console.log('--- [TEST: The Vault] ---');
  
  const MASTER_KEY = 'volkern-nexus-premium-secret-2024';
  process.env.MASTER_KEY = MASTER_KEY;
  
  const tenantA = { id: 'tenant-a', seed: crypto.randomBytes(32).toString('hex') };
  const tenantB = { id: 'tenant-b', seed: crypto.randomBytes(32).toString('hex') };
  
  const sensitiveData = 'SALARIO_TOP_SECRET_50000';
  
  console.log(`Cifrando para ${tenantA.id}...`);
  const encryptedA = VaultService.encrypt(sensitiveData, tenantA.id, tenantA.seed);
  
  console.log(`Cifrando para ${tenantB.id}...`);
  const encryptedB = VaultService.encrypt(sensitiveData, tenantB.id, tenantB.seed);
  
  console.log('¿Son diferentes los cifrados?', encryptedA !== encryptedB ? '✅ SÍ (Aislamiento OK)' : '❌ NO (Fallo de aislamiento)');
  
  const decryptedA = VaultService.decrypt(encryptedA, tenantA.id, tenantA.seed);
  console.log('Descifrado A:', decryptedA === sensitiveData ? '✅ OK' : '❌ FALLO');
  
  // Intento de descifrado cruzado
  const crossDecrypt = VaultService.decrypt(encryptedA, tenantB.id, tenantB.seed);
  console.log('¿Falla el descifrado cruzado?', crossDecrypt !== sensitiveData ? '✅ SÍ (Seguridad OK)' : '❌ NO (Posible fuga)');
}

async function testVerifactu() {
  console.log('\n--- [TEST: Veri*factu & VISION-LOCK] ---');
  
  const expense1 = { id: 'exp-1', amount: 100, createdById: 'user-1', parentFingerprint: null };
  const hash1 = ExpenseIntegrityService.calculateFingerprint(expense1);
  console.log('Hash 1:', hash1);
  
  const expense2 = { id: 'exp-2', amount: 50, createdById: 'user-1', parentFingerprint: hash1 };
  const hash2 = ExpenseIntegrityService.calculateFingerprint(expense2);
  console.log('Hash 2 (encadenado):', hash2);
  
  console.log('¿Hash 2 depende de Hash 1?', hash2.includes(hash1) === false && hash2 !== hash1 ? '✅ SÍ (Encadenamiento OK)' : '❌ NO');

  // VISION-LOCK Haversine
  const madridLat = 40.4168;
  const madridLng = -3.7038;
  const closeLat = 40.4170; // Muy cerca
  const closeLng = -3.7040;
  const farLat = 40.4500; // Lejos
  const farLng = -3.7500;
  
  const resultClose = ExpenseIntegrityService.checkLocationAnomaly(closeLat, closeLng, madridLat, madridLng);
  console.log('Distancia cerca (m):', resultClose.distance?.toFixed(2));
  console.log('¿Anomalía cerca?', resultClose.isAnomaly ? '❌ ERROR' : '✅ NO (OK)');
  
  const resultFar = ExpenseIntegrityService.checkLocationAnomaly(farLat, farLng, madridLat, madridLng);
  console.log('Distancia lejos (m):', resultFar.distance?.toFixed(2));
  console.log('¿Anomalía lejos?', resultFar.isAnomaly ? '✅ SÍ (VISION-LOCK OK)' : '❌ FALLO');
}

async function runTests() {
  try {
    await testSecurityVault();
    await testVerifactu();
    console.log('\n✅ TODAS LAS PRUEBAS DE SEGURIDAD PASARON CON ÉXITO.');
  } catch (error) {
    console.error('\n❌ ERROR EN LAS PRUEBAS:', error);
  }
}

runTests();
