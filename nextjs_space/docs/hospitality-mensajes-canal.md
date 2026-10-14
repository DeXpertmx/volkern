# Mensajes del canal (OTAs) con el huésped

> El chat del huésped con la OTA, dentro de Volkern: los mensajes que el huésped
> escribe en Booking, Expedia y el resto de canales llegan solos, y el hotel
> contesta desde el dashboard sin saltar a la extranet de cada plataforma.
>
> **Regla de marca:** el nombre del proveedor de conectividad NO aparece en la UI
> ni en ningún texto visible al cliente (mismo contrato que el resto de la capa).
> En el producto esto es «Mensajes de las plataformas»; el nombre técnico solo
> existe dentro del adapter.

## 1. Lo que ofrece el proveedor (medido, no supuesto)

Del contrato del canal (`docs/hospitality-connectivity-contract.md`), grupo
«Messages»:

| Endpoint | Dirección | Qué hace |
| --- | --- | --- |
| `Message Webhook` | proveedor → nosotros | Nos llama en `{nuestra_url}` cada vez que llega un mensaje de huésped o del hotel en una conversación de OTA. |
| `Message Reply` | nosotros → proveedor | `POST /message-reply/{pms}`: enviamos la respuesta y el proveedor la reenvía a la OTA. |

Payload entrante: `hotel_id`, `channel`, `booking_id`, `guest_details` (`name`,
`phone`, `email`), `conversation_id`, `message_id`, `attachments[]`
(`filename`, `path`, `mime_type`), `message_type`, `time_sent` (`YYYY-MM-DD
HH:MM:SS`), `content`, `sender_id`, `sender_type` (`property` = el hotel).

Respuesta: `channel`, `content`, `hotel_code` (o `hotel_id`) y `conversation_id`.
**En `booking.com` el `booking_id` es obligatorio**; el resto de canales no lo
necesitan. Autenticación: HTTP Basic, el mismo par que el webhook de reservas.

## 2. Lo implementado

| Pieza | Dónde |
| --- | --- |
| Reglas de valor de las dos direcciones (puro) | `lib/hospitality/mensajes-canal.ts` |
| Webhook entrante (Basic, dedupe, mapping) | `app/api/hospitality/webhook/messages/route.ts` |
| Lectura de la cabecera Basic compartida con reservas | `lib/hospitality/webhook-basic-auth.ts` |
| Servicio (resolver propiedad, hilar, responder) | `lib/hospitality/mensajes-service.ts` |
| Respuesta al canal en el adapter | `enviarMensajeCanal()` en `lib/hospitality/connectivity.ts` |
| Bandeja del hotel | `GET/POST/PATCH /api/hospitality/mensajes` |
| Pantalla | `app/dashboard/hospitality/mensajes` (menú: Hospitality → Mensajes) |
| Incidencias de código sin vínculo | `GET /api/admin/conectividad/mensajes-sin-mapping` (Superadmin) |
| Dónde se ven | Panel **Conectividad** → tarjeta «Mensajes sin hotel vinculado» |
| Tablas | `hospitality_canal_conversacion`, `hospitality_canal_mensaje`, y la fila de incidencia en `hospitality_webhook_events` (`intentos`, `ultimoIntentoEn`) |

Códigos del webhook y qué debe hacer el emisor:

| Caso | HTTP | ¿Reintentar? |
| --- | --- | --- |
| Registrado, o ya teníamos ese `message_id` | 200 `{success:true, estado}` | No hace falta |
| Payload que no se puede representar (sin hilo, sin `message_id`, texto enorme) | 400 | No: es un defecto de datos |
| `hotel_id` sin mapping activo | 404 + `Retry-After: 300`, con `incidenciaId` para diagnóstico | Sí: el mapping puede estar en camino. La incidencia queda anotada en el panel de Conectividad |
| Credenciales | 401 con `diagnostico` (motivo y huellas, nunca el valor) | No: es configuración |
| Conectividad sin configurar | 503 + `Retry-After: 60` | Sí, con backoff |

`estado` es `recibido` (o `duplicado` cuando el mismo mensaje ya estaba).

## 3. Reglas (las que no se negocian)

1. **El tenant sale del mapping**, nunca del payload: `hotel_id` →
   `ConnectivityMapping` → `tenantId`. Un webhook entrante no lleva credenciales
   de cliente; aceptar un tenant del cuerpo sería escribir en la bandeja de otro
   hotel.
2. **Nada se inventa**: si `time_sent` viene ilegible el mensaje se guarda sin
   hora (el hilo ordena por la fecha de recepción) en lugar de adjudicarle al
   huésped una hora que no escribió. Una fecha imposible (`2026-02-31`) se
   descarta, no se rueda al mes siguiente.
3. **Nada se recorta en silencio**: un mensaje entrante que pasa del límite se
   rechaza con su motivo (el contrato no publica límite para el huésped; el
   nuestro es amplio y explícito). El texto guardado es el que llegó.
4. **La entrega repetida no duplica**: dedupe por `message_id` dentro del hilo, y
   una repetición no vuelve a contar como «sin leer».
5. **Una respuesta no se da por enviada si el canal la rechazó**: se guarda en el
   hilo como `error` con el motivo del proveedor y la API responde 502. El hotel
   tiene que ver que NO salió. No hay reintento ciego de un mensaje al huésped:
   lo reescribe una persona.
6. **PII del huésped, tratada como tal**: el payload crudo no se persiste (solo
   el mensaje normalizado) y el 401 jamás devuelve ni el par recibido ni el
   guardado — solo motivo, longitudes y huellas SHA-256 truncadas. La incidencia
   de un código sin mapping guarda **el código, el canal y el motivo**, nunca el
   mensaje del huésped: para vincular el código no hace falta leer lo que escribió.
7. **Una incidencia por código, no una por entrega**: el proveedor reintenta el
   mismo mensaje cada pocos minutos, así que la incidencia es **una fila por
   (`hotelCode`, canal)** que se refresca —`intentos` cuenta las entregas y
   `ultimoIntentoEn` cuándo fue la última— en vez de una fila por reintento con
   la misma frase. Es la misma tabla y el mismo panel que las reservas sin
   mapping: sin vínculo no hay tenant al que mostrarle la incidencia.
   Como la tabla es compartida, **todo lector del lado de reservas filtra por
   `ACCIONES_RESERVA`** (`book`/`modify`/`cancel`/`no_show`, la única definición,
   en `lib/hospitality/incidencias.ts`): un mensaje del canal no puede colarse en
   la lista de incidencias de reserva del hotel —aparecería como una incidencia
   sin ninguna reserva— ni reenviarse al motor de reservas.
8. **La incidencia se cierra sola cuando el vínculo existe**: la primera entrega
   con mapping pasa por la misma ruta y cierra las incidencias abiertas de ese
   código (quedan `procesado`, con el motivo original intacto). Nadie tiene que
   acordarse de cerrarlas.

## 4. Permisos

Leer la bandeja exige la capacidad `comunicaciones.ver` y responder
`comunicaciones.enviar` (módulo `hospitality_comunicaciones`).

No se creó un permiso nuevo a propósito: hablar con el huésped por el canal es
el mismo acto que mandarle una plantilla automática, y un permiso nuevo habría
que repartirlo en cada rol existente sin separar nada de verdad. La pantalla
oculta la caja de respuesta a quien no puede enviar (`AccionHospitality`) y la
API lo rechaza con el permiso exacto si alguien la llama igual.

## 5. Lo que falta (honesto)

- **El proveedor tiene que configurar la URL del webhook** apuntando a
  `https://<host>/api/hospitality/webhook/messages` con el mismo Basic que ya
  usa el webhook de reservas. Hasta que eso ocurra, la bandeja se queda vacía
  (no hay nada que inventar).
- **Un `hotel_id` sin mapping** se responde 404 para que el proveedor reintente y
  **deja incidencia visible** en el panel de Conectividad (misma tabla que las
  reservas sin mapping), con el código, el canal, el motivo y su contador de
  intentos. Si el código ya existe en algún tenant —aunque el vínculo esté
  inactivo— la fila lo dice, que es lo que hace falta para arreglarlo: reactivar
  el vínculo o vincularlo desde el onboarding del hotel.
- **Adjuntos**: se guardan sus metadatos (nombre, ruta, mime) y se enseñan por
  nombre, sin descarga: no tenemos una URL pública del fichero en el proveedor.
- **Reintento de un saliente fallido**: no existe; el operador reescribe. Es
  deliberado (un mensaje al huésped no se reintenta a ciegas).
- **Reseñas**: el proveedor no las expone (ver el contrato interno). El histórico
  entra por CSV y la petición de un endpoint está en
  `docs/hospitality-email-proveedor-resenas.md`.

## 6. Guardias

| Guardia | Qué fija |
| --- | --- |
| `tests/hospitality-mensajes-canal.test.ts` | Normalización entrante, dedupe de campos, fechas imposibles, límites, etiquetas de canal y el cuerpo de la respuesta (incluido el `booking_id` obligatorio de booking.com). |
| `tests/hospitality-mensajes-service.test.ts` | Tenant por mapping, no pisar datos del huésped con `null`, entrega repetida, eco del hotel, recorte de vista previa, que una respuesta rechazada quede como `error`, y el ciclo de la incidencia: primera entrega abre, el reintento suma, el mapping la cierra, y el listado cuenta primera/última entrega. |
| `tests/hospitality-mensajes-webhook-route.test.ts` | Códigos HTTP y `Retry-After` de cada caso, el 401 con diagnóstico, que el payload crudo no se persiste, que la incidencia del 404 queda anotada con código y canal (y **sin** el mensaje del huésped) y que la cabecera Basic se lee de la pieza compartida. |

## 7. Cómo probarlo

1. Ejercitar el webhook a mano (con el par Basic de la capa de conectividad):

   ```bash
   curl -u "$CONNECTIVITY_USER:$CONNECTIVITY_PASSWORD" \
     -H 'Content-Type: application/json' \
     -d '{"hotel_id":"<hotelCode real>","channel":"expedia","conversation_id":"prueba-1","message_id":"m-1","content":"Hola","sender_type":"guest"}' \
     https://<host>/api/hospitality/webhook/messages
   ```

   Esperado: `200 {"success":true,"estado":"recibido"}` y el hilo visible en
   Hospitality → Mensajes. Repetir la misma llamada: `estado: duplicado`.
2. Responder desde la bandeja y comprobar el hilo del huésped en la OTA.
3. Probar el caso «sin vínculo»: la misma llamada con un `hotel_id` que no esté
   en el mapping devuelve `404` con `Retry-After: 300` y aparece en Conectividad
   («Mensajes sin hotel vinculado»). Repetirla: sube el contador de **Intentos**,
   no aparece una fila nueva. Vincular el código y volver a llamar: la incidencia
   desaparece (queda `procesado`) y el mensaje entra en la bandeja.
4. Pedir al proveedor que reenvíe la configuración del webhook cuando cambie la
   URL o el par.
