const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = 'cmo09jrkc0000mf0ebul7xe9q';
  const userId = 'cmo09jwdy0005mf67deumakl6';

  console.log('🌱 Empezando el poblado de datos demo...');

  // 1. Limpiar datos demo previos (opcional, pero mejor para consistencia)
  // Nota: Solo contactos que tengan email de demo para no borrar datos reales.
  
  // 2. Crear Contactos con Perfiles Fiscales
  const contactData = [
    { nombre: 'García Consultores S.L.', email: 'contacto@garciasi.com', tipoIdFiscal: 'CIF', nif: 'B12345678', razonSocial: 'García Soluciones Integrales S.L.', address: 'Calle Mayor 12', city: 'Madrid', zipCode: '28001' },
    { nombre: 'TechFlow Global', email: 'billing@techflow.io', tipoIdFiscal: 'VAT', nif: 'IE9876543Z', razonSocial: 'TechFlow Global Ireland Ltd', address: 'Digital Hub, Crane St', city: 'Dublin', zipCode: 'D08' },
    { nombre: 'Inmobiliaria Arcos', email: 'ventas@arcos.es', tipoIdFiscal: 'CIF', nif: 'B87654321', razonSocial: 'Arcos Inmobiliaria y Desarrollos S.A.', address: 'Paseo de la Castellana 200', city: 'Madrid', zipCode: '28046' },
    { nombre: 'Sofía Martínez', email: 'sofia.mtz@gmail.com', tipoIdFiscal: 'NIF', nif: '12345678Z', razonSocial: 'Sofía Martínez Ruiz', address: 'Calle Luna 5', city: 'Barcelona', zipCode: '08001', tipo: 'person' },
    { nombre: 'BuildIt Constructora', email: 'admin@buildit.mx', tipoIdFiscal: 'RFC', nif: 'BUI120304ABC', razonSocial: 'BuildIt México S.A. de C.V.', address: 'Av. Reforma 500', city: 'CDMX', zipCode: '06500' }
  ];

  for (const c of contactData) {
    const contact = await prisma.contact.create({
      data: {
        tenantId,
        nombre: c.nombre,
        email: c.email,
        tipo: c.tipo || 'company',
        perfilFiscal: {
          create: {
            tenantId,
            tipoIdFiscal: c.tipoIdFiscal,
            nif: c.nif,
            razonSocial: c.razonSocial,
            address: c.address,
            city: c.city,
            zipCode: c.zipCode,
            country: c.city === 'CDMX' ? 'México' : (c.city === 'Dublin' ? 'Irlanda' : 'España'),
            defaultIva: 21.0
          }
        }
      }
    });
    console.log(`✅ Contacto creado: ${contact.nombre}`);
  }

  // 3. Crear Leads
  const leadData = [
    { nombre: 'Roberto Gómez', email: 'roberto@compuworld.com', empresa: 'CompuWorld', fuente: 'LinkedIn', estado: 'nuevo' },
    { nombre: 'Elena Rivas', email: 'elena@estudiorivas.com', empresa: 'Estudio Rivas', fuente: 'Web', estado: 'calificado' },
    { nombre: 'Marcus Aurelius', email: 'marcus@roman.tech', empresa: 'Roman Tech', fuente: 'Referido', estado: 'nuevo' },
    { nombre: 'Lucía Fernández', email: 'lucia@marketingpro.es', empresa: 'Marketing Pro', fuente: 'Google', estado: 'en_progreso' }
  ];

  for (const l of leadData) {
    const lead = await prisma.lead.create({
      data: {
        tenantId,
        nombre: l.nombre,
        email: l.email,
        empresa: l.empresa,
        fuente: l.fuente,
        estado: l.estado,
        asignadoA: userId
      }
    });
    console.log(`✅ Lead creado: ${lead.nombre}`);
  }

  // 4. Crear Deals
  const deals = [
    { titulo: 'Consultoría VeriFactu Q3', valor: 45000, etapa: 'Prospecto' },
    { titulo: 'Implementación ERP TechFlow', valor: 125000, etapa: 'Negociación' },
    { titulo: 'Licencias Volkern Pro - Inmobiliaria Arcos', valor: 12000, etapa: 'Cerrado Ganado' },
    { titulo: 'Desarrollo Skill MCP Personalizada', valor: 8500, etapa: 'Propuesta' },
    { titulo: 'Soporte Telefonía Zadarma Anual', valor: 3200, etapa: 'Calificación' }
  ];

  for (const d of deals) {
    const deal = await prisma.deal.create({
      data: {
        tenantId,
        titulo: d.titulo,
        valor: d.valor,
        etapa: d.etapa,
        usuarioAsignadoId: userId,
        probabilidad: d.etapa === 'Cerrado Ganado' ? 100 : (d.etapa === 'Negociación' ? 80 : 50)
      }
    });
    console.log(`✅ Deal creado: ${deal.titulo}`);
  }

  console.log('🚀 Poblado de datos demo completado con éxito.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
