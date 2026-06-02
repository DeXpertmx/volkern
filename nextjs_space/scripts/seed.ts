
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seedRealEstate } from './seed-real-estate'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...')

  // Obtener tenant y rol por defecto
  const defaultTenant = await prisma.tenant.findFirst({
    where: { slug: 'volkern-default' },
  });

  if (!defaultTenant) {
    console.error('❌ Tenant predeterminado no encontrado. Ejecuta primero: yarn tsx scripts/migrate-multi-tenancy.ts');
    process.exit(1);
  }

  const adminRole = await prisma.role.findFirst({
    where: {
      nombre: 'Admin',
      tenantId: defaultTenant.id,
    },
  });

  if (!adminRole) {
    console.error('❌ Rol Admin no encontrado');
    process.exit(1);
  }

  const superadminRole = await prisma.role.findFirst({
    where: {
      nombre: 'Superadmin',
      tenantId: defaultTenant.id,
    },
  });

  if (!superadminRole) {
    console.error('❌ Rol Superadmin no encontrado');
    process.exit(1);
  }

  // Crear usuario administrador
  const hashedPassword = await bcrypt.hash('johndoe123', 12)
  const hashedPasswordAdmin = await bcrypt.hash('volkern123456', 12)
  const hashedPasswordSuperadmin = await bcrypt.hash('Volkern-admin2025', 12)

  // Usuario Superadmin - Acceso total
  await prisma.user.upsert({
    where: { email: 'bruno.hess@dimensionexpert.com' },
    update: {
      password: hashedPasswordSuperadmin,
      name: 'Bruno Hess',
    },
    create: {
      name: 'Bruno Hess',
      email: 'bruno.hess@dimensionexpert.com',
      password: hashedPasswordSuperadmin,
      tenantId: defaultTenant.id,
      roleId: superadminRole.id,
    },
  })

  console.log('✅ Usuario Superadmin creado')

  // Usuario admin de prueba (hidden)
  await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      name: 'Administrador Test',
      email: 'john@doe.com',
      password: hashedPassword,
      tenantId: defaultTenant.id,
      roleId: adminRole.id,
    },
  })

  // Usuario admin principal
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@volkern.com' },
    update: {},
    create: {
      name: 'Administrador Volkern',
      email: 'admin@volkern.com',
      password: hashedPasswordAdmin,
      tenantId: defaultTenant.id,
      roleId: adminRole.id,
    },
  })

  console.log('✅ Usuarios administradores creados')

  // Crear servicios de ejemplo
  const servicios = await Promise.all([
    prisma.servicio.upsert({
      where: { id: 'servicio-1' },
      update: {},
      create: {
        id: 'servicio-1',
        nombre: 'Consultoría 1:1 - 60 min',
        descripcion: 'Sesión de consultoría personalizada de 60 minutos para resolver dudas específicas sobre tu negocio digital.',
        duracionMinutos: 60,
        precio: 150.00,
        moneda: 'USD',
        activo: true,
      },
    }),
    prisma.servicio.upsert({
      where: { id: 'servicio-2' },
      update: {},
      create: {
        id: 'servicio-2',
        nombre: 'Revisión de Estrategia - 90 min',
        descripcion: 'Análisis completo de tu estrategia actual y recomendaciones de mejora.',
        duracionMinutos: 90,
        precio: 250.00,
        moneda: 'USD',
        activo: true,
      },
    }),
    prisma.servicio.upsert({
      where: { id: 'servicio-3' },
      update: {},
      create: {
        id: 'servicio-3',
        nombre: 'Sesión Express - 30 min',
        descripcion: 'Consulta rápida para resolver dudas puntuales.',
        duracionMinutos: 30,
        precio: 75.00,
        moneda: 'USD',
        activo: true,
      },
    }),
  ])

  console.log('✅ Servicios creados')

  // Crear leads de ejemplo
  const leads = await Promise.all([
    prisma.lead.upsert({
      where: { id: 'lead-1' },
      update: {},
      create: {
        id: 'lead-1',
        nombre: 'María González',
        email: 'maria@ejemplo.com',
        telefono: '+52 555 123 4567',
        notas: 'Interesada en consultoría para su negocio de coaching',
        estado: 'nuevo',
      },
    }),
    prisma.lead.upsert({
      where: { id: 'lead-2' },
      update: {},
      create: {
        id: 'lead-2',
        nombre: 'Carlos Rodríguez',
        email: 'carlos@ejemplo.com',
        telefono: '+34 600 987 654',
        notas: 'Quiere ayuda con automatización de ventas',
        estado: 'contactado',
      },
    }),
    prisma.lead.upsert({
      where: { id: 'lead-3' },
      update: {},
      create: {
        id: 'lead-3',
        nombre: 'Ana Silva',
        email: 'ana@ejemplo.com',
        telefono: '+57 300 456 789',
        notas: 'Busca escalar su agencia digital',
        estado: 'convertido',
      },
    }),
    prisma.lead.upsert({
      where: { id: 'lead-4' },
      update: {},
      create: {
        id: 'lead-4',
        nombre: 'Roberto Lima',
        email: 'roberto@ejemplo.com',
        telefono: '+351 912 345 678',
        notas: 'Emprendedor digital, necesita orientación',
        estado: 'nuevo',
      },
    }),
  ])

  console.log('✅ Leads creados')

  // Crear citas de ejemplo
  const ahora = new Date()
  const manana = new Date(ahora)
  manana.setDate(ahora.getDate() + 1)
  manana.setHours(10, 0, 0, 0)

  const pasadoManana = new Date(ahora)
  pasadoManana.setDate(ahora.getDate() + 2)
  pasadoManana.setHours(15, 30, 0, 0)

  const enTresDias = new Date(ahora)
  enTresDias.setDate(ahora.getDate() + 3)
  enTresDias.setHours(11, 0, 0, 0)

  const citas = await Promise.all([
    prisma.cita.upsert({
      where: { id: 'cita-1' },
      update: {},
      create: {
        id: 'cita-1',
        leadId: 'lead-2',
        servicioId: 'servicio-1',
        fechaHora: manana,
        estado: 'confirmada',
      },
    }),
    prisma.cita.upsert({
      where: { id: 'cita-2' },
      update: {},
      create: {
        id: 'cita-2',
        leadId: 'lead-3',
        servicioId: 'servicio-2',
        fechaHora: pasadoManana,
        estado: 'pagada',
        montoPagado: 250.00,
        stripePaymentId: 'pi_ejemplo_123456',
      },
    }),
    prisma.cita.upsert({
      where: { id: 'cita-3' },
      update: {},
      create: {
        id: 'cita-3',
        leadId: 'lead-4',
        servicioId: 'servicio-3',
        fechaHora: enTresDias,
        estado: 'pendiente',
      },
    }),
  ])

  console.log('✅ Citas creadas')

  // Crear configuraciones por defecto para el tenant
  const configuraciones = await Promise.all([
    prisma.configuracion.upsert({
      where: { 
        tenantId_clave: {
          tenantId: defaultTenant.id,
          clave: 'admin_email',
        }
      },
      update: {},
      create: {
        tenantId: defaultTenant.id,
        clave: 'admin_email',
        valor: 'admin@volkern.com',
      },
    }),
    prisma.configuracion.upsert({
      where: { 
        tenantId_clave: {
          tenantId: defaultTenant.id,
          clave: 'business_name',
        }
      },
      update: {},
      create: {
        tenantId: defaultTenant.id,
        clave: 'business_name',
        valor: 'Volkern CRM',
      },
    }),
    prisma.configuracion.upsert({
      where: { 
        tenantId_clave: {
          tenantId: defaultTenant.id,
          clave: 'timezone',
        }
      },
      update: {},
      create: {
        tenantId: defaultTenant.id,
        clave: 'timezone',
        valor: 'America/Mexico_City',
      },
    }),
    prisma.configuracion.upsert({
      where: { 
        tenantId_clave: {
          tenantId: defaultTenant.id,
          clave: 'working_hours',
        }
      },
      update: {},
      create: {
        tenantId: defaultTenant.id,
        clave: 'working_hours',
        valor: JSON.stringify({
          lunes: { inicio: '09:00', fin: '17:00', activo: true },
          martes: { inicio: '09:00', fin: '17:00', activo: true },
          miercoles: { inicio: '09:00', fin: '17:00', activo: true },
          jueves: { inicio: '09:00', fin: '17:00', activo: true },
          viernes: { inicio: '09:00', fin: '17:00', activo: true },
          sabado: { inicio: '10:00', fin: '14:00', activo: false },
          domingo: { inicio: '10:00', fin: '14:00', activo: false },
        }),
      },
    }),
  ])

  console.log('✅ Configuraciones creadas')

  // Crear estudiantes de ejemplo
  const estudiante1 = await prisma.estudiante.findFirst({
    where: {
      email: 'maria.garcia@ejemplo.com',
      tenantId: defaultTenant.id,
    },
  }) || await prisma.estudiante.create({
    data: {
      nombre: 'María García',
      email: 'maria.garcia@ejemplo.com',
      telefono: '+52 555 1234 5678',
      tenantId: defaultTenant.id,
    },
  });

  const estudiante2 = await prisma.estudiante.findFirst({
    where: {
      email: 'carlos.lopez@ejemplo.com',
      tenantId: defaultTenant.id,
    },
  }) || await prisma.estudiante.create({
    data: {
      nombre: 'Carlos López',
      email: 'carlos.lopez@ejemplo.com',
      telefono: '+52 555 9876 5432',
      tenantId: defaultTenant.id,
    },
  });

  const estudiantes = [estudiante1, estudiante2];

  console.log('✅ Estudiantes creados')

  // Crear cursos de ejemplo
  const curso1 = await prisma.curso.upsert({
    where: { id: 'curso-1' },
    update: {},
    create: {
      id: 'curso-1',
      titulo: 'Marketing Digital desde Cero',
      descripcion: 'Aprende las bases del marketing digital: SEO, SEM, redes sociales y email marketing.',
      precio: 499.00,
      moneda: 'MXN',
      duracionEstimadaHoras: 8,
      nivel: 'principiante',
      publicado: true,
    },
  })

  const curso2 = await prisma.curso.upsert({
    where: { id: 'curso-2' },
    update: {},
    create: {
      id: 'curso-2',
      titulo: 'Coaching para Emprendedores',
      descripcion: 'Desarrolla tu mindset emprendedor y aprende a escalar tu negocio.',
      precio: 799.00,
      moneda: 'MXN',
      duracionEstimadaHoras: 12,
      nivel: 'intermedio',
      publicado: true,
    },
  })

  console.log('✅ Cursos creados')

  // Crear módulos para el curso 1
  const modulo1 = await prisma.modulo.upsert({
    where: { id: 'modulo-1' },
    update: {},
    create: {
      id: 'modulo-1',
      cursoId: curso1.id,
      titulo: 'Introducción al Marketing Digital',
      descripcion: 'Conceptos básicos y fundamentos del marketing digital',
      orden: 1,
    },
  })

  const modulo2 = await prisma.modulo.upsert({
    where: { id: 'modulo-2' },
    update: {},
    create: {
      id: 'modulo-2',
      cursoId: curso1.id,
      titulo: 'SEO y Posicionamiento',
      descripcion: 'Aprende a posicionar tu sitio web en Google',
      orden: 2,
    },
  })

  // Crear módulos para el curso 2
  const modulo3 = await prisma.modulo.upsert({
    where: { id: 'modulo-3' },
    update: {},
    create: {
      id: 'modulo-3',
      cursoId: curso2.id,
      titulo: 'Mindset Emprendedor',
      descripcion: 'Desarrolla la mentalidad correcta para emprender',
      orden: 1,
    },
  })

  console.log('✅ Módulos creados')

  // Crear lecciones para el módulo 1
  await Promise.all([
    prisma.leccion.upsert({
      where: { id: 'leccion-1' },
      update: {},
      create: {
        id: 'leccion-1',
        moduloId: modulo1.id,
        titulo: '¿Qué es el Marketing Digital?',
        descripcion: 'Introducción al concepto de marketing digital',
        contenido: 'El marketing digital es el conjunto de estrategias y acciones que se realizan en medios digitales para promocionar productos o servicios.',
        duracionMinutos: 15,
        orden: 1,
        tipoContenido: 'texto',
      },
    }),
    prisma.leccion.upsert({
      where: { id: 'leccion-2' },
      update: {},
      create: {
        id: 'leccion-2',
        moduloId: modulo1.id,
        titulo: 'Canales de Marketing Digital',
        descripcion: 'Conoce los principales canales del marketing digital',
        contenido: 'Los principales canales son: redes sociales, email marketing, SEO, SEM, content marketing.',
        duracionMinutos: 20,
        orden: 2,
        tipoContenido: 'texto',
      },
    }),
  ])

  // Crear lecciones para el módulo 2
  await Promise.all([
    prisma.leccion.upsert({
      where: { id: 'leccion-3' },
      update: {},
      create: {
        id: 'leccion-3',
        moduloId: modulo2.id,
        titulo: 'Fundamentos del SEO',
        descripcion: 'Aprende los conceptos básicos del SEO',
        contenido: 'SEO (Search Engine Optimization) es el proceso de optimizar tu sitio web para aparecer en los primeros resultados de búsqueda.',
        duracionMinutos: 25,
        orden: 1,
        tipoContenido: 'texto',
      },
    }),
  ])

  // Crear lecciones para el módulo 3
  await Promise.all([
    prisma.leccion.upsert({
      where: { id: 'leccion-4' },
      update: {},
      create: {
        id: 'leccion-4',
        moduloId: modulo3.id,
        titulo: 'La Mentalidad del Éxito',
        descripcion: 'Desarrolla una mentalidad ganadora',
        contenido: 'El éxito empieza en la mente. Aprende a pensar como un emprendedor exitoso.',
        duracionMinutos: 30,
        orden: 1,
        tipoContenido: 'texto',
      },
    }),
  ])

  console.log('✅ Lecciones creadas')

  // Crear inscripciones
  await prisma.inscripcion.upsert({
    where: {
      estudianteId_cursoId: {
        estudianteId: estudiantes[0].id,
        cursoId: curso1.id,
      },
    },
    update: {},
    create: {
      estudianteId: estudiantes[0].id,
      cursoId: curso1.id,
      montoPagado: 499.00,
      estado: 'activo',
      progresoPorcentaje: 33.33,
    },
  })

  await prisma.inscripcion.upsert({
    where: {
      estudianteId_cursoId: {
        estudianteId: estudiantes[1].id,
        cursoId: curso2.id,
      },
    },
    update: {},
    create: {
      estudianteId: estudiantes[1].id,
      cursoId: curso2.id,
      montoPagado: 799.00,
      estado: 'activo',
      progresoPorcentaje: 0,
    },
  })

  console.log('✅ Inscripciones creadas')

  // ========== SISTEMA DE COMUNICACIONES ==========

  // Configuración de canales
  await prisma.channelConfiguration.upsert({
    where: { canal: 'whatsapp' },
    update: {},
    create: {
      canal: 'whatsapp',
      activo: true,
      configuracion: {
        provider: 'evolution-api',
        instanceName: process.env.EVOLUTION_API_INSTANCE_NAME || '',
      },
    },
  })

  await prisma.channelConfiguration.upsert({
    where: { canal: 'email' },
    update: {},
    create: {
      canal: 'email',
      activo: true,
      configuracion: {
        provider: 'resend',
        fromName: 'Volkern CRM',
        fromEmail: 'noreply@volkern.com',
      },
    },
  })

  console.log('✅ Configuración de canales creada')

  // Templates de mensajes
  const templates = await Promise.all([
    // Templates de WhatsApp
    prisma.messageTemplate.upsert({
      where: { id: 'template-wa-bienvenida' },
      update: {},
      create: {
        id: 'template-wa-bienvenida',
        nombre: 'Bienvenida Lead - WhatsApp',
        canal: 'whatsapp',
        contenido: '¡Hola {nombre}! 👋\n\nGracias por contactarnos. Soy del equipo de Volkern CRM y estoy aquí para ayudarte.\n\n¿En qué podemos asistirte hoy?',
        variables: { disponibles: ['nombre'] },
        categoria: 'bienvenida',
        activo: true,
      },
    }),
    prisma.messageTemplate.upsert({
      where: { id: 'template-wa-recordatorio-cita' },
      update: {},
      create: {
        id: 'template-wa-recordatorio-cita',
        nombre: 'Recordatorio de Cita - WhatsApp',
        canal: 'whatsapp',
        contenido: '¡Hola {nombre}! 📅\n\nTe recordamos que tienes una cita programada:\n\n📌 Servicio: {servicio}\n🕐 Fecha: {fecha}\n⏰ Hora: {hora}\n\n¿Necesitas reagendar? Házmelo saber.',
        variables: { disponibles: ['nombre', 'servicio', 'fecha', 'hora'] },
        categoria: 'recordatorio',
        activo: true,
      },
    }),
    prisma.messageTemplate.upsert({
      where: { id: 'template-wa-seguimiento' },
      update: {},
      create: {
        id: 'template-wa-seguimiento',
        nombre: 'Seguimiento Lead - WhatsApp',
        canal: 'whatsapp',
        contenido: 'Hola {nombre},\n\nSolo quería hacer un seguimiento sobre tu interés en nuestros servicios.\n\n¿Tienes alguna pregunta? ¿Hay algo en lo que pueda ayudarte?',
        variables: { disponibles: ['nombre'] },
        categoria: 'seguimiento',
        activo: true,
      },
    }),
    prisma.messageTemplate.upsert({
      where: { id: 'template-wa-confirmacion-pago' },
      update: {},
      create: {
        id: 'template-wa-confirmacion-pago',
        nombre: 'Confirmación de Pago - WhatsApp',
        canal: 'whatsapp',
        contenido: '¡Hola {nombre}! ✅\n\n¡Tu pago ha sido confirmado exitosamente!\n\n💰 Monto: {monto}\n📄 Servicio: {servicio}\n\nGracias por tu confianza. ¡Nos vemos pronto!',
        variables: { disponibles: ['nombre', 'monto', 'servicio'] },
        categoria: 'confirmacion',
        activo: true,
      },
    }),
    // Templates de Email
    prisma.messageTemplate.upsert({
      where: { id: 'template-email-bienvenida' },
      update: {},
      create: {
        id: 'template-email-bienvenida',
        nombre: 'Bienvenida Lead - Email',
        canal: 'email',
        asunto: 'Bienvenido a Volkern CRM - ¡Estamos aquí para ayudarte!',
        contenido: `Hola {nombre},

¡Gracias por contactarnos! Nos alegra mucho que hayas decidido conocer más sobre nuestros servicios.

En Volkern CRM, nos especializamos en ayudar a emprendedores digitales, coaches y agencias a optimizar su gestión y automatizar sus procesos.

¿En qué podemos ayudarte hoy?

Saludos,
El equipo de Volkern CRM`,
        variables: { disponibles: ['nombre'] },
        categoria: 'bienvenida',
        activo: true,
      },
    }),
    prisma.messageTemplate.upsert({
      where: { id: 'template-email-recordatorio-cita' },
      update: {},
      create: {
        id: 'template-email-recordatorio-cita',
        nombre: 'Recordatorio de Cita - Email',
        canal: 'email',
        asunto: 'Recordatorio: Tu cita con Volkern CRM - {fecha}',
        contenido: `Hola {nombre},

Te recordamos que tienes una cita programada con nosotros:

📌 Servicio: {servicio}
🕐 Fecha: {fecha}
⏰ Hora: {hora}

Si necesitas reagendar o tienes alguna pregunta, por favor responde a este correo.

¡Te esperamos!

Saludos,
El equipo de Volkern CRM`,
        variables: { disponibles: ['nombre', 'servicio', 'fecha', 'hora'] },
        categoria: 'recordatorio',
        activo: true,
      },
    }),
    prisma.messageTemplate.upsert({
      where: { id: 'template-email-curso-bienvenida' },
      update: {},
      create: {
        id: 'template-email-curso-bienvenida',
        nombre: 'Bienvenida Curso - Email',
        canal: 'email',
        asunto: '¡Bienvenido al curso {curso}!',
        contenido: `Hola {nombre},

¡Felicidades! Ya tienes acceso al curso: {curso}

Puedes comenzar a aprender en cualquier momento accediendo a tu plataforma de estudiantes.

🎓 Características de tu curso:
- Acceso ilimitado a todos los módulos
- Materiales descargables
- Certificado al completar el curso

¡Te deseamos mucho éxito en tu aprendizaje!

Saludos,
El equipo de Volkern CRM`,
        variables: { disponibles: ['nombre', 'curso'] },
        categoria: 'bienvenida',
        activo: true,
      },
    }),
    // Template ambos canales
    prisma.messageTemplate.upsert({
      where: { id: 'template-ambos-felicitaciones-curso' },
      update: {},
      create: {
        id: 'template-ambos-felicitaciones-curso',
        nombre: 'Felicitaciones Curso Completado',
        canal: 'ambos',
        asunto: '🎉 ¡Felicidades! Has completado el curso {curso}',
        contenido: '¡Felicidades {nombre}! 🎉\n\nHas completado exitosamente el curso: {curso}\n\nTu certificado ya está disponible para descarga.\n\n¡Sigue aprendiendo!',
        variables: { disponibles: ['nombre', 'curso'] },
        categoria: 'felicitaciones',
        activo: true,
      },
    }),
  ])

  console.log('✅ Templates de mensajes creados')

  // Conversaciones de ejemplo
  const conversacion1 = await prisma.conversation.create({
    data: {
      contactoNombre: leads[0].nombre,
      contactoEmail: leads[0].email,
      contactoTelefono: leads[0].telefono,
      canal: 'whatsapp',
      estado: 'abierta',
      leadId: leads[0].id,
      ultimoMensaje: 'Hola, me gustaría saber más sobre sus servicios',
      fechaUltimoMensaje: new Date(),
      noLeidos: 1,
    },
  })

  // Mensajes de la conversación 1
  await Promise.all([
    prisma.message.create({
      data: {
        conversationId: conversacion1.id,
        contenido: 'Hola, me gustaría saber más sobre sus servicios',
        direccion: 'entrante',
        canal: 'whatsapp',
        estado: 'leido',
        fechaCreacion: new Date(Date.now() - 3600000), // Hace 1 hora
      },
    }),
    prisma.message.create({
      data: {
        conversationId: conversacion1.id,
        contenido: '¡Hola María! 👋 Gracias por contactarnos. Con gusto te puedo ayudar. ¿Qué tipo de servicio te interesa?',
        direccion: 'saliente',
        canal: 'whatsapp',
        estado: 'entregado',
        fechaCreacion: new Date(Date.now() - 3300000), // Hace 55 minutos
      },
    }),
    prisma.message.create({
      data: {
        conversationId: conversacion1.id,
        contenido: 'Estoy interesada en la consultoría 1:1',
        direccion: 'entrante',
        canal: 'whatsapp',
        estado: 'leido',
        fechaCreacion: new Date(),
      },
    }),
  ])

  const conversacion2 = await prisma.conversation.create({
    data: {
      contactoNombre: estudiantes[0].nombre,
      contactoEmail: estudiantes[0].email,
      contactoTelefono: estudiantes[0].telefono,
      canal: 'email',
      estado: 'abierta',
      estudianteId: estudiantes[0].id,
      ultimoMensaje: 'Pregunta sobre el módulo 2 del curso',
      fechaUltimoMensaje: new Date(Date.now() - 7200000), // Hace 2 horas
      noLeidos: 0,
    },
  })

  await prisma.message.create({
    data: {
      conversationId: conversacion2.id,
      contenido: 'Hola, tengo una pregunta sobre el módulo 2 del curso de Marketing Digital.',
      direccion: 'entrante',
      canal: 'email',
      estado: 'leido',
      fechaCreacion: new Date(Date.now() - 7200000),
    },
  })

  console.log('✅ Conversaciones y mensajes de ejemplo creados')

  // ========== TEMPLATES DE AUTOMATIZACIÓN ==========
  
  console.log('📋 Creando templates de automatización predefinidos...')

  const automationTemplates = await prisma.automationTemplate.createMany({
    data: [
      // Template 1: Bienvenida a Nuevos Leads
      {
        nombre: 'Bienvenida a Nuevos Leads',
        descripcion: 'Envía un mensaje de bienvenida automático cuando un nuevo lead se registra, presentando tu negocio y estableciendo expectativas.',
        categoria: 'leads',
        icono: 'UserPlus',
        color: '#3b82f6',
        trigger: 'nuevo_lead',
        tags: ['bienvenida', 'onboarding', 'leads', 'primer_contacto'],
        flowData: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              position: { x: 100, y: 100 },
              data: {
                label: 'Nuevo Lead',
                triggerType: 'nuevo_lead',
                config: {}
              }
            },
            {
              id: 'action-1',
              type: 'action',
              position: { x: 100, y: 250 },
              data: {
                label: 'Enviar WhatsApp',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: '¡Hola {{nombre}}! 👋\n\nGracias por tu interés en nuestros servicios. Estoy aquí para ayudarte.\n\n¿En qué puedo asistirte hoy?',
                  canal: 'whatsapp'
                }
              }
            },
            {
              id: 'action-2',
              type: 'action',
              position: { x: 100, y: 400 },
              data: {
                label: 'Enviar Email de Bienvenida',
                actionType: 'enviar_email',
                config: {
                  asunto: 'Bienvenido a {{empresa}}',
                  mensaje: 'Hola {{nombre}},\n\nNos alegra que te hayas puesto en contacto. Pronto un asesor se comunicará contigo.\n\nSaludos,\nEl equipo de {{empresa}}'
                }
              }
            }
          ],
          edges: [
            { id: 'e-trigger-action1', source: 'trigger-1', target: 'action-1' },
            { id: 'e-action1-action2', source: 'action-1', target: 'action-2' }
          ]
        }
      },

      // Template 2: Follow-up de Leads Sin Respuesta
      {
        nombre: 'Follow-up Leads Sin Respuesta',
        descripcion: 'Seguimiento automático a leads que no han respondido después de 48 horas, manteniendo el interés sin ser invasivo.',
        categoria: 'leads',
        icono: 'Clock',
        color: '#f59e0b',
        trigger: 'lead_sin_respuesta',
        tags: ['followup', 'recordatorio', 'engagement', 'leads'],
        flowData: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              position: { x: 100, y: 100 },
              data: {
                label: 'Lead Sin Respuesta',
                triggerType: 'lead_sin_respuesta',
                config: {}
              }
            },
            {
              id: 'delay-1',
              type: 'delay',
              position: { x: 100, y: 250 },
              data: {
                label: 'Esperar 48 horas',
                delayType: 'horas',
                delayValue: 48
              }
            },
            {
              id: 'action-1',
              type: 'action',
              position: { x: 100, y: 400 },
              data: {
                label: 'Enviar Follow-up',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: 'Hola {{nombre}},\n\nNoto que no he tenido respuesta tuya. ¿Aún estás interesado en conocer más sobre nuestros servicios?\n\n¿Hay algo en lo que pueda ayudarte? 😊',
                  canal: 'whatsapp'
                }
              }
            }
          ],
          edges: [
            { id: 'e-trigger-delay', source: 'trigger-1', target: 'delay-1' },
            { id: 'e-delay-action', source: 'delay-1', target: 'action-1' }
          ]
        }
      },

      // Template 3: Recordatorio de Citas
      {
        nombre: 'Recordatorio de Citas',
        descripcion: 'Recordatorios automáticos 24 horas y 1 hora antes de cada cita para reducir ausencias y mejorar la asistencia.',
        categoria: 'ventas',
        icono: 'Calendar',
        color: '#8b5cf6',
        trigger: 'cita_agendada',
        tags: ['citas', 'recordatorio', 'agenda', 'asistencia'],
        flowData: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              position: { x: 100, y: 100 },
              data: {
                label: 'Cita Agendada',
                triggerType: 'cita_agendada',
                config: {}
              }
            },
            {
              id: 'delay-1',
              type: 'delay',
              position: { x: 100, y: 250 },
              data: {
                label: 'Esperar hasta 24h antes',
                delayType: 'hasta_fecha',
                delayValue: -24
              }
            },
            {
              id: 'action-1',
              type: 'action',
              position: { x: 100, y: 400 },
              data: {
                label: 'Recordatorio 24h',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: '¡Hola {{nombre}}! 📅\n\nTe recuerdo que mañana tienes tu cita:\n\n🕐 Hora: {{hora_cita}}\n📍 Servicio: {{servicio}}\n\n¿Confirmas tu asistencia?',
                  canal: 'whatsapp'
                }
              }
            },
            {
              id: 'delay-2',
              type: 'delay',
              position: { x: 100, y: 550 },
              data: {
                label: 'Esperar hasta 1h antes',
                delayType: 'horas',
                delayValue: 23
              }
            },
            {
              id: 'action-2',
              type: 'action',
              position: { x: 100, y: 700 },
              data: {
                label: 'Recordatorio 1h',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: 'Hola {{nombre}}, en 1 hora es tu cita. ¡Te esperamos! 😊',
                  canal: 'whatsapp'
                }
              }
            }
          ],
          edges: [
            { id: 'e-trigger-delay1', source: 'trigger-1', target: 'delay-1' },
            { id: 'e-delay1-action1', source: 'delay-1', target: 'action-1' },
            { id: 'e-action1-delay2', source: 'action-1', target: 'delay-2' },
            { id: 'e-delay2-action2', source: 'delay-2', target: 'action-2' }
          ]
        }
      },

      // Template 4: Onboarding de Estudiantes
      {
        nombre: 'Onboarding de Nuevos Estudiantes',
        descripcion: 'Secuencia de bienvenida para estudiantes nuevos con información del curso, recursos y primeros pasos.',
        categoria: 'cursos',
        icono: 'GraduationCap',
        color: '#10b981',
        trigger: 'estudiante_inscrito',
        tags: ['cursos', 'onboarding', 'educacion', 'estudiantes'],
        flowData: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              position: { x: 100, y: 100 },
              data: {
                label: 'Estudiante Inscrito',
                triggerType: 'estudiante_inscrito',
                config: {}
              }
            },
            {
              id: 'action-1',
              type: 'action',
              position: { x: 100, y: 250 },
              data: {
                label: 'Email de Bienvenida',
                actionType: 'enviar_email',
                config: {
                  asunto: '¡Bienvenido al curso {{nombre_curso}}!',
                  mensaje: 'Hola {{nombre}},\n\n¡Felicidades por inscribirte! 🎉\n\nEstás a punto de comenzar un viaje increíble. Aquí está todo lo que necesitas saber:\n\n• Acceso a la plataforma\n• Recursos descargables\n• Grupo de soporte\n\n¡Nos vemos en la primera lección!'
                }
              }
            },
            {
              id: 'delay-1',
              type: 'delay',
              position: { x: 100, y: 400 },
              data: {
                label: 'Esperar 3 días',
                delayType: 'dias',
                delayValue: 3
              }
            },
            {
              id: 'condition-1',
              type: 'condition',
              position: { x: 100, y: 550 },
              data: {
                label: '¿Ha completado Módulo 1?',
                conditionType: 'progreso_curso',
                config: {
                  tipo: 'modulo_completado',
                  moduloNumero: 1
                }
              }
            },
            {
              id: 'action-2',
              type: 'action',
              position: { x: -50, y: 700 },
              data: {
                label: 'Felicitar Progreso',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: '¡Excelente progreso {{nombre}}! 🌟 Ya completaste el Módulo 1. ¡Sigue así!',
                  canal: 'whatsapp'
                }
              }
            },
            {
              id: 'action-3',
              type: 'action',
              position: { x: 250, y: 700 },
              data: {
                label: 'Motivar a Continuar',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: 'Hola {{nombre}}, ¿cómo vas con el curso? Si tienes dudas, estoy aquí para ayudarte. 💪',
                  canal: 'whatsapp'
                }
              }
            }
          ],
          edges: [
            { id: 'e-trigger-action1', source: 'trigger-1', target: 'action-1' },
            { id: 'e-action1-delay', source: 'action-1', target: 'delay-1' },
            { id: 'e-delay-condition', source: 'delay-1', target: 'condition-1' },
            { id: 'e-condition-yes', source: 'condition-1', target: 'action-2', label: 'Sí' },
            { id: 'e-condition-no', source: 'condition-1', target: 'action-3', label: 'No' }
          ]
        }
      },

      // Template 5: Felicitación por Completar Curso
      {
        nombre: 'Certificado y Felicitación',
        descripcion: 'Envía automáticamente el certificado digital cuando un estudiante completa el curso, con mensaje de felicitación.',
        categoria: 'cursos',
        icono: 'Award',
        color: '#f43f5e',
        trigger: 'estudiante_completa_curso',
        tags: ['cursos', 'certificado', 'logro', 'finalizacion'],
        flowData: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              position: { x: 100, y: 100 },
              data: {
                label: 'Curso Completado',
                triggerType: 'estudiante_completa_curso',
                config: {}
              }
            },
            {
              id: 'action-1',
              type: 'action',
              position: { x: 100, y: 250 },
              data: {
                label: 'Generar Certificado',
                actionType: 'generar_certificado',
                config: {}
              }
            },
            {
              id: 'action-2',
              type: 'action',
              position: { x: 100, y: 400 },
              data: {
                label: 'Enviar Certificado por Email',
                actionType: 'enviar_email',
                config: {
                  asunto: '¡Tu certificado de {{nombre_curso}}!',
                  mensaje: '¡Felicidades {{nombre}}! 🎓\n\nHas completado exitosamente el curso {{nombre_curso}}.\n\nTu certificado está adjunto. ¡Compártelo con orgullo!\n\nSigue aprendiendo con nosotros.',
                  adjuntos: ['certificado']
                }
              }
            },
            {
              id: 'action-3',
              type: 'action',
              position: { x: 100, y: 550 },
              data: {
                label: 'Enviar por WhatsApp',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: '🎉 ¡FELICIDADES {{nombre}}!\n\nCompletaste el curso {{nombre_curso}}. Tu certificado ya está en tu email.\n\n¿Listo para el siguiente nivel?',
                  canal: 'whatsapp'
                }
              }
            }
          ],
          edges: [
            { id: 'e-trigger-action1', source: 'trigger-1', target: 'action-1' },
            { id: 'e-action1-action2', source: 'action-1', target: 'action-2' },
            { id: 'e-action2-action3', source: 'action-2', target: 'action-3' }
          ]
        }
      },

      // Template 6: Nutrición de Leads - Serie de Valor
      {
        nombre: 'Nutrición de Leads - Serie de Valor',
        descripcion: 'Secuencia de mensajes educativos que aportan valor a leads fríos durante 7 días para mantener el engagement.',
        categoria: 'engagement',
        icono: 'Sparkles',
        color: '#14b8a6',
        trigger: 'nuevo_lead',
        tags: ['nurturing', 'educacion', 'engagement', 'contenido'],
        flowData: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              position: { x: 100, y: 100 },
              data: {
                label: 'Nuevo Lead',
                triggerType: 'nuevo_lead',
                config: {}
              }
            },
            {
              id: 'delay-1',
              type: 'delay',
              position: { x: 100, y: 250 },
              data: {
                label: 'Esperar 1 día',
                delayType: 'dias',
                delayValue: 1
              }
            },
            {
              id: 'action-1',
              type: 'action',
              position: { x: 100, y: 400 },
              data: {
                label: 'Día 1: Tip de Valor',
                actionType: 'enviar_email',
                config: {
                  asunto: 'Tip #1: {{tema_relevante}}',
                  mensaje: 'Hola {{nombre}},\n\nAquí va un consejo que te ayudará: [contenido valioso]\n\nMañana más...'
                }
              }
            },
            {
              id: 'delay-2',
              type: 'delay',
              position: { x: 100, y: 550 },
              data: {
                label: 'Esperar 2 días',
                delayType: 'dias',
                delayValue: 2
              }
            },
            {
              id: 'action-2',
              type: 'action',
              position: { x: 100, y: 700 },
              data: {
                label: 'Día 3: Caso de Éxito',
                actionType: 'enviar_email',
                config: {
                  asunto: 'Cómo [Cliente] logró [Resultado]',
                  mensaje: 'Te comparto un caso de éxito inspirador...'
                }
              }
            },
            {
              id: 'delay-3',
              type: 'delay',
              position: { x: 100, y: 850 },
              data: {
                label: 'Esperar 4 días',
                delayType: 'dias',
                delayValue: 4
              }
            },
            {
              id: 'action-3',
              type: 'action',
              position: { x: 100, y: 1000 },
              data: {
                label: 'Día 7: Llamado a la Acción',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: 'Hola {{nombre}}, ¿listo para dar el siguiente paso? Agenda una llamada: [link]',
                  canal: 'whatsapp'
                }
              }
            }
          ],
          edges: [
            { id: 'e-trigger-delay1', source: 'trigger-1', target: 'delay-1' },
            { id: 'e-delay1-action1', source: 'delay-1', target: 'action-1' },
            { id: 'e-action1-delay2', source: 'action-1', target: 'delay-2' },
            { id: 'e-delay2-action2', source: 'delay-2', target: 'action-2' },
            { id: 'e-action2-delay3', source: 'action-2', target: 'delay-3' },
            { id: 'e-delay3-action3', source: 'delay-3', target: 'action-3' }
          ]
        }
      },

      // Template 7: Re-engagement de Inactivos
      {
        nombre: 'Reactivación de Clientes Inactivos',
        descripcion: 'Recupera clientes o estudiantes que han estado inactivos por 30 días con una oferta especial o recordatorio.',
        categoria: 'engagement',
        icono: 'RefreshCw',
        color: '#6366f1',
        trigger: 'lead_sin_respuesta',
        tags: ['reactivacion', 'reengagement', 'win-back', 'inactivos'],
        flowData: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              position: { x: 100, y: 100 },
              data: {
                label: 'Usuario Inactivo',
                triggerType: 'lead_sin_respuesta',
                config: {
                  dias_inactivo: 30
                }
              }
            },
            {
              id: 'action-1',
              type: 'action',
              position: { x: 100, y: 250 },
              data: {
                label: 'Email de Reactivación',
                actionType: 'enviar_email',
                config: {
                  asunto: 'Te extrañamos {{nombre}}... 🎁',
                  mensaje: 'Hace tiempo que no sabemos de ti.\n\nQueremos que vuelvas, así que tenemos algo especial para ti: [oferta/descuento]\n\n¿Nos das otra oportunidad?'
                }
              }
            },
            {
              id: 'delay-1',
              type: 'delay',
              position: { x: 100, y: 400 },
              data: {
                label: 'Esperar 3 días',
                delayType: 'dias',
                delayValue: 3
              }
            },
            {
              id: 'condition-1',
              type: 'condition',
              position: { x: 100, y: 550 },
              data: {
                label: '¿Respondió?',
                conditionType: 'respuesta_recibida',
                config: {}
              }
            },
            {
              id: 'action-2',
              type: 'action',
              position: { x: 250, y: 700 },
              data: {
                label: 'Último Intento WhatsApp',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: 'Última oportunidad {{nombre}}: [oferta especial]. Solo por hoy.',
                  canal: 'whatsapp'
                }
              }
            }
          ],
          edges: [
            { id: 'e-trigger-action1', source: 'trigger-1', target: 'action-1' },
            { id: 'e-action1-delay', source: 'action-1', target: 'delay-1' },
            { id: 'e-delay-condition', source: 'delay-1', target: 'condition-1' },
            { id: 'e-condition-no', source: 'condition-1', target: 'action-2', label: 'No' }
          ]
        }
      },

      // Template 8: Confirmación de Pago
      {
        nombre: 'Confirmación de Pago Recibido',
        descripcion: 'Agradece automáticamente los pagos recibidos y envía detalles de la transacción y próximos pasos.',
        categoria: 'ventas',
        icono: 'CreditCard',
        color: '#22c55e',
        trigger: 'pago_recibido',
        tags: ['pagos', 'transacciones', 'confirmacion', 'ventas'],
        flowData: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger',
              position: { x: 100, y: 100 },
              data: {
                label: 'Pago Recibido',
                triggerType: 'pago_recibido',
                config: {}
              }
            },
            {
              id: 'action-1',
              type: 'action',
              position: { x: 100, y: 250 },
              data: {
                label: 'Email de Confirmación',
                actionType: 'enviar_email',
                config: {
                  asunto: 'Pago recibido - Factura #{{numero_factura}}',
                  mensaje: 'Hola {{nombre}},\n\n✅ Confirmamos la recepción de tu pago de {{monto}} {{moneda}}.\n\nDetalles:\n• Servicio/Curso: {{producto}}\n• Fecha: {{fecha}}\n• Método: {{metodo_pago}}\n\nGracias por tu confianza.'
                }
              }
            },
            {
              id: 'action-2',
              type: 'action',
              position: { x: 100, y: 400 },
              data: {
                label: 'WhatsApp de Agradecimiento',
                actionType: 'enviar_whatsapp',
                config: {
                  mensaje: '¡Gracias {{nombre}}! 💚\n\nTu pago ha sido confirmado. Revisa tu email para más detalles.\n\n¿Alguna pregunta?',
                  canal: 'whatsapp'
                }
              }
            }
          ],
          edges: [
            { id: 'e-trigger-action1', source: 'trigger-1', target: 'action-1' },
            { id: 'e-action1-action2', source: 'action-1', target: 'action-2' }
          ]
        }
      }
    ]
  })

  console.log(`✅ ${automationTemplates.count} templates de automatización creados`)

  console.log('🎉 ¡Seed completado exitosamente!')
  console.log('')
  console.log('Credenciales de acceso:')
  console.log('📧 Admin: admin@volkern.com')
  console.log('🔒 Password: volkern123456')
  console.log('')
  console.log('📊 Datos de prueba:')
  console.log(`- ${leads.length} leads`)
  console.log(`- ${servicios.length} servicios`)
  console.log(`- ${citas.length} citas`)
  console.log(`- ${estudiantes.length} estudiantes`)
  console.log('- 2 cursos con módulos y lecciones')
  console.log('- 2 inscripciones activas')
  console.log(`- ${templates.length} templates de mensajes`)
  console.log('- 2 conversaciones de ejemplo')
  console.log('- 2 canales de comunicación configurados (WhatsApp y Email)')

  // ========== SISTEMA DE PUNTUACIÓN DE LEADS ==========

  console.log('📊 Creando categorías de scoring...')

  // Crear categorías de score (A, B, C, D)
  const scoreCategories = await Promise.all([
    prisma.scoreCategory.upsert({
      where: { id: 'cat-a' },
      update: {},
      create: {
        id: 'cat-a',
        nombre: 'A',
        etiqueta: 'Lead Caliente 🔥',
        descripcion: 'Leads de alta calidad con gran potencial de conversión',
        puntuacionMin: 80,
        puntuacionMax: 999,
        color: '#ef4444', // rojo
        icono: 'Flame',
        orden: 1,
      },
    }),
    prisma.scoreCategory.upsert({
      where: { id: 'cat-b' },
      update: {},
      create: {
        id: 'cat-b',
        nombre: 'B',
        etiqueta: 'Lead Tibio ☀️',
        descripcion: 'Leads con buen engagement que requieren seguimiento',
        puntuacionMin: 50,
        puntuacionMax: 79,
        color: '#f59e0b', // naranja
        icono: 'Sun',
        orden: 2,
      },
    }),
    prisma.scoreCategory.upsert({
      where: { id: 'cat-c' },
      update: {},
      create: {
        id: 'cat-c',
        nombre: 'C',
        etiqueta: 'Lead Frío ❄️',
        descripcion: 'Leads con engagement bajo que necesitan nurturing',
        puntuacionMin: 20,
        puntuacionMax: 49,
        color: '#3b82f6', // azul
        icono: 'Snowflake',
        orden: 3,
      },
    }),
    prisma.scoreCategory.upsert({
      where: { id: 'cat-d' },
      update: {},
      create: {
        id: 'cat-d',
        nombre: 'D',
        etiqueta: 'Lead Inactivo 💤',
        descripcion: 'Leads sin engagement reciente',
        puntuacionMin: 0,
        puntuacionMax: 19,
        color: '#6b7280', // gris
        icono: 'Moon',
        orden: 4,
      },
    }),
  ])

  console.log(`✅ ${scoreCategories.length} categorías de scoring creadas`)

  console.log('📊 Creando reglas de scoring...')

  // Reglas demográficas
  await prisma.scoringRule.upsert({
    where: { id: 'rule-demo-1' },
    update: {},
    create: {
      id: 'rule-demo-1',
      nombre: 'Lead con teléfono',
      descripcion: 'Puntos por proporcionar número de teléfono',
      categoria: 'demografica',
      evento: 'lead_creado',
      puntos: 5,
      condiciones: { tieneTelefono: true },
      activo: true,
      orden: 1,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-demo-2' },
    update: {},
    create: {
      id: 'rule-demo-2',
      nombre: 'Lead con email',
      descripcion: 'Puntos por proporcionar email',
      categoria: 'demografica',
      evento: 'lead_creado',
      puntos: 5,
      condiciones: { tieneEmail: true },
      activo: true,
      orden: 2,
    },
  })

  // Reglas de interacción
  await prisma.scoringRule.upsert({
    where: { id: 'rule-int-1' },
    update: {},
    create: {
      id: 'rule-int-1',
      nombre: 'Mensaje recibido',
      descripcion: 'Puntos por cada mensaje recibido del lead',
      categoria: 'interaccion',
      evento: 'mensaje_recibido',
      puntos: 2,
      activo: true,
      orden: 3,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-int-2' },
    update: {},
    create: {
      id: 'rule-int-2',
      nombre: 'Respuesta rápida',
      descripcion: 'Puntos por responder en menos de 1 hora',
      categoria: 'interaccion',
      evento: 'respuesta_rapida',
      puntos: 5,
      activo: true,
      orden: 4,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-int-3' },
    update: {},
    create: {
      id: 'rule-int-3',
      nombre: 'Conversación iniciada',
      descripcion: 'Puntos por iniciar una nueva conversación',
      categoria: 'interaccion',
      evento: 'conversacion_iniciada',
      puntos: 3,
      activo: true,
      orden: 5,
    },
  })

  // Reglas de comportamiento
  await prisma.scoringRule.upsert({
    where: { id: 'rule-comp-1' },
    update: {},
    create: {
      id: 'rule-comp-1',
      nombre: 'Cita agendada',
      descripcion: 'Puntos por agendar una cita',
      categoria: 'comportamiento',
      evento: 'cita_agendada',
      puntos: 10,
      activo: true,
      orden: 6,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-comp-2' },
    update: {},
    create: {
      id: 'rule-comp-2',
      nombre: 'Cita completada',
      descripcion: 'Puntos por completar una cita',
      categoria: 'comportamiento',
      evento: 'cita_completada',
      puntos: 20,
      activo: true,
      orden: 7,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-comp-3' },
    update: {},
    create: {
      id: 'rule-comp-3',
      nombre: 'Pago realizado',
      descripcion: 'Puntos por realizar un pago',
      categoria: 'comportamiento',
      evento: 'pago_realizado',
      puntos: 25,
      activo: true,
      orden: 8,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-comp-4' },
    update: {},
    create: {
      id: 'rule-comp-4',
      nombre: 'Cita cancelada',
      descripcion: 'Puntos negativos por cancelar una cita',
      categoria: 'comportamiento',
      evento: 'cita_cancelada',
      puntos: -10,
      activo: true,
      orden: 9,
    },
  })

  // Reglas de engagement (cursos)
  await prisma.scoringRule.upsert({
    where: { id: 'rule-eng-1' },
    update: {},
    create: {
      id: 'rule-eng-1',
      nombre: 'Inscripción a curso',
      descripcion: 'Puntos por inscribirse a un curso',
      categoria: 'engagement',
      evento: 'curso_inscrito',
      puntos: 15,
      activo: true,
      orden: 10,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-eng-2' },
    update: {},
    create: {
      id: 'rule-eng-2',
      nombre: 'Lección completada',
      descripcion: 'Puntos por completar una lección',
      categoria: 'engagement',
      evento: 'leccion_completada',
      puntos: 3,
      activo: true,
      orden: 11,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-eng-3' },
    update: {},
    create: {
      id: 'rule-eng-3',
      nombre: 'Curso completado',
      descripcion: 'Puntos por completar un curso completo',
      categoria: 'engagement',
      evento: 'curso_completado',
      puntos: 30,
      activo: true,
      orden: 12,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-eng-4' },
    update: {},
    create: {
      id: 'rule-eng-4',
      nombre: 'Email abierto',
      descripcion: 'Puntos por abrir un email',
      categoria: 'engagement',
      evento: 'email_abierto',
      puntos: 1,
      activo: true,
      orden: 13,
    },
  })

  await prisma.scoringRule.upsert({
    where: { id: 'rule-eng-5' },
    update: {},
    create: {
      id: 'rule-eng-5',
      nombre: 'Link clickeado',
      descripcion: 'Puntos por hacer click en un link del email',
      categoria: 'engagement',
      evento: 'link_clickeado',
      puntos: 3,
      activo: true,
      orden: 14,
    },
  })


  // Crear configuración de Whitelabel por defecto
  console.log('Creando configuración de Whitelabel...')
  await prisma.whitelabelConfig.upsert({
    where: { id: 'default-whitelabel' },
    update: {},
    create: {
      id: 'default-whitelabel',
      nombreEmpresa: 'Volkern CRM',
      logoUrl: '/volkern-logo.png',
      iconoUrl: '/volkern-icon.png',
      colorPrimario: '#3b82f6',
      colorSecundario: '#8b5cf6',
      colorAcento: '#10b981',
      emailRemitente: 'contacto@volkern.com',
      nombreRemitente: 'Volkern CRM',
      eslogan: 'Tu CRM todo en uno',
      descripcion: 'Plataforma de CRM y automatización para emprendedores digitales',
    },
  })
  console.log('✅ Configuración de Whitelabel creada')

  // ========== KNOWLEDGE HUB ARTICLES ==========
  console.log('📚 Creando artículos del Knowledge Hub...')
  const knowledgeArticles = [
    {
      id: 'art-ventas-1',
      title: 'Cómo convertir un Lead en Proyecto',
      content: 'Para convertir un lead, primero asegúrate de que el estado sea "calificado". Desde el perfil del lead, haz clic en el botón "Convertir a Proyecto". Esto creará automáticamente un registro en el Hub de Proyectos y vinculará toda la actividad previa. Es obligatorio haber registrado al menos una interacción antes de la conversión.',
      tags: ['VENTAS', 'LEADS', 'SOP'],
      category: 'Procesos'
    },
    {
      id: 'art-finanzas-1',
      title: 'Procedimiento de Conciliación Bancaria',
      content: 'La conciliación se realiza en el Hub Contable. El sistema importa automáticamente los movimientos de Stripe o bancos vinculados. Debes emparejar cada movimiento con una factura o gasto existente. Si la confianza de la IA es >90%, puedes usar la conciliación masiva con un solo clic.',
      tags: ['FINANZAS', 'CONTABILIDAD'],
      category: 'Finanzas'
    },
    {
      id: 'art-general-1',
      title: 'Tour por la plataforma Volkern',
      content: 'Volkern se divide en Hubs especializados: 1. Dashboard General (Vista 360), 2. Ventas (Leads y CRM), 3. Proyectos (Operaciones), 4. RRHH (Talento), 5. Finanzas (Contabilidad), 6. Estrategia (BI y Rentabilidad). Usa la barra lateral izquierda para navegar.',
      tags: ['GENERAL', 'ONBOARDING'],
      category: 'Ayuda'
    },
    {
      id: 'art-rrhh-1',
      title: 'Uso del Punch Clock (Asistencia)',
      content: 'Los colaboradores deben marcar entrada y salida desde el botón flotante de la barra lateral. Por políticas de privacidad, solo se requiere validación de Geofencing (GPS). Asegúrate de tener los permisos de ubicación activados en tu navegador.',
      tags: ['TALENTO Y NÓMINAS', 'RRHH', 'ASISTENCIA'],
      category: 'Recursos Humanos'
    }
  ];

  for (const art of knowledgeArticles) {
    await prisma.knowledgeArticle.upsert({
      where: { id: art.id },
      update: {
        title: art.title,
        content: art.content,
        tags: art.tags,
        category: art.category
      },
      create: {
        ...art,
        tenantId: defaultTenant.id,
        authorId: adminUser.id
      }
    });
  }
  console.log(`✅ ${knowledgeArticles.length} artículos del Knowledge Hub creados`)

  // ========== MÓDULO INMOBILIARIO ==========
  const { fields: realEstateFieldCount, properties: realEstatePropCount } = await seedRealEstate(defaultTenant.id);

  const rulesCount = await prisma.scoringRule.count()
  console.log(`✅ ${rulesCount} reglas de scoring creadas`)

  console.log('')
  console.log('✨ ¡Seed completado exitosamente!')
  console.log('')
  console.log('📊 Datos de prueba:')
  console.log(`- ${leads.length} leads`)
  console.log(`- ${servicios.length} servicios`)
  console.log(`- ${citas.length} citas`)
  console.log(`- ${estudiantes.length} estudiantes`)
  console.log('- 2 cursos con módulos y lecciones')
  console.log('- 2 inscripciones activas')
  console.log(`- ${templates.length} templates de mensajes`)
  console.log('- 2 conversaciones de ejemplo')
  console.log('- 2 canales de comunicación configurados (WhatsApp y Email)')
  console.log(`- ${scoreCategories.length} categorías de scoring`)
  console.log(`- ${rulesCount} reglas de scoring`)
  console.log(`- ${realEstateFieldCount} definiciones de campos inmobiliarios`)
  console.log(`- ${realEstatePropCount} propiedades inmobiliarias`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })