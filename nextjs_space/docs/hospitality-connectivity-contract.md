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

## Endpoints (PMS → proveedor)

| Endpoint | Método | URL | Propósito |
| --- | --- | --- | --- |
| Property / Mapping Details | GET | `/property_details/{hotelCode}?partnerId={pms}` | Llamar PRIMERO: devuelve `hotel_id`, `room_id`, `rateplan_id` que se usan como `hotelCode`, `roomCode`, `rateplanCode`. |
| Inventory Push | POST | `/update/{pms}` | Disponibilidad por tipo de habitación para un rango (upsert). |
| Rate Push | POST | `/update-rates/{pms}` | Tarifas por (room, rateplan, fecha); los rangos se expanden a tarifas diarias. |
| Inventory Restrictions Push | POST | `/update/{pms}` | Restricciones a nivel de tipo de habitación (min stay, etc.). |
| Rate Restrictions Push | POST | `/update-rates/{pms}` | Restricciones por (room, rateplan). |
| Mark No Show | POST | `/marknoshow/{pms}` | Marcar no-show (solo booking.com y gommt). |
| Fetch Inventory | POST | `/data/{pms}` | Consultar inventario. `type` en el body decide el dataset. |
| Fetch Rates | POST | `/data/{pms}` | Consultar tarifas (room, rateplan, date). |
| Fetch Reservations | POST | `/data/{pms}` | Consultar reservas (mismo payload que el webhook Book). |
| Channel Multiplier | POST | `/channel_multiplier/{pms}` | Multiplicador de tarifas por canal (`1.2` = +20%). No implementado en V1. |

## Webhook de reservas (proveedor → PMS)

Un único endpoint POST interno recibe `book` / `modify` / `cancel`,
diferenciados por el campo `action`.

### Campos del payload (Book)

| Campo | Tipo | Requerido | Descripción |
| --- | --- | --- | --- |
| `action` | string | ✅ | `book` \| `modify` \| `cancel` |
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

### Payloads de Modify y Cancel

- **Modify**: mismo shape que Book pero representa el **estado completo nuevo**.
  El PMS debe reemplazar el estado anterior, no fusionar parcialmente.
- **Cancel**: payload reducido que identifica la reserva (`hotelCode`, `bookingId`,
  `cmBookingId`, `action: "cancel"`) para localizarla y cancelarla.

## Guardrails antes de enviar código a producción

- [ ] Todas las URLs de endpoints coinciden con la tabla byte a byte.
- [ ] Slug del PMS sustituido en `/update/{pms}`, `/update-rates/{pms}`, `/data/{pms}`.
- [ ] Fechas `YYYY-MM-DD`, timestamps `YYYY-MM-DD HH:MM:SS`.
- [ ] Campos de restricción opcionales enviados como `null`, no omitidos.
- [ ] `Content-Type: application/json` en cada petición.
- [ ] `success` de la respuesta verificado; `message` expuesto en fallos.
- [ ] Webhook idempotente por `bookingId`.
- [ ] `modify` tratado como reemplazo completo, no patch.
- [ ] Campos de huésped opcionales: sin crash ni rechazo si faltan.
- [ ] `specialRequests` como texto libre.
- [ ] Sin campos, partners ni esquemas de auth inventados.