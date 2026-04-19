import { prisma } from '../lib/db';
import { addDays, startOfMonth } from 'date-fns';

async function seed() {
  const tenantId = 'cmo1jrkc0000mf0ebul7xe9q'; // ID de tenant de prueba
  const employeeId = 'clx123abc'; // ID de Ana García
  
  console.log('--- SEEDING PAYROLL TEST DATA ---');

  // 1. Limpiar asistencias previas de este mes para el test
  const now = new Date();
  const start = startOfMonth(now);
  
  await prisma.attendance.deleteMany({
    where: {
      employeeId,
      timestamp: { gte: start }
    }
  });

  // 2. Crear asistencias para los primeros 5 días laborables
  // Dejaremos el día 6 y 7 (que no sean fin de semana) sin fichar para simular FALTAS
  for (let i = 0; i < 5; i++) {
    const day = addDays(start, i);
    await prisma.attendance.create({
      data: {
        employeeId,
        tenantId,
        type: 'CLOCK_IN',
        timestamp: new Date(day.setHours(9, 0, 0, 0)),
        method: 'QR_SCAN',
        locationLat: 40.4168,
        locationLng: -3.7038,
        integrityHash: `test_hash_${i}`
      }
    });
    console.log(`Fichaje creado para el día ${day.getDate()}`);
  }

  console.log('Test logic: Días 6 y 7 serán considerados FALTAS (si son laborables).');
  console.log('Seed completado. Abre el Payroll Vault para verificar.');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
