import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedRealEstate } from './seed-real-estate';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando creación de Volkern Real Estate Demo Tenant...');

  // Renombrar tenant existente si tiene el slug viejo
  await prisma.tenant.updateMany({
    where: { slug: 'volkern-real-estate' },
    data: { slug: 'vre' }
  }).catch(() => null);

  // 1. Crear/Upsert el Tenant
  const tenantSlug = 'vre';
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {
      nombre: 'Volkern Real Estate',
      subdomain: tenantSlug,
      plan: 'profesional',
      estado: 'activo',
      enabledModules: ['crm', 'volkern-sign', 'real-estate', 'leads'],
      brandingConfig: {
        primaryColor: '#0f766e', // Teal color para inmobiliaria
        logoUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=100&fit=crop',
        showPoweredBy: true
      }
    },
    create: {
      nombre: 'Volkern Real Estate',
      slug: tenantSlug,
      subdomain: tenantSlug,
      plan: 'profesional',
      estado: 'activo',
      enabledModules: ['crm', 'volkern-sign', 'real-estate', 'leads'],
      brandingConfig: {
        primaryColor: '#0f766e',
        logoUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=100&fit=crop',
        showPoweredBy: true
      }
    }
  });

  console.log(`✅ Tenant Creado/Actualizado: ${tenant.nombre} (${tenant.id})`);

  // 2. Crear los Roles para el Tenant
  console.log('🌱 Creando roles predefinidos para el tenant...');
  const ROLE_PERMISSIONS = {
    Admin: {
      leads: { ver: true, crear: true, editar: true, eliminar: true, asignar: true, exportar: true },
      citas: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
      pipeline: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, exportar: true },
      contactos: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
      empresas: { ver: true, crear: true, editar: true, eliminar: true, exportar: true },
      estudiantes: { ver: false, crear: false, editar: false, eliminar: false, inscribir: false, exportar: false },
      cursos: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
      automatizaciones: { ver: true, crear: true, editar: true, eliminar: true, activar: true, gestionar: true },
      campanas: { ver: true, crear: true, editar: true, eliminar: true, enviar: true, gestionar: true },
      mensajes: { ver: true, enviar: true, responder: true, gestionar: true },
      analytics: { ver: true, exportar: true, gestionar: true },
      configuracion: { ver: true, editar: true, gestionar: true },
      equipo: { ver: true, crear: true, editar: true, eliminar: true, invitar: true, gestionar: true },
      integraciones: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true },
      pages: { ver: true, crear: true, editar: true, eliminar: true, publicar: true, gestionar: true },
    },
    'Sales Agent': {
      leads: { ver: true, crear: true, editar: true, eliminar: false, asignar: false, exportar: false },
      citas: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
      pipeline: { ver: true, crear: true, editar: true, eliminar: false, gestionar: false, exportar: false },
      contactos: { ver: true, crear: true, editar: true, eliminar: false, exportar: false },
      empresas: { ver: true, crear: true, editar: true, eliminar: false, exportar: false },
      estudiantes: { ver: false, crear: false, editar: false, eliminar: false, inscribir: false, exportar: false },
      cursos: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
      automatizaciones: { ver: false, crear: false, editar: false, eliminar: false, activar: false, gestionar: false },
      campanas: { ver: false, crear: false, editar: false, eliminar: false, enviar: false, gestionar: false },
      mensajes: { ver: true, enviar: true, responder: true, gestionar: false },
      analytics: { ver: true, exportar: false, gestionar: false },
      configuracion: { ver: false, editar: false, gestionar: false },
      equipo: { ver: false, crear: false, editar: false, eliminar: false, invitar: false, gestionar: false },
      integraciones: { ver: false, crear: false, editar: false, eliminar: false, gestionar: false },
      pages: { ver: false, crear: false, editar: false, eliminar: false, publicar: false, gestionar: false },
    }
  };

  const roles: Record<string, any> = {};
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    let role = await prisma.role.findFirst({
      where: { tenantId: tenant.id, nombre: roleName }
    });

    if (role) {
      role = await prisma.role.update({
        where: { id: role.id },
        data: { permisos: permissions }
      });
    } else {
      role = await prisma.role.create({
        data: {
          tenantId: tenant.id,
          nombre: roleName,
          descripcion: `Rol predefinido ${roleName} para la demo inmobiliaria`,
          permisos: permissions,
          esPersonalizado: false
        }
      });
    }
    roles[roleName] = role;
    console.log(`   ✓ Rol ${roleName} asegurado.`);
  }

  // 3. Crear/Actualizar Usuarios de Demo
  console.log('👥 Creando usuarios de demo...');
  const hashedPassword = await bcrypt.hash('VolkernDemo2026!', 12);

  // Admin Inmobiliario
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin.re@volkern.com' },
    update: {
      name: 'Carlos Mendoza (Director RE)',
      tenantId: tenant.id,
      roleId: roles['Admin'].id,
    },
    create: {
      name: 'Carlos Mendoza (Director RE)',
      email: 'admin.re@volkern.com',
      password: hashedPassword,
      tenantId: tenant.id,
      roleId: roles['Admin'].id,
      estado: 'activo'
    }
  });

  // Empleado Admin
  await prisma.employee.upsert({
    where: { userId: adminUser.id },
    update: {
      fullName: 'Carlos Mendoza',
      tenantId: tenant.id,
      jobTitle: 'Director General',
      department: 'Ventas',
    },
    create: {
      fullName: 'Carlos Mendoza',
      email: 'admin.re@volkern.com',
      tenantId: tenant.id,
      jobTitle: 'Director General',
      department: 'Ventas',
      isActive: true,
      userId: adminUser.id
    }
  });

  // Agente de Ventas
  const agentUser = await prisma.user.upsert({
    where: { email: 'agent.re@volkern.com' },
    update: {
      name: 'Lucía Santos (Agente)',
      tenantId: tenant.id,
      roleId: roles['Sales Agent'].id,
    },
    create: {
      name: 'Lucía Santos (Agente)',
      email: 'agent.re@volkern.com',
      password: hashedPassword,
      tenantId: tenant.id,
      roleId: roles['Sales Agent'].id,
      estado: 'activo'
    }
  });

  // Empleado Agente
  await prisma.employee.upsert({
    where: { userId: agentUser.id },
    update: {
      fullName: 'Lucía Santos',
      tenantId: tenant.id,
      jobTitle: 'Agente Inmobiliario Senior',
      department: 'Ventas',
    },
    create: {
      fullName: 'Lucía Santos',
      email: 'agent.re@volkern.com',
      tenantId: tenant.id,
      jobTitle: 'Agente Inmobiliario Senior',
      department: 'Ventas',
      isActive: true,
      userId: agentUser.id
    }
  });

  console.log('   ✓ Usuarios de demo (admin.re@volkern.com y agent.re@volkern.com) creados con contraseña: VolkernDemo2026!');

  // 4. Sembrar Propiedades del Módulo Inmobiliario
  console.log('🏠 Sembrando propiedades y campos inmobiliarios...');
  await seedRealEstate(tenant.id);

  // 5. Crear Pipelines y Stages personalizados para Inmobiliaria
  console.log('📈 Configurando Pipelines de ventas y alquileres...');

  // Pipeline de Ventas
  const pipelineVentas = await prisma.pipeline.upsert({
    where: {
      tenantId_nombre: {
        tenantId: tenant.id,
        nombre: 'Venta de Inmuebles'
      }
    },
    update: { activo: true },
    create: {
      tenantId: tenant.id,
      nombre: 'Venta de Inmuebles',
      categoria: 'ventas',
      descripcion: 'Pipeline para el seguimiento comercial de venta de propiedades',
      color: '#0f766e',
      icono: '🏠'
    }
  });

  const stagesVentas = [
    { nombre: 'Nuevo Prospecto', orden: 1, probabilidad: 10 },
    { nombre: 'Contacto Inicial', orden: 2, probabilidad: 20 },
    { nombre: 'Visita Programada', orden: 3, probabilidad: 40 },
    { nombre: 'Propuesta / Oferta', orden: 4, probabilidad: 60 },
    { nombre: 'Contrato y Cierre', orden: 5, probabilidad: 80 },
    { nombre: 'Vendido (Ganado)', orden: 6, probabilidad: 100, esEtapaFinal: true, tipoEtapaFinal: 'WON' },
    { nombre: 'Desestimado (Perdido)', orden: 7, probabilidad: 0, esEtapaFinal: true, tipoEtapaFinal: 'LOST' }
  ];

  const stageVentasMap: Record<string, string> = {};
  for (const st of stagesVentas) {
    const stage = await prisma.pipelineStage.create({
      data: {
        tenantId: tenant.id,
        pipelineId: pipelineVentas.id,
        nombre: st.nombre,
        orden: st.orden,
        probabilidad: st.probabilidad,
        esEtapaFinal: st.esEtapaFinal || false,
        tipoEtapaFinal: st.tipoEtapaFinal || null,
        categoria: 'ventas'
      }
    });
    stageVentasMap[st.nombre] = stage.id;
  }

  // Pipeline de Alquileres
  const pipelineAlquiler = await prisma.pipeline.upsert({
    where: {
      tenantId_nombre: {
        tenantId: tenant.id,
        nombre: 'Alquiler de Inmuebles'
      }
    },
    update: { activo: true },
    create: {
      tenantId: tenant.id,
      nombre: 'Alquiler de Inmuebles',
      categoria: 'alquiler',
      descripcion: 'Pipeline para control de alquileres y arrendamientos',
      color: '#0284c7',
      icono: '🔑'
    }
  });

  const stagesAlquiler = [
    { nombre: 'Interesado', orden: 1, probabilidad: 15 },
    { nombre: 'Documentación Entregada', orden: 2, probabilidad: 30 },
    { nombre: 'Visita Realizada', orden: 3, probabilidad: 50 },
    { nombre: 'Aprobación Propietario', orden: 4, probabilidad: 75 },
    { nombre: 'Alquilado (Ganado)', orden: 5, probabilidad: 100, esEtapaFinal: true, tipoEtapaFinal: 'WON' },
    { nombre: 'Rechazado (Perdido)', orden: 6, probabilidad: 0, esEtapaFinal: true, tipoEtapaFinal: 'LOST' }
  ];

  const stageAlquilerMap: Record<string, string> = {};
  for (const st of stagesAlquiler) {
    const stage = await prisma.pipelineStage.create({
      data: {
        tenantId: tenant.id,
        pipelineId: pipelineAlquiler.id,
        nombre: st.nombre,
        orden: st.orden,
        probabilidad: st.probabilidad,
        esEtapaFinal: st.esEtapaFinal || false,
        tipoEtapaFinal: st.tipoEtapaFinal || null,
        categoria: 'alquiler'
      }
    });
    stageAlquilerMap[st.nombre] = stage.id;
  }

  console.log('   ✓ Pipelines y etapas creados exitosamente.');

  // 6. Crear Contactos e Inyectar Leads de Demo
  console.log('👤 Creando Leads e Historial de Contacto...');

  const leadData = [
    {
      id: 'lead-re-1',
      nombre: 'Sofía Martínez',
      email: 'sofia.martinez@demo-volkern.com',
      telefono: '+34 612 345 678',
      notas: 'Interesada en el Ático de lujo en el centro de Madrid (Gran Vía 42). Solicita videollamada de presentación y planos detallados.',
      estado: 'contactado',
    },
    {
      id: 'lead-re-2',
      nombre: 'Mateo Silva',
      email: 'mateo.silva@demo-volkern.com',
      telefono: '+34 698 765 432',
      notas: 'Busca villa unifamiliar de alta gama en La Moraleja. Quiere piscina privada y mínimo 5 habitaciones. Presupuesto aproximado 1.5M€.',
      estado: 'nuevo',
    },
    {
      id: 'lead-re-3',
      nombre: 'Lucía Fernández',
      email: 'lucia.fernandez@demo-volkern.com',
      telefono: '+34 654 321 098',
      notas: 'Busca un local comercial o piso en alquiler por zona céntrica (Malasaña / Chamberí) para abrir una boutique.',
      estado: 'nuevo',
    }
  ];

  const createdLeads = [];
  for (const ld of leadData) {
    const lead = await prisma.lead.upsert({
      where: { id: ld.id },
      update: {
        tenantId: tenant.id,
        nombre: ld.nombre,
        email: ld.email,
        telefono: ld.telefono,
        notas: ld.notas,
        estado: ld.estado,
        asignadoA: agentUser.id
      },
      create: {
        id: ld.id,
        tenantId: tenant.id,
        nombre: ld.nombre,
        email: ld.email,
        telefono: ld.telefono,
        notas: ld.notas,
        estado: ld.estado,
        asignadoA: agentUser.id
      }
    });
    createdLeads.push(lead);

    // Crear contacto respectivo
    await prisma.contact.upsert({
      where: { id: `contact-${ld.id}` },
      update: {
        tenantId: tenant.id,
        nombre: ld.nombre,
        email: ld.email,
        telefono: ld.telefono,
        tipo: 'CLIENTE',
        notas: ld.notas
      },
      create: {
        id: `contact-${ld.id}`,
        tenantId: tenant.id,
        nombre: ld.nombre,
        email: ld.email,
        telefono: ld.telefono,
        tipo: 'CLIENTE',
        notas: ld.notas
      }
    });
  }

  console.log('   ✓ Leads y Contactos vinculados.');

  // 7. Crear Oportunidades (Deals) vinculadas a Propiedades y Pipelines
  console.log('💼 Creando Oportunidades de Negociación vinculadas a inmuebles...');

  // Buscar las propiedades creadas dinámicamente para obtener sus IDs reales
  const propiedadAtico = await prisma.catalogoItem.findFirst({
    where: { tenantId: tenant.id, nombre: { contains: 'Ático de lujo' } }
  });
  const propiedadCasa = await prisma.catalogoItem.findFirst({
    where: { tenantId: tenant.id, nombre: { contains: 'Casa unifamiliar' } }
  });
  const propiedadAlquiler = await prisma.catalogoItem.findFirst({
    where: { tenantId: tenant.id, nombre: { contains: 'Malasaña' } }
  });

  if (!propiedadAtico || !propiedadCasa || !propiedadAlquiler) {
    console.warn('⚠️ Advertencia: No se encontraron algunas propiedades en el catálogo para vincular deals.');
  }

  // Deal 1: Sofía Martínez - Ático de lujo en Madrid
  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-re-1',
      contactId: 'contact-lead-re-1',
      titulo: 'Sofía Martínez — Compra Ático Gran Vía',
      descripcion: 'Interés directo en comprar el Ático de lujo. Agenda programada de visita presencial.',
      valor: 895000,
      moneda: 'EUR',
      etapa: stageVentasMap['Visita Programada'],
      pipelineId: pipelineVentas.id,
      probabilidad: 40,
      estado: 'activo',
      usuarioAsignadoId: agentUser.id,
      catalogoItemId: propiedadAtico?.id || null,
      prioridad: 'alta'
    }
  });

  // Deal 2: Mateo Silva - Villa en La Moraleja
  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-re-2',
      contactId: 'contact-lead-re-2',
      titulo: 'Mateo Silva — Adquisición Villa La Moraleja',
      descripcion: 'Prospección inicial para villa en La Moraleja. Se enviará dossier de propiedades disponibles.',
      valor: 1650000,
      moneda: 'EUR',
      etapa: stageVentasMap['Contacto Inicial'],
      pipelineId: pipelineVentas.id,
      probabilidad: 20,
      estado: 'activo',
      usuarioAsignadoId: agentUser.id,
      catalogoItemId: propiedadCasa?.id || null,
      prioridad: 'muy_alta'
    }
  });

  // Deal 3: Lucía Fernández - Alquiler Piso Malasaña
  await prisma.deal.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-re-3',
      contactId: 'contact-lead-re-3',
      titulo: 'Lucía Fernández — Alquiler Malasaña Boutique',
      descripcion: 'Interesada en el local/piso en alquiler de Malasaña. Documentación financiera recibida para scoring de solvencia.',
      valor: 950,
      moneda: 'EUR',
      etapa: stageAlquilerMap['Documentación Entregada'],
      pipelineId: pipelineAlquiler.id,
      probabilidad: 30,
      estado: 'activo',
      usuarioAsignadoId: agentUser.id,
      catalogoItemId: propiedadAlquiler?.id || null,
      prioridad: 'media'
    }
  });

  console.log('   ✓ Negociaciones creadas y vinculadas con propiedades.');

  // 8. Crear Citas y Reuniones de demo
  console.log('📅 Programando citas de agenda...');
  const ahora = new Date();
  const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  manana.setHours(11, 0, 0, 0);

  const enDosDias = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);
  enDosDias.setHours(16, 30, 0, 0);

  // Cita 1: Visita al Ático
  await prisma.cita.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-re-1',
      contactId: 'contact-lead-re-1',
      tipo: 'visita',
      titulo: 'Visita de Propiedad: Ático Gran Vía',
      descripcion: 'Mostrar terraza privada de 60m², acabados de la cocina y el vestidor principal.',
      ubicacion: 'Gran Vía 42, Madrid Centro',
      fechaHora: manana,
      duracion: 60,
      estado: 'confirmada',
      catalogoItemId: propiedadAtico?.id || null
    }
  });

  // Cita 2: Llamada con Mateo Silva
  await prisma.cita.create({
    data: {
      tenantId: tenant.id,
      leadId: 'lead-re-2',
      contactId: 'contact-lead-re-2',
      tipo: 'llamada',
      titulo: 'Llamada de Requerimientos: Mateo Silva',
      descripcion: 'Conversar sobre especificaciones exactas para villa en La Moraleja y coordinar visitas a obra.',
      fechaHora: enDosDias,
      duracion: 30,
      estado: 'pendiente'
    }
  });

  console.log('   ✓ Citas creadas en la agenda.');

  console.log('\n✨ INYECCIÓN DE DATOS DE BIENES RAÍCES COMPLETADA CON ÉXITO');
  console.log('-----------------------------------------------------------');
  console.log(`Tenant Name:  ${tenant.nombre}`);
  console.log(`Tenant Slug:  ${tenant.slug}`);
  console.log(`Tenant ID:    ${tenant.id}`);
  console.log(`Admin User:   admin.re@volkern.com (Password: VolkernDemo2026!)`);
  console.log(`Agent User:   agent.re@volkern.com (Password: VolkernDemo2026!)`);
  console.log('-----------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Error inyectando datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
