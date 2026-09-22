# Auditoría de estados de reserva: qué ocupa, qué está vivo y qué se movió

**Fecha**: 17 de septiembre de 2026 · **Alcance**: `lib/hospitality/**`, `app/api/hospitality/**`, `app/api/public/**`, `app/api/admin/conectividad/**` y las páginas de hospitality.

Del arreglo del no-show (ver [§0 del plan](./hospitality-booking-payments-plan.md),
regla 7) quedó un cabo suelto: *«¿y los otros estados?»*. Esta auditoría lo
resuelve con una matriz medida, no con una lectura.

## El problema: una pregunta, cuatro respuestas

«¿Esta reserva ocupa la unidad?» estaba respondida con **cuatro listas
distintas** en el código, y ninguna era la del motor:

| Dónde | Predicado | Para qué |
|---|---|---|
| `availability.unitOccupiedOnDay` + `analytics.coversNight` | `aportaProduccion` (excluye cancelada y no-show) | Disponibilidad y ocupación |
| `deshacer` · `operations.ts` (tras limpieza) | `['pending','confirmed','checked_in']` | «¿sigue ocupada?» |
| `dashboard` · `reconciliación` | `['pending','confirmed','checked_in']` | «¿sigue activa?» |
| `calendar.reservationsOnDay` (vista Mes) · llegadas/salidas | `!== 'cancelled'` | «¿ocupa esa noche?» / «¿se movió?» |

Juntarlas daba esto (reserva de 3 noches con la noche de referencia en medio):

```
Estado        | motor | analítica | planning-Mes | llegadas | reserva viva | deshacer | reconcil | limpieza
pending       |  sí   |    sí     |     sí       |    sí    |     sí       |    sí    |    sí    |   sí
confirmed     |  sí   |    sí     |     sí       |    sí    |     sí       |    sí    |    sí    |   sí
checked_in    |  sí   |    sí     |     sí       |    sí    |     sí       |    sí    |    sí    |   sí
checked_out   |  sí   |    sí     |     sí       |    sí    |     no       |    no    |    no    |   no
cancelled     |  no   |    no     |     no       |    no    |     no       |    no    |    no    |   no
no_show       |  no   |    no     |    sí ✘      |    sí    |     no       |    no    |    no    |   no
```

Dos incoherencias, las dos visibles en pantalla:

- **`no_show` en la vista Mes** (✘): el planning lo pintaba como noche
  ocupada mientras el motor la daba por libre.
- **`checked_out`** (la fila que no cuadra del todo): el motor y la analítica lo
  cuentan como ocupación, y las cuatro vistas de «reserva viva» no. Es el
  check-out anticipado → ver más abajo.

Y una tercera que **no aparece como columna** porque no era una de las listas:
el KPI «Llegadas hoy» del dashboard usaba `aportaProduccion` (excluía el
no-show) para responder una pregunta de *movimiento*, mientras el panel de
operaciones y `reportesKpis.llegadas` sí lo contaban.

## Las tres preguntas (ahora con nombre y un solo sitio)

No eran una pregunta mal contestada, eran **tres preguntas distintas** tratadas
como una. Ahora viven en `lib/hospitality/estados.ts`:

1. **`aportaProduccion(estado)`** — ¿ocupa y factura? Excluye *cancelada* y
   *no-show*. Es la regla del motor y de la analítica.
2. **`esReservaViva(estado)`** (`ESTADOS_RESERVA_VIVA`) — ¿la estancia sigue en
   curso? Excluye además *checked_out*: una estancia terminada no está activa
   aunque sus fechas cubran el día.
3. **`esMovimientoDelDia(estado)`** (`ESTADOS_CON_MOVIMIENTO`) — ¿pudo haber
   llegada o salida ese día? Solo la *cancelada* carece de movimiento: **el
   no-show sí llegó** (fue un huésped esperado, y su tasa lo necesita en el
   denominador), pero no ocupa.

Más `esEstadoValido` para validar en las APIs (antes era una lista literal
copiada en dos rutas).

## Hallazgos y arreglo

| # | Dónde | Qué pasaba | Severidad | Arreglo |
|---|---|---|---|---|
| 1 | `calendar.reservationsOnDay` (vista Mes del planning) | Filtraba solo «no cancelada», así que **un no-show pintaba la noche como ocupada** mientras el motor la daba por libre y los canales la vendían. Incoherencia motor ↔ planning | **Alta** | `aportaProduccion` + tests (no-show no pinta; `checked_in` sí) |
| 2 | `dashboard` KPI «Llegadas hoy» | Se calculaba con `aportaProduccion` → **excluía el no-show**, mientras `reportesKpis.llegadas` y el panel de operaciones sí lo contaban: el mismo día daba dos cifras | **Alta** | `esMovimientoDelDia`; test que exige `kpis.llegadasHoy === reportesKpis.llegadas` |
| 3 | `dashboard`, `deshacer`, `reconciliación`, `operations.ts` (tras limpieza) | **Cuatro copias** de `['pending','confirmed','checked_in']` | **Media** | `ESTADOS_RESERVA_VIVA` |
| 4 | `finanzas/route` | `ESTADOS_RESERVA_CON_INGRESO` copiaba la regla de producción | **Media** | `estadosConProduccion()` |
| 5 | `admin/conectividad/divergencias` (ruta y página) | Otra copia de la lista de «vivas» | **Baja** | `esReservaViva` |
| 6 | `reservations/route` y `reservations/[id]/route` | `ESTADOS_VALIDOS` duplicado (y podía desincronizarse del vocabulario) | **Baja** | `esEstadoValido` |

**Lo deliberado** (no es incoherencia y por eso se mantiene):

- **El no-show cuenta como llegada del día** en el planning, en el panel de
  operaciones y en el KPI `llegadas`. Fue un huésped esperado; además la tasa de
  no-show es `noShows / llegadas` y sin él en el denominador no significaría nada.
  Lo que **no** hace es ocupar ni facturar.
- **Una reserva `pending` bloquea la unidad** en todas las vistas. Es una
  retención: mientras nadie decida, la habitación no se vende dos veces.
  **Resuelto (18 sep 2026): el hold caduca solo.** Un `pending` que supera la
  ventana de su propiedad (`holdHoras`, defecto 24 h; `0` = sin caducidad) se
  cancela en el barrido `lib/cron/hospitality-holds.ts`
  (`GET /api/cron/hospitality-holds-expirados`, cada hora): la unidad vuelve al
  inventario y se empuja a los canales. **Nunca caduca uno con pagos
  registrados** — eso es una decisión humana, no un barrido — y el cierre deja
  `AuditLog` (`hospitality_hold_expirado`), emite `reservation.cancelled` para
  las automatizaciones y avisa al operador con un resumen por tenant. La regla
  vive en `lib/hospitality/holds.ts`.
  **Observabilidad (18 sep 2026):** la caducidad no se sigue por logs. El job
  queda registrado en el panel de estado de crons (scheduler +
  auto-registro de la ruta HTTP) y sus métricas por tenant se ven en
  `/admin/hospitality`: el endpoint `GET /api/admin/hospitality/holds?dias=30`
  agrega la auditoría del barrido con el módulo puro
  `lib/hospitality/holds-metrics.ts` (caducados por tenant, propiedades
  afectadas, ventana media y último). Lectura: un goteo es el sistema
  funcionando; un pico sostenido es ventana corta o canales que confirman
  tarde.
  **Holds abandonados en Reportes (18 sep 2026):** el ciclo del hold tiene dos
  desenlaces y los dos dejan traza — el barrido escribe `hospitality_hold_expirado`
  y la confirmación (operador o canal) escribe `hospitality_hold_confirmado`
  (`lib/hospitality/holds-audit.ts`, llamado desde el `PATCH` de reservas y desde
  `processModify` del webhook). Con el par exacto, el hotel ve en Reportes
  **caducados frente a confirmados** y su tasa de abandono, que es lo que dice si
  su ventana de retención o sus canales están fallando. La tasa, el umbral del
  aviso y el volumen mínimo viven en `lib/hospitality/holds-metrics.ts`: la
  página solo pinta.  Una reserva que **no** estaba en `pending` no escribe la
  traza (no infla el denominador), y si la traza falla la confirmación sigue en
  pie.
  **Ensayo (18 sep 2026):** el bloque 4 de `npm run test:e2e:booking` recorre el
  ciclo por HTTP contra el motor público — la retención nace `pending`, la
  cotización pública da `ocupada` y el POST responde 409; el barrido la caduca;
  la unidad vuelve a ofrecerse y una reserva pública nueva entra con 201; y las
  dos contrapruebas (con pagos y dentro de la ventana) siguen `pending`. Detalle
  del montaje en `docs/hospitality-booking-engine-e2e.md`.
  Guardias: `tests/hospitality-holds.test.ts`, `tests/cron-hospitality-holds.test.ts`,
  `tests/hospitality-holds-metrics.test.ts`, `tests/cron-hospitality-holds-route.test.ts`,
  `tests/admin-hospitality-holds-route.test.ts`,
  `tests/hospitality-holds-audit.test.ts`, `tests/hospitality-reservation-hold-confirmado.test.ts`,
  `tests/hospitality-reportes-ui-guard.test.ts` y el bloque de holds
  abandonados de `tests/hospitality-dashboard-kpis-guard.test.ts`.
  *(Resuelto, no hallazgo: era una observación abierta de esta auditoría.)*
- **Los bloqueos de mantenimiento/propietario** siguen restando disponibilidad por
  su propio estado (`unitBlockedOnDay`), aparte de las reservas.

## Resuelto: check-out anticipado (decisión del Anfitrión, 18 sep 2026)

Es la **única celda que sigue sin coincidir**: `checked_out` dice «sí» en el
motor y en la analítica, y «no» en las cuatro vistas de «reserva viva».

En el caso normal no importa: si el huésped sale el día de su `checkOut`, la
regla `checkIn <= D < checkOut` ya no bloquea nada desde ese día, y las cuatro
listas tampoco lo cuentan. **Solo se nota con una salida anticipada** (se marcha
el día 1 de una estancia de 3):

- el motor y el planning **siguen bloqueando las noches no usadas**, y el push a
  los canales las publica como no disponibles;
- el dashboard, el preview de deshacer, la reconciliación y el panel de limpieza
  ya lo dan por terminado.

Es decir: una habitación vacía y no vendible — el mismo bloqueo fantasma que
arreglamos para el no-show, por otra puerta. No se ha tocado porque **cerrarlo
bien exige decidir cómo se modela la salida anticipada**, y las dos opciones no
son equivalentes:

| Opción | Qué implica |
|---|---|
| **A. Cerrar la estancia al hacer check-out** (poner el `checkOut` al día en curso) | Barato y sin migración. Libera las noches al instante… pero **pisa las fechas previstas** y, si el hotel cobra la estancia completa, el ADR se infla (ingresos iguales ÷ menos noches vendidas). |
| **B. Guardar la salida real** (`checkOutReal`) y usar `min(checkOut, checkOutReal)` para disponibilidad y ocupación, dejando `checkOut` para noches vendidas y facturación | Es el modelo correcto (planeado ≠ real) y no distorsiona ningún KPI. Pide columna + migración y tocar las entradas del motor y de la analítica. |

**Recomendación: B**, porque separa «qué noches vendí» de «qué noches ocupé», que
es exactamente la distinción que este sistema hoy no puede expresar.

**Decisión (18 sep 2026): NO es global — es un apagador por propiedad.** Cada
Anfitrión elige en la configuración de su propiedad entre A («Cerrar la
estancia») y B («Registrar la salida real»). Implementado así:

- **`politicaSalidaAnticipada`** en `HospitalityProperty`
  (`cerrar_estancia | salida_real`, defecto **B**). Se cambia en la
  configuración de la propiedad (mismo formulario que la política de no-show)
  y por la API (`POST`/`PATCH /api/hospitality/properties`).
- **`checkOutReal`** en `HospitalityReservation` (nueva migración
  `hospitality_salida_anticipada`).
- **Módulo puro `lib/hospitality/checkout.ts`**: `finEstanciaReal` es la única
  definición de «fin real de la estancia» (`min(checkOut, checkOutReal)`) y
  `datosDeSalida` la única de «qué campos escribe el check-out según la
  política». Motor de disponibilidad y analítica consumen `finEstanciaReal`;
  el check-out operativo (`performCheckOperation`) y el PATCH manual de
  reservas aplican `datosDeSalida` — las dos puertas hacen lo mismo.
- **Con A**, el check-out pisa el `checkOut` al día en curso (11:00) solo si
  la salida es anterior a la prevista; salir el día previsto no toca fechas.
  **Con B** se guarda `checkOutReal` y el previsto queda intacto para noches
  vendidas y facturación.
- **Guardias**: `tests/hospitality-checkout-salida-anticipada.test.ts` —
  política, coincidencia motor↔analítica noche a noche, las dos puertas y la
  caída al defecto si la propiedad no es legible.
- **Planning incluido (cierre de la última celda incoherente)**: la vista Mes
  (`calendar.reservationsOnDay`) y la lista de salidas de hoy del planning
  consumen `finEstanciaReal` — con salida anticipada dejan de pintarse como
  ocupadas las noches que el motor ya publica como disponibles, y la salida se
  anuncia el día real, no el previsto. Motor, analítica y planning responden
  ahora lo mismo a «¿ocupa esa noche?». Guardia: mismo fichero, describe «la
  vista Mes del planning consume el fin real (coherencia motor ↔ planning)».
- **Aviso al operador**: cambiar el apagador dispara una notificación push
  in-app a los operadores del tenant (`notificarCambioSalidaAnticipada`,
  mismo patrón que el aviso de vínculos automáticos) con qué política había,
  cuál quedó y desde cuándo aplica (el próximo check-out). Nunca rompe el
  cambio: si el push falla, el PATCH sigue en 200. Guardias:
  `tests/hospitality-checkout-notificacion.test.ts` (el aviso) y
  `tests/hospitality-properties-policy-notificacion.test.ts` (la ruta solo
  avisa con cambio real).

Lo que NO cambia: la reserva sigue sin estar «viva» tras el check-out (las
cuatro listas la excluyen igual), y la producción (noches vendidas, ADR) solo
se mueve si el Anfitrión eligió A.

## Guardias

- **Comportamiento**: `tests/hospitality-calendar-views.test.ts` (un no-show no
  ocupa la vista Mes, pero sí figura como llegada), `tests/hospitality-guests-dashboard.test.ts`
  (`llegadasHoy` coincide con reportes y el no-show no ocupa ni es reserva activa),
  `tests/hospitality-analytics.test.ts` (motor y analítica coinciden para **cada**
  estado) y `tests/hospitality-checkout-salida-anticipada.test.ts` (con salida
  anticipada, motor ↔ analítica ↔ vista Mes coinciden noche a noche).
- **Fuente**: `tests/hospitality-analitica-invariants.test.ts` falla si vuelve a
  aparecer una de las cuatro listas fuera de `estados.ts`, y exige que planning,
  analítica, dashboard, reconciliación, limpieza y finanzas pregunten con el
  vocabulario compartido.

## Cómo auditarlo de nuevo

```bash
# ¿Alguien volvió a copiar una lista de estados?
grep -rn "\['pending', 'confirmed', 'checked_in'\]\|'cancelled', 'checked_out', 'no_show'" lib app
# ¿Alguien decide ocupación sin el motor?
grep -rn "estado !== 'cancelled'\|estado: { not: 'cancelled' }" lib/hospitality app/api
npx vitest run tests/hospitality-analitica-invariants.test.ts tests/hospitality-calendar-views.test.ts
```
