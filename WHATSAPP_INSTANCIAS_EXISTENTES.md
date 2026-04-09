# 🔧 Configuración Correcta de n8n para Volkern CRM

## 📋 Resumen del Problema

El usuario está intentando agendar citas desde n8n pero está usando la **URL incorrecta** y el **header de autenticación incorrecto**, resultando en respuestas HTML de la página de login en lugar de datos JSON.

### 🔴 Error Actual

```
URL: https://anytimebot.app/api/v1/availability  ❌ INCORRECTA
Header: "Volkern"                                 ❌ INCORRECTO
Respuesta: HTML de página de login              ❌ ERROR
```

### Causa del Error HTML

Cuando recibes un HTML completo con `<!DOCTYPE html>` y contenido de login, significa que:

1. 🚫 **La URL no es una API REST** - Estás accediendo a una página web en lugar de un endpoint de API
2. 🔒 **Falta autenticación correcta** - Next.js redirige a `/auth/login` cuando detecta un request sin sesión
3. ⚠️ **No hay API Key en el header** - El endpoint requiere `X-API-Key` pero no lo encuentra

---

## ✅ Solución: Configuración Correcta

### Paso 1: Crear API Key en Volkern CRM

1. Ve a **Dashboard → Configuración → API Keys**
2. Haz clic en **"Generar Nueva API Key"**
3. Configura:
   - **Nombre**: "n8n Automatización de Citas"
   - **Scopes necesarios**:
     - ☑️ `leads:read`
     - ☑️ `leads:write`
     - ☑️ `citas:read`
     - ☑️ `citas:write`
     - ☑️ `citas:create`
4. **Copia la API Key** (solo se muestra una vez):
   ```
   vk_prod_a1b2c3d4e5f6...
   ```

---

### Paso 2: Configurar "Get booked Appointments" en n8n

❌ **Configuración INCORRECTA (lo que tienes ahora):**

```yaml
URL: https://anytimebot.app/api/v1/availability
Authentication: Generic Credential Type
  Header Auth: "Volkern"
Query Parameters:
  - username: DeXpert
  - startDate: 2025-11-29
  - endDate: 2025-11-29
  - timezone: UTC+-6
```

✅ **Configuración CORRECTA:**

```yaml
Method: GET
URL: https://volkern.app/api/citas

Authentication: Header Auth
  Name: X-API-Key
  Value: vk_prod_TU_API_KEY_AQUI

Query Parameters:
  - fechaInicio: 2025-11-29
  - fechaFin: 2025-11-29
```

#### 📝 Captura de Pantalla de Configuración Correcta:

**Parameters Tab:**
```
URL: https://volkern.app/api/citas

Send Query Parameters: ON

Query Parameters:
  Name: fechaInicio
  Value: {{ $fromAI("beforeDate") }}  (o "2025-11-29")

  Name: fechaFin
  Value: {{ $fromAI("beforeDate") }}  (o "2025-11-29")
```

**Authentication Tab:**
```
Authentication: Header Auth

  Name: X-API-Key
  Value: vk_prod_a1b2c3d4e5f6...
```

---

### Paso 3: Configurar "Book Appointment" en n8n

✅ **Configuración CORRECTA:**

```yaml
Method: POST
URL: https://volkern.app/api/citas

Authentication: Header Auth
  Name: X-API-Key
  Value: vk_prod_TU_API_KEY_AQUI

Body Content Type: JSON

Body (JSON):
{
  "leadId": "{{ $json.lead.id }}",
  "tipo": "reunion",
  "titulo": "Consultoría automatizada",
  "descripcion": "{{ $json.parameter6_Value }}",
  "fechaHora": "{{ $json.parameter4_Value }}T{{ $json.parameter5_Value }}:00Z",
  "duracion": 20
}
```

#### 📝 Explicación de Campos:

| Campo | Descripción | Requerido | Ejemplo |
|-------|-------------|-----------|----------|
| `leadId` | ID del lead creado anteriormente | ✅ Sí | `"clxxx123"` |
| `tipo` | Tipo de cita | ✅ Sí | `"reunion"`, `"llamada"`, `"demo"` |
| `titulo` | Título de la cita | ✅ Sí | `"Diagnóstico de automatización"` |
| `descripcion` | Descripción detallada | No | `"Usuario preguntó..."` |
| `fechaHora` | Fecha y hora ISO 8601 | ✅ Sí | `"2025-11-29T14:00:00Z"` |
| `duracion` | Duración en minutos | ✅ Sí | `20`, `30`, `60` |
| `ubicacion` | Ubicación física (opcional) | No | `"Oficina Central"` |
| `linkReunion` | Link de Zoom/Meet (opcional) | No | `"https://zoom.us/j/123"` |

---

## 📊 Flujo Completo Correcto

```
1. [When chat message received] (Trigger)
   ↓
   Datos del chat: {
     nombre: "Bruno",
     email: "bruno@hvcabaim.com",
     telefono: "+52 55 1234 5678",
     empresa: "DeXpert",
     contexto: "Usuario preguntó..."
   }

2. [OpenRouter Chat Model]
   ↓
   Genera contexto enriquecido

3. [Append Update Lead Volkern]
   → POST https://volkern.app/api/leads
   → Header: X-API-Key: vk_prod_...
   → Body:
   {
     "nombre": "Bruno",
     "email": "bruno@hvcabaim.com",
     "telefono": "+52 55 1234 5678",
     "empresa": "DeXpert",
     "notas": "[CONTEXTO COMPLETO]"
   }
   ↓
   Respuesta: { "success": true, "lead": { "id": "clyyy456" } }

4. [Get booked Appointments]
   → GET https://volkern.app/api/citas?fechaInicio=2025-11-29&fechaFin=2025-11-29
   → Header: X-API-Key: vk_prod_...
   ↓
   Respuesta: [
     {
       "id": "clxxx",
       "fechaHora": "2025-11-29T10:00:00Z",
       "duracion": 20,
       "titulo": "Cita existente"
     }
   ]

5. [Code] (Verificar disponibilidad)
   ↓
   Lógica para encontrar slot disponible

6. [Book Appointment]
   → POST https://volkern.app/api/citas
   → Header: X-API-Key: vk_prod_...
   → Body:
   {
     "leadId": "clyyy456",
     "tipo": "reunion",
     "titulo": "Diagnóstico de automatización",
     "fechaHora": "2025-11-29T14:00:00Z",
     "duracion": 20
   }
   ↓
   ✅ Respuesta exitosa:
   {
     "id": "clzzz789",
     "leadId": "clyyy456",
     "tipo": "reunion",
     "titulo": "Diagnóstico de automatización",
     "fechaHora": "2025-11-29T14:00:00.000Z",
     "duracion": 20,
     "estado": "pendiente"
   }
```

---

## 🧪 Verificación con cURL

### Test 1: Obtener Citas Existentes

```bash
curl -X GET "https://volkern.app/api/citas?fechaInicio=2025-11-27&fechaFin=2025-11-30" \
  -H "X-API-Key: vk_prod_TU_API_KEY"
```

**Respuesta esperada:**
```json
[
  {
    "id": "clxxx",
    "leadId": "clyyy",
    "tipo": "reunion",
    "titulo": "Consultoría",
    "fechaHora": "2025-11-29T10:00:00.000Z",
    "duracion": 20,
    "estado": "pendiente",
    "lead": {
      "id": "clyyy",
      "nombre": "Bruno",
      "email": "bruno@hvcabaim.com"
    },
    "servicio": null
  }
]
```

---

### Test 2: Crear Nueva Cita

```bash
curl -X POST "https://volkern.app/api/citas" \
  -H "X-API-Key: vk_prod_TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "clguto30032z80gzl1e74u",
    "tipo": "reunion",
    "titulo": "Diagnóstico de automatización",
    "descripcion": "El usuario preguntó cómo podemos ayudarle con WhatsApp",
    "fechaHora": "2025-11-29T14:00:00Z",
    "duracion": 20
  }'
```

**Respuesta esperada:**
```json
{
  "id": "clzzz789",
  "leadId": "clguto30032z80gzl1e74u",
  "tipo": "reunion",
  "titulo": "Diagnóstico de automatización",
  "descripcion": "El usuario preguntó cómo podemos ayudarle con WhatsApp",
  "fechaHora": "2025-11-29T14:00:00.000Z",
  "duracion": 20,
  "estado": "pendiente",
  "createdAt": "2025-11-26T14:45:00.000Z"
}
```

---

## 🐛 Troubleshooting

### Error 1: Respuesta HTML en lugar de JSON

**Síntoma:**
```html
data:<!DOCTYPE html><html lang="es-MX"><head>...
```

**Causa:**
- ❌ URL incorrecta (usando Anytimebot en lugar de Volkern)
- ❌ Falta el header `X-API-Key`
- ❌ Next.js redirige a la página de login

**Solución:**
1. Cambiar URL a `https://volkern.app/api/citas`
2. Agregar header `X-API-Key` con tu API Key
3. Verificar que la API Key sea válida

---

### Error 2: "Authorization failed - Missing Authorization header"

**Síntoma:**
```json
{
  "error": "Authorization failed - Missing Authorization header"
}
```

**Causa:**
- ❌ No se está enviando el header `X-API-Key`
- ❌ El nombre del header es incorrecto ("Volkern" en lugar de "X-API-Key")

**Solución:**
1. En n8n, ve al nodo HTTP Request
2. Authentication → **Header Auth**
3. Name: `X-API-Key`
4. Value: `vk_prod_TU_API_KEY`

---

### Error 3: Cita no aparece en el sistema

**Síntoma:**
El request parece exitoso pero la cita no aparece en Volkern CRM.

**Causa:**
- ❌ `leadId` inválido o no existe
- ❌ Formato de fecha incorrecto
- ❌ Falta campos requeridos

**Solución:**
1. Verificar que el `leadId` sea correcto (debe venir del nodo "Append Update Lead")
2. Verificar formato de fecha: `"2025-11-29T14:00:00Z"` (ISO 8601)
3. Verificar campos requeridos: `leadId`, `tipo`, `titulo`, `fechaHora`, `duracion`

---

### Error 4: "Invalid API Key"

**Síntoma:**
```json
{
  "error": "Invalid API Key"
}
```

**Causa:**
- ❌ API Key incorrecta o expirada
- ❌ API Key desactivada
- ❌ Scopes insuficientes

**Solución:**
1. Verificar que la API Key sea correcta (empieza con `vk_prod_`)
2. Verificar que la API Key esté activa en Dashboard → Configuración → API Keys
3. Verificar que tenga los scopes necesarios:
   - `citas:read` para GET
   - `citas:create` o `citas:write` para POST

---

## 📝 Notas Importantes

### Diferencias entre Anytimebot y Volkern CRM

| Aspecto | Anytimebot | Volkern CRM |
|---------|------------|-------------|
| **URL Base** | `https://anytimebot.app` | `https://volkern.app` |
| **Endpoint Citas** | `/api/v1/availability` | `/api/citas` |
| **Autenticación** | Credential específico | `X-API-Key` header |
| **Parámetros** | `username`, `startDate` | `fechaInicio`, `fechaFin` |

### Formato de Fechas

✅ **Correcto:**
```
"2025-11-29T14:00:00Z"        # ISO 8601 con Z (UTC)
"2025-11-29T14:00:00-06:00"   # ISO 8601 con timezone
```

❌ **Incorrecto:**
```
"2025-11-29"                  # Solo fecha (falta hora)
"11/29/2025 2:00 PM"          # Formato no estándar
"2025-11-29 14:00:00"         # Espacio en lugar de T
```

### Tipos de Cita Disponibles

```javascript
const tiposCita = [
  "reunion",     // Reunión general
  "llamada",     // Llamada telefónica
  "demo",        // Demostración de producto
  "consulta",    // Consultoría
  "seguimiento", // Seguimiento
  "otro"         // Otro tipo
];
```

---

## ✅ Checklist de Verificación

### Antes de ejecutar el workflow:

- [ ] API Key creada en Volkern CRM
- [ ] API Key tiene scopes: `leads:read`, `leads:write`, `citas:read`, `citas:write`, `citas:create`
- [ ] Nodo "Get booked Appointments":
  - [ ] URL: `https://volkern.app/api/citas`
  - [ ] Header: `X-API-Key: vk_prod_...`
  - [ ] Query params: `fechaInicio`, `fechaFin`
- [ ] Nodo "Book Appointment":
  - [ ] URL: `https://volkern.app/api/citas`
  - [ ] Method: `POST`
  - [ ] Header: `X-API-Key: vk_prod_...`
  - [ ] Body tiene: `leadId`, `tipo`, `titulo`, `fechaHora`, `duracion`
- [ ] Formato de fecha es ISO 8601: `2025-11-29T14:00:00Z`

### Después de ejecutar:

- [ ] No recibí respuesta HTML (verificar que sea JSON)
- [ ] El request de GET devuelve un array de citas
- [ ] El request de POST devuelve un objeto de cita con `id`
- [ ] La cita aparece en Dashboard → Citas de Volkern CRM
- [ ] El lead asociado muestra la cita en su perfil

---

## 🎉 Conclusión

Con esta configuración correcta:

✅ **Las citas SÍ se crearán** en Volkern CRM  
✅ **Las respuestas serán JSON** (no HTML)  
✅ **La autenticación funcionará** correctamente  
✅ **Podrás verificar disponibilidad** antes de agendar  

**Recuerda:**

1. 🎯 Usa `https://volkern.app` (NO Anytimebot)
2. 🔑 Header debe ser `X-API-Key` (NO "Volkern")
3. 📅 Fechas en formato ISO 8601 con `T` y `Z`
4. 🔗 Usa el `leadId` del nodo anterior

¡Ahora sí, todo listo para agendar citas desde n8n! 🚀
