# Volkern Connect — Plan de Desarrollo

> **Chatbot interno para controlar todo Volkern por mensajes**: CRM, citas, emails, consultas y briefing proactivo, sin entrar a cada módulo. Complementa la función actual de comunicación interna de Connect.
>
> Estado: 🟡 **EN PLANIFICACIÓN**  ·  Fecha: Agosto 2026  ·  Rama propuesta: `feat/connect-ai-assistant`

---

## 📐 Índice

1. [Visión](#1-visión)
2. [Estado actual (inventario verificado)](#2-estado-actual-inventario-verificado)
3. [Arquitectura objetivo](#3-arquitectura-objetivo)
4. [Plan por Fases](#4-plan-por-fases)
5. [Fase 1 — Conectar el pipeline IA a Connect](#5-fase-1--conectar-el-pipeline-ia-a-connect)
6. [Fase 2 — Control del CRM por chat](#6-fase-2--control-del-crm-por-chat)
7. [Fase 3 — Modo operador (seguridad + tarjetas)](#7-fase-3--modo-operador-seguridad--tarjetas)
8. [Fase 4 — Briefing proactivo](#8-fase-4--briefing-proactivo)
9. [GAP ANALYSIS: Módulo Insurance](#9-gap-analysis-módulo-insurance)
10. [Estimación de esfuerzo](#10-estimación-de-esfuerzo)
11. [Riesgos y decisiones](#11-riesgos-y-decisiones)

---

## 1. Visión

Un asistente IA **interno** (no orientado a clientes) embebido en el hub **Volkern Connect** que permite al equipo:

- **Controlar el CRM por lenguaje natural**: "agrega a María García con email maria@empresa.com", "convierte a Juan en contacto", "¿qué leads tienen email de gmail?", "muéstrame las citas de mañana".
- **Gestionar citas y agenda** sin navegar: agendar, cancelar, reagendar, confirmar.
- **Enviar comunicaciones**: emails (SES/Resend del tenant), mensajes internos al equipo (`InternalMessage`), WhatsApp/Telegram.
- **Consultar el sistema**: pipeline, finanzas, inventario, RRHH — los ~75+ intents que ya existen.
- **Recibir briefing proactivo**: el bot abre el día con un resumen accionable y alertas.

**Diferencia con el bot de Telegram:** el bot de Telegram atiende *clientes*. Connect atiende *al equipo*: la identidad del usuario es real (sesión autenticada), se aplican roles (user/admin/owner), y las acciones destructivas piden confirmación.

---

## 2. Estado actual (inventario verificado)

### 2.1 Lo que YA existe y se reutiliza

| Componente | Archivo(s) | Estado |
|:---|:---|:---|
| **Volkern Connect** (chat de equipo tipo Slack) | `app/[tenant]/dashboard/connect/page.tsx`, `components/connect/*` (ConnectLayout, ChannelSidebar, MessageFeed, MessageComposer, FloatingConnectTrigger) | ✅ Funcional |
| Modelos chat interno | `ChatChannel`, `ChatMessage`, `ChatSubscription` en `prisma/schema.prisma` | ✅ |
| APIs Connect | `/api/connect/channels`, `/api/connect/channels/[id]/subscription`, `/api/connect/messages` | ✅ |
| Análisis de eventos con IA (Gemma) | `lib/connect/gemma-connect-service.ts` (invoice_created, payment_received, lead_created) | ✅ Parcial |
| **Pipeline de chatbot** (clasificador → facts → orquestador → ejecución) | `lib/chat/chatbot-service.ts` (`processMessage`) | ✅ Funcional |
| Intents (~75+) con multi-turno | `lib/agents/intents/*`, `lib/agents/intent-classifier.ts` | ✅ |
| Skills ejecutables | `lib/agents/skill-orchestrator.ts` (INTENT_TO_SKILL), `lib/agents/execution-engine.ts`, `lib/agents/skill-registry.ts` | ✅ |
| Widget de prueba del chatbot | `components/chatbot/ChatTestWidget.tsx` + `/api/chatbot/test-message` | ✅ (usa `processMessage`) |
| Mensajes internos | `lib/mcp/skills/internalMessageSkill.ts` → `InternalMessage`; intent `enviar_mensaje_interno` → `send_message` | ✅ |
| Envío de emails | `lib/ses-email.ts` (Resend + SMTP tenant), `lib/resend-email.ts`, `lib/skills/notification-layer.ts` | ✅ |
| Seguridad por rol | `lib/agents/security-checkpoint.ts` (`enviar_mensaje_interno`: user/admin/owner/guest) | ✅ |
| Acceso por módulos del plan | `lib/plans.ts` (`isModuleActive`, `CrmModule`) | ✅ (falta `insurance`) |
| Landing Connect en navegación | `lib/navigation-config.ts` → `{ name: 'Volkern Connect', href: '/dashboard/connect', planModule: 'mensajes' }` | ✅ |

### 2.2 Lo que NO existe / está desconectado

| Hueco | Detalle |
|:---|:---|
| **Connect no habla con el chatbot** | `MessageComposer` envía a `/api/connect/messages` (chat entre personas). El pipeline IA (`processMessage`) solo se usa desde el widget de prueba y Telegram. **No hay un canal "Asistente IA" en Connect.** |
| **`test-message` no pasa `userId`** | Solo pasa `tenantId`, `channel: 'api'`, `isTest`. Sin `userId` no funcionan roles (`security-checkpoint`) ni `InternalMessage` (fromUserId). |
| **Sin intents internos específicos** | No hay intents para "enviar email por chat", "mensaje interno con contexto", "resumen del día", "briefing matutino" (existe `enviar_mensaje_interno` pero no expuesto al operador). |
| **Sin confirmaciones** | No hay flujo "¿Confirmo la acción?" para acciones destructivas (cancelar cita, rectificar factura, aprobar vacaciones). |
| **Sin tarjetas visuales en Connect** | `MessageFeed` solo renderiza texto; no hay rich cards (contacto creado, cita en calendario). |
| **Sin auditoría de acciones del bot** | No se registra "quién pidió qué" por mensaje de Connect. |

---

## 3. Arquitectura objetivo

```
                    ┌────────────────────────────────────────────┐
                    │            VOLKERN CONNECT (UI)            │
                    │  ChannelSidebar │ MessageFeed │ Composer   │
                    │         canal "🤖 Asistente IA"             │
                    └───────────────┬────────────────────────────┘
                                    │ POST /api/connect/ai (mensaje del operador)
                                    ▼
                    ┌────────────────────────────────────────────┐
                    │        lib/chat/chatbot-service.ts         │
                    │   processMessage({ tenantId, userId, ...}) │
                    └───────────────┬────────────────────────────┘
                                    ▼
      ┌──────────────┬──────────────┼──────────────┬──────────────┐
      ▼              ▼              ▼              ▼              ▼
 IntentClassifier FactExtractor  SkillOrchestrator ExecutionEngine SecurityCheckpoint
      │              │              │              │              │
      │              │         INTENT_TO_SKILL    Skills          │ (roles: user/admin/owner)
      │              │      (~75+ intents)        (CRM, citas,    │
      │              │                            finanzas, IA...) │
      └──────────────┴──────────────┴──────────────┴──────────────┘
                                    ▼
              Respuesta formateada (texto / quick-replies) → MessageFeed
                                    ▼
              Acciones: InternalMessage · SES/Resend email · prisma
```

**Principios:**
1. **Reutilizar el pipeline completo** — no se duplica lógica de intents/skills.
2. **Conectar Connect como un canal más** — `channel: 'connect'`, con `userId` real de la sesión.
3. **El canal "🤖 Asistente IA"** es un `ChatChannel` de tipo `system` donde el bot responde; los mensajes del operador pasan por `processMessage` y la respuesta se persiste como `ChatMessage` del bot.
4. **Roles y confirmaciones** en capa fina sobre el pipeline (no dentro de los skills).

---

## 4. Plan por Fases

| Fase | Objetivo | Entrega |
|:---|:---|:---|
| **1** | Conectar pipeline IA a Connect | Canal "Asistente IA" funcional: el equipo chatea con el bot dentro de Connect |
| **2** | Control del CRM por chat | Crear/consultar leads, contactos, empresas, citas, tareas, emails por mensaje |
| **3** | Modo operador | Confirmaciones para acciones destructivas, tarjetas visuales, auditoría |
| **4** | Briefing proactivo | Resumen matutino + alertas de eventos en canales de Connect |

---

## 5. Fase 1 — Conectar el pipeline IA a Connect

> **Meta:** el operador abre Connect → canal "🤖 Asistente IA" → escribe "agrega a Juan Pérez, juan@mail.com" → el bot responde "✅ Lead creado: Juan Pérez (juan@mail.com)".

### Tareas

| # | Tarea | Archivos | Detalle |
|:---|:---|:---|:---|
| 1.1 | **API `/api/connect/ai`** (POST) | nuevo: `app/api/connect/ai/route.ts` | Autentica sesión (como `test-message`), obtiene `userId` + `tenantId`, llama `processMessage({ tenantId, userId, message, channel: 'connect', conversationId })`. **`conversationId` debe derivarse de forma estable desde `channelId`** (el estado multi-turno `pendingIntent`/`collectedEntities` vive en memoria de conversación en BD, keyed por `conv.id`): un canal IA = una conversación persistente. Devuelve `{ response, quickReplies, action }` (el campo `action` puede disparar UI: agendar, transferir...). |
| 1.2 | **Pasar `userId` al pipeline** | `lib/chat/chatbot-service.ts`, `lib/agents/*`, `test-message` | Verificar si `ChatbotInput.userId` es obligatorio u opcional (`test-message` hoy lo omite y compila). Confirmar que `userId` fluya hasta `security-checkpoint` e `InternalMessage`. El clasificador ya recibe `userId` (parámetro existente). |
| 1.3 | **Seed del canal "Asistente IA"** | `lib/connect/connect-service.ts` o script seed | Crear `ChatChannel` tipo `system` con nombre "🤖 Asistente IA" por tenant (idempotente), con suscripción por defecto para todos los usuarios. |
| 1.4 | **MessageComposer enruta al bot** | `components/connect/MessageComposer.tsx` | Si el canal es tipo `system` con un **identificador estable** (slug/key en `ChatChannel`, no el nombre visible que puede editarse) del Asistente IA → POST a `/api/connect/ai` en vez de `/api/connect/messages`. Mostrar typing indicator mientras responde. |
| 1.5 | **Persistir respuesta del bot** | `lib/connect/connect-service.ts` o API | Guardar la respuesta como `ChatMessage` con sender = bot (usuario system) para que quede en el feed y en el polling de `MessageFeed`. |
| 1.6 | **Quick replies** | `components/connect/MessageFeed.tsx` | Renderizar botones de quick-replies bajo el mensaje del bot (ya los emite el pipeline en `test-message`). |

**Criterio de aceptación:** en Connect, en el canal Asistente IA, "crea un contacto llamado Pedro con email pedro@test.com" crea el contacto y el bot confirma con mensaje formateado.

---

## 6. Fase 2 — Control del CRM por chat

> La mayoría de intents ya existen. Esta fase es **exposición + pulido**, no construcción nueva.

### 6.1 Intents ya disponibles (se exponen tal cual)

| Dominio | Intents existentes |
|:---|:---|
| Leads | `crear_lead`, `buscar_lead`, `listar_leads`, `actualizar_lead`, `convertir_lead`, `obtener_telefono`, `registrar_interaccion`, `diagnosticos_lead` |
| Contactos/Empresas | `crear_contacto`, `listar_contactos`, `crear_empresa` |
| Citas | `agendar_cita`, `mis_citas`, `cancelar_cita`, `reagendar_cita`, `confirmar_cita` |
| Tareas/Notas | `crear_tarea`, `completar_tarea`, `mis_tareas`, `crear_nota`, `ver_notas` |
| Pipeline | `crear_negocio`, `actualizar_negocio`, `mis_negocios`, `calificar_lead` |
| Mensajes | `enviar_mensaje`, `enviar_mensaje_interno`, `contactar_humano` |
| Consultas | `consultar_servicios`, `consultar_precio`, `buscar_catalogo`, `consultar_estado_pedido` |

### 6.2 Intents nuevos para el modo interno

| # | Intent | Skill | Descripción |
|:---|:---|:---|:---|
| 2.1 | `enviar_email` | nuevo `send_email_chat` | "Envía un correo a María con asunto 'Propuesta' y texto '...'" → reutiliza `lib/ses-email.ts` (SMTP del tenant). Params: `destinatario`/`email`, `asunto`, `mensaje`. |
| 2.2 | `enviar_mensaje_interno` (exponer) | `send_message` (ya existe) | "Mándale un mensaje interno a Luis sobre el lead de Acme" → `InternalMessage` con `context`. Falta: campo `to`/destinatario bien extraído y confirmación visual. |
| 2.3 | `resumen_dia` | nuevo `daily_briefing` | "¿Qué hay hoy?" → citas de hoy + tareas pendientes + leads nuevos del día (consulta agregada a prisma, sin LLM o con LLM ligero). |
| 2.4 | `consultar_lead` (por nombre, no solo email) | ampliar `find_lead_by_email` | Búsqueda por nombre parcial, para uso interno. |

### 6.3 Formateo de respuestas

- Reutilizar `ExecutionEngine.formatSkillResult` (✅ Lead creado: Nombre (email)) y `escapeMarkdown` — ya implementados y probados.
- Para `MessageFeed` (React, no Telegram), sustituir asteriscos de Markdown por componentes: `font-bold`, bullets, etc.

---

## 7. Fase 3 — Modo operador (seguridad + tarjetas)

| # | Tarea | Detalle |
|:---|:---|:---|
| 3.1 | **Confirmaciones** | Flujo: bot responde "⚠️ ¿Confirmo el envío del email a maría@empresa.com? (sí/no)". Estado pendiente en memoria (patrón multi-turno ya existente con `pendingIntent`/`collectedEntities`). Acciones sensibles: cancelar cita, enviar email, rectificar factura, aprobar vacaciones, ajustar stock. |
| 3.2 | **Roles** | Mapear intents internos en `security-checkpoint.ts`: `enviar_email`, `cancelar_cita`, `aprobar_vacaciones` → solo `admin`/`owner`. `crear_*`, `consultar_*` → `user`+. |
| 3.3 | **Tarjetas visuales** | Nuevo componente `components/connect/AssistantCard.tsx`: el pipeline devuelve `data` (lead/contacto/cita) y Connect renderiza una card (avatar + campos) además del texto. |
| 3.4 | **Auditoría** | Guardar en `ChatMessage.context` o tabla nueva `assistant_audit` (userId, intent, action, params, resultado) cada vez que el bot ejecuta un skill. |
| 3.5 | **Límite de contexto** | Reutilizar sesión/contexto multi-turno por canal (la memoria de conversación ya existe en `memory.updateContext`); resetear tras cada ejecución completada. |

---

## 8. Fase 4 — Briefing proactivo

| # | Tarea | Detalle |
|:---|:---|:---|
| 4.1 | **Resumen matutino** | Cron/lazy: al abrir Connect, el bot publica en el canal "🤖 Asistente IA" (o canal "Operaciones") un resumen: citas de hoy, tareas vencidas, leads sin seguimiento (ghosting), pólizas por vencer (si Insurance activo). |
| 4.2 | **Ampliar GemmaConnectService** | Ya analiza `invoice_created`, `payment_received`, `lead_created`. Añadir: `booking_created`, `task_due`, `expense_anomaly`, `inventory_low`, `insurance_renewal_90d`. |
| 4.3 | **Quick actions** | Los `suggestedActions` de GemmaConnect se convierten en botones accionables en el mensaje (ej. "Asignar Urgente" → crea tarea asignada). |

---

## 9. GAP ANALYSIS: Módulo Insurance

> El usuario detectó que "Insurance todavía no lo tenemos". Verificado en código: **el backend existe pero está desconectado de la plataforma**. No aparece en navegación, ni en planes, ni en el dashboard de tenant, ni en el chatbot.

### 9.1 Qué YA existe (construido pero invisible)

| Capa | Evidencia verificada |
|:---|:---|
| **Modelos Prisma** | `Aseguradora`, `ProductoSeguro`, `Poliza`, `Renovacion`, `OportunidadComercial` + enums `Ramo`, `EstadoPoliza`, etc. (`prisma/schema.prisma` ~línea 7307+) |
| **APIs** | `/api/insurance/`: `polizas` (+`[id]`), `aseguradoras` (+`[id]`), `productos`, `renovaciones`, `importar`, `stats`, `portfolio/briefing`, `portfolio/stats` |
| **Componentes UI** | `components/insurance/`: `PolizaCard`, `PolizaForm`, `PolizaTable`, `CalendarioRenovaciones`, `MapaCartera`, `PortfolioBriefing` |
| **Páginas dashboard** | `app/dashboard/seguros/*`: `page`, `layout`, `polizas`, `renovaciones`, `aseguradoras`, `cartera` |
| **Setup del módulo** | `POST /api/configuracion/insurance/setup` → `lib/insurance/seed.ts` + `lib/insurance/setup-pipeline.ts` (pipelines, aseguradoras, productos, automatizaciones) |
| **Landing pública** | `app/soluciones/insurance/page.tsx` (`InsuranceLanding`) |
| **Plan documentado** | `docs/plans/volkern-insurance-plan.md` (completo, v2, pendiente de revisión) |

### 9.2 Qué FALTA (gaps verificados)

| # | Gap | Impacto | Evidencia |
|:---|:---|:---|:---|
| G1 | **Módulo `insurance` no existe en `lib/plans.ts`** (`CrmModule`, `ALL_MODULES`, `PLAN_MODULES`) | `isModuleActive('insurance')` no compila/usaría undefined → sin control de acceso por plan | `CrmModule` no incluye `insurance`; `PLAN_MODULES` no lo referencia |
| G2 | **Sin entrada en `lib/navigation-config.ts`** (0 coincidencias de "seguros") | El módulo no aparece en ningún menú → **inaccesible para el usuario** | `grep -c "seguros" lib/navigation-config.ts` → `0` |
| G3 | **Páginas solo en `app/dashboard/seguros/` (ruta sin tenant)**; NO existen en `app/[tenant]/dashboard/seguros/` | Existen **dos árboles de rutas** en paralelo (`app/dashboard/*` y `app/[tenant]/dashboard/*`) y la navegación apunta a rutas sin tenant (`/dashboard/...`). Falta **verificar en middleware/rewrites de Vercel cuál árbol se sirve** antes de decidir si hay que crear duplicados o mover páginas | `ls app/[tenant]/dashboard/` no incluye `seguros`; ambos `connect/page.tsx` existen |
| G4 | **Sin intents de chatbot** para insurance (no hay `insurance-intents.ts` en `lib/agents/intents/`) | No se puede controlar pólizas/renovaciones por chat | grep en `lib/agents/intents/` → 0 |
| G5 | **Sin skills ni mapeo** en `lib/agents/skill-orchestrator.ts` / `lib/skills/` | El pipeline IA no puede ejecutar acciones de seguros | grep → 0; `INTENT_TO_SKILL` no tiene insurance |
| G6 | **Sin agentes IA** (AI Portfolio Manager, Insurance Advisor) | El diferencial comercial del plan (briefing, detección de oportunidades) no está construido | `lib/insurance/` solo tiene `seed.ts` + `setup-pipeline.ts` |
| G7 | **Sin motor de renovaciones** (cron scanner diario) | Las renovaciones no se detectan ni alertan solas | No existe `lib/cron/insurance-renewal-scanner.ts` |
| G8 | **`OportunidadComercial` sin API/UI** | El modelo existe en schema pero no hay `opportunities` en `/api/insurance/` | Listado de APIs no lo incluye |
| G9 | **Importador: API existe pero sin UI** | `/api/insurance/importar` existe; falta `ImportadorCartera` UI (preview + mapping de columnas) | `components/insurance/` no lo incluye |
| G10 | **Sin integración con Connect/chatbot** | Todo lo anterior + sin intents → el asistente interno no puede gestionar seguros | — |

### 9.3 Plan de cierre del gap (Insurance visible)

> Orden lógico para "tener Insurance" de verdad, reutilizando lo ya construido.

| Paso | Tarea | Esfuerzo aprox. |
|:---|:---|:---|
| I1 | Añadir `insurance` a `CrmModule`, `ALL_MODULES`, `PLAN_MODULES` (incluirlo en TRIAL/INFINITY/COMPLIANCE y los planes donde aplique) + `getNoAccessMessage` | 1h |
| I2 | **Verificar middleware/rewrites (G3)** y crear páginas `app/[tenant]/dashboard/seguros/*` (wrapper que reusa los componentes existentes de `app/dashboard/seguros/`) — solo duplicar si la verificación confirma que se sirve el árbol `[tenant]` | 3h |
| I3 | Añadir entradas de navegación al hub correspondiente (nuevo hub "Seguros" o dentro de Ventas) con `planModule: 'insurance'` | 1h |
| I4 | Validar que las APIs de insurance usen el auth correcto (`withTenantAuth`) y que el seed corre en el tenant | 2h |
| I5 | Intents + skills de chatbot: `crear_poliza`, `mis_polizas`, `polizas_por_vencer`, `renovaciones_pendientes`, `clientes_sin_contacto` (wrapper sobre las APIs existentes) | 6h |
| I6 | Conectar esos intents al canal Asistente IA de Connect (Fase 1/2 del plan) | incluido en Fases 1-2 |
| I7 | (Después) AI Portfolio Manager + motor de renovaciones + UI de oportunidades — ver `docs/plans/volkern-insurance-plan.md` Fases 1-2 | ~130h plan |

**Conclusión:** Insurance no es "no existe" sino **"existe pero está desconectado"**. Con los pasos I1–I5 (~13h) el módulo queda visible, navegable y controlable por chat. El valor IA (Portfolio Manager, briefing, oportunidades) es trabajo posterior según el plan existente.

---

## 10. Estimación de esfuerzo

| Fase | Horas aprox. | Hito |
|:---|:---|:---|
| **F1** — Conectar IA a Connect | 12–16h | Canal Asistente IA respondiendo |
| **F2** — Control CRM por chat | 10–14h | Crear/consultar contacto, cita, email por mensaje |
| **F3** — Modo operador | 10–14h | Confirmaciones + tarjetas + auditoría |
| **F4** — Briefing proactivo | 8–12h | Resumen matutino + quick actions |
| **I1–I5** — Cierre gap Insurance | ~13h | Módulo visible + controlable por chat |
| **Total (MVP Connect + Insurance visible)** | **~53–69h** | |

---

## 11. Riesgos y decisiones

| Riesgo/Decisión | Mitigación / Propuesta |
|:---|:---|
| **Timeouts de LLM en chat interactivo** | Reutilizar los timeouts ya implementados (10s hot path) — ya resuelto en el pipeline actual |
| **Acciones destructivas sin querer** | Confirmación obligatoria (Fase 3); roles por intent (admin/owner) |
| **Contexto multi-turno compartido** | Sesión por canal en Connect (una conversación = canal Asistente IA), reset al completar |
| **¿Quién ve qué?** | Decidir si el operador ve todo el CRM o solo su parte (role user vs admin) |
| **Coste de IA por mensaje** | El pipeline ya usa modelos free/fallbacks con timeouts; medir y limitar rate por tenant |
| **¿El canal Asistente IA es por tenant o por equipo?** | Propuesta: por tenant, con suscripciones por usuario (ya soportado por `ChatSubscription`) |
| **Insurance en qué planes** | Decidir si va en TRIAL/INFINITY por defecto o solo en un plan nuevo "insurance" |

---

> **Próximo paso:** aprobar este plan → implementar **Fase 1** (conexión Connect ↔ pipeline IA) y en paralelo **I1–I3** (hacer visible Insurance). Después Fase 2 con los intents internos nuevos.
