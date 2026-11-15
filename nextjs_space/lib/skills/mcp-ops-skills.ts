/**
 * Skills MCP — executors de las tools del catálogo standalone
 * (mcp-server/src/tools-catalog.ts) que no tienen skill de chatbot.
 *
 * CADA executor honra el inputSchema del catálogo: es el contrato que ven
 * los agentes externos vía /mcp (tools/list) y el standalone. Las entradas
 * reciben tenantId/userId/source inyectados por la ruta (handleCallTool).
 *
 * La lógica pesada vive en libs compartidas con las rutas REST
 * (lib/cotizaciones, lib/contratos, lib/ordenes-venta, lib/services/appointments):
 * una sola fuente de verdad por operación de negocio.
 */

import { prisma } from '@/lib/db'
import { revalidarPortalDeInmueble } from '@/lib/real-estate/portal-revalidate'
import { checkAvailability, createCitaConEfectos, CitaError } from '@/lib/services/appointments'
import { crearCotizacionDesdeCatalogo } from '@/lib/cotizaciones/from-catalog'
import { crearOrdenVentaDesdeCotizacion } from '@/lib/ordenes-venta/from-cotizacion'
import { crearContratoDesdeCotizacion } from '@/lib/contratos/from-cotizacion'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { verifyFinancialIntegrity } from '@/lib/security/integrity-service'
import { ProductionService } from '@/lib/erp/production-service'
import { projectFinancialForecast, taxProspector } from '@/lib/skills/financial-consolidation-skills'
import { searchCatalog } from '@/lib/skills/catalog-skills'
import { monedaEscritura } from '@/lib/moneda'
import { getFiscalConfig } from '@/lib/fiscal-engine'
import { ItemIntegrityService } from '@/lib/security/item-integrity'
import { ComplianceGate } from '@/lib/compliance-gate'
import { deleteCalendarEvent } from '@/lib/google-calendar'

// ═══════════════════════════════════════════════════════════════
// CITAS
// ═══════════════════════════════════════════════════════════════

/** volkern_check_disponibilidad — {fecha, duracion?} */
export async function checkDisponibilidadMcp(input: any) {
  const { tenantId, fecha, duracion = 60 } = input
  if (!fecha) throw new Error('fecha es requerida (YYYY-MM-DD)')
  const availability = await checkAvailability({ tenantId, fecha, duracion })
  return {
    fecha,
    duracion,
    dia: availability.dia,
    diaActivo: availability.disponible || availability.totalSlots > 0,
    disponibles: {
      total: availability.slots.length,
      slots: availability.slots,
    },
    recomendacion: availability.disponible
      ? `Hay ${availability.slots.length} horarios disponibles.`
      : 'No hay horarios disponibles para este día.',
  }
}

/** volkern_list_citas — {estado?, tipo?, fecha?, fechaInicio?, fechaFin?} */
export async function listarCitasMcp(input: any) {
  const { tenantId, estado, tipo, fecha, fechaInicio, fechaFin } = input
  const whereClause: any = { tenantId }
  const estadosValidos = estado && estado !== 'all'
    ? String(estado).split(',').map((e: string) => e.toLowerCase().trim())
    : null
  if (tipo && tipo !== 'all') whereClause.tipo = tipo
  if (fecha) {
    const desde = new Date(fecha)
    const hasta = new Date(fecha)
    hasta.setDate(hasta.getDate() + 1)
    whereClause.fechaHora = { gte: desde, lt: hasta }
  }
  if (fechaInicio && fechaFin) {
    whereClause.fechaHora = { gte: new Date(fechaInicio), lte: new Date(fechaFin) }
  }
  const citas = await prisma.cita.findMany({
    where: whereClause,
    include: { lead: { select: { id: true, nombre: true, email: true, telefono: true } }, servicio: { select: { id: true, nombre: true } } },
    orderBy: { fechaHora: 'asc' },
  })
  const filtradas = estadosValidos ? citas.filter(c => estadosValidos.includes(c.estado.toLowerCase())) : citas
  return { citas: filtradas, total: filtradas.length }
}

/** volkern_create_cita — {leadId, fechaHora, tipo?, titulo?, descripcion?, duracion?, servicioId?} */
export async function crearCitaMcp(input: any) {
  const { tenantId, userId, leadId, fechaHora, tipo, titulo, descripcion, duracion, servicioId } = input
  if (!leadId) throw new Error('leadId es requerido')
  if (!fechaHora) throw new Error('fechaHora es requerida (ISO 8601)')
  const fechaHoraDate = new Date(fechaHora)
  if (Number.isNaN(fechaHoraDate.getTime())) throw new Error('fechaHora inválida (ISO 8601)')

  // IDEMPOTENCIA: si ya existe la misma cita (mismo tenant + lead + fechaHora
  // + tipo), devolver la existente en vez de duplicarla. El chequeo va ANTES
  // de createCitaConEfectos porque su validación de conflicto de horario
  // respondería 409 para la repetición en lugar de una respuesta idempotente.
  const duplicada = await prisma.cita.findFirst({
    where: { tenantId, leadId, fechaHora: fechaHoraDate, tipo: tipo || 'reunion' },
    orderBy: { fechaCreacion: 'desc' },
  })
  if (duplicada) {
    return {
      cita: duplicada,
      yaExistia: true,
      mensaje: 'La cita ya existía (mismo lead, fecha/hora y tipo); no se duplicó.',
    }
  }

  const [actorUser, tenant] = await Promise.all([
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }) : Promise.resolve(null),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } }),
  ])

  const { cita } = await createCitaConEfectos({
    tenantId,
    actor: { id: userId || 'mcp', name: actorUser?.name, email: actorUser?.email },
    tenantNombre: tenant?.nombre || 'Volkern',
    data: { leadId, fechaHora, tipo, titulo, descripcion, duracion, servicioId },
  })
  return { cita, yaExistia: false, mensaje: 'Cita creada.' }
}

/** volkern_update_cita — {citaId, fechaHora?, estado?, descripcion?, duracion?} */
export async function actualizarCitaMcp(input: any) {
  const { tenantId, userId, citaId, fechaHora, estado, descripcion, duracion } = input
  if (!citaId) throw new Error('citaId es requerido')

  const cita = await prisma.cita.findFirst({ where: { id: citaId, tenantId } })
  if (!cita) throw new Error('Cita no encontrada')

  const data: any = {}
  if (descripcion !== undefined) data.descripcion = descripcion
  if (duracion !== undefined) data.duracion = duracion
  if (estado !== undefined) data.estado = String(estado).toLowerCase()

  // Reprogramación: validar conflictos excluyendo la propia cita
  if (fechaHora) {
    const nuevaFecha = new Date(fechaHora)
    if (Number.isNaN(nuevaFecha.getTime())) throw new Error('fechaHora inválida (ISO 8601)')
    const dur = duracion ?? cita.duracion
    const nuevaFin = new Date(nuevaFecha.getTime() + dur * 60000)
    const conflictivas = await prisma.cita.findMany({
      where: {
        tenantId,
        id: { not: citaId },
        estado: { not: 'cancelada' },
        fechaHora: { gte: new Date(nuevaFecha.getTime() - 24 * 60 * 60 * 1000), lte: nuevaFin },
      },
    })
    const conflicto = conflictivas.some(otra => {
      const i = new Date(otra.fechaHora)
      const f = new Date(i.getTime() + otra.duracion * 60000)
      return (nuevaFecha >= i && nuevaFecha < f) || (nuevaFin > i && nuevaFin <= f) || (nuevaFecha <= i && nuevaFin >= f)
    })
    if (conflicto) throw new CitaError('Conflicto de horario', 409)
    data.fechaHora = nuevaFecha
  }

  const actualizada = await prisma.cita.update({ where: { id: citaId }, data })
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: userId || 'mcp',
      accion: 'UPDATE',
      entidad: 'Cita',
      entidadId: citaId,
      descripcion: `Cita actualizada vía MCP`,
      cambiosAntes: { estado: cita.estado, fechaHora: cita.fechaHora },
      cambiosDespues: { estado: actualizada.estado, fechaHora: actualizada.fechaHora },
    },
  }).catch(() => {})
  return actualizada
}

/** volkern_cita_accion — {citaId, accion: confirmar|cancelar|reprogramar, nuevaFecha?, motivo?} */
export async function accionCitaMcp(input: any) {
  const { tenantId, userId, citaId, accion, nuevaFecha, motivo } = input
  if (!citaId || !accion) throw new Error('citaId y accion son requeridos')
  if (!['confirmar', 'cancelar', 'reprogramar'].includes(accion)) {
    throw new Error(`accion inválida: ${accion} (confirmar | cancelar | reprogramar)`)
  }

  const cita = await prisma.cita.findFirst({
    where: { id: citaId, tenantId },
    include: { lead: { select: { nombre: true } } },
  })
  if (!cita) throw new Error('Cita no encontrada')

  if (accion === 'reprogramar') {
    if (!nuevaFecha) throw new Error('nuevaFecha es requerida para reprogramar')
    return actualizarCitaMcp({ tenantId, userId, citaId, fechaHora: nuevaFecha })
  }

  const nuevoEstado = accion === 'confirmar' ? 'confirmada' : 'cancelada'
  const nota = `[${new Date().toISOString()}] ${accion === 'confirmar' ? '✅ Confirmada' : '❌ Cancelada'} vía MCP${motivo ? ` — motivo: ${motivo}` : ''}`

  const actualizada = await prisma.cita.update({
    where: { id: citaId },
    data: {
      estado: nuevoEstado,
      descripcion: cita.descripcion ? `${cita.descripcion}\n${nota}` : nota,
    },
  })

  // Si se cancela, eliminar el evento de Google Calendar si existía
  if (accion === 'cancelar' && cita.googleCalendarEventId) {
    try {
      const googleIntegration = await prisma.googleCalendarIntegration.findFirst({
        where: { tenantId },
      })
      if (googleIntegration && googleIntegration.activo) {
        await deleteCalendarEvent(googleIntegration.userId, citaId, cita.googleCalendarEventId)
      }
    } catch (e: any) {
      console.error('Error eliminando cita de Google Calendar (no crítico):', e?.message)
    }
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: userId || 'mcp',
      accion: accion === 'confirmar' ? 'CONFIRMAR_CITA' : 'CANCELAR_CITA',
      entidad: 'Cita',
      entidadId: citaId,
      descripcion: `Cita ${nuevoEstado} vía MCP${motivo ? ` — ${motivo}` : ''}`,
      cambiosAntes: { estado: cita.estado },
      cambiosDespues: { estado: nuevoEstado },
    },
  }).catch(() => {})

  return { success: true, accion, estado: nuevoEstado, cita: actualizada }
}

// ═══════════════════════════════════════════════════════════════
// CATÁLOGO
// ═══════════════════════════════════════════════════════════════

/** volkern_list_catalogo — {tipo?, activo?, categoria?, etiqueta?, search?, page?, limit?} */
export async function listarCatalogoMcp(input: any) {
  const { tenantId, tipo, activo = true, categoria, etiqueta, search, page = 1, limit = 50 } = input
  const resultado = await searchCatalog({
    tenantId,
    search,
    tipo,
    categoria,
    etiqueta,
    activo,
    limit,
    offset: (page - 1) * limit,
  } as any)
  return { ...resultado, page, limit }
}

/** volkern_create_catalogo_item — {nombre, precioBase, ...} */
export async function crearCatalogoItemMcp(input: any) {
  const { tenantId, userId, nombre, precioBase } = input
  if (!nombre || precioBase === undefined || precioBase === null) {
    throw new Error('nombre y precioBase son requeridos')
  }
  const precio = Number(precioBase)
  if (!Number.isFinite(precio)) throw new Error('precioBase debe ser numérico')

  // El catálogo anuncia customFields[]; el modelo guarda customFieldValues
  let customFieldValues = input.customFieldValues ?? null
  if (!customFieldValues && Array.isArray(input.customFields)) {
    customFieldValues = Object.fromEntries(
      input.customFields.filter((f: any) => f?.key).map((f: any) => [f.key, f.value])
    )
  }

  const fiscalConfig = await getFiscalConfig(tenantId).catch(() => null)
  const sku = input.sku || null

  // IDEMPOTENCIA: mismo SKU en el tenant → devolver el item existente en vez
  // de chocar con la constraint @@unique([tenantId, sku]) (que respondería
  // P2002/500). La clave es el SKU, no el payload: si el create repetido
  // trae otros nombre/precio, el item devuelto conserva los originales.
  if (sku) {
    const existente = await prisma.catalogoItem.findUnique({
      where: { tenantId_sku: { tenantId, sku } },
    })
    if (existente) {
      return {
        item: existente,
        yaExistia: true,
        mensaje: `Ya existía un item con SKU "${sku}"; no se duplicó.`,
      }
    }
  }

  const item = await prisma.catalogoItem.create({
    data: {
      tenantId,
      nombre,
      descripcion: input.descripcion ?? null,
      sku,
      tipo: input.tipo || 'servicio',
      precioBase: precio,
      // La divisa sale del dato o de la configuración fiscal del tenant: un
      // `'EUR'` escrito aquí encarecía en euros el catálogo de un tenant con la
      // moneda en pesos. Sin dato, la red de seguridad la pone el módulo de
      // dinero (el esquema exige un valor, no una opinión).
      moneda: monedaEscritura(input.moneda, fiscalConfig?.currencyCode),
      categoriaFiscal: input.categoriaFiscal || 'general',
      tasaImpuestoId: input.tasaImpuestoId || null,
      duracionMinutos: input.duracionMinutos ? Number(input.duracionMinutos) : null,
      modalidad: input.modalidad || null,
      unidad: input.unidad || 'unidad',
      activo: input.activo ?? true,
      destacado: input.destacado ?? false,
      customFieldValues,
      categorias: input.categorias || [],
      etiquetas: input.etiquetas || [],
      metadata: input.metadata ?? null,
      media: input.media ?? null,
      pricing: input.pricing ?? null,
      integrityHash: ItemIntegrityService.calculateHash({
        tenantId,
        nombre,
        sku: sku || '',
        precioBase: precio,
        costOfAcquisition: 0,
      }),
    },
    include: { tasaImpuesto: true },
  })

  // Un inmueble creado por el asistente también tiene que aparecer ya.
  if (item.tipo === 'inmueble') {
    await revalidarPortalDeInmueble(tenantId, item.id)
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: userId || 'mcp',
      accion: 'crear',
      entidad: 'catalogo_item',
      entidadId: item.id,
      descripcion: `Item "${nombre}" creado vía MCP (${item.precioBase} ${item.moneda})`,
    },
  }).catch(() => {})

  return { item, yaExistia: false, mensaje: `Item "${nombre}" creado.` }
}

/** volkern_update_catalogo_item — {itemId, ...campos parciales} */
export async function actualizarCatalogoItemMcp(input: any) {
  const { tenantId, userId, itemId, customFields, ...resto } = input
  if (!itemId) throw new Error('itemId es requerido')
  const existente = await prisma.catalogoItem.findFirst({ where: { id: itemId, tenantId } })
  if (!existente) throw new Error('Item de catálogo no encontrado')

  const data: any = {}
  const campos = ['nombre', 'descripcion', 'sku', 'tipo', 'moneda', 'categoriaFiscal', 'tasaImpuestoId', 'modalidad', 'unidad', 'activo', 'destacado', 'metadata', 'media', 'pricing']
  for (const campo of campos) {
    if (resto[campo] !== undefined) data[campo] = resto[campo]
  }
  if (resto.precioBase !== undefined) data.precioBase = Number(resto.precioBase)
  if (resto.duracionMinutos !== undefined) data.duracionMinutos = resto.duracionMinutos ? Number(resto.duracionMinutos) : null
  if (customFields !== undefined) {
    data.customFieldValues = Array.isArray(customFields)
      ? Object.fromEntries(customFields.filter((f: any) => f?.key).map((f: any) => [f.key, f.value]))
      : customFields
  }
  if (resto.customFieldValues !== undefined) data.customFieldValues = resto.customFieldValues
  if (resto.categorias !== undefined) data.categorias = resto.categorias
  if (resto.etiquetas !== undefined) data.etiquetas = resto.etiquetas

  const item = await prisma.catalogoItem.update({ where: { id: itemId }, data })

  // Recalcular hash de integridad si cambió algo que protege
  if (data.nombre !== undefined || data.sku !== undefined || data.precioBase !== undefined) {
    const nombre = data.nombre ?? existente.nombre
    const sku = data.sku ?? existente.sku
    const precioBase = data.precioBase ?? existente.precioBase
    await prisma.catalogoItem.update({
      where: { id: itemId },
      data: {
        integrityHash: ItemIntegrityService.calculateHash({
          tenantId,
          nombre,
          sku: sku || '',
          precioBase,
          costOfAcquisition: existente.costOfAcquisition,
        }),
      },
    })
  }

  if ((data.tipo ?? existente.tipo) === 'inmueble') {
    await revalidarPortalDeInmueble(tenantId, itemId)
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: userId || 'mcp',
      accion: 'actualizar',
      entidad: 'catalogo_item',
      entidadId: itemId,
      descripcion: `Item "${item.nombre}" actualizado vía MCP`,
      cambiosAntes: { nombre: existente.nombre, precioBase: existente.precioBase },
      cambiosDespues: { nombre: item.nombre, precioBase: item.precioBase },
    },
  }).catch(() => {})

  return prisma.catalogoItem.findUnique({ where: { id: itemId }, include: { tasaImpuesto: true } })
}

// ═══════════════════════════════════════════════════════════════
// SERVICIOS (LEGACY — usa catálogo)
// ═══════════════════════════════════════════════════════════════

/** volkern_list_servicios — {activo?} */
export async function listarServiciosMcp(input: any) {
  const { tenantId, activo = true } = input
  const where: any = { tenantId }
  if (activo !== 'all' && activo !== false) where.activo = activo === true || activo === 'true'
  else if (activo === false || activo === 'false') where.activo = false
  const servicios = await prisma.servicio.findMany({ where, orderBy: { fechaCreacion: 'asc' } })
  return { servicios, total: servicios.length }
}

/** volkern_get_servicio — {servicioId} */
export async function obtenerServicioMcp(input: any) {
  const { tenantId, servicioId } = input
  if (!servicioId) throw new Error('servicioId es requerido')
  const servicio = await prisma.servicio.findFirst({ where: { id: servicioId, tenantId } })
  if (!servicio) throw new Error('Servicio no encontrado')
  return servicio
}

// ═══════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════

/** volkern_list_tasks — {leadId} */
export async function listarTasksMcp(input: any) {
  const { leadId } = input
  if (!leadId) throw new Error('leadId es requerido')
  const tareas = await prisma.task.findMany({
    where: { leadId },
    orderBy: { fechaVencimiento: 'asc' },
  })
  return { tareas, total: tareas.length }
}

// ═══════════════════════════════════════════════════════════════
// MENSAJERÍA
// ═══════════════════════════════════════════════════════════════

/** volkern_send_whatsapp — {leadId, mensaje, tipo?} */
export async function enviarWhatsappMcp(input: any) {
  const { tenantId, leadId, mensaje, tipo = 'texto' } = input
  if (!leadId || !mensaje) throw new Error('leadId y mensaje son requeridos')
  if (tipo !== 'texto') throw new Error(`El envío de ${tipo} vía MCP aún no está soportado; usa texto`)
  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId } })
  if (!lead) throw new Error('Lead no encontrado')
  if (!lead.telefono) throw new Error('El lead no tiene teléfono registrado')
  const resultado = await sendWhatsAppMessage(lead.telefono, mensaje, tenantId)
  return { success: true, leadId, telefono: lead.telefono, resultado }
}

/** volkern_list_conversaciones — {leadId?, page?, limit?} */
export async function listarConversacionesMcp(input: any) {
  const { tenantId, leadId, page = 1, limit = 50 } = input
  const where: any = { tenantId }
  if (leadId) where.leadId = leadId
  const [conversaciones, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { fechaUltimoMensaje: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.conversation.count({ where }),
  ])
  return { conversaciones, total, page, limit }
}

// ═══════════════════════════════════════════════════════════════
// INTERACCIONES
// ═══════════════════════════════════════════════════════════════

/** volkern_list_interactions — {leadId} */
export async function listarInteraccionesMcp(input: any) {
  const { leadId } = input
  if (!leadId) throw new Error('leadId es requerido')
  const interacciones = await prisma.interaction.findMany({
    where: { leadId },
    orderBy: { fechaCreacion: 'desc' },
  })
  return { interacciones, total: interacciones.length }
}

/** volkern_create_interaction — {leadId, tipo, contenido, resultado?, metadatos?} */
export async function crearInteraccionMcp(input: any) {
  const { tenantId, userId, leadId, tipo, contenido, resultado, metadatos } = input
  if (!leadId || !tipo || !contenido) throw new Error('leadId, tipo y contenido son requeridos')
  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId }, select: { id: true } })
  if (!lead) throw new Error('Lead no encontrado')
  return prisma.interaction.create({
    data: {
      leadId,
      tipo,
      contenido,
      resultado,
      metadatos: metadatos ?? null,
      creadoPor: userId || null,
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// NOTAS
// ═══════════════════════════════════════════════════════════════

/** volkern_list_notes — {leadId} */
export async function listarNotasMcp(input: any) {
  const { leadId } = input
  if (!leadId) throw new Error('leadId es requerido')
  const notas = await prisma.note.findMany({
    where: { leadId },
    orderBy: { fechaCreacion: 'desc' },
  })
  return { notas, total: notas.length }
}

// ═══════════════════════════════════════════════════════════════
// ÓRDENES DE VENTA
// ═══════════════════════════════════════════════════════════════

/** volkern_list_ordenes_venta — {estado?, leadId?, contactId?, dealId?, contratoId?, fechaDesde?, fechaHasta?, search?, page?, limit?} */
export async function listarOrdenesVentaMcp(input: any) {
  const { tenantId, estado, leadId, contactId, dealId, contratoId, fechaDesde, fechaHasta, search, page = 1, limit = 50 } = input
  const where: any = { tenantId }
  if (estado) where.estado = estado
  if (leadId) where.leadId = leadId
  if (contactId) where.contactId = contactId
  if (dealId) where.dealId = dealId
  if (contratoId) where.contratoId = contratoId
  if (fechaDesde || fechaHasta) {
    where.fechaOrden = {
      ...(fechaDesde ? { gte: new Date(fechaDesde) } : {}),
      ...(fechaHasta ? { lte: new Date(fechaHasta) } : {}),
    }
  }
  if (search) where.numero = { contains: search, mode: 'insensitive' }
  const [ordenes, total] = await Promise.all([
    prisma.ordenVenta.findMany({
      where,
      include: { items: { include: { catalogoItem: { select: { id: true, nombre: true, sku: true } } } } },
      orderBy: { fechaOrden: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.ordenVenta.count({ where }),
  ])
  return { ordenes, total, page, limit }
}

/** volkern_get_orden_venta — {ordenId} */
export async function obtenerOrdenVentaMcp(input: any) {
  const { tenantId, ordenId } = input
  if (!ordenId) throw new Error('ordenId es requerido')
  const orden = await prisma.ordenVenta.findFirst({
    where: { id: ordenId, tenantId },
    include: {
      items: { include: { catalogoItem: { select: { id: true, nombre: true, sku: true } } } },
      lead: { select: { id: true, nombre: true, email: true } },
      cotizacion: { select: { id: true, numero: true, titulo: true } },
    },
  })
  if (!orden) throw new Error('Orden de venta no encontrada')
  return { orden }
}

/** volkern_create_orden_from_cotizacion — {cotizacionId, ...} */
export async function crearOrdenDesdeCotizacionMcp(input: any) {
  const { tenantId, userId, cotizacionId, fechaEntrega, notas, notasInternas, condicionesVenta, referenciaCliente, ajustarPrecios } = input
  if (!cotizacionId) throw new Error('cotizacionId es requerido')
  const { orden, yaExistia } = await crearOrdenVentaDesdeCotizacion({
    cotizacionId,
    tenantId,
    userId: userId || null,
    fechaEntrega: fechaEntrega || null,
    notas: notas || null,
    notasInternas: notasInternas || null,
    condicionesVenta: condicionesVenta || null,
    referenciaCliente: referenciaCliente || null,
    ajustarPrecios: ajustarPrecios ?? false,
  })
  const mensaje = yaExistia
    ? `La cotización ya tiene la orden de venta ${orden.numero}`
    : `Orden de venta ${orden.numero} creada exitosamente desde la cotización`
  return { orden, yaExistia, mensaje }
}

// ═══════════════════════════════════════════════════════════════
// CONTRATOS
// ═══════════════════════════════════════════════════════════════

/** volkern_create_contrato_from_cotizacion — {cotizacionId, tipo?, ...} */
export async function crearContratoDesdeCotizacionMcp(input: any) {
  const { tenantId, userId, cotizacionId, tipo, fechaInicio, fechaFin, metodoPago, condicionesPago, frecuenciaPago, diaPago, clausulas, notasInternas, notasCliente, ajustarPrecios } = input
  if (!cotizacionId) throw new Error('cotizacionId es requerido')
  return crearContratoDesdeCotizacion({
    cotizacionId,
    tenantId,
    userId: userId || null,
    tipo: tipo || 'servicio',
    fechaInicio: fechaInicio || null,
    fechaFin: fechaFin || null,
    metodoPago: metodoPago || null,
    condicionesPago: condicionesPago || null,
    frecuenciaPago: frecuenciaPago || null,
    diaPago: diaPago ?? null,
    clausulas: clausulas || null,
    notasInternas: notasInternas || null,
    notasCliente: notasCliente || null,
    ajustarPrecios: ajustarPrecios ?? false,
  })
}

// ═══════════════════════════════════════════════════════════════
// COTIZACIÓN DESDE CATÁLOGO (contrato catalogItems del standalone)
// ═══════════════════════════════════════════════════════════════

/** volkern_create_cotizacion — {titulo, catalogItems[], dealId?, leadId?, ...} */
export async function crearCotizacionMcp(input: any) {
  const { tenantId, userId, titulo, catalogItems, dealId, leadId, contactId, descripcion, descuentoPorcentaje, moneda, validezDias, terminosPago, notasCliente, notasInternas, clienteNombre, clienteEmail, clienteEmpresa, clienteTelefono, emisorId } = input
  if (!titulo) throw new Error('titulo es requerido')
  if (!Array.isArray(catalogItems) || catalogItems.length === 0) {
    throw new Error('catalogItems es requerido (array con al menos un {catalogoItemId, cantidad})')
  }
  const { cotizacion } = await crearCotizacionDesdeCatalogo({
    tenantId,
    userId: userId || null,
    titulo,
    catalogItems,
    dealId: dealId || null,
    leadId: leadId || null,
    contactId: contactId || null,
    descripcion: descripcion || null,
    descuentoPorcentaje,
    moneda: moneda || null,
    validezDias,
    terminosPago: terminosPago || null,
    notasCliente: notasCliente || null,
    notasInternas: notasInternas || null,
    clienteNombre: clienteNombre || null,
    clienteEmail: clienteEmail || null,
    clienteEmpresa: clienteEmpresa || null,
    clienteTelefono: clienteTelefono || null,
    emisorId: emisorId || null,
  })
  return { cotizacion, mensaje: `Cotización ${cotizacion.numero} creada por ${cotizacion.total} ${cotizacion.moneda}` }
}

// ═══════════════════════════════════════════════════════════════
// ERP FINANZAS / PRODUCCIÓN
// ═══════════════════════════════════════════════════════════════

/** volkern_get_financial_dashboard — {months?} */
export async function dashboardFinancieroMcp(input: any) {
  const { tenantId, months = 1 } = input
  const [forecast, impuestos] = await Promise.all([
    projectFinancialForecast({ tenantId }),
    taxProspector({ tenantId, region: 'ES' }),
  ])
  return { periodoMeses: Number(months) || 1, forecast, impuestos }
}

/** volkern_verify_vault_integrity — {} */
export async function verificarIntegridadVaultMcp(input: any) {
  const { tenantId } = input
  const integro = await verifyFinancialIntegrity(tenantId)
  return { integro, mensaje: integro ? 'La cadena de integridad del vault financiero es válida.' : '⚠️ Se detectaron manipulaciones en la cadena de hashes.' }
}

/** volkern_calculate_tax_provisions — {country} */
export async function calcularProvisionesFiscalesMcp(input: any) {
  const { tenantId, country = 'ES' } = input
  if (!['MX', 'ES', 'USA_LLC'].includes(country)) {
    throw new Error(`country inválido: ${country} (MX | ES | USA_LLC)`)
  }
  const projection = await taxProspector({ tenantId, region: country })
  return { region: country, projection }
}

/** volkern_report_production_scrap — {workOrderId, itemId, quantity, evidenceUrl, lat?, lng?, timestamp?} */
export async function reportarMermaMcp(input: any) {
  const { tenantId, userId, workOrderId, itemId, quantity, evidenceUrl, lat, lng, timestamp } = input
  if (!workOrderId || !itemId || quantity === undefined || !evidenceUrl) {
    throw new Error('workOrderId, itemId, quantity y evidenceUrl son obligatorios')
  }
  return ProductionService.reportWaste({
    tenantId,
    workOrderId,
    itemId,
    quantity: parseFloat(quantity),
    evidenceUrl,
    userId: userId || undefined,
    reportLat: lat,
    reportLng: lng,
    clientTimestamp: timestamp,
  } as any)
}

// ═══════════════════════════════════════════════════════════════
// CONTACTOS
// ═══════════════════════════════════════════════════════════════

/** volkern_delete_contact — {contactId, justificacion?} */
export async function eliminarContactoMcp(input: any) {
  const { tenantId, userId, contactId, justificacion } = input
  if (!contactId) throw new Error('contactId es requerido')

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
    include: { _count: { select: { deals: true } } },
  })
  if (!contact) throw new Error('Contacto no encontrado')
  if (contact._count.deals > 0) {
    throw new Error('No se puede eliminar un contacto con deals asociados')
  }

  // COMPLIANCE GATE: verificar justificación antes de eliminar (RGPD)
  const gateResult = await ComplianceGate.check({
    tenantId,
    userId: userId || 'mcp',
    action: 'contact_delete',
    entityId: contactId,
    entityType: 'contact',
    metadata: { justification: justificacion },
  } as any)
  if (!gateResult.allowed) {
    throw new Error(`Eliminación bloqueada por compliance: ${gateResult.reason || 'requiere justificación'}`)
  }

  await prisma.contact.delete({ where: { id: contactId } })

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: userId || 'mcp',
      accion: 'eliminar',
      entidad: 'contact',
      entidadId: contactId,
      descripcion: `Contacto "${contact.nombre}" eliminado vía MCP. Justificación: ${justificacion || 'No provista'}`,
      cambiosAntes: { nombre: contact.nombre, email: contact.email },
    },
  }).catch(() => {})

  return { success: true, message: 'Contacto eliminado correctamente' }
}
