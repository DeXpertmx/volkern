import { AttendanceService } from '../lib/erp/attendance-service';
import { prisma } from '../lib/db';

async function fireTestRandomPulse() {
  console.log('--- 💓 INICIANDO SIMULACRO: RANDOM PULSE (ASISTENCIA) ---');
  
  const testTenantId = `pulse_test_${Date.now()}`;
  
  // 1. Setup Data
  const tenant = await prisma.tenant.create({
    data: { id: testTenantId, nombre: 'Security Lab Volkern', slug: testTenantId }
  });

  const employee = await prisma.employee.create({
    data: { 
      tenantId: testTenantId, 
      fullName: 'Operario de Prueba', 
      email: `test_${Date.now()}@volkern.app`,
      isTeleworkAllowed: true,
      allowedTeleworkLat: 40.4168,
      allowedTeleworkLng: -3.7038
    }
  });

  const attendance = await prisma.attendance.create({
    data: {
      employeeId: employee.id,
      tenantId: testTenantId,
      type: 'IN',
      method: 'WEB',
      integrityHash: 'mock-hash'
    }
  });

  console.log(`👤 Empleado: ${employee.fullName} en turno activo.`);

  // --- ESCENARIO 1: DESAFÍO PASSED ---
  console.log('\n--- ✅ ESCENARIO 1: Respuesta rápida (PASSED) ---');
  const ch1 = await AttendanceService.triggerChallenge(attendance.id, 'RANDOM_SELFIE');
  console.log(`⏱️ Desafío '${ch1.type}' emitido. Límite: ${ch1.deadline.toISOString()}`);
  
  const res1 = await AttendanceService.resolveChallenge(ch1.id, 'PASSED', 'https://cdn.volkern.app/test/selfie_ok.jpg');
  console.log(`🛡️ Resultado: ${res1.status}`);

  // --- ESCENARIO 2: DESAFÍO FAILED (Intento de fraude) ---
  console.log('\n--- ❌ ESCENARIO 2: Fallo en validación (FAILED) ---');
  const ch2 = await AttendanceService.triggerChallenge(attendance.id, 'RANDOM_SELFIE');
  const res2 = await AttendanceService.resolveChallenge(ch2.id, 'FAILED', 'https://cdn.volkern.app/test/fake_selfie.jpg');
  console.log(`🛡️ Resultado: ${res2.status} -> Generando Incidente de Seguridad...`);

  // --- ESCENARIO 3: TIMEOUT (Sin respuesta) ---
  console.log('\n--- ⚠️ ESCENARIO 3: Expiración de tiempo (TIMEOUT) ---');
  const ch3 = await AttendanceService.triggerChallenge(attendance.id, 'QR_SYNC');
  
  // Forzamos el deadline al pasado para simular el timeout
  await prisma.attendanceChallenge.update({
    where: { id: ch3.id },
    data: { deadline: new Date(Date.now() - 1000 * 60 * 5) } // Hace 5 minutos
  });

  console.log('⏱️ Auditando Timeouts...');
  const timeoutCount = await AttendanceService.checkTimeouts(testTenantId);
  console.log(`🛡️ Desafíos expirados detectados: ${timeoutCount}`);

  // 2. Verificar Auditoría Final
  const incidents = await prisma.securityIncident.findMany({
    where: { tenantId: testTenantId },
    orderBy: { timestamp: 'desc' }
  });

  console.log('\n--- 🚨 LOG DE SEGURIDAD (The Vault 2.0) ---');
  incidents.forEach(inc => {
    console.log(`[${inc.severity}] ${inc.type}: ${inc.details}`);
  });

  console.log('\n--- 💓 SIMULACRO FINALIZADO ---');
}

fireTestRandomPulse();
