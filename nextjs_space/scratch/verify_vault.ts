import { HRService } from '../lib/erp/hr-service';
import { prisma } from '../lib/db';
import { VaultService } from '../lib/security/vault';

async function verifyVaultIntegrity() {
  console.log('--- 🛡️ INICIANDO PRUEBA DE BÓVEDA RRHH 2.0 ---');
  
  const testTenantId = 'cmnvf3t550000mfktkn1rtjzo';
  
  try {
    // 1. Crear empleado vía Servicio (Blindado)
    const emp = await HRService.createEmployee({
      tenantId: testTenantId,
      fullName: 'Operador de Pruebas',
      role: 'Industrial',
      department: 'Planta',
      salary: 2500, // €2,500.00
      contractUrl: 'https://cdn.volkern.app/contracts/test.pdf'
    });

    console.log(`✅ Empleado creado ID: ${emp.id}`);

    // 2. Consulta DIRECTA a la BD (Sin pasar por el servicio descifrador)
    const rawEmployee = await prisma.employee.findUnique({
      where: { id: emp.id }
    });

    console.log('\n--- 📂 VISTA DIRECTA EN BASE DE DATOS (POSTGRES) ---');
    console.log(`Nombre: ${rawEmployee?.fullName}`);
    console.log(`Salario en DB: ${rawEmployee?.salaryEncrypted}`);
    
    if (rawEmployee?.salaryEncrypted && rawEmployee.salaryEncrypted.includes(':')) {
      console.log('✅ RESULTADO: El dato está CIFRADO (AES-256-GCM format)');
    } else {
      console.log('❌ ERROR: El dato es legible o formato incorrecto');
    }

    // 3. Descifrado via VaultService (Auditado)
    const decryptedSalary = VaultService.decrypt(rawEmployee!.salaryEncrypted!);
    console.log(`\n--- 🔓 DESCIFRADO AUTORIZADO ---`);
    console.log(`Salario Recuperado: €${decryptedSalary}`);
    
    if (decryptedSalary === '2500') {
      console.log('✅ INTEGRIDAD: Datos recuperados correctamente.');
    }

    // Limpieza
    await prisma.employee.delete({ where: { id: emp.id } });

  } catch (error) {
    console.error('Error durante la verificación:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyVaultIntegrity();
