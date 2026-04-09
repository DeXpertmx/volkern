# 🔧 Solución: Error al Crear Diseños en Canva

## 📋 Resumen del Problema

El error **"Error al crear diseño en Canva"** se producía porque la integración OAuth de Canva **no estaba solicitando los permisos (scopes) necesarios** para crear diseños.

### Error Técnico:
```json
{
  "error": "Error al crear diseño en Canva",
  "details": {
    "code": "missing_scopes",
    "message": "Missing scopes"
  },
  "status": 403
}
```

---

## ✅ Solución Implementada

Se actualizó el archivo `/lib/canva-oauth.ts` para incluir los scopes necesarios en la URL de autorización OAuth:

### Scopes Agregados:
```typescript
const scopes = [
  'design:content:read',   // Leer contenido de diseños
  'design:content:write',  // Crear y modificar diseños ← CRÍTICO
  'design:meta:read',      // Leer metadatos de diseños
  'asset:read',            // Leer assets (imágenes, etc.)
].join(' ');
```

**Documentación oficial:** https://www.canva.dev/docs/connect/api-reference/authentication/

---

## 🔐 Configuración Requerida en Canva Developer Portal

**IMPORTANTE:** Además del cambio en el código, debes verificar que tu aplicación en Canva tenga configurados los scopes correctos.

### Pasos para Configurar Scopes en Canva:

1. **Ve a Canva Developer Portal:**
   - URL: https://www.canva.com/developers/apps
   - Inicia sesión con tu cuenta de Canva

2. **Selecciona tu aplicación:**
   - Busca la aplicación "Volkern - Campaign" o la que estés usando
   - Haz clic para abrir la configuración

3. **Configurar Scopes (Permisos):**
   - Ve a la sección **"Scopes"** o **"Permissions"**
   - Asegúrate de que los siguientes scopes estén habilitados:
     - ✅ `design:content:read`
     - ✅ `design:content:write`
     - ✅ `design:meta:read`
     - ✅ `asset:read`
   
4. **Verificar Redirect URIs:**
   - En la sección **"Redirect URIs"** o **"OAuth Settings"**
   - Asegúrate de que está configurada la URL de callback:
     ```
     https://volkern.app/api/canva/callback
     ```
   - Si tienes otros dominios (desarrollo, staging), agrégalos también:
     ```
     http://localhost:3000/api/canva/callback
     https://volkern.app/api/canva/callback
     ```

5. **Guardar Cambios:**
   - Haz clic en **"Save"** o **"Update"**
   - Espera a que los cambios se apliquen (puede tomar unos segundos)

---

## 👤 Pasos para el Usuario Final

Dado que los scopes han cambiado, **todos los usuarios que ya conectaron Canva deben reconectar su cuenta** para otorgar los nuevos permisos.

### Cómo Reconectar Canva:

1. **Ir a Campañas:**
   - Desde el dashboard, navega a **Campañas → Nueva Campaña**
   - Ve a la pestaña **"Canales y Mensajes"**
   - Haz clic en **"Diseñar con Canva"**

2. **Reconectar Cuenta:**
   - Si aparece el error, cierra el modal
   - Refresca la página (F5)
   - Vuelve a hacer clic en **"Diseñar con Canva"**
   - Si sigue conectado con los permisos antiguos, el sistema detectará que faltan scopes

3. **Desconectar y Reconectar (Si es necesario):**
   - Opción A: Eliminar la integración desde Canva:
     - Ve a https://www.canva.com/settings/connected-accounts
     - Busca "Volkern" o tu aplicación
     - Haz clic en **"Revoke access"** o **"Remove"**
   
   - Opción B: Limpiar desde la base de datos (requiere acceso admin):
     ```sql
     UPDATE users
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'::jsonb),
       '{canvaAuth}',
       'null'
     )
     WHERE email = 'email@usuario.com';
     ```

4. **Autorizar con Nuevos Permisos:**
   - Vuelve a **Dashboard → Campañas → Nueva Campaña**
   - Haz clic en **"Diseñar con Canva"**
   - Haz clic en **"Conectar con Canva"**
   - **IMPORTANTE:** Verás una pantalla de autorización de Canva que ahora incluirá los nuevos permisos
   - Haz clic en **"Permitir"** o **"Allow"**

5. **Probar Creación de Diseño:**
   - Selecciona un tamaño de diseño (ej: "Anuncio de Facebook")
   - Haz clic en **"Abrir Editor de Canva"**
   - Deberías ver el editor de Canva abrirse en una nueva ventana
   - Diseña tu imagen
   - Haz clic en **"Importar Diseño"** cuando termines

---

## 🧪 Cómo Verificar que Funciona

### Test de Integración:

1. **Conectar Canva:** Debe completarse sin errores
2. **Abrir Editor:** Debe abrir el editor de Canva en nueva ventana
3. **Crear Diseño:** Debe permitir crear un diseño en blanco
4. **Importar Diseño:** Debe exportar e importar la imagen correctamente

### Logs Esperados (Consola del Servidor):

```log
Estado de autenticación Canva: {
  tieneMetadata: true,
  tieneCanvaAuth: true,
  tieneAccessToken: true,
  tokenLength: [número]
}

📤 Enviando solicitud a Canva API: {
  payload: { asset_type: 'design', title: 'Nuevo diseño...' },
  hasToken: true
}

📥 Respuesta de Canva API: {
  status: 201,  ← Debe ser 201 (Created) no 403
  statusText: 'Created'
}

✅ Diseño creado exitosamente: {
  id: '[design_id]',
  tieneUrls: true,
  editUrl: 'https://www.canva.com/design/[design_id]/edit'
}
```

---

## ❗ Troubleshooting

### Problema: Sigue apareciendo el error "missing_scopes"

**Posibles causas:**

1. **Los scopes no están configurados en Canva Developer Portal**
   - Solución: Sigue los pasos en "Configuración Requerida en Canva Developer Portal"

2. **El usuario no ha reconectado su cuenta**
   - Solución: El usuario debe desconectar y reconectar Canva

3. **Cache del token antiguo**
   - Solución: Espera 10-15 minutos o limpia el token manualmente desde la DB

### Problema: La autorización OAuth falla

**Verificar:**
- ✅ `NEXT_PUBLIC_CANVA_CLIENT_ID` está configurado en `.env`
- ✅ `CANVA_CLIENT_SECRET` está configurado en `.env`
- ✅ La Redirect URI coincide exactamente en Canva Portal y en el código
- ✅ La aplicación de Canva está en modo "Production" (no "Development")

### Problema: El diseño se crea pero no se puede editar

**Verificar:**
- ✅ El scope `design:content:write` está habilitado
- ✅ La URL de edición es válida (debe comenzar con `https://www.canva.com/design/`)

---

## 📚 Referencias

- **Canva Connect API Docs:** https://www.canva.dev/docs/connect/
- **Authentication Guide:** https://www.canva.dev/docs/connect/api-reference/authentication/
- **Scopes Reference:** https://www.canva.dev/docs/connect/api-reference/scopes/
- **Design API:** https://www.canva.dev/docs/connect/api-reference/designs/

---

## ✨ Mejoras Futuras Recomendadas

1. **Refresh Token Automático:**
   - Implementar lógica para refrescar tokens expirados automáticamente
   - Usar el endpoint `/api/canva/refresh-token`

2. **Manejo de Errores Mejorado:**
   - Detectar específicamente el error "missing_scopes"
   - Mostrar modal explicativo pidiendo reconectar

3. **Gestión de Scopes Dinámicos:**
   - Solicitar solo los scopes necesarios según la funcionalidad usada
   - Ejemplo: Solo pedir `design:content:write` cuando se vaya a crear un diseño

4. **Panel de Gestión de Integración:**
   - Agregar página en `/dashboard/integraciones/canva`
   - Mostrar scopes actuales, estado de conexión, y botón para reconectar

---

## ✅ Checklist de Implementación

- [x] Agregar scopes a `lib/canva-oauth.ts`
- [x] Verificar que compile correctamente
- [ ] Configurar scopes en Canva Developer Portal
- [ ] Verificar Redirect URIs en Canva Portal
- [ ] Notificar a usuarios existentes sobre reconexión
- [ ] Probar flujo completo de OAuth
- [ ] Verificar creación de diseños
- [ ] Verificar importación de diseños
- [ ] Documentar proceso en ayuda/FAQs

---

🎉 **¡La integración de Canva ahora debería funcionar correctamente!**

Si persisten los problemas después de seguir estos pasos, revisar los logs del servidor y del navegador para obtener más detalles del error específico.
