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

export interface GateInput {
  tenantId?: string
  userId?: string
  roleName?: string | null
  toolName: string
  args: Record<string, unknown>
  via: GateSurface
}

/** Hash estable de los argumentos: mismo contenido, mismo hash, mismo orden. */
export function hashToolArguments(args: Record<string, unknown>): string {
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
  return createHash('sha256').update(JSON.stringify(canonico(args))).digest('hex')
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
 * Reutilizar importa: un agente que reintenta tres veces la misma acción no
 * debe generar tres solicitudes idénticas en la bandeja del responsable. El
 * índice parcial único de la migración lo garantiza y aquí se traduce en
 * "devuelve la que ya está pendiente".
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

  const { approvalId, expiresAt } = await crearOReutilizarSolicitud({
    tenantId,
    userId,
    roleName: roleName ?? null,
    toolName,
    args,
    via,
    reason: resuelta.reason,
    risk: resuelta.risk,
  })

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
 * Comparte la lógica de dedupe y auditoría de `enforceToolGate`: un reintento
 * idéntico no genera una segunda solicitud en la bandeja del responsable. El
 * índice parcial único de la migración y el hash canónico de argumentos son el
 * cerrojo; aquí se traducen en «devuelve la que ya está pendiente».
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
}): Promise<{ approvalId: string; expiresAt: Date }> {
  const { tenantId, userId, roleName, toolName, args, via, reason, risk } = params
  const argumentsHash = hashToolArguments(args)
  const expiresAt = new Date(Date.now() + APROBACION_VALIDEZ_HORAS * 60 * 60 * 1000)

  let approvalId: string
  try {
    const creada = await prisma.mcpApprovalRequest.create({
      data: {
        tenantId,
        toolName,
        arguments: args as never,
        argumentsHash,
        requestedById: userId,
        roleName,
        via,
        reason,
        expiresAt,
      },
      select: { id: true },
    })
    approvalId = creada.id
  } catch (error) {
    // P2002: ya hay una pendiente idéntica; se devuelve ésa en vez de duplicar.
    const existente = await prisma.mcpApprovalRequest.findFirst({
      where: { tenantId, toolName, argumentsHash, status: 'pending' },
      select: { id: true },
    })
    if (!existente) throw error
    approvalId = existente.id
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

  return { approvalId, expiresAt }
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

  return crearOReutilizarSolicitud({
    tenantId,
    userId,
    roleName,
    toolName,
    args,
    via: VIA_CHAT,
    reason,
    risk,
  })
}

export interface ApprovalRow {
  id: string
  tenantId: string
  toolName: string
  arguments: Record<string, unknown>
  argumentsHash: string
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
export async function claimApproval(params: {
  approvalId: string
  tenantId: string
  resolverId: string
  action: 'approve' | 'reject'
}): Promise<ClaimResult> {
  const { approvalId, tenantId, resolverId, action } = params

  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<ApprovalRow[]>`
      SELECT id, "tenantId", "toolName", arguments, "argumentsHash", "requestedById",
             "roleName", via, status, "expiresAt",
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
}): Promise<void> {
  try {
    await prisma.mcpApprovalRequest.update({
      where: { id: params.approvalId },
      data: {
        status: params.ok ? 'executed' : 'failed',
        executedAt: new Date(),
        result: params.result as never,
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
