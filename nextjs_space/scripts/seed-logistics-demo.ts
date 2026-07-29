import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q'; // Volkern CRM
  const anaId = 'cmo1dbkaw0013mf0ngdk1hlcv';
  const carlosId = 'cmo2quqxw0001mff9wfguiiae';

  console.log('🚀 Sembrando datos de demostración para Cross-Module Logistics...');

  // 1. Crear Ítems en el Catálogo con Flag de Criticidad
  const items = [
    {
      nombre: 'Kit de Sensores Avanzado (Vision-Core)',
      sku: 'W-SEN-001',
      descripcion: 'Kit completo de sensores industriales para análisis de planta.',
      precioBase: 1200,
      tipo: 'producto',
      isOperationalBlocker: true,
      tags: ['CRÍTICO', 'OPERACIONAL', 'LOGÍSTICA']
    },
    {
      nombre: 'Licencia de Software Especializada (Nexus 4.0)',
      sku: 'S-NEX-004',
      descripcion: 'Licencia de despacho para gestión de misiones críticas.',
      precioBase: 50,
      tipo: 'servicio',
      isOperationalBlocker: true,
      tags: ['CRÍTICO', 'SOFTWARE']
    },
    {
      nombre: 'Estación de Soldadura Portátil (Precision-X)',
      sku: 'W-SLD-005',
      descripcion: 'Estación de soldadura de alta precisión para reparaciones en campo.',
      precioBase: 250,
      tipo: 'producto',
      isOperationalBlocker: true,
      tags: ['CRÍTICO', 'HERRAMIENTA']
    }
  ];

  for (const item of items) {
    await prisma.catalogoItem.upsert({
      where: { tenantId_sku: { tenantId, sku: item.sku } },
      update: { isOperationalBlocker: item.isOperationalBlocker, etiquetas: item.tags } as any,
      create: { 
        tenantId,
        nombre: item.nombre,
        sku: item.sku,
        descripcion: item.descripcion,
        precioBase: item.precioBase,
        tipo: item.tipo,
        isOperationalBlocker: item.isOperationalBlocker,
        etiquetas: item.tags
      } as any
    });
  }

  // 2. Obtener los IDs creados
  const sensorItem = await prisma.catalogoItem.findFirst({ where: { tenantId, sku: 'W-SEN-001' } });
  const softwareItem = await prisma.catalogoItem.findFirst({ where: { tenantId, sku: 'S-NEX-004' } });
  const weldingItem = await prisma.catalogoItem.findFirst({ where: { tenantId, sku: 'W-SLD-005' } });

  // 3. Asignar Activos a Empleados
  // Ana tiene el Kit de Sensores y la Licencia
  if (sensorItem && softwareItem) {
    await prisma.erp_employee_assets.create({
      data: {
        tenantId,
        employeeId: anaId,
        catalogoItemId: sensorItem.id,
        serialNumber: 'SN-VCORE-9921',
        status: 'ASSIGNED',
        metadata: { critical: true, warehouse: 'Málaga' } as any
      } as any
    });

    await prisma.erp_employee_assets.create({
      data: {
        tenantId,
        employeeId: anaId,
        catalogoItemId: softwareItem.id,
        serialNumber: 'LIC-NEX-B22',
        status: 'ASSIGNED',
        metadata: { critical: true } as any
      } as any
    });
  }

  // Carlos tiene la Estación de Soldadura
  if (weldingItem) {
    await prisma.erp_employee_assets.create({
      data: {
        tenantId,
        employeeId: carlosId,
        catalogoItemId: weldingItem.id,
        serialNumber: 'SN-SLD-X-33',
        status: 'ASSIGNED',
        metadata: { critical: true, warehouse: 'Castellón' } as any
      } as any
    });
  }

  // 4. Crear Hitos de Proyecto Críticos para forzar la colisión
  // Buscamos un proyecto existente o creamos uno
  const project = await prisma.project.create({
    data: {
      tenantId,
      name: 'Misión Operativa: Despliegue Estación Base',
      status: 'PLANNING',
      budget: 15000,
      milestones: {
        create: [
          {
            tenantId,
            name: 'Calibración Final de Sensores',
            isCritical: true,
            status: 'PENDING',
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // En 5 días
          }
        ]
      }
    } as any
  });

  console.log('✅ Demo Data cargada con éxito.');
  console.log(`- Activos asignados a Ana García (ID: ${anaId})`);
  console.log(`- Hito crítico creado en el proyecto: ${project.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
