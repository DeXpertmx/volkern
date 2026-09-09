# 04 · Ejemplos

Todos los ejemplos usan la URL de producción `https://volkern.app`. En local
sustituye por `http://localhost:3000`.

Sustituye `TU_API_KEY` por tu clave real (`vk_prod_...`) y **no la publiques en
código** versionado: usa variables de entorno.

---

## 1. Listar leads

```bash
curl -G https://volkern.app/api/leads \
  -H "X-API-Key: $VOLKERN_API_KEY" \
  --data-urlencode "search=ana" \
  --data-urlencode "estado=nuevo"
```

---

## 2. Crear un lead

```bash
curl -X POST https://volkern.app/api/leads \
  -H "X-API-Key: $VOLKERN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Ana García",
    "email": "ana@ejemplo.com",
    "telefono": "+34 600 123 456",
    "empresa": "Ejemplo S.L.",
    "fuente": "integracion-api",
    "canal": "web",
    "notas": "Quiere información sobre gestión de reservas",
    "metadataExterna": { "externalId": "cliente-1234", "origen": "landing" }
  }'
```

Respuesta `200` con el objeto del lead (si ya existía el email, se **actualiza**).

---

## 3. Crear un contacto

```bash
curl -X POST https://volkern.app/api/contacts \
  -H "X-API-Key: $VOLKERN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Carlos Ruiz",
    "email": "carlos@ejemplo.com",
    "telefono": "+34 622 111 222",
    "tipo": "person",
    "cargo": "Director de operaciones"
  }'
```

Si el email ya existe: `400 { "success": false, "error": "Ya existe un contacto con este email" }`.

---

## 4. Consultar etapas y crear un deal

Paso 1 — obtener las etapas del pipeline:

```bash
curl "https://volkern.app/api/pipeline/stages" \
  -H "X-API-Key: $VOLKERN_API_KEY"
```

Paso 2 — crear el deal (usa el `nombre` de una etapa como `etapa`; si no envías
`pipelineId`, Volkern asigna el primer pipeline activo):

```bash
curl -X POST https://volkern.app/api/deals \
  -H "X-API-Key: $VOLKERN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Venta villa en Marbella",
    "valor": 125000,
    "moneda": "EUR",
    "contactId": "cuid_del_contacto",
    "etapa": "calificacion",
    "probabilidad": 25,
    "prioridad": "alta",
    "fechaEstimadaCierre": "2026-12-15"
  }'
```

> Nota: `fechaEstimadaCierre` admite `YYYY-MM-DD` o datetime ISO 8601.

Respuesta `201`:

```json
{ "deal": { "id": "cuid_del_deal", "titulo": "Venta villa en Marbella", "valor": 125000, "...": "..." } }
```

Crear deal con contacto nuevo en la misma llamada:

```bash
curl -X POST https://volkern.app/api/deals \
  -H "X-API-Key: $VOLKERN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Venta villa en Marbella",
    "valor": 125000,
    "newContact": {
      "nombre": "Carlos Ruiz",
      "email": "carlos@ejemplo.com",
      "telefono": "+34 622 111 222"
    }
  }'
```

---

## 5. Consultar disponibilidad y crear una cita

Disponibilidad del día:

```bash
curl "https://volkern.app/api/citas/disponibilidad?fecha=2026-09-20&duracion=30" \
  -H "X-API-Key: $VOLKERN_API_KEY"
```

Crear la cita:

```bash
curl -X POST https://volkern.app/api/citas \
  -H "X-API-Key: $VOLKERN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Reunión con Ana García",
    "tipo": "reunion",
    "leadId": "cuid_del_lead",
    "fechaHora": "2026-09-20T10:00:00.000Z",
    "duracion": 30,
    "estado": "confirmada"
  }'
```

Respuesta `201` con el objeto de la cita. Errores de reglas: `400` (pasado /
antelación), `409` (conflicto de horario).

---

## 6. Webhook de entrada (formulario externo → Volkern)

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

### Firma HMAC de webhook de entrada

El secret se genera al crear el webhook (se muestra una sola vez). La firma debe
enviarse como `X-Webhook-Signature: sha256=<hex>` calculada sobre el **cuerpo
exacto**.

```javascript
// Node.js — enviar webhook de entrada con firma
const crypto = require('crypto');

const secret = 'TU_SECRET_DEL_WEBHOOK';
const data = {
  nombre: 'Juan Pérez',
  email: 'juan@ejemplo.com',
  telefono: '+34 600 111 222'
};
const payload = JSON.stringify(data);
const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

fetch('https://volkern.app/api/webhook/f1c1a0ea-a367-4500-94f2-a690ef9eedad', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': `sha256=${signature}`
  },
  body: payload
});
```

```python
# Python — misma firma
import hashlib
import hmac
import json

secret = "TU_SECRET_DEL_WEBHOOK"
data = {"nombre": "Juan Pérez", "email": "juan@ejemplo.com"}
payload = json.dumps(data)
signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()

requests.post(
    "https://volkern.app/api/webhook/f1c1a0ea-a367-4500-94f2-a690ef9eedad",
    json=data,
    headers={"X-Webhook-Signature": f"sha256={signature}"},
)
```

---

## 7. Recibir y verificar un webhook saliente (Volkern → tú)

Ejemplo mínimo en Node.js (sin framework):

```javascript
const crypto = require('crypto');
const http = require('http');

const SECRET = process.env.WEBHOOK_SECRET; // el secret del webhook saliente

function firmaValida(payloadRaw, signature) {
  const esperada = crypto
    .createHmac('sha256', SECRET)
    .update(payloadRaw) // el cuerpo exacto tal como llega
    .digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const firma = req.headers['x-webhook-signature'];
      if (!firma || !firmaValida(raw, firma)) {
        res.writeHead(401).end('Firma inválida');
        return;
      }
      const payload = JSON.parse(raw);
      console.log('Evento:', payload.event, '→', payload.data?.id);

      // Responde 2xx rápido; procesa lo pesado fuera de aquí
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  })
  .listen(8080);
```

Versión Python con FastAPI:

```python
import hashlib
import hmac

from fastapi import FastAPI, Header, Request, HTTPException

app = FastAPI()
SECRET = "TU_SECRET_DEL_WEBHOOK_SALIENTE"


def firma_valida(payload: bytes, signature: str) -> bool:
    esperada = hmac.new(SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, esperada)


@app.post("/webhook/volkern")
async def recibir_webhook(
    request: Request,
    x_webhook_signature: str | None = Header(default=None),
):
    raw = await request.body()
    if not x_webhook_signature or not firma_valida(raw, x_webhook_signature):
        raise HTTPException(status_code=401, detail="Firma inválida")
    payload = await request.json()
    print("Evento:", payload["event"])
    return {"ok": True}
```

> La firma saliente es **hex sin prefijo** (`X-Webhook-Signature: <hex>`); la firma
> de entrada usa el prefijo `sha256=<hex>`. No las confundas.

---

## 8. Cliente mínimo en Node.js (fetch) para la API REST

```javascript
const BASE = 'https://volkern.app/api';

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'X-API-Key': process.env.VOLKERN_API_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

// Uso
const leads = await api('/leads?estado=nuevo');
const lead = await api('/leads', {
  method: 'POST',
  body: JSON.stringify({ nombre: 'Ana García', email: 'ana@ejemplo.com' })
});
```

---

## 9. Cliente mínimo en Python

```python
import os
import requests

BASE = "https://volkern.app/api"
API_KEY = os.environ["VOLKERN_API_KEY"]
HEADERS = {"X-API-Key": API_KEY}


def api(path, method="GET", data=None):
    res = requests.request(
        method, f"{BASE}{path}", headers=HEADERS, json=data, timeout=30
    )
    if not res.ok:
        raise RuntimeError(f"HTTP {res.status_code}: {res.text}")
    return res.json()


leads = api("/leads")
cita = api("/citas", "POST", {
    "titulo": "Reunión demo",
    "fechaHora": "2026-09-20T10:00:00.000Z",
    "duracion": 30,
})
```
