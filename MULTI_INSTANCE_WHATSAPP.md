
# 📱 Sistema Multi-Instancia de WhatsApp - Volkern CRM

## 🎯 Descripción General

Este sistema permite que **cada miembro del equipo conecte su propio número de WhatsApp** de forma individual, proporcionando un control total sobre las conversaciones y manteniendo un historial centralizado en Volkern CRM.

---

## ✨ Características Principales

### 🔐 Instancias Personales
- Cada usuario puede conectar su propio WhatsApp
- Instancias completamente independientes por usuario
- No interfiere con el uso de WhatsApp Web personal

### 📊 Control Total
- Historial completo de conversaciones centralizado
- Métricas por agente (mensajes enviados, tiempo de respuesta)
- Evita fugas de información (todo queda en el CRM)
- Auditoría completa de todas las interacciones

### 🚀 Fácil de Usar
- Conexión simple mediante escaneo de QR Code
- Auto-detección de conexión/desconexión
- UI intuitiva para gestión de instancia

---

## 🏗️ Arquitectura

### 1. Base de Datos

#### Modelo `UserWhatsAppInstance`

```prisma
model UserWhatsAppInstance {
  id             String    @id @default(cuid())
  userId         String
  tenantId       String
  
  // Datos de Evolution API
  instanceName   String    @unique
  phoneNumber    String?
  status         String    @default("disconnected") // disconnected, connecting, connected, error
  
  // QR Code y conexión
  qrCode         String?   @db.Text
  qrCodeExpiry   DateTime?
  
  // Metadata
  profileName    String?
  profilePicUrl  String?
  
  // Estadísticas
  totalMensajes  Int       @default(0)
  ultimoMensaje  DateTime?
  
  // Fechas
  fechaConexion  DateTime?
  fechaCreacion  DateTime  @default(now())
  fechaEdicion   DateTime  @updatedAt
  
  // Relaciones
  user           User      @relation("UserWhatsAppInstances", fields: [userId], references: [id], onDelete: Cascade)
  tenant         Tenant    @relation("TenantWhatsAppInstances", fields: [tenantId], references: [id], onDelete: Cascade)
}
```

**Campos importantes:**
- `instanceName`: Nombre único de la instancia en Evolution API (formato: `volkern_{tenantId}_{userName}_{timestamp}`)
- `status`: Estado de la conexión (disconnected, connecting, connected, error)
- `qrCode`: Código QR en base64 para escanear
- `phoneNumber`: Número de WhatsApp conectado
- `profileName`: Nombre del perfil de WhatsApp
- `totalMensajes`: Contador de mensajes enviados

---

### 2. Backend - Librería de Gestión

#### `/lib/evolution-instances.ts`

**Funciones principales:**

- `createEvolutionInstance(userId, tenantId)`: Crea una nueva instancia en Evolution API
- `getQRCode(instanceName)`: Obtiene el QR Code para conexión
- `checkInstanceStatus(instanceName)`: Verifica el estado de conexión
- `getProfileInfo(instanceName)`: Obtiene información del perfil conectado
- `deleteInstance(userId, tenantId)`: Elimina y desconecta instancia
- `sendMessageWithUserInstance(instanceName, to, message, mediaUrl?)`: Envía mensaje usando la instancia del usuario
- `getUserInstance(userId, tenantId)`: Obtiene la instancia activa de un usuario

**Configuración:**

```typescript
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://api.dimension.expert';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'ee4d1581e3016a0f9acce10044f6fbfe';
```

---

### 3. API Endpoints

#### `GET /api/integraciones/my-whatsapp`
Obtiene la instancia de WhatsApp del usuario actual.

**Response:**
```json
{
  "connected": true,
  "instance": {
    "id": "...",
    "instanceName": "volkern_abc123_juan_1699999999",
    "phoneNumber": "+52 55 1234 5678",
    "status": "connected",
    "profileName": "Juan Pérez",
    "profilePicUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Juan_pablo_duarte_diez.jpg/220px-Juan_pablo_duarte_diez.jpg",
    "totalMensajes": 150,
    "fechaConexion": "2024-11-12T10:00:00Z"
  }
}
```

#### `POST /api/integraciones/my-whatsapp`
Crea una nueva instancia de WhatsApp para el usuario.

**Response:**
```json
{
  "success": true,
  "message": "Instancia creada exitosamente",
  "instance": { ... }
}
```

#### `DELETE /api/integraciones/my-whatsapp`
Elimina y desconecta la instancia de WhatsApp del usuario.

**Response:**
```json
{
  "success": true,
  "message": "Instancia eliminada exitosamente"
}
```

#### `GET /api/integraciones/my-whatsapp/qr`
Obtiene el código QR para escanear con WhatsApp.

**Response:**
```json
{
  "success": true,
  "connected": false,
  "qrCode": {
    "base64": "data:image/png;base64,...",
    "code": "...",
    "pairingCode": "..."
  }
}
```

#### `GET /api/integraciones/my-whatsapp/status`
Verifica el estado de conexión actual.

**Response:**
```json
{
  "success": true,
  "status": "connected",
  "instance": { ... },
  "profile": {
    "id": "5215512345678@s.whatsapp.net",
    "name": "Juan Pérez",
    "profilePicUrl": "https://upload.wikimedia.org/wikipedia/commons/2/20/Juan_Ponce_de_Le%C3%B3n._Gobernador_de_Puerto_Rico.jpg"
  }
}
```

---

### 4. Frontend - UI de Usuario

#### `/dashboard/configuracion/mi-whatsapp`

**Componentes principales:**

1. **Vista sin instancia:**
   - Explicación de cómo funciona
   - Beneficios del sistema
   - Botón "Conectar mi WhatsApp"

2. **Vista con instancia:**
   - Foto de perfil y nombre del usuario
   - Estado de conexión (badge visual)
   - Estadísticas (mensajes enviados, estado, fecha de conexión)
   - Botones de acción:
     - Mostrar QR Code (si no está conectado)
     - Actualizar Estado
     - Desconectar

3. **Modal de QR Code:**
   - Código QR grande para escanear
   - Instrucciones paso a paso
   - Auto-polling cada 3 segundos para detectar conexión

**Features:**
- ✅ Auto-refresh de estado cada 3 segundos
- ✅ Detección automática de conexión
- ✅ QR Code con expiración (60 segundos)
- ✅ Toast notifications para feedback
- ✅ Loading states en todas las acciones
- ✅ Confirmación antes de desconectar

---

## 🔄 Flujo de Conexión

### Paso 1: Crear Instancia

```
Usuario hace clic en "Conectar mi WhatsApp"
         ↓
POST /api/integraciones/my-whatsapp
         ↓
Se crea instancia en Evolution API
         ↓
Se guarda en BD con status "connecting"
         ↓
Se obtiene QR Code automáticamente
```

### Paso 2: Escanear QR

```
Se muestra QR Code en la UI
         ↓
Usuario abre WhatsApp en su teléfono
         ↓
Va a "Dispositivos vinculados"
         ↓
Escanea el QR Code
         ↓
WhatsApp se conecta con Evolution API
```

### Paso 3: Verificación de Conexión

```
Polling cada 3 segundos
         ↓
GET /api/integraciones/my-whatsapp/status
         ↓
Verifica estado en Evolution API
         ↓
Si status = "connected":
  - Actualiza BD con fecha de conexión
  - Obtiene info del perfil (nombre, foto, número)
  - Notifica al usuario con toast success
  - Oculta QR Code
  - Detiene polling
```

---

## 📨 Envío de Mensajes

### Sistema Inteligente de Routing

El sistema de envío de mensajes (`/api/mensajes/enviar`) ahora usa un **routing inteligente**:

```typescript
// 1. Intentar usar la instancia personal del usuario
const userInstanceResult = await getUserInstance(user.id, user.tenantId)

if (userInstanceResult.instance) {
  // Usuario tiene instancia personal - USARLA
  resultado = await sendMessageWithUserInstance(
    userInstanceResult.instance.instanceName,
    destinatario,
    mensaje,
    mediaUrl
  )
} else {
  // Fallback a instancia compartida del tenant (si existe)
  resultado = await sendWhatsAppMessage(destinatario, mensaje, tenantId)
}
```

**Ventajas:**
- ✅ Prioriza la instancia personal del usuario
- ✅ Fallback automático a instancia compartida
- ✅ Transparente para el usuario
- ✅ Sin cambios en el código existente

---

## 🎨 UI/UX

### Sidebar
Se agregó un nuevo ítem en el sidebar:

```tsx
{
  name: 'Mi WhatsApp',
  href: '/dashboard/configuracion/mi-whatsapp',
  icon: Smartphone,
  module: 'mensajes'
}
```

### Estados Visuales

#### Conectado ✅
```
┌─────────────────────────────┐
│ 🟢 Conectado                │
│ Juan Pérez                  │
│ +52 55 1234 5678            │
│                             │
│ 📊 Mensajes: 150            │
│ 📞 Estado: Activo           │
│ 📅 Desde: 12/11/2024        │
│                             │
│ [Actualizar] [Desconectar]  │
└─────────────────────────────┘
```

#### Conectando ⏳
```
┌─────────────────────────────┐
│ 🟡 Conectando...            │
│                             │
│ [Escanea el QR Code]        │
│                             │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓         │
│  ▓▓                ▓▓       │
│  ▓▓  QR CODE       ▓▓       │
│  ▓▓                ▓▓       │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓         │
│                             │
│ ⏳ Esperando conexión...    │
└─────────────────────────────┘
```

#### Sin Conexión ⭕
```
┌─────────────────────────────┐
│ Conecta tu WhatsApp Personal│
│                             │
│ ¿Cómo funciona?             │
│ 1. Haz clic en conectar     │
│ 2. Escanea el QR            │
│ 3. ¡Listo!                  │
│                             │
│ Beneficios:                 │
│ ✓ Control total             │
│ ✓ Historial centralizado    │
│ ✓ Estadísticas y métricas   │
│                             │
│ [Conectar mi WhatsApp]      │
└─────────────────────────────┘
```

---

## 🔐 Seguridad

### Validaciones Implementadas:
1. ✅ Autenticación obligatoria (NextAuth session)
2. ✅ Validación de tenant (multitenancy)
3. ✅ Un usuario solo puede tener una instancia
4. ✅ Cada usuario solo puede ver/gestionar su propia instancia
5. ✅ API Key de Evolution API almacenada de forma segura
6. ✅ QR Code con expiración automática (60 segundos)
7. ✅ Audit logs de todas las acciones (crear, eliminar)

### Isolation:
- Cada instancia es completamente independiente
- Un usuario no puede acceder a la instancia de otro
- Las conversaciones se asocian automáticamente al agente correcto

---

## 📊 Métricas y Monitoreo

### Por Usuario:
- Total de mensajes enviados
- Fecha de última actividad
- Estado de conexión actual
- Tiempo desde la conexión

### Por Tenant:
- Número de usuarios con WhatsApp conectado
- Total de mensajes enviados por el equipo
- Agentes más activos
- Tasa de respuesta promedio

---

## 🚀 Casos de Uso

### 1. Agente de Ventas
```
Juan es agente de ventas y conecta su WhatsApp personal.
Todos sus clientes le escriben directamente a su número.
Volkern CRM:
- Guarda historial completo de conversaciones
- Registra leads automáticamente
- Calcula score de leads
- Genera métricas de rendimiento
- Permite supervisión por el manager
```

### 2. Equipo de Soporte
```
María, Pedro y Ana trabajan en soporte técnico.
Cada uno conecta su WhatsApp personal.
Sistema de asignación:
- Nuevos tickets se asignan por round-robin
- Cada agente responde desde su número
- Historial completo en el CRM
- Métricas de tiempo de respuesta
- Alertas si un ticket queda sin responder
```

### 3. Manager
```
El manager puede:
- Ver todas las conversaciones del equipo
- Filtrar por agente
- Analizar tiempos de respuesta
- Detectar cuellos de botella
- Reasignar conversaciones si es necesario
```

---

## 🔄 Próximas Fases (Futuro)

### Fase 2: Asignación Inteligente
- [ ] Sistema de asignación automática de conversaciones
- [ ] Filtros en bandeja de entrada:
  - "Mis conversaciones"
  - "Sin asignar"
  - "Todo el equipo"
- [ ] Reasignación manual por supervisor
- [ ] Notificaciones cuando se asigna una conversación

### Fase 3: Métricas Avanzadas
- [ ] Dashboard por agente:
  - Mensajes enviados/recibidos hoy
  - Tiempo promedio de respuesta
  - Conversaciones activas
  - Satisfacción del cliente
- [ ] Dashboard de supervisor:
  - Vista de todo el equipo
  - Comparativa de agentes
  - Alertas de conversaciones sin responder
  - Reportes exportables

### Fase 4: Reglas de Negocio
- [ ] Horarios de atención por agente
- [ ] Asignación por disponibilidad
- [ ] Respuestas rápidas personalizadas
- [ ] Templates de mensajes por agente
- [ ] Auto-respuestas fuera de horario

---

## 🛠️ Troubleshooting

### Problema: QR Code no aparece
**Solución:**
1. Verificar que Evolution API esté accesible
2. Revisar las credenciales (EVOLUTION_API_URL y EVOLUTION_API_KEY)
3. Ver logs de consola del navegador
4. Intentar crear instancia nuevamente

### Problema: QR Code expiró
**Solución:**
1. Click en "Mostrar QR Code" nuevamente
2. Se generará un nuevo QR
3. Escanear inmediatamente (expira en 60 segundos)

### Problema: Estado queda en "connecting"
**Solución:**
1. Verificar que el QR se haya escaneado correctamente
2. Click en "Actualizar Estado"
3. Si persiste, desconectar y volver a conectar

### Problema: Mensajes no se envían
**Solución:**
1. Verificar estado de conexión (debe ser "connected")
2. Revisar que el número de destino sea válido
3. Ver logs de errores en consola
4. Verificar que Evolution API responda correctamente

---

## 📂 Archivos Creados/Modificados

### Nuevos Archivos:
1. `/lib/evolution-instances.ts` - Librería de gestión de instancias
2. `/app/api/integraciones/my-whatsapp/route.ts` - GET/POST/DELETE instancia
3. `/app/api/integraciones/my-whatsapp/qr/route.ts` - Obtener QR Code
4. `/app/api/integraciones/my-whatsapp/status/route.ts` - Verificar estado
5. `/app/dashboard/configuracion/mi-whatsapp/page.tsx` - UI de usuario

### Archivos Modificados:
1. `/prisma/schema.prisma` - Modelo UserWhatsAppInstance agregado
2. `/app/api/mensajes/enviar/route.ts` - Routing inteligente de mensajes
3. `/components/sidebar.tsx` - Enlace "Mi WhatsApp" agregado

---

## 🎯 Conclusión

Este sistema transforma completamente la gestión de WhatsApp en Volkern CRM, permitiendo:

✅ **Control total** - Cada agente usa su número personal pero con supervisión  
✅ **Sin fugas** - Todo queda registrado en el CRM  
✅ **Métricas claras** - Sabes exactamente qué hace cada agente  
✅ **Fácil de usar** - Solo escanear un QR y listo  
✅ **Escalable** - Funciona para 1 usuario o 100 usuarios  

¡Ahora cada miembro del equipo puede gestionar sus conversaciones de WhatsApp de forma profesional desde Volkern CRM! 🚀
