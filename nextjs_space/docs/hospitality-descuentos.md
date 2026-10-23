# Descuentos — códigos promocionales del canal directo

Primera entrega de descuentos (18-oct-2026). La referencia visual eran las
pantallas de descuentos del extranet (código promocional, duración de estancia,
última hora, reserva anticipada). **Aquí se entrega el código promocional**; los
otros tres ya existen en el producto como *ajustes* del plan de tarifa
(`HospitalityRatePlan.ajustes`: tramos de antelación, duración y ocupación, con
porcentaje negativo = descuento), pero sin una pantalla propia de «Descuentos».

## Qué hace un código

- Es del **tenant**, no de una propiedad: «VERANO2027» vale en todas las webs
  publicadas del alojamiento.
- Descuenta **solo el alojamiento**: no toca limpieza, tarifas adicionales ni
  extras. Es la base elegida a propósito; ampliarla sería otra decisión de
  negocio, no un detalle de implementación.
- Dos tipos: `porcentaje` (0–100) e `importe` fijo en la moneda del tenant. En
  ambos casos el descuento **se acota al alojamiento**: nunca deja la estancia en
  negativo.
- Condiciones: `desde`/`hasta` sobre la **fecha de entrada** (ambas inclusive),
  `minNoches` y `maxUsos` (`null` = sin límite). `usos` es el contador real.

## Cómo viaja

1. La web pública consulta `POST /api/public/booking/[slug]/promocion` con la
   unidad, las fechas y el texto del código. El servidor cotiza el alojamiento
   con el motor de siempre y devuelve el descuento.
2. Al reservar, el navegador manda **solo el texto** (`codigo`) en
   `POST /api/public/booking/[slug]/reservar`. El motor vuelve a evaluar el
   código: entre la consulta y el cobro puede haberse agotado o caducado.
3. El consumo se hace **dentro de la transacción** con una guarda atómica en la
   base:

   ```sql
   UPDATE hospitality_promo_code
      SET usos = usos + 1
    WHERE id = $1 AND (maxUsos IS NULL OR usos < maxUsos)
   ```

   Si no actualiza fila, la transacción entera se deshace y la reserva no se
   crea con un descuento que el código ya no concede.
4. El desglose de la reserva lleva una línea propia `tipo: 'descuento'` **en
   negativo**, con el concepto «Descuento CODIGO». Finanzas suma líneas, así que
   el bruto sigue cuadrando con el encabezado. En el informe, esa línea tiene su
   propio cajón (`desglose.descuento`, negativo) y su propia columna en el CSV
   (`importe_descuento`): no se mezcla con «otro» ni con los extras, y el resumen
   por moneda muestra «Descuentos aplicados» para que se vea cuánto se está
   dejando en promociones.

## Comparar los códigos entre sí

`usos` dice cuántas veces se usó un código; no dice si valió la pena. La tabla de
rendimiento de la sección **Descuentos** compara los códigos con lo que de verdad
importa: cuánto descuento concedió cada uno y cuánto ingreso dejó.

- Se atribuye por **dato**: la reserva guarda su promoción en
  `payload.promocion.codigo`. Si el payload no existe (datos viejos), se lee del
  concepto de la línea («Descuento VERANO2027»), que es lo que escribe
  `filaDeDescuento`. Lo que no se puede leer **no se reparte**: se cuenta aparte.
- **Otorgado ≠ aprovechado.** `descuentoOtorgado` cuenta todas las reservas con
  el código; `descuentoAprovechado`, solo las que acabaron en venta (una
  cancelada concedió el descuento y no compró nada).
- Se comparan sobre el **alojamiento a tarifa plena** de las reservas con venta,
  que es la base sobre la que el código descontó; `netoPorDescontado` (ingreso
  neto por cada unidad descontada) permite comparar un 10 % con un 20 %.
- Un código del catálogo **sin usar también sale en la tabla, con ceros**: es un
  resultado, no un dato ausente. Y si `usos` del contador supera las reservas del
  periodo, el hueco se declara (`usosSinReservaMedida`) en vez de darlo por bueno.
- Ventana por defecto: **últimos 12 meses** sobre la fecha de entrada, acotable
  con `desde`/`hasta`.

## Medir la conversión (no solo la venta)

`usos` y `reservas` solo cuentan lo que se cerró. La pregunta que decide una
campaña es la otra: **cuánta gente aplicó el código y se fue**. Cada consulta de
la web pública queda registrada con su resultado, y de ahí sale el porcentaje de
conversión de cada código.

- **Se registra el intento, no el importe.** Ni el descuento ni el total viajan a
  este registro: el dinero del código vive en la reserva y en Finanzas. Aquí solo
  consta quién lo intentó, con qué código, para qué estancia y qué pasó.
- **Una sesión, una consulta por código.** El asistente genera una sesión
  estable que viaja en la consulta y en la reserva. Reaplicar el mismo código en
  la misma visita actualiza la fila en lugar de sumar otra: el denominador no se
  infla por pulsar «Aplicar» dos veces.
- **La conversión se demuestra, no se supone.** Al reservar, la consulta de esa
  misma sesión y ese mismo código se marca como convertida **dentro de la
transacción** que crea la reserva. Sin sesión (una integración que llame a la API
  directamente) la reserva se crea igual, pero no se atribuye a ninguna consulta:
  lo que aparece en la tabla es lo que se puede demostrar.
- **Aplicada ≠ rechazada.** Un código inactivo, fuera de fechas, con estancia
  corta o agotado se guarda como intento **rechazado** con su motivo: no entra en
  el denominador (el huésped no lo pudo convertir) y se enseña al lado de las
  consultas, que es lo que explica por qué una promoción no arranca.
- **Las erratas se agrupan.** Los intentos con un código que no existe en el
  catálogo no crean fila: aparecen bajo la tabla como sugerencia (`deCodigosDesconocidos`).
  Es la señal más directa de una campaña mal comunicada.
- Las consultas se leen con la **misma ventana de fecha de entrada** que las
  reservas, para que numerador y denominador hablen de las mismas estancias.

Un código con muchas consultas y pocas reservas no es un fracaso del descuento:
normalmente es un descuento que no compensa. La columna «Conversión» es esa
respuesta, y solo se pinta cuando hay consultas registradas (sin datos, «—»: no
se presume un 100 %).

## Avisar antes de que el código se coma el presupuesto

La tabla dice cuál convierte; nadie entra a mirarla todos los días. Un código que
se prueba mucho y no cierra nada sigue publicado, sigue apareciendo en la web y
sigue sumando intentos (y, cuando convierte algo, descuento) hasta que alguien se
da cuenta. El job `hospitality-promos-alertas` (diario, 09:30) y el aviso ámbar
de la sección **Descuentos** usan la **misma regla**
(`lib/hospitality/promos-alertas.ts`), para que el panel y la notificación no
digan cosas distintas del mismo código.

- **Muestra suficiente**: con menos de **20 consultas** no se juzga. Un código
  recién creado no ha fracasado: no hay datos.
- **Umbral**: por debajo del **5 % de conversión**, con esa muestra, el código no
  vende. `sin_conversion` = ninguna reserva; `conversion_baja` = alguna, pero por
  debajo del umbral.
- **Solo códigos activos**: apagar uno que ya está apagado no es una acción, así
  que no genera aviso.
- **Ventana de REGISTRO (90 días)**, no de estancia: una consulta para dentro de
  seis meses es un intento de hoy. La tabla comparativa sigue midiendo por fecha
  de entrada; el aviso mide la actividad reciente del código.
- **Un aviso por hotel**, no por código: llega al equipo con capacidad
  `reservas.editar` (los mismos que pueden editar el código) como notificación de
  la aplicación con enlace a Descuentos. Se repite como mucho cada **7 días**,
  salvo que aparezca un código que no estaba en el aviso anterior.
- **La marca es el aviso**: cada envío deja una fila en `HospitalitySyncLog`
  (`aviso_promos_sin_conversion`) con los códigos y sus números, que es a la vez
  la auditoría y el reloj del intervalo. Si no hay destinatarios con permiso,
  queda en `pendiente` y el panel de estado lo dice: no se pierde en silencio.
- **El aviso no apaga nada**: la decisión (apagar el código o reescribir su
  mensaje) es del hotel. Automatizarlo cambiaría la web pública sin que nadie lo
  pida.

Un código con muchos rechazos y pocas consultas **aplicadas** no entra aquí: eso
es «no arranca por sus condiciones» (fechas, estancia mínima, agotado), no «no
convence». Los rechazos ya se enseñan al lado de las consultas.

## Piezas

| Pieza | Dónde |
| --- | --- |
| Módulo puro (normalizar, evaluar, descontar) | `lib/hospitality/booking-promos.ts` |
| Módulo puro (rendimiento por código) | `lib/hospitality/promos-rendimiento.ts` |
| Módulo puro (consultas y conversión) | `lib/hospitality/promos-consultas.ts` |
| Módulo puro (alertas de conversión) | `lib/hospitality/promos-alertas.ts` |
| Job de aviso al equipo | `lib/cron/hospitality-promos-alertas.ts` · `GET /api/cron/hospitality-promos-alertas` |
| Registro de consultas (servidor) | `lib/hospitality/promos-registro.ts` |
| Tabla de consultas | `HospitalityPromoConsulta` · `20261019120000_hospitality_promo_consultas` |
| Índice de la ventana de alertas | `20261019130000_hospitality_promo_consulta_fecha` |
| Modelo + migración | `HospitalityPromoCode` · `20261018150000_hospitality_codigos_promocionales` |
| CRUD del panel | `app/api/hospitality/promos/route.ts` |
| Comparativa de códigos | `app/api/hospitality/promos/rendimiento/route.ts` (capacidad `finanzas.ver`) |
| Consulta pública del código | `app/api/public/booking/[slug]/promocion/route.ts` |
| Aplicación en la reserva | `lib/hospitality/booking-engine.ts` (`crearReservaDirecta`) |
| Precio | `lib/hospitality/pricing.ts` (`Cotizacion.descuento`) |
| UI | Motor de reservas → **Descuentos**; asistente → paso de datos |

## Pruebas

`tests/hospitality-promos.test.ts` (20): normalización, porcentaje/importe y tope
al alojamiento, inactivo/fuera de fechas/estancia mínima/agotado, descuento solo
sobre alojamiento (limpieza y tarifas intactas), línea negativa, reserva con
código válido, código agotado que no impide reservar, agotamiento en el cobro
que deshace la reserva y el marcado de la consulta como convertida (por sesión y
código, y nada sin sesión).

`tests/hospitality-promos-rendimiento.test.ts` (24): atribución por payload y por
concepto, línea ilegible que no se reparte, otorgado vs aprovechado con
canceladas, orden por descuento concedido, códigos sin usar con ceros y contador
de usos desviado, ventana por defecto y `hasta` exclusivo, conversión (consulta
sin reserva que baja el porcentaje, rechazos fuera del denominador, erratas
agrupadas, código borrado que conserva su intento), más la ruta (401, 403, filtro
por tenant, solo reservas con línea de descuento y consultas con la misma
ventana).

`tests/hospitality-promos-consultas.test.ts` (9): upsert por (tenant, sesión,
código) para no contar dos veces el mismo intento, fila sin sesión, fallo de la
base que no rompe la consulta del huésped, marcado de la conversión por sesión y
código (y nada sin sesión), y los cuatro desenlaces de la ruta pública (aplicada,
rechazada con motivo, código inexistente y texto que no puede ser un código).

`tests/hospitality-promos-alertas.test.ts` (32): el umbral de muestra y el de
conversión (20 consultas y 5 %), inactivos que no avisan, orden por consultas,
la ventana de 90 días por fecha de registro, el silencio dentro del intervalo,
el código nuevo que se adelanta, el cuerpo acotado a cinco códigos, la marca en
`HospitalitySyncLog`, el hotel sin destinatarios (queda `pendiente` y se avisa en
el panel), el aislamiento de fallos por cuenta, la ruta (200/500/401 y estado
del cron) y la coherencia con el scheduler.

## Límites conocidos

- **Las consultas sin sesión no se pueden convertir.** Un cliente que llame a la
  API pública sin `sesionPromo` deja intentos que nunca constarán como
  convertidos: bajan la conversión del código sin que el código tenga la culpa.
  Se declara aquí porque en la tabla todavía no se distinguen.
- **La conversión no es una sesión de analítica.** La sesión la genera el
  asistente por visita; si el huésped cierra la pestaña y vuelve más tarde, es
  otra sesión y otra consulta (contará como intento sin reserva si reservó desde
  la segunda).
- **No viaja al canal.** Los códigos son del canal directo; las OTAs gestionan
  sus propias promociones. Con el proveedor nuevo (SU API) hay una API de
  promociones, pero es específica de Booking.com (`bdc/promotion/update`) y
  empuja un descuento porcentual por fechas; integrarla es un trabajo aparte.
- Una reserva **directa ya creada** no se recalcula si el código se desactiva
  después: el descuento queda en su línea y en `payload.promocion`.
