# ✅ Integración Completa de API Keys en Endpoints REST

## 📋 Resumen

Los endpoints de Volkern CRM ahora soportan **autenticación dual**: pueden autenticarse tanto con **sesión de usuario** (cookies de NextAuth) como con **API Keys** (headers HTTP).

Esto permite que herramientas externas como **n8n**, **Make**, **Zapier**, **Postman**, o cualquier script personalizado puedan interactuar con el CRM de forma segura y programática.

---

## 🔑 ¿Qué Cambió?

### Antes
- ❌ Los endpoints solo aceptaban autenticación por sesión (cookies)
- ❌ No se podían hacer llamadas desde herramientas externas
- ❌ Error "No autorizado" al usar API Keys

### Ahora
- ✅ Autenticación dual: sesión **O** API Key
- ✅ Soporte completo para integraciones externas
- ✅ Validación de scopes y permisos por API Key
- ✅ Auditoría diferenciada (indica cuándo se usó API vs sesión)

---

## 🛠️ Implementación Técnica

### 1. Nueva Función: `authenticateRequest()`

**Ubicación**: `/lib/api-key-auth.ts`

```typescript
export async function authenticateRequest(
  request: Request,
  requiredScopes?: string[]
): Promise<ApiKeyAuthResult>
```

**Lógica**:
1. Intenta autenticar con sesión (NextAuth)
2. Si no hay sesión, intenta con API Key (headers)
3. Valida scopes requeridos
4. Retorna información del tenant, usuario y método de autenticación

**Ejemplo de uso en endpoint**:
```typescript
import { authenticateRequest } from '@/lib/api-key-auth'

export async function GET(request: NextRequest) {
  // Autenticación dual
  const auth = await authenticateRequest(request, ['leads:read'])
  
  if (!auth.valid || !auth.user || !auth.tenant) {
    return NextResponse.json({ 
      error: auth.error || 'No autorizado' 
    }, { status: 401 })
  }

  // auth.authMethod indica 'session' o 'apikey'
  // auth.user contiene la información del usuario
  // auth.tenant contiene la información del tenant
}
```

---

### 2. Endpoints Actualizados

#### `/api/leads` (GET y POST)

**Scopes requeridos**:
- GET: `leads:read`
- POST: `leads:write` o `leads:create`

**Características**:
- ✅ Autenticación dual
- ✅ Filtrado por tenant (multi-tenancy seguro)
- ✅ Permisos de rol para sesiones
- ✅ Scopes de API key para API keys
- ✅ Audit log diferenciado (indica "vía API" cuando se usa API key)

**Ejemplo de uso con cURL**:
```bash
# Listar leads
curl -X GET "https://volkern.app/api/leads" \
  -H "X-API-Key: vk_prod_c357f638d635673cdafe8336c2c3fcd063a32d35de189fcb221923f6f14caf76"

# Crear lead
curl -X POST "https://volkern.app/api/leads" \
  -H "X-API-Key: vk_prod_c357f638d635673cdafe8336c2c3fcd063a32d35de189fcb221923f6f14caf76" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "telefono": "+52 55 1234 5678",
    "notas": "Lead desde n8n"
  }'
```

---

## 🔐 Autenticación con API Keys

### Método 1: Header `X-API-Key` (Recomendado)

```bash
curl -H "X-API-Key: vk_prod_xxxxx..." https://volkern.app/api/leads
```

### Método 2: Header `Authorization: Bearer`

```bash
curl -H "Authorization: Bearer vk_prod_xxxxx..." https://volkern.app/api/leads
```

---

## 🎯 Scopes Disponibles

### Leads
- `leads:read` - Ver leads
- `leads:write` - Editar leads
- `leads:create` - Crear leads
- `leads:delete` - Eliminar leads

### Contacts
- `contacts:read`
- `contacts:write`
- `contacts:create`
- `contacts:delete`

### Deals
- `deals:read`
- `deals:write`
- `deals:create`
- `deals:delete`

### Messages
- `messages:read`
- `messages:send`

### Tasks
- `tasks:read`
- `tasks:write`
- `tasks:create`
- `tasks:delete`

### Webhooks
- `webhooks:manage`

---

## 🧪 Pruebas

### Test 1: Listar Leads (GET)

**n8n - HTTP Request Node**:
```
Method: GET
URL: https://volkern.app/api/leads
Authentication: None
Headers:
  X-API-Key: vk_prod_c357f638d635673cdafe8336c2c3fcd063a32d35de189fcb221923f6f14caf76
```

**Respuesta Exitosa (200)**:
```json
[
  {
    "id": "clxxx...",
    "nombre": "Juan Pérez",
    "email": "juan@example.com",
    "telefono": "+52 55 1234 5678",
    "estado": "nuevo",
    "fechaCreacion": "2024-11-25T10:30:00Z",
    "tenantId": "tenant_xxx"
  }
]
```

### Test 2: Crear Lead (POST)

**n8n - HTTP Request Node**:
```
Method: POST
URL: https://volkern.app/api/leads
Authentication: None
Headers:
  X-API-Key: vk_prod_c357f638d635673cdafe8336c2c3fcd063a32d35de189fcb221923f6f14caf76
  Content-Type: application/json
Body (JSON):
{
  "nombre": "María García",
  "email": "maria@example.com",
  "telefono": "+52 55 9876 5432",
  "notas": "Lead capturado desde n8n"
}
```

**Respuesta Exitosa (200)**:
```json
{
  "id": "clyyy...",
  "nombre": "María García",
  "email": "maria@example.com",
  "telefono": "+52 55 9876 5432",
  "estado": "nuevo",
  "tenantId": "tenant_xxx",
  "fechaCreacion": "2024-11-25T14:15:00Z"
}
```

---

## ❌ Errores Comunes y Soluciones

### 1. "No autorizado" (401)

**Causa**: API Key no proporcionada o inválida

**Solución**:
1. Verifica que el header esté correctamente formado:
   ```
   X-API-Key: vk_prod_xxxxx...
   ```
2. Asegúrate de que la API Key sea válida y esté activa
3. Verifica que no esté expirada

### 2. "Permisos insuficientes" (403)

**Causa**: La API Key no tiene los scopes necesarios

**Solución**:
1. Ve a **Dashboard → Configuración → API Keys**
2. Edita la API Key
3. Agrega los scopes necesarios (ej: `leads:read`, `leads:write`)
4. Guarda los cambios

### 3. "API key inválida o revocada"

**Causa**: La API Key fue eliminada o desactivada

**Solución**:
1. Genera una nueva API Key en el dashboard
2. Actualiza tu herramienta (n8n, Make, etc.) con la nueva key

---

## 🔒 Seguridad

### Buenas Prácticas

1. **Nunca expongas tu API Key** en código público o repositorios
2. **Usa scopes mínimos**: Solo otorga los permisos necesarios
3. **Rota las keys regularmente**: Genera nuevas keys cada 3-6 meses
4. **Usa HTTPS siempre**: Volkern ya usa HTTPS por defecto
5. **Monitorea el uso**: Revisa el "Último Uso" y "Total de Usos" en el dashboard

### Almacenamiento Seguro

**n8n**: Usa variables de entorno o credentials
**Make**: Usa "Connections" para almacenar keys
**Zapier**: Usa "App Credentials" o "API Keys"
**Scripts locales**: Usa variables de entorno (`.env`)

```bash
# .env
VOLKERN_API_KEY=vk_prod_xxxxx...
```

---

## 📊 Audit Log

Cuando se usa una API Key, el audit log registra:

```
Bruno Urrea creó el lead Juan Pérez (vía API)
```

Esto permite diferenciar acciones manuales de acciones automáticas.

---

## 🚀 Próximos Pasos

### Endpoints Pendientes de Actualización

Los siguientes endpoints se actualizarán en futuras versiones:
- ✅ `/api/leads` (GET, POST) - **Completado**
- ⏳ `/api/contacts` (GET, POST, PUT)
- ⏳ `/api/deals` (GET, POST, PUT)
- ⏳ `/api/mensajes` (GET, POST)
- ⏳ `/api/tasks` (GET, POST, PUT)

---

## 📝 Documentación Adicional

Para más detalles sobre el sistema de API Keys, consulta:
- **`API_KEYS_SYSTEM_GUIDE.md`** - Guía completa del sistema
- **Dashboard → Configuración → API Keys** - Gestión de keys en la UI
- **Dashboard → Integraciones → API Keys** - Acceso rápido

---

## ✅ Checklist de Verificación

- [x] Función `authenticateRequest()` creada
- [x] Endpoint `/api/leads` actualizado (GET)
- [x] Endpoint `/api/leads` actualizado (POST)
- [x] Validación de scopes implementada
- [x] Audit log diferenciado
- [x] Pruebas con n8n exitosas
- [x] Documentación actualizada
- [x] Checkpoint guardado

---

## 🎉 ¡Listo para Usar!

Ahora puedes usar tus API Keys desde n8n, Make, Zapier o cualquier herramienta HTTP:

1. Ve a **Dashboard → Configuración → API Keys**
2. Crea una nueva API Key con los scopes `leads:read` y `leads:write`
3. Copia la key (solo se muestra una vez)
4. Configura tu herramienta externa con:
   - URL: `https://volkern.app/api/leads`
   - Header: `X-API-Key: tu_key_aqui`
5. ¡Empieza a automatizar!

---

**Fecha**: 25 de Noviembre, 2024  
**Versión**: 1.0  
**Estado**: ✅ Implementado y Probado
