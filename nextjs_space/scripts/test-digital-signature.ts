import { orchestrate_digital_signature } from '../lib/skills/hr-signing-skill';
import { prisma, dbContext } from '../lib/db';

async function testDigitalSignature() {
  console.log('🧪 Iniciando Test de Firma Digital (Opción C)...');

  try {
    // 1. Obtener tenant
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('No hay tenants en la DB.');

    // Asegurar que el tenant tiene vaultSeed (Requerido por la extensión vault)
    if (!tenant.vaultSeed) {
      console.log('📝 Generando vaultSeed único para el tenant de prueba...');
      tenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: { vaultSeed: `seed-${tenant.id}-${Date.now()}` }
      });
    }

    console.log('🔍 Tenant:', tenant.id, 'Seed:', tenant.vaultSeed ? 'OK' : 'MISSING');

    // 2. Crear entidades bajo el contexto de seguridad
    console.log('📝 Creando entidades con dbContext...');
    const data = await dbContext.run({ tenantId: tenant.id, vaultSeed: tenant.vaultSeed! }, async () => {
      let employee = await prisma.employee.findFirst({ where: { tenantId: tenant.id } });
      if (!employee) {
        console.log('📝 Creando empleado de prueba...');
        employee = await prisma.employee.create({
          data: {
            tenantId: tenant.id,
            fullName: 'CEO Test User',
            email: 'ceo-test@volkern.app',
            role: 'CEO',
            department: 'EXECUTIVE'
          }
        });
      }

      const vacation = await prisma.erp_vacation_requests.create({
        data: {
          tenantId: tenant.id,
          employeeId: employee.id,
          startDate: new Date(),
          endDate: new Date(),
          status: 'APPROVED',
          reason: 'Test de Firma Digital'
        }
      });
      return { employee, vacation };
    });

    console.log('✅ Solicitud de vacaciones creada:', data.vacation.id);

    // 3. Obtener un firmante real (User) para evitar violación de FK
    const signer = await prisma.user.findFirst({
      where: { tenantId: tenant.id }
    });
    const signerId = signer ? signer.id : data.employee.id; // Fallback al empleado si no hay user

    // 4. Ejecutar la habilidad de firma
    console.log('🖋️ Ejecutando orchestrate_digital_signature con signerId:', signerId);
    const result = await dbContext.run({ tenantId: tenant.id, vaultSeed: tenant.vaultSeed! }, async () => {
      return await orchestrate_digital_signature({
        tenantId: tenant.id,
        entityType: 'VACATION',
        entityId: data.vacation.id,
        signerId: signerId
      });
    });

    if (result.success) {
      console.log('⭐ ÉXITO: Documento sellado.');
      console.log('ID de Firma:', result.signatureId);
    } else {
      console.error('❌ ERROR en Skill:', result.error);
      process.exit(1);
    }

    // 4. Verificar rastro forense
    const log = await prisma.trustProtocolLog.findFirst({
      where: { 
        tenantId: tenant.id,
        category: 'HR'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (log && log.message.includes('Documento firmado')) {
      console.log('🛡️ Rastro Forense Detectado en el Integrity Graph.');
      console.log('Mensaje:', log.message);
    } else {
      console.error('❌ ERROR: No se encontró rastro forense.');
      process.exit(1);
    }

    console.log('🏁 Test Finalizado con Éxito.');
    process.exit(0);

  } catch (error) {
    console.error('💥 Error fatal durante el test:', error);
    process.exit(1);
  }
}

testDigitalSignature();
