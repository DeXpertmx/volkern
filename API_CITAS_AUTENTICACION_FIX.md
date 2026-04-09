# 🔐 Fix: Autenticación Dual para API de Citas

## 📋 Resumen del Problema

El usuario reportó que al intentar obtener citas disponibles desde n8n y crear citas programáticamente, se encontraban con dos problemas:

1. **Error de Autenticación en GET /api/citas**: "Authorization failed - Missing Authorization header"
2. **Citas no se creaban**: Aunque n8n mostraba "Success", las citas no aparecían en el sistema

### 🔍 Causa Raíz

Los endpoints `/api/citas` (GET y POST) **NO tenían autenticación implementada**:
- No verificaban sesión de usuario
- No aceptaban API Keys
- No filtraban por tenant

Esto causaba:
- ❌ Bloqueo por middleware de Next.js
- ❌ Acceso no autorizado
- ❌ Falta de auditoría
- ❌ Riesgo de seguridad (cualquiera podía ver/crear citas)

---

## ✅ Solución Implementada

### 1. **Autenticación Dual en GET /api/citas**

Se agregó soporte para:
- ✅ Sesión de usuario (NextAuth)
- ✅ API Keys con scope `citas:read`
- ✅ Filtrado automático por tenant
- ✅ Validación de permisos

**Cambios:**
```typescript
// Antes
export async function GET(request: NextRequest) {
  const citas = await prisma.cita.findMany({
    // Sin filtro de tenant
  })
  return NextResponse.json(citas)
}

// Ahora
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ['citas:read'])
  
  if (!auth.valid || !auth.tenant) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const citas = await prisma.cita.findMany({
    where: {
      tenantId: auth.tenant.id  // ✅ Filtrado por tenant
    }
  })
  return NextResponse.json(citas)
}
```

---

### 2. **Autenticación Dual en POST /api/citas**

Se agregó soporte para:
- ✅ Sesión de usuario (NextAuth)
- ✅ API Keys con scopes `citas:write` o `citas:create`
- ✅ Validación de tenant en lead
- ✅ Audit logging
- ✅ Distinción de origen (API vs UI)

**Cambios:**
```typescript
// Ahora
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, ['citas:write', 'citas:create'])
  
  if (!auth.valid || !auth.tenant || !auth.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Validar que el lead pertenece al tenant
  const lead = await prisma.lead.findFirst({ 
    where: { 
      id: leadId,
      tenantId: auth.tenant.id  // ✅ Seguridad tenant
    } 
  })

  // Crear cita con tenantId
  const cita = await prisma.cita.create({
    data: {
      ...citaData,
      tenantId: auth.tenant.id  // ✅ Asignación correcta
    }
  })

  // ✅ Audit Log
  await prisma.auditLog.create({
    data: {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      accion: 'CREATE',
      entidad: 'Cita',
      entidadId: cita.id,
      descripcion: auth.authMethod === 'apikey' 
        ? `Cita creada vía API por ${auth.user.name}`
        : `Cita creada por ${auth.user.name}`
    }
  })

  return NextResponse.json({ success: true, cita })
}
```

---

### 3. **Nuevos Scopes de API Keys**

Se agregaron a `lib/api-keys.ts`:

```typescript
export const AVAILABLE_SCOPES = [
  // ... otros scopes ...
  
  // Appointments / Citas
  'citas:read',     // Ver citas
  'citas:write',    // Modificar citas
  'citas:create',   // Crear citas
  'citas:delete',   // Eliminar citas
]
```

---

## 🔧 Configuración en n8n

### Paso 1: Crear API Key en Volkern

1. Ve a **Dashboard → Configuración → API Keys**
2. Haz clic en **"Generar Nueva API Key"**
3. Configura:
   - **Nombre**: "n8n Anytimebot Integration"
   - **Descripción**: "API Key para gestión de citas desde n8n"
   - **Scopes**: Marca los siguientes permisos:
     - ✅ `leads:read`
     - ✅ `leads:write`
     - ✅ `citas:read`
     - ✅ `citas:write`
     - ✅ `citas:create`
4. Haz clic en **"Crear API Key"**
5. **⚠️ IMPORTANTE**: Copia la API Key completa ahora, NO se volverá a mostrar
   ```
   vk_prod_a1b2c3d4e5f6...
   ```

---

### Paso 2: Configurar Credenciales en n8n

#### Opción A: Header Auth (Recomendado)

1. En n8n, crea un nuevo **Credential**
2. Tipo: **Header Auth**
3. Configuración:
   ```
   Name: X-API-Key
   Value: vk_prod_a1b2c3d4e5f6...
   ```
4. Guarda como "Volkern API Key"

#### Opción B: Generic Credential Type

1. Tipo: **Generic Credential Type**
2. Configuración:
   ```json
   {
     "authorization": "Bearer vk_prod_a1b2c3d4e5f6..."
   }
   ```

---

### Paso 3: Obtener Citas Disponibles (GET)

#### Nodo HTTP Request - Listar Citas

```yaml
Method: GET
URL: https://volkern.app/api/citas

Authentication: Header Auth
  Credential: [Seleccionar "Volkern API Key"]

Query Parameters:
  - estado: pendiente        (opcional)
  - tipo: reunion            (opcional)
  - fechaInicio: 2025-11-01  (opcional)
  - fechaFin: 2025-11-30     (opcional)
```

**Ejemplo cURL:**
```bash
curl -X GET "https://volkern.app/api/citas?estado=pendiente&fechaInicio=2025-11-01" \
  -H "X-API-Key: vk_prod_a1b2c3d4e5f6..."
```

**Respuesta:**
```json
[
  {
    "id": "clxxx123",
    "leadId": "clyyy456",
    "tipo": "reunion",
    "titulo": "Consultoría 1:1",
    "fechaHora": "2025-11-05T14:00:00Z",
    "duracion": 60,
    "estado": "pendiente",
    "lead": {
      "nombre": "Alejandra",
      "email": "hola@cbdol.com.mx"
    }
  }
]
```

---

### Paso 4: Crear Cita (POST)

#### Nodo HTTP Request - Book Appointment

```yaml
Method: POST
URL: https://volkern.app/api/citas

Authentication: Header Auth
  Credential: [Seleccionar "Volkern API Key"]

Send Body: Yes
Body Content Type: JSON

Body:
{
  "leadId": "{{$json.lead.id}}",
  "tipo": "reunion",
  "titulo": "Diagnóstico de automatización",
  "descripcion": "Reunión agendada desde Anytimebot",
  "fechaHora": "2025-11-27T10:00:00Z",
  "duracion": 20,
  "estado": "pendiente",
  "linkReunion": "https://meet.google.com/abc-defg-hij"
}
```

**Ejemplo cURL:**
```bash
curl -X POST "https://volkern.app/api/citas" \
  -H "X-API-Key: vk_prod_a1b2c3d4e5f6..." \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "clyyy456",
    "tipo": "llamada",
    "titulo": "Seguimiento Lead",
    "fechaHora": "2025-11-28T11:00:00Z",
    "duracion": 30
  }'
```

**Respuesta:**
```json
{
  "success": true,
  "cita": {
    "id": "clzzz789",
    "leadId": "clyyy456",
    "tenantId": "clxxx001",
    "tipo": "llamada",
    "titulo": "Seguimiento Lead",
    "fechaHora": "2025-11-28T11:00:00.000Z",
    "duracion": 30,
    "estado": "pendiente",
    "createdAt": "2025-11-26T..."
  }
}
```

---

## 🔄 Flujo Completo en n8n

### Escenario: Agendar Cita desde Conversación Anytimebot

```
1. [When chat message received] (Webhook Trigger)
   ↓
2. [OpenRouter Chat Model] (Procesar intención)
   ↓
3. [Append Update Lead Volkern] (Crear/actualizar lead)
   → POST /api/leads
   → Retorna: { lead: { id: "clyyy456" } }
   ↓
4. [Get booked Appointments] (Ver disponibilidad)
   → GET /api/citas?fechaInicio=2025-11-27
   → Header: X-API-Key: vk_prod_...
   ↓
5. [Code] (Verificar horarios disponibles)
   ↓
6. [Book Appointment] (Crear cita)
   → POST /api/citas
   → Body: { leadId: "{{$node["Append Update Lead"].json.lead.id}}", ... }
   → Header: X-API-Key: vk_prod_...
   ↓
7. [Send message in Gmail] (Confirmar por email)
```

---

## 🔐 Seguridad y Mejores Prácticas

### ✅ Implementado

- **Autenticación Dual**: Sesión + API Keys
- **Validación de Tenant**: Todas las operaciones filtran por tenant
- **Audit Logging**: Todas las creaciones quedan registradas
- **Scope Granular**: Permisos específicos (read, write, create, delete)
- **Validación de Lead**: Verifica que el lead pertenezca al tenant

### 🛡️ Recomendaciones

1. **Rotar API Keys periódicamente** (cada 90 días)
2. **Usar HTTPS siempre** (ya implementado en volkern.app)
3. **No compartir API Keys** en código público
4. **Monitorear Audit Logs** para detectar uso inusual
5. **Usar scopes mínimos** necesarios por integración

---

## 📊 Verificación

### Test 1: GET Citas con API Key

```bash
curl -X GET "https://volkern.app/api/citas" \
  -H "X-API-Key: vk_prod_TU_API_KEY"
```

**Esperado:**
- ✅ Status 200
- ✅ Array de citas del tenant
- ✅ Filtrado automático por tenant

**Si falla:**
- ❌ Status 401: API Key inválida o expirada
- ❌ Status 403: Falta scope `citas:read`

---

### Test 2: POST Cita con API Key

```bash
curl -X POST "https://volkern.app/api/citas" \
  -H "X-API-Key: vk_prod_TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "LEAD_ID_VALIDO",
    "tipo": "reunion",
    "titulo": "Test desde API",
    "fechaHora": "2025-12-01T14:00:00Z",
    "duracion": 30
  }'
```

**Esperado:**
- ✅ Status 200
- ✅ Respuesta: `{ "success": true, "cita": {...} }`
- ✅ Cita visible en Dashboard → Citas
- ✅ Registro en Audit Log

**Si falla:**
- ❌ Status 400: Falta `leadId` o `fechaHora`
- ❌ Status 401: API Key inválida
- ❌ Status 403: Falta scope `citas:write` o `citas:create`
- ❌ Status 404: Lead no encontrado o no pertenece al tenant

---

## 🆚 Comparación: Antes vs Ahora

| Aspecto | Antes ❌ | Ahora ✅ |
|---------|----------|----------|
| **Autenticación GET** | Sin autenticación | Dual (Session + API Key) |
| **Autenticación POST** | Sin autenticación | Dual (Session + API Key) |
| **Filtrado por Tenant** | No | Sí, automático |
| **Scopes API Keys** | N/A | `citas:read`, `citas:write`, `citas:create` |
| **Audit Logging** | No | Sí, con origen (API/UI) |
| **Validación Lead** | findUnique | findFirst + tenantId |
| **Seguridad** | Riesgo alto | Segura y auditable |
| **n8n Integration** | No funciona | ✅ Funcional |

---

## 📝 Archivos Modificados

### Backend
1. **`/app/api/citas/route.ts`**
   - Agregado `authenticateRequest` en GET y POST
   - Filtrado por tenant en queries
   - Validación de lead ownership
   - Audit logging

2. **`/lib/api-keys.ts`**
   - Agregados scopes: `citas:read`, `citas:write`, `citas:create`, `citas:delete`

---

## 🎯 Próximos Pasos Recomendados

### Fase 1 (Implementado ✅)
- ✅ Autenticación dual en `/api/citas` GET/POST
- ✅ Scopes de API Keys
- ✅ Filtrado por tenant
- ✅ Audit logging

### Fase 2 (Futuro)
- 🔜 Rate limiting por API Key
- 🔜 Webhooks para eventos de citas
- 🔜 Endpoint para actualizar citas (PUT/PATCH)
- 🔜 Endpoint para cancelar citas
- 🔜 Filtros avanzados (por lead, por servicio)
- 🔜 Paginación en GET

---

## 📞 Soporte

Si tienes problemas:

1. **Verifica tu API Key** en Dashboard → Configuración → API Keys
2. **Revisa los scopes** requeridos
3. **Consulta Audit Logs** para ver qué está fallando
4. **Prueba con cURL** antes de configurar n8n

---

## ✅ Checklist de Implementación

- [x] Autenticación dual en GET `/api/citas`
- [x] Autenticación dual en POST `/api/citas`
- [x] Filtrado por tenant
- [x] Validación de lead ownership
- [x] Audit logging con origen (API/UI)
- [x] Scopes de API Keys agregados
- [x] Compilación exitosa
- [x] Checkpoint guardado
- [x] Documentación completa

---

¡Todo listo para usar la API de Citas desde n8n y otras herramientas! 🎉
