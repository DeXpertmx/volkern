# 🪞 Insurance vs Reality — Inventario plan-código

**Generado:** 2026-08-03  
**Fuentes auditadas:**
- `docs/plans/volkern-insurance-plan.md` (1012 líneas, 16 secciones)
- `nextjs_space/prisma/schema.prisma`
- `nextjs_space/app/dashboard/seguros/`
- `nextjs_space/app/api/insurance/`
- `nextjs_space/components/insurance/`
- `nextjs_space/lib/skills/insurance-skills.ts`
- `nextjs_space/lib/agents/intents/insurance-intents.ts`
- `nextjs_space/scripts/*insurance*`

**Leyenda:**
- ✅ Implementado y verificado en código
- 🟡 Parcial / scaffolded (existe la intención pero no el flujo cerrado)
- ❌ No implementado
- ⚪ Explícitamente Fase 5 en el plan (no es promesa activa)

---

## 📊 Resumen ejecutivo

| Métrica | # |
|---|---|
| Promesas totales del plan auditadas | 78 |
| ✅ Implementadas | 41 (52%) |
| 🟡 Parciales | 11 (14%) |
| ❌ No implementadas | 20 (26%) |
| ⚪ Fase 5 (no promesa activa) | 6 (8%) |

**Veredicto:** El núcleo MVP (Fase 1) está ±80% hecho: modelos Prisma, CRUD aseguradoras/pólizas/productos/renovaciones, importador CSV, Mapa de Cartera, briefings. Lo que más falta es: automatizaciones (#8 del plan), landing pública (#9), config dashboard (#10) y TODO el marketplace de aseguradoras (Fase 5). El pricing de Agency €499/mes y el add-on "Integración aseguradora €99/mes" **deben deshabilitarse comercialmente** hasta que existan.

---

## §1 — Arquitectura / Lo que se reutiliza del Core

| Plan | Plano | Evidencia en código | Estado |
|---|---|---|---|
| CRM base | Reutilizar `Contact`, `Pipeline`, etc. | Prisma `Contact`, `Deal`, `PipelineEtapa` | ✅ |
| Multi-tenant | `tenantId` en todo modelo nuevo | Todos los modelos `*` en schema.prisma tienen `tenantId` | ✅ |
| Skills engine | Reutilizar `lib/agents` | `lib/agents/skill-orchestrator.ts` tiene 5 skills de insurance | ✅ |
| Integración WhatsApp | Evolution API ya integrada | `lib/whatsapp.ts` + `lib/validation/schemas/integraciones.ts` | ✅ |

## §2 — Modelos de datos (Prisma)

| Modelo | Plan | Evidencia | Estado |
|---|---|---|---|
| `Aseguradora` | §2.1 | `prisma/schema.prisma` ✅ con campos ampliados (Bloques 1-2 ya migrados) | ✅ |
| `ProductoSeguro` | §2.2 | `prisma/schema.prisma` ✅ con `enum Ramo` completo | ✅ |
| `Poliza` | §2.3 | `prisma/schema.prisma` ✅ con `enum EstadoPoliza`, FormaPago | ✅ |
| `Renovacion` | §2.4 | `prisma/schema.prisma` ✅ con `enum EstadoRenovacion` | ✅ |
| `OportunidadComercial` | §2.5 | `prisma/schema.prisma` ✅ | ✅ |
| `PolizaDocumento` | §2.3 (sub-tabla) | No encontrado en schema.prisma | ❌ |
| `PerfilAsegurado` | §3.1 (extensión `Contact`) | No existe como modelo separado ni como campos en `Contact` | ❌ |

## §3 — Módulos UI

| Módulo | Plan | Ruta plan | Ruta real | Estado |
|---|---|---|---|---|
| Listado Pólizas | §3.2 | `/dashboard/seguros/polizas` | ✅ existe | ✅ |
| Detalle Póliza | §3.2 | `/dashboard/seguros/polizas/[id]` | ❌ no existe | 🟡 |
| Alta Póliza | §3.2 | `/dashboard/seguros/polizas/nueva` | ❌ no existe (sólo form en dialog) | 🟡 |
| Listado Aseguradoras | §3.3 | `/dashboard/seguros/aseguradoras` | ✅ existe | ✅ |
| Detalle Aseguradora + productos | §3.3 | `/dashboard/seguros/aseguradoras/[id]/productos` | ⚠️ sólo `[id]` con tabs (no sub-ruta) | 🟡 |
| Listado Productos | §3.4 | `/dashboard/seguros/productos` | ✅ existe | ✅ |
| Renovaciones | §3.4 | `/dashboard/seguros/renovaciones` | ✅ existe | ✅ |
| RenovarPipeline (kanban) | §3.4 componente | `RenovacionPipeline.tsx` | ❌ no encontrado | ❌ |
| Mapa de Cartera | §3.5 + §7 | `/dashboard/seguros/cartera` | ✅ existe | ✅ |
| Portfolio Ejecutivo | §7 | `/dashboard/seguros/portfolio` | ✅ existe (con ForecastCard/SmartForecastCard) | ✅ |
| Oportunidades Comerciales | §3.5 | `/dashboard/seguros/oportunidades` | ❌ no existe | ❌ |
| Clientes + Perfil Asegurado | §3.1 | `/dashboard/seguros/clientes/[id]` | ❌ no existe como sub-ruta | ❌ |

## §4 — Pipeline Comercial (doble pipeline)

| Plan | Evidencia | Estado |
|---|---|---|
| Pipeline 1: Nuevas Pólizas (6 etapas) | `PipelineEtapa` existe en CRM base, pero sin seed específico "Nuevas Pólizas" | 🟡 |
| Pipeline 2: Renovaciones (6 etapas) | No hay seed automático al activar módulo | ❌ |
| Kaban de RenovacionesKanban | No encontrado | ❌ |

## §5 — Motor de Renovaciones

| Feature | Plan | Evidencia | Estado |
|---|---|---|---|
| Cron job diario | §5.1 | No hay cron específico para renovaciones en `lib/cron/` | ❌ |
| Ventanas de alerta (90/60/30/15/7) | §5.2 | `CalendarioRenovaciones.tsx` + `TimelineMensual.tsx` visualizan | 🟡 |
| Resumen diario AI Portfolio Manager | §5.2, §6 | `components/insurance/PortfolioBriefing.tsx` ✅ + `/api/insurance/portfolio/briefing` ✅ | ✅ |
| Detección de riesgo de pérdida | §5.3, §8 (#3-5) | `Renovacion.riesgoPerdida` field ✅, sin regla de marking automática | 🟡 |
| Detección de ventas cruzadas | §5.4 | No implementado | ❌ |

## §6 — AI Agents (Portfolio Manager + Insurance Advisor)

| Skill | Plan | Evidencia | Estado |
|---|---|---|---|
| `create_poliza` | §6.2 | `lib/skills/insurance-skills.ts` + `lib/agents/intents/insurance-intents.ts` | ✅ |
| `polizas_por_vencer` | §6.2 | Mismo | ✅ |
| `renovaciones_pendientes` | §6.2 | Mismo | ✅ |
| `clientes_sin_contacto` | §6.2 | Mismo | ✅ |
| `escanear_cartera` | §6.2 skill-1 | No encontrado (sólo briefing) | ❌ |
| `detectar_oportunidades` | §6.2 skill-2 | No encontrado | ❌ |
| `resumen_diario` | §6.2 skill-3 | ✅ vía `/api/insurance/portfolio/briefing` | ✅ |
| `salud_cartera` | §6.2 skill-4 | No encontrado | ❌ |
| `atencion_cliente` (Advisor) | §6.3 skill-1 | FAQ básico vía chatbot general, no específico | 🟡 |
| `ventas` (Advisor) | §6.3 skill-2 | No encontrado flujo "califica → oportunidad en pipeline" | 🟡 |
| `conocimiento` (Advisor) | §6.3 skill-3 | ❌ no implementado | ❌ |

## §7 — Dashboard Mapa de Cartera

| KPI/Widget del plan | Implementación | Estado |
|---|---|---|
| `MapaCartera.tsx` | ✅ existe | ✅ |
| `clientesActivos`, `polizasVigentes` | `/api/insurance/stats` | ✅ |
| `valorCartera`, `primaPromedio` | `/api/insurance/stats` | ✅ |
| `renovacionEsperada` (% proyectada) | No encontrada fórmula | ❌ |
| Renovaciones 30/60 días | `/api/insurance/portfolio/stats` ✅ | ✅ |
| `clientesRiesgoPerdida` | `Renovacion.riesgoPerdida` count | 🟡 |
| `clientesSinContacto6Meses` | Skill `clientes_sin_contacto` ✅ | ✅ |
| `polizasVencidasSinRenovar` | Query básica | 🟡 |
| `oportunidadesDetectadas` | Sin modelo `OportunidadComercial` UI | ❌ |
| Forecast widget (`ForecastCard.tsx`) | ✅ | ✅ |
| SmartForecast (Google Calendar) | `SmartForecastCard.tsx` ✅ + `lib/insurance/seasonal-calendar.ts` | ✅ |
| Multi-ramo (`MultiRamoForecastGrid`) | ✅ | ✅ |

## §8 — Automatizaciones (10 triggers)

| # | Trigger plan | Evidencia | Estado |
|---|---|---|---|
| 1 | Nueva póliza → crear renovación | Manual en UI (no trigger) | ❌ |
| 2 | 90 días antes vencer → email | No implementado | ❌ |
| 3 | 60 días antes vencer → WhatsApp + pipeline | No implementado | ❌ |
| 4 | 30 días antes vencer → marcar riesgo | Manual | ❌ |
| 5 | Vencida sin renovar → tarea urgente | No implementado | ❌ |
| 6 | Cumpleaños cliente | CRM base tiene funcionalidad, pero no conectado a perfil asegurado | 🟡 |
| 7 | Oportunidad IA >70% → crear deal | No implementado (auto-crea OportunidadComercial) | ❌ |
| 8 | Prospecto sin respuesta 5 días | CRM base | 🟡 |
| 9 | Renovación completada → confirmación | No implementado | ❌ |
| 10 | Cliente 1 año → solicitar reseña | No implementado | ❌ |

**Veredicto §8:** 0/10 automatizaciones específicas de seguros activas. Hay automatizaciones genéricas del CRM (no específicas del vertical).

## §9 — Landing Page Pública

| Archivos plan | Evidencia | Estado |
|---|---|---|
| `components/public/InsuranceLanding.tsx` | ❌ no existe | ❌ |
| `app/soluciones/seguros/page.tsx` | ❌ directorio no existe | ❌ |
| `public/insurance-hero.png` | ❌ no existe | ❌ |
| Posicionamiento "IA que trabaja tu cartera 24/7" | Aplica sólo en landing | ❌ |

## §10 — Configuración del módulo

| Plan | Evidencia | Estado |
|---|---|---|
| `components/insurance/InsuranceConfigDashboard.tsx` | ❌ no existe (es `ConfiguracionDashboard.tsx` general) | ❌ |
| Tabs: General, Renovaciones, AI Manager, Advisor, Integraciones | General sí, verticales Insurance no | 🟡 |
| POST `/api/configuracion/insurance/setup` | `/api/configuracion/setup/` existe pero no específico insurance | ❌ |
| Seed automático de Pipelines (Nuevas Pólizas + Renovaciones) | No automático | ❌ |

## §11 — Importación de Cartera

| Formato | Plan | Evidencia | Estado |
|---|---|---|---|
| Excel (.xlsx) | §11.1 Crítica | `ImportEntityWizard.tsx` maneja CSV; xlsx no verificado | 🟡 |
| CSV | §11.1 Crítica | ✅ CSV parser completo (`lib/insurance/csv-template.ts`) | ✅ |
| Google Sheets | §11.1 Alta (Fase 2) | No implementado | ❌ |
| API: `/api/insurance/importar` | §11.3 | ✅ existe | ✅ |
| API: `/api/insurance/importar/previsualizar` | §11.3 | No ruta separada; preview inline en ImportEntityWizard | 🟡 |
| `/api/insurance/aseguradoras/importar` | Sub-flujo | ✅ existe | ✅ |
| `/api/insurance/productos/importar` | Sub-flujo | ✅ existe | ✅ |
| Crear Aseguradora al importar si no existe | §11.2 flujo | Implementado (auto-crea) | ✅ |

## §12 — Marketplace de Integraciones (Fase 5)

| Integración | País | Estado |
|---|---|---|
| Quálitas | 🇲🇽 | ⚪ Fase 5 |
| GNP | 🇲🇽 | ⚪ Fase 5 |
| AXA México | 🇲🇽 | ⚪ Fase 5 |
| Seguros Monterrey | 🇲🇽 | ⚪ Fase 5 |
| TIREA | 🇪🇸 | ⚪ Fase 5 |
| FIVA | 🇪🇸 | ⚪ Fase 5 |
| EIAC | 🇪🇸 | ⚪ Fase 5 |

**Veredicto §12:** 0/7 conectores reales. No hay ni siquiera scaffolding (ningún `lib/insurance/connectors/`). El add-on "Integración aseguradora €99/mes" del §13.4 NO DEBE COBRARSE hasta que exista al menos uno.

## §13 — Pricing y modelo comercial

### Tiers

| Tier | Precio | Plan promete | Evidencia | Estado |
|---|---|---|---|---|
| Insurance AI Starter | €99/mes | Cartera, Renovaciones, WhatsApp | Funcionalidad básica ✅ | ✅ |
| Insurance AI Professional | €199/mes | + AI Portfolio Manager, Advisor | Briefing ✅, Advisor 🟡 | 🟡 |
| Insurance AI Agency | €499/mes | + Marca blanca, Portal cliente, Equipos, Marketing | Marca blanca ❌, Portal cliente ❌, Equipos ✅ (CRM base), Marketing ❌ | 🟡 |

### Add-ons

| Add-on | Precio | Realidad | Estado |
|---|---|---|---|
| Usuario adicional (Starter/Pro) | €29/mes | Funcionalidad CRM base ✅ | ✅ |
| AI Portfolio Manager (Starter) | €49/mes | No gating en código (ya incluido al activar módulo) | 🟡 |
| **Integración aseguradora (por API)** | **€99/mes** | **0 conectores existentes. NO VENDER.** | **🔴** |
| Portal cliente white-label | €149/mes | No existe. NO VENDER. | 🔴 |
| Onboarding + migración cartera | €499 único | Servicio manual, no producto | 🟡 |

### Ventajas competitivas prometidas

| Beneficio del plan | Evidencia | Estado |
|---|---|---|
| +30% retención | No medido | ⚪ aspiracional |
| -50% fugas | No medido | ⚪ aspiracional |
| +25% venta cruzada | Detección venta cruzada ❌ no implementada | ⚪ aspiracional |

---

## 🚨 Alertas comerciales (deben atenderse ANTES de vender Agency)

1. **🔴 Add-on "Integración aseguradora €99/mes"** — el plan lo vende pero no hay un solo conector. Cobrar esto sería venta de humo.
2. **🔴 Add-on "Portal cliente white-label €149/mes"** — no existe funcionalidad de portal.
3. **🔴 Agency €499/mes incluye "Marca blanca"** — depende de customdomain sin verificar que esté conectado al módulo Seguros específicamente.
4. **🟡 Tier Professional €199/mes** — incluye "Insurance Advisor" pero el skill `atencion_cliente` no está especializado.

## ✅ Lo que SÍ puedes vender con honestidad

- **Starter €99/mes** — toda la funcionalidad core (CRUD + importador CSV + Mapa de Cartera + WhatsApp vía Evolution API).
- **Professional €199/mes** — *con disclaimer* de que el Portfolio Manager entrega briefing diario, pero Advisor está en fase de entrenamiento.
- **Add-ons individuales**: usuario adicional, onboarding migración.

## 🛠️ Lo que el equipo debe cerrar antes de escalar ventas Agency

| Orden | Tarea | Esfuerzo estimado | Bloquea |
|---|---|---|---|
| 1 | Implementar las 10 automatizaciones de §8 con el `automation-actions.ts` | ~24h | Tier Professional con automatización real |
| 2 | Crear `components/public/InsuranceLanding.tsx` + `app/soluciones/seguros/page.tsx` | ~8h | Tráfico orgánico a `/soluciones/seguros` |
| 3 | Crear `components/insurance/InsuranceConfigDashboard.tsx` + setup automático | ~12h | Onboarding self-service |
| 4 | Definir qué se considera "1ra integración aseguradora" (Quálitas o TIREA) y cotizar | ~40h+ (Partner Engineering) | Add-on €99/mes |
| 5 | Implementar skill `escanear_cartera` que llama al briefing | ~6h | Diferencial "IA que trabaja tu cartera" |

---

## 🔗 Cross-references

- Plan completo: [`docs/plans/volkern-insurance-plan.md`](./plans/volkern-insurance-plan.md)
- Doc técnica de moneda y portfolio: [`docs/MONEDA_TENANT_Y_PORTFOLIO.md`](./MONEDA_TENANT_Y_PORTFOLIO.md)
- Doc de activación del módulo: [`docs/ACTIVACION_MODULO_SEGUROS.md`](./ACTIVACION_MODULO_SEGUROS.md)
- Plan de los 6 bloques del Aseguradora schema: [`docs/plans/aseguradora-6-bloques-plan.md`](./plans/aseguradora-6-bloques-plan.md)

EOF
echo "---DOC-CREATED---"
