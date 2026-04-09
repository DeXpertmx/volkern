
# 🔄 Evolution API - Configuración Simplificada

## Resumen
Se ha simplificado la integración de Evolution API, eliminando la complejidad de las instancias personales por usuario y manteniendo solo la configuración simple a nivel de tenant en la sección de Integraciones.

---

## ✅ Cambios Implementados

### 1. **Sidebar Simplificado**
**Archivo:** `/components/sidebar.tsx`

- ✅ **Eliminada** la entrada "Mi WhatsApp" del menú de navegación
- Los usuarios ya no verán una sección dedicada para conectar instancias personales de WhatsApp

---

### 2. **Envío de Mensajes Simplificado**
**Archivo:** `/app/api/mensajes/enviar/route.ts`

#### Cambios Realizados:
- ❌ **Removida** la lógica de instancias personales por usuario
- ❌ **Removido** el import de `getUserInstance` y `sendMessageWithUserInstance`
- ✅ **Simplificado** para usar solo la integración de Evolution API del tenant

#### Código Anterior (Complejo):
```typescript
// Intentar usar la instancia personal del usuario primero
const userInstanceResult = await getUserInstance(user.id, user.tenantId)

if (userInstanceResult.instance) {
  // Usuario tiene instancia personal activa - usarla
  resultado = await sendMessageWithUserInstance(...)
} else {
  // Fallback a la instancia compartida del tenant
  resultado = await sendWhatsAppMessage(...)
}
```

#### Código Actual (Simple):
```typescript
// Usar la integración de Evolution API del tenant
console.log('📤 Enviando mensaje usando integración de Evolution API del tenant')

if (mediaUrl) {
  resultado = await sendWhatsAppMessageWithMedia(...)
} else {
  resultado = await sendWhatsAppMessage(conversacion.contactoTelefono, contenidoFinal, user.tenantId)
}
```

---

### 3. **Integración en Dashboard**
**Archivo:** `/app/dashboard/integraciones/page.tsx`

La configuración de Evolution API permanece igual en la sección de Integraciones:

#### Campos de Configuración:
- **API Key**: Clave de autenticación de Evolution API
- **Instance Name**: Nombre de la instancia de WhatsApp
- **API URL**: URL del servidor de Evolution API (por defecto: `https://api.dimension.expert`)

#### Instrucciones para el Usuario:
1. Obtén tu API Key desde tu panel de Evolution API
2. Define un nombre único para tu instancia
3. Configura el webhook en Evolution API:
   - **URL:** `https://volkern.app/api/webhook/evolution/[instanceName]`
   - **Eventos:** `MESSAGES_UPDATE`, `MESSAGES_UPSERT`
   - **Base64:** Activado

---

## 📊 Arquitectura Actual

```
┌─────────────────────────────────────────────────────────┐
│                    VOLKERN CRM                          │
││
│  ┌───────────────────────────────────────────────────┐  │
│  │         TENANT-LEVEL INTEGRATION                  │  │
│  ││  │
│  │  • Evolution API Configuration                    │  │
│  │    - API Key                                      │  │
│  │    - Instance Name                                │  │
│  │    - API URL                                      │  │
│  ││  │
│  │  • Stored in: Integration model                  │  │
│  │  • Shared by all users in tenant                 │  │
│  └───────────────────────────────────────────────────┘  │
│                           │                             │
│                           ▼                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │         MESSAGE SENDING                           │  │
│  ││  │
│  │  /api/mensajes/enviar                            │  │
│  │  • Uses tenant's Evolution API integration       │  │
│  │  • Single instance for all users                 │  │
│  │  • Supports text and media messages              │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              EVOLUTION API                              │
││
│  • Single WhatsApp Instance per Tenant                 │
│  • Receives messages via webhook                       │
│  • Sends messages via API                              │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuración para Usuarios

### Paso 1: Ir a Integraciones

1. Ve a **Dashboard → Integraciones**
2. Busca **Evolution API** en la lista de integraciones disponibles
3. Haz clic en **Configurar**

### Paso 2: Completar Credenciales

```plaintext
API Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Instance Name: volkern_empresa
API URL: https://api.dimension.expert
```

### Paso 3: Configurar Webhook en Evolution API

En tu panel de Evolution API, configura:

```plaintext
Webhook URL: https://volkern.app/api/webhook/evolution/volkern_empresa
Eventos: 
  ✅ MESSAGES_UPDATE
  ✅ MESSAGES_UPSERT
Base64: ✅ Activado
```

### Paso 4: Probar la Conexión

1. Haz clic en **Probar Conexión** en Volkern
2. Verifica que el estado sea "Conectado"
3. Envía un mensaje de prueba desde el módulo de Mensajes

---

## 💡 Ventajas de la Configuración Simple

### ✅ **Ventajas**

1. **Más Simple**
   - Solo una configuración por tenant
   - No requiere que cada usuario conecte su WhatsApp personal
   - Menos pasos de configuración

2. **Más Confiable**
   - Única fuente de verdad
   - Menos puntos de fallo
   - Configuración centralizada

3. **Mejor Control**
   - Administradores controlan la integración
   - No depende de usuarios individuales
   - Easier to troubleshoot

4. **Menor Complejidad**
   - Menos código para mantener
   - Lógica más clara
   - Menos bugs potenciales

### ⚠️ **Consideraciones**

1. **Un Solo Número de WhatsApp**
   - Todos los mensajes se envían desde el mismo número
   - No se puede asignar un número diferente por usuario

2. **Gestión Centralizada**
   - Solo administradores pueden configurar
   - Usuarios no pueden conectar sus propios números

---

## 🔍 Archivos Modificados

### Archivos Actualizados:
1. ✅ `/components/sidebar.tsx`
   - Removida entrada "Mi WhatsApp"

2. ✅ `/app/api/mensajes/enviar/route.ts`
   - Removida lógica de instancias personales
   - Simplificado para usar solo integración del tenant

### Archivos que Permanecen (No se Usan):
Los siguientes archivos/modelos existen pero **NO están en uso**:
- `/lib/evolution-instances.ts`
- `/app/api/integraciones/my-whatsapp/*`
- `/app/dashboard/configuracion/mi-whatsapp/page.tsx`
- Modelo Prisma `UserWhatsAppInstance`

> **Nota:** Estos archivos pueden ser removidos en el futuro si se confirma que no son necesarios.

---

## 📝 Casos de Uso

### Caso 1: Configurar WhatsApp por Primera Vez

1. **Administrador** va a Dashboard → Integraciones
2. Configura Evolution API con credenciales
3. Prueba la conexión
4. **Todos los usuarios** del tenant pueden enviar mensajes de WhatsApp

### Caso 2: Enviar Mensaje de WhatsApp

1. **Usuario** va a Dashboard → Mensajes
2. Selecciona o crea una conversación
3. Escribe el mensaje
4. Sistema envía usando la integración del tenant automáticamente

### Caso 3: Recibir Mensaje de WhatsApp

1. **Cliente** envía mensaje por WhatsApp
2. Evolution API envía webhook a Volkern
3. Sistema crea/actualiza conversación
4. **Equipo** ve el mensaje en Dashboard → Mensajes

---

## 🐛 Troubleshooting

### Problema: No se envían mensajes

**Soluciones:**
1. Verifica que Evolution API esté configurado en Integraciones
2. Comprueba que el `instance_name` sea correcto
3. Verifica que el `api_key` sea válido
4. Revisa que el webhook esté configurado en Evolution API

### Problema: No se reciben mensajes

**Soluciones:**
1. Verifica que el webhook esté configurado correctamente
2. Comprueba que la URL sea: `https://volkern.app/api/webhook/evolution/[instanceName]`
3. Asegúrate de que los eventos `MESSAGES_UPDATE` y `MESSAGES_UPSERT` estén activos
4. Revisa los logs del servidor para ver si llegan los webhooks

### Problema: Error 403 al enviar mensajes

**Soluciones:**
1. Verifica que el `api_key` en Integraciones sea correcto
2. Comprueba que no haya expirado
3. Regenera el API key en Evolution API si es necesario

---

## 🚀 Próximos Pasos

Si en el futuro necesitas funcionalidad multi-instancia:

1. **Re-habilitar** la lógica de instancias personales
2. **Descomentar** el código en `/app/api/mensajes/enviar/route.ts`
3. **Agregar** nuevamente "Mi WhatsApp" al sidebar
4. **Documentar** el proceso de configuración para usuarios

---

## ✅ Checklist de Implementación

- ✅ Sidebar actualizado (removida entrada "Mi WhatsApp")
- ✅ Lógica de envío simplificada
- ✅ Compilación exitosa
- ✅ Configuración en Integraciones funcional
- ✅ Documentación actualizada
- ✅ Dominio correcto (`volkern.app`) en toda la documentación

---

## 🎯 Estado Final

La integración de Evolution API ahora es:
- ✅ **Simple**: Una sola configuración por tenant
- ✅ **Clara**: Lógica directa sin complejidad innecesaria
- ✅ **Funcional**: Envío y recepción de mensajes funcionando
- ✅ **Mantenible**: Menos código, menos bugs

---

¡Configuración simplificada completada! 🎉
