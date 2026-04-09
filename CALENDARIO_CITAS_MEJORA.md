# 📅 Sistema de Calendario para Citas - Volkern CRM

## Resumen

Se ha implementado un sistema completo de gestión de citas con vista de calendario estilo Google Calendar, permitiendo tanto citas de servicio como citas de negocios (reuniones, llamadas, demos, etc.).

---

## ✅ Funcionalidades Implementadas

### 1. 🗄️ Modelo de Datos Flexible

**Archivo:** `prisma/schema.prisma`

#### Cambios en el Modelo `Cita`:

```prisma
model Cita {
  id                 String   @id @default(cuid())
  tenantId           String?
  leadId             String
  servicioId         String?  // ✅ Ahora opcional
  tipo               String   @default("reunion") // ✅ Nuevo campo
  titulo             String?
  descripcion        String?
  ubicacion          String?  // ✅ Nuevo campo
  linkReunion        String?  // ✅ Nuevo campo (Zoom, Meet, Teams)
  fechaHora          DateTime
  duracion           Int      @default(60)
  estado             String   @default("pendiente")
  montoPagado        Float?
  stripePaymentId    String?
  fechaCreacion      DateTime @default(now())
  fechaActualizacion DateTime @updatedAt

  tenant   Tenant?   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  lead     Lead      @relation(fields: [leadId], references: [id], onDelete: Cascade)
  servicio Servicio? @relation(fields: [servicioId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([fechaHora])
  @@index([estado])
  @@index([tipo]) // ✅ Nuevo índice
}
```

#### Tipos de Citas Soportados:

- `servicio` - Cita con servicio pagado
- `reunion` - Reunión de negocios (default)
- `llamada` - Llamada telefónica
- `demo` - Demostración de producto
- `otro` - Otros tipos personalizados

---

### 2. 🔧 API Mejorada

**Archivo:** `/app/api/citas/route.ts`

#### `POST /api/citas` - Crear Cita

**Antes:**
```json
{
  "leadId": "...",
  "servicioId": "..." // ❌ Obligatorio
}
```

**Ahora:**
```json
{
  "leadId": "clxxx...",
  "tipo": "reunion",           // ✅ Nuevo
  "titulo": "Reunión de seguimiento",
  "descripcion": "Revisión de propuesta",
  "ubicacion": "Oficina Central",  // ✅ Nuevo
  "linkReunion": "https://zoom.us/j/123",  // ✅ Nuevo
  "fechaHora": "2024-12-01T14:00:00Z",
  "duracion": 60,
  "estado": "pendiente",
  "servicioId": "clyyy..."  // ✅ Opcional (solo para citas de servicio)
}
```

#### Validación Inteligente:

- Si `tipo === 'servicio'`, entonces `servicioId` es **obligatorio**
- Para otros tipos, `servicioId` es **opcional**
- `leadId` y `fechaHora` siempre son **obligatorios**

#### `GET /api/citas` - Listar Citas

**Nuevos Filtros:**
```bash
# Filtrar por tipo
GET /api/citas?tipo=reunion

# Filtrar por estado
GET /api/citas?estado=pendiente

# Filtrar por rango de fechas (para calendario)
GET /api/citas?fechaInicio=2024-12-01&fechaFin=2024-12-31
```

---

### 3. 📅 Componente de Calendario Visual

**Archivo:** `/components/calendar-view.tsx`

#### Características:

- ✅ **Vistas Múltiples**: Mes, Semana, Día, Agenda
- ✅ **Localización**: Interfaz en español
- ✅ **Colores por Tipo**: Cada tipo de cita tiene su color distintivo
  - 🔵 Reunión
  - 🟢 Llamada
  - 🟣 Demo
  - 🟠 Servicio
  - ⚪ Otro
- ✅ **Crear desde Calendario**: Click en cualquier slot de tiempo
- ✅ **Ver Detalles**: Click en evento existente
- ✅ **Drag & Drop**: (próximamente)

#### Vista de Creación:

```
┌─────────────────────────────────────┐
│ Nueva Cita                          │
├─────────────────────────────────────┤
│ Lead/Contacto: [Selector]           │
│ Tipo de Cita: [reunion ▼]           │
│ Duración: [60] minutos              │
│ Título: [____________]              │
│ Descripción: [____________]         │
│ Ubicación: [____________]           │
│ Link Reunión: [____________]        │
│                                     │
│ [Cancelar] [Crear Cita]             │
└─────────────────────────────────────┘
```

---

### 4. 🎯 Página de Citas con Tabs

**Archivo:** `/app/dashboard/citas/page.tsx`

#### Vista de Tabs:

```
┌──────────────────────────────────────────────┐
│  📊 Estadísticas                             │
│  Total: 45  Pendientes: 12  Confirmadas: 20  │
└──────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│ [ Calendario ] | [ Lista ]          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│                                     │
│      📅 Calendario Visual           │
│                                     │
│  [Vista Mes completa con eventos]   │
│                                     │
└─────────────────────────────────────┘
```

#### Vista de Lista (con Filtros):

```
┌─────────────────────────────────────┐
│ Filtros                             │
│ Estado: [Todos ▼]                   │
│ Tipo:   [Todos ▼]                   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🤝 Reunión de Seguimiento           │
│ Juan Pérez - Empresa ABC            │
│ 📅 1 de diciembre de 2024           │
│ ⏰ 14:00 (60 min)                   │
│ 📍 Oficina Central                  │
│ 🎥 Unirse a la reunión              │
└─────────────────────────────────────┘
```

---

## 🔄 Flujo de Uso Completo

### Caso 1: Agendar Reunión de Negocios

1. Usuario va a **Dashboard → Citas**
2. Click en tab **"Calendario"**
3. Click en un slot de tiempo libre
4. Completa formulario:
   - Selecciona lead
   - Tipo: "Reunión"
   - Título: "Revisión de Propuesta"
   - Ubicación: "Oficina"
5. Click **"Crear Cita"**
6. ✅ Cita creada y visible en calendario

### Caso 2: Agendar Cita de Servicio Pagado

1. Usuario crea cita desde el calendario
2. Tipo: **"Servicio"**
3. Sistema requiere **seleccionar servicio** (obligatorio)
4. Completa título y descripción
5. Click **"Crear Cita"**
6. ✅ Cita con servicio asociado
7. 💳 Posteriormente puede procesar pago

### Caso 3: Agendar Llamada Telefónica

1. Click en calendario
2. Tipo: **"Llamada"**
3. Duración: **30 min**
4. Notas en descripción
5. ✅ Llamada agendada (sin ubicación física)

---

## 🔐 Compatibilidad con Integraciones Existentes

### API Keys

Todos los endpoints son compatibles con autenticación via API Key:

```bash
curl -X POST "https://volkern.app/api/citas" \
  -H "X-API-Key: vk_prod_..." \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "clxxx...",
    "tipo": "reunion",
    "titulo": "Demo del producto",
    "fechaHora": "2024-12-01T15:00:00Z",
    "duracion": 45
  }'
```

### Webhooks Salientes

Se disparan eventos para:
- `cita_agendada`
- `cita_confirmada`
- `cita_completada`
- `cita_cancelada`

### Automatizaciones

Las automatizaciones existentes siguen funcionando:
- Email de confirmación
- Recordatorios 24h antes
- Seguimiento post-cita

---

## 📊 Comparación: Antes vs Ahora

| Característica | Antes | Ahora |
|----------------|-------|-------|
| Tipos de citas | Solo servicios pagados | 5 tipos diferentes |
| Vista | Solo lista | Lista + Calendario visual |
| Servicio | Obligatorio | Opcional |
| Ubicación | No soportada | Campo dedicado |
| Links virtuales | No soportados | Zoom, Meet, Teams |
| Filtros | Por estado | Estado + Tipo + Rango |
| Creación | Solo formulario | Formulario + Click en calendario |

---

## 🔧 Cambios Técnicos

### Archivos Creados:

1. `/components/calendar-view.tsx` - Componente de calendario

### Archivos Modificados:

1. `prisma/schema.prisma` - Modelo `Cita` actualizado
2. `/app/api/citas/route.ts` - API mejorada
3. `/app/api/citas/[id]/route.ts` - Null safety
4. `/app/api/checkout/route.ts` - Validación de servicio
5. `/app/api/webhooks/stripe/route.ts` - Null safety
6. `/app/dashboard/citas/page.tsx` - Tabs + Calendario

### Dependencias Añadidas:

```json
{
  "react-big-calendar": "^1.19.4",
  "@types/react-big-calendar": "^1.16.3"
}
```

---

## 🎨 Estilos y Diseño

### Colores por Tipo de Cita:

```css
.tipo-reunion   { background: #3b82f6; /* Azul */ }
.tipo-llamada   { background: #10b981; /* Verde */ }
.tipo-demo      { background: #8b5cf6; /* Púrpura */ }
.tipo-servicio  { background: #f97316; /* Naranja */ }
.tipo-otro      { background: #6b7280; /* Gris */ }
```

### Estados con Badges:

```
Pendiente   → 🟡 Yellow Badge
Confirmada  → 🔵 Blue Badge
Completada  → 🟢 Green Badge
Cancelada   → 🔴 Red Badge
```

---

## 🚀 Ejemplos de Uso con API

### Crear Reunión Virtual

```bash
curl -X POST "https://volkern.app/api/citas" \
  -H "X-API-Key: vk_prod_..." \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "lead_123",
    "tipo": "reunion",
    "titulo": "Kickoff Meeting",
    "descripcion": "Primera reunión del proyecto",
    "linkReunion": "https://meet.google.com/abc-defg-hij",
    "fechaHora": "2024-12-05T10:00:00Z",
    "duracion": 90
  }'
```

### Listar Citas del Mes

```bash
curl -X GET "https://volkern.app/api/citas?fechaInicio=2024-12-01&fechaFin=2024-12-31" \
  -H "X-API-Key: vk_prod_..."
```

### Filtrar Solo Reuniones Pendientes

```bash
curl -X GET "https://volkern.app/api/citas?tipo=reunion&estado=pendiente" \
  -H "X-API-Key: vk_prod_..."
```

---

## 📝 Notas Técnicas

### Null Safety

Todos los archivos que referencian `cita.servicio` fueron actualizados con validaciones:

```typescript
// Antes ❌
if (cita.montoPagado) {
  await sendPaymentConfirmation({
    servicio: {
      nombre: cita.servicio.nombre  // TypeError si servicio es null
    }
  })
}

// Ahora ✅
if (cita.montoPagado && cita.servicio) {
  await sendPaymentConfirmation({
    servicio: {
      nombre: cita.servicio.nombre  // Seguro
    }
  })
}
```

### Type Assertion en Calendar

Debido a problemas de compatibilidad de tipos con `react-big-calendar` v1.x:

```typescript
const CalendarComponent = BigCalendar as any

return <CalendarComponent {...props} />
```

---

## 🔮 Mejoras Futuras (Fase 2)

- [ ] Drag & Drop para mover citas en el calendario
- [ ] Vista de recursos (múltiples calendarios por usuario)
- [ ] Integración con Google Calendar (sincronización bidireccional)
- [ ] Recordatorios automáticos configurables
- [ ] Vista de disponibilidad para booking público
- [ ] Citas recurrentes (semanales, mensuales)
- [ ] Conflictos de horarios y sugerencias
- [ ] Exportar calendario a .ics
- [ ] Vista de timeline para múltiples días

---

## ✅ Checklist de Implementación

- ✅ Actualizar schema Prisma
- ✅ Ejecutar `yarn prisma db push`
- ✅ Actualizar API de citas (GET/POST)
- ✅ Instalar `react-big-calendar`
- ✅ Crear componente de calendario
- ✅ Actualizar página de citas con tabs
- ✅ Agregar null safety en archivos relacionados
- ✅ Compilar sin errores
- ✅ Guardar checkpoint
- ✅ Crear documentación

---

## 🎯 Métricas de Éxito

Con este sistema puedes medir:

- 📊 Total de citas por tipo
- 📊 Distribución de reuniones vs servicios
- 📊 Tasa de confirmación por tipo
- 📊 Duración promedio por tipo de cita
- 📊 Utilización del calendario (ocupación)
- 📊 Citas virtuales vs presenciales

---

## 💡 Tips de Uso

1. **Usa colores** para diferenciar visualmente tipos de citas
2. **Configura recordatorios** con automatizaciones
3. **Agrega links de Zoom** en todas las reuniones virtuales
4. **Filtra por tipo** para ver solo reuniones de negocios
5. **Usa la vista semanal** para planificación detallada
6. **Vista de agenda** para lista cronológica simple

---

¡El sistema de calendario está listo para gestionar todo tipo de citas! 🎉
