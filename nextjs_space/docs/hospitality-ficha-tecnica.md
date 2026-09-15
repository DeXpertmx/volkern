# Volkern Hospitality — Ficha técnica del módulo

**Documento de inventario y estado real**
Fecha: 2026-09-15 · Rama: `master` · Última migración aplicada: 77/77
Fuentes: esquema de Prisma, rutas de `app/api`, páginas de `app/dashboard`, módulos de
`lib/hospitality`, y consulta de solo lectura a la base de producción.

**Regla de marca aplicada en este documento:** el proveedor externo de conectividad no se
nombra en ningún punto. Se le llama **Capa de Conectividad** o **proveedor de conectividad**,
igual que en el producto (plan maestro §38 y §37.10).

---

## 1. Menú del módulo

Fuente única: `lib/navigation-config.ts` → bloque `id: 'hospitality'`.
Módulo de plan: `hospitality` (`lib/plans.ts`), cuenta requerida: `BUSINESS`.

| # | Sección | Ruta | Estado |
| --- | --- | --- | --- |
| 1 | Inicio | `/dashboard/hospitality` | existe |
| 2 | Puesta en marcha | `/dashboard/hospitality/onboarding` | existe |
| 3 | Dashboard | `/dashboard/hospitality/dashboard` | existe |
| 4 | Planning | `/dashboard/hospitality/calendar` | existe |
| 5 | Operaciones | `/dashboard/hospitality/calendar?vista=operaciones` | existe (vista del planning) |
| 6 | Propiedades | `/dashboard/hospitality?tab=propiedades` | existe |
| 7 | Reservas | `/dashboard/hospitality/reservas` | existe |
| 8 | Registro de viajeros | `/dashboard/hospitality/viajeros` | existe |
| 9 | Tarifas | `/dashboard/hospitality/tarifas` | existe |
| 10 | Huéspedes | `/dashboard/hospitality/huespedes` | existe |
| 11 | Comunicaciones | `/dashboard/hospitality/comunicaciones` | existe |
| 12 | Automatizaciones | `/dashboard/hospitality/automatizaciones` | existe |
| 13 | Finanzas | `/dashboard/hospitality/finanzas` | existe |
| 14 | Reportes | `/dashboard/hospitality/reportes` | existe |

Check-in/out, mantenimiento y la configuración de conectividad son **funcionalidades dentro
de estas áreas**, no entradas de menú propias (decisión registrada en
`hospitality-booking-payments-plan.md` §1).

> **No existe sección "Booking Engine".** Es la única de las 14 declaradas en el plan de
> FASE 3 que todavía no tiene ruta ni página (ver §11).

---

## 2. Modelos de datos (19 modelos, 19 tablas)

Todos cuelgan de `Tenant` con `onDelete: Cascade`. Los identificadores externos nunca son
la clave interna.

### Núcleo alojativo
| Modelo | Tabla | Para qué |
| --- | --- | --- |
| `HospitalityProperty` | `hospitality_properties` | Propiedad física: dirección, zona, coordenadas, fotos, timezone, estado |
| `HospitalityUnit` | `hospitality_units` | Unidad reservable: tipo, capacidad, tarifa base, moneda, `estado` operativo (`available\|occupied\|cleaning\|dirty\|maintenance\|out_of_service`) |
| `HospitalityRatePlan` | `hospitality_rate_plans` | Plan de tarifa por unidad: precio/noche, min/max noches, días de check-in/out permitidos |
| `HospitalityUnitBlock` | `hospitality_unit_blocks` | Bloqueo manual de fechas con `tipo` (`propietario\|mantenimiento\|administrativo`). Intervalo `[inicio, fin)` |

### Reservas y trazabilidad
| Modelo | Tabla | Para qué |
| --- | --- | --- |
| `HospitalityReservation` | `hospitality_reservations` | Reserva interna. `channel`, `externalBookingId` (OTA), `cmBookingId` (channel manager), `action`, `estado`, importes, `guestData` (JSON), `payload`. Índice único idempotente: `[tenantId, channel, externalBookingId]` |
| `HospitalityWebhookEvent` | `hospitality_webhook_events` | Evento bruto recibido: `book/modify/cancel`, estado `recibido\|procesado\|duplicado\|error\|sin_mapping`, error y payload completo |
| `HospitalitySyncLog` | `hospitality_sync_logs` | Traza de cada push o reconciliación: tipo, operación, estado `pendiente\|exito\|error`, `httpStatus`, payload, respuesta y duración |

### Operación
| Modelo | Tabla | Para qué |
| --- | --- | --- |
| `HospitalityCleaningTask` | `hospitality_cleaning_tasks` | Limpieza: unidad, reserva, prioridad, responsable, `pending\|in_progress\|completed\|blocked` |
| `HospitalityMaintenanceTask` | `hospitality_maintenance_tasks` | Incidencia: `abierta\|en_proceso\|resuelta\|cerrada`, prioridad |

### Dinero (FASE 3.A/B)
| Modelo | Tabla | Para qué |
| --- | --- | --- |
| `HospitalityReservationItem` | `hospitality_reservation_items` | Líneas del desglose: `alojamiento\|limpieza\|extra\|otro`. Su suma es el **ingreso bruto** |
| `HospitalityPayment` | `hospitality_payments` | Pagos e intentos: `metodo`, `estado` (`pendiente\|pagado\|parcial\|reembolsado\|fallido`), `referenciaExterna`, `stripePaymentIntentId` |
| `HospitalityPaymentAccount` | `hospitality_payment_accounts` | Cuenta de cobro del tenant (Stripe Connect). **Sin código que la escriba todavía** |

### Cliente y comunicación
| Modelo | Tabla | Para qué |
| --- | --- | --- |
| `HospitalityCommunicationTemplate` | `hospitality_communication_templates` | Plantilla por `evento` (`confirmacion\|pre_llegada\|check_in\|post_salida\|resena`) y `canal` (`whatsapp\|email`) |
| `HospitalityTraveler` | `hospitality_travelers` | Persona alojada: documento, tipo, soporte, nacimiento, nacionalidad, domicilio, `estado` del registro y seguimiento del enlace (`enlaceEnviadoEn`, `enlaceEnviados`, `datosRecibidosEn`) |
| `HospitalityCompliance` | `hospitality_compliance` | Comunicación al Ministerio: `estadoReserva`, `estadoViajeros`, `codigoComunicacion`, `loteId`, `enviadoEn`, `procesadoEn`, `codigoError` |
| `HospitalityComplianceConfig` | `hospitality_compliance_config` | Configuración del registro: entorno, `codigoArrendador`, credenciales y **certificado digital de la entidad** (`.p12` + contraseña, ambos cifrados) |
| `HospitalityComplianceEvent` | `hospitality_compliance_events` | Traza de cada envío/anulación |

### Conectividad
| Modelo | Tabla | Para qué |
| --- | --- | --- |
| `ConnectivityProvider` | `connectivity_providers` | Credenciales cifradas del proveedor, estado, último evento, última sincronización, contador de errores |
| `ConnectivityMapping` | `connectivity_mappings` | `hotelCode → property/unit/rateplan` de Volkern. Único por `[provider, externalPropertyId, externalUnitCode]` |

---

## 3. Capa de aplicación

### Rutas API (38 en `/api/hospitality` + 5 en `/api/admin/conectividad` + 3 de cron + 1 pública)

| Dominio | Rutas |
| --- | --- |
| Propiedades / unidades | `properties`, `properties/[id]`, `units`, `units/[id]` |
| Tarifas | `rateplans`, `rateplans/[id]` |
| Reservas | `reservations`, `reservations/[id]`, `reservations/[id]/check`, `reservations/[id]/items[/itemId]`, `reservations/[id]/payments[/paymentId]` |
| Bloqueos | `blocks`, `blocks/[id]` |
| Operación | `operations`, `tasks` |
| Cliente | `guests`, `guests/link` |
| Comunicación | `comunicaciones`, `comunicaciones/[id]`, `comunicaciones/[id]/enviar-prueba` |
| Automatización | `automatizaciones`, `automatizaciones/[id]`, `automatizaciones/[id]/test` |
| Dinero | `finanzas`, `dashboard`, `reportes` |
| Registro de viajeros | `compliance`, `compliance/[reservationId]`, `compliance/config` |
| Onboarding | `onboarding`, `onboarding/catalogo`, `onboarding/mapping`, `onboarding/probar`, `onboarding/activar` |
| Conectividad | `sync` (push manual), **`webhook/reservations`** |
| Admin conectividad | `/api/admin/conectividad` (+ `test`, `propiedades`, `reconciliar`, `sync-logs`) |
| Crons | `/api/cron/hospitality-checkin-due`, `/api/cron/hospitality-reconcile`, `/api/cron/hospitality-review-request` |
| Público | `/api/public/viajeros/[token]` (formulario del viajero con enlace firmado) |

### Módulos puros (`lib/hospitality/`)

`availability.ts` (motor de disponibilidad, **único**), `calendar.ts` (planning/mes/operaciones),
`reservations.ts` (Reservation Engine), `sync.ts` (construcción y envío de pushes),
`connectivity.ts` (adapter de la capa de conectividad), `reconciliation.ts`,
`operations.ts` (check-in/out, limpieza, mantenimiento), `finance.ts` + `finance-summary.ts` +
`money-query.ts` (dinero), `reportes.ts`, `analytics.ts`, `events.ts` +
`automation-bridge.ts` (EventBus → Automation Engine), `comunicaciones.ts`, `onboarding.ts` +
`onboarding-status.ts`, `compliance.ts` + `compliance-store.ts` + `compliance-link.ts`,
`block-types.ts`, `ses-hospedajes/` (`certificado.ts`, `connector.ts`, `esquema.ts`, `zip.ts`).

### Autenticación y aislamiento
Todas las rutas usan `authenticateRequest()` (`lib/api-key-auth.ts`): sesión NextAuth **o**
clave de API, con `tenant` resuelto y validación de subdominio. El aislamiento por `tenantId`
está cubierto por `tests/hospitality-crud-isolation.test.ts`.

**Hueco real frente al plan maestro §27:** no hay comprobación de permisos **por acción**
(ver / crear / modificar / cancelar reservas, gestionar limpieza, configurar integraciones…).
El rol y sus `permisos` se cargan en la sesión, pero ninguna ruta de Hospitality los evalúa.
El control actual es de sesión + tenant + módulo del plan.

### Tests
57 archivos bajo `tests/` con prefijo `hospitality-`, `ses-` o `viajero-` (motor de
disponibilidad con guardia, calendario, reservas, finanzas, reportes, conectividad,
reconciliación, automatizaciones, viajeros, certificado y CLI de la interfaz del planning).

---

## 4. Flujo A — Entrada: webhook de reservas (proveedor → Volkern)

**Endpoint:** `POST https://volkern.app/api/hospitality/webhook/reservations`
(`buildReservationWebhookUrl()`; se lee de `NEXTAUTH_URL`).
**Autenticación:** `Authorization: Basic base64(usuario:contraseña)` con las mismas
credenciales guardadas en Administración → Conectividad. Comparación en tiempo constante.

```
Proveedor de conectividad
        │  POST { action: book|modify|cancel, hotelCode, channel, bookingId, ... }
        ▼
1. Basic Auth contra las credenciales cifradas      → 401 si no coincide
2. Parseo y validación del payload mínimo           → 400 si falta JSON
3. processReservationWebhook()
      3.1 acción válida y hotelCode/bookingId/channel presentes
      3.2 resolveMapping(hotelCode → property/unit)  → sin mapping: evento 'sin_mapping' + 400
      3.3 despacho por acción:
            book    → processBook()    (upsert huésped/Contact + alta de reserva)
            modify  → processModify()  (NUEVO ESTADO COMPLETO, reemplaza; auditoría del cambio)
            cancel  → processCancel()  (cambia estado, conserva historial)
      3.4 HospitalityWebhookEvent con el payload bruto:
            procesado | duplicado | error | sin_mapping
      3.5 si ok y no duplicado → dispatchConnectivityPush(...)
4. updateConnectivityStatus({ estado: 'conectado', ultimoEvento: now, resetErrores: true })
        ▼
200 { success: true, status, reservationId }
```

**Idempotencia:** única por `[tenantId, channel, externalBookingId]`. Un `book` repetido
devuelve `duplicado`, **no** crea segunda reserva y **no** dispara push.

**Reglas del contrato ya implementadas:** huésped opcional (una reserva sin email es
válida), `specialRequests` como texto libre, `modify` reemplaza en lugar de mezclar, sin
retries ciegos, error con su causa (404 si la reserva a cancelar/modificar no existe).

**Efectos en cadena del alta:** `reservation.created` en el EventBus → Automation Engine
(§7) → comunicación de confirmación → push de disponibilidad.

---

## 5. Flujo B — Salida: pushes a la Capa de Conectividad

### Endpoints del contrato usados por `lib/hospitality/connectivity.ts`

| Operación | Método y ruta | Estado |
| --- | --- | --- |
| Property / Mapping details | `GET /property_details/{hotelCode}?partnerId={pms}` | implementado (prueba de conexión y onboarding) |
| Inventory Push | `POST /update/{pms}` | implementado |
| Rate Push | `POST /update-rates/{pms}` | implementado |
| Inventory Restrictions Push | `POST /update/{pms}` | implementado |
| Rate Restrictions Push | `POST /update-rates/{pms}` | implementado |
| Fetch Reservations | `POST /data/{pms}` (`type: "reservation"`) | implementado (reconciliación) |
| Fetch Inventory | `POST /data/{pms}` | **no implementado** |
| Fetch Rates | `POST /data/{pms}` | **no implementado** |
| Mark No Show | `POST /marknoshow/{pms}` | **no implementado** (fuera de V1 por el plan) |
| Channel Multiplier | `POST /channel_multiplier/{pms}` | **no implementado** (fuera de V1 por el plan) |

Base URL: `CONNECTIVITY_BASE_URL` + `/api/v2/cm` (el prefijo se añade solo si falta).
Auth: `Authorization: Basic base64(usuario:contraseña)` + `Content-Type: application/json`.
Éxito = HTTP 2xx **y** `success: true`; el `message` del proveedor se conserva en los fallos.

### Disparadores del push (`dispatchConnectivityPush`)

| Origen | Operación registrada | Alcance |
| --- | --- | --- |
| Webhook `book` | `reserva_creada` | inventario + restricciones |
| Webhook `modify` | `reserva_modificada` | inventario + restricciones |
| Webhook `cancel` | `reserva_cancelada` | inventario + restricciones |
| Alta/edición manual de reserva | `reserva_creada` / `reserva_modificada` | inventario (skip tarifas) |
| Check-in / check-out | `reserva_creada` / `unidad_cambiada` | inventario |
| Estado operativo de unidad cambiado (a limpieza, mantenimiento, fuera de servicio…) | `unidad_cambiada` | inventario + restricciones (solo si el `estado` cambia respecto al valor anterior) |
| Limpieza completada → unidad `available` | `unidad_cambiada` | inventario |
| Alta/edición de plan de tarifa | `manual` | los cuatro: inventario, restricciones, tarifas y restricciones de tarifa (horizonte 180 días) |
| Alta/edición/cancelación de bloqueo de fechas | `unidad_cambiada` | inventario |
| Onboarding, prueba de disponibilidad/tarifas/reserva | `onboarding` | según la prueba |
| `POST /api/hospitality/sync` | `manual` | todo (operador) |

Cada push escribe una fila en `HospitalitySyncLog` con `exito` o `error` y su causa.
**Sin retries ciegos:** un fallo queda registrado para revisión manual (§30).
Si la conectividad no está configurada, no se llama a la red y se devuelve
`{ ok: false, error: 'no_configurada' }`.

### Cálculo de lo que se empuja

`lib/hospitality/sync.ts` → `buildInventoryUpdates`, `buildRateUpdates`,
`buildInventoryRestrictions`, `buildRateRestrictions`, alimentados por
`lib/hospitality/availability.ts` (`loadAvailabilityContext`). El motor de disponibilidad
descuenta **reservas activas + bloqueos manuales** con la misma regla de intervalo
`[checkIn, checkOut)`. Un solo origen de disponibilidad, con guardia de tests.

---

## 6. Flujo C — Reconciliación diaria

```
Cron 04:15 (Europe/Madrid)  →  runHospitalityReconcileScan()
   para cada tenant con mappings activos
     fetchReservations(hotelCode, desde, hasta)   ← POST /data/{pms}
     comparar con las reservas internas:
        faltante           → registrar divergencia (NO se crea sola)
        modificada         → registrar cambio detectado
        cancelada externa  → registrar
     todo idempotente y auditado en HospitalitySyncLog (tipo 'reconciliacion')
```

Diseño conservador deliberado: **nunca cancela ni sobrescribe** una reserva interna por su
cuenta; deja constancia para revisión. Endpoint manual: `POST /api/admin/conectividad/reconciliar`.

Crons adicionales: `hospitality-checkin-due` (cada hora, pre-llegada) y
`hospitality-review-request` (10:30, reseña post-salida con ventana de 72h).

---

## 7. Flujo D — Operaciones y cierre de ciclo

```
Check-in   → estado checked_in + unidad occupied + evento + comunicación 'check_in'
Check-out  → estado checked_out + unidad cleaning + tarea de limpieza + evento + 'post_salida'
Limpieza completada → unidad available + evento cleaning_completed + push de disponibilidad
Mantenimiento → incidencia sobre unidad; puede marcarla maintenance (resta disponibilidad)
```

`HospitalityUnitBlock` (propietario / mantenimiento / administrativo) resta disponibilidad
por el mismo motor y se comunica a los canales con el push de inventario. Visible y
editable desde el planning.

---

## 8. Flujo E — Reserva directa (Booking Engine) — **NO IMPLEMENTADO**

Diseño aprobado y registrado en `docs/hospitality-booking-payments-plan.md` (FASE 3.D y 3.C):

```
Landing del cliente / widget embebible
   → fechas → huéspedes → disponibilidad (Availability Engine central)
   → precio → datos del huésped → pago (cuenta del tenant) → reserva
   → MISMO Reservation Engine que las de OTA
   → disponibilidad → CRM → planning → operaciones → automatizaciones → finanzas
```

Reglas no negociables ya escritas en el plan: el Booking Engine **no** tiene motor propio,
**un solo** origen de disponibilidad, y **Stripe Connect** (Express) para que el dinero
llegue a la cuenta del tenant y no a la de Volkern.

Estado real: no existe ruta pública de reserva de Hospitality, ni configuración, ni embeds.
`app/booking/[slug]` y `app/embed/booking` son de Real Estate (agenda citas con agentes),
no reutilizables para reservar unidades.

---

## 9. Flujo F — Registro de viajeros (RH/PV ante el Ministerio del Interior)

Transporte distinto al de la conectividad: **SOAP con XML comprimido en ZIP y Base64**,
Basic Auth **y** certificado de cliente (TLS mutuo).

```
Reserva (de cualquier canal)
   → viajeros declarados (HospitalityTraveler)
   → 'Pedir datos' por WhatsApp: enlace firmado → /viajeros/[token] → el huésped completa
   → estado del registro derivado de los DATOS, no de una columna
   → enviarAlMinisterio(tipo: RH | PV | anulación)
        construirPeticionSes() → XML → ZIP → Base64 → SOAP
        https.Agent con el .p12 de la entidad + CA intermedia FNMT en la imagen
   → HospitalityCompliance (código, lote, errores) + HospitalityComplianceEvent
```

Entornos: `https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion` (pruebas) y
`https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion` (producción).
El certificado de la entidad se instala en **Registro de viajeros → Configuración**
(ver `docs/registro-viajeros-certificado.md`), se valida al subirlo y se guarda cifrado.

---

## 10. Flujo G — Automatizaciones y comunicaciones

Eventos publicados en el EventBus y escuchados por `automation-bridge.ts`, que los entrega al
**AutomationRuleEngine existente** (no hay segundo motor):

`reservation.created`, `reservation.modified`, `reservation.cancelled`,
`reservation.checked_in`, `reservation.checked_out`, `checkin_due`, `cleaning.completed`,
`maintenance.created`, `maintenance.completed`.

Acciones del motor: crear tarea/limpieza, enviar mensaje, etc. Con **idempotencia por reserva
y tipo**, y cierre de ejecuciones colgadas por cron (`automation-sweep`, cada 10 min).

Comunicaciones: `lib/hospitality/comunicaciones.ts` renderiza la plantilla del evento y la
envía por el canal correspondiente (WhatsApp de la plataforma o del tenant; email SMTP).
Crons de pre-llegada y reseña las disparan solo.

---

## 11. Qué falta

### A. Bloqueado por terceros (no depende de desarrollo)

| # | Qué falta | Quién lo desbloquea |
| --- | --- | --- |
| 1 | **Credenciales reales de producción y `partnerId`** de la Capa de Conectividad. Hoy funcionan las de pruebas y los cuatro pushes responden `success` | Alta de partner con el proveedor |
| 2 | **Registro del webhook en el proveedor.** La URL ya existe y está documentada, pero **nunca ha llegado un evento**: `hospitality_webhook_events` está vacío | Configurarlo en el panel del proveedor |
| 3 | **Registro de viajeros:** `codigoArrendador`, código de establecimiento y credenciales de la entidad; alta del servicio web en SES.HOSPEDAJES | Trámite de la entidad ante el Ministerio |

Consecuencia de 3: los 5 viajeros de producción están en `datos_pendientes` y las 2
comunicaciones siguen en `pendiente`; **nada se ha enviado nunca al Ministerio**.

### B. Pendiente de producto (decidido, sin implementar)

| # | Qué falta | Dónde está especificado |
| --- | --- | --- |
| 4 | **Stripe Connect (Express)** por tenant: alta KYC, cobro de la reserva directa, conciliación. Modelo `HospitalityPaymentAccount` creado, **0 código que lo use**; hoy los pagos se registran a mano (`POST .../payments`) | FASE 3.C |
| 5 | **Booking Engine**: sección de configuración, previsualización, página pública, embeds, reserva pública con precio y pago | FASE 3.D |
| 6 | **Precio de la reserva directa**: cálculo de noches × tarifa, extras, anticipo y política de cancelación | FASE 3.D |
| 7 | **Fetch Inventory y Fetch Rates**: la reconciliación solo compara reservas; no detecta divergencias de disponibilidad ni de tarifas entre Volkern y los canales | Plan maestro §14 |
| 8 | **Reintentos controlados de push**: hoy un fallo se registra y no se reintenta (§30 lo permite, pero no hay estrategia por tipo de error) | §30 |

### C. Deuda detectada en la revisión

| # | Qué falta |
| --- | --- |
| 9 | **Permisos por acción (§27)**: ninguna ruta de Hospitality evalúa los permisos del rol |
| 10 | **Exportación a PDF en Reportes**: hoy solo CSV |
| 11 | **Sección técnica de Integraciones** dentro de Volkern: la observabilidad (último webhook, último push, último error) existe en `/api/admin/conectividad`, pero el plan la pide como vista administrativa del producto con estado **por propiedad** |
| 12 | **Datos operativos de la demo**: 0 bloqueos, 0 tareas de limpieza y 0 incidencias en producción. Operaciones y el ciclo de limpieza no tienen nada que mostrar en una demo |
| 13 | **`Fetch Inventory`/`Fetch Rates` no implementados** dejan el flujo inverso incompleto frente a la cadena de §41 del plan maestro |

### D. Fuera de alcance declarado en V1 (no es deuda)

Mark No Show, Channel Multiplier, múltiples proveedores de conectividad, browser automation,
pricing dinámico, revenue management, POS, contabilidad hotelera completa, app móvil
(plan maestro §3 y §42).

---

## 12. Estado real en producción (medido el 2026-09-15, solo lectura)

| Dato | Valor |
| --- | --- |
| Migraciones aplicadas | 77 / 77 |
| Proveedor de conectividad | `channel_connectivity` · estado `conectado` · `partnerId` y usuario presentes · **0 errores** |
| Último evento / última sincronización | 2026-09-15 07:00 |
| Mappings activos | 2 unidades de la demo → hotel de pruebas (`suite` y `executive` con sus planes de tarifa) |
| Base URL | host de producción, prefijo de API normalizado por código |
| Propiedades / unidades / planes de tarifa | 2 / 3 / 4 |
| Reservas | 6 (Airbnb ×2, Booking.com ×2, directas ×2) |
| Eventos de webhook recibidos | **0** |
| Pushes registrados | inventario 5 ✓ / 4 ✗ · restricciones de inventario 5 ✓ · tarifas 3 ✓ · restricciones de tarifas 3 ✓ |
| Reconciliaciones | 8 ✓ / 2 ✗ (la última, hoy 07:00) |
| Bloqueos / limpiezas / incidencias | 0 / 0 / 0 |
| Pagos registrados / líneas de desglose | 4 / 10 |
| Cuentas de cobro (Stripe) | 0 |
| Viajeros / comunicaciones al Ministerio | 5 (todos `datos_pendientes`) / 2 (ambas en `pendiente`, nunca enviadas) |
| Configuración del registro | 0 filas (sin `codigoArrendador` ni certificado todavía) |
| Plantillas de comunicación | confirmación, pre-llegada, check-in, post-salida y reseña por WhatsApp **activas**; reseña por email inactiva |

Los 4 fallos de inventario son del 11-sep (antes de corregir la normalización de la URL) y
los 2 de reconciliación son del mismo día; desde entonces todo lo registrado es éxito.

---

## 13. Criterios de aceptación del plan maestro frente al estado real

| Criterio | Estado |
| --- | --- |
| Una reserva entra desde el webhook de forma idempotente | probado; **sin webhooks reales recibidos todavía** |
| `modify` reemplaza el estado completo, no mezcla | cumplido |
| Un huésped sin email no bloquea la reserva | cumplido |
| Un bloqueo de fechas resta disponibilidad y se comunica | cumplido (sin datos en la demo) |
| Un solo motor de disponibilidad | cumplido, con guardia de tests |
| El desglose cuadra: líneas = bruto = neto + comisiones | cumplido |
| Aislamiento multi-tenant | cumplido, con tests |
| La reserva directa del cliente llega al mismo motor y el dinero al tenant | **pendiente** (FASE 3.C y 3.D) |
