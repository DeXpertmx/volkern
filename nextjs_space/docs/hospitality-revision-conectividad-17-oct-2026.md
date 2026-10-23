# Revisión de conectividad — 17-oct-2026

**Alcance:** hotel `75fdbbce2e` — «Ciudad Patio Cuarenta» (tenant `cmuy1wvzk002lmi01pie3kp40`).
**Método:** todo **solo lectura**. Base de datos de producción (`volkern-erp_postgres` del VPS) y
sonda HTTP de consulta al proveedor (GET `property_details`, POST `Fetch Reservations`). Nada se
escribió y nada se empujó al canal. Reproducible con
`scripts/revision-conectividad.cjs` (dentro del contenedor de la app).

## 1. Veredicto

1. **Nuestro lado está en orden y el canal lo acepta**: los cuatro últimos empujes (inventario,
   tarifas y sus restricciones) vuelven **200 `success: true`**, el proveedor está `conectado` con
   **0 errores acumulados** y la configuración del tenant está `activo`.
2. **No hay ninguna noche cerrada aquí y abierta en el canal** en los próximos **270 días**
   (reconstrucción del estado que el canal tiene por bueno, la misma regla de la guardia del
   producto): ni riesgo de sobreventa ni ventas perdidas por un cierre mal publicado.
3. **Queda un solo hueco, y no es de configuración**: «Apartamento Centro Ciudad» (`ACC`) no se
   puede vender por Booking/Airbnb porque **no existe en el catálogo del proveedor**, que publica
   cuatro habitaciones (`2b`, `2a`, `1a`, `1b`). Hoy sí se vende por la web directa.

## 2. Lo que está en orden (medido el 17-oct, 14:00-14:25 UTC)

| Bloque | Medición |
|---|---|
| Propiedades | 1 activa en venta: «Ciudad Patio Cuarenta» `conectada` con **6 unidades**; «Apartamento centro ciudad» `inactiva` con 0 (consolidada el mismo día) |
| Vínculos con el canal | **4** (`2a→2a/2a-d-ep`, `2b→2b/2b-d-ep`, `1a→1a/1a-d-ep`, `1b→1b/1b-d-ep`), todos `activo`. `ACC` y `CPC-BJO` sin vínculo |
| Planes de tarifa | 4, uno por habitación vinculada, código del proveedor, **120 €** base, mínimo 2 noches, con temporada de verano a **140 €** |
| Proveedor | `channel_connectivity` `conectado`, `contadorErrores` **0**, últimas credenciales guardadas el 9-oct, última verificación de salud 17-oct 05:00 |
| Últimos empujes | `inventory` 17-oct **13:43** (200) · `rates` 17-oct **12:56** (200, horizonte 17-oct-2026 → **9-ene-2028** con la temporada 140 € del 17-jun al 31-ago-2027) · `rates_restrictions` 12:56 (200) · `reconciliacion` 12:55 (**4 sin cambios, 0 creadas, 1 divergencia**, que es la cancelación de una reserva fantasma) |
| Errores de empuje | **ninguno desde el 14-oct 14:22** (antes: 44 inventario / 42 tarifas, todos del mapeo del canal, cerrados en la extranet el 14-oct) |
| Reservas | 4 en el ERP, todas `2B`; el canal reporta las **mismas 4** más la cancelación de la reserva que nunca entró → cuadra |
| Catálogo del proveedor | 200 · `Ciudad Patio Cuarenta` · **EUR** · `Europe/Madrid` · 4 habitaciones activas, cada una con sus 4 planes |

### La asimetría que sigue viva en el canal (culpable de los «cerrados» de Booking)

El proveedor declara **5 anuncios** para este hotel y solo **2 tienen las tres operaciones**:

| Anuncio | Operaciones | Veredicto |
|---|---|---|
| airbnb `517812456` | inventory + rates + reservation | COMPLETO |
| booking.com `14279259` | inventory + rates + reservation | COMPLETO |
| booking.com `14279079` | inventory + reservation | **SIN tarifas** |
| booking.com `14279656` | inventory + reservation | **SIN tarifas** |
| booking.com `14279792` | inventory + reservation | **SIN tarifas** |

Un anuncio de Booking al que el channel manager **no le puede empujar precios** aparece **cerrado
para la venta** aunque el inventario llegue. Eso no lo arregla ningún empuje nuestro: es el mapeo
de la extranet/de la parte del proveedor. Es la explicación medida de que «esté todo sincronizado y
aun así se vea cerrado».

## 3. El único departamento sin liberar: `ACC`

- **Lo que sí tiene**: ficha completa (4 huéspedes, descripción, 7 fotos), `available`, tarifa base
  **140 €** y **0 reservas**. Se vende por la web directa (`/reservar/patio-cuarenta`) desde hoy.
- **Lo que le falta para Booking/Airbnb**: el proveedor publica **cuatro** habitaciones; `ACC` no
  está entre ellas. Sin código de habitación **no hay vínculo que crear** y por tanto no hay
  inventario ni tarifa que empujar. Mapearla a un código existente pondría dos alojamientos en la
  misma habitación — sobreventa —, así que no se hace.
- **Qué desbloquea el hueco** (una sola cosa, en su lado): que el proveedor publique `ACC` en el
  catálogo de `75fdbbce2e`. En cuanto exista, se vincula en minutos (unidad → código de habitación →
  plan de tarifa) y entra en los pushes como las otras cuatro.

## 4. Dos cosas que salen de la revisión

1. **`ACC` es la única unidad sin plan de tarifa, y ya está en venta por la web.** Consecuencia
   medida hoy: `ACC` cotiza **1 noche en pleno agosto de 2027 a 140 €** (sin mínimo de noches y sin
   temporada), mientras las otras cuatro exigen **3 noches** y cobran 140 € solo del 17-jun al
   31-ago. Es decir: la única puerta por la que se puede reservar una noche suelta en temporada
   alta es `ACC`. Si no es lo que se quiere, hay que crearle su plan (mismo código del proveedor
   cuando lo publique) con su mínimo de noches y su temporada.
2. **La guardia de divergencias de inventario juzga 30 días por defecto.** El riesgo de sobreventa
   que apareció hoy —el cierre de 1B creado a las 11:48, con el canal todavía con esas noches
   abiertas hasta el empuje de las 13:43— lo cazó porque caía dentro de esa ventana. Una noche
   cerrada aquí y abierta allí **más allá de 30 días no se reporta** por defecto. Medido en esta
   revisión con ventana de 270 días (reconstrucción de la misma regla): **0 divergencias** hoy,
   así que no hay nada que arreglar — pero la ventana corta es el sitio por donde se escaparía.

## 5. Lo que esta revisión NO puede verificar desde aquí

- **El calendario tal como lo pinta Booking.** El adapter no implementa *Fetch Inventory*: lo que se
  afirma es lo que **empujamos** y lo que el canal **aceptó** (200), no lo que la extranet muestra.
  La comprobación definitiva sigue siendo una búsqueda real en Booking.com para una fecha libre.
- **Los cierres hechos solo en la extranet.** No se leen: cualquier cierre puesto allí a mano dentro
  de la ventana publicada se reabre en el siguiente push. Los que se conocen están registrados como
  bloqueos en el ERP (1B hasta el 1-may-2027; los cuatro de 1A; el precautorio de 2A).
- **Estabilidad del proveedor.** Durante la revisión su borde devolvió **503** en dos intentos
  (14:16-14:17) y un *timeout*, para volver a 200 en los tres siguientes. Los empujes del día salieron
  antes y con 200, pero es un aviso: conviene que el reempuje no dependa de un solo intento.

## 6. Reproducir la revisión

```bash
# dentro del contenedor de la app (solo lectura)
scp scripts/revision-conectividad.cjs root@62.171.134.195:/tmp/
docker cp /tmp/revision-conectividad.cjs volkern-erp_app.1.<id>:/tmp/
docker exec volkern-erp_app.1.<id> node /tmp/revision-conectividad.cjs
# ventana del cruce interno↔canal (por defecto 270 días)
docker exec -e DIAS_CRUCE=400 volkern-erp_app.1.<id> node /tmp/revision-conectividad.cjs
```
