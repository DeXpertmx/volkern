/**
 * Gate de herramientas MCP: la puerta entre el lenguaje natural y las
 * operaciones reales del CRM.
 *
 * Tres decisiones posibles por llamada —`allow`, `ask`, `deny`— resueltas por
 * `lib/mcp/tool-policy.ts` (matriz de riesgo × rol, con overrides por empresa).
 *
 * `ask` no ejecuta: crea una `McpApprovalRequest` y devuelve su id. La
 * ejecución posterior se reclama con `claimApproval`, que bloquea la fila con
 * `SELECT … FOR UPDATE` dentro de una transacción. Ése es el detalle que evita
 * lo que de verdad rompe estos sistemas: que un reintento del agente —o dos
 * responsables pulsando "aprobar" a la vez— mande dos WhatsApp o borre dos
 * veces. La fila es el cerrojo; el estado es la verdad.
 *
 * Atribución: la ejecución aprobada se ejecuta con la identidad de QUIEN LA
 * PIDIÓ, no la de quien aprueba. Aprobar no es actuar.
 */

import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  decideToolCall,
  type CapabilityOverride,
  type ToolDecision,
  type ToolRisk,
} from '@/lib/mcp/tool-policy'
import { generateAndSendWhatsappAuthCode } from '@/lib/mcp/whatsapp-auth'

/** Horas que vive una solicitud antes de caducar sin ejecutarse. */
const APROBACION_VALIDEZ_HORAS = 24

export type GateSurface = '/mcp' | '/api/mcp' | '/api/chat'

/**
 * Superficie de las herramientas del AGENTE del chat (clase C/D). La ruta de
 * resolución de aprobaciones la compara contra este valor para ejecutar por el
 * registro del agente y no por `handleCallTool`; vive aquí, y no como cadena
 * suelta, para que el gate y la ruta no puedan derivar.
 */
export const VIA_CHAT: GateSurface = '/api/chat'

export type GateOutcome =
  | { kind: 'allow'; decision: 'allow'; reason: string; risk: ToolRisk | null }
  | { kind: 'deny'; decision: 'deny'; reason: string; risk: ToolRisk | null }
  | {
      kind: 'ask'
      decision: 'ask'
      reason: string
      risk: ToolRisk | null
      approvalId: string
      expiresAt: Date
    }
  | {
      kind: 'replay'
      decision: 'ask'
      reason: string
      risk: ToolRisk | null
      approvalId: string
      status: string
      result: unknown
    }
  | {
      kind: 'ask_code'
      decision: 'ask'
      reason: string
      risk: ToolRisk | null
      approvalId: string
      expiresAt: Date
      verificationToken: string
      verificationUrl: string
      codeExpiresAt: Date
      phoneNumberMasked: string
    }

/** Longitud máxima aceptada para un `operationId`. */
export const LONGITUD_MAX_OPERATION_ID = 200

/**
 * Identificador explícito de operación que manda el cliente MCP. Se guarda en
 * la solicitud y es la identidad de idempotencia del envío: el mismo valor no
 * reenvía, uno nuevo permite repetir el mismo mensaje. No se trunca: un id
 * recortado en silencio sería otra identidad y reenviaría.
 */
export function operationIdDeArgs(args: Record<string, unknown>): string | null {
  const valor = args.operationId
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio || null
}

/** Motivo por el que el `operationId` no es utilizable, o `null` si lo es. */
export function errorDeOperationId(args: Record<string, unknown>): string | null {
  const valor = args.operationId
  if (typeof valor !== 'string') return null
  const largo = valor.trim().length
  return largo > LONGITUD_MAX_OPERATION_ID
    ? `operationId no puede superar ${LONGITUD_MAX_OPERATION_ID} caracteres (recibidos ${largo}).`
    : null
}

/** Columnas suficientes para reutilizar o reproducir una solicitud existente. */
const CAMPOS_SOLICITUD = {
  id: true,
  status: true,
  expiresAt: true,
  result: true,
  whatsappVerificationToken: true,
  whatsappCodeExpiresAt: true,
  whatsappPhoneNumber: true,
} as const

interface SolicitudPrevia {
  id: string
  status: string
  expiresAt: Date
  result: unknown
  whatsappVerificationToken: string | null
  whatsappCodeExpiresAt: Date | null
  whatsappPhoneNumber: string | null
}

/**
 * Una operación ya resuelta no se vuelve a ejecutar: se devuelve su desenlace.
 * Es lo que impide que el mismo `operationId` reenvíe el WhatsApp.
 */
function replayDeSolicitud(solicitud: SolicitudPrevia, risk: ToolRisk | null): GateOutcome {
  return {
    kind: 'replay',
    decision: 'ask',
    reason: `La operación ya se resolvió (${solicitud.status}); no se volvió a ejecutar.`,
    risk,
    approvalId: solicitud.id,
    status: solicitud.status,
    result: solicitud.result,
  }
}

export interface GateInput {
  tenantId?: string
  userId?: string
  roleName?: string | null
  toolName: string
  args: Record<string, unknown>
  via: GateSurface
}

/**
 * Huella estable de los argumentos que identifican una acción.
 *
 * Ignora `tenantId` y `userId`: la identidad vive en columnas
 * (`tenantId`/`requestedById`) y no debe cambiar la huella. `source` sí cuenta:
 * distingue la superficie (MCP o agente) y no se deben mezclar solicitudes de
 * caminos de ejecución distintos. El orden de las claves no altera el hash.
 */
export function hashToolArguments(args: Record<string, unknown>): string {
  const negocio = { ...args }
  delete negocio.tenantId
  delete negocio.userId
  const canonico = (valor: unknown): unknown => {
    if (Array.isArray(valor)) return valor.map(canonico)
    if (valor && typeof valor === 'object') {
      return Object.keys(valor as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, clave) => {
          acc[clave] = canonico((valor as Record<string, unknown>)[clave])
          return acc
        }, {})
    }
    return valor
  }
  return createHash('sha256').update(JSON.stringify(canonico(negocio))).digest('hex')
}

/** Auditoría del gate. No lanza: la decisión ya está tomada y debe responder. */
async function auditar(params: {
  tenantId?: string
  userId?: string
  toolName: string
  accion: string
  descripcion: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        // `AuditLog.tenantId` tiene FK a Tenant: 'unknown' violaría la
        // restricción y la fila se perdería en silencio. null es el valor
        // honesto cuando la credencial no identifica empresa.
        tenantId: params.tenantId ?? null,
        userId: params.userId,
        accion: params.accion,
        entidad: 'MCP',
        entidadId: params.toolName,
        descripcion: params.descripcion,
        metadata: { tool: params.toolName, ...(params.metadata ?? {}) },
      },
    })
  } catch (error) {
    console.error('[MCP gate] No se pudo auditar la decisión:', error)
  }
}

/**
 * Resuelve la decisión y, si es `ask`, crea (o reutiliza) la solicitud.
 *
 * Reutilizar importa: un agente que reintenta la misma operación no debe
 * generar varias solicitudes en la bandeja del responsable. La identidad es el
 * `operationId` de ese usuario y el índice único `(empresa, usuario,
 * operationId)` la impone; aquí se traduce en «devuelve la que ya existe».
 * Sin `operationId` la identidad es el contenido de ese usuario: el índice
 * parcial reserva una sola solicitud pendiente por empresa, usuario,
 * herramienta y argumentos (la huella no incluye la identidad).
 */
export async function enforceToolGate(input: GateInput): Promise<GateOutcome> {
  const { tenantId, userId, roleName, toolName, args, via } = input

  // Sin identidad no hay decisión posible: se cierra.
  if (!tenantId || !userId) {
    const reason =
      'La credencial no identifica empresa y usuario; el gate no puede autorizar la llamada.'
    await auditar({
      tenantId,
      userId,
      toolName,
      accion: 'MCP_tool_denied',
      descripcion: 'Llamada MCP sin identidad completa',
      metadata: { via, motivo: 'identidad_incompleta' },
    })
    return { kind: 'deny', decision: 'deny', reason, risk: null }
  }

  const overrides = (await prisma.mcpToolCapability.findMany({
    where: { tenantId, toolName },
    select: { roleName: true, decision: true },
  })) as CapabilityOverride[]

  const resuelta = decideToolCall({ toolName, roleName, overrides })

  if (resuelta.decision === 'deny') {
    await auditar({
      tenantId,
      userId,
      toolName,
      accion: 'MCP_tool_denied',
      descripcion: `Denegado ${toolName}${roleName ? ` para el rol ${roleName}` : ''}`,
      metadata: {
        via,
        roleName: roleName ?? null,
        risk: resuelta.risk,
        source: resuelta.source,
        motivo: resuelta.reason,
      },
    })
    return { kind: 'deny', decision: 'deny', reason: resuelta.reason, risk: resuelta.risk }
  }

  if (resuelta.decision === 'allow') {
    return { kind: 'allow', decision: 'allow', reason: resuelta.reason, risk: resuelta.risk }
  }

  // Un id desmedido no se recorta: sería otra identidad y reenviaría.
  const problemaOperationId = errorDeOperationId(args)
  if (problemaOperationId) {
    return { kind: 'deny', decision: 'deny', reason: problemaOperationId, risk: resuelta.risk }
  }

  const operationId = operationIdDeArgs(args)

  // Misma operación del mismo usuario, ya resuelta: se reproduce el desenlace
  // sin crear nada ni mandar un código nuevo. Si sigue pendiente, se cae al
  // flujo normal, que reutiliza el código vigente en vez de emitir otro.
  if (operationId) {
    const previa = (await prisma.mcpApprovalRequest.findFirst({
      where: { tenantId, requestedById: userId, operationId },
      select: CAMPOS_SOLICITUD,
    })) as SolicitudPrevia | null
    if (previa && previa.status !== 'pending') return replayDeSolicitud(previa, resuelta.risk)
  }

  const { approvalId, expiresAt, existente } = await crearOReutilizarSolicitud({
    tenantId,
    userId,
    roleName: roleName ?? null,
    toolName,
    args,
    via,
    reason: resuelta.reason,
    risk: resuelta.risk,
    operationId,
  })
  if (existente && existente.status !== 'pending') {
    return replayDeSolicitud(existente, resuelta.risk)
  }

  // ── Flujo de código por WhatsApp para envíos externos ─────────────────
  // `volkern_send_whatsapp` es de riesgo `external`: se envía un código de 6
  // dígitos al WhatsApp registrado del negocio y se abre una página pública
  // donde se validan los riesgos y se firma con el código. Si no se puede
  // enviar el código (no hay WhatsApp del negocio conectado), se cae al flujo
  // de aprobación interna (`ask`) como respaldo.
  if (toolName === 'volkern_send_whatsapp') {
    try {
      const phoneDestination = String(args.leadId || args.contactId || '')
      const messagePreview = String(args.message || args.mensaje || args.contenido || '')

      const auth = await generateAndSendWhatsappAuthCode({
        approvalId,
        tenantId,
        phoneDestination,
        messagePreview,
      })

      return {
        kind: 'ask_code',
        decision: 'ask',
        reason: 'Se envió un código de autorización al WhatsApp del negocio. Confirma el envío en el enlace que recibiste por WhatsApp.',
        risk: resuelta.risk,
        approvalId,
        expiresAt,
        verificationToken: auth.verificationToken,
        verificationUrl: auth.verificationUrl,
        codeExpiresAt: auth.codeExpiresAt,
        phoneNumberMasked: auth.phoneNumberMasked,
      }
    } catch (authError) {
      console.error(
        '[MCP gate] No se pudo iniciar la autorización por WhatsApp:',
        authError instanceof Error ? authError.message : String(authError)
      )
      // Fallback: aprobación interna por bandeja.
    }
  }

  return {
    kind: 'ask',
    decision: 'ask',
    reason: resuelta.reason,
    risk: resuelta.risk,
    approvalId,
    expiresAt,
  }
}

/**
 * Crea (o reutiliza) una `McpApprovalRequest` pendiente.
 *
 * Comparte la lógica de auditoría de `enforceToolGate`. Hay dos cerrojos en la
 * base: `(empresa, usuario, operationId)` para una operación con identidad y un
 * índice parcial único por usuario, herramienta y argumentos para las
 * solicitudes pendientes sin `operationId`, que evita que el mismo envío se
 * reserve dos veces.
 */
async function crearOReutilizarSolicitud(params: {
  tenantId: string
  userId: string
  roleName: string | null
  toolName: string
  args: Record<string, unknown>
  via: GateSurface
  reason: string
  risk?: ToolRisk | null
  operationId?: string | null
}): Promise<{
  approvalId: string
  expiresAt: Date
  existente: SolicitudPrevia | null
}> {
  const { tenantId, userId, roleName, toolName, args, via, reason, risk, operationId } = params
  const argumentsHash = hashToolArguments(args)
  const expiresAt = new Date(Date.now() + APROBACION_VALIDEZ_HORAS * 60 * 60 * 1000)

  // Sin `operationId` la identidad es el contenido de ESE usuario: una
  // solicitud pendiente suya con los mismos argumentos es la reserva y se
  // devuelve en vez de crear otra. Nunca se reutiliza la de otra persona, que
  // podría acabar aprobando un envío ajeno.
  if (!operationId) {
    const pendiente = (await prisma.mcpApprovalRequest.findFirst({
      where: {
        tenantId,
        requestedById: userId,
        toolName,
        argumentsHash,
        status: 'pending',
        operationId: null,
      },
      select: CAMPOS_SOLICITUD,
    })) as SolicitudPrevia | null
    if (pendiente) {
      if (pendiente.expiresAt.getTime() <= Date.now()) {
        await prisma.mcpApprovalRequest.update({
          where: { id: pendiente.id },
          data: { expiresAt },
        })
        pendiente.expiresAt = expiresAt
      }
      return { approvalId: pendiente.id, expiresAt: pendiente.expiresAt, existente: pendiente }
    }
  }

  let approvalId: string
  try {
    const creada = await prisma.mcpApprovalRequest.create({
      data: {
        tenantId,
        toolName,
        arguments: args as never,
        argumentsHash,
        operationId: operationId ?? null,
        requestedById: userId,
        roleName,
        via,
        reason,
        expiresAt,
      },
      select: { id: true },
    })
    approvalId = creada.id
  } catch (error: any) {
    // P2002 viene de uno de los dos únicos: la operación del usuario o la
    // reserva pendiente por contenido. Otra petición se adelantó entre la
    // comprobación previa y este INSERT; se devuelve la fila ganadora.
    if (error?.code !== 'P2002') throw error
    const existente = (await prisma.mcpApprovalRequest.findFirst({
      where: operationId
        ? { tenantId, requestedById: userId, operationId }
        : {
            tenantId,
            requestedById: userId,
            toolName,
            argumentsHash,
            status: 'pending',
            operationId: null,
          },
      select: CAMPOS_SOLICITUD,
    })) as SolicitudPrevia | null
    if (!existente) throw error
    return { approvalId: existente.id, expiresAt: existente.expiresAt, existente }
  }

  await auditar({
    tenantId,
    userId,
    toolName,
    accion: 'MCP_tool_approval_requested',
    descripcion: `Aprobación solicitada para ${toolName}`,
    metadata: {
      via,
      approvalId,
      roleName,
      risk,
      // Los argumentos viven en la solicitud; en auditoría basta su huella.
      argumentsHash,
      argumentKeys: Object.keys(args).sort(),
      motivo: reason,
    },
  })

  return { approvalId, expiresAt, existente: null }
}

/**
 * Puerta de aprobación para las herramientas del AGENTE del chat (clase C/D).
 *
 * Las tools del catálogo MCP resuelven su riesgo con `decideToolCall` sobre
 * `TOOL_POLICIES`; las del agente (`cancel_booking`, por ejemplo) son skills
 * sin fila en esa tabla, pero su clase A/B/C/D ya la decidió el backend en
 * `riesgo-herramientas`. Aquí se crea la misma `McpApprovalRequest` que ve la
 * bandeja MCP, con `via: VIA_CHAT` para que la resolución sepa ejecutar por
 * el registro del agente y no por `handleCallTool`.
 */
export async function requestAgentToolApproval(params: {
  tenantId: string
  userId: string
  roleName: string | null
  toolName: string
  args: Record<string, unknown>
  risk: 'external' | 'destructive'
}): Promise<{ approvalId: string; expiresAt: Date }> {
  const { tenantId, userId, roleName, toolName, args, risk } = params
  if (!tenantId || !userId) {
    await auditar({
      tenantId,
      userId,
      toolName,
      accion: 'MCP_tool_denied',
      descripcion: 'Aprobación del agente sin identidad completa',
      metadata: { via: VIA_CHAT, motivo: 'identidad_incompleta' },
    })
    throw new Error('Sin identidad de empresa y usuario no se puede pedir aprobación.')
  }

  const reason =
    risk === 'external'
      ? 'La acción envía algo fuera del sistema y no se puede deshacer.'
      : 'La acción borra o cancela datos de forma irreversible.'

  const problemaOperationId = errorDeOperationId(args)
  if (problemaOperationId) throw new Error(problemaOperationId)

  return crearOReutilizarSolicitud({
    tenantId,
    userId,
    roleName,
    toolName,
    args,
    via: VIA_CHAT,
    reason,
    risk,
    operationId: operationIdDeArgs(args),
  })
}

export interface ApprovalRow {
  id: string
  tenantId: string
  toolName: string
  arguments: Record<string, unknown>
  argumentsHash: string
  /** Identificador explícito de operación que mandó el cliente. */
  operationId: string | null
  requestedById: string
  roleName: string | null
  via: string
  status: string
  expiresAt: Date
  /** Hash del código de 6 dígitos: la fila nació del flujo `ask_code`. */
  whatsappCodeHash: string | null
  /** Token público de la página que valida ese código. */
  whatsappVerificationToken: string | null
}

export type ClaimResult =
  | { status: 'approved'; approval: ApprovalRow }
  | { status: 'rejected'; approval: ApprovalRow }
  /** Otra fila del mismo contenido ya está aprobada o se ejecutó hace poco. */
  | { status: 'duplicate'; approval: ApprovalRow }
  /** La solicitud exige validar el código de WhatsApp: la bandeja no basta. */
  | { status: 'code_required'; approval: ApprovalRow }
  | { status: 'not_found' }
  | { status: 'conflict'; approval: ApprovalRow }
  | { status: 'expired'; approval: ApprovalRow }
  | { status: 'self_approval' }

/**
 * Reclama una solicitud con bloqueo de fila.
 *
 * La transacción es corta a propósito: bloquea, verifica y marca. La ejecución
 * de la herramienta ocurre fuera, para no retener el cerrojo mientras se
 * escribe en el CRM. La garantía se mantiene porque el segundo intento
 * encuentra `status = 'approved'` y devuelve conflicto, nunca ejecuta otra vez.
 */
/**
 * Ventanas del cerrojo por contenido (ver `solicitudIdenticaEnEjecucion`).
 *
 * 15 min cubren una ejecución en curso con margen sobre el barrido de
 * huérfanas (cierra a los 10). 5 min dejan pasar un reenvío deliberado del
 * mismo texto poco después, sin permitir la segunda aprobación de un duplicado.
 */
const VENTANA_APROBACION_EN_CURSO_MS = 15 * 60 * 1000
const VENTANA_EJECUCION_RECIENTE_MS = 5 * 60 * 1000

/**
 * Busca otra solicitud del mismo contenido que ya esté en ejecución o se haya
 * ejecutado hace poco, dentro de la transacción que la va a aprobar.
 *
 * La reserva por contenido es por usuario y no impide que dos personas pidan lo
 * mismo: cada una tiene su fila pendiente y, sin este cerrojo, aprobar las dos
 * ejecutaría el envío dos veces. El `pg_advisory_xact_lock` serializa a quienes
 * compiten por el mismo contenido; la comprobación y el paso a `approved`
 * ocurren bajo el mismo cerrojo. No toca la separación de funciones: quien
 * resuelve sigue sin poder aprobar lo que pidió.
 *
 * Las ventanas acotan el bloqueo: `approved` es una ejecución en curso (si el
 * proceso muere, deja de bloquear a los 15 min) y `executed` solo bloquea los
 * 5 min siguientes, para que un reenvío deliberado del mismo texto siga siendo
 * posible.
 */
export async function solicitudIdenticaEnEjecucion(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; toolName: string; argumentsHash: string; excluirId: string }
): Promise<boolean> {
  const clave = `${params.tenantId}:${params.toolName}:${params.argumentsHash}`
  // `::text` porque Prisma no sabe deserializar la columna `void` del lock.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))::text`

  const ahora = Date.now()
  const enCursoOReciente = await tx.mcpApprovalRequest.findFirst({
    where: {
      tenantId: params.tenantId,
      toolName: params.toolName,
      argumentsHash: params.argumentsHash,
      id: { not: params.excluirId },
      OR: [
        { status: 'approved', resolvedAt: { gt: new Date(ahora - VENTANA_APROBACION_EN_CURSO_MS) } },
        { status: 'executed', executedAt: { gt: new Date(ahora - VENTANA_EJECUCION_RECIENTE_MS) } },
      ],
    },
    select: { id: true },
  })
  return enCursoOReciente !== null
}

export async function claimApproval(params: {
  approvalId: string
  tenantId: string
  resolverId: string
  action: 'approve' | 'reject'
}): Promise<ClaimResult> {
  const { approvalId, tenantId, resolverId, action } = params

  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<ApprovalRow[]>`
      SELECT id, "tenantId", "toolName", arguments, "argumentsHash", "operationId",
             "requestedById", "roleName", via, status, "expiresAt",
             "whatsappCodeHash", "whatsappVerificationToken"
      FROM "mcp_approval_requests"
      WHERE id = ${approvalId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `

    const fila = filas[0]
    if (!fila) return { status: 'not_found' } as ClaimResult

    if (fila.status !== 'pending') {
      return { status: 'conflict', approval: fila } as ClaimResult
    }

    if (new Date(fila.expiresAt) < new Date()) {
      const expirada = await tx.mcpApprovalRequest.update({
        where: { id: fila.id },
        data: { status: 'expired', resolvedAt: new Date() },
      })
      return { status: 'expired', approval: expirada as ApprovalRow } as ClaimResult
    }

    // Separación de funciones: quien pide no aprueba. Si no, el gate sólo es
    // un clic de más para la misma persona.
    if (fila.requestedById === resolverId) {
      return { status: 'self_approval' } as ClaimResult
    }

    // Segundo factor pendiente: una solicitud `ask_code` (envío externo, p. ej.
    // `volkern_send_whatsapp`) solo se ejecuta validando el código enviado al
    // WhatsApp del negocio. Aprobarla desde la bandeja se saltaría ese paso, así
    // que se rechaza aquí: el camino válido es `verify-code`, que compara el
    // código y ejecuta. Rechazar sí se permite: desactivar es seguro.
    if (action === 'approve' && fila.whatsappCodeHash) {
      return { status: 'code_required', approval: fila } as ClaimResult
    }

    if (action === 'approve') {
      const duplicada = await solicitudIdenticaEnEjecucion(tx, {
        tenantId,
        toolName: fila.toolName,
        argumentsHash: fila.argumentsHash,
        excluirId: fila.id,
      })
      if (duplicada) return { status: 'duplicate', approval: fila } as ClaimResult
    }

    const actualizada = await tx.mcpApprovalRequest.update({
      where: { id: fila.id },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        resolvedById: resolverId,
        resolvedAt: new Date(),
      },
    })

    return {
      status: action === 'approve' ? 'approved' : 'rejected',
      approval: actualizada as ApprovalRow,
    } as ClaimResult
  })
}

/** Marca el desenlace de la ejecución ya reclamada. */
export async function completeApproval(params: {
  approvalId: string
  ok: boolean
  result: unknown
  /** Id del mensaje del proveedor: es la llave para casar su ACK después. */
  whatsappMessageId?: string | null
}): Promise<void> {
  try {
    await prisma.mcpApprovalRequest.update({
      where: { id: params.approvalId },
      data: {
        status: params.ok ? 'executed' : 'failed',
        executedAt: new Date(),
        result: params.result as never,
        ...(params.whatsappMessageId
          ? { whatsappMessageId: params.whatsappMessageId }
          : {}),
      },
    })
  } catch (error) {
    console.error('[MCP gate] No se pudo cerrar la solicitud:', error)
  }
}

/** Auditoría del desenlace de una aprobación (aprobada, rechazada, ejecutada). */
export async function auditApprovalOutcome(params: {
  tenantId: string
  userId: string
  toolName: string
  accion: 'MCP_tool_approved' | 'MCP_tool_rejected' | 'MCP_tool_approval_executed'
  approvalId: string
  detalle?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await auditar({
    tenantId: params.tenantId,
    userId: params.userId,
    toolName: params.toolName,
    accion: params.accion,
    descripcion: params.detalle ?? `${params.accion}: ${params.toolName}`,
    metadata: { approvalId: params.approvalId, ...(params.metadata ?? {}) },
  })
}

/** Utilidad para pruebas y para la bandeja: lista pendientes de una empresa. */
export async function listPendingApprovals(tenantId: string, limit = 50) {
  return prisma.mcpApprovalRequest.findMany({
    where: { tenantId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
  })
}

/** Decisión sin efectos (para la UI de permisos y para tests). */
export function previewDecision(params: {
  toolName: string
  roleName?: string | null
  overrides?: CapabilityOverride[]
}): { decision: ToolDecision; reason: string; risk: ToolRisk | null } {
  const r = decideToolCall(params)
  return { decision: r.decision, reason: r.reason, risk: r.risk }
}
