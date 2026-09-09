# API de Volkern — Guía para crear una integración

Documentación oficial (en español) para que un tercero cree una integración con la
**API de Volkern**. Aquí encontrarás cómo autenticarte, qué recursos puedes leer o
crear, y cómo recibir o enviar eventos mediante webhooks.

> Aplica a producción: **`https://volkern.app`**.
> En desarrollo local la app corre en `http://localhost:3000`.

---

## Índice de documentos

| Documento | Contenido |
|---|---|
| [01. Autenticación y API Keys](autenticacion.md) | Cómo obtener una API key, cabeceras de autenticación y todos los scopes disponibles |
| [02. Endpoints del CRM](endpoints-crm.md) | Leads, contactos, deals/pipeline y citas: métodos, parámetros, cuerpos y respuestas |
| [03. Webhooks](webhooks.md) | Webhooks de entrada (externa → Volkern) y salientes (Volkern → tu sistema) |
| [04. Ejemplos](ejemplos.md) | Ejemplos listos para copiar en cURL, Node.js y Python |
| [05. Errores y buenas prácticas](errores-buenas-practicas.md) | Códigos HTTP, formato de errores, límites, deduplicación y seguridad |

---

## Inicio rápido (60 segundos)

1. **Crea una API key**
   - Inicia sesión en `https://volkern.app` con un usuario administrador del tenant.
   - Ve a **Configuración → API Keys** (ruta `/dashboard/configuracion/api-keys`).
   - Pulsa **Crear API key**, ponle un nombre (p. ej. `n8n-produccion`) y marca al
     menos un scope (p. ej. `leads:read`).
   - **Copia la clave en ese momento**: se muestra una sola vez y no podrás volver a
     verla. Tiene formato `vk_prod_` + 64 caracteres hexadecimales.

2. **Prueba que funciona**:

```bash
curl https://volkern.app/api/leads \
  -H "X-API-Key: vk_prod_tu_clave_aqui"
```

3. **Lee los recursos** según el scope que necesites:

```bash
# Leads (lista)
curl https://volkern.app/api/leads -H "X-API-Key: vk_prod_tu_clave_aqui"

# Crear un lead
curl -X POST https://volkern.app/api/leads \
  -H "X-API-Key: vk_prod_tu_clave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Ana García",
    "email": "ana@ejemplo.com",
    "telefono": "+34 600 123 456",
    "empresa": "Ejemplo S.L.",
    "canal": "web"
  }'

# Crear una cita
curl -X POST https://volkern.app/api/citas \
  -H "X-API-Key: vk_prod_tu_clave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Reunión con Ana",
    "tipo": "reunion",
    "fechaHora": "2026-09-20T10:00:00.000Z",
    "duracion": 30
  }'
```

Si no recibes una respuesta clara, revisa la tabla de [errores](errores-buenas-practicas.md).

---

## ¿Qué es y qué no es la API de Volkern?

**Sí**
- API REST sobre HTTPS con respuestas JSON.
- Autenticación por **API key** ligada a un tenant (la clave determina la cuenta a la
  que accedes; no hace falta enviar `tenantId`).
- Scopes por recurso (`leads:read`, `contacts:write`, `citas:read`, …).
- Webhooks de entrada genéricos (con UUID y firma HMAC opcional).
- Configuración de webhooks salientes con reintentos y firma HMAC.

**No (todavía)**
- No existe paginación en los endpoints de listado: devuelven el conjunto completo.
- No existe clave de idempotencia (`Idempotency-Key`): si reintentas una creación,
  revisa las reglas de deduplicación de cada recurso (p. ej. un lead se actualiza si
  ya existe con ese email/teléfono).
- El contrato de cada endpoint se describe en estos documentos; otros `/api/*` que no
  aparecen aquí son internos de la aplicación y **no forman parte** de la superficie
  soportada para integraciones y pueden cambiar sin aviso.

---

## Flujo típico de integración

```
Tu sistema (n8n, Make, Zapier, app propia, Anytimebot, …)
        │
        │ 1. Llamada REST con header X-API-Key
        ▼
   /api/leads · /api/contacts · /api/deals · /api/citas
        │
        │ 2. Evento ocurre en Volkern (p. ej. cita creada)
        ▼
   Webhook saliente ───► Tu endpoint HTTP (verifica la firma HMAC)
```

Y en sentido inverso:

```
Formulario / CRM externo / n8n
        │
        │ 3. POST a la URL pública de un webhook de entrada
        ▼
   https://volkern.app/api/webhook/<uuid>
        │
        ▼
   Se crea/actualiza un lead, tarea, o se dispara una automatización
```

---

## Contacto y soporte

- Panel de administración de claves: **Configuración → API Keys**.
- Panel de webhooks de entrada: **Integraciones → Webhooks de Entrada**.
- Panel de webhooks salientes: **Integraciones → Webhooks Salientes**.
- Para preguntas técnicas sobre la API: abre un ticket indicando el tenant y el uso
  previsto de la integración.
