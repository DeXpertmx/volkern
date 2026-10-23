# Informe — Sincronización con el canal: las dos fallas del hotel

**Fecha:** 15 de octubre de 2026
**Alcance:** hotel `75fdbbce2e` — «Ciudad Patio Cuarenta» (tenant `cmuy1wvzk002lmi01pie3kp40`)
**Motivo:** el operador desconectó la sincronización con Booking tras dos fallas —«se quitaron fechas bloqueadas que venían de origen» y «las tarifas de estacionalidad no las aplicó»— y pidió saber si son atribuibles a nosotros.
**Estado:** revisión cerrada; dos de los tres defectos encontrados **corregidos y probados en el árbol de trabajo, sin desplegar**.

---

## 1. Resumen para decidir

1. **«Se quitaron fechas bloqueadas»: sí es atribuible a nosotros, pero por diseño, no por un borrado.** No había ni una fecha cerrada en Volkern (0 filas de bloqueo en toda la plataforma y 0 acciones de bloqueo auditadas para este hotel): esos cierres existían **solo en Booking**. Nuestro push publica `available: 1`, `stopSell: false` y cierre de llegada/salida en `false` para todo el horizonte y todas las unidades, y **no lee los cierres del canal**; cualquier fecha cerrada solo en la extranet se reabre en cuanto entra en la ventana publicada. Lo que **agravó** el síntoma fue el push manual de **365 días** del 14-oct a las 17:21 (a petición del operador): publicó de golpe `2026-10-14 → 2027-10-13`, un año de calendario que el producto nunca había publicado (venía publicando 90 y 180 días).

2. **«Las tarifas de estacionalidad no las aplicó»: sí es atribuible a nosotros.** La temporada real del hotel (`2027-06-17 → 2027-08-31`, 140 €) viajó **una sola vez**, y fue en ese mismo push manual. El producto empuja **90 días** por defecto y **180** en el botón de Tarifas y al guardar un plan: 13-ene-2027 y 13-abr-2027, las dos **antes** de que la temporada empiece. No es que el canal las rechazara —esos pushes volvieron **HTTP 200 `success: true` sin avisos**—: es que nunca salieron.

3. **Tercer defecto, este sí un bug de código, corregido:** un plan de tarifa **sin código del proveedor** viajaba con **su identificador interno** como `rateplanCode` (`INVALID_RATEPLAN_CODE : cmv877haz0072us01nb0np80t`, medido el 14-oct a las 14:22:45) y el mensaje que leía el hotel le pedía «activar en su extranet» un id que es nuestro.

**Lo que queda en manos del operador:** desplegar (nada de esto está en producción), decidir si se protegen los cierres del canal, y confirmar en la extranet de Booking que las tarifas de verano están publicadas.

---

## 2. Método y límites

- **Solo lectura.** Cinco sondas dentro del contenedor de producción (`volkern-erp_app`), con el cliente Prisma de la propia imagen contra la base del VPS: propiedades, unidades, vínculos, planes, reservas, bloqueos, auditoría, `HospitalitySyncLog` (payload y respuesta real de cada push) y estado de conectividad. No se escribió nada, no se imprimió ningún secreto y las sondas se borraron del contenedor y de `/tmp` al terminar.
- **Contraste con el log, no con suposiciones.** Todo lo que se afirma abajo sale del payload que se envió y de la respuesta que devolvió el proveedor en `requestPayload`/`responseBody`.
- **Lo que no se puede leer desde aquí:** el calendario y la extranet de **Booking**. Si Booking muestra o no las tarifas publicadas, y qué fechas tenía cerradas por su cuenta, no se puede comprobar sin entrar en su cuenta. Los dos síntomas se explican por el lado nuestro, que es lo que este informe documenta.

---

## 3. Línea de base medida (15-oct-2026)

| Qué | Medición |
|---|---|
| Propiedades | 2 («Apartamento centro ciudad» sin vínculo y «Ciudad Patio Cuarenta» = `75fdbbce2e`) |
| Unidades | 4: `CPC-1A`, `CPC-1B`, `CPC-2A`, `CPC-2B`, todas `available`, tarifa base 120 EUR |
| Vínculos | 4, todos `channel_connectivity` y `activo`: `1a→1a-d-ep`, `1b→1b-d-ep`, `2a→2a-d-ep`, `2b→2b-d-ep` (alta 7-oct / 13-oct, última edición 14-oct 17:30) |
| Config de conectividad | `hospitality_connectivity_config.activo = true`, `partnerIdEnc` nulo (usa el de plataforma); última edición 9-oct |
| Planes de tarifa | 1 por unidad: `Tarifa 1A/1B/2A/2B`, cada uno con el código de su vínculo, 120 EUR, `minNoches` 2 y **temporada `2027-06-17 → 2027-08-31` a 140 € (`minNoches` 3)** |
| Reservas | 4, todas `booking.com` y todas en la unidad `2B`: `5084548141` (9→11 oct, confirmada, 240 €), `6017284583` (1→6 ene 2027, **cancelada**, 25 €), `5151446790` (30 jul→3 ago 2027, confirmada, 560 €) y `6713291480` (7→9 ago 2027, confirmada, 280 €) |
| **Bloqueos de fechas** | **0 filas en toda la plataforma** (ni activas ni canceladas) |
| Auditoría de bloqueos | **6 acciones, todas del tenant de demostración** `cmtlytty10000s1uuafjc2ril` del 11-sep (3 altas y 3 bajas de «Casa Completa»/«Loft Marina» por `admin@demorealestate.com`) |
| Push de los últimos 30 días | 660 entradas en `hospitality_sync_logs`: **4 tipos de push**, 170 con `estado: 'error'` (6 de ellos HTTP 400; el resto HTTP 200 **con descartes**) |
| Último push | 14-oct 18:45, los cuatro en 200 sin descartes |
| Auditoría interna de inventario | `divergencias_inventario` del 15-oct (04:15 y 07:00): 120 noches comparadas, **0 abiertas y 0 cerradas sin justificar**, 0 sin dato |
| Acciones del 15-oct sobre este hotel | **ninguna** (ni vínculos, ni unidades, ni planes, ni bloqueos) |

---

## 4. Falla 1 — «se quitaron fechas bloqueadas que venían de origen»

### 4.1 Lo que se midió

- **No hay ni una fila de bloqueo** (`hospitality_unit_blocks`) en la plataforma entera, y las únicas acciones de bloqueo de la auditoría son de otro tenant y del 11-sep. El hotel **nunca cerró una fecha desde Volkern**: sus cierres vivían **solo en Booking**.
- **El único mecanismo de nuestro código que abre fechas es el push:**
  - `buildInventoryUpdates` publica `available: 1` para cada unidad vinculada y cada noche del horizonte.
  - `buildInventoryRestrictions` publica además `stopSell: false`, `closeOnArrival: false` y `closeOnDeparture: false` para todas las noches del horizonte.
  - **No existe ninguna lectura de los cierres del canal**: el adapter no implementa *Fetch Inventory*, así que lo que el hotel haya cerrado en su extranet es invisible para nosotros y se sobrescribe.
- **Los horizontes que viajaron** (push de inventario, últimos 30 días):

| Rango empujado | Veces | De dónde salía |
|---|---|---|
| `2026-10-14 → 2026-11-12` (30 días) | 20 | pruebas del asistente (onboarding) |
| `2026-10-14 → 2027-01-11` (90 días) | 11 | **el horizonte por defecto** (reserva creada, reserva modificada, reserva cancelada, reconciliación) |
| `2026-10-14 → 2027-04-11` (180 días) | 24 | botón de Tarifas y guardar un plan |
| `2026-10-14 → 2027-10-13` (365 días) | **1** | **push manual del 14-oct a las 17:21** |

### 4.2 Causa y atribución

Un cierre hecho **solo en Booking** (o heredado del gestor anterior) se reabre en cuanto cae dentro de la ventana publicada, porque publicamos nuestro estado interno como la verdad del calendario. Es una consecuencia del diseño —el ERP es la única fuente de disponibilidad— y el hotel la vio justo cuando la ventana creció:

- Hasta el 14-oct el producto había publicado, como mucho, hasta el **11-abr-2027**.
- El push manual de las 17:21 publicó, en una sola operación, **todo un año** (inventario y restricciones de las cuatro unidades hasta el **13-oct-2027**) con las tres cuartas partes del calendario abiertas.

**Atribuible: sí**, en el sentido de que ninguna otra cosa de nuestro lado toca el calendario del canal y de que el ERP no tenía constancia de esos cierres. **No es un borrado de datos**: en Volkern no había nada que borrar.

### 4.3 Qué se puede hacer (decisión del operador)

- **Corto plazo, sin código:** los cierres que deban existir se crean **aquí** (bloqueos de fechas, que además ahora exigen motivo y no pisan noches vendidas) y se vuelven a publicar; o se mantiene el vínculo desactivado para dejar de publicar.
- **Estructural:** leer los cierres del proveedor antes de publicar (o importarlos como bloqueos) para que una sincronización no pueda abrir lo que el canal tiene cerrado por su cuenta. Es una capacidad que hoy no existe y que este caso justifica.

---

## 5. Falla 2 — «las tarifas de estacionalidad no las aplicó»

### 5.1 Lo que se midió

De los **145 pushes de tarifas** de los últimos 30 días, **20** llevaron algún tramo a 140 €:

- **19** llevaban una **temporada distinta de la configurada hoy**: un único tramo a 140 que cubría *todo* el rango empujado (la configuración que el plan tenía entonces; los planes se editaron el 14-oct). El último de ellos, el 13-oct.
- **1** —el del **14-oct a las 17:21:39**— llevó **la temporada real** `2027-06-17 → 2027-08-31` a 140 €, para los cuatro pares (`2b/2b-d-ep`, `2a/2a-d-ep`, `1a/1a-d-ep`, `1b/1b-d-ep`), con HTTP 200 `success: true` y **sin descartes**.

### 5.2 Causa

El horizonte del push es una ventana desde hoy:

| Puerta del producto | Horizonte | Última noche publicada (desde el 15-oct) | ¿Alcanza el 17-jun-2027? |
|---|---|---|---|
| Push por defecto (reserva creada/modificada/cancelada, reconciliación) | 90 días | 13-ene-2027 | **No** |
| Botón «Sincronizar» de Tarifas y guardar un plan | 180 días | 13-abr-2027 | **No** |

Una temporada que empieza más allá de esa ventana no viaja por ninguna vía del producto: el canal se queda con el precio plano y la temporada **solo** llegaba con un push manual largo. **Atribuible: sí.** Y nótese lo que **no** pasó: el proveedor no rechazó nada — los pushes de temporada que sí salieron volvieron limpios.

---

## 6. Defecto 3 — el identificador interno viajaba como `rateplanCode`

### 6.1 Evidencia

El mapeo de planes del dispatcher era `codigo: rp.codigo || rp.id`. Un plan **sin código del proveedor** (como la `Tarifa 2A` en el rato que estuvo sin él: creada el 14-oct a las 14:21, código puesto a las 17:33) viajaba con su **cuid interno**:

```
responseBody: {"success": true, "warnings": ["INVALID_RATEPLAN_CODE : cmv877haz0072us01nb0np80t"]}
```

Medido en el log del 14-oct a las 14:22:45: **5 pushes de `rates` y 5 de `rates_restrictions`** con esa advertencia. El mensaje que se le mostraba al hotel —«el plan de tarifa "cmv877…" no está autorizado en el canal; actívalos en su extranet»— manda a activar en Booking un identificador que es una clave interna de nuestra base.

### 6.2 Efecto

- Esa unidad se quedaba **sin tarifa publicada** (el canal descartaba el envío) y sin sus reglas de venta.
- El operador no tenía forma de entender el aviso.

---

## 7. Ruido ya explicado y cerrado (no forma parte de las dos fallas)

| Cuándo | Qué decía el proveedor | Qué era |
|---|---|---|
| 9-oct 14:01 | `HTTP 400 · Partner is disabled!` (6 pushes) | El ID de socio del proveedor estaba deshabilitado de su lado; dejó de ocurrir |
| 9-oct → 14-oct 14:20 | `INVALID_ROOM_CODE : 2a · 1a · 1b` (14+13+1 pushes de inventario, y equivalentes de tarifas y restricciones) | El canal solo tenía **autorizada una** de las cuatro habitaciones. El operador las autorizó en la extranet |
| 9-oct → 13-oct | `INVALID_RATEPLAN_CODE` de los planes `-s-ep`, `-q-ep`, `1b-*` | Planes del catálogo no autorizados en el canal; resuelto en la misma extranet |
| 14-oct 14:22 | `INVALID_RATEPLAN_CODE : cmv877haz0072us01nb0np80t` | **Defecto nuestro** (§6), corregido |

Desde el **14-oct a las 14:24** los cuatro pushes del panel vuelven **200 `success: true` sin un solo aviso**, y así siguen (último: 14-oct 18:45).

---

## 8. Estado del sistema hoy

- **Los cuatro vínculos siguen `activo`** y la configuración de conectividad también, y **ninguna acción del 15-oct** los ha tocado: si el hotel vuelve a tener movimiento (una reserva nueva, un cambio de unidad, un push manual), **el ERP volverá a publicar** en el canal. Si la intención es dejar de publicar, hay que desactivarlo aquí, no solo en Booking.
- El barrido de las **04:15 y 07:00 del 15-oct** corrió sin empujar nada (no había cambios) y su auditoría de inventario da **120 noches comparadas, 0 divergencias**.
- El hotel tiene **4 reservas** en su panel, las dos recuperadas el 14-oct entre ellas.

---

## 9. Lo aplicado (en el árbol de trabajo, sin desplegar)

### 9.1 El horizonte del push alcanza la temporada más lejana configurada

- `horizonteDeTemporadas()` (función **pura**, `lib/hospitality/sync.ts`) lee el Json de los planes **activos** del tenant (o de la propiedad, si el push es de una) con el normalizador tolerante de siempre y devuelve los días que hacen falta para que entre la **última noche** de la temporada más lejana. Sin temporadas por delante devuelve 0; una temporada pasada no pide nada; una fecha imposible (un «31 de febrero» que el normalizador deja pasar) se comprueba de ida y vuelta y no alarga nada.
- El dispatcher toma `max(horizonte pedido, temporadas)` y lo acota al **tope del horizonte de venta de los canales** (`HORIZONTE_PUSH_MAX_DIAS = DIAS_HORIZONTE_VENTA = 730`, la misma constante que usa el barrido de reservas). **El horizonte pedido nunca se acorta**: los 30 del onboarding y los 90/180 del panel siguen siendo los suyos.
- Efecto en el caso real: con la temporada `17-jun → 31-ago-2027`, desde el 15-oct-2026 el horizonte son **321 días** (320 noches + 1, porque el rango es exclusivo), así que **cualquier** push —incluido el de 90 días de una reserva— lleva ya el 140 € de verano.
- De regalo: la disponibilidad cubre también las **reservas** que caen dentro de esa ventana más larga, así que una reserva de julio de 2027 hecha hoy cierra sus noches en el canal sin esperar a que la ventana ruede.
- Más allá del tope se empuja hasta el tope (fechas que ninguna OTA puede vender todavía) y el tipo lo declara en `fueraDelTope` para el día que se quiera avisar en pantalla.

### 9.2 El `rateplanCode` nunca es un identificador interno

- El mapeo del dispatcher pasa a `codigo: rp.codigo || null` —**nunca la PK**— y ordena los planes de la unidad (por código y luego por id) antes de deduplicar, para que el reparto sea determinista.
- `buildRateUpdates` y `buildRateRestrictions` usan `p.codigo || u.rateplanCodeMapeado` —el código de tarifa que el hotel **validó contra el catálogo del proveedor** al vincular la unidad—; **sin ninguno de los dos esa tarifa no viaja** y la unidad aparece en el informe del push como «no viajó: no tiene plan de tarifa con código del proveedor». El respaldo por ROOMCODE se queda donde estaba y por lo que estaba: una unidad **sin planes**, que es su caso documentado y probado.
- Dos planes que acaban en el mismo par (habitación, tarifa) empujan **un solo precio** —también en la clave de la serie de temporada—: el canal tiene un número por par y que eligiera el orden de la base sería un precio que el hotel no decidió.
- Efecto en el caso real: la `Tarifa 2A` sin código habría viajado bajo `2a-d-ep`, el de su vínculo, en vez de ser descartada con su cuid, y el aviso de «activa ese código en tu extranet» desaparece.

**Ficheros:** [lib/hospitality/sync.ts](../lib/hospitality/sync.ts) · [tests/hospitality-sync.test.ts](../tests/hospitality-sync.test.ts) · [tests/hospitality-sync-dispatch.test.ts](../tests/hospitality-sync-dispatch.test.ts) · la ruta de claves reales ([docs/hospitality-ruta-claves-reales.md](./hospitality-ruta-claves-reales.md), filas del 15-oct).

---

## 10. Verificación

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | **0 errores** |
| `npx vitest run tests/hospitality-sync.test.ts tests/hospitality-sync-dispatch.test.ts` | **64/64** (48 + 16; 9 casos nuevos en total) |
| Zona que importa el dispatcher o sus consumidores (13 ficheros: rateplans, onboarding, bloqueos, reconciliación, rechazo de canal, operaciones, checkout, guardias de motor) | **239/239** |
| `npm run lint:docs` | **verde** (0 caracteres CJK) |
| **Contraprueba del horizonte**: con el horizonte bypasseado para que ignore la temporada | fallan las **2 guardias nuevas** (12/14) y el resto sigue verde |
| **Contraprueba del `rateplanCode`**: repuesto `rp.codigo || rp.id` | fallan las **2 guardias nuevas** (14/16) y el resto sigue verde |
| Sondeo contra el proveedor real | **no ejecutado** (implica publicar en el canal del hotel) |
| Despliegue | **no hecho**: producción corre la imagen del 14-oct |

Las dos contrapruebas son lo que separa un caso que protege el comportamiento de uno que pasa por casualidad: las guardias nuevas fallan exactamente cuando se repone el código viejo.

---

## 11. Pendiente y límites honestos

1. **Desplegar.** Ninguno de los dos arreglos está en producción. Hasta entonces, el comportamiento del hotel sigue siendo el antiguo (y con el vínculo activo).
2. **Cierres del canal.** El push sigue siendo unidireccional: no lee lo que el canal tiene cerrado por su cuenta. Ampliar la ventana (arreglo 9.1) **también amplía** lo que se sobrescribe. Es el cabo de fondo de la falla 1 y requiere una capacidad que hoy no existe.
3. **El tope no avisa en pantalla.** Una temporada más allá de 730 días se empuja hasta el tope y el tipo lo declara (`fueraDelTope`), pero no hay todavía ningún aviso visible para el operador.
4. **El informe del push es por unidad, no por plan.** Si una unidad tiene dos planes y solo uno puede viajar, la unidad cuenta como enviada y el que se quedó fuera no aparece; el caso visible es el de la unidad que no viaja.
5. **Reservas lejanas.** Ahora se cubren si caen dentro de la ventana que estira la temporada; una reserva más allá de esa ventana sigue sin cerrar sus noches en el canal hasta que la ventana llegue.
6. **Confirmación visual en Booking.** Lo medido es lo que enviamos y lo que el proveedor **aceptó**; que Booking muestre el 140 € de verano en su calendario solo se puede comprobar en su extranet.
7. **Nada está commiteado.** Los cinco ficheros del trabajo están en el árbol de trabajo: `lib/hospitality/sync.ts` (el código), los dos ficheros de pruebas, la ruta de claves reales y este informe.

---

## Anexo A — Los cuatro pushes del 14-oct a las 17:21 (el push manual)

| Push | Rango empujado | Contenido (resumen) | Resultado |
|---|---|---|---|
| `inventory` | `2026-10-14 → 2027-10-13` | 8 tramos; las cuatro unidades a `available: 1`, salvo `2b` a `0` en sus dos noches vendidas de julio y agosto de 2027 | HTTP 200 `success: true`, 0 descartes |
| `inventory_restrictions` | `2026-10-14 → 2027-10-13` | 5 tramos; `stopSell: false`, `minimumStay: 2` | HTTP 200 `success: true`, 0 descartes |
| `rates` | 12 tramos | `120` hasta el 16-jun, **`140` del 17-jun al 31-ago-2027** y `120` hasta el 13-oct, para los cuatro pares (habitación, tarifa) | HTTP 200 `success: true`, 0 descartes |
| `rates_restrictions` | 3 tramos | los cuatro pares con `minimumStay: 2` y la estancia mínima de temporada (3) en su rango | HTTP 200 `success: true`, 0 descartes |

## Anexo B — Descartes del proveedor agrupados (últimos 30 días: 170 filas en `error`)

| Veces | Tipo(s) | HTTP | Mensaje (resumido) |
|---|---|---|---|
| 2 + 2 + 2 | inventory / inventory_restrictions / rates | 400 | `Partner is disabled!` (9-oct 14:01) |
| 14 + 14 + 11 + 11 | inventory / inventory_restrictions / rates / rates_restrictions | 200 | `INVALID_ROOM_CODE : 2a · 1a · 1b` (9–13 oct) |
| 28 + 28 + 16 | inventory / inventory_restrictions / rates | 200 | inventario y restricciones: «descartó **3 de 4** unidades (2A, 1A, 1B)»; tarifas: `INVALID_RATEPLAN_CODE` de `2a-d-ep`, `1a-d-ep`, `1b-d-ep` |
| 3 + 13 | rates_restrictions | 200 | «descartó **1** unidad: 1B (`1b-s-ep`, `1b-d-ep`, `1b-t-ep`, `1b-q-ep`)» |
| 2 + 2 | rates / rates_restrictions | 200 | «descartó 1 unidad: 1A (tarifa `1a-d-ep`)» |
| 6 + 6 | rates / rates_restrictions | 200 | «descartó 1 unidad: 2A (tarifa `2a-d-ep`)» |
| **5 + 5** | **rates / rates_restrictions** | 200 | **«descartó 1 unidad: 2A (tarifa `cmv877haz0072us01nb0np80t`)» — el id interno (§6)** |

Las filas de `rates_restrictions` nombran la unidad `1B` por cómo se atribuye el descarte a la unidad de la petición (el informe es por unidad); el código de tarifa que aparece en la advertencia es el del catálogo.
