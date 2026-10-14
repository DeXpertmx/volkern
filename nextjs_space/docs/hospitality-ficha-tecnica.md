# Volkern Hospitality — Ficha técnica del módulo

**Documento de inventario y estado real**
Fecha: 2026-09-15 · Rama: `master` · Migraciones aplicadas en producción: 78

**Versión ilustrada en PDF:** `docs/hospitality-tecnico.pdf` — este inventario
reorganizado por flujos y con capturas reales del módulo; se regenera con
`scripts/generar-pdf-tecnico-hospitality.cjs`.
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
| 9b | Booking Engine | `/dashboard/hospitality/booking-engine` | existe (página pública en `/reservar/<slug>`) |
| 10 | Huéspedes | `/dashboard/hospitality/huespedes` | existe |
| 11 | Comunicaciones | `/dashboard/hospitality/comunicaciones` | existe |
| 12 | Automatizaciones | `/dashboard/hospitality/automatizaciones` | existe |
| 13 | Finanzas | `/dashboard/hospitality/finanzas` | existe |
| 14 | Reportes | `/dashboard/hospitality/reportes` | existe |
| 15 | Equipo y roles | `/dashboard/hospitality/roles` | existe |

Check-in/out, mantenimiento y la configuración de conectividad son **funcionalidades dentro
de estas áreas**, no entradas de menú propias (decisión registrada en
`hospitality-booking-payments-plan.md` §1). **Equipo y roles** sí es una entrada: no es una
función de ninguna otra área, es la decisión de quién hace qué, que no pertenece a ninguna.

> Las 14 secciones del plan de FASE 3 tienen ya ruta y página: la última en llegar fue
> **Booking Engine**, que además publica una página pública por tenant (`/reservar/<slug>`) y
> un widget embebible.

---

## 2. Modelos de datos (20 modelos, 20 tablas, más `User.contactId`)

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

### Reserva directa (FASE 3.D)
| Modelo | Tabla | Para qué |
| --- | --- | --- |
| `HospitalityBookingConfig` | `hospitality_booking_config` | Política del canal directo: `slug` público (único en la plataforma), propiedades publicadas, divisa publicada, política de cancelación, anticipo, tarifa de limpieza y si se exige pago online. Nada de disponibilidad ni de reservas |

### Conectividad
| Modelo | Tabla | Para qué |
| --- | --- | --- |
| `ConnectivityProvider` | `connectivity_providers` | Credenciales cifradas del proveedor, estado, último evento, última sincronización, contador de errores |
| `ConnectivityMapping` | `connectivity_mappings` | `hotelCode → property/unit/rateplan` de Volkern. Único por `[provider, externalPropertyId, externalUnitCode]` |

---

## 3. Capa de aplicación

### Rutas API (41 en `/api/hospitality` + 7 en `/api/admin/conectividad` + 3 de cron + 5 públicas)

| Dominio | Rutas |
| --- | --- |
| Propiedades / unidades | `properties`, `properties/[id]`, `units`, `units/[id]` |
| Tarifas | `rateplans`, `rateplans/[id]` |
| Reservas | `reservations`, `reservations/[id]`, `reservations/[id]/check`, `reservations/[id]/items[/itemId]`, `reservations/[id]/payments[/paymentId]` |
| Bloqueos | `blocks`, `blocks/[id]` |
| Operación | `operations`, `tasks` |
| Cliente | `guests`, `guests/link` |
| Comunicación | `comunicaciones`, `comunicaciones/[id]`, `comunicaciones/[id]/enviar-prueba` (el `diseno` de bloques del email viaja en POST/PATCH y la prueba devuelve `htmlPreview`) |
| Automatización | `automatizaciones`, `automatizaciones/[id]`, `automatizaciones/[id]/test` |
| Dinero | `finanzas`, `dashboard`, `reportes` |
| Registro de viajeros | `compliance`, `compliance/[reservationId]`, `compliance/config` |
| Onboarding | `onboarding`, `onboarding/catalogo`, `onboarding/mapping`, `onboarding/probar`, `onboarding/activar` |
| Conectividad | `sync` (push manual), **`webhook/reservations`** |
| Booking Engine | `booking` (configuración de la reserva directa) |
| Admin conectividad | `/api/admin/conectividad` (+ `test`, `propiedades`, `reconciliar`, `sync-logs`, `divergencias`, `mensajes-sin-mapping`) |
| Crons | `/api/cron/hospitality-checkin-due`, `/api/cron/hospitality-reconcile`, `/api/cron/hospitality-review-request` |
| Público | `/api/public/viajeros/[token]` (formulario del viajero con enlace firmado); `/api/public/booking/[slug]/cotizar` y `/api/public/booking/[slug]/reservar` (motor directo) |

### Módulos puros (`lib/hospitality/`)

`availability.ts` (motor de disponibilidad, **único**), `calendar.ts` (planning/mes/operaciones),
`reservations.ts` (Reservation Engine), `sync.ts` (construcción y envío de pushes),
`connectivity.ts` (adapter de la capa de conectividad), `codigos.ts` (códigos externos),
`reconciliation.ts`, `operations.ts` (check-in/out, limpieza, mantenimiento) y `estados.ts` (vocabulario de estados),
`guests.ts`, `incidencias.ts`, `housekeeping-sheet.ts` + `reservas-csv.ts` + `csv.ts` (listas de
recepción), `finance.ts` + `finance-summary.ts` + `money-query.ts` (dinero), `penalizaciones.ts`
+ `no-show.ts` (cargos de cancelación), `holds.ts` + `holds-audit.ts` (caducidad de holds),
`reportes.ts`, `analytics.ts`, `events.ts` + `automation-bridge.ts` (EventBus → Automation
Engine) y las métricas (`holds-metrics.ts`, `partes-metrics.ts`, `resenas-metrics.ts`,
`preguntas-metrics.ts`, `booking-metrics.ts`), `comunicaciones.ts` + `checkout.ts` +
`checkout-avisos.ts` (comunicaciones al huésped), `booking-engine.ts` + `booking-extras.ts` +
`booking-payments.ts` + `booking-i18n.ts` (reserva directa), `permissions.ts` + `capacidades.ts`
+ `roles.ts` + `roles-apply.ts` + `roles-rollout.ts` + `permissions-backfill.ts` (permisos por
acción), `onboarding.ts` + `onboarding-status.ts`, `registro-viajeros.ts` +
`registro-viajeros-service.ts` + `mir-espec.ts` (registro de viajeros, MIR/SES Hospedajes),
`parte-rechazo.ts` + `aviso-partes.ts`, `checkin-preguntas.ts` + `checkin-service.ts` +
`guest-checkin.ts` (check-in online), `resenas.ts` + `resenas-service.ts` + `resenas-import.ts`
+ `resenas-i18n.ts` (reseñas), `conectividad-causa.ts` + `conectividad-secreto.ts`,
`block-types.ts` (tipos de bloqueo del planning).

### Autenticación, permisos y aislamiento
Todas las rutas usan `authenticateRequest()` (`lib/api-key-auth.ts`): sesión NextAuth **o**
clave de API, con `tenant` resuelto y validación de subdominio. El aislamiento por `tenantId`
está cubierto por `tests/hospitality-crud-isolation.test.ts`.

Además, **cada método exige permiso por acción** (§27). `lib/hospitality/permissions.ts`
traduce la capacidad del producto (`reservas.cancelar`, `operaciones.gestionar`,
`mantenimiento.gestionar`, `integraciones.gestionar`…) al par módulo + acción del sistema
de permisos de la plataforma, y las rutas llaman a `exigirPermisoHospitality()`. Sin permiso
la respuesta es **403 con la causa** (`permisoRequerido: 'hospitality_reservas.cancelar'`),
antes de tocar la base.

Ocho módulos de Hospitality, concedibles desde Equipo → Roles y permisos:
`hospitality_reservas` (ver / crear / editar / **cancelar** / **documento_completo**),
`hospitality_operaciones` (ver / gestionar / **checkin**), `hospitality_mantenimiento`,
`hospitality_integraciones` (ver / gestionar / **administrar**), `hospitality_finanzas`,
`hospitality_comunicaciones`, `hospitality_automatizaciones` y
`hospitality_misreservas` (la puerta del huésped). La única ruta exenta es el **webhook del
proveedor**, que llega con Basic Auth y no con usuario de Volkern.

**Ninguna puerta se decide por el nombre del rol.** Había dos que sí —instalar el
certificado de la entidad y ver los documentos sin enmascarar se concedían a quien se
llamara «Admin»—, y eso tenía dos consecuencias: un rol nuevo no podía recibirlas por mucho
que el administrador las concediera, y renombrar «Admin» habría dejado a la cuenta sin
firmar ante el Ministerio. Ahora son capacidades (`integraciones.administrar` y
`viajeros.documento_completo`), con un test que recorre `lib/hospitality` y
`app/api/hospitality` y falla si vuelve a aparecer una decisión por nombre.

Al empezar a comprobar, los roles existentes no tenían claves de Hospitality: el script
idempotente `scripts/backfill-hospitality-permissions.ts` les concede el conjunto completo
(lo que ya ejercían de hecho) para que nadie pierda acceso, y el administrador recorta
después.

La interfaz decide con **la misma regla**: `lib/permissions-core.ts` contiene la regla sin
acceso a datos, `lib/hospitality/capacidades.ts` traduce capacidad → módulo + acción y
`puedePorRol()` la resuelve. El navegador la usa a través de
`hooks/use-capacidades-hospitality.ts` (lee el rol de `/api/users/me` una sola vez y lo
cachea) y ninguna acción de escritura del dashboard se dibuja fuera de
`<AccionHospitality capacidad="…">`, que la oculta cuando el rol no la tiene. Ocultar y no
deshabilitar: un botón gris permanente no explica nada, y para saber qué falta está el 403,
que nombra el permiso exacto.

### Roles del producto
El módulo tiene su propio vocabulario, definido una sola vez en `lib/hospitality/roles.ts`
y aplicable desde **Hospitality → Equipo y roles**:

| Rol | Qué es |
| --- | --- |
| **Anfitrión** | Administra la propiedad entera, incluido su certificado y quién entra al módulo |
| **Agente** | La empresa administradora: opera, cobra y resuelve; no firma ni reparte permisos |
| **Mantenimiento** | Incidencias y el día de la propiedad para poder entrar a trabajar |
| **Limpieza** | Llegadas, salidas y marcar limpiezas. No entrega llaves, no ve documentos ni dinero |
| **Huésped** | El cliente: solo las reservas de su contacto. Sin vínculo, ninguna |

Aplicar el catálogo **solo añade** lo que falte (nunca retira, así que repetirlo no puede
dejar a nadie sin acceso); recortar es `restablecer`, y se pide a propósito. Repartir
permisos de Hospitality es la capacidad `equipo.roles`, no «editar el equipo»: un rol que
toca Hospitality no lo cambia, ni lo renombra, ni lo borra quien no la tenga. Los nombres
del vocabulario no se renombran —hay textos y reglas que los nombran— pero sus capacidades
sí se ajustan desde la matriz.

Al convertir los privilegios por nombre en permisos, ningún rol pierde lo que tenía:
`scripts/rollout-roles.ts` (idempotente, solo aditivo) copia a permisos lo que hasta ahora se
concedía por el nombre del rol, con las reglas y sus pruebas en
`lib/hospitality/roles-rollout.ts` (capacidades del módulo) y `lib/roles-rollout.ts`
(plataforma), que hereda dos cosas de naturaleza distinta:

- **Acceso.** `configuracion.gestionar` para los roles que administraban por llamarse «Admin»
  (modo de compliance, marca blanca y cockpit financiero consolidado).
- **Alcance.** `leads.ver_todos` para los roles que veían el pipeline entero; el alcance de
  los datos no se hereda por llamarse «Admin», se hereda por haberlo tenido. Antes el
  pipeline se recortaba a quien se llamara «Sales Agent» o «Support», así que su etiqueta era
  la credencial: renombrarlos concedía los leads de toda la cuenta y crear otro rol con ese
  nombre los recortaba sin que nadie lo pidiera. Ahora `leads.ver` abre el pipeline y
  `leads.ver_todos` decide si se ve entero o solo lo asignado a uno mismo.

Esa última conversión cierra el alcance de `tests/rolename-authorization-guard.test.ts`: la
guardia recorre `lib/`, `app/api/` y `components/` y **ya no necesita ninguna excepción por
línea**, porque la última —la del CRM— es un permiso.

El **rol Huésped no es el rol de reservas recortado**: tiene `hospitality_misreservas.ver`,
no `reservas.ver`. Si compartieran capacidad, dar acceso a un huésped sería abrirle las
reservas de toda la cuenta y lo único que lo evitaría sería un filtro que la siguiente ruta
puede olvidar. El filtro por `User.contactId` entra en la consulta, y la reserva de otro
contacto responde 404 igual que una inexistente. Sin vínculo: cero reservas, nunca todas.

El vínculo se pone desde la propia pantalla (**Huéspedes con acceso**, en Equipo y roles):
listar quién tiene el rol, vincular con un contacto, desvincular y dar de alta la cuenta. El
alta reutiliza `POST /api/users` con su invitación, sus límites de plan y su auditoría —no hay
un segundo camino para crear usuarios— y añade `contactId`, que pide la capacidad
`equipo.roles` y no la de invitar: convertir una cuenta en el acceso de un huésped es repartir
el acceso al alojamiento. Por eso mismo, un acceso de huésped nace **con el rol Huésped y con
ningún otro**: sin esa comprobación, la llave del alojamiento serviría para fabricar un
administrador de la cuenta entera pasando un `contactId`. El vínculo
(`/api/hospitality/accesos-huesped`) comprueba tenant en las dos direcciones y exige que el
usuario tenga el rol Huésped, porque para cualquier otro el vínculo no cambiaría nada y haría
creer que sí.

El vínculo tiene que **viajar con el usuario autenticado**: `alcanceDeReservas` decide con
`User.contactId`, así que la autenticación lo devuelve en las dos formas de entrar (sesión y
API key). No es un detalle de implementación: cuando se quedaba por el camino, el huésped
entraba a ver cero reservas, sin error y sin poder distinguirlo de no tener estancias.

### Tests
Los archivos bajo `tests/` con prefijo `hospitality-`, `ses-` o `viajero-` (motor de
disponibilidad con guardia, calendario, reservas, finanzas, reportes, reserva directa,
conectividad, reconciliación, automatizaciones, viajeros, certificado y CLI del planning),
más los de permisos: catálogo y resolución, guardia que falla si una ruta deja de exigir
capacidad, pruebas de ruta con el 403 real, guardia de que ninguna acción que escribe del
dashboard se dibuja fuera de `<AccionHospitality>`, pruebas de que el componente oculta la
acción cuando el rol no la tiene, y las del catálogo de roles: qué concede cada uno, que las
capacidades privilegiadas no viajen en el retrollenado, la herencia de privilegios, la
fusión al aplicar y el escaneo de decisiones por nombre de rol.

### La misma regla fuera del módulo
Los roles del producto hicieron evidente un defecto que no era exclusivo de Hospitality: la
etiqueta del rol como credencial. Fuera del módulo quedaban tres puertas que concedían por
nombre, y ya no queda ninguna:

| Puerta | Antes | Ahora |
|---|---|---|
| Modo de compliance de la cuenta (`PATCH /api/tenant/compliance-mode`) | «Admin» o «Administrador» | `configuracion.gestionar` |
| Marca de la cuenta (`PUT /api/whitelabel`) | «Admin» o «Administrador» | `configuracion.gestionar` |
| Cockpit financiero consolidado (`validateFinancialSecurity`) | lista `SUPERADMIN/ADMIN/OWNER/FINANCE_ADMIN` | `configuracion.gestionar` |

El resumen ejecutivo de la cuenta es parte de administrarla, así que comparte llave con el
resto de la configuración; el día que exista un permiso financiero propio, es una línea.
Superadmin no pasa por el permiso, pasa por su bypass, que sigue viviendo en un solo sitio.

`tests/rolename-authorization-guard.test.ts` recorre el código real de `lib/`, `app/api/` y
`components/` y falla si vuelve a aparecer una comparación contra el nombre de un rol de
cliente o una lista `ROLES_CON_*`. Sus excepciones están enumeradas una a una con el motivo,
una de ellas por línea —la deuda heredada del CRM, donde «Sales Agent» y «Support» solo ven
sus propios leads y todavía no existe el permiso que lo exprese—, de modo que mover esa
línea hace que la guardia vuelva a avisar en vez de quedarse dormida.

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
| Fetch Reservations | `POST /data/{pms}` (`type: "reservation"`) | implementado (reconciliación). `startDate`/`endDate` filtran por **fecha de reserva** (`bookedOn`), no por estancia: la ventana la fija `lib/hospitality/ventana-reservas.ts` (30 días atrás / 30 adelante) |
| Message Webhook (entrante) | `POST {nuestra_url}` | implementado (`/api/hospitality/webhook/messages`, `docs/hospitality-mensajes-canal.md`) |
| Message Reply | `POST /message-reply/{pms}` | implementado (`enviarMensajeCanal`; en booking.com exige `booking_id`) |
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
        ventana = ventanaFetchReservas(730 días atrás, 30 adelante)
        (son FECHAS DE RESERVA, no de estancia, y el barrido mira el
         horizonte de venta: una reserva viva pudo reservarse hace meses
         —ver ventana-reservas.ts—; lo que no entra por ser antiguo es la
         ESTANCIA ya terminada hace >30 días, que se cuenta como histórica)
     comparar con las reservas internas:
        faltante           → se CREA (processBook: es la red de seguridad del push perdido)
        modificada         → se aplica (estado completo nuevo)
        cancelada externa  → se cancela
        interna activa que el proveedor ya no reporta → divergencia para revisar
     si tocó algo (creadas+actualizadas+canceladas > 0):
        dispatchConnectivityPush(operacion 'reconciliacion')  ← la disponibilidad
        recalculada viaja al canal: la unidad vendida aquí no puede quedar
        abierta allí (sin esto, una reserva recuperada seguía vendiéndose)
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

## 8. Flujo E — Reserva directa (Booking Engine)

Diseño aprobado en `docs/hospitality-booking-payments-plan.md` (FASE 3.D y 3.C) e implementado:

```
Landing del cliente / widget embebible  (/reservar/<slug>  ·  /embed/reservar/<slug>)
   │
   ├─ 1. Fechas y huéspedes            POST /api/public/booking/<slug>/cotizar
   │        └→ Availability Engine central: unidades libres del rango
   │           (reservas activas + bloqueos, la misma regla para todos)
   │
   ├─ 2. Unidad y precio               módulo puro de tarificación
   │        └→ tarifa del plan activo (o base) × noches + limpieza,
   │           anticipo y saldo; restricciones del plan respetadas
   │
   ├─ 3. Datos y reserva               POST /api/public/booking/<slug>/reservar
   │        └→ crearReservaDirecta()  = MISMO Reservation Engine que las de OTA
   │           · bloqueo de fila de la unidad + recomprobación (no se vende dos veces)
   │           · huésped al CRM con upsertGuest (el mismo del webhook)
   │           · líneas de desglose: alojamiento + limpieza
   │           · eventBus reservation.created → automatizaciones
   │           · comunicación de confirmación (solo si queda confirmada)
   │           · push de disponibilidad a los canales
   │
   └─ 4. Pago (si el alojamiento lo exige)
            └→ sesión de cobro CONTRA LA CUENTA DEL TENANT
               · webhook único de la plataforma → HospitalityPayment (pagado)
                 → reserva pending → confirmed → confirmación al huésped
```

Reglas no negociables del plan, todas cumplidas: el Booking Engine **no** tiene motor propio,
**un solo** origen de disponibilidad, y el dinero llega a la cuenta del tenant y no a la de
Volkern (Volkern no retiene fondos). Los ids de la reserva directa son internos: el enlace de
confirmación va firmado con HMAC, así que nadie lee una reserva ajena probando identificadores.

Estado real hoy: **ningún tenant tiene cuenta de cobro conectada** (0 filas en
`hospitality_payment_accounts`), así que en la práctica la reserva directa funciona sin pago
online —la cobra el alojamiento— y exigirlo está implementado pero rechaza la reserva con una
causa clara hasta que la cuenta esté habilitada.

**Verificado en producción el 2026-09-15** con la página del tenant Demo Real Estate
(`/reservar/volkern-demo`, publica Villa Mar Azul): cotización de 3 noches que respeta el plan
de tarifa (2.890/noche + 60 de limpieza = 8.730 €), reserva creada por el mismo motor
(`Directa`, huésped al CRM, líneas que cuadran con el encabezado, importe en la divisa del
tenant), **idempotencia** del formulario (mismo `solicitudId` → una sola reserva), **rechazo de
doble venta** (409 al repetir unidad y fechas), enlace de confirmación firmado que se rechaza
al alterar la firma, y **push real a la capa de conectividad** (`inventory` e
`inventory_restrictions` en éxito, HTTP 200) para bloquear las fechas en los canales. Con
`requierePagoOnline` activo y sin cuenta conectada, la API responde **503 con la causa** y no
crea nada.

`app/embed/booking` sigue siendo de Real Estate (agenda citas con agentes) y no se reutilizó,
tal y como decidió la FASE 3. `app/booking/[slug]` fue la primera página pública del Booking
Engine y hoy **solo redirige** (308) a la página única `/reservar/<slug>` —o a
`/embed/reservar/<slug>` si venía con `?embed=1`— conservando `?lang`; si la propiedad no está
en la lista de publicación de la configuración, responde la misma frase de «no disponible»
que la página única. El criterio de publicación es uno: `propiedadesPublicadas`.

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

El correo del canal email se **compone con bloques** en el editor visual: el diseño
(cabecera, título, párrafos, secciones de etiqueta/valor y botones) se guarda en
`hospitality_communication_templates.diseno` (JSON, nullable) y lo compila
`lib/hospitality/comunicaciones-email.ts` —módulo puro, sin base de datos ni red— a HTML de
tabla con estilos en línea, que es lo único que maqueta igual en Gmail, Outlook y el móvil.
El mismo módulo pinta la vista previa en el navegador, así que lo que se ve al editar es lo
que sale. Nada de HTML del hotel se ejecuta: el texto se escapa siempre y solo se reconocen
`**negrita**`, `*cursiva*` y `[texto](enlace)` con esquema http(s)/mailto. El canal WhatsApp
sigue enviando `contenido` en texto plano y `contenido` es también la parte de texto del
correo (si está vacío se genera del diseño).

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
| 5 | **Cuenta de cobro (Stripe Connect)**: el alta KYC del tenant y el estado de la cuenta. El cobro ya está implementado y el estado se consulta en vivo, pero **ningún tenant tiene cuenta conectada**: mientras no la haya, exigir pago online rechaza la reserva en vez de dejar una que nadie puede pagar | FASE 3.C |
| 7 | **Diferencias de disponibilidad, cubiertas sin `Fetch Inventory`** (9-oct-2026): la reconciliación diaria compara lo que el proveedor tiene por bueno —el último push de inventario que cubre cada noche— con la disponibilidad que justifica el estado interno, y anota las **noches sin justificar** por propiedad (`lib/hospitality/inventario-divergencias.ts`, tipo `divergencias_inventario`) con avisos en el panel de crons y sección propia en el panel de Conectividad. **Sigue pendiente** la mitad de tarifas y leer del proveedor en vez de rehacer el push | Plan maestro §14 |
| 8 | **Reintentos controlados de push**: hoy un fallo se registra y no se reintenta (§30 lo permite, pero no hay estrategia por tipo de error) | §30 |

### C. Deuda detectada en la revisión

| # | Qué falta |
| --- | --- |
| 9 | **El rol se resuelve una vez por carga**: el hook cachea la respuesta de `/api/users/me`, así que un cambio de permisos hecho mientras alguien tiene la pestaña abierta no se refleja hasta que recarga (el backend, en cambio, decide en cada petición) |
| 10 | **Exportación a PDF en Reportes**: hoy solo CSV |
| 11 | **Sección técnica de Integraciones** dentro de Volkern: la observabilidad (último webhook, último push, último error) existe en `/api/admin/conectividad`, pero el plan la pide como vista administrativa del producto con estado **por propiedad** |
| 12 | **Datos operativos de la demo**: 0 bloqueos, 0 tareas de limpieza y 0 incidencias en producción. Operaciones y el ciclo de limpieza no tienen nada que mostrar en una demo |
| 13 | **`Fetch Inventory`/`Fetch Rates` no implementados** dejan el flujo inverso incompleto frente a la cadena de §41 del plan maestro. La guardia de noches sin justificar mitiga la mitad de disponibilidad reconstruyendo lo empujado, pero no sustituye a leer del proveedor (que además cazaría ediciones hechas en su panel, invisibles para el replay) |
| 14 | **Reseñas de OTA: el proveedor no las expone** (medido el 9-oct-2026 sobre el catálogo completo de su documentación: ni un endpoint de reseñas, y el dataset de `/data/{pms}` solo admite `inventory`, `rates` y `reservation`). Hoy el histórico entra por CSV exportado del canal (panel Reseñas) y la petición de un endpoint está redactada en `docs/hospitality-email-proveedor-resenas.md`. Alternativas si no lo añaden: agregador de reputación (otra cuenta y contrato) o API de reseñas de cada OTA (exige ser partner certificado, no lo somos). Descartado raspar la URL pública |
| 15 | **Mensajería del canal: falta que el proveedor configure la URL del webhook** (`/api/hospitality/webhook/messages`) con el Basic de la capa. Mientras no lo haga, la bandeja está vacía por falta de datos, no por un fallo. Un `hotel_id` sin mapping **ya deja incidencia visible** en el panel de Conectividad (misma tabla que las reservas sin mapping, una fila por código y canal con su contador de intentos, que se cierra sola al vincular el código). Siguen fuera los adjuntos (se enseñan por nombre, sin descarga) y el reintento de un saliente fallido (lo reescribe el hotel) |

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
| Cuentas de cobro (Stripe) | 0 → el cobro online de la reserva directa no se puede usar todavía |
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
| La reserva directa del cliente llega al mismo motor | cumplido (entra por `crearReservaDirecta`, con evento, comunicación y push) |
| El dinero de una reserva directa llega a la cuenta del tenant | implementado y sin verificar en vivo: **no hay ninguna cuenta conectada** |
