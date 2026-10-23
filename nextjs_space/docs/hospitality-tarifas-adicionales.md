# Tarifas adicionales de la estancia

Qué son, dónde se configuran y hasta dónde llegan. Escrito el 18-oct-2026,
después de cerrar la primera entrega.

## El problema que resuelve

El producto solo sabía cobrar **una** tarifa extra: `tarifaLimpieza` en
`hospitality_booking_config`, a nivel de **cuenta**. Todo lo demás (gestión,
mascota, ropa de cama, resort, comunidad) no existía, y el catálogo de *extras*
(`hospitality_extra`) no es lo mismo: un extra es un producto que el huésped
compra (desayuno, traslado), no un cargo de la estancia.

## El modelo

`HospitalityFee` (`hospitality_fee`), **por propiedad**:

| Campo | Para qué |
| --- | --- |
| `nombre` | Lo que se lee en el desglose («Tarifa de gestión») |
| `importe` + `moneda` | Importe **por estancia**; la moneda se resuelve al guardar como en los extras |
| `obligatoria` | `true`: entra en toda reserva de la propiedad. `false`: se ofrece y solo se cobra si el huésped la marca |
| `descripcionEs` / `descripcionEn` | Texto bilingüe de la web |
| `activo` / `orden` | Se desactiva, no se borra: el histórico de reservas conserva su concepto |

Migración: `prisma/migrations/20261018120000_hospitality_tarifas_adicionales`.

## Cómo se cobra

- **Módulo puro** `lib/hospitality/booking-fees.ts`: `totalObligatorias`,
  `resolverTarifas`, `catalogoPublicoDeTarifas`, `filasDeItemsTarifas`. El
  importe sale SIEMPRE del catálogo del servidor; la web solo manda ids.
- **Cotización** (`cotizarEstancia` en `lib/hospitality/pricing.ts`): suma las
  obligatorias. `Cotizacion.tarifas` es nuevo; `total = alojamiento + limpieza +
  tarifas`, y el anticipo se calcula sobre ese total.
- **Reserva directa** (`crearReservaDirecta`): resuelve obligatorias + las
  opcionales marcadas y escribe **una línea por tarifa** en
  `hospitality_reservation_items` (`tipo: 'extra'`, cantidad 1). El
  `amountAfterTax` del encabezado es la suma del desglose.
- **Web pública**: el asistente enseña las obligatorias en el paso 2 (ya están
  dentro del total) y las opcionales como casillas en el paso 3, con estimación
  a la vista; el importe definitivo lo confirma el servidor.
- **Panel**: Motor de reservas → cada propiedad → **Tarifas adicionales**.

Lo que **no** hace: no toca la limpieza clásica (`tarifaLimpieza`). Si el hotel
migra la limpieza a la tabla nueva, debe poner `tarifaLimpieza` a 0/nulo para no
cobrarla dos veces.

## El límite del canal (importante)

La petición original era «también al canal». **Hoy no se puede, y no se
inventó**: el contrato de la capa de conectividad solo acepta importe de tarifa
por noche.

```json
{ "hotelCode": "...", "updates": [{
  "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",
  "rates": [{ "roomCode": "...", "rateplanCode": "...", "rate": 1749 }]
}]}
```

No hay campo de cargos ni de impuestos en `update-rates`
(`RatePushUpdate` en `lib/hospitality/connectivity.ts`). Meter la tarifa dentro
de `rate` inflaría el ADR, falsearía el precio por noche y la comisión de la
OTA, así que no se hace. Consecuencias prácticas:

1. Las tarifas adicionales se cobran en el **canal directo** y en las reservas
   que se crean desde el motor. Las reservas que llegan de una OTA traen su
   importe (`amountAfterTax`) y su propia política de cargos.
2. Publicarlas a un canal exigiría que el proveedor exponga un campo de cargos
   (o un plan de tarifa con cargos). Cuando exista, el sitio es
   `buildRateUpdates` en `lib/hospitality/sync.ts` y el tipo `RatePushUpdate`.

## Pruebas

- `tests/hospitality-booking-fees.test.ts` (14): obligatorias siempre,
  opcionales solo marcadas, importe del catálogo, ids desconocidos/repetidos,
  tarifa a cero, redondeo, total y anticipo con tarifas.
- `tests/hospitality-fees-reserva.test.ts` (5): reserva directa con
  obligatoria, opcional marcada y no marcada, encabezado = suma de líneas, id
  inventado sin cargo.
