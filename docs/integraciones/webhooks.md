# 03 · Webhooks

Volkern ofrece **dos sistemas de webhooks** independientes:

1. **Webhooks de entrada (incoming):** herramientas externas (formularios, n8n,
   Make, Zapier, cualquier servicio) envían datos a Volkern mediante un `POST` a una
   URL pública con UUID.
2. **Webhooks salientes (outgoing):** Volkern notifica a un endpoint tuyo cuando
   ocurre un evento (lead creado, cita creada, deal actualizado, etc.) mediante un
   `POST`/`PUT` firmado con HMAC.

---

## 1. Webhooks de entrada (externa → Volkern)

### Qué hace

Cada webhook de entrada tiene una **URL única con UUID**:

```text
POST https://volkern.app/api/webhook/<uuid>
```

Cuando alguien hace `POST` a esa URL, Volkern procesa el payload y ejecuta la
**acción** configurada en el webhook:

| Acción | Qué hace |
|---|---|
| `crear_lead` (defecto) | Crea un lead (o lo actualiza si el email ya existe) |
| `actualizar_lead` | Actualiza un lead existente |
| `crear_tarea` | Crea una tarea asociada a un lead |
| `disparar_automatizacion` | Ejecuta una automatización con el payload |
| `personalizado` / custom | Registra el evento sin crear nada |

### Configuración

En el panel: **Integraciones → Webhooks de Entrada** (`/dashboard/integraciones/webhooks`),
botón **Nuevo Webhook**:

- Nombre y descripción.
- **Acción** a ejecutar.
- **Mapeo de campos** para crear/actualizar leads: nombre, email, teléfono, empresa,
  notas. Soporta notación de puntos para payloads anidados, p. ej.
  `user.contact.firstName` → nombre.
- **Secret** (recomendado): marca "Generar Secret Key". El secreto se muestra una vez.
- Guardar → se genera la URL única.

La gestión también existe vía API interna (`/api/webhooks/incoming`), pero se realiza
con sesión de administrador, no con API key.

### Invocar el webhook

```bash
curl -X POST https://volkern.app/api/webhook/f1c1a0ea-a367-4500-94f2-a690ef9eedad \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "telefono": "+34 600 111 222",
    "empresa": "Empresa XYZ"
  }'
```

Si el webhook tiene secret configurado, debes calcular la firma sobre **el cuerpo
exacto** (cadena JSON tal cual) y enviarla así:

```http
X-Webhook-Signature: sha256=<hex_hmac_sha256>
```

Cálculo de la firma en distintos lenguajes: ver [ejemplos](ejemplos.md#firma-hmac-de-webhook-de-entrada).

### Respuestas

| Situación | Código |
|---|---|
| Procesado correctamente (lead/tarea creados, automatización disparada) | `200`/`201` |
| Webhook inactivo | `403` |
| Firma inválida o secreto incorrecto | `401` |
| Payload sin `email` ni `telefono` (no se puede crear lead) | `400` |
| UUID inexistente o webhook eliminado | `404` |

### Seguridad

- El secreto solo se muestra una vez: guárdalo al crearlo.
- Calcula la firma sobre el **cuerpo exacto enviado** (sin reformatear el JSON).
- Comprueba en el panel el historial de entregas (payload, headers, IP, fecha,
  resultado) para depurar.
- No compartas la URL con servicios que no confíes; desactiva webhooks en desuso.

---

## 2. Webhooks salientes (Volkern → tu sistema)

### Eventos soportados

| Evento | Descripción |
|---|---|
| `lead_creado` | Se crea un lead |
| `lead_actualizado` | Se modifica un lead |
| `contacto_creado` | Se crea un contacto |
| `contacto_actualizado` | Se modifica un contacto |
| `cita_creada` | Se agenda una cita |
| `cita_actualizada` | Se modifica una cita |
| `cita_cancelada` | Se cancela una cita |
| `mensaje_recibido` | Llega un mensaje de un cliente |
| `mensaje_enviado` | Se envía un mensaje |
| `tarea_creada` | Se crea una tarea |
| `tarea_completada` | Se completa una tarea |
| `deal_creado` | Se crea una oportunidad |
| `deal_actualizado` | Se modifica una oportunidad |
| `campana_enviada` | Termina el envío de una campaña |

> **Importante sobre disparos automáticos.** El motor de webhooks salientes
> (`lib/outgoing-webhooks.ts`) existe y está operativo para **configurar, probar y
> registrar entregas**, y los flujos de negocio van conectándose a él de forma
> progresiva. Antes de depender de un evento concreto en producción, valida el envío
> real con la acción **"Enviar test"** desde el panel y revisa el historial de
> entregas para confirmar que tu despliegue emite ese evento automáticamente.

### Formato del payload

```json
{
  "event": "lead_creado",
  "timestamp": "2026-09-07T10:30:00.000Z",
  "tenant_id": "cuid_del_tenant",
  "data": {
    "id": "cuid_del_lead",
    "nombre": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "telefono": "+34 600 111 222",
    "estado": "nuevo"
  },
  "metadata": {}
}
```

Cabeceras de cada envío:

```http
Content-Type: application/json
User-Agent: Volkern-CRM-Webhook/1.0
X-Webhook-Event: lead_creado
X-Webhook-Timestamp: 2026-09-07T10:30:00.000Z
X-Webhook-Signature: <hex_hmac_sha256>        ← solo si el webhook tiene secret
```

### Firma HMAC (secret)

Si el webhook tiene `secretKey`, la firma es **HMAC-SHA256 en hexadecimal** del cuerpo
`JSON.stringify(payload)` (el cuerpo exacto que llega en el `POST`):

```http
X-Webhook-Signature: 5f8d7c6b5a4e...
```

Verificación recomendada en el receptor (Node.js):

```javascript
const crypto = require('crypto');

function esFirmaValida(payload, signature, secret) {
  const esperada = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Reintentos y temporizaciones

- Respuesta **2xx** → entrega marcada como `exitoso`.
- Respuesta **4xx/5xx** o **timeout** (defecto 30 s) → `fallido` y reintento con
  retraso exponencial: intento 1 inmediato, intento 2 en +2 min, intento 3 en +4 min…
  hasta `maxReintentos` (configurable).
- Cada entrega queda registrada (`OutgoingWebhookDelivery`) con payload, headers,
  estado HTTP, tiempo de respuesta y nº de intentos.

### Configurar un webhook saliente

**Desde el panel** (recomendado): **Integraciones → Webhooks Salientes**
(`/dashboard/integraciones/webhooks-salientes`) → **Nuevo Webhook**:

| Campo | Ejemplo |
|---|---|
| Nombre | `n8n — deals` |
| URL destino | `https://webhook.dimension.expert/webhook/volkern-deals` |
| Eventos | `deal_creado`, `deal_actualizado` |
| Método | `POST` (o `PUT`) |
| Generar Secret | ✅ (recomendado) |
| Reintentos máx. | 3 |
| Timeout | 30 s |

**Vía API de gestión** (requiere sesión de administrador, no API key):

`POST /api/webhooks/outgoing`

```json
{
  "nombre": "n8n — deals",
  "url": "https://webhook.dimension.expert/webhook/volkern-deals",
  "eventos": ["deal_creado", "deal_actualizado"],
  "metodoHttp": "POST",
  "generarSecret": true,
  "maxReintentos": 3,
  "timeoutSegundos": 30
}
```

Endpoints de gestión:

| Ruta | Métodos |
|---|---|
| `/api/webhooks/outgoing` | `GET` lista, `POST` crea |
| `/api/webhooks/outgoing/[id]` | `GET`, `PUT` (actualiza, `regenerarSecret: true` rota el secreto), `DELETE` |
| `/api/webhooks/outgoing/[id]/test` | `POST` envía un evento de prueba |
| `/api/webhooks/outgoing/[id]/deliveries` | `GET` historial paginado de entregas |

### En tu endpoint receptor

1. Responde **rápido** (`2xx`) y procesa de forma asíncrona si puedes.
2. Verifica la firma con el secret del webhook (timing-safe).
3. Rechaza (`4xx`) si la firma no coincide; así Volkern reintentará.
4. Usa `event` para enrutar la lógica y `data.id` como referencia del registro.

---

## Resumen visual

```
EXTERNA → Volkern        POST https://volkern.app/api/webhook/<uuid>
                         (firma opcional: X-Webhook-Signature: sha256=<hex>)
                         acciones: crear/actualizar lead · crear tarea ·
                         disparar automatización

Volkern → TU SISTEMA     POST/PUT a tu URL
                         cabeceras: X-Webhook-Event, X-Webhook-Timestamp,
                         X-Webhook-Signature (HMAC-SHA256 hex)
                         reintentos exponenciales hasta maxReintentos
```
