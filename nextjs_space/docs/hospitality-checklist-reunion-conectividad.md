# Checklist de la reunión con el proveedor de conectividad

**Fecha:** 20 sep 2026 · **Para quién:** dirección + ingeniería de Volkern en la
reunión con el proveedor de conectividad (la capa que sostiene Airbnb,
Booking.com, Expedia y el resto de OTAs). **Objetivo:** salir con los datos y
compromisos de la **Etapa 0** de la guía de go-live sobre la mesa y firmados:
sin ellos no hay integración posible, con ellos el ensayo puede empezar esa
semana. **Fuente técnica:** [`hospitality-connectivity-contract.md`](./hospitality-connectivity-contract.md)
— este checklist no redefine nada del contrato; lista lo que hay que pedirle
al proveedor para poblarlo con valores reales. La activación del canal **dentro
de cada OTA** (la pata que no es su API) está en
[`hospitality-conexion-otas-activacion.md`](./hospitality-conexion-otas-activacion.md)
y es la que decide cuándo existe catálogo que vincular.

**Regla de marca:** material técnico; sin nombres comerciales del proveedor.

**Contexto que conviene abrir la reunión:** el ciclo completo está ya probado
contra mock — book, modify, cancel, no_show entrantes, push de inventario y
tarifas, reconciliación diaria, incidencias, auto-vínculo — con los dos ensayos
E2E de punta a punta en verde (`npm run test:e2e:booking`,
`npm run test:e2e:noshow`). Lo único que el mock no puede dar son **credenciales
reales**. La reunión es para eso, no para rediseñar nada.

---

## 0 · Antes de la reunión

**Llevamos nosotros:**

- [ ] La **guía del emisor** impresa/enlace
      ([`hospitality-webhook-emisor-guia.md`](./hospitality-webhook-emisor-guia.md)):
      es lo que su equipo de integración necesita para programar su lado.
- [ ] El **contrato técnico** para responder dudas de formato byte a byte
      (fechas, `null` en restricciones, `modify` como reemplazo completo).
- [ ] La lista de **propiedades y unidades** del hotel piloto (nombre interno y
      capacidad), para cruzar el catálogo de `property_details` en la reunión.
- [ ] El estado del panel de admin: conectividad **sin configurar** (una fila
      global vacía esperando sus datos).

**Pedimos que traigan:** contacto técnico designado, credenciales de su API y
las URLs de sus endpoints (bloque 1), y fecha de ventana de ensayo (bloque 4).

---

## 1 · Credenciales de su API (nuestro acceso saliente)

Lo que Volkern necesita para **publicar** inventario y tarifas a los canales.
Todo se cifra antes de persistir (`partnerIdEnc`/`usernameEnc`/`passwordEnc`);
nada en claro en BD ni logs.

| # | Dato | Para qué sirve | Verificar en la reunión |
|---|------|----------------|--------------------------|
| 1.1 | **URL base** de su API, **con el prefijo completo** | `CONNECTIVITY_BASE_URL`; el adaptador añade el prefijo si falta, pero es la única pieza que no se puede inventar | Que traiga la URL **byte a byte** — en este servicio el host a secas responde 404 de nginx, no un error de API. Pedirla escrita, no de oído |
| 1.2 | **Partner ID** | Identifica a Volkern como socio en cada llamada (`{pms}` en las rutas) | Que exista ya (emisión tras onboarding) o fecha exacta de emisión |
| 1.3 | **Usuario y contraseña** Basic Auth | Autenticación de todo push y fetch | Que sean credenciales de producción **distintas** de las de sandbox; pedir rotación pactada |
| 1.4 | **hotelCode de cada propiedad** del hotel piloto | Se registra en `ConnectivityMapping` como `externalPropertyId` | Cruzarlos con la lista de propiedades del §0 |
| 1.5 | **roomCode y rateplanCode del catálogo** | Son los que devuelve `property_details` y los únicos válidos como vínculo de unidad y plan de tarifa | Que no nos den códigos de otra fuente: los del catálogo son los que la resolución de reservas espera |
| 1.6 | **Capacidades min/max por tipo de habitación** | La publicación no puede salir del catálogo del proveedor (checklist del contrato) | Confirmar min/max_occ de cada roomCode del piloto |
| 1.7 | **Acceso al sandbox** de su documentación | Los push de inventario y tarifas se pueden probar antes del onboarding | Que nos digan si el sandbox sigue activo y con qué partner de prueba |
| 1.8 | **Plazo del mapeo de habitaciones en cada OTA** | El catálogo de `property_details` **no existe** hasta que el proveedor esté habilitado en la OTA y haya creado la correspondencia habitación a habitación. Es la precondición del paso 1.4/1.5 | Quién ejecuta el mapeo, por qué canal de contacto y en cuánto tiempo. **Pídelo como plazo, no como un clic** |
| 1.9 | **Vía de activación de cada canal del piloto** | Booking.com y Expedia son autoservicio en la extranet; Airbnb es una URL de autorización del proveedor; otros canales exigen correo al account manager | Que confirmen, canal por canal, cuál de las tres vías aplica y quién la ejecuta (el hotel, ellos o los dos) |

**Endpoints a confirmar que existen** (los que el adaptador llama; el contrato
prohíbe inventar): `property_details/{hotelCode}`, `update/{pms}`
(inventario y sus restricciones), `update-rates/{pms}` (tarifas y sus
restricciones), `data/{pms}` (fetch de inventario, tarifas y **reservas**).
Opcional: `marknoshow/{pms}` (bloque 3). Fuera de alcance declarado:
`channel_multiplier/{pms}` — no implementado en V1, no lo pidamos aunque lo
ofrezcan.

---

## 2 · El webhook de reservas (su emisor → nuestro receptor)

Aquí la dirección se invierte: **Volkern emite las credenciales** y se las
entrega al proveedor.

- [ ] **2.1 URL de producción del webhook** (un único `POST` para
      `book` / `modify` / `cancel`; `action` decide). Se la entregamos escrita.
- [ ] **2.2 Credenciales Basic Auth que Volkern emite** (usuario/contraseña).
      Se generan en el alta del proveedor y se entregan por canal seguro, no en
      la minuta. El `GET` informativo del webhook no filtra secretos.
      **Lo que pasó después (9-oct 2026):** en producción, el emisor del
      proveedor llamó con **otro par** y cada push de reserva murió en un 401
      (`credenciales_no_coinciden`, 7/11 caracteres frente a los 19/8 del par
      emitido). El cierre por escrito de esa incidencia —comparación por huella
      del panel y qué tiene que tocar él— está en
      [`hospitality-email-proveedor-401-emisor.md`](./hospitality-email-proveedor-401-emisor.md).
      Moraleja para la reunión: **confirmar en la entrega que el par que pedimos
      es el que queda configurado en su emisor**, no solo el que nosotros
      guardamos.
- [ ] **2.3 Acciones que su emisor enviará.** `book`/`modify`/`cancel` son
      obligatorias; preguntar explícitamente por **`no_show`**: si no lo emite,
      lo marca el operador con el `PATCH` del panel y queda documentado en el
      proveedor qué eventos quedan fuera (el webhook responde 400 a acciones
      desconocidas).
- [ ] **2.4 Multi-habitación.** Preguntar si su API envía **un `book` por
      habitación o un booking con varias `rooms`**. Un payload con varias rooms
      no se registra parcialmente: entra como incidencia `multi_habitacion` y
      el operador la parte en N reservas (idempotente y all-or-nothing). Si
      envían uno por habitación, esa superficie nunca se ejercita.
- [ ] **2.5 Entrega de la guía del emisor** con sus tres reglas que más duele
      ignorar: respetar el **`Retry-After`** (300 s en 404, 60 s en 503/500)
      con tope de **24 h** en el 404; `modify` es **estado completo nuevo**;
      **nunca** convertir un `no_show` fallido en `book`.
- [ ] **2.6 Idempotencia pactada:** entregas duplicadas son posibles; el
      receptor es idempotente por `bookingId`. Confirmar que su cola puede
      reintentar sin miedo.

---

## 3 · Alcance del acuerdo

- [ ] **3.1 Canales incluidos** (Airbnb, Booking.com, Expedia, …): lista
      exacta y por canal, qué se sincroniza (inventario, tarifas,
      restricciones). El alcance se fija aquí, no después — así lo pide la FAQ
      comercial.
- [ ] **3.2 Cadencia del push:** cuánto tarda, como mucho, un cambio nuestro en
      verse en el canal (y al revés, una reserva del canal en nuestro webhook).
      Queda escrito; lo usaremos en la ventana de doble publicación.
- [ ] **3.3 `marknoshow`:** según el contrato solo aplica a ciertos canales —
      confirmar si alguno de los del hotel es de los que lo soporta. Es
      saliente (nosotros → ellos) y no libera la unidad por sí solo.
- [ ] **3.4 Qué queda fuera:** channel multiplier (no implementado en V1),
      histórico de otro PMS (no hay migrador), cobro de reservas de canal (se
      liquidan por su circuito y se registran a mano en Finanzas).

---

## 4 · Calendario y operación

- [ ] **4.1 Ventana de ensayo** (Etapa 2): fechas concretas, con calendario
      real del hotel y tráfico controlado. Duración esperada: 2–5 días.
- [ ] **4.2 Contacto técnico designado** por el proveedor durante el ensayo y
      la primera semana de producción (los checklists los firma quien opera su
      lado). Canal y horario de respuesta.
- [ ] **4.3 Comportamiento en caída de su servicio:** esperamos `Retry-After`
      en sus 5xx; si no lo mandan, acordarlo verbalmente para configurar nuestra
      cola. Nuestro lado ya reintenta con backoff.
- [ ] **4.4 Criterio de cierre del checklist** (el que firman ambos lados):
      una semana con incidencias explicadas, divergencias a cero o revisadas, y
      **ninguna reserva de canal perdida ni duplicada**.
- [ ] **4.5 Plan de vuelta atrás** (Etapa 3): desactivar el proveedor
      (estado inactivo) y **re-publicar a los canales previos del hotel** —
      acordar quién hace la re-publicación del lado de los canales y en cuánto
      tiempo.

---

## 5 · Salida de la reunión — la lista corta

La reunión está bien si estos 7 puntos están en la mesa:

1. URL base byte a byte + los 4 endpoints del contrato confirmados.
2. Partner ID + credenciales Basic (o fecha de emisión).
3. hotelCode del piloto + roomCode/rateplanCode de `property_details` cruzados,
   con el **plazo del mapeo en cada OTA** (bloque 1.8).
4. URL del webhook + credenciales nuestras entregadas por canal seguro.
5. `no_show` emitido o no — decidido y documentado en el proveedor.
6. Fecha de ventana de ensayo + contacto técnico con canal de soporte.
7. Criterio de cierre y plan de vuelta atrás aceptados.

Con 1–3 el panel de admin puede configurarse ese mismo día y el botón «Probar»
valida credenciales contra su servicio real. Con 4 el proveedor puede empezar a
programar su emisor. Con 5–7 el ensayo tiene fecha, dueño y salida.

---

## Referencias

- Guía de go-live (etapas, responsables, verificación):
  [`hospitality-go-live-pms-guia.md`](./hospitality-go-live-pms-guia.md)
- Contrato técnico (fuente de verdad de la API):
  [`hospitality-connectivity-contract.md`](./hospitality-connectivity-contract.md)
- Guía del emisor (para su equipo):
  [`hospitality-webhook-emisor-guia.md`](./hospitality-webhook-emisor-guia.md)
- Email de preguntas al proveedor (versión enviable, en inglés):
  [`hospitality-email-proveedor-conectividad.md`](./hospitality-email-proveedor-conectividad.md)
