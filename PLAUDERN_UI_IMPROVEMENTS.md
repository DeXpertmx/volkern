
# ✅ Mejoras en el Formulario de Integración de Plaudern

## 📋 Resumen

Se han implementado mejoras significativas en el formulario de configuración de Plaudern para hacer la integración mucho más clara, intuitiva y funcional.

---

## 🎯 Problema Original

El formulario de integración de Plaudern tenía varios problemas de usabilidad:

1. **Campo "Bot ID" confuso**: Los usuarios no sabían qué poner (¿UUID? ¿Nombre del bot?).
2. **Sin validación visual**: No había forma de verificar que el Integration ID era correcto antes de guardar.
3. **Falta de claridad**: Los campos "Integration ID" y "Bot ID" no eran autoexplicativos.
4. **No se podían ver bots disponibles**: Los usuarios debían adivinar o buscar el Bot ID manualmente.

### Ejemplo del problema:
```
❌ Integration ID: "Prueba" (¿Es correcto? ¿Qué va aquí?)
❌ Bot ID: f169b839-7163-4087-a5fa-9a8689bf3110 (UUID difícil de manejar)
```

---

## ✅ Solución Implementada

### 1. 📝 Campos Más Claros y Descriptivos

#### A. Integration ID
**Antes:**
```tsx
{ 
  name: 'integrationId', 
  label: 'Integration ID', 
  type: 'text', 
  placeholder: 'volkern-prod'
}
```

**Ahora:**
```tsx
{ 
  name: 'integrationId', 
  label: 'Integration ID', 
  type: 'text', 
  placeholder: 'volkern-prod', 
  defaultValue: 'volkern-prod',
  required: true,
  helper: 'Nombre único de tu workspace en Plaudern (ej: volkern-prod, mi-empresa)'
}
```

#### B. Bot por Defecto
**Antes:**
```tsx
{ 
  name: 'botId', 
  label: 'Bot ID (opcional)', 
  type: 'text', 
  placeholder: 'Se autodetecta si tienes un solo bot',
  helper: 'Déjalo vacío para usar el primer bot disponible'
}
```

**Ahora:**
```tsx
{ 
  name: 'botId', 
  label: 'Bot por Defecto', 
  type: 'bot-select', 
  placeholder: 'Selecciona un bot',
  helper: 'Usa el botón "Cargar Bots" para ver tus bots disponibles'
}
```

---

### 2. 🔄 Select Dinámico con Botón "Cargar Bots"

Se implementó un dropdown dinámico que carga y muestra los bots disponibles en tu cuenta de Plaudern.

#### Flujo de Usuario:

```
1. Usuario ingresa API Key (JWT Token) ✓
2. Usuario ingresa Integration ID ✓
3. Usuario hace click en 🔄 "Cargar Bots"
   ↓
4. Sistema llama a Plaudern API con credenciales temporales
   ↓
5. Dropdown se llena con bots disponibles:
   ┌────────────────────────────┐
   │ Selecciona un bot      ▼  │
   ├────────────────────────────┤
   │ 🤖 Bot de Ventas          │
   │ 💬 Bot de Soporte         │
   │ 📞 Bot de Atención        │
   └────────────────────────────┘
6. Usuario selecciona su bot preferido ✓
7. Sistema guarda el Bot ID automáticamente
```

#### Código del Select Dinámico:

```tsx
{campo.type === 'bot-select' ? (
  <>
    <Label htmlFor={campo.name}>
      {campo.label}
      {campo.required && <span className="text-red-500 ml-1">*</span>}
    </Label>
    <div className="flex gap-2">
      <Select
        value={formData[campo.name] || ''}
        onValueChange={(value) => handleInputChange(campo.name, value)}
        disabled={availableBots.length === 0}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={campo.placeholder || 'Selecciona un bot'} />
        </SelectTrigger>
        <SelectContent>
          {availableBots.length === 0 ? (
            <SelectItem value="no-bots" disabled>
              Sin bots disponibles
            </SelectItem>
          ) : (
            availableBots.map((bot) => (
              <SelectItem key={bot.id} value={bot.id}>
                {bot.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={cargarBots}
        disabled={loadingBots || !formData.apiKey || !formData.integrationId}
        title="Cargar bots disponibles"
      >
        {loadingBots ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
      </Button>
    </div>
    {campo.helper && (
      <p className="text-xs text-muted-foreground mt-1">
        {campo.helper}
      </p>
    )}
    {!formData.apiKey || !formData.integrationId ? (
      <p className="text-xs text-amber-600 mt-1">
        ⚠️ Primero ingresa el API Key y el Integration ID
      </p>
    ) : null}
  </>
) : (
  // ... otros tipos de campos
)}
```

---

### 3. 🔧 Backend: Autenticación Temporal

Se agregó soporte para autenticación temporal en el endpoint de bots, permitiendo cargar bots SIN tener la integración guardada.

#### Archivo: `/app/api/plaudern/bots/route.ts`

**Nueva funcionalidad POST con dos modos:**

```typescript
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    
    // Modo 1: Autenticación temporal (para cargar bots antes de guardar integración)
    if (body.tempAuth === true) {
      const { apiKey, integrationId } = body

      if (!apiKey || !integrationId) {
        return NextResponse.json(
          { error: 'Se requiere apiKey e integrationId para autenticación temporal' },
          { status: 400 }
        )
      }

      try {
        // Obtener bots usando credenciales temporales
        const bots = await getPlaudernBots(apiKey, integrationId)
        return NextResponse.json({ bots, success: true })
      } catch (error: any) {
        console.error('Error al obtener bots con auth temporal:', error)
        return NextResponse.json(
          { error: error.message || 'Error al cargar bots' },
          { status: 500 }
        )
      }
    }

    // Modo 2: Creación de bot (lógica existente)
    // ... resto del código para crear bots
  } catch (error: any) {
    console.error('Error en POST /api/plaudern/bots:', error)
    return NextResponse.json(
      { error: error.message || 'Error al procesar solicitud' },
      { status: 500 }
    )
  }
}
```

---

### 4. 🎨 Frontend: Función `cargarBots`

#### Archivo: `/app/dashboard/integraciones/page.tsx`

```typescript
const cargarBots = async () => {
  if (!formData.apiKey || !formData.integrationId) {
    toast.error('Primero ingresa el API Key y el Integration ID')
    return
  }

  setLoadingBots(true)
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const res = await fetch('/api/plaudern/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tempAuth: true,  // ← Modo de autenticación temporal
        apiKey: formData.apiKey,
        integrationId: formData.integrationId
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      if (data.bots && data.bots.length > 0) {
        const botsList = data.bots.map((bot: any) => ({
          id: bot.id,
          name: bot.name || bot.id
        }))
        setAvailableBots(botsList)
        toast.success(`${botsList.length} bot(s) encontrados`)
      } else {
        setAvailableBots([])
        toast.warning('No se encontraron bots. Crea uno primero en Plaudern.')
      }
    } else {
      const error = await res.json()
      toast.error(error.error || 'Error al cargar bots')
    }
  } catch (error: any) {
    console.error('Error loading bots:', error)
    if (error.name === 'AbortError') {
      toast.error('La carga de bots tomó demasiado tiempo')
    } else {
      toast.error('Error al cargar bots')
    }
  } finally {
    setLoadingBots(false)
  }
}
```

---

## 📊 Comparación: Antes vs Ahora

### Experiencia del Usuario

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Bot ID** | UUID largo y confuso `f169b839-7163-4087...` | Nombre amigable seleccionable "Bot de Ventas" |
| **Integration ID** | No había indicación de qué poner | Helper text claro + valor por defecto |
| **Validación** | Solo al guardar | Validación en tiempo real con "Cargar Bots" |
| **Ver bots** | Imposible, debías ir a Plaudern | Click en 🔄 y lista todos los bots |
| **Claridad** | Confuso, requería documentación | Auto-explicativo con hints |

---

### Flujo de Configuración

**Antes:**
```
1. ❓ ¿Qué poner en Integration ID?
2. ❓ ¿Qué es el Bot ID?
3. 🤞 Ingresar datos y esperar que funcionen
4. ❌ Error 404: Bot no encontrado
5. 😞 Reintentar con otros valores
```

**Ahora:**
```
1. ✅ Ingresar API Key (JWT Token) - con hint claro
2. ✅ Ingresar Integration ID (volkern-prod por defecto) - con helper
3. 🔄 Click en "Cargar Bots"
4. ✅ Seleccionar bot de la lista con nombres legibles
5. ✅ Guardar configuración
6. 🎉 Todo funciona a la primera
```

---

## 🔧 Archivos Modificados

### 1. Frontend - UI
**Archivo:** `/app/dashboard/integraciones/page.tsx`

**Cambios:**
- ✅ Agregados imports de `Select` components y `RefreshCw` icon
- ✅ Nuevos estados: `availableBots`, `loadingBots`
- ✅ Nueva función: `cargarBots()`
- ✅ Actualizado campo `botId` de tipo `'bot-select'`
- ✅ Lógica de renderizado condicional para bot-select
- ✅ Helper text actualizado para `integrationId`

**Líneas afectadas:** ~50 líneas nuevas/modificadas

---

### 2. Backend - API
**Archivo:** `/app/api/plaudern/bots/route.ts`

**Cambios:**
- ✅ Función `POST` modificada para soportar dos modos:
  - Modo 1: `tempAuth: true` → Carga bots sin integración guardada
  - Modo 2: Creación de bot (lógica existente)
- ✅ Validaciones mejoradas
- ✅ Mensajes de error más descriptivos

**Líneas afectadas:** ~40 líneas nuevas

---

### 3. Configuración de Campos
**Archivo:** `/app/dashboard/integraciones/page.tsx` (INTEGRACIONES_DISPONIBLES)

**Cambios en objeto de Plaudern:**

```typescript
campos: [
  { 
    name: 'apiKey', 
    label: 'API Key de Plaudern (JWT Token)', 
    type: 'password', 
    required: true, 
    helper: 'Tu JWT Token de autenticación obtenido desde Plaudern API' 
  },
  { 
    name: 'integrationId', 
    label: 'Integration ID', 
    type: 'text', 
    defaultValue: 'volkern-prod',
    required: true,
    helper: 'Nombre único de tu workspace en Plaudern (ej: volkern-prod, mi-empresa)' 
  },
  { 
    name: 'botId', 
    label: 'Bot por Defecto', 
    type: 'bot-select',  // ← Nuevo tipo
    placeholder: 'Selecciona un bot',
    helper: 'Usa el botón "Cargar Bots" para ver tus bots disponibles' 
  },
  // ... resto de campos
]
```

---

## 🧪 Casos de Uso

### Caso 1: Usuario Nuevo Configurando Plaudern

**Pasos:**
1. Usuario va a **Dashboard → Integraciones**
2. Click en "Plaudern Chatbot"
3. Ingresa JWT Token en "API Key"
4. Ve "Integration ID" pre-llenado con `volkern-prod`
5. Click en botón 🔄 junto a "Bot por Defecto"
6. Sistema carga y muestra 3 bots disponibles
7. Usuario selecciona "Bot de Ventas" del dropdown
8. Click en "Guardar"
9. ✅ Integración configurada exitosamente

**Resultado:**
- Bot ID guardado automáticamente: `f169b839-7163-4087-a5fa-9a8689bf3110`
- Usuario nunca vio el UUID

---

### Caso 2: Usuario Sin Bots Creados

**Pasos:**
1. Usuario ingresa API Key e Integration ID
2. Click en botón 🔄 "Cargar Bots"
3. Sistema retorna lista vacía
4. Mensaje toast: ⚠️ "No se encontraron bots. Crea uno primero en Plaudern."
5. Usuario va a Plaudern Dashboard y crea un bot
6. Regresa a Volkern y click en 🔄 nuevamente
7. Ahora ve el bot recién creado
8. Selecciona y guarda

**Resultado:**
- Usuario guiado sobre qué hacer cuando no hay bots

---

### Caso 3: Credenciales Incorrectas

**Pasos:**
1. Usuario ingresa API Key inválido
2. Click en 🔄 "Cargar Bots"
3. Error toast: ❌ "Error al cargar bots: Invalid JWT Token"
4. Usuario corrige el API Key
5. Click en 🔄 nuevamente
6. Ahora funciona correctamente

**Resultado:**
- Validación inmediata sin necesidad de guardar

---

## 🎯 Beneficios de las Mejoras

### 1. ✅ Usabilidad Mejorada
- **Claridad**: Campos auto-explicativos con helpers
- **Validación inmediata**: Verificar credenciales antes de guardar
- **Visual**: Ver nombres de bots en lugar de UUIDs

### 2. ✅ Menos Errores
- **Pre-validación**: Detectar problemas antes de guardar
- **Guías contextuales**: Hints y warnings en tiempo real
- **Feedback claro**: Toasts descriptivos para cada acción

### 3. ✅ Flujo Más Rápido
- **1 click para cargar bots**: En lugar de copiar/pegar UUIDs
- **Valores por defecto**: `volkern-prod` pre-llenado
- **Dropdown intuitivo**: Selección visual en lugar de texto

### 4. ✅ Mejor DX (Developer Experience)
- **Código reutilizable**: Tipo `'bot-select'` puede usarse en otros formularios
- **API flexible**: Modo `tempAuth` útil para otros flujos
- **Mantenible**: Lógica clara y documentada

---

## 🔐 Seguridad

### Validaciones Implementadas

1. **Autenticación requerida**: Solo usuarios logueados pueden cargar bots
2. **Timeout de 15 segundos**: Previene cuelgues en caso de API lenta
3. **Manejo de errores**: Captura y reporta errores de manera segura
4. **No persistencia**: Credenciales temporales NO se guardan en BD

### Flujo de Seguridad

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND                                │
│  Usuario ingresa: apiKey + integrationId                    │
└────────────────────┬────────────────────────────────────────┘
                    │ POST /api/plaudern/bots
                    │ { tempAuth: true, apiKey, integrationId }
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  VOLKERN API                                │
│  ✓ Valida sesión de usuario                                │
│  ✓ NO guarda credenciales                                  │
│  ✓ Solo retorna lista de bots                              │
└────────────────────┬────────────────────────────────────────┘
                    │ getPlaudernBots(apiKey, integrationId)
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  PLAUDERN API                               │
│  ✓ Valida JWT Token                                        │
│  ✓ Retorna bots del workspace                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Estados del Botón "Cargar Bots"

### 1. Estado Inicial (Deshabilitado)
```
⚠️ Primero ingresa el API Key y el Integration ID
[🔄]  (botón deshabilitado, gris)
```

### 2. Estado Listo
```
[🔄 Cargar Bots]  (botón azul, clickable)
```

### 3. Estado Cargando
```
[⏳ Cargando...]  (spinner animado, deshabilitado)
```

### 4. Estado Exitoso
```
✅ 3 bot(s) encontrados
[🔄]  (botón listo para recargar)
```

### 5. Estado Error
```
❌ Error al cargar bots: Invalid JWT Token
[🔄]  (botón listo para reintentar)
```

---

## 🚀 Próximos Pasos Sugeridos

### Fase 2 (Opcional)

1. **Auto-refresh de bots**: Recargar lista cada vez que se abre el formulario
2. **Cache de bots**: Guardar lista temporalmente para no recargar en cada edición
3. **Crear bot desde formulario**: Agregar botón "+" para crear bot sin salir de Volkern
4. **Multi-selección de bots**: Permitir configurar múltiples bots por defecto
5. **Validación de Integration ID**: Verificar en tiempo real que el ID exista en Plaudern

---

## 📖 Documentación para Usuarios

### Cómo Configurar Plaudern (Actualizado)

#### Paso 1: Obtener API Key (JWT Token)

1. Ve a **Plaudern Dashboard** (https://plaudern.abacusai.app)
2. Login o crea una cuenta
3. Obtén tu JWT Token:

```bash
curl -X POST https://plaudern.abacusai.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tu-email@ejemplo.com",
    "password": "tu-contraseña"
  }'
```

Respuesta:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

4. Copia el `access_token`

---

#### Paso 2: Configurar en Volkern CRM

1. Ve a **Dashboard → Integraciones**
2. Click en **"Plaudern Chatbot"**
3. Completa el formulario:

```
┌────────────────────────────────────────────────────────────┐
│ API Key de Plaudern (JWT Token) *                         │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...               │ │
│ └────────────────────────────────────────────────────────┘ │
│ Tu JWT Token de autenticación obtenido desde Plaudern API │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ Integration ID *                                           │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ volkern-prod                                           │ │
│ └────────────────────────────────────────────────────────┘ │
│ Nombre único de tu workspace en Plaudern                  │
│ (ej: volkern-prod, mi-empresa)                            │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ Bot por Defecto                                            │
│ ┌────────────────────────────────────────────────┐  [🔄]  │
│ │ Selecciona un bot                          ▼  │         │
│ └────────────────────────────────────────────────┘         │
│ Usa el botón "Cargar Bots" para ver tus bots disponibles  │
└────────────────────────────────────────────────────────────┘
```

4. **Click en 🔄** para cargar tus bots
5. Selecciona tu bot preferido del dropdown
6. Completa campos opcionales (Webhook Secret, checkboxes)
7. Click en **"Guardar"**
8. ✅ Integración configurada

---

#### Paso 3: Verificar Configuración

1. Ve a **Dashboard → Plaudern**
2. Deberías ver tu bot listado
3. Prueba enviar un mensaje

---

## ✅ Checklist de Implementación

- [x] Actualizar definición de campos en `INTEGRACIONES_DISPONIBLES`
- [x] Agregar estados `availableBots` y `loadingBots`
- [x] Implementar función `cargarBots()`
- [x] Crear renderizado condicional para `type: 'bot-select'`
- [x] Actualizar backend para soportar `tempAuth`
- [x] Agregar validaciones de seguridad
- [x] Implementar manejo de errores
- [x] Agregar feedback visual (toasts, loading, warnings)
- [x] Probar con credenciales válidas
- [x] Probar con credenciales inválidas
- [x] Probar con cuenta sin bots
- [x] Compilar sin errores
- [x] Documentar cambios

---

## 🎉 Conclusión

Las mejoras implementadas transforman el formulario de integración de Plaudern de una experiencia confusa y propensa a errores a un flujo intuitivo, guiado y validado en tiempo real.

**Principales logros:**
- ✅ **Claridad**: Campos auto-explicativos
- ✅ **Validación**: Verificación antes de guardar
- ✅ **UX mejorado**: Select visual en lugar de UUIDs
- ✅ **Menos errores**: Feedback inmediato
- ✅ **Más rápido**: 1 click para cargar bots

---

**Fecha:** 2024-11-20  
**Status:** ✅ Implementado y Compilado Exitosamente  
**Próximo Paso:** Listo para pruebas en producción
