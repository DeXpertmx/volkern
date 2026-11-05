/**
 * Política estática del gate de herramientas MCP.
 *
 * Qué decide este fichero: el TECHO de lo que una herramienta permite. Vive en
 * código —y por tanto se cambia con un despliegue— a propósito: un cliente no
 * debe poder declarar inofensivo un borrado físico ni un mensaje a un tercero.
 * Lo que sí configura cada empresa son los overrides (`mcp_tool_capabilities`):
 * restringir siempre, y aflojar únicamente dentro de `write` y `financial`.
 *
 * Denegación por defecto: una herramienta que no esté en `TOOL_POLICIES` se
 * deniega. Añadir una tool al catálogo MCP sin clasificarla aquí la deja
 * cerrada, no abierta.
 */

export type ToolRisk = 'read' | 'write' | 'financial' | 'external' | 'destructive'

export type ToolDecision = 'allow' | 'ask' | 'deny'

export interface ToolPolicy {
  risk: ToolRisk
  /** Módulo del CRM al que pertenece, para agrupar en la UI de permisos. */
  module: string
  /**
   * Capacidad, con la forma `<recurso>.<acción>` (`contacts.delete`).
   *
   * Es la clave que comparten las dos superficies: la herramienta MCP
   * `volkern_delete_contact` y `DELETE /api/contacts/[id]` declaran la misma
   * capacidad porque son el mismo hecho con dos puertas. Cuando una capacidad
   * aparece en las dos tablas, el riesgo debe coincidir; el test guardián lo
   * comprueba, para que reclasificar una superficie no deje la otra mintiendo.
   */
  capability: string
}

/**
 * Las 43 herramientas del catálogo MCP (`mcp-server/src/tools-catalog.ts`).
 *
 * - `read`        → consulta. Sin efectos.
 * - `write`       → crea o modifica datos del CRM. Reversible por el usuario.
 * - `financial`   → genera documentos con valor (cotización, orden, contrato).
 * - `external`    → sale del sistema: un mensaje llega a un tercero y no se puede
 *                   deshacer.
 * - `destructive` → borra o consume de forma irreversible.
 */
export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  // ── Contactos ────────────────────────────────────────────────────────────
  volkern_list_contacts: { risk: 'read', module: 'contactos', capability: 'contacts.read' },
  volkern_get_contact: { risk: 'read', module: 'contactos', capability: 'contacts.read' },
  volkern_create_contact: { risk: 'write', module: 'contactos', capability: 'contacts.write' },
  volkern_update_contact: { risk: 'write', module: 'contactos', capability: 'contacts.write' },
  volkern_delete_contact: { risk: 'destructive', module: 'contactos', capability: 'contacts.delete' },

  // ── Leads ────────────────────────────────────────────────────────────────
  volkern_list_leads: { risk: 'read', module: 'leads', capability: 'leads.read' },
  volkern_get_lead: { risk: 'read', module: 'leads', capability: 'leads.read' },
  volkern_create_lead: { risk: 'write', module: 'leads', capability: 'leads.write' },
  volkern_update_lead: { risk: 'write', module: 'leads', capability: 'leads.write' },

  // ── Agenda ───────────────────────────────────────────────────────────────
  volkern_check_disponibilidad: { risk: 'read', module: 'agenda', capability: 'agenda.read' },
  volkern_list_citas: { risk: 'read', module: 'agenda', capability: 'agenda.read' },
  volkern_create_cita: { risk: 'write', module: 'agenda', capability: 'agenda.write' },
  volkern_update_cita: { risk: 'write', module: 'agenda', capability: 'agenda.write' },
  volkern_cita_accion: { risk: 'write', module: 'agenda', capability: 'agenda.write' },

  // ── Catálogo ─────────────────────────────────────────────────────────────
  volkern_list_catalogo: { risk: 'read', module: 'catalogo', capability: 'catalogo.read' },
  volkern_get_catalogo_item: { risk: 'read', module: 'catalogo', capability: 'catalogo.read' },
  volkern_create_catalogo_item: { risk: 'write', module: 'catalogo', capability: 'catalogo.write' },
  volkern_update_catalogo_item: { risk: 'write', module: 'catalogo', capability: 'catalogo.write' },
  volkern_search_catalogo: { risk: 'read', module: 'catalogo', capability: 'catalogo.read' },
  volkern_list_servicios: { risk: 'read', module: 'catalogo', capability: 'catalogo.read' },
  volkern_get_servicio: { risk: 'read', module: 'catalogo', capability: 'catalogo.read' },

  // ── Tareas y actividad ───────────────────────────────────────────────────
  volkern_create_task: { risk: 'write', module: 'tareas', capability: 'tasks.write' },
  volkern_list_tasks: { risk: 'read', module: 'tareas', capability: 'tasks.read' },
  volkern_complete_task: { risk: 'write', module: 'tareas', capability: 'tasks.write' },
  volkern_create_interaction: { risk: 'write', module: 'actividad', capability: 'activity.write' },
  volkern_list_interactions: { risk: 'read', module: 'actividad', capability: 'activity.read' },
  volkern_list_notes: { risk: 'read', module: 'actividad', capability: 'activity.read' },
  volkern_create_note: { risk: 'write', module: 'actividad', capability: 'activity.write' },

  // ── Conversaciones ───────────────────────────────────────────────────────
  volkern_send_whatsapp: { risk: 'external', module: 'conversaciones', capability: 'messages.send' },
  volkern_list_conversaciones: { risk: 'read', module: 'conversaciones', capability: 'conversations.read' },

  // ── Ventas ───────────────────────────────────────────────────────────────
  volkern_list_deals: { risk: 'read', module: 'ventas', capability: 'sales.read' },
  volkern_create_deal: { risk: 'write', module: 'ventas', capability: 'sales.write' },
  volkern_create_cotizacion: { risk: 'financial', module: 'ventas', capability: 'quotes.write' },
  volkern_list_ordenes_venta: { risk: 'read', module: 'ventas', capability: 'orders.read' },
  volkern_get_orden_venta: { risk: 'read', module: 'ventas', capability: 'orders.read' },
  volkern_create_orden_from_cotizacion: { risk: 'financial', module: 'ventas', capability: 'orders.write' },
  volkern_create_contrato_from_cotizacion: { risk: 'financial', module: 'ventas', capability: 'contracts.write' },

  // ── Finanzas e inventario ────────────────────────────────────────────────
  volkern_get_financial_dashboard: { risk: 'read', module: 'finanzas', capability: 'finance.read' },
  volkern_calculate_tax_provisions: { risk: 'financial', module: 'finanzas', capability: 'finance.provisions' },
  volkern_verify_vault_integrity: { risk: 'read', module: 'finanzas', capability: 'finance.read' },
  volkern_get_inventory_health: { risk: 'read', module: 'inventario', capability: 'inventory.read' },
  volkern_process_inventory_consumption: { risk: 'destructive', module: 'inventario', capability: 'inventory.consume' },
  volkern_report_production_scrap: { risk: 'destructive', module: 'inventario', capability: 'production.scrap' },
}

/** Tipos de rol normalizados: los nombres reales llegan de la tabla Role. */
export type RoleKind = 'owner' | 'admin' | 'sales' | 'support' | 'instructor' | 'custom'

const ROLE_ALIASES: Record<string, RoleKind> = {
  owner: 'owner',
  superadmin: 'owner',
  superadministrador: 'owner',
  admin: 'admin',
  administrador: 'admin',
  gerente: 'admin',
  'sales agent': 'sales',
  'agente comercial': 'sales',
  comercial: 'sales',
  ventas: 'sales',
  vendedor: 'sales',
  support: 'support',
  soporte: 'support',
  instructor: 'instructor',
}

/**
 * Normaliza el nombre del rol. Un rol personalizado cae en `custom`, que es
 * deliberadamente conservador (no hereda permisos de admin).
 */
export function roleKind(roleName?: string | null): RoleKind {
  if (!roleName) return 'custom'
  return ROLE_ALIASES[roleName.trim().toLowerCase()] ?? 'custom'
}

/**
 * Decisión base por riesgo y rol, antes de overrides del cliente.
 *
 * `external` y `destructive` piden aprobación incluso a OWNER: son las dos
 * únicas categorías en las que un error no se puede deshacer —un WhatsApp
 * enviado, un contacto borrado— y por eso no existe un rol que las ejecute
 * sin que alguien las vea antes.
 */
const MATRIX: Record<ToolRisk, Record<RoleKind, ToolDecision>> = {
  read: { owner: 'allow', admin: 'allow', sales: 'allow', support: 'allow', instructor: 'allow', custom: 'allow' },
  write: { owner: 'allow', admin: 'allow', sales: 'allow', support: 'allow', instructor: 'ask', custom: 'ask' },
  financial: { owner: 'allow', admin: 'allow', sales: 'allow', support: 'ask', instructor: 'ask', custom: 'ask' },
  external: { owner: 'ask', admin: 'ask', sales: 'ask', support: 'ask', instructor: 'ask', custom: 'ask' },
  destructive: { owner: 'ask', admin: 'ask', sales: 'deny', support: 'deny', instructor: 'deny', custom: 'deny' },
}

const RANK: Record<ToolDecision, number> = { allow: 0, ask: 1, deny: 2 }

/** Override guardado para una empresa (`mcp_tool_capabilities`). */
export interface CapabilityOverride {
  roleName: string | null
  decision: string
}

export type DecisionSource = 'matriz' | 'override-rol' | 'override-empresa'

export interface ToolDecisionResult {
  decision: ToolDecision
  risk: ToolRisk | null
  policy: ToolPolicy | null
  source: DecisionSource
  /** Frase lista para enseñar al usuario; explica el porqué, no sólo el qué. */
  reason: string
}

function isDecision(value: string): value is ToolDecision {
  return value === 'allow' || value === 'ask' || value === 'deny'
}

/**
 * Aplica un override del cliente sobre la decisión base.
 *
 * Regla de seguridad: el override puede RESTRINGIR siempre, pero sólo puede
 * AFLOJAR (`ask` → `allow`) en `write` y `financial`. En `read`, `external` y
 * `destructive` el techo de la matriz es intocable: nadie habilita un borrado
 * ni un mensaje a un tercero desde una pantalla de configuración.
 */
function applyOverride(risk: ToolRisk, base: ToolDecision, override: string): ToolDecision {
  if (!isDecision(override)) return base
  if (risk === 'write' || risk === 'financial') return override
  return RANK[override] > RANK[base] ? override : base
}

/**
 * Decide si una herramienta se permite, pide aprobación o se deniega.
 *
 * Función pura: recibe los overrides ya leídos, no toca la base de datos. Eso
 * permite probar la matriz entera sin Postgres y mantiene una sola definición
 * de la regla para las dos superficies MCP.
 */
export function decideToolCall(params: {
  toolName: string
  roleName?: string | null
  overrides?: CapabilityOverride[]
}): ToolDecisionResult {
  const { toolName, roleName, overrides = [] } = params
  const policy = TOOL_POLICIES[toolName]

  if (!policy) {
    return {
      decision: 'deny',
      risk: null,
      policy: null,
      source: 'matriz',
      reason: `La herramienta "${toolName}" no está clasificada en el catálogo de permisos. Se deniega por defecto.`,
    }
  }

  const kind = roleKind(roleName)
  const base = MATRIX[policy.risk][kind]

  // El override del rol concreto manda sobre el de toda la empresa.
  const porRol = overrides.find(
    (o) => o.roleName && o.roleName.trim().toLowerCase() === (roleName ?? '').trim().toLowerCase()
  )
  const porEmpresa = overrides.find((o) => o.roleName === null)

  let decision = base
  let source: DecisionSource = 'matriz'

  if (porEmpresa && isDecision(porEmpresa.decision)) {
    decision = applyOverride(policy.risk, base, porEmpresa.decision)
    source = 'override-empresa'
  }
  if (porRol && isDecision(porRol.decision)) {
    decision = applyOverride(policy.risk, decision, porRol.decision)
    source = 'override-rol'
  }

  return {
    decision,
    risk: policy.risk,
    policy,
    source,
    reason: describe({
      decision,
      risk: policy.risk,
      roleName: roleName ?? '(sin rol)',
      kind,
      source,
    }),
  }
}

function describe(params: {
  decision: ToolDecision
  risk: ToolRisk
  roleName: string
  kind: RoleKind
  source: DecisionSource
}): string {
  const { decision, risk, roleName, kind, source } = params
  const porConfig = source === 'matriz' ? '' : ' (configurado por la empresa)'

  if (decision === 'allow') {
    return `Permitido para el rol ${roleName}: una acción de tipo "${risk}" está autorizada.${porConfig}`
  }
  if (decision === 'ask') {
    const motivo =
      risk === 'external'
        ? 'envía un mensaje a un tercero y no se puede deshacer'
        : risk === 'destructive'
          ? 'borra o consume datos de forma irreversible'
          : 'requiere la aprobación de un responsable'
    return `Requiere aprobación: la acción ${motivo}.${porConfig}`
  }
  return kind === 'custom'
    ? `Denegado: el rol ${roleName} no tiene permisos sobre acciones de tipo "${risk}".${porConfig}`
    : `Denegado para el rol ${roleName}: sin permiso sobre acciones de tipo "${risk}".${porConfig}`
}

/** Vista para la pantalla de permisos: las 43 agrupadas por módulo. */
export function listToolPolicies(): Array<{ toolName: string } & ToolPolicy> {
  return Object.entries(TOOL_POLICIES)
    .map(([toolName, policy]) => ({ toolName, ...policy }))
    .sort((a, b) => a.module.localeCompare(b.module) || a.toolName.localeCompare(b.toolName))
}

// ───────────────────────────────────────────────────────────────────────────
// Segunda superficie: REST con credencial de API
// ───────────────────────────────────────────────────────────────────────────

/**
 * Métodos que se clasifican. Una lectura no puede ser irreversible, así que
 * queda fuera de la tabla por definición y no se toca.
 */
export const REST_GATED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const

export type RestMethod = (typeof REST_GATED_METHODS)[number]

export interface RestPolicy {
  method: RestMethod
  /**
   * Plantilla de ruta con la misma forma que el sistema de ficheros de Next
   * (`/api/contacts/[id]`). Así el test guardián puede comprobar, para cada
   * fila, que el fichero existe y exporta ese método, sin mantener una segunda
   * lista de rutas.
   */
  path: string
  /** La misma capacidad que usaría la herramienta MCP equivalente, si existe. */
  capability: string
  risk: ToolRisk
}

/**
 * Las operaciones REST que una credencial de API no puede ejecutar.
 *
 * Sólo entran `destructive` y `external`: son las dos categorías en las que un
 * error no se deshace —un contacto borrado, un WhatsApp enviado— y por tanto
 * las únicas que no se pueden delegar a una clave. `write` y `financial`
 * siguen como estaban (§6 del documento de alcance).
 *
 * Es una lista curada, no la superficie entera: la tabla no pretende mapear
 * las 291 rutas alcanzables con credencial —eso envejecería mal— sino cerrar
 * lo irreversible. Lo que no está aquí se comporta exactamente igual que ayer.
 */
export const REST_POLICIES: readonly RestPolicy[] = [
  { method: 'DELETE', path: '/api/contacts/[id]', capability: 'contacts.delete', risk: 'destructive' },
  { method: 'DELETE', path: '/api/leads/[id]', capability: 'leads.delete', risk: 'destructive' },
  { method: 'DELETE', path: '/api/catalogo/[id]', capability: 'catalogo.delete', risk: 'destructive' },
  { method: 'DELETE', path: '/api/mensajes/conversaciones/[id]', capability: 'conversations.delete', risk: 'destructive' },
  { method: 'POST', path: '/api/erp/inventory/consumption', capability: 'inventory.consume', risk: 'destructive' },
  { method: 'POST', path: '/api/erp/production/scrap', capability: 'production.scrap', risk: 'destructive' },
  { method: 'POST', path: '/api/erp/production/report-waste', capability: 'production.waste', risk: 'destructive' },
  // Un CFDI timbrado no se anula: se sustituye por nota de crédito. No es
  // "un documento más", y por eso está aquí y no en `financial`.
  { method: 'POST', path: '/api/ordenes-venta/[id]/facturar', capability: 'orders.invoice', risk: 'destructive' },

  { method: 'POST', path: '/api/mensajes/enviar', capability: 'messages.send', risk: 'external' },
  { method: 'POST', path: '/api/campanas/[id]/ejecutar', capability: 'campaigns.execute', risk: 'external' },
  { method: 'POST', path: '/api/contratos/[id]/send', capability: 'contracts.send', risk: 'external' },
  { method: 'POST', path: '/api/contratos/[id]/volkernsign', capability: 'contracts.request_signature', risk: 'external' },
]

/**
 * Riesgos que una credencial nunca ejecuta, ni con override ni por rol.
 *
 * `external` y `destructive` piden aprobación incluso a `owner` en MCP; por
 * REST no hay dónde pedirla, así que la respuesta honesta es que no. Una
 * credencial no es un sujeto aprobable.
 */
const REST_UNEXECUTABLE: ReadonlySet<ToolRisk> = new Set<ToolRisk>(['destructive', 'external'])

/** Índice inverso capacidad → herramienta MCP, para elegir el mensaje correcto. */
const MCP_TOOL_BY_CAPABILITY: Record<string, string> = (() => {
  const index: Record<string, string> = {}
  for (const [toolName, policy] of Object.entries(TOOL_POLICIES)) {
    // Si dos herramientas comparten capacidad, gana la primera: sólo se usa
    // para nombrar la puerta alternativa en un mensaje de error.
    if (!index[policy.capability]) index[policy.capability] = toolName
  }
  return index
})()

/** La herramienta MCP con la misma capacidad, si existe. */
export function mcpToolForCapability(capability: string): string | null {
  return MCP_TOOL_BY_CAPABILITY[capability] ?? null
}

function pathSegments(path: string): string[] {
  return path.split('?')[0].split('/').filter(Boolean)
}

function isParamSegment(segment: string): boolean {
  return (segment.startsWith('[') && segment.endsWith(']')) || segment.startsWith(':')
}

/**
 * Busca la fila que cubre `método + ruta`. Acepta `[id]` o `:id` como
 * parámetro, para que el test pueda pasar tal cual la ruta del fichero.
 * Devuelve `null` si la ruta no está clasificada (que es el caso normal).
 */
export function matchRestPolicy(method?: string | null, path?: string | null): RestPolicy | null {
  if (!method || !path) return null
  const wanted = method.toUpperCase()
  const actual = pathSegments(path)

  for (const policy of REST_POLICIES) {
    if (policy.method !== wanted) continue
    const template = pathSegments(policy.path)
    if (template.length !== actual.length) continue
    if (template.every((segment, i) => isParamSegment(segment) || segment === actual[i])) {
      return policy
    }
  }
  return null
}

export type RestDecision =
  | {
      decision: 'allow'
      capability: null
      risk: null
      mcpTool: null
      /** Frase lista para devolver al cliente; dice por qué, no sólo qué. */
      reason: string
    }
  | {
      decision: 'deny'
      capability: string
      risk: ToolRisk
      /** Herramienta MCP con la misma capacidad; `null` si no hay equivalente. */
      mcpTool: string | null
      reason: string
    }

/**
 * Decide si una petición REST con credencial de API puede ejecutarse.
 *
 * Función pura y sin identidad a propósito: la decisión **no depende del rol**,
 * porque el sujeto no es una persona sino una clave. Por eso no recibe
 * `roleName`: aceptarlo sugeriría que existe un rol que sí puede, y no existe.
 */
export function decideRestCall(params: {
  method?: string | null
  path?: string | null
}): RestDecision {
  const { method, path } = params
  const wanted = (method ?? '').toUpperCase()

  const allow = (reason: string): RestDecision => ({
    decision: 'allow',
    capability: null,
    risk: null,
    mcpTool: null,
    reason,
  })

  if (!REST_GATED_METHODS.includes(wanted as RestMethod)) {
    return allow('Método de lectura o sin clasificar: no tiene efectos irreversibles.')
  }

  const policy = matchRestPolicy(wanted, path)
  if (!policy) {
    return allow('Ruta no clasificada en la tabla de capacidades: se mantiene el comportamiento actual.')
  }

  if (!REST_UNEXECUTABLE.has(policy.risk)) {
    return allow(
      `Acción de tipo "${policy.risk}" (${policy.capability}): reversible, se permite con el scope que exige la ruta.`
    )
  }

  const mcpTool = mcpToolForCapability(policy.capability)
  const puerta = mcpTool
    ? 'La misma capacidad por MCP requiere la aprobación de un responsable.'
    : 'No tiene equivalente MCP: requiere la sesión de una persona en la interfaz.'

  return {
    decision: 'deny',
    capability: policy.capability,
    risk: policy.risk,
    mcpTool,
    reason: `Operación irreversible: no se ejecuta con una credencial de API. ${puerta}`,
  }
}
