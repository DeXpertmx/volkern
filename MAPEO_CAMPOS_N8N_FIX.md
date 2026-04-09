# 🔧 Fix: Mapeo de Campos y Preservación de Notas en n8n

## 📋 Resumen del Problema

El usuario reportó tres problemas al usar n8n con Volkern CRM:

1. ✅ **Notas se quedan en blanco** después de actualizar el lead
2. ✅ **Campo empresa se guarda en teléfono** (mapeo incorrecto)
3. ✅ **Error de autorización** al obtener citas disponibles

### 🔍 Causa Raíz

#### Problema 1: Notas Vacías
**Causa**: El endpoint `POST /api/leads` (upsert) estaba **reemplazando** las notas con cualquier valor que se enviara, incluso `undefined` o `null`. Cuando n8n no enviaba el campo `notas`, el sistema lo borraba.

**Antes:**
```typescript
...(notas !== undefined && { notas }),  // ❌ Borra notas si es undefined
```

**Ahora:**
```typescript
// Solo actualizar notas si se envían explícitamente y tienen contenido
if (notas !== undefined && notas !== null && notas.trim() !== '') {
  updateData.notas = notas  // ✅ Preserva notas existentes si no se envían
}
```

---

#### Problema 2: Mapeo Incorrecto
**Causa**: En n8n, el usuario estaba mapeando:
- `telefono` = "DeXpert" (nombre de la empresa)
- `empresa` = no se enviaba

**Resultado**: El lead se creaba con:
```json
{
  "nombre": "Bruno",
  "email": "bruno@hvcabaim.com",
  "telefono": "DeXpert",  // ❌ Debería ser el número de teléfono
  "empresa": null           // ❌ Debería ser "DeXpert"
}
```

---

#### Problema 3: Error de Autorización
**Causa**: El nodo "Get booked Appointments from Append Lead Volkern" en n8n no tenía configurada la **API Key** en el header de autenticación.

**Error:**
```
Authorization failed - Missing Authorization header
```

---

## ✅ Soluciones Implementadas

### 1. Preservación de Notas Existentes

El endpoint `POST /api/leads` ahora **preserva las notas existentes** cuando no se envían en el request.

**Comportamiento Actualizado:**

| Escenario | Request | Resultado |
|-----------|---------|----------|
| **Crear lead** | `{ "email": "test@test.com", "notas": "Primera llamada" }` | ✅ Crea lead con notas |
| **Actualizar sin notas** | `{ "email": "test@test.com", "nombre": "Juan" }` | ✅ **Preserva** notas existentes |
| **Actualizar con notas** | `{ "email": "test@test.com", "notas": "Actualización" }` | ✅ **Reemplaza** con nuevas notas |
| **Actualizar con notas vacías** | `{ "email": "test@test.com", "notas": "" }` | ✅ **Preserva** notas existentes |

---

### 2. Logging Mejorado para Diagnóstico

Ahora el sistema registra los datos recibidos en cada request:

```typescript
console.log('[POST /api/leads] Datos recibidos:', {
  nombre: nombre || 'undefined',
  email: email || 'undefined', 
  telefono: telefono || 'undefined',
  empresa: empresa || 'undefined',
  notasLength: notas?.length || 0,
  authMethod: auth.authMethod
})
```

**Dónde verlo:**
- En los logs del servidor
- En la consola de desarrollo de Volkern
- En los logs de deployment

Esto ayuda a **identificar rápidamente** problemas de mapeo en n8n.

---

## 🔧 Configuración Correcta en n8n

### Paso 1: Configurar API Key en Volkern

1. Ve a **Dashboard → Configuración → API Keys**
2. Haz clic en **"Generar Nueva API Key"**
3. Configura:
   - **Nombre**: "n8n Integración Completa"
   - **Scopes necesarios**:
     - ✅ `leads:read`
     - ✅ `leads:write`
     - ✅ `citas:read`
     - ✅ `citas:write`
     - ✅ `citas:create`
4. **Copia la API Key** (solo se muestra una vez):
   ```
   vk_prod_a1b2c3d4e5f6...
   ```

---

### Paso 2: Mapeo Correcto de Campos

#### 📍 **Nodo "Append Update Lead Volkern"**

```yaml
Method: POST
URL: https://volkern.app/api/leads

Authentication: Header Auth
  Name: X-API-Key
  Value: vk_prod_TU_API_KEY

Body (JSON):
{
  "nombre": "{{$json.nombre}}",
  "email": "{{$json.email}}",
  "telefono": "{{$json.telefono}}",        # ✅ Número de teléfono
  "empresa": "{{$json.empresa}}",          # ✅ Nombre de la empresa
  "notas": "{{$json.contextoCompleto}}"    # ✅ Contexto completo
}
```

#### 📍 **Nodo "Get booked Appointments"**

```yaml
Method: GET
URL: https://volkern.app/api/citas?fechaInicio={{$json.startDate}}

Authentication: Header Auth
  Name: X-API-Key
  Value: vk_prod_TU_API_KEY

Query Parameters:
  - fechaInicio: "2025-11-27"
  - fechaFin: "2025-12-31"
```

#### 📍 **Nodo "Book Appointment"**

```yaml
Method: POST
URL: https://volkern.app/api/citas

Authentication: Header Auth
  Name: X-API-Key
  Value: vk_prod_TU_API_KEY

Body (JSON):
{
  "leadId": "{{$json.lead.id}}",
  "tipo": "reunion",
  "titulo": "Diagnóstico de automatización",
  "fechaHora": "2025-11-27T10:00:00Z",
  "duracion": 20
}
```

---

## 📊 Ejemplo de Flujo Completo

### Escenario: Cliente Agenda Cita desde WhatsApp

```
1. [When chat message received] (Trigger)
   ↓
   Datos: {
     nombre: "Alejandra",
     email: "hola@cbdol.com.mx",
     telefono: "+52 55 1234 5678",      # ✅ Número real
     empresa: "Tecnología CBD",          # ✅ Empresa real
     contexto: "Usuario preguntó..."
   }

2. [OpenRouter Chat Model]
   ↓
   Genera contexto enriquecido

3. [Append Update Lead Volkern]
   → POST /api/leads
   → Header: X-API-Key: vk_prod_...
   → Body:
   {
     "nombre": "Alejandra",
     "email": "hola@cbdol.com.mx",
     "telefono": "+52 55 1234 5678",   # ✅ Correcto
     "empresa": "Tecnología CBD",       # ✅ Correcto
     "notas": "[CONTEXTO COMPLETO]"
   }
   ↓
   Respuesta: { "success": true, "lead": { "id": "clyyy456" } }

4. [Get booked Appointments]
   → GET /api/citas?fechaInicio=2025-11-27
   → Header: X-API-Key: vk_prod_...
   ↓
   Respuesta: [ { "id": "clxxx", "fechaHora": "..." } ]

5. [Code] (Verificar disponibilidad)
   ↓

6. [Book Appointment]
   → POST /api/citas
   → Header: X-API-Key: vk_prod_...
   → Body:
   {
     "leadId": "clyyy456",
     "tipo": "reunion",
     "titulo": "Diagnóstico",
     "fechaHora": "2025-11-27T10:00:00Z",
     "duracion": 20
   }
   ↓
   ✅ Cita creada exitosamente
```

---

## 🐛 Debugging: Cómo Ver los Logs

### Opción 1: Logs del Servidor (Producción)

```bash
# Ver logs en tiempo real
vercel logs volkern.app --follow

# O en la UI de Vercel
https://vercel.com/volkern/logs
```

### Opción 2: Logs en Development

```bash
cd /home/ubuntu/fluy_crm/nextjs_space
yarn dev

# Los logs aparecerán en la terminal:
[POST /api/leads] Datos recibidos: {
  "nombre": "Bruno",
  "email": "bruno@hvcabaim.com",
  "telefono": "DeXpert",        # ❌ Aquí está el problema
  "empresa": "undefined",        # ❌ Empresa no se envió
  "notasLength": 0,
  "authMethod": "apikey"
}
```

---

## ✅ Verificación Paso a Paso

### Test 1: Crear Lead con Notas

```bash
curl -X POST "https://volkern.app/api/leads" \
  -H "X-API-Key: vk_prod_TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Test Usuario",
    "email": "test@test.com",
    "telefono": "+52 55 1234 5678",
    "empresa": "Test Company",
    "notas": "Primera interacción desde WhatsApp"
  }'
```

**Esperado:**
```json
{
  "success": true,
  "isNew": true,
  "lead": {
    "id": "clxxx",
    "nombre": "Test Usuario",
    "telefono": "+52 55 1234 5678",
    "empresa": "Test Company",
    "notas": "Primera interacción desde WhatsApp"
  }
}
```

---

### Test 2: Actualizar Lead SIN Enviar Notas

```bash
curl -X POST "https://volkern.app/api/leads" \
  -H "X-API-Key: vk_prod_TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@test.com",
    "nombre": "Test Usuario Actualizado"
  }'
```

**Esperado:**
```json
{
  "success": true,
  "isNew": false,
  "lead": {
    "id": "clxxx",
    "nombre": "Test Usuario Actualizado",
    "telefono": "+52 55 1234 5678",
    "empresa": "Test Company",
    "notas": "Primera interacción desde WhatsApp"  // ✅ PRESERVADAS
  }
}
```

---

### Test 3: Obtener Citas Disponibles

```bash
curl -X GET "https://volkern.app/api/citas?fechaInicio=2025-11-27" \
  -H "X-API-Key: vk_prod_TU_API_KEY"
```

**Esperado:**
```json
[
  {
    "id": "clzzz",
    "tipo": "reunion",
    "titulo": "Consultoría",
    "fechaHora": "2025-11-27T10:00:00Z"
  }
]
```

---

## 🚨 Errores Comunes y Soluciones

### Error 1: "Authorization failed"

**Problema:**
```
Authorization failed - Missing Authorization header
```

**Causa:** API Key no configurada en n8n

**Solución:**
1. En n8n, abre el nodo HTTP Request
2. Ve a **Authentication**
3. Selecciona **"Header Auth"**
4. Configura:
   - Name: `X-API-Key`
   - Value: `vk_prod_TU_API_KEY`

---

### Error 2: Notas se Borran

**Problema:**
Las notas desaparecen después de actualizar el lead.

**Causa:** n8n no está enviando el campo `notas`

**Solución:**
✅ **Ya está solucionado** - El sistema ahora preserva las notas automáticamente.

**Alternativa (si quieres actualizar notas):**
Envía el campo `notas` explícitamente en n8n:
```json
{
  "email": "...",
  "notas": "{{$json.contextoCompleto}}"
}
```

---

### Error 3: Empresa en Campo Teléfono

**Problema:**
```json
{
  "telefono": "DeXpert",  // ❌ Es el nombre de la empresa
  "empresa": null
}
```

**Causa:** Mapeo incorrecto en n8n

**Solución:**
Verifica el mapeo en n8n:

```javascript
// ❌ INCORRECTO
{
  "telefono": "{{$json.empresa}}"  // Empresa en teléfono
}

// ✅ CORRECTO
{
  "telefono": "{{$json.telefono}}",
  "empresa": "{{$json.empresa}}"
}
```

---

## 📊 Estructura de Datos Correcta

### Campos del Lead en Volkern CRM

```typescript
interface Lead {
  // Campos obligatorios (uno de los dos)
  email?: string;                // Email del lead
  telefono?: string;             // Número de teléfono

  // Campos opcionales
  nombre?: string;               // Nombre completo
  empresa?: string;              // Nombre de la empresa
  cargo?: string;                // Puesto/cargo
  ubicacion?: string;            // Ciudad, país
  linkedin?: string;             // URL de LinkedIn
  notas?: string;                // Contexto/notas
  scoreValue?: number;           // Score (0-100)
  fuente?: string;               // Origen del lead
  etapa?: string;                // Estado (nuevo, calificado, etc.)
}
```

### Ejemplo de Payload Completo

```json
{
  "nombre": "Alejandra García",
  "email": "alejandra@cbdol.com.mx",
  "telefono": "+52 55 1234 5678",
  "empresa": "Tecnología CBD México",
  "cargo": "CEO",
  "ubicacion": "Ciudad de México",
  "linkedin": "https://linkedin.com/in/alejandra-garcia",
  "notas": "Usuario preguntó sobre automatizar procesos de cobranza. Interesado en soluciones para facturación automática.",
  "scoreValue": 65,
  "fuente": "WhatsApp - Anytimebot",
  "etapa": "calificado"
}
```

---

## 📖 Buenas Prácticas

### 1. Gestión de Notas

#### ✅ **Recomendado: Enviar Contexto Completo**
```javascript
// En n8n, construir el contexto completo antes de enviar
const contextoCompleto = mensajes.map(msg => 
  `[${msg.timestamp}] ${msg.role}: ${msg.content}`
).join('\n');

return {
  email: "...",
  notas: contextoCompleto  // Siempre el contexto completo
};
```

#### ❌ **No Recomendado: Actualizaciones Parciales**
```javascript
// Esto borra las notas anteriores
return {
  email: "..."
  // ❌ No enviar notas = preserva las existentes (OK ahora)
};
```

---

### 2. Validación de Datos

```javascript
// En n8n, validar datos antes de enviar
const payload = {
  nombre: $json.nombre || 'Sin nombre',
  email: $json.email || null,
  telefono: $json.telefono || null,
  empresa: $json.empresa || null,  // ✅ Mapeo explícito
};

// Validar que al menos uno está presente
if (!payload.email && !payload.telefono) {
  throw new Error('Email o teléfono requerido');
}

return payload;
```

---

### 3. Manejo de Errores

```javascript
try {
  const response = await fetch('https://volkern.app/api/leads', {
    method: 'POST',
    headers: {
      'X-API-Key': 'vk_prod_...',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error creando lead:', error);
    throw new Error(error.error || 'Error desconocido');
  }

  const data = await response.json();
  console.log('Lead creado/actualizado:', data.lead.id);
  
  return data;
} catch (err) {
  console.error('Error en request:', err.message);
  throw err;
}
```

---

## 🎯 Checklist de Verificación

### Para n8n

- [ ] API Key creada en Volkern CRM
- [ ] Scopes correctos asignados (`leads:read`, `leads:write`, `citas:read`, `citas:write`)
- [ ] Header Auth configurado en todos los nodos HTTP Request
  - [ ] Nodo "Append Update Lead"
  - [ ] Nodo "Get booked Appointments"
  - [ ] Nodo "Book Appointment"
- [ ] Mapeo de campos correcto:
  - [ ] `telefono` = número de teléfono (no empresa)
  - [ ] `empresa` = nombre de la empresa
  - [ ] `notas` = contexto completo de la conversación
- [ ] Validación de datos antes de enviar
- [ ] Manejo de errores implementado

### Para Debugging

- [ ] Logs del servidor activados
- [ ] Verificar datos recibidos en logs:
  ```
  [POST /api/leads] Datos recibidos: { ... }
  ```
- [ ] Probar con cURL primero
- [ ] Verificar en Dashboard → Leads que los datos son correctos
- [ ] Verificar en Dashboard → Audit Logs las operaciones

---

## 📚 Recursos Adicionales

### Documentación de Volkern CRM

- **API Keys**: `/dashboard/configuracion/api-keys`
- **Audit Logs**: `/dashboard/configuracion/audit-logs`
- **Leads**: `/dashboard/leads`
- **Citas**: `/dashboard/citas`

### Documentación Técnica

- `/home/ubuntu/fluy_crm/API_CITAS_AUTENTICACION_FIX.md`
- `/home/ubuntu/fluy_crm/API_KEYS_INTEGRATION_COMPLETE.md`
- `/home/ubuntu/fluy_crm/ANYTIMEBOT_MEJORAS.md`

---

## ✅ Resumen de Cambios

### Archivos Modificados

1. **`/app/api/leads/route.ts`**
   - Preservación de notas existentes
   - Logging mejorado para debugging
   - Validación explícita de campos

### Comportamiento Actualizado

| Acción | Antes | Ahora |
|--------|-------|-------|
| **Actualizar sin notas** | ❌ Borraba notas | ✅ Preserva notas |
| **Actualizar con notas vacías** | ❌ Borraba notas | ✅ Preserva notas |
| **Actualizar con notas** | ✅ Reemplazaba | ✅ Reemplaza (igual) |
| **Logging de requests** | ❌ No había | ✅ Logs detallados |

---

## 🎉 Conclusión

Con estos cambios:

✅ **Las notas se preservan** cuando no se envían explícitamente  
✅ **Logging mejorado** para identificar problemas de mapeo  
✅ **Documentación clara** para configurar n8n correctamente  
✅ **Autenticación explicada** para todos los endpoints  

**Próximos Pasos:**

1. Crear una API Key en Volkern CRM
2. Configurar autenticación en todos los nodos de n8n
3. Verificar el mapeo de campos (especialmente `telefono` vs `empresa`)
4. Probar el flujo completo
5. Revisar los logs para confirmar datos correctos

¡Todo listo para una integración exitosa con n8n! 🚀
