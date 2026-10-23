# Informe — ¿Está todo listo para vender con Airbnb sin sobreventa?

**Fecha:** 17 de octubre de 2026
**Alcance:** hotel `75fdbbce2e` — «Ciudad Patio Cuarenta» (tenant `cmuy1wvzk002lmi01pie3kp40`)
**Motivo:** el operador quiere activar todas las unidades y pide confirmar que Airbnb está enlazado y que la sincronización protege de la sobreventa.
**Método:** sondas **solo lectura** dentro del contenedor de producción (Prisma de la propia imagen + dos llamadas al proveedor: `property_details` y *Fetch Reservations*), en `scratch/`: `sonda-preparacion-airbnb.cjs` (vínculos, unidades, bloqueos, reservas por canal y logs), `sonda-pushes-crudos.cjs` (payload y respuesta crudos de cada push) y `sonda-canales-catalogo.cjs` (catálogo y `connected_channels`). Ningún secreto se imprimió, no se escribió en la base ni en el canal, no se disparó ningún push y las copias del contenedor y de `/tmp` del VPS se borraron al terminar.
**Veredicto:** **Airbnb ya está enlazado por el proveedor** (no es una tarea pendiente nuestra) y la cadena de sincronización está sana. Quedan **dos huecos reales** (§4), uno de ellos con riesgo de sobreventa inmediata en 1A.

---

## 1. Resumen para decidir

1. **Airbnb no hay que «enlazarlo»**: la respuesta del proveedor para este hotel ya trae `connected_channels` con Airbnb activo (`hotel_code 517812456`) para **inventory, rates y reservation**. No existe en el producto ninguna casilla de OTA por activar: los canales que venden son los que el proveedor tenga conectados, y los tiene.
2. **El canal ya acepta las cuatro habitaciones y las cuatro tarifas.** Los pushes del 14-oct 17:33/18:45 y del 15-oct 12:45 llevaron `2b, 2a, 1a, 1b` con `1a-d-ep, 1b-d-ep, 2a-d-ep, 2b-d-ep` y volvieron **HTTP 200 `{"success":true}` sin `warnings`**. El 14-oct a las 04:15 y 07:00 esos mismos pushes traían descartes (`INVALID_ROOM_CODE` de 2a/1a/1b) — el mapeo de la extranet se completó entre las dos medidas.
3. **Hueco que sí importa: las cinco fechas que el hotel tiene cerradas no están publicadas en el canal.** Los bloqueos de 1A (4 rangos) y de 1B (6-oct-2026 → 30-abr-2027) se registraron el 17-oct a las 11:48 y 11:55 **por script directo a la base**, que no pasa por la API y por tanto **no dispara el push**: el último push del hotel es del 15-oct 12:45. Mientras eso siga así, Booking (y Airbnb en las habitaciones que cubra) siguen vendiendo noches que el hotel considera cerradas.
4. **No verificado, y no verificable desde aquí:** qué anuncio de Airbnb cubre qué habitación. La respuesta del proveedor trae **un solo** `hotel_code` de Airbnb frente a **cuatro** de Booking, así que el reparto por habitación en Airbnb lo tiene que confirmar el proveedor. La prueba definitiva llegará con la **primera reserva real de Airbnb**, que a día de hoy son **cero** (ni una de Airbnb en el histórico del ERP ni en la ventana de dos años del canal).

---

## 2. Lo medido (línea base 17-oct-2026)

| Qué | Medición |
|---|---|
| Conectividad | `estado: conectado`, `contadorErrores: 0`, última verificación 05:00, última sincronización 11:53 |
| `property_details` | HTTP 200 · `Ciudad Patio Cuarenta` · EUR · `Europe/Madrid` · catálogo **4 habitaciones** (`2b, 2a, 1a, 1b`), cada una con sus 4 planes (`2b-s/d/t/q-ep`, ídem a/b de 1 y 2) |
| `connected_channels` | **airbnb** `517812456` (inventory, rates ×1, reservation) · **booking.com** `14279079`, `14279259`, `14279656`, `14279792` (**inventory** y **reservation** en los cuatro; **rates solo en `14279259`**, medido a las 13:05 del 17-oct: el 13-oct eran cuatro) |
| Vínculos | 4, todos `activo`: `CPC-1A→1a/1a-d-ep`, `CPC-1B→1b/1b-d-ep`, `CPC-2A→2a/2a-d-ep`, `CPC-2B→2b/2b-d-ep` |
| Unidades | 6 en el tenant: las 4 de Ciudad Patio Cuarenta (vinculadas y con plan de 120 €), **`CPC-BJO`** (sin vínculo ni plan) y **`ACC`** de «Apartamento centro ciudad» (propiedad **sin `hotelCode`**) |
| Reservas | 4 en el ERP, **todas `booking.com`**; activas futuras solo 2, ambas en `CPC-2B` (30-jul→3-ago y 7→9-ago-2027) |
| Reservas en el canal (ventana 2024-10→2027-10) | 5 items, **todas `booking.com`** (3 `book` + 2 `cancel`); **0 de airbnb** |
| Bloqueos activos | **5**: 1A 10→23-oct, 3→6-dic, 2→4-ene-2027, 25→28-mar-2027 y 1B 6-oct-2026→1-may-2027 (creados 17-oct 11:48/11:55) |
| Último push | **15-oct 12:45** (inventory + inventory_restrictions, `operacion: onboarding`, 200 sin avisos) |
| Webhook entrante | `POST https://volkern.app/api/hospitality/webhook/reservations` con credenciales malas → **401 con diagnóstico** (endpoint vivo y guardado) |

---

## 3. Por qué la cadena de Airbnb entra sola (verificado en código)

- **El canal no es un parámetro del ingreso.** `normalizePayload` exige `bookingId`, `channel` y `hotelCode` (cualquier valor de `channel` vale) y `resolveMappingDetailed` resuelve la unidad por `hotelCode` + `rooms[0].roomCode` + `rooms[0].rateplanCode`. Una reserva `channel: "airbnb"` con `roomCode: "2a"` entra por el mismo camino que una de Booking.
- **Lo que llega del canal son NUESTROS códigos.** Medido en el payload real: `rooms[0] = {"rateplanCode":"2b-d-ep","roomCode":"2b","occupancy":{...},"guestName":"Marius Maj"}` — el proveedor traduce el anuncio de la OTA a los códigos del catálogo, no expone el id del anuncio.
- **La guardia es explícita y no adivina.** Si el `roomCode` no corresponde a ningún vínculo, se intenta la **vinculación automática** solo cuando es inequívoca; si hay cualquier duda, **no se crea la reserva** y queda un evento `sin_mapping` visible en el panel. Nunca se mete la reserva en otra unidad.
- **Los bloqueos sí viajan en el push.** `dispatchConnectivityPush` carga el contexto con `loadAvailabilityContext` y calcula `availabilityByRoomCode(units, hoy, horizonte, reservas, **bloqueos**)`; en los logs reales se ve `"available":1,"available":0` mezclados en los pushes con noches ocupadas/cerradas.
- **Horizonte de un push de hoy**: 318 días (la temporada «Tarifa de Verano» 17-jun→31-ago-2027 estira el horizonte por encima de los 180 del panel) → hasta **2027-08-31**, que cubre los cinco cierres (el más lejano termina el 30-abr-2027).

---

## 4. Huecos reales, en orden de riesgo

1. **Cierres sin publicar (sobreventa).** 1A y 1B tienen 5 bloqueos activos que **no han viajado**: el último push es anterior a su creación. Las noches del 10→23-oct de 1A son las más urgentes (están dentro del horizonte ya publicado en abierto). **Acción:** un push manual (Tarifas → *Sincronizar*, que envía inventario, tarifas y restricciones, hasta 2027-08-31) deja las cinco cerradas; se puede confirmar con el `responseBody` del push (200 `success: true` sin `warnings`).
2. **Reparto de Airbnb por habitación (no verificable desde aquí).** Un solo `hotel_code` de Airbnb frente a cuatro de Booking: si el hotel espera las cuatro unidades en Airbnb, es el proveedor quien debe confirmarlo. Nuestros pushes llevan las cuatro habitaciones, así que en cuanto Airbnb acepte esos `roomCode` el inventario y las tarifas van.
3. **Unidades que NO se pueden activar con conectividad:** `CPC-BJO` (no existe en el catálogo del proveedor: publica 2b/2a/1a/1b) y `ACC` (su propiedad «Apartamento centro ciudad» no tiene `hotelCode`). Activarlas exige que el proveedor las publique primero.
4. **Límite conocido del contrato:** `marknoshow` no cubre Airbnb, así que un no-show de Airbnb que el proveedor no empuje se queda solo en el ERP.

---

## 5. Qué NO prueba este informe

- Que Airbnb muestre las cuatro habitaciones: eso vive en la cuenta de Airbnb y en la configuración del proveedor.
- Que existan reservas de Airbnb: no hay ninguna todavía; la primera será la prueba de extremo a extremo (llegada por webhook o por el barrido de dos años).
- El calendario de la extranet de Booking: la API solo devuelve reservas, no cierres manuales. Por eso los cierres de 1A se registraron como bloqueos internos.
