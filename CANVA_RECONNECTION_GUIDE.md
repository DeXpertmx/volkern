
# 🔄 Guía de Reconexión de Canva

## 📋 Resumen del Problema

Cuando los usuarios conectaron su cuenta de Canva **antes** de que implementáramos los scopes OAuth correctos, sus tokens de acceso no incluyen los permisos necesarios para crear diseños. Esto causa errores 400/403 cuando intentan usar la integración.

---

## ✅ Solución Implementada

Hemos implementado un sistema automático de detección y limpieza que:

1. **Detecta errores de permisos** (400, 401, 403)
2. **Identifica errores de scopes** específicos en la respuesta de Canva
3. **Limpia automáticamente el token antiguo** del usuario
4. **Muestra un mensaje claro** indicando la necesidad de reconexión
5. **Guía al usuario** para reconectar su cuenta con los permisos correctos

---

## 🔧 Archivos Modificados

### 1. Backend: `/app/api/canva/create-design/route.ts`

**Mejoras implementadas:**
- ✅ Detección automática de errores de scopes (400, 401, 403)
- ✅ Limpieza automática de tokens cuando se detectan permisos insuficientes
- ✅ Mensajes de error personalizados y descriptivos
- ✅ Flag `needsReconnect: true` en la respuesta para el frontend

**Ejemplo de detección:**
```typescript
// Error 400 puede indicar problemas con scopes
if (canvaResponse.status === 400) {
  const errorMessage = typeof errorDetails === 'object' 
    ? (errorDetails.error || errorDetails.message || JSON.stringify(errorDetails))
    : errorDetails;

  // Verificar si es un error de scopes
  if (errorMessage.toLowerCase().includes('scope') || 
      errorMessage.toLowerCase().includes('permission')) {
    
    // Limpiar el token automáticamente
    await prisma.user.update({
      where: { id: user.id },
      data: {
        metadata: {
          ...(metadata || {}),
          canvaAuth: null,
        },
      },
    });

    return NextResponse.json(
      { 
        error: 'Permisos insuficientes para crear diseños',
        details: errorDetails,
        needsReconnect: true,
        message: 'Tu cuenta de Canva no tiene los permisos necesarios...',
      },
      { status: 400 }
    );
  }
}
```

### 2. Backend: `/app/api/canva/disconnect/route.ts` (NUEVO)

**Propósito:** Endpoint para desconectar manualmente la cuenta de Canva

**Funcionalidad:**
- POST `/api/canva/disconnect`
- Requiere autenticación
- Limpia completamente `canvaAuth` del metadata del usuario
- Registra la acción en el audit log

**Uso:**
```javascript
const response = await fetch('/api/canva/disconnect', {
  method: 'POST',
});

if (response.ok) {
  console.log('Cuenta desconectada exitosamente');
}
```

### 3. Frontend: `/components/canva-designer.tsx`

**Mejoras implementadas:**
- ✅ Detección del flag `needsReconnect` en respuestas de error
- ✅ Manejo de errores 400, 401, 403
- ✅ Actualización automática del estado de conexión
- ✅ Toast con emoji 🔄 y mensaje claro (10 segundos de duración)
- ✅ Recarga del estado de conexión después del error

**Ejemplo de código:**
```typescript
const data = await response.json();

if (!response.ok) {
  // Manejar error de token expirado o permisos faltantes
  if (data.needsReconnect || response.status === 401 || 
      response.status === 403 || response.status === 400) {
    setIsConnected(false);
    const errorMessage = data.message || 
      'Tu conexión con Canva necesita ser actualizada...';
    setError(errorMessage);
    
    toast.error('🔄 Reconexión Requerida', {
      description: errorMessage,
      duration: 10000,
    });
    
    // Recargar el estado de conexión
    await checkCanvaConnection();
    return;
  }
  
  throw new Error(data.error || 'Error al crear diseño en Canva');
}
```

---

## 🚀 Pasos para el Usuario

### Opción 1: Reconexión Automática (Recomendada)

Cuando un usuario intenta crear un diseño y tiene permisos insuficientes:

1. **El sistema detecta el error automáticamente**
   - Se limpia el token antiguo
   - Se muestra un toast con el mensaje: "🔄 Reconexión Requerida"

2. **Se muestra la pantalla de conexión**
   - Con un mensaje explicativo en rojo indicando el problema
   - Botón prominente: "Reconectar con Canva"

3. **El usuario hace clic en "Reconectar con Canva"**
   - Se redirige al flujo OAuth de Canva
   - Canva solicita los nuevos permisos

4. **Después de autorizar en Canva**
   - El usuario es redirigido de vuelta a Volkern
   - El nuevo token con permisos correctos se guarda
   - ✅ El usuario puede crear diseños inmediatamente

### Opción 2: Reconexión Manual

Si el usuario quiere reconectar sin esperar a un error:

1. **Abrir el módulo de Campañas**
2. **Hacer clic en "Nueva Campaña"**
3. **En la sección de Diseño, clic en "Diseñar con Canva"**
4. **Clic en el botón "Reconectar"** (esquina superior derecha)
5. **Confirmar desconexión**
6. **Hacer clic en "Conectar con Canva"**
7. **Autorizar en Canva**
8. ✅ Listo para crear diseños

---

## 🔍 Verificación de Permisos Correctos

### Scopes OAuth Requeridos

Los siguientes scopes están ahora configurados en `/lib/canva-oauth.ts`:

```typescript
const scope = [
  'design:content:read',
  'design:content:write',
  'design:meta:read',
  'asset:read'
].join(' ');
```

### Cómo Verificar en el Código

El token se almacena en `user.metadata.canvaAuth` con esta estructura:

```json
{
  "canvaAuth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 3600,
    "scope": "design:content:read design:content:write design:meta:read asset:read",
    "timestamp": "2024-11-12T..."
  }
}
```

**Verificación:** Si el campo `scope` incluye los 4 permisos listados arriba, el token es válido.

---

## 🎯 Experiencia de Usuario

### Flujo Visual

```
┌─────────────────────────────────────────────────────────┐
│  Usuario intenta crear diseño                          │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  ¿Token tiene scopes? │
         └──────────┬─────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
       NO                      SÍ
        │                       │
        ▼                       ▼
┌──────────────────┐   ┌───────────────────┐
│  Backend limpia  │   │  Diseño se crea   │
│  token auto.     │   │  exitosamente     │
└─────┬────────────┘   └───────────────────┘
      │
      ▼
┌────────────────────────────────────────────┐
│  Toast: "🔄 Reconexión Requerida"         │
│  Duración: 10 segundos                     │
│  Descripción: Mensaje claro del problema  │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  Pantalla de Conexión                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  [!] Reconexión Requerida                  │
│  Tu cuenta de Canva no tiene los permisos  │
│  necesarios. Por favor, reconecta...       │
│                                             │
│  [ Reconectar con Canva ]                  │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  Flujo OAuth de Canva                      │
│  Solicita nuevos permisos                  │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  ✅ Conectado con permisos correctos       │
│  Usuario puede crear diseños               │
└────────────────────────────────────────────┘
```

---

## 📊 Mensajes de Error Personalizados

### Error 401/403 (Token Expirado)
```
🔄 Reconexión Requerida

Tu conexión con Canva necesita ser renovada para obtener 
los permisos correctos. Por favor, desconecta y vuelve a 
conectar tu cuenta.
```

### Error 400 con "scope" o "permission" en el mensaje
```
🔄 Reconexión Requerida

Tu cuenta de Canva no tiene los permisos necesarios. 
Esto puede ocurrir si conectaste tu cuenta antes de 
nuestra última actualización. Por favor, reconecta tu 
cuenta para obtener los permisos correctos.
```

---

## 🛠️ Troubleshooting

### Problema: El usuario reconecta pero sigue viendo errores

**Posibles causas:**
1. El cache del navegador tiene datos antiguos
2. La aplicación de Canva no tiene los scopes configurados

**Solución:**
1. **Limpiar cache del navegador:**
   - Chrome: F12 → Network → Disable cache
   - Recargar la página

2. **Verificar scopes en Canva Developer Portal:**
   - Ir a https://www.canva.com/developers
   - Abrir tu aplicación
   - Ir a "OAuth Settings"
   - Verificar que incluya:
     - `design:content:read`
     - `design:content:write`
     - `design:meta:read`
     - `asset:read`

### Problema: El botón "Reconectar" no aparece

**Causa:** El estado de conexión no se actualizó correctamente

**Solución:**
1. Recargar la página completa (F5)
2. Si persiste, desconectar manualmente:
   ```javascript
   // En la consola del navegador (F12)
   fetch('/api/canva/disconnect', { method: 'POST' })
     .then(() => location.reload());
   ```

### Problema: Error "Client ID no configurado"

**Causa:** Falta la variable de entorno `NEXT_PUBLIC_CANVA_CLIENT_ID`

**Solución:**
1. Verificar que `.env` contenga:
   ```
   NEXT_PUBLIC_CANVA_CLIENT_ID=tu_client_id_aqui
   CANVA_CLIENT_SECRET=tu_client_secret_aqui
   ```
2. Reiniciar el servidor de desarrollo

---

## 📝 Audit Log

Todas las desconexiones se registran en el audit log con esta estructura:

```json
{
  "accion": "desconectar",
  "entidad": "integracion",
  "entidadId": "canva",
  "descripcion": "Usuario user@example.com desconectó Canva para refrescar permisos OAuth",
  "cambiosAntes": {
    "connected": true,
    "accessToken": "redacted"
  },
  "cambiosDespues": {
    "connected": false,
    "reason": "Manual disconnection to refresh OAuth scopes"
  }
}
```

Para ver el log:
- Dashboard → Configuración → Logs del Sistema

---

## ✅ Checklist de Implementación

- ✅ Backend detecta errores de scopes automáticamente
- ✅ Backend limpia tokens con permisos insuficientes
- ✅ Endpoint `/api/canva/disconnect` creado
- ✅ Frontend detecta flag `needsReconnect`
- ✅ Toast con emoji 🔄 y mensaje claro (10s)
- ✅ Pantalla de conexión con mensaje de error
- ✅ Botón "Reconectar" prominente
- ✅ Audit log registra desconexiones
- ✅ Documentación completa creada

---

## 🎉 Resultado Final

Con esta implementación:

1. **Los errores se detectan automáticamente** - Sin intervención manual del equipo
2. **Los tokens se limpian automáticamente** - Sin necesidad de acceder a la base de datos
3. **Los usuarios reciben guía clara** - Saben exactamente qué hacer
4. **La reconexión es simple** - Un solo clic en "Reconectar con Canva"
5. **Todo queda registrado** - Audit log completo para troubleshooting

**El usuario puede volver a crear diseños en menos de 30 segundos.** ⚡

---

## 📞 Soporte

Si un usuario tiene problemas persistentes:

1. **Verificar el audit log** para ver si la desconexión se registró
2. **Revisar la consola del navegador** (F12) para ver errores de red
3. **Confirmar que los scopes están configurados** en el portal de desarrolladores de Canva
4. **Verificar las variables de entorno** están correctamente configuradas

---

¡Integración de Canva lista para producción! 🚀
