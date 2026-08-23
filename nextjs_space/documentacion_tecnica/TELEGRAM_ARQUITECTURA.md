# Arquitectura de Telegram — Volkern

> Documento de referencia para no volver a confundir los bots, el entrenamiento
> y, sobre todo, **las reglas de seguridad** que rigen todo lo que el sistema
> puede hacer por chat.

---

## 1. Roles de los bots (quién es quién)

| Bot | Rol | Quién lo usa | Qué recibe |
|---|---|---|---|
| **`volkerncrm_bot`** (ID `8657932328`, "Volkern System") | **Bot general del SISTEMA** | El desarrollador / admin de la plataforma | **Solo avisos del sistema**: notificaciones de deploy, alertas de errores de la plataforma, reportes de problemas. Es el `TELEGRAM_BOT_TOKEN` del entorno y el fallback del webhook. **Nunca** recibe conversación del chatbot ni avisos de datos de ningún tenant. |
| **Bot del tenant** (uno por tenant, conectado en su integración de Telegram) | **Bot del CHATBOT + avisos de ese tenant** | Los usuarios de ese tenant | Conversación con Volkern (registrar gastos, agendar citas, consultar leads…) **y todos los avisos de los datos de SU tenant**: confirmaciones destructivas, citas, cotizaciones aceptadas, firmas de contratos, entregas de WhatsApp no entregables, alertas de stock/visión, tareas de seguimiento, etc. Cada tenant usa el suyo y **solo recibe lo suyo**. |

**Regla de oro**: el entrenamiento de la IA (los bloques de intents) es del
**motor**, no del bot. Un intent entrenado una vez funciona para cualquier
tenant que conecte su bot. `volkerncrm_bot` se usa para probar el entrenamiento
porque es el bot del desarrollador, pero **no** es "el bot del chatbot": es el
bot del sistema.

### Ámbito de las notificaciones (sistema vs tenant)

| Aviso | Bot correcto | Ámbito |
|---|---|---|
| Deploy terminado / fallido, error de la plataforma, reporte de problema | `volkerncrm_bot` | **Sistema** (global, solo desarrollador) |
| Respuesta del chatbot, confirmación sí/no de acción destructiva | Bot del tenant | **Tenant** |
| Cita agendada/cancelada, cotización aceptada, contrato firmado | Bot del tenant | **Tenant** |
| WhatsApp no entregable, tarea de seguimiento, alerta de stock/VISION-LOCK | Bot del tenant | **Tenant** |
| Cualquier aviso que mencione datos de un tenant (leads, gastos, facturas…) | Bot del tenant | **Tenant** |

Regla: **un aviso que hable de datos de un tenant va por el bot de ese tenant**.
`volkerncrm_bot` solo recibe lo que es del sistema/plataforma, sin datos de
clientes.

## 2. Cómo resuelve el webhook a qué tenant pertenece el mensaje

`POST /api/webhooks/telegram` (un solo endpoint para todos los bots):

1. Busca la integración `telegram` cuyo `admin_chat_id` coincide con el chat
   que escribió (el `/start` vincula el chat al tenant).
2. Si no, usa la primera integración activa con `bot_token`.
3. Soporta integraciones legacy (token plano) y canales modernos (token
   cifrado AES).
4. Si nada matchea, cae al `TELEGRAM_BOT_TOKEN` del entorno (bot del sistema).

Por eso cada tenant conecta **su propio bot** en Configuración → Integraciones:
los mensajes de sus usuarios se resuelven contra los datos de ese tenant, y
las respuestas y avisos salen por el `bot_token` de **ese** tenant (nunca por
el bot del sistema).

## 3. Entrenamiento (cómo se agrega una capacidad nueva)

El entrenamiento se hace por **bloques** (hasta ahora: 24 bloques, **138 intents**;
ver recuento actualizado con `node scripts/audit-telegram-training.mjs`):

1. **Inventario**: buscar skills en `lib/skills/` que existan pero no tengan
   intent (huérfanos).
2. **Intent nuevo** en `lib/agents/intents/*.ts` (nombre, descripción, params,
   ejemplos, `destructive`).
3. **Detección determinista** (regex, sin LLM) en `lib/agents/intent-classifier.ts`
   — con cuidado de no colisionar con ramas existentes (siempre con test de
   regresión de la colisión).
4. **Wrapper** en `lib/skills/index.ts` + registro en el registry.
5. **Wiring** en `lib/agents/skill-orchestrator.ts` (intent→skill, módulo de
   permiso, mensajes de acceso, descripciones).
6. **Tests** (clasificación + wiring + no-colisión), typecheck, commit, deploy
   con el pipeline del VPS.

Regla: todo intent nuevo debe declarar `destructive: true` **solo** si ejecuta
una acción irreversible. Si es una consulta, un registro o una cancelación con
rastro, es `destructive: false`.

## 4. Reglas de seguridad (NO NEGOCIABLES)

### 4.1 El bot NUNCA borra información

- **Prohibido**: borrar/eliminar registros, leads, facturas, citas, mensajes.
- Los intents marcados `destructive: true` **no se ejecutan sin confirmación
  explícita** del usuario: el bot pregunta y espera un *sí* o *no*.
- Si el usuario responde *no* o algo ambiguo, la acción **no se ejecuta** y el
  rechazo queda auditado como `BLOCKED_SECURITY` en `ChatbotAuditLog`.

### 4.2 Cancelar ≠ borrar

| Acción | ¿Permitida? | ¿Confirmación destructiva? |
|---|---|---|
| Cancelar una cita | ✅ Sí (deja rastro en el timeline) | ❌ No |
| Reagendar una cita | ✅ Sí (conserva historial) | ❌ No |
| Eliminar un horario de ads | ⚠️ Solo con confirmación sí/no | ✅ Sí |
| Ajustar/consumir stock | ⚠️ Solo con confirmación sí/no | ✅ Sí |
| Cancelar/rectificar factura | ⚠️ Solo con confirmación sí/no (efecto legal) | ✅ Sí |
| Borrar cualquier registro | ❌ No existe esa capacidad | — |

### 4.3 Límites claros

- Cada intent exige el **módulo** del tenant (rrhh, produccion, finanzas…); sin
  él, el bot responde "No tienes acceso" y **no ejecuta nada**.
- Los intents sensibles exigen rol (p. ej. nómina: OWNER/ADMIN; nunca se asume
  privilegio si el usuario no tiene rol).
- El bot **no inventa datos**: si no encuentra al proveedor, al empleado o al
  lead, lo dice y pide los datos reales (nunca genera emails/fechas sintéticas).

### 4.4 Registro auditable (quién, cuándo, motivo, desde dónde)

Toda orden que modifica información queda en auditoría:

| Tabla | Qué registra |
|---|---|
| `StockMovement` | Movimientos de inventario: `userId` (quién), `createdAt` (cuándo), `reason` (motivo), `metadata.ordenDesde` (desde dónde: chatbot), `metadata.targetWarehouseId` (destino en transferencias), `auditHash`/`chainedHash` (cadena de integridad) |
| `ChatbotAuditLog` | Cada mensaje del chatbot: `telegramUserId`, `intent`, `skillExecuted`, `status` (`SUCCESS`/`ERROR`/`BLOCKED_SECURITY`/`BLOCKED_PERMISSION`), `inputRaw`, timestamps |
| Timeline del CRM | Eventos visibles en la ficha del cliente (citas, facturas, contratos, cotizaciones) |
| `trustProtocolLog` | Sellos de firma digital y documentos legales |

**Ejemplo — la caja de jabones**:

> *"Moví la caja de jabones de baño del almacén 1 al 2."*
>
> El sistema registra en `StockMovement`: **quién** (el `userId` del chat),
> **cuándo** (`createdAt`), **motivo** (la razón que dio el usuario), **desde
> dónde** (`metadata.ordenDesde = Chatbot`) y **a dónde**
> (`metadata.targetWarehouseId` = almacén 2). El movimiento es un OUT en el
> almacén 1 (con su destino) y un IN en el almacén 2, ambos encadenados por
> `referenceId`. Nunca se borra el registro: el historial es la fuente de la
> verdad para responder "¿quién lo movió? ¿cuándo? ¿por qué?".

## 5. Flujo de confirmación destructiva (chat)

```
Usuario:  "ajusta el stock de jabones, salida de 10 unidades"
Bot:      ⚠️ Esta acción es sensible: vas a ajustar el stock de un producto.
          No se puede deshacer y quedará registrada con tu usuario, fecha y
          motivo. ¿Confirmas que quiero ejecutarla? Responde sí o no.
Usuario:  sí
Bot:      ✅ ejecuta la acción (auditada en StockMovement + ChatbotAuditLog)

Usuario:  "elimina el horario de anuncios de las 9"
Bot:      ⚠️ …¿Confirmas…? Responde sí o no.
Usuario:  no
Bot:      ✅ Entendido, NO ejecuté eliminar un horario de anuncios.
          (auditado como BLOCKED_SECURITY)
```

## 6. Cómo probar un intent en producción

```bash
# 1. Enviar un update simulado con el chat real del desarrollador
curl -s -X POST https://volkern.app/api/webhooks/telegram \
  -H 'Content-Type: application/json' \
  -d '{"update_id":...,"message":{"message_id":1,"date":...,
       "chat":{"id":646107192,"type":"private"},
       "from":{"id":646107192,"first_name":"Bruno"},
       "text":"<mensaje de prueba>"}}'

# 2. Ver los logs del contenedor en el VPS
ssh -i ~/.ssh/id_buffy_volkern root@62.171.134.195 \
  "docker logs --since 2m \$(docker ps --filter name=volkern-erp_app -q) | grep -E 'IntentClassifier|ChatbotService'"
```

Un intent correcto aparece como `Ruta determinista: <intent>` (sin LLM) y
`skill=<intent> OK en <ms>`. La respuesta sale por **el bot del tenant** que
tiene la conversación abierta (el `bot_token` de su integración), no por
`volkerncrm_bot`.
