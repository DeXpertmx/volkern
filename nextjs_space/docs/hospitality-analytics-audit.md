# Auditoría de analítica de Hospitality: una sola regla, un solo sitio

**Fecha**: 17 de septiembre de 2026 · **Alcance**: rutas de API (`app/api/hospitality/**`) y páginas del dashboard (`app/dashboard/hospitality/**`) contra los módulos puros (`lib/hospitality/**`).

## La invariante

> **El cálculo de analítica vive en los módulos puros; las rutas y las páginas cargan datos y delegan.**

No es una preferencia de estilo: cuando el mismo número se calcula en dos sitios, tarde o temprano se calcula distinto. En esta auditoría había **tres implementaciones de la ocupación** (dos comparando instantes, una por días) y **dos reglas de negocio** para lo mismo (las canceladas no aportaban ingreso en Finanzas, pero sí sumaban gasto en la ficha del huésped).

Dos reglas concretas del módulo, ahora escritas una sola vez:

- **Ocupación (§8, por DÍAS)**: la noche del día D está ocupada si `checkIn <= D < checkOut`, comparando **fechas**, no instantes. Las reservas se guardan con hora (llegada 15:00, salida 11:00) y comparar instantes contra el inicio del día corre la ocupación **un día entero**. La regla canónica es `unitOccupiedOnDay` (motor de disponibilidad) y `coversNight` (analítica) debe coincidir con ella: hay un test que lo exige día a día.
- **Producción**: una reserva cancelada o no-show no ocupa, no factura, no se cobra y no suma en los totales del huésped. Definición única en `lib/hospitality/estados.ts` (`aportaProduccion`, `ESTADOS_SIN_PRODUCCION`).

> **Resuelto (17 sep 2026) — el no-show no bloquea disponibilidad.** Esta auditoría dejó
> abierta la pregunta de si el motor de disponibilidad debía seguir bloqueando las
> reservas no-show (solo excluía `cancelled`, mientras el resto de la vertical las trataba
> como no productivas). Decisión: **no las bloquea**. El no-show es un hecho de cobro, no
> de ocupación; la habitación vuelve al pool vendible y la reserva conserva su importe
> para la penalización por ERP. La regla y sus consecuencias están en
> `docs/hospitality-booking-payments-plan.md` §0 (regla 7), y el motor ahora consume
> `aportaProduccion` en vez de comparar el estado a mano.

## Hallazgos y arreglo

| # | Dónde | Qué pasaba | Severidad | Arreglo |
|---|---|---|---|---|
| 1 | `lib/hospitality/analytics.ts` · `coversNight` | Comparaba instantes: con las horas reales de las reservas **contaba la noche del check-out y perdía la de la llegada** (ocupación desplazada un día en el dashboard y en Reportes). Invisible en los tests porque usaban fechas a medianoche | **Alta** | Comparación por días + test con horas reales y **test de coherencia con `unitOccupiedOnDay`** |
| 2 | `lib/hospitality/analytics.ts` · `toFecha` | Etiquetas de la serie con `toISOString()` (UTC): en husos por delante de UTC los días salían **un día antes** (chart de ocupación y CSV) | **Alta** | Fecha local con `toIsoDate` + test de las fechas de la serie |
| 3 | `app/api/hospitality/dashboard/route.ts` | Ocupación de hoy y «próximos 7 días» calculadas **inline**, con dos variantes distintas entre sí y de la analítica; el mix de canales, también inline | **Alta** | `ocupacionPorDia`, `llegadasDelDia`, `salidasDelDia` y `mixDeCanales` del módulo puro |
| 4 | `app/api/hospitality/operations/route.ts` | El estado por unidad solo miraba llegadas/salidas de hoy: **un huésped a mitad de estancia dejaba su unidad como libre**; además comparaba por instantes | **Alta** | La consulta carga las reservas que **ocupan hoy** y el estado lo decide `unitOccupiedOnDay` |
| 5 | `app/api/hospitality/guests/route.ts` | Agregados del huésped dentro de la ruta (sin test) y **las canceladas sumaban estancias, noches y gasto** | **Media** | Módulo puro `lib/hospitality/guests.ts` (`agruparHuespedes`) con la regla de producción y test |
| 6 | `app/dashboard/hospitality/reservas/page.tsx` | `function noches()` propio duplicando `nightsBetween`, y sumas de noches/ingresos inline | **Media** | `nightsBetween` + `resumenReservas` del módulo |
| 7 | `app/dashboard/hospitality/reportes/page.tsx` | «Ocupación media» = media de las medias por propiedad: una propiedad de 2 unidades pesaba igual que una de 200 | **Media** | `ocupacionGlobal` (día a día, unidades/días) del API, calculada con el módulo |
| 8 | `app/api/hospitality/reservations/route.ts`, `.../[id]`, `onboarding/mapping/deshacer` | La reserva en conflicto se identificaba comparando instantes; fechas mostradas con `toISOString()` (UTC) | **Baja** | Identificación con la misma regla por días y `toIsoDate` para las fechas |

**Aceptado a propósito** (no es duplicación): las páginas suman totales **ya calculados** por la API para pintar tarjetas y escalar gráficos (p. ej. `ingresosPorCanal` en el dashboard o los totales de huéspedes). Lo prohibido es recalcular una regla o sumar importes crudos.

## Las dos convenciones de ventana (a propósito)

Conviven y están documentadas en el código:

- **Producción por llegada** (`kpisVentana`): una reserva entra entera en el período de su **llegada**. Es la convención de los reportes de ingresos y la que hace que `RevPAR = ADR × ocupación` cuadre cuando la estancia cabe en la ventana.
- **Día a día** (`ocupacionPorDia`, `perPropertyOccupancy`, `perChannelRevenueTrend`): cada noche cae en su día. Es la que puede compararse con el planning y con la disponibilidad.

Un reporte que mezcle las dos sin decirlo es un reporte que nadie puede conciliar; por eso cada función documenta la suya.

## Guardias

- **Comportamiento**: `tests/hospitality-analytics.test.ts` (horas reales + coherencia con el motor **para cada estado** + `ocupacionPorDia` + llegadas/salidas + `resumenReservas`), `tests/hospitality-sync.test.ts` (el motor ignora canceladas **y no-shows**) y `tests/hospitality-guests.test.ts` (la cancelada no suma).
- **Fuente**: `tests/hospitality-analitica-invariants.test.ts` falla si en la vertical vuelve a aparecer una agregación con `.reduce()`, una suma de `amountAfterTax`, la regla de producción copiada, una comparación `checkIn/checkOut.getTime()` contra un día, o si un sitio deja de consumir su módulo puro.

## Después: los estados (17 sep 2026)

Esta auditoría cerró la duplicación del *cálculo*; quedaba la duplicación de la
*regla de estado* (cuatro listas de «¿ocupa?»). Está auditada y arreglada en
[`docs/hospitality-estados-auditoria.md`](./hospitality-estados-auditoria.md).

> **Cerrado (18 sep 2026) — la decisión del check-out anticipado ya no está
> abierta.** Fue implementada como un **apagador por propiedad** (A «cerrar la
> estancia» / B «registrar la salida real», defecto B), con la regla única
> `finEstanciaReal` (`lib/hospitality/checkout.ts`) consumida por el motor, la
> analítica **y el planning** (vista Mes y salidas de hoy). La invariante de esta
> auditoría queda sin excepciones conocidas: la ocupación —planificada o real—
> se calcula en un solo sitio y todos los consumidores delegan en él. Guardias:
> `tests/hospitality-checkout-salida-anticipada.test.ts`.

## Cómo auditarlo de nuevo

```bash
grep -rn "\.reduce(\|amountAfterTax || 0\|getTime()" app/api/hospitality app/dashboard/hospitality
grep -rn "cancelled' *\(&&\|||\)" lib/hospitality app/api/hospitality
npx vitest run tests/hospitality-analitica-invariants.test.ts
```
