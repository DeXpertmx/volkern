# Extras comprables en el booking engine — el hueco nº 2 frente a Lodgify, cerrado

> Estado: implementado (22 sep 2026) · Pruebas: 14 en `tests/hospitality-booking-extras.test.ts`
>
> El hotel vende desayuno, late check-out o traslados desde su propia web y
> el ticket medio sube desde el primer mes. Todo va al MISMO desglose que ya
> suma Finanzas: no hay un segundo modelo de ingresos.

## El flujo, de la configuración al cobro

```
[1] Hotel (panel Booking Engine) → «Extras comprables» del motor
     │  crea el catálogo por propiedad: nombre, precio, moneda,
     │  ¿precio por noche?, descripción ES/EN
     ▼
[2] GET /api/public/booking/[slug]  → data.extras (solo ACTIVOS, en el idioma
     │  del huésped). El precio viaja del servidor hacia la web, nunca al revés.
     ▼
[3] Huésped → paso 3 de la reserva: selector de cantidad por extra (0–5).
     │  La selección viaja como [{ extraId, cantidad }] — SIN importes.
     ▼
[4] POST /api/public/booking/[slug]
     │  resolverExtras (módulo puro): resuelve contra el catálogo ACTIVO del
     │  servidor, acota cantidades (1–10), consolida duplicados y multiplica
     │  por noches los extras «por noche».
     ▼
[5] Cada extra = una línea tipo 'extra' en HospitalityReservationItem
     │  (createMany) → Finanzas ya lo suma al ingreso bruto y al margen.
     ▼
[6] Cobro Stripe (si hay Connect) por ALOJAMIENTO + EXTRAS.
        La respuesta devuelve { total, totalExtras } para la confirmación.
```

## Las reglas que lo sostienen

**El precio lo pone el servidor.** La selección del huésped nombra el extra y
la cantidad; el importe sale SIEMPRE del catálogo activo de la propiedad
(`resolverExtras`). Guardia en tests: el selector de la web no calcula ni
muestra importes — el total real llega en la confirmación.

**Un extra es una línea del desglose, no un modelo nuevo.** Las líneas se
crean con `tipo: 'extra'` en `HospitalityReservationItem` — el mismo esquema
que ya suman `lib/hospitality/finance.ts` y la pantalla de Finanzas. Sin
migraciones de ingresos ni dobles contabilidades.

**La venta nunca se tumba por un extra.** Si el hotel desactiva un extra
mientras el huésped está en el formulario, ese extra se ignora (queda
dicho en el log con su motivo) y la reserva se crea con el resto. Los
extras son AUXILIARES por diseño; el alojamiento manda.

**Cotas y dedupe**: cantidad 1–10 por extra (el doble click consolida en una
sola línea, sin fabricar inventario), extras «por noche» multiplican por las
noches de la estancia y lo dicen en el concepto («Traslado aeropuerto × 4
noches»), y el precio se redondea a 2 decimales igual que Finanzas.

**El catálogo no se borra**: desactivar deja de venderlo sin romper el
histórico de las reservas que lo compraron. El panel lo reactiva, no lo
re-crea.

## Piezas y dónde viven

| Pieza | Fichero |
| --- | --- |
| Módulo puro (resolver, cotas, líneas, catálogo público) | `lib/hospitality/booking-extras.ts` |
| Catálogo por propiedad (modelo) | `HospitalityExtra` + migración `20260922120000` |
| API del panel: listar (con inactivos), crear, editar, desactivar | `app/api/hospitality/extras/route.ts` |
| Gestión del catálogo en el panel del motor | `app/dashboard/hospitality/booking-engine/page.tsx` |
| Exposición pública y validación en el POST | `app/api/public/booking/[slug]/route.ts` |
| Selector bilingüe en el paso 3 de la reserva | `app/booking/[slug]/page.tsx` |
| Textos ES/EN del selector | `lib/hospitality/booking-i18n.ts` (`extrasTitulo`…) |

## Detalles operativos

- **Bilingüe**: la descripción ES/EN del extra sale según el idioma de la
  página (`?lang=`), igual que el resto del motor. Sin descripción, no hay
  fila de detalle — no se inventa.
- **La moneda del extra es la del catálogo** (puede diferir de la unidad);
  el desglose la lleva por línea, como el resto de items.
- **Idempotencia intacta**: el mismo `idempotencyKey` sigue devolviendo la
  reserva existente; los extras viven en la creación, no en el reintento.
- **Auditoría**: cada alta/edición del catálogo deja traza
  (`hospitality_extra_guardar`) con quién, cuándo y a qué precio.
