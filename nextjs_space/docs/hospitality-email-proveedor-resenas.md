# Correo al proveedor — pedimos un endpoint de RESEÑAS (hoy no existe)

> **Contexto interno (NO enviar).** Verificado el **9-oct-2026** sobre el catálogo
> completo de `apidocs.aiosell.com` (bundle de su propia documentación, tabs
> Channel Manager `/api/v2/cm`, RMS/PMS público y OTA APIs): **no hay ningún
> endpoint de reseñas ni de reputación** — cero apariciones de `review` en el
> bundle, y el dataset de `POST /data/{pms}` solo admite `inventory`, `rates` y
> `reservation`. Su único grupo «advanced» con tema de huésped es **Messages**
> (chat), que ya integramos (`docs/hospitality-mensajes-canal.md`).
>
> Consecuencia de producto: las reseñas de OTA solo entran hoy por **CSV manual**
> (`lib/hospitality/resenas-import.ts`, panel Hospitality → Reseñas). El ciclo
> propio de reseña (enlace con token al huésped → moderación → web pública) cubre
> la venta directa, no lo que el huésped escribió en la OTA.
>
> **Lo que NO se va a hacer**: raspar la URL pública del canal. Va contra los
> términos de Booking/Airbnb, se rompe en silencio (JS + antibot) y aquí la regla
> es que el panel no mienta: una reseña importada tiene que conservar su fuente y
> su fecha reales. O lo expone el proveedor, o se sigue con CSV.
>
> **Qué pedimos exactamente**: lectura (empujón o consulta) y, si su API publica
> respuestas, poder responder. El contrato mínimo propuesto va en el correo; lo
> que decidamos con su respuesta se documenta en
> `docs/hospitality-connectivity-contract.md`.
>
> **Pendiente de envío por el operador**, en el mismo hilo que el resto de
> peticiones al proveedor (ver `docs/hospitality-checklist-envio-correos.md`). Al
> enviarlo: anotar fecha y respuesta aquí.

---

**Subject:** Guest reviews — request for a reviews endpoint (hotel `75fdbbce2e`)

Hi [name],

We are the PMS behind hotel `75fdbbce2e` (`Ciudad Patio Cuarenta`) and we already
consume your APIs for inventory, rates and reservations, including the **Messages**
pair (webhook + `/message-reply/{pms}`), which works well for us.

We would like to ask for one more capability: **guest reviews**.

## 1. What we found, so we are not asking you to search for us

Going through your public documentation (`apidocs.aiosell.com`), the API surface
we can see is:

- Channel Manager: property/mapping details, inventory and rate pushes,
  restrictions, mark no-show, the three fetch datasets (`inventory`, `rates`,
  `reservation`) and channel multiplier.
- RMS/PMS public API: bookings, stay data, room details, aggregate, POS.
- Messages: the inbound webhook and the reply endpoint.

There is **no reviews/reputation endpoint** and `POST /data/{pms}` does not accept
a `review` dataset. So today the only way for us to show a guest's OTA review in
the hotel's own dashboard and website is a manual CSV export from each extranet,
which is what we do — and it is exactly the kind of manual step we would like to
remove.

We are **not** going to scrape the OTAs' public pages: it is against their terms
and it breaks silently. We would much rather build this on your API.

## 2. What we would like to have

Anything of these shapes would unblock us; the first one is enough to start:

**A. Fetch reviews (minimum).** Reusing your existing pattern would be ideal:

```
POST {base}/api/v2/cm/data/{pms}
{
  "type": "review",
  "hotelCode": "75fdbbce2e",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD"
}
```

with an array response. Per review, the fields we actually use:

| Field | Why we need it |
| --- | --- |
| `reviewId` | Stable per channel — idempotency on our side. |
| `channel` | The review is shown with the OTA it came from. |
| `bookingId` | Links the review to the stay we already have. |
| `rating` (+ `maxRating` or `ratingScale`) | The OTAs do not all use 1–10 or 1–5. |
| `comment` / `title` | The guest's own words. These are never edited, only published or hidden. |
| `reviewerName` | As published by the OTA (no personal contact data needed). |
| `stayDate` / `reviewDate` | The public month is part of the review; we cannot invent it. |
| `language`, `reviewerCountry` | Display only. |
| `reply` (+ `replyDate`) | The hotel's existing answer, if it already answered in the extranet. |
| `url` | Public link to the review on the OTA (optional but useful). |

If `startDate`/`endDate` filter by **review date** (not stay date), please say so
explicitly — we lost a week once on `reservation`: the fetch filters by booking
date, not by stay date, and that difference matters a lot to us.

**B. Review webhook (nice to have).** Like the Messages webhook: you call us when
a new review is published (or when one is updated), with the same fields. That
removes polling entirely.

**C. Publish our reply (nice to have).** If the channels you relay allow the
property to answer a review, an endpoint in the shape of `/message-reply/{pms}`
(with `channel`, `reviewId`, `content`) would let the hotel answer from our
dashboard instead of jumping into each extranet.

## 3. What we already do, so you can see the target

- Guest reviews collected from **our own** guests are moderated and published on
  the hotel's own booking website, with the average shown to visitors.
- Historical OTA reviews are imported manually from CSV exports, keeping the
  channel and the stay date, deduplicated by a fingerprint.
- Reviews are **never** edited: they can be published, hidden or answered.

## 4. Questions for you

1. Do you already read reviews from the OTAs for the channels you relay
   (booking.com, expedia, agoda…)? If so, could you expose them?
2. If you do not have them, would you consider adding the fetch endpoint above?
   We do not need reviews for every channel — one or two would already be useful.
3. Do the OTAs you relay allow answering reviews through your API?

Happy to jump on a short call if it is easier, and thanks for the Messages pair —
it works.

Best regards,
[operador]
