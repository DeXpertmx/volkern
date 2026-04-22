const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createCuid = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

const TENANT_ID = 'cmo09jrkc0000mf0ebul7xe9q'; // Volkern CRM
const ADMIN_USER_ID = 'cmo09jwdy0005mf67deumakl6';
const DEAL_ID = 'cmo1dbkaf000rmf0nrgx7u99e';
const EMPLOYEE_IDS = [
  { id: "cmo1dbkaw0013mf0ngdk1hlcv", userId: null, name: "Ana García" },
  { id: "cmo2quqxw0001mff9wfguiiae", userId: null, name: "Carlos Jiménez" },
  { id: "cmo2quqy50005mff9g8i935fn", userId: null, name: "Roberto Díaz" },
  { id: "clv2p3m1p0001jrnz9q6u5x6n", userId: "cmo09jwdy0005mf67deumakl6", name: "Ana García (Admin)" }
];

async function main() {
  console.log('🚀 Iniciando seeding de datos de RRHH corregido v5...');

  // 1. Crear Asistencias
  console.log('--- Creando asistencias...');
  for (const emp of EMPLOYEE_IDS) {
    for (let day = 1; day <= 10; day++) {
      const date = new Date(2026, 3, day, 9, 0, 0); 
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      await prisma.attendance.create({
        data: {
          tenantId: TENANT_ID,
          employeeId: emp.id,
          timestamp: date,
          type: 'CLOCK_IN',
          method: 'GPS_BIOMETRIC',
          integrityHash: `hash_day_${day}_${emp.id}`,
          locationLat: 40.4168,
          locationLng: -3.7038,
        }
      });
    }
  }

  // 2. Crear Beneficios Sociales
  console.log('--- Creando beneficios...');
  for (const emp of EMPLOYEE_IDS) {
    await prisma.employeeBenefit.create({
      data: {
        id: createCuid(),
        tenantId: TENANT_ID,
        employeeId: emp.id,
        concept: 'Ticket Restaurant',
        amount: 120.0,
        category: 'MEAL',
        frequency: 'MONTHLY',
        startDate: new Date(2026, 0, 1),
        active: true,
        createdBy: ADMIN_USER_ID,
        updatedAt: new Date()
      }
    });
  }

  // 3. Crear Solicitudes de Vacaciones
  console.log('--- Creando vacaciones...');
  await prisma.erp_vacation_requests.create({
    data: {
      id: createCuid(),
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_IDS[1].id,
      startDate: new Date(2026, 3, 21),
      endDate: new Date(2026, 3, 24),
      status: 'APPROVED',
      type: 'VACATION',
      reason: 'Vacaciones de primavera',
      updatedAt: new Date()
    }
  });

  // 4. Crear Comisiones
  console.log('--- Creando comisiones...');
  if (EMPLOYEE_IDS[3].userId) {
    await prisma.comision.create({
      data: {
        tenantId: TENANT_ID,
        userId: EMPLOYEE_IDS[3].userId,
        dealId: DEAL_ID,
        tipo: 'venta',
        montoCalculado: 450.0,
        estado: 'aprobada',
        fechaAprobacion: new Date(2026, 3, 15),
        metodoCalculo: '5% sobre ventas cerradas'
      }
    });
  }

  console.log('✨ Seeding de RRHH completado.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
