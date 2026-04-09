
# 🎨 Guía de Integración de Canva Embed en Volkern CRM

## Resumen

Se ha integrado el SDK de Canva Embed en el módulo de Campañas de Volkern CRM, permitiendo a los usuarios crear diseños profesionales directamente desde el CRM sin salir de la plataforma.

---

## ✅ Funcionalidades Implementadas

### 1. 🎨 Componente CanvaDesigner

**Archivo:** `/components/canva-designer.tsx`

#### Características:
- Editor embebido de Canva con SDK v2
- Selector de templates predefinidos
- Manejo de errores y estados de carga
- Preview del diseño guardado
- Integración completa con el flujo de campañas

#### Templates Predefinidos:
- **Facebook Ad** (1080x1080px) - Anuncios cuadrados
- **Instagram Story** (1080x1920px) - Historias verticales
- **Instagram Post** (1080x1080px) - Publicaciones cuadradas
- **Email Header** (600x300px) - Encabezados para emails
- **Social Media Post** (1080x1080px) - Publicación versátil
- **Twitter Post** (1200x675px) - Publicaciones para Twitter/X

#### Props del Componente:
```typescript
interface CanvaDesignerProps {
  templateId?: string;           // ID del template a usar
  onDesignPublished: (url: string) => void;  // Callback cuando se guarda el diseño
  onClose?: () => void;          // Callback cuando se cierra el editor
}
```

---

### 2. 📝 Configuración de Templates

**Archivo:** `/lib/canva-config.ts`

Contiene:
- Definición de templates disponibles
- Funciones helper para gestión de templates
- Validación de configuración de Canva

#### Funciones Principales:
```typescript
// Obtener configuración de un template específico
getTemplateConfig(key: TemplateKey)

// Obtener todos los templates disponibles
getAllTemplates()

// Validar si Canva está configurado
isCanvaConfigured(): boolean

// Obtener el Client ID de Canva
getCanvaClientId(): string | undefined
```

---

### 3. 🔗 Integración en el Módulo de Campañas

**Archivo:** `/app/dashboard/campanas/nueva/page.tsx`

#### Cambios Realizados:

1. **Nuevo botón "Diseñar con Canva"**
   - Ubicado junto a "Subir Imagen" y "Generar con IA"
   - Disponible para campañas normales y pruebas A/B
   - Icono: `Palette` de Lucide React

2. **Diálogo del Diseñador**
   - Modal de tamaño grande (max-w-5xl)
   - Contiene el componente `CanvaDesigner`
   - Se cierra automáticamente al guardar el diseño

3. **Gestión de Estado**
   ```typescript
   const [showCanvaDialog, setShowCanvaDialog] = useState(false);
   const [canvaTemplateId, setCanvaTemplateId] = useState<string>('facebook_ad');
   ```

4. **Handlers**
   ```typescript
   // Abrir el diálogo de Canva
   handleOpenCanvaDialog(canal: string, variante?: string)
   
   // Guardar el diseño en el mensaje de la campaña
   handleCanvaDesignPublished(imageUrl: string)
   ```

---

### 4. 🌐 Script del SDK de Canva

**Archivo:** `/app/layout.tsx`

Se agregó el script del SDK de Canva en el `<head>`:
```html
<script src="https://sdk.canva.com/v2/api.js" async />
```

---

### 5. 🔐 Variables de Entorno

**Archivos:** `.env` y `.env.example`

#### Variable Requerida:
```env
NEXT_PUBLIC_CANVA_CLIENT_ID=YOUR_CANVA_CLIENT_ID_HERE
```

**Nota:** El prefijo `NEXT_PUBLIC_` es necesario porque el SDK se ejecuta en el cliente.

---

## 🚀 Configuración Inicial

### Paso 1: Crear una Aplicación en Canva

1. Ve a [Canva Developers](https://www.canva.com/developers/)
2. Inicia sesión o crea una cuenta
3. Ve a "Apps" y crea una nueva aplicación
4. Selecciona "Embed" como tipo de integración
5. Copia el **Client ID** de tu aplicación

### Paso 2: Configurar el Client ID

1. Abre el archivo `.env` en `/home/ubuntu/fluy_crm/nextjs_space/`
2. Reemplaza `YOUR_CANVA_CLIENT_ID_HERE` con tu Client ID real:
   ```env
   NEXT_PUBLIC_CANVA_CLIENT_ID=abc123xyz456
   ```
3. Guarda el archivo

### Paso 3: Configurar Dominios Autorizados

En tu aplicación de Canva Developers:

1. Ve a "Settings" → "Authorized domains"
2. Agrega los siguientes dominios:
   - **Desarrollo:** `http://localhost:3000`
   - **Producción:** `https://volkern.app`
   - **Tu dominio personalizado** (si aplica)

### Paso 4: Reiniciar el Servidor

```bash
cd /home/ubuntu/fluy_crm/nextjs_space
yarn dev
```

---

## 📖 Cómo Usar

### Para Usuarios del CRM:

1. **Crear una Nueva Campaña**
   - Ve a Dashboard → Campañas → Nueva Campaña
   - Completa la información básica
   - Selecciona los canales de comunicación

2. **Diseñar con Canva**
   - En la sección de "Canales y Mensajes"
   - Haz clic en el botón **"Diseñar con Canva"**
   - Selecciona el tipo de template que deseas usar
   - Haz clic en "Abrir Editor de Canva"

3. **Crear el Diseño**
   - El editor de Canva se abrirá dentro del CRM
   - Personaliza tu diseño usando las herramientas de Canva
   - Cuando termines, haz clic en "Publicar" o "Guardar"

4. **Usar el Diseño**
   - El diseño se guardará automáticamente en tu campaña
   - Verás un preview de la imagen guardada
   - La URL de la imagen se almacena en `mediaUrl` del mensaje

---

## 🔧 Flujo Técnico

```
┌─────────────────────────────────────────────────────────────────┐
│                    VOLKERN CRM - CAMPAÑAS                       │
│                                                                 │
│  1. Usuario hace clic en "Diseñar con Canva"                  │
│     ↓                                                           │
│  2. Se abre Dialog con CanvaDesigner                           │
│     ↓                                                           │
│  3. Componente verifica NEXT_PUBLIC_CANVA_CLIENT_ID            │
│     ↓                                                           │
│  4. Se carga el SDK de Canva (window.Canva)                    │
│     ↓                                                           │
│  5. Usuario selecciona template                                │
│     ↓                                                           │
│  6. Se inicializa editor con template seleccionado             │
│     ↓                                                           │
│  7. Usuario diseña y hace clic en "Publicar"                   │
│     ↓                                                           │
│  8. onDesignPublish callback se ejecuta con exportUrl          │
│     ↓                                                           │
│  9. URL se guarda en mensaje.mediaUrl                          │
│     ↓                                                           │
│  10. Preview se muestra en el formulario                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Casos de Uso

### Caso 1: Campaña Normal de WhatsApp

1. Selecciona WhatsApp como canal
2. Haz clic en "Diseñar con Canva"
3. Selecciona "Social Media Post" (1080x1080)
4. Diseña tu imagen promocional
5. Guarda y la imagen se adjunta al mensaje de WhatsApp

### Caso 2: Prueba A/B de Email

1. Configura prueba A/B con 2 variantes
2. Selecciona Email como canal
3. Para Variante A:
   - Clic en "Diseñar con Canva"
   - Selecciona "Email Header"
   - Diseña versión A
4. Para Variante B:
   - Clic en "Diseñar con Canva"
   - Diseña versión B diferente
5. Ambas variantes tendrán imágenes únicas

### Caso 3: Campaña Multi-Canal

1. Selecciona WhatsApp, Email e Instagram
2. Para cada canal, diseña una imagen específica:
   - **WhatsApp:** Social Media Post (cuadrado)
   - **Email:** Email Header (horizontal)
   - **Instagram:** Instagram Story (vertical)
3. Cada canal tendrá la imagen optimizada para su formato

---

## 🛡️ Seguridad y Mejores Prácticas

### Seguridad:

1. **Client ID Público**
   - El `NEXT_PUBLIC_CANVA_CLIENT_ID` es seguro de exponer
   - No contiene información sensible
   - Canva valida el dominio de origen

2. **Dominios Autorizados**
   - Solo los dominios configurados en Canva pueden usar tu app
   - Esto previene uso no autorizado

3. **No se expone Secret**
   - El Canva Client Secret NO se usa en frontend
   - Solo el Client ID es necesario para Embed API

### Mejores Prácticas:

1. **Manejo de Errores**
   - El componente muestra mensajes claros si falta configuración
   - Timeout de 10 segundos para cargar el SDK
   - Mensajes de error específicos para troubleshooting

2. **Cleanup**
   - El editor se destruye correctamente al desmontar el componente
   - Previene memory leaks

3. **UX**
   - Loading states claros
   - Preview de diseño guardado
   - Opción de editar después de guardar

---

## 🐛 Troubleshooting

### Error: "NEXT_PUBLIC_CANVA_CLIENT_ID no está configurado"

**Solución:**
1. Verifica que la variable esté en `.env`
2. Asegúrate de que tenga el prefijo `NEXT_PUBLIC_`
3. Reinicia el servidor de desarrollo

### Error: "No se pudo cargar el SDK de Canva"

**Solución:**
1. Verifica tu conexión a internet
2. Revisa la consola del navegador para errores de CORS
3. Asegúrate de que el script esté en el `<head>` del layout

### Error: "El editor no se abre"

**Solución:**
1. Verifica que el dominio esté autorizado en Canva Developers
2. Revisa que el Client ID sea correcto
3. Abre la consola del navegador para ver errores específicos

### El diseño no se guarda

**Solución:**
1. Asegúrate de hacer clic en "Publicar" en el editor de Canva
2. Verifica que el callback `onDesignPublished` se esté ejecutando
3. Revisa la consola para errores de red

---

## 🔄 Actualizaciones Futuras (Opcional)

### Fase 2 - Posibles Mejoras:

1. **Gestión de Diseños**
   - Biblioteca de diseños guardados
   - Reutilizar diseños en múltiples campañas
   - Organizar por categorías

2. **Templates Personalizados**
   - Permitir al admin configurar templates propios
   - Guardar templates de marca en el CRM

3. **Colaboración**
   - Compartir diseños entre usuarios del equipo
   - Comentarios en diseños

4. **Métricas**
   - Rastrear qué diseños generan más conversiones
   - A/B testing automático de diseños

5. **Integración Avanzada**
   - Autopopulado de datos del CRM en templates
   - Variables dinámicas en diseños

---

## 📊 Impacto en el CRM

### Beneficios:

✅ **Profesionalismo:**
- Diseños de alta calidad sin salir del CRM
- Acceso a millones de templates y elementos de Canva

✅ **Eficiencia:**
- No necesita cambiar entre aplicaciones
- Flujo de trabajo unificado

✅ **Conversión:**
- Mejores imágenes = más conversiones
- Diseños optimizados para cada canal

✅ **White-Label:**
- El usuario nunca ve que es Canva
- Experiencia integrada de Volkern

---

## 📝 Archivos Modificados/Creados

### Archivos Nuevos:
- ✅ `/components/canva-designer.tsx` - Componente principal
- ✅ `/lib/canva-config.ts` - Configuración de templates
- ✅ `/CANVA_INTEGRATION_GUIDE.md` - Esta documentación

### Archivos Modificados:
- ✅ `/app/layout.tsx` - Script del SDK de Canva
- ✅ `/app/dashboard/campanas/nueva/page.tsx` - Integración en formulario
- ✅ `.env` - Variable de entorno
- ✅ `.env.example` - Documentación de variable

---

## 🎓 Recursos Adicionales

- [Canva Developers Documentation](https://www.canva.com/developers/docs)
- [Canva Embed API Reference](https://www.canva.com/developers/docs/embed-api)
- [Canva SDK Examples](https://www.canva.com/developers/docs/examples)

---

## 💡 Notas Importantes

1. **No se requiere Backend API:**
   - La integración es 100% frontend
   - El SDK de Canva maneja todo el procesamiento

2. **URLs de Diseño:**
   - Canva provee URLs públicas permanentes
   - Se pueden usar directamente en campañas

3. **Límites:**
   - Revisa los límites de tu plan de Canva
   - Los diseños publicados cuentan para tu cuota

4. **Soporte:**
   - Para problemas con el SDK: Soporte de Canva
   - Para problemas con la integración: Equipo de Volkern

---

¡La integración de Canva está lista para empoderar a tus usuarios con diseños profesionales! 🎨✨
