# Contratos MCP: catálogo único y guardias anti-deriva

> **Regla de oro:** el catálogo `mcp-server/src/tools-catalog.ts` es la **única
> fuente de verdad** de los contratos de las tools MCP de Volkern (nombres,
> descripciones e `inputSchema`). Cualquier otra lista, schema o validación
> duplicada está **prohibida**: cada copia era un contrato que podía derivar
> en silencio del que ven los agentes.

---

## 1. Cómo fluye una tool

```
                ┌─────────────────────────────────────────────┐
                │  mcp-server/src/tools-catalog.ts            │
                │  VOLKERN_TOOLS = { name, description,       │
                │                    inputSchema } × 43       │
                │  ÚNICA fuente de verdad de los contratos    │
                └──────────────────┬──────────────────────────┘
                                   │ (importado por todos; nadie mantiene listas)
        ┌──────────────┬───────────┼────────────────┬──────────────────┐
        ▼              ▼           ▼                ▼                  ▼
   tools/list    validación   Server Card    mcp-server standalone   suite mockeada
   (app/mcp)     required     (lib/seo/      (stdio/SDK, usa el      (tests/mcp-
                 (handleCall  mcp-server-    mismo catálogo)         catalog-execution)
                 Tool)        card.ts)
        │              │
        └──── tools/call ────► resolveSkillName() → skills['x'] → executor → prisma
```

Superficies publicadas (todas derivan del catálogo, ninguna lleva listas propias):

| Superficie | Fichero | Qué publica |
|---|---|---|
| `/mcp` (Streamable HTTP, JSON-RPC) | `app/mcp/route.ts` | `tools/list` mapea `VOLKERN_TOOLS` directamente |
| `/api/mcp` (REST programático) | `app/api/mcp/route.ts` | `handleListTools()` → vista derivada del catálogo |
| Server Card (`/.well-known/mcp/server-card.json`) | `lib/seo/mcp-server-card.ts` | `MCP_TOOLS = VOLKERN_TOOLS.map(t => t.name)` |
| MCP server standalone (stdio/SDK v2) | `mcp-server/src/index.ts` | `registerTool` por cada `VOLKERN_TOOLS` |

## 2. Cómo añadir una tool nueva (paso a paso)

### Paso 1 — Catálogo (`mcp-server/src/tools-catalog.ts`)

Añade la entrada a `VOLKERN_TOOLS`:

- **Nombre**: `volkern_<accion>` (kebab-case tras el prefijo). Es el contrato que ven los agentes.
- **Description**: en inglés, orientada a un agente externo — cuándo usarla y qué devuelve.
- **inputSchema**: JSON Schema real. `required` ⊆ `properties` (lo pinza la conformidad).
  Prohibido el stub `{ properties: {} }`: la única tool sin argumentos es
  `volkern_verify_vault_integrity` (lista cerrada en el test de conformidad).

### Paso 2 — Endpoint REST (`app/api/<recurso>/route.ts`) — OBLIGATORIO

El standalone **no tiene fallback**: una tool del catálogo sin caso REST lanza
`Unknown tool: …` en tiempo de ejecución (solo se detecta ejecutándola). Toda
tool del catálogo debe tener endpoint REST que ejecute la misma lógica.

Patrón recomendado: validación Zod en la ruta + **lib compartida** como única
fuente de verdad de la lógica de negocio. Precedentes:

- `lib/cotizaciones/from-catalog.ts` (REST `POST /api/cotizaciones/from-catalog` + MCP)
- `lib/ordenes-venta/from-cotizacion.ts` (REST + MCP, con idempotencia)
- `lib/services/appointments.ts` (`createCitaConEfectos`: REST + MCP)

### Paso 3 — Executor (`lib/skills/index.ts`)

Clave **sin** el prefijo `volkern_`. Si el nombre del skill difiere de la tool
(p. ej. `get_catalog_item`) o el executor ya existe bajo otro nombre, añade la
correspondencia a `CATALOG_EXEC_ALIASES` en `lib/mcp/mcp-handler.ts`.

Reglas del executor:

- **Honra el inputSchema**: acepta exactamente los `required` del catálogo y
  **nunca** exige en silencio argumentos que el catálogo no declara (cazo real:
  `create_lead` exigía `email`; commit `31f7c0c5`).
- **Identificación por id** cuando el contrato trae `*Id` (`contactId`,
  `leadId`, …). Cazo real: `update_contact`/`update_lead` ignoraban el id y
  buscaban por email/nombre → tools rotas vía `/mcp` (commit `31f7c0c5`).
- **Idempotencia** en creates con clave de negocio: mismo SKU / misma
  fecha+lead+tipo / misma cotización → devolver la entidad existente con
  `{ entidad, yaExistia: true, mensaje }` en vez de duplicar o chocar con una
  constraint (patrón de `create_orden_from_cotizacion`, `create_cita`,
  `create_catalogo_item`).
- **Audit log** best-effort (`.catch(() => {})`).
- Los errores se lanzan con `throw new Error(mensaje claro)`: `handleCallTool`
  los convierte en `isError` con ese mensaje.

### Paso 4 — Registro documentado (`listSkills`)

Añade la entrada con su `category` en `listSkills()` (`lib/skills/index.ts`):
lo exige el test «cada tool del catálogo resuelve a un skill existente».

### Paso 5 — Standalone (`mcp-server/`), si aplica

- El registro de tools ya lo hace el bucle sobre `VOLKERN_TOOLS`.
- Añade el caso REST en el switch de ejecución del standalone para que la tool
  también funcione por stdio/HTTP (así la conformidad puede comparar contra el
  `dist/` real).
- Si cambias el standalone: `npm --prefix mcp-server run build` (la conformidad
  lanza el `dist/` compilado; un dist viejo es deriva en estado puro) y bump de
  versión + publish cuando toque.

### Paso 6 — Tests

| Fichero | ¿Toca algo? |
|---|---|
| `tests/mcp-catalog-execution.test.ts` | Normalmente **nada**: los argumentos se derivan del schema y la tool se ejecuta sola. Solo si el executor necesita datos especiales → `EXTRA_ARGS` de esa tool (+ `overrides` del mock). Si es un create con clave de negocio → añade su test de idempotencia. |
| `tests/mcp-conformity.test.ts` | **Nada**, salvo que la tool no tenga argumentos (la lista de `noArgs` está cerrada). |
| `tests/mcp-server-card.test.ts` | **Nada** (el test de no-derivación cuenta solo). |
| `tests/hospitality-skills.test.ts` | **Nada** (pina que lo publicado es 100 % `volkern_*`). |

### Paso 7 — Verificación completa

```bash
npm run typecheck
npx vitest run tests/mcp-catalog-execution.test.ts \
               tests/mcp-conformity.test.ts \
               tests/mcp-server-card.test.ts \
               tests/a2a-agent-card.test.ts \
               tests/webmcp.test.ts
npm --prefix mcp-server run build        # solo si tocaste mcp-server/
bash deploy-vps/deploy-local.sh --skip-migrator --e2e-flujo   # smokes + E2E en producción
```

El deploy ejecuta smoke MCP (card ↔ initialize ↔ tools/list ↔ auth), el E2E
autenticado y el flujo comercial completo sobre el entorno real; si algo no
cuadra entre catálogo e imagen desplegada, el deploy **falla**.

## 3. Qué validación recibe una llamada (`handleCallTool`)

Para `tools/call`, siempre contra el catálogo — también las llamadas legacy del
orquestador sin prefijo (`/api/mcp`), que resuelven a su tool por alias/prefijo:

1. **Existencia**: la tool debe estar en `VOLKERN_TOOLS` (por nombre exacto o
   resolviendo `resolveSkillName`). Si no, `isError` «Tool no encontrado». Los
   skills que no están en el catálogo ya no son llamables por MCP.
2. **Required**: validados contra el **mismo schema** que publica `tools/list`.
3. **Gating OWNER**: para skills sensibles (`authorize_bulk_expenses`,
   `orchestrate_secure_payroll`), resuelto por nombre de skill (cubre ambos
   caminos, con y sin prefijo).
4. **Contexto**: inyecta `ctx` (`tenantId`, `userId`, `source: 'mcp'`); el
   tenant autenticado manda aunque el cliente envíe otro.
5. **Resultado**: JSON serializado en `content[0].text`, o `isError` con el
   mensaje del error. La ruta `/mcp` añade sobre esto el sobre JSON-RPC, el
   auth Bearer con scope `mcp:execute` (401 / `-32000`) y el audit log
   `MCP_tool_execution`.

## 4. Las guardias anti-deriva

| # | Guardia | Dónde | Qué pinza | Cuándo corre |
|---|---|---|---|---|
| 1 | Conformidad de contratos | `tests/mcp-conformity.test.ts` | card == catálogo == `tools/list` de `/mcp` y del standalone real; schemas válidos con `required` ⊆ `properties`; solo `verify_vault_integrity` sin args; cada tool resuelve a skill | local (`npx vitest run`) |
| 2 | Ejecución de las 43 | `tests/mcp-catalog-execution.test.ts` | cada tool **ejecuta de verdad** (`resolveSkillName` → `handleCallTool` → `executeSkill`) contra Prisma mockeado y devuelve JSON; los `required` del catálogo bastan; idempotencias (`yaExistia` + un solo `create`) | local |
| 3 | No-derivación de la card | `tests/mcp-server-card.test.ts` | la card se deriva del catálogo y es su conjunto **exacto** (43) | local |
| 4 | Catálogo como único conjunto publicado | `tests/hospitality-skills.test.ts` | lo publicado por MCP es 100 % `volkern_*`; nada del orquestador se cuela | local |
| 5 | Smokes + E2E en producción | `scripts/smoke-mcp.sh`, `scripts/mcp-e2e.sh` (`--e2e-flujo`) | card/initialize/tools-list/auth contra el entorno real; circuito auth→skill→audit y flujo comercial con idempotencias en tenant dedicado | cada `deploy-local.sh` |

**Por qué funcionan**: las guardias 1, 2 y 4 iteran sobre `VOLKERN_TOOLS` —
añadir una tool la incorpora a las pruebas automáticamente, sin lista que
actualizar (y sin forma de olvidarla). La 3 pinza el conjunto exacto. La 5
comprueba la imagen desplegada, no el código local.

**Qué hacer si una guardia falla**:

- *«skill "X" debe existir en el registro»* → falta el executor en `skills`
  (o su alias en `CATALOG_EXEC_ALIASES`).
- *`isError` en la suite de ejecución* → el executor no honra el contrato:
  exige un arg fuera de `required`, resuelve por email/nombre en vez del id,
  o devuelve algo no serializable.
- *La card difiere del catálogo* → no edites listas de la card a mano: se
  derivan. Arregla el catálogo.
- *`smoke-mcp` rojo en el deploy* → card y `tools/list` difieren en la imagen:
  catálogo editado a medias o `dist/` del standalone sin regenerar.

## 5. Antipatrones (todos reales en este repo)

1. ❌ **Publicar la tool sin endpoint REST** → «Unknown tool» en runtime, solo
   visible en producción. El REST es obligatorio.
2. ❌ **Mantener una lista paralela «por si acaso»** → así vivía el registro
   legacy de ~69 schemas en `mcp-handler.ts`, eliminado en `7c7f382c`.
3. ❌ **Exigir en silencio args fuera del `required` del catálogo** →
   `create_lead` exigía `email` que el catálogo no declaraba (commit `31f7c0c5`).
4. ❌ **Ignorar el `*Id` del contrato** y resolver por email/nombre →
   `update_contact`/`update_lead` rotos vía `/mcp` (commit `31f7c0c5`).
5. ❌ **Editar la card o `/api/mcp` a mano** → se derivan; si crees que hay que
   tocarlas, el problema está en el catálogo.
6. ❌ **Schema del skill ≠ schema publicado** (cazo original: el catálogo
   publicaba `query` y el skill leía `search`; commit `30fadd7a`) → el executor
   acepta el contrato del catálogo, no el suyo.

## 6. Checklist final

- [ ] Entrada en `tools-catalog.ts` (`volkern_*`, description e inputSchema reales)
- [ ] Endpoint REST que ejecuta la misma lógica (lib compartida)
- [ ] Executor en `skills` sin prefijo (+ alias si procede) que honra el contrato
- [ ] Idempotencia con clave de negocio si es un create
- [ ] Entrada en `listSkills()`
- [ ] `npm --prefix mcp-server run build` si se usa el standalone
- [ ] `typecheck` + suites MCP en verde
- [ ] Deploy con `--e2e-flujo` y smokes verdes
- [ ] Bump + publish de `volkern-mcp-server` si el standalone cambió

## 7. Referencias

- Catálogo: `mcp-server/src/tools-catalog.ts` · Handler: `lib/mcp/mcp-handler.ts`
- Rutas: `app/mcp/route.ts`, `app/api/mcp/route.ts` · Card: `lib/seo/mcp-server-card.ts`
- Executors MCP: `lib/skills/mcp-ops-skills.ts` · Registro: `lib/skills/index.ts`
- Commits de la unificación: `b67502be` (43 tools ejecutan vía /mcp),
  `30fadd7a` (contrato `query` de search), `3716b090` (E2E citas/catálogo),
  `31f7c0c5` (suite mockeada + 3 fixes de contrato), `7c7f382c` (fuente única).
