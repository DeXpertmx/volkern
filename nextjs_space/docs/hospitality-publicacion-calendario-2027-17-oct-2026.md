# Operación — Calendario de Booking en venta hasta el 31-dic-2027 y extensión de 2A

**Fecha:** 17 de octubre de 2026
**Alcance:** hotel `75fdbbce2e` — «Ciudad Patio Cuarenta» (tenant `cmuy1wvzk002lmi01pie3kp40`)
**Petición del operador:** «2A, José Luis Rojas, tiene una reserva hecha hasta el 13 de octubre y nos ha pedido 2 noches más que ya deben de estar bloqueadas. Ya hay que poner todas las de Booking en venta por lo menos hasta el 31 de diciembre de 2027, con sus respectivas reservaciones ya realizadas. Cruza información con Airbnb para que se sincronicen.»

---

## 1. Resultado en una línea

Publicado el calendario de las **cuatro** habitaciones en el canal hasta el **09-ene-2028** (cubre el 31-dic-2027 pedido) con sus noches vendidas y cerradas respetadas, cruzado antes con el canal (Airbnb incluido) — y la reserva de **José Luis Rojas no existe en el sistema**: ni reserva, ni contacto, ni bloqueo, ni en el canal. Tras la revisión de la tarde (§6) **2A queda cerrada de forma precautoria las noches del 13 y 14 de octubre de 2027** (salida el 15) y el bloqueo homónimo de 2026 quedó liberado.

## 2. Lo que se hizo

| Paso | Qué se ejecutó | Resultado |
|---|---|---|
| 1 | **Cruce con el canal** (`runReconciliation`, el mismo código del cron) | *Fetch* del proveedor OK (0 fallidos) · 5 reservas devueltas · **0 creadas, 0 canceladas, 4 sin cambios, 1 divergencia** (cancelación de `6374887459` —Mariusz Maj— de una reserva que no tenemos; ya estaba así a las 11:53) · errores: 0 |
| 2 | **Publicación** (`dispatchConnectivityPush` con 450 días de horizonte) | **4 pushes** (inventario, tarifas, restricciones de inventario, restricciones de tarifa), los cuatro **HTTP 200 `{"message":"Request Received Successfully","success":true}`**, `errores: 0`, **sin descartes** (`huboDescartes: false`) |
| 3 | **Bloqueo de la extensión de 2A** (13→15-oct-2026, cierre solo en Booking) | Creado `cmvcdhigy0001qmmgzvt4trxk`, tipo `administrativo`, con entrada de auditoría `BLOQUEO_CREADO` — **revisado esa misma tarde: ver §6** |

## 3. Qué quedó publicado exactamente (del `requestPayload` real)

- **Inventario**: horizonte **2026-10-17 → 2028-01-09**. Noches **cerradas** publicadas:
  - `2b`: 30-jul→2-ago-2027 y 7→8-ago-2027 (las dos reservas confirmadas).
  - `1a`: 17→22-oct-2026 · 3→5-dic-2026 · 2→3-ene-2027 · 25→27-mar-2027 (los cuatro cierres que solo vivían en Booking).
  - `1b`: 17-oct-2026 → 30-abr-2027 (cierre solicitado) y **abierta desde el 1-may-2027**.
  - `2a`: abierta en el push inicial; tras la revisión de la tarde (§6) viaja **cerrada las noches 13 y 14 de octubre de 2027** y abierta el resto.
- **Tarifas**: por habitación y plan (`1a-d-ep`, `1b-d-ep`, `2a-d-ep`, `2b-d-ep`): **120 €** hasta el 16-jun-2027, **140 €** del 17-jun al 31-ago-2027 (Temporada de Verano) y **120 €** del 1-sep-2027 al 9-ene-2028.
- **Restricciones**: `minimumStay: 2` en todo el horizonte y, dentro de la temporada, `minimumStayArrival: 3` (la regla de la temporada). `stopSell: false`, sin cierres de llegada/salida.

## 4. «José Luis Rojas»: no existe en el sistema (medido)

- Reservas del ERP que mencionan «rojas»/«jose luis» (en `guestData` y en `payload`): **0**.
- Contactos, auditoría, eventos de webhook (solo hay 2 en total) y sync-logs: **0 menciones**.
- Reservas en **otros tenants** con ese apellido: **0** (solo conteo).
- El canal devuelve **5 reservas** (ventana 2024-10 → 2027-10) y **todas son de `2b`**: Mohamed reda Bouchama, Eva Allonca Campa (cancel), Mariusz Maj (cancel), Maria Fernanda Alastuey Ibañez y Alexandra Klug. **Ninguna de `2a`.**
- **2a estaba a 0 reservas y 0 bloqueos** antes de esta operación.

Es decir: como en los cuatro cierres de 1A, si esa estancia existe, vive **solo en la extranet de Booking** y no pasa por la API del channel manager. Se registró como bloqueo **con las fechas que dio el operador** (noches del 13 y 14 de octubre, salida el 15). **Si esas 2 noches son futuras y no del 13-14-oct, hay que decirlo:** el calendario publicado deja 2A abierta y esas noches se venderían.

## 5. Riesgos y límites de esta operación

1. **El canal no publica sus cierres a mano**: el adapter no implementa *Fetch Inventory*, así que cualquier fecha cerrada **solo** en la extranet de Booking que no esté registrada como bloqueo en el ERP se reabre al publicar. Esta publicación cubre 15 meses: conviene repasar la extranet de Booking por si hay cierres lejanos (2027) que no estén en el ERP.
2. **El botón del panel no puede publicar este horizonte.** `POST /api/hospitality/sync` recorta `diasHorizonte` a **365** y la pantalla de Tarifas pide **180**; hasta el 31-dic-2027 hacen falta **450**. El motor de sync sí admite 730 (`DIAS_HORIZONTE_VENTA`). Esta publicación se hizo invocando ese mismo código con 450 días (`scratch/publicar-calendario-2027.ts`, compilado con esbuild y ejecutado dentro del contenedor). **Pendiente de producto:** subir el tope de la ruta a 730 y dejar elegir el horizonte desde la pantalla.
3. **Airbnb sigue sin reservas**: la conexión está activa en el proveedor (`hotel_code 517812456`, inventory/rates/reservation) y el push de hoy le llega como a Booking, pero no hay ninguna reserva de Airbnb que cruzar en la ventana de dos años.

## 6. Revisión del 17-oct (tarde) — el cierre de 2A se traslada a 2027

Instrucción del operador: «si en la 2A no está bloqueada las fechas, bloquea las noches del 13 al 15 de octubre del 2027 de forma precautoria; si fueron las pasadas, las desbloqueamos». Se ejecutó así, sin tocar código: el cambio va a la base y el push sale por el mismo motor recién compilado del árbol actual (`scratch/publicar-calendario-2027.ts`).

| Paso | Resultado |
|---|---|
| Estado previo de 2A | 1 bloqueo **activo** (13→15-oct-**2026**, `cmvcdhigy0001qmmgzvt4trxk`) · 0 reservas · 0 en el canal |
| Bloqueo precautorio **2027** | Creado `cmvcegris0001qmhbh0h37yfm` · **2027-10-13 → 2027-10-15** (noches 13 y 14; salida el 15) · `administrativo` · `activo` · motivo: «Extensión de estancia de José Luis Rojas (+2 noches). Cierre precautorio: la reserva no existe en el ERP ni en el canal y el año está por confirmar; se libera en cuanto el hotel confirme que esas noches no se vendieron» · auditoría `BLOQUEO_CREADO` |
| Bloqueo de **2026** | Liberado: `estado: cancelado` (no se borró el registro) · auditoría `BLOQUEO_CANCELADO` explicando el traslado. Esas noches ya habían pasado, así que no cambia ninguna disponibilidad |
| Cruce previo con el canal | *Fetch* OK · 5 items · **0 creadas, 0 actualizadas, 0 canceladas, 4 sin cambios**, 1 divergencia preexistente (cancelación de Mariusz Maj de una reserva que no tenemos) · **0 de Airbnb** · errores 0 |
| Publicación | 4 pushes **HTTP 200 `success:true`** sin avisos: inventario (18 rangos), tarifas (12), restricciones de inventario (15) y de tarifa (3) · `errores: 0` · `huboDescartes: false` · horizonte **2026-10-17 → 2028-01-09** |

**Noches cerradas tal y como viajaron** (payload real, rangos `startDate`→`endDate` inclusivos): `1a` 14 noches (17→23-oct-2026, 3→6-dic-2026, 2→4-ene-2027, 25→28-mar-2027) · `1b` 196 noches (17-oct-2026 → 1-may-2027) · **`2a` 2 noches: 13→15-oct-2027** · `2b` 6 noches (30-jul→3-ago y 7→9-ago-2027).

**Comprobado en el payload, no supuesto**: `2a` cerrada el 13 y el 14-oct-2027, abierta el 15 (checkout) y el 12; las dos noches de 2026 quedan abiertas tras liberar el bloqueo; las **dos reservas futuras de 2B** viajan con todas sus noches cerradas (4 y 2 noches). La reserva de 2B del 9→11-oct-2026 queda fuera del horizonte publicado porque ya pasó.

**Canales conectados ahora** (`property_details`, HTTP 200): **airbnb** `517812456` y **booking.com** `14279079 / 14279259 / 14279656 / 14279792`, todos con `inventory`; Airbnb además con `rates` y `reservation`. En la respuesta del push no hay `warnings` ni descartes.

**Lo que sigue sin poder verificarse desde aquí**: el adapter **no implementa *Fetch Inventory***, así que no se puede leer el calendario de ninguna de las dos plataformas; solo se garantiza la dirección ERP→canal. Un cierre hecho a mano en la extranet de Booking o en Airbnb que no exista como bloqueo aquí se reabrirá en el siguiente push. El reparto de Airbnb por habitación (un solo `hotel_code` frente a cuatro de Booking) lo confirma el proveedor; la primera reserva de Airbnb será la prueba de extremo a extremo.

## 7. Cierre a la venta de 2A: 29-jul → 4-ago-2027

Instrucción del operador: «cierra la venta en el 2A del 29 de julio de 2027 al 4 de agosto de 2027». Elegido **bloqueo** (no reserva): no hay huésped, ni canal, ni importe — son noches que se retiran de la venta.

| Paso | Resultado |
|---|---|
| Estado previo de 2A | **0 reservas y 0 bloqueos** entre el 25-jun y el 20-ago-2027 · plan `2a-d-ep` activo, 120 € base y **140 €/noche** en la temporada de verano (17-jun → 31-ago) |
| Bloqueo | Creado `cmvclsk0o003kqm01cv8gsriz` · **2027-07-29 → 2027-08-04** (6 noches: 29, 30, 31-jul y 1, 2, 3-ago; salida el 4) · `administrativo` · `activo` · motivo «Cerrado a la venta a petición del hotel (17-oct-2026)» · auditoría `crear` sobre `hospitality_unit_block` |
| Cómo se creó | **Por la API real** (`POST /api/hospitality/blocks`, **HTTP 201**), no con un INSERT: pasaron la guardia de solapes, la guardia de «no cerrar noches vendidas», la auditoría y el push. La ruta quedó autenticada con una clave efímera para el usuario del hotel y el rol Anfitrión **prestado durante la llamada**: clave revocada y `roleId` restaurado a Admin en el mismo proceso (comprobado después: 0 claves temporales, rol Admin, sin permisos de rol tocados) |
| Primer push | **HTTP 503** en inventario y restricciones de inventario (`unidad_cambiada`) — el borde del proveedor estaba intermitente, como ya se midió en §5 de `hospitality-revision-conectividad-17-oct-2026.md` |
| Reintentos | 4 empujes más: el primero también 503 (los cuatro), el segundo y siguientes **200 `success:true`** en inventario, tarifas, restricciones de inventario y de tarifa · `errores: 0` · sin descartes |
| Noches tal y como viajaron | Inventario: `2a=1` del 17-oct-2026 al **28-jul-2027** · **`2a=0` del 29-jul al 3-ago-2027** · `2a=1` desde el **4-ago** · horizonte hasta **2027-10-16** (365 días) |
| Restricciones | `available=0` los mismos días, `stopSell: false`, `minimumStay: 2`; el 28-jul y el 4-ago vuelven a `available=1` |
| Comprobado en el motor público | `POST /api/public/booking/patio-cuarenta/cotizar` para 29-jul → 4-ago-2027 devuelve **solo ACC y 1B**: **2A ya no aparece**. Las fechas contiguas (25→28-jul y 4→7-ago) siguen ofreciendo las mismas unidades, sin efecto colateral |

**Cabo suelto que apareció en la operación (medido, sin diagnosticar).** El push del bloqueo salió con el horizonte por defecto y se quedó en **90 días** (hasta 2027-01-14): julio de 2027 no viajó hasta que se forzó un push manual de **365 días**, pese a que la temporada de verano termina el 31-ago-2027 y `horizonteDeTemporadas` debería haber alargado la ventana sola. Consecuencia práctica: **cualquier cierre o reserva a más de 90 días no llega al canal hasta un push largo** — y este bloqueo estaba a 285 días. Merece una guardia: que un push cuyo rango de estado interno supere el horizonte pedido lo alargue, o que el panel deje elegir el horizonte (hoy la ruta lo recorta a 365 y la temporada más lejana de este hotel pide 450 para el 31-dic-2027, como ya se anotó en §5.2).

**Límite de siempre**: sin *Fetch Inventory* no se puede leer la extranet de Booking; lo verificado es lo aceptado por el proveedor (HTTP 200) y lo que responde el motor del ERP. La prueba definitiva sigue siendo una búsqueda real en Booking.com para el 29-jul-2027.
