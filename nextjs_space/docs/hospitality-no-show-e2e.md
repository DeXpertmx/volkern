# Ensayo E2E del no-show y la disponibilidad

**Decisión que verifica**: [§0 del plan de Booking Engine + Payments](./hospitality-booking-payments-plan.md) · **Última ejecución**: 21 de septiembre de 2026 · **76 comprobaciones en verde**

Este documento describe el ensayo de punta a punta de la regla «el no-show no
ocupa inventario»: qué comprueba, cómo se ejecuta (con un proveedor de
conectividad simulado en local) y **el defecto real que destapó** en su primera
ejecución.

## Qué es

Un recorrido completo contra un **servidor de desarrollo real**, con el
adaptador de conectividad real y HTTP de verdad:

1. **Levanta un mock del proveedor** en local y lo configura como destino del
   adaptador (`CONNECTIVITY_BASE_URL`). Todo push que hace la app se captura en
   el proceso del ensayo: **ningún servicio externo se toca**.
2. **Publica una propiedad de prueba** (propiedad → unidades → tarifas →
   «conectada») y **vincula las unidades por el wizard real de onboarding**
   (`POST /api/hospitality/onboarding/mapping`), que valida los `roomCode`
   contra el catálogo del proveedor — el mock.
3. **Reserva** la unidad A y comprueba que el canal la ve a **0 disponibles**
   (con la habitación B como control).
4. **Marca la reserva como `no_show`** y comprueba que **la disponibilidad
   empujada sube a 1** en todas las noches de la estancia, sin bloqueo residual
   — y que la **penalización se emite sola** con la política de la propiedad
   (por defecto, la primera noche).
5. **Comprueba la penalización** (regla 8): la devuelve el `PATCH`, la
   previsualiza el `GET`, reemitir no la duplica, la **factura por el ERP real**
   (`InvoicingService`) sale con receptor fiscal y su `numero`, refacturar
   devuelve la MISMA factura, la línea queda trazada con su `invoiceId`,
   **Finanzas la muestra con bruto 0** (no es ingreso de alojamiento) y
   `pendiente` = el cargo, y **el cobro por pago manual la salda**
   (`estadoCobro` → `pagado`, pendiente 0): emitir → facturar → cobrar, el
   circuito completo sin salir de las APIs reales.
6. **Vuelve a reservar esas mismas fechas por la API pública** del booking
   engine: antes habría chocado con un 409, ahora entra — y su reserva baja la
   disponibilidad otra vez a 0 en el canal.
6b. **Vía B — el webhook entrante**: la misma transición por donde la reporta
   el proveedor, con `action: "no_show"` por HTTP real y Basic Auth (las
   credenciales que el propio ensayo cifró en el proveedor). Comprueba que el
   motor resuelve la reserva, **emite la misma penalización** (el emisor es
   único), **empuja la disponibilidad igual** que el PATCH, es **idempotente**
   al repetir el evento y responde **404** para una reserva inexistente.
7. **Limpia** todo: propiedad, mappings, logs de sincronización, facturas del
   ERP, contacto, API key temporal, el emisor fiscal sembrado y el proveedor de
   conectividad (se devuelve a su estado previo).

## Cómo se ejecuta

```bash
npm run test:e2e:noshow            # arranca next dev en 3098 con la conectividad al mock
E2E_PORT=3097 npm run test:e2e:noshow
E2E_MOCK_PORT=4600 npm run test:e2e:noshow
E2E_KEEP=1 npm run test:e2e:noshow # conserva los datos para mirarlos a mano

# Con un servidor ya levantado (debe tener CONNECTIVITY_BASE_URL al mock):
E2E_MOCK_PORT=4599 BASE_URL=http://localhost:3098 npx tsx --require ./scripts/cargar-entorno.cjs scripts/e2e-no-show.ts --keep
npx tsx --require ./scripts/cargar-entorno.cjs scripts/e2e-no-show.ts --cleanup
```

El ensayo es idempotente: usa los códigos `E2E-NS`, `E2E-NS-A`, `E2E-NS-B` y el
`hotelCode` `E2E-NS-HOTEL`, así que una ejecución limpia los restos de la
anterior. La API key es **temporal** (una hora) y se elimina siempre, también en
el camino de error.

## Qué comprueba

| Bloque | Comprobaciones |
|--------|----------------|
| Prerrequisitos | Servidor vivo; tenant resuelto; proveedor de conectividad apuntando al mock |
| Publicación | Propiedad y unidades creadas por las APIs de gestión; tarifas publicadas |
| Vínculo | Las dos unidades quedan vinculadas al catálogo **validado contra el proveedor** (mock) |
| Reserva | 201; push de inventario recibido; la habitación reservada queda a **0 disponibles** en el canal y la otra sigue a 1 |
| Operaciones | La unidad aparece **`occupied`** en el panel con la reserva viva |
| No-show | La reserva queda `no_show`; push nuevo; **la disponibilidad sube a 1** en las dos noches y la noche posterior sigue a 1 (sin bloqueo residual); la unidad deja de estar `occupied`; el push queda registrado en `HospitalitySyncLog`; el `PATCH` **informa de la penalización emitida** (importe = primera noche) |
| Penalización | El `GET` previsualiza con la política de la propiedad y confirma el cargo emitido; **reemitir no duplica** (`ya_emitida`); la reserva tiene receptor fiscal (contacto vinculado por email) |
| Factura ERP | El ERP **emite la factura** (`InvoicingService`, `numero` real, importe = el cargo); **refacturar devuelve la misma** (`ya_facturada`); la factura vive en el ERP con el receptor y el monto; la línea queda **trazada con su `invoiceId`** |
| Finanzas | La no-show **aparece en Finanzas** (cargo pendiente, no producción); **bruto 0**; la penalización en su propio campo; neto y pendiente = el cargo, `pendiente` |
| Cobro | El **pago manual** (el `POST` de Finanzas que usa la UI) **saldra el cargo**: la ruta deriva `estadoCobro` con el módulo puro y devuelve `pagado`/pendiente 0; **recobrar con pendiente 0 se rechaza** (400, sin doble cobro); Finanzas muestra la fila `pagado` y el bruto **sigue en 0** |
| Re-reserva | La API pública **acepta** las fechas del no-show (201, no 409); la reserva del booking engine **también empuja** al canal; la disponibilidad vuelve a 0 |
| Vía B (webhook) | `action: no_show` con **Basic Auth** entra (200, misma reserva); la respuesta informa del **cargo emitido** (mismo importe); **empuja inventario** y la disponibilidad vuelve a 1; **repetir el evento no re-emite** (idempotente por estado); el cargo sigue siendo **UNO** con el importe exacto; el evento queda en el log como **procesado** a nombre del tenant; una reserva inexistente responde **404** |
| Salida anticipada (5c) | El **apagador A/B** del Anfitrión, de punta a punta: con **B** (defecto) el check-out guarda `checkOutReal` de hoy, el `checkOut` previsto queda **intacto** (noches vendidas y facturación) y el **inventario liberado vuelve al canal** (disponibilidad a 1); se cambia el apagador a **A** por la API y un check-out equivalente en la unidad B **pisa el `checkOut`** al día de la salida, **sin** `checkOutReal`, y el canal recibe la **misma subida** — la diferencia entre A y B es qué pasa con lo previsto, no con el inventario |
| Vista Mes del planning (5d) | La API que alimenta la vista Mes devuelve la reserva **con `checkOutReal`** (puede calcular el fin real); la vista **deja de pintar las noches liberadas** tras la salida anticipada (0 ocupadas tras el fin real) y la contraprueba confirma la causalidad: con el `checkOut` previsto se pintaban las 2 noches; y con el apagador en **A** (checkOut pisado) tampoco se pintan las noches no usadas |
| Trazabilidad | Conviven la reserva no-show y la nueva, ambas en la misma unidad |

## Qué encontró la primera ejecución (17 sep 2026)

**La reserva del Booking Engine no empujaba disponibilidad a los canales.**

El camino manual (`POST /api/hospitality/reservations`) sí empuja: tras crear la
reserva llama a `dispatchConnectivityPush`. El camino público
(`POST /api/public/booking/[slug]`) creaba la reserva directamente por Prisma
—con su canal «Directa» y su línea de desglose, cumpliendo el criterio 1 en el
papel— y **nunca empujaba**.

La consecuencia es una sobreventa silenciosa: el huésped reserva en la web, la
habitación queda ocupada en el PMS… y la OTA sigue vendiéndola, porque su
inventario no se ha tocado. Es el mismo tipo de fallo que este proyecto ya
conoció en la sincronización de canales, pero en el camino de venta directa, que
es el que más crece.

*Arreglo*: la ruta pública empuja tras crear la reserva y su línea, con el
mismo `'reserva_creada'` y `{ skipRates: true }` que el camino manual. No
bloquea la venta: si el push falla queda registrado en `HospitalitySyncLog` y la
reserva se crea igual.

*Guardia*: `tests/hospitality-booking-api.test.ts` exige que el POST empuje con
`(tenantId, propertyId, 'reserva_creada', { skipRates: true })`, y que **no**
empuje en los caminos que no crean nada (404 sin publicar, 409 por disponibilidad,
reintento idempotente). Verificado revirtiendo el arreglo: el test falla.

> Lección: el ensayo no encontró el defecto en el no-show (esa regla funcionaba
> desde el arreglo del motor), sino en el paso que se añadió para comprobarla
> —«vuelve a reservar y mira el canal»—. Los recorridos de punta a punta valen
> por lo que se les exige de más.

## Lo que encontró la ampliación de la penalización (17 sep 2026)

Dos fricciones del camino real, ninguna del modelo:

1. **La API key necesita `contacts:write`** para crear el receptor fiscal en el
   CRM (`POST /api/contacts` exige el scope). Sin él, un 401 que en producción se
   traduciría en «no puedo facturar la penalización». El ensayo crea su key
   temporal con ese scope.
2. **La factura salió sin receptor en el primer intento del ensayo.** La
   reserva manual ya vinculaba contacto por email (la ruta de reservas crea o
   encuentra el `Contact` del huésped), así que el caso «sin receptor fiscal»
   nunca se daba y la aserción fallaba. La aserción estaba mal diseñada: el caso
   negativo ya lo cubren las guardias unitarias; el ensayo comprueba el camino
   feliz y la idempotencia.

Además, el ensayo **siembra un emisor fiscal** (`ConfiguracionFiscalEmisor` sin
Veri\*factu): el ERP no factura sin datos fiscales del emisor. Al terminar se
elimina, y si había uno previo el ensayo avisa de que hay que reponerlo.

## Decisiones del entorno de ensayo

- **El proveedor de conectividad se simula, no se usa uno real.** El ensayo
  escribe la fila `ConnectivityProvider` con credenciales cifradas con el mismo
  módulo que la app (`lib/core/crypto`) y apunta la base a un mock HTTP local
  que responde el catálogo y acepta los pushes. Así se ejerce el adaptador real
  (URLs, Basic Auth, payloads, verificación de `success`) sin llamar a nadie.
- **La conectividad es global** (una fila por proveedor en toda la plataforma),
  así que el ensayo **restaura su estado previo** al terminar: si no había
  proveedor configurado, lo deja sin configurar.
- **`CONNECTIVITY_BASE_URL` la fija el wrapper**, no el script: el proceso del
  servidor de desarrollo la resuelve al arrancar. Por eso `npm run test:e2e:noshow`
  arranca su propio `next dev` con la variable puesta.
- **El wrapper ignora `PORT=0`.** Algunos entornos exportan `PORT=0` (puerto
  aleatorio): como la sonda de disponibilidad no puede apuntar a un puerto
  aleatorio, el runner solo acepta un `PORT` explícito positivo y si no usa
  3098. `E2E_PORT` tiene prioridad.
- **Un solo `next dev` por checkout.** El wrapper detiene otros servidores del
  mismo checkout antes de arrancar: dos comparten `.next` y se pisan.
- **El emisor fiscal se siembra sin Veri\*factu.** `InvoicingService` exige una
  `ConfiguracionFiscalEmisor` del tenant para numerar la factura; sin certificado
  el sello sale «no sellado», que es exactamente lo que un ensayo quiere: el
  circuito completo, sin certificado real.
- **La factura del ERP se borra antes que el contacto**: las FK de `Invoice` a
  `Contact` no tienen cascade, así que la limpieza borra primero las facturas
  del contacto del ensayo y después el contacto.
- **La estancia del ensayo cubre hoy**, para que el panel de Operaciones (que
  solo mira el día en curso) muestre la unidad ocupada y el contraste con el
  no-show sea real.
