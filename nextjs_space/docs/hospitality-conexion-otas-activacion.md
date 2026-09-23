# Activación del canal en la OTA — la pata que faltaba

> Documento interno de desarrollo. Cubre **el lado del hotel**: cómo se habilita
> el proveedor de conectividad *dentro de cada OTA*. Ni el contrato técnico
> ([`hospitality-connectivity-contract.md`](./hospitality-connectivity-contract.md))
> ni la guía de go-live
> ([`hospitality-go-live-pms-guia.md`](./hospitality-go-live-pms-guia.md))
> lo describían, y es una **precondición**: sin esta pata, `property_details` no
> devuelve catálogo y el paso 5 del wizard no se puede completar.
>
> Fuente: artículos de soporte oficiales del proveedor (consultados el **23 sep
> 2026**, enlazados abajo). No son la documentación de su API: describen clics en
> la extranet del canal. Si su flujo cambia, la fuente es el artículo.
>
> **Regla de marca:** material técnico interno. En producto, correos y cualquier
> texto visible al cliente se sigue llamando «Conectividad de Canales».

## El triángulo, con las tres patas por fin nombradas

```
   [ OTA ]  ──①──►  [ PROVEEDOR DE CONECTIVIDAD ]  ──②──►  [ VOLKERN (PMS) ]
  extranet          su channel manager                     nuestro adapter
  del canal         su API + su emisor                     + nuestro webhook
```

| Pata | Quién la ejecuta | Estado de la documentación |
|---|---|---|
| **① OTA ↔ proveedor** | El **hotel** (con la OTA) y el **proveedor** (mapeo de habitaciones) | **Este documento.** No estaba documentada |
| **② proveedor ↔ Volkern** | Volkern (adapter) y el proveedor (webhook) | Contrato técnico, guía de go-live y guía del emisor |

La consecuencia práctica de que ① esté antes: **el catálogo no existe hasta que
existe ①**. `hotelCode`, `roomCode` y `rateplanCode` son códigos que el proveedor
publica *después* de habilitarse en la OTA y de mapear sus habitaciones. Nuestro
paso 5 («Obtener el mapping externo») depende de un trabajo humano en otra
empresa.

## Cómo se activa, canal por canal

| Canal | Cómo se habilita | Quién lo hace | Trabajo posterior obligatorio |
|---|---|---|---|
| **Booking.com** | **Autoservicio en la extranet.** Icono arriba a la derecha → **Connectivity Provider** → **Search** → escribir el nombre del proveedor → **Connect** | El hotel, en su cuenta | Enviar al proveedor el **Booking.com Hotel ID** + el **mapeo habitación a habitación** (qué habitación de Booking equivale a qué tipo del proveedor) |
| **Expedia** | **Autoservicio en la extranet.** *Rooms & Rates* → *Connectivity Settings* → **Edit** → añadir el proveedor en **las dos** opciones (tarifas y disponibilidad **y** reservas) → *Save & Continue* | El hotel, en su cuenta | Alinear categorías de habitación, ocupación y planes de tarifa con la configuración del proveedor |
| **Airbnb** | **NO es autoservicio.** El hotel entra en Airbnb y abre la **URL de autorización del proveedor**: `https://live.aiosell.com/api/v2/cm/airbnb_authorize` → pantalla de éxito → **captura de pantalla** y envío al soporte del proveedor | El hotel (abre el enlace), el proveedor (recibe la evidencia y cierra) | Guardar la captura como evidencia; el vínculo es **por cuenta de Airbnb**, no por habitación |
| Otros (Tiket, Ctrip, Agoda, Traveloka…) | **Requieren correo.** La extranet del canal no expone la configuración del channel manager: hay que escribir al **account manager / market manager** del canal con el proveedor en **copia** | El hotel (o el proveedor) | Depende del canal; el proveedor publica el borrador del correo |

### Booking.com — detalle que se rompe solo

El flujo pide, además, **borrar los planes de tarifa extra** que Booking crea por
defecto al dar de alta el anuncio (NON REFUNDABLE, LONGSTAY…) si no se usan, para
que las tarifas del canal **coincidan** con las del proveedor. No es cosmético:
un `rateplanCode` que el canal publica y el proveedor no conoce llega a nuestro
webhook sin desempate. El contrato lo tolera —«un rateplan desconocido no bloquea
la reserva mientras el `roomCode` resuelva»—, pero la reserva se atribuye al plan
más antiguo en vez del que el huésped contrató. **Limpiar antes de mapear.**

### Airbnb — las dos diferencias que importan

1. La autorización vive en el **mismo prefijo de API que usamos nosotros**
   (`https://live.aiosell.com/api/v2/cm`): la ruta `/airbnb_authorize` es del
   channel manager v2. Es decir, `CONNECTIVITY_BASE_URL` ya apunta a la raíz
   correcta — no hay un host distinto que configurar.
2. **`marknoshow` no cubre Airbnb** (el contrato lo limita a booking.com y
   gommt). Un no-show de Airbnb que el proveedor no empuje queda **solo** en
   manos del operador con el `PATCH` del panel: no esperes el hook.

## Lo que esto cambia en casa

Nada del contrato cambia. Cambia el **orden de las operaciones** y a quién se le
pide qué:

1. **Plazo real.** Entre la activación en la OTA y el catálogo hay un salto
   humano: el hotel manda el Hotel ID y el mapeo, y el **equipo del proveedor**
   crea la correspondencia. Nuestro paso 5 no puede ocurrir antes. **Pídelo como
   plazo, no como un clic.**
2. **El mapeo no lo escribimos nosotros.** `ConnectivityMapping.externalUnitCode`
   tiene que **copiar** lo que el proveedor acabe publicando en
   `property_details`, no lo que la OTA llame a la habitación. Si el proveedor
   rehace el mapeo en su lado, nuestros vínculos dejan de resolver y la reserva
   cae en el camino de incidencia `sin_mapping` (ya implementado: no se adivina
   la unidad, se ve en el panel y el auto-vínculo solo actúa si es inequívoco).
3. **Ocupación.** Los tres artículos insisten en que la ocupación configurada
   coincida. Es exactamente la guardia que ya tenemos: capacidad de la unidad
   dentro del `min_occ`/`max_occ` del catálogo, y la política de niños pequeños
   (`HOSPITALITY_EDAD_NINO_UMBRAL`).
4. **Evidencia y auditoría del alta.** Guardar capturas (Airbnb las exige) y el
   correo del mapeo en el expediente del go-live: es la única prueba de qué
   habitación quedó vinculada a qué antes de que exista catálogo.
5. **El aviso ya está en el producto.** El paso 5 del wizard («Obtener el
   mapping externo») lleva el requisito pegado al paso mientras no esté
   completado: `REQUISITO_ACTIVACION_CANAL` en `lib/hospitality/onboarding.ts`
   dice quién lo ejecuta (el hotel, en la extranet del canal) y que esperar no
   lo resuelve. Es texto de hotel y no cita este documento: lo único de este
   material que llega a pantalla. Congelado en
   `tests/hospitality-onboarding.test.ts`.
6. **Rollback.** Desactivar el proveedor en nuestro panel no deshace ①: hay que
   **desconectar el canal en la OTA** (o volver a su channel manager anterior) y
   volver a publicar. Ya está en la guía de go-live como Etapa 3; ahora se sabe
   que esa mitad la ejecuta el hotel en su extranet.

## Preguntas que esto añade a la reunión con el proveedor

Se suman al checklist existente
([`hospitality-checklist-reunion-conectividad.md`](./hospitality-checklist-reunion-conectividad.md)):

- ¿El mapeo de habitaciones del canal lo hacen **ellos** o lo publicamos nosotros?
  ¿Cuál es su **plazo** habitual entre activación y catálogo disponible?
- ¿Confirman por escrito el **canal de contacto** para el mapeo (correo, portal,
  ticket) y quién lo atiende?
- ¿Qué canales de los del hotel requieren **correo al account manager** (no
  autoservicio) y quién lo redacta?
- ¿Nos avisan cuando el mapeo cambie, o nos enteramos por la incidencia
  `sin_mapping`?
- ¿Su soporte conserva la evidencia de la autorización de Airbnb, o hace falta
  que la guardemos nosotros?

## Referencias

- Habilitar al proveedor como channel manager en **Booking.com**:
  https://support.aiosell.com/portal/en/kb/articles/how-to-enable-aiosell-as-a-channel-manager-on-booking-com
- Habilitar al proveedor como channel manager en **Expedia**:
  https://support.aiosell.com/portal/en/kb/articles/how-to-enable-aiosell-as-a-channel-manager-on-expedia
- Habilitar al proveedor como channel manager en **Airbnb**:
  https://support.aiosell.com/portal/en/kb/articles/how-to-enable-aiosell-as-a-channel-manager-on-airbnb
- Contrato técnico (pata ②): [`hospitality-connectivity-contract.md`](./hospitality-connectivity-contract.md)
- Go-live de conectividad: [`hospitality-go-live-pms-guia.md`](./hospitality-go-live-pms-guia.md)
- Checklist de la reunión con el proveedor:
  [`hospitality-checklist-reunion-conectividad.md`](./hospitality-checklist-reunion-conectividad.md)
- Email de preguntas al proveedor (versión enviable, en inglés):
  [`hospitality-email-proveedor-conectividad.md`](./hospitality-email-proveedor-conectividad.md)
