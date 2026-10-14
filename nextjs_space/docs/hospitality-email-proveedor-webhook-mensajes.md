# Correo al proveedor — activar el webhook de mensajería (Message Webhook)

> **Contexto interno (NO enviar).** La bandeja de mensajes del canal ya está
> implementada y probada (`docs/hospitality-mensajes-canal.md`), pero **está vacía
> hasta que el proveedor apunte su webhook a nuestra URL**: es una configuración
> de SU lado, igual que el emisor del webhook de reservas.
>
> Datos que hay que rellenar antes de enviar:
>
> - **URL**: `https://volkern.app/api/hospitality/webhook/messages`
> - **Autenticación**: el mismo par Basic que ya usan para el webhook de reservas
>   (el de la capa de conectividad). **Nunca se escribe el par en el correo** — si
>   lo han perdido, se reenvía por el canal seguro acordado.
> - **Qué esperar**: `200 {success: true, estado: "recibido"}`; `duplicado` si
>   reintentan el mismo `message_id` (es correcto, no hay que hacer nada);
>   `404` con `Retry-After` si el `hotel_id` no está mapeado todavía.
>
> Nada de este correo lleva secretos ni material interno: se puede enviar tal
> cual, en el mismo hilo que el resto de peticiones al proveedor.

---

**Subject:** Please point your Message Webhook at our endpoint (hotel `75fdbbce2e`)

Hi [name],

We have finished implementing the **Messages** pair on our side: we already
consume your `POST /message-reply/{pms}` to answer guests, and we now have an
endpoint ready to receive your **Message Webhook**.

Everything works end to end in our tests, so the only thing missing is the
configuration on your side: please point the Message Webhook of these properties
to our URL.

```
POST https://volkern.app/api/hospitality/webhook/messages
Authorization: Basic base64(utf8(username:password))   ← the same pair you use for our reservation webhook
Content-Type: application/json
```

The payload we expect is exactly the one your documentation describes:

```json
{
  "hotel_id": "75fdbbce2e",
  "channel": "expedia",
  "booking_id": "EXP123456789",
  "guest_details": { "name": "John Doe", "phone": "+1-555-000-0000", "email": "guest@example.com" },
  "conversation_id": "CONV-000001",
  "message_id": "MSG-000001",
  "attachments": [{ "filename": "doc.pdf", "path": "/attachments/doc.pdf", "mime_type": "application/pdf" }],
  "message_type": "text",
  "time_sent": "2026-01-15 12:54:00",
  "content": "Hello, how can we assist you?",
  "sender_id": "hotel_75fdbbce2e",
  "sender_type": "property"
}
```

What you will get back, so your logs are easy to read:

| Case | HTTP | Body | What to do |
| --- | --- | --- | --- |
| Message stored | 200 | `{"success": true, "estado": "recibido"}` | Nothing |
| Same `message_id` delivered again | 200 | `{"success": true, "estado": "duplicado"}` | Nothing — we de-duplicate on our side |
| Missing required field (or unreadable payload) | 400 | `{"success": false, "error": "…"}` | Do not retry; the body says which field is missing |
| `hotel_id` not mapped yet | 404 + `Retry-After: 300` | `{"success": false, "error": "…"}` | Retry later — the mapping may still be in flight |
| Authentication | 401 | `{"success": false, "error": "No autorizado", "diagnostico": {…}}` | Check your Basic header. The `diagnostico` carries the reason and truncated SHA-256 fingerprints of what arrived — never the value |
| Our connectivity not configured | 503 + `Retry-After: 60` | `{"success": false, "error": "…"}` | Retry with backoff |

Two notes on our side, in case they help you:

- We use `conversation_id` to thread the conversation and `message_id` to
  de-duplicate deliveries, so `sender_type` is what tells us whether the message
  came from the guest or from the property (the hotel writing from the extranet).
- We do not store the raw payload (it carries guest personal data): we store the
  message itself. If we ever need to debug a delivery we will ask you for it.

Could you confirm once the webhook is pointed at that URL? A single test message
from the extranet of any channel is enough for us to confirm receipt.

Thanks,
[operador]
