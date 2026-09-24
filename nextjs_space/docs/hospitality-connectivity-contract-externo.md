# Volkern PMS — Channel Manager Integration Contract

> This document is the technical reference for the Volkern PMS ↔ channel
> manager integration: what we already run against your API (Section 1), the
> complete specification of the reservation webhook your emitter will call
> (Section 2), the responses and retry policy your queue must implement
> (Section 3), and the specific answers we need to start (Section 4, which
> mirror questions A/B of the accompanying email).
>
> It is self-contained: your team should not need any other document to
> implement and verify their side.

## 1. What we already run (conformance statement)

- Full integration built and tested end-to-end against your documented API and
  sandbox: **inventory push, rate push, restrictions, `property_details`
  catalog fetch, `data` fetches, `marknoshow`**, and a **daily reconciliation
  sweep** for missed cancellations.
- We honour your documented conventions: `HTTP Basic Auth`, `Content-Type:
  application/json`, dates `YYYY-MM-DD`, timestamps `YYYY-MM-DD HH:MM:SS`,
  optional restriction fields sent as `null` (never omitted), upsert semantics
  on pushes, `modify` treated as full-state replacement.
- Our emitter resolves `hotelCode`/`roomCode`/`rateplanCode` strictly from what
  `property_details` returns, and we treat the codes as **stable identifiers**.
- We integrate `book` / `modify` / `cancel` from your webhook, and we handle
  `no_show` if your emitter sends it (`marknoshow` remains an outbound call we
  make for booking.com/gommt per your docs).

## 2. Webhook specification (your emitter → our receiver)

### 2.1 Endpoint and auth

- **Single POST endpoint** receives `book` / `modify` / `cancel` / `no_show`,
  discriminated by the `action` field. The definitive URL is delivered during
  onboarding, together with the **Basic Auth credentials we issue for your
  emitter** (separate from the ones we use to call your API).
- `Authorization: Basic base64(user:pass)`; `Content-Type: application/json`.
- The receiver is **idempotent by `bookingId`**: retried deliveries never
  duplicate reservations or charges.

### 2.2 Book payload fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `action` | string | ✅ | `book` \| `modify` \| `cancel` \| `no_show` |
| `hotelCode` | string | ✅ | Shared property identifier (from `property_details`). |
| `channel` | string | ✅ | Origin OTA. |
| `bookingId` | string | ✅ | Unique OTA booking ID. Idempotency key. |
| `cmBookingId` | string \| null | | Itinerary/channel-manager ID. |
| `bookedOn` | string | ✅ | ISO 8601 timestamp. |
| `checkin` / `checkout` | string | ✅ | `YYYY-MM-DD`. |
| `segment` | string | ✅ | Booking category. |
| `specialRequests` | string \| null | | Free text, never parsed. |
| `pah` | boolean | ✅ | Pay-at-hotel. |
| `amount.amountAfterTax` | number | ✅ | |
| `amount.amountBeforeTax` | number | ✅ | |
| `amount.tax` | number | ✅ | |
| `amount.currency` | string | ✅ | ISO 4217. |
| `amount.commission` / `.tcs` / `.tds` | number \| null | | |
| `guest.*` | string \| null | | All optional; missing fields never fail. |
| `rooms[].roomCode` | string | ✅ | From your `property_details` catalog. |
| `rooms[].rateplanCode` | string | ✅ | From your `property_details` catalog. |
| `rooms[].guestName` | string \| null | | |
| `rooms[].occupancy.adults` / `.children` | integer | ✅ | Real occupancy of that room. |
| `rooms[].prices[].date` | string | ✅ | `YYYY-MM-DD` per night. |
| `rooms[].prices[].sellRate` | number | ✅ | Rate per night. |

**Modify** uses the same shape as Book and represents the **complete new
state** — we replace, never merge. **Cancel** is a reduced payload
(`hotelCode`, `bookingId`, `cmBookingId`, `action: "cancel"`).

### 2.3 Multi-room bookings (important)

A booking with **more than one entry in `rooms[]`** is rejected as a whole
(no partial registration) and surfaced to the operator as an incident. The
operator then splits it into N reservations, one per room, with per-part
IDs (`{bookingId}#2` = second room of the booking). Consequences for you:

- A later `cancel` of the whole booking cancels **all live parts** (matched by
  the exact `{bookingId}` prefix — `BKG-1` never matches `BKG-11`).
- Nothing is lost silently; a person decides the split. If you can send one
  event per room instead, our processing is faster — but we support both.

### 2.4 Room resolution (strict, no guessing)

We resolve `rooms[0].roomCode` to an internal unit via our stored mappings.
A `roomCode` we have no active link for is **rejected with
`ok: false`** and an explicit message; we never guess a unit, and the
reconciliation sweep counts the same case as a divergence. This is why
**stable codes matter** (email question 12): if your side regenerates codes,
our links stop resolving.

### 2.5 Guest data and privacy

Guest fields are **optional and frequently masked by the OTA**; we never fail
on missing or masked values. We process guest personal data in the **EU
(Spain)**; see email questions 33 for hosting/DPA.

## 3. Responses and retry policy (the part for your queue)

| HTTP | When | Your emitter must |
|------|------|-------------------|
| **200** `{ success: true, ... }` | Event accepted (registered, replaced, cancelled, or idempotent replay). | **Stop.** Never re-send. |
| **404** `{ success: false, error: "Reserva no encontrada…" }` | `bookingId` unknown — the original `book` may still be in flight. | Retry with **backoff** (we send `Retry-After: 300`): 5 min → 1 h, cap **24 h**. If still 404, escalate to the operator. **Never** re-send a `no_show` as `book`. |
| **401** | Wrong Basic Auth. | **Stop retrying.** Reintroducing cannot fix credentials. |
| **400** | Invalid payload (missing `hotelCode`/`bookingId`/`channel`/`rooms`, unknown action, multi-room). | **Stop retrying.** Fix the payload, then re-send once. |
| **503** `{ success: false, error: "Conectividad no configurada" }` | Receiver not configured yet. | Retry with backoff (we send `Retry-After: 60`). |
| **500** | Unexpected receiver failure. | Retry with backoff (we send `Retry-After: 60`); full cycle is idempotent, retries duplicate nothing. |

- `Retry-After` (seconds) travels on every retryable response; its **absence**
  on 200/401/400 is part of the contract.
- Retries are **unconditional** on your side (our idempotency makes duplicates
  harmless); backoff escalates from the `Retry-After` minimum up to the 24 h
  cap on 404.
- A **409** on `book`/`modify` means our availability guard rejected it: fix
  your inventory instead of retrying the same event.

## 4. What we need from you to start (questions A/B in the accompanying email)

- Exact production base URL (byte-for-byte, `/api/v2/cm` prefix included),
  partner ID, production Basic Auth pair separate from sandbox.
- Confirmation whether `hotelCode` is the OTA hotel ID or an ID you issue.
- Confirmation that `roomCode`/`rateplanCode` returned by `property_details`
  are the codes your webhook will send, and that they are **stable**.
- Whether your emitter sends `no_show`, and for which channels.
- Any rate limit / quota / max date range per push call.
- Confirmation of the channels you support and per-channel sync scope
  (inventory, rates, restrictions, reservations).

---

*Volkern — channel connectivity integration. Contact details in the email
thread; technical contact available during the agreed test window.*
