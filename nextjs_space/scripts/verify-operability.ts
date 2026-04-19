import { ExpenseIntegrityService } from '../lib/finance/expense-integrity';
import { PayrollClosureService } from '../lib/workers/payroll-closure';
import crypto from 'crypto';

async function verifyFinanceAPI() {
  console.log('--- [VERIFY: Finance API Logic] ---');
  
  const tenantBase = { lat: 40.4168, lng: -3.7038 }; // Madrid
  const closeLocation = { lat: 40.4170, lng: -3.7040 };
  const farLocation = { lat: 41.3851, lng: 2.1734 }; // Barcelona
  
  console.log('Validando ubicación cercana...');
  const resultClose = ExpenseIntegrityService.checkLocationAnomaly(
    closeLocation.lat, closeLocation.lng, tenantBase.lat, tenantBase.lng
  );
  console.log('¿Es anomalía?', resultClose.isAnomaly ? '❌ SÍ' : '✅ NO');
  
  console.log('Validando ubicación lejana (VISION-LOCK)...');
  const resultFar = ExpenseIntegrityService.checkLocationAnomaly(
    farLocation.lat, farLocation.lng, tenantBase.lat, tenantBase.lng
  );
  console.log('¿Es anomalía?', resultFar.isAnomaly ? '✅ SÍ (VISION-LOCK detectado)' : '❌ NO');
}

async function verifyClosureCertificate() {
  console.log('\n--- [VERIFY: Closure Certificate] ---');
  
  const mockSummary = {
    tenantName: 'Volkern Industrial SA',
    employeeName: 'Juan Pérez',
    period: '04/2026',
    totalExpenses: 1250.50,
    ticketCount: 15,
    anomaliesCount: 2,
    controlHash: crypto.randomBytes(32).toString('hex'),
    payload: 'ENCRYPTED_DATA_MOCK'
  };
  
  const report = PayrollClosureService.formatClosureCertificate(mockSummary);
  console.log('Reporte Generado:');
  console.log('------------------------------------------');
  console.log(report);
  console.log('------------------------------------------');
}

async function runVerification() {
  try {
    await verifyFinanceAPI();
    await verifyClosureCertificate();
    console.log('\n✅ VERIFICACIÓN DE OPERABILIDAD COMPLETADA.');
  } catch (err) {
    console.error('❌ ERROR EN LA VERIFICACIÓN:', err);
  }
}

runVerification();
