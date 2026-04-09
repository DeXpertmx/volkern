
# 🚀 Integración Evolution API - Volkern CRM

## Resumen
Integración completa de Evolution API para gestión de mensajes de WhatsApp en Volkern CRM. La integración permite recibir y enviar mensajes, gestionar conversaciones y asociar automáticamente mensajes con leads existentes.

---

## ✅ Funcionalidades Implementadas

### 1. 📥 Webhook de Recepción de Mensajes

**Archivo:** `/app/api/webhooks/evolution/route.ts`

#### Características:
- ✅ **Verificación de Webhook (GET)**: Responde a challenges de Evolution API
- ✅ **Recepción de Mensajes (POST)**: Procesa mensajes entrantes desde WhatsApp
- ✅ **Parser Robusto**: Soporta múltiples formatos de payload de Evolution API
- ✅ **Prevención de Loops**: Filtra mensajes salientes (del bot) automáticamente
- ✅ **CORS Habilitado**: Headers configurados para permitir requests desde Evolution API

#### Formatos de Payload Soportados:
1. **Event-based**: `{ event: 'messages.upsert', data: [...] }`
2. **Array directo**: `{ data: [...] }`
3. **Objeto directo**: `{ data: {...} }`
4. **Body directo**: `{ key: {...}, message: {...} }`

#### Flujo de Procesamiento:
```
Mensaje WhatsApp → Evolution API → Webhook Volkern
                                        ↓
                              1. Parsear mensaje
                              2. Buscar/crear lead
                              3. Buscar/crear conversación
                              4. Registrar mensaje
                              5. Actualizar score del lead
```

---

### 2. 💬 Biblioteca de WhatsApp Mejorada

**Archivo:** `/lib/whatsapp.ts`

#### Funciones Disponibles:

##### Envío de Mensajes:
- **`sendWhatsAppMessage(to, message)`**
  - Envía mensaje de texto simple
  - Limpia automáticamente el formato del número de teléfono
  
- **`sendWhatsAppImage(to, imageUrl, caption?)`**
  - Envía imagen con caption opcional
  
- **`sendWhatsAppDocument(to, documentUrl, filename, caption?)`**
  - Envía documento/PDF con nombre de archivo

##### Gestión de Instancia:
- **`getInstanceStatus()`**
  - Obtiene el estado de conexión de la instancia
  - Retorna: `{ connected: boolean, state: string }`

- **`getInstanceInfo()`**
  - Obtiene información detallada de la instancia
  
- **`getInstanceQRCode()`**
  - Obtiene QR code para conectar nuevo dispositivo
  - Útil para re-conectar WhatsApp

- **`restartInstance()`**
  - Reinicia la instancia de WhatsApp
  
- **`logoutInstance()`**
  - Desconecta WhatsApp de la instancia

---

### 3. 🔄 Gestión Automática de Leads y Conversaciones

#### Lead Management:
- **Búsqueda Inteligente**: Busca leads por los últimos 10 dígitos del teléfono (flexible para diferentes formatos)
- **Creación Automática**: Si no existe lead, crea uno nuevo con:
  - Email temporal: `whatsapp-[últimos10dígitos]@temp.volkern.com`
  - Fuente: `whatsapp-evolution`
  - Score inicial: 30 puntos
  - Tags: `['whatsapp', 'evolution-api']`
  - Nota: Indicación para actualizar información real

#### Conversation Management:
- **Asociación Automática**: Asocia mensajes con conversación existente por lead + canal
- **Creación Automática**: Crea conversación si no existe
- **Actualización en Tiempo Real**:
  - Actualiza `ultimoMensaje` y `fechaUltimoMensaje`
  - Incrementa contador `noLeidos` para mensajes entrantes
  - Actualiza `fechaUltimaActividad` del lead

---

## 🔧 Configuración

### 1. Credenciales de Evolution API

Las credenciales ya están configuradas en el sistema. Se pueden cargar de dos formas:

#### Opción A: Variables de Entorno (`.env`)
```env
EVOLUTION_API_KEY=tu_api_key_aquí
EVOLUTION_API_INSTANCE_NAME=nombre_de_tu_instancia
EVOLUTION_API_URL=https://evo.abacus.ai
```

#### Opción B: Secrets File (Ya configurado)
```json
{
  "evolution api": {
    "secrets": {
      "api_key": {
        "value": "tu_api_key"
      },
      "instance_name": {
        "value": "nombre_instancia"
      }
    }
  }
}
```

### 2. Configurar Webhook en Evolution API

Debes configurar el webhook en tu panel de Evolution API:

**URL del Webhook:**
```
https://volkern.app/api/webhooks/evolution
```

**Eventos a Suscribir:**
- ✅ `messages.upsert` - Mensajes nuevos
- ✅ `messages.update` - Actualizaciones de mensajes
- ✅ `connection.update` - Estado de conexión

**Método:** `POST`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "apikey": "tu_api_key"
}
```

---

## 📖 Casos de Uso

### Caso 1: Cliente Envía Mensaje por Primera Vez

1. **Cliente** envía mensaje por WhatsApp
2. **Evolution API** envía webhook a Volkern
3. **Volkern CRM:**
   - Crea nuevo lead automáticamente
   - Crea conversación inicial
   - Registra el mensaje
   - Asigna score inicial (30 puntos)
4. **Equipo** ve notificación de nuevo lead en el módulo de Mensajes

### Caso 2: Cliente Existente Envía Mensaje

1. **Cliente** (ya registrado) envía mensaje
2. **Evolution API** envía webhook
3. **Volkern CRM:**
   - Identifica lead existente por teléfono
   - Encuentra conversación existente
   - Agrega mensaje a la conversación
   - Incrementa contador de no leídos
   - Actualiza actividad del lead (+5 puntos si mensaje largo)

### Caso 3: Equipo Responde desde CRM

1. **Agente** responde desde módulo de Mensajes
2. **Volkern** usa `sendWhatsAppMessage()` para enviar
3. **Evolution API** entrega mensaje al cliente por WhatsApp
4. **Volkern** registra mensaje saliente en conversación

---

## 🛠️ Uso en el Código

### Enviar Mensaje de Texto

```typescript
import { sendWhatsAppMessage } from '@/lib/whatsapp';

const result = await sendWhatsAppMessage(
  '+52 55 1234 5678',
  'Hola, gracias por tu interés en nuestros servicios.'
);

if (result.success) {
  console.log('Mensaje enviado:', result.messageId);
} else {
  console.error('Error:', result.error);
}
```

### Enviar Imagen

```typescript
import { sendWhatsAppImage } from '@/lib/whatsapp';

const result = await sendWhatsAppImage(
  '+52 55 1234 5678',
  'https://i.ytimg.com/vi/ThPsQDMzbFk/oar2.jpg?sqp=-oaymwEYCJUDENAFSFqQAgHyq4qpAwcIARUAAIhC&rs=AOn4CLDfioeTKH79JukuBktL5nQs_NSCPg',
  'Aquí está la información que solicitaste'
);
```

### Enviar Documento

```typescript
import { sendWhatsAppDocument } from '@/lib/whatsapp';

const result = await sendWhatsAppDocument(
  '+52 55 1234 5678',
  'https://example.com/cotizacion.pdf',
  'Cotizacion_2024.pdf',
  'Tu cotización está lista'
);
```

### Verificar Estado de Conexión

```typescript
import { getInstanceStatus } from '@/lib/whatsapp';

const status = await getInstanceStatus();

if (status.connected) {
  console.log('WhatsApp conectado ✅');
} else {
  console.log('WhatsApp desconectado ❌');
}
```

### Obtener QR Code para Conectar

```typescript
import { getInstanceQRCode } from '@/lib/whatsapp';

const qr = await getInstanceQRCode();

if (qr.success) {
  // Mostrar qr.qrcode en la UI como imagen base64
  console.log('QR Code:', qr.qrcode);
}
```

---

## 🔍 Troubleshooting

### Webhook no recibe mensajes

1. **Verificar URL en Evolution API:**
   - ✅ URL correcta: `https://volkern.app/api/webhooks/evolution`
   - ✅ Método: POST
   - ✅ Eventos suscritos: `messages.upsert`

2. **Verificar logs del servidor:**
   ```bash
   # Ver logs en tiempo real
   tail -f /var/log/nextjs/output.log
   ```

3. **Probar webhook manualmente:**
   ```bash
   curl -X POST https://volkern.app/api/webhooks/evolution \
     -H "Content-Type: application/json" \
     -d '{"event":"messages.upsert","data":[{"key":{"remoteJid":"5215512345678@s.whatsapp.net"},"message":{"conversation":"Test"}}]}'
   ```

### Lead no se asocia correctamente

1. **Verificar formato del teléfono:**
   - Sistema busca por últimos 10 dígitos
   - Asegúrate de que el teléfono en el lead incluya el número completo

2. **Revisar logs:**
   ```
   📱 Mensaje parseado: { from: "5215512345678", ... }
   ```

### Mensajes del bot causan loop

- ✅ **Ya resuelto**: El webhook filtra automáticamente mensajes con `direction: 'outgoing'`
- ✅ **Verificación**: Solo procesa mensajes con `direction: 'incoming'`

### Error de credenciales

1. **Verificar secrets file:**
   ```bash
   cat /home/ubuntu/.config/abacusai_auth_secrets.json
   ```

2. **Verificar variables de entorno:**
   ```bash
   echo $EVOLUTION_API_KEY
   echo $EVOLUTION_API_INSTANCE_NAME
   ```

3. **Recargar credenciales:**
   - Reinicia el servidor Next.js
   - Las credenciales se cargan automáticamente al inicio

---

## 📊 Métricas y Logging

### Logs Disponibles:

El webhook genera logs detallados para debugging:

```
🔍 Evolution Webhook - Verificación GET recibida
🚀 Evolution Webhook - Mensaje recibido
📨 Evolution Webhook Body: {...}
📱 Mensaje parseado: {...}
🆕 Creando nuevo lead para 5215512345678
🆕 Creando nueva conversación para lead abc123
✅ Mensaje registrado: msg_xyz789
```

### Audit Logs:

Todos los eventos importantes se registran en `AuditLog`:
- Creación de leads desde WhatsApp
- Asociación de mensajes
- Actualizaciones de score

---

## 🎯 Próximos Pasos Recomendados

### Fase 2 (Futuro)
- 🔜 Panel de gestión de instancia en Dashboard
  - Ver estado de conexión en tiempo real
  - Generar QR code desde la UI
  - Reiniciar instancia desde el CRM
  
- 🔜 Respuestas automáticas con IA
  - Integrar con ChatGPT/Claude para respuestas inteligentes
  - Templates de respuestas rápidas
  
- 🔜 Botones interactivos y listas
  - Soportar mensajes con botones
  - Menús de selección
  
- 🔜 Estados de mensaje
  - Tracking de entrega, lectura, etc.
  
- 🔜 Grupos de WhatsApp
  - Soporte para mensajes de grupos

---

## 🔒 Seguridad

### Validaciones Implementadas:
- ✅ Filtrado de mensajes del sistema (deleted, missed calls)
- ✅ Prevención de loops (ignora mensajes salientes)
- ✅ Validación de campos requeridos (from, message)
- ✅ Manejo seguro de errores con try-catch

### Recomendaciones:
- 🔐 Mantener `api_key` en secrets file (nunca en código)
- 🔐 Usar HTTPS para todas las comunicaciones
- 🔐 Validar webhook signatures (próxima implementación)
- 🔐 Rate limiting en el webhook (próxima implementación)

---

## 📝 Diferencias con Anytimebot

| Característica | Anytimebot | Evolution API |
|----------------|------------|---------------|
| Tipo | Plataforma con bot IA | API directa de WhatsApp |
| Hosting | Externo | Self-hosted o cloud |
| Chatbot IA | ✅ Incluido | ❌ Manual/Custom |
| Costo | Por mensaje | API gratuita/hosting |
| Flexibilidad | Media | Alta |
| Control | Limitado | Total |

---

## ✅ Checklist de Implementación

- ☑️ Webhook creado y configurado
- ☑️ Biblioteca de WhatsApp mejorada
- ☑️ Parser robusto de mensajes
- ☑️ Gestión automática de leads
- ☑️ Sistema de conversaciones integrado
- ☑️ Funciones de gestión de instancia
- ☑️ Documentación completa
- ⬜ Configurar webhook en Evolution API
- ⬜ Probar flujo completo de mensajes
- ⬜ Capacitar al equipo en el módulo

---

## 🆘 Soporte

### Logs del Sistema:
```bash
# Ver logs de webhook
tail -f /var/log/nextjs/output.log | grep "Evolution"

# Ver logs de base de datos
tail -f /var/log/postgresql/postgresql.log
```

### Testing del Webhook:
```bash
# Test verificación GET
curl https://volkern.app/api/webhooks/evolution?hub.challenge=test123

# Test mensaje POST
curl -X POST https://volkern.app/api/webhooks/evolution \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert","data":[{"key":{"remoteJid":"5215512345678@s.whatsapp.net"},"message":{"conversation":"Hola"}}]}'
```

---

¡Integración Evolution API lista para usar! 🎉

Para más información sobre Evolution API, consulta: https://doc.evolution-api.com/
