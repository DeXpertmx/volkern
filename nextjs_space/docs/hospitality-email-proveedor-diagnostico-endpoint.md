# Borrador de respuesta al soporte del proveedor — «share the API endpoint in use along with the payload»

> Contexto interno: el proveedor pidió «can you please share the API endpoint in use along with the
> payload and we will diagnose it for you». Este borrador cubre las dos direcciones. Datos tomados de
> `HospitalitySyncLog` en producción (último error 2026-09-30 13:46, HTTP 500 «Channel not live
> (res_out)») y del código (`lib/hospitality/connectivity.ts`, `reconciliation.ts`).
> Sustituir `{partner-id}` por el ID de socio que emitieron en el onboarding. No incluir credenciales.

---

Subject: Re: Diagnosis — the endpoint and payload we call

Hi [name],

Here is the endpoint we use and the exact payload of the call that is failing, so you can trace it on your side.

## 1. The failing call (Fetch Reservations, used by our daily reconciliation sweep)

```
POST https://live.aiosell.com/api/v2/cm/data/{partner-id}
Authorization: Basic <redacted>
Content-Type: application/json
Accept: application/json

{
  "type": "reservation",
  "hotelCode": "sandbox-pms",
  "startDate": "2026-09-30",
  "endDate": "2026-10-30"
}
```

**Response we received** (2026-09-30 13:46, our server time):

```
HTTP 500
{
  "success": false,
  "message": "volkern-hospitality: Channel not live (res_out) : sandbox-pms"
}
```

Notes that may help your diagnosis:

- **The same endpoint with the same `hotelCode` succeeded earlier the same day** (07:00) and returned a reservation list; it failed at 13:46.
- **Pushes to the same `hotelCode` work**: `POST /api/v2/cm/update/{partner-id}` and `POST /api/v2/cm/update-rates/{partner-id}` returned `200 {"success": true, "message": "Request Received Successfully"}` as recently as 2026-09-28.
- We have received no successful `/data` response since 2026-09-30 13:46; our scheduler has produced no further calls since then (we are reviewing that on our side as well).

Could you check what makes the **res_out** reservation feed report «Channel not live» for `sandbox-pms`, and whether anything changed on that hotel/channel around 2026-09-30?

## 2. Complete list of endpoints we currently call

Base URL: `https://live.aiosell.com/api/v2/cm` — HTTP Basic Auth, `Content-Type: application/json`, dates `YYYY-MM-DD`, upsert semantics, optional restriction fields sent as `null`.

| Method | Path | Purpose | Body shape |
|---|---|---|---|
| GET | `/property_details/{hotelCode}?partnerId={partner-id}` | Catalog fetch (connection test + room/rateplan mapping) | — |
| POST | `/update/{partner-id}` | Inventory push and inventory-level restrictions | `{"hotelCode": "...", "updates": [{"startDate": "...", "endDate": "...", "rooms": [{"roomCode": "...", "available": 1, "restrictions": { ... }}]}]}` |
| POST | `/update-rates/{partner-id}` | Rate push and rate-level restrictions | `{"hotelCode": "...", "updates": [{"startDate": "...", "endDate": "...", "rates": [{"roomCode": "...", "rateplanCode": "...", "rate": 2890, "restrictions": { ... }}]}]}` |
| POST | `/data/{partner-id}` | Fetch reservations (reconciliation) | `{"type": "reservation", "hotelCode": "...", "startDate": "...", "endDate": "..."}` |

We do **not** call `/channel_multiplier/{partner-id}` and `/marknoshow/{partner-id}`.

Real examples your API accepted on 2026-09-28 with `200 {"success": true, "message": "Request Received Successfully"}`:

```json
{
  "hotelCode": "sandbox-pms",
  "updates": [
    {
      "startDate": "2026-09-28",
      "endDate": "2026-12-26",
      "rooms": [{ "roomCode": "executive", "available": 1 }]
    }
  ]
}
```

```json
{
  "hotelCode": "sandbox-pms",
  "updates": [
    {
      "startDate": "2026-09-28",
      "endDate": "2026-12-26",
      "rates": [
        { "roomCode": "executive", "rateplanCode": "executive-d-ep", "rate": 2890 },
        { "roomCode": "executive", "rateplanCode": "executive-s-ep", "rate": 3540 }
      ]
    }
  ]
}
```

## 3. Inbound direction (in case the issue you see is on our webhook)

Our reservation receiver is:

```
POST https://volkern.app/api/hospitality/webhook/reservations
Authorization: Basic <the pair we issued to your emitter>
Content-Type: application/json
```

It receives a single payload for `action: "book" | "modify" | "cancel" | "no_show"` (same shape as your webhook Book payload; `modify` is full-state, `cancel` is reduced to the identifiers). It is **idempotent by `bookingId`**. Retry policy: `404` and `503`/`500` carry `Retry-After` and should be retried with backoff; `400`/`401` must not be retried. A `401` body includes a `diagnostico` object (reason + truncated SHA-256 fingerprints + lengths) so you can verify which credential pair is arriving without exposing any secret. The full spec is in the integration contract we shared (webhook section).

Happy to run a live test window if it helps — we can trigger a `property_details` call and a reservation fetch on demand and share both sides.

Thanks,
[Name] — Volkern
