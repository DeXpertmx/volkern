# 📋 Nuevos Campos para Leads: Empresa y Contexto del Proyecto

## Resumen

Se agregaron dos nuevos campos al modelo `Lead` para capturar información más detallada sobre los leads:

1. **`empresa`** - Nombre de la empresa del lead (ya existía, ahora completamente integrado)
2. **`contextoProyecto`** - Descripción del contexto, necesidades o detalles del proyecto del lead (NUEVO)

---

## 📝 Cambios Implementados

### 1. **Schema de Base de Datos**

**Archivo**: `/prisma/schema.prisma`

```prisma
model Lead {
  id                 String   @id @default(cuid())
  tenantId           String?
  nombre             String
  email              String
  telefono           String?
  empresa            String? // Empresa del lead
  cargo              String?
  ubicacion          String?
  linkedin           String?
  contextoProyecto   String? // 🆕 Descripción del contexto/necesidad del proyecto
  fuente             String?
  metadataExterna    Json?
  notas              String?
  // ... otros campos
}
```

✅ **Cambio aplicado con**: `yarn prisma db push`

---

### 2. **API de Leads - Creación y Actualización**

#### **POST `/api/leads`** (Crear/Actualizar Lead)

**Archivo**: `/app/api/leads/route.ts`

**Cambios**:
- ✅ Extracción de `contextoProyecto` del body del request
- ✅ Agregado al logging de debug
- ✅ Incluido en `updateData` para actualizaciones
- ✅ Incluido en `leadData` para creaciones

**Ejemplo de Request**:
```bash
curl -X POST "https://volkern.app/api/leads" \
  -H "X-API-Key: vk_prod_tu_api_key_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "email": "juan@empresa.com",
    "telefono": "+52 55 1234 5678",
    "empresa": "Tech Solutions MX",
    "contextoProyecto": "Necesita automatizar su proceso de ventas. Actualmente usa hojas de cálculo y busca una solución CRM completa con integración WhatsApp."
  }'
```

**Respuesta**:
```json
{
  "success": true,
  "lead": {
    "id": "clxxx123",
    "nombre": "Juan Pérez",
    "email": "juan@empresa.com",
    "telefono": "+52 55 1234 5678",
    "empresa": "Tech Solutions MX",
    "contextoProyecto": "Necesita automatizar su proceso de ventas...",
    "estado": "nuevo",
    "scoreValue": 0,
    "fechaCreacion": "2025-11-28T..."
  },
  "isNew": true,
  "message": "Lead creado exitosamente"
}
```

---

#### **PUT/PATCH `/api/leads/[id]`** (Actualizar Lead Existente)

**Archivo**: `/app/api/leads/[id]/route.ts`

**Cambios**:
- ✅ Extracción de `contextoProyecto` del body
- ✅ Incluido en el objeto de actualización

**Ejemplo de Request**:
```bash
curl -X PATCH "https://volkern.app/api/leads/clxxx123" \
  -H "X-API-Key: vk_prod_tu_api_key_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "empresa": "Tech Solutions México",
    "contextoProyecto": "Necesita automatizar ventas + añadir módulo de facturación electrónica. Presupuesto: $50,000 MXN. Timeline: 3 meses."
  }'
```

---

### 3. **UI - Página de Detalle del Lead**

**Archivo**: `/app/dashboard/leads/[id]/page.tsx`

#### **Cambios Implementados**:

1. **Interface actualizada**:
   ```typescript
   interface Lead {
     id: string;
     nombre: string;
     email: string;
     telefono: string | null;
     empresa: string | null;          // ✅
     contextoProyecto: string | null; // 🆕
     notas: string | null;
     estado: string;
     // ... otros campos
   }
   ```

2. **Estado del formulario actualizado**:
   ```typescript
   const [formData, setFormData] = useState({
     nombre: '',
     email: '',
     telefono: '',
     empresa: '',          // ✅
     contextoProyecto: ''  // 🆕
   });
   ```

3. **Formulario de Edición**:
   - ✅ Campo `Input` para "Empresa"
   - ✅ Campo `Textarea` (4 filas) para "Contexto del Proyecto"

4. **Vista de Lectura**:
   - ✅ Muestra empresa si existe
   - ✅ Muestra contexto del proyecto con formato `whitespace-pre-wrap` (preserva saltos de línea)

**Captura del Formulario**:
```
┌─────────────────────────────────────┐
│ Información del Lead                │
├─────────────────────────────────────┤
│ Nombre completo                     │
│ [Juan Pérez                      ]  │
│                                     │
│ Email                               │
│ [juan@empresa.com                ]  │
│                                     │
│ Teléfono                            │
│ [+52 55 1234 5678                ]  │
│                                     │
│ Empresa                             │
│ [Tech Solutions MX               ]  │
│                                     │
│ Contexto del Proyecto               │
│ ┌─────────────────────────────────┐ │
│ │ Necesita automatizar su         │ │
│ │ proceso de ventas. Actualmente  │ │
│ │ usa hojas de cálculo...         │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│    [Guardar]  [Cancelar]            │
└─────────────────────────────────────┘
```

---

## 🎯 Casos de Uso

### 1. **Captura Completa de Información del Lead**

**Antes**:
```json
{
  "nombre": "Juan Pérez",
  "email": "juan@empresa.com",
  "notas": "Empresa: Tech Solutions. Necesita CRM."
}
```

**Ahora**:
```json
{
  "nombre": "Juan Pérez",
  "email": "juan@empresa.com",
  "empresa": "Tech Solutions MX",
  "contextoProyecto": "Necesita CRM completo con:
- Automatización de ventas
- Integración WhatsApp
- Reportes personalizados
- Presupuesto: $50k MXN
- Timeline: 3 meses"
}
```

---

### 2. **Integración con n8n/Make/Zapier**

**Escenario**: Capturar leads desde formularios web con información estructurada.

**n8n HTTP Request - Crear Lead**:
```json
{
  "nombre": "{{$json.nombre}}",
  "email": "{{$json.email}}",
  "telefono": "{{$json.telefono}}",
  "empresa": "{{$json.empresa}}",
  "contextoProyecto": "{{$json.descripcion_proyecto}}"
}
```

---

### 3. **Anytimebot - Captura de Contexto desde WhatsApp**

**Flujo**:
1. Cliente envía mensaje por WhatsApp
2. Anytimebot hace preguntas:
   - ¿De qué empresa nos contactas?
   - ¿Cuál es tu proyecto o necesidad?
3. Webhook envía datos a Volkern:
   ```json
   {
     "nombre": "María García",
     "telefono": "+52 55 9876 5432",
     "empresa": "Retail Pro",
     "contextoProyecto": "Quiero implementar un programa de lealtad para mis clientes. Tengo 3 sucursales."
   }
   ```

---

## 📊 Compatibilidad con Integraciones Existentes

### ✅ **API Keys**
- Los campos `empresa` y `contextoProyecto` están disponibles en todos los endpoints que soportan autenticación por API Key
- Scopes requeridos: `leads:write` o `leads:create` (para POST), `leads:read` (para GET)

### ✅ **Webhooks Entrantes**
- Campo "Empresa" se puede mapear usando `mapeoEmpresa`
- Campo "Contexto" se puede mapear usando un mapeo personalizado (e.g., `mapeoContexto` → `contextoProyecto`)

**Ejemplo de configuración de webhook**:
```json
{
  "nombre": "Webhook Formulario Web",
  "accion": "crear_lead",
  "mapeoNombre": "contact.name",
  "mapeoEmail": "contact.email",
  "mapeoTelefono": "contact.phone",
  "mapeoEmpresa": "company.name",
  "customMapping": {
    "contextoProyecto": "project.description"
  }
}
```

### ✅ **Webhooks Salientes**
- Los campos `empresa` y `contextoProyecto` se incluyen automáticamente en el payload cuando se disparan eventos de lead (e.g., `lead_creado`, `lead_actualizado`)

**Ejemplo de payload enviado**:
```json
{
  "evento": "lead_creado",
  "timestamp": "2025-11-28T10:00:00Z",
  "data": {
    "lead": {
      "id": "clxxx123",
      "nombre": "Juan Pérez",
      "email": "juan@empresa.com",
      "telefono": "+52 55 1234 5678",
      "empresa": "Tech Solutions MX",
      "contextoProyecto": "Necesita automatizar su proceso de ventas...",
      "estado": "nuevo",
      "fechaCreacion": "2025-11-28T10:00:00Z"
    }
  },
  "tenantId": "tenant_abc123"
}
```

### ✅ **Automatizaciones**
- Los campos están disponibles para condiciones y acciones
- Ejemplo de condición: "Si empresa contiene 'Tech'"
- Ejemplo de acción en email: "Hola {{nombre}} de {{empresa}}"

---

## 🔧 Configuración en Sistemas Externos

### **n8n - HTTP Request Node**

**Para crear lead**:
```yaml
Method: POST
URL: https://volkern.app/api/leads

Authentication: Header Auth
  Name: X-API-Key
  Value: vk_prod_...

Body:
{
  "nombre": "{{$json.nombre}}",
  "email": "{{$json.email}}",
  "telefono": "{{$json.telefono}}",
  "empresa": "{{$json.empresa}}",
  "contextoProyecto": "{{$json.contexto}}"
}
```

---

### **Make/Integromat - HTTP Module**

```
URL: https://volkern.app/api/leads
Method: POST
Headers:
  X-API-Key: vk_prod_...
  Content-Type: application/json

Body:
{
  "nombre": "{{trigger.nombre}}",
  "email": "{{trigger.email}}",
  "empresa": "{{trigger.empresa}}",
  "contextoProyecto": "{{trigger.descripcion}}"
}
```

---

### **Zapier - Webhooks by Zapier**

```
Action Event: POST
URL: https://volkern.app/api/leads
Headers:
  X-API-Key: vk_prod_...
  Content-Type: application/json

Data:
  nombre: {{nombre_campo}}
  email: {{email_campo}}
  empresa: {{empresa_campo}}
  contextoProyecto: {{proyecto_campo}}
```

---

## ✅ Verificación

### **1. Crear Lead con Nuevos Campos**

```bash
curl -X POST "https://volkern.app/api/leads" \
  -H "X-API-Key: vk_prod_tu_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Test Lead",
    "email": "test@ejemplo.com",
    "telefono": "+52 55 1234 5678",
    "empresa": "Test Company",
    "contextoProyecto": "Este es un test del nuevo campo contextoProyecto."
  }'
```

**Respuesta esperada**: Status 200, lead creado con todos los campos.

---

### **2. Actualizar Lead Existente**

```bash
curl -X PATCH "https://volkern.app/api/leads/clxxx123" \
  -H "X-API-Key: vk_prod_tu_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "contextoProyecto": "Contexto actualizado con más detalles del proyecto."
  }'
```

---

### **3. Verificar en UI**

1. Ir a **Dashboard → Leads**
2. Seleccionar un lead
3. Click en **"Editar"**
4. Verificar que aparecen los campos:
   - ✅ **Empresa** (Input)
   - ✅ **Contexto del Proyecto** (Textarea de 4 filas)
5. Ingresar datos y guardar
6. Verificar que se muestran correctamente en modo lectura

---

## 📄 Archivos Modificados

```
/prisma/schema.prisma
  └─ Agregado campo 'contextoProyecto' al modelo Lead

/app/api/leads/route.ts
  └─ POST: Soporte para empresa y contextoProyecto

/app/api/leads/[id]/route.ts
  └─ PUT/PATCH: Soporte para actualizar empresa y contextoProyecto

/app/dashboard/leads/[id]/page.tsx
  ├─ Interface Lead actualizada
  ├─ Estado formData actualizado
  ├─ Formulario de edición con nuevos campos
  └─ Vista de lectura con nuevos campos
```

---

## 🚀 Próximos Pasos Sugeridos

### **Fase 1 (Opcional)**
- 🔜 Agregar búsqueda/filtro por empresa en la lista de leads
- 🔜 Agregar análisis de palabras clave en contextoProyecto para scoring automático
- 🔜 Crear campo calculado "Tipo de Proyecto" basado en contextoProyecto

### **Fase 2 (Opcional)**
- 🔜 Integración con CRM externos (Pipedrive, HubSpot) para sincronizar empresa y contexto
- 🔜 IA para sugerir soluciones basadas en contextoProyecto
- 🔜 Templates de respuesta automática según empresa/contexto

---

## 📝 Notas Técnicas

### **Campo `contextoProyecto`**
- **Tipo**: `String?` (opcional, texto largo)
- **En UI**: `Textarea` con 4 filas
- **Formato en lectura**: `whitespace-pre-wrap` para preservar saltos de línea
- **Mapeo en API**: Directamente desde body del request

### **Campo `empresa`**
- **Tipo**: `String?` (opcional)
- **Ya existía** en el schema, ahora completamente integrado en UI
- **En UI**: `Input` de texto simple

### **Compatibilidad**
- ✅ Totalmente compatible con API Keys
- ✅ Compatible con Webhooks (Entrantes y Salientes)
- ✅ Compatible con Automatizaciones
- ✅ No afecta leads existentes (campos opcionales)

---

## ✅ Checklist de Implementación

- [x] Actualizar schema de Prisma
- [x] Aplicar migración a base de datos
- [x] Actualizar API POST `/api/leads`
- [x] Actualizar API PUT/PATCH `/api/leads/[id]`
- [x] Actualizar interface Lead en TypeScript
- [x] Agregar campos al formulario de edición
- [x] Agregar campos a la vista de lectura
- [x] Importar componente Textarea
- [x] Probar compilación
- [x] Crear documentación

---

## 🎉 Conclusión

Los campos **empresa** y **contextoProyecto** ahora están completamente integrados en Volkern CRM, permitiendo capturar información más detallada sobre los leads. Esto facilita:

✅ Mejor calificación de leads
✅ Respuestas más personalizadas
✅ Mejor seguimiento del contexto del cliente
✅ Integración más rica con herramientas externas
✅ Automatizaciones más inteligentes

---

**Fecha de Implementación**: 28 de Noviembre, 2025  
**Versión**: 1.0
