# Conectividad de Hospitality en NOBEDS — decisión, contrato medido y plan

> Estado: **decisión tomada** (22 oct 2026). F1 de lectura **implementada** el
> 26-oct-2026 (§10); F0 —contrato por escrito— **sigue abierto**.
> Sustituye a Aiosell como proveedor principal de distribución y aporta lo que
> Aiosell no daba: chat con el huésped, reseñas, contabilidad, tareas y salud
> del canal.
>
> **Seguimiento del correo (26-oct-2026):** enviado, sin respuesta, y
> **reenviado** ese día. El cuerpo está en
> [`hospitality-nobeds-email-arranque.md`](./hospitality-nobeds-email-arranque.md).
> F0 no se cierra hasta que contesten por escrito las bloqueantes de §8; el
> recordatorio de los 5 días hábiles corre desde el reenvío.
>
> **Respuesta del 27-oct-2026:** llegó un resumen de **capacidades de producto**.
> No contesta ninguna de las bloqueantes de §8 —ni el modelo de autenticación, ni
> la atomicidad del bulk, ni la firma del webhook—, pero **sí corrige una
> afirmación nuestra** sobre webhooks. Triage en §4.9. **F0 sigue abierto.**
>
> Todo lo que aquí se afirma del API de NOBEDS está **medido** contra
> `https://api.nobeds.com` con el token público de demostración (`api_token`,
> solo lectura) el 22-oct-2026, o leído en su spec real
> (`/swagger/v2/swagger.json`, 52 operaciones y 24 esquemas). El
> `https://nobeds.com/api/openapi.json` que circula **no es la API**: tiene 16
> operaciones, ningún esquema y ni siquiera menciona el endpoint de bulk.
>
> Aparte del API se leyó su **centro de ayuda público** (`nobeds.com/es/ayuda`,
> ~90 artículos) el 22-oct-2026. Es documentación de **producto**, no de
> integración: describe lo que hace su interfaz. Se usa para cerrar supuestos
> que el swagger calla y, sobre todo, para **destapar preguntas nuevas** que ni
> el swagger ni la portada insinuaban (§4.6). Nada de ello está verificado por
> nosotros en el cable.

## 1. Por qué se cambia

Motivos comerciales y operativos, no técnicos:

- **Coste** de Aiosell inasumible para el acuerdo que se buscaba.
- **Falta de soporte**: pendientes abiertos que nunca se cerraron.
- **Overbooking real** con el primer cliente, con coste económico.
- NOBEDS aguanta hasta 1.000 propiedades, que es el techo que se quiere tener.

Consecuencia: la comparación deja de ser «qué API es más cómoda» y pasa a ser
«cómo sustituimos lo que funcionaba sin repetir el overbooking». Lo que sigue
está escrito con ese objetivo.

## 2. Regla de oro: un solo escritor por habitación

Con Aiosell éramos el **único** dueño del calendario: calculábamos disponibilidad,
la empujábamos y el canal la publicaba. NOBEDS es **PMS + channel manager**, así
que tiene su propio calendario y recibe reservas de OTA en tiempo real.

Dos escritores sobre la misma habitación es exactamente la clase de fallo que ya
costó dinero: entre nuestro push y su reserva, una noche vendida vuelve a estar
abierta.

**Decisión: NOBEDS manda en disponibilidad y precio de OTA.**

| Escribimos | No escribimos nunca |
| --- | --- |
| Reservas directas (`POST /api/Bookings`) con nuestro `total` | Un recuento de disponibilidad calculado por nosotros |
| Cierres y bloqueos (`set_restrictions`: `closed`, `coa`, `cod`) | Precio por noche de las OTAs, salvo petición explícita del hotel |
| `quantity: 0` cuando una unidad sale de servicio | Recuentos «de cortesía» o de reconciliación |

Lo que sí hacemos constantemente es **leer**: su disponibilidad es la fuente para
cotizar en nuestro motor, y sus reservas son la fuente para nuestra operación.

Un matiz que el centro de ayuda obliga a poner por escrito: NOBEDS también vende
por su cuenta, con un motor de reservas directas propio e incrustable en la web
del hotel (`nobeds.app/DirectForm/Index/{hotel_id}`, §4.6). Si ese motor queda
activo hay un **segundo camino de venta directa** que no pasa por Volkern: la
reserva existiría en su PMS y no en nuestra operación. O se desactiva por hotel,
o aceptamos que su motor es el de venta directa y el nuestro deja de serlo. Es
una decisión comercial, y por eso va como pregunta 30 del correo.

## 3. Qué sobrevive y qué se colapsa

- **Planes de tarifa (4 por habitación hoy: `2b-s-ep`, `2b-d-ep`, `2b-t-ep`,
  `2b-q-ep`)**: sobreviven en la **venta directa**, porque el modelo de reserva
  de NOBEDS acepta `price` y `total` libres y el precio lo calcula nuestro motor.
  En las OTAs quedarán como **un precio por habitación y noche**. Hay que
  decidir qué plan lo alimenta (propuesta: el más barato vendible de esa noche,
  para no quedar fuera de comparativa).
- **Promos, extras, fianza, estacionalidad, fin de semana**: intactos en la venta
  directa. Nunca viajan al canal.
- **Webhooks**: no desaparecen, pero **tampoco son un camino propio**. Existen
  como función de producto: se registran a mano en su extranet (Configuración →
  Desarrolladores → WebHook) y emiten `booking.created` / `booking.updated`. Lo
  medido sigue en pie: `/api/Webhooks` responde **404**, no está entre las 52
  operaciones y no es tool MCP, así que **no se dan de alta por API ni por
  propiedad desde nuestro producto**, y la documentación pública no fija la
  carga ni la firma (§4.9). Consecuencia: la ingesta sigue siendo **sondeo con
  diferencial**, y el webhook, cuando el hotel lo configure, es un acelerador que
  **relee por API antes de aplicar**.
- **Mensajes**: mejora. `send_message` + `list_messages` (y `list_messages` en
  MCP) dan chat por reserva. Nuestro modelo de hilos usa
  `channel` + `conversation_id`; el suyo es mensaje/respuesta por `order`. Eso se
  reescribe, no se reutiliza.
- **Reseñas**: mejora clara. `GET /api/reviews` (medido: `score`, `staff`,
  `clean`, `channel`, texto positivo/negativo). Hoy importamos CSV justo porque
  Aiosell no las expone ([resenas-import.ts](../lib/hospitality/resenas-import.ts)).
- **Contabilidad, tareas, iCal, dashboard**: aparecen como fuentes nuevas
  (`GET /api/Accounting`, `/Tasks`, `/iCal`, y `get_dashboard_stats` en MCP).

## 4. Contrato real (lo que hay, no lo que prometen)

### 4.1 Autenticación

Su spec (`/swagger/v2/swagger.json`) declara **tres formas** de presentar el mismo
`api_token`, que es **uno por hotel**:

| Forma | Cómo | Estado |
| --- | --- | --- |
| **Cabecera** (recomendada) | `Authorization: Bearer <token>`, `X-Api-Key` o `NOBEDS-API-TOKEN` | **La que usamos.** Medida el 27-oct-2026: 200 con el mismo cuerpo que la ruta |
| Ruta | `/api/{Recurso}/{api_token}` | *Legacy / backward-compatible*. Sigue respondiendo; es la vuelta atrás (`NOBEDS_AUTH=ruta`) |
| Query | `?api_token=<token>` | No se usa: misma fuga que la ruta, y encima queda en el `Referer` |

Lo dice su propia descripción: *«passing credentials in headers is recommended to
prevent private keys from appearing in URLs, web server access logs, and browser
history»*. Implica:

- Un token cifrado por propiedad, no un `partnerId` por tenant. El modelo actual
  (`HospitalityConnectivityConfig.partnerIdEnc`, uno por tenant) no sirve para
  multi-propiedad.
- **La URL ya no lleva el secreto.** Con cabecera, un log de Cloudflare o un
  `traceId` de `application/problem+json` no exponen nada; en modo ruta vuelve el
  riesgo y el saneado del cliente pasa a ser obligatorio.
- **Sin token no hay error: hay demo.** Medido el 27-oct-2026: `GET /api/Status`
  **sin credencial responde 200** con el hotel de demostración. Por eso el cliente
  **se niega a construirse sin token** —una credencial vacía no falla, devuelve
  otro hotel— y por eso tampoco se acepta un token en blanco al guardar. Su spec
  añade que en la cuenta demo `UPDATE`/`DELETE` están *strictly forbidden*, que es
  el origen de los 500 HTML de §4.4.1.

### 4.2 Escritura de disponibilidad

- `POST /api/Availability/bulk/{token}`: **array** de
  `{room_id, date, price, quantity, min_stay, max_stay, closed, coa, cod, mah,...}`.
  Devuelve **resultado por ítem** `{rid, room_id, date, action}`.
- `POST /api/Availability/{token}` **no** acepta array. El 400 «The item field
  is required» se midió el 22-oct por la mañana y **no se reproduce** por la
  tarde: hoy toda forma de cuerpo devuelve 500 HTML (§4.4.1). Queda como indicio
  de que el cuerpo va envuelto, no como hecho. Sin bulk serían 540 peticiones
  para 6 habitaciones × 90 días.
- Los `action` por ítem no traen campo de error: un descarte silencioso solo se
  detecta **diffeando petición contra respuesta**.

### 4.3 Restricciones

Mapeo contra nuestro `RestrictionFields` (7 de 10):

| Nuestro campo | NOBEDS |
| --- | --- |
| `stopSell` | `closed` |
| `minimumStay` | `min_stay` |
| `maximumStay` | `max_stay` |
| `closeOnArrival` | `closed_to_arrival` (`coa`) |
| `closeOnDeparture` | `closed_to_departure` (`cod`) |
| `maximumAdvanceReservation` | `min_advanced` |
| — (informativo) | `advance_notice_hours` |
| `exactStayArrival` | sin equivalente |
| `minimumStayArrival` | sin equivalente (posible `one`..`ten`, sin confirmar) |
| `maximumStayArrival` | sin equivalente |

Medido con `get_restrictions(room_id, from_date, to_date)`, que devuelve el
modelo canónico (`available_quantity`, `price`, `min_stay`, `max_stay`,
`min_advanced`, `closed`, `closed_to_arrival`, `closed_to_departure`). **Esto
permite algo que hoy no tenemos**: comparar contra el estado real del canal, no
solo contra lo que registramos que empujamos
([inventario-divergencias.ts](../lib/hospitality/inventario-divergencias.ts)
compara intención, no realidad).

### 4.4 Reservas

`GET /api/Bookings/{token}?fromdate&todate` — **más rico** que el documento
público:

`order_id`, `room_id`, `referral` (canal), `referral_order_id`, `checkin`,
`checkout`, `name`, `email`, `phone`, `country`, `guests`, `childrens`,
`infants`, `nights`, `price`, `total`, `taxes`, `prepay`, `comission`,
`balance`, `status`, `canceled`, `invoice`, `coupon`, `created`, `updated`,
`comment`.

Dos hechos que condicionan el diseño:

1. **El filtro de fechas es la fecha de CHECK-IN**, no la de reserva. Medido con
   la reserva `2944292` (creada 2026-02-06, check-in 2026-02-18): aparece en
   `2026-02-15..2026-02-20` y en `2026-02-18..2026-02-18`, y **no** aparece en
   `2026-02-01..2026-02-10`. Es la semántica **contraria** a la del proveedor
   actual ([ventana-reservas.ts](../lib/hospitality/ventana-reservas.ts), que
   filtra por `bookedOn` y mira 730 días atrás) → ese módulo **no se reutiliza**.
2. **`status` es texto libre**: en el hotel demo, 14 valores distintos, incluidos
   `Approved` (118) y `approved` (2), `New`, `Cancelled`, `Checked-In`,
   `PaidOTA`, `Debtor`, `Prepaid`. Hay que normalizar sin distinguir mayúsculas y
   mapear contra nuestro `estado` (`pending|confirmed|cancelled|checked_in|
   checked_out|no_show`). Su centro de ayuda publica **16 estados con
   significado** (§4.6), y no todos son estado de reserva: hay estados de cobro
   (`Paid`, `PaidBank`, `PaidCC`, `Prepaid`, `Debtor`) y de operación (`Cleaned`,
   `CheckIn`, `CheckOut`) que se ponen a mano. Consecuencia: `estado` no se
   deriva solo de `status` — se clasifica en familias y jamás se cierra una
   noche porque alguien marcó «pagada».

### 4.4.1 Lo que se midió el 22-oct por la tarde (segunda pasada)

Pruebas **de solo lectura** con el token público `api_token` sobre el hotel demo,
más escrituras de sondeo que no pueden alterar nada porque no entran:

| Hecho medido | Dato |
| --- | --- |
| Reservas canceladas | **Siguen en la lista**, con `status: Cancelled` y `canceled: 2026-10-11T06:36:26`. No hay que inferir cancelación por desaparición. |
| `status` real (305 reservas) | `New` 145, `Approved` 118, `Checked-In` 10, `Checked-Out` 6, `Completed` 6, `Paid` 5, **`Registered` 5**, `approved` 2, **`PaidOTA` 2**, `Debtor` 2, `PaidBank` 1, `PaidCC` 1, `Prepaid` 1, `Cancelled` 1. `Registered` y `PaidOTA` **no están en los 16 documentados** (§4.6). |
| `referral` | `Direct`, `Nobeds.app` (48), `Direct Engine`, `Direct step`, `One page`, `Manual`, `billuu`, `Appagee`, además de `Booking`, `Airbnb`, `Agoda.com`, `Expedia`. Su motor propio se identifica: **`Nobeds.app`**. |
| Catálogo | `GET /api/Status` y `GET /api/Rentals` devuelven **los mismos 5 rentals activos**; **58 de 305 reservas** apuntan a `room_id` que **no existen en ningún catálogo** (18 `room_id` distintos). |
| `Rentals` además trae | `guests`, `children`, `stars`, `type`/`subtype`, `currencycode`, `checkin_time`, `policy`, `images` y **los ids por canal**: `booking_room_id`, `booking_rate_id`, `airbnb_listing_id`, `agoda_*`, `expedia_*`, `hostelworld_*`, `trip_*`. Es el mapeo OTA, legible. |
| `Logs` | 200/200 entradas son `demo :)` con `url: /api/demo`. **No sirve como prueba de escritura.** |
| Auditoría real | El campo `comment` de la fila de disponibilidad lleva el histórico: `"Availability modal SET quantity: 1\n2026-05-19 10:41:09-Owner => ..."`. Esa es la superficie de verificación de F2. |
| Disponibilidad demo | `quantity: 1` en las 30 noches consultadas, `price` constante. Nada de `quantity > 1` en este hotel. |
| Contrato de errores | Token inválido → **404 JSON** (no 401). Parámetro inválido → 400 JSON con `errors`. `room_id` inexistente → **200 `[]`**. Toda escritura → **500 HTML** (su spec lo explica: en la cuenta demo `UPDATE`/`DELETE` están *strictly forbidden* — §4.1). |
| Suscripción | `subscriptionTill` 2026-08-28 (vencida) e `isActive: true`: la API responde igual. El demo no prueba qué pasa al vencer. |
| `updated` | Distinto de `created` en 276/305 filas: sirve como clave de diferencial. |

Consecuencias para el diseño: catálogo = **`Rentals`** (capacidad y mapeo OTA) +
**`Status`** (activo y estado de canal); reservas huérfanas → incidencia, no
excepción; verificación de escritura = `comment`/`updated`/`get_restrictions`,
no `Logs`; y un 404 al leer significa **token**, no «no existe».

### 4.5 MCP

`POST /mcp/{token}` (JSON-RPC, stateless) con **26 tools**, incluidas
`update_availability` y `set_restrictions` **por rango** y `get_restrictions`.
Sirve para leer y verificar; **no** como camino de escritura del sincronizador:
devuelve el JSON envuelto en texto y sin códigos de error por elemento.

### 4.6 Lo que documenta su centro de ayuda (documentado, no medido)

> Fuente: `nobeds.com/es/ayuda` (y `nobeds.com/help`, la misma base en inglés),
> leído el 22-oct-2026. Es el producto **de autoservicio**: describe lo que su
> interfaz hace, y puede no coincidir con el camino de partner. Se clasifica en
> §6/§8 como riesgo o pregunta, nunca como contrato.

**Estados (16).** «Estados y significados»: ciclo `New → Approved → CheckIn →
CheckOut → Completed`, más `Modified`, `Cleaned`, `NoShow`, `Cancelled`,
`InvalidCC`, `Debtor`, `Problematic`, `Prepaid`, `Paid`, `PaidBank`, `PaidCC`.
La lista **no es completa**: en datos reales aparecen además `Registered` y
`PaidOTA` (§4.4.1). Tres reglas que sí nos sirven:

- `Cancelled`: «la disponibilidad se abre automáticamente y se notifica a los
  canales». Media pregunta 14 queda respondida **a nivel de producto**: el
  cierre de la noche no es un paso aparte. Falta la forma en el API.
- `Cleaned`: estado de limpieza, **no afecta disponibilidad**.
- Los estados «pueden usarse manualmente»: `status` **no** es un flujo de eventos
  de la OTA, sino un campo que también mueve el personal del hotel.

**La disponibilidad es una cantidad.** «Establecer cantidad (0 = Cerrado |
1 = Abierto)», y el número son «unidades disponibles». Un *listing* puede ser una
habitación, un apartamento o una villa entera, así que `quantity > 1` es normal en
su producto. Consecuencia: el supuesto de §5.4 («un `room_id` = una
`HospitalityUnit`») solo vale si el hotel se crea **una unidad por listing**. Con
cantidad > 1 la reserva no dice qué habitación física ocupa y nuestro check-in
deja de poder asignar número. Pregunta 28.

**Restricciones por celda de calendario.** Cantidad, estancia mínima y máxima,
**antelación mínima en horas**, cerrado a la llegada y cerrado a la salida; se
aplican por fecha y habitación en el ChannelCalendar y se anuncian como «en
tiempo real». Confirma §4.3 (`advance_notice_hours` = horas) y que la escritura
por noche es el camino correcto.

**Precio de canal = base + extra por canal.** «Tarifas Extra»: por cada OTA se
configura un `Extra %` o un `Extra cantidad` que se suma a la tarifa base, para
cubrir comisión o por estrategia. Consecuencia: el precio de OTA que leemos **no
es la tarifa neta del hotel**, y si algún día empujamos precio hay que saber si el
campo es la base o el final (pregunta 29). Mientras no se sepa, la detección de
divergencias no compara nuestro precio con el suyo.

**Motor de reservas directas propio.** `nobeds.app/DirectForm/Index/{hotel_id}`,
incrustable por iframe o enlace y con colores de marca. Consecuencia: segundo
escritor de venta directa si no se desactiva (pregunta 30).

**Canales: API de dos vías vs iCal.** «Qué otros canales puedo conectar»: dos vías
por API con Booking.com, Airbnb y Expedia; por iCal, Agoda, Vrbo/HomeAway,
Hostelworld y TripAdvisor. La página de tarifas por canal añade **Trip.com**, así
que las dos páginas no coinciden. Consecuencia: en un canal iCal no hay reserva ni
cancelación como evento — la única señal es el calendario; la reconciliación no
puede tratar «desaparece» como cancelación ahí, ni prometer mensajería (pregunta 31).

**Sobreventas: su propio diagnóstico.** «Cómo comprobar sobreventas» lista como
causas (a) que un administrador cambió la disponibilidad a mano y (b) que **dos
canales enviaron reservas casi al mismo tiempo**; y en «Nueva reserva de Airbnb
perdida» explican que su calendario bloquea al instante pero la propagación a
Airbnb «puede tardar unos minutos». Es la confirmación, por su propia
documentación, de que **no hay exclusión mutua entre canales**: bloquean local y
propagan después. Nuestro diseño no elimina esa ventana; la reduce a un solo
escritor, y así hay que contarlo al hotel.

**Auditoría de calendario.** Para investigar un overbooking remiten a **Registros →
Calendario**, con entradas tipo `calendar SET quantity: 1` o `Booking quantity -1`.
Medido después (§4.4.1): `GET /api/Logs` **no** las devuelve; el rastro por noche
viaja en el `comment` de la fila de disponibilidad. Esa es la verificación de F2
(pregunta 10).

**Migración por Excel.** «Importar reservas antiguas»: Funciones → Importar,
plantilla con columnas fijas (fechas `AAAA-MM-DD`, columna de referencia), se
importa **por habitación**, duplica si la referencia ya existe, y recomiendan
**importar las reservas futuras antes de conectar las OTAs**. Consecuencia: F5 no
necesita backfill por API — se genera el Excel desde nuestra base y se importa.
Falta saber si lo ejecutan ellos por nosotros y si acepta nuestro identificador
(pregunta 24).

**Enlaces iCal entre listings.** Su «técnica de vinculación» enlaza la villa padre
con las unidades hijas por iCal, con aviso de bucle infinito si se enlazan en
ambos sentidos. No la usamos: en un hotel el mapeo es unidad ↔ listing. Se anota
porque es la respuesta que dará un hotel de apartamentos y hay que saber por qué
la rechazamos (latencia de iCal y cierres en cascada).

### 4.7 Las respuestas de su asistente (22-oct): qué se acepta

Llegaron respuestas de su asistente a las preguntas A–E. **No son un contrato**: es
texto generado a partir de su documentación, y se clasifica antes de usarlo.

**Se cae (contradicho o imposible):**

- *A1, sandbox de escritura con el token demo*: es falso en la práctica. Las seis
  formas de cuerpo probadas (`{availability}`, `{item}`, plano, create de reserva,
  delete con y sin `date`) devuelven **500 HTML**. El token solo lee.
- *A2, «suscriptor API de £99/mes gestiona hasta 0 propiedades con un token»*: la
  cifra es imposible y se contradice con «un token por hotel» en la misma frase.
  No sirve ni como dato comercial.
- *C3, «bloquea la disponibilidad del canal inmediatamente»*: su propio centro de
  ayuda dice que el calendario bloquea al instante pero la propagación a Airbnb
  «puede tardar unos minutos». Inmediato es lo local, no el canal.
- *E2, «el hotel puede empezar en modo observación»*: choca con su documentación
  de canales, donde conectar es publicar. No se promete al hotel.

**Eco de nuestra propia hipótesis (información cero, no evidencia):**

- *B1*, «ítem rechazado no viene en la respuesta»: es exactamente lo que
  dedujimos del schema, y es el peor caso. Sigue bloqueante.
- *B2*, cuerpo `{"item": {...}}`: repite el mensaje del 400 que **hoy ya no se
  reproduce** (las tres formas dan 500).
- *B3*, `one`..`ten` = precios de estancias de 1 a 10 noches y los strings de canal
  = stop-sell: repite nuestra conjetura palabra por palabra, y además choca con su
  centro de ayuda, que modela estancia mínima y máxima por fecha.
- *B4*, planes colapsan a un precio y el directo es libre: es nuestra §3 devuelta.
- *C1*, cuerpo mínimo de reserva: es **literalmente** la lista que propusimos.

**Confirmado midiendo (sí se usa):**

- *C6*, las canceladas siguen en `GET /api/Bookings`: confirmado (§4.4.1).
- *D2*, reseñas normalizadas y de solo lectura: coherente con la respuesta real
  (`score`, `staff`, `positive`, `negative`).
- *A4*, `Status` como catálogo: parcialmente, y no por lo que dice. `Status` solo
  lista activos; capacidad y mapeo OTA están en `Rentals` (§4.4.1).
- *E1*, `Status` y `Logs` para monitorizar: `Status` sí; `Logs` solo devuelve
  latidos de demo.
- *C7*, comparación sensible a mayúsculas: útil, pero incompleto — medimos
  `Registered` y `PaidOTA`, que no figuran en su lista de 16.

**Sigue abierto y bloqueante** (nada de esto se puede construir sobre una
respuesta de asistente): atomicidad y rechazo de `POST /api/Bookings` (C2, sin
status ni cuerpo: «not specified»), semántica de `DELETE ...&date=` (C4), si
`PUT` reemplaza (C5), límites y forma del ítem rechazado en bulk (B1), si se
puede responder a Booking.com/Airbnb por `Messages/send` (D1), rotación con
solape (A3), proceso de partner (A5) y las cuatro nuevas (28–31).

### 4.8 Tercera pasada de medición (26-oct-2026)

Repetida **solo lectura** para escribir el cliente de F1, y corrige o afina tres
cosas que el plan daba por supuestas:

| Hecho medido | Dato |
| --- | --- |
| `GET /api/Status` | Responde **camelCase**: `hotelName`, `subscriptionTill`, `isActive`, `serverTime`, `rentalsCount` y `rentals[].roomId` / `.title` / `.active` (booleano) / `.integrations` con el estado por canal como texto (`"Disconnected"`). |
| `GET /api/Rentals` | Responde **snake_case** y `active` como **`1`**, no booleano: `room_id`, `title`, `type`, `subtype`, `stars`, `guests`, `children`, `currencycode`, `checkin_time` (14), `checkout_time` (12), `images` separadas por coma y los ids por canal. **La API no es homogénea entre recursos.** |
| `GET /api/Availability` | Parámetros que **sí** filtran: `room_id`, `fromdate`, `todate`. Con `from_date`/`to_date` los **ignora** y devuelve desde hoy. Cada fila trae `rid`, `room_id`, `date`, `price`, `quantity`, `comment`, `min_stay`, `max_stay`, `closed`, `coa`, `cod`, `mah`, `one`..`ten` y los strings por canal. |
| `GET /api/Bookings` | Ventana `2026-10-01..2027-01-31` devolvió **42** filas con 7 estados distintos (`New` 23, `Approved` 10, `Registered` 5, `Cancelled` 1, `Paid` 1, `Checked-Out` 1, `Completed` 1), y `referral` con `Direct`, `Nobeds.app` y `Agoda.com` en la misma ventana. |
| Token inválido | **404 JSON** `application/problem+json` con `title: "Not Found"` y `traceId`. Se confirma que un 404 de lectura es **credencial**, no recurso inexistente. |

Consecuencias para el código (ya aplicadas en
[`lib/hospitality/nobeds/`](../lib/hospitality/nobeds/)): un normalizador **por
recurso**, no uno genérico de habitación; el filtro de disponibilidad con los
nombres en snake_case; y el 404 clasificado como `token` en el cliente.

### 4.9 Cuarta respuesta del proveedor (27-oct-2026): qué se acepta

> Fuente: el resumen de capacidades que enviaron, contrastado con su
> `openapi.json` público, sus guías de ayuda y **nuestra propia medición**
> (§4.4.1, §4.8). Se clasifica con la regla de §4.7 —lo que no esté medido o
> firmado por ingeniería no entra en código—, con un matiz: esta vez una de sus
> frases **corrige un error nuestro** y se acepta aunque no la hayamos medido.

| Lo que dicen | Estado | Consecuencia |
| --- | --- | --- |
| El token es un **Bearer maestro** por cuenta de hotel, compartido por todas sus unidades | **Confirmado, y corrige §4.1.** Su spec lista `Authorization: Bearer <api_token>` —más `X-Api-Key` y `NOBEDS-API-TOKEN`— como método **recomendado**, y deja la ruta como *legacy / backward-compatible*. Medido el 27-oct-2026: cabecera y ruta devuelven 200 con el mismo cuerpo. El `openapi.json` público no lo declara, pero el spec real sí. | **El cliente pasa a cabecera** (`autenticacion: 'cabecera'` por defecto) y deja de poner el token en la URL; la ruta sigue disponible con `NOBEDS_AUTH=ruta`. Lo que **no** queda establecido es que el token sirva para varios hoteles de una misma cuenta: eso sigue en la pregunta 6. |
| Varios usuarios del hotel comparten el token; se genera en Configuración → Desarrolladores | **Coherente** con §4.1 (un token por hotel) y **nuevo** en lo que importa: la rotación la puede hacer **el hotel**, no nosotros, y afecta a todos sus usuarios a la vez. | La rotación deja de ser una operación interna: hay que asumir que el token cambia sin avisarnos. El 404 clasificado como `token` y la sonda de guardado dejan de ser un detalle y pasan a ser la guardia. Refuerza la pregunta 6. |
| Las unidades se crean y gestionan por `/api/rentals`, cada una con su disponibilidad y precios | **Cierto y fuera de alcance.** El schema documenta `GET /api/rentals` (y `GET /api/hotels` para el perfil); crear unidades no está documentado. | **No creamos unidades en su sistema.** El alta de propiedad y unidad sigue siendo nuestra (§5.4); duplicarla allí sería un segundo origen de verdad para el mismo `room_id`. |
| `/api/bookings` permite crear, **modificar** y cancelar, y consultar el detalle de una reserva | **Parcial.** El schema documenta `GET`, `POST` y `DELETE`; **no hay método de modificación** ni `GET` por id —solo consulta por ventana de fechas—. Lo que anuncian como «modificar» es una tool MCP, no una ruta REST. | Un cambio de reserva **no se escribe**: se trata como cancelación + alta, o se espera. No se implementa `PUT` a ciegas. Hoy Aiosell sí modifica, así que el cutover **pierde** esa capacidad hasta que lo confirmen. Pregunta 15. |
| `/api/availability` empuja tarifas, disponibilidad y restricciones: estancia mínima y máxima, cierre de ventas, cerrado a llegada y a salida | **Parcial, y con un dato nuevo que sirve.** El schema documenta `POST /api/availability/{api_token}` con `room_id`, `date`, `available`, `price`, `min_stay` y **200** al actualizar. **No** documenta `max_stay`, `closed`, `coa` ni `cod`. Nuestro `Availability/bulk` (§4.2) sí los tiene, pero toda escritura con el token demo devuelve **500 HTML**. | F2 no se desbloquea: sigue faltando sandbox de escritura. La novedad es que la escritura **por celda única** está documentada con 200, así que con el primer token real se sondea **una noche, una unidad, reversible**, antes de tocar el bulk. Las restricciones más allá de `min_stay` siguen sin verificar. |
| Webhooks HTTP POST en tiempo real para crear, modificar y cancelar, configurados en Configuración → Desarrolladores | **Confirmado como producto** (su guía de cerraduras lo nombra: `booking.created` / `booking.updated`). **No** hay ruta para registrarlos (`/api/Webhooks` → 404, medido) ni carga ni firma documentadas. | **Corrige §3**: no «desaparecen». Pero son de **alta manual en su extranet**, uno por hotel, y su cuerpo es **no confiable**: al recibir uno se relee por API antes de aplicar. El sondeo sigue siendo el camino principal. |
| Para conectar OTAs hay que seleccionar NOBEDS como proveedor en la extranet de **cada** OTA | **Cierto para Booking.com** (su guía lo pide explícitamente: Connectivity provider → NOBEDS, activando Reservas y Tarifas). **No** para Airbnb ni Expedia, que según sus propias guías se conectan desde el lado de NOBEDS. | El checklist de alta da **una receta por canal**, no una instrucción única. Los canales por iCal siguen como en §4.6. |

Lo que este correo **no** contesta y F0 sigue necesitando por escrito:
atomicidad de `POST /api/Bookings` y del bulk, carga y firma del webhook, qué
pasa con un ítem rechazado, y si un token cubre varios hoteles de una cuenta.
Nada de eso se construye sobre un resumen.

La autenticación **sí queda cerrada**, y no por el correo: por su spec y por
medición (§4.1). Consecuencia inmediata, ya en código: el token viaja en
`Authorization: Bearer`, no en la ruta.

## 5. Diseño propuesto

### 5.1 Módulo

`lib/hospitality/nobeds/` con:

- `client.ts` — HTTP, token por propiedad (descifrado), clasificación de errores.
- `mapa.ts` — `room_id` ↔ `HospitalityUnit`, canal ↔ `channel`, `status` ↔
  `estado`. Puro.
- `reservas.ts` — lectura + diferencial (nuevo / modificado / cancelado).
- `cierres.ts` — `closed`/`coa`/`cod` y `quantity: 0` de unidades fuera de
  servicio.

Quedan **intactos** y son reutilizables: `rechazo-canal.ts`,
`inventario-divergencias.ts` (adaptando la fuente), `connectivity-health`,
`conectividad-causa`, `preflight-conectividad`, la reconciliación (con ventana
nueva) y el panel admin.

### 5.2 Sondeo, no webhook

- Ventana: `check-in` desde `hoy − RETROCESO` hasta `hoy + horizonte de venta`
  (`DIAS_HORIZONTE_VENTA = 730`). `RETROCESO` = la estancia más larga que
  permiten los planes activos (+ margen), porque una reserva en curso se
  detecta por su check-in, no por su fecha de reserva.
- Diferencial por `(order_id, updated, status, canceled)`. Una reserva que
  estaba en la ventana y desaparece = cancelación, con las mismas guardias que
  hoy (nunca borrar sin rastro: se marca y se deja incidencia).
- Cadencia: no un barrido global. Por propiedad, con reparto por cubo
  (`hash(hotelId) % N`), y un barrido completo nocturno. Con 1.000 propiedades
  un barrido cada 5 minutos de todas es inviable; medido: 305 reservas en 0,18 s
  y 1.218 registros de disponibilidad en 0,21 s para un hotel demo, así que el
  coste por hotel es bajo y el problema es solo la agregación.

### 5.3 Escritura

- Reserva directa confirmada → `POST /api/Bookings?room_id=` con
  `name`, `email`, `phone`, `checkin`, `checkout`, `guests`, `total`, `comment`.
  Nuestro `id` va en `comment`/`referral_order_id` para poder casar la respuesta.
- Bloqueo o mantenimiento → `set_restrictions` por rango. Nunca un recuento.
- Cada operación a `HospitalitySyncLog` con payload y respuesta saneados.

### 5.4 Datos y migración de esquema

- Token cifrado por propiedad (columna nueva en `ConnectivityMapping` o modelo
  propio; con `encrypt()` de [crypto.ts](../lib/core/crypto.ts)).
- `ConnectivityMapping.provider = 'nobeds'`, `externalPropertyId = hotel_id`,
  `externalUnitCode = room_id`. El campo `provider` ya existe, así que Aiosell y
  NOBEDS pueden convivir durante la migración.
- **Supuesto a validar antes de F1** (§4.6, pregunta 28): un `room_id` = una
  unidad. Si un listing lleva `quantity > 1`, la reserva no identifica la
  habitación física y el mapeo tiene que ser **unidad → unidad**, no
  unidad → listing. Se comprueba en el catálogo real del primer hotel, no en el
  demo.
- `externalRatePlanCode` queda **sin uso** en NOBEDS (no hay planes). No se
  borra: sigue siendo la columna que usa Aiosell mientras dure la transición.
- **Catálogo**: `GET /api/Rentals` para capacidad, subtipo, moneda y los ids por
  canal; `GET /api/Status` para `active` y estado de canal. `Status` **no basta**
  como catálogo: 58 de 305 reservas del demo apuntan a `room_id` que ya no están
  en ninguno de los dos (§4.4.1). Un `room_id` sin mapping es **incidencia**, no
  excepción: no se pierde la reserva ni se inventa una unidad.

## 6. Riesgos y guardias

| Riesgo | Guardia |
| --- | --- |
| Doble escritor → overbooking | Solo escribimos reservas directas y cierres (§2) |
| Push tarde = noche reabierta | Nunca empujamos recuentos |
| Desaparece una reserva y la damos por cancelada sin serlo | Diferencial con confirmación en el siguiente ciclo + incidencia visible |
| Token en la URL | **Cabecera por defecto**; `NOBEDS_AUTH=ruta` solo como vuelta atrás, con saneado de errores y prohibido en logs y en la UI (§4.1) |
| Credencial vacía que no falla sino que lee el hotel demo | El cliente se niega a construirse sin token y el guardado rechaza un token en blanco (§4.1) |
| `status` libre | Normalización con tabla explícita y tests de los 14 valores vistos y los 16 documentados (§4.6) |
| Descarte silencioso en bulk | Diff petición/respuesta y atribución a la unidad del hotel |
| 1.000 propiedades | Sondeo por cubos, no global |
| Listing con `quantity > 1` → varias habitaciones bajo un `room_id` | Mapeo unidad → unidad y, si no se puede, alta del hotel con un listing por unidad (§4.6) |
| Canal iCal sin eventos de reserva ni cancelación | Para esos canales solo se reconcilia disponibilidad; nunca se infiere cancelación ni se promete mensajería (§4.6) |
| Su motor de reservas directas compitiendo con el nuestro | Desactivado por hotel; si no se puede, esas reservas se ingieren por sondeo y se marcan como canal directo (§4.6) |
| Precio de OTA = base + extra por canal | No comparar nuestro precio con el suyo en divergencias hasta saber qué campo es cuál (§4.6) |
| `room_id` retirado o reutilizado: la reserva apunta a un room que no existe | Catálogo `Rentals` + incidencia de reserva huérfana; nunca crear una unidad al vuelo (§4.4.1) |
| 404 de lectura por token inválido confundido con «no existe» | El cliente trata 404 como credencial en lectura y alerta de conectividad (§4.4.1) |
| Escritura que responde 500 HTML sin cuerpo útil | Nunca marcar como enviado sin verificar en `comment`/`updated`/`get_restrictions` (§4.4.1) |
| Respuestas de su asistente tomadas como contrato | Triage en §4.7: lo que no esté medido o firmado por ingeniería no entra en código |

## 7. Fases

| Fase | Contenido | Salida |
| --- | --- | --- |
| F0 | Cerrar las preguntas de §8 y conseguir un token de sandbox por hotel | Contrato firmado por escrito |
| F1 | Cliente, token por propiedad, lectura de catálogo/disponibilidad/reservas, panel de salud | Un hotel demo leído en verde |
| F2 | Reservas directas y cierres (escritura mínima) | Una reserva de prueba creada y visible en su PMS |
| F3 | Sondeo + diferencial + reconciliación + incidencias | 72 h sin divergencias con un hotel real |
| F4 | Mensajes y reseñas | Bandeja con hilo real; reseñas sin CSV |
| F5 | Primer hotel migrado con su **importación Excel** de reservas futuras (su receta documentada: importar, luego conectar OTAs), Aiosell en paralelo solo lectura, retirada | Un ciclo completo sin Aiosell |

Estimación: ~5 semanas, con F0 como bloqueante (no es trabajo de código).

## 8. Preguntas abiertas

> Redactadas para envío, junto con el acceso y el alta del primer hotel, en
> [`hospitality-nobeds-email-arranque.md`](./hospitality-nobeds-email-arranque.md)
> (22 oct 2026). Al recibir respuesta, volcarla en §4 y cerrar esta lista antes
> de escribir F2. **1–8 son bloqueantes**; 9–13 salen de su centro de ayuda
> (§4.6): la 9 condiciona el mapeo de F1, y 10–13 se resuelven en el cutover.
>
> Actualización 22-oct (tarde, §4.4.1): la **4** cambia de pregunta —los `room_id`
> retirados desaparecen del catálogo pero sus reservas quedan, así que lo que hay
> que saber es si un `room_id` **se reutiliza**—; la **10** se responde sola
> (`Logs` no sirve, el rastro está en `comment`); la **16** queda **cerrada por
> medición** (las canceladas siguen en la lista, con `canceled`).

1. **Webhooks**: existen en la extranet (`booking.created` / `booking.updated`),
   pero no hay ruta para registrarlos ni carga ni firma documentadas (§4.9).
   Falta: qué campos trae la carga, si se puede apuntar a una URL por hotel y si
   firma. Mientras tanto, la latencia de ingesta es la del sondeo.
2. **Bulk**: límite de ítems, si hace upsert, y qué devuelve un ítem fallido
   (`action` nulo o ausente de la respuesta).
3. **`one`..`ten`**: ¿precios/cierres por estancia de 1 a 10 noches? Es la única
   vía para `minimumStayArrival` y `exactStayArrival`.
4. **Canceladas**: ¿siguen apareciendo en `GET /api/Bookings` con
   `status: Cancelled`, o desaparecen? Define si el diferencial detecta
   cancelación o desaparición.
5. **Rate limit** y tamaño máximo de ventana en `/Availability`.
6. **Token**: ¿uno por hotel o por cadena? ¿se puede rotar sin ventana de caída?
   Y si una cuenta tiene varios hoteles: ¿el mismo token sirve para todos y cómo
   se distingue la propiedad en la petición? Su correo del 27-oct habla de un
   token «maestro» por cuenta (§4.9).
7. **`POST /api/Bookings`**: ¿descuenta disponibilidad de forma atómica? ¿rechaza
   con 409 si no hay? Es lo que sustituye a nuestra guardia de disponibilidad.
8. **Modo demo/errores**: en demo, un POST devuelve **500 con página HTML** de
   ASP.NET, no el 403 JSON documentado. ¿Cuál es el contrato real de errores?
9. **Listing vs habitación física**: ¿un `room_id` con `quantity > 1` puede
   representar varias habitaciones, y la reserva dice cuál? ¿Un hotel se crea
   como N listings de cantidad 1? (28 del correo, §4.6)
10. **Precio**: ¿el `price` de `/api/Availability` es la tarifa base o el precio
    final con extras por canal? (29)
11. **Motor directo propio**: ¿se puede desactivar por hotel, y con qué
    `referral` aparecen sus reservas en `GET /api/Bookings`? (30)
12. **Canales iCal**: ¿Agoda, Vrbo, Hostelworld y TripAdvisor generan filas en
    `/api/Bookings` y entregan cancelaciones? ¿La matriz definitiva es la de la
    página de canales o la de tarifas por canal (que añade Trip.com)? (31)
13. **Importación Excel para el cutover**: ¿la ejecutáis vosotros por nosotros,
    acepta nuestra referencia y qué hace con un duplicado? (24)
14. **Autenticación**: ¿el `api_token` de la ruta vale también como
    `Authorization: Bearer`, y cuál es el recomendado? Su correo del 27-oct dice
    «Bearer maestro»; la medición dice ruta y el schema no declara cabecera
    (§4.9).
15. **Modificación de reserva**: el schema público solo documenta `GET`, `POST`
    y `DELETE` en `/api/bookings`, y ningún `GET` por id. ¿Existe `PUT`/`PATCH`,
    qué campos acepta y qué pasa con la disponibilidad al mover fechas? (§4.9)

## 9. Pendiente honesto

- Nada de esto está implementado: este documento es la decisión y el plan.
- Las cifras de rendimiento son del hotel de demostración (6 habitaciones), no
  de una propiedad real con años de histórico.
- No se ha probado ninguna escritura (el token de demo es de solo lectura y un
  POST devuelve 500). Todo lo de §4.2/§4.4 en escritura está **sin verificar**
  contra un hotel real.
- La marca sigue la regla del módulo: el nombre del proveedor no aparece en UI,
  correos ni PDFs. En el producto se sigue llamando «Conectividad de Canales».
- §4.6 es **documentación de su producto de autoservicio**, no del API ni del
  acuerdo de partner: describe lo que hace su interfaz y puede no aplicar al
  camino de integración. Sirve para preguntar mejor, no para sustituir la
  respuesta escrita.
- Las respuestas de su asistente (§4.7) **no son contrato**: cinco repiten
  literalmente nuestras hipótesis y dos son imposibles o falsas al probarlas.
  Solo tres cosas se aceptan, y porque las medimos nosotros.

## 10. Estado de implementación (26-oct-2026)

**F1 de lectura, hecho.** Vive en [`lib/hospitality/nobeds/`](../lib/hospitality/nobeds/)
y **no toca el camino vivo** del proveedor actual: nada importa este módulo
todavía, así que se puede revisar y desplegar sin cambiar el comportamiento de
un hotel en producción.

| Fichero | Contenido |
| --- | --- |
| `tipos.ts` | Contrato medido (Status, Rentals, Availability, Bookings) y dominio normalizado. Modela explícitamente que `status` mezcla reserva, cobro y limpieza. |
| `cliente.ts` | Solo **GET**: `estado`, `rentals`, `disponibilidad`, `reservas`. Token en la ruta, timeout, y clasificación de errores `token` / `peticion` / `servidor` / `tiempo` / `red` / `respuesta`. El token se **sanea** en mensajes y en la URL que se registra. |
| `mapa.ts` | Puro: normalización de `status` (14 medidos + 16 documentados, sin adivinar), `referral` → canal (con `nobeds.app` separado de `direct`), ventana por **check-in** y cruce catálogo ↔ `ConnectivityMapping` con huérfanos y conflictos. |
| `reservas.ts` | Diferencial puro (nuevas / modificadas / canceladas / desaparecidas) y **confirmación de desapariciones en dos ciclos**: una reserva que falta no se cancela ni reabre noches. |
| `config-propiedad.ts` | Servidor: lee la credencial **de esta propiedad**, descifra el token y devuelve el cliente; y la guarda (`guardarCredencialPropiedad`) cifrando antes de escribir, probándola con un GET de estado y sin devolver el secreto. Los tres casos de «no configuración» son error de credencial, no lectura vacía. |
| `../conectividad-proveedores.ts` | Registro de proveedores + **política de un solo escritor**, con el actual como respaldo. |

Guardias: `tests/nobeds-cliente.test.ts`, `tests/nobeds-mapa.test.ts`,
`tests/nobeds-diferencial.test.ts`, `tests/nobeds-config-propiedad.test.ts` y
`tests/conectividad-proveedores.test.ts` (**95 comprobaciones**, con el guardado
de la credencial y su endpoint), con payloads
copiados del API real, incluidos el 404 de credencial y el 500 con HTML.

### 10.1 Credencial por propiedad, ya en el esquema

`hospitality_connectivity_property_config` (migración
`20261026120000_hospitality_connectivity_property_config`) guarda, **por
propiedad y proveedor**: `externalPropertyId`, `tokenEnc` cifrado, `activo`,
`modo` y el estado del último chequeo. Es la pieza que el `partnerId` por tenant
no podía dar. **No está aplicada en producción**: la migración existe y está
probada contra el DDL que genera Prisma, pero se aplica con el despliegue.

### 10.2 Guardar la credencial desde el producto

`PUT /api/hospitality/conectividad/propiedades` cifra y guarda (o rota) el token
de **una propiedad de la cuenta**; `GET` devuelve el estado de todas sin el
secreto. La pantalla es la tarjeta «Credencial por propiedad» de
`app/dashboard/hospitality/conectividad/page.tsx`, junto al ID de socio.

Tres reglas que la hacen segura de usar:

- El token se cifra en el servidor antes de escribir y **no se devuelve nunca**:
  la respuesta trae `configurado: true`, no el valor. La pantalla no lo pinta y
  el campo queda vacío (si se deja vacío, se conserva el guardado).
- La propiedad se comprueba contra el `tenantId` de la sesión: el id de otra
  cuenta responde 404 y no escribe nada.
- Si tras guardar quedan dos proveedores activos en escritura, **se guarda y se
  avisa** con la frase de la política. Rechazarlo dejaría al hotel sin poder
  registrar su credencial por un conflicto que se resuelve aparte.

**Guardar es probar.** Con la credencial que queda en uso se hace un
`GET /api/Status` —solo lectura: el cliente no tiene verbos de escritura— y el
resultado se escribe en la misma operación: `estado` (`conectado` / `error`),
`ultimoChequeo` y `ultimoError` saneado (sin token, en una línea y acotado).

- Un fallo de la prueba **no** invalida el guardado: responde 200 con
  `ok: true` y `sondeo.ok: false`. Perder el token tecleado porque el proveedor
  está caído sería peor que guardarlo marcado en rojo, y el motivo queda a la
  vista en la tarjeta.
- Una credencial **desactivada** no se prueba (no se gastan peticiones con un
  secreto que el hotel acaba de apagar) y queda en `configurado`, que significa
  «hay token, sin probar» — no un problema, pero tampoco una promesa.
- Se prueba lo que va a **quedar** guardado: si el cuerpo no trae token, se usa
  el que ya estaba, no uno inventado. La sonda va con `Authorization: Bearer`, así
  que el token tecleado no queda ni en la URL ni en el `traceId` de un error.
- La prueba dice que el token responde, **no** que el `externalPropertyId` sea
  el suyo: `Status` no devuelve ese código. Esa correspondencia se ve al
  vincular unidades.

### 10.3 El proveedor anterior queda como segunda opción

La convivencia está en código, no en una nota:

- `nobeds` es `principal`; `channel_connectivity` es `respaldo` y **sigue
  pudiendo escribir si es el único activo** — es la vuelta atrás del cambio.
- El respaldo puede quedarse activo en `modo: 'lectura'`: lee y reconcilia
  mientras el nuevo escribe, sin empujar nada.
- `decidirEscritor()` devuelve **`null`** si hay dos candidatos con escritura, o
  si hay un proveedor activo de tipo desconocido (no se puede probar que no
  empuje). Nunca «elige uno».

**Lo que falta y por qué:**

- **F2 (escritura)**: bloqueada por F0. Sin sandbox de escritura no se puede
  probar `POST /api/Bookings` ni `Availability/bulk`, y sin saber si el alta es
  atómica no se escribe una línea de esa parte.
- **Sonda periódica del token por propiedad**: guardar ya lo prueba y deja
  `estado`/`ultimoChequeo`/`ultimoError`; falta que un job recorra las
  credenciales activas para que el verde se renueve sin volver a guardar. El
  hotel puede rotar el token por su cuenta (§4.9), así que esa sonda es la única
  forma de enterarse.
- **Webhook entrante**: el hotel lo configura en su extranet (§4.9); falta una
  ruta nuestra que reciba `booking.created`/`booking.updated`, relea la reserva
  por API y la aplique. Hasta que exista, el sondeo es el único camino.
- **Panel de salud y wizard**: no tocados. El paso 5 del onboarding sigue
  hablando del proveedor actual hasta que se decida el orden del cutover.
- **Mensajes y reseñas**: F4, sin empezar.
