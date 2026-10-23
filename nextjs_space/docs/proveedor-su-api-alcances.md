# SU API (su-api.com) — alcances documentados

Revisión del 18-oct-2026, hecha sobre la documentación pública, **sin cuenta ni
credenciales**. Sirve para decidir el cambio de proveedor, no para integrar
todavía: lo que sigue es lo que está escrito, y donde no hay dato se dice.

## Lo que sí está documentado

| Área | Operación / nota |
| --- | --- |
| Disponibilidad, tarifas y restricciones | `POST /SUAPI/jservice/availability` (sandbox: `connect-sandbox.su-api.com`). Precio por ocupación, cierres, estancia mín./máx., cierre a llegada/salida, antelación mínima |
| ARI por OTA | `POST /SUAPI/jservice/invratecontrol` con reglas `Fixed`, `Increase`, `Decrease`, `Multiply` y cierre de tarifa. Es **sobrescritura**: retirar una regla exige reenviarla vacía |
| Tarifas por canal | `POST /SUAPI/jservice/channel-rates`; incluye `extraadultrate` / `extrachildrate` y precios por duración (`LosPrice`) |
| Reservas (push) | SU llama al endpoint del partner; **una reserva cada vez por propiedad**, con reintento cada 10 min hasta 3 veces, y las siguientes esperan el acuse |
| Reservas (pull) | `POST /SUAPI/jservice/Reservation` y `Reservation_notif` para acusar recibo; `POST /SUAPI/jservice/Bookings` lista por fecha de creación (fechas `MM-DD-YYYY`, horas GMT) |
| Promociones | `POST /SUAPI/jservice/bdc/promotion/update`: descuento porcentual con fechas y tarifas padre. **Es específico de Booking.com**, no una API genérica de descuentos |
| Autenticación | Token Bearer: `GET /SUAPI/jservice/auth/generate-access-token` con `client-id` + `client-secret`; validez 60 min, máx. 30 tokens/60 min. Basic + `app-id` figura como próximo a retirarse |
| Identificadores | `hotelid`/`hotel_id` asignado por SU (≤20 caracteres, alfanumérico y guion). No sustituye a la autenticación |
| Formatos | JSON; payload recomendado ≤512 KB; rangos de hasta 730 días en Rates/Channel Rates |

## Lo que hay que confirmar antes de migrar

1. **Cuota real.** La documentación de Rates and Availability dice 5.000
   peticiones **por hora** por propiedad (200 en sandbox por hora); la FAQ
   pública de 2025 dice 5.000 **al día** por propiedad. Es una diferencia de 24×
   y condiciona el diseño del push: pedirlo por escrito.
2. **Endpoint receptor del push.** No está publicado; se configura en el
   onboarding. Sin él no se puede montar el webhook.
3. **Cargos y descuentos genéricos.** No hay campo de tarifas adicionales ni de
   descuentos fuera de la promoción de Booking. Nuestras tarjetas de «tarifas
   adicionales» y «códigos promocionales» seguirían siendo del canal directo.
4. **Producción vs sandbox.** Varias rutas documentadas solo aparecen con host
   de sandbox; confirmar host/path de producción.
5. **Compatibilidad por canal.** La API ARI está definida por OTA; que un campo
   exista no garantiza que cada canal lo respete.

## Qué implica para lo que ya tenemos

El contrato actual de conectividad de Volkern (`lib/hospitality/connectivity.ts`)
empuja `{ roomCode, rateplanCode, rate }` y restricciones. SU API acepta eso y
bastante más, pero **el adaptador no es un cambio de URL**: cambia la
autenticación (token de 60 min con `client-id`/`client-secret`), los nombres de
operación (`jservice/availability`), el modelo de reservas (push con acuse y
reintentos, o pull) y añade ARI por OTA.

## Fuentes leídas

- [Índice de la documentación](https://suissu.gitbook.io/su-api-documentation)
- [Índice completo (`llms.txt`)](https://suissu.gitbook.io/su-api-documentation/llms.txt)
- [APIs de SU](https://www.su-api.com/su-apis/)
- [Rates and Availability](https://suissu.gitbook.io/su-api-documentation/su-channel-manager/rates-and-availability.md)
- [Channel Rates API](https://suissu.gitbook.io/su-api-documentation/su-channel-manager/channel-rates-api.md)
- [ARI Control API](https://suissu.gitbook.io/su-api-documentation/su-channel-manager/ari-control-api.md)
- [Autenticación por token](https://suissu.gitbook.io/su-api-documentation/su-channel-manager/getting-started/token-based-authentication.md)
- [Reservas — push](https://suissu.gitbook.io/su-api-documentation/su-channel-manager/reservations/reservation-using-push-api/push-api-method.md)
- [Reservas — pull y acuse](https://suissu.gitbook.io/su-api-documentation/su-channel-manager/reservations/reservation-notification-pull.md)
- [Bookings por fecha](https://suissu.gitbook.io/su-api-documentation/su-channel-manager/reservations/reservations-repull-api/list-of-bookings.md)
- [Promoción Booking.com](https://suissu.gitbook.io/su-api-documentation/su-channel-manager/promotion-api/booking.com-promotion-api/update-promotion-api)
- [FAQ pública](https://www.su-api.com/blog/sus-frequently-asked-questions-faqs/)
