# 22 · Tech Automations — Estado de los Triggers

> **Decisión (2026-08-20):** se mantienen TODOS los triggers en el builder.
> Este documento registra qué triggers tienen emisor real en producción.
> Los 3 de Academia quedaron cableados el 2026-08-20,
> así que hoy TODOS los triggers del builder tienen emisor.

## Fuente de verdad

- Builder / selector: `lib/automation/constants.ts` → `VALID_TRIGGERS`
- Test canónico: `tests/automation-trigger-canonical.test.ts` (verifica que cada
  trigger emitido por las rutas existe en `VALID_TRIGGERS`)

## Triggers con emisor ✅

| Trigger | Emisor real |
|---|---|
| `nuevo_lead` | `app/api/leads/route.ts` (POST), `/api/public/leads`, tarjetas, skills |
| `lead_actualizado` | `app/api/leads/[id]/route.ts` (PUT/PATCH), `/api/leads/[id]/stage` |
| `lead_etiquetado` | `app/api/leads/[id]` cuando cambian los tags |
| `lead_sin_respuesta` | **Cron** `lib/cron/scheduler.ts` → `runLeadSinRespuestaScan(24)` cada 30 min (inicializado en `instrumentation.ts`). Guard contra repetidos vía `AuditLog` (`accion=lead_sin_respuesta`, `entidadId=lead.id`). Desde commit `04fa849` |
| `nota_creada` | `app/api/leads/[id]/notes/route.ts` |
| `interaccion_creada` | `app/api/leads/[id]/interactions/route.ts` |
| `formulario_enviado` | `app/api/formularios/[id]/submit/route.ts` |
| `cita_agendada` | `/api/public/citas`, booking-skills |
| `cita_confirmada` | booking-skills |
| `cita_cancelada` | booking-skills, anytimebot |
| `cita_reagendada` | `/api/citas/[id]/reagendar`, anytimebot |
| `pago_recibido` | `/api/webhooks/stripe` |
| `pago_fallido` | dunning-service |
| `webhook_recibido` | `/api/webhook/[webhookId]` |
| `n8n_workflow_completado` | `/api/webhooks/n8n/callback` |
| `n8n_workflow_fallido` | `/api/webhooks/n8n/callback` |
| `evento_externo` | `/api/webhooks/n8n/callback`, `/api/webhooks/n8n/trigger` |
| `email_abierto` | `/api/email-campanas/track/[recipientId]` |
| `email_clicado` | `/api/email-campanas/track/[recipientId]/click` |
| `estudiante_inscrito` | `/api/inscripciones` (POST) — vía `lib/academy/automation-events.ts` |
| `estudiante_completa_curso` | Rutas de progreso (`/api/progreso`, `/api/progreso/[leccionId]`, `/api/inscripciones/[id]/progreso`) y `lib/academy/quiz-service.ts` al llegar al 100% |
| `leccion_completada` | Las mismas rutas de progreso y `quiz-service.ts` al marcar una lección completada |

> Los 3 triggers de Academia se emiten a través del helper compartido
> `lib/academy/automation-events.ts` (`emitEstudianteInscrito`,
> `emitLeccionCompletada`, `emitCursoCompletado`). El `tenantId` se toma del
> curso (`Curso.tenantId`); si el curso no tiene tenant, no se dispara.

## Tareas programadas (cron) activas en producción

`initCronJobs()` (inicializado desde `instrumentation.ts`) registra SOLO los
jobs seguros. Auditoría 2026-08-20:

| # | Job | Horario | Estado |
|---|---|---|---|
| 1 | Morning Briefing (Telegram, opt-in por usuario) | 08:30 diario | ✅ activo |
| 2 | Métricas SaaS diarias (MRR) | 00:05 diario | ✅ activo |
| 3 | Snapshot mensual de métricas | 1º de mes 02:00 | ✅ activo |
| 4 | Alertas de límites de plan | 10:00 diario | ✅ activo |
| 5 | Renovación webhooks Google Calendar | cada 12h | ✅ activo |
| 6 | Cleanup analytics (>90 días) | dom 03:00 | ✅ activo |
| 7 | Polling IMAP | cada 5 min | ✅ activo (no-op sin config) |
| 8 | Evaluación schedules ADS | cada 5 min | ✅ activo (no-op sin datos) |
| 9 | Evaluación tests A/B | cada 30 min | ✅ activo (no-op sin tests) |
| 10 | Watchdog presupuesto ADS | cada 30 min | ✅ activo (no-op sin reglas) |
| 11 | Sync campañas ADS | cada 1h | ✅ activo (no-op sin conexión) |
| 12 | Full sync ADS | cada 6h | ✅ activo (no-op sin conexión) |
| 13 | **lead_sin_respuesta** (trigger automatizaciones) | cada 30 min | ✅ activo |

### Recuperación Proactiva de Facturas (reescrita)

Reactivada sin datos mock. Ahora solo procesa tenants con configuración explícita
en `Tenant.configuracion.recuperacionProactiva` (`{ enabled: true, provider }`).
Proveedores stubs: `verifactu` (Hacienda, requiere certificado), `nexus`
(requiere API key). Sin configuración el cron es un no-op.

> Para activar en un tenant, añadir en su configuración:
> ```json
> { "recuperacionProactiva": { "enabled": true, "provider": "verifactu" } }
> ```

### Excluidos a propósito (NO se registran)

| Job | Motivo |
|---|---|
| Ritual Dominical (Auditoría Fiscal) | `auditAllTenants()` escribe `GlobalAuditCloud` masivo por tenant; módulo fiscal no confirmado en uso |
| Ritual Dominical (Auditoría Fiscal) | `auditAllTenants()` escribe `GlobalAuditCloud` masivo por tenant; módulo fiscal no confirmado en uso |
| Churn rate semanal | Duplicado del MRR diario (ambos llamaban `recordMetrics()`) |

> **Morning Briefing (opt-in):** desde el commit del 2026-08-20 solo se envía a
> usuarios con la preferencia activada en Perfil → Notificaciones → "Morning
> Briefing" (guardada en `User.metadata.notifications.briefing`). Default
> activado: si el campo no existe, el usuario lo recibe.

## Notas

- Verificación rápida de un trigger: buscar `triggerAutomation('<trigger>',` en
  `app/`, `lib/` y `scripts/`. Si solo aparece en `constants.ts` y en el
  builder, está muerto.
