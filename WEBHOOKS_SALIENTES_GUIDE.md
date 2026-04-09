# 🚀 Sistema de Webhooks Salientes - Volkern CRM

## Resumen

Se ha implementado un sistema completo de **Webhooks Salientes (Outgoing Webhooks)** similar a Chatwoot, que permite que Volkern CRM notifique automáticamente a herramientas externas (n8n, Make, Zapier, etc.) cuando ocurren eventos importantes.

---

## ✅ Componentes Implementados

### 1. **Base de Datos (Prisma Schema)**

Se agregaron dos nuevos modelos:

#### `OutgoingWebhook`
- Almacena la configuración de cada webhook
- Campos principales:
  - `nombre`: Identificador del webhook
  - `url`: URL de destino (n8n, Make, etc.)
  - `eventos`: Array de eventos suscritos
  - `metodoHttp`: POST/PUT
  - `secretKey`: Para firma HMAC (opcional)
  - `maxReintentos`: Número de reintentos en caso de fallo
  - Estadísticas: `totalEnviados`, `totalExitosos`, `totalFallidos`

#### `OutgoingWebhookDelivery`
- Registro de cada envío de webhook
- Campos principales:
  - `evento`: Tipo de evento disparado
  - `payload`: Datos enviados
  - `estadoHttp`: Código de respuesta (200, 404, 500, etc.)
  - `estado`: exitoso, fallido, reintentando
  - `tiempoRespuesta`: Milisegundos
  - `intentos`: Número de intentos realizados

---

### 2. **Librería Core (`/lib/outgoing-webhooks.ts`)**

Funciones principales:

#### `dispatchWebhook(tenantId, evento, data, entidadTipo, entidadId)`
- Función principal para disparar webhooks
- Busca todos los webhooks activos suscritos al evento
- Envía notificaciones en paralelo

#### `getAvailableEvents()`
- Retorna la lista de 14 eventos soportados con sus descripciones

**Eventos Soportados:**
1. `lead_creado` - Nuevo lead en el CRM
2. `lead_actualizado` - Lead modificado
3. `contacto_creado` - Nuevo contacto
4. `contacto_actualizado` - Contacto modificado
5. `cita_creada` - Nueva cita agendada
6. `cita_actualizada` - Cita modificada
7. `cita_cancelada` - Cita cancelada
8. `mensaje_recibido` - Mensaje entrante
9. `mensaje_enviado` - Mensaje saliente
10. `tarea_creada` - Nueva tarea
11. `tarea_completada` - Tarea completada
12. `deal_creado` - Nueva oportunidad
13. `deal_actualizado` - Oportunidad modificada
14. `campana_enviada` - Campaña completada

**Características Avanzadas:**
- **Reintentos Automáticos**: Retraso exponencial (2^n minutos)
- **Firma HMAC**: Seguridad con X-Webhook-Signature header
- **Timeout Configurable**: Por defecto 30 segundos
- **Logging Completo**: Toda la información de cada envío

---

### 3. **APIs REST**

#### `GET /api/webhooks/outgoing`
Lista todos los webhooks del tenant con estadísticas

#### `POST /api/webhooks/outgoing`
Crea un nuevo webhook
```json
{
  "nombre": "Notificación a n8n",
  "descripcion": "Enviar leads a n8n",
  "url": "https://webhook.dimension.expert/webhook/abc123",
  "eventos": ["lead_creado", "cita_agendada"],
  "metodoHttp": "POST",
  "generarSecret": true,
  "maxReintentos": 3,
  "timeoutSegundos": 30
}
```

#### `GET /api/webhooks/outgoing/[id]`
Obtiene detalles de un webhook específico

#### `PUT /api/webhooks/outgoing/[id]`
Actualiza un webhook
```json
{
  "nombre": "Nuevo nombre",
  "activo": false,
  "regenerarSecret": true
}
```

#### `DELETE /api/webhooks/outgoing/[id]`
Elimina un webhook (cascade elimina deliveries)

#### `GET /api/webhooks/outgoing/[id]/deliveries`
Historial paginado de entregas

#### `POST /api/webhooks/outgoing/[id]/test`
Envía un webhook de prueba

---

### 4. **UI de Gestión (`/dashboard/integraciones/webhooks-salientes`)**

**Características:**
- ✅ Lista de webhooks con estadísticas
- ✅ Creación de webhooks con formulario completo
- ✅ Selección múltiple de eventos (checkboxes)
- ✅ Activar/Desactivar webhooks
- ✅ Probar webhooks
- ✅ Ver historial de entregas
- ✅ Copiar URL al portapapeles
- ✅ Eliminar webhooks
- ✅ Indicadores visuales de éxito/fallo
- ✅ Seguridad HMAC opcional

**Tarjetas de Webhook Muestran:**
- Total de eventos enviados
- Eventos exitosos (verde)
- Eventos fallidos (rojo)
- Último envío
- Lista de eventos suscritos

---

## 🔄 Flujo de Funcionamiento

```
┌─────────────────────────────────────────────────────────────────┐
│                       EVENTO EN VOLKERN CRM                      │
││
│  Lead creado → Cita agendada → Mensaje recibido → etc.          │
└────────────────────────┬────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│         dispatchWebhook(tenantId, evento, data, ...)            │
││
│  1. Buscar webhooks activos para el evento                      │
│  2. Filtrar por tenant y suscripción a evento                   │
│  3. Enviar webhooks en paralelo                                 │
└────────────────────────┬────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ENVÍO DE WEBHOOK                              │
││
│  • Construir payload con datos del evento                        │
│  • Añadir headers (Content-Type, X-Webhook-Event, etc.)        │
│  • Generar firma HMAC si secretKey está configurado             │
│  • Enviar HTTP POST/PUT con timeout                             │
│  • Registrar delivery con estado y respuesta                    │
└────────────────────────┬────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MANEJO DE RESPUESTA                           │
││
│  ✅ HTTP 2xx → Estado: exitoso                                  │
│  ❌ HTTP 4xx/5xx → Estado: fallido → Reintentar                │
│  ⏱️ Timeout → Estado: fallido → Reintentar                     │
│  │                                                               │
│  Reintentos con retraso exponencial:                            │
│  • Intento 1: inmediato                                         │
│  • Intento 2: +2 min                                            │
│  • Intento 3: +4 min                                            │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                  HERRAMIENTA EXTERNA                             │
││
│  n8n / Make / Zapier / Webhook personalizado                    │
││
│  Recibe el payload y procesa según su lógica                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Formato del Payload

Cada webhook envía un JSON con la siguiente estructura:

```json
{
  "event": "lead_creado",
  "timestamp": "2025-11-12T21:30:00.000Z",
  "tenant_id": "cuid_tenant_123",
  "data": {
    "id": "lead_abc123",
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "telefono": "+52 55 1234 5678",
    "empresa": "Acme Corp",
    "fuente": "whatsapp",
    "scoreValue": 75,
    "estado": "nuevo",
    "fechaCreacion": "2025-11-12T21:30:00.000Z"
  },
  "metadata": {
    // Campos adicionales opcionales
  }
}
```

---

## 🔐 Seguridad con HMAC

Si el webhook tiene `secretKey` configurado, se envía el header:

```
X-Webhook-Signature: <HMAC-SHA256>
```

**Validación en el receptor (Node.js):**

```javascript
const crypto = require('crypto');

function verificarWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## 🛠️ Configuración en n8n

### Paso 1: Crear Webhook en n8n
1. Agregar nodo "Webhook"
2. Copiar la URL generada
3. Método: POST
4. Autenticación: Ninguna (o HMAC si usas secretKey)

### Paso 2: Configurar en Volkern
1. Ir a **Dashboard → Integraciones → Webhooks Salientes**
2. Clic en **Nuevo Webhook**
3. Completar formulario:
   - Nombre: "n8n - Leads"
   - URL: (la de n8n)
   - Eventos: Seleccionar eventos deseados
   - Generar Secret: ✅ (recomendado)
4. Guardar

### Paso 3: Procesar en n8n
El webhook recibirá el payload JSON y podrás:
- Crear registros en Google Sheets
- Enviar notificaciones a Slack
- Actualizar Airtable/Notion
- Crear tareas en Asana
- ¡Lo que necesites!

---

## 📊 Monitoreo y Logs

### En el Dashboard:
- **Tarjetas de Webhook**: Estadísticas en tiempo real
- **Historial de Entregas**: Ver cada envío
  - Payload enviado
  - Respuesta recibida
  - Tiempo de respuesta
  - Errores (si los hubo)
  - Número de intentos

### En Audit Log:
Todos los eventos quedan registrados:
- Creación de webhooks
- Actualización de webhooks
- Eliminación de webhooks

---

## 🔧 Troubleshooting

### Webhook no se envía
1. **Verificar que esté activo** (toggle verde)
2. **Verificar eventos suscritos** (al menos 1)
3. **Probar con botón "Enviar Test"**
4. **Revisar deliveries** para ver errores

### Error 401/403
- **n8n/Make**: Verificar que la URL sea correcta
- **Webhook personalizado**: Validar autenticación

### Error 500
- **n8n**: Revisar lógica del workflow
- **Webhook personalizado**: Ver logs del servidor

### Timeout
- **Aumentar `timeoutSegundos`** en configuración
- **Optimizar receptor** para responder más rápido

---

## 🎯 Casos de Uso

### 1. Sincronizar Leads con Google Sheets
**Evento:** `lead_creado`
**Herramienta:** n8n
**Flujo:**
1. Volkern dispara webhook
2. n8n recibe datos del lead
3. n8n agrega fila a Google Sheets

### 2. Notificar en Slack cuando hay cita cancelada
**Evento:** `cita_cancelada`
**Herramienta:** Make
**Flujo:**
1. Cliente cancela cita
2. Volkern dispara webhook
3. Make envía mensaje a canal de Slack

### 3. Crear tareas en Asana para leads importantes
**Evento:** `lead_creado`
**Herramienta:** Zapier
**Flujo:**
1. Lead con score > 80 se crea
2. Volkern dispara webhook con datos
3. Zapier crea tarea en Asana

### 4. Actualizar CRM externo
**Evento:** `contacto_actualizado`
**Herramienta:** Webhook personalizado
**Flujo:**
1. Datos de contacto actualizados
2. Volkern envía webhook a tu API
3. Tu API actualiza otro sistema

---

## 📈 Próximos Pasos (Futuro)

### Fase 2 (Posible Expansión)
- [ ] Panel de métricas de webhooks
- [ ] Webhooks condicionales (si campo X = valor Y)
- [ ] Transformaciones de payload
- [ ] Webhooks batch (agrupar múltiples eventos)
- [ ] Retry manual desde UI
- [ ] Webhooks con autenticación OAuth
- [ ] Rate limiting por webhook

---

## ✅ Implementación Completada

### Archivos Creados/Modificados:

**Base de Datos:**
- `/prisma/schema.prisma` - Modelos `OutgoingWebhook` y `OutgoingWebhookDelivery`

**Librería Core:**
- `/lib/outgoing-webhooks.ts` - Sistema de envío de webhooks

**APIs:**
- `/app/api/webhooks/outgoing/route.ts` - GET/POST
- `/app/api/webhooks/outgoing/[id]/route.ts` - GET/PUT/DELETE
- `/app/api/webhooks/outgoing/[id]/deliveries/route.ts` - GET
- `/app/api/webhooks/outgoing/[id]/test/route.ts` - POST

**UI:**
- `/app/dashboard/integraciones/webhooks-salientes/page.tsx` - Panel de gestión completo

---

## 📌 Acceso al Sistema

**URL:** `https://volkern.app/dashboard/integraciones/webhooks-salientes`

---

## 🎉 ¡Sistema Listo para Usar!

Los webhooks salientes están completamente funcionales y listos para integrarse con n8n, Make, Zapier o cualquier otra herramienta.

**Diferencia clave con Webhooks Entrantes:**
- **Entrantes (Incoming)**: Herramientas externas → Volkern CRM
- **Salientes (Outgoing)**: Volkern CRM → Herramientas externas

Ahora tienes ambos sistemas trabajando en conjunto para máxima flexibilidad! 🚀
