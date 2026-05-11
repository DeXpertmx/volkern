# Configuración de Apprise-API en Portainer

## Variables de Entorno

En tu stack de Portainer, configura estas variables:

```
APPRISE_API_KEYS=volkern_key_abc123,cliente1_xyz789
APPRISE_LOG_LEVEL=INFO
```

Genera API Keys con:
```bash
openssl rand -hex 32
```

---

## Agregar Servicios de Notificación

Una vez desplegado el contenedor, accede a la UI de Apprise:
```
http://TU_SERVIDOR:8000
```

Usa una API Key para autenticarte.

### 1. Email (AWS SES)

```json
{
  "urls": ["json://ses://{access_key}/{secret_key}/{region}/{from_email}"]
}
```

### 2. Telegram

```json
{
  "urls": ["json://tgram://{bot_token}/{chat_id}/"]
}
```

### 3. Slack

```json
{
  "urls": ["json://slack://{token}/{channel}/"]
}
```

### 4. Discord

```json
{
  "urls": ["json://discord://{webhook_id}/{webhook_token}/"]
}
```

### 5. WhatsApp (Twilio)

```json
{
  "urls": ["json://whatsapp://{account_sid}/{auth_token}/{from_phone}/"]
}
```

### 6. SMS (Twilio)

```json
{
  "urls": ["json://sms://{account_sid}/{auth_token}/{from_phone}/"]
}
```

---

## Cómo Agregar en la UI de Apprise

1. Accede a `http://TU_SERVIDOR:8000`
2. Ingresa tu API Key
3. Click en "Add" para agregar un servicio
4. Selecciona el tipo de servicio
5. Ingresa la configuración en formato JSON o URL
6. "Test" para verificar
7. "Save"

---

## URLs de Servicios Soportados

| Servicio | Formato URL |
|----------|-------------|
| Email (SES) | `ses://access_key/secret_key/region/from_email` |
| Telegram | `tgram://bot_token/chat_id` |
| Slack | `slack://token/channel` |
| Discord | `discord://webhook_id/webhook_token` |
| WhatsApp | `whatsapp://account_sid/auth_token/phone` |
| SMS | `sms://account_sid/auth_token/phone` |
| Telegram (matrix) | `matrix://user:pass@host/#room_alias` |
| Webhook genérico | `json://` |

---

## Verificación

Prueba el servidor:
```bash
curl http://TU_SERVIDOR:8000/health
```

---

## Troubleshooting

- Si no llegan notificaciones, verifica los logs del contenedor:
  ```bash
  docker logs volkern-apprise-api
  ```

- Asegúrate de que las API Keys estén registradas en la variable `APPRISE_API_KEYS`

- Para más plugins: https://github.com/carcabot/Apprise