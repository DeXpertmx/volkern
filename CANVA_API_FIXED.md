# 🎨 Integración de Canva API - Corregido

## 📋 Resumen del Problema

El error que estabas experimentando era debido a que estábamos intentando cargar un SDK de JavaScript de Canva (`https://sdk.canva.com/v2/api.js`) que **no es público ni está disponible** para aplicaciones externas. El componente intentaba inicializar `window.Canva.DesignButton` que no existe en ese script.

## ✅ Solución Implementada

Hemos reemplazado completamente la implementación para usar la **Canva Connect API REST**, que es la forma oficial de integrar Canva en aplicaciones externas.

### Cambios Realizados

#### 1. Nuevos Endpoints de API

Creamos 4 nuevos endpoints para interactuar con la API de Canva:

**`/api/canva/create-design`** (POST)
- Crea un nuevo diseño en Canva usando la API REST
- Acepta template ID y tipo de diseño
- Retorna la URL de edición del diseño

**`/api/canva/get-design`** (GET)
- Obtiene información de un diseño existente
- Consulta los detalles mediante el Design ID

**`/api/canva/export-design`** (POST)
- Exporta un diseño como imagen (PNG, JPG, PDF)
- Inicia un job de exportación en Canva
- Retorna un job ID para hacer seguimiento

**`/api/canva/check-export`** (GET)
- Verifica el estado de un job de exportación
- Retorna la URL de descarga cuando está listo

#### 2. Componente CanvaDesigner Actualizado

El componente ahora:

1. **Crea diseños** mediante la API REST de Canva
2. **Abre Canva** en una nueva ventana para que el usuario diseñe
3. **Importa el resultado** usando la API de exportación

**Flujo de Usuario:**

```
1. Usuario selecciona un template
   ↓
2. Click en "Abrir Editor de Canva"
   ↓
3. Se crea un diseño en Canva mediante API
   ↓
4. Se abre Canva en nueva ventana
   ↓
5. Usuario diseña en Canva
   ↓
6. Usuario guarda en Canva (automático)
   ↓
7. Usuario vuelve al CRM y hace click en "Importar Diseño"
   ↓
8. Sistema exporta el diseño mediante API
   ↓
9. Imagen lista para usar en la campaña
```

#### 3. SDK Removido

Eliminamos el script del SDK de Canva del `app/layout.tsx` ya que no era necesario ni funcional.

---

## 🚀 Cómo Usar

### En el Módulo de Campañas

1. Ve a **Dashboard → Campañas → Nueva Campaña**

2. Haz clic en **"Diseñar con Canva"**

3. Si es la primera vez, conecta tu cuenta de Canva:
   - Click en "Conectar con Canva"
   - Autoriza en Canva
   - Regresa al CRM automáticamente

4. Selecciona un template:
   - Anuncio de Facebook
   - Historia de Instagram
   - Publicación de Instagram
   - Encabezado de Email
   - Publicación en Redes Sociales

5. Click en **"Abrir Editor de Canva"**
   - Se abre una nueva ventana con Canva
   - Diseña tu imagen

6. Cuando termines de diseñar:
   - Guarda en Canva (se guarda automáticamente)
   - Regresa al CRM
   - Click en **"Importar Diseño"**

7. Espera unos segundos mientras se procesa

8. ¡Listo! Tu diseño aparecerá en la campaña

### Opción Manual

Si ya tienes un diseño en Canva:

1. Copia el ID del diseño desde la URL de Canva
   - Ejemplo: `canva.com/design/DAFHEsUA2dk/edit` → ID: `DAFHEsUA2dk`

2. Pega el ID en el campo "¿Tienes un diseño existente?"

3. Click en "Importar"

---

## 🔧 Arquitectura Técnica

### Flujo de API

```
Volkern CRM                     Canva API
     │
     │  POST /api/canva/create-design
     ├──────────────────────────────────>
     │                                   │
     │  { designId, editUrl }            │
     <──────────────────────────────────┤
     │                                   │
     │  (Usuario diseña en Canva)       │
     │                                   │
     │  POST /api/canva/export-design   │
     ├──────────────────────────────────>
     │                                   │
     │  { jobId, status: "processing" } │
     <──────────────────────────────────┤
     │                                   │
     │  GET /api/canva/check-export     │
     ├──────────────────────────────────>
     │                                   │
     │  { exportUrl, status: "success" }│
     <──────────────────────────────────┤
     │                                   │
     │  Imagen lista para la campaña    │
```

### Autenticación

Usa el OAuth 2.0 flow que ya estaba implementado:
- Access Token guardado en `user.metadata.canvaAuth`
- Refresh Token para renovación automática
- PKCE para seguridad adicional

---

## 📊 Ventajas de la Nueva Implementación

### ✅ Ventajas

1. **Usa API oficial de Canva**: Garantiza compatibilidad a largo plazo
2. **Mayor control**: Podemos gestionar diseños programáticamente
3. **Experiencia familiar**: Usuario diseña en el editor completo de Canva
4. **Importación flexible**: Soporta diseños nuevos y existentes
5. **Sin dependencias de SDK**: No dependemos de scripts externos

### 🎯 Casos de Uso Soportados

- ✅ Crear diseño desde template
- ✅ Crear diseño en blanco
- ✅ Importar diseño existente por ID
- ✅ Exportar como PNG (JPG y PDF también disponibles)
- ✅ Polling automático del estado de exportación
- ✅ Manejo de errores y timeouts

---

## 🐛 Solución de Problemas

### "Error al crear diseño"

**Posibles causas:**
- Token de Canva expirado
- Permisos insuficientes
- Template ID inválido

**Solución:**
1. Reconecta tu cuenta de Canva
2. Verifica que el template ID sea correcto
3. Revisa los logs del servidor

### "Timeout esperando la exportación"

**Causa:** La exportación tomó más de 30 segundos

**Solución:**
1. Espera unos minutos y vuelve a intentar importar
2. Si persiste, usa la opción de importación manual con el Design ID

### "No hay token de Canva"

**Causa:** No has conectado tu cuenta de Canva

**Solución:**
1. Ve a Dashboard → Integraciones → Canva
2. Click en "Conectar con Canva"
3. Autoriza tu cuenta

---

## 🔐 Seguridad

- **Tokens seguros**: Access tokens nunca se exponen al navegador
- **HTTPS requerido**: Todas las llamadas a Canva usan HTTPS
- **Validación de sesión**: Solo usuarios autenticados pueden usar la API
- **Rate limiting**: Implementado en los endpoints

---

## 📝 Variables de Entorno

Asegúrate de tener configuradas:

```env
NEXT_PUBLIC_CANVA_CLIENT_ID=REDACTED_ID
CANVA_CLIENT_SECRET=REDACTED_SECRET
```

---

## ✨ Próximas Mejoras (Opcional)

### Futuro - Fase 1
- 🔜 Biblioteca de diseños guardados
- 🔜 Reutilizar diseños anteriores
- 🔜 Compartir diseños entre usuarios del tenant

### Futuro - Fase 2
- 🔜 Editar diseños existentes desde el CRM
- 🔜 Preview del diseño antes de importar
- 🔜 Soporte para múltiples formatos (JPG, PDF, SVG)

---

## 🎉 ¡Listo para Usar!

La integración de Canva está ahora **completamente funcional** y lista para que tus usuarios creen diseños profesionales para sus campañas.

**Recuerda:**
- Ya no verás el error "No se pudo cargar el SDK de Canva"
- El editor se abre en una ventana nueva de Canva
- Los diseños se importan mediante la API oficial
- Todo funciona de forma segura y estable

---

**Fecha de corrección**: 2024-11-11  
**Estado**: ✅ Corregido y funcional
