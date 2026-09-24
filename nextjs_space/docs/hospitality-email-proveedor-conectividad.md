# Email al proveedor de conectividad — preguntas para primera hora

> Listo para copiar y enviar. **En inglés** (es su idioma de soporte) y numerado
> para que puedan responder en línea, pregunta por pregunta, sin reunión previa.
> Las respuestas a **A y B** desbloquean la configuración; el resto se puede
> contestar más tarde sin frenar nada.
>
> Procede del checklist de la reunión
> ([`hospitality-checklist-reunion-conectividad.md`](./hospitality-checklist-reunion-conectividad.md))
> y de la pata de activación en la OTA
> ([`hospitality-conexion-otas-activacion.md`](./hospitality-conexion-otas-activacion.md)).
> Las notas internas, al final, **no se envían**.
>
> **Preparación de envío (24 sep 2026):** rellenar `[name]` (uno por cuerpo y
> firma) y enviar al contacto de soporte/ventas del proveedor con copia técnica.
> **Adjunto obligatorio**: `hospitality-connectivity-contract.md` **expurgado**
> — quitarle antes el encabezado interno («Documento interno de desarrollo»,
> referencias al «plan maestro», la nota de marca y las secciones con decisiones
> nuestras; dejarles flujo de integración, endpoints, formatos y política de
> reintentos). Si se envía sin expurgar se les estaría entregando nuestro plano
> interno. Al enviarlo, marcar el paso **1.2** del runbook y anotar fecha en §9.
> Recordatorio a los 5 días hábiles con las preguntas A y B citadas arriba del
> todo. Cuando respondan: `npx tsx scripts/preflight-conectividad.ts --pegado
> "URL | ID de socio | usuario | contraseña"` antes de tocar el servidor — la
> misma validación que aplica la API al guardar.

---

**Subject:** Volkern (PMS) — channel manager integration: questions before go-live

Hi [name],

We are Volkern, a PMS for hospitality. We have built and tested the full
integration against your documented channel-manager API and sandbox: we push
availability and rates, we receive `book` / `modify` / `cancel` (and `no_show`
when you emit it), and we run a daily reconciliation sweep for missed
cancellations. The implementation is finished on our side.

Before we can go live with the first hotel we need your answers to the questions
below. They are numbered so you can reply inline. **A and B are the ones that
block us** — everything else we can keep building while we wait.

### A. Access and credentials

1. Please confirm the **exact production base URL**, byte-for-byte, including
   the `/api/v2/cm` prefix. (We have seen that the bare host returns an nginx
   404, so we want the full path in writing.)
2. What is our **partner ID** (the `{pms}` segment in every path)? If it does not
   exist yet, what is the issue date?
3. Please send the **production Basic Auth username and password**, separate from
   the sandbox pair. What is your procedure and notice period for rotating them?
4. Is the **sandbox still active** for pre-onboarding push tests (sample partner,
   `sandbox-pms` hotel)? We would like to exercise inventory and rate pushes
   against it before the first real property.
5. Please confirm these endpoints exist and are current:
   `property_details/{hotelCode}`, `update/{pms}`, `update-rates/{pms}`,
   `data/{pms}` and `marknoshow/{pms}`.
6. Do you apply any **rate limit, quota or maximum date range** per push call
   that we must respect? We did not find this in the public docs and we would
   rather send within your limits from day one.

### B. Property and room mapping

7. For each property, **what value should we use as `hotelCode`** — the OTA's
   hotel ID (for example the Booking.com Hotel ID), or an identifier your
   platform issues? We need it to be unique per property on our side.
8. Does `property_details/{hotelCode}` return data **only after** the channel is
   enabled and the rooms are mapped? In other words: is the catalog empty before
   the OTA connection exists?
9. After the hotel shares its hotel ID and the room-by-room equivalences with
   you, **who creates the mapping** and what is your usual turnaround?
10. Through **which channel** do we (and the hotel) request that mapping — email,
    ticket, portal? Who handles it?
11. Do you **notify us or the hotel when a room mapping changes** on your side?
    If a mapping changes, the codes we stored stop resolving, and we would rather
    learn it from you than from a failed reservation.
12. Can you confirm that the codes we must store are exactly the ones
    `property_details` returns (`room_id`, `rateplan_id`) and that **these codes
    are stable** over time (they do not get regenerated)?
13. Do you publish **`min_occ` / `max_occ`** per room type in `property_details`?
    We validate our unit capacity against them.
14. Should we expect **rate plan codes coming from OTA default plans** (for
    example Booking.com non-refundable or long-stay plans)? Your Booking.com
    guide recommends deleting them before mapping — is that still your
    recommendation, and what happens on your side when a plan exists in the
    channel but not in your setup?

### C. Enabling you inside each OTA

15. For each OTA (Booking.com, Expedia, Airbnb, Agoda, Ctrip, Tiket, Traveloka…)
    can you confirm **which ones the hotel can enable itself** and which ones
    require an email to the OTA's account manager?
16. **Booking.com:** after the hotel connects via Connectivity Provider, is
    sending you the Hotel ID and the room mapping the only path, or is there a
    portal for it?
17. **Expedia:** your guide asks to enable you for **both** rates & availability
    **and** reservations. If a hotel enables only one of the two, what is the
    symptom on your side — and can you detect it, so we can warn the hotel
    instead of discovering it when no reservation ever arrives?
18. **Airbnb:** is `https://live.aiosell.com/api/v2/cm/airbnb_authorize` still
    the correct authorization URL? Does the connection bind to the **Airbnb
    account** (all listings) or per listing?
19. **Airbnb:** do reservations arrive through the same webhook with a channel
    value we can recognise? Are there fields that differ from Booking/Expedia
    (guest name, email/phone masking, pay-at-hotel flag)?
20. Your API documentation lists `marknoshow` for **booking.com and gommt only**.
    Can you confirm **Airbnb is not covered**, so that our no-show handling stays
    manual for that channel?
21. Do you need the Airbnb success-page **screenshot every time**, or once per
    account? Can the hotel send it to us and we forward it, so the hotel does not
    have to coordinate with two parties?

### D. Your webhook to us (our receiver)

22. Will your emitter send **`no_show`** events? If so, for which channels?
23. **Multi-room bookings:** do you send one `book` per room, or one booking with
    several entries in `rooms[]`? We treat multiple rooms as an incident the
    operator splits manually, so we would like to confirm the shape you send.
24. Do you respect our **`Retry-After`** header on retryable responses (60 s on
    503/500, 300 s on 404) and cap the 404 retry at **24 hours**?
25. Can your queue **retry safely**? Our receiver is idempotent by `bookingId`,
    so duplicates are harmless — we only need your confirmation that retries are
    unconditional.
26. **`modify`:** is it sent as the **complete new state**? We replace on
    receipt, never merge.
27. We will send you our **webhook URL and the Basic Auth credentials we issue**
    for your emitter. Do you prefer them by email or through a secure channel?
28. Do you **sign webhook payloads** (HMAC or similar) in addition to Basic Auth?
    We validate Basic Auth in constant time today; if you sign, we will verify
    your signature as well.

### E. Scope, cadence and operations

29. Please confirm the **full list of channels** you support, and per channel
    what is synchronised: inventory, rates, restrictions, reservations.
30. What is the **maximum expected propagation delay** both ways: our change
    becoming visible in the channel, and a channel reservation reaching our
    webhook?
31. Are **restrictions** (min stay, closed to arrival/departure) supported across
    all channels, or only some?
32. We are working on the basis that these are **out of scope**: channel
    multiplier (we do not use it in v1), migration of history from another PMS,
    and charging OTA reservations (the OTA settles them; we record them
    manually). Please confirm.

### F. Contract, data and support

33. Do you have a **partner agreement and a data processing agreement**? The
    reservation payload contains guest personal data (names, phone, sometimes
    email) and we process it in the EU (Spain). We need to know **where you host
    and store that data** and under which terms.
34. Who is our **named technical contact** for the test window, through which
    channel, and what is your response window? We are in Europe — we would like
    to know what to expect before we start the test.
35. How do you **notify downtime or maintenance windows**? Do you have a status
    page we can monitor?
36. Can we agree a **2–5 day controlled test window** using the hotel's real
    calendar? Which dates are available on your side?

**What we already have ready**, so there is nothing to wait for from us: the full
integration, the inventory and rate pushes, the reservation receiver with
idempotency and reconciliation, and the emitter integration guide for your team
(attached). As soon as we have A and B we can configure the first property and
push to your sandbox the same day.

Thanks — happy to jump on a call if any answer is easier to give live.

Best regards,
[name]
[role] · Volkern

---

## Notas internas (NO enviar)

**Por qué A y B bloquean y el resto no.** A es el acceso (sin URL byte a byte,
partner ID y Basic Auth no hay panel que configurar: el botón «Probar» no tiene
contra qué). B es el catálogo (sin `hotelCode`/`roomCode`/`rateplanCode` no hay
paso 5 del wizard, y sin mapeo en la OTA el catálogo no existe — preguntas 7–11).

**Qué se puede construir mientras responden.** C, D, E y F no frenan nada: el
ciclo entrante está probado contra mock y la guía del emisor ya está escrita, así
que su equipo puede programar en paralelo.

**De dónde sale cada bloque.** A ← bloque 1 del checklist (1.1–1.7). B ← bloques
1.4–1.9 más la pata de activación en la OTA. C ← artículos públicos del
proveedor (Booking, Expedia, Airbnb) y la tabla de canales del contrato. D ←
bloque 2 del checklist y la guía del emisor. E ← bloque 3. F es nuevo: DPIA,
contacto y ventana.

**Lo que preguntamos a propósito aunque creamos saberlo.** Las preguntas 15–21
salen de sus artículos públicos, que describen los clics del **hotel**: lo
preguntamos porque necesitamos su confirmación por escrito de quién ejecuta cada
vía y con qué plazo (1.8), no porque dudemos del artículo.

**Huecos que este email destapa en nuestra documentación**, por si hay que
tocarla después: si `hotelCode` es el ID de la OTA o un código suyo (pregunta 7);
si hay límites de rate/quota que nuestro emisor de pushes deba respetar
(pregunta 6); y si firman los payloads además del Basic Auth (pregunta 28). Hoy
el contrato no dice nada de los tres.

**Nada de esto se envía con nombres comerciales en material de cliente.** Este
email es técnico, entre nosotros y el proveedor; en producto y en la web sigue
siendo «Conectividad de Canales».
