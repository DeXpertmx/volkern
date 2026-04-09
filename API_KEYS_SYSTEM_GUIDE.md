# 🔐 Sistema de API Keys - Volkern CRM

## Resumen

Se ha implementado un sistema completo de API Keys que permite a los usuarios del CRM crear claves de API personalizadas para integrar Volkern CRM con herramientas externas (n8n, Zapier, Make, aplicaciones personalizadas, etc.).

---

## ✅ Características Implementadas

### 1. 📊 Modelo de Base de Datos

**Archivo:** `/prisma/schema.prisma`

Se agregó el modelo `ApiKey` con los siguientes campos:

```prisma
model ApiKey {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String
  
  // Información básica
  nombre      String
  descripcion String?  @db.Text
  keyHash     String   @unique // SHA256 hash
  prefix      String   // Primeros caracteres (vk_prod_12345678)
  
  // Scopes y permisos
  scopes      String[] @default([])
  
  // Estado y validez
  activo      Boolean  @default(true)
  expiraEn    DateTime?
  ultimoUso   DateTime?
  
  // Estadísticas
  totalUsos   Int      @default(0)
  
  // Timestamps y relaciones
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tenant      Tenant   @relation(...)
  user        User     @relation(...)
}
```

### 2. 🔑 Generación y Validación de Keys

**Archivo:** `/lib/api-keys.ts`

Funciones principales:

#### `generateApiKey()`
- Genera keys con formato: `vk_prod_[64 caracteres hex]`
- Usa crypto.randomBytes(32) para seguridad
- Retorna: `{ key, keyHash, prefix }`

#### `hashApiKey(key)`
- Genera SHA256 hash para almacenamiento seguro
- Las keys nunca se guardan en texto plano

#### `isValidApiKeyFormat(key)`
- Valida formato con regex: `/^vk_prod_[0-9a-f]{64}$/i`

#### `AVAILABLE_SCOPES`
Scopes disponibles organizados por módulo:

```typescript
[
  // Leads
  'leads:read', 'leads:write', 'leads:delete',
  
  // Contacts
  'contacts:read', 'contacts:write', 'contacts:delete',
  
  // Deals
  'deals:read', 'deals:write', 'deals:delete',
  
  // Messages
  'messages:read', 'messages:write',
  
  // Tasks
  'tasks:read', 'tasks:write', 'tasks:delete',
  
  // Automations
  'automations:read', 'automations:write', 'automations:delete',
  
  // Appointments
  'appointments:read', 'appointments:write', 'appointments:delete',
  
  // Campaigns
  'campaigns:read', 'campaigns:write',
  
  // Analytics
  'analytics:read',
  
  // Webhooks
  'webhooks:read', 'webhooks:write', 'webhooks:delete'
]
```

#### `extractApiKeyFromRequest(request)`
Soporta dos formatos de autenticación:
- Header `X-API-Key: vk_prod_...`
- Header `Authorization: Bearer vk_prod_...`

### 3. 🛡️ Middleware de Autenticación

**Archivo:** `/lib/api-key-auth.ts`

#### `validateApiKey(request, requiredScopes?)`

Proceso de validación:
1. ✅ Extrae la API key del header
2. ✅ Valida formato
3. ✅ Busca en base de datos por hash
4. ✅ Verifica estado activo
5. ✅ Verifica expiración
6. ✅ Verifica estado del tenant
7. ✅ Valida scopes requeridos
8. ✅ Actualiza estadísticas de uso

Retorna:
```typescript
{
  valid: boolean,
  tenant?: { id, nombre, slug, plan },
  user?: { id, name, email },
  apiKey?: { id, nombre, scopes },
  error?: string
}
```

### 4. 🔌 Endpoints API

#### `/api/api-keys` (GET, POST)

**GET** - Listar API keys del tenant
```bash
curl -X GET https://volkern.app/api/api-keys \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json"
```

**POST** - Crear nueva API key
```bash
curl -X POST https://volkern.app/api/api-keys \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Integración n8n",
    "descripcion": "Key para automatizaciones con n8n",
    "scopes": ["leads:read", "leads:write", "contacts:read"],
    "expiraEn": "2025-12-31T23:59:59Z"
  }'
```

Respuesta:
```json
{
  "success": true,
  "apiKey": {
    "id": "clx...",
    "nombre": "Integración n8n",
    "key": "vk_prod_1234567890abcdef...",
    "prefix": "vk_prod_12345678",
    "scopes": ["leads:read", "leads:write", "contacts:read"],
    "activo": true,
    "expiraEn": "2025-12-31T23:59:59.000Z",
    "createdAt": "2024-11-25T13:00:00.000Z"
  },
  "warning": "Guarda esta API key en un lugar seguro. No podrás verla de nuevo."
}
```

#### `/api/api-keys/[id]` (GET, PUT, DELETE)

**PUT** - Actualizar API key
```bash
curl -X PUT https://volkern.app/api/api-keys/clx123 \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Integración n8n (Actualizada)",
    "scopes": ["leads:read", "leads:write"],
    "activo": false
  }'
```

**DELETE** - Eliminar API key
```bash
curl -X DELETE https://volkern.app/api/api-keys/clx123 \
  -H "Cookie: next-auth.session-token=..."
```

### 5. 🎨 Interfaz de Usuario

**Archivo:** `/app/dashboard/configuracion/api-keys/page.tsx`

Funcionalidades de la UI:

#### Página Principal
- ✅ Lista de todas las API keys configuradas
- ✅ Estados visuales (activa/inactiva/expirada)
- ✅ Métricas por key (total usos, último uso, fecha de expiración)
- ✅ Badges de permisos asignados
- ✅ Acciones rápidas (activar/desactivar, eliminar, copiar prefix)

#### Creación de API Key
- ✅ Formulario modal completo
- ✅ Campo de nombre (requerido)
- ✅ Campo de descripción (opcional)
- ✅ Selector de fecha de expiración (opcional)
- ✅ Selector de scopes con checkboxes agrupados por módulo
- ✅ Botones "Seleccionar Todos" / "Limpiar"
- ✅ Contador de scopes seleccionados
- ✅ Advertencia de seguridad

#### Visualización de Nueva Key
- ✅ Dialog especial para mostrar la key completa (solo una vez)
- ✅ Campo con toggle mostrar/ocultar
- ✅ Botón de copiar al portapapeles
- ✅ Ejemplo de uso con cURL
- ✅ Advertencia clara de que no se podrá ver de nuevo

#### Documentación Integrada
- ✅ Card con ejemplos de autenticación
- ✅ Ejemplos de cURL para ambos métodos (X-API-Key y Bearer)
- ✅ Lista de endpoints disponibles

---

## 📖 Guía de Uso para Usuarios

### Paso 1: Crear una API Key

1. Navega a **Dashboard → Configuración → API Keys**
2. Haz clic en **"Nueva API Key"**
3. Completa el formulario:
   - **Nombre:** Identificador descriptivo (ej: "Integración n8n")
   - **Descripción:** Notas sobre el uso (opcional)
   - **Fecha de Expiración:** Cuando la key dejará de funcionar (opcional)
   - **Permisos:** Selecciona los scopes necesarios

4. Haz clic en **"Crear API Key"**
5. **⚠️ IMPORTANTE:** Copia la key completa inmediatamente
   - Se mostrará solo una vez
   - Guárdala en un gestor de contraseñas o lugar seguro

### Paso 2: Usar la API Key

#### Opción 1: Header X-API-Key (Recomendado)

```bash
curl -X GET https://volkern.app/api/leads \
  -H "X-API-Key: vk_prod_tu_clave_aqui" \
  -H "Content-Type: application/json"
```

#### Opción 2: Authorization Bearer

```bash
curl -X GET https://volkern.app/api/leads \
  -H "Authorization: Bearer vk_prod_tu_clave_aqui" \
  -H "Content-Type: application/json"
```

### Paso 3: Gestionar API Keys

- **Desactivar temporalmente:** Botón de toggle en la lista
- **Ver estadísticas:** Total de usos y último uso
- **Eliminar permanentemente:** Botón de eliminar (requiere confirmación)

---

## 🔧 Ejemplos de Integración

### n8n

#### Webhook con Autenticación

1. En n8n, crea un nodo **HTTP Request**
2. Configura:
   - **Method:** GET/POST
   - **URL:** `https://volkern.app/api/leads`
   - **Authentication:** Header Auth
   - **Header Name:** `X-API-Key`
   - **Header Value:** `vk_prod_tu_clave_aqui`

#### Crear Lead desde n8n

```json
// Nodo HTTP Request - POST
{
  "method": "POST",
  "url": "https://volkern.app/api/leads",
  "headers": {
    "X-API-Key": "vk_prod_tu_clave_aqui",
    "Content-Type": "application/json"
  },
  "body": {
    "nombre": "{{$json.nombre}}",
    "email": "{{$json.email}}",
    "telefono": "{{$json.telefono}}",
    "estado": "nuevo"
  }
}
```

### Make (Integromat)

1. Usa el módulo **HTTP - Make a Request**
2. Configura:
   - **URL:** `https://volkern.app/api/leads`
   - **Method:** GET/POST
   - **Headers:**
     - `X-API-Key: vk_prod_tu_clave_aqui`
     - `Content-Type: application/json`

### Zapier

1. Usa la acción **Webhooks by Zapier**
2. Configura:
   - **Event:** Custom Request
   - **URL:** `https://volkern.app/api/leads`
   - **Method:** GET/POST
   - **Headers:**
     - `X-API-Key: vk_prod_tu_clave_aqui`

### JavaScript/TypeScript

```typescript
const VOLKERN_API_KEY = 'vk_prod_tu_clave_aqui';

async function crearLead(datos) {
  const response = await fetch('https://volkern.app/api/leads', {
    method: 'POST',
    headers: {
      'X-API-Key': VOLKERN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(datos)
  });
  
  const result = await response.json();
  return result;
}

// Uso
const nuevoLead = await crearLead({
  nombre: 'Juan Pérez',
  email: 'juan@example.com',
  telefono: '+52 55 1234 5678',
  estado: 'nuevo'
});
```

### Python

```python
import requests

VOLKERN_API_KEY = 'vk_prod_tu_clave_aqui'
BASE_URL = 'https://volkern.app/api'

def crear_lead(datos):
    headers = {
        'X-API-Key': VOLKERN_API_KEY,
        'Content-Type': 'application/json'
    }
    
    response = requests.post(
        f'{BASE_URL}/leads',
        json=datos,
        headers=headers
    )
    
    return response.json()

# Uso
nuevo_lead = crear_lead({
    'nombre': 'Juan Pérez',
    'email': 'juan@example.com',
    'telefono': '+52 55 1234 5678',
    'estado': 'nuevo'
})
```

---

## 🔒 Seguridad

### Buenas Prácticas

1. **Nunca expongas las API keys en código público**
   - Usa variables de entorno
   - No las incluyas en repositorios git

2. **Usa scopes mínimos necesarios**
   - Principio de menor privilegio
   - Solo otorga los permisos que realmente necesitas

3. **Rota las keys periódicamente**
   - Especialmente para integraciones críticas
   - Usa fechas de expiración

4. **Desactiva keys no utilizadas**
   - En lugar de eliminarlas inmediatamente
   - Verifica que no rompan integraciones

5. **Monitorea el uso**
   - Revisa estadísticas regularmente
   - Detecta actividad sospechosa

### Almacenamiento Seguro

#### Variables de Entorno (.env)
```bash
VOLKERN_API_KEY=vk_prod_tu_clave_aqui
```

#### GitHub Secrets (CI/CD)
```yaml
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy
        env:
          VOLKERN_API_KEY: ${{ secrets.VOLKERN_API_KEY }}
        run: ./deploy.sh
```

#### Gestores de Contraseñas
- 1Password
- LastPass
- Bitwarden

---

## 📊 Endpoints Disponibles

### Leads

| Endpoint | Método | Scope | Descripción |
|----------|--------|-------|-------------|
| `/api/leads` | GET | `leads:read` | Listar leads |
| `/api/leads` | POST | `leads:write` | Crear lead |
| `/api/leads/[id]` | GET | `leads:read` | Obtener lead |
| `/api/leads/[id]` | PUT | `leads:write` | Actualizar lead |
| `/api/leads/[id]` | DELETE | `leads:delete` | Eliminar lead |

### Contacts

| Endpoint | Método | Scope | Descripción |
|----------|--------|-------|-------------|
| `/api/contacts` | GET | `contacts:read` | Listar contactos |
| `/api/contacts` | POST | `contacts:write` | Crear contacto |
| `/api/contacts/[id]` | GET | `contacts:read` | Obtener contacto |
| `/api/contacts/[id]` | PUT | `contacts:write` | Actualizar contacto |
| `/api/contacts/[id]` | DELETE | `contacts:delete` | Eliminar contacto |

### Deals

| Endpoint | Método | Scope | Descripción |
|----------|--------|-------|-------------|
| `/api/deals` | GET | `deals:read` | Listar deals |
| `/api/deals` | POST | `deals:write` | Crear deal |
| `/api/deals/[id]` | GET | `deals:read` | Obtener deal |
| `/api/deals/[id]` | PUT | `deals:write` | Actualizar deal |
| `/api/deals/[id]` | DELETE | `deals:delete` | Eliminar deal |

### Messages

| Endpoint | Método | Scope | Descripción |
|----------|--------|-------|-------------|
| `/api/mensajes/conversaciones` | GET | `messages:read` | Listar conversaciones |
| `/api/mensajes/enviar` | POST | `messages:write` | Enviar mensaje |

### Tasks

| Endpoint | Método | Scope | Descripción |
|----------|--------|-------|-------------|
| `/api/tasks` | GET | `tasks:read` | Listar tareas |
| `/api/tasks` | POST | `tasks:write` | Crear tarea |
| `/api/tasks/[id]` | PUT | `tasks:write` | Actualizar tarea |
| `/api/tasks/[id]` | DELETE | `tasks:delete` | Eliminar tarea |

### Webhooks

| Endpoint | Método | Scope | Descripción |
|----------|--------|-------|-------------|
| `/api/webhooks/incoming` | GET | `webhooks:read` | Listar webhooks entrantes |
| `/api/webhooks/incoming` | POST | `webhooks:write` | Crear webhook entrante |
| `/api/webhooks/outgoing` | GET | `webhooks:read` | Listar webhooks salientes |
| `/api/webhooks/outgoing` | POST | `webhooks:write` | Crear webhook saliente |

---

## 🐛 Troubleshooting

### Error: "API key no proporcionada"

**Causa:** No se envió el header de autenticación

**Solución:**
```bash
# ✅ Correcto
curl -H "X-API-Key: vk_prod_..." https://volkern.app/api/leads

# ❌ Incorrecto (sin header)
curl https://volkern.app/api/leads
```

### Error: "Formato de API key inválido"

**Causa:** La key no cumple el formato esperado

**Verificar:**
- Debe empezar con `vk_prod_`
- Debe tener 64 caracteres hexadecimales después del prefijo
- No debe tener espacios o saltos de línea

### Error: "API key inválida o revocada"

**Causas posibles:**
1. La key fue eliminada
2. La key fue desactivada
3. Se copió incorrectamente

**Solución:**
- Verifica en el dashboard el estado de la key
- Crea una nueva key si es necesario

### Error: "API key expirada"

**Causa:** La fecha de expiración ha pasado

**Solución:**
- Elimina la key expirada
- Crea una nueva key
- Actualiza tus integraciones con la nueva key

### Error: "Permisos insuficientes"

**Causa:** La key no tiene los scopes necesarios

**Solución:**
1. Identifica qué scope falta en el mensaje de error
2. Crea una nueva key con los scopes necesarios
3. O actualiza la key existente (próxima feature)

### Error: "Cuenta suspendida o cancelada"

**Causa:** El tenant no está activo

**Solución:**
- Verifica el estado de la suscripción
- Contacta al administrador de la cuenta

---

## 📈 Métricas y KPIs

### Por API Key
- Total de usos
- Último uso
- Promedio de usos por día
- Tasa de errores

### Por Tenant
- Total de API keys activas
- Total de requests por API key
- Endpoints más utilizados
- Errores por tipo

---

## 🚀 Próximas Mejoras (Futuras)

### Fase 2
- [ ] Rate limiting configurable por key
- [ ] Webhooks para notificar uso sospechoso
- [ ] Logs detallados de cada request
- [ ] Filtros por IP permitidas
- [ ] Scopes más granulares
- [ ] Edición de scopes de keys existentes

### Fase 3
- [ ] Dashboard de analytics por API key
- [ ] Alertas de uso excesivo
- [ ] Rotación automática de keys
- [ ] Múltiples keys por integración (activa/backup)
- [ ] Gestión de keys a nivel de organización

---

## ✅ Checklist de Implementación

- ✅ Modelo `ApiKey` en schema de Prisma
- ✅ Funciones de generación y validación (`/lib/api-keys.ts`)
- ✅ Middleware de autenticación (`/lib/api-key-auth.ts`)
- ✅ Endpoints CRUD (`/api/api-keys`, `/api/api-keys/[id]`)
- ✅ UI completa para gestión (`/app/dashboard/configuracion/api-keys/page.tsx`)
- ✅ Documentación de uso
- ✅ Ejemplos de integración
- ✅ Guía de troubleshooting
- ✅ Build exitoso
- ✅ Checkpoint guardado

---

## 📁 Archivos Modificados/Creados

### Backend
- `✨ /prisma/schema.prisma` - Modelo ApiKey
- `✨ /lib/api-keys.ts` - Utilidades de API keys
- `✨ /lib/api-key-auth.ts` - Middleware de autenticación
- `✨ /app/api/api-keys/route.ts` - Endpoints GET/POST
- `✨ /app/api/api-keys/[id]/route.ts` - Endpoints GET/PUT/DELETE

### Frontend
- `✨ /app/dashboard/configuracion/api-keys/page.tsx` - UI de gestión

### Documentación
- `✨ /API_KEYS_SYSTEM_GUIDE.md` - Esta guía completa

---

## 🎯 Casos de Uso Reales

### 1. Automatización de Leads desde Landing Pages

```javascript
// Formulario de contacto → n8n → Volkern CRM
async function enviarFormulario(datos) {
  // n8n recibe webhook del formulario
  // n8n crea lead en Volkern con API key
  const response = await fetch('https://volkern.app/api/leads', {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.VOLKERN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nombre: datos.nombre,
      email: datos.email,
      telefono: datos.telefono,
      fuente: 'Landing Page',
      estado: 'nuevo'
    })
  });
}
```

### 2. Sincronización con CRM Externo

```python
# Zapier: Salesforce → Volkern CRM
def sincronizar_lead_salesforce(sf_lead):
    volkern_data = {
        'nombre': sf_lead['Name'],
        'email': sf_lead['Email'],
        'telefono': sf_lead['Phone'],
        'empresa': sf_lead['Company'],
        'fuente': 'Salesforce'
    }
    
    requests.post(
        'https://volkern.app/api/leads',
        headers={'X-API-Key': VOLKERN_KEY},
        json=volkern_data
    )
```

### 3. Reportes Automatizados

```python
# Script que corre cada mañana
import requests
from datetime import datetime, timedelta

def reporte_diario():
    # Obtener leads de las últimas 24 horas
    ayer = datetime.now() - timedelta(days=1)
    
    response = requests.get(
        'https://volkern.app/api/leads',
        headers={'X-API-Key': VOLKERN_KEY},
        params={'desde': ayer.isoformat()}
    )
    
    leads = response.json()
    enviar_email_reporte(leads)
```

---

¡Sistema de API Keys completamente funcional! 🎉

**Acceso:** https://volkern.app/dashboard/configuracion/api-keys

