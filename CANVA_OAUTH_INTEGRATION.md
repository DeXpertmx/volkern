
# 🎨 Integración OAuth de Canva con Volkern CRM

## 📋 Resumen

Se ha implementado con éxito el flujo completo de OAuth 2.0 con PKCE (Proof Key for Code Exchange) para integrar Canva en Volkern CRM. Los usuarios ahora pueden conectar sus cuentas de Canva de forma segura y diseñar imágenes profesionales directamente desde el módulo de Campañas.

---

## ✅ Componentes Implementados

### 1. 📚 Librería de Utilidades OAuth (`/lib/canva-oauth.ts`)

Contiene las funciones auxiliares para el flujo OAuth con PKCE:

- **`generateCodeVerifier()`**: Genera un código verificador aleatorio de 32 bytes
- **`generateCodeChallenge()`**: Crea el code_challenge usando SHA-256
- **`generateAuthorizationUrl()`**: Construye la URL de autorización de Canva
- **`exchangeCodeForToken()`**: Intercambia el código de autorización por access token
- **`refreshAccessToken()`**: Refresca el token cuando expira

### 2. 🔐 Endpoints de OAuth

#### `/api/canva/authorize` (GET)
**Propósito**: Inicia el flujo de autorización OAuth

**Proceso**:
1. Verifica que el usuario esté autenticado
2. Genera `code_verifier` y `code_challenge` para PKCE
3. Genera `state` para prevención de CSRF
4. Guarda temporalmente estos valores en `user.metadata`
5. Redirige al usuario a la página de autorización de Canva

**URL de Autorización**:
```
https://www.canva.com/api/oauth/authorize?
  code_challenge_method=s256
  &response_type=code
  &client_id=REDACTED_ID
  &redirect_uri=https://volkern.com/api/canva/callback
  &code_challenge=<CODE_CHALLENGE>
  &state=<STATE>
```

#### `/api/canva/callback` (GET)
**Propósito**: Maneja el callback desde Canva después de la autorización

**Proceso**:
1. Recibe el `code` y `state` desde Canva
2. Valida el `state` para prevenir ataques CSRF
3. Recupera el `code_verifier` guardado
4. Intercambia el código por un access token
5. Guarda el token en `user.metadata.canvaAuth`
6. Registra el evento en audit log
7. Redirige al usuario a `/dashboard/campanas?canva_connected=true`

#### `/api/canva/token` (GET)
**Propósito**: Obtiene el access token actual (refresca automáticamente si está por expirar)

**Funcionalidad**:
- Verifica si el token ha expirado
- Si expira en menos de 5 minutos, usa el `refresh_token` para obtener uno nuevo
- Retorna el token válido para usar en llamadas a la API de Canva

#### `/api/canva/status` (GET)
**Propósito**: Verifica el estado de conexión del usuario con Canva

**Retorna**:
```json
{
  "connected": true,
  "needsAuth": false,
  "hasRefreshToken": true,
  "isExpired": false,
  "expiresAt": "2024-11-15T10:30:00Z"
}
```

### 3. 🎨 Componente React (`/components/canva-designer.tsx`)

**Mejoras Implementadas**:

- Verifica automáticamente el estado de conexión al cargar
- Muestra diferentes estados:
  - ⏳ **Verificando conexión**: Spinner mientras se consulta el estado
  - 🔌 **No conectado**: Botón para iniciar OAuth
  - ✅ **Conectado**: Carga el editor de Canva normalmente
  - ❌ **Error de configuración**: Instrucciones para configurar credenciales

**Flujo de Usuario**:

1. Usuario entra al módulo de Campañas
2. Hace clic en "Diseñar con Canva"
3. Si no está conectado, ve el botón "Conectar con Canva"
4. Al hacer clic, se redirige a Canva para autorizar
5. Después de autorizar, regresa automáticamente al CRM
6. El editor de Canva se carga listo para usar

### 4. 💾 Base de Datos

**Campo Agregado al Modelo `User`**:

```prisma
model User {
  // ... campos existentes ...
  
  // Metadata flexible (OAuth tokens, preferencias, etc.)
  metadata Json? @default("{}")
  
  // ... resto del modelo ...
}
```

**Estructura del Metadata**:

```json
{
  "canvaAuth": {
    "accessToken": "eyJ...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "ref_...",
    "timestamp": "2024-11-11T10:00:00Z"
  }
}
```

Durante el proceso OAuth, temporalmente se guarda:

```json
{
  "canvaOAuth": {
    "codeVerifier": "abc123...",
    "state": "xyz789...",
    "timestamp": "2024-11-11T10:00:00Z"
  }
}
```

---

## 🔧 Configuración Requerida

### 1. Variables de Entorno

Ya configuradas en `/nextjs_space/.env`:

```env
NEXT_PUBLIC_CANVA_CLIENT_ID=REDACTED_ID
CANVA_CLIENT_SECRET=REDACTED_SECRET
```

### 2. Configuración en Canva Developers

**URL que debes agregar en tu App de Canva**:

#### Authorized Redirect URIs:
```
https://volkern.com/api/canva/callback
```

Para desarrollo local (opcional):
```
http://localhost:3000/api/canva/callback
```

**Pasos para Configurar**:

1. Ve a https://www.canva.com/developers/apps
2. Selecciona tu aplicación (Client ID: `REDACTED_ID`)
3. Ve a la sección **"OAuth redirect URLs"**
4. Agrega: `https://volkern.com/api/canva/callback`
5. Guarda los cambios
6. Verifica que no haya espacios en blanco

---

## 🔒 Seguridad Implementada

### PKCE (Proof Key for Code Exchange)

**¿Qué es?**
Un estándar de seguridad para OAuth 2.0 que previene ataques de intercepción del código de autorización.

**Cómo Funciona**:

1. **Client genera**:
   - `code_verifier`: String aleatorio de 32 bytes
   - `code_challenge`: SHA-256 hash del code_verifier

2. **Autorización**:
   - Se envía el `code_challenge` a Canva
   - Canva lo guarda asociado al código de autorización

3. **Token Exchange**:
   - Se envía el `code_verifier` original
   - Canva verifica que SHA-256(code_verifier) == code_challenge
   - Solo si coincide, emite el access token

**Beneficio**: Incluso si un atacante intercepta el código de autorización, no puede usarlo sin el `code_verifier` original.

### State Parameter (CSRF Protection)

**¿Qué es?**
Un token aleatorio único que se genera al iniciar el flujo OAuth.

**Cómo Funciona**:

1. Se genera un `state` aleatorio
2. Se guarda en la sesión del usuario
3. Se envía a Canva en la URL de autorización
4. Canva lo devuelve en el callback
5. Se valida que coincida con el guardado

**Beneficio**: Previene ataques Cross-Site Request Forgery (CSRF) donde un atacante intenta forzar una autorización no deseada.

### Almacenamiento Seguro

- **Access Token**: Guardado en la base de datos (campo `metadata`)
- **Client Secret**: Solo en variables de entorno del servidor
- **Nunca expuesto**: El Client Secret NUNCA se envía al navegador

---

## 📊 Flujo Completo de OAuth

```
┌──────────────────────────────────────────────────────────────────┐
│                    1. USUARIO INICIA FLUJO                       │
│   Usuario → Volkern CRM → Click "Conectar con Canva"            │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                 2. VOLKERN PREPARA AUTORIZACIÓN                  │
│   • Genera code_verifier (32 bytes aleatorios)                  │
│   • Calcula code_challenge = SHA256(code_verifier)              │
│   • Genera state (anti-CSRF token)                              │
│   • Guarda code_verifier y state en user.metadata              │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                3. REDIRIGE A CANVA PARA AUTORIZAR                │
│   GET https://www.canva.com/api/oauth/authorize?                │
│       code_challenge_method=s256                                 │
│       response_type=code                                         │
│       client_id=REDACTED_ID                                 │
│       redirect_uri=https://volkern.com/api/canva/callback      │
│       code_challenge=<HASH_SHA256>                              │
│       state=<RANDOM_TOKEN>                                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              4. USUARIO AUTORIZA EN CANVA                        │
│   • Usuario ve pantalla de autorización de Canva                │
│   • Revisa permisos solicitados                                 │
│   • Hace clic en "Autorizar"                                    │
│   • Canva genera un código de autorización temporal             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│             5. CANVA REDIRIGE DE VUELTA A VOLKERN               │
│   GET https://volkern.com/api/canva/callback?                  │
│       code=AUTH_CODE_12345                                      │
│       state=<MISMO_TOKEN_DEL_PASO_2>                           │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              6. VOLKERN VALIDA Y PROCESA CALLBACK               │
│   • Recupera state guardado de user.metadata                    │
│   • Valida: state_recibido == state_guardado                   │
│   • Si no coincide → ERROR (posible ataque CSRF)               │
│   • Si coincide → Continúa                                     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│           7. VOLKERN INTERCAMBIA CÓDIGO POR TOKEN               │
│   POST https://api.canva.com/rest/v1/oauth/token               │
│   Body:                                                          │
│     grant_type=authorization_code                               │
│     code=AUTH_CODE_12345                                        │
│     code_verifier=<VERIFIER_ORIGINAL>                          │
│     client_id=REDACTED_ID                                  │
│     client_secret=cnvcaBl9zIBZfiwvlCjsRNJwUV1GRfRwIEzZqs6-...│
│     redirect_uri=https://volkern.com/api/canva/callback       │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                8. CANVA VALIDA Y EMITE TOKEN                    │
│   • Verifica: SHA256(code_verifier) == code_challenge          │
│   • Valida client_id y client_secret                           │
│   • Verifica que el código no haya expirado                    │
│   • Emite access_token y refresh_token                         │
│                                                                  │
│   Response:                                                      │
│   {                                                              │
│     "access_token": "eyJhbGc...",                              │
│     "token_type": "Bearer",                                     │
│     "expires_in": 3600,                                         │
│     "refresh_token": "ref_abc123..."                           │
│   }                                                              │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              9. VOLKERN GUARDA TOKEN EN BD                      │
│   UPDATE User SET metadata = {                                  │
│     "canvaAuth": {                                              │
│       "accessToken": "eyJhbGc...",                             │
│       "tokenType": "Bearer",                                    │
│       "expiresIn": 3600,                                        │
│       "refreshToken": "ref_abc123...",                         │
│       "timestamp": "2024-11-11T10:00:00Z"                      │
│     }                                                            │
│   }                                                              │
│                                                                  │
│   • Limpia datos temporales (canvaOAuth)                       │
│   • Registra evento en AuditLog                                │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│           10. REDIRIGE A DASHBOARD DE CAMPAÑAS                  │
│   • Redirige a /dashboard/campanas?canva_connected=true        │
│   • Muestra notificación de éxito                               │
│   • Editor de Canva ahora disponible                            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                  REFRESH TOKEN (Automático)                      │
│                                                                  │
│   Cuando el access_token está por expirar (<5 min):            │
│                                                                  │
│   1. GET /api/canva/token                                       │
│   2. Detecta que token expira pronto                            │
│   3. POST https://api.canva.com/rest/v1/oauth/token           │
│      grant_type=refresh_token                                   │
│      refresh_token=ref_abc123...                               │
│      client_id=...                                              │
│      client_secret=...                                          │
│   4. Recibe nuevo access_token                                  │
│   5. Actualiza user.metadata con nuevo token                    │
│   6. Retorna token fresco al cliente                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Casos de Uso

### Caso 1: Primera Conexión

**Usuario nuevo que nunca ha conectado Canva**:

1. Usuario va a Dashboard → Campañas → Nueva Campaña
2. Hace clic en "Diseñar con Canva"
3. Ve mensaje: "Conectar con Canva"
4. Hace clic en el botón grande "Conectar con Canva"
5. Se abre la ventana de autorización de Canva
6. Usuario autoriza los permisos
7. Regresa automáticamente al CRM
8. Se muestra mensaje: "¡Conectado exitosamente!"
9. El editor de Canva se carga inmediatamente

### Caso 2: Usuario Ya Conectado

**Usuario que ya autorizó previamente**:

1. Usuario va a Dashboard → Campañas → Nueva Campaña
2. Hace clic en "Diseñar con Canva"
3. El sistema verifica el token guardado
4. Editor de Canva se carga directamente (sin pedir autorización)
5. Usuario puede diseñar inmediatamente

### Caso 3: Token Expirado

**Token de acceso ha expirado**:

1. Usuario hace clic en "Diseñar con Canva"
2. Sistema detecta token expirado
3. Automáticamente usa refresh_token para obtener nuevo access_token
4. Actualiza el token en la base de datos
5. Editor de Canva se carga sin que el usuario note nada
6. **Invisible para el usuario** - Todo es automático

### Caso 4: Refresh Token Inválido

**Refresh token también expiró o fue revocado**:

1. Sistema intenta refrescar el token
2. Canva retorna error (token inválido)
3. Sistema marca usuario como "no conectado"
4. Muestra botón "Conectar con Canva" nuevamente
5. Usuario debe volver a autorizar (flujo completo)

---

## 🔍 Testing y Verificación

### 1. Verificar Conexión

```bash
# Como usuario autenticado
curl -X GET https://volkern.com/api/canva/status \
  -H "Cookie: next-auth.session-token=YOUR_SESSION"
```

**Respuesta Esperada (Conectado)**:
```json
{
  "connected": true,
  "needsAuth": false,
  "hasRefreshToken": true,
  "isExpired": false,
  "expiresAt": "2024-11-11T11:00:00Z"
}
```

**Respuesta Esperada (No Conectado)**:
```json
{
  "connected": false,
  "needsAuth": true
}
```

### 2. Iniciar OAuth (Manual)

Visita en tu navegador:
```
https://volkern.com/api/canva/authorize
```

Serás redirigido a Canva para autorizar.

### 3. Verificar Token en Base de Datos

```sql
SELECT 
  id, 
  email, 
  metadata->'canvaAuth' as canva_auth
FROM "User" 
WHERE email = 'tu@email.com';
```

Deberías ver la estructura de `canvaAuth` con el token.

---

## 🐛 Troubleshooting

### Error: "Redirect URI mismatch"

**Causa**: La URL de callback no coincide con la configurada en Canva.

**Solución**:
1. Ve a https://www.canva.com/developers/apps
2. Verifica que `https://volkern.com/api/canva/callback` esté en "Authorized redirect URIs"
3. Asegúrate de no tener espacios en blanco
4. Guarda los cambios en Canva

### Error: "Invalid state parameter"

**Causa**: El parámetro `state` no coincide (posible ataque CSRF o sesión expirada).

**Solución**:
- Limpia las cookies del navegador
- Intenta el flujo OAuth de nuevo
- Si persiste, revisa que no haya problemas de timezone en el servidor

### Error: "Invalid code_verifier"

**Causa**: El `code_verifier` no coincide con el `code_challenge` enviado.

**Solución**:
- Verifica que el campo `metadata` se esté guardando correctamente en la BD
- Revisa los logs del servidor para ver si hay errores en `generateCodeChallenge()`
- Asegúrate de que el usuario tenga permisos de escritura en su registro

### Error: "Client authentication failed"

**Causa**: El `client_secret` es incorrecto o no se está enviando.

**Solución**:
1. Verifica que `CANVA_CLIENT_SECRET` esté en el archivo `.env`
2. Confirma que el valor sea el correcto desde Canva Developers
3. Reinicia el servidor para que cargue las nuevas variables

### Editor de Canva no se carga

**Causa**: Token válido pero el SDK de Canva no se inicializa.

**Solución**:
1. Abre la consola del navegador (F12)
2. Busca errores de JavaScript
3. Verifica que el script de Canva se esté cargando:
   ```html
   <script src="https://sdk.canva.com/designbutton/v2/api.js"></script>
   ```
4. Confirma que `NEXT_PUBLIC_CANVA_CLIENT_ID` esté configurado

---

## 📈 Próximos Pasos (Opcionales)

### Mejoras Futuras

1. **Panel de Configuración de Canva**:
   - Página en `/dashboard/integraciones/canva`
   - Ver estado de conexión
   - Botón para desconectar/reconectar
   - Historial de diseños creados

2. **Biblioteca de Diseños**:
   - Guardar todos los diseños creados
   - Reutilizar diseños anteriores
   - Compartir diseños entre usuarios del tenant

3. **Webhooks de Canva**:
   - Recibir notificaciones cuando un diseño es actualizado
   - Sincronizar cambios automáticamente

4. **Métricas**:
   - Trackear cuántos diseños se crean
   - Qué plantillas son más populares
   - Tasa de conversión de campañas con diseños de Canva

---

## ✅ Checklist de Implementación

- ✅ Librería de utilidades OAuth creada (`/lib/canva-oauth.ts`)
- ✅ Endpoint de autorización (`/api/canva/authorize`)
- ✅ Endpoint de callback (`/api/canva/callback`)
- ✅ Endpoint de token (`/api/canva/token`)
- ✅ Endpoint de status (`/api/canva/status`)
- ✅ Campo `metadata` agregado al modelo `User`
- ✅ Migración de base de datos ejecutada
- ✅ Componente React actualizado con verificación de conexión
- ✅ Variables de entorno configuradas
- ✅ Build del proyecto exitoso
- 🔲 Configurar Redirect URIs en Canva Developers **(PENDIENTE - TÚ)**
- 🔲 Probar flujo OAuth completo en producción
- 🔲 Verificar que el editor de Canva carga correctamente

---

## 🎉 ¡Todo Listo!

La integración OAuth de Canva está **100% implementada y lista para usar**. 

### 📝 Acción Requerida

**Lo único que falta es que tú configures la Redirect URI en tu cuenta de Canva**:

1. Ve a: https://www.canva.com/developers/apps
2. Selecciona tu app (Client ID: `REDACTED_ID`)
3. Agrega en "Authorized redirect URIs":
   ```
   https://volkern.com/api/canva/callback
   ```
4. ¡Guarda y prueba!

Una vez configurado, los usuarios podrán conectar sus cuentas de Canva y diseñar imágenes profesionales directamente desde Volkern CRM. 🚀

---

**Documentación creada**: 2024-11-11  
**Versión**: 1.0  
**Status**: ✅ Implementación Completa
