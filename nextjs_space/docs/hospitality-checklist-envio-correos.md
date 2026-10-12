# Checklist de envío — los correos de Hospitality (pasos 1.1 y 1.2, la incidencia del 401, los dos correos del 9-oct: mensajería y reseñas, y el formal de hotelCode/webhook/rotación)

> Un solo sitio para ejecutar el envío HOY sin abrir el runbook. Los
> recordatorios corren desde el día de envío. Al marcar cada casilla, anotar
> la fecha real en §9 del runbook (`docs/hospitality-ruta-claves-reales.md`).

---

## Correo 1 — Cliente (paso 1.1): precondiciones Ministerio

Fuente: [`hospitality-email-precondiciones-cliente.md`](./hospitality-email-precondiciones-cliente.md)

| # | Acción | Estado |
|---|--------|--------|
| 1.1.1 | Abrir el documento y copiar el cuerpo (desde `**Asunto:**` hasta «Un saludo», SIN las notas internas del final) | ☐ |
| 1.1.2 | Rellenar `[nombre]` (saludo) y `[Firma]` | ☐ |
| 1.1.3 | Enviar por el correo comercial de siempre. **Sin adjuntos** (no lleva secretos; las credenciales del punto 2 ya se pide que lleguen por el canal seguro) | ☐ |
| 1.1.4 | **Al enviar**: marcar el paso 1.1 del runbook + fecha en §9 | ☐ |
| 1.1.5 | **Recordatorio** a los 7 días naturales si no hay respuesta: una línea encima del hilo + oferta de la llamada «pantalla a pantalla» | ☐ (fecha: ____ ) |

---

## Correo 2 — Proveedor de conectividad (paso 1.2): 36 preguntas

Fuente: [`hospitality-email-proveedor-conectividad.md`](./hospitality-email-proveedor-conectividad.md)

| # | Acción | Estado |
|---|--------|--------|
| 1.2.1 | Abrir el documento y copiar el cuerpo (desde `**Subject:**` hasta «Best regards», SIN las notas internas del final) | ☐ |
| 1.2.2 | Rellenar los **3** `[name]` (saludo + firma + cierre) y el rol en la firma | ☐ |
| 1.2.3 | **Adjuntar** `docs/hospitality-connectivity-contract-externo.md` tal cual (133 líneas, en inglés, ya expurgado y verificado: cero material interno). **NO adjuntar** el contrato interno | ☐ |
| 1.2.4 | Destinatario: contacto de soporte/ventas del proveedor + copia técnica nuestra. En inglés | ☐ |
| 1.2.5 | **Al enviar**: marcar el paso 1.2 del runbook + fecha en §9 | ☐ |
| 1.2.6 | **Recordatorio** a los 5 días hábiles citando SOLO las preguntas A y B (las bloqueantes) | ☐ (fecha: ____ ) |
| 1.2.7 | **Cuando respondan**: pasar la respuesta por `npx tsx scripts/preflight-conectividad.ts --pegado "URL \| ID de socio \| usuario \| contraseña"` ANTES de tocar el servidor; con el resultado verde, configurar y avisar para el día H | ☐ |

---

## Correo 3 — Proveedor (incidencia, 9-oct): el emisor de su webhook entra con otro par Basic

Fuente: [`hospitality-email-proveedor-401-emisor.md`](./hospitality-email-proveedor-401-emisor.md)

> **No es un correo de la ruta original**: es el cierre de un defecto real del hotel en
> producción (dos push de reserva rechazados con 401 el 8 y el 9 de octubre). Mismo
> destinatario y mismo hilo que el 1.2; se puede responder **encima del hilo** del 1.2.

| # | Acción | Estado |
|---|--------|--------|
| 3.1 | Abrir el documento y copiar el cuerpo (desde `**Subject:**` hasta «Thanks, [Name] — Volkern», SIN el bloque interno del encabezado) | ☐ |
| 3.2 | Rellenar `[name]` (saludo) y `[name] — Volkern` (firma) | ☐ |
| 3.3 | Verificar que **no** viaja ningún secreto: ni el par guardado, ni el ID de socio, ni huellas de NUESTRO par. Las huellas que cita (`79c4b7658cf0`/`fb41fd6bdba9`) son las del par **que llegó**, calculadas por nosotros sobre un valor que ellos ya tienen | ☐ |
| 3.4 | **Sin adjuntos**: el hilo va en inglés y la guía del emisor está en español; todo lo que necesitan va en el cuerpo | ☐ |
| 3.5 | **Ofrecer el reenvío del par** por el canal seguro si lo han perdido — nunca por correo (es el punto 1 de la sección 2 del documento). Si quieren el contrato completo en su idioma, se les puede señalar la tarjeta **«Cómo debe llamarnos el PMS»** de la propia pantalla de Conectividad (contrato sin secretos, en español) | ☐ |
| 3.6 | **Al enviar**: marcar la incidencia en §9 del runbook + fecha (fila del 9-oct, «correo 3 enviado») | ☐ |
| 3.7 | **Cuando respondan con sus dos huellas nuevas**: comparar en casa (panel de Conectividad / `ultimoRechazoWebhook`, sin imprimir el par; el script de recálculo está en el propio documento del correo) y contestar «coincide» o «no coincide». Si coincide, pedir un push de prueba y confirmar el 200 | ☐ |
| 3.8 | **Recordatorio** a los 5 días hábiles si no hay respuesta ni push nuevo: una línea citando que siguen entrando 401 (si el bloque del último rechazo sigue con la fecha del 9-oct, no ha habido intento suyo nuevo) | ☐ (fecha: ____ ) |
| 3.9 | **Cierre**: anotar en §9 la fecha del push que entró con 200. Señales de «arreglado»: el push responde 200, la reserva aparece en el ERP, el **estado** sale de error y **Errores registrados** vuelve a 0 (`resetErrores`). Ojo: **el bloque del último rechazo no se borra** al llegar un push correcto —solo lo pisa un rechazo nuevo—, así que se lee su **fecha**, no su existencia | ☐ |

### Plan B mientras responden (no espera a nadie)

- El barrido diario ya recupera las reservas por `POST /data/{partner-id}` con la ventana
  de 30 días atrás: el negocio no se detiene, llega hasta ~24 h tarde.
- Si el hotel reporta una reserva ausente antes del barrido: disparar la reconciliación
  a mano (`POST /api/admin/conectividad/reconciliar` o la UI de Conectividad) y comprobar
  el push de reposición; recordar que ahora el barrido importa **y empuja**.

---

## Correo 4 — Proveedor (mensajería, 9-oct): activar el Message Webhook

Fuente: [`hospitality-email-proveedor-webhook-mensajes.md`](./hospitality-email-proveedor-webhook-mensajes.md)

> **No bloquea nada del negocio**: la bandeja ya está implementada
> (`docs/hospitality-mensajes-canal.md`) y solo le falta que el proveedor apunte
> el webhook a nuestra URL. Mismo hilo y destinatario que el 1.2.

| # | Acción | Estado |
|---|--------|--------|
| 4.1 | Abrir el documento y copiar el cuerpo (desde `**Subject:**` hasta «Thanks, [operador]», SIN el bloque interno del encabezado) | ☐ |
| 4.2 | Rellenar `[name]` (saludo) y `[operador]` (firma) | ☐ |
| 4.3 | Confirmar en el cuerpo la URL `https://volkern.app/api/hospitality/webhook/messages` y que el Basic es **el mismo** del webhook de reservas. **No escribir el par** | ☐ |
| 4.4 | **Sin adjuntos**. Al enviar, anotar fecha en §9 del runbook (fila del 9-oct, «correo 4 enviado») | ☐ |
| 4.5 | **Cuando confirmen**: pedir un mensaje de prueba desde la extranet de cualquier canal. Señales de «funcionando»: el endpoint devuelve `200 {success:true, estado:"recibido"}` y el hilo aparece en Hospitality → Mensajes. Un segundo envío del mismo mensaje debe responder `duplicado` | ☐ |
| 4.6 | **Recordatorio** a los 5 días hábiles si no hay confirmación ni mensaje de prueba | ☐ (fecha: ____ ) |

---

## Correo 5 — Proveedor (reseñas, 9-oct): pedir un endpoint de reseñas

Fuente: [`hospitality-email-proveedor-resenas.md`](./hospitality-email-proveedor-resenas.md)

> Es una **petición de producto**, no una incidencia: hoy no existe endpoint de
> reseñas (medido en su documentación) y el histórico entra por CSV. Se puede
> enviar en el mismo hilo que el 4 o como correo aparte; conviene no mezclarlo
> con el cierre del 401.

| # | Acción | Estado |
|---|--------|--------|
| 5.1 | Abrir el documento y copiar el cuerpo (desde `**Subject:**` hasta «Best regards», SIN el bloque interno del encabezado) | ☐ |
| 5.2 | Rellenar `[name]` (saludo) y `[operador]` (firma); ajustar la pregunta 1 si ya se sabe qué canales releen | ☐ |
| 5.3 | **Sin adjuntos** (el contrato propuesto va en el cuerpo). Al enviar, anotar fecha en §9 del runbook (fila del 9-oct, «correo 5 enviado») | ☐ |
| 5.4 | **Si responden que sí lo añaden**: anotar aquí su forma real (ruta, campos, si el rango es por fecha de reseña o de estancia) y abrir la implementación del fetch; el contrato interno se actualiza entonces | ☐ (respuesta: ____ ) |
| 5.5 | **Si responden que no**: decidir entre agregador de reputación y dejar el CSV como está — decisión del operador, no del desarrollo | ☐ |
| 5.6 | **Recordatorio** a los 10 días hábiles: es una petición de producto, no bloquea la operación | ☐ (fecha: ____ ) |

---

## Correo 6 — Proveedor (formal): hotelCode estable, nuestro webhook con spec, y rotación de la contraseña de WhatsApp

Fuente: [`hospitality-email-proveedor-formal.md`](./hospitality-email-proveedor-formal.md)

> **Es el correo formal que compendia los tres pendientes con el proveedor**: la
> confirmación por escrito de que `hotelCode` `75fdbbce2e` es estable (hasta
> ahora solo vivía en WhatsApp), la spec completa del webhook de reservas de
> Volkern para su emisor (el punto 2 del correo 3 sigue abierto hasta que
> apunten el emisor aquí) y la rotación de la contraseña compartida por
> WhatsApp el 7-oct. Se envía **encima del mismo hilo** que el 1.2 y el 3; no
> entra en conflicto con ninguno: el 3 cubre el 401 concreto, este cubre la
> relación formal.

| # | Acción | Estado |
|---|--------|--------|
| 6.1 | Abrir el documento y copiar el cuerpo (desde `**Subject:**` hasta «[role] · Volkern Hospitality», SIN el bloque interno de arriba) | ☐ |
| 6.2 | Rellenar `NAME` (saludo) y la firma (`NAME — Volkern` + `[role]`) | ☐ |
| 6.3 | **Adjuntar** `docs/hospitality-connectivity-contract-externo.md` (el mismo del correo 2, ya expurgado: el correo interno ya promete que la spec completa viaja adjunta). **NO adjuntar** el contrato interno ni la guía del emisor en español | ☐ |
| 6.4 | Verificar que **no viaja ningún secreto**: no se cita ninguna contraseña, ni el par guardado, ni huellas de nuestro par (el correo habla de la rotación sin nombrar valores) | ☐ |
| 6.5 | **Al enviar**: anotar fecha en §9 del runbook (`docs/hospitality-ruta-claves-reales.md`) | ☐ |
| 6.6 | **Recordatorio** a los 5 días hábiles si no hay respuesta (plantilla del proveedor, citando los 3 puntos del resumen §4) | ☐ (fecha: ____ ) |
| 6.7 | **Cuando respondan**: (a) confirmar el hotelCode por escrito en el contrato y revisar `resolverHotelDeSonda` si introducen matices; (b) señalar la fecha en que su emisor apunte al webhook y validarla contra un `book` real; (c) cerrar la rotación con el preflight antes de tocar el servidor `npx tsx scripts/preflight-conectividad.ts --pegado "URL \| ID \| usuario \| contraseña"` | ☐ |

---

## Reglas transversales (de los bloques de preparación de cada email)

- Las notas internas de cada documento **no se copian nunca** al correo.
- Ningún secreto viaja en estos correos: las credenciales (punto 2 del cliente;
  Basic Auth del proveedor) llegan después, por el canal seguro acordado.
- El nombre comercial del proveedor de conectividad no aparece en material de
  cliente; en el correo al proveedor sí se habla de su API con naturalidad.
- Ambos envíos son independientes: se pueden enviar el mismo día; el proveedor
  no espera al cliente ni viceversa.

---

## Plantilla de recordatorio — Cliente (día 7)

> Responder **encima del mismo hilo**. Se copia tal cual salvo la fecha entre
> corchetes. Sin adjuntos, sin nuevos pedidos: solo reabrir el hilo y bajar la
> fricción ofreciendo la llamada.

**Asunto:** Re: Alta de la plataforma — últimos pasos para comunicar los partes de viajeros al Ministerio

Hola [nombre]:

Te escribo por si se nos había perdido el correo de la semana pasada — te lo
vuelvo a dejar resumido aquí abajo. Son los datos que solo vosotros podéis
solicitar para que los partes de viajeros puedan comunicarse al Ministerio:

1. El alta en la Sede Electrónica y las credenciales de **pruebas** del
   servicio de comunicaciones.
2. Los tres códigos del establecimiento (arrendador, aplicación y
   establecimiento; una pareja por propiedad si hay varias).
3. El documento técnico **XSD** que os entreguen con el alta — este es el que
   nos falta para terminar por nuestra parte.

Con eso montamos la prueba en un día. Si alguno de los pasos de la Sede
Electrónica se hace lío, lo vemos juntos por pantalla compartida en una llamada
de media hora — dime cuándo te viene bien y te lanzo la invitación.

Un saludo,
[Firma]

*(Debajo queda el correo original completo.)*

---

## Plantilla de recordatorio — Proveedor (día 5 hábil)

> Responder **encima del mismo hilo**, en inglés. Se copia tal cual salvo la
> fecha entre corchetes. Solo cita **A y B** (lo que nos bloquea) y las deja
> contestables inline sin reabrir el adjunto.

**Subject:** Re: Volkern (PMS) — channel manager integration: A and B (the two blocking questions)

Hi [name]:

Following up on our email from [fecha de envío] — no rush on the rest, but
**questions A and B are the only ones blocking our go-live**, so we'd appreciate
answers to those first. Inline, so you can reply in place:

**A. Access (3 short answers):**
1. Production base URL, byte-for-byte (we need the `/api/v2/cm` prefix in writing).
2. Our partner ID (the `{pms}` segment), or the date you will issue it.
3. Production Basic Auth username + password (separate from sandbox), and your
   rotation procedure.

**B. Mapping (2 short answers):**
7. Should `hotelCode` be the OTA hotel ID or an ID your platform issues?
12. Are the `roomCode` / `rateplanCode` values from `property_details` the same
    codes your webhook sends in bookings, and are they **stable** over time?

(The full 36-question list and the integration contract are in the thread below.)

With A and B we can configure the first property and push to your sandbox the
same day. Happy to take any of these live on a short call if that's easier.

Best regards,
[name]
[role] · Volkern

*(Debajo queda el correo original completo, con el adjunto ya entregado.)*
