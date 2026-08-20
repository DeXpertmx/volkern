# 22 · Tech Automations — Estado de los Triggers

> **Decisión (2026-08-20):** se mantienen TODOS los triggers en el builder.
> Este documento registra qué triggers tienen emisor real en producción y
> cuáles están "muertos" (seleccionables pero sin nada que los dispare), para
> no vender funciones inexistentes y saber qué cablear cuando toque.

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

## Triggers muertos ⚠️ (sin emisor — no se dispararán)

| Trigger | Qué falta para cablearlo |
|---|---|
| `estudiante_inscrito` | El módulo Academia (LMS) no emite ningún evento de inscripción. Hay que emitir `triggerAutomation('estudiante_inscrito', ...)` en la inscripción de estudiantes. |
| `estudiante_completa_curso` | No hay evento de finalización de curso. Emitir al completar un curso. |
| `leccion_completada` | No hay evento de finalización de lección. Emitir al marcar una lección completada. |

> Los 3 triggers de Academia dependen del módulo LMS (`app/academy`, `lib/academy-*`).
> Cuando el módulo de Academia emita esos eventos, actualizar este documento.

## Notas

- Los triggers muertos se mantienen en el builder por decisión del propietario
  del producto (2026-08-20): se prefiere dejarlos visibles y documentar el
  estado antes que quitarlos, para no romper automatizaciones que un tenant
  pudiera haber configurado a la espera del emisor.
- Verificación rápida de un trigger: buscar `triggerAutomation('<trigger>',` en
  `app/`, `lib/` y `scripts/`. Si solo aparece en `constants.ts` y en el
  builder, está muerto.
