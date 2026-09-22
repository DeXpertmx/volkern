# Reseñas de huésped — el hueco nº 1 frente a Lodgify, cerrado

> Estado: implementado (21 sep 2026) · Pruebas: 51 en `tests/hospitality-resenas.test.ts`
>
> En **Reportes** el hotel ve el efecto de las mejoras: media y volumen por
> propiedad y canal, y evolución mensual por fecha de estancia.
> Ver «Reseñas en Reportes» más abajo.
>
> La web pública no arranca vacía: el hotel puede **importar el histórico de
> reseñas de su canal** (CSV) para que la prueba social exista desde el día
> uno. Ver «Importación de reseñas históricas» más abajo.

El ciclo completo, de la salida del huésped a la web pública:

```
[1] Check-out                  → el sistema marca la reserva como checked_out
     │ (24 h después; ventana de recuperación de 72 h si el cron no corrió)
     ▼
[2] Cron de solicitud (§21)    → lib/cron/hospitality-review-request.ts
     │  asegura tokenResena en la RESERVA y envía la plantilla `resena`
     │  del tenant con {{enlace_resena}} (EN si el huésped reservó en inglés)
     ▼
[3] Huésped                    → /review/<token>  (app/review/[token]/page.tsx)
     │  puntúa 1–5 y comenta. Sin sesión: el token es la credencial.
     │  La reseña nace PENDIENTE. Puede corregirla mientras siga pendiente.
     ▼
[4] Hotel (panel)              → /dashboard/hospitality/resenas
     │  publica / rechaza / repone + respuesta pública opcional.
     │  La puntuación y el comentario del huésped NO se editan nunca.
     ▼
[5] Web pública del motor      → GET /api/public/booking/[slug] → data.resenas
     · media de lo publicado, total y las últimas reseñas con su respuesta.
```

## Las reglas que lo sostienen

**El token vive en la reserva, no en la reseña.** El cron lo genera al pedir
la reseña — antes de que exista reseña, porque la reseña nace cuando el
huésped envía. Mismo patrón que `tokenCheckin`: 24 bytes aleatorios
(base64url, 192 bits), único, no derivado de nada adivinable. Lo gestiona
`lib/hospitality/resenas-service.ts` (`asegurarTokenResena`: lo reutiliza si
ya existe, y reservas anteriores lo ganan al vuelo en su primera solicitud).
Migración `20260921210000_review_token_en_reserva`.

**La reseña es la palabra del huésped.** El hotel decide SI se publica y
PUEDE responderla (`respuestaHotel`, su palabra en su campo) — nunca
reescribirla. Una vez publicada o rechazada, el huésped ya no la cambia
(409); pendiente, sí (nadie escribe perfecto a la primera). `reponer`
devuelve una cerrada a `pendiente` para reconsiderar. Transiciones en el
módulo puro (`puedeModerar`): publicar desde pendiente o rechazada,
rechazar desde pendiente o publicada, reponer solo desde cerradas.

**Moderación antes de publicar, siempre.** La reseña nace `pendiente` y solo
lo publicado sale en la web — el hotel controla su escaparate y por eso la
media que el visitante ve es incuestionable: la mueve moderar, nada más.

**Validación y límites** (`lib/hospitality/resenas.ts`): puntuación entera
1–5; comentario ≤ 2000 con saltos normalizados; nombre público ≤ 80 (nunca
email ni teléfono); respuesta del hotel ≤ 1000 y no vacía por un espacio.
La media pública (`mediaDeResenas`) es SOLO de las publicadas, redondeada a
un decimal, y sin reseñas es `null` — la página no enseña un «0.0» que no
significa nada. El resumen ordena por estancia reciente y la fecha se
muestra como mes + año («septiembre 2026»): contexto sin fechar a nadie.

## Piezas y dónde viven

| Pieza | Fichero |
| --- | --- |
| Módulo puro (validación, transiciones, resumen público) | `lib/hospitality/resenas.ts` |
| Token y enlace (`/review/<token>?lang=`) | `lib/hospitality/resenas-service.ts` |
| Textos bilingües del formulario y la sección pública | `lib/hospitality/resenas-i18n.ts` |
| Formulario público del huésped | `app/review/[token]/page.tsx` |
| API pública GET/PUT por token | `app/api/public/reviews/[token]/route.ts` |
| API del hotel: listar, media, moderar, responder | `app/api/hospitality/reviews/route.ts` |
| Panel de moderación del hotel | `app/dashboard/hospitality/resenas/page.tsx` |
| Sección pública en el motor (catálogo y cotización) | `app/booking/[slug]/page.tsx` + API del booking |
| Solicitud post-salida (§21) y `{{enlace_resena}}` | `lib/cron/hospitality-review-request.ts` + `lib/hospitality/comunicaciones.ts` |
| Plantillas sugeridas ES/EN del evento `resena` | `lib/hospitality/booking-i18n.ts` |
| Importación de histórico del canal (CSV) | `lib/hospitality/resenas-import.ts` + `app/api/hospitality/reviews/import/route.ts` |
| Métricas para Reportes (media, canal, evolución) | `lib/hospitality/resenas-metrics.ts` (vía `GET /api/hospitality/dashboard`) |

## Detalles operativos

- **Bilingüismo de punta a punta**: el email llega en el idioma en que reservó
  el huésped (misma regla de las comunicaciones; sin plantilla EN cae a ES),
  el formulario abre en ese idioma y la sección pública del motor responde al
  conmutador ES/EN de la página. El defecto es SIEMPRE español.
- **Idempotencia del cron**: guard por reserva (`AuditLog`
  `hospitality_review_request`) — la solicitud se pide una sola vez, y el
  envío fallido se reintenta dentro de la ventana sin duplicar.
- **Reseña por reserva**: `reservationId` único — una estancia, una reseña.
- **El envío no cae por el enlace**: si el token o la consulta fallan, el
  mensaje sale igual sin enlace y la web vende igual sin reseñas
  (consultas auxiliares, degradación elegante).
- **Trazabilidad**: cada moderación deja `AuditLog`
  (`hospitality_review_moderacion`) con el antes/después y quién la hizo.
- **La página del motor no calcula nada**: la media y el recorte de las
  últimas reseñas salen del módulo (`resumenPublicoResenas`), una sola
  definición.

## Importación de reseñas históricas (para no arrancar vacía)

El ciclo §21 solo pide reseñas de estancias que acaban de terminar: la web
de un hotel nuevo estaría meses sin una sola. Por eso el panel de reseñas
trae **«Importar CSV de canal»**: el hotel sube el histórico de su OTA y esas
reseñas nacen **`publicada`** — ya pasaron el filtro real, el canal las
mostró al público. En las tarjetas se marcan como **Histórica**.

```
CSV del canal (Booking.com, Airbnb…)
     │  POST /api/hospitality/reviews/import { propertyId, csv }
     ▼
Módulo puro (resenas-import.ts): autodetecta , y ; · comillas RFC 4180
     │  cabeceras ES/EN tolerantes (fecha/date, puntuacion/rating…)
     │  valida fila a fila: fecha, puntuación 1–5, nombre
     │  huella sha256 (canal+fecha+nombre+puntuación+comentario)
     ▼
createMany skipDuplicates(huellaImport) → nacen publicada, origen=importada
     │  (importar el mismo CSV dos veces NO duplica: la segunda vez, 0 creadas)
     ▼
Web pública: misma sección, mismo orden por estancia, canal de origen visible
```

Reglas de la importación:

- **La propiedad es requerida y del tenant**: una reseña histórica es de un
  alojamiento concreto; el id mal copiado no crea huérfanas (404).
- **Sin adivinar**: la fecha ambigua (05/06/2026 — ¿mayo o junio?) se rechaza
  con su motivo; ISO (AAAA-MM-DD) y DD/MM con día > 12 se aceptan. La
  puntuación decimal del canal (4,5) se redondea al entero 1–5.
- **Cada fila mala vuelve con su número y su motivo** en la respuesta: el
  panel los muestra y el hotel corrige su CSV, no a ciegas.
- **Las importadas no se «publican» de nuevo** (409): ya lo están. Sí se
  pueden reponer o rechazar si el hotel no las quiere en su web.
- **La fecha de estancia es columna de la reseña** (`fechaEstancia`): en las
  nativas la rellenó el backfill desde la reserva; el resumen público usa una
  sola regla de orden y de «mes» para ambos orígenes.
- **Límite**: 2.000 filas por importación (413 si se pasa), trazadas en el
  AuditLog (`hospitality_reviews_import`).

## Reseñas en Reportes (¿mejora con el tiempo?)

El dashboard de hospitality (`GET /api/hospitality/dashboard`) expone la
sección `resenas` — módulo puro `resenas-metrics.ts`, la página de Reportes
no calcula nada:

- **Por propiedad**: TODAS las del tenant, también las sin reseñas (su «—»
  también es información). Media y volumen de lo publicado.
- **Por canal**: las importadas se agrupan por su canal de origen (columna
  `canal`); las del ciclo §21 se agrupan como **Nativa**. Un canal sin
  reseñas no es una fila.
- **Evolución mensual**: por fecha de ESTANCIA (no de importación), del más
  antiguo al más reciente. Los meses sin reseñas no se inventan.
- **Lectura accionable** redactada en el módulo: canal destacado si se
  desvía ±0,3 de la media, y si el último mes sube o baja frente al anterior
  — «las mejoras están calando» o «merece una mirada».

El período es el selector de la página (30/90 días) y filtra por
`fechaEstancia ≥ inicio del período`; solo cuenta lo PUBLICADO — la misma
población que ve el visitante de la web. La sección es AUXILIAR: si su
consulta falla, el dashboard sigue en pie con la sección vacía.
