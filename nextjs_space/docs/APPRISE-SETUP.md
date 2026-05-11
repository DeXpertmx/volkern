# Apprise-API Setup Guide

## Quick Start

```bash
cd /home/dexpert/Volkern/nextjs_space
docker-compose -f docker-compose.apprise.yml up -d
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APPRISE_API_KEYS` | API Keys para autenticacion (formato: `key1,key2,key3`) | (ninguna) |
| `APPRISE_LOG_LEVEL` | Nivel de logging | `INFO` |

## Endpoints Disponibles

| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/notify` | Enviar notificacion via query params |
| POST | `/api/v1/notify` | Enviar notificacion via JSON body |
| GET | `/api/v1/schemas` | Obtener esquemas de configuracion |

## Autenticacion por API Key

### Formato del Header

```
X-API-KEY: <tu-api-key>
```

### Ejemplo

```bash
curl -X POST http://localhost:8000/api/v1/notify \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: tu-api-key-secreta" \
  -d '{
    "targets": ["slack://..."],
    "body": "Alerta desde Volkern",
    "format": "text"
  }'
```

## Esquema de API Keys Multitenant

### Concepto

El sistema de API Keys multitenant permite aislar clientes/organizaciones usando keys independientes.

### Estructura

```yaml
# Formato de variable de entorno
APPRISE_API_KEYS: "tenant1_key_abc123,tenant2_key_def456,tenant3_key_ghi789"
```

### Formato de Key

```
{tenant_prefix}_{key_hash}
```

| Campo | Descripcion | Ejemplo |
|-------|-------------|---------|
| `tenant_prefix` | Identificador del tenant | `volkern`, `client_a` |
| `key_hash` | Hash unico | `abc123`, `def456` |

### Generacion de Keys

```bash
# Generar una API key segura
openssl rand -hex 32
```

### Validacion por Tenant

```python
# Ejemplo de middleware de validacion
def validate_api_key(request):
    api_key = request.headers.get("X-API-KEY")
    if not api_key:
        return None
    
    for key in APPRISE_API_KEYS.split(","):
        if api_key == key.strip():
            tenant = key.split("_")[0]
            return tenant
    return None
```

## Volumenes

| Destino | Descripcion |
|---------|-------------|
| `/config` | Configuracion persistente de Apprise |

## Gestion del Servicio

```bash
# Iniciar
docker-compose -f docker-compose.apprise.yml up -d

# Ver logs
docker-compose -f docker-compose.apprise.yml logs -f

# Detener
docker-compose -f docker-compose.apprise.yml down

# Reiniciar
docker-compose -f docker-compose.apprise.yml restart
```

## Notificaciones Soportadas

Apprise-API soporta 60+ servicios de notificacion incluyendo:

- Slack, Discord, Teams
- Telegram, Signal
- Email (SMTP)
- Pushbullet, Pushover
- AWS SNS, GCM
- Y muchos mas
