# Contrato técnico — Capa de Conectividad de Canales (Hospitality)

> Documento interno de desarrollo. Este contrato describe la API del proveedor
> de conectividad que Volkern Hospitality usa para sincronizar inventario,
> tarifas y reservas con los canales de distribución (OTAs).
>
> **Regla de marca:** el nombre del proveedor de conectividad NO debe aparecer
> jamás en la UI, correos, PDFs, facturas ni ningún texto visible al cliente.
> En el producto se referencia como "Conectividad de Canales" / "Canal Manager".
> El nombre técnico solo existe dentro del adapter de integración.
>
> Fuente oficial: https://apidocs.aiosell.com (raíz, `/pms`, `/ota`).
> El plan maestro referencia este contrato como `aiosell-api-context.md`.

## Flujo de integración (leer primero)

1. **Construir con placeholders.** Escribir la integración completa usando un
   partner id placeholder para `{pms}` y credenciales Basic Auth placeholder
   (`<USERNAME>` / `<PASSWORD>`). Nunca inventar valores reales.
2. **Probar los push en el Sandbox.** Los endpoints de Rate Push e Inventory
   Push pueden probarse en el Sandbox de la documentación antes del onboarding.
3. **Construir y probar el webhook de reservas.** El PMS expone UN endpoint
   POST para `book` / `modify` / `cancel` y se ejercita con el Webhook Tester.
4. **Registrarse como partner.** Solo después del onboarding el proveedor
   emite credenciales Basic Auth reales y el partner id.

## Reglas duras

- Autenticación: **HTTP Basic Auth** (`Authorization: Basic base64(user:pass)`).
- `Content-Type: application/json` en todas las peticiones.
- Fechas: `YYYY-MM-DD`; timestamps: `YYYY-MM-DD HH:MM:SS`.
- Los campos opcionales de restricción se envían como `null`, no omitidos.
- Los pushes son **UPSERT**: reenviar un valor para un rango sobrescribe.
- `modify` es **estado completo nuevo** (reemplaza, no mezcla parcialmente).
- El webhook debe ser **idempotente por `bookingId`** (entregas duplicadas posibles).
- La **unidad** se resuelve por `rooms[0].roomCode`; `rateplanCode` solo desempata.
  Un `roomCode` sin vínculo **no se adivina**: se rechaza y se audita (salvo que
  el vínculo sea inequívoco, ver "Resolución asistida").
- **Una reserva por booking**: un payload con más de un elemento en `rooms` no
  se registra ni parcialmente — se rechaza con evento claro en el panel de
  incidencias (tipo `multi_habitacion`) y el operador decide si partirlo. Un
  `cancel` nunca se rechaza por esto: cancela por `bookingId` y las `rooms`
  sobran. Registra solo la primera habitación sería perder las demás en
  silencio; meter todas en una unidad sería un overbooking.
- **Partida manual del booking multi-habitación**: desde el panel de
  incidencias, el operador asigna una unidad a cada habitación y registra el
  booking como N reservas separadas (`POST
  /api/hospitality/incidencias/registrar-partida`). Cada parte deriva su
  `externalBookingId` como `bookingId#n` (`BKG-1#2` = segunda habitación de
  `BKG-1`), así que:
  - es idempotente por parte: repetir la llamada, o registrar en varias
    pasadas, no duplica nada — lo ya registrado responde `duplicado`;
  - es all-or-nothing: si alguna parte no cabe en su unidad (choque de
    disponibilidad en las fechas o capacidad publicada), no se crea NINGUNA;
  - las unidades las elige el operador y deben ser distintas entre sí y de una
    sola propiedad del tenant;
  - el evento del incidente queda `procesado` solo cuando TODAS las
    habitaciones del booking tienen su parte registrada; mientras falte alguna
    el grupo sigue visible con las habitaciones restantes;
  - un `cancel` posterior del booking completo cancela todas sus partes vivas
    (localizadas por el prefijo `bookingId#`); un booking cuyo id empiece igual
    (`BKG-1` vs `BKG-11`) nunca se cruza porque el prefijo es exacto.
- **El no-show libera la unidad.** Marcar `no_show` (hoy, `PATCH` del operador)
  devuelve la habitación al inventario vendible —todas sus noches— y el
  siguiente push la anuncia como disponible. El no-show no ocupa: es un hecho
  **de cobro**, no de inventario (una habitación que nadie usó es revendible).
  La regla la aplica el motor de disponibilidad (`lib/hospitality/availability.ts`
  vía `aportaProduccion`, `lib/hospitality/estados.ts`), la misma que usan el
  planning y el Booking Engine. Es reversible: volver a `confirmed` restaura el
  bloqueo y se vuelve a empujar. Detalle en `hospitality-booking-payments-plan.md` §0.
  - *Vía entrante:* el webhook también acepta `action: "no_show"` — el
    proveedor reporta que el huésped no se presentó y el motor marca el estado
    (idempotente: solo desde `pending`/`confirmed`/`checked_in`, nunca toca una
    ya operada) y **emite la penalización con el mismo emisor del operador**
    (regla 8: política de la propiedad, sin doble cargo de canal externo, y un
    fallo del emisor nunca revierte el estado). Si el proveedor no lo empuja,
    lo marca el operador con el `PATCH`. `Mark No Show` (tabla de endpoints más
    abajo) es saliente, nuestro hacia el proveedor.
- Los campos de huésped son **opcionales**: no rechazar ni fallar si faltan.
- `specialRequests` se guarda como **texto libre**, no se parsea a estructura.
- No inventar endpoints, campos, partners ni esquemas de auth.

## Base URL

```
https://live.aiosell.com/api/v2/cm
```

> **Atención:** el prefijo `/api/v2/cm` es obligatorio. El host a secas
> (`https://live.aiosell.com`) responde **404 de nginx** en todos los
> endpoints, no un error de la API. `CONNECTIVITY_BASE_URL` puede traer solo
> el host: `getConnectivityBaseUrl()` añade el prefijo si falta.
>
> El **hotel de sandbox** es `sandbox-pms` y el **partner de sandbox** es
> `sample-pms`. Los códigos que deben usarse como `hotelCode`, `roomCode` y
> `rateplanCode` son los que devuelve primero `property_details` (para el
> sandbox: rooms `executive` y `suite`, con rateplans `*-s-ep`, `*-d-ep`,
> `*-s-cp`, `*-d-cp`). Un partner deshabilitado responde
> `400 {"success":false,"message":"Partner is disabled!"}`.
>
> **El sandbox NO sirve como sonda de una cuenta de producción.** Con el par
> Basic y el ID de socio correctos, `property_details/sandbox-pms` responde a un
> partner de producción `403 {"success":false,"message":"Access Denied -
> sandbox-pms"}` (verificado el 2026-10-09), y no dice nada de la cuenta. Por eso
> el hotel de la sonda —la del botón «Probar», la de la Conectividad del hotel y
> la del health-check diario— se resuelve en este orden: `CONNECTIVITY_HEALTH_HOTEL`
> (entorno) → `configuracion.healthHotelCode` de la fila del proveedor →
> `hotelCode` de una propiedad **ya vinculada**
> (`ConnectivityMapping.externalPropertyId`, el mismo con el que se empuja
> inventario) → `sandbox-pms` solo como último recurso. `resolveProbeHotelCode`
> es la regla pura y `resolverHotelDeSonda` la completa con los vínculos.
> Guardia: `tests/hospitality-sonda-hotel-real.test.ts`.
>
> **Los dos 403 del proveedor no son lo mismo.** `403 {"success":false,
> "message":"partner desconocido"}` es un ID de socio que no es el suyo;
> `403 {"success":false,"message":"Access Denied - <hotelCode>"}` es un hotel que
> la cuenta no tiene asignado (el ID de socio es correcto).
> `lib/hospitality/conectividad-causa.ts` los diagnostica por separado, y ninguno
> de los dos se lee como «credenciales rechazadas».

## Antes del catálogo: la activación en la OTA (pata ①)

Este contrato documenta la pata **②** del triángulo (proveedor ↔ Volkern). La
pata **①** (OTA ↔ proveedor) la ejecuta **el hotel** en la extranet de cada
canal, y es una **precondición de este contrato**: `property_details` no devuelve
catálogo hasta que el proveedor esté habilitado en la OTA y haya mapeado sus
habitaciones. Sin catálogo no hay `hotelCode`, `roomCode` ni `rateplanCode` que
vincular (paso 5 del wizard).

- Booking.com y Expedia son **autoservicio** en su extranet; Airbnb es una
  **URL de autorización del proveedor**
  (`{baseUrl}/airbnb_authorize`, mismo prefijo v2); el resto de canales
  (Tiket, Ctrip, Agoda, Traveloka…) exigen **correo al account manager** del
  canal.
- El **mapeo habitación a habitación del canal lo crea el equipo del proveedor**
  (Booking pide enviarle el Hotel ID + el mapeo). Nuestros vínculos copian lo que
  acabe publicando el catálogo, no lo que la OTA llame a la habitación.
- **Booking.com**: borrar los planes de tarifa extra por defecto (NON REFUNDABLE,
  LONGSTAY…) antes de mapear, para que las tarifas del canal coincidan.
- `marknoshow` sigue limitado a booking.com y gommt: **Airbnb no está cubierto**,
  y su no-show queda en manos del `PATCH` del operador.

Procedimiento completo, canal por canal, en
[`hospitality-conexion-otas-activacion.md`](./hospitality-conexion-otas-activacion.md).

## Credenciales: quién es el `{pms}` de cada hotel (ID de socio por cliente)

El `{pms}` de las rutas (`/update/{pms}`, `/update-rates/{pms}`, `/data/{pms}`) y
el `?partnerId=` de `property_details` son el **ID de socio (partner id)** que el
proveedor emite al registrarse cada hotel. Por eso **lo registra cada cliente**:

- **Dónde**: dashboard del cliente → *Conectividad*
  (`/dashboard/hospitality/conectividad`), servido por
  `GET/PUT/POST /api/hospitality/conectividad` (capacidades `integraciones.ver`
y `integraciones.gestionar`). Se guarda cifrado en
  `hospitality_connectivity_config` (una fila por tenant, `tenantId` único).
- **El usuario y la contraseña NO son del hotel**: siguen siendo el par Basic de
  plataforma que administra Volkern en *Administración → Conectividad*.
- **Respaldo**: un hotel sin ID propio (o con el suyo desactivado) usa el de
  plataforma, que es el comportamiento anterior a existir esta columna.
- **El ID de plataforma es opcional**: el respaldo puede no existir (Volkern deja
  el campo vacío y todos los hoteles registran el suyo). En ese estado nada de
  plataforma se rompe: el webhook **entrante** autentica con el par Basic —el ID
  de socio no participa en una llamada entrante, el hotel sale del mapeo
  `hotelCode`/`roomCode` → propiedad— y la sonda de plataforma (health-check
  diario y botón «Probar» de *Administración → Conectividad*) lo informa como
  **no aplica** (`aplica: false`) en vez de marcar la capa en error: sin ID de
  socio de plataforma la prueba de plataforma no tiene a qué hotel sondear, y
  cada hotel comprueba el suyo desde su Conectividad.
- **Sin ID de socio no hay catálogo**: el proveedor responde 403 «partner
  desconocido» y el hotel no ve sus propiedades. La pantalla del cliente trae una
  comprobación (`POST {accion:'probar', hotelCode}`) para descubrirlo antes de
  vincular unidades, y el paso 4 del wizard de onboarding da por configurada la
  conectividad con el ID del cliente o, en su defecto, con el de plataforma.
- **Validación**: el ID pasa por el mismo preflight que el de plataforma (sin
  espacios, sin invisibles, sin comillas pegadas de un PDF) y, al leerlo, se
  vuelve a validar: un valor ilegible cae al de plataforma en vez de condenar al
  hotel a un 403 mudo.

## Endpoints (PMS → proveedor)

| Endpoint | Método | URL | Propósito |
| --- | --- | --- | --- |
| Property / Mapping Details | GET | `/property_details/{hotelCode}?partnerId={pms}` | Llamar PRIMERO: devuelve `hotel_id`, `room_id`, `rateplan_id` que se usan como `hotelCode`, `roomCode`, `rateplanCode`. |
| Inventory Push | POST | `/update/{pms}` | Disponibilidad por tipo de habitación para un rango (upsert). |
| Rate Push | POST | `/update-rates/{pms}` | Tarifas por (room, rateplan, fecha); los rangos se expanden a tarifas diarias. |
| Inventory Restrictions Push | POST | `/update/{pms}` | Restricciones a nivel de tipo de habitación (min stay, etc.). |
| Rate Restrictions Push | POST | `/update-rates/{pms}` | Restricciones por (room, rateplan). |
| Mark No Show | POST | `/marknoshow/{pms}` | Marcar no-show **en el canal** (solo booking.com y gommt). Saliente: no libera la unidad en el PMS por sí solo — eso lo hace marcar `no_show` aquí. |
| Fetch Inventory | POST | `/data/{pms}` | Consultar inventario. `type` en el body decide el dataset. **No implementado en el adapter.** |
| Fetch Rates | POST | `/data/{pms}` | Consultar tarifas (room, rateplan, date). **No implementado en el adapter.** |
| Fetch Reservations | POST | `/data/{pms}` | Consultar reservas (mismo payload que el webhook Book). `startDate`/`endDate` filtran por **fecha de reserva** (`bookedOn`), no por estancia — ver la nota de abajo. |
| Message Webhook | POST | `{nuestra_url}` | ENTRANTE: el proveedor nos entrega cada mensaje de huésped (o del hotel) de una conversación de OTA. **Implementado** en `/api/hospitality/webhook/messages`. Ver la nota de mensajería. |
| Message Reply | POST | `/message-reply/{pms}` | SALIENTE: respondemos en la conversación (mismo Basic que el resto). **Implementado** en `enviarMensajeCanal`. En booking.com el `booking_id` es obligatorio. |

> **Un 200 no siempre significa «aplicado»: mira `warnings`.** El proveedor puede
> contestar `200 {"success": true, "message": "Request Received Successfully",
> "warnings": ["INVALID_RATEPLAN_CODE : 2b"]}` — es decir, recibió la petición y
> **descartó** la tarifa. Medido en producción el **9 oct 2026** (hotel
> `75fdbbce2e`): el push de tarifas viajaba con `rateplanCode` igual al roomCode
> (`2b`, porque la unidad no tenía planes de tarifa configurados) y no llegaba al
> canal ni una tarifa, con el panel en verde. Desde ese día
> `advertenciasDeRespuesta()` (`lib/hospitality/connectivity.ts`) convierte
> cualquier advertencia en un push `ok: false` **conservando el HTTP real**: queda
> en `HospitalitySyncLog` como fallo con el texto de la advertencia y el proveedor
> pasa a estado `error`. El código de tarifa válido es el `rateplan_id` del
> catálogo (`property_details`), nunca el `room_id`.
>
> **Y la advertencia se lee POR UNIDAD, no por código.** `INVALID_ROOM_CODE` es el
> otro código medido (13 oct 2026, mismo hotel: `INVALID_ROOM_CODE : 2a · 1a · 1b`
> con la unidad `2b` aceptada — las tres habitaciones existen en el catálogo del
> proveedor, es el canal el que todavía no las tiene autorizadas). Como el
> operador no piensa en `room_id`s, `lib/hospitality/rechazo-canal.ts` (puro)
> atribuye cada descarte a la unidad que empuja ese `room_id` o ese
> `rateplanCode`, dice qué **sí** se envió y deja aparte los códigos que no son de
> ninguna unidad del envío; el error del `HospitalitySyncLog`, la respuesta de
> `POST /api/hospitality/sync` y los pasos 7-8 del asistente llevan ese nombre. La
> regla de fondo no cambia: **200 con `warnings` sigue siendo `ok: false`** — se
> perdió un dato—, pero ahora se sabe de qué unidad.
>
> **Y se atribuye contra lo que viajó en ESE push, no contra toda la propiedad.**
> Los cuatro pushes no llevan lo mismo: el de restricciones de tarifa solo incluye
> unidades con plan de tarifa con código (una unidad sin plan no tiene estancia
> mínima que anunciar), mientras el de tarifas sí empuja su tarifa base bajo el
> código vinculado. Medido en producción (13 oct 2026, mismo hotel): el push de
> restricciones de tarifa llevaba 2 de las 4 unidades y su mensaje decía «las
> otras 3 sí se enviaron», nombrando dos unidades que no iban en la petición —lo
> contrario de lo que había pasado—. Por eso `atribuirDescartes` recibe las
> unidades de `unidadesDelEnvio(unidades, envio)` y las ausentes como
> `unidadesFueraDelEnvio`, que las nombra con su motivo («no tiene vínculo con el
> proveedor», «no tiene plan de tarifa con código del proveedor»): un descarte
> solo puede nombrar códigos que iban en la petición, y una unidad que no viajó no
> es ni enviada ni fallida.

> **Lo que el proveedor cree de nuestro inventario, sin poder preguntárselo.**
> Solo pedimos reservas a `/data/{pms}`: los datasets de inventario y tarifas
> del contrato no están implementados. Así que la única descripción honesta del
> calendario que tiene el canal es **el último push de inventario que le envió
> Volkern** (los tramos quedan en `HospitalitySyncLog.requestPayload` con
> `tipo: 'inventory'`, y el proveedor hace UPSERT: el último rango que cubre una
> fecha la sobrescribe). Sobre eso compara la **guardia de noches sin
> justificar** (`lib/hospitality/inventario-divergencias.ts`, corre en la
> reconciliación diaria, §29): una noche con `available` menor que la
> disponibilidad interna está cerrada sin que nada la justifique —ventas
> perdidas— y una con `available` mayor es riesgo de sobreventa. Cuando
> `Fetch Inventory` esté implementado y verificado contra la cuenta real, su
> respuesta será la fuente preferida y el replay quedará como respaldo.

> **`startDate`/`endDate` son FECHAS DE RESERVA, no de estancia.** Medido contra
> el servicio real el **9 oct 2026** con una reserva de booking.com hecha el 8 oct
> para el 9-11 oct (hotel `75fdbbce2e`): `2026-10-08 → 2026-10-08` y
> `2026-10-08 → 2026-11-08` **la devuelven**; `2026-10-09 → 2026-10-09` y
> `2026-10-09 → 2026-11-08` devuelven `[]`. La consecuencia operativa es la que
> importa: un barrido que empieza en el día de hoy solo puede ver reservas hechas
> hoy —casi nunca ninguna— y deja fuera para siempre toda reserva cuyo push se
> perdió o fue rechazado. `lib/hospitality/ventana-reservas.ts` es la única
> fuente de la ventana (30 días atrás / 30 adelante por defecto) y la comparten
> el barrido diario y la re-verificación de una divergencia.
| Channel Multiplier | POST | `/channel_multiplier/{pms}` | Multiplicador de tarifas por canal (`1.2` = +20%). No implementado en V1. |

> **Mensajería del canal (el chat del huésped en la OTA).** El proveedor expone
> dos endpoints de mensajería que NO son de distribución y viven en su grupo
> «Messages»: el **webhook** con el que nos entrega cada mensaje de una
> conversación de OTA (`hotel_id`, `channel`, `booking_id`, `guest_details`,
> `conversation_id`, `message_id`, `attachments`, `message_type`, `time_sent`,
> `content`, `sender_id` y `sender_type` — `property` = el hotel) y la
> **respuesta** (`POST /message-reply/{pms}` con `channel`, `content`,
> `hotel_code`|`hotel_id` y `conversation_id`; **`booking_id` obligatorio si el
> canal es `booking.com`**). El hilo se identifica por `conversation_id` y las
> entregas repetidas por `message_id` (el propio contrato avisa de que el mismo
> mensaje puede llegar más de una vez). Lo implementado en Volkern —endpoint
> entrante, bandeja, respuesta y sus estados— queda documentado en
> `docs/hospitality-mensajes-canal.md`.
>
> Un mensaje de un `hotel_id` **sin mapping** no se puede entregar (404 con
> `Retry-After`) y **deja incidencia visible** en el panel de Conectividad, igual
> que una reserva sin mapping: una fila por (`hotelCode`, canal) con su código,
> su canal, su motivo y su **contador de intentos** —el proveedor reintenta el
> mismo mensaje cada pocos minutos, así que lo que informa es cuántas entregas
> se han quedado fuera, no una fila por reintento—. Se ve en la tarjeta
> «Mensajes sin hotel vinculado» y se consulta por
> `GET /api/admin/conectividad/mensajes-sin-mapping` (Superadmin). Cuando el
> código se vincula, la primera entrega con mapping cierra la incidencia sola. La
> incidencia no guarda el mensaje del huésped (PII): solo código, canal y motivo.
>
> **Lo que el proveedor NO expone: reseñas.** Su documentación no tiene ningún
> endpoint de reseñas ni de reputación (verificado el 9-oct-2026 sobre el
> catálogo completo de `apidocs.aiosell.com`: ni un `review` en el bundle, y el
> dataset de `/data/{pms}` solo admite `inventory`, `rates` y `reservation`).
> Las reseñas históricas entran por CSV (`lib/hospitality/resenas-import.ts`) y
> la petición de un endpoint de reseñas al proveedor está documentada en
> `docs/hospitality-email-proveedor-resenas.md`.

## Webhook de reservas (proveedor → PMS)

Un único endpoint POST interno recibe `book` / `modify` / `cancel` / `no_show`,
diferenciados por el campo `action`.

### Campos del payload (Book)

| Campo | Tipo | Requerido | Descripción |
| --- | --- | --- | --- |
| `action` | string | ✅ | `book` \| `modify` \| `cancel` \| `no_show` |
| `hotelCode` | string | ✅ | Identificador de propiedad compartido. |
| `channel` | string | ✅ | Canal/OTA de origen. |
| `bookingId` | string | ✅ | ID único de reserva del OTA. |
| `cmBookingId` | string \| null | | ID de itinerario / channel manager. |
| `bookedOn` | string (ISO 8601) | ✅ | Timestamp de creación. |
| `checkin` | string (YYYY-MM-DD) | ✅ | Fecha de llegada. |
| `checkout` | string (YYYY-MM-DD) | ✅ | Fecha de salida. |
| `segment` | string | ✅ | Categoría de reserva. |
| `specialRequests` | string \| null | | Texto libre del OTA. |
| `pah` | boolean | ✅ | Pay-at-hotel. `false` = prepago. |
| `amount.amountAfterTax` | number | ✅ | Total con impuestos. |
| `amount.amountBeforeTax` | number | ✅ | Subtotal. |
| `amount.tax` | number | ✅ | Impuestos. |
| `amount.currency` | string (ISO 4217) | ✅ | Moneda. |
| `amount.commission` | number \| null | | Comisión del OTA. |
| `amount.tcs` | number \| null | | Tax Collected at Source. |
| `amount.tds` | number \| null | | Tax Deducted at Source. |
| `guest.firstName` | string \| null | | Solo si el OTA lo comparte. |
| `guest.lastName` | string \| null | | Ídem. |
| `guest.email` | string \| null | | A menudo enmascarado. |
| `guest.phone` | string \| null | | A menudo enmascarado. |
| `guest.address.*` | string \| null | | Línea, ciudad, estado, país, código postal. |
| `rooms[].roomCode` | string | ✅ | Tipo de habitación. |
| `rooms[].rateplanCode` | string | ✅ | Plan de tarifa. |
| `rooms[].guestName` | string \| null | | Solo si el OTA lo comparte. |
| `rooms[].occupancy.adults` | integer | ✅ | Adultos. |
| `rooms[].occupancy.children` | integer | ✅ | Niños. |
| `rooms[].prices[].date` | string (YYYY-MM-DD) | ✅ | Fecha por noche. |
| `rooms[].prices[].sellRate` | number | ✅ | Tarifa por noche. |

### Ejemplo de payload (Book)

```json
{
  "action": "book",
  "hotelCode": "sandbox-pms",
  "channel": "Goibibo",
  "bookingId": "111222333",
  "cmBookingId": "AAABBBCCC",
  "bookedOn": "2022-12-08 15:25:35",
  "checkin": "2022-12-10",
  "checkout": "2022-12-12",
  "segment": "OTA",
  "specialRequests": "Airport Taxi Required",
  "pah": false,
  "amount": {
    "amountAfterTax": 1204,
    "amountBeforeTax": 1075,
    "tax": 129,
    "currency": "INR",
    "commission": 215,
    "tcs": 5.38,
    "tds": 1.08
  },
  "guest": {
    "firstName": "Akshay",
    "lastName": "Kumar",
    "email": "akshaykumar@gmail.com",
    "phone": "9988776655",
    "address": {
      "line1": "51",
      "city": "Bangalore",
      "state": "Karnataka",
      "country": "India",
      "zipCode": "560035"
    }
  },
  "rooms": [
    {
      "roomCode": "executive",
      "rateplanCode": "executive-s-ep",
      "guestName": "Akshay Kumar",
      "occupancy": { "adults": 1, "children": 0 },
      "prices": [
        { "date": "2022-12-10", "sellRate": 537.5 },
        { "date": "2022-12-11", "sellRate": 537.5 }
      ]
    }
  ]
}
```

### Resolución de propiedad y unidad

`hotelCode`, `rooms[0].roomCode` y `rooms[0].rateplanCode` se traducen a la
propiedad y la unidad internas con los vínculos de conectividad
(`connectivity_mappings` con `estado: activo`). El orden de decisión es:

1. **Propiedad** — mappings activos con `externalPropertyId = hotelCode`. Si no
   hay ninguno, no hay resolución: la reserva no se crea.
2. **Unidad** — gana el mapping cuyo `externalUnitCode` coincide con
   `rooms[0].roomCode`. La comparación ignora mayúsculas y espacios
   (`"  Executive "` ≡ `executive`). Si ningún mapping fija ese roomCode se
   aceptan los mappings que **no restringen unidad** (`externalUnitCode` vacío),
   es decir los vínculos a nivel de propiedad (habitaciones de unidad única o
   vínculos creados antes de registrar el roomCode).
3. **Tarifa** — `rooms[0].rateplanCode` desempata entre varios candidatos:
   primero el mapping que coincide en `externalRatePlanCode`, si no el que no
   restringe tarifa, y si no el más antiguo (orden estable por fecha de
   creación). Un rateplan **desconocido no bloquea** la reserva mientras el
   roomCode resuelva.

| Caso del payload | Resultado |
| --- | --- |
| `roomCode` con vínculo (con o sin rateplan) | Reserva en la unidad del vínculo. |
| Varios vínculos con el mismo `roomCode` | Gana el desempate por `rateplanCode`. |
| `rateplanCode` desconocido, `roomCode` con vínculo | Reserva en la unidad del roomCode. |
| `roomCode` sin vínculo, con vínculo a nivel de propiedad | Se usa ese vínculo (y su unidad, si la define). |
| `rooms` ausente o vacío | Se resuelve la propiedad y el vínculo a nivel de propiedad. |
| `roomCode` sin vínculo de unidad **ni** de propiedad | **Se rechaza**: ver abajo. |

**`roomCode` sin mapping (guardia).** El PMS no adivina la habitación ni crea
la reserva en otra unidad. Responde `ok: false` con el mensaje
`Sin mapping de unidad para hotelCode {hotelCode} y roomCode {roomCode} (rateplan {rateplanCode})`,
no crea reserva ni huésped, y deja el evento bruto con estado `sin_mapping`
para corregir el vínculo. La reconciliación periódica cuenta el mismo caso como
divergencia en lugar de importarlo a una unidad arbitraria.

**Resolución asistida.** Para no perder una reserva por un vínculo que faltaba,
la plataforma puede crearlo a partir del catálogo de `property_details`: el
`roomCode` del incidente debe existir en el catálogo y el destino se aplica solo
cuando es inequívoco. Se decide en este orden, y gana la primera regla que
identifique **una sola** unidad:

1. el **código** de la unidad coincide exactamente con el `roomCode`;
2. el **nombre** de la unidad coincide exactamente con el de la habitación;
3. la **ocupación** del catálogo (`min_occ`/`max_occ` frente a la capacidad de la
   unidad) deja una única unidad libre compatible;
4. los **huéspedes reales** de la reserva (`rooms[0].occupancy.adults` +
   `.children`) desempatan: una única unidad libre con esa **capacidad exacta**, o
   una única con capacidad para alojarlos (la más ajustada, y solo si no hay
   empate de capacidad);
5. solo queda **una unidad libre** compatible en la propiedad.

La ocupación solo decide cuando **descarta** alguna unidad libre: si todas las
libres encajan con el rango publicado, no aporta información y manda la regla de
siempre. Y si el rango publicado deja fuera a todas las libres, **no se vincula
ninguna** — una unidad de 8 huéspedes no es "lo más parecido" a una habitación de
2, es un error de configuración que el operador tiene que ver. Los candidatos de
la propuesta vienen marcados con su capacidad y con si admiten esa ocupación.

La ocupación real de la reserva es la segunda capa, y existe porque el rango del
**tipo** de habitación muchas veces no distingue: un tipo de 1-6 huéspedes admite
de todo, y una reserva de 2 no es lo mismo que el máximo del tipo. Los huéspedes
reales solo entran en juego cuando el rango **ya no decidió**, y con las mismas
garantías: solo eligen cuando descartan alguna candidata (o cuando una unidad
tiene la capacidad exacta y ninguna otra la comparte), y si ninguna unidad libre
puede alojarlos **no se vincula nada** (motivo `sin_capacidad_suficiente`, que
viaja al incidente). El rango publicado del tipo sigue mandando: una reserva de 1
huésped no rescata una unidad que el tipo rechaza. Un payload que no publica
`occupancy` (o que la publica a ceros) no aporta nada: no se inventa la
ocupación, y la decisión es exactamente la de antes. La unidad no publica
`capacidad` tampoco descarta nada — "no consta" no es "no cabe".

**Niños pequeños (bebés en cuna).** El payload solo dice cuántos niños vienen,
no cuántos años tienen, y una cuna no ocupa plaza. Cuando el canal publica las
edades (campos no documentados como `childrenAges` en `rooms[0].occupancy`, se
leen sin creérselo del todo), los menores de `HOSPITALITY_EDAD_NINO_UMBRAL` años
(por defecto **4**) no cuentan contra la capacidad de la unidad. Es conservador:
si el canal no publica edades, cada niño cuenta como huésped; y un umbral de `0`
devuelve la regla a "todos cuentan". Es una política de la plataforma, no un dato
del proveedor, por eso es configurable y por eso vive documentada aquí.

El total de huéspedes (`total`) y el motivo quedan en el `metadata` del vínculo
(`ocupacionReserva`) y en el log de sincronización, y la ocupación del grupo de
incidencias se lee del payload más reciente que la publique, para que el operador
sepa con cuántos huéspedes se decidió.

En cualquier otro caso se muestra la propuesta con sus candidatos y decide una
persona. El rateplan del vínculo es el que envió el canal si el catálogo lo
admite para esa habitación.

Ocurre en dos momentos:

1. **Al recibir la reserva.** Si el webhook no encuentra vínculo para la
   habitación, intenta crearlo antes de rechazar: cuando la coincidencia es
   inequívoca la reserva se registra en esa misma petición.
2. **A petición del operador**, desde el panel de incidencias ("Vincular
   automáticamente").

Cada vínculo automático guarda por qué se creó en su propio `metadata` (origen,
motivo, `bookingId` y canal) y deja una entrada en el log de sincronización con
`tipo: mapping_automatico`. Además, cuando lo crea el webhook —nadie lo pidió—
se avisa por notificación a los administradores del tenant, con el motivo y un
enlace al panel de incidencias de esa propiedad; en el wizard de puesta en
marcha esos vínculos aparecen marcados como "Vínculo automático" para poder
revisarlos. Un vínculo queda como revisado cuando alguien guarda los vínculos en
ese paso; mientras siga sin confirmarse, un recordatorio periódico (cada 3 días
como máximo, o antes si aparecen vínculos nuevos) vuelve a avisar en vez de
darse por hecho. El del webhook se puede desactivar con `HOSPITALITY_AUTO_MAPPING=off`
sin afectar al resto del flujo.

**Deshacer un vínculo automático.** Si la unidad elegida por el sistema no es la
correcta, el operador la deshace desde el propio paso 6 del wizard (botón
"Deshacer" junto al badge). El vínculo **no se borra**: se apaga
(`estado: inactivo`) y queda marcado en su `metadata` como deshecho por una
persona, con quién y cuándo. De ahí salen tres consecuencias:

- la unidad **vuelve a quedar libre** y la habitación sin vínculo, así que la
  resolución del webhook la trata como cualquier `roomCode` sin mapping;
- el sistema **no vuelve a crear ese vínculo solo** para esa habitación, ni
  siquiera al recibir otra reserva: se rechaza con motivo `rechazado_por_operador`
  y el incidente indica que se asigne a mano;
- si el operador vuelve a asignar la habitación a mano en el paso 6, el vínculo
  se reactiva (UPSERT por `provider + hotelCode + roomCode`) y la marca de
  rechazo desaparece: la decisión más reciente manda.

Deshacer **no toca las reservas ya registradas**: las que están en esa unidad
siguen ahí. Antes de confirmar, el panel lista las reservas vivas de la unidad
(`GET mapping/deshacer`, solo lectura) para que el operador sepa qué va a dejar
huérfano; al deshacer, el mismo listado vuelve en la respuesta con acción de
**reasignación**: cada reserva se mueve a otra unidad desde el propio diálogo
(validando disponibilidad), o se deja donde está si el operador prefiere. Nadie
mueve una reserva sin que una persona lo decida.

> El wizard de onboarding crea un vínculo por unidad usando `externalUnitCode =
> roomCode` y `externalRatePlanCode = rateplanCode` de `property_details`, que
> son exactamente los códigos que el proveedor devuelve luego en el webhook.

### Payloads de Modify y Cancel

- **Modify**: mismo shape que Book pero representa el **estado completo nuevo**.
  El PMS debe reemplazar el estado anterior, no mezcla parcialmente.
- **Cancel**: payload reducido que identifica la reserva (`hotelCode`, `bookingId`,
  `cmBookingId`, `action: "cancel"`) para localizarla y cancelarla.

### Respuesta de éxito del webhook (y qué esperar en cada caso)

Todo 200 comparte la misma forma: `success: true`, el `status` que dice qué
hizo el PMS con el evento, y el `reservationId` interno de la reserva tocada.
El proveedor NO debe reenviar un evento que respondió 200: la idempotencia por
`bookingId` hace que un reenvío responda `duplicado` — inofensivo, pero ruido.

| `status` | Cuándo ocurre | Cuerpo (200) | Qué debe hacer el proveedor |
| --- | --- | --- | --- |
| `creada` | `book` de un `bookingId` nuevo. | `{"success":true,"status":"creada","reservationId":"<id>","penalizacion":null}` | Nada. La reserva ya vive en el PMS. |
| `duplicado` | Mismo `bookingId` (mismo canal) ya registrado: el evento no vuelve a crear ni a modificar nada. | `{"success":true,"status":"duplicado","reservationId":"<id>","penalizacion":null}` | Nada. **No reintente**: el original ya está aplicado — tratarlo como éxito. |
| `actualizada` | `modify` aplicado (y `no_show`, ver su ciclo completo más abajo). | `{"success":true,"status":"actualizada","reservationId":"<id>","penalizacion":null}` | Nada. `modify` es estado completo nuevo: el siguiente cambio llega como modify entero, no como delta. |
| `cancelada` | `cancel` localizó la reserva y la dejó `cancelled`. | `{"success":true,"status":"cancelada","reservationId":"<id>","penalizacion":null}` | Nada. Reenviar el cancel responde `cancelada` de nuevo (idempotente). |
| `no_encontrada` | `cancel`/`no_show` de un `bookingId` que aquí no existe (típico: el `book` se perdió). **No es 200**: responde **404** con `Retry-After: 300`. | `{"success":false,"error":"Reserva no encontrada para cancelar"}` | Reintentar con backoff (5 min → 1 h) hasta 24 h; si el `book` sigue sin aparecer, escalar — el evento no puede aplicarse sin su reserva. |
| `error` | Fallo de negocio del payload: `sin_mapping` (roomCode sin vínculo, con su intento de resolución asistida), multi-habitación (el motor registra una reserva por booking). **No es 200**: responde **400**, sin reintento. | `{"success":false,"error":"Sin mapping de unidad para hotelCode … y roomCode … (rateplan …)"}` | Detener reintentos: no es transitorio. Corregir el vínculo (el operador ve el incidente en el panel) o partir el booking y reenviar. |

Ejemplos reales de un ciclo completo (`book` → reintento → `modify` →
`cancel`), tal como respondió el entorno desplegado durante el ensayo del
día H:

```json
// 1) book (bookingId nuevo)
{"success":true,"status":"creada","reservationId":"cmukx7ycp003lod01f9ze29dh","penalizacion":null}

// 2) el MISMO book repetido (idempotencia: el original ya estaba)
{"success":true,"status":"duplicado","reservationId":"cmukx7ycp003lod01f9ze29dh","penalizacion":null}

// 3) modify (estado completo nuevo; aquí la salida se movió 1 día)
{"success":true,"status":"actualizada","reservationId":"cmukx7ycp003lod01f9ze29dh","penalizacion":null}

// 4) cancel
{"success":true,"status":"cancelada","reservationId":"cmukx7ycp003lod01f9ze29dh","penalizacion":null}
```

En `no_show` el campo `penalizacion` deja de ser un marcador y trae
`{ emitida, importe, motivo }` — su semántica completa, con la tabla de
respuestas y reintentos, está en «Ciclo completo de un no_show entrante»
(más abajo). Fuera del 200, la política de reintentos viaja en el propio HTTP:
404 lleva `Retry-After: 300`, 503/500 llevan `Retry-After: 60`, y 400/401 no
llevan cabecera (no reintentar).

### Barrido de cancels perdidos (reconciliación diaria)

El webhook es la vía rápida, pero no es fiable al 100%: si el proveedor entrega
un `cancel` y el PMS responde error (o no responde), la reserva queda **activa en
el PMS y cancelada en el canal** — un hotel vendido dos veces. Contra eso existe
el barrido `lib/cron/hospitality-reconcile.ts`, programado a diario (04:15, con
`GET /api/cron/hospitality-reconcile` como disparador manual con
`Authorization: Bearer ${CRON_SECRET}`):

1. consulta al proveedor las reservas de los próximos 30 días por cada propiedad
   con conectividad activa (`fetchReservations`);
2. aplica los `cancel` explícitos que el webhook se perdió (y los book/modify
   divergentes, por el mismo camino idempotente del webhook);
3. **detecta cancels perdidos sin cancel explícito**: cada reserva interna activa
   (`pending`/`confirmed`/`checked_in`, rango vigente) que el proveedor ya no
   reporta queda registrada como **divergencia** en `HospitalitySyncLog`
   (tipo `reconciliacion`, con el recuento en `responseBody`).

Política conservadora: el cron **nunca cancela solo** (`cancelarAusentes` va
siempre en `false`); la divergencia es la señal y la cancelación, decisión de
una persona que mira fechas e importes antes de tocar una reserva. Los logs de
reconciliación alimentan el "último fetch" del panel de admin de conectividad y
quedan excluidos del "último push", que es de canales.

#### Aviso temprano en el panel: reservas vivas del canal que el ERP no tiene

El barrido anterior resuelve el problema, pero **una vez al día**: hasta que
corre, una reserva cuyo push se perdió está vendida en el canal y libre aquí —
la sobreventa se cocina en esa ventana. Para cerrarla, el panel de
`/admin/conectividad` pide en vivo `GET
/api/admin/conectividad/reservas-faltantes` (Superadmin, sin parámetros; 200
siempre, con el fallo del proveedor en `errores`) y lista las reservas vivas que
el proveedor reporta y el ERP no tiene, en la tarjeta «Reservas del canal que el
ERP no tiene».

La comprobación vive en `lib/hospitality/reservas-faltantes.ts` y **no escribe
nada**: no crea ni modifica reservas, no registra logs, no empuja al canal y no
toca el estado de la capa. No es un «dry-run» del barrido —sería un condicional
que una edición futura podría olvidar—, sino un módulo que solo importa
lecturas. Comparte con el barrido lo que decide qué es una reserva:
`ventanaFetchReservas` (fechas de RESERVA), `normalizePayload`,
`estanciaImportable` y `resolveMapping`, así que su número es el que el barrido
crearía si se lanzara ahora.

Límites, explícitos: una reserva que aquí **existe cancelada** mientras el canal
la sigue vendiendo no aparece (el barrido la reescribe como `modify` sin
revivirla: es otro problema); una reserva cuyo `roomCode` no tiene vínculo
activo se cuenta (`sinVinculo`) pero no se lista, porque traerla exige vincular
la unidad antes; se sondean como mucho 20 propiedades por comprobación y las que
quedan fuera se cuentan (`propiedadesNoSondeadas`); y el contador `faltantes` es
el número real aunque el listado vaya recortado a 50. La acción sigue siendo el
barrido a mano —el mismo botón «Ejecutar reconciliación» de la tarjeta de
arriba—: el aviso no abre una segunda vía de escritura.

#### Revisión de divergencias en el panel de admin

Cada divergencia se guarda **con su lista concreta de reservas** en
`responseBody.ausentes` del log de reconciliación (no solo el recuento): id de
reserva, booking, canal, fechas, unidad y nº de huéspedes. El panel de admin de
conectividad (`/admin/conectividad`) la muestra en la tarjeta "Divergencias de
Reconciliación" vía `GET /api/admin/conectividad/divergencias`, que agrupa por
reserva (aunque varios barridos la mencionen, indicando en cuántos apareció) y
anota el estado **actual** de la reserva en el PMS: una ya cancelada o cerrada
no se ofrece para acción.

Para cancelar una reserva revisada, `POST
/api/admin/conectividad/divergencias` con `{ reservationId, syncLogId }`:

1. verifica que el log todavía lista la reserva como ausente y que sigue activa
   en el PMS (409 en caso contrario);
2. **re-verifica contra el proveedor** haciendo un fetch del rango de la
   reserva: si vuelve a aparecer reportada, la divergencia era ruido
   transitorio del fetch y **no se cancela nada** — se pide re-ejecutar la
   reconciliación. Un cancel explícito en esa respuesta no cuenta como
   reaparición. Si el fetch falla, la revisión humana ya hecha manda y se
   cancela (un error puntual del proveedor no debe dejar la unidad vendida dos
   veces);
3. cancela con `processCancel` usando el tenant del log (nunca un tenant del
   cliente), deja traza en el audit log y notifica al desarrollador
   (acción sensible).

La cancelación vía panel es siempre manual e individual: no existe botón de
"cancelar todas" ni automatización sobre este flujo.

#### Diagnóstico de la causa en el panel (`/admin/conectividad`)

El badge de estado nombra la **causa del último fallo de la capa** — no solo
«error» — derivada del último `HospitalitySyncLog` fallido de conectividad
(pushes de inventario/tarifas y reconciliación; los tipos de otras superficies
que comparten la tabla se excluyen):

| Causa | Se deriva de | Qué hacer |
|---|---|---|
| **Credenciales rechazadas** | HTTP 401/403 del servicio | Revisar o rotar credenciales en el panel; confirmar con el proveedor que no las haya revocado |
| **Sin respuesta del servicio** | HTTP 5xx, o sin código HTTP con indicio de red/timeout (`timeout`, `ECONNRESET`, `socket hang up`…) | Reintentar más tarde; si persiste, avisar al proveedor |
| **Error** | Otro caso (4xx de datos, fallo del proveedor sin código…) | Revisar el detalle en el historial de sincronización |

La regla vive en el módulo puro `lib/hospitality/conectividad-causa.ts`
(`causaDeFalloConectividad`) y produce el diagnóstico en los dos sitios que lo
muestran: el badge global (alimentado por `ultimoFallo` en
`getConnectivityPublic`) y la columna de errores de la tabla por propiedad
(`causaUltimoError` de `GET /api/admin/conectividad/propiedades`). Si la
consulta de diagnóstico falla, degrada a null sin romper el estado del panel.
El diagnóstico usa solo campos acotados (`httpStatus`, `errorMensaje`,
`fechaCreacion`) — la capa de secretos no cambia: `getConnectivityPublic`
sigue devolviendo marcadores de presencia, nunca valores.

Los cuerpos de error del proveedor también pasan por saneo: el módulo puro
`lib/hospitality/conectividad-secreto.ts` (`sanitizarRespuestaExterna`)
redacta cualquier valor bajo claves sensibles (`authorization`, `token`,
`api_key`, `password`, `cookie`…), oculta credenciales `Basic`/`Bearer`
incrustadas en strings y acota cadenas (4000) y profundidad (8). Se aplica en
la fuente — `readBody` (pushes, `fetchReservations`) y la sonda de
`testConnectivityConnection` — de modo que el diálogo de prueba, el
historial de sync-logs, el `responseBody` y el onboarding reciben cuerpos ya
redactados; el diálogo del panel re-aplica el saneo al renderizar (defensa
en profundidad) por si un cuerpo viejo llegara sin redactar.

Nota: el verde no garantiza credenciales válidas — el estado solo cambia cuando
fluye tráfico o hay una verificación activa. Para esa verificación hay dos
caminos: el botón «Probar» (bajo demanda, llama a `property_details`) y el
**health-check diario** (cron `Hospitality Conectividad Health Check`, 05:00),
que usa la MISMA sonda con el hotel sandbox, mueve el estado con las mismas
reglas y deja la marca `ultimaVerificacion` que muestra el panel («Última
verificación: hace …»). Disparo manual: `GET
/api/cron/hospitality-connectivity-health` con `CRON_SECRET` (respuesta 200
siempre, con `ok` en el body — un fallo de la capa es un resultado del sondeo,
no un error del endpoint). Cada sondeo queda auditado en `AuditLog` (acción
`conectividad_health_check`, `tenantId` null: la fila es global) y jamás en
`HospitalitySyncLog` — el diagnóstico del badge filtra por tipos de tráfico, y
un fallo del propio sondeo no puede aparecer como «Credenciales rechazadas».
Sin configuración, el health-check es un no-op razonado: no llama a nada.

### Reenvío desde el panel de incidencias según la acción

El reenvío de un evento guardado en `sin_mapping` respeta la `action` que trae el
evento, no asume que todo es un `book`:

- **book / modify**: exigen que la habitación tenga vínculo activo (la misma
  guardia del webhook), porque pueden **crear** la reserva. Un `modify` de una
  reserva que nunca llegó equivale a un `book`, y por eso no se exceptúa.
- **cancel**: se aplica aunque la habitación siga sin vínculo: cancelar no crea
  nada, así que la reserva se localiza por `bookingId` + canal **dentro del
  tenant del operador** y se pasa a `cancelled`. Si la reserva no existe, se
  reporta el error sin tocar nada.

El listado de incidencias acompaña la regla: un grupo de `cancel` con la reserva
ya registrada y viva ofrece el reenvío aunque la unidad no tenga mapping (y no
cuenta como "pendiente de vincular", porque no se puede vincular un cancel); si
la reserva ya está cancelada el grupo se da por resuelto; y si la reserva nunca
llegó, el grupo se queda a la vista sin ofrecer reenvío — registrar primero el
`book` con el vínculo correcto es decisión del operador, no un efecto lateral.

### Visibilidad de los no-shows reportados por el canal

El mismo panel tiene un filtro **No-shows** junto al de vínculos: lista los
`action: "no_show"` que el webhook entrante procesó (una fila por reserva; los
reintentos del canal no duplican), con referencia, unidad, huésped, estancia,
cuándo se reportó y **el importe emitido de cada penalización** — y si ya está
facturada por el ERP. Un no-show sin cargo se muestra como tal: pasó por la
política de la propiedad (por ejemplo «ninguna») o el canal externo cobra el
suyo. Es lectura del mismo `HospitalityWebhookEvent` ya auditado; no añade
estados ni módulos nuevos.

### Ciclo completo de un no_show entrante: respuestas y reintentos

Lo que responde `POST /api/hospitality/webhook/reservations` a un
`action: "no_show"`, y qué debe hacer el proveedor en cada caso:

| HTTP | Body | Cuándo | Qué debe hacer el proveedor |
|------|------|--------|------------------------------|
| **200** | `{ success: true, status: "actualizada", reservationId, penalizacion }` | La reserva existía y estaba viva (`pending`/`confirmed`/`checked_in`): queda `no_show`. `penalizacion` trae `{ emitida, importe, motivo }` — `emitida: true` con el importe del cargo, o `emitida: false` con el motivo (`canal_del_proveedor`, `politica_ninguna`, `sin_importe`…). | Nada. No reenviar el evento. |
| **200** | `{ success: true, status: "actualizada", reservationId, penalizacion: null }` | La reserva ya estaba `no_show` (o `checked_out`/`cancelled`): **idempotente**, no se toca ni re-emite cargo. | Nada. El reintento nunca duplica: el estado manda. |
| **404** | `{ success: false, error: "Reserva no encontrada para marcar no_show" }` | El `bookingId` no existe (o nunca llegó un `book`). | Reintentar con **backoff** (p. ej. 1 min → 5 min → 1 h) hasta **24 h**: si el `book` original se perdió o llegó tarde, puede estar aún en camino. Si sigue 404, escalar al operador — un `no_show` sin reserva aquí es señal de que falta el `book`, no de que falte el no-show. **No** reenviar el `no_show` como `book`: el motor no lo creará. |
| **401** | `{ success: false, error: "No autorizado", diagnostico }` | Credenciales Basic incorrectas **o** cabecera inservible. `diagnostico.motivo` dice cuál de las dos sin ambigüedad (`sin_cabecera`, `esquema_no_basic`, `cabecera_malformada`, `encoding_no_utf8`, `sin_separador`, `credenciales_no_coinciden`). | Detener reintentos: reintroducir no cambia nada. Revisar credenciales. El diagnóstico ya separa lo que arregla el emisor (esquema, base64) de lo que es el par. |
| **400** | `{ success: false, error }` | Payload inválido (falta `hotelCode`/`bookingId`/`channel`/`rooms`, acción desconocida, multi-habitación). | Detener reintentos: es un defecto del payload, no transitorio. Corregir y enviar de nuevo solo si se corrige el payload. |
| **503** | `{ success: false, error: "Conectividad no configurada" }` | El receptor aún no tiene credenciales cargadas. | Reintentar con backoff: es transitorio del lado del receptor. |
| **500** | `{ success: false, error: "Error interno" }` | Fallo no esperado del receptor. | Reintentar con backoff; el evento queda auditado aunque el reintento duplique nada (todo el ciclo es idempotente). |

**No existe 409 en este ciclo, a propósito.** Un `no_show` nunca choca con el
estado de la reserva: si ya estaba marcada responde 200 idempotente y si no
eviste, se marca. La guardia de disponibilidad rechaza `book`/`modify` con
409 — **si el canal la recibe debe corregir su inventario, no reintentar el
mismo evento** (reintroducir reproduciría el rechazo). Un `cancel` de una
reserva inexistente también responde 404, con el mismo tratamiento de
reintento limitado que el `no_show`.

La penalización viaja en la respuesta 200 pero **no es acuse de cobro**: la
cobra el hotel con su propia política (primera noche por defecto), la factura
por su ERP y puede tardar. Si el canal necesita conciliarla, es el flujo de
`Mark No Show`/reportes el que la publica — nunca un reintento del webhook.

**La política viaja también en el HTTP.** Las respuestas reintentables llevan
la cabecera `Retry-After` (segundos, el mínimo de espera antes del primer
reintento): **300** en un 404 y **60** en un 503 o un 500. El backoff sigue
escalando a partir de ese mínimo (en el 404: 5 min → 1 h… hasta el límite de
24 h). Las respuestas **no** reintentables (200, 401, 400) no la llevan: su
ausencia es parte del contrato. Guardia:
`tests/hospitality-webhook-reservations-route.test.ts`.

### Un 401 que se explica solo (diagnóstico sin secretos)

**Por qué existe.** El 25 sep 2026 el emisor del proveedor recibió
`{"success":false,"error":"No autorizado"}` tres veces (16:16 BDT, hotel
`sandbox-pms`, partner `sample-pms`) y no había forma de saber desde ningún lado
*qué* fallaba: ese body no distingue «no manda la cabecera» de «manda otro
esquema», «el base64 viene roto» o «el par es otro». La comprobación de nuestro
lado, con el par guardado, dio el mismo día: `property_details` del proveedor
**200** y nuestro propio webhook **400 `Payload inválido`** — es decir, la
credencial guardada es válida en las dos direcciones y lo que llega **no es ese
par**. Sin diagnóstico, esa conclusión exige descifrar la fila a mano.

**Qué lleva ahora el 401.** Además de `error`, un objeto `diagnostico`:

| Campo | Cuándo | Qué es |
|---|---|---|
| `motivo` | siempre | `sin_cabecera`, `esquema_no_basic`, `cabecera_malformada`, `encoding_no_utf8`, `sin_separador` o `credenciales_no_coinciden`. |
| `esquema` | siempre | El nombre del esquema recibido, en minúsculas (`basic`, `bearer`…) o `null` si no había cabecera. |
| `usuarioLen`, `passwordLen` | par legible | Longitud de lo recibido. Compararlo con la propia configuración resuelve el caso casi siempre. |
| `usuarioHuella`, `huella` | par legible | SHA-256 **truncado a 12 hex** del usuario recibido y de `usuario:contraseña` tal como llegaron. |

Nunca viaja el valor recibido ni nada del par guardado (misma disciplina que
`lib/hospitality/conectividad-secreto.ts`). La huella es **comparable**: el
emisor hashea su par con la misma receta (`sha256(usuario + ":" + contraseña)`,
12 primeros hex) y la coteja — si coincide, su configuración llegó intacta y el
par guardado es otro; si no coincide, algo alteró la cabecera por el camino
(proxy, codificación, recorte). El mismo objeto queda en el log del servidor
como `[Hospitality] Webhook de reservas rechazado (401): {…}` y se **persiste**
en la fila del proveedor (`configuracion.ultimoRechazoWebhook`, con su marca
horaria): `/admin/conectividad` lo muestra en la tarjeta «Webhook de Reservas»
— motivo, esquema, longitudes, huellas y hora — sin depender de los logs del
servicio. El último evento de autenticación correcta no borra el registro: se
queda como historial del último rechazo.

**Esquema Basic, sin caja fija.** El nombre del esquema es insensible a
mayúsculas y admite espacios de más (RFC 7235): un emisor que mande `basic …`
autentica igual, y eso deja de disfrazarse de «credenciales malas».

**Cómo se coteja el par guardado sin exponerlo.** El par vive cifrado en la
fila global; para compararlo con el del proveedor sin imprimirlo, la sonda del
VPS descifra dentro del contenedor y publica solo huellas y longitudes.
Guardia de todo esto: `tests/hospitality-webhook-reservations-route.test.ts`
(persistencia del rechazo incluida) y `tests/hospitality-conectividad-rechazo.test.ts`
(normalización, etiquetas y exposición pública sin secretos).

> **Para el equipo que implementa el emisor del proveedor** existe una guía de
> integración con esta tabla en formato práctico (cola, backoff, checklist):
> [`hospitality-webhook-emisor-guia.md`](./hospitality-webhook-emisor-guia.md).

## Guardrails antes de enviar código a producción

> **Cómo ejecutar este checklist contra el PMS real:** el procedimiento paso a
> paso con etapas, responsable y verificación (acuerdo, alta del proveedor,
> ensayo controlado, corte a producción y rollback) vive en
> [`hospitality-go-live-pms-guia.md`](./hospitality-go-live-pms-guia.md).

- [ ] Todas las URLs de los endpoints coinciden con la tabla byte a byte.
- [ ] Slug del PMS sustituido en `/update/{pms}`, `/update-rates/{pms}`, `/data/{pms}`.
- [ ] Fechas `YYYY-MM-DD`, timestamps `YYYY-MM-DD HH:MM:SS`.
- [ ] Campos de restricción opcionales enviados como `null`, no omitidos.
- [ ] `Content-Type: application/json` en cada petición.
- [ ] `success` de la respuesta verificado; `message` expuesto en fallos.
- [ ] Todo cuerpo externo mostrado o persistido pasa por
      `sanitizarRespuestaExterna` (redacción de `Authorization`/API keys
      reflejadas por el proveedor, cadenas y profundidad acotadas).
      La redacción ocurre en la fuente (`readBody` y la sonda de
      `connectivity.ts`), con segunda capa en el diálogo del panel.
- [ ] Webhook idempotente por `bookingId`.
- [ ] `roomCode` y `rateplanCode` del payload son los de `property_details`, y
      cada uno tiene su vínculo activo (la unidad se resuelve por `roomCode`).
- [ ] Un vínculo deshecho por un operador no se recrea solo y deja la unidad libre.
- [ ] La capacidad de cada unidad cae dentro del `min_occ`/`max_occ` de la
      habitación que representa (si el catálogo los publica).
- [ ] `modify` tratado como reemplazo completo, no patch.
- [ ] Campos de huésped opcionales: sin crash ni rechazo si faltan.
- [ ] `specialRequests` como texto libre.
- [ ] Sin campos, partners ni esquemas de auth inventados.