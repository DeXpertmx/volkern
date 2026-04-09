# 🚫 Solución de Problemas: Embed de Agendamiento

## 👁️ Problema Reportado

**Síntoma:** El formulario embebido en https://www.dimensionexpert.com/schedulem muestra el mensaje "No se pudieron cargar los servicios" y no permite agendar citas.

---

## ✅ Soluciones Implementadas

### 1️⃣ **CORS Headers Agregados**

**Archivos actualizados:**
- `/app/api/public/servicios/route.ts`
- `/app/api/public/leads/route.ts`
- `/app/api/public/citas/route.ts`

**Cambios:**
- ✅ Headers CORS en todas las respuestas
- ✅ Manejo de preflight requests (OPTIONS)
- ✅ Access-Control-Allow-Origin: * (permite cualquier dominio)

```typescript
headers: {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
```

### 2️⃣ **Logging Detallado**

Ahora el endpoint `/api/public/servicios` registra:
- ✅ TenantId recibido
- ✅ Tenant encontrado en base de datos
- ✅ Número de servicios activos
- ✅ Lista de servicios con ID y nombre
- ✅ Headers de la request (Origin, Referer, User-Agent)

---

## 🔍 Cómo Diagnosticar el Problema

### Paso 1: Obtener tu TenantId Correcto

**Ejecuta este comando en el servidor:**

```bash
cd /home/ubuntu/fluy_crm/nextjs_space
node scripts/get-tenant-id.js <tu-email>
```

**Ejemplo:**
```bash
node scripts/get-tenant-id.js admin@dimensionexpert.com
```

**Salida esperada:**
```
✅ Usuario encontrado:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nombre: Admin User
Email: admin@dimensionexpert.com

🏢 Información del Tenant:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tenant ID: clx7abc123def456...
Nombre: Dimension Expert

📋 Código de Embebido:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<iframe
  src="https://volkern.app/embed/booking?tenantId=clx7abc123def456..."
  width="100%"
  height="800"
  frameborder="0"
></iframe>

📦 Servicios Activos: 3
  1. Consultoría Inicial (60 min - $100)
  2. Sesión de Seguimiento (30 min - $50)
  3. Workshop Empresarial (120 min - $300)
```

### Paso 2: Verificar el Código en tu Sitio Web

**Abre el archivo HTML de tu sitio y verifica:**

❌ **INCORRECTO:**
```html
<!-- SIN tenantId -->
<iframe src="https://volkern.app/embed/booking" ...></iframe>

<!-- TenantId vacío -->
<iframe src="https://volkern.app/embed/booking?tenantId=" ...></iframe>
```

✅ **CORRECTO:**
```html
<iframe 
  src="https://volkern.app/embed/booking?tenantId=clx7abc123def456..." 
  width="100%" 
  height="800" 
  frameborder="0"
></iframe>
```

### Paso 3: Verificar en el Navegador

**Abre tu página en Chrome/Firefox y:**

1. **Abre la Consola del Navegador:**
   - Windows/Linux: `F12` o `Ctrl+Shift+I`
   - Mac: `Cmd+Option+I`

2. **Ve a la pestaña "Network" (Red)**

3. **Recarga la página**

4. **Busca la request a `/api/public/servicios`**

5. **Verifica:**
   - ✅ Request URL: `https://volkern.app/api/public/servicios?tenantId=clx...`
   - ✅ Status Code: `200 OK`
   - ✅ Response: Array con servicios

**Errores comunes:**

| Error | Causa | Solución |
|-------|-------|----------|
| `400 Bad Request` | tenantId no proporcionado | Verifica el código del iframe |
| `404 Not Found` | tenantId inválido | Obtén el tenantId correcto con el script |
| `CORS error` | Dominio bloqueado | Ya resuelto con CORS headers |
| `Empty array []` | No hay servicios activos | Crea servicios en el dashboard |

### Paso 4: Revisar Logs del Servidor

**Conecta al servidor y ejecuta:**

```bash
# Ver logs en tiempo real
tail -f /var/log/volkern/production.log | grep "PUBLIC SERVICIOS"

# O buscar en logs recientes
grep "PUBLIC SERVICIOS" /var/log/volkern/production.log | tail -20
```

**Ejemplo de logs correctos:**
```
========== PUBLIC SERVICIOS ENDPOINT ==========
Timestamp: 2026-01-12T20:15:30.123Z
Origin: https://www.dimensionexpert.com
Referer: https://www.dimensionexpert.com/schedulem
User-Agent: Mozilla/5.0...
TenantId recibido: clx7abc123def456...
🔍 Buscando tenant en la base de datos...
Tenant encontrado: { id: 'clx7abc123...', nombre: 'Dimension Expert' }
🔍 Buscando servicios activos...
✅ 3 servicios encontrados
Servicios: [
  { id: 'srv1', nombre: 'Consultoría Inicial' },
  { id: 'srv2', nombre: 'Sesión de Seguimiento' },
  { id: 'srv3', nombre: 'Workshop Empresarial' }
]
========== FIN PUBLIC SERVICIOS ==========
```

---

## 🛠️ Soluciones por Tipo de Error

### Error: "tenantId es requerido"

**Causa:** El parámetro `tenantId` no se está enviando en la URL.

**Solución:**
1. Ejecuta: `node scripts/get-tenant-id.js <tu-email>`
2. Copia el código de iframe generado
3. Pégalo en tu sitio web
4. Asegúrate de que la URL incluya `?tenantId=...`

### Error: "Tenant no encontrado"

**Causa:** El `tenantId` en el iframe es incorrecto o ha cambiado.

**Solución:**
1. Ejecuta: `node scripts/get-tenant-id.js <tu-email>`
2. Verifica que el tenantId del script coincida con el del iframe
3. Si son diferentes, actualiza el código del iframe

### Error: "No se pudieron cargar los servicios"

**Posibles causas:**

#### Opción A: No hay servicios activos

**Verifica:**
```bash
node scripts/get-tenant-id.js <tu-email>
```

Si muestra "Servicios Activos: 0":

1. Inicia sesión en Volkern CRM
2. Ve a **Configuración** → **Servicios**
3. Crea al menos un servicio
4. **¡Importante!** Marca el servicio como **Activo**
5. Recarga el embed

#### Opción B: Problema de CORS (ya solucionado)

Si el navegador muestra errores como:
```
Access to fetch at 'https://volkern.app/api/public/servicios' 
from origin 'https://www.dimensionexpert.com' has been blocked by CORS policy
```

**Solución:**
- ✅ Los headers CORS ya están configurados
- Despliega la nueva versión de Volkern
- Recarga la página del embed con `Ctrl+Shift+R`

#### Opción C: Problema de red/firewall

**Verifica:**
```bash
curl "https://volkern.app/api/public/servicios?tenantId=TU_TENANT_ID"
```

Debería devolver JSON con los servicios.

---

## 🧪 Testing End-to-End

### Test 1: API Endpoint Directamente

```bash
# Reemplaza TU_TENANT_ID con tu ID real
curl -v "https://volkern.app/api/public/servicios?tenantId=TU_TENANT_ID"
```

**Respuesta esperada:**
```json
[
  {
    "id": "srv1...",
    "nombre": "Consultoría Inicial",
    "descripcion": "Primera sesión de consulta",
    "duracionMinutos": 60,
    "precio": 100,
    "moneda": "USD",
    "activo": true,
    "tenantId": "clx...",
    "fechaCreacion": "2026-01-01T..."
  }
]
```

### Test 2: Embed en Local

**Crea un archivo `test-embed.html`:**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Test Embed Volkern</title>
</head>
<body>
  <h1>Test Agendamiento</h1>
  <iframe 
    src="https://volkern.app/embed/booking?tenantId=TU_TENANT_ID" 
    width="100%" 
    height="800" 
    frameborder="0"
  ></iframe>
</body>
</html>
```

**Abre el archivo en tu navegador:**
- Deberías ver los servicios cargados
- Deberías poder seleccionar fecha/hora
- Deberías poder ingresar tus datos

### Test 3: Página de Producción

1. Actualiza el código en tu sitio web
2. Recarga la página con `Ctrl+Shift+R`
3. Verifica que los servicios se carguen
4. Completa una cita de prueba
5. Verifica en Volkern CRM que la cita se creó

---

## 📝 Checklist de Verificación

Antes de reportar un problema, verifica:

- [ ] Obtuve mi `tenantId` con el script
- [ ] El código del iframe incluye `?tenantId=...`
- [ ] El `tenantId` en el iframe es el correcto
- [ ] Tengo al menos 1 servicio **activo** en Volkern
- [ ] Probé el endpoint directamente con `curl`
- [ ] Recargué la página con `Ctrl+Shift+R`
- [ ] Revisé la consola del navegador (F12)
- [ ] Revisé la pestaña Network para ver la request
- [ ] Revisé los logs del servidor

---

## 👥 Soporte

Si después de seguir estos pasos el problema persiste:

1. **Ejecuta el script de diagnóstico:**
   ```bash
   node scripts/get-tenant-id.js <tu-email> > diagnostico.txt
   ```

2. **Captura los logs del navegador:**
   - Abre la consola (F12)
   - Ve a la pestaña Network
   - Recarga la página
   - Haz clic derecho en la request a `/api/public/servicios`
   - "Copy" → "Copy as cURL"

3. **Envía:**
   - El archivo `diagnostico.txt`
   - El comando cURL copiado
   - Una captura de pantalla del error

---

## 📚 Archivos Modificados en Este Fix

```
✅ /app/api/public/servicios/route.ts  - CORS + Logging detallado
✅ /app/api/public/leads/route.ts      - CORS headers
✅ /app/api/public/citas/route.ts      - CORS headers
✅ /scripts/get-tenant-id.js           - Script de diagnóstico (NUEVO)
```

---

**Última actualización:** Enero 12, 2026  
**Versión:** 1.0.0  
**Estado:** ✅ Listo para probar
