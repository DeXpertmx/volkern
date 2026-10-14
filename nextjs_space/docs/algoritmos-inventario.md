# Inventario de algoritmos de Volkern

> Documento de investigación y mejora · 22 sep 2026
> Fuente: el código del árbol, fichero a fichero. No es una descripción del producto:
> es lo que el sistema ejecuta hoy, con sus límites.
> Cobertura medida: **60 módulos** en `lib/hospitality`, los **13 algoritmos** de la
> familia comercial (`lib/sales`, `lib/skills`) y `lib/moneda` como regla transversal.

---

## 0. Cómo leer este documento

### Qué cuenta como «algoritmo»

Un **algoritmo** aquí es una unidad con lógica de decisión o cálculo propia: recibe
datos y devuelve un resultado que otra parte del sistema usa para actuar (bloquear
una unidad, emitir un cargo, ordenar una lista, elegir a quién avisar). Quedan fuera
los módulos que solo leen/escriben BD o pintan UI, y los textos.

Dos familias, según lo que optimizan:

| Familia | Qué gobierna | Dónde vive |
|---|---|---|
| **Hospitality** | Inventario, dinero, cumplimiento legal (RD 933/2021) y reputación de un hotel | `lib/hospitality`, `lib/cron/hospitality-*` |
| **Comercial** | Ventas propias: formación del vendedor, salud del pipeline y riesgo de pérdida | `lib/sales`, `lib/skills/training-skills.ts` |

Y una **regla transversal** (`lib/moneda`) que las dos usan.

### La ficha de cada algoritmo

| Campo | Qué contiene |
|---|---|
| **Qué hace** | La decisión o cálculo, en una frase |
| **En qué beneficia** | El valor de negocio, no la técnica |
| **Parte técnica** | Firma, reglas, constantes y complejidad conocida |
| **Dónde** | Módulo(s) y su ruta de consumo |
| **Guardia** | Test(s) que la protegen hoy |
| **Investigar / mejorar** | Hipótesis abiertas y qué falta para poder medirlas |

### Estado de verificación

- **✅** leído en esta sesión (cabecera + exports, y cuerpo en los casos marcados).
- **⚠️** inventariado por cabecera/export: existe y hace lo que declara, no releído
  línea a línea en esta pasada.

### Aviso de mantenimiento

Este inventario **no se actualiza solo**. Ya existe en el repo una guardia de
módulos huérfanos (`hospitality-huerfanos-guard`) y una de moneda
(`moneda-plataforma-guard`); este documento es el candidato natural a una tercera
guardia: que la cifra «cuántos algoritmos tenemos» y sus fichas no se muevan solas.
Ver §5.1.

---

## 1. Mapa general

### Hospitality

| # | Algoritmo | Módulo | Tipo | Guardias |
|---|---|---|---|---|
| H1 | Reglas transversales de estado | `estados.ts` | puro | `hospitality-analitica-invariants` |
| H2 | Motor de disponibilidad | `availability.ts` | puro | `hospitality-availability-guard` |
| H3 | Planning / calendario | `calendar.ts` | puro | `hospitality-calendar` (+views) |
| H4 | Cotización de la reserva directa | `booking-engine.ts` | puro | `hospitality-booking-engine` |
| H5 | Extras comprables | `booking-extras.ts` | puro | `hospitality-booking-extras` |
| H6 | Cobro Stripe Connect | `booking-payments.ts` | servicio | `hospitality-stripe-connect` |
| H7 | Caducidad de holds | `holds*.ts` + cron | puro + servicio | 7 guardias |
| H8 | Salida anticipada | `checkout.ts` | puro | `hospitality-checkout-salida-anticipada` |
| H9 | No-show y penalización | `no-show.ts` + `penalizaciones.ts` | puro + servicio | `hospitality-no-show-penalizacion` |
| H10 | Rentabilidad de la reserva | `finance.ts` | puro | `hospitality-finance` |
| H11 | Agregados financieros | `finance-summary.ts` + `money-query.ts` | puro + lectura | 4 guardias |
| H12 | Analítica y KPIs | `analytics.ts` | puro | 3 guardias |
| H13 | Reportes | `reportes.ts` | puro | 2 guardias |
| H14 | Registro de viajeros MIR | `registro-viajeros.ts` + `mir-espec.ts` | puro | 6 guardias |
| H15 | Abandono y backoff de partes | `parte-rechazo.ts`, `partes-metrics.ts`, `aviso-partes.ts` | puro | 6 guardias |
| H16 | Documentación del huésped | `guest-checkin.ts` | puro | `hospitality-guest-checkin` |
| H17 | Preguntas del check-in + su tasa | `checkin-preguntas.ts`, `preguntas-metrics.ts` | puro | 4 guardias |
| H18 | Reseñas: valor, moderación, import, métricas | `resenas*.ts` | puro | 5 guardias |
| H19 | i18n del motor y comunicaciones | `booking-i18n.ts`, `resenas-i18n.ts` | puro | 2 guardias |
| H20 | Listas de recepción y housekeeping | `reservas-csv.ts`, `housekeeping-sheet.ts` | puro | 3 guardias |
| H21 | Conectividad: sync, reconciliación, incidencias | `sync.ts`, `connectivity.ts`, `reconciliation.ts`, `incidencias.ts`, `conectividad-*.ts`, `codigos.ts` | mixto | 12 guardias |
| H22 | Dinero y divisa | `lib/moneda.ts` | puro | `moneda-plataforma-guard` |
| H23 | Permisos por capacidad | `capacidades.ts`, `permissions.ts` | puro | 4 guardias |
| H24 | Crons y su estado | `lib/cron/*`, `cron-status.ts` | servicio | 6 guardias |

### Familia comercial

| # | Algoritmo | Módulo | Guardias |
|---|---|---|---|
| C1 | Digital Twin del cliente (roleplay) | `training-skills.ts` | 1 (14 pruebas) |
| C2 | Escalada automática de dificultad | `training-skills.ts` | 1 (9 pruebas) |
| C3 | Post-mortem y puntuación de cierre | `training-skills.ts` | 1 (21 pruebas) |
| C4 | Cosecha de mejores prácticas → Playbook | `sales/playbook-cosecha.ts` | 1 (37 pruebas) |
| C5 | Ranking de cerradores | `api/analytics/training/leaderboard` | 1 (38 pruebas) |
| C6 | Health Score del deal | `sales/pipeline-health-service.ts` | 2 (32 pruebas) |
| C7 | Watchdog de abandono de deals | `sales/pipeline-watchdog.ts` | 1 (12 pruebas) |
| C8 | Riesgo de ghosting + estrategia | `sales/deal-coach-service.ts` | 1 (18 pruebas) |
| C9 | Autopiloto con guardrail de confianza | `sales/action-orchestrator.ts` | 1 (8 pruebas) |
| C10 | Briefing de mañana | `sales/morning-briefing-service.ts` | **ninguna** |
| C11 | Churn SaaS (tasa, LTV) | `lib/saas-metrics.ts` | **ninguna** |
| C12 | Riesgo de rotación de talento | `skills/index.ts` (`talent_retention_risk`) | **ninguna** |
| C13 | Puerta de práctica (riesgo → roleplay) | `sales/training-gate.ts` | 1 (18 pruebas) |

**El dato más importante de todo el inventario está en la última columna de la
segunda tabla: los algoritmos comerciales originales siguen sin una sola
prueba** — las excepciones son C13 (la puerta de práctica, 18 pruebas) y,
desde la pasada de guardias, C1 (14), C2 (9), C3 (21), C4 (37), C5 (38), C6 (32), C7 (12),
C8 (18) y C9 (8): el ciclo
completo del riesgo —su evaluador, su cliente simulado y su manual de lecciones— tiene
red. Sigue siendo la
deuda de calidad más grande del proyecto y el primer punto del plan de §5.

---

## 2. Hospitality — fichas

### H1 · Reglas transversales de estado ✅

**Qué hace.** Responde tres preguntas distintas sobre el estado de una reserva, y solo
una por pregunta: ¿ocupa y factura? (`aportaProduccion`), ¿la estancia sigue en curso?
(`esReservaViva`), ¿se movió hoy? (`esMovimientoDelDia`).

**En qué beneficia.** Es la regla que evita que Finanzas, Reportes y el planning cuenten
cosas distintas. Antes vivía copiada en una decena de sitios y de ahí salían variantes
—unas partes excluían el no-show y otras no—. Un hotel que ve dos ocupaciones distintas
en dos pantallas deja de fiarse del sistema.

**Parte técnica.** Cancelada y `no_show` no producen (ni ocupan ni facturan); el no-show
sí llegó (`esMovimientoDelDia`) pero no bloquea la unidad. `ESTADOS_RESERVA_VIVA` =
`pending | confirmed | checked_in`. Módulo puro, sin BD: constante compartida, sin
recálculo.

**Dónde.** `lib/hospitality/estados.ts`, consumido por *toda* la vertical.

**Guardia.** `hospitality-analitica-invariants` (verifica que las invariantes se
respeten en agregados), `hospitality-estados` (indirectamente, vía resto de suites).

**Investigar / mejorar.** Cada vez que aparece un estado nuevo hay que decidir sus tres
respuestas: hoy no hay un test que obligue a declararlas todas. Un `Record<EstadoReserva,
Respuestas>` obligaría a que un estado nuevo no compile hasta responder las tres.

---

### H2 · Motor de disponibilidad ✅

**Qué hace.** Dado un día y una unidad, decide si está libre. La disponibilidad que se
enseña y se empuja a las OTAs se calcula **siempre** desde el estado interno de Volkern,
nunca preguntando al proveedor.

**En qué beneficia.** Es la pieza que evita el overbooking por doble criterio: si la web,
el planning y el push al canal usaran cada uno su cuenta, una unidad podría venderse dos
veces. Además hace vendible de nuevo la noche que un huésped no usa (salida anticipada) o
que nadie ocupó (no-show).

**Parte técnica.**

```
ocupado(D)  ⟺  ∃ reserva con aportaProduccion ∧ checkIn ≤ D < finEstanciaReal
bloqueado(D) ⟺  ∃ bloqueo activo de unidad que cubre D
libre(D)    = ¬ocupado(D) ∧ ¬bloqueado(D)      // binario: 1 libre / 0 ocupada
finEstanciaReal = min(checkOut, checkOutReal)   // H8
```

Check-in **ocupa** su día; check-out **no**. Funciones: `unitOccupiedOnDay`,
`unitBlockedOnDay`, `unitUnavailableOnDay`, `unitAvailability`, `availabilityByRoomCode`,
`loadAvailabilityContext` (la única con BD).

**Dónde.** `lib/hospitality/availability.ts`. Consumido por el booking engine público, el
planning, el push de inventario y la reconciliación.

**Guardia.** `hospitality-availability-guard` (protege «un solo motor»: que nadie
reimplemente la ocupación).

**Investigar / mejorar.** `loadAvailabilityContext` carga el contexto completo para
resolver una consulta: para un hotel grande puede crecer de forma lineal y repetirse por
cada unidad de una página pública. Falta medir coste con volúmenes reales (rangos de
meses, cientos de unidades) y decidir si hace falta ventana de consulta o caché por
petición. Segundo frente: los bloqueos se resuelven por intervalo por día; una consulta
de rango podría resolverse una vez y no una vez por día.

---

### H3 · Planning / calendario ✅

**Qué hace.** Convierte reservas y unidades en el grid que ve el hotel: filas por unidad,
columnas por día, y **una reserva es un bloque continuo** (nunca subdividida).

**En qué beneficia.** Es la vista con la que el hotel toma decisiones de asignación. Una
reserva partida en cinco bloques es ilegible; un fin de estancia mal calculado pinta una
noche ocupada de más y bloquea una venta.

**Parte técnica.** `layoutReservations`, `buildDays`, `buildMonthGrid`, `currentWeekRange`,
`ventanaDeDiaLocal`, `nightsBetween`, `toIsoDate`, `channelStyle`. El bloque empieza en
check-in y termina el día anterior al check-out. El fin de estancia es el real
(`finEstanciaReal`, H8), así que una salida anticipada libera noches **también aquí** sin
una segunda regla. El día es el local del servidor, no UTC: es la decisión que hace que
«hoy» signifique lo mismo en planning, CSV y filtros.

**Dónde.** `lib/hospitality/calendar.ts`; UI en `app/dashboard/hospitality/calendar`.

**Guardia.** `hospitality-calendar`, `hospitality-calendar-views`,
`hospitality-dashboard-movimiento-manana`.

**Investigar / mejorar.** `layoutReservations` es O(reservas × días del rango). Con
ventanas largas o muchos canales puede notarse. Medir con datos reales antes de optimizar
(un índice de intervalos o un barrido por unidad bastaría).

---

### H4 · Cotización de la reserva directa ✅

**Qué hace.** Cotiza una estancia: noches × tarifa del rate plan activo, con las
restricciones generales del plan (mín/máx noches, días de llegada y salida) más las
**reglas de la temporada de la llegada** (`temporadas[].minNoches`, `.maxNoches`,
`.checkInDias`, `.checkOutDias`), que se deciden por la fecha de entrada y reemplazan
campo a campo a las generales del plan.

**En qué beneficia.** Es el precio que el huésped ve antes de pagar. Si la página y la
reserva cotizan distinto, el hotel discute con el cliente al confirmar. El módulo hace
que **si la página ofrece algo, la reserva pueda cumplirlo**.

**Parte técnica.** `cotizarEstancia`, `restriccionesDeRatePlan`, `referenciaBookingEngine`,
`CANAL_BOOKING_ENGINE = 'Directa'`. Cada unidad cotiza con las restricciones de **su**
plan (la página evalúa varias a la vez); el `ratePlan` superior es el valor por defecto
para quien cotiza una sola. No reimplementa ocupación: delega en H2.

**Dónde.** `lib/hospitality/booking-engine.ts`; rutas públicas `app/api/public/booking/[slug]/cotizar`
y `app/api/public/booking/[slug]/reservar` (una sola página pública: `/reservar/<slug>`, y el
enlace antiguo `/booking/<id>` solo redirige).

**Guardia.** `hospitality-booking-engine`, `hospitality-booking-guard`, `hospitality-booking-page`,
`hospitality-reserva-directa-route`.

**Investigar / mejorar.** La capa por fecha ya está: cada noche cuesta la tarifa de su
fecha y las llegadas dentro de una temporada se juzgan con las reglas de esa temporada
(mínimo, máximo y días de entrada y salida; la misma regla en la página, en la reserva y
en el canal, vía `minimumStayArrival`, `maximumStayArrival` y
`closeOnArrival`/`closeOnDeparture`). Lo que queda es de otra naturaleza: descuentos por
antelación o por semana y —si algún día hace falta— evaluar los **días de salida** con
la temporada que contiene la fecha de salida en vez de la de la llegada (hoy manda la
llegada, a propósito: una estancia se juzga entera con la regla de donde empieza). Antes
de añadir, conviene instrumentar qué % de cotizaciones públicas se caen por cada
restricción: eso dice qué restricción falta de verdad.

---

### H5 · Extras comprables ✅

**Qué hace.** Resuelve lo que el huésped elige (desayuno, late check-out, traslado…)
contra el catálogo activo de la propiedad y lo convierte en líneas de la reserva.

**En qué beneficia.** Aumenta el ticket medio sin crear una segunda contabilidad: el
extra es una línea más del MISMO desglose que ya suma Finanzas. Y protege del fraude
inocente y del deliberado: el precio lo pone el servidor.

**Parte técnica.** `resolverExtras({ seleccion, catalogo })` → líneas o motivos de
descarte; cantidades acotadas a `[1, 10]` (`EXTRA_CANTIDAD_MIN/MAX`); lo que no está en
el catálogo se ignora **con su motivo**, nunca se inventa. `totalDeExtras`,
`filasDeItemsExtras`, `catalogoPublico`.

**Dónde.** `lib/hospitality/booking-extras.ts`; rutas del motor y dashboard.

**Guardia.** `hospitality-booking-extras`.

**Investigar / mejorar.** Los límites 1–10 son una decisión de producto sin datos
detrás. Con telemetría de cantidades reales se puede acotar por tipo de extra (nadie
compra 10 traslados). También falta medir el efecto en conversión: ¿el extra sube el
ticket sin bajar la conversión?

---

### H6 · Cobro Stripe Connect ✅

**Qué hace.** Cobra la reserva directa **contra la cuenta Stripe del tenant** (Connect
Express), no contra Volkern.

**En qué beneficia.** Volkern no es intermediario de fondos: el dinero del hotel es del
hotel. Es también lo que hace el producto vendible a un hotel que no quiere que su
facturación pase por un tercero.

**Parte técnica.** `estadoDeCobroDelTenant` (consulta en vivo, no supone),
`crearSesionDePago`, `registrarCobroConfirmado`. Sin cuenta conectada **no se inventa un
cobro**: se dice que no se puede cobrar online y la reserva sigue como pendiente. La
tarifa de plataforma con valor 0 no envía `application_fee_amount` (mandar un cero es
declarar una comisión inexistente).

**Dónde.** `lib/hospitality/booking-payments.ts`, rutas del motor y Finanzas.

**Guardia.** `hospitality-stripe-connect`.

**Investigar / mejorar.** Hoy **ningún** tenant tiene cuenta conectada, así que el camino
que corre de verdad es el de reserva pendiente. Falta instrumentar la caída del pago y la
recuperación (¿cuántas reservas pending acaban confirmándose a mano?) — que es
exactamente lo que mide H7.

---

### H7 · Caducidad de holds ✅ (con cuerpo leído)

**Qué hace.** Cierra las reservas `pending` que superaron la ventana de retención de su
propiedad, para que un hold olvidado no bloquee la unidad para siempre.

**En qué beneficia.** Un `pending` bloquea la unidad en todas las vistas. Sin caducidad,
un carrito abandonado deja la habitación invendible indefinidamente. Este barrido
convierte un fallo silencioso de inventario en un evento medible.

**Parte técnica.**

```
caduca(hold) ⟺ estado = pending
             ∧ no tiene pagos registrados
             ∧ ahora > fechaCaducidadHold(propiedad.holdHoras)
```

Constantes: `HOLD_HORAS_POR_DEFECTO = 24`, mínimo 0 (0 = «no caduca»), máximo 720
(30 días). Una sola definición de la ventana: `holdHorasEfectivas`. Con pagos **no
caduca**: emitir un hold por el que entró dinero destruiría un cobro real, y eso es
decisión humana, no de barrido. Cada caducidad escribe `AuditLog`
(`hospitality_hold_expirado`); cada rescate escribe `hospitality_hold_confirmado`
(`holds-audit.ts`). Con los dos eventos, la tasa de abandono se calcula exacta.
Métricas: `metricasHoldsAbandonados`, `agregarHoldsCaducados`, alerta con
`HOLD_ABANDONO_UMBRAL_ALERTA = 0.5` y `HOLD_ABANDONO_MINIMO_PARA_ALERTA = 3`. Cron
`hospitality_holds_expirados`, horario (`0 * * * *`).

**Dónde.** `holds.ts`, `holds-metrics.ts`, `holds-audit.ts`, `lib/cron/hospitality-holds.ts`.

**Guardia.** `hospitality-holds`, `hospitality-holds-metrics`, `hospitality-holds-audit`,
`hospitality-reservation-hold-confirmado`, `cron-hospitality-holds`,
`cron-hospitality-holds-route`, `admin-hospitality-holds-route`.

**Investigar / mejorar.** La ventana por defecto (24 h) es una hipótesis, no una
medición. Con la serie de expirados vs. confirmados por tenant se puede **calibrar por
hotel**: buscar la ventana que maximiza confirmaciones sin regalar noches. La alerta
(>50 % y ≥3) también es arbitraria: hay que ver con datos si precede a una caída de
ventas directas, no solo si suena.

---

### H8 · Salida anticipada ✅ (con cuerpo leído)

**Qué hace.** Decide qué significa que un huésped se marche antes: cerrar la estancia
(pisar fechas) o guardar la salida real.

**En qué beneficia.** Es un apagador de producto con consecuencias contables: con
«cerrar estancia», cobrar la estancia completa infla el ADR (mismos ingresos ÷ menos
noches vendidas); con «salida real», la habitación vacía vuelve a venderse y lo planeado
no se pierde.

**Parte técnica.**

| Política | Efecto en plannning/noches | Riesgo |
|---|---|---|
| `cerrar_estancia` | `checkOut` pasa al día en curso; las noches no usadas desaparecen | Infla ADR si se cobra completo |
| `salida_real` (defecto) | guarda `checkOutReal`; ocupación = `min(checkOut, checkOutReal)` | Un campo más que mantener coherente |

Funciones: `politicaSalidaAnticipadaEfectiva`, `finEstanciaReal`, `datosDeSalida`. Los
avisos (BD + push) viven en `checkout-avisos.ts`, separados a propósito: `checkout.ts` lo
importan páginas de cliente y meter módulos de Node en el bundle de navegador rompía el
build de producción.

**Dónde.** `lib/hospitality/checkout.ts`, `checkout-avisos.ts`; cron de check-in previsto.

**Guardia.** `hospitality-checkout-salida-anticipada`, `hospitality-checkout-notificacion`.

**Investigar / mejorar.** Falta medir con datos reales qué política usa cada hotel y qué
pasa con la facturación en cada caso. La comparación «misma reserva con A y con B» es un
experimento natural por propiedad.

---

### H9 · No-show y penalización ✅

**Qué hace.** Separa dos hechos que suelen confundirse: el no-show **no ocupa** la
unidad (inventario) pero **sí puede cobrar** (cargo de cancelación).

**En qué beneficia.** La habitación vuelve a venderse en la misma noche y el hotel no
regala el bloqueo. Y, sobre todo, la penalización **no contamina ADR, RevPAR ni noches
vendidas**: es un cargo de cancelación, no ingreso de alojamiento.

**Parte técnica.** `PoliticaNoShow = 'ninguna' | 'primera_noche' | 'estancia_completa'`;
`calcularPenalizacionNoShow` (puro) y `aplicarPenalizacionNoShow` (BD, **idempotente**:
una línea por reserva). `elHotelEmiteElCargo(canal)`: si la reserva vino de un canal
externo, decide el canal. La penalización es una línea `tipo: 'penalizacion'` de la
propia reserva, no una entidad nueva. `facturarPenalizacionNoShow` la lleva a factura.

**Dónde.** `no-show.ts`, `penalizaciones.ts`; `finance.ts` la aparta del desglose.

**Guardia.** `hospitality-no-show-penalizacion`, `hospitality-penalizacion-emision`.

**Investigar / mejorar.** ¿Cuántos no-shows acaban con cargo emitido y cuántos se
cobran? Sin esa serie no se sabe si la política se está aplicando o solo configurando.
Hipótesis a medir: el cargo disuade no-shows (comparar propiedades con y sin política).

---

### H10 · Rentabilidad de la reserva ✅

**Qué hace.** Calcula bruto, comisiones, gastos, neto, margen y estado de cobro de una
reserva.

**En qué beneficia.** Es la respuesta a «¿gané dinero con esta reserva?», que en un hotel
depende de comisión del canal, extras y gastos imputados. El estado de cobro **derivado**
evita el clásico «figura pagado pero nadie pagó».

**Parte técnica.** `calcularRentabilidad`, `calcularBruto`, `totalDeLineas`,
`calcularPenalizacion`, `desglosarLineas`, `calcularCobrado`, `calcularReembolsado`,
`derivarEstadoCobro`, `lineasDesdeImporteExterno`. La penalización **no es ingreso de
alojamiento** y viaja aparte en el desglose. `redondear` centraliza el redondeo (no hay
aritmética de dinero suelta por la vertical).

**Dónde.** `finance.ts`; consumido por Finanzas, Reportes y el detalle de reserva.

**Guardia.** `hospitality-finance`.

**Investigar / mejorar.** El «porcentaje de comisión» que se estima para pasarela
(`comisionPasarelaEstimada`) es un parámetro, no un dato del cobro real. La mejora
evidente es derivarlo del movimiento de Stripe en vez de estimarlo.

---

### H11 · Agregados financieros ✅

**Qué hace.** Convierte reservas (con líneas y pagos) en los totales del período: total,
por canal, por propiedad, por estado de cobro y CSV.

**En qué beneficia.** Es el informe con el que el propietario decide precios y canales.
Que salga de **una sola consulta** (`money-query`) evita que Finanzas y Reportes cuenten
cosas distintas.

**Parte técnica.** `filasFinancieras`, `resumenFinanciero`, `desglosePorCanal`,
`desglosePorPropiedad`, `conteoPorEstadoCobro`, `csvFinanciero`; `esReservaConVenta`
(cancelada/no-show no aportan bruto, pero sus reembolsos **sí se informan** — el dinero
salió). Neto siempre vía `calcularRentabilidad`: no hay segunda fórmula. `money-query` es
lectura pura; `resolverRango` centraliza la ventana de fechas.

**Dónde.** `finance-summary.ts`, `money-query.ts`; rutas `/api/hospitality/finanzas`,
`/reportes`.

**Guardia.** `hospitality-finance-summary`, `hospitality-finance-api`,
`hospitality-finanzas-api`, `hospitality-finanzas-ui-guard`.

**Investigar / mejorar.** Con divisas mezcladas, el módulo **no elige**: agrupa por
moneda (`resumen.porMoneda`) y el multimoneda se muestra sin convertir (con marcador). Es
honesto, pero deja abierta la pregunta de producto: ¿en qué divisa se consolida y con qué
tipo de cambio? Sin eso no hay un «ingreso total» único. Es una decisión pendiente, no un
bug.

---

### H12 · Analítica y KPIs ✅

**Qué hace.** Ocupación por día y por propiedad, tendencia de ingresos por canal, ADR,
RevPAR, estancia media, no-shows, cancelaciones y antelación de reserva.

**En qué beneficia.** Son los indicadores con los que el hotel se compara consigo mismo.
El detalle que los hace fiables: el ingreso se **atribuye por noche** (cada reserva
reparte su importe entre las noches que ocupa), que es la misma base con la que se
calcula el ADR.

**Parte técnica.** Una sola definición de «noche ocupada»: `coversNight` — la usan
reportes, analítica y planning. `ocupacionPorDia`, `perPropertyOccupancy`,
`perChannelRevenueTrend`, `mixDeCanales`, `resumenReservas`, `llegadasDelDia`,
`salidasDelDia`, `antelacionDias`, `kpisVentana`.

**Dónde.** `analytics.ts`; dashboard y Reportes.

**Guardia.** `hospitality-analytics`, `hospitality-analitica-invariants`,
`hospitality-dashboard-kpis-guard`.

**Investigar / mejorar.** La atribución por noche reparte importes con redondeo: en
reservas largas con extras, la suma de las partes debe cuadrar exactamente con el bruto.
Merece una guardia explícita de «la suma de las noches = bruto» (puede existir dentro de
`analitica-invariants`; conviene nombrarla). Segundo frente: antelación media y mediana
conviven, lo cual es correcto — conviene decidir cuál se enseña por defecto.

---

### H13 · Reportes ✅

**Qué hace.** Los informes de operación, ventas, propiedades y financiero, con sus CSV.

**En qué beneficia.** Es lo que el hotel exporta y lleva a su contabilidad o a una
reunión.

**Parte técnica.** `reporteOperacion`, `reporteVentas`, `reportePropiedades`,
`reporteFinanciero`, `csvPropiedades`, `csvCanales`, `nochesDelRango`, `esCanalDirecto`.
No reinterpreta reglas: la noche ocupada es `coversNight` y el dinero sale de
`finance-summary`.

**Dónde.** `reportes.ts`; `/api/hospitality/reportes` y pantalla Reportes.

**Guardia.** `hospitality-reportes`, `hospitality-reportes-ui-guard`.

**Investigar / mejorar.** Los CSV usan separadores por informe; conviene verificar que
todos siguen la misma convención (BOM UTF-8, separador del locale) que ya fijan
`reservas-csv` y `finance-summary`. Una guardia de «formato único de CSV» cerraría esa
familia.

---

### H14 · Registro de viajeros (MIR) ✅

**Qué hace.** Construye el mensaje oficial al Servicio de Comunicación Hospedajes del
Ministerio del Interior (RD 933/2021, art. 6) y lo envía por el web service oficial.

**En qué beneficia.** Es obligación legal: comunicar los viajeros en un plazo no superior
a 24 horas. Además, el hotel no depende de agregadores de terceros para cumplir.

**Parte técnica.**

```
parte → XML (namespaces del MIR) → ZIP → Base64 → sobre SOAP 1.1 → POST
```

- `SPEC_MIR_VERSION = '3.1.2'` (MIR-HOSPE-DSI-WS), un solo sitio para la versión.
- `ENDPOINTS_MIR` y `HOSTS_MIR_OFICIALES`: homologación y producción, con validación de
  host oficial (no se puede apuntar el envío a un tercero por configuración).
- Namespaces y nombres de operación (`NS_ALTA_PARTE`, `NS_CONSULTA_LOTES`,
  `NS_ANULACION`, `TIPO_OPERACION`, `TIPO_COMUNICACION`).
- `mir-espec.ts`: catálogo puro de códigos de retorno (`describirCodigoMIR`,
  `esCodigoCorrectoMIR`) separado para que la UI no arrastre `node:zlib` al navegador.
- `reservasHospedajeHabilitadas()`: apagador de la comunicación RH (reserva de hospedaje)
  hasta tener el XSD oficial; el namespace queda declarado y documentado.

**Dónde.** `registro-viajeros.ts` (puro), `registro-viajeros-service.ts` (BD + SOAP),
`lib/cron/hospitality-registro-viajeros.ts`.

**Guardia.** `hospitality-registro-viajeros`, `hospitality-registro-viajeros-service`,
`cron-hospitality-registro-viajeros(-route)`, `hospitality-registro-viajeros-ui-guard`,
`hospitality-mir-*` (homologación).

**Investigar / mejorar.** El plan de homologación contra el entorno real del Ministerio
(`hospitality-mir-homologacion-plan.md`) está preparado, pero **todo el ciclo se ha
probado contra un mock propio**. Hasta que no se ejecute contra SESHospedajes no se sabe
si el XSD acepta el XML tal cual. Es el riesgo abierto nº 1 del módulo. Segundo frente:
añadir una validación local contra el XSD (si se dispone del fichero) para detectar
errores antes de gastar un intento.

---

### H15 · Abandono y backoff de partes ✅ (con cuerpo leído)

**Qué hace.** Gestiona los reintentos de un parte rechazado o no entregado, decide
cuándo se abandona y avisa al hotel por email además de en pantalla.

**En qué beneficia.** Un parte abandonado es una estancia que el Ministerio no va a
recibir hasta que alguien lo arregle. Y reintentar cada hora machacaría un servicio caído.

**Parte técnica.**

```
espera(n) = min(1 h × 2^(n-1), 16 h)          // backoff progresivo, con jitter ±20 % POR PASADA
abandonado ⟺ estado ∈ {rechazada, error} ∧ intentos ≥ 5 ∧ pasó la espera
```

Constantes: `MAX_INTENTOS_PARTE = 5`, `ESPERA_BASE_REINTENTO_MS = 1 h`,
`FACTOR_BACKOFF_REINTENTO = 2`, `ESPERA_REINTENTO_MAXIMA_MS = 16 h`. Cada rechazo se
traduce a **qué campo corregir** (`campoDeRutaMIR`, `camposEnTextoDeError`): la regla es
que un rechazo no se deduce del estado de la reserva sino de la última comunicación, y no
todos los rechazos son del huésped. Métricas por hotel (`partes-metrics.ts`) con alerta
`PARTES_SIN_REINTENTAR_UMBRAL_ALERTA = 0.25` y mínimo 3. Email de aviso construido en
`aviso-partes.ts` (`MAX_PARTES_EN_EMAIL = 5`).

**Dónde.** `parte-rechazo.ts`, `partes-metrics.ts`, `aviso-partes.ts`, cron
`hospitality-registro-viajeros`.

**Guardia.** `hospitality-parte-rechazo`, `hospitality-partes-metrics`,
`hospitality-aviso-partes`, `hospitality-registro-viajeros-abandono`,
`cron-hospitality-registro-viajeros` y **`hospitality-h15-backoff` (18)**: las fronteras
de los peldaños (doblan, tope 16 h, floor de decimales, suma 15 h en cuatro intentos), el
**jitter ±20 %** con azar inyectado (extremos exactos, centrado, simétrico, reproducible,
¡y el tope manda sobre el jitter: en el último peldaño el azar solo puede ACORTAR!), la
regla del peldaño N+1 tras N intentos, y los contratos de fuente (el cron calcula con
jitter, `MAX_REINTENTOS` es alias del módulo). Su hermana del cron congeló antes los
peldaños pelados; ahora congela las BANDAS con jitter y el espaciado estrictamente
creciente.

**Investigar / mejorar.** ~~Jitter~~ → **Hecho** (±20 % por pasada del cron, con la
salvedad honesta de que es jitter de PASADA: los límites viajan en SQL y el azar se tira
una vez por barrido — los partes de una misma pasada comparten desviación, suficiente
para romper la sincronización entre pasadas). Falta medir la distribución real de
intervalos entre caída y recuperación del Ministerio para calibrar base y máximo (1 h/16 h
son hipótesis razonables, no medidas).

---

### H16 · Documentación del huésped ✅

**Qué hace.** Determina qué datos del documento le faltan a un viajero para que su parte
salga completo, y normaliza lo que llega del motor o del check-in.

**En qué beneficia.** Antes, al canal le llegaban nombre y poco más: el parte nacía
`datos_incompletos` y **una persona del hotel** tenía que completarlo antes de que
saliera. Ahora se le pide al huésped y sale solo.

**Parte técnica.** `CAMPOS_VIAJERO`, `normalizarViajero(s)`, `faltantesParaParte`,
`resumenDocumentacion`, `heredarDatosDelTitular`, `titularPrimero`,
`fusionarViajerosEnGuestData`, `viajerosDeGuestData`, `MAX_VIAJEROS_CHECKIN = 30`.
Normalización de fechas/documentos con `ahora` inyectable (testeable) y herencia del
titular: quien reserva no repite sus datos por cada acompañante.

**Dónde.** `guest-checkin.ts`; motor público, check-in online y pantalla de reservas.

**Guardia.** `hospitality-guest-checkin`, `hospitality-checkin-api`, `hospitality-checkin-page`,
`hospitality-registro-viajeros-preguntas`.

**Investigar / mejorar.** Medir la tasa de partes que salen completos **sin intervención
del operador** (el objetivo declarado). Es la métrica que dice si esto funciona o solo
existe.

---

### H17 · Preguntas del check-in y su tasa ✅

**Qué hace.** Permite al hotel pedir información extra al huésped (hora de llegada,
matrícula, mascotas) y mide si los recordatorios consiguen respuestas.

**En qué beneficia.** Es información operativa real (la hora de llegada manda sobre la
convención de las 15:00 en la hoja de housekeeping) sin tocar el XML del Ministerio, que
es un esquema **cerrado**.

**Parte técnica.** La frontera es la regla: las preguntas y las respuestas son del hotel
y **nunca** entran en el parte. `TIPOS_PREGUNTA = texto|opcion|numero|fecha`,
`normalizarPreguntas`, `validarRespuestas`, `requeridasPendientes`,
`esPreguntaHoraLlegada`, `horaDeRespuesta`, `horaEstimadaLlegadaDe`. La métrica compara
el par (reserva, pregunta obligatoria activa) respondida vs. pendiente, con alerta
`RESPUESTA_PREGUNTAS_UMBRAL_ALERTA = 0.5` y mínimo 3 — y **no culpa al huésped**: acusa a
las dos causas que el hotel puede arreglar (plantilla sin la variable o sin enlace, y
reservas de canal sin email ni teléfono).

**Dónde.** `checkin-preguntas.ts`, `preguntas-metrics.ts`; check-in público y Reportes.

**Guardia.** `hospitality-checkin-preguntas`, `hospitality-preguntas-metrics`,
`hospitality-registro-viajeros-preguntas`, `hospitality-comunicaciones-preguntas`.

**Investigar / mejorar.** La métrica dice *cuánto* se responde; falta saber si el
recordatorio **cambia** la tasa (comparar reservas con y sin aviso enviado). Es un
experimento casi natural: la variable ya existe en la plantilla.

---

### H18 · Reseñas ✅

**Qué hace.** Ciclo completo: solicitud tras el check-out → reseña del huésped →
moderación del hotel → publicación en la web del motor. Más importación de reseñas
históricas de OTAs y métricas.

**En qué beneficia.** La web pública no arranca vacía y el hotel mide si mejora: media y
volumen por propiedad y canal, con evolución mensual.

**Parte técnica.** `validarResena`, `validarRespuestaHotel`, `puedeModerar`,
`estadoTrasAccion`, `mediaDeResenas` (**solo publicadas**; sin reseñas no hay media, no
un 0 engañoso), `mesDeEstancia`, `resumenPublicoResenas`. Importación:
`CANALES_IMPORT`, `canalCanonico`, `fechaEstanciaDe`, `parsearCsv` (RF 4180),
`huellaDe` (**sha256**) para que importar el mismo CSV dos veces no duplique, y las
importadas nacen `publicada` (ya pasaron el filtro real: el canal las mostró) sin perder
la posibilidad de rechazarlas. Métricas en `resenas-metrics.ts`.

**Dónde.** `resenas.ts`, `resenas-import.ts`, `resenas-metrics.ts`,
`lib/cron/hospitality-review-request.ts`; `/review/<token>` y web pública.

**Guardia.** `hospitality-resenas`, `cron-hospitality-review-request`,
`hospitality-comunicaciones-i18n` y **`hospitality-h18-resenas-import` (25)**: canales
(canonización con alias congelada — «booking com» hoy es «Otro», si se quiere es un
cambio a propósito), fechas (ISO gana, día > 12 europeo, **la ambigua no se adivina** y
**la imposible se rechaza** — el rollover de `Date` ruedaba 32/01 a febrero: defecto
silencioso corregido), CSV (separador autodetectado, RFC 4180, BOM, sin \n final),
puntuaciones (coma decimal, decimales redondeados, rango), huella sha256 (el mismo CSV no
duplica; cambia comentario/canal/nota → otra reseña) y el contrato fila a fila con número
humano.

**Investigar / mejorar.** Pregunta de negocio abierta: ¿la reseña solicitada por el
sistema tiene mejor puntuación que la espontánea? Y ¿el volumen de reseñas mueve la
conversión del motor? Son dos medidas que cruzan H18 con H4 y que hoy no se calculan.

---

### H19 · i18n del motor y las comunicaciones ✅

**Qué hace.** Español e inglés en el motor público, el formulario de reseñas y los
emails automáticos al huésped, con español por defecto.

**En qué beneficia.** Un huésped que reservó en inglés recibe sus comunicaciones en
inglés. Es conversión directa en un negocio internacional.

**Parte técnica.** `IDIOMAS = ['es','en']`; el defecto es **siempre** `es` (un enlace
corrupto o sin `?lang` no deja la página en idioma indeterminado); servidor y primer
render pintan español y un efecto isomórfico aplica `?lang=` antes del primer paint (sin
destello ni mismatch). `Record<Idioma, Textos>` hace que **un texto nuevo no compile**
hasta saberse en los dos idiomas. `COMUNICACION_EVENTOS_TRADUCIBLES`,
`plantillaSugerida(evento, idioma)`, `fechaLarga`, `monedaFormateada`,
`etiquetasDeCampos`.

El correo del canal email, además, se **compone con bloques**: `DisenoEmail`
(cabecera, título, párrafos, secciones de etiqueta/valor y botones), `normalizarDiseno`
(valida y recorta; los techos se rechazan, no se recortan), `renderDisenoEmail` (compila a
HTML de tabla con estilos en línea), `textoPlanoDiseno` (la parte `text` del correo) y
`disenoSugerido(evento, idioma)` —una sola estructura para los dos idiomas, con las
etiquetas cambiando: una sección nueva no puede existir solo en español—. Interpolación con
escapado por tramos: lo que escribe el hotel lleva escapado y marcas, y lo que viene del
contexto (el nombre del huésped) solo escapado, para que un huésped llamado `**Ana**` no se
vuelva negrita ni un nombre con etiquetas inyecte HTML.

**Dónde.** `booking-i18n.ts`, `resenas-i18n.ts`; página pública, check-in, reseñas y
comunicaciones. El editor visual: `lib/hospitality/comunicaciones-email.ts` (puro) y
`components/hospitality/EditorPlantillaEmail.tsx`, con el diseño en
`hospitality_communication_templates.diseno`.

**Guardia.** `hospitality-booking-i18n`, `hospitality-comunicaciones-i18n`,
`hospitality-comunicaciones-email` (validación, escapado, XSS en el nombre del huésped,
`javascript:` en un enlace, marcas solo en lo que escribe el hotel, paridad es/en de los
diseños sugeridos y que ninguna variable del diseño sea inventada: todas las resuelve
`buildContextoPlantilla`).

**Investigar / mejorar.** Decisión a revisar con datos: `monedaFormateada` existe, pero
en la página pública el dinero sigue **la divisa y no el idioma** del visitante (decisión
consciente del módulo de moneda). Con `?lang=en` un precio de 1.200 EUR se lee
`1.200,00 €`. Es correcto contablemente; conviene verificar que no confunde al huésped
angloparlante (prueba de usabilidad, no de código).

---

### H20 · Listas de recepción y housekeeping ✅

**Qué hace.** Exporta la lista del día (llegadas y salidas, teléfonos, documentos y
respuestas de las preguntas) en CSV, y su versión imprimible para el pasillo.

**En qué beneficia.** La recepción trabaja sin entrar reserva a reserva, y housekeeping
recibe una hoja con qué unidad limpiar, a qué hora y con qué nota.

**Parte técnica.** `construirReservasCsv` con BOM UTF-8 y separador `;` (el Excel de las
recepciones en locale con coma decimal), una columna por pregunta del hotel en su orden.
`construirHojaHousekeeping` con `HORA_LLEGADA = '15:00'` y `HORA_SALIDA = '11:00'`
(convención única: «si el huésped dio una hora, esa manda»), `limpiezaDeUnidad` (las
tareas viven en `HospitalityCleaningTask`; la hoja las resume, no las duplica),
`ocupantesDe`.

**Dónde.** `reservas-csv.ts`, `housekeeping-sheet.ts`; rutas de exportación e impresión.

**Guardia.** `hospitality-reservas-csv`, `hospitality-housekeeping-sheet`,
`hospitality-reservas-export-guard`.

**Investigar / mejorar.** El CSV y la hoja comparten la *where* de la pantalla, lo cual
es la decisión correcta; falta medir si la hora estimada del huésped (H17) mejora de
verdad la planificación de limpiezas (tiempo de limpieza, retrasos).

---

### H21 · Conectividad ✅

**Qué hace.** Conjunto de algoritmos que sincronizan inventario, tarifas y reservas con
las OTAs a través de la capa de conectividad, y **reparan lo que el webhook no pudo**.

**En qué beneficia.** Es la diferencia entre un PMS y una hoja de cálculo: la
disponibilidad del hotel sale al mercado y las reservas entran solas. Y cuando algo falla,
el sistema **sabe qué falló y por qué**, en vez de fallar en silencio.

**Parte técnica.**

| Pieza | Módulo | Regla |
|---|---|---|
| Dispatcher de push | `sync.ts` | Disponibilidad siempre desde estado interno; UPSERT por rango; **sin retries ciegos** (cada push fallido queda con su causa) |
| Credenciales y sonda | `connectivity.ts` | Credenciales cifradas; `testConnectivityConnection` contra `property_details` en el hotel de la sonda (`resolverHotelDeSonda`: entorno → config del proveedor → **hotel real ya vinculado** → `sandbox-pms`); la misma sonda del botón «Probar», de la Conectividad del hotel y del health-check |
| Reconciliación | `reconciliation.ts` | Detecta faltantes (→ book), modificaciones (→ modify), cancelaciones (→ cancel) y divergencias de disponibilidad |
| Incidencias | `incidencias.ts` | Resuelve `roomCode` del payload; vínculo manual/automático; caché de vinculación; multi-habitación (`esPayloadMultiHabitacion`); `EDAD_NINO_UMBRAL = 4` |
| Causa del fallo | `conectividad-causa.ts` | ID de socio deshabilitado/desconocido y **hotel sin conceder a ese ID** (por el texto del proveedor) ganan al código; 401/403 → «credenciales rechazadas»; 5xx/timeout → «sin respuesta del servicio»; otra → error |
| Saneado | `conectividad-secreto.ts` | Oculta `Authorization` y API keys de los cuerpos de error (marcas `[oculto]`, `[truncado]`, `[circular]`), **en la fuente** |
| Descarte del canal, por unidad | `rechazo-canal.ts` | Los `warnings` del proveedor (`INVALID_ROOM_CODE`, `INVALID_RATEPLAN_CODE`) se atribuyen a la unidad por su `roomId`/códigos de tarifa **del envío** (comparación exacta); `unidadesDelEnvio`/`unidadesFueraDelEnvio` deciden quién viajó en ESE push (el de restricciones de tarifa solo lleva unidades con plan con código) y las ausentes se nombran con su motivo; lo que no es de ninguna unidad se informa aparte; un 200 con advertencias sigue siendo `ok: false` |
| Códigos externos | `codigos.ts` | `normalizeExternalCode` (trim + lowercase) |

Crons: reconciliación, health-check diario (`0 5 * * *`) y recordatorio de vínculos
automáticos pendientes cada 3 días.

**Dónde.** `lib/hospitality/*` citados y `lib/cron/hospitality-*.ts`.

**Guardia.** 13 guardias: `hospitality-sync(-dispatch)`, `hospitality-connectivity`,
`hospitality-reconciliation`, `hospitality-incidencias-*` (3 rutas),
`hospitality-conectividad-causa`, `hospitality-conectividad-secreto`,
`hospitality-conectividad-panel`, `hospitality-connection-test`,
`cron-hospitality-reconcile(-scan)`, `cron-hospitality-vinculos-pendientes`,
`hospitality-connectivity-health`, `hospitality-rechazo-canal`.

**Investigar / mejorar.** Es la zona con más superficie y más riesgo, y su investigación
depende de terceros: hoy **toda la capa se prueba contra un proveedor de referencia**.
Los frentes, por orden: (1) credenciales y URLs reales del proveedor (checklist en
`hospitality-checklist-reunion-conectividad.md`); (2) medir la tasa de incidencias de
vinculación por tenant — si es alta, el problema es el `roomCode` del proveedor, no el
webhook; (3) la reconciliación tiene coste O(tenant × reservas del proveedor): medir la
ventana antes de ampliarla.

---

### H22 · Dinero y divisa ✅

**Qué hace.** Única definición de divisas soportadas, cómo se escriben y cómo se elige la
divisa de escritura cuando el dato no la trae.

**En qué beneficia.** Evita el fallo más caro de un SaaS multi-país: crear una unidad,
una tarifa o un cobro en pesos para un hotel español. Que el mínimo del esquema (`MXN`)
**no** sea la primera opción es la diferencia entre una red de seguridad y un error.

**Parte técnica.** `MONEDAS_SOPORTADAS`, `MONEDAS_SELECCIONABLES`, `MONEDA_PLATAFORMA`,
`MONEDA_POR_PAIS`, `monedaDePais`, `monedaPredominante`, `monedaEfectiva`, `primeraMoneda`,
`monedaEscritura`, `localeDeMoneda`, `formatearImporte`, `formatearNumero`,
`importeEnUnidadMinima`/`importeDesdeUnidadMinima` (Stripe), `simboloMoneda`,
`etiquetaMoneda`, `chipMoneda`, y los patrones de detección (`PATRON_MENCION_MONEDA`)
que usan las guardias. La precedencia es: **dato → inventario/unidad → `Tenant.moneda` →
mínimo del esquema** (solo para escritura).

**Dónde.** `lib/moneda.ts`; toda la plataforma.

**Guardia.** `moneda-plataforma-guard` (21 pruebas) + baselines
(`moneda-baseline.json`, `moneda-simbolos-baseline.json`,
`moneda-simbolos-sueltos-baseline.json`). La regla es que los inventarios **nunca se
regeneran** para legalizar deuda nueva.

**Investigar / mejorar.** El hueco conocido: agregados multimoneda sin tipo de cambio
(ver H11). Es una decisión de producto pendiente, con impacto directo en Reportes.

---

### H23 · Permisos por capacidad ✅

**Qué hace.** Decide quién puede hacer qué, por **capacidad** (`integraciones.gestionar`,
`reservas.editar`, `finanzas.gestionar`, `operaciones.checkin`…) y no por nombre de rol.

**En qué beneficia.** Un hotel que llama «Anfitrión» a su rol no se queda sin poder
operar. Y la UI no ofrece botones que devuelven 403: las acciones de escritura se
envuelven en `<AccionHospitality>` con la capacidad que exige la API.

**Parte técnica.** Las decisiones por caso (`capacidadDeTarea`,
`capacidadDeLecturaDeTarea`, `capacidadDeCambioDeReserva`) viven en `capacidades.ts`, un
módulo **puro** importable desde el navegador; `permissions.ts` las reexporta. Envolver
una acción es declarar su capacidad, y la misma función la usa el servidor: no hay una
segunda opinión.

**Dónde.** `capacidades.ts`, `permissions.ts`, componentes de acción.

**Guardia.** `hospitality-permissions`, `hospitality-permissions-routes`,
`hospitality-permissions-guard`, `hospitality-ui-permissions-guard`,
`hospitality-acciones-ui`.

**Investigar / mejorar.** La guardia estática de UI solo mira
`onClick`/`onSubmit`/`onKeyDown`/`onDoubleClick`; un control que escribe por
`onValueChange` se le escapa (ya pasó con el selector de estado). Un test de
componente que renderice con un rol limitado y compruebe que no hay controles de escritura
es más caro pero cierra la clase entera de fallos.

---

### H24 · Crons y su estado ✅

**Qué hace.** Store en memoria del estado de cada job programado: nombre, horario,
última ejecución, resultado, próxima estimada y avisos.

**En qué beneficia.** Ver de un vistazo si los barridos (holds, partes, salud de
conectividad, reseñas) están corriendo o fallando sin abrir logs.

**Parte técnica.** `registerCronJob`, `cronJobStarted`, `cronJobCompleted`, `cronJobFailed`,
`cronJobSkipped`, `getAllCronStatus`, `getCronStatus`. Al ser memoria, se resetea al
reiniciar: es una decisión declarada (el panel muestra el proceso vivo).

**Dónde.** `lib/cron/cron-status.ts`; panel admin.

**Guardia.** `admin-hospitality-crons-avisos` (+ por cron).

**Investigar / mejorar.** El estado se pierde al reiniciar. Si se quiere tendencia
(«este job falla desde el martes»), hace falta persistir el histórico de ejecuciones; es
exactamente el tipo de dato que necesitan las mejoras de H7 y H15 para calibrar ventanas.

---

## 3. Familia comercial — fichas

> **Estado de la familia: 13 algoritmos, 10 con guardia.** C1 (14 pruebas), C2 (9), C3 (21),
> C4 (37), C5 (38), C6 (32), C7 (12), C8 (18), C9 (8) y C13 (18) — el ciclo completo del riesgo (salud →
> alerta → puerta → formación → cosecha del conocimiento) tiene red, su cliente
> simulado también, la escalada de dificultad usa el récord del vendedor (defecto de
> C2 corregido y congelado), el ranking se ve en pantalla y el entrenador del deal está
> aislado por tenant. Las fichas
> son, también la lista de trabajo del §5.1.

### C1 · Digital Twin del cliente (roleplay) ✅

**Qué hace.** Gemma adopta el papel del cliente real a partir de su historial (notas e
interacciones) y responde al vendedor que practica.

**En qué beneficia.** El vendedor novato se equivoca con la IA, no con un cliente real.
Practicar con el cliente concreto que va a tener delante es mucho más útil que un caso
genérico.

**Parte técnica.** `generateCustomerResponse({ leadId, tenantId, agentMessage, history })`
construye el prompt con las 10 últimas notas y las 5 últimas interacciones del lead,
y fuerza salida JSON (`customerResponse`, `objectionType`, `sentiment`). Si el JSON falla,
hay fallback a texto plano. Expuesto como skill `generate_customer_response`; UI en
`RoleplaySimulator.tsx`, montado en la ficha del lead.

**Dónde.** `lib/skills/training-skills.ts` · `components/training/RoleplaySimulator.tsx` ·
`app/dashboard/leads/[id]/page.tsx`.

**Guardia.** `tests/sales-roleplay-gemelo.test.ts` (14, con `callGemma` estubeado —
ninguna prueba llama al modelo de verdad): el gemelo digital (identidad, notas e
interacciones reales en el prompt; sin lead no hay sesión; sin notas, escepticismo por
defecto; historial mapeado agente→user/cliente→model con el mensaje del agente al final),
la escalada (86 → MODO LEYENDA con temperatura 0.9; **frontera exacta 85 → ESTÁNDAR con
0.7**; sin historial → ESTÁNDAR — ahora siempre con `agentId`, la vía real) y el contrato JSON de cinco campos (`customerResponse`,
`objectionType`, `sentiment`, `leadName`, `systemPromptUsed`) con sus fallbacks: markdown
limpiado antes de parsear, JSON roto → texto crudo con objeción «general» y sentimiento
«neutral» (truncado a 500 + «...») e IA caída → error explícito, no un cliente inventado.
**Riesgo concreto que sigue abierto**: el número de notas es fijo (10/5) sin acotar
tokens; un lead con notas larguísimas puede desbordar el contexto.

**Investigar / mejorar.** (1) Medir fidelidad: ¿un vendedor que practica con el twin
cierra más con ese cliente? Es la pregunta que justifica todo el módulo y hoy no se
puede responder. (2) Acotar el contexto por tokens, no por número de notas. ~~(3) Test con
el cliente de IA *stubeado*~~ → **hecho** (guardia C1).

---

### C2 · Escalada automática de dificultad ✅

**Qué hace.** Si el mejor score histórico del agente supera 85, el cliente simulado pasa
a «MODO LEYENDA»: agresivo, con objeciones duras y temperatura 0.9.

**En qué beneficia.** Dificultad adaptativa: el bueno no se aburre y el nuevo no se
frustra. Es el único punto del ciclo de roleplay que hoy es verdaderamente automático.

**Parte técnica.** `bestScore = max(score) where { userId: agentId, tenantId }` →
`isHardMode` (estrictamente `> 85`) → prompt alternativo y `temperature` 0.9 vs. 0.7.
Sin vendedor en la llamada no hay consulta: ESTÁNDAR — nunca se usa el récord de otro.
La frontera (85/86 y temperaturas) vive congelada en la guardia de C1; el FILTRO, en la
propia (fichero `sales-c2-escalada.test.ts`).

**Dónde.** `lib/skills/training-skills.ts` · vía completa: `app/api/ai/skill-handler`
(pasa el objeto con `agentId` de la sesión) y `lib/skills/index.ts` (wrapper
`suggest_customer_response`, propaga `userId`).

**Guardia.** `tests/sales-c2-escalada.test.ts` (9): el where por vendedor (`userId:
agentId, tenantId`), **sin vendedor no hay consulta** (ninguna sesión de nadie alimenta
la escalada), sin sesiones previas → ESTÁNDAR, el récord de otro vendedor no puede
aparecer; y la vía completa — la ruta entrega al skill el OBJETO que espera su firma con
el `userId` de la sesión (la llamada era POSICIONAL y jamás casaba; segundo defecto de
la misma vía), con `agentId` indefinido sin usuario. Contratos de fuente: el filtro no
puede volver al defecto (`where { userId: tenantId }` prohibido), el wrapper propaga
`userId` y la ruta firma objeto + `agentId`.

**Investigar / mejorar.** (1) El umbral 85 y las temperaturas son hipótesis: con las
sesiones ya persistidas (`TrainingSession`) se puede calibrar — ¿el score discrimina de
verdad entre vendedores? Si la distribución está pegada, 85 no significa nada. (2) El
skill-handler resuelve `userId` de la sesión, pero la ruta del simulador en modo
anónimo/demo no existiría: si algún día hay práctica sin sesión, decidir explícitamente
qué récord (ninguno) usa ese caso. Ya congelado: sin `agentId` no hay consulta.

---

### C3 · Post-mortem y puntuación de cierre ✅

**Qué hace.** Evalúa la sesión y devuelve `puntuacion_cierre` (0-100), el argumento más
fuerte, un punto de mejora y la técnica detectada.

**En qué beneficia.** Convierte una práctica en feedback accionable. Es lo que sustituye
al «escucha 100 llamadas» del supervisor.

**Parte técnica.** Cuatro criterios declarados en el prompt —manejo de objeciones,
aportación de valor, técnica de cierre, escucha activa— y salida JSON forzada, con dos
fallbacks (50 y 60) si la IA falla; son scores **sintéticos**: se persisten como práctica
pero no celebran. Persiste en `TrainingSession` con `leadId`, `interacciones`, etc. Si
supera el récord personal con un score REAL del modelo, notifica al usuario y emite un
`high-five` a todo el equipo.

**Dónde.** `lib/skills/training-skills.ts` · UI `RoleplaySimulator.tsx`.

**Guardia.** `tests/sales-roleplay-postmortem.test.ts` (21, con `callGemma` estubeado —
ninguna prueba llama al modelo de verdad): el contrato de los cuatro campos que consume
el simulador, la **normalización del rango 0-100 en el borde del módulo** (string
numérico, 850, negativo, decimal, null → entero válido o 60 «evaluación parcial»; sin
ella, un score fuera de rango corrompe el récord y un null revienta la persistencia),
los fallbacks de IA caída (50, sesión persistida igual) y JSON roto (60), la **separación
récord ↔ fallback** (los tres fallbacks son sintéticos y jamás celebran récord ni
high-five; antes, un 50 de IA caída con previo 40 se celebraba como récord — quirk
congelado y corregido), récord personal y high-five solo al superar el mejor previo con
score real, cosecha ≥ 90 (89 no cosecha) y el cableado con C13 (78 levanta la puerta y
emite `TRAINING_COMPLETED`; 69 no). El scoring
sigue siendo **no determinista** (depende del modelo) y sin
guardia no se detecta una regresión de prompt.

**Investigar / mejorar.** Es el algoritmo con más valor y menos control. Frentes:
(1) congelar un prompt versionado y evaluarlo con un conjunto de sesiones fijas
(regresión de scoring); (2) validar el contrato JSON y el rango 0-100 en un test;
(3) comprobar si el score predice algo externo (¿los vendedores con score alto venden
más?). Sin esa correlación, el score es una opinión con formato numérico.

---

### C4 · Cosecha de mejores prácticas → Playbook ✅

**Qué hace.** Si una sesión saca ≥90, extrae la lección (objeción real del cliente,
respuesta ganadora, técnica y puntuación) y la añade al Playbook de ventas del tenant
(visible en la Academia).

**En qué beneficia.** El conocimiento deja de ser de una persona y pasa a ser un activo
del equipo: onboarding de nuevos vendedores con argumentos que ya funcionaron.**Parte técnica.** Módulo propio `lib/sales/playbook-cosecha.ts`: `cosecharMejorPractica` crea el `SalesPlaybookEntry` —única vía de escritura— con `topic` CLASIFICADO POR CONTENIDO por la función pura `clasificarTema` (precio, ROI, cierre, confianza, técnica; respaldo «Argumento general de ventas»; ventana = últimos 6 turnos + técnica detectada), la **objeción REAL del cliente** (último turno customer, truncada a 500) en vez de una cadena fija, `bestResponse`, `technique`, `score`, `status: 'approved'`, con el umbral `UMBRAL_COSECHA = 90` aplicado DENTRO del servicio.

> **Deduplicación.** La lección lleva una **huella sha256** (tema + objeción normalizada:
> minúsculas, sin tildes ni signos, espacios colapsados — «El PRECIO me parece caro» y
> «el precio me parece caro» son LA MISMA lección) y `@@unique([tenantId, huellaLeccion])`
> en el esquema (migración `20260923130000_playbook_huella_leccion`). Dos barreras: una
> sonda `findFirst` evita la escritura y el constraint único respalda la carrera
> concurrente (el perdedor entra por el catch sin romper el post-mortem). Resultado:
> primera vez `{ entrada, duplicado: false }`; si ya existía, `{ entrada, duplicado: true }`
> SIN crear fila. La misma objeción bajo dos temas NO es la misma lección — el tema forma
> parte de la identidad.

`LivingPlaybook.tsx` lo pinta vía `/api/analytics/training/playbook`. El random y
`harvestBestPractices` están eliminados de `training-skills.ts`, que solo decide *cuándo*
cosechar (≥ UMBRAL_COSECHA) y delega.

**Dónde.** `lib/sales/playbook-cosecha.ts` · `lib/skills/training-skills.ts` (decide
cuándo) · `components/training/LivingPlaybook.tsx` · `components/hubs/AcademiaDashboard.tsx`.

**Guardia.** `tests/sales-playbook-cosecha.test.ts` (37): las seis categorías con sus
enjambres reales, la ventana de 6 turnos, la precedencia congelada (la técnica detectada
pesa en la clasificación), determinismo, respaldo, umbral con frontera exacta (89 no
cosecha, 90 sí), objeción real del cliente, truncado a 500, fallo de BD que no rompe el
post-mortem y única escritura (el random no puede volver: la fuente se lee en la prueba).
Más el bloque de deduplicación (14): normalizador (minúsculas, tildes, signos, espacios),
sesiones distintas que separan, huella sha256 determinista, primera vez crea con huella,
**segunda vez con la objeción en otra forma devuelve la existente y NO crea**, sonda por
huella exacta, dedupe POR TENANT, caída de la sonda sin perder la lección, competencia
concurrente por el unique → null sin lanzar, y doble prueba de fuente/esquema (la huella
no se puede desactivar sin tocar el módulo).

**Investigar / mejorar.** La clasificación por contenido es determinista y auditable, y la
deduplicación ya está cerrada (huella por tema + objeción normalizada, única por tenant).
Quedan: (1) medir si el Playbook acelera el onboarding (¿los nuevos con acceso cierran
antes?); (2) ampliar los enjambres con las objeciones reales de cada tenant cuando haya
muestra; (3) página de gestión del Playbook: editar/archivar entradas duplicadas que ya
existan de la época sin huella.

---

### C5 · Ranking de cerradores ✅

**Qué hace.** El CONCURSO de cerradores: una edición por MES NATURAL, con ranking en
pantalla del mes en curso (se REINICIA cada mes), ganador congelado al cerrar cada
edición y el historial de ganadores visible. **Montado en la Academia**: el ranking se
ve bajo los gráficos, sobre el Living Playbook.

**En qué beneficia.** Es la parte competitiva («concurso de roleplay») con reglas de
liga: cada mes arranca de cero, así que quien llega tarde puede ganar — antes la media
histórica acumulaba y el que empezó primero siempre iba delante.

**Parte técnica.** Módulo puro `lib/sales/leaderboard.ts`: `construirRanking` (cruce con
`User`, media redondeada, **orden determinista** — media desc; a igual media gana quien
MÁS SESIONES completó — truncado al top) y las piezas del periodo: `clavePeriodo`
(`AAAA-MM` del mes NATURAL local), `rangoPeriodo` ([desde, hasta) del mes completo),
`nombrePeriodo` («septiembre 2026») y `ganadorDe` (la primera entrada del ranking; sin
práctica, no hay ganador). Servicio `lib/sales/contest-ediciones.ts`: el cierre es
**ON-READ e IDEMPOTENTE** — la primera lectura del ranking tras terminar un mes congela
su ganador con las sesiones de ESE mes; el mes en curso NUNCA se cierra; un mes sin
práctica no corona a nadie; y la carrera entre lecturas simultáneas la arbitra el unique.
Modelo `SalesContestEdition` (`@@unique([tenantId, periodo])`, migración
`20260923140000_sales_contest_editions`). La ruta agrega SOLO el mes en curso (filter
`createdAt` dentro del rango, sin `take`) y devuelve `ranking + concurso`. Pantalla:
cabecera «Edición de …», sección «Ediciones cerradas» con la corona del ganador, y el
estado vacío explica que la edición está abierta. Seed: sesiones repartidas entre el mes
anterior y el actual con ganadores distintos.

**Dónde.** `lib/sales/leaderboard.ts` · `lib/sales/contest-ediciones.ts` ·
`app/api/analytics/training/leaderboard/route.ts` ·
`components/analytics/TrainingLeaderboard.tsx` · `components/hubs/AcademiaDashboard.tsx`
· `scripts/seed-leaderboard.ts`.

**Guardia.** `tests/sales-leaderboard.test.tsx` (38, jsdom): módulo (7 de ranking: orden
con redondeo, desempate congelado, empate total, top 10, usuario fantasma, media null →
0, contrato EXACTO; 6 de periodo: clave con ceros y frontera de mes, rango completo,
claves malformadas rechazadas, nombre legible, ganador por desempate y null sin práctica),
servicio (7 de cierre: el mes natural con ganador de SUS sesiones, todos los meses
pendientes en orden, no reabre lo cerrado, mes en curso intacto, mes sin práctica sin
corona, carrera arbitrada por el unique sin duplicar, y sin sesiones ni una consulta;
más 3 de estado y degradación elegante si el cierre revienta), API (5: tenant+mes en
curso, el REINICIO congelado por where, concurso en la respuesta, sin `take`, 500 sin
filtrar error), pantalla (7: ruta, filas, cabecera de edición, ganadores con corona,
edición abierta sin prácticas, estados vacíos, montaje en Academia) y 3 de fuente (ruta
que delega sin take ni Math.round, el rango del periodo no puede desactivarse, unique en
esquema).

**Investigar / mejorar.** La media del mes castiga practicar cuando el mes se acaba:
una sesión mala a final de mes baja el ranking justo antes del cierre. Medir y decidir
(¿media? ¿mejor de las N? ¿media de las 5 mejores?). El anuncio del ganador (notificación
tipo high-five al cerrar la edición) es la pieza natural siguiente.

---

### C6 · Health Score del deal ✅

**Qué hace.** Puntúa cada oportunidad de 0 a 100 y la clasifica: `HEALTHY`, `WARNING`,
`CRITICAL` o `ZOMBIE`.

**En qué beneficia.** Detecta el riesgo de pérdida de un cliente **antes** de perderlo:
la oportunidad que lleva 20 días parada deja de ser invisible.

**Parte técnica.** Regla determinista, 100 menos penalizaciones:

| Factor | Peso | Regla |
|---|---|---|
| Estancamiento | 40 | −5 por día a partir del día 7 sin cambios |
| Velocidad de actividad | 40 | sin actividad −40; −8 por día a partir del día 3 |
| SLA por prioridad | 20 | urgente 5 d · alta 10 d · resto 20 d → −20 |

Cortes: `<30 ZOMBIE`, `<50 CRITICAL`, `<75 WARNING`. Persiste `healthScore`,
`healthStatus` y `lastHealthUpdate`. `syncPipelineHealth` recalcula el pipeline activo
(con un «evitar recálculo si se actualizó hace menos de una hora» declarado pero **no
implementado**).

**Dónde.** `lib/sales/pipeline-health-service.ts`; invocado por
`/api/deals/sync` → `PipelineWatchdog`. **Dataset de calibración**: modelo
`HealthSnapshot` (migración `20260923120000_health_snapshots`) — cada recálculo deja una
fila con el score y SUS entradas (dedupe 24 h; re-muestra si el score cambió), el PATCH
del deal marca el desenlace en la ÚLTIMA fila al cerrar (`'ganado' | 'perdido'`, nunca
recreado) y `GET /api/deals/calibracion` entrega el resumen, la evaluación del corte 50 y
de alternativos (30/40/60/70) con precisión/recall, vía el módulo puro
`lib/sales/health-calibracion.ts`.

**Guardia.** Dos: `tests/sales-health-autopilot.test.ts` (26) congela pesos y cortes con
casos nominales de una sola vía, más el dataset (instantánea con entradas y desenlace
NULL, dedupe 24 h por las dos orillas, re-muestra por cambio de score, fallo del dataset
que no rompe el recálculo, y el desenlace marcando solo la última fila); y
`tests/sales-health-calibracion.test.ts` (14) congela la evaluación — una fila por deal
cerrado (el historial no infla la muestra), precisión/recall con null sin denominador,
veredicto «¿el score separa?» solo con muestra en ambos lados, y la API que lee y
entrega sin interpretar. Con el dataset en marcha, la calibración deja de ser un plan:

**Investigar / mejorar.** Es el algoritmo comercial más medible y el más fácil de
mejorar: los pesos 40/40/20 y los cortes son **hipótesis sin calibrar**. Lo que falta es
la etiqueta de desenlace (ganado/perdido) para poder medir si el score ordena bien.
Con `estado: ganado|perdido` ya en el modelo, se puede: (a) medir precisión/recall del
corte CRITICAL, (b) ajustar pesos por regresión logística o árbol simple, (c) fijar los
cortes por percentiles en vez de por números redondos. También está el bug latente del
recálculo horario y el patrón N+1 de `syncPipelineHealth` (una consulta por deal): con
pipelines grandes conviene agregar.

---

### C7 · Watchdog de abandono de deals ✅

**Qué hace.** Escanea el pipeline, alerta por Telegram de los deals críticos y etiqueta
automáticamente los extremos.

**En qué beneficia.** El riesgo detectado llega a una persona (no se queda en un panel):
es la diferencia entre medir y actuar.

**Parte técnica.** Tras recalcular salud, filtra `CRITICAL ∧ valor > 5000` y
**deduplica 24 h** con `lastAlertSent`. Auto-etiqueta `HOT` (>85) / `ZOMBIE` (<25)
limpiando la etiqueta contraria.

**Dónde.** `lib/sales/pipeline-watchdog.ts`; `/api/deals/sync`.

**Guardia.** `tests/sales-watchdog-alerts.test.ts` (12): alertas Telegram (solo CRITICAL,
umbral de valor con frontera exacta 5000/5000.01, dedupe 24 h con las dos orillas 23/25,
marca `lastAlertSent`, y fallo de Telegram que no rompe el barrido) y auto-tagging (HOT
> 85 reemplaza ZOMBIE, ZOMBIE < 25 reemplaza HOT — los cortes del tagging son 25/85, no
los 30 del estado —, etiquetas humanas conservadas, escritura incondicional del barrido
congelada tal cual, y convivencia con la puerta de práctica, que el tagging no elimina
jamás). El arranque del watchdog (recalcular y abrir puertas, C13) está en
`tests/sales-training-gate.test.ts`; el cálculo de salud, en la guardia de C6.

**Investigar / mejorar.** El umbral 5000 está en la moneda del deal y **es fijo**: un
tenant en pesos y otro en euros no deberían compartir umbral (aquí el módulo de moneda no
se usa). Y la alerta no tiene acuse: no se sabe si alguien la leyó. Instrumentar alerta →
acción (¿el deal se movió en 48 h?) es la medida de si el watchdog sirve.

---

### C8 · Riesgo de ghosting + estrategia ✅

**Qué hace.** Gemma analiza el deal y devuelve sentimiento, dolores detectados, un plan
(`successPath`), contra-argumentos por objeción y una probabilidad de ghosting.

**En qué beneficia.** El vendedor recibe la siguiente mejor acción y el argumento para la
objeción probable, en vez de improvisar.

**Parte técnica.** `DealCoachService.getDealAdvice(dealId, tenantId)` carga actividades,
notas del lead, contacto, empresa y borradores; pide JSON y persiste en el deal
(`aiStrategy`, `aiSentiment`, `aiDetectedPain`, `aiNextBestAction`, `aiGhostingRisk`,
`lastAiConsult`). Incluye `rationale`, `confidenceScore` (0-1) y `evidencePoints` para
explicabilidad.

**Dónde.** `lib/sales/deal-coach-service.ts`.

**Guardia.** `tests/sales-deal-coach.test.ts` (18, IA estubeada): contrato con degradaciones
declaradas (IA minimalista → NEUTRAL/0/listas vacías; C6 caído → healthScore 0 y la
asesoría se entrega), prompt con los datos reales del trato, **ámbito corregido** — la
búsqueda era `findUnique` por id a secas y la ruta solo comprobaba sesión; ahora el deal
se busca por id Y tenant, y el de otro responde «Deal no encontrado» (mismo patrón del
defecto de C2) —, IA caída y JSON roto → error EXPLÍCITO sin persistir nada (el coach no
inventa estrategia; el markdown que C1/C3 limpian aquí NO se limpia, congelado como
comportamiento real), autopiloto (sin flag cero orquestador; con flag, tareas con
`payload.titulo` y borrador al C9 con rationale/confianza/evidencia y default 0.5) y
persistencia que sobrevive a fallos de BD y orquestador.

**Investigar / mejorar.** `ghostingRisk` es una probabilidad **declarada por el modelo, no
calibrada**: nadie comprueba si un 0.8 acaba en ghosting real. La mejora de más valor:
guardar la predicción y contrastarla con el desenlace (deals que pasan a perdido por
silencio), y publicar una curva de calibración. El resto son decisiones pendientes, no
defectos silenciosos: limpiar markdown como C1/C3 si el modelo empieza a envolver el JSON,
y valorar un fallback ante JSON inválido (hoy: error explícito, que puede ser lo correcto).

---

### C9 · Autopiloto con guardrail de confianza ✅

**Qué hace.** Ejecuta las acciones sugeridas por la IA si el tenant tiene autopiloto
activado y la confianza es alta; si no, las deja como sugerencia.

**En qué beneficia.** Permite automatizar el trabajo de bajo riesgo (crear tarea,
redactar borrador) sin regalar decisiones al modelo.

**Parte técnica.** `executeAction(...)`: `isAuto = confidence >= 0.7`; acciones
`CREATE_TASK`, `GENERATE_DRAFT`, `ESCALATE_DEAL`. **Toda** decisión —ejecutada o
sugerida— se registra en `AiDecisionLog` con `rationale`, `evidence`, `confidence` e
`isAutoExecuted`: explicabilidad por diseño. `isAutopilotEnabled(tenantId)` lee
`Tenant.aiAutopilot`.

**Dónde.** `lib/sales/action-orchestrator.ts`.

**Guardia.** `tests/sales-health-autopilot.test.ts` (8): frontera exacta del guardrail
(0.7 ejecuta, 0.69 sugiere), las tres acciones con su rastro (CREATE_TASK con rationale
en la descripción, GENERATE_DRAFT con metadatos de origen y confianza, ESCALATE_DEAL con
Telegram + auditoría), **el log siempre** (ejecutado y sugerido — es la única prueba de
que la IA lo propuso), acción desconocida sin ejecutar pero con log, deal inexistente y
flag `aiAutopilot` del tenant.

**Investigar / mejorar.** El 0.7 es un umbral único para acciones de riesgo muy distinto
(crear una tarea no es escalar un deal). Lo razonable es un umbral por tipo de acción y
por tenant. `AiDecisionLog` ya existe: es el dataset perfecto para medir tasa de
aceptación de sugerencias y **subir o bajar el umbral con datos**.

---

### C10 · Briefing de mañana ✅

**Qué hace.** Prioriza los deals del día (los ordena por salud) y redacta el briefing con
los más importantes y los que están en riesgo.

**En qué beneficia.** El vendedor empieza el día sabiendo a quién llamar primero.

**Parte técnica.** `morning-briefing-service.ts`: ordena por `healthScore`, construye
prompt con `titulo`, `valor`, `health` y `sentiment`, pide JSON y compone secciones
(`topDeals`, `riskyDeals`).

**Dónde.** `lib/sales/morning-briefing-service.ts`.

**Guardia.** Ninguna.

**Investigar / mejorar.** La priorización delega el criterio final en el modelo (aunque
el orden previo sea determinista): conviene fijar por contrato cuántos deals entran y que
el modelo **no invente** deals o importes (validación contra la lista de entrada).

---

### C11 · Churn SaaS ✅

**Qué hace.** Calcula tasa de cancelación, clientes perdidos y LTV de la plataforma.

**En qué beneficia.** Es el indicador de salud del negocio de Volkern: si el churn sube,
da igual cuántos módulos haya.

**Parte técnica.** `SaaSMetrics.calculateChurnRate(periodDays = 30)`,
`calculateChurnedCustomers`, `calculateLTV(ARPU, churnRate)`, `calculateDaily`.

**Dónde.** `lib/saas-metrics.ts`.

**Guardia.** Ninguna.

**Investigar / mejorar.** Es **descriptivo, no predictivo**: dice el churn pasado, no qué
cuenta está en riesgo. La oportunidad clara (y el paralelo con C6) es un score de riesgo
por tenant con señales de uso (módulos activos, caída de actividad, tickets, impagos).
Requiere telemetría de producto que hoy no se aprovecha para esto.

---

### C12 · Riesgo de rotación de talento ✅

**Qué hace.** `talent_retention_risk` cruza carga de proyectos y compromiso para estimar
el riesgo de rotación de empleados, ordenando el equipo y contando altos/medios.

**En qué beneficia.** En un negocio de servicios, perder a una persona clave cuesta más
que perder un deal. Es el único algoritmo que predice riesgo **interno**.

**Parte técnica.** `hr-management-skills.ts` y el wrapper en `skills/index.ts`
(`riskLevel` por carga, `factors.workload` y `factors.trainingMaturity`).

**Dónde.** `lib/skills/hr-management-skills.ts`, `lib/skills/index.ts`.

**Guardia.** Ninguna.

**Investigar / mejorar.** Hoy es una heurística por umbrales de carga. Se puede calibrar
con desenlaces reales (bajas, rotaciones) igual que C6, y —lo más interesante— cruzar
ambos: un vendedor con riesgo de rotación alto **y** deals en riesgo es la señal de
alarma compuesta que hoy no existe.

---

### C13 · Puerta de práctica (riesgo → roleplay) ✅

**Qué hace.** Cierra el ciclo entre riesgo y formación: cuando un deal cae a CRÍTICO, el
sistema exige practicar con ESE cliente antes de permitir contacto, y levanta la exigencia
cuando el post-mortem de la práctica alcanza 70.

**En qué beneficia.** Convierte el conocimiento del watchdog en acción obligatoria y
medible: el deal en riesgo ya no depende de que el vendedor reaccione a una alerta — la
práctica con su cliente real es la puerta de entrada para volver a venderlo.

**Parte técnica.** Módulo puro `lib/sales/training-gate.ts` (umbral 70 en
`PUNTUACION_MINIMA`, contacto bloqueable = `actividad`/`cita`/`interaccion`, etiqueta-puerta
`PRACTICA_REQUERIDA` en `Deal.tags` — sin migración). Servicio
`lib/sales/training-gate-service.ts`: `abrirPuertas` (idempotente, la llama el watchdog
tras recalcular salud; notifica al vendedor asignado y emite `TRAINING_REQUIRED`, evento
nuevo tipado en `lib/types/events.ts`), `cerrarPuertaSiAlcanza` (lo llama
`generatePostMortem`; quita la etiqueta, deja nota en la línea de tiempo) y `estado`. El
contacto se bloquea en `POST /api/deals/[id]/activities` con **423** y código
`PRACTICA_REQUERIDA`. `generatePostMortem` ahora **emite `TRAINING_COMPLETED`** — el evento
que `automation-listener` ya mapeaba y nadie emitía; de paso se corrigió su case, que leía
`evaluationId` sobre el payload equivocado (siempre `undefined`). Banner ámbar en la ficha
del deal (`app/dashboard/pipeline/[id]/page.tsx`) con acceso directo al simulador. El
formulario de actividad maneja el 423 con gracia: aviso proactivo cuando el tipo elegido
es contacto, y al recibir el rechazo, toast con el motivo del servidor y apertura del
simulador en el mismo diálogo — nada de error genérico.

**Dónde.** `lib/sales/training-gate.ts` · `lib/sales/training-gate-service.ts` ·
`lib/sales/pipeline-watchdog.ts` · `lib/skills/training-skills.ts` ·
`app/api/deals/[id]/activities/route.ts` · `app/dashboard/pipeline/[id]/page.tsx`.

**Guardia.** `tests/sales-training-gate.test.ts` (18): módulo puro (umbral, contacto,
etiqueta idempotente), servicio (apertura, idempotencia, cierre con rastro, no-cierre bajo
el mínimo), watchdog (abre puertas y lo reporta) y **el bloqueo en la API**: 423 con
código `PRACTICA_REQUERIDA` y enlace al simulador en contacto (llamada/cita/interacción,
verificando que nada se escribe), 201 en notas y tareas con la puerta activa, contacto
normal sin puerta, y que la decisión sale de `actividadBloqueada` y no de una segunda
opinión dentro de la ruta.

**Investigar / mejorar.** El 70 es hipótesis de arranque, no dato calibrado. El sistema ya
registra lo necesario para calibrarlo: puerta abierta + score de práctica + desenlace del
deal. Segunda pregunta abierta: la puerta no distingue tamaño de deal (a diferencia de la
alerta Telegram, que exige valor > 5000) — unificar el criterio cuando haya datos.

---

## 4. Diagramas

### D1 · Qué bloquea una unidad (H1 + H2 + H8 + H9)

```
                        estado de la reserva
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
   cancelada / no_show     pending, confirmed,       checked_out
        │                    checked_in                  │
   NO ocupa (inventario)        │                   estancia terminada
   NO factura (finanzas)   OCUPA según sus noches    (ya no ocupa)
        │                        │
   no_show: SÍ puede cobrar      │
   (penalización, H9)     finEstanciaReal = min(checkOut, checkOutReal)   ← H8
                                 │
                    ┌────────────┴────────────┐
              salida anticipada          sin incidencias
              libera noches no usadas    ocupa hasta checkOut
                                         (check-out NO ocupa su día)
```

### D2 · Ciclo de un hold (H7)

```
 pending ──── pago registrado ────────────────► NO caduca (decisión humana)
    │
    │ sin pagos
    ▼
 ¿ahora > fechaCaducidadHold?  ─── no ──► sigue bloqueando
    │
   sí
    ▼
 cron horario → estado: cancelled + AuditLog 'hospitality_hold_expirado'
    │
    ▼
 métricas (por tenant/propiedad) ──► alerta si abandono > 50 % y ≥ 3

 pending ─── confirma (humano o canal) ──► AuditLog 'hospitality_hold_confirmado'
                                              (par del anterior → tasa exacta)
```

### D3 · Ciclo del parte de viajeros (H14 + H15)

```
 servicio inicia ──► cron 30 * * * * ──► XML → ZIP → Base64 → SOAP ──► MIR
                         ▲                                              │
                         │                                   ┌──────────┴──────────┐
                         │                                aceptado                rechazado
                         │                                   │                       │
                         │                            estado aceptada        campo a corregir
                         │                                                   (campoDeRutaMIR)
                         │                                                           │
                         │                                   ¿intentos < 5? ────────┤
                         │                                        │ sí               │ no
                         │                                   backoff                ▼
                         │                              min(1h·2^(n-1), 16h)    ABANDONADO
                         └────────────────────────────────────┘                   │
                                                            aviso en pantalla + email
                                                            (aviso-partes.ts) + métricas
```

### D4 · Ciclo de la reseña (H18)

```
 check-out ──(+24 h, ventana 72 h)──► cron review-request ──► email /review/<token> (ES/EN)
                                                                    │
                                                          huésped puntúa y comenta
                                                                    │
                                                              nace pendiente
                                                                    │
                                             ┌──────────────────────┴──────────────────┐
                                          publicar                                 rechazar
                                             │                                        │
                                    web pública + media                        no se publica
                                    (solo publicadas)

 vía alternativa: CSV de OTA ──► huella sha256 (dedupe) ──► nace publicada
```

### D5 · Familia comercial: riesgo → acción (C6–C9)

```
                cada deal activo
                       │
        ┌──────────────┴──────────────┐
        │                             │
 health score (C6)              Gemma Deal Coach (C8)
 40 estancamiento               sentimiento · dolores
 40 velocidad actividad         plan · objeciones
 20 SLA                         ghostingRisk
        │                             │
        └──────────┬──────────────────┘
                   ▼
            watchdog (C7)
     CRITICAL ∧ valor > 5000 ∧ sin alerta 24 h
                   │
                   ▼
          Telegram + tags HOT / ZOMBIE
                   │
                   ▼
          ¿autopiloto? (C9) ── confidence ≥ 0.7 ──► ejecuta tarea / borrador / escalado
                   │                                        │
                   no                                       └──► AiDecisionLog (explicabilidad)
                   ▼
            sugerencia (requiere aprobación)

        roleplay (C1–C5): práctica ──► post-mortem ──► cosecha ≥ 90 ──► Playbook ──► onboarding
                                 ▲
                                 │ puerta de práctica (C13)
   deal cae a CRÍTICO ───────────┴─► etiqueta PRACTICA_REQUERIDA ──► contacto bloqueado (423)
                                        post-mortem ≥ 70 ──► etiqueta retirada ──► TRAINING_COMPLETED
```

---

## 5. Agenda de investigación y mejora

Ordenada por **impacto × coste de medir**, no por elegancia.

### 5.1 · Poner guardias a la familia comercial (urgente, barato)

Los pasos 1 y 2 están hechos: `PipelineHealthService` (C6, 11 pruebas) y
`ActionOrchestrator` (C9, 8) están congelados en `tests/sales-health-autopilot.test.ts`,
y C13 (la puerta de práctica) nació con 18. La pasada de guardias añadió C3 (21,
`tests/sales-roleplay-postmortem.test.ts`), C7 (12, `tests/sales-watchdog-alerts.test.ts`)
y C1 (14, `tests/sales-roleplay-gemelo.test.ts` — congela también la frontera de C2)
y C2 (9, `tests/sales-c2-escalada.test.ts` — el filtro del récord del vendedor, con su
defecto corregido). La pasada siguiente cerró C5 (38, con el concurso mensual), C8 (18)
y los dos pasos de Hospitality que quedaban — **el plan §5.1 está CERRADO**: los seis
pasos y la guardia de inventario (§0) están hechos.

| Paso | Qué probar | Por qué ahora |
|---|---|---|
| 3 | ~~Backoff y abandono del parte (H15)~~ | **Hecho** (18 pruebas en `hospitality-h15-backoff`): fronteras de peldaños, jitter ±20 % con azar inyectado —el tope manda sobre el azar—, costura del abandono y contratos de fuente con el cron |
| 4 | ~~`validarResena`/import (H18)~~ | **Hecho** (25 pruebas en `hospitality-h18-resenas-import`): parseo CSV tolerante, fechas sin adivinar ambigüedades (y el rollover de `Date` corregido), huella de dedupe y contrato fila a fila |
| 5 | ~~Scoring de roleplay (C3)~~ | **Hecho** (21 pruebas en `tests/sales-roleplay-postmortem.test.ts`, IA estubeada): contrato, rango 0-100, fallbacks, separación récord↔fallback y cableado con C13 |
| 6 | ~~Alertas y auto-tagging del watchdog (C7)~~ | **Hecho** (12 pruebas en `tests/sales-watchdog-alerts.test.ts`): dedupe 24 h, umbral 5000, etiquetas HOT/ZOMBIE |

Y una guardia de inventario (§0) para que la cifra del documento no se mueva sola.

### 5.2 · Instrumentar antes de optimizar

Sin estos datos, cualquier «mejora» es una opinión:

| Algoritmo | Qué hay que registrar | Qué pregunta responde |
|---|---|---|
| C6 health score | score + desenlace (ganado/perdido) | ✅ **Instrumentado**: `HealthSnapshot` + `GET /api/deals/calibracion` — falta acumular muestra (≥100 deals cerrados por tenant para el verde) |
| C8 ghosting | probabilidad + ¿hubo ghosting real? | calibración del riesgo |
| C9 autopiloto | sugerencia + ¿la aceptó el humano? | umbral óptimo por tipo de acción |
| C7 watchdog | alerta + ¿el deal se movió en 48 h? | ¿sirve avisar? |
| C3/C4 roleplay | score + técnica + ventas del agente | ¿el entrenamiento mueve la aguja? |
| C13 puerta de práctica | puerta abierta + score de práctica + desenlace del deal | ¿exigir práctica salva deals en riesgo? ¿cuál es el mínimo correcto? |
| H7 holds | expirados vs. confirmados por tenant | ventana óptima por hotel |
| H15 partes | intentos hasta aceptación + causa | base y máximo del backoff |
| H16/H17 | % partes completos sin operador; tasa con y sin recordatorio | ¿funciona el pedirle datos al huésped? |

### 5.3 · Correcciones concretas ya identificadas

1. ~~**C2**: la consulta del mejor score filtra por `tenantId` en vez de por usuario~~ →
   **Hecho**: el where es `{ userId: agentId, tenantId }` — sin vendedor no hay consulta
   (ESTÁNDAR, nunca el récord de otro). De camino se corrigió el segundo defecto de la
   misma vía: la ruta llamaba al skill POSICIONALMENTE y jamás casaba con su firma; ahora
   pasa el objeto con el `userId` de la sesión. Congelado en `tests/sales-c2-escalada.test.ts` (9).
2. ~~**C4**: el `topic` del Playbook se elige con `Math.random()`~~ → **Hecho**: módulo
   propio `lib/sales/playbook-cosecha.ts` con clasificación pura por contenido
   (`clasificarTema`) y objeción real del cliente; random eliminado y su vuelta
   bloqueada por guardia. La **deduplicación también está hecha**: huella sha256 por
   tema + objeción normalizada, única por tenant, con sonda previa y constraint único.
3. **C6**: el «no recalcular si se actualizó hace menos de 1 h» está declarado y no
   implementado; además `syncPipelineHealth` es N+1 (una consulta por deal).
4. **H15**: backoff sin jitter → efecto estampida cuando el Ministerio está caído.
5. **C5**: ~~`TrainingLeaderboard` sin importador; ranking histórico sin ediciones~~ →
   **Hecho el concurso completo**: montado en la Academia, ediciones MENSUALES con
   periodo natural, reinicio del ranking y ganador congelado on-read
   (`SalesContestEdition`, unique por tenant+periodo).
6. **C4/C1**: `TRAINING_COMPLETED` está declarado y escuchado en `automation-listener`,
   pero **nadie lo emite**: la automatización existe en el vacío.
7. **C7**: umbral de 5000 fijo e ignorando la divisa del tenant.
8. **H18**: la importación de reseñas no tiene guardia con nombre propio.
9. **H11/H22**: agregados multimoneda sin tipo de cambio (decisión de producto).

### 5.4 · Capacidades que faltan (features, no arreglos)

- **Roleplay automático hasta puntuación mínima** (lo que hoy no existe): disparador por
  riesgo del deal + umbral configurable + puerta de salida. Ojo: *bloquear la venta* es
  decisión de producto; una versión razonable es «recomendar obligatorio y avisar al
  manager», no impedir cerrar.
- ~~**Concurso real**~~ → **Hecho** (C5): ediciones mensuales con periodo, marcador
  visible en la Academia y reinicio del ranking cada mes.
- **Predicción de churn por cuenta** (C11 hoy es descriptivo): usar señales de uso.
- **Riesgo compuesto**: cruzar rotación de talento (C12) con riesgo de deals (C6).

---

## 6. Anexos

### 6.1 · Cómo reproducir y verificar

```bash
cd nextjs_space

# Guardias de una familia
npx vitest run tests/hospitality-*.test.ts        # 114 ficheros de la vertical
npx vitest run tests/cron-hospitality-*.test.ts    # barridos
npx vitest run tests/moneda-plataforma-guard.test.ts

# Puerta completa
npm run typecheck
npx vitest run
```

Referencias de estado actual (sep 2026): **445 ficheros de test**, **114 de Hospitality**,
**0 de la familia comercial**.

### 6.2 · Mapa de guardias por familia

```
lib/hospitality ─────────────────────► 114 tests  (cobertura alta y por regla)
lib/cron/hospitality-* ──────────────► incluidos arriba
lib/moneda.ts ───────────────────────► guardia de plataforma + 3 baselines
lib/sales + lib/skills/training ─────► 0 tests    (deuda principal)
```

### 6.3 · Glosario mínimo

| Término | Significado en este código |
|---|---|
| **puro** | Sin BD, sin red, sin React: entrada → salida, testeable |
| **servicio** | Toca BD o servicios externos |
| **guardia** | Test que protege una regla, no solo un caso |
| **hold** | Reserva `pending` que retiene la unidad mientras se decide |
| **parte** | Comunicación de viajeros al Ministerio (RD 933/2021) |
| **noche** | Día `D` con `checkIn ≤ D < finEstanciaReal`; la noche es la unidad de ocupación |
| **deal** | Oportunidad del pipeline comercial |
| **twin** | Cliente simulado a partir de los datos reales del lead |
| **ADR / RevPAR** | Ingreso medio por noche / por habitación disponible; **excluyen** la penalización |

### 6.4 · Qué NO es este documento

No es el plan maestro (esos viven en `docs/hospitality-*.md` y
`docs/plans/*.md`), ni la ficha comercial (`documentacion_comercial/`), ni el plan de
homologación MIR (`docs/hospitality-mir-homologacion-plan.md`). Este documento describe
**lo que el sistema calcula hoy y cómo mejorarlo con evidencia**.
