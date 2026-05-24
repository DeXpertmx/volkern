# 🚀 Instrucciones para Google Stitch — App Móvil Volkern CRM + Gemma AI

---

## 📋 Resumen Ejecutivo

Aplicación móvil para **Volkern CRM** (ERP industrial + CRM). La app es un **thin client** centrado en un **chatbot inteligente llamado Gemma** que reemplaza la interfaz tradicional de Telegram. Gemma es el asistente IA que permite a los usuarios realizar todas las operaciones del CRM mediante conversación natural (voz y texto). Además, la app incluye un **centro de notificaciones del sistema** y acceso rápido a los módulos del CRM.

**Público objetivo:** Ejecutivos, vendedores de campo, operarios de planta, inspectores de calidad.

**Plataforma objetivo:** iOS y Android (Flutter).

---

## 🎨 Paleta de Colores y Estilo Visual

### Colores primarios
- **Primario:** `#2563EB` (Blue-600) — Botones, enlaces, header activo
- **Primario oscuro:** `#1D4ED8` (Blue-700) — Pressed states
- **Acento:** `#10B981` (Emerald-500) — Éxito, confirmación, online
- **Advertencia:** `#F59E0B` (Amber-500) — Alertas, notificaciones
- **Error:** `#EF4444` (Red-500) — Errores, cancelación
- **Info:** `#6366F1` (Indigo-500) — Información

### Neutros
- **Fondo principal:** `#F9FAFB` (Gray-50)
- **Superficie/tarjetas:** `#FFFFFF`
- **Texto primario:** `#111827` (Gray-900)
- **Texto secundario:** `#6B7280` (Gray-500)
- **Bordes:** `#E5E7EB` (Gray-200)

### Tipografía
- **Fuente:** Inter (sans-serif) o system default
- **Tamaños:** Título grande 24px, título 18px, cuerpo 15px, caption 12px
- **Estilo:** Limpio, amplio espacio entre líneas (1.5), border-radius 12px para tarjetas

### Iconografía
- **Estilo:** Lucide icons (línea delgada), 24x24px
- Consistente con la versión web del CRM

---

## 📱 Estructura de Navegación General

```
App
├── Auth (Login / Registro)
│
├── Main Layout (Bottom Navigation + AppBar)
│   ├── 🏠 Inicio (Dashboard + Chat rápido)
│   ├── 💬 Gemma Chat (Pantalla principal de chatbot)
│   ├── 🔔 Notificaciones (Centro de notificaciones)
│   ├── 📊 Hubs (Acceso a los 18 módulos del CRM)
│   └── 👤 Perfil (Ajustes, configuración, cierre sesión)
│
├── Screens Secundarias
│   ├── Leads / Contactos / Empresas
│   ├── Pipeline / Oportunidades
│   ├── Citas / Calendario
│   ├── Catálogo / Productos
│   ├── Cotizaciones
│   ├── Contratos
│   ├── Tareas
│   ├── Mensajes / Conversaciones
│   ├── Chatbot Configuración
│   ├── Academia (Cursos / Estudiantes)
│   ├── Finanzas (Dashboard, Gastos, Facturas)
│   ├── Producción (Órdenes, BoM)
│   ├── Inventario / Stock
│   ├── Proyectos / Hitos
│   ├── RRHH (Equipo, Vacaciones)
│   ├── Calidad (Inspecciones, No Conformidades)
│   ├── Integraciones
│   └── Configuración del Sistema
│
└── Modales y Overlays
    ├── Escáner QR/Código de barras
    ├── Grabación de voz (push-to-talk)
    ├── Subida de fotos (cámara)
    ├── Selector de fecha/hora
    └── Confirmación biométrica (FaceID / Huella)
```

---

## 🖥️ PANTALLA 1: Auth / Login

### Descripción
Pantalla de inicio de sesión con soporte para biometría (FaceID / huella dactilar).

### Elementos UI
1. **Logo Volkern** centrado en la parte superior (logotipo de la empresa)
2. **Título:** "Volkern CRM"
3. **Subtítulo:** "Inicia sesión para continuar"
4. **Campo de email** con icono de sobre
5. **Campo de contraseña** con icono de candado y toggle visibilidad
6. **Botón "Iniciar Sesión"** — Primary color, full width, border-radius 12px
7. **Enlace "¿Olvidaste tu contraseña?"** — Texto azul, alineado a la derecha
8. **Separador "o"** con líneas horizontales
9. **Botón biométrico** — Icono de huella digital, texto "Usar FaceID / Huella"
10. **Enlace "¿No tienes cuenta? Registrarse"** — Al fondo

### Estados
- **Cargando:** Spinner en el botón, campos deshabilitados
- **Error:** Mensaje de error en rojo sobre el formulario
- **Validación:** Errores inline debajo de cada campo (email inválido, contraseña muy corta)

### Flujo
1. Usuario ingresa credenciales → POST a `/api/auth/signin`
2. Si éxito → Redirigir a Inicio (Home)
3. Si error 401 → Mostrar "Credenciales inválidas"
4. Biometría → Token biométrico → Auth automática

---

## 🖥️ PANTALLA 2: Main Layout (Estructura Base)

### Descripción
Layout principal con Bottom Navigation Bar de 5 tabs y AppBar dinámico.

### Bottom Navigation
| Icono | Label | Destino |
|-------|-------|---------|
| 🏠 (House) | Inicio | Dashboard principal |
| 💬 (MessageCircle) | Gemma | Chat con IA |
| 🔔 (Bell) | Notif. | Centro de notificaciones |
| 📊 (LayoutGrid) | Módulos | Grid de hubs del CRM |
| 👤 (User) | Perfil | Perfil y ajustes |

### AppBar (Barra Superior)
- **Left:** Logo Volkern + nombre del tenant (empresa)
- **Center:** Título de la pantalla actual
- **Right:** 
  - Icono de escáner QR/código de barras (rápido)
  - Badge de notificaciones no leídas (número rojo)
  
### Características
- **Swipe entre tabs** con gestos
- **Badge** en icono de notificaciones con contador de no leídas
- **Transiciones suaves** entre pantallas (slide)
- **Pull to refresh** en pantallas con datos
- **Skeleton loading** mientras cargan datos

---

## 🖥️ PANTALLA 3: Inicio / Dashboard

### Descripción
Pantalla principal que muestra un resumen ejecutivo y acceso rápido a funciones clave.

### Elementos UI

#### Header Superior
- **Saludo personalizado:** "¡Buenos días, [Nombre]!" (saludo según hora)
- **Fecha actual:** "Martes, 21 de mayo de 2026"
- **Avatar del usuario** (circular, 40px)

#### Quick Actions Bar (Scroll horizontal)
Tarjetas pequeñas (60px alto) con icono + label:
- 📷 "Escanear código"
- 🎤 "Hablar con Gemma" (push-to-talk)
- ➕ "Nuevo lead"
- 📅 "Agendar cita"
- 📋 "Nueva tarea"

#### KPIs Cards (Grid 2 columnas)
Tarjetas con indicadores clave:
1. **Leads nuevos hoy** — Número grande + icono de personas + trend (↑/↓)
2. **Citas hoy** — Número + icono de calendario
3. **Tareas pendientes** — Número + icono de checklist + rojo si > 5
4. **Notificaciones no leídas** — Número + icono de campana

#### Actividad Reciente (Lista vertical)
- Últimos 5 eventos del sistema
- Cada item: icono + texto + timestamp relativo ("hace 5 min")
- Colores según tipo: verde (creación), azul (actualización), rojo (alerta)

#### Atajos a Módulos Frecuentes (Grid 4 columnas)
- Iconos grandes con nombre del módulo
- "Leads", "Citas", "Tareas", "Ventas", "Chatbot", "Mensajes"
- Scroll vertical si hay más

---

## 🖥️ PANTALLA 4: Gemma Chat (Pantalla Principal)

### Descripción
**Esta es la pantalla más importante de la app.** Interfaz de chat conversacional con el asistente IA Gemma. Reemplaza por completo al bot de Telegram.

### Elementos UI

#### Header del Chat
- **Avatar de Gemma** — Icono de robot/estrella con gradiente azul-púrpura
- **Nombre:** "Gemma" + badge "IA Assistant"
- **Indicador de estado:** "En línea" (verde) / "Escribiendo..." (puntos animados)
- **Botón de información** (i) — Abre modal con capacidades de Gemma

#### Área de Mensajes (Scroll infinito)
- **Burbujas del usuario:** Alineadas a la derecha, fondo azul primario, texto blanco, border-radius 16px esquina derecha 4px
- **Burbujas de Gemma:** Alineadas a la izquierda, fondo gris claro (Gray-100), texto oscuro, border-radius 16px esquina izquierda 4px
- **Avatar de Gemma** en cada mensaje suyo (circular pequeño, 28px)
- **Timestamp** pequeño debajo de cada burbuja (formato 24h, ej: "14:32")
- **Doble check azul** en mensajes enviados (WhatsApp-style)

#### Mensajes Enriquecidos (Rich Cards dentro del chat)
Gemma puede responder con tarjetas interactivas:

1. **Tarjeta de lead creado:** Avatar + nombre + email + botón "Ver detalle"
2. **Tarjeta de cita:** 📅 Fecha, hora, servicio + botones "Confirmar / Reagendar / Cancelar"
3. **Tarjeta de tarea:** ✅ Checkbox + título + fecha vencimiento
4. **Tarjeta de KPI:** Número grande + label + mini gráfica de barra
5. **Quick Replies (sugerencias):** Chips horizontales debajo del último mensaje de Gemma (ej: "Sí, agenda", "Muéstrame más opciones", "Hablar con humano")
6. **Lista de resultados:** Items con scroll si son muchos (ej: lista de leads encontrados)

#### Input Area (Barra inferior fija)
- **Botón "+"** (Attach) — Abre bottom sheet con opciones:
  - 📷 Tomar foto / subir de galería
  - 📎 Subir documento
  - 📍 Enviar ubicación
- **Campo de texto:** Placeholder "Escribe un mensaje a Gemma..." — border-radius 24px pill shape
- **Botón de micrófono** (push-to-talk) — Circular, fondo gris, al presionar cambia a rojo grabando
- **Botón de enviar** — Circular, fondo azul primario, icono de flecha. Deshabilitado si texto vacío
- **Mientras graba voz:** Barra de波形 animada + botón de enviar audio + botón de cancelar (X)

### Mensaje de Bienvenida
Cuando el usuario abre el chat por primera vez:
```
👋 ¡Hola! Soy **Gemma**, tu asistente IA de Volkern.

Puedes pedirme que haga cosas como:

• "Crea un lead para Juan Pérez, juan@email.com"
• "Agenda una cita para mañana a las 10am"
• "Muéstrame mis tareas pendientes"
• "Busca el contacto de ACME Corp"
• "¿Cuál es el estado de mi pipeline?"

¿En qué puedo ayudarte hoy?
```

### Estados del Chat
- **Cargando:** Skeleton messages (burbujas grises pulsantes)
- **Gemma pensando:** Indicador "..." con animación de tres puntos
- **Error:** Burbuja roja "⚠️ Lo siento, ocurrió un error. Intenta de nuevo."
- **Sin conexión:** Barra superior naranja "Sin conexión — Los mensajes se enviarán cuando tengas internet"
- **Mensajes pendientes:** Indicador de mensajes en cola para enviar
- **Derivando a humano:** Mensaje de Gemma: "🔄 Transfiriendo tu consulta a un agente humano. En breve alguien te atenderá." + notificación push cuando el humano responde
- **Confianza baja (voz):** Mensaje: "🎤 No entendí bien el audio. ¿Podrías repetirlo? Si estás en un ambiente ruidoso, prueba con auriculares o escribe el mensaje."
- **Ruido industrial detectado:** Si el nivel de ruido ambiente supera el umbral (>70dB simulado), Gemma sugiere automáticamente: "🔊 Detecto ruido de fondo elevado. Activando filtro de cancelación de ruido. Si persiste, escribe el mensaje." + botón "Activar modo texto"

### Comandos de Voz
Al presionar el micrófono:
1. Overlay oscuro semi-transparente
2. **Estado "Escuchando..."** — Animación de onda sonora en vivo, botón rojo pulsante
3. **Estado "Transcribiendo..."** — Al soltar el botón, spinner + texto "Transcribiendo audio..."
4. **Estado "Procesando con Gemma..."** — Mientras Gemma analiza el texto transcrito
5. Al completar: la respuesta de Gemma aparece en el chat
6. **Ambiente ruidoso:** Si la app detecta baja calidad de audio, muestra sugerencia: "🔊 No se entendió bien. ¿Quieres escribirlo?"
7. **Auto-envío:** Después de 2 segundos de silencio, el audio se procesa automáticamente
8. **Cancelar:** Swipe hacia abajo o botón X para cancelar la grabación

### Escáner QR / Código de Barras
- **Icono** en AppBar (esquina superior derecha)
- Abre la cámara en modo escáner
- Cuando detecta un código: vibración, busca producto/lead y abre modal con resultado
- Botón "Preguntar a Gemma" que envía el resultado al chat

---

## 🖥️ PANTALLA 5: Centro de Notificaciones

### Descripción
Bandeja de entrada de notificaciones del sistema, ordenadas por tiempo y agrupadas por tipo.

### Elementos UI

#### Header
- **Título:** "Notificaciones"
- **Acciones:** "Marcar todas como leídas" (texto azul)
- **Filtro:** Chips horizontales — "Todas" | "No leídas" | "Alertas" | "Menciones"

#### Lista de Notificaciones (Scroll vertical)
Cada item de notificación incluye:
- **Icono** según tipo (coloreado):
  - 🔵 Información (azul)
  - 🟢 Lead nuevo (verde)
  - 🟠 Cita próxima (naranja)
  - 🔴 Alerta/Error (rojo)
  - 🟣 Menciones (púrpura)
  - ⚪ Sistema (gris)
- **Título** (bold si no leída)
- **Cuerpo** (texto truncado a 2 líneas)
- **Timestamp** relativo ("hace 5 min", "hace 2 horas", "ayer")
- **Badge** azul (punto) si no leída — a la izquierda
- **Swipe** a la izquierda para eliminar
- **Tap** para marcar como leída y abrir detalle (o navegar a la entidad relacionada)

#### Agrupaciones
- **Hoy** — Notificaciones de hoy
- **Ayer** — Notificaciones de ayer  
- **Esta semana** — Notificaciones anteriores

#### Empty State
Cuando no hay notificaciones:
- Icono grande de campana con rayos
- Texto: "No tienes notificaciones"
- Subtítulo: "Las notificaciones importantes aparecerán aquí"

#### Pull to Refresh
- Al hacer pull down, recarga las notificaciones desde API

---

## 🖥️ PANTALLA 6: Hubs / Módulos del CRM

### Descripción
Grid de acceso a todos los módulos del CRM, organizados por categorías.

### Elementos UI

#### Header
- **Título:** "Módulos"
- **Search bar:** Buscar módulos por nombre
- **Chips de categorías:** Scroll horizontal — "Todos" | "Ventas" | "ERP" | "Comunicación" | "Marketing" | "Academia" | "Admin"

#### Grid de Módulos
Layout de **3 columnas**, cada módulo es una tarjeta cuadrada con:
- **Icono grande** (Emoji o Lucide icon)
- **Nombre** del módulo (texto pequeño abajo)
- **Badge de notificaciones** (si aplica, ej: Tareas 3)
- **Fondo:** Blanco con sombra suave, border-radius 12px
- **Colores de acento** según categoría (ventas=azul, erp=verde, comunicación=púrpura, etc.)

#### Módulos disponibles (48 módulos):

**Ventas & Leads (11):**
- 📊 Analytics — Métricas y KPIs
- 👥 Leads — Gestión de prospectos
- ✅ Contactos — Base de contactos
- 🏢 Empresas — Directorio de empresas
- 📈 Pipeline — Embudo de ventas
- 📋 Tareas — Gestión de pendientes
- 📄 Cotizaciones — Propuestas comerciales
- 📜 Contratos — Gestión documental
- 🛒 Órdenes de Venta — Pedidos
- 🔮 Pronósticos — Predicción de ventas
- 🏆 Scoring — Puntuación automática de leads

**Comunicación (5):**
- 💬 Mensajes — Bandeja omnicanal
- 📞 Telefonía — Central VoIP
- 🤖 Chatbot WhatsApp — Asistente inteligente
- 📅 Citas — Agendamiento de reuniones
- 🏷️ Catálogo — Productos y servicios

**Marketing (5):**
- 📣 Campañas — Email marketing
- ✉️ Email Marketing — Campañas de correo
- 🌐 Constructor Web (CMS) — Landing pages básicas
- 🏗️ Constructor Premium — WebCreator avanzado con GrapesJS
- 📱 Hub Social — Gestión de redes sociales

**Academia (2):**
- 📚 Cursos — Contenido educativo
- 🎓 Estudiantes — Gestión de alumnos

**Automatización (1):**
- ⚙️ Automatizaciones — Motor de flujos automáticos

**Personal (1):**
- 💳 Mi Tarjeta — Tarjeta digital de presentación

**ERP Industrial (9):**
- 📦 Inventario — Stock y almacenes
- 🏭 Producción — Órdenes de fabricación y BoM
- ✅ Calidad — Inspecciones y control
- 🏗️ Proyectos — Obras y proyectos
- 👥 RRHH — Talentos y nóminas
- 💰 Finanzas — Gastos e ingresos
- 📊 Consolidado Financiero — Vista multi-tenant financiera
- 👷 Taskforce — Gestión de equipos operativos y soporte
- 🚜 Activos — Maquinaria, equipos y licencias

**Estrategia (1):**
- 🎯 Estrategia — Planificación estratégica y KPIs (Requiere Proyectos)

**Administración (7):**
- 👤 Equipo — Miembros y roles
- 🔌 Integraciones — Conexiones externas
- ⚙️ Configuración — Ajustes del sistema
- 🧠 Conocimiento — Base de conocimiento y SOPs
- 🏷️ Marca Blanca — Personalización de marca
- 🌐 Dominio Personalizado — Dominio propio para la plataforma
- 🏢 Agencia — Gestión de slots de cliente (solo cuentas AGENCY)

**Integraciones Avanzadas (6):**
- 📱 WhatsApp — Integración oficial con WhatsApp
- ♾️ Meta (FB/IG) — Facebook e Instagram Messenger
- ✈️ Telegram — Integración con Telegram Bot
- 💬 SMS Gateway — Notificaciones por SMS
- 📅 Google Calendar — Sincronización de citas
- 🔑 Acceso a la API — Tokens para desarrolladores

#### Comportamiento
- **Tap** en un módulo → Navega a la pantalla de ese módulo
- **Long press** → Menú contextual con acciones rápidas
- **Módulos bloqueados** (no en plan) → Mostrar con opacidad reducida + icono de candado + "Actualizar plan"

---

## 🖥️ PANTALLA 7: Perfil / Configuración

### Descripción
Perfil del usuario con ajustes personales y configuración de la app.

### Elementos UI

#### Header del Perfil
- **Avatar grande** (circular, 80px) — con cámara overlay para cambiar foto
- **Nombre completo** del usuario
- **Email** del usuario
- **Rol** en la empresa (Admin, Vendedor, Operario, etc.)
- **Tenant/Empresa** a la que pertenece

#### Secciones (Lista con iconos + chevron >)

**Cuenta:**
- 👤 Mis Datos — Nombre, email, teléfono
- 🔒 Seguridad — Cambiar contraseña, 2FA
- 🖐️ Biometría — Activar/desactivar FaceID/Huella

**Preferencias:**
- 🔔 Notificaciones — Configurar canales (push, email, telegram)
- 🌐 Idioma — Español / Inglés
- 🕐 Zona Horaria — Auto o manual
- 📅 Disponibilidad — Horarios para agendar

**Configuración App:**
- 🎤 Voz — Activar comando por voz, idioma de voz
- 📷 Escáner — Preferencias de cámara
- 💾 Almacenamiento — Gestión de caché
- 🗺️ Ubicación — Activar/desactivar geolocalización para Gemma
- 🎤 Modo Ambiental — Activar filtro de ruido para grabación de voz en entornos ruidosos

**Sistema:**
- 📊 Mi Suscripción — Plan actual, límites, facturación
- 🏷️ Mi Tarjeta — Tarjeta digital de presentación
- ✈️ Telegram — Vincular Telegram y configurar notificaciones
- 🗂️ Canal de Denuncias — Buzón confidencial de igualdad y transparencia
- ℹ️ Acerca de — Versión de la app, términos legales

#### Footer
- **Botón "Cerrar Sesión"** — Rojo, con icono de salida
- **Confirmación modal** al hacer tap: "¿Estás seguro de cerrar sesión?"

---

## 🖥️ PANTALLA 8: Leads (Ejemplo de pantalla de módulo)

### Descripción
Lista de leads con filtros, búsqueda y acciones rápidas. Esta es la plantilla para todos los módulos de lista.

### Elementos UI

#### Header
- **Título:** "Leads"
- **Contador:** "24 leads" (total)
- **Botón "+"** — Nuevo lead (fab button)

#### Search & Filter Bar
- **Search:** Campo de búsqueda con debounce
- **Chips de filtro:** Scroll horizontal — "Todos" | "Nuevos" | "Contactados" | "Calificados" | "Perdidos"
- **Botón filtro avanzado:** Abre modal con más opciones (fecha, fuente, asignado a)

#### Lista de Leads (Card list)
Cada lead es una tarjeta horizontal:
- **Avatar** (iniciales del nombre con color dinámico, circular, 44px)
- **Nombre** del lead (bold)
- **Email** (texto gris, segunda línea)
- **Teléfono** (texto gris, tercera línea)
- **Badge de etapa:** Color según etapa:
  - 🟢 Nuevo (verde)
  - 🟡 Contactado (amarillo)
  - 🔵 Calificado (azul)
  - 🟠 Propuesta (naranja)
  - 🔴 Perdido (rojo)
- **Asignado a:** Avatar pequeño del vendedor asignado
- **Fecha:** "Creado hace 3 días"

#### Acciones en Card
- **Swipe left** → Llamar (icono teléfono) + WhatsApp (icono)
- **Swipe right** → Marcar como contactado
- **Tap** → Abre detalle del lead

#### FAB (Floating Action Button)
- **Esquina inferior derecha**
- **Icono "+"** — Abre modal de creación rápida

---

## 🖥️ PANTALLA 9: Detalle de Lead (Ejemplo de detalle)

### Descripción
Pantalla de detalle de un lead con información completa y acciones.

### Elementos UI

#### Header
- **Foto/Avatar grande** del lead
- **Nombre** (grande, bold)
- **Etapa actual** (badge coloreado)
- **Compañía** (si aplica)

#### Info Cards (Grid)
- 📧 Email
- 📱 Teléfono
- 🏢 Empresa
- 📍 Fuente de captura
- 👤 Asignado a
- 📅 Fecha de creación
- 💰 Valor estimado

#### Tabs de Navegación (Segmented Control)
1. **📋 Actividad** — Timeline de interacciones
2. **💬 Conversaciones** — Historial de chat/Mensajes
3. **📝 Notas** — Notas internas
4. **📅 Citas** — Citas agendadas

#### Timeline de Actividad
- Items cronológicos con:
  - Icono según tipo
  - Descripción
  - Timestamp
  - Usuario que realizó la acción

#### Sección de Notas
- **Text area** para agregar nota rápida
- Lista de notas existentes (autor + fecha + contenido)

#### Acciones (Bottom Sheet)
Botón "Acciones" que abre bottom sheet:
- 📞 Llamar
- 💬 Enviar WhatsApp
- 📧 Enviar Email
- 📅 Agendar cita
- 🔄 Convertir a contacto
- 📋 Asignar a vendedor
- 🗑️ Eliminar (rojo, con confirmación)

---

## 🖥️ PANTALLA 10: Modal de Creación Rápida (Nuevo Lead)

### Descripción
Bottom sheet modal para crear un lead rápidamente.

### Elementos
- **Header:** "Nuevo Lead" + botón X para cerrar
- **Campo Nombre*** (requerido)
- **Campo Email***
- **Campo Teléfono**
- **Campo Empresa**
- **Dropdown Fuente** — Web, WhatsApp, Telegram, Referido, Llamada, Evento, Otro
- **Dropdown Asignado a** — Lista de vendedores
- **Campo Notas** (textarea, opcional)
- **Botón "Guardar"** — Primary, full width
- **Botón "Guardar y preguntar a Gemma"** — Secundario

### Comportamiento
1. Usuario llena formulario
2. Tap "Guardar" → POST a API → Notificación de éxito + retorna a lista
3. Si error → Campos marcados en rojo + mensaje de error

---

## 🖥️ PANTALLA 11: Modal de Grabación de Voz (Push to Talk)

### Descripción
Overlay que aparece cuando el usuario presiona el micrófono en el chat o en el acceso rápido.

### Elementos
1. **Círculo grande pulsante rojo** en el centro (grabando)
2. **Animación de onda de sonido** alrededor del círculo
3. **Texto:** "Escuchando..." con puntos animados
4. **Forma de onda** de la voz en vivo (línea sinusoidal animada)
5. **Botón inferior izquierdo:** "Cancelar" (icono X)
6. **Botón inferior derecho:** "Enviar audio" (icono check, solo cuando hay audio)
7. **Al soltar:** Auto-procesa el audio

### Estados
- **Inicial:** "Presiona para hablar"
- **Grabando:** Círculo rojo pulsante + forma de onda
- **Transcribiendo:** Spinner + "Transcribiendo audio..."
- **Procesando con Gemma:** Spinner + "Gemma está procesando..."
- **Confianza baja:** "No se entendió bien. ¿Quieres intentar de nuevo o escribir?" + botones "Reintentar" / "Escribir"
- **Resultado:** El texto transcrito aparece en el input del chat + Gemma procesa y responde

---

## 🖥️ PANTALLA 12: Permiso de Ubicación (GPS Context)

### Descripción
Pantalla de permiso que aparece durante el onboarding para que Gemma pueda inyectar ubicación GPS en el contexto de las conversaciones, permitiendo respuestas hiper-relevantes (ej: "sé que estás en el almacén sur").

### Elementos UI
1. **Icono grande de ubicación** (MapPin)
2. **Título:** "¿Permitir que Gemma sepa tu ubicación?"
3. **Descripción:** "Gemma usará tu ubicación para darte respuestas más precisas según dónde estés. Por ejemplo: sabrá si estás en el almacén, en una visita comercial o en planta de producción."
4. **Indicador de privacidad:** "📍 Solo cuando usas la app. Nunca compartimos tu ubicación."
5. **Botón "Permitir mientras usas la app"** — Primary (recomendado)
6. **Botón "Solo esta vez"** — Secundario
7. **Enlace "No, gracias"** — Texto gris (deshabilitar geolocalización)

### Indicador persistente
En el header del chat, cuando la ubicación está activa:
- Icono pequeño de ubicación verde
- Texto: "Almacén Norte" o la ubicación actual (actualiza automáticamente)
- Tap para ver configuración de privacidad

---

## 🖥️ PANTALLA 13: Modo Offline / Borradores

### Descripción
Cuando el dispositivo pierde conexión, la app entra en modo offline. Los mensajes se guardan como borradores y se envían automáticamente cuando se restablece la conexión.

### Indicador de Conexión
- **Online:** Sin indicador (oculto)
- **Offline:** Barra naranja en la parte superior: "📡 Sin conexión — Los mensajes se guardarán y enviarán al reconectar"
- **Reconectando:** Barra azul: "🔄 Reconectando..."
- **Mensajes pendientes:** Badge en el icono de chat: "3 pendientes"

### Funcionalidad Offline
1. **Chat:** Los mensajes que escribe el usuario se guardan localmente (SQLite/IndexedDB)
2. **Cola de envío:** Al reconectar, se envían en orden cronológico
3. **Notificaciones:** Las notificaciones push recibidas offline se agrupan al reconectar
4. **Datos cacheados:** Leads, contactos, productos y citas recientes están disponibles offline
5. **Indicador visual:** Los mensajes pendientes muestran un icono de reloj ⏳ hasta que se envían

### Pantalla de Borradores
Accesible desde el menú del chat (icono de borrador):
- Lista de mensajes pendientes por enviar
- Cada item: texto truncado + timestamp + estado (pendiente/enviando)
- Botón "Eliminar borrador" (swipe left)
- Botón "Enviar ahora" (si hay conexión)

---

## 🖥️ PANTALLA 14: Configuración de Telegram

### Descripción
Sección dentro del Perfil para conectar/desconectar Telegram personal y configurar notificaciones.

### Elementos UI

**Sección 1: Vincular Telegram Personal**
- **Estado actual:** "❌ No vinculado" o "✅ Vinculado como @username"
- **Botón "Conectar Telegram"** — Si no está vinculado
  - Muestra QR con el enlace de vinculación
  - O instrucciones: "Envía /start al bot @VolkernBot en Telegram"
- **Botón "Desconectar"** — Si está vinculado (rojo, con confirmación)

**Sección 2: Notificaciones por Telegram**
- **Toggle:** "Recibir notificaciones por Telegram"
- **Selector de tipos:**
  - ☑️ Alertas del sistema
  - ☑️ Nuevos leads
  - ☑️ Citas próximas
  - ☑️ Tareas asignadas
  - ☑️ Reportes financieros
  - ☑️ Alertas de producción/calidad

**Sección 3: Bot Token del Tenant (Admin)**
- **Campo:** "Bot Token" (mostrado enmascarado)
- **Botón "Probar conexión"** — Verifica que el token funciona
- **Badge:** "🟢 Conectado" o "🔴 Desconectado"
- **Botón "Copiar Webhook URL"** — Para configurar el webhook de Telegram

---

## 🖥️ PANTALLA 15: Escáner QR / Código de Barras

### Descripción
Pantalla de cámara para escanear códigos QR y códigos de barras de productos.

### Elementos
1. **Vista previa de cámara** (full screen)
2. **Cuadro de escaneo** animado (scanning line que sube y baja)
3. **Texto:** "Apunta al código de barras o QR"
4. **Flash toggle** (icono de rayo, esquina superior)
5. **Botón de cerrar** (X, esquina superior)
6. **Resultado:** Al detectar código:
   - Vibración háptica
   - Modal con resultado
   - Botón "Preguntar a Gemma sobre esto"

---

## 🖥️ PANTALLA 16: Onboarding / Primer Uso

### Descripción
Tour de bienvenida de 3-4 pasos que aparece la primera vez que el usuario abre la app.

### Pasos (Horizontal swipe con dots)
1. **Paso 1:** "👋 Bienvenido a Volkern" — Logo + "Tu CRM industrial potenciado por IA"
2. **Paso 2:** "💬 Habla con Gemma" — Ilustración de chat + "Pídele cualquier cosa con tu voz"
3. **Paso 3:** "🔔 Mantente al día" — Ilustración de notificaciones + "Recibe alertas importantes al instante"
4. **Paso 4:** "📊 Controla tu negocio" — Ilustración de dashboard + "Accede a todos tus módulos desde un solo lugar"

### Elementos UI
- **Ilustración** en cada paso (imagen drawable/svg)
- **Texto descriptivo** abajo
- **Dots** indicadores (3-4 dots)
- **Botón "Saltar"** (esquina superior derecha)
- **Botón "Siguiente"** → Avanza al siguiente paso
- **Botón "Comenzar"** → En el último paso, va al Login

---

## 📱 Flujos de Usuario Clave

### Flujo 1: Chatbot → Crear Lead
1. Usuario escribe: "Crea un lead para Ana García, ana@email.com, teléfono 555-1234"
2. Gemma procesa con el pipeline de agentes (Intent Classifier → Entity Extractor → Execution Engine)
3. Muestra tarjeta de confirmación: "✅ Lead creado: Ana García" + botón "Ver detalle"
4. Tap en "Ver detalle" → Navega al detalle del lead

### Flujo 2: Chatbot → Agendar Cita
1. Usuario: "Agenda una cita para mañana a las 10am"
2. Gemma: "📅 ¿Qué servicio te gustaría?" (quick replies: servicios disponibles)
3. Usuario: "El servicio de consultoría"
4. Gemma: "✅ Cita agendada: Consultoría — Mañana 10:00am" + botones "Confirmar / Reagendar / Cancelar"

### Flujo 3: Notificación → Acción
1. Llega notificación push: "🔔 Nueva cita asignada: Juan Pérez - 14:00"
2. Usuario hace tap en la notificación
3. App abre el detalle de la cita
4. Opciones: Confirmar, Reagendar, Cancelar, Mensaje al lead

### Flujo 4: Voz → Consulta de Inventario
1. Usuario presiona micrófono: "¿Cuántas unidades del SKU-101 tenemos?"
2. Gemma busca en el sistema
3. Responde: "📦 SKU-101: 245 unidades en almacén principal, 30 en tránsito"
4. Opcional: "¿Quieres que vea los detalles de este producto?" (quick reply)

### Flujo 5: Voz → Transferencia de Stock
1. Operario en almacén presiona micrófono: "Gemma, necesito mover 5 cajas del Lote X-203 al Pasillo 2"
2. Gemma procesa: extrae entidad (Lote X-203, 5 cajas, Pasillo 2) y verifica permisos del usuario
3. Gemma responde con tarjeta de confirmación: "📦 ¿Confirmas el movimiento? — **5 cajas** del **Lote X-203** → **Pasillo 2**" + botones "Confirmar" / "Modificar" / "Cancelar"
4. Usuario confirma → Gemma ejecuta la transferencia en el sistema de inventario
5. Gemma: "✅ Movimiento registrado. 5 cajas del Lote X-203 trasladadas al Pasillo 2. ¿Necesitas algo más?"

### Flujo 6: Escáner → Consulta de Producto
1. Usuario abre escáner desde AppBar
2. Escanea código de barras de un producto
3. Modal: "📦 Producto encontrado: Tuerca M8 — Stock: 500 uds. — Precio: $0.50"
4. Botón "Preguntar a Gemma" → Envía al chat: "¿Qué me dices de este producto?"

---

## 🔄 APIs y Endpoints para Integración

La app móvil se conecta al backend existente de Volkern (Next.js). Endpoints principales:

### Autenticación
- `POST /api/auth/signin` — Login
- `POST /api/auth/signup` — Registro
- `POST /api/auth/biometric` — Login biométrico

### Chatbot
- `POST /api/chatbot/widget` — Enviar mensaje al chatbot (model: deepseek/deepseek-v4-flash)
  - Body: `{ message: string, sessionId: string, conversationHistory: array }`
  - Response: `{ success: boolean, response: string, sessionId: string }`

### Notificaciones
- `GET /api/notifications` — Obtener notificaciones del usuario
- `PATCH /api/notifications` — Marcar como leídas (body: `{ id?: string, all?: boolean }`)
- `POST /api/users/me/push-subscription` — Registrar suscripción push

### Leads
- `GET /api/leads` — Listar leads
- `POST /api/leads` — Crear lead
- `GET /api/leads/[id]` — Obtener detalle
- `PATCH /api/leads/[id]` — Actualizar lead

### Citas
- `GET /api/citas` — Listar citas
- `POST /api/citas` — Crear cita
- `PATCH /api/citas/[id]` — Actualizar cita

### Perfil
- `GET /api/users/me` — Obtener perfil
- `PATCH /api/users/me` — Actualizar perfil

---

## 🧩 Componentes UI Reutilizables

Para mantener consistencia en todas las pantallas, la app debe incluir estos componentes compartidos:

### 1. **AvatarWithInitials**
- Circular, color de fondo dinámico basado en hash del nombre
- Muestra iniciales dentro (ej: "AG" para Ana García)
- Tamaños: 24px, 28px, 32px, 40px, 44px, 80px

### 2. **StatusBadge**
- Pequeño badge coloreado según estado
- Colores: verde (activo/éxito), amarillo (pendiente), rojo (error), gris (inactivo)
- Formato: pill shape, 12px alto

### 3. **QuickReplyChip**
- Botón pequeño estilo chip
- Border-radius 20px, borde gris, texto gris oscuro
- Usado en: sugerencias de Gemma, filtros

### 4. **SkeletonLoader**
- Placeholder animado (pulse/shimmer)
- Para estados de carga en listas, cards, detalles

### 5. **EmptyState**
- Icono grande + título + subtítulo + acción opcional
- Usado cuando no hay datos

### 6. **ErrorState**
- Icono de error + mensaje + botón "Reintentar"

### 7. **BottomSheet**
- Modal desde abajo, 50-90% de la pantalla
- Drag para cerrar (swipe down)
- Usado para: acciones, creación rápida, filtros

### 8. **ConfirmationDialog**
- Modal de confirmación
- Título + descripción + botones "Cancelar" / "Confirmar"
- Usado para: acciones destructivas (eliminar, cerrar sesión)

### 9. **Toast / Snackbar**
- Notificación temporal en la parte superior
- Colores: verde (éxito), rojo (error), azul (info)
- Auto-dismiss 3 segundos

### 10. **Badge**
- Círculo rojo con número blanco
- Para contador de notificaciones no leídas

---

## 📱 Responsive / Adaptabilidad

- **Teléfonos** (360-428px width): Layout de 1 columna, bottom nav visible
- **Tablets** (600-900px width): Layout de 2 columnas, sidebar opcional, bottom nav compacto
- **Modo landscape:** Header más compacto, contenido aprovecha ancho extra
- **Dark mode:** Soporte opcional (invertir colores manteniendo contraste)

---

## 🎯 Principios de UX para la App

1. **Chatbot-first:** Gemma es el centro de todo. Desde el chat se puede hacer cualquier operación
2. **Voz como interfaz primaria:** Botón de micrófono siempre visible y accesible
3. **Notificaciones accionables:** Cada notificación permite tomar acción inmediata
4. **Offline-first:** La app debe funcionar sin conexión para tareas básicas (ver leads cacheados, redactar mensajes que se envían al reconectar)
5. **Biometría obligatoria:** FaceID/Huella para abrir la app (seguridad)
6. **Gestos:** Swipe para acciones rápidas, pull-to-refresh, drag-to-dismiss modales
7. **Feedback háptico:** En acciones importantes (enviar mensaje, escanear código, crear lead)
8. **Animaciones suaves:** Transiciones entre pantallas, carga de datos, estados del chat
9. **Consistencia:** Mismos patrones UI en todas las pantallas (mismos componentes reutilizables)
10. **Rendimiento:** Listas virtualizadas (lazy loading), imágenes cacheadas, skeleton loading

---

## 📝 Notas Adicionales para Stitch

1. **Gemma es el reemplazo de Telegram:** El chat de Gemma en la app móvil reemplaza completamente la experiencia del bot de Telegram. Todas las capacidades que antes estaban en Telegram ahora están en la app.
2. **Contexto automático:** Gemma sabe quién es el usuario, su rol, tenant y ubicación (si se autoriza GPS). Esto permite respuestas contextuales sin que el usuario tenga que especificar.
3. **Herencia de permisos:** El usuario móvil hereda los permisos de su rol en el CRM. Gemma no puede ejecutar operaciones que el usuario no tendría permitidas.
4. **Los 18 hubs del CRM** (que agrupan 48 módulos) están disponibles pero optimizados para móvil (vistas simplificadas, acciones rápidas vía chat).
5. **Notificaciones push** se integran con el sistema existente de Apprise y la tabla `inAppNotification`.
6. **Módulos bloqueados por plan:** Los módulos no incluidos en el plan del tenant se muestran con opacidad reducida y un candado. Al hacer tap, muestra: "Este módulo requiere el plan [nombre]. ¿Quieres actualizar?" con botón "Ver planes".

---

*Documento creado para ser usado como prompt en Google Stitch (stitch.withgoogle.com)*
