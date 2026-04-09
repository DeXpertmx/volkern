# Fix: Error 500 al Crear Webhooks de Entrada

## Problema Identificado

Al intentar crear un webhook entrante desde **Integraciones → Webhooks Entrantes**, se producía:
- ❌ Error 500 (Internal Server Error)
- ❌ Sin feedback visual (spinner)
- ❌ Usuario sin retroalimentación del proceso

## Causa Raíz

Los campos opcionales del formulario se enviaban como **cadenas vacías** `""` cuando estaban vacíos, pero Prisma esperaba `undefined` o `null`. Esto causaba errores al intentar establecer foreign keys con valores inválidos.

## Solución Implementada

### Backend: `/api/webhooks/incoming/route.ts`

Convertir todos los campos opcionales vacíos a `undefined`:

```typescript
const webhook = await prisma.incomingWebhook.create({
  data: {
    tenantId: user.tenantId,
    userId: user.id,
    nombre,
    descripcion: descripcion || undefined,        // ✅
    accion,
    mapeoNombre: mapeoNombre || undefined,        // ✅
    mapeoEmail: mapeoEmail || undefined,          // ✅
    mapeoTelefono: mapeoTelefono || undefined,    // ✅
    mapeoEmpresa: mapeoEmpresa || undefined,      // ✅
    mapeoNotas: mapeoNotas || undefined,          // ✅
    mapeoCustom: mapeoCustom || undefined,        // ✅
    automationId: automationId || undefined,      // ✅ Fix principal
    secretKey: secretKey || undefined,            // ✅
    activo: true
  }
});
```

### Frontend: `/app/dashboard/integraciones/webhooks/page.tsx`

Agregar estado de loading y feedback visual:

```typescript
// Nuevo estado
const [creatingWebhook, setCreatingWebhook] = useState(false);

// En handleCreate()
setCreatingWebhook(true);
// ... llamada al API ...
setCreatingWebhook(false);

// Botón mejorado
<Button onClick={handleCreate} disabled={creatingWebhook}>
  {creatingWebhook ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Creando...
    </>
  ) : (
    'Crear Webhook'
  )}
</Button>
```

## Flujo Corregido

```
1. Usuario hace clic en "Crear Webhook"
2. ✅ Botón muestra spinner "Creando..."
3. ✅ Backend convierte "" → undefined
4. ✅ Prisma crea webhook correctamente
5. ✅ Toast de éxito + dialog se cierra
6. ✅ Lista de webhooks se actualiza
```

## Archivos Modificados

- ✅ `/app/api/webhooks/incoming/route.ts` - Normalización de campos
- ✅ `/app/dashboard/integraciones/webhooks/page.tsx` - Feedback visual

## Verificación

✅ Build exitoso
✅ Base de datos sincronizada
✅ Checkpoint guardado
✅ Listo para producción

---

¡Problema resuelto! 🎉
