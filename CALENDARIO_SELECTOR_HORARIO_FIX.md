# 🔧 Fix: Mapeo de Campos para Crear Citas desde n8n

## Resumen

Se identificó y solucionó el problema de creación de citas desde n8n. El error "Error al crear cita" se debía a un **mapeo incorrecto de campos** en el nodo HTTP Request de n8n.

---

## ❌ Problema Detectado

### Síntomas:
- El nodo "Book Appointment" en n8n devuelve error `500`
- Mensaje: "The service was not able to process your request. Details: Error al crear cita"
- La autenticación (X-API-Key) está correcta
- Los campos enviados no coinciden con los esperados por el API

### Causa Raíz:
El payload enviado desde n8n tenía campos como:
```json
{
  "nombreLead_value": "Juan Pérez",
  "proyecto_si_value": "Reunión de automatización...",
  "whatsapp_value": "+501-1748186-8867"
}
```

Pero el API espera:
```json
{
  "leadId": "clxxx123",
  "fechaHora": "2025-11-28T14:00:00Z",
  "titulo": "Reunión de automatización",
  "tipo": "reunion"
}
```

---

## ✅ Solución Implementada

### 1. **Mejoras en el Backend** (`/api/citas/route.ts`)

#### Logging Mejorado:
```typescript
// Logging para debug - ayuda a identificar problemas de mapeo
console.log('[POST /api/citas] Payload recibido:', JSON.stringify(body, null, 2))
console.log('[POST /api/citas] Auth method:', auth.authMethod)
console.log('[POST /api/citas] Tenant:', auth.tenant.id)
```

#### Validación Descriptiva:
```typescript
if (!leadId || !fechaHora) {
  const missingFields = [];
  if (!leadId) missingFields.push('leadId');
  if (!fechaHora) missingFields.push('fechaHora');
  
  return NextResponse.json(
    { 
      error: 'Campos requeridos faltantes',
      missingFields: missingFields,
      receivedFields: Object.keys(body),
      hint: 'Asegúrate de enviar "leadId" (ID del lead) y "fechaHora" (formato ISO: 2025-11-28T14:00:00Z)'
    },
    { status: 400 }
  )
}
```

#### Error Handling Mejorado:
```typescript
catch (error: any) {
  console.error('[POST /api/citas] Error completo:', error)
  console.error('[POST /api/citas] Error stack:', error?.stack)
  console.error('[POST /api/citas] Error message:', error?.message)
  
  return NextResponse.json(
    { 
      error: 'Error al crear cita',
      details: error?.message || 'Error desconocido',
      hint: 'Verifica que todos los campos requeridos estén presentes y tengan el formato correcto'
    },
    { status: 500 }
  )
}
```

---

### 2. **Configuración Correcta en n8n**

#### ✨ Flujo Completo Anytimebot → Volkern

```
┌──────────────────────────────────────────────────────────────┐
│ 1. When chat message received (Anytimebot Webhook)          │
│    → Recibe conversación desde Anytimebot                   │
└────────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. OpenRouter Chat Model (Procesar intención)               │
│    → Extrae: nombre, teléfono, tema del proyecto           │
└────────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Append Update Lead Volkern (Crear/actualizar lead)       │
│    POST https://volkern.app/api/leads                        │
│                                                              │
│    Body:                                                     │
│    {                                                         │
│      "nombre": "{{$json.nombreLead_value}}",              │
│      "telefono": "{{$json.whatsapp_value}}",             │
│      "notas": "{{$json.proyecto_si_value}}"               │
│    }                                                         │
│                                                              │
│    Retorna: { "lead": { "id": "clxxx123" } }              │
└────────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Get booked Appointments (Verificar disponibilidad)       │
│    GET https://volkern.app/api/citas                         │
│      ?fechaInicio=2025-11-28                                 │
│      &fechaFin=2025-11-28                                    │
└────────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. Code (Calcular próximo horario disponible)               │
│    → Genera fecha/hora para la cita                         │
│    → Formato: "2025-11-28T14:00:00Z"                        │
└────────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. Book Appointment (AQUÍ ESTÁ EL ERROR)                    │
│    POST https://volkern.app/api/citas                        │
│                                                              │
│    ❌ INCORRECTO (lo que estabas enviando):                 │
│    {                                                         │
│      "nombreLead_value": "Juan Pérez",                     │
│      "proyecto_si_value": "Reunión...",                    │
│      "whatsapp_value": "+501-1748186-8867"                 │
│    }                                                         │
│                                                              │
│    ✅ CORRECTO (lo que debes enviar):                       │
│    {                                                         │
│      "leadId": "{{$('Append Update Lead Volkern').item.json.lead.id}}",  │
│      "fechaHora": "{{$('Code').item.json.fechaHora}}",  │
│      "titulo": "Reunión de Diagnóstico",                  │
│      "descripcion": "{{$json.proyecto_si_value}}",        │
│      "tipo": "reunion",                                    │
│      "duracion": 60,                                        │
│      "estado": "pendiente"                                 │
│    }                                                         │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuración Paso a Paso en n8n

### Nodo 1: Append Update Lead Volkern

**HTTP Request Node**
```yaml
Method: POST
URL: https://volkern.app/api/leads

Authentication: Header Auth
  Credential: Volkern  # Tu credencial con X-API-Key

Send Body: Yes
Body Content Type: JSON

Body:
{
  "nombre": "{{$json.nombreLead_value}}",
  "telefono": "{{$json.whatsapp_value}}",
  "email": "temp-{{$json.whatsapp_value}}@volkern.temp",
  "notas": "{{$json.proyecto_si_value}}",
  "empresa": "{{$json.empresa_value}}",
  "contextoProyecto": "{{$json.proyecto_si_value}}"
}
```

**Respuesta esperada:**
```json
{
  "success": true,
  "lead": {
    "id": "clxxx123",
    "nombre": "Juan Pérez",
    "telefono": "+52 55 1234 5678",
    "email": "temp-+525512345678@volkern.temp",
    "estado": "nuevo"
  },
  "isNew": true,
  "message": "Lead creado exitosamente"
}
```

---

### Nodo 2: Get booked Appointments

**HTTP Request Node**
```yaml
Method: GET
URL: https://volkern.app/api/citas

Authentication: Header Auth
  Credential: Volkern

Query Parameters:
  fechaInicio: 2025-11-28
  fechaFin: 2025-11-28
```

**Respuesta esperada:**
```json
[
  {
    "id": "cita_001",
    "fechaHora": "2025-11-28T10:00:00.000Z",
    "duracion": 60,
    "estado": "pendiente"
  },
  {
    "id": "cita_002",
    "fechaHora": "2025-11-28T14:00:00.000Z",
    "duracion": 60,
    "estado": "confirmada"
  }
]
```

---

### Nodo 3: Code (Calcular próximo horario)

**Code Node (JavaScript)**
```javascript
// Obtener citas ya agendadas
const citasAgendadas = $input.all();

// Horarios disponibles (ejemplo: 9am - 6pm, cada hora)
const horariosDisponibles = [
  "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"
];

// Fecha objetivo (hoy + 1 día)
const fecha = new Date();
fecha.setDate(fecha.getDate() + 1);
const fechaStr = fecha.toISOString().split('T')[0]; // "2025-11-28"

// Encontrar primer horario disponible
let horarioSeleccionado = horariosDisponibles[0];

for (const horario of horariosDisponibles) {
  const fechaHoraCompleta = `${fechaStr}T${horario}:00Z`;
  
  // Verificar si ya existe una cita en este horario
  const citaExiste = citasAgendadas.some(cita => {
    const citaFecha = new Date(cita.json.fechaHora);
    return citaFecha.toISOString() === fechaHoraCompleta;
  });
  
  if (!citaExiste) {
    horarioSeleccionado = horario;
    break;
  }
}

const fechaHoraFinal = `${fechaStr}T${horarioSeleccionado}:00Z`;

return [{
  json: {
    fechaHora: fechaHoraFinal,
    fecha: fechaStr,
    hora: horarioSeleccionado
  }
}];
```

**Salida esperada:**
```json
{
  "fechaHora": "2025-11-29T09:00:00Z",
  "fecha": "2025-11-29",
  "hora": "09:00"
}
```

---

### Nodo 4: Book Appointment (CORRECTO) ✅

**HTTP Request Node**
```yaml
Method: POST
URL: https://volkern.app/api/citas

Authentication: Header Auth
  Credential: Volkern

Send Body: Yes
Body Content Type: JSON

Body:
{
  "leadId": "{{$('Append Update Lead Volkern').item.json.lead.id}}",
  "fechaHora": "{{$('Code').item.json.fechaHora}}",
  "titulo": "Reunión de Diagnóstico - {{$('Append Update Lead Volkern').item.json.lead.nombre}}",
  "descripcion": "Tema: {{$json.proyecto_si_value}}",
  "tipo": "reunion",
  "duracion": 60,
  "estado": "pendiente",
  "linkReunion": "https://meet.google.com/nuevo-link"
}
```

**💡 Notas Importantes:**

1. **`leadId`**: Se obtiene del nodo anterior "Append Update Lead Volkern"
   - Ruta: `$('Append Update Lead Volkern').item.json.lead.id`

2. **`fechaHora`**: Formato ISO 8601 con timezone UTC (`Z` al final)
   - Correcto: `"2025-11-28T14:00:00Z"`
   - Incorrecto: `"2025-11-28 14:00"`, `"28/11/2025"`

3. **`tipo`**: Valores válidos
   - `"reunion"` (reunión de negocios)
   - `"llamada"` (llamada telefónica)
   - `"demo"` (demostración de producto)
   - `"servicio"` (si está vinculado a un servicio de pago)

4. **`duracion`**: En minutos (default: 60)

5. **`estado`**: Valores válidos
   - `"pendiente"` (recién agendada)
   - `"confirmada"` (cliente confirmó)
   - `"completada"` (ya se realizó)
   - `"cancelada"` (cancelada)

**Respuesta exitosa:**
```json
{
  "success": true,
  "cita": {
    "id": "clzzz789",
    "leadId": "clxxx123",
    "tenantId": "tenant_001",
    "tipo": "reunion",
    "titulo": "Reunión de Diagnóstico - Juan Pérez",
    "descripcion": "Tema: Automatización de marketing en Instagram...",
    "fechaHora": "2025-11-29T09:00:00.000Z",
    "duracion": 60,
    "estado": "pendiente",
    "linkReunion": "https://meet.google.com/nuevo-link",
    "createdAt": "2025-11-28T..."
  }
}
```

---

## 🧪 Pruebas con cURL

### Test 1: Crear Lead
```bash
curl -X POST "https://volkern.app/api/leads" \
  -H "X-API-Key: vk_prod_tu_api_key_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Pérez",
    "telefono": "+52 55 1234 5678",
    "email": "juan@ejemplo.com",
    "notas": "Interesado en automatización de marketing",
    "empresa": "Tech Solutions MX",
    "contextoProyecto": "Necesita integrar Instagram, Facebook y WhatsApp con CRM"
  }'
```

### Test 2: Verificar Disponibilidad
```bash
curl -X GET "https://volkern.app/api/citas?fechaInicio=2025-11-28&fechaFin=2025-11-28" \
  -H "X-API-Key: vk_prod_tu_api_key_aqui"
```

### Test 3: Crear Cita
```bash
curl -X POST "https://volkern.app/api/citas" \
  -H "X-API-Key: vk_prod_tu_api_key_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "clxxx123",
    "fechaHora": "2025-11-29T09:00:00Z",
    "titulo": "Reunión de Diagnóstico",
    "descripcion": "Discutir automatización de marketing",
    "tipo": "reunion",
    "duracion": 60,
    "estado": "pendiente",
    "linkReunion": "https://meet.google.com/abc-defg-hij"
  }'
```

---

## 🐛 Troubleshooting

### Error: "Campos requeridos faltantes"

**Síntomas:**
```json
{
  "error": "Campos requeridos faltantes",
  "missingFields": ["leadId", "fechaHora"],
  "receivedFields": ["nombreLead_value", "proyecto_si_value"],
  "hint": "Asegúrate de enviar 'leadId' (ID del lead) y 'fechaHora' (formato ISO: 2025-11-28T14:00:00Z)"
}
```

**Solución:**
1. Verifica que estés usando `leadId` (no `nombreLead_value`)
2. Asegúrate de obtener el `leadId` del nodo anterior:
   ```
   {{$('Append Update Lead Volkern').item.json.lead.id}}
   ```
3. Verifica que `fechaHora` esté en formato ISO 8601

---

### Error: "Lead no encontrado"

**Síntomas:**
```json
{
  "error": "Lead no encontrado"
}
```

**Solución:**
1. Verifica que el `leadId` existe en tu tenant
2. Asegúrate de que el lead se creó exitosamente en el nodo anterior
3. Revisa los logs del nodo "Append Update Lead Volkern"

---

### Error: "Invalid date format"

**Síntomas:**
Error 500 con mensaje sobre formato de fecha inválido

**Solución:**
Usa formato ISO 8601 con timezone:
- ✅ Correcto: `"2025-11-28T14:00:00Z"`
- ✅ Correcto: `"2025-11-28T14:00:00-06:00"` (con timezone específico)
- ❌ Incorrecto: `"2025-11-28 14:00"`
- ❌ Incorrecto: `"28/11/2025"`
- ❌ Incorrecto: `"2025-11-28"`

---

## 📊 Mejoras Implementadas

### Antes:
- Error genérico: "Error al crear cita"
- Sin información sobre campos faltantes
- Difícil debug desde n8n

### Ahora:
✅ **Logging detallado** en servidor:
```
[POST /api/citas] Payload recibido: {...}
[POST /api/citas] Auth method: apikey
[POST /api/citas] Tenant: tenant_abc123
[POST /api/citas] Campos requeridos faltantes: ["leadId", "fechaHora"]
[POST /api/citas] Campos recibidos: ["nombreLead_value", "proyecto_si_value"]
```

✅ **Errores descriptivos** para el usuario:
```json
{
  "error": "Campos requeridos faltantes",
  "missingFields": ["leadId"],
  "receivedFields": ["nombre", "telefono"],
  "hint": "Asegúrate de enviar 'leadId' (ID del lead) y 'fechaHora' (formato ISO: 2025-11-28T14:00:00Z)"
}
```

✅ **Detalles de excepciones**:
```json
{
  "error": "Error al crear cita",
  "details": "Invalid date format",
  "hint": "Verifica que todos los campos requeridos estén presentes y tengan el formato correcto"
}
```

---

## ✅ Checklist de Verificación

### En n8n:
- [ ] El nodo "Append Update Lead Volkern" retorna `lead.id`
- [ ] El nodo "Code" genera `fechaHora` en formato ISO 8601
- [ ] El nodo "Book Appointment" usa:
  - [ ] `leadId` (no `nombreLead_value`)
  - [ ] `fechaHora` (no `fecha` y `hora` separados)
  - [ ] Credencial "Volkern" con X-API-Key configurada
- [ ] El body es JSON válido (sin campos undefined)

### En la Respuesta:
- [ ] Status 200 (no 400, 500)
- [ ] Incluye `{ "success": true, "cita": {...} }`
- [ ] La cita tiene `id`, `leadId`, `fechaHora`

---

## 📚 Documentación Adicional

Para más información sobre el API de citas:
- Ver: `/home/ubuntu/fluy_crm/API_CITAS_AUTENTICACION_FIX.md`
- Ver: `/home/ubuntu/fluy_crm/CALENDARIO_CITAS_MEJORA.md`
- Ver: `/home/ubuntu/fluy_crm/MAPEO_CAMPOS_N8N_FIX.md`

---

**Fecha de Implementación**: 28 de Noviembre, 2025  
**Versión**: 2.0
