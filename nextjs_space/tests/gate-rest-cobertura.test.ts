/**
 * Guardián del gate REST.
 *
 * El gate deniega con 403 las operaciones `destructive` y `external` cuando
 * quien llama es una credencial de API (docs/gate-rest-alcance-minimo.md). Una
 * tabla que sólo vive en un documento se queda vieja a la primera ruta
 * renombrada, así que esto la ata al código:
 *
 *   1. **Correspondencia** — cada fila apunta a un `route.ts` que existe y que
 *      exporta de verdad ese método. Sin filas fantasma.
 *   2. **Superficie** — cada fila es alcanzable con credencial: si una ruta deja
 *      de serlo, la fila es peso muerto y el test lo dice.
 *   3. **Decisión** — lo irreversible se deniega siempre; lo demás se comporta
 *      exactamente igual que antes. Los dos lados del contrato.
 *   4. **Coherencia entre puertas** — si una capacidad existe en las dos
 *      tablas, el riesgo coincide: reclasificar MCP no puede dejar REST
 *      mintiendo.
 *   5. **Red de seguridad** — la superficie de `DELETE` alcanzable con
 *      credencial está congelada. Una ruta de borrado nueva no puede entrar sin
 *      que alguien la mire.
 *
 * Lo que este test NO afirma: que las 291 rutas alcanzables con credencial
 * estén bien protegidas. 138 de ellas no declaran ni un scope y eso pide su
 * propia tanda (§5). Aquí sólo se garantiza que lo clasificado como
 * irreversible no se ejecuta con una clave.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  decideRestCall,
  mcpToolForCapability,
  REST_POLICIES,
  TOOL_POLICIES,
} from '@/lib/mcp/tool-policy'

const RAIZ = join(__dirname, '..')

/** Capacidad → herramienta MCP que la ofrece. Sólo cuatro son compartidas. */
const MCP_CAPACITIES: Record<string, string> = (() => {
  const index: Record<string, string> = {}
  for (const [toolName, policy] of Object.entries(TOOL_POLICIES)) {
    if (!index[policy.capability]) index[policy.capability] = toolName
  }
  return index
})()

const EXPORT_WRITE = /\bexport\s+(?:const|async function)\s+(POST|PUT|PATCH|DELETE)\b/g
const KEY_AUTH = /authenticateRequest\s*\(|validateApiKey\s*\(|withTenantAuth\s*\(/

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) routeFiles(path, acc)
    else if (entry === 'route.ts') acc.push(path)
  }
  return acc
}

function ficheroDeRuta(policyPath: string): string {
  return join(RAIZ, 'app', policyPath, 'route.ts')
}

function urlDeFichero(file: string): string {
  return relative(join(RAIZ, 'app'), file)
    .replace(/\\/g, '/')
    .replace(/^api/, '/api')
    .replace(/\/route\.ts$/, '')
}

/** Rutas con algún método de escritura alcanzables con credencial de API. */
function superficieConCredencial(): Array<{ url: string; methods: string[] }> {
  const rows: Array<{ url: string; methods: string[] }> = []
  for (const file of routeFiles(join(RAIZ, 'app', 'api'))) {
    const src = readFileSync(file, 'utf8')
    const methods = [...new Set([...src.matchAll(EXPORT_WRITE)].map((m) => m[1]))]
    if (!methods.length) continue
    if (!KEY_AUTH.test(src)) continue
    rows.push({ url: urlDeFichero(file), methods })
  }
  return rows
}

/**
 * Fotografía de las 61 rutas con `DELETE` alcanzables con credencial el
 * 1-nov-2026. Cuatro están clasificadas como `destructive`; las 57 restantes
 * son la deuda declarada en §5 (borrados lógicos, o pendientes del barrido de
 * scopes). Si esta lista cambia, hay una ruta nueva que decidir: clasificarla o
 * añadirla aquí con una nota de por qué se queda fuera.
 */
const DELETE_CON_CREDENCIAL = [
  '/api/accounting/reconciliation/[id]',
  '/api/admin/templates/[id]',
  '/api/ads/ab-tests/[id]',
  '/api/ads/platforms',
  '/api/ads/platforms/[id]',
  '/api/ads/schedules/[id]',
  '/api/ads/watchdog/rules/[id]',
  '/api/ausencias',
  '/api/automation/external/workflows/[id]',
  '/api/automatizaciones/[id]',
  '/api/campanas/[id]',
  '/api/catalogo/[id]',
  '/api/catalogo/field-definitions/[id]',
  '/api/citas/[id]',
  '/api/cms/pages/[id]',
  '/api/configuracion/fiscal/emisores/[id]',
  '/api/configuracion/fiscal/perfiles/[id]',
  '/api/configuracion/fiscal/tasas/[id]',
  '/api/contacts/[id]',
  '/api/contacts/[id]/attachments',
  '/api/contratos/[id]',
  '/api/contratos/plantillas/[id]',
  '/api/cotizaciones/[id]',
  '/api/erp/expenses/ocr-templates',
  '/api/erp/hr/benefits/[id]',
  '/api/erp/logistics/gps/device-mapping',
  '/api/erp/projects/[id]',
  '/api/erp/projects/[id]/milestones/[milestoneId]',
  '/api/erp/suppliers/[id]',
  '/api/formularios/[id]',
  // Deshacer el embudo del alta: borra el embudo y sus etapas, pero solo si no
  // tiene oportunidades dentro; con trabajo encima devuelve 409.
  '/api/implantacion/plan',
  // Deshacer los roles del alta: borra solo lo que creó el alta y que nadie
  // usa; un rol con personas asignadas se conserva y se informa.
  '/api/implantacion/roles',
  // Deshacer los impuestos del alta: borra solo lo que creó el alta y que no
  // está en ninguna cotización, orden o contrato.
  '/api/implantacion/fiscal',
  // Deshacer la marca y los canales del alta: devuelve nombre y color a como
  // estaban y retira las tareas de canal que nadie ha completado.
  '/api/implantacion/marca',
  '/api/hospitality/automatizaciones/[id]',
  '/api/hospitality/blocks/[id]',
  '/api/hospitality/compliance/config',
  '/api/hospitality/comunicaciones/[id]',
  '/api/hospitality/properties/[id]',
  '/api/hospitality/rateplans/[id]',
  '/api/hospitality/reservations/[id]/fianza',
  '/api/hospitality/reservations/[id]/items/[itemId]',
  '/api/hospitality/reservations/[id]/payments/[paymentId]',
  '/api/hospitality/tasks',
  '/api/hospitality/units/[id]',
  '/api/insurance/aseguradoras/[id]',
  '/api/insurance/polizas/[id]',
  '/api/knowledge/[id]',
  '/api/leads/[id]',
  '/api/leads/[id]/attachments',
  '/api/leads/custom-fields',
  '/api/mensajes/conversaciones/[id]',
  '/api/ordenes-venta/[id]',
  '/api/pages/[id]',
  '/api/real-estate/captaciones/[id]',
  '/api/real-estate/properties/[id]',
  '/api/real-estate/properties/[id]/media',
  '/api/slots/[id]',
  '/api/social/configs',
  '/api/social/posts/[id]',
  '/api/tasks/[taskId]',
]

describe('REST · la tabla corresponde al código', () => {
  it('clasifica exactamente las 12 operaciones irreversibles', () => {
    expect(REST_POLICIES).toHaveLength(12)
  })

  it('sólo clasifica lo irreversible: ni una fila de write o financial', () => {
    for (const policy of REST_POLICIES) {
      expect(['destructive', 'external'], `${policy.capability}`).toContain(policy.risk)
    }
    expect(REST_POLICIES.filter((p) => p.risk === 'destructive')).toHaveLength(8)
    expect(REST_POLICIES.filter((p) => p.risk === 'external')).toHaveLength(4)
  })

  it('cada fila apunta a un route.ts que existe y exporta ese método', () => {
    for (const policy of REST_POLICIES) {
      const file = ficheroDeRuta(policy.path)
      const etiqueta = `${policy.method} ${policy.path}`

      expect(existsSync(file), `${etiqueta}: no existe ${file}`).toBe(true)

      const src = readFileSync(file, 'utf8')
      const exporta = new RegExp(`\\bexport\\s+(?:const|async function)\\s+${policy.method}\\b`)
      expect(exporta.test(src), `${etiqueta}: el fichero no exporta ${policy.method}`).toBe(true)
    }
  })

  it('cada fila sigue siendo alcanzable con credencial de API', () => {
    for (const policy of REST_POLICIES) {
      const src = readFileSync(ficheroDeRuta(policy.path), 'utf8')
      expect(KEY_AUTH.test(src), `${policy.method} ${policy.path}: ya no usa credencial`).toBe(true)
    }
  })

  it('no hay capacidades repetidas en la tabla REST', () => {
    const capacidades = REST_POLICIES.map((p) => p.capability)
    expect(new Set(capacidades).size).toBe(capacidades.length)
  })
})

describe('REST · la decisión', () => {
  it('deniega toda operación clasificada, sin mirar de quién es la clave', () => {
    for (const policy of REST_POLICIES) {
      // Una ruta con id concreta, como la que llega en producción.
      const path = policy.path.replace('[id]', 'clx000000000000000000000')
      const r = decideRestCall({ method: policy.method, path })

      expect(r.decision, `${policy.method} ${path}`).toBe('deny')
      expect(r.capability).toBe(policy.capability)
      expect(r.risk).toBe(policy.risk)
      expect(r.reason).toContain('irreversible')
    }
  })

  it('deniega también en minúsculas y con query string', () => {
    expect(decideRestCall({ method: 'post', path: '/api/mensajes/enviar' }).decision).toBe('deny')
    expect(
      decideRestCall({ method: 'POST', path: '/api/mensajes/enviar?tenantId=otro' }).decision
    ).toBe('deny')
    expect(
      decideRestCall({ method: 'DELETE', path: '/api/contacts/abc123?force=1' }).decision
    ).toBe('deny')
  })

  it('no se desborda a rutas vecinas con más o menos segmentos', () => {
    // El mismo prefijo, un recurso distinto: no debe heredar la denegación.
    expect(
      decideRestCall({ method: 'DELETE', path: '/api/contacts/abc123/attachments' }).decision
    ).toBe('allow')
    expect(decideRestCall({ method: 'DELETE', path: '/api/contacts' }).decision).toBe('allow')
    expect(
      decideRestCall({ method: 'POST', path: '/api/erp/inventory' }).decision
    ).toBe('allow')
  })

  it('deja intacto todo lo que no está en la tabla', () => {
    // Crear un lead por REST es una integración legítima: reversible, con scope.
    expect(decideRestCall({ method: 'POST', path: '/api/leads' }).decision).toBe('allow')
    expect(decideRestCall({ method: 'POST', path: '/api/cotizaciones' }).decision).toBe('allow')
    expect(decideRestCall({ method: 'DELETE', path: '/api/tasks/t1' }).decision).toBe('allow')
    expect(decideRestCall({ method: 'PUT', path: '/api/contacts/abc123' }).decision).toBe('allow')
    expect(decideRestCall({ method: 'PATCH', path: '/api/deals/d1' }).decision).toBe('allow')
  })

  it('nunca deniega una lectura', () => {
    const r = decideRestCall({ method: 'GET', path: '/api/contacts/abc123' })
    expect(r.decision).toBe('allow')
    expect(r.capability).toBeNull()
  })

  it('sin método o sin ruta no inventa una denegación', () => {
    expect(decideRestCall({}).decision).toBe('allow')
    expect(decideRestCall({ method: 'POST' }).decision).toBe('allow')
  })
})

describe('REST · el mensaje dice por qué', () => {
  it('si la capacidad tiene herramienta MCP, manda a MCP', () => {
    const r = decideRestCall({ method: 'DELETE', path: '/api/contacts/abc123' })
    expect(r.decision).toBe('deny')
    expect(r.mcpTool).toBe('volkern_delete_contact')
    expect(r.reason).toContain('MCP')
  })

  it('si no la tiene, no promete una puerta que no existe', () => {
    // No hay herramienta MCP de campañas ni de facturación: decirle al
    // integrador «usa MCP» sería mandarlo a un 404.
    const campanas = decideRestCall({ method: 'POST', path: '/api/campanas/c1/ejecutar' })
    expect(campanas.decision).toBe('deny')
    expect(campanas.mcpTool).toBeNull()
    expect(campanas.reason).toContain('No tiene equivalente MCP')
    expect(campanas.reason).not.toContain('aprobación de un responsable')
    expect(campanas.reason).toContain('sesión de una persona')

    const factura = decideRestCall({ method: 'POST', path: '/api/ordenes-venta/o1/facturar' })
    expect(factura.decision).toBe('deny')
    expect(factura.mcpTool).toBeNull()
  })

  it('reconoce las cuatro capacidades que comparten las dos puertas', () => {
    expect(mcpToolForCapability('contacts.delete')).toBe('volkern_delete_contact')
    expect(mcpToolForCapability('messages.send')).toBe('volkern_send_whatsapp')
    expect(mcpToolForCapability('inventory.consume')).toBe('volkern_process_inventory_consumption')
    expect(mcpToolForCapability('production.scrap')).toBe('volkern_report_production_scrap')
    // Las ocho restantes no tienen puerta MCP; si algún día la tienen, este
    // número cambia y obliga a revisar los mensajes de §4.
    expect(REST_POLICIES.filter((p) => p.capability in MCP_CAPACITIES)).toHaveLength(4)
  })
})

describe('REST · coherencia con el gate MCP', () => {
  it('una capacidad compartida tiene el mismo riesgo en las dos tablas', () => {
    const riskPorCapacidadMcp: Record<string, string> = {}
    for (const policy of Object.values(TOOL_POLICIES)) {
      riskPorCapacidadMcp[policy.capability] = policy.risk
    }

    const compartidas = REST_POLICIES.filter((p) => p.capability in MCP_CAPACITIES)
    // Si esto baja a cero, la tabla dejó de compartir vocabulario con MCP y la
    // afirmación «son el mismo hecho con dos puertas» pasa a ser decorativa.
    expect(compartidas.length).toBe(4)

    for (const policy of compartidas) {
      expect(riskPorCapacidadMcp[policy.capability], policy.capability).toBe(policy.risk)
    }
  })

  it('toda herramienta MCP declara una capacidad con la forma recurso.acción', () => {
    for (const [toolName, policy] of Object.entries(TOOL_POLICIES)) {
      expect(policy.capability, toolName).toMatch(/^[a-z]+\.[a-z]+(\.[a-z]+)?$/)
    }
  })
})

describe('REST · red de seguridad sobre la superficie de borrado', () => {
  it('ninguna ruta DELETE alcanzable con credencial entra sin revisarla', () => {
    const live = superficieConCredencial()
      .filter((r) => r.methods.includes('DELETE'))
      .map((r) => r.url)
      .sort()

    expect(live).toEqual([...DELETE_CON_CREDENCIAL].sort())
  })

  it('las cuatro filas DELETE de la tabla están en esa superficie', () => {
    const surface = new Set(superficieConCredencial().map((r) => r.url))
    const filasDelete = REST_POLICIES.filter((p) => p.method === 'DELETE')

    expect(filasDelete).toHaveLength(4)
    for (const policy of filasDelete) {
      expect(surface.has(policy.path), policy.path).toBe(true)
    }
  })
})

describe('REST · búsqueda de la fila', () => {
  it('acepta la plantilla del fichero como si fuera una ruta real', () => {
    // Es lo que permite que este test no mantenga una segunda lista de rutas:
    // `[id]` se comporta como parámetro tanto en la petición como en la tabla.
    for (const policy of REST_POLICIES) {
      const r = decideRestCall({ method: policy.method, path: policy.path })
      expect(r.decision, policy.path).toBe('deny')
    }
  })
})
