# Volkern Hospitality — Booking Engine, Payments y Finanzas

**Documento de arquitectura y fases (FASE 3)**
Fecha: 2026-09-11 · Estado: decisiones aprobadas, implementación por fases

Complementa al *Plan Maestro de Desarrollo — Volkern Hospitality v1.0*. Donde este
documento y el Plan Maestro se contradigan, gobiernan las decisiones aquí registradas
porque fueron tomadas explícitamente con el responsable del producto.

---

## 0. Decisiones aprobadas

| # | Decisión | Elección |
| --- | --- | --- |
| 1 | Modelo de cobro de las reservas del tenant | **Stripe Connect**, el tenant es el comerciante de fondos. Volkern puede cobrar una tarifa de plataforma. |
| 2 | Ubicación del Booking Engine | **Sección propia (14 secciones)**, con su configuración, previsualización y enlaces públicos. |
| 3 | Alcance de Finanzas (primera entrega) | **Rentabilidad por reserva + cobros**, reutilizando el ERP de Volkern para gastos, impuestos y facturación. |

### Reglas no negociables derivadas de las decisiones

1. **El Booking Engine NO tiene motor propio.** No crea disponibilidad ni reservas por su
   cuenta: usa el **Reservation Engine** y el **Availability Engine** centrales de
   Hospitality. Una reserva de la web entra exactamente al mismo flujo que una de OTA
   (Aiosell) o una manual.
2. **Un solo origen de disponibilidad.** No puede existir disponibilidad distinta para
   Booking, la web, el planning o los canales. Todo consumidor lee el mismo motor.
   **Prohibido** calcular disponibilidad por fuera de `lib/hospitality/availability.ts`
   (hay una guardia en tests que lo vigila).
3. **Stripe Connect, no cuenta única.** El dinero de una reserva pertenece al tenant.
   Volkern no actúa como intermediario de fondos.
4. **Nada de un segundo sistema financiero.** Gastos, impuestos, facturación y nómina se
   reutilizan del ERP (`lib/finance/`). Hospitality añade únicamente lo específico de
   reservas: líneas, pagos y rentabilidad.
5. **Trazabilidad total.** Cada pago, comisión y gasto queda ligado a
   `tenantId` y, cuando aplique, `propertyId`, `unitId` y `reservationId`.
6. **El proveedor de conectividad nunca es visible** al cliente final (regla de marca ya
   vigente).
7. **El no-show no ocupa inventario.** Una reserva marcada `no_show` deja de bloquear su
   unidad —todas sus noches, incluida la de llegada— y vuelve al pool vendible, igual que
   una cancelada. La regla vive **una sola vez**, en `lib/hospitality/availability.ts` vía
   `aportaProduccion` (`lib/hospitality/estados.ts`), y es la misma que ya aplicaban los
   choques de overbooking, Finanzas, Huéspedes, la analítica y el deshacer de vínculos.
8. **El no-show cobra, pero no produce.** No ocupar no es no cobrar: la penalización se
   emite como **cargo de la propia reserva** (línea `penalizacion`), nunca como ingreso de
   alojamiento —`calcularBruto` la excluye, así que no entra en ADR, RevPAR ni noches
   vendidas— y la **factura legal la emite el ERP** (`InvoicingService`), no hospitality.

### Nota: por qué el no-show no bloquea (y qué implica)

**Decisión (17 sep 2026).** El no-show es un hecho **de cobro, no de ocupación**. Una
habitación que nadie ocupó es vendible —la reventa de una habitación no presentada es la
jugada estándar de *revenue management*— y el registro de la reserva sigue intacto para
facturar la penalización por el circuito del ERP (el importe del no-show no es
«producción» de la analítica: se emite como gasto/ingreso de ERP).

El motor de disponibilidad era **el último sitio** que no cumplía esta regla: solo
excluía `cancelled`, así que un no-show dejaba la unidad bloqueada —no vendible en
planning, Booking Engine y en la disponibilidad empujada a canales— sin que nadie
estuviera dentro. Además dejaba el sistema en contradicción consigo mismo: crear una
reserva manual sobre esas fechas **sí** estaba permitido (el chequeo de overbooking ya
excluía el no-show), pero el Booking Engine las rechazaba. Esa discrepancia es la que
cierra este cambio.

**Alternativa descartada.** Retener solo la primera noche (la «cobrada» por la política
de no-show). Se descartó porque no existe estado para «bloqueada una noche pero cobrada»,
y porque el operador (o el proveedor, vía *Mark No Show*) marca `no_show` como una
decisión explícita de que el huésped no viene: a partir de ahí la habitación está vacía.

**Consecuencias operativas.**
- El planning deja de pintar el no-show como ocupación: la unidad aparece libre y la
  reserva sigue visible como registro gris («No show») para trazar qué pasó.
- El estado del no-show es reversible: si fue un error, volver a `confirmed` restaura el
  bloqueo (el cambio de estado ya empuja disponibilidad a los canales).
- Los canales reciben el hueco como disponible en el siguiente barrido/push.

**Guardias.** `tests/hospitality-sync.test.ts` (el motor ignora el no-show),
`tests/hospitality-analytics.test.ts` (analítica y motor coinciden día a día para **cada**
estado) y `tests/hospitality-analitica-invariants.test.ts` (el motor consume
`aportaProduccion`, no compara el estado a mano).

### Penalización por no-show: qué se cobra y cómo se emite

La regla 7 resolvió el **inventario**. Esta parte resuelve el **cobro**: son dos hechos
independientes y el sistema los trata por separado.

**Qué se cobra** (política de la propiedad, `lib/hospitality/no-show.ts`, módulo puro):

| Política | Cargo | Cuándo tiene sentido |
|---|---|---|
| `ninguna` | Nada | Política comercial sin penalización |
| `primera_noche` **(defecto)** | `amountAfterTax / noches` | La práctica del sector: la habitación se retuvo esa noche |
| `estancia_completa` | `amountAfterTax` entero | Tarifas garantizadas o no reembolsables |

El importe por noche se **deriva** del importe de la reserva en vez de consultar una
tarifa: así funciona igual en una reserva de OTA (que trae un importe global) y en una
directa, y se cobra exactamente lo que la reserva vale. Sin importe o sin noches no se
inventa un cargo: se emite a mano desde Finanzas si procede.

**Quién lo cobra — y por qué a veces no se emite.** Si la reserva viene de un canal
externo (OTA), la penalización la cobra el canal al huésped y la liquida en la factura del
hotel: emitirla también desde Volkern sería **cobrar dos veces**. Solo los canales de
venta propia (`Directa`, `Volkern`, `Booking Engine`, `Mostrador`) son responsabilidad del
hotel, y ante un canal desconocido **no se emite** — es peor cobrar dos veces que no
cobrar. El operador puede forzar la emisión (`cobrarEnCanal`) cuando el canal finalmente
no la aplicó.

**Cómo se emite, en tres piezas:**

1. **El cargo** — `lib/hospitality/penalizaciones.ts` crea una
   `hospitality_reservation_items` con `tipo: 'penalizacion'`. No es una entidad nueva y
   **no toca el estado de la reserva**: por eso la unidad sigue vendible y la analítica
   sigue sin contarla (regla 7). Se dispara al marcar `no_show`
   (`PATCH /api/hospitality/reservations/[id]`, que devuelve el cargo en `penalizacion`),
   es **idempotente** (una línea por reserva) y, si falla, **nunca revierte el no-show**:
   el inventario manda.
2. **El cobro** — `POST /api/hospitality/finanzas/cobrar` con el pendiente del cargo
   (Stripe Connect a la cuenta del tenant, FASE 3.C). Ojo con la regla que parecía obvia:
   `aportaProduccion` **no** puede bloquear este cobro, porque *cobrar no es producir*. La
   guarda es «no hay nada cobrable» (una cancelada, o un no-show sin penalización), no
   «no produce».
3. **La factura** — `POST /api/hospitality/reservations/[id]/penalizacion/facturar` la
   emite **por el circuito del ERP** (`InvoicingService`, la misma vía que una orden de
   venta), que pone la numeración fiscal y Veri\*factu (regla 4: nada de un segundo
   sistema financiero). Es una acción **explícita**: facturar es consecuente y no debe ser
   efecto colateral de marcar un no-show. El importe viaja tal cual —viene de
   `amountAfterTax` y por tanto ya lleva el impuesto— sin `taxRate`, para no duplicarlo:
   desglosar el impuesto es del ERP. Sin `contactId` (huésped sin vincular al CRM) no hay
   receptor fiscal y no se factura; la respuesta lo dice y el operador vincula al huésped.
   La línea guarda el `invoiceId`, así que **una penalización no se factura dos veces**.

**Dónde se ve.** En **Finanzas** la reserva aparece con `bruto 0` y el cargo en su propio
campo (`penalizacion`), sumando al neto y al pendiente de cobro; el listado **no** puede
excluirla por «no producir» (su bruto es 0, pero es un cargo pendiente de cobrar) y el
resumen lo agrega aparte del bruto para no inflar el ingreso por alojamiento. En
**Reservas**, cada fila `no_show` tiene su acción de penalización (previsualiza el importe,
lo emite y lo factura), y la **política se elige en la ficha de la propiedad**.

**Vía entrante.** El webhook del proveedor también acepta `action: "no_show"`: el canal
reporta que el huésped no se presentó y el motor marca el estado (idempotente: solo desde
`pending`/`confirmed`/`checked_in`) y emite el cargo por el **mismo emisor del operador** —
la transición a `no_show` es el punto de enganche que se reservó, así que la penalización
no cambió. Si el proveedor no lo empuja, lo marca el operador con el `PATCH` (y `Mark No
Show` en el contrato sigue siendo saliente, nuestro hacia el proveedor).

**Guardias.** `tests/hospitality-no-show-penalizacion.test.ts` (política, importes, canal),
`tests/hospitality-penalizacion-emision.test.ts` (emisión, idempotencia, factura del ERP y
el enganche al `PATCH`), `tests/hospitality-finance.test.ts` y
`tests/hospitality-finanzas-api.test.ts` (el bruto la excluye; entra al neto y al
pendiente) y `tests/hospitality-analitica-invariants.test.ts` (la penalización no aparece
en ocupación ni en la analítica, no hay un segundo sistema financiero y emitirla no toca
la reserva).

**Ensayo E2E (17 sep 2026).** `npm run test:e2e:noshow` levanta un mock del
proveedor de conectividad, marca un no-show por la API y comprueba, con el push
real capturado, que la disponibilidad empujada sube a 1 y que la unidad se puede
volver a vender (28 comprobaciones). El ensayo destapó además un defecto real:
**la reserva del Booking Engine no empujaba disponibilidad a los canales**
(sobreventa silenciosa), ya arreglado y con guardia. Detalle en
[docs/hospitality-no-show-e2e.md](./hospitality-no-show-e2e.md).

---

## 1. Estructura del menú (14 secciones)

| Área | Sección | Estado |
| --- | --- | --- |
| **Experiencia** | Inicio | existe |
| | Puesta en marcha | existe |
| **Venta** | Planning | existe |
| | Reservas | existe |
| | Tarifas | existe |
| | **Booking Engine** | **nuevo** |
| **Operación** | Operaciones | existe |
| | Propiedades | existe |
| **Cliente** | Huéspedes | existe |
| | Comunicaciones | existe |
      (18 sep 2026: plantillas por idioma ES/EN con fallback al español; el idioma lo fija
       `guestData.idioma` — la página pública lo escribe con `lang` — y las plantillas sugeridas
       viven en `lib/hospitality/booking-i18n.ts`. La reserva pública ya dispara la confirmación:
       antes solo lo hacían el webhook y el alta manual.)
| | Automatizaciones | existe |
| **Dinero** | **Finanzas** | **nuevo** |
| **Inteligencia** | Dashboard | existe |
| | **Reportes** | **nuevo** |

Check-in/out, mantenimiento e integraciones siguen siendo **funcionalidades dentro de las
áreas**, no elementos de menú.

---

## 2. Arquitectura

```
                       RESERVATION ENGINE
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   OTA (Aiosell)      Direct Booking          Manual
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ↓
                     AVAILABILITY ENGINE
                              │
              ┌───────────────┴───────────────┐
              ↓                               ↓
          Aiosell                        Website
              ↓
     Booking / Airbnb / OTA
```

Y alrededor de cada reserva, siempre por eventos:

```
Reservation ──┬── CRM
              ├── Planning
              ├── Operations
              ├── Communications
              ├── Automations
              └── Finance  ──→ Stripe Connect (cobro del tenant)
```

**Regla de oro:** el Reservation Engine es el único que escribe reservas y el Availability
Engine el único que calcula disponibilidad. Todo lo demás consume sus eventos.

---

## 3. Modelo de datos (primera entrega)

### 3.1 Bloques de calendario (Calendar Blocks)

Lo que ocupa una unidad no siempre es una reserva. `HospitalityUnitBlock` incorpora
`tipo` para distinguir:

| tipo | Significado |
| --- | --- |
| `propietario` | Bloqueo del propietario (uso propio) |
| `mantenimiento` | Unidad fuera de servicio por incidencia |
| `administrativo` | Bloqueo administrativo / cierre comercial |

Reserva, limpieza y mantenimiento ya existen como entidades propias. Los cuatro tipos
**restan disponibilidad por el mismo motor**.

### 3.2 Líneas de la reserva — `HospitalityReservationItem`

Permiten construir el desglose que pide el propietario:

| Concepto | Importe |
| --- | --- |
| Alojamiento | €600 |
| Limpieza | €60 |
| Extras | €40 |
| **Ingreso bruto** | **€700** |

Campos: `tenantId`, `reservationId`, `propertyId`, `unitId`, `tipo`
(`alojamiento|limpieza|extra|otro`), `concepto`, `cantidad`, `importeUnitario`,
`importeTotal`, `moneda`.

### 3.3 Pagos — `HospitalityPayment`

Resuelven *Pagado / Pendiente / Parcial / Reembolsado*:

Campos: `tenantId`, `reservationId`, `propertyId`, `unitId`, `importe`, `moneda`,
`metodo` (`stripe|transferencia|efectivo|manual|otro`), `estado`
(`pendiente|pagado|parcial|reembolsado|fallido`), `referenciaExterna`,
`stripePaymentIntentId`, `fechaPago`, `notas`.

### 3.4 Cuenta de cobro del tenant — `HospitalityPaymentAccount`

Stripe Connect por tenant: `tenantId`, `provider` (`stripe`),
`stripeAccountId`, `estado` (`sin_conectar|pendiente|activo|restringido`),
`chargesEnabled`, `payoutsEnabled`, `moneda`, `pais`.

### 3.5 Rentabilidad

El resultado que ve el propietario:

```
Ingreso bruto                 €700
Comisión OTA                  -€105
Comisión pasarela             -€20
Gastos imputados              -€25
────────────────────────────────────
Ingreso neto                  €550
Margen                       78,57%
Cobrado                       €700
Pendiente                       €0
```

Nota de nomenclatura: **€700 es ingreso bruto** y **€550 es ingreso neto**. No se usa la
expresión "ingreso bruto después de gastos".

La comisión OTA ya llega desde el webhook (`HospitalityReservation.commission`), de modo
que la mayor parte de la rentabilidad es un **cálculo derivado**, no esquema nuevo.

---

## 4. Fases

### FASE 3.A — Cimientos de dinero y disponibilidad
- [x] `tipo` en `HospitalityUnitBlock` + selector en el planning y leyenda.
- [x] Modelos `HospitalityReservationItem`, `HospitalityPayment`,
      `HospitalityPaymentAccount` + migración.
- [x] Módulo puro de rentabilidad y estado de cobro + tests.
- [x] Guardia de "un solo motor de disponibilidad".
- [x] Penalización por no-show: política por propiedad (`ninguna` / `primera_noche` /
      `estancia_completa`), cargo como línea de la reserva y factura por el ERP
      (regla 8; ver «Penalización por no-show: qué se cobra y cómo se emite»).

### FASE 3.B — Finanzas
- [x] Sección **Finanzas**: por reserva, desglose, comisiones, pagos, pendiente, neto y margen.
- [x] Vista de cobros (pagado / pendiente / parcial / reembolsado) y por canal.
- [x] Enlace con el ERP para gastos e impuestos (sin duplicar entidades).
      (`Expense.hospitalityReservationId` — FK opcional, mismo patrón que lead/project; el gasto conserva
       su desglose fiscal Verifactu y alimenta `otrosGastos` del módulo puro. El IVA viaja informativo en Finanzas.)

### FASE 3.C — Stripe Connect
- [x] Alta de cuenta Connect por tenant (onboarding KYC) y su estado.
- [x] Cobro de la reserva directa contra la cuenta **del tenant**.
- [x] Registro del pago y conciliación con la reserva.

### FASE 3.D — Booking Engine (sección propia)
- [x] Configuración: propiedades publicadas, moneda, política, anticipo.
      (Publicación = lista `propiedadesPublicadas` de la configuración, con la propiedad "conectada"
       de Puesta en marcha como requisito previo; moneda y tarifa del rate plan de la unidad.
       Hoy es el ÚNICO criterio: la página es una (`/reservar/<slug>`) y el enlace antiguo redirige.)
- [x] Previsualización de la experiencia de reserva.
- [x] Reserva pública: fechas → huéspedes → disponibilidad (motor central) → precio → datos → pago.
      (`lib/hospitality/booking-engine.ts` + `/api/public/booking/[slug]/cotizar|reservar` + `/reservar/[slug]`;
       disponibilidad SIEMPRE del Availability Engine; pago Stripe Connect del tenant si está activo.)
- [x] Enlaces públicos y embeds.
      (**ES/EN**: textos en `lib/hospitality/booking-i18n.ts` (18 sep 2026); la página pinta
       español en servidor y primer render del cliente —hydratación sin mismatch— y un efecto
       isomórfico aplica `?lang=en` antes del primer paint. El conmutador ES/EN de la página y el
       enlace «inglés» por propiedad en la sección Booking Engine preservan todos los parámetros
       (embed, etc.). Idioma por defecto: español, también para `?lang` desconocido.)
- [x] La reserva entra al flujo común: disponibilidad, CRM, planning, automatizaciones, finanzas.
      (Canal "Directa" + línea de desglose desde el minuto uno; idempotencia por intento;
       **push de disponibilidad al canal** — el ensayo del no-show destapó que faltaba.)

**Ensayo E2E (17 sep 2026).** La fase se ensayó de punta a punta contra un
servidor de desarrollo: `npm run test:e2e:booking` publica una propiedad de
prueba, reserva por la API pública y verifica que la reserva entra en el
planning. El ensayo (160 comprobaciones desde el 21 sep: el hold que caduca
solo y la unidad que vuelve a venderse, el ciclo completo en inglés —
reserva con `?lang=en` que nace con `guestData.idioma="en"`, el idioma que
leerán las comunicaciones automáticas — y el ciclo real del registro de viajeros
contra el mock local del Ministerio, incluidos el **rechazo** de un parte con su
motivo, su campo a corregir y su arreglo, el **abandono** del barrido cuando se
agotan los intentos y la **caída del servicio** —un 503 sin SOAP que no es un
rechazo sino un parte que no llegó, con su aviso por causa en el panel del hotel
hasta que el servicio vuelve y el hotel reenvía—) destapó y dejó cubiertas dos incidencias
reales — la cotización no aplicaba las restricciones del rate plan y la página
pública no podía completar una reserva por un desajuste `id`/`unitId` — con sus
guardias (test de render incluido). Detalle en
[docs/hospitality-booking-engine-e2e.md](./hospitality-booking-engine-e2e.md).

### FASE 3.E — Reportes
- [x] Operación: ocupación, ADR, RevPAR, estancia media, no-shows, cancelaciones, limpiezas, incidencias.
      (KPIs en `kpisVentana`; limpiezas/incidencias ya existían en el dashboard; sección Reportes con pestaña Operación.)
- [x] Ventas: reservas e ingresos por canal, reservas directas, antelación media.
      (Mix de canales del dashboard + `kpisVentana` (antelación media/mediana); pestaña Ventas de Reportes.)
- [x] Reservas directas por idioma (ES vs EN): cuota del inglés sobre las reservas directas
      (`lib/hospitality/booking-metrics.ts`, módulo puro; expuesto en el dashboard como `idiomas` con su
      lectura accionable). Responde si la web internacional convierte o si el enlace `?lang=en` no llega;
      el español es el respaldo de las reservas anteriores al inglés, no un subconjunto.
- [x] Finanzas: bruto, comisiones, gastos, cobros, pendientes, reembolsos, neto, margen.
      (La sección Finanzas de la FASE 3.B es el reporte financiero; la pestaña de Reportes enlaza con ella.)
- [x] Por propiedad, con exportación. (CSV con escape RFC 4180 y BOM.)
- [x] **Partes de viajeros sin reintentar**: el abandono del registro de viajeros, en el panel del hotel
      (KPI con la tasa del ciclo del parte —aceptados frente a los que el producto dejó fuera—, su lectura y su
      aviso en la pestaña Operación, y las columnas del CSV). El cálculo sale del módulo puro
      `lib/hospitality/partes-metrics.ts`, el mismo que alimenta la tarjeta del registro de viajeros; un
      `datos_incompletos` nunca cuenta como abandonado, porque no gasta intentos.

### FASE 3.F — Registro de viajeros (RD 933/2021)
- [x] **Parte de viajeros (PV)** contra el servicio **oficial** del Ministerio del Interior
      (interfaz `MIR-HOSPE-DSI-WS` v3.1.2): cabecera, XML con el orden del XSD, ZIP + Base64 y sobre SOAP.
      Sin agregadores de terceros: una guardia lee el módulo y falla si aparece otro host.
      (`lib/hospitality/registro-viajeros.ts`.)
- [x] Validación local con las reglas del servicio (NIF/NIE con dígito de control, segundo apellido y
      soporte, documento del mayor de edad, parentesco si hay menores, municipio INE si el país es España,
      contacto obligatorio) más los avisos que no bloquean el envío.
- [x] Envío con traza por reserva: lote, código de comunicación, código de retorno, intentos y XML enviado.
      El alta es asíncrona, así que la consulta de lote resuelve el resultado real (§4 del doc del módulo).
- [x] Anulación (operación `B`) automática al cancelarse la reserva, con el código de comunicación.
- [x] Cron `hospitality-registro-viajeros` (cada hora) con el plazo legal de 24 h cubierto, registrado en el
      panel de estado de crons; reintentos espaciados y abandonados tras 5 intentos. Cuando el barrido agota sus
      intentos, **la pantalla lo dice** (ese parte ya no se reintenta solo: si nadie lo corrige o lo reenvía, se
      queda sin comunicar) y la cifra del tope es una sola (`MAX_INTENTOS_PARTE`, compartida por el cron y la
      pantalla). Un parte `datos_incompletos` no gasta intentos y nunca se abandona, y el tope vale también para
      el parte que **no llegó** (servicio caído): `error` no es `rechazada`, se reintenta con el mismo tope y su
      abandono se cuenta aparte, por causa. El **panel de estado de
      crons** (avisos del último resultado, por tenant) publica esos partes sin que nadie tenga que entrar
      reserva a reserva: el store de crons guarda avisos además del mensaje, y el job los deja tanto si lo lanza
      el scheduler como si lo dispara su endpoint. Y el abandono llega **al panel del hotel**, que es quien tiene
      los documentos: en **Registro de viajeros** (tarjeta «Partes sin reintentar», con el motivo del servicio y
      las dos salidas —corregir el dato o reenviar—, visible solo si hay alguno) y en **Reportes → Operación**
      (KPI *Partes sin reintentar* con la tasa del ciclo del parte —aceptados frente a abandonados—, su lectura,
      su aviso y sus columnas de CSV, en la ventana de 30/90/180 días). La definición —qué es un abandono, qué
      tope se aplica y cuándo la tasa es ruido— vive en un módulo puro (`lib/hospitality/partes-metrics.ts`)
      para que las dos pantallas del hotel y el panel de plataforma no puedan contar cosas distintas.
- [x] Lo que el canal no manda (documento, nacionalidad, domicilio) **no se inventa**: el parte queda en
      `datos_incompletos` con el detalle y el operador lo completa desde la pantalla (o `accion: 'completar'`),
      que envía en el momento.
- [x] **Los datos del huésped los recoge el huésped, no el hotel**: el motor de reservas pide (opcional) el
      documento del titular y el **check-in online** por token (`/checkin/<token>`, ES/EN) recoge los de todo
      el grupo. El enlace viaja en la confirmación, en la pre-llegada (`{{enlace_checkin}}`, que además
      recuerda en `{{preguntas_pendientes}}` las **preguntas obligatorias del hotel** sin responder, en el
      idioma del huésped y solo si las hay) y en el día del
      check-in; el hotel también puede reenviarlo (`accion: 'enlace'`). El parte se comunica solo cuando está
      completo **y** la estancia ya empezó, y lo que el huésped no repite (contacto, y la dirección si lo
      marca) se hereda con su consentimiento — documento, nombre y nacimiento nunca.
- [x] **Reserva de hospedaje (RH)** implementada de punta a punta (estructura, validaciones, envío con traza
      y consulta de lote) con el orden de elementos de la tabla 3.1.1.2 y sus dos diferencias con `PV`
      (establecimiento dentro de `comunicacion`, `persona` sin `soporteDocumento` ni `parentesco`).
- [x] **Un servicio caído NO es un rechazo del Ministerio**: si el servicio no contesta (caída, timeout, o un HTTP
de error sin cuerpo SOAP) el parte queda en `error` —con el motivo de la no-entrega y sin código de retorno—,
no en `rechazado`: nadie lo leyó, así que no hay nada que corregir en los datos del huésped. La pregunta «¿esto
es una respuesta?» se hace explícita (`esRespuestaMIR`: una respuesta de verdad trae código, descripción, lote o
resultados; un `Fault` de SOAP no decide nada sobre el parte), porque el lector devolvía un objeto verdadero
incluso con un `503` en texto plano y por ahí se colaba el rechazo inventado. El check-in del huésped y las dos
pantallas del hotel lo dicen por su nombre (`motivo: sin_entrega`, «envío que no llegó», abandono **por causa**),
y el tope de intentos se aplica igual que al rechazo para que un servicio caído no reintente para siempre.
- [x] **Las preguntas propias del hotel en el check-in** (módulo puro `lib/hospitality/checkin-preguntas.ts`): cada
      hotel añade al formulario lo que quiere saber aparte del parte (hora de llegada, matrícula, mascotas…),
      con opciones definidas, obligatoriedad opcional y baja lógica que no toca las respuestas guardadas. El
      huésped las responde en su enlace y el hotel las ve junto a la reserva, en la lista del día y en el CSV —
      con el TEXTO de la pregunta, no su id. **Nunca tocan el parte**: el XML del Ministerio lleva sus campos y
      solo los suyos (guardia en tests), y la tasa de respuesta llega a Reportes con la MISMA definición de
      «pendiente» que usa el recordatorio (`requeridasPendientes`).
- [x] **Ensayo del ciclo completo contra un mock local** (`npm run test:e2e:booking`, bloques 4c, 4d, 4e, 4f y 4g): el parte
      queda `datos_incompletos` sin llamar al Ministerio, el huésped completa sus datos por el check-in, el alta
      sale (SOAP + ZIP + Basic) y la consulta del lote lo deja aceptado con su código. El mock **no usa un puerto
      fijo** y se identifica con una sonda antes de medirse: un puerto ya servido por otro mock hacía que el
      ensayo leyera peticiones ajenas y diera por bueno un envío que no había visto. El bloque 4d recorre el**rechazo**: el servicio resuelve el lote con errores, la lista de reservas enseña el motivo y el campo a
      corregir, y con el dato corregido el parte queda aceptado. El bloque 4e provoca la **caída** (503 sin SOAP
      a propósito) y comprueba el ciclo entero del parte que no llegó, hasta el reenvío cuando el servicio vuelve.
      El bloque 4f recorre las **preguntas personalizadas** (crear → responder en el check-in → verlas en la lista
      con su texto) y el 4g el **recordatorio de la pre-llegada sobre el email real** que envía el servidor:
      la pregunta obligatoria sin responder, nombrada en el idioma del huésped con su enlace, y el cron que
      repetido no duplica el envío.
- [x] **La pantalla dice al hotel lo que le falta O lo que le han rechazado**, sin que tenga que abrir la traza:
      la lista de reservas trae, por reserva, si el parte le corresponde, si está completo, qué campos bloquean
      (en los nombres del formulario del huésped) y, si el servicio lo rechazó, **el motivo tal cual y qué
      corregir** — distinguiendo un dato del huésped de un problema de configuración del hotel, que no se arregla
      pidiéndole nada al huésped. Se calcula en lote y con las mismas reglas que el check-in (`lib/hospitality/
      parte-rechazo.ts`), no con una lista paralela por pantalla.
- [ ] **Namespace del XSD de `RH`**: única pieza pendiente, y a propósito. No está en el PDF (las figuras de
      los XSD son imágenes), el WSDL responde 401 y la Sede no publica esquemas, así que no se deduce: se
      copia del XSD oficial en `NS_ALTA_RESERVA` **junto con su procedencia** (`FUENTE_NS_ALTA_RESERVA`).
      Mientras falte, el producto no emite reservas: devuelve `pendiente_xsd` sin llamar al Ministerio. Hay
      una guardia que falla si alguien mete un namespace inventado (ver §7 del doc del módulo).

Detalle completo (contrato, validaciones, estados, catálogo de errores y límites documentados) en
[docs/hospitality-registro-viajeros-mir.md](./hospitality-registro-viajeros-mir.md).

---

## 5. Criterios de aceptación de la fase

1. Una reserva del Booking Engine es indistinguible de una de OTA en planning, disponibilidad,
   CRM, operaciones, automatizaciones y finanzas.
2. Bloquear una unidad (propietario, mantenimiento o administrativo) resta disponibilidad en
   el mismo motor y se comunica a los canales.
3. El desglose de una reserva cuadra: líneas = ingreso bruto = neto + comisiones + gastos.
4. El dinero de una reserva directa llega a la cuenta Stripe del tenant, no a la de Volkern.
5. Ningún módulo calcula disponibilidad por fuera del Availability Engine.
