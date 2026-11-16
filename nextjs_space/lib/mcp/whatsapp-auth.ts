/**
 * Autorización de envíos WhatsApp desde el MCP mediante código de un solo uso.
 *
 * Flujo:
 * 1. El agente pide `volkern_send_whatsapp` por MCP.
 * 2. Se genera un código de 6 dígitos, se guarda hasheado en la
 *    `McpApprovalRequest` y se envía por WhatsApp al número registrado del
 *    negocio (TenantWhatsAppInstance).
 * 3. Se devuelve un `verificationToken` con un link público:
 *    `/mcp/autorizar/[token]`.
 * 4. Quien recibe el WhatsApp abre el link, lee los riesgos, escribe el código
 *    y pulsa «Autorizar envío».
 * 5. Si el código es correcto y no expiró, se aprueba la solicitud y se
 *    ejecuta el envío con la identidad de quien lo pidió.
 *
 * El código viaja por el mismo canal que se quiere autorizar (out-of-band):
 * solo quien tiene acceso al WhatsApp del negocio puede completar la firma.
 */

import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { sendMessageWithUserInstance } from '@/lib/evolution-instances'

const CODE_TTL_MINUTES = 15
const MAX_ATTEMPTS = 3
const CODE_LENGTH = 6

/** Genera un código numérico de `CODE_LENGTH` dígitos. */
export function generateAuthCode(): string {
  const min = Math.pow(10, CODE_LENGTH - 1) // 100000
  const max = Math.pow(10, CODE_LENGTH) - 1 // 999999
  return String(crypto.randomInt(min, max + 1)).padStart(CODE_LENGTH, '0')
}

/** Token aleatorio y opaco para la URL pública de verificación. */
export function generateVerificationToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

/** Hash bcrypt del código (nunca se guarda el código en texto plano). */
export async function hashAuthCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10)
}

/** Compara el código enviado contra el hash almacenado. */
export async function compareAuthCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash)
}

/**
 * Obtiene la instancia y el número de WhatsApp del negocio para un tenant.
 * Prioridad: TenantWhatsAppInstance conectada > canal whatsapp activo.
 */
async function getBusinessWhatsapp(tenantId: string): Promise<{
  instanceName: string
  phoneNumber: string
} | null> {
  const instance = await prisma.tenantWhatsAppInstance.findFirst({
    where: { tenantId, status: 'connected' },
    orderBy: { fechaConexion: 'desc' },
    select: { instanceName: true, phoneNumber: true },
  })

  if (instance?.instanceName && instance.phoneNumber) {
    return {
      instanceName: instance.instanceName,
      phoneNumber: instance.phoneNumber,
    }
  }

  // Fallback: canal whatsapp del tenant con teléfono en la configuración.
  const channel = await prisma.channel.findFirst({
    where: { tenantId, type: 'whatsapp', isActive: true },
    select: { config: true },
  })
  const config = (channel?.config as any) || {}
  if (config.instanceName && config.phoneNumber) {
    return {
      instanceName: config.instanceName,
      phoneNumber: config.phoneNumber,
    }
  }

  return null
}

/**
 * Genera el código de autorización, lo guarda en la solicitud y lo envía por
 * WhatsApp al número del negocio.
 *
 * Devuelve el token de verificación, la URL pública y cuándo expira el código.
 * Si no hay WhatsApp del negocio configurado, lanza error para que el caller
 * pueda caer al flujo de aprobación interna.
 */
export async function generateAndSendWhatsappAuthCode(params: {
  approvalId: string
  tenantId: string
  phoneDestination: string // número a quien se quiere enviar el WhatsApp final
  messagePreview: string // contenido del mensaje (para mostrar en la página de riesgos)
}): Promise<{
  verificationToken: string
  verificationUrl: string
  codeExpiresAt: Date
  phoneNumberMasked: string
}> {
  const { approvalId, tenantId, phoneDestination, messagePreview } = params

  const business = await getBusinessWhatsapp(tenantId)
  if (!business) {
    throw new Error('No hay WhatsApp del negocio conectado para este tenant')
  }

  const code = generateAuthCode()
  const codeHash = await hashAuthCode(code)
  const verificationToken = generateVerificationToken()
  const codeExpiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000)

  const baseUrl = process.env.NEXTAUTH_URL || 'https://volkern.app'
  const verificationUrl = `${baseUrl}/mcp/autorizar/${verificationToken}`

  // Máscara del teléfono para mostrar (últimos 4 dígitos).
  const digits = business.phoneNumber.replace(/[^\d]/g, '')
  const phoneNumberMasked = digits.length >= 4
    ? `****${digits.slice(-4)}`
    : `****${business.phoneNumber}`

  const mensaje = `
🔐 Código de autorización WhatsApp CRM

Has solicitado enviar un mensaje de WhatsApp desde el panel de control.
Para autorizarlo, usa este código como firma de seguridad:

Código: ${code}
Válido por ${CODE_TTL_MINUTES} minutos.

Destinatario: ${phoneDestination}
Mensaje: ${messagePreview}

Abre este enlace para revisar los riesgos y confirmar:
${verificationUrl}

Si no has solicitado este envío, ignora este mensaje y no compartas el código.
`.trim()

  try {
    await sendMessageWithUserInstance(
      business.instanceName,
      business.phoneNumber,
      mensaje
    )
  } catch (sendError) {
    console.error(
      '[whatsapp-auth] No se pudo enviar el código por WhatsApp:',
      sendError instanceof Error ? sendError.message : String(sendError)
    )
    throw sendError
  }

  // Guardar hash, expiración, teléfono y token en la solicitud de aprobación.
  await prisma.mcpApprovalRequest.update({
    where: { id: approvalId },
    data: {
      whatsappCodeHash: codeHash,
      whatsappCodeExpiresAt: codeExpiresAt,
      whatsappCodeSentAt: new Date(),
      whatsappCodeAttempts: 0,
      whatsappPhoneNumber: business.phoneNumber,
      whatsappVerificationToken: verificationToken,
    },
  })

  return {
    verificationToken,
    verificationUrl,
    codeExpiresAt,
    phoneNumberMasked,
  }
}

/**
 * Valida el código de autorización y, si es correcto, aprueba la solicitud
 * y ejecuta el envío de WhatsApp con la identidad del solicitante.
 *
 * Devuelve { ok, approved, executed, result, error }. Si ok es false, el
 * llamante debe devolver el error al usuario.
 */
export async function verifyAndExecuteWhatsappAuthCode(params: {
  verificationToken: string
  code: string
  ip?: string
}): Promise<{
  ok: boolean
  approved: boolean
  executed: boolean
  result?: any
  error?: string
  approvalId?: string
}> {
  const { verificationToken, code, ip } = params

  const solicitud = await prisma.mcpApprovalRequest.findFirst({
    where: { whatsappVerificationToken: verificationToken },
    select: {
      id: true,
      tenantId: true,
      toolName: true,
      arguments: true,
      requestedById: true,
      status: true,
      whatsappCodeHash: true,
      whatsappCodeExpiresAt: true,
      whatsappCodeAttempts: true,
      whatsappCodeSentAt: true,
    },
  })

  if (!solicitud) {
    return { ok: false, approved: false, executed: false, error: 'Solicitud no encontrada' }
  }

  if (solicitud.status !== 'pending') {
    return {
      ok: false,
      approved: false,
      executed: false,
      error: `La solicitud ya fue ${solicitud.status} y no se puede modificar.`,
      approvalId: solicitud.id,
    }
  }

  // Anti fuerza bruta: máximo 3 intentos.
  if (solicitud.whatsappCodeAttempts >= MAX_ATTEMPTS) {
    await prisma.mcpApprovalRequest.update({
      where: { id: solicitud.id },
      data: { status: 'expired', reason: 'Máximo de intentos excedido' },
    })
    return {
      ok: false,
      approved: false,
      executed: false,
      error: 'Demasiados intentos fallidos. La solicitud caducó.',
      approvalId: solicitud.id,
    }
  }

  // Código expirado.
  if (
    !solicitud.whatsappCodeExpiresAt ||
    new Date(solicitud.whatsappCodeExpiresAt) < new Date()
  ) {
    await prisma.mcpApprovalRequest.update({
      where: { id: solicitud.id },
      data: { status: 'expired', reason: 'Código expirado' },
    })
    return {
      ok: false,
      approved: false,
      executed: false,
      error: 'El código de autorización expiró.',
      approvalId: solicitud.id,
    }
  }

  // Comparar código.
  const codeOk = solicitud.whatsappCodeHash
    ? await compareAuthCode(code, solicitud.whatsappCodeHash)
    : false

  // Incrementar intentos siempre que se intente un código.
  await prisma.mcpApprovalRequest.update({
    where: { id: solicitud.id },
    data: { whatsappCodeAttempts: { increment: 1 } },
  })

  if (!codeOk) {
    const restantes = MAX_ATTEMPTS - (solicitud.whatsappCodeAttempts + 1)
    return {
      ok: false,
      approved: false,
      executed: false,
      error: `Código incorrecto. Te quedan ${restantes > 0 ? restantes : 0} intento(s).`,
      approvalId: solicitud.id,
    }
  }

  // Código correcto: aprobar la solicitud.
  const ahora = new Date()
  const aprobada = await prisma.mcpApprovalRequest.update({
    where: { id: solicitud.id },
    data: {
      status: 'approved',
      resolvedById: solicitud.requestedById, // autoprobación mediante código del negocio
      resolvedAt: ahora,
      reason: 'Autorizado por código de firma enviado al WhatsApp del negocio',
    },
  })

  // Ejecutar el envío con la identidad de quien pidió la acción.
  const { handleCallTool } = await import('@/lib/mcp/mcp-handler')
  const result = await handleCallTool({
    name: solicitud.toolName,
    arguments: {
      ...(solicitud.arguments ?? {}),
      tenantId: solicitud.tenantId,
      userId: solicitud.requestedById,
      source: 'mcp',
    },
  })

  const parsed = (() => {
    const text = result.content?.[0]?.text
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  })()

  const executed = !result.isError

  await prisma.mcpApprovalRequest.update({
    where: { id: solicitud.id },
    data: {
      status: executed ? 'executed' : 'failed',
      executedAt: ahora,
      result: parsed as never,
    },
  })

  return {
    ok: executed,
    approved: true,
    executed,
    result: parsed,
    error: result.isError ? parsed?.error : undefined,
    approvalId: solicitud.id,
  }
}

/** Limpiar códigos expirados (para llamar desde un cron o al inicio). */
export async function cleanupExpiredCodes(): Promise<{ cleaned: number }> {
  const resultado = await prisma.mcpApprovalRequest.updateMany({
    where: {
      status: 'pending',
      whatsappCodeExpiresAt: { lt: new Date() },
      whatsappVerificationToken: { not: null },
    },
    data: { status: 'expired', reason: 'Código expirado por limpieza' },
  })
  return { cleaned: resultado.count }
}
