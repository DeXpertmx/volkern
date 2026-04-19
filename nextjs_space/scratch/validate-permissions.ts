
import { hasPermission, canViewModule, canOnlySeeOwnLeads } from '../lib/permissions';
import { getActiveModules } from '../lib/plans';

// Mock de Usuario: Sales Agent en Plan Starter (CRM Only)
const mockSalesAgent = {
  id: 'user_agent',
  roleId: 'role_sales_agent',
  tenantId: 'tenant_crm_only',
  role: {
    id: 'role_sales_agent',
    nombre: 'Sales Agent',
    permisos: {
      leads: { ver: true, crear: true, editar: true, eliminar: false },
      equipo: { ver: false, crear: false, editar: false, eliminar: false },
      configuracion: { ver: false, editar: false }
    }
  }
};

// Mock de Usuario: Admin en Plan Starter
const mockAdmin = {
  id: 'user_admin',
  roleId: 'role_admin',
  tenantId: 'tenant_crm_only',
  role: {
    id: 'role_admin',
    nombre: 'Admin',
    permisos: {
      leads: { ver: true, crear: true, editar: true, eliminar: true },
      equipo: { ver: true, crear: true, editar: true, eliminar: true },
      configuracion: { ver: true, editar: true }
    }
  }
};

async function validateAccess() {
  console.log('🛡️ INICIANDO VALIDACIÓN DE CONTROL DE ACCESOS\n');

  // 1. Validación de Módulos Activos en Plan Starter (CRM Only)
  const starterModules = await getActiveModules('starter', []);
  console.log('📦 Plan Starter (CRM Only):');
  console.log(`   - ¿Módulo Equipo Activo?: ${starterModules.includes('equipo') ? '✅ SÍ' : '❌ NO'}`);
  console.log(`   - ¿Módulo Leads Activo?: ${starterModules.includes('leads') ? '✅ SÍ' : '❌ NO'}`);
  console.log(`   - ¿Módulo Academia Activo?: ${starterModules.includes('cursos') ? '✅ SÍ (Incorrecto)' : '❌ NO (Correcto)'}`);
  console.log('');

  // 2. Validación de Permisos de Empleado (Sales Agent)
  console.log('👤 Rol: Sales Agent (Empleado):');
  console.log(`   - ¿Puede ver Leads?: ${canViewModule(mockSalesAgent as any, 'leads') ? '✅ SÍ' : '❌ NO'}`);
  console.log(`   - ¿Puede ver Equipo?: ${canViewModule(mockSalesAgent as any, 'equipo') ? '✅ SÍ' : '❌ NO'}`);
  console.log(`   - ¿Puede CREAR miembros de equipo?: ${hasPermission(mockSalesAgent as any, 'equipo', 'crear') ? '❌ ERROR (Permitido)' : '✅ BLOQUEADO'}`);
  console.log(`   - ¿Solo ve sus propios Leads?: ${canOnlySeeOwnLeads(mockSalesAgent as any) ? '✅ SÍ (Correcto)' : '❌ NO'}`);
  console.log('');

  // 3. Validación de Permisos de Admin
  console.log('🔑 Rol: Admin:');
  console.log(`   - ¿Puede gestionar Equipo?: ${hasPermission(mockAdmin as any, 'equipo', 'crear') ? '✅ SÍ' : '❌ NO'}`);
  console.log(`   - ¿Tiene acceso a Configuración?: ${canViewModule(mockAdmin as any, 'configuracion') ? '✅ SÍ' : '❌ NO'}`);
  console.log('');

  console.log('🏁 VALIDACIÓN FINALIZADA');
}

validateAccess().catch(console.error);
