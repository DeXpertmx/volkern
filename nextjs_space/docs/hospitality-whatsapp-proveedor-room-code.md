# WhatsApp para Aiosell: por qué su `/update` descarta tres de nuestras cuatro habitaciones

> Nota interna — medición propia del **2026-10-14 05:57 UTC**, después de que el hotel
> completara su activación en Aiosell. Las sondas viven en `scratch/` (ignorado por git) y son
> de solo lectura en base; al canal solo le mandan el mismo dato y la misma ventana que el
> producto ya empuja (`available=1`, `2026-10-14..2027-01-11`), **una habitación por petición**.
>
> | Prueba | Respuesta real | Qué prueba |
> |---|---|---|
> | `GET /api/v2/cm/property_details/75fdbbce2e?partnerId=volkern-hospitality` | **200** con `2b`, `2a`, `1a`, `1b`, todas `"active": true`, `count 1`, occ 1–4 y **sus cuatro planes** (`1a-s-ep`…`1a-q-ep`, etc.) | su catálogo publica las cuatro habitaciones y los planes que enviamos |
> | `connected_channels` de esa misma respuesta | 4 anuncios de booking.com (`14279079`, `14279259`, `14279656`, `14279792`) en `inventory`, `rates` y `reservation` | la activación del hotel **sí** registró el cuarto anuncio (`14279259`); el 13-oct eran tres |
> | `POST /update/{volkern-hospitality}` `roomCode "2b"` | 200 `success: true`, **sin avisos** | el cuerpo y las credenciales son válidos |
> | mismo cuerpo, `roomCode "2a"` / `"1a"` / `"1b"` | 200 `success: true`, `warnings: ["INVALID_ROOM_CODE : 2a"]` … | descarta la habitación, no la petición |
> | mismo cuerpo, `roomCode "2A"` / `"1A"` / `"1B"` (nombre) | `INVALID_ROOM_CODE : 2A` … | no es que esperen el nombre en vez del código |
> | mismo cuerpo, los ids de Booking de su propio desplegable (`1427979201`, `1427965601`, `1427925901`) | `INVALID_ROOM_CODE : 1427979201` … | no son los identificadores que acepta `/update` |
> | mismo cuerpo, código inventado (`zzz-sonda-inexistente`) | `INVALID_ROOM_CODE : zzz-sonda-inexistente` | las tres rechazadas se comportan **igual que un código inexistente** |
>
> Conclusión medida: el fallo está **dentro de su channel manager**, en el mapeo por habitación
> hacia los anuncios (no en Booking, que no llega a recibir esas habitaciones, ni en nuestro
> payload, que es byte por byte el mismo que aceptan para `2b`). Nuestros vínculos usan los
> `room_id`/`rateplan_id` exactos del catálogo. Las tarifas se descartan con el mismo patrón
> (`INVALID_RATEPLAN_CODE : 1b-s-ep` …), que es lo mismo visto desde el plan.
>
> Cabos abiertos que no se pueden cerrar desde nuestro lado: el interior de su mapeo no lo expone
> su API; y el hotel no tiene guardado su propio `partnerId`, así que empujamos con el de
> plataforma — el catálogo completo se lee con él, pero es la única variable que no podemos probar.
>
> Idioma: **inglés**, como el resto de mensajes al proveedor. India es IST (UTC+5:30): mejor
> ventana **03:30–09:30 UTC**.

---

## Mensaje (copiar y pegar)

Hi team, one room out of four is accepted by your CM and we cannot tell why. Everything below is measured against your live API today.

Hotel: Ciudad Patio Cuarenta — hotelCode `75fdbbce2e` — partner `volkern-hospitality`.

1. GET /api/v2/cm/property_details/75fdbbce2e?partnerId=volkern-hospitality → 200, and it returns FOUR rooms, all `"active": true` with their four rateplans each: `2b`, `2a`, `1a`, `1b` (`1a-s-ep`, `1a-d-ep`, `1a-t-ep`, `1a-q-ep`, and the same for the others).
2. POST /api/v2/cm/update/volkern-hospitality, ONE room per request, same dates and same availability as the pushes our PMS already sends: `roomCode "2b"` → 200 `{"success": true}` with NO warnings; `roomCode "2a"`, `"1a"`, `"1b"` → 200 `{"success": true, "warnings": ["INVALID_ROOM_CODE : 2a"]}` and the data is discarded.
3. We also tried, in the same one-room payload: the room NAMES (`2A`, `1A`, `1B`), the Booking.com room IDs shown in your mapping dropdown (`1427979201`, `1427965601`, `1427925901`), and a room code that does not exist at all (`zzz-sonda-inexistente`). ALL of them answer `INVALID_ROOM_CODE` — the three real rooms behave exactly like the invented one.
4. The same response lists `connected_channels` for this property: four booking.com hotel codes (`14279079`, `14279259`, `14279656`, `14279792`) for inventory, rates and reservation.

So our request is accepted for `2b` and rejected for rooms YOUR OWN property_details publishes as active. Could you tell us:

- What exactly does `INVALID_ROOM_CODE` validate on POST /update?
- Does a room have to be linked to a room of EVERY connected booking.com property (and its rateplans linked too) before /update accepts its `room_id`? If yes, in which screen, and is it currently complete for `2a`, `1a` and `1b`?
- Why would `property_details` report a room as `active: true` while /update treats its `room_id` as non-existent?
- Is the rejected room something you can see on your side, or do we have to redo the mapping ourselves?

We push with the partner id `volkern-hospitality`. We can send you the two raw JSON responses if you need them. Thanks!

---

## Versión ultra-corta

Hi team, quick one about hotel `75fdbbce2e` (partner `volkern-hospitality`).

`property_details` returns our four rooms as `"active": true` (`2b`, `2a`, `1a`, `1b`), but POST /update accepts only `2b` and answers `INVALID_ROOM_CODE` for `2a`, `1a` and `1b` — and the same warning for a room code that does not exist and for the Booking room IDs shown in your mapping dropdown.

What does `INVALID_ROOM_CODE` check, and does each room have to be mapped (with its rateplans) to every connected booking.com property before /update accepts it? Our pushes with `2b` work, so it is not the payload or the credentials. Thanks!
