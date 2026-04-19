const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';
  
  // 1. Obtener datos base
  const contacts = await prisma.contact.findMany({
    where: { tenantId, tipo: 'company' },
    take: 3
  });

  const catalogItems = await prisma.catalogoItem.findMany({
    where: { tenantId },
    take: 3
  });

  const user = await prisma.user.findFirst({
    where: { email: 'bruno.hess@dimensionexpert.com' }
  });

  if (!contacts.length || !catalogItems.length) {
    console.log('❌ No hay suficientes contactos o items para generar la demo.');
    return;
  }

  console.log('🚀 Iniciando poblado de datos de venta avanzados...');

  // 2. Generar Cotizaciones
  for (let i = 0; i < 3; i++) {
    const contact = contacts[i % contacts.length];
    const item = catalogItems[i % catalogItems.length];
    const subtotal = item.precioBase * (i + 1);
    const impuestos = subtotal * 0.21;
    const total = subtotal + impuestos;

    const cotizacion = await prisma.cotizacion.create({
      data: {
        tenantId,
        numero: `COT-2026-00${i+1}`,
        titulo: `Propuesta para ${contact.nombre}`,
        clienteNombre: contact.nombre,
        clienteEmail: contact.email,
        subtotal,
        total,
        moneda: 'EUR',
        estado: i === 2 ? 'aceptada' : 'borrador',
        creadoPorId: user.id,
        items: {
          create: {
            concepto: item.nombre,
            cantidad: i + 1,
            precioUnitario: item.precioBase,
            total,
            subtotal,
            orden: 0,
            catalogoItemId: item.id
          }
        }
      }
    });
    console.log(`✅ Cotización creada: ${cotizacion.numero}`);

    // Si la cotización está aceptada, crear un contrato
    if (cotizacion.estado === 'aceptada') {
      const contrato = await prisma.contrato.create({
        data: {
          tenantId,
          numero: `CON-2026-001`,
          titulo: `Acuerdo de Servicio - ${contact.nombre}`,
          cotizacionId: cotizacion.id,
          clienteNombre: contact.nombre,
          clienteEmail: contact.email,
          subtotal,
          total,
          moneda: 'EUR',
          estado: 'activo',
          fechaInicio: new Date(),
          fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
          creadoPorId: user.id,
          items: {
            create: {
              concepto: item.nombre,
              cantidad: i + 1,
              precioUnitario: item.precioBase,
              total,
              subtotal,
              orden: 0,
              catalogoItemId: item.id
            }
          }
        }
      });
      console.log(`✅ Contrato creado: ${contrato.numero}`);

      // Crear Orden de Venta vinculada
      const orden = await prisma.ordenVenta.create({
        data: {
          tenantId,
          numero: `OV-2026-001`,
          contactId: contact.id,
          contratoId: contrato.id,
          cotizacionId: cotizacion.id,
          subtotal,
          total,
          moneda: 'EUR',
          estado: 'entregado',
          creadoPorId: user.id,
          items: {
            create: {
              concepto: item.nombre,
              cantidad: i + 1,
              precioUnitario: item.precioBase,
              total,
              subtotal,
              orden: 0,
              catalogoItemId: item.id
            }
          }
        }
      });
      console.log(`✅ Orden de Venta creada: ${orden.numero}`);
    }
  }

  console.log('✨ Proceso completado con éxito.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
