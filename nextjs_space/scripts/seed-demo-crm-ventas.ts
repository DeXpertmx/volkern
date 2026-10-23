#!/usr/bin/env tsx
/**
 * Datos de demostración para las capturas del dossier de CRM & Ventas.
 *
 * Crea (o recrea) un tenant AISLADO `demo-crm-ventas` con un usuario, un
 * embudo y oportunidades, leads, tareas, cotizaciones y automatizaciones.
 *
 * No toca ningún tenant existente: todo se filtra por el id del tenant demo.
 * El seed es idempotente: borra solo los datos de ese tenant y los vuelve a
 * crear.
 *
 * Uso:
 *   DEMO_CRM_PASSWORD='…' npx tsx --require ./scripts/cargar-entorno.cjs scripts/seed-demo-crm-ventas.ts
 *
 * La contraseña no se escribe en el repositorio. El script de capturas la lee
 * de la misma variable.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'

const prisma = new PrismaClient()

const SLUG = 'demo-crm-ventas'
const EMAIL = 'demo@volkern.demo'
const PASSWORD = process.env.DEMO_CRM_PASSWORD
const SALIDA = path.join(process.cwd(), '.demo-crm-ventas.json')

if (!PASSWORD) {
  console.error('❌ Define DEMO_CRM_PASSWORD antes de ejecutar el seed.')
  process.exit(1)
}

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Este seed es solo para entornos de demostración, no producción.')
  process.exit(1)
}

const MODULOS = [
  'leads', 'contactos', 'empresas', 'pipeline', 'tareas', 'analytics',
  'cotizaciones', 'contratos', 'pronosticos', 'scoring', 'mensajes', 'citas',
  'catalogo', 'automatizaciones', 'configuracion', 'equipo', 'integraciones',
  'api_access',
]

const dias = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

async function main() {
  console.log('🌱 Sembrando tenant de demostración…')

  const plantilla = await prisma.tenant.findUnique({ where: { slug: 'volkern-default' } })
  const rolPlantilla = plantilla
    ? await prisma.role.findFirst({ where: { tenantId: plantilla.id, nombre: 'Admin' } })
    : null

  const tenant = await prisma.tenant.upsert({
    where: { slug: SLUG },
    update: {
      nombre: 'Distribuciones Norte (demo)',
      plan: 'crm_ventas',
      estado: 'activo',
      moneda: 'EUR',
      enabledModules: MODULOS,
      configuracion: {
        idioma: 'es',
        moneda: 'EUR',
        zona_horaria: 'Europe/Madrid',
        crmTier: 'avanzado',
        crmSeats: 8,
        demo: true,
      },
      provisioningStatus: 'ACTIVE',
    },
    create: {
      nombre: 'Distribuciones Norte (demo)',
      slug: SLUG,
      plan: 'crm_ventas',
      estado: 'activo',
      moneda: 'EUR',
      enabledModules: MODULOS,
      configuracion: {
        idioma: 'es',
        moneda: 'EUR',
        zona_horaria: 'Europe/Madrid',
        crmTier: 'avanzado',
        crmSeats: 8,
        demo: true,
      },
      provisioningStatus: 'ACTIVE',
    },
  })

  const role = await prisma.role.upsert({
    where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Admin' } },
    update: { permisos: (rolPlantilla?.permisos as any) || {} },
    create: {
      tenantId: tenant.id,
      nombre: 'Admin',
      descripcion: 'Administrador de la cuenta demo',
      permisos: (rolPlantilla?.permisos as any) || {},
      orden: 1,
    },
  })

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      name: 'Laura Martín',
      password: await bcrypt.hash(PASSWORD, 12),
      tenantId: tenant.id,
      roleId: role.id,
      estado: 'activo',
      timezone: 'Europe/Madrid',
    },
    create: {
      name: 'Laura Martín',
      email: EMAIL,
      password: await bcrypt.hash(PASSWORD, 12),
      tenantId: tenant.id,
      roleId: role.id,
      estado: 'activo',
      timezone: 'Europe/Madrid',
    },
  })

  // ─── Limpieza acotada al tenant demo ─────────────────────────────────────
  console.log('→ Limpiando datos anteriores del tenant demo…')
  const where = { tenantId: tenant.id }
  await prisma.automationExecution.deleteMany({
    where: { automation: { tenantId: tenant.id } },
  })
  await prisma.automation.deleteMany({ where })
  await prisma.contrato.deleteMany({ where })
  await prisma.cotizacion.deleteMany({ where })
  await prisma.task.deleteMany({ where })
  await prisma.note.deleteMany({ where: { lead: { tenantId: tenant.id } } })
  await prisma.interaction.deleteMany({ where: { lead: { tenantId: tenant.id } } })
  await prisma.dealActivity.deleteMany({ where })
  await prisma.deal.deleteMany({ where })
  await prisma.lead.deleteMany({ where })
  await prisma.contact.deleteMany({ where })
  await prisma.pipelineStage.deleteMany({ where })
  await prisma.pipeline.deleteMany({ where })

  // ─── Contactos ───────────────────────────────────────────────────────────
  const contactos = await Promise.all([
    prisma.contact.create({ data: { tenantId: tenant.id, nombre: 'Marta Sánchez', email: 'marta.sanchez@clinicasana.es', telefono: '+34 634 441 209', cargo: 'Directora de Operaciones', ciudad: 'Madrid', pais: 'España', notas: 'Decide con el socio financiero. Prefiere ver el producto con sus datos.' } }),
    prisma.contact.create({ data: { tenantId: tenant.id, nombre: 'Javier Ortiz', email: 'javier@ortizlogistica.es', telefono: '+34 655 120 883', cargo: 'Gerente', ciudad: 'Valencia', pais: 'España' } }),
    prisma.contact.create({ data: { tenantId: tenant.id, nombre: 'Elena Vidal', email: 'elena.vidal@grupovidal.es', telefono: '+34 610 772 341', cargo: 'Directora Comercial', ciudad: 'Barcelona', pais: 'España' } }),
    prisma.contact.create({ data: { tenantId: tenant.id, nombre: 'Andrés Molina', email: 'andres@molinafoods.es', telefono: '+34 699 214 055', cargo: 'Fundador', ciudad: 'Sevilla', pais: 'España' } }),
  ])

  // ─── Leads ───────────────────────────────────────────────────────────────
  const leads = await Promise.all([
    prisma.lead.create({ data: { tenantId: tenant.id, nombre: 'Marta Sánchez', email: 'marta.sanchez@clinicasana.es', telefono: '+34 634 441 209', empresa: 'Clínica Sana', cargo: 'Directora de Operaciones', estado: 'calificado', asignadoA: user.id, scoreValue: 87, fuente: 'LinkedIn', canal: 'social', ciudad: 'Madrid', pais: 'España', notas: 'Tres clínicas. Hoy el seguimiento vive en una hoja compartida y en el WhatsApp de recepción.', contextoProyecto: 'Quiere unificar captación y seguimiento antes de abrir la cuarta clínica.', tags: 'prioridad-alta,decide-comite' } }),
    prisma.lead.create({ data: { tenantId: tenant.id, nombre: 'Javier Ortiz', email: 'javier@ortizlogistica.es', telefono: '+34 655 120 883', empresa: 'Ortiz Logística', cargo: 'Gerente', estado: 'contactado', asignadoA: user.id, scoreValue: 62, fuente: 'Web', canal: 'web', ciudad: 'Valencia', pais: 'España', notas: 'Pidió una propuesta para 12 usuarios.' } }),
    prisma.lead.create({ data: { tenantId: tenant.id, nombre: 'Elena Vidal', email: 'elena.vidal@grupovidal.es', telefono: '+34 610 772 341', empresa: 'Grupo Vidal', cargo: 'Directora Comercial', estado: 'nuevo', asignadoA: user.id, scoreValue: 41, fuente: 'Formulario web', canal: 'web', ciudad: 'Barcelona', pais: 'España' } }),
    prisma.lead.create({ data: { tenantId: tenant.id, nombre: 'Andrés Molina', email: 'andres@molinafoods.es', telefono: '+34 699 214 055', empresa: 'Molina Foods', cargo: 'Fundador', estado: 'calificado', asignadoA: user.id, scoreValue: 74, fuente: 'Referido', canal: 'referral', ciudad: 'Sevilla', pais: 'España' } }),
    prisma.lead.create({ data: { tenantId: tenant.id, nombre: 'Lucía Ferrer', email: 'lucia@ferrerstudio.es', empresa: 'Ferrer Studio', cargo: 'Socia', estado: 'contactado', asignadoA: user.id, scoreValue: 55, fuente: 'Instagram', canal: 'social', ciudad: 'Madrid', pais: 'España' } }),
    prisma.lead.create({ data: { tenantId: tenant.id, nombre: 'Pablo Navarro', email: 'pablo@navarrob2b.es', empresa: 'Navarro B2B', cargo: 'Responsable de ventas', estado: 'nuevo', asignadoA: user.id, scoreValue: 33, fuente: 'Feria', canal: 'evento', ciudad: 'Bilbao', pais: 'España' } }),
  ])

  const [marta, javier, elena, andres] = leads

  // ─── Embudo ──────────────────────────────────────────────────────────────
  const pipeline = await prisma.pipeline.create({
    data: {
      tenantId: tenant.id,
      nombre: 'Ventas B2B',
      categoria: 'ventas',
      descripcion: 'Ciclo de venta de servicios y software',
      orden: 1,
      color: '#0891b2',
      icono: '📈',
      activo: true,
    },
  })

  const etapas = [
    { nombre: 'Calificación', probabilidad: 15, color: '#94a3b8' },
    { nombre: 'Contacto inicial', probabilidad: 30, color: '#38bdf8' },
    { nombre: 'Propuesta', probabilidad: 55, color: '#6366f1' },
    { nombre: 'Negociación', probabilidad: 75, color: '#f59e0b' },
    { nombre: 'Cerrado ganado', probabilidad: 100, color: '#10b981', final: 'ganado' },
    { nombre: 'Cerrado perdido', probabilidad: 0, color: '#ef4444', final: 'perdido' },
  ]

  for (const [i, etapa] of etapas.entries()) {
    await prisma.pipelineStage.create({
      data: {
        tenantId: tenant.id,
        pipelineId: pipeline.id,
        nombre: etapa.nombre,
        orden: i + 1,
        probabilidad: etapa.probabilidad,
        color: etapa.color,
        esEtapaFinal: Boolean(etapa.final),
        tipoEtapaFinal: etapa.final || null,
        activo: true,
      },
    })
  }

  // ─── Oportunidades ───────────────────────────────────────────────────────
  const dealsDef = [
    { titulo: 'Implantación CRM — Clínica Sana', valor: 32000, etapa: 'Propuesta', lead: marta.id, contact: contactos[0].id, health: 86, dias: -4, prob: 55, tags: 'HOT,prioridad-alta' },
    { titulo: 'Digitalización de recepción — Clínica Sana', valor: 8800, etapa: 'Negociación', lead: marta.id, contact: contactos[0].id, health: 91, dias: -1, prob: 75, tags: 'HOT' },
    { titulo: 'Renovación de flota — Ortiz Logística', valor: 24000, etapa: 'Contacto inicial', lead: javier.id, contact: contactos[1].id, health: 38, dias: -12, prob: 30, tags: 'ZOMBIE' },
    { titulo: 'Ampliación de sede — Ortiz Logística', valor: 18000, etapa: 'Calificación', lead: javier.id, contact: contactos[1].id, health: 42, dias: -9, prob: 15, tags: '' },
    { titulo: 'Licencias — Grupo Vidal', valor: 70000, etapa: 'Propuesta', lead: elena.id, contact: contactos[2].id, health: 68, dias: -6, prob: 55, tags: 'cuenta-clave' },
    { titulo: 'Plan de crecimiento — Grupo Vidal', valor: 23000, etapa: 'Contacto inicial', lead: elena.id, contact: contactos[2].id, health: 51, dias: -8, prob: 30, tags: '' },
    { titulo: 'Pack de bienvenida — Molina Foods', valor: 8400, etapa: 'Calificación', lead: andres.id, contact: contactos[3].id, health: 59, dias: -3, prob: 15, tags: '' },
    { titulo: 'Servicio premium — Molina Foods', valor: 40000, etapa: 'Cerrado ganado', lead: andres.id, contact: contactos[3].id, health: 97, dias: -2, prob: 100, tags: 'HOT', cerrado: 'ganado' },
    { titulo: 'Formación comercial — Ferrer Studio', valor: 6200, etapa: 'Calificación', lead: leads[4].id, contact: null, health: 35, dias: -15, prob: 15, tags: 'ZOMBIE' },
    { titulo: 'Auditoría de procesos — Navarro B2B', valor: 12000, etapa: 'Cerrado perdido', lead: leads[5].id, contact: null, health: 12, dias: -20, prob: 0, tags: '', cerrado: 'perdido', razon: 'Eligió una herramienta más barata' },
  ]

  const deals: { id: string; titulo: string }[] = []
  for (const d of dealsDef) {
    const deal = await prisma.deal.create({
      data: {
        tenantId: tenant.id,
        leadId: d.lead,
        contactId: d.contact || null,
        pipelineId: pipeline.id,
        titulo: d.titulo,
        descripcion: 'Oportunidad de demostración con datos reales del embudo.',
        valor: d.valor,
        moneda: 'EUR',
        etapa: d.etapa,
        probabilidad: d.prob,
        estado: d.cerrado || 'activo',
        fechaCreacion: dias(-30),
        fechaEstimadaCierre: dias(d.cerrado ? -2 : 12),
        fechaCierre: d.cerrado ? dias(-2) : null,
        razonPerdida: d.razon || null,
        fechaUltimaActividad: dias(d.dias),
        diasEnPipeline: Math.abs(d.dias),
        numeroActividades: Math.max(2, Math.round(Math.abs(d.dias) / 2)),
        origen: 'LinkedIn',
        prioridad: d.health > 80 ? 'alta' : d.health < 40 ? 'baja' : 'media',
        tags: d.tags || null,
        usuarioAsignadoId: user.id,
        healthScore: d.health,
        healthStatus: d.health > 70 ? 'HEALTHY' : d.health > 40 ? 'AT_RISK' : 'CRITICAL',
        lastHealthUpdate: dias(-1),
      },
    })
    deals.push({ id: deal.id, titulo: deal.titulo })
  }

  // Actividad reciente de la oportunidad principal
  await prisma.dealActivity.createMany({
    data: [
      { tenantId: tenant.id, dealId: deals[0].id, userId: user.id, tipo: 'llamada', titulo: 'Llamada de descubrimiento', descripcion: 'Tres clínicas y un equipo de 6 personas. Hoy el seguimiento está en una hoja compartida.', resultado: 'positivo', duracion: 28, fechaActividad: dias(-6) },
      { tenantId: tenant.id, dealId: deals[0].id, userId: user.id, tipo: 'email', titulo: 'Propuesta enviada', descripcion: 'Propuesta de implantación con 8 usuarios y puesta en marcha.', resultado: 'enviada', fechaActividad: dias(-4) },
      { tenantId: tenant.id, dealId: deals[0].id, userId: user.id, tipo: 'reunion', titulo: 'Revisión con dirección', descripcion: 'Validan el alcance; falta el visto bueno del socio financiero.', resultado: 'seguimiento', duracion: 45, fechaActividad: dias(-2) },
    ],
  })

  // ─── Tareas ──────────────────────────────────────────────────────────────
  await prisma.task.createMany({
    data: [
      { tenantId: tenant.id, leadId: marta.id, asignadoA: user.id, tipo: 'llamada', titulo: 'Llamar al socio financiero de Clínica Sana', descripcion: 'Confirmar el presupuesto y la fecha de arranque.', fechaVencimiento: dias(-1) },
      { tenantId: tenant.id, leadId: marta.id, asignadoA: user.id, tipo: 'email', titulo: 'Enviar caso de éxito de clínicas', descripcion: 'Adjuntar el resumen de resultados del último cliente.', fechaVencimiento: dias(0) },
      { tenantId: tenant.id, leadId: javier.id, asignadoA: user.id, tipo: 'reunion', titulo: 'Demo con Ortiz Logística', descripcion: 'Enseñar embudo y reparto de leads.', fechaVencimiento: dias(1) },
      { tenantId: tenant.id, leadId: elena.id, asignadoA: user.id, tipo: 'recordatorio', titulo: 'Revisar propuesta de Grupo Vidal', descripcion: 'La propuesta lleva dos días enviada y no se ha abierto.', fechaVencimiento: dias(2) },
      { tenantId: tenant.id, leadId: andres.id, asignadoA: user.id, tipo: 'llamada', titulo: 'Llamar a Molina Foods', descripcion: 'Cerrar el pack de bienvenida.', fechaVencimiento: dias(3) },
      { tenantId: tenant.id, leadId: leads[4].id, asignadoA: user.id, tipo: 'email', titulo: 'Retomar contacto con Ferrer Studio', descripcion: 'Sin actividad desde hace dos semanas.', fechaVencimiento: dias(-3) },
    ],
  })

  // ─── Cotizaciones ────────────────────────────────────────────────────────
  const cotizacionesDef = [
    { numero: 'COT-2026-041', titulo: 'Implantación CRM — 8 usuarios', lead: marta.id, deal: deals[0].id, estado: 'enviada', subtotal: 32000, total: 38720, veces: 3, dias: -4 },
    { numero: 'COT-2026-038', titulo: 'Licencias anuales — Grupo Vidal', lead: elena.id, deal: deals[4].id, estado: 'enviada', subtotal: 70000, total: 84700, veces: 1, dias: -6 },
    { numero: 'COT-2026-035', titulo: 'Servicio premium — Molina Foods', lead: andres.id, deal: deals[7].id, estado: 'aceptada', subtotal: 40000, total: 48400, veces: 5, dias: -12 },
  ]

  const cotizaciones: string[] = []
  for (const c of cotizacionesDef) {
    const cot = await prisma.cotizacion.create({
      data: {
        tenantId: tenant.id,
        leadId: c.lead,
        dealId: c.deal,
        numero: c.numero,
        titulo: c.titulo,
        descripcion: 'Propuesta de servicios con puesta en marcha incluida.',
        estado: c.estado,
        subtotal: c.subtotal,
        impuestos: c.total - c.subtotal,
        total: c.total,
        moneda: 'EUR',
        validezDias: 30,
        fechaCreacion: dias(c.dias),
        fechaEnvio: dias(c.dias),
        fechaVencimiento: dias(c.dias + 30),
        vecesVista: c.veces,
        ultimaVista: dias(-1),
        fechaPrimeraVista: dias(c.dias + 1),
        clienteNombre: c.lead === marta.id ? 'Marta Sánchez' : c.lead === elena.id ? 'Elena Vidal' : 'Andrés Molina',
        clienteEmail: c.lead === marta.id ? 'marta.sanchez@clinicasana.es' : c.lead === elena.id ? 'elena.vidal@grupovidal.es' : 'andres@molinafoods.es',
        clienteEmpresa: c.lead === marta.id ? 'Clínica Sana' : c.lead === elena.id ? 'Grupo Vidal' : 'Molina Foods',
        creadoPorId: user.id,
        terminosPago: '50 % al inicio, 50 % a la entrega',
        items: {
          create: [
            { concepto: 'Implantación y configuración', descripcion: 'Embudo, campos y formación del equipo', cantidad: 1, precioUnitario: c.subtotal, total: c.subtotal, orden: 1 },
            { concepto: 'Soporte y mantenimiento (12 meses)', descripcion: 'Soporte prioritario y actualizaciones', cantidad: 12, precioUnitario: 0, total: 0, orden: 2 },
          ],
        },
      },
    })
    cotizaciones.push(cot.id)
  }

  // ─── Interacciones y notas del lead principal ────────────────────────────
  await prisma.interaction.createMany({
    data: [
      { leadId: marta.id, creadoPor: user.id, tipo: 'llamada', contenido: 'Primera llamada de 28 minutos. Tres clínicas, seis personas en recepción y una hoja de cálculo compartida.', resultado: 'positivo', fechaCreacion: dias(-6) },
      { leadId: marta.id, creadoPor: user.id, tipo: 'email', contenido: 'Enviada la propuesta de implantación. La abrió tres veces el mismo día.', resultado: 'enviado', fechaCreacion: dias(-4) },
      { leadId: marta.id, creadoPor: user.id, tipo: 'reunion', contenido: 'Revisión con dirección: validan alcance y piden el visto bueno del socio financiero.', resultado: 'seguimiento', fechaCreacion: dias(-2) },
    ],
  })
  await prisma.note.createMany({
    data: [
      { leadId: marta.id, creadoPor: user.id, contenido: 'Decide un comité de tres personas. El socio financiero pesa más que la directora de operaciones.', fechaCreacion: dias(-5) },
      { leadId: marta.id, creadoPor: user.id, contenido: 'No prometer integración con su software de historias clínicas: no está verificada.', fechaCreacion: dias(-3) },
    ],
  })

  // ─── Automatizaciones ────────────────────────────────────────────────────
  await prisma.automation.createMany({
    data: [
      { tenantId: tenant.id, nombre: 'Lead nuevo', descripcion: 'Reparte el lead al comercial de guardia y avisa por Telegram.', trigger: 'lead.created', activo: true, flowData: { nodes: [], edges: [] }, estadisticas: { ejecuciones: 148, ultima: dias(-1).toISOString() } },
      { tenantId: tenant.id, nombre: 'Propuesta sin respuesta', descripcion: 'A los 3 días crea una tarea de seguimiento y envía un correo suave al cliente.', trigger: 'cotizacion.no_vista', activo: true, flowData: { nodes: [], edges: [] }, estadisticas: { ejecuciones: 64, ultima: dias(-2).toISOString() } },
      { tenantId: tenant.id, nombre: 'Oportunidad parada', descripcion: 'Si lleva 7 días sin actividad, la marca en riesgo y avisa al responsable.', trigger: 'deal.sin_actividad', activo: true, flowData: { nodes: [], edges: [] }, estadisticas: { ejecuciones: 37, ultima: dias(-1).toISOString() } },
      { tenantId: tenant.id, nombre: 'Cierre ganado', descripcion: 'Crea la tarea de alta del cliente y avisa a administración.', trigger: 'deal.ganado', activo: false, flowData: { nodes: [], edges: [] }, estadisticas: { ejecuciones: 12, ultima: dias(-7).toISOString() } },
    ],
  })

  const salida = {
    tenantId: tenant.id,
    userId: user.id,
    email: EMAIL,
    leadId: marta.id,
    pipelineId: pipeline.id,
    dealId: deals[0].id,
    cotizacionId: cotizaciones[0],
  }
  fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 2))

  console.log(`✓ Tenant demo: ${tenant.id}`)
  console.log(`✓ Usuario: ${EMAIL}`)
  console.log(`✓ ${deals.length} oportunidades, ${leads.length} leads, ${cotizaciones.length} cotizaciones`)
  console.log(`✓ Manifiesto: ${SALIDA}`)
}

main()
  .catch((e) => {
    console.error('❌ Error sembrando la demo:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
