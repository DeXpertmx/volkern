# Correo formal a Aiosell — hotelCode, webhook de reservas y rotación de credenciales

> **Estado interno (NO enviar).** Cuerpo listo para copiar; va en **inglés** (es
> su idioma de soporte), numerado para responder en línea. Compendia en un solo
> hilo formal los tres pendientes con Aiosell que vivían dispersos: la
> **confirmación por escrito del hotelCode** (hasta hoy, solo via WhatsApp),
> el **webhook de reservas de Volkern** (spec completa resumida en el cuerpo;
> el detalle completo viaja en el adjunto externo) y la **rotación de la
> contraseña de Basic Auth compartida por WhatsApp** el 7-oct. Las tres cosas
> se piden **por escrito** — la confirmación del hotelCode era, hasta hoy, un
> dato solo de WhatsApp.
>
> **Preparación de envío:**
>
> - Rellenar `NAME` (una vez en el saludo, otra en la firma).
> - **Adjunto**: el contrato externo en inglés
>   `hospitality-connectivity-contract-externo.md` —el mismo del paso 1.2 del
>   runbook, ya expurgado: conformidad con su API, spec de webhook y política
>   de reintentos—. La guía del emisor en español
>   (`hospitality-webhook-emisor-guia.md`) NO se adjunta: es material interno
>   y todo lo que su equipo necesita del emisor está ya en §2 y en el
>   contrato externo. Nada de material interno: ni el contrato interno, ni
>   paneles, ni wizard, ni decisiones de producto.
> - Anotar la fecha en **§9** del runbook y programar el recordatorio a los 5
>   días hábiles si no hay respuesta.
> - El preflight de credenciales sigue siendo `npx tsx
>   scripts/preflight-conectividad.ts --pegado "URL | ID | usuario |
>   contraseña"` antes de tocar el servidor (mismo comando del runbook).
> - **Sobre §2.6:** la ventana de llegada tardía de una reserva recuperada se
>   debe al tope del barrido diario (24 h) más la ventana de fetch de
>   reservado atrás; la frase del cuerpo es aproximada a propósito: es una
>   advertencia operativa, no una cifra contractual.
> - **Sobre §1:** si la respuesta confirma el hotelCode con matizaciones (p.
>   ej. «regenerable si se renombra la propiedad»), registrar la respuesta
>   en el contrato y ajustar `resolverHotelDeSonda` si toca.

**Subject:** Volkern (PMS) — three formal confirmations and next steps for hotel `75fdbbce2e` (Ciudad Patio Cuarenta)

Hi {NAME},

This is the written follow-up to the work we have been doing together over the
past weeks (our phone/WhatsApp thread of 7 October included). Three items to
**confirm in writing**, one we need in writing **from you**, and one action we
would like to schedule. Since all three will block the go-live window for our
hotel `75fdbbce2e` (`Ciudad Patio Cuarenta`), I am putting everything in one
email so you can forward it to your account and integration teams verbatim.

## 1. Confirm the stable hotel identifier (`hotelCode`)

Please confirm by reply that our production hotel is registered on your side
as:

```
hotelCode: 75fdbbce2e     (property "Ciudad Patio Cuarenta", Volkern)
```

Specifically, that this identifier:

- is **stable for the lifetime of the property** — it will never be
  regenerated, renamed or reused, even if we rename the property or change
  channel mappings;
- is the exact value we should keep sending as `hotelCode` in
  `property_details/{hotelCode}?partnerId={partner-id}` and in every push and
  webhook payload (our `partnerId` `volkern-hospitality` stays separate — this
  item is only about the hotel identifier);
- does **not** change when we add or remove rooms, rate plans or channels.

If anything above is not exactly the case, please tell us **now** — our mappings
(`roomCode` / `rateplanCode` → physical units) and our incident resolution
pipeline all key on this identifier, and a silent change would strand us.

---

## 2. Our reservation webhook — full spec for your emitter

Our endpoint receives `book` / `modify` / `cancel` / `no_show` for **every
reservation in any of our connected channels**. It is implemented, tested
end-to-end (see the `book` → duplicate → `modify` → `cancel` examples at the
end of this section), and in production. It only needs your emitter pointed to
it. The **full specification is in the attached external contract
(`hospitality-connectivity-contract-externo.md`, webhook section)**; here is
the summary your team needs to wire it up, and the wear-out-and-failure cases
for your queue.

### 2.1 Endpoint, authentication, and headers

```
POST https://volkern.app/api/hospitality/webhook/reservations
Authorization: Basic base64(utf8(username:password))
Content-Type: application/json
```

- One endpoint for all four `action` values, told apart by the `action` field.
- Authentication is HTTP **Basic Auth** (RFC 7235), UTF-8, single header, no
  line breaks. `basic` in any case and a base64 payload folded across lines
  are both accepted. If the credentials change we will notify you through the
  same secure channel we used for the first delivery — never by email or chat.
- We issue this pair at onboarding; it is the **inbound** pair (the one you
  send us), deliberately distinct from what you validate on your API when we
  push inventory and rates to you.

### 2.2 Payload (book)

The sender is the same shape as the Book webhook payload in your
documentation, and the fields we require / tolerate are:

| Field | Type | Required | Notes |
|---|---|---|---|
| `action` | string | ✅ | `book` \| `modify` \| `cancel` \| `no_show` |
| `hotelCode` | string | ✅ | The one confirmed in §1 |
| `channel` | string | ✅ | OTA of origin |
| `bookingId` | string | ✅ | Unique in your system |
| `cmBookingId` | string \| null | | Itinerary / channel-manager ref |
| `bookedOn` | ISO 8601 timestamp | ✅ | Creation time |
| `checkin` | YYYY-MM-DD | ✅ | Arrival date |
| `checkout` | YYYY-MM-DD | ✅ | Departure date |
| `segment` | string | ✅ | Booking segment/category |
| `specialRequests` | string \| null | | Stored as free text, never parsed |
| `pah` | boolean | ✅ | Pay-at-hotel flag |
| `amount.amountAfterTax` | number | ✅ | Total incl. tax |
| `amount.amountBeforeTax` | number | ✅ | Subtotal |
| `amount.tax` | number | ✅ | Tax |
| `amount.currency` | ISO 4217 | ✅ | Currency |
| `amount.commission` | number \| null | | |
| `amount.tcs` / `amount.tds` | number \| null | | |
| `guest.*` | string \| null | | All optional; often masked by the OTA — send what you have, omit the rest |
| `rooms[].roomCode` | string | ✅ | Room type **as published by your `property_details`** — see §2.4 |
| `rooms[].rateplanCode` | string | ✅ | Rate plan code from `property_details` — also see §2.4 |
| `rooms[].guestName` | string \| null | | |
| `rooms[].occupancy.adults` / `.children` | integer | ✅ | |
| `rooms[].prices[].date` | YYYY-MM-DD | ✅ | Per-night date |
| `rooms[].prices[].sellRate` | number | ✅ | Per-night rate |

- `guest.*` fields are optional; a missing phone or email never fails the call.
- `specialRequests` is stored as free text.
- **One booking = one unit.** If `rooms[]` carries more than one entry we
  **reject the complete booking** (HTTP 400) — we never register the first room
  and drop the rest silently, and we never lump them into one unit (that would
  be an overbooking). For a multi-room booking, send one `book` **per room**,
  each with its own `bookingId`; suffixes like `bookingId#2` (second room) are
  how we correlate them later. A `cancel` is exempt from this rule: it acts on
  `bookingId` alone and the `rooms[]` it carries is ignored.

### 2.3 Responses and the retry policy we expect from your queue

| HTTP | When | Retry? | How |
|---|---|---|---|
| **200** | Applied, or already applied (idempotent) | **No** | Body says what happened (`creada` / `duplicado` / `actualizada` / `cancelada`); treat any 200 as final. |
| **404** | Your `bookingId` is not in our PMS (usually: the `book` has not arrived yet) | **Yes, with backoff, capped** | 5 min → 1 h → 6 h, until **24 h** from the first 404, then escalate — the `book` was lost; re-send the **`book`**, never a converted `no_show`. |
| **401** | Bad credentials or unreadable header | **No** | Stop the queue; the body carries a `diagnostico` object (reason + truncated SHA-256 fingerprints + lengths) with no secrets, so you can self-diagnose from your own logs. |
| **400** | Invalid payload (missing `hotelCode`/`bookingId`/`channel`/`rooms`, unknown action, multi-room without per-room bookings) | **No** | Payload defect, not transient — do not retry unless you changed the payload. |
| **503** | Our receiver briefly misconfigured | **Yes** | Honour `Retry-After` (60 s) and retry with backoff. |
| **500** | Unexpected internal failure | **Yes** | Honour `Retry-After` (60 s) and retry with backoff; the whole cycle is idempotent, retries cannot duplicate reservations. |

- Retryable responses (404/503/500) carry **`Retry-After`** in seconds; it is
  the **minimum** wait before your first retry, and your backoff escalates from
  there. Non-retryable responses (200/401/400) **never** carry it — its absence
  is part of the contract.
- Every cycle is **idempotent by `bookingId`**: re-delivering an event we
  already applied answers 200 `duplicado` and changes nothing.
- If you already implement this policy, the webhook testbench we use
  (`Retry-After` presence/absence and idempotency) is in the attached contract
  too — same values, so we both assert the same thing.
- **Continuous 401s** mean your emitter is holding a different pair than the
  one we issued; do not retry, contact support. We **never** use the phone to
  replace credentials.

### 2.4 Success responses you will see (and one trap to avoid)

One 200 shape for every case: `success: true`, a `status` string whose value
tells you what we did with the event, and the internal `reservationId`:

```json
{"success":true,"status":"creada","reservationId":"…","penalizacion":null}
{"success":true,"status":"duplicado","reservationId":"…","penalizacion":null}
{"success":true,"status":"actualizada","reservationId":"…","penalizacion":null}
{"success":true,"status":"cancelada","reservationId":"…","penalizacion":null}
```

- **`modify` is a full replacement, not a patch.** We overwrite the previous
  state, we never merge; your emitter should send the complete new state and
  not a delta.
- `cancel` of a nonexistent booking → **404 with `Retry-After: 300`** — bounded
  retry, then escalate; the booking cannot be cancelled because it never
  arrived.
- We also accept `action: "no_show"` (guest did not arrive). It uses the usual
  payload, the same `bookingId` as the original `book`, and a `rooms[]` entry
  (that room context is required — without it we cannot resolve the unit).
- **One trap worth calling out, separate from the webhook:** a 200 from OUR
  `update-rates` push can still carry `warnings` (e.g.
  `INVALID_RATEPLAN_CODE : 2b`): your side accepted the request and dropped
  the rate, returning HTTP 200. Measured in production on 9 Oct 2026
  (hotel `75fdbbce2e`). Mentioned here so both sides debug "missed rates" from
  the same page: HTTP 200 ≠ rate applied — check the `warnings` array.

### 2.5 Examples from our live end-to-end run

Actual responses from our deployed environment during the go-live rehearsal:

```json
// 1) book (new bookingId)
{"success":true,"status":"creada","reservationId":"cmukx7ycp003lod01f9ze29dh","penalizacion":null}

// 2) the SAME book replayed (idempotent — the original was already there)
{"success":true,"status":"duplicado","reservationId":"cmukx7ycp003lod01f9ze29dh","penalizacion":null}

// 3) modify (full new state; here the checkout moved 1 day)
{"success":true,"status":"actualizada","reservationId":"cmukx7ycp003lod01f9ze29dh","penalizacion":null}

// 4) cancel
{"success":true,"status":"cancelada","reservationId":"cmukx7ycp003lod01f9ze29dh","penalizacion":null}
```

### 2.6 Our append: reconciliation drains what the webhook drops

Nothing here depends on your emitter being perfect — but knowing what happens
behind the scenes will save both of us debugging time later:

- **Daily reconciliation sweep.** A scheduled job (`04:15 UTC` daily) calls
  `POST /data/{partner-id}` with `{"type": "reservation", …}` and:
  1. applies any explicit `cancel` that the webhook missed;
  2. imports `book`/`modify` divergences along the same idempotent path;
  3. flags any internal **active reservation the reservation list no longer
     reports** as a divergence — which keeps it **live and sellable** until a
     human cancels it: it can be an overbooking.
- **Date semantics of `/data` (measured against your live service on 9 Oct
  2026):** `startDate`/`endDate` filter by **booking date** (`bookedOn`), not
  stay dates. Our sweep therefore looks **30 days back**; if you ever change
  that behaviour, please tell us — it would change what our sweep can see.
- A lost webhook is therefore never a lost reservation permanently — but it
  **is** a reservation that may arrive **up to 24–48 h late**, and a late
  reservation is a room sold twice. Real-time delivery is the path we want.

---

## 3. Rotating the Basic Auth password shared over WhatsApp (7 October)

On **7 October 2026** our Basic Auth password for your service was shared over
**WhatsApp**. We accepted it that day to unblock us, and it works — but it is
out of our security policy for a shared secret to live permanently in an
unencrypted consumer messaging channel. We would like to **rotate it now**,
while the integration is still young and the rotation is cheap.

### What we propose — in order

1. **Generate and deliver a new pair through a secure channel.** Options, in
   our order of preference:
   a. You create the new password on the partner dashboard and we fetch it from
      there (no transmission over chat at all);
   b. One-time **PGP-encrypted** email — we can share our public key first;
   c. A short-lived one-time secret link (e.g. an expiring self-destructing
      note) whose content you wipe server-side after we confirm download.
2. **Cutover, coordinated to keep both directions alive.** The pair is used in
   **both** directions (our pushes to you **and** your emitter's calls to our
   webhook), so this is the only step that needs a schedule:
   - we validate the new pair against `property_details` from our side;
   - we update the **inbound** pair on our webhook (our receiver holds one
     pair at a time — if you need an overlap window with both pairs live,
     tell us and we will schedule it; otherwise the switch is momentary on
     both sides),
   - your side updates the emitter's stored pair;
   - we flip our outbound credentials on our side in the same window.
3. **Tear down the old pair on your side** once both directions confirm the
   new one (we suggest a 24 h overlap so any queued emitter retries with the
   old pair don't break — although a 401 stops a healthy queue anyway, see
   §2.3).
4. **Confirm in writing** (the reply to this email) the exact **rotation
   procedure and notice period** you apply in general — from the earlier
   questions list, this is the one item you did not answer in writing yet —
   including where we report a compromise and who to alert.

### Why now

- A credential shared over a consumer chat app is outside our own security
  policy, and we want it out of that channel as soon as possible.
- Our webhook's 401 diagnostics are already reducing alert fatigue on both
  sides; a deliberate, scheduled rotation makes that pathway a routine drift
  not an incident.
- While the integration is in rehearsal and only **one hotel** is live, the
  blast radius of a rotation is a single property and we both have the
  telemetry to confirm it — we will not always have that comfort once more
  hotels come on.

---

## 4. Ask summary (so this email is easy to act on)

| # | What we need | Who | By when? |
|---|---|---|---|
| 1 | Confirm in writing that `hotelCode` `75fdbbce2e` is stable as described in §1 | Aiosell (account or integration team) | Your reply |
| 2 | Point the reservation emitter at our webhook (§2) and confirm your emitter has implemented the retry policy | Aiosell (integration team) | Before our go-live window |
| 3 | Agree a date for the password rotation (§3) and propose the secure channel | Both | We suggest next week |

---

## 5. Close

The full go-live picture on our side of the table is: catalog sync, inventory
and rate pushes, the reservation receiver with idempotency and reconciliation,
one mapped production hotel, and the rehearsal (`book` → `modify` → `cancel`)
done. What remains to move us from working-on-one-hotel to go-live is exactly
what §1–§3 ask for.

Thanks — and as before, happy to jump on a short call if any answer is easier
live; but whatever we agree, **please confirm the three items in writing**, so
they stand on their own when either of us has a handover on their side.

Best regards,
NAME — Volkern
[role] · Volkern Hospitality
