# Correo de arranque a NOBEDS — acceso, disponibilidad, reservas y las 8 bloqueantes

> **Estado interno (NO enviar).** Cuerpo listo para copiar; va en **inglés** (es
> su idioma de soporte) y numerado para que respondan en línea, pregunta por
> pregunta. Cierra **F0** del plan
> [`hospitality-nobeds-conectividad.md`](./hospitality-nobeds-conectividad.md):
> las ocho preguntas de su §8 aparecen aquí dentro (A–E), marcadas como
> bloqueantes, junto con lo que hace falta para dar de alta el primer hotel.
>
> **Preparación de envío:**
>
> - Rellenar `[name]` (saludo y firma) y poner en copia a quien vaya a llevar la
>   cuenta del partner.
> - **No se adjunta nada.** Todo lo que necesitan está en el cuerpo; el plan
>   interno NO se adjunta (lleva estrategia, fases y el nombre del proveedor
>   anterior). Si piden un documento, se les manda solo el fragmento de §2 y §4
>   del contrato, nunca el plan completo.
> - **No nombrar al proveedor anterior** en este hilo. Se habla de «the
>   property's current channel manager». Motivo: no queremos que se cruce
>   información comercial entre los dos, ni que el anterior se entere del
>   cambio por un tercero.
> - Lo que aquí se afirma del API está **medido** el 22-oct-2026 contra
>   `https://api.nobeds.com` con el token público de demostración y leído en su
>   swagger real (`/swagger/v2/swagger.json`, 52 operaciones, 24 esquemas). No se
>   cita el token en el correo.
> - Además del API se leyó su **centro de ayuda público** (`nobeds.com/es/ayuda`)
>   el 22-oct-2026. De ahí salen las preguntas **28–31** y el refuerzo de **17** y
>   **24**: comportamientos que su producto documenta y que el API ni expone ni
>   desmiente. Donde el centro de ayuda ya lo explica, el correo no pide la
>   explicación: pide la forma exacta en el cable.
> - Todo eso se amplió con una **segunda pasada de solo lectura** el mismo 22-oct
>   (§4.4.1 del plan): 305 reservas, 200 entradas de `Logs`, `Rentals` frente a
>   `Status`, y seis escrituras de sondeo que no entran. De ahí salen las cifras
>   que se citan en 1, 4, 10, 16, 23 y 30.
> - Las respuestas que **ya llegaron** de su asistente se clasificaron en la §4.7
>   del plan: dos se caen al probarlas y cinco repiten nuestras hipótesis. Este
>   correo no las discute: pide la confirmación de ingeniería donde toca.
> - Recordatorio a los **5 días hábiles** con las seis bloqueantes citadas en la
>   tabla final. Al recibir respuesta, volcarla en §4 y cerrar §8 del plan antes
>   de escribir la primera línea de F1.
> - Las notas internas al final **no se envían**.

---

**Subject:** Volkern (PMS) — Nobeds integration kick-off: access, availability rules and the answers we need before building

Hi [name],

We are Volkern, a PMS for independent hotels. We are adopting Nobeds as the
distribution and property-management layer for our hospitality customers, and I
would like to open the technical thread properly rather than work from the
public docs.

We have already read your live API instead of the marketing pages: we pulled
`/swagger/v2/swagger.json` (52 operations, 24 schemas) and ran **read-only**
calls against the public demo token on 22 October 2026 — hotel info, rentals,
availability, restrictions, reservations, reviews, messages, logs and the MCP
endpoint (26 tools). So the questions below are not "what does your API do";
they are the specific points where the spec is ambiguous or the behaviour we
measured needs your confirmation in writing. Where your help centre already
documents a behaviour, we quote it and ask only for its wire-level form, so you
are not explaining your own product twice.

To be explicit about one design decision, because several questions depend on
it: **we are not building a second calendar.** Your platform stays the owner of
availability and of the OTA nightly price. What we will write is narrow:

- **direct bookings** created with `POST /api/Bookings?room_id=`, priced by our
  own engine (promotions, extras, deposits, seasonality);
- **closures and restrictions** — `closed`, `coa`, `cod`, `min_stay`,
  `max_stay`, advance notice — and `quantity: 0` when a unit goes out of
  service.

We will **not** push availability counts, and we will not overwrite OTA prices
night by night. We read your availability to price our booking engine. This is
deliberate: with two systems writing the same nights, the gap between a write
and an OTA reservation is a room sold twice, and that is the failure we most
want to leave behind.

### A. Access, sandbox and property provisioning

1. **Write sandbox.** The public `api_token` reads (`GET` 200) but **cannot
   write**: six different body shapes — `{availability: …}`, `{item: …}`, flat,
   a minimal booking, and `DELETE` with and without `date` — all return **500
   with an ASP.NET HTML page**, never the `403` JSON your docs describe. We were
   told the demo token is enough for testing; for writes it is not. Please send
   a test property with a write-enabled token, tell us what is reset nightly,
   and confirm whether the demo token will ever accept a write.

2. **Token model.** One token per hotel, or one per chain/account? We will hold
   one hotel per customer and expect to reach 1,000 properties, so we need to
   know whether we must store 1,000 tokens, or whether there is a partner-level
   credential that can act on behalf of the hotels that authorise us. Is there a
   cap on tokens per account? One answer we received said an API subscriber at
   **£99/month can manage "up to 0 properties"** with a single token — that
   number cannot be right, and it contradicts "one token per hotel" in the same
   sentence. Please give the real figures: price, properties per partner token,
   and whether that token can act for hotels that authorise us.

3. **Rotation.** Can a token be rotated **without a downtime window**, and can
   both the old and the new token be valid during an overlap so a bad deploy
   does not cut a live hotel? Who rotates it — us in a panel, or you by ticket —
   and with what notice? The token travels in the path of every call, so it also
   lands in proxy logs; we will treat it as a secret and want a routine rotation
   path, not an incident path.

4. **Room catalog, and rooms that stop existing.** `GET /api/Status` and
   `GET /api/Rentals` return the same five active rentals here; `Rentals` is the
   richer one (capacity, subtype, currency, and the per-channel ids such as
   `booking_room_id`, `booking_rate_id`, `airbnb_listing_id`), which answers
   half this question already. The other half is a problem we measured: of 305
   reservations in the demo, **58 reference `room_id`s that appear in neither
   endpoint** — retired rooms whose bookings remain. How do we detect that a
   room was retired rather than renamed? And, most important, **are `room_id`
   values ever reused** for a different room? Our mappings key on them, and a
   reuse would silently attach a booking to the wrong unit.

5. **Onboarding route.** Do you have a partner process for a PMS that
   integrates on behalf of many hotels — one agreement, per-hotel
   authorisation — or is each hotel expected to open an account and hand us its
   token? This decides our onboarding screen, so we would rather build the right
   one.

### B. Availability, restrictions and rate plans

6. **Bulk write — blocking.** For `POST /api/Availability/bulk/{token}`: what is
   the maximum number of items per call, and the maximum date range per call? It
   takes an array of `{room_id, date, price, quantity, ...}` with **no `rid`**,
   so I assume it is an upsert on `(room_id, date)` — please confirm. And the
   response returns `{rid, room_id, date, action}` per item with **no error
   field**: if one item is rejected, does it come back with a null or absent
   `rid`, with a particular `action`, or is it silently omitted from the array?
   We must be able to attribute a rejected item to a room and a night; a
   rejection we cannot see is a night we believe is closed and is not.

7. **Single write.** On 22 October a `POST /api/Availability` with the
   documented `availability` object answered **400, "The item field is
   required"**; that error is **no longer reproducible** — every shape we send
   now returns 500 HTML. Is the expected body `{"item": {...}}`, or is bulk the
   only supported write path? We ask rather than guess because the error named a
   field that does not exist in your schema, and because a body shape we cannot
   test is a body shape we cannot ship.

8. **`one`..`ten` — blocking.** The availability model (and the bulk item)
   carries numeric fields `one` … `ten`, plus per-channel strings `airbnb`,
   `booking`, `expedia`, `agoda`, `hostelworld`, `trip`. Please state exactly
   what they are. Our reading is that `one`..`ten` are **prices for stays of
   1 to 10 nights** and that the channel strings are per-channel stop-sell or
   override flags, but neither is in the docs. We ask because `one`..`ten` is
   the only candidate in the model for minimum-stay-by-arrival-day, which we
   currently support and cannot express with `min_stay` alone.

9. **Rate plans.** A Volkern unit can carry up to four rate plans (flexible,
   non-refundable, and so on). Your availability model has **one price per room
   and night** and no rate-plan code — neither in availability nor in
   `Bookings`. Please confirm that, for OTA distribution, those four collapse to
   a single nightly price, and that on the direct side `price`/`total` are free
   values we compute. If a hotel wants a non-refundable plan sold on
   Booking.com, is that configured outside your API (in the OTA extranet), or do
   you support it somewhere we have not found?

10. **Limits and propagation.** What are the rate limits on `GET
    /api/Availability` and `GET /api/Bookings` — per token, per IP, or global?
    What is the widest window you accept? At 1,000 properties we will poll
    rather than subscribe to anything, so we need the ceiling per property. And
    when we write availability or a restriction, is it visible to the OTAs
    immediately, or is there a propagation delay? Is there a way to confirm a
    write landed (the response, `get_restrictions`, or `Logs`)? We checked
    `GET /api/Logs`: the 200 entries we retrieved are all demo heartbeats on
    `/api/demo`, so it does not answer that. What we do see is the per-night
    `comment` on the availability row carrying the edit history (`"Availability
    modal SET quantity: 1 …"`). Is `comment` a **supported** audit field, or
    cosmetic text we should not parse? Is there any endpoint that returns the
    calendar log your interface shows under Calendar → Logs?

### C. Bookings — the part that has cost us money before

11. **Minimal create body — blocking.** `POST /api/Bookings?room_id=` takes the
    `order` schema, but in the POST variant almost every string is marked
    `required: true` — `inserted`, `blob`, `photo_url`,
    `invoice_timestamp`, `cleaned_timestamp` included — while the same schema in
    `PUT` marks them all nullable. That reads like the read model reused for
    creation. Which fields are **actually required** to create a reservation,
    and can you send us one minimal valid body that works on your side? Ours
    would be `checkin`, `checkout`, `name`, `email`, `phone`, `guests`, `total`
    and our reference in `referral` or `comment`.

12. **Atomicity — blocking, and the most important question in this email.**
    Does creating a booking decrement availability **atomically** and reject
    the booking when the room is already sold? With which HTTP status and body?
    We are removing our own availability guard precisely because we do not want
    two systems counting the same night; if your create path does not enforce
    that under concurrency, we need to know now, before we promise a hotel it
    cannot be overbooked.

13. **Visibility.** Does a booking created through the API block channel
    availability **immediately** — it appears in the PMS calendar and the OTAs
    stop selling that night — or only after a sync cycle? If there is a delay,
    how long, and is it visible anywhere?

14. **Cancellation — blocking.** `DELETE /api/Bookings?order_id=&date=` requires
    a date, so: does it cancel the **whole reservation** or only the nights from
    `date` onward? What `status` does it leave behind? And does cancelling
    reopen availability to the OTAs automatically, or is that a separate step?
    We need 14 to be as certain as 12, because a cancellation that does not
    reopen is lost revenue, and one that reopens a night still occupied is an
    overbooking.

15. **Update.** Is `PUT /api/Bookings?order_id=` a full replacement or a patch?
    Which fields does it ignore? Can it move the dates or the room? We would
    only ever use it for dates or guest data on a booking we created.

16. **Cancelled reservations — answered, with one follow-up.** We checked: they
    keep appearing with `status: Cancelled`, plus a `canceled` timestamp (order
    3183218 in the demo). So a cancellation is a field, not an inference, and
    that removes our most dangerous guess. The follow-up is retention: **is a
    cancelled reservation ever hard-deleted** after a period, or does it always
    remain? If it can disappear, our poller needs the second confirmation
    anyway, and we would like to know the retention window.

17. **`status` — blocking.** It is free text, and on the demo property we
    counted 14 distinct values, including `Approved` (118) and `approved` (2) as
    **different strings**, plus `New`, `Cancelled`, `Checked-In`, `PaidOTA`,
    `Debtor`, `Prepaid`. Your help centre documents **sixteen** statuses with
    meaning — new, approved, modified, cleaned, check-in, check-out, no-show,
    cancelled, invalid card, debtor, problematic, prepaid, paid, paid by bank,
    paid by card, completed — and deliberately mixes booking state with billing
    and housekeeping. What we need from you is the **machine values** the API
    emits and accepts: is the comparison case-sensitive, is `modified` a resting
    state an operator has to clear, which of the sixteen can be **set** through
    the API, and which single value means "confirmed and billable". We normalise
    to a fixed set on our side, and a value we misread as "not cancelled" is a
    room sold twice.

18. **Date filter.** We measured that `fromdate`/`todate` filter by **check-in
    date**: a reservation created on 6 February for an 18 February arrival
    appears in the 15–20 February window and not in 1–10 February. Please
    confirm that is intended. And how do we retrieve reservations **currently in
    house** — check-in before `fromdate`, check-out today? A check-in filter
    hides exactly the guests who are in the building, and we need them for
    arrivals, departures and occupancy.

19. **Multi-room bookings.** Does one order cover several rooms, or is it one
    order per room? If several, how do we identify the parts — same `order_id`
    with different `room_id`?

20. **Retries.** If we retry a create after a timeout (we never saw the 200), is
    there an idempotency key or a uniqueness constraint on `referral_order_id`,
    or would a retry create a second reservation? We would rather key it
    ourselves than discover duplicates in a hotel's calendar.

### D. Messaging and reviews — the reason we are moving

21. **Messages.** `POST /api/Messages/send` takes `{bookingId, message}`. Is
    `bookingId` the numeric `order_id`, the OTA `referral_order_id`, or `ruid`?
    `GET /api/Messages?rid=` — is `rid` that same identifier? Is a thread bound
    to a reservation or to a guest, and **can we reply to messages that came
    from Booking.com or Airbnb** through you, or only to channels where you
    relay messaging? Which channels support it today? This is the capability
    that made us choose Nobeds over the alternative, so we want to build the
    inbox against the right identifier from day one.

22. **Reviews.** `GET /api/Reviews?rid&fromdate&todate` — which channels do you
    import, is the score normalised to a common scale, and is the endpoint
    read-only or can we publish a reply? Today we ingest reviews from CSV, so
    read-only is already an improvement; we just need to know which it is.

### E. Operations, migration and support

23. **Health surface.** `GET /api/Status` returns `hotelName`,
    `subscriptionTill`, `isActive`, `serverTime` and per-room channel state;
    `GET /api/Logs?limit=` returns recent logs. Are these supported for
    programmatic monitoring (our uptime checks), and does `subscriptionTill`
    mean what it looks like — if it lapses, what stops working: the API, the OTA
    sync, or both? We would rather alarm before a hotel discovers it. In the demo
    `subscriptionTill` is already in the past (2026-08-28) while `isActive` is
    true and every `GET` still answers, which is why we ask rather than assume.

24. **Migrating a live hotel.** Your help centre documents an import path —
    Settings → Import, a single spreadsheet template applied one listing at a
    time, the reference column as the duplicate key, and the recommendation to
    import all **future** reservations *before* connecting the OTAs. That is close to the cutover we
    want, so: (a) stop the previous provider writing availability, (b) import the
    hotel's live future bookings, (c) connect you, (d) map rooms to the OTA
    listings. Can that import be run for a hotel we onboard — by you on our
    behalf, or by us with partner rights? Does it accept our own identifier in
    the reference column, and does it reject or merge a row whose reference
    already exists? Who does the OTA mapping, us, the hotel or you, and with what
    turnaround? And **can a hotel run in observation mode for a few days** —
    connected but not yet publishing — because that is how we intend to avoid
    repeating an overbooking.

25. **OTA mapping and changes.** When a room has several room codes and rate
    plans on the OTA side, how is that collapsed on yours — one listing per
    room? And do you notify us when a mapping changes? A code that stops
    resolving is invisible to us until a reservation fails or a night stays
    open, and either one is expensive.

26. **Contract and guest data.** Do you have a partner agreement and a DPA? The
    reservations carry guest name, email, phone and country; we process in the
    EU (Spain), so we need to know where that data is hosted and stored, and
    under which terms.

27. **Support.** Who is our named technical contact for the integration, through
    which channel, and with what response window? How do you announce downtime
    or maintenance — status page, incident feed, email? Is there an SLA, and
    what is the escalation path when a reservation does not arrive? Support
    responsiveness is a large part of why we are here, so I would rather agree
    the expectations in writing now than during the first incident.

### F. Four things your help centre documents that change what we build

These are not complaints and not feature requests: they are places where your
public documentation answers half the question, and the missing half is what we
would get wrong in production.

28. **Listings, `quantity`, and physical rooms.** Your help centre describes
    availability as a **quantity**: `0` closed, `1+` the number of units that may
    be sold on that listing, where a listing can be a room, an apartment or a
    whole villa. For a hotel we intend to map **one Volkern unit to one
    listing**. Two answers we need: when a listing carries `quantity > 1`, does a
    reservation in `GET /api/Bookings` identify **which** physical unit it
    occupies, or only the listing? And is a hotel meant to be created as N
    listings of quantity 1, or as one listing per room type with quantity N?
    This decides our mapping keys and whether we can assign a room number at
    check-in.

29. **The price we read or write versus your per-channel extras.** Your help
    centre documents **extra rates per channel** — a percentage or a fixed amount
    added to the base rate for Booking.com, Airbnb, Expedia, Agoda, HostelWorld
    and Trip.com — so a channel's sell rate is not necessarily the base rate. Is
    the `price` in `/api/Availability`, and the price we would write, the
    **base** before those extras, or the final channel price? Applying an extra
    on top of a price we already computed for a channel would double-count the
    commission, and our revenue comparison must not read your channel price as
    the hotel's net rate.

30. **Your own direct booking form.** Your help centre documents a direct
    booking form at `nobeds.app/DirectForm/Index/{hotel_id}`, embeddable in the
    hotel's website. For our hotels the direct channel is Volkern — promotions,
    deposits, extras and our own guest record — so can that form be **disabled
    per hotel**? We can already see `Nobeds.app` as a `referral` value in the
    demo (48 bookings); is that the form? And if a hotel keeps it, is there a
    value that distinguishes **its** bookings from our API ones, so the poller
    does not duplicate a guest who also exists in Volkern?

31. **Channel matrix and the iCal blind spot.** Your channel page splits
    integrations into **two-way API** (Booking.com, Airbnb, Expedia) and **iCal**
    (Agoda, Vrbo/HomeAway, Hostelworld, TripAdvisor), while your per-channel rate
    page also lists **Trip.com** — so we would like the authoritative matrix:
    which channel is API, which is iCal, and per channel whether you receive
    **rates, inventory, restrictions, reservations and cancellations**. The
    `referral` values we see in the demo go beyond that list (`Appagee`,
    `billuu`, `Direct Engine`, `Direct step`, `One page`, `Manual`), so please
    send the **closed list** of values and what each one means. The
    specific risk: an iCal channel produces calendar events, not reservations,
    so a cancellation there has no event to receive. If that is the case for
    Agoda or Vrbo, our reconciliation must treat their nights as "availability
    changed", never as "guest cancelled" — and we should be able to tell the
    hotel that in writing.

### What we need first

Only these block the first line of code; everything else we can build while you
answer.

| # | What we need | Why it blocks |
| --- | --- | --- |
| 1 | A **write-enabled sandbox** property, with token and base URL | Without it we cannot test create/cancel or bulk writes at all |
| 2 | **Token model** (per hotel vs partner-level) | Decides our data model and onboarding screen |
| 6 | **Bulk limits** and what a **rejected item** looks like | A silent drop is a night we believe is closed and is not; we cannot detect it from the response |
| 11–12 | Minimal **create booking** body and whether it is **atomic** | It is the only thing standing between us and another overbooking |
| 14, 17 | **Cancellation semantics** and the **status list** | Cancellation is the other direction of the same overbooking risk |
| 8 | What **`one`..`ten`** and the per-channel strings are | They are the only way we can express restrictions we already support |
| 28 | Whether a listing's `quantity` and a **physical room** are the same thing | Decides whether `room_id` is a room or a room type, and whether a hotel can be mapped without collapsing rooms |

One row is missing on purpose: **cancelled reservations do persist**, with
`status: Cancelled` and a `canceled` timestamp, so we checked it ourselves and
only ask about retention (16).

We are not asking you to promise features. We are asking what the API does
today, so we can design around it instead of discovering it in a hotel's
calendar.

If it is easier, I am happy to take a 30-minute call with your integration team
— but please answer inline as well, so the answers stand on their own when
either of us hands the integration over.

Thanks,

[name]
[role] · Volkern

---

## Notas internas (NO enviar)

**Correspondencia con las 8 bloqueantes del plan (§8).** 1 webhooks → aquí no
se pregunta por webhooks «en abstracto»: se pregunta por el sandbox de
escritura (#1) y, si existen, que lo digan en la respuesta; el diseño ya asume
sondeo, así que no bloquea. 2 bulk → #6. 3 `one`..`ten` → #8. 4 canceladas →
#16 (y #14, que es la que de verdad importa: si el `DELETE` reabre la noche).
5 rate limit → #10. 6 token → #2 y #3. 7 atómico → #12 (y #13, su efecto
visible). 8 contrato de errores → #1 y #7 (los dos 400/500 medidos, puestos como
cita concreta en vez de «¿cómo gestionan errores?»).

**Por qué se pregunta lo que el swagger ya dice.** Porque el swagger está
incompleto o se contradice: `POST /api/Availability` responde 400 nombrando un
campo `item` que no existe en el modelo; el schema de `order` marca como
obligatorios campos de lectura solo en el POST; y `one`..`ten` no tiene
descripción. Nada de eso se arregla leyendo el JSON, y todo eso rompe un
sincronizador.

**Lo que se puede construir mientras responden (F1 del plan).** Cliente HTTP con
token por propiedad, catálogo desde `Status`/`list_rentals`, lectura de
disponibilidad y reservas, tabla de normalización de `status`, panel de salud y
la migración de `ConnectivityMapping` a `provider = 'nobeds'`. Nada de eso
necesita las respuestas; la escritura (F2) sí.

**Huecos que este correo destapa en nuestro plan**, por si hay que corregirlo:
el catálogo de habitaciones no tiene endpoint propio (sale de `Status` o
`Rentals`, no de `Hotels`) y la §5.4 del plan lo da por hecho; el `DELETE` con
`date` obligatorio sugiere cancelación por noches, no por reserva; y no hay
mención de idempotencia en ningún sitio, lo que hace el reintento de creación
peligroso por defecto.

**Lo que añadió el centro de ayuda (22-oct) y antes no estaba en ningún sitio.**

1. La disponibilidad es una **cantidad**, no un booleano: un listing puede tener
   varias unidades y entonces `room_id` no identifica una habitación física
   (§4.6 del plan). Rompe el supuesto «un `room_id` = una unidad» de la §5.4.
2. El precio de canal es **tarifa base + extra por canal**, así que el precio
   de OTA que leemos no es la tarifa del hotel (pregunta 29).
3. Existe un **motor de reservas directas** suyo, incrustable: es un segundo
   escritor de venta directa si no se desactiva (pregunta 30).
4. Los canales **iCal** (Agoda, Vrbo, Hostelworld, TripAdvisor) no producen
   reservas ni cancelaciones como eventos; para ellos la única señal es el
   calendario (pregunta 31).
5. Para migrar hay una **importación por Excel** documentada, que además
   recomiendan hacer *antes* de conectar las OTAs: es la receta de cutover de F5
   y evita inventar un backfill por API (pregunta 24).
6. Los estados están publicados (16, con significado) y mezclan reserva,
   cobro y limpieza: `Cleaned` no afecta disponibilidad y las cancelaciones
   reabren y notifican a los canales — eso último ya responde media pregunta 14
   a nivel de producto, no de API.

**Respuestas del asistente (22-oct): triage.** Contestó A–E, no F, y con varios
fallos: «hasta 0 propiedades» por £99/mes es imposible; el «sandbox de escritura»
es falso (nuestras seis formas de escribir dan 500); «bloquea el canal
inmediatamente» choca con su propio centro de ayuda; y «modo observación» choca
con su modelo de canales. Cinco respuestas (B1, B2, B3, B4, C1) son **eco literal**
de lo que ya habíamos deducido: no son evidencia y no se citan como tal. Solo tres
se aceptan, y porque las medimos nosotros: canceladas persisten (C6), reseñas
normalizadas y de solo lectura (D2), `Status` como catálogo (A4, parcial). Su
«comparación sensible a mayúsculas» se anota pero no cambia nada: normalizamos a
minúsculas porque en sus datos conviven `Approved` y `approved`. Detalle y
consecuencias en la §4.7 del plan. Regla para el resto del proyecto: **respuesta de
asistente ≠ contrato**; si no está medida o firmada por ingeniería, no entra en
código.

**Sobre el nombre comercial.** Este hilo es técnico, entre nosotros y el
proveedor, y ahí sí se les nombra. En producto, web, correos a clientes y PDFs
sigue siendo **«Conectividad de Canales»**: la regla de §9 del plan no cambia.
