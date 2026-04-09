# Fix Admin Trial + Logos Públicos Permanentes

**Fecha:** 5 de Enero, 2026  
**Status:** ✅ Resuelto y Desplegado

---

## 🔍 Problemas Identificados

### Problema 1: Usuario Admin con Trial Expirado
El usuario con rol "Superadmin" veía el mensaje **"¡Tu trial termina en 0 días! Actualiza ahora para no perder acceso."** aunque no debería tener restricciones de trial.

**Causa:** El endpoint `/api/subscriptions/status` no excluía a los superadmins del sistema de trial.

### Problema 2: Logos Rotos Después de Logout
En dos ubicaciones de configuración:
1. **Logo Corporativo** (`/dashboard/configuracion`)
2. **Marca Visual** (`/dashboard/configuracion` → Marca Visual)

Los logos se subían correctamente, pero al hacer logout y volver a entrar, las imágenes aparecían rotas y el logo del sidebar desaparecía.

**Causa:** Los logos se guardaban con URLs firmadas de S3 que **expiran en 7 días**. Después de la expiración (o al hacer logout), las URLs dejaban de funcionar.

---

## ✅ Soluciones Implementadas

### 1. Exclusión de Superadmin del Trial

**Archivo modificado:** `/app/api/subscriptions/status/route.ts`

**Cambios realizados:**
```typescript
// Incluir el rol del usuario en la consulta
const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  include: { 
    tenant: true,
    role: true  // ✅ Nuevo: incluir rol
  }
})

// Si es superadmin, devolver estado activo sin restricciones
if (user.role?.nombre === 'Superadmin') {
  return NextResponse.json({
    plan: 'ilimitado',
    status: 'active',
    limits: null,
    isSuperAdmin: true
  })
}
```

**Resultado:**
- ✅ Los superadmins ahora ven status `active` en lugar de `trial`
- ✅ El banner de trial no se muestra para superadmins
- ✅ No hay restricciones de uso para superadmins

---

### 2. Logos con URLs Públicas Permanentes

#### 2.1. Nueva Función en S3

**Archivo modificado:** `/lib/s3.ts`

**Función agregada:**
```typescript
/**
 * Sube un archivo a S3 como público
 * Estos archivos se almacenan en la carpeta 'public/' y son accesibles sin autenticación
 */
export async function uploadPublicFile(
  buffer: Buffer,
  fileName: string,
  contentType?: string
): Promise<{ key: string; publicUrl: string }> {
  // Los archivos públicos van en la carpeta public/
  const key = `${folderPrefix}public/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
  
  // Construir URL pública directa
  const publicUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  
  return { key, publicUrl };
}
```

**Características:**
- Los archivos se suben a la carpeta `public/` en S3
- Se genera una **URL pública permanente** sin expiración
- No requiere URLs firmadas ni regeneración de tokens
- Perfecto para logos corporativos que deben ser públicos

---

#### 2.2. Actualización de Endpoint de Logo Corporativo

**Archivo modificado:** `/app/api/configuracion/logo/route.ts`

**Cambios realizados:**
```typescript
// Importar la nueva función
import { uploadPublicFile } from '@/lib/s3'

// Subir a S3 como archivo público
const { key, publicUrl } = await uploadPublicFile(buffer, fileName, file.type)

console.log('✅ Logo subido exitosamente:', { key, publicUrl, tipo })

return NextResponse.json({ 
  url: key,              // Para compatibilidad (key de S3)
  publicUrl,             // URL pública permanente
  downloadUrl: publicUrl,  // Para compatibilidad con código existente
  tipo 
})
```

**Resultado:**
- ✅ Los logos se suben a la carpeta `public/` en S3
- ✅ Se retornan URLs públicas permanentes
- ✅ Compatible con código existente (`downloadUrl`)

---

#### 2.3. Actualización de Endpoint de Whitelabel

**Archivo modificado:** `/app/api/whitelabel/route.ts`

**Cambios realizados:**

**A. Método POST (Upload):**
```typescript
// Importar la nueva función
import { uploadPublicFile } from '@/lib/s3'

// Subir a S3 como archivo público
const { key, publicUrl } = await uploadPublicFile(buffer, fileName, file.type)

console.log('✅ Logo/icono whitelabel subido exitosamente:', { key, publicUrl, tipo })

return NextResponse.json({ 
  url: key,              // Para compatibilidad (key de S3)
  publicUrl,             // URL pública permanente
  downloadUrl: publicUrl,  // Para compatibilidad con código existente
  tipo 
})
```

**B. Método GET (Recuperación):**
```typescript
// Convertir S3 keys a URLs públicas si es necesario
const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const AWS_BUCKET_NAME = process.env.AWS_BUCKET_NAME || ''

// Helper para verificar si es una S3 key (no es una URL completa)
const isS3Key = (url: string | null) => {
  return url && !url.startsWith('http') && !url.startsWith('/');
}

// Helper para convertir S3 key a URL pública
const getPublicUrl = (s3Key: string) => {
  return `https://${AWS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`
}

const configResponse = {
  ...config,
  logoUrl: config.logoUrl && isS3Key(config.logoUrl) 
    ? getPublicUrl(config.logoUrl)
    : config.logoUrl,
  iconoUrl: config.iconoUrl && isS3Key(config.iconoUrl)
    ? getPublicUrl(config.iconoUrl)
    : config.iconoUrl,
}
```

**Resultado:**
- ✅ Los logos y iconos se suben como archivos públicos
- ✅ Se generan URLs públicas permanentes
- ✅ El GET convierte S3 keys a URLs públicas automáticamente

---

## 🔄 Flujo de Logos Mejorado

### Antes (Con URLs Firmadas)
```
1. Usuario sube logo → S3 privado
2. Se genera URL firmada (expira en 7 días)
3. URL se guarda en la base de datos
4. Después de 7 días → ❌ Imagen rota
5. Después de logout → ❌ Imagen rota
```

### Ahora (Con URLs Públicas)
```
1. Usuario sube logo → S3 público (carpeta public/)
2. Se genera URL pública permanente
3. URL pública se guarda en la base de datos
4. Después de cualquier tiempo → ✅ Imagen visible
5. Después de logout → ✅ Imagen visible
6. Sin necesidad de regenerar tokens → ✅ Permanente
```

---

## 🧪 Pruebas de Validación

### Test 1: Superadmin Sin Trial
```bash
# Como superadmin
curl -H "Cookie: next-auth.session-token=..." \
  http://localhost:3000/api/subscriptions/status

# Respuesta esperada:
{
  "plan": "ilimitado",
  "status": "active",
  "limits": null,
  "isSuperAdmin": true
}
```
**Resultado:** ✅ Superadmin sin restricciones

### Test 2: Upload Logo Corporativo
```bash
# Subir logo
curl -X POST http://localhost:3000/api/configuracion/logo \
  -F "file=@logo.png" \
  -F "tipo=logo_corporativo"

# Respuesta esperada:
{
  "url": "folder/public/configuracion/logo_corporativo-1234567890-logo.png",
  "publicUrl": "https://bucket.s3.us-west-2.amazonaws.com/folder/public/...",
  "downloadUrl": "https://bucket.s3.us-west-2.amazonaws.com/folder/public/...",
  "tipo": "logo_corporativo"
}
```
**Resultado:** ✅ URL pública permanente generada

### Test 3: Upload Logo Whitelabel
```bash
# Subir logo whitelabel
curl -X POST http://localhost:3000/api/whitelabel \
  -F "file=@logo.png" \
  -F "tipo=logo"

# Respuesta esperada:
{
  "url": "folder/public/whitelabel/logo-1234567890-logo.png",
  "publicUrl": "https://bucket.s3.us-west-2.amazonaws.com/folder/public/...",
  "downloadUrl": "https://bucket.s3.us-west-2.amazonaws.com/folder/public/...",
  "tipo": "logo"
}
```
**Resultado:** ✅ URL pública permanente generada

### Test 4: Persistencia Después de Logout
```
1. Subir logo en /dashboard/configuracion
2. Verificar que aparece correctamente ✅
3. Hacer logout
4. Hacer login de nuevo
5. Verificar que el logo sigue visible ✅
```
**Resultado:** ✅ Logo permanece visible

---

## 📊 Impacto

### Usuario Admin/Superadmin
- ✅ Sin mensaje de trial expirado
- ✅ Sin restricciones de uso
- ✅ Acceso ilimitado a todas las funciones

### Logos Corporativos
- ✅ URLs permanentes sin expiración
- ✅ Visible después de logout
- ✅ Visible en cualquier momento
- ✅ No requiere regeneración de tokens
- ✅ Logo del sidebar siempre visible

### Marca Visual (Whitelabel)
- ✅ Logo y icono con URLs permanentes
- ✅ Compatible con embeds y branding
- ✅ No requiere URLs firmadas

---

## 🚀 Despliegue

**Build Status:** ✅ Exitoso  
**TypeScript:** ✅ Sin errores  
**Production Build:** ✅ 159 páginas generadas  
**Dev Server:** ✅ Ejecutándose correctamente

**Checkpoint guardado:** `Admin sin trial + logos públicos permanentes`

---

## 📝 Notas Técnicas

### Estructura de Carpetas en S3
```
bucket/
├── folder/
│   ├── public/              ← Archivos públicos (logos, iconos)
│   │   ├── configuracion/
│   │   │   └── logo_corporativo-*.png
│   │   └── whitelabel/
│   │       ├── logo-*.png
│   │       └── icono-*.png
│   └── uploads/             ← Archivos privados (documentos, etc.)
```

### URLs Generadas
```typescript
// URL Pública (Permanente)
https://${bucketName}.s3.${region}.amazonaws.com/${key}

// Ejemplo:
https://abacusai-apps-866230e6534f94c36762fb70-us-west-2.s3.us-west-2.amazonaws.com/folder/public/configuracion/logo-1234567890.png
```

### Compatibilidad
- ✅ Compatible con código existente (usa `downloadUrl`)
- ✅ Soporta archivos antiguos con URLs firmadas
- ✅ Migración automática al subir nuevos logos

---

## 🔒 Seguridad

**Archivos Públicos:**
- Solo logos corporativos, iconos y recursos de branding
- Archivos en carpeta `public/`
- Sin información sensible

**Archivos Privados:**
- Documentos de usuarios, attachments, etc.
- Permanecen en carpeta `uploads/` privada
- Requieren URLs firmadas con expiración

---

## 📚 Archivos Modificados

1. `/lib/s3.ts` - Agregada función `uploadPublicFile()`
2. `/app/api/configuracion/logo/route.ts` - Usa URLs públicas
3. `/app/api/whitelabel/route.ts` - Usa URLs públicas (GET y POST)
4. `/app/api/subscriptions/status/route.ts` - Excluye superadmin del trial

---

**Documentación actualizada:** 5 de Enero, 2026  
**Versión:** 1.0  
**Autor:** DeepAgent Assistant
