export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  buildQuickReplyMarkup,
  clearReplyMarkup,
  parseQuickReplyCallback,
  sendBotMessage,
} from '@/lib/telegram/quick-replies'
import { createExpenseInboxDocument } from '@/lib/finance/expense-inbox'
import { buildTelegramExpenseSummary, canDiscardTelegramExpenseStatus, canRestoreTelegramExpenseStatus, isTelegramCommand, parseTelegramInvoiceDate, parseTelegramNumber } from '@/lib/finance/telegram-expense'
import { getDownloadUrl } from '@/lib/s3'
import { callVision } from '@/app/api/erp/expenses/scan/route'
import { buildTaskCalendarMarkup } from '@/lib/telegram/task-calendar'
import { buildTaskButtonsMarkup } from '@/lib/telegram/task-buttons'

/**
 * Webhook directo de Telegram — pipeline unificado
 *
 * Flujos soportados:
 * 1. /start → vincula el chat_id como admin_chat_id de una integración del tenant
 * 2. callback_query (admin_buy:|reject_buy:) → flujo watchdog de aprobación de compras (no usa chatbot)
 * 3. callback_query (qr:...) → quick reply del chatbot (re-envía el texto al pipeline unificado)
 * 4. Mensajes normales → chatbot-service unificado (tool calling + quick replies como inline_keyboard)
 */

// Timeout para la pipeline unificada (Telegram cierra el webhook a los 30s)
const PIPELINE_TIMEOUT_MS = 25000

// Ventana para rate-limit por chat (evita abuso si una integración queda expuesta)
const RATE_LIMIT_WINDOW_MS = 1500

// TTL anti-duplicado para update_id (Telegram puede reenviar el mismo webhook)
const UPDATE_DEDUPE_TTL_MS = 30000

// Umbral bajo para limpieza de caches in-memory en instancias warm
const LRU_CLEANUP_THRESHOLD = 1000

// ─── Rate-limit LRU simple (en memoria, por instancia serverless) ─────────
const lastCallByChat = new Map<string, number>()

function isRateLimited(chatId: string): boolean {
  const now = Date.now()
  const last = lastCallByChat.get(chatId)
  if (last !== undefined && now - last < RATE_LIMIT_WINDOW_MS) {
    return true
  }
  lastCallByChat.set(chatId, now)
  if (lastCallByChat.size > LRU_CLEANUP_THRESHOLD) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS * 10
    for (const [k, v] of lastCallByChat) {
      if (v < cutoff) lastCallByChat.delete(k)
    }
  }
  return false
}

// Respuesta 429 explícita: Telegram reintenta el webhook con backoff y el
// mensaje no se pierde (antes se descartaba silenciosamente con { ok: true }).
function rateLimitedResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: 'rate_limited', retry_after: 2 },
    { status: 429, headers: { 'Retry-After': '2' } }
  )
}

// ─── Anti-duplicado de update_id (TTL corto, protege contra retries) ─────
const processedUpdateIds = new Map<string, number>()

function isUpdateProcessed(updateId: string | number | undefined): boolean {
  if (updateId === undefined) return false
  const key = String(updateId)
  const now = Date.now()
  const last = processedUpdateIds.get(key)
  if (last !== undefined && now - last < UPDATE_DEDUPE_TTL_MS) {
    return true
  }
  processedUpdateIds.set(key, now)
  if (processedUpdateIds.size > LRU_CLEANUP_THRESHOLD) {
    const cutoff = now - UPDATE_DEDUPE_TTL_MS
    for (const [k, v] of processedUpdateIds) {
      if (v < cutoff) processedUpdateIds.delete(k)
    }
  }
  return false
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface TelegramContext {
  tenantId: string
  botToken: string
}

/**
 * Encuentra el tenant y el bot_token para responder a un chat_id.
 *
 * 1) Primero busca si el chatId coincide con algún admin_chat_id configurado
 *    (caso típico: admin usando el bot desde Telegram).
 * 2) Si no, hace fallback a la primera integración activa de Telegram con bot_token
 *    (casos legacy: un único bot activo en el sistema).
 */
async function findTelegramContext(chatId: string, exactOnly = false): Promise<TelegramContext | null> {
  const integrations = await prisma.integration.findMany({
    where: { tipo: 'telegram', activo: true },
    select: { id: true, tenantId: true, credenciales: true, nombre: true },
  })

  // 1. Match exacto por admin_chat_id
  for (const integration of integrations) {
    const creds = integration.credenciales as any
    if (creds?.admin_chat_id === chatId && creds?.bot_token) {
      return { tenantId: integration.tenantId, botToken: creds.bot_token }
    }
  }

  // 2. Fallback: primera integración con bot_token. Para archivos no se usa
  // este fallback: solo el admin_chat_id exacto puede alimentar la bandeja.
  if (exactOnly) return null
  for (const integration of integrations) {
    const creds = integration.credenciales as any
    if (creds?.bot_token) {
      return { tenantId: integration.tenantId, botToken: creds.bot_token }
    }
  }

  return null
}



/**
 * Busca el bot_token de Telegram de un tenant, soportando ambos modelos:
 * 1) Integration legacy (credenciales.bot_token en texto plano)
 * 2) Channel moderno (config.botToken cifrado con AES)
 */
async function findTenantBotToken(tenantId: string): Promise<string | null> {
  const integration = await prisma.integration.findFirst({
    where: { tenantId, tipo: 'telegram', activo: true },
    select: { credenciales: true },
  })
  const creds = integration?.credenciales as any
  if (creds?.bot_token) return creds.bot_token

  const channel = await prisma.channel.findFirst({
    where: { tenantId, type: 'telegram' },
    select: { config: true },
  })
  const config = channel?.config as any
  if (config?.botToken) {
    const { decrypt } = await import('@/lib/core/crypto')
    return decrypt(config.botToken)
  }
  return process.env.TELEGRAM_BOT_TOKEN || null
}

/**
 * Procesa un mensaje (texto del usuario o callback_data de quick reply)
 * a través del pipeline unificado y envía la respuesta al chat.
 * Envuelto en timeout para no superar los 30s que Telegram permite.
 */
async function processAndReply(
  chatId: string,
  senderName: string,
  messageText: string,
  ctx: TelegramContext
): Promise<void> {
  try {
    const { processMessage: unifiedProcessMessage } = await import('@/lib/chat/chatbot-service')

    const pipelineCall = unifiedProcessMessage({
      tenantId: ctx.tenantId,
      conversationId: `telegram:${chatId}`,
      message: messageText,
      channel: 'telegram',
      contactName: senderName,
      contactPhone: chatId,
      // userId en formato telegram:<chatId> para que los skills resuelvan el
      // usuario real del tenant (metadata.telegram.chat_id) y `asignadoA` de
      // tareas nuevas apunte a un User válido, no a un id de conversación.
      userId: `telegram:${chatId}`,
    })

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PIPELINE_TIMEOUT')), PIPELINE_TIMEOUT_MS)
    )

    const result = await Promise.race([pipelineCall, timeout])

    // Rate limit interno del chatbot → no enviar respuesta
    if (!result.success && result.error === 'rate_limit') {
      return
    }

    const replyText = result.response || 'Lo siento, no pude procesar tu mensaje.'

    let replyMarkup: Record<string, unknown> | undefined =
      result.quickReplies && result.quickReplies.length > 0
        ? buildQuickReplyMarkup(result.quickReplies)
        : undefined

    // Botones inline de acciones de tareas: una fila por tarea con
    // Completar / Reprogramar / Recordar más tarde (prioridad sobre quick replies).
    if (result.taskButtons?.length) {
      replyMarkup = buildTaskButtonsMarkup(result.taskButtons)
    }

    await sendBotMessage(chatId, replyText, ctx.botToken, replyMarkup)
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === 'PIPELINE_TIMEOUT'
    console.error('[TelegramWebhook] Error en processAndReply:', error)

    try {
      await sendBotMessage(
        chatId,
        isTimeout
          ? '⏳ Estoy tardando más de lo normal. Por favor, intenta de nuevo en unos segundos.'
          : '❌ Ocurrió un error procesando tu mensaje. Intenta de nuevo en unos segundos.',
        ctx.botToken
      )
    } catch (sendErr) {
      console.error('[TelegramWebhook] Error enviando fallback:', sendErr)
    }
  }
}

async function findTelegramAdmin(tenantId: string, chatId: string): Promise<{ id: string } | null> {
  const candidates = await prisma.user.findMany({
    where: { tenantId, role: { nombre: 'ADMIN' } },
    select: { id: true, metadata: true },
    take: 50,
  })
  const linkedAdmin = candidates.find(user => {
    const meta = (user.metadata as any) || {}
    return String(meta.telegram_chat_id || meta.telegram?.chat_id || '') === chatId
  })
  if (linkedAdmin) return { id: linkedAdmin.id }

  // `/start` guarda el chat en la integración, no necesariamente en el metadata
  // del usuario. Aceptamos ese vínculo exacto y usamos un administrador del tenant
  // como creador del documento, sin abrir el fallback global del bot.
  const integration = await prisma.integration.findFirst({
    where: { tenantId, tipo: 'telegram', activo: true },
    select: { credenciales: true },
  })
  const credentials = (integration?.credenciales as any) || {}
  if (String(credentials.admin_chat_id || '') !== chatId) return null
  const firstAdmin = candidates[0]
  return firstAdmin ? { id: firstAdmin.id } : null
}

async function ingestTelegramDocument(message: any, ctx: TelegramContext, chatId: string): Promise<{ id: string; fileName: string } | null> {
  const telegramDocument = message.document || null
  const telegramPhoto = Array.isArray(message.photo) && message.photo.length > 0 ? message.photo[message.photo.length - 1] : null
  const fileId = telegramDocument?.file_id || telegramPhoto?.file_id
  if (!fileId) return null

  const admin = await findTelegramAdmin(ctx.tenantId, chatId)
  if (!admin) return null

  const fileInfoResponse = await fetch(`https://api.telegram.org/bot${ctx.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(10000) })
  const fileInfo = await fileInfoResponse.json()
  const filePath = fileInfo?.result?.file_path
  if (!fileInfoResponse.ok || !fileInfo?.ok || !filePath) throw new Error('Telegram no devolvió la ruta del archivo')

  const downloadResponse = await fetch(`https://api.telegram.org/file/bot${ctx.botToken}/${filePath}`, { signal: AbortSignal.timeout(20000) })
  if (!downloadResponse.ok) throw new Error(`Telegram no pudo descargar el archivo (${downloadResponse.status})`)
  const buffer = Buffer.from(await downloadResponse.arrayBuffer())
  if (buffer.length > 25 * 1024 * 1024) throw new Error('El archivo supera el límite de 25 MB')

  const fileName = telegramDocument?.file_name || (filePath.split('/').pop() || `telegram-${Date.now()}.jpg`)
  const contentType = telegramDocument?.mime_type || (fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
  const document = await createExpenseInboxDocument({
    tenantId: ctx.tenantId,
    createdById: admin.id,
    buffer,
    fileName,
    contentType,
    documentType: 'invoice',
  })
  return { id: document.id, fileName }
}

async function processInboxOcr(documentId: string, ctx: TelegramContext, chatId: string): Promise<void> {
  const document = await prisma.expenseInboxDocument.findFirst({
    where: { id: documentId, tenantId: ctx.tenantId, status: { in: ['PENDING_REVIEW', 'REVIEW', 'ERROR'] } },
    select: { id: true, fileName: true, storageKey: true, status: true, pageStart: true, pageEnd: true },
  })
  if (!document) {
    await sendBotMessage(chatId, '❌ Documento no encontrado en tu bandeja.', ctx.botToken)
    return
  }

  await prisma.expenseInboxDocument.update({ where: { id: document.id }, data: { status: 'PROCESSING', errorMessage: null } })
  try {
    const downloadUrl = await getDownloadUrl(document.storageKey, 300)
    const download = await fetch(downloadUrl, { signal: AbortSignal.timeout(25000) })
    if (!download.ok) throw new Error(`No se pudo recuperar el documento (${download.status})`)
    const buffer = Buffer.from(await download.arrayBuffer())
    const mimeType = document.fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
    const vision = await callVision(buffer, mimeType)
    if (!vision.result) throw new Error('El OCR no pudo extraer datos del documento')

    await prisma.expenseInboxDocument.update({
      where: { id: document.id },
      data: { status: 'REVIEW', extractedData: vision.result as any },
    })
    const result = vision.result
    const summary = `✅ OCR completado\n\n${buildTelegramExpenseSummary({
      fileName: document.fileName,
      status: 'REVIEW',
      pageStart: document.pageStart,
      pageEnd: document.pageEnd,
      extractedData: result,
    })}`
    await sendBotMessage(chatId, summary, ctx.botToken, {
      inline_keyboard: [[{ text: '✅ Confirmar y registrar gasto', callback_data: `inbox:confirm:${document.id}` }]],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error OCR desconocido'
    await prisma.expenseInboxDocument.update({ where: { id: document.id }, data: { status: 'ERROR', errorMessage: message } })
    await sendBotMessage(chatId, `❌ No pude analizar <b>${document.fileName}</b>: ${message}`, ctx.botToken)
  }
}

async function confirmInboxExpense(documentId: string, ctx: TelegramContext, chatId: string): Promise<void> {
  const admin = await findTelegramAdmin(ctx.tenantId, chatId)
  const document = await prisma.expenseInboxDocument.findFirst({
    where: { id: documentId, tenantId: ctx.tenantId, status: 'REVIEW' },
  })
  if (!admin || !document) {
    await sendBotMessage(chatId, '❌ El documento no está disponible para confirmar.', ctx.botToken)
    return
  }

  const extracted = (document.extractedData as any) || {}
  const totals = extracted.totales || {}
  const supplierName = String(extracted.emisor?.nombre || extracted.supplier || '').trim()
  const total = Number(totals.total_factura ?? extracted.total)
  if (!supplierName || !Number.isFinite(total) || total <= 0) {
    await sendBotMessage(chatId, '⚠️ Faltan proveedor o total. Abre el documento en la bandeja web para corregirlo antes de confirmar.', ctx.botToken)
    return
  }
  const base = Number(totals.base_imponible ?? extracted.taxableBase)
  const vat = Number(totals.cuota_iva ?? extracted.vatAmount)
  const surcharge = Number(totals.cuota_recargo)
  const irpf = Math.abs(Number(totals.cuota_irpf))
  const operationType = String(extracted.tipo_operacion || 'nacional').toLowerCase()
  const excludesSpanishVat = ['intracomunitaria', 'inversion_sujeto_pasivo', 'exportacion', 'exenta', 'no_sujeta', 'canarias_igic'].includes(operationType)
  if (Number.isFinite(base) && base > 0) {
    const expected = base + (excludesSpanishVat ? 0 : (Number.isFinite(vat) ? vat : 0)) + (Number.isFinite(surcharge) ? surcharge : 0) - (Number.isFinite(irpf) ? irpf : 0)
    if (Math.abs(expected - total) > 0.02) {
      await sendBotMessage(chatId, `⚠️ El total no cuadra (${expected.toFixed(2)} esperado frente a ${total.toFixed(2)} detectado). Corrígelo en la bandeja web antes de confirmar.`, ctx.botToken)
      return
    }
  }

  const taxId = extracted.emisor?.nif || extracted.issuerTaxId || undefined
  const supplier = await prisma.supplier.findFirst({
    where: taxId
      ? { tenantId: ctx.tenantId, OR: [{ taxId }, { name: { equals: supplierName, mode: 'insensitive' } }] }
      : { tenantId: ctx.tenantId, name: { equals: supplierName, mode: 'insensitive' } },
  }) || await prisma.supplier.create({
    data: {
      tenantId: ctx.tenantId,
      name: supplierName,
      taxId,
      category: extracted.category || 'otros',
      active: true,
    },
  })

  const invoiceNumber = extracted.numero_factura || extracted.invoiceNumber || undefined
  if (invoiceNumber) {
    const duplicate = await prisma.expense.findFirst({
      where: { tenantId: ctx.tenantId, supplierId: supplier.id, invoiceNumber },
      select: { id: true },
    })
    if (duplicate) {
      await prisma.expenseInboxDocument.update({ where: { id: document.id }, data: { status: 'ERROR', errorMessage: 'Posible factura duplicada' } })
      await sendBotMessage(chatId, `⚠️ La factura <b>${invoiceNumber}</b> ya existe para este proveedor. No se creó otro gasto.`, ctx.botToken)
      return
    }
  }

  const { skills } = await import('@/lib/skills')
  const expense = await (skills.create_expense as any)({
    tenantId: ctx.tenantId,
    createdById: admin.id,
    supplierId: supplier.id,
    description: `Gasto en ${supplierName}`,
    amount: total,
    currency: extracted.moneda || 'EUR',
    date: parseTelegramInvoiceDate(extracted.fecha_emision || extracted.date),
    dueDate: parseTelegramInvoiceDate(extracted.fecha_vencimiento),
    paymentMethod: extracted.forma_pago,
    category: extracted.category || 'otros',
    receiptUrl: document.storageKey,
    status: 'PAID',
    invoiceNumber,
    serie: extracted.serie || undefined,
    taxableBase: totals.base_imponible ?? extracted.taxableBase ?? undefined,
    vatRate: totals.tipo_iva ?? extracted.vatRate ?? undefined,
    vatAmount: totals.cuota_iva ?? extracted.vatAmount ?? undefined,
    irpfRate: totals.tipo_irpf ?? undefined,
    irpfAmount: totals.cuota_irpf ?? undefined,
    surchargeRate: totals.tipo_recargo ?? undefined,
    surchargeAmount: totals.cuota_recargo ?? undefined,
    taxRegime: extracted.regimen_fiscal || undefined,
    operationType: extracted.tipo_operacion || undefined,
    totalFactura: total,
    operationDate: parseTelegramInvoiceDate(extracted.fecha_operacion || extracted.operationDate),
    issuerName: supplierName,
    issuerAddress: extracted.emisor?.direccion || extracted.issuerAddress,
    issuerTaxId: taxId,
    receptorNombre: extracted.receptor?.nombre,
    receptorNif: extracted.receptor?.nif,
    receptorDireccion: extracted.receptor?.direccion,
    iban: extracted.iban,
    lineas: extracted.lineas,
    vatBreakdown: Array.isArray(totals.desglose_iva) ? totals.desglose_iva.map((row: any) => ({ rate: Number(row.tipo), base: Number(row.base), amount: Number(row.cuota) })) : undefined,
  })

  await prisma.expenseInboxDocument.update({ where: { id: document.id }, data: { status: 'PROCESSED', expenseId: expense.id } })
  await sendBotMessage(chatId, `✅ Gasto registrado: <b>${supplierName}</b> · ${extracted.moneda || 'EUR'} ${total.toFixed(2)}\nFactura: ${invoiceNumber || 'sin número'}`, ctx.botToken)
}

async function correctInboxField(documentId: string, field: string, value: string, ctx: TelegramContext, chatId: string): Promise<void> {
  const admin = await findTelegramAdmin(ctx.tenantId, chatId)
  const document = await prisma.expenseInboxDocument.findFirst({
    where: { id: documentId, tenantId: ctx.tenantId, status: { in: ['PENDING_REVIEW', 'REVIEW', 'ERROR'] } },
    select: { id: true, fileName: true, extractedData: true },
  })
  if (!admin || !document) {
    await sendBotMessage(chatId, '❌ Documento no encontrado o no disponible para corregir.', ctx.botToken)
    return
  }

  const extracted = JSON.parse(JSON.stringify(document.extractedData || {})) as any
  const totals = extracted.totales || (extracted.totales = {})
  const normalizedField = field.toLowerCase()
  const numericFields: Record<string, string> = {
    total: 'total_factura',
    total_factura: 'total_factura',
    base: 'base_imponible',
    base_imponible: 'base_imponible',
    iva: 'cuota_iva',
    cuota_iva: 'cuota_iva',
    recargo: 'cuota_recargo',
    cuota_recargo: 'cuota_recargo',
    irpf: 'cuota_irpf',
    cuota_irpf: 'cuota_irpf',
  }
  const dateFields: Record<string, string> = {
    fecha: 'fecha_emision',
    fecha_emision: 'fecha_emision',
    vencimiento: 'fecha_vencimiento',
    fecha_vencimiento: 'fecha_vencimiento',
  }
  const textFields: Record<string, string> = {
    proveedor: 'proveedor',
    emisor: 'proveedor',
    nif: 'nif_proveedor',
    nif_proveedor: 'nif_proveedor',
    factura: 'numero_factura',
    numero_factura: 'numero_factura',
    moneda: 'moneda',
    pago: 'forma_pago',
    forma_pago: 'forma_pago',
    operacion: 'tipo_operacion',
    tipo_operacion: 'tipo_operacion',
  }

  if (numericFields[normalizedField]) {
    const parsed = parseTelegramNumber(value)
    if (parsed === null) {
      await sendBotMessage(chatId, `❌ «${value}» no es un importe válido. Ejemplo: /gasto_corregir ${documentId} total 718,20`, ctx.botToken)
      return
    }
    totals[numericFields[normalizedField]] = parsed
    if (numericFields[normalizedField] === 'total_factura') extracted.total = parsed
  } else if (dateFields[normalizedField]) {
    if (!parseTelegramInvoiceDate(value)) {
      await sendBotMessage(chatId, `❌ Fecha no válida. Usa DD/MM/AAAA. Ejemplo: /gasto_corregir ${documentId} vencimiento 12/09/2026`, ctx.botToken)
      return
    }
    extracted[dateFields[normalizedField]] = value
    if (dateFields[normalizedField] === 'fecha_emision') extracted.date = value
  } else if (textFields[normalizedField]) {
    const target = textFields[normalizedField]
    if (!value.trim()) {
      await sendBotMessage(chatId, '❌ Debes indicar un valor después del nombre del campo.', ctx.botToken)
      return
    }
    if (target === 'proveedor') {
      extracted.supplier = value.trim()
      extracted.emisor = { ...(extracted.emisor || {}), nombre: value.trim() }
    } else if (target === 'nif_proveedor') {
      extracted.nif = value.trim().toUpperCase()
      extracted.emisor = { ...(extracted.emisor || {}), nif: value.trim().toUpperCase() }
    } else if (target === 'numero_factura') {
      extracted.invoiceNumber = value.trim()
      extracted.numero_factura = value.trim()
    } else if (target === 'tipo_operacion') {
      extracted.tipo_operacion = value.trim().toLowerCase()
    } else if (target === 'moneda') {
      extracted.moneda = value.trim().toUpperCase()
    } else if (target === 'forma_pago') {
      extracted.forma_pago = value.trim()
    }
  } else {
    await sendBotMessage(chatId, `Campo no reconocido. Usa: proveedor, nif, factura, fecha, vencimiento, total, base, iva, recargo, irpf, moneda, pago u operacion.`, ctx.botToken)
    return
  }

  await prisma.expenseInboxDocument.update({
    where: { id: document.id },
    data: { status: 'REVIEW', extractedData: extracted as any, errorMessage: null },
  })
  await sendBotMessage(chatId, `✅ ${normalizedField} actualizado en ${document.fileName}. Usa /gastos_pendientes para volver a analizar o confirmar.`, ctx.botToken)
}

// ─── Handler principal ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  console.log(`[AlternativeTelegramWebhook] Received POST request at ${new Date().toISOString()}`)
  try {
    const body = await request.json()

    // ════════════════════════════════════════════════════════════════════
    // 1. CALLBACK QUERY HANDLERS
    // ════════════════════════════════════════════════════════════════════

  if (body.callback_query) {
    const { callback_query } = body

    // Filtro: ignorar callbacks de otros bots + duplicados por update_id
    if (callback_query.from?.is_bot || isUpdateProcessed(callback_query.id)) {
      return NextResponse.json({ ok: true })
    }

      // 1a. Quick reply del chatbot (callback_data "qr:<texto>")
      const messageText = parseQuickReplyCallback(callback_query.data)
      if (messageText !== null) {
        const chatId = callback_query.message.chat.id.toString()
        const senderName =
          callback_query.from.first_name +
          (callback_query.from.last_name ? ` ${callback_query.from.last_name}` : '')

        const ctx = await findTelegramContext(chatId)
        if (ctx) {
          // Limpiamos el teclado del mensaje original para evitar clicks duplicados
          clearReplyMarkup(chatId, callback_query.message.message_id, ctx.botToken).catch(() => {})

          // Fire-and-forget (Telegram requiere <30s) — processAndReply envía
          // un fallback al usuario ante cualquier error, no necesitamos catch.
          processAndReply(chatId, senderName, messageText, ctx)
        }

        return NextResponse.json({
          method: 'answerCallbackQuery',
          callback_query_id: callback_query.id,
        })
      }

      // 1b. Bandeja de gastos: solo el admin exacto puede consultar o cambiar
      // documentos recibidos por Telegram.
      const chatId = callback_query.message.chat.id.toString()
      const data = callback_query.data || ''
      if (data.startsWith('inbox:')) {
        const [, action, documentId] = data.split(':')
        const ctx = await findTelegramContext(chatId, true)
        if (!ctx || !documentId || !['view', 'review', 'scan', 'confirm', 'discard', 'discard_confirm', 'restore'].includes(action)) {
          return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: '❌ No autorizado', show_alert: true })
        }
        const document = await prisma.expenseInboxDocument.findFirst({
          where: { id: documentId, tenantId: ctx.tenantId },
          select: { id: true, fileName: true, status: true, pageStart: true, pageEnd: true, createdAt: true, extractedData: true, errorMessage: true },
        })
        if (!document) {
          return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: 'Documento no encontrado', show_alert: true })
        }
        if (action === 'confirm') {
          await sendBotMessage(chatId, `⏳ Confirmando <b>${document.fileName}</b> y creando el gasto…`, ctx.botToken)
          void confirmInboxExpense(document.id, ctx, chatId)
        } else if (action === 'discard') {
          if (!canDiscardTelegramExpenseStatus(document.status)) {
            return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: 'Este documento ya no se puede descartar', show_alert: true })
          }
          await sendBotMessage(chatId, `⚠️ ¿Quieres descartar «${document.fileName}»? Se conservará el archivo, pero no aparecerá entre los pendientes.`, ctx.botToken, {
            inline_keyboard: [[
              { text: '🗑️ Sí, descartar', callback_data: `inbox:discard_confirm:${document.id}` },
              { text: '↩️ Cancelar', callback_data: `inbox:view:${document.id}` },
            ]],
          })
        } else if (action === 'discard_confirm') {
          const discarded = await prisma.expenseInboxDocument.updateMany({
            where: { id: document.id, tenantId: ctx.tenantId, status: { in: ['PENDING_REVIEW', 'REVIEW', 'ERROR'] } },
            data: { status: 'DISCARDED', errorMessage: 'Descartado desde Telegram' },
          })
          if (discarded.count === 1) {
            await sendBotMessage(chatId, `🗑️ Documento descartado: <b>${document.fileName}</b>. El archivo se conserva para auditoría.`, ctx.botToken, {
              inline_keyboard: [[{ text: '↩️ Restaurar documento', callback_data: `inbox:restore:${document.id}` }]],
            })
          } else {
            await sendBotMessage(chatId, '⚠️ El documento ya no estaba pendiente y no se modificó.', ctx.botToken)
          }
        } else if (action === 'restore') {
          if (!canRestoreTelegramExpenseStatus(document.status)) {
            return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: 'El documento no está descartado', show_alert: true })
          }
          const restored = await prisma.expenseInboxDocument.updateMany({
            where: { id: document.id, tenantId: ctx.tenantId, status: 'DISCARDED' },
            data: { status: 'REVIEW', errorMessage: null },
          })
          await sendBotMessage(chatId, restored.count === 1
            ? `↩️ Documento restaurado: <b>${document.fileName}</b>. Ya puedes revisarlo de nuevo.`
            : '⚠️ El documento ya no estaba descartado y no se modificó.', ctx.botToken)
        } else if (action === 'review') {
          await prisma.expenseInboxDocument.update({ where: { id: document.id }, data: { status: 'REVIEW' } })
          await sendBotMessage(chatId, `✅ <b>${document.fileName}</b> marcado como «En revisión».`, ctx.botToken)
        } else if (action === 'scan') {
          await sendBotMessage(chatId, `🧠 Analizando <b>${document.fileName}</b>… Te avisaré cuando termine.`, ctx.botToken)
          void processInboxOcr(document.id, ctx, chatId)
        } else {
          const summary = buildTelegramExpenseSummary({
            fileName: document.fileName,
            status: document.status,
            pageStart: document.pageStart,
            pageEnd: document.pageEnd,
            extractedData: document.extractedData,
            errorMessage: document.errorMessage,
          })
          const controls = document.status === 'DISCARDED'
            ? [[{ text: '↩️ Restaurar documento', callback_data: `inbox:restore:${document.id}` }]]
            : [[
                { text: '🧠 Escanear OCR', callback_data: `inbox:scan:${document.id}` },
                { text: '✅ Confirmar gasto', callback_data: `inbox:confirm:${document.id}` },
                { text: '📋 Marcar en revisión', callback_data: `inbox:review:${document.id}` },
                { text: '🗑️ Descartar', callback_data: `inbox:discard:${document.id}` },
              ]]
          await sendBotMessage(chatId, summary, ctx.botToken, { inline_keyboard: controls })
        }
        return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id })
      }

      // 1c. Acciones de tareas (task:) — completar/reprogramar/snooze con un toque
      // callback_data: task:complete:<taskId> | task:resched:<taskId> |
      //                task:cal:<taskId>:<YYYY-MM> | task:date:<taskId>:<YYYY-MM-DD|cancel> |
      //                task:snooze:<taskId> | task:snoozeDate:<taskId>:<manana|d3|d7|cancel>
      if (data.startsWith('task:')) {
        const parts = data.split(':')
        const taskAction = parts[1]
        const taskId = parts[2]
        const token = parts[3]

        const ctx = await findTelegramContext(chatId)
        if (!ctx || !taskId) {
          return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: '❌ No autorizado', show_alert: true })
        }

        const task = await prisma.task.findFirst({
          where: { id: taskId, tenantId: ctx.tenantId },
          select: { id: true, titulo: true, completada: true },
        })
        if (!task) {
          return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: 'Tarea no encontrada', show_alert: true })
        }
        if (task.completada) {
          return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: 'Esta tarea ya está completada', show_alert: true })
        }

        if (taskAction === 'complete') {
          try {
            const { skills } = await import('@/lib/skills')
            await skills.complete_task({ taskId, tenantId: ctx.tenantId, userId: `telegram:${chatId}` })
            clearReplyMarkup(chatId, callback_query.message.message_id, ctx.botToken).catch(() => {})
            return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: `✅ Tarea completada: ${task.titulo}` })
          } catch (err: any) {
            return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: `❌ No se pudo completar: ${err?.message || 'error'}`, show_alert: true })
          }
        }

        if (taskAction === 'resched') {
          const hoy = new Date()
          return NextResponse.json({
            method: 'editMessageText',
            chat_id: chatId,
            message_id: callback_query.message.message_id,
            text: `📅 Elige la nueva fecha para «${task.titulo}»:`,
            reply_markup: {
              inline_keyboard: buildTaskCalendarMarkup(taskId, hoy.getFullYear(), hoy.getMonth()),
            },
          })
        }

        // Navegación de mes del calendario: task:cal:<taskId>:<YYYY-MM>
        if (taskAction === 'cal') {
          const calMatch = /^(\d{4})-(\d{2})$/.exec(token || '')
          if (!calMatch) {
            return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: 'Opción no válida', show_alert: true })
          }
          const year = Number(calMatch[1])
          const month = Number(calMatch[2]) - 1
          if (month < 0 || month > 11 || year < 2000 || year > 2100) {
            return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: 'Fecha fuera de rango', show_alert: true })
          }
          return NextResponse.json({
            method: 'editMessageText',
            chat_id: chatId,
            message_id: callback_query.message.message_id,
            text: `📅 Elige la nueva fecha para «${task.titulo}»:`,
            reply_markup: {
              inline_keyboard: buildTaskCalendarMarkup(taskId, year, month),
            },
          })
        }

        if (taskAction === 'snooze') {
          const opts = [
            { text: '🌅 Mañana', callback_data: `task:snoozeDate:${taskId}:manana` },
            { text: '➕ 3 días', callback_data: `task:snoozeDate:${taskId}:d3` },
            { text: '📅 7 días', callback_data: `task:snoozeDate:${taskId}:d7` },
            { text: '↩️ Cancelar', callback_data: `task:snoozeDate:${taskId}:cancel` },
          ]
          return NextResponse.json({
            method: 'editMessageText',
            chat_id: chatId,
            message_id: callback_query.message.message_id,
            text: `⏰ ¿Hasta cuándo pospongo el recordatorio de «${task.titulo}»?`,
            reply_markup: { inline_keyboard: [opts.slice(0, 2), opts.slice(2, 3), [opts[3]]] },
          })
        }

        if (taskAction === 'snoozeDate') {
          if (token === 'cancel') {
            return NextResponse.json({
              method: 'editMessageText',
              chat_id: chatId,
              message_id: callback_query.message.message_id,
              text: `↩️ Cancelado. «${task.titulo}» seguirá avisándose.`,
              reply_markup: { inline_keyboard: [] },
            })
          }
          const daysMap: Record<string, number> = { manana: 1, d3: 3, d7: 7 }
          const days = daysMap[token || '']
          if (!days) {
            return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: 'Opción no válida', show_alert: true })
          }
          const fecha = new Date()
          fecha.setDate(fecha.getDate() + days)
          const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
          try {
            const { skills } = await import('@/lib/skills')
            await skills.snooze_task({ taskId, tenantId: ctx.tenantId, hasta: iso, userId: `telegram:${chatId}` })
            const label = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
            return NextResponse.json({
              method: 'editMessageText',
              chat_id: chatId,
              message_id: callback_query.message.message_id,
              text: `⏰ Recordatorio pospuesto: «${task.titulo}» no te avisaré hasta el ${label}. La fecha real de la tarea no cambia.`,
              reply_markup: { inline_keyboard: [] },
            })
          } catch (err: any) {
            return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: `❌ ${err?.message || 'No se pudo posponer'}`, show_alert: true })
          }
        }

        if (taskAction === 'date') {
          if (token === 'cancel') {
            return NextResponse.json({
              method: 'editMessageText',
              chat_id: chatId,
              message_id: callback_query.message.message_id,
              text: `↩️ Cancelado. «${task.titulo}» sigue pendiente.`,
              reply_markup: { inline_keyboard: [] },
            })
          }
          // Fecha ISO YYYY-MM-DD del calendario, o tokens antiguos por compatibilidad
          let iso: string
          const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token || '')
          if (isoMatch) {
            iso = token!
          } else {
            const daysMap: Record<string, number> = { manana: 1, d3: 3, d7: 7, d14: 14 }
            const days = daysMap[token || '']
            if (!days) {
              return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: 'Opción no válida', show_alert: true })
            }
            const fechaRel = new Date()
            fechaRel.setDate(fechaRel.getDate() + days)
            iso = `${fechaRel.getFullYear()}-${String(fechaRel.getMonth() + 1).padStart(2, '0')}-${String(fechaRel.getDate()).padStart(2, '0')}`
          }
          try {
            const { skills } = await import('@/lib/skills')
            await skills.reschedule_task({ taskId, tenantId: ctx.tenantId, fecha: iso, userId: `telegram:${chatId}` })
            const fecha = new Date(iso + 'T12:00:00Z')
            const label = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
            return NextResponse.json({
              method: 'editMessageText',
              chat_id: chatId,
              message_id: callback_query.message.message_id,
              text: `📅 Tarea reprogramada: «${task.titulo}» → ${label}`,
              reply_markup: { inline_keyboard: [] },
            })
          } catch (err: any) {
            return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id, text: `❌ ${err?.message || 'No se pudo reprogramar'}`, show_alert: true })
          }
        }

        return NextResponse.json({ method: 'answerCallbackQuery', callback_query_id: callback_query.id })
      }

      // 1d. Flujo watchdog: admin authorize / reject buy (no es chatbot)
      const [action, itemId, tenantId] = data.split(':')

      // Seguridad: verificar admin legítimo
      // (Prisma JSON `contains` sin `path` no compara anidados correctamente;
      // filtramos en app code para soportar `metadata.telegram.chat_id` o `metadata.telegram_chat_id`)
      const adminCandidates = await prisma.user.findMany({
        where: { tenantId, role: { nombre: 'ADMIN' } },
        select: { id: true, name: true, metadata: true },
        take: 50,
      })
      const admin =
        adminCandidates.find((u) => {
          const meta = (u.metadata as any) || {}
          const legacy = meta?.telegram_chat_id
          const nested = meta?.telegram?.chat_id
          return legacy === chatId || String(nested) === chatId
        }) || null

      if (!admin) {
        return NextResponse.json({
          method: 'answerCallbackQuery',
          callback_query_id: callback_query.id,
          text: '❌ ERROR: No tienes permisos para autorizar acciones en este Tenant.',
          show_alert: true,
        })
      }

      if (action === 'reject_buy') {
        return NextResponse.json({
          method: 'editMessageText',
          chat_id: chatId,
          message_id: callback_query.message.message_id,
          text: `${callback_query.message.text}\n\n❌ <b>COMPRA RECHAZADA</b> por ${admin.name}.`,
        })
      }

      if (action === 'auth_buy') {
        const { skills } = await import('@/lib/skills')

        const item = await prisma.catalogoItem.findUnique({
          where: { id: itemId },
          select: { nombre: true, sku: true, precio: true } as any,
        })

        const expense = await (skills.create_expense as any)({
          tenantId,
          createdById: admin.id,
          description: `COMPRA PROACTIVA (Watchdog): ${item?.nombre || 'Item'} - SKU: ${item?.sku}`,
          amount: (item as any)?.precio || 0,
          category: 'Proactivo',
          status: 'PENDING_RECEIPT' as any,
          supplierId: 'watchdog-system',
        })

        return NextResponse.json({
          method: 'editMessageText',
          chat_id: chatId,
          message_id: callback_query.message.message_id,
          text: `${callback_query.message.text}\n\n✅ <b>COMPRA AUTORIZADA</b> por ${admin.name}.\nGasto: <b>€${expense.amount}</b> registrado como <i>PENDIENTE DE RECIBO</i>.`,
        })
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // 2. MENSAJES DIRECTOS
    // ════════════════════════════════════════════════════════════════════

    // Anti-duplicado para updates que NO son mensajes directos (edited_message,
    // channel_post…). Para mensajes directos se evalúa DESPUÉS del rate-limit
    // (ver abajo) para que un 429 no marque el update como procesado y el
    // reintento de Telegram con el mismo update_id sí pase.
    if (!body.message && isUpdateProcessed(body.update_id)) {
      return NextResponse.json({ ok: true })
    }

    if (body.message) {
      const { message } = body

      // Filtro: ignorar mensajes de otros bots (evita gastos de LLM y ruido en historial)
      if (message.from?.is_bot) {
        return NextResponse.json({ ok: true })
      }

      const chatId = message.chat.id.toString()
      const senderName =
        message.from.first_name + (message.from.last_name ? ` ${message.from.last_name}` : '')
      const messageText = message.text || ''

      // Rate-limit por chat ANTES del anti-duplicado: si se excede, se responde
      // 429 con Retry-After para que Telegram reintente el mensaje (ya no se
      // descarta silenciosamente con { ok: true }). No se marca el update como
      // procesado en ese caso para que el reintento del mismo update_id pase.
      if (isRateLimited(chatId)) {
        return rateLimitedResponse()
      }

      // Anti-duplicado a nivel de update (Telegram puede reenviar el mismo webhook)
      if (isUpdateProcessed(body.update_id)) {
        return NextResponse.json({ ok: true })
      }

      // Documentos/imágenes recibidos del administrador → bandeja de gastos.
      // Se exige coincidencia exacta del admin_chat_id: el fallback global del
      // chatbot nunca puede introducir archivos en un tenant equivocado.
      if (message.document || message.photo) {
        const ctx = await findTelegramContext(chatId, true)
        if (!ctx) return NextResponse.json({ ok: true })
        try {
          const document = await ingestTelegramDocument(message, ctx, chatId)
          if (document) {
            await sendBotMessage(chatId, `📥 Documento recibido: <b>${document.fileName}</b>\n\nQuedó en la bandeja de gastos para revisión.`, ctx.botToken)
          }
        } catch (error) {
          console.error('[TelegramWebhook] Error incorporando documento a la bandeja:', error)
          await sendBotMessage(chatId, '❌ No pude guardar el documento en la bandeja de gastos. Revisa el formato y el tamaño del archivo.', ctx.botToken).catch(() => {})
        }
        return NextResponse.json({ ok: true })
      }

      // Ignorar mensajes sin texto (stickers, audios): el chatbot no procesa
      // contenido multimedia y gastaríamos una llamada inútil al LLM.
      if (!messageText.trim()) {
        return NextResponse.json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────────────
      // 2a. Corrección puntual de un campo OCR
      // Formato: /gasto_corregir <documento> <campo> <valor>
      // ─────────────────────────────────────────────────────────────────
      if (isTelegramCommand(messageText, 'gasto_corregir')) {
        const parts = messageText.trim().split(/\s+/)
        const documentId = parts[1]
        const field = parts[2]
        const value = parts.slice(3).join(' ').trim()
        const ctx = await findTelegramContext(chatId, true)
        if (!ctx) return NextResponse.json({ ok: true })
        if (!documentId || !field || !value) {
          await sendBotMessage(chatId, 'Uso: /gasto_corregir ID_DOCUMENTO campo valor\nCampos: proveedor, nif, factura, fecha, vencimiento, total, base, iva, recargo, irpf, moneda, pago, operacion.', ctx.botToken)
        } else {
          await correctInboxField(documentId, field, value, ctx, chatId)
        }
        return NextResponse.json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────────────
      // 2b. Consulta rápida de la bandeja de gastos
      // ─────────────────────────────────────────────────────────────────
      if (isTelegramCommand(messageText, 'gastos_pendientes')) {
        const ctx = await findTelegramContext(chatId, true)
        if (!ctx) return NextResponse.json({ ok: true })
        const documents = await prisma.expenseInboxDocument.findMany({
          where: { tenantId: ctx.tenantId, status: { in: ['PENDING_REVIEW', 'REVIEW', 'ERROR'] } },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, fileName: true, status: true, pageStart: true, pageEnd: true },
        })
        if (documents.length === 0) {
          await sendBotMessage(chatId, '✅ No tienes documentos pendientes en la bandeja.', ctx.botToken)
        } else {
          const text = `📥 <b>Documentos pendientes (${documents.length})</b>\n\nSelecciona uno para revisar:`
          const replyMarkup = {
            inline_keyboard: documents.map(document => [{
              text: `${document.status === 'ERROR' ? '⚠️' : '📄'} ${document.fileName}`.slice(0, 56),
              callback_data: `inbox:view:${document.id}`,
            }]),
          }
          await sendBotMessage(chatId, text, ctx.botToken, replyMarkup)
        }
        return NextResponse.json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────────────
      // 2c. Documentos descartados: consulta y restauración
      // ─────────────────────────────────────────────────────────────────
      if (isTelegramCommand(messageText, 'gastos_descartados')) {
        const ctx = await findTelegramContext(chatId, true)
        if (!ctx) return NextResponse.json({ ok: true })
        const documents = await prisma.expenseInboxDocument.findMany({
          where: { tenantId: ctx.tenantId, status: 'DISCARDED' },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: { id: true, fileName: true },
        })
        if (documents.length === 0) {
          await sendBotMessage(chatId, '✅ No tienes documentos descartados.', ctx.botToken)
        } else {
          await sendBotMessage(chatId, `🗑️ <b>Documentos descartados (${documents.length})</b>\n\nSelecciona uno para consultar o restaurar:`, ctx.botToken, {
            inline_keyboard: documents.map(document => [{
              text: `🗑️ ${document.fileName}`.slice(0, 56),
              callback_data: `inbox:view:${document.id}`,
            }]),
          })
        }
        return NextResponse.json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────────────
      // 2b. Comando /start → configura notificaciones (config flow)
      // ─────────────────────────────────────────────────────────────────
      if (messageText.startsWith('/start')) {
        const parts = messageText.split(' ')
        const tenantIdParam = parts.length > 1 ? parts[1] : null

        // ═══ VINCULACIÓN POR USUARIO (QR del perfil) ═══════════════════
        // Payload: u_<userId>_<token> → valida el token one-time y guarda
        // telegram_chat_id en el metadata del usuario para que reciba sus
        // notificaciones personales.
        if (tenantIdParam && tenantIdParam.startsWith('u_')) {
          const [prefix, userId, linkToken] = tenantIdParam.split('_')
          if (prefix !== 'u') {
            return NextResponse.json({ ok: true })
          }
          const user = await prisma.user.findUnique({
            where: { id: userId || '' },
            select: { id: true, name: true, metadata: true, tenantId: true },
          })

          const currentMeta = (user?.metadata as any) || {}

          // Seguridad: exigir token one-time. Evita que un tercero vincule
          // su propio chat al ID de otro usuario (secuestro de notificaciones).
          if (!user?.tenantId || !linkToken || currentMeta.telegram_link_token !== linkToken) {
            console.warn(`[Telegram] /start u_ inválido (usuario o token no válido): ${userId}`)
            return NextResponse.json({ ok: true })
          }

          // Guardar chat_id en metadata (plano + anidado) y consumir el token
          const botToken = await findTenantBotToken(user.tenantId)
          await prisma.user.update({
            where: { id: user.id },
            data: {
              metadata: {
                ...currentMeta,
                telegram_chat_id: chatId,
                telegram_link_token: null,
                telegram: {
                  ...(currentMeta.telegram || {}),
                  chat_id: chatId,
                  linkedAt: new Date().toISOString(),
                },
              },
            },
          })

          console.log(`[Telegram] Chat ID ${chatId} vinculado al usuario ${user.id}`)

          if (botToken) {
            try {
              await sendBotMessage(
                chatId,
                `✅ *¡Telegram vinculado correctamente!*\n\nAhora recibirás las notificaciones de Volkern en este chat.\n\n📱 *Tu Chat ID:* \`${chatId}\``,
                botToken
              )
            } catch (sendErr) {
              console.error('[TelegramWebhook] Error enviando confirmación /start usuario:', sendErr)
            }
          }

          return NextResponse.json({ ok: true })
        }

        let integration = null

        if (tenantIdParam) {
          integration = await prisma.integration.findFirst({
            where: { tenantId: tenantIdParam, tipo: 'telegram', activo: true },
            select: { id: true, credenciales: true, nombre: true, tenantId: true },
          })
        }

        if (!integration) {
          const tenants = await prisma.tenant.findMany({
            where: { estado: 'activo' },
            select: { id: true },
          })

          for (const tenant of tenants) {
            const found = await prisma.integration.findFirst({
              where: { tenantId: tenant.id, tipo: 'telegram', activo: true },
              select: { id: true, credenciales: true, nombre: true, tenantId: true },
            })
            if (found) {
              integration = found
              break
            }
          }
        }

        if (integration?.credenciales) {
          const creds = integration.credenciales as any
          await prisma.integration.update({
            where: { id: integration.id },
            data: {
              credenciales: {
                ...creds,
                admin_chat_id: chatId,
              },
            },
          })

          console.log(`[Telegram] Admin chat_id configurado: ${chatId} para tenant ${integration.tenantId}`)

          const botToken = creds.bot_token
          if (botToken) {
            try {
              await sendBotMessage(
                chatId,
                `✅ *¡Configuración completa!*\n\nAhora recibirás notificaciones de Volkern en este chat.\n\n📱 *Tu Chat ID:* \`${chatId}\``,
                botToken
              )
            } catch (sendErr) {
              console.error('[TelegramWebhook] Error enviando confirmación de /start:', sendErr)
            }
          }

          return NextResponse.json({ ok: true })
        }

        const ctx = await findTelegramContext(chatId)
        if (ctx) {
          try {
            await sendBotMessage(
              chatId,
              `⚠️ No se encontró una integración de Telegram activa para vincular tu cuenta.`,
              ctx.botToken
            )
          } catch (sendErr) {
            console.error('[TelegramWebhook] Error enviando aviso /start sin integración:', sendErr)
          }
        }
        return NextResponse.json({ ok: true })
      }

      // ─────────────────────────────────────────────────────────────────
      // 2b. Mensaje regular → pipeline unificado (tool calling + quick replies)
      // ─────────────────────────────────────────────────────────────────

      const ctx = await findTelegramContext(chatId)
      if (!ctx) {
        console.warn(`[TelegramWebhook] No se encontró tenant para chat ${chatId}, ignorando mensaje`)
        return NextResponse.json({ ok: true })
      }

      await processAndReply(chatId, senderName, messageText, ctx)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error en webhook de Telegram:', error)
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 })
  }
}
