# 🚨 SOLUCIÓN: Configuración Correcta del Nodo "Book Appointment" en n8n

## ❌ El Problema

Estás enviando estos campos INCORRECTOS:
```json
{
  "nombreLead_value": "Juan Pérez",
  "proyecto_si_value": "Reunión...",
  "whatsapp_value": "+501-xxx"
}
```

## ✅ La Solución

Debes enviar estos campos CORRECTOS:
```json
{
  "leadId": "clxxx123",
  "fechaHora": "2025-11-28T14:00:00Z",
  "titulo": "Reunión de Diagnóstico",
  "descripcion": "...",
  "tipo": "reunion",
  "duracion": 60,
  "estado": "pendiente"
}
```

---

## 📋 PASO A PASO: Cómo Configurar el Nodo "Book Appointment"

### **Paso 1: Abrir el Nodo**

1. En tu workflow de n8n, haz clic en el nodo **"Book Appointment"**
2. Ve a la pestaña **"Parameters"**
3. Busca la sección **"Body"** o **"JSON"**

---

### **Paso 2: BORRAR el Contenido Actual**

⚠️ **MUY IMPORTANTE**: Borra TODO el contenido actual del Body.

---

### **Paso 3: COPIAR y PEGAR esta Configuración EXACTA**

En el campo **"Body"**, pega esto:

```json
{
  "leadId": "{{$('Append Update Lead Volkern').item.json.lead.id}}",
  "fechaHora": "{{$('Code').item.json.fechaHora}}",
  "titulo": "Reunión de Diagnóstico - {{$('Append Update Lead Volkern').item.json.lead.nombre}}",
  "descripcion": "{{$json.proyecto_si_value}}",
  "tipo": "reunion",
  "duracion": 60,
  "estado": "pendiente"
}
```

---

### **Paso 4: Entender Cada Campo**

#### 1. `leadId` (OBLIGATORIO)
```json
"leadId": "{{$('Append Update Lead Volkern').item.json.lead.id}}"
```
- ✅ **¿Qué hace?** Obtiene el ID del lead que creaste en el nodo anterior
- ✅ **¿De dónde viene?** Del nodo "Append Update Lead Volkern"
- ✅ **¿Cómo se ve?** `"clxxx123456"` (un ID único)

#### 2. `fechaHora` (OBLIGATORIO)
```json
"fechaHora": "{{$('Code').item.json.fechaHora}}"
```
- ✅ **¿Qué hace?** Define la fecha y hora de la cita
- ✅ **¿De dónde viene?** Del nodo "Code" que calcula el horario disponible
- ✅ **¿Cómo se ve?** `"2025-11-28T14:00:00Z"` (formato ISO 8601)

#### 3. `titulo` (Opcional pero recomendado)
```json
"titulo": "Reunión de Diagnóstico - {{$('Append Update Lead Volkern').item.json.lead.nombre}}"
```
- ✅ **¿Qué hace?** Pone un título a la cita
- ✅ **Ejemplo:** "Reunión de Diagnóstico - Juan Pérez"

#### 4. `descripcion` (Opcional)
```json
"descripcion": "{{$json.proyecto_si_value}}"
```
- ✅ **¿Qué hace?** Agrega detalles sobre el proyecto
- ✅ **¿De dónde viene?** Del webhook de Anytimebot

#### 5. `tipo` (Obligatorio)
```json
"tipo": "reunion"
```
- ✅ **Valores válidos:**
  - `"reunion"` → Reunión de negocios
  - `"llamada"` → Llamada telefónica
  - `"demo"` → Demostración de producto
  - `"servicio"` → Servicio de pago

#### 6. `duracion` (Opcional, default: 60)
```json
"duracion": 60
```
- ✅ **¿Qué hace?** Define la duración en minutos

#### 7. `estado` (Opcional, default: "pendiente")
```json
"estado": "pendiente"
```
- ✅ **Valores válidos:**
  - `"pendiente"` → Recién agendada
  - `"confirmada"` → Cliente confirmó
  - `"completada"` → Ya se realizó
  - `"cancelada"` → Cancelada

---

## 🔍 Verificación: ¿Está Correcto?

### ✅ Checklist Antes de Ejecutar

- [ ] El nodo anterior **"Append Update Lead Volkern"** está funcionando y retorna `lead.id`
- [ ] El nodo **"Code"** está generando `fechaHora` en formato ISO 8601
- [ ] El Body del nodo "Book Appointment" tiene **EXACTAMENTE** los campos de arriba
- [ ] La credencial **"Volkern"** con `X-API-Key` está configurada
- [ ] El método HTTP es **POST**
- [ ] La URL es **https://volkern.app/api/citas**

---

## 🧪 Prueba Manual con cURL

Antes de ejecutar en n8n, prueba esto en tu terminal:

```bash
curl -X POST "https://volkern.app/api/citas" \
  -H "X-API-Key: vk_prod_TU_API_KEY_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "TU_LEAD_ID_AQUI",
    "fechaHora": "2025-11-29T14:00:00Z",
    "titulo": "Reunión de prueba",
    "tipo": "reunion",
    "duracion": 60
  }'
```

**Reemplaza:**
- `TU_API_KEY_AQUI` → Tu API Key de Volkern
- `TU_LEAD_ID_AQUI` → Un ID de lead existente (ej: `clxxx123`)

---

## 🚨 Errores Comunes y Soluciones

### Error 1: "Campos requeridos faltantes"

```json
{
  "error": "Campos requeridos faltantes",
  "missingFields": ["leadId", "fechaHora"],
  "receivedFields": ["nombreLead_value", "proyecto_si_value"]
}
```

**Solución:**
- ⚠️ Estás enviando los campos INCORRECTOS
- ✅ Usa la configuración de arriba (Paso 3)

---

### Error 2: "Lead no encontrado"

```json
{
  "error": "Lead no encontrado"
}
```

**Solución:**
- ⚠️ El `leadId` no existe o no pertenece a tu tenant
- ✅ Verifica que el nodo "Append Update Lead Volkern" funcionó correctamente
- ✅ Revisa los logs de ese nodo para ver el `lead.id` que retornó

---

### Error 3: "Invalid date format"

**Solución:**
- ⚠️ El `fechaHora` no está en formato ISO 8601
- ✅ Debe ser: `"2025-11-28T14:00:00Z"` (con la `T` y la `Z` al final)
- ✅ Verifica el nodo "Code" que genera este valor

---

## 📊 Flujo Completo Correcto

```
1. Anytimebot Webhook
   ↓
   Recibe: nombreLead_value, proyecto_si_value, whatsapp_value

2. Append Update Lead Volkern
   ↓
   Body:
   {
     "nombre": "{{$json.nombreLead_value}}",
     "telefono": "{{$json.whatsapp_value}}",
     "notas": "{{$json.proyecto_si_value}}"
   }
   ↓
   Retorna: { "lead": { "id": "clxxx123" } }

3. Get booked Appointments
   ↓
   GET https://volkern.app/api/citas?fechaInicio=2025-11-28&fechaFin=2025-11-28
   ↓
   Retorna: Array de citas existentes

4. Code
   ↓
   Calcula próximo horario disponible
   ↓
   Retorna: { "fechaHora": "2025-11-29T09:00:00Z" }

5. Book Appointment ⭐ AQUÍ ESTÁ EL CAMBIO ⭐
   ↓
   Body (CORRECTO):
   {
     "leadId": "{{$('Append Update Lead Volkern').item.json.lead.id}}",
     "fechaHora": "{{$('Code').item.json.fechaHora}}",
     "titulo": "Reunión de Diagnóstico",
     "tipo": "reunion",
     "duracion": 60
   }
   ↓
   ✅ Cita creada exitosamente
```

---

## 📸 Captura de Pantalla de Referencia

Tu nodo "Book Appointment" debe verse así:

```
┌─────────────────────────────────────────────┐
│ Book Appointment                            │
├─────────────────────────────────────────────┤
│ Method: POST                                │
│ URL: https://volkern.app/api/citas          │
│                                             │
│ Authentication: Header Auth                 │
│   Credential: Volkern                       │
│                                             │
│ Send Body: Yes                              │
│ Body Content Type: JSON                     │
│                                             │
│ Specify Body:                               │
│ {                                           │
│   "leadId": "{{$('Append Update...).item.  │
│              json.lead.id}}",              │
│   "fechaHora": "{{$('Code').item.json.     │
│                 fechaHora}}",              │
│   "titulo": "Reunión de Diagnóstico",      │
│   "tipo": "reunion",                        │
│   "duracion": 60                            │
│ }                                           │
└─────────────────────────────────────────────┘
```

---

## ✅ Respuesta Exitosa Esperada

Si está configurado correctamente, verás:

```json
{
  "success": true,
  "cita": {
    "id": "clzzz789",
    "leadId": "clxxx123",
    "tipo": "reunion",
    "titulo": "Reunión de Diagnóstico - Juan Pérez",
    "fechaHora": "2025-11-29T09:00:00.000Z",
    "duracion": 60,
    "estado": "pendiente",
    "createdAt": "2025-11-28T..."
  }
}
```

---

## 🆘 ¿Todavía No Funciona?

### Opción 1: Ver los Logs del Servidor

Con las mejoras que implementamos, el servidor ahora te dirá EXACTAMENTE qué está mal:

```
[POST /api/citas] Payload recibido: {
  "nombreLead_value": "Juan Pérez",  ← INCORRECTO
  "proyecto_si_value": "...",        ← INCORRECTO
  "whatsapp_value": "+501-xxx"       ← INCORRECTO
}
[POST /api/citas] Campos requeridos faltantes: ["leadId", "fechaHora"]
[POST /api/citas] Campos recibidos: ["nombreLead_value", "proyecto_si_value", "whatsapp_value"]
```

### Opción 2: Exportar tu Workflow

1. En n8n, haz clic en el botón **"Download"** (arriba a la derecha)
2. Guarda el archivo JSON
3. Envíame el workflow para revisarlo

### Opción 3: Captura de Pantalla

Toma una captura de pantalla de:
1. El nodo "Book Appointment" > Pestaña "Parameters" > Sección "Body"
2. El nodo "Book Appointment" > Pestaña "Output" (después de ejecutar)

---

## 🎯 Resumen Ultra-Corto

**Lo que DEBES cambiar:**

1. Abre el nodo "Book Appointment"
2. Borra el Body actual
3. Copia y pega EXACTAMENTE esto:

```json
{
  "leadId": "{{$('Append Update Lead Volkern').item.json.lead.id}}",
  "fechaHora": "{{$('Code').item.json.fechaHora}}",
  "titulo": "Reunión de Diagnóstico",
  "tipo": "reunion",
  "duracion": 60
}
```

4. Guarda
5. Ejecuta

¡Eso es todo! 🚀
