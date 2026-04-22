import { prisma } from '@/lib/db';

export const STANDARD_PLAN = [
  // Grupo 1: Financiación Básica
  { code: '100', name: 'Capital Social', type: 'PASIVO' },
  { code: '129', name: 'Resultado del Ejercicio', type: 'PASIVO' },
  
  // Grupo 4: Acreedores y Deudores
  { code: '400', name: 'Proveedores', type: 'PASIVO' },
  { code: '410', name: 'Acreedores por prestaciones de servicios', type: 'PASIVO' },
  { code: '430', name: 'Clientes', type: 'ACTIVO' },
  { code: '440', name: 'Deudores varios', type: 'ACTIVO' },
  { code: '470', name: 'Hacienda Pública, deudora por diversos conceptos', type: 'ACTIVO' },
  { code: '472', name: 'Hacienda Pública, IVA soportado', type: 'ACTIVO' },
  { code: '475', name: 'Hacienda Pública, acreedora por diversos conceptos', type: 'PASIVO' },
  { code: '4751', name: 'Hacienda Pública, acreedora por retenciones practicadas', type: 'PASIVO' },
  { code: '476', name: 'Organismos de la Seguridad Social, acreedores', type: 'PASIVO' },
  { code: '477', name: 'Hacienda Pública, IVA repercutido', type: 'PASIVO' },
  
  // Grupo 5: Cuentas Financieras
  { code: '570', name: 'Caja', type: 'ACTIVO' },
  { code: '572', name: 'Bancos e instituciones de crédito', type: 'ACTIVO' },
  
  // Grupo 6: Compras y Gastos
  { code: '600', name: 'Compras de mercaderías', type: 'GASTO' },
  { code: '621', name: 'Arrendamientos y cánones', type: 'GASTO' },
  { code: '623', name: 'Servicios de profesionales independientes', type: 'GASTO' },
  { code: '628', name: 'Suministros (Luz, agua, gas)', type: 'GASTO' },
  { code: '629', name: 'Otros servicios (Marketing, Software, etc.)', type: 'GASTO' },
  { code: '640', name: 'Sueldos y salarios', type: 'GASTO' },
  { code: '642', name: 'Seguridad Social a cargo de la empresa', type: 'GASTO' },
  
  // Grupo 7: Ventas e Ingresos
  { code: '700', name: 'Ventas de mercaderías', type: 'INGRESO' },
  { code: '705', name: 'Prestaciones de servicios', type: 'INGRESO' },
  { code: '759', name: 'Otros ingresos de gestión', type: 'INGRESO' }
];

export class AccountingInitializer {
  /**
   * Initializes the standard Chart of Accounts for a tenant.
   */
  static async initializeTenant(tenantId: string) {
    console.log(`[Accounting] Initializing Chart of Accounts for tenant: ${tenantId}`);
    
    for (const acc of STANDARD_PLAN) {
      await prisma.accountingAccount.upsert({
        where: {
          tenantId_code: {
            tenantId,
            code: acc.code
          }
        },
        update: {}, // Don't overwrite if exists
        create: {
          tenantId,
          code: acc.code,
          name: acc.name,
          type: acc.type
        }
      });
    }
    
    return true;
  }
}
