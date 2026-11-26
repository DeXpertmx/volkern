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
import { ejecutarAprobacion, ejecutarToolDelCatalogo } from '@/lib/mcp/approval-execution'
import { completeApproval } from '@/lib/mcp/tool-gate'

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
  const ahora = new Date()
  const codeExpiresAt = new Date(ahora.getTime() + CODE_TTL_MINUTES * 60 * 1000)

  const baseUrl = process.env.NEXTAUTH_URL || 'https://volkern.app'
  const verificationUrl = `${baseUrl}/mcp/autorizar/${verificationToken}`

  // Máscara del teléfono para mostrar (últimos 4 dígitos).
  const digits = business.phoneNumber.replace(/[^\d]/g, '')
  const phoneNumberMasked = digits.length >= 4
    ? `****${digits.slice(-4)}`
    : `****${business.phoneNumber}`

  // Reserva atómica del código. El gate reutiliza la solicitud pendiente cuando
  // dos llamadas traen los mismos argumentos; sin este cerrojo ambas emitían un
  // código y la segunda sobrescribía el token de la primera, dejando su enlace
  // muerto. El UPDATE condicionado compite por la fila: en Postgres la segunda
  // espera el bloqueo y reevalúa el WHERE, que ya no coincide porque el código
  // vigente no ha caducado. Solo la ganadora emite y envía; la otra devuelve el
  // código vigente, así que un segundo código nunca invalida al primero.
  const reserva = await prisma.mcpApprovalRequest.updateMany({
    where: {
      id: approvalId,
      tenantId,
      status: 'pending',
      OR: [{ whatsappCodeExpiresAt: null }, { whatsappCodeExpiresAt: { lte: ahora } }],
    },
    data: {
      whatsappCodeHash: codeHash,
      whatsappCodeExpiresAt: codeExpiresAt,
      whatsappCodeSentAt: null,
      whatsappCodeAttempts: 0,
      whatsappPhoneNumber: business.phoneNumber,
      whatsappVerificationToken: verificationToken,
    },
  })

  if (reserva.count === 0) {
    const vigente = await prisma.mcpApprovalRequest.findFirst({
      where: { id: approvalId, tenantId },
      select: {
        status: true,
        whatsappVerificationToken: true,
        whatsappCodeExpiresAt: true,
      },
    })

    if (
      !vigente ||
      vigente.status !== 'pending' ||
      !vigente.whatsappVerificationToken ||
      !vigente.whatsappCodeExpiresAt ||
      vigente.whatsappCodeExpiresAt <= new Date()
    ) {
      // El código se venció entre la reserva fallida y la lectura, o la
      // solicitud dejó de estar pendiente: no hay enlace que devolver.
      throw new Error('La solicitud no admite un código de autorización')
    }

    return {
      verificationToken: vigente.whatsappVerificationToken,
      verificationUrl: `${baseUrl}/mcp/autorizar/${vigente.whatsappVerificationToken}`,
      codeExpiresAt: vigente.whatsappCodeExpiresAt,
      phoneNumberMasked,
    }
  }

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
    const envio = await sendMessageWithUserInstance(
      business.instanceName,
      business.phoneNumber,
      mensaje
    )
    if (envio?.success === false) {
      throw new Error(envio.error || 'El envío del código no se confirmó')
    }
  } catch (sendError) {
    // Sin envío no hay código válido: liberar la reserva para que el reintento
    // pueda emitir otro (y el gate caiga a la bandeja si no hay canal). El
    // WHERE por token evita borrar una reserva posterior.
    await prisma.mcpApprovalRequest
      .updateMany({
        where: { id: approvalId, whatsappVerificationToken: verificationToken },
        data: {
          whatsappCodeHash: null,
          whatsappCodeExpiresAt: null,
          whatsappCodeSentAt: null,
          whatsappVerificationToken: null,
        },
      })
      .catch((error) =>
        console.error('[whatsapp-auth] No se pudo liberar la reserva del código:', error)
      )

    console.error(
      '[whatsapp-auth] No se pudo enviar el código por WhatsApp:',
      sendError instanceof Error ? sendError.message : String(sendError)
    )
    throw sendError
  }

  // La marca de envío es informativa: si falla, el código ya está emitido y
  // entregado, así que no se invalida la solicitud.
  await prisma.mcpApprovalRequest
    .updateMany({
      where: { id: approvalId, whatsappVerificationToken: verificationToken },
      data: { whatsappCodeSentAt: new Date() },
    })
    .catch((error) =>
      console.error('[whatsapp-auth] No se pudo marcar el envío del código:', error)
    )

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
/**
 * Motivo tipado del resultado de la verificación. La ruta HTTP lo traduce a un
 * status, sin depender del texto del mensaje: «Código incorrecto. Te quedan 2
 * intento(s)» contiene «intento» y antes se servía como 429.
 */
export type MotivoVerificacion =
  | 'solicitud_no_encontrada'
  | 'ya_resuelta'
  | 'codigo_caducado'
  | 'intentos_agotados'
  | 'codigo_incorrecto'
  | 'envio_fallido'

/** Fila reclamada, tal como la lee la transacción con `FOR UPDATE`. */
interface SolicitudReclamada {
  id: string
  tenantId: string
  toolName: string
  arguments: Record<string, unknown> | null
  argumentsHash: string
  operationId: string | null
  requestedById: string
  status: string
  whatsappCodeHash: string | null
  whatsappCodeExpiresAt: Date | null
  whatsappCodeAttempts: number
}

/** Resultado del reclamo: o se ejecuta, o se devuelve el motivo sin ejecutar. */
type Reclamo =
  | { ok: true; solicitud: SolicitudReclamada }
  | {
      ok: false
      motivo: MotivoVerificacion
      error: string
      approvalId?: string
    }

/** Mensaje de error de un envío fallido, sin asumir la forma del resultado. */
function mensajeDeEnvioFallido(result: unknown): string {
  if (result && typeof result === 'object' && 'error' in result) {
    const error = (result as { error?: unknown }).error
    if (typeof error === 'string' && error) return error
  }
  return 'No se pudo completar el envío'
}

export async function verifyAndExecuteWhatsappAuthCode(params: {
  verificationToken: string
  code: string
}): Promise<{
  ok: boolean
  approved: boolean
  executed: boolean
  result?: any
  error?: string
  motivo?: MotivoVerificacion
  approvalId?: string
}> {
  const { verificationToken, code } = params

  // Reclamo atómico. La fila se bloquea (`SELECT … FOR UPDATE`) y la validación
  // del código y el paso a `approved` ocurren en la MISMA transacción: solo una
  // petición puede reclamarla. Antes, dos verificaciones simultáneas leían la
  // solicitud como pendiente, validaban el mismo código y ambas ejecutaban el
  // envío; ahora la segunda encuentra el estado `approved` y no ejecuta.
  //
  // El timeout es mayor que el de Prisma por defecto (5 s) porque el bloqueo
  // espera turno: bcrypt (~100 ms) más la espera de la fila no deben acabar en
  // un P2028 con la solicitud a medio camino.
  const reclamo = await prisma.$transaction(
    async (tx): Promise<Reclamo> => {
      const filas = await tx.$queryRaw<SolicitudReclamada[]>`
        SELECT id, "tenantId", "toolName", arguments, "argumentsHash", "operationId",
               "requestedById", status, "whatsappCodeHash", "whatsappCodeExpiresAt",
               "whatsappCodeAttempts"
        FROM "mcp_approval_requests"
        WHERE "whatsappVerificationToken" = ${verificationToken}
        FOR UPDATE
      `

      const solicitud = filas[0]
      if (!solicitud) {
        return { ok: false, motivo: 'solicitud_no_encontrada', error: 'Solicitud no encontrada' }
      }

      if (solicitud.status !== 'pending') {
        return {
          ok: false,
          motivo: 'ya_resuelta',
          error: `La solicitud ya fue ${solicitud.status} y no se puede modificar.`,
          approvalId: solicitud.id,
        }
      }

      if (solicitud.whatsappCodeAttempts >= MAX_ATTEMPTS) {
        await tx.mcpApprovalRequest.update({
          where: { id: solicitud.id },
          data: { status: 'expired', reason: 'Máximo de intentos excedido' },
        })
        return {
          ok: false,
          motivo: 'intentos_agotados',
          error: 'Demasiados intentos fallidos. La solicitud caducó.',
          approvalId: solicitud.id,
        }
      }

      if (
        !solicitud.whatsappCodeExpiresAt ||
        new Date(solicitud.whatsappCodeExpiresAt) < new Date()
      ) {
        await tx.mcpApprovalRequest.update({
          where: { id: solicitud.id },
          data: { status: 'expired', reason: 'Código expirado' },
        })
        return {
          ok: false,
          motivo: 'codigo_caducado',
          error: 'El código de autorización expiró.',
          approvalId: solicitud.id,
        }
      }

      const codeOk = solicitud.whatsappCodeHash
        ? await compareAuthCode(code, solicitud.whatsappCodeHash)
        : false

      // El intento se cuenta dentro del bloqueo: dos intentos simultáneos no
      // pueden saltarse el límite de MAX_ATTEMPTS.
      await tx.mcpApprovalRequest.update({
        where: { id: solicitud.id },
        data: { whatsappCodeAttempts: { increment: 1 } },
      })

      if (!codeOk) {
        const restantes = MAX_ATTEMPTS - (solicitud.whatsappCodeAttempts + 1)
        return {
          ok: false,
          motivo: 'codigo_incorrecto',
          error: `Código incorrecto. Te quedan ${restantes > 0 ? restantes : 0} intento(s).`,
          approvalId: solicitud.id,
        }
      }

      // Reserva del derecho de ejecución: el paso a `approved` dentro de la
      // transacción es lo que hace que el resto de intentos no ejecute.
      await tx.mcpApprovalRequest.update({
        where: { id: solicitud.id },
        data: {
          status: 'approved',
          resolvedById: solicitud.requestedById, // autoprobación mediante código del negocio
          resolvedAt: new Date(),
          reason: 'Autorizado por código de firma enviado al WhatsApp del negocio',
        },
      })

      return { ok: true, solicitud }
    },
    { timeout: 15_000 }
  )

  if (!reclamo.ok) {
    return {
      ok: false,
      approved: false,
      executed: false,
      error: reclamo.error,
      motivo: reclamo.motivo,
      approvalId: reclamo.approvalId,
    }
  }

  // Ejecución fuera de la transacción (no se retiene el bloqueo durante la
  // llamada externa). El recibo del envío y el cierre del desenlace viven en
  // `ejecutarAprobacion`, compartido con la bandeja de aprobaciones.
  const { solicitud } = reclamo
  const { ok: executed, result } = await ejecutarAprobacion({
    aprobacion: solicitud,
    ejecutar: () => ejecutarToolDelCatalogo(solicitud),
  })

  await completeApproval({ approvalId: solicitud.id, ok: executed, result })

  return {
    ok: executed,
    approved: true,
    executed,
    result,
    error: executed ? undefined : mensajeDeEnvioFallido(result),
    motivo: executed ? undefined : 'envio_fallido',
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
