# Volkern Insurance — Plan de Desarrollo

> **El primer agente IA que trabaja la cartera completa de un corredor de seguros: detecta renovaciones, encuentra oportunidades y ayuda a recuperar clientes antes de perderlos.**
>
> Estado: 🟡 **PENDIENTE DE REVISIÓN (v2 — Ajustes post-feedback)**  
> Fecha: Julio 2026  
> Rama propuesta: `feat/insurance-vertical`

---

## 📐 Índice

1. [Arquitectura General](#1-arquitectura-general)
2. [Objetos de Negocio (Modelo de Datos)](#2-objetos-de-negocio-modelo-de-datos)
3. [Módulos Específicos](#3-módulos-específicos)
4. [Pipeline Comercial — Doble Pipeline](#4-pipeline-comercial--doble-pipeline)
5. [Motor de Renovaciones](#5-motor-de-renovaciones)
6. [AI Portfolio Manager + Insurance Advisor](#6-ai-portfolio-manager--insurance-advisor)
7. [Dashboard — Mapa de Cartera](#7-dashboard--mapa-de-cartera)
8. [Automatizaciones Específicas](#8-automatizaciones-específicas)
9. [Landing Page Pública](#9-landing-page-pública)
10. [Configuración del Módulo](#10-configuración-del-módulo)
11. [Importación de Cartera](#11-importación-de-cartera)
12. [Marketplace de Integraciones (Fase 5)](#12-marketplace-de-integraciones-fase-5)
13. [Modelo Comercial](#13-modelo-comercial)
14. [Plan de Implementación por Fases](#14-plan-de-implementación-por-fases)
15. [Estimación de Esfuerzo](#15-estimación-de-esfuerzo)
16. [Riesgos y Consideraciones](#16-riesgos-y-consideraciones)

---

## 1. Arquitectura General

Volkern Insurance se construye como una **vertical** sobre la plataforma base de Volkern, siguiendo el mismo patrón que Real Estate, Accounting y RRHH.

```
                 VOLKERN PLATFORM (Core)
                         |
     ┌───────────────────┼───────────────────┐
     |                   |                   |
Real Estate         Insurance           Accounting
Vertical           Vertical (NUEVA)     Vertical
```

### Lo que se reutiliza del Core

| Componente Core | Uso en Insurance |
|:---|:---|
| Contactos / Leads | Clientes asegurados (con perfil ampliado) |
| Empresas | Aseguradoras como entidades |
| Comunicación omnicanal | WhatsApp, email, chat para agentes |
| Automatizaciones | Motor de reglas para renovaciones, follow-ups, cross-sell |
| IA Agents (framework) | Base para AI Portfolio Manager + Advisor |
| Pipeline comercial | Extendido con doble pipeline (venta nueva + renovación) |
| Marketing | Campañas para cartera |
| Documentos | Pólizas, certificados, firmas |
| Tareas / Calendario | Recordatorios de renovación, citas |

### Lo que se crea nuevo

1. **Objetos**: Póliza, Producto, Aseguradora, Renovación, Oportunidad Comercial
2. **Doble Pipeline**: Pipeline de Nuevas Pólizas + Pipeline de Renovaciones
3. **Motor de Renovaciones**: Escáner diario, alertas, riesgo de pérdida
4. **AI Portfolio Manager**: Resumen matutino, detección de oportunidades, recomendaciones accionables
5. **Insurance Advisor Agent**: Atención conversacional para clientes
6. **Dashboard — Mapa de Cartera**: Panel específico con KPIs de seguros y salud de cartera
7. **Landing**: Página pública tipo RealEstateLanding
8. **Importador Excel/CSV**: Desde el día 1
9. **Config Dashboard**: Panel de configuración tipo RealEstateConfigDashboard

### Los Tres Pilares del MVP

```
   ┌──────────────┐
   │   CLIENTES   │
   │  + PÓLIZAS   │  ← Organizar la cartera
   └──────┬───────┘
          ↓
   ┌──────────────┐
   │ RENOVACIONES │  ← No perder ni una
   └──────┬───────┘
          ↓
   ┌──────────────┐
   │ IA COMERCIAL │  ← Detectar oportunidades
   └──────────────┘
```

> **El dolor principal que resolvemos:** "Tengo 2,000 clientes y no sé a quién llamar, cuándo renovar ni qué venderle."

### Lo que QUEDA FUERA del MVP

| Excluido del MVP | Motivo |
|:---|:---|
| Seguimiento de pagos / cobros | Lo maneja la aseguradora, no vende la primera solución |
| Gestión profunda de comisiones | Dolor secundario; el principal es cartera + renovación |
| Integraciones de cobro | No necesarias para demostrar valor |
| Módulo de Siniestros | Fase 5 |
| APIs de aseguradoras | Fase 5; primero importación Excel/CSV |

---

## 2. Objetos de Negocio (Modelo de Datos)

### 2.1 `Aseguradora` (Nuevo)

```prisma
model Aseguradora {
  id              String    @id @default(cuid())
  tenantId        String
  tenant          Tenant    @relation(fields: [tenantId], references: [id])

  nombre          String
  nif             String?
  direccion       String?
  telefono        String?
  email           String?
  web             String?

  codigoExterno   String?   // Código en sistema externo (futuro)
  activa          Boolean   @default(true)

  productos       ProductoSeguro[]
  polizas         Poliza[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([tenantId, nombre])
}
```

### 2.2 `ProductoSeguro` (NUEVO — Diferencial clave)

¿Por qué un objeto Producto separado? **Porque la IA debe saber vender.** Si un cliente tiene Auto AXA, la IA debe detectar "puede interesarle Hogar AXA" y crear una Oportunidad Comercial automáticamente.

```prisma
enum Ramo {
  AUTO
  HOGAR
  VIDA
  SALUD
  GASTOS_MEDICOS
  EMPRESARIAL
  RESPONSABILIDAD_CIVIL
  INCENDIO
  TRANSPORTE
  AHORRO
  JUBILACION
  OTROS
}

model ProductoSeguro {
  id              String        @id @default(cuid())
  tenantId        String
  tenant          Tenant        @relation(fields: [tenantId], references: [id])

  aseguradoraId   String
  aseguradora     Aseguradora   @relation(fields: [aseguradoraId], references: [id])

  nombre          String        // "Seguro Vida Protección Familiar"
  ramo            Ramo
  subramo         String?       // "Vida entera", "Auto 3ros ampliado"
  descripcion     String?

  // Parámetros comerciales
  primaReferencia Decimal?      // Prima de referencia para cotizaciones
  comisionPct      Decimal?     // % comisión estándar del agente
  activo           Boolean      @default(true)

  polizas         Poliza[]
  oportunidades   OportunidadComercial[]

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@unique([tenantId, aseguradoraId, nombre])
  @@index([tenantId, ramo])
}
```

### 2.3 `Poliza` (Nuevo — Con relación a Producto)

```prisma
enum EstadoPoliza {
  ACTIVA
  PROXIMA_A_VENCER
  VENCIDA
  CANCELADA
  EN_TRAMITE
}

enum FormaPago {
  ANUAL
  SEMESTRAL
  TRIMESTRAL
  MENSUAL
}

model Poliza {
  id                  String        @id @default(cuid())
  tenantId            String
  tenant              Tenant        @relation(fields: [tenantId], references: [id])

  // Relaciones
  clienteId           String
  cliente             Contact       @relation(fields: [clienteId], references: [id])
  aseguradoraId       String
  aseguradora         Aseguradora   @relation(fields: [aseguradoraId], references: [id])
  productoSeguroId    String
  productoSeguro      ProductoSeguro @relation(fields: [productoSeguroId], references: [id])

  // Datos de la póliza
  numeroPoliza        String
  descripcion         String?
  sumaAsegurada       Decimal?
  primaAnual          Decimal?
  formaPago           FormaPago?
  moneda              String        @default("EUR")

  // Fechas clave
  fechaInicio         DateTime
  fechaVencimiento    DateTime
  fechaEmision        DateTime      @default(now())

  // Estado
  estado              EstadoPoliza  @default(ACTIVA)

  // Metadata (comisiones básicas sin gestión profunda en MVP)
  comisionPct         Decimal?
  notas               String?

  // Adjuntos
  documentos          PolizaDocumento[]

  // Tracking
  renovaciones        Renovacion[]
  oportunidades       OportunidadComercial[]

  // Auditoría
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  createdById         String
  createdBy           User          @relation(fields: [createdById], references: [id])

  @@unique([tenantId, numeroPoliza])
  @@index([tenantId, estado])
  @@index([tenantId, fechaVencimiento])
  @@index([tenantId, productoSeguroId])
  @@index([clienteId])
}
```

> **Ejemplo:** Juan Pérez → AXA → Seguro Vida Protección Familiar (Ramo: Vida). La IA ahora sabe que AXA también tiene Hogar y Salud, y puede sugerir cross-sell.

### 2.4 `Renovacion` (Nuevo)

```prisma
enum EstadoRenovacion {
  PENDIENTE
  EN_PROCESO
  CONTACTO_INICIAL
  REVISION
  OFERTA_ENVIADA
  RENOVADA
  NO_RENOVADA
  PERDIDA
}

model Renovacion {
  id                String            @id @default(cuid())
  tenantId          String
  tenant            Tenant            @relation(fields: [tenantId], references: [id])

  polizaId          String
  poliza            Poliza            @relation(fields: [polizaId], references: [id])

  periodoInicio     DateTime
  periodoFin        DateTime
  estado            EstadoRenovacion  @default(PENDIENTE)

  nuevaPrima        Decimal?
  nuevaSumaAsegurada Decimal?
  condicionesDiferentes String?

  fechaContactoInicial DateTime?
  fechaCierre         DateTime?
  resultado           String?
  riesgoPerdida       Boolean         @default(false)
  motivoRiesgo        String?         // "Sin respuesta 3 intentos", "Competencia ofertó", etc.

  agenteAsignadoId    String?
  agenteAsignado      User?           @relation(fields: [agenteAsignadoId], references: [id])

  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@index([tenantId, estado])
  @@index([tenantId, periodoInicio])
}
```

### 2.5 `OportunidadComercial` (NUEVO — Diferencial clave)

**El agente vive de oportunidades.** La IA detecta patrones y crea oportunidades automáticamente.

```prisma
enum OrigenOportunidad {
  IA                  // Detectada automáticamente por AI Portfolio Manager
  MANUAL              // Creada por el agente
  RENOVACION          // Surgida de una renovación (cross-sell)
  REFERIDO            // Viene de un referido
}

enum EstadoOportunidad {
  NUEVA
  EN_ANALISIS
  COTIZADA
  EN_NEGOCIACION
  GANADA
  PERDIDA
}

model OportunidadComercial {
  id                String              @id @default(cuid())
  tenantId          String
  tenant            Tenant              @relation(fields: [tenantId], references: [id])

  // Relaciones
  clienteId         String
  cliente           Contact             @relation(fields: [clienteId], references: [id])
  polizaOrigenId    String?             // Póliza que originó la detección (cross-sell)
  polizaOrigen      Poliza?             @relation(fields: [polizaOrigenId], references: [id])
  productoSugeridoId String
  productoSugerido  ProductoSeguro      @relation(fields: [productoSugeridoId], references: [id])

  // Datos de la oportunidad
  titulo            String              // "Cross-sell Hogar para cliente con Auto"
  origen            OrigenOportunidad   @default(IA)
  probabilidad      Int                 // 0-100, estimada por IA
  primaEstimada     Decimal?
  estado            EstadoOportunidad   @default(NUEVA)

  // Seguimiento
  agenteAsignadoId  String?
  agenteAsignado    User?               @relation(fields: [agenteAsignadoId], references: [id])
  fechaCierre       DateTime?
  notas             String?

  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  @@index([tenantId, estado])
  @@index([tenantId, clienteId])
  @@index([tenantId, origen])
}
```

> **Ejemplo:** Carlos tiene Auto AXA → IA detecta probabilidad 78% de contratar Vida → crea Oportunidad `{cliente: Carlos, producto: Vida AXA, origen: IA, probabilidad: 78%, estado: Nueva}`. Esto conecta directamente con el pipeline de nuevas pólizas.

### 2.6 Ampliación del modelo `Contact`

Campos adicionales en el perfil del cliente (vía `metadata` JSON):

```typescript
interface PerfilAsegurado {
  fechaNacimiento?: string
  profesion?: string
  ingresosEstimados?: number

  estadoCivil?: 'soltero' | 'casado' | 'divorciado' | 'viudo'
  dependientes?: number
  familiares?: Array<{
    nombre: string
    parentesco: string
    fechaNacimiento: string
  }>

  necesidades?: string[]     // ['auto', 'hogar', 'vida', 'salud', 'ahorro']
  presupuestoMensual?: number
  nivelRiesgo?: 'bajo' | 'medio' | 'alto'
}
```

---

## 3. Módulos Específicos

### 3.1 Módulo Clientes + Perfil Asegurado

Extiende el CRM base con el perfil asegurado.

**Componentes nuevos:**
- `components/insurance/PerfilAsegurado.tsx` — Panel lateral en ficha de contacto
- `components/insurance/ClientePolizasList.tsx` — Lista de pólizas del cliente
- `components/insurance/ClienteOportunidades.tsx` — Oportunidades detectadas para este cliente

**Rutas:**
- `app/[tenant]/dashboard/seguros/clientes/[id]/page.tsx` — Vista detallada

### 3.2 Módulo Pólizas

CRUD completo de pólizas con buscador, filtros por ramo/producto/aseguradora/estado.

**Componentes nuevos:**
- `components/insurance/PolizaCard.tsx` — Tarjeta resumen
- `components/insurance/PolizaForm.tsx` — Formulario de alta/edición (con select Producto → Aseguradora)
- `components/insurance/PolizaTimeline.tsx` — Línea temporal
- `components/insurance/PolizaTable.tsx` — Vista tabla con filtros

**Rutas:**
- `app/[tenant]/dashboard/seguros/polizas/page.tsx` — Listado
- `app/[tenant]/dashboard/seguros/polizas/[id]/page.tsx` — Detalle
- `app/[tenant]/dashboard/seguros/polizas/nueva/page.tsx` — Alta

**APIs:**
- `app/api/insurance/polizas/route.ts` — CRUD
- `app/api/insurance/polizas/[id]/route.ts` — GET/PUT/DELETE

### 3.3 Módulo Aseguradoras + Productos

Directorio de aseguradoras y su catálogo de productos.

**Componentes:**
- `components/insurance/AseguradoraCard.tsx`
- `components/insurance/AseguradoraForm.tsx`
- `components/insurance/ProductoSeguroList.tsx` — Productos de una aseguradora

**Rutas:**
- `app/[tenant]/dashboard/seguros/aseguradoras/page.tsx`
- `app/[tenant]/dashboard/seguros/aseguradoras/[id]/productos/page.tsx`

### 3.4 Módulo Renovaciones

El corazón del sistema. Vista de calendario, alertas, y flujo de trabajo con su propio pipeline.

**Componentes:**
- `components/insurance/RenovacionCalendar.tsx` — Vista mensual/semanal
- `components/insurance/RenovacionAlerts.tsx` — Alertas diarias IA
- `components/insurance/RenovacionPipeline.tsx` — Kanban del Pipeline de Renovaciones
- `components/insurance/RenovacionRiskBadge.tsx` — Indicador de riesgo de pérdida

**Rutas:**
- `app/[tenant]/dashboard/seguros/renovaciones/page.tsx`

**APIs:**
- `app/api/insurance/renovaciones/route.ts`
- `app/api/insurance/renovaciones/alertas/route.ts`

### 3.5 Módulo Oportunidades Comerciales (NUEVO)

Listado de oportunidades detectadas por IA, con filtros por origen y probabilidad.

**Componentes:**
- `components/insurance/OportunidadCard.tsx`
- `components/insurance/OportunidadPipeline.tsx` — Conexión con Pipeline de Nuevas Pólizas

**Rutas:**
- `app/[tenant]/dashboard/seguros/oportunidades/page.tsx`

---

## 4. Pipeline Comercial — Doble Pipeline

**Venta nueva y renovación son procesos completamente diferentes.** Se implementan dos pipelines separados.

### 4.1 Pipeline 1: Nuevas Pólizas

```
Etapa 1: LEAD
  ↓   Prospecto nuevo u oportunidad IA
Etapa 2: NECESIDADES_DETECTADAS
  ↓   Análisis de necesidades del cliente
Etapa 3: COTIZACION
  ↓   Cotización enviada al cliente
Etapa 4: PRESENTACION
  ↓   Presentación de la propuesta
Etapa 5: NEGOCIACION
  ↓   Ajustes y negociación
Etapa 6: EMITIDA
  ↓   ¡Póliza emitida! → Se crea registro de Poliza
```

### 4.2 Pipeline 2: Renovaciones

```
Etapa 1: PROXIMA_RENOVACION
  ↓   Detectada por el motor (90-60-30 días)
Etapa 2: CONTACTO_INICIAL
  ↓   Primer contacto con el cliente
Etapa 3: REVISION
  ↓   Revisión de condiciones actuales vs nuevas
Etapa 4: OFERTA_ENVIADA
  ↓   Nueva oferta enviada al cliente
Etapa 5: RENOVADA
  ↓   ¡Renovación exitosa!
Etapa 6: PERDIDA
  ↓   Cliente se va (con motivo registrado)
```

Ambos pipelines se crean automáticamente al hacer el setup del módulo Insurance.

---

## 5. Motor de Renovaciones

### 5.1 Cron Job Diario

```typescript
// lib/cron/insurance-renewal-scanner.ts
// Se ejecuta diariamente (ej. 7:00 AM)

async function scanRenovaciones() {
  // 1. Escanear cartera: pólizas que vencen en 90, 60, 30, 15, 7, 1 días
  // 2. Crear/actualizar registros de Renovacion
  // 3. Actualizar Pipeline de Renovaciones (mover etapas)
  // 4. Detectar riesgo de pérdida (sin contacto + cerca de vencer)
  // 5. Generar Oportunidades Comerciales (cross-sell)
  // 6. Generar resumen matutino para el agente
}
```

### 5.2 Resumen Diario del AI Portfolio Manager

Cada mañana, la IA entrega un resumen accionable:

```text
"Buenos días Ana.

Revisé tu cartera:

📋 18 pólizas vencen en 60 días.
🔴 5 clientes tienen oportunidad de venta cruzada:
   - Juan Pérez (Auto) → Hogar AXA (probabilidad 78%)
   - María López (Hogar) → Vida GNP (probabilidad 65%)
   - Carlos Ruiz (Auto) → Salud (probabilidad 52%)
   ...
🔴 3 clientes tienen alto riesgo de abandono:
   - Pedro Gómez (Auto Qualitas) — vence en 7 días, sin contacto
   - Laura Díaz (Hogar AXA) — competencia ofertó
   - ...
🟡 4 renovaciones en negociación

He preparado las acciones recomendadas. ¿Quieres que las revise?"
```

### 5.3 Detección de Riesgo de Pérdida

```typescript
// Factores de riesgo:
// - Vence en < 15 días sin ningún contacto
// - Vence en < 30 días sin cotización enviada
// - Cliente no responde a 2+ intentos de contacto
// - Siniestro reciente no resuelto
// - Cliente sin contacto en 6+ meses (abandono pasivo)
```

### 5.4 Detección de Ventas Cruzadas

```typescript
// Patrones detectados por IA:
// - Cliente solo tiene Auto → sugerir Hogar, Vida
// - Cliente con Auto + Hogar → sugerir Vida, Salud, Ahorro
// - Cliente con Vida → sugerir Ahorro, Jubilación
// - Cliente empresarial → sugerir RC, Incendio, Flotilla
// - Cliente del mismo ramo en otra aseguradora → oportunidad de cambio
```

---

## 6. AI Portfolio Manager + Insurance Advisor

### 6.1 Dos Agentes, Dos Roles

```
┌─────────────────────────────────────┐
│        AI PORTFOLIO MANAGER         │
│  "Trabaja la cartera"              │
│                                     │
│  • Escanea la cartera diariamente   │
│  • Detecta oportunidades            │
│  • Mide riesgo de pérdida           │
│  • Genera resumen matutino          │
│  • Crea Oportunidades Comerciales   │
│  • Prioriza acciones del día        │
└─────────────────────────────────────┘
                 +
┌─────────────────────────────────────┐
│       INSURANCE ADVISOR             │
│  "Atiende al cliente"              │
│                                     │
│  • Responde dudas de pólizas        │
│  • Califica prospectos              │
│  • Programa seguimientos            │
│  • Conecta con WhatsApp             │
└─────────────────────────────────────┘
```

### 6.2 AI Portfolio Manager — Skills

```typescript
// lib/insurance/agents/portfolio-manager.ts

// Skill 1: escanear_cartera
// - Recorre todas las pólizas del tenant
// - Identifica vencimientos próximos
// - Actualiza Pipeline de Renovaciones
// - Marca riesgo de pérdida

// Skill 2: detectar_oportunidades
// - Analiza patrones de venta cruzada
// - Evalúa probabilidad de contratación
// - Crea OportunidadComercial automáticamente
// - Asigna al agente responsable

// Skill 3: resumen_diario
// - Genera el briefing matutino
// - Calcula KPIs: renovación esperada, riesgo, oportunidades
// - Prioriza las 5 acciones más urgentes

// Skill 4: salud_cartera
// - Clientes sin contacto > 6 meses
// - Pólizas con prima baja vs mercado
// - Concentración de riesgo por aseguradora
```

### 6.3 Insurance Advisor — Skills

```typescript
// lib/insurance/agents/insurance-advisor.ts

// Skill 1: atencion_cliente
// - "¿Qué cubre mi póliza?" → consulta BD
// - "¿Cuándo vence?" → busca fecha
// - "Necesito cambiar beneficiario" → crea tarea

// Skill 2: ventas
// - "Quiero un seguro médico"
// - Pregunta edad, familia, presupuesto, necesidad
// - Crea oportunidad en Pipeline de Nuevas Pólizas
// - Programa seguimiento automático

// Skill 3: conocimiento
// - FAQ de productos
// - Glosario de seguros
// - Diferencias entre productos similares
```

### 6.4 Integración con WhatsApp/Web

Ambos agentes responden en el chat web del CRM y en WhatsApp (vía Evolution API ya integrada). El Portfolio Manager entrega su resumen matutino por WhatsApp al agente.

---

## 7. Dashboard — Mapa de Cartera

### 7.1 Componente Principal

`components/insurance/InsuranceDashboard.tsx`

### 7.2 KPIs del Mapa de Cartera

```typescript
interface MapaCarteraKPIs {
  // Salud de cartera
  clientesActivos: number           // 1,250
  polizasVigentes: number           // 1,870
  valorCartera: number              // €850,000 (suma de primas anuales)
  primaPromedio: number             // €680

  // Renovación
  renovacionEsperada: number        // 92% (tasa proyectada)
  renovacionesPendientes30dias: number  // 45
  renovacionesPendientes60dias: number  // 120

  // Riesgo
  clientesRiesgoPerdida: number     // 23
  clientesSinContacto6Meses: number // 340 ← ¡Diferencial!
  polizasVencidasSinRenovar: number // 12

  // Oportunidades IA
  oportunidadesDetectadas: number   // 87
  oportunidadesAltaProbabilidad: number // 31 (>70%)
  valorPotencialOportunidades: number  // €52,000
}
```

### 7.3 Widgets

| Widget | Descripción |
|:---|:---|
| **Mapa de Cartera** | KPIs principales con semáforo (🟢 saludable / 🟡 atención / 🔴 crítico) |
| **Renovaciones Próximas** | Timeline 7-15-30-60-90 días con contadores |
| **Distribución por Ramo** | Gráfico donut interactivo |
| **Distribución por Aseguradora** | Barras horizontales con riesgo |
| **Alertas IA del Día** | Resumen matutino del Portfolio Manager |
| **Oportunidades Comerciales** | Cards con probabilidad y valor estimado |
| **Pipeline Nuevas Pólizas** | Embudo con deals en cada etapa |
| **Pipeline Renovaciones** | Kanban con estados |
| **Clientes sin Contacto** | Lista de clientes abandonados (el diferencial comercial) |
| **Top Clientes por Prima** | Ranking con riesgo de pérdida |

---

## 8. Automatizaciones Específicas

| # | Trigger | Acción |
|:---|:---|:---|
| 1 | Nueva póliza creada | Crear registro de renovación, programar recordatorios 90-60-30 días |
| 2 | Póliza a 90 días de vencer | Email automático al cliente + notificación al agente |
| 3 | Póliza a 60 días de vencer | WhatsApp al cliente (si configurado) + mover en Pipeline Renovaciones |
| 4 | Póliza a 30 días de vencer | Segunda notificación + marcar "en riesgo" si sin respuesta |
| 5 | Póliza vencida sin renovar | Tarea urgente para el agente |
| 6 | Cumpleaños del cliente | Mensaje personalizado automático |
| 7 | Oportunidad IA detectada (>70%) | Crear deal en Pipeline Nuevas Pólizas + notificar agente |
| 8 | Prospecto sin respuesta 5 días | Recordatorio automático al agente |
| 9 | Renovación completada | Email de confirmación + programa próxima renovación |
| 10 | Cliente 1 año con póliza activa | Solicitar reseña Google + referido |

---

## 9. Landing Page Pública

### 9.1 Estructura

Siguiendo el patrón de `RealEstateLanding.tsx`:

| Sección | Contenido |
|:---|:---|
| **Hero** | "Tu cartera de seguros trabajando 24/7 con IA" |
| **Problema** | "Tienes 2,000 clientes y no sabes a quién llamar, cuándo renovar ni qué venderle." |
| **Solución** | AI Portfolio Manager que escanea tu cartera, detecta renovaciones, encuentra oportunidades y te da un plan diario. |
| **Flujo** | Importas tu cartera → La IA la escanea → Recibes tu briefing diario → Actúas donde importa |
| **Módulos** | Cartera inteligente, Pólizas, Renovaciones, Doble Pipeline, IA Advisor, Mapa de Cartera |
| **Beneficios** | +30% retención, -50% fugas, +25% venta cruzada, todo en un solo sistema |
| **Casos de Uso** | Agente independiente, Corredor, Agencia con equipo |
| **Testimonios** | (placeholder para early adopters) |
| **Precios** | 3 tiers: Starter €99, Professional €199, Agency €499 |
| **CTA** | "Prueba 14 días gratis" |

### 9.2 Posicionamiento

**NO vendemos "un CRM de seguros"** (compite con muchos). Vendemos:

> **"El primer agente IA que trabaja tu cartera mientras duermes."**

### 9.3 Archivos a crear

- `components/public/InsuranceLanding.tsx` — Componente landing
- `app/soluciones/seguros/page.tsx` — Ruta Next.js
- `public/insurance-hero.png` — Imagen de fondo hero

### 9.4 Colores de marca

- **Primario**: Azul profundo + Dorado (`#1e3a5f` / `#d4a843`)
- **Secundario**: Azul claro + Crema (`#3b82f6` / `#fef3c7`)
- **Acentuar**: Esmeralda para CTAs (`#059669`)

---

## 10. Configuración del Módulo

### 10.1 Config Dashboard

`components/insurance/InsuranceConfigDashboard.tsx`

**Tabs:**
1. **General** — Setup del módulo, estado, activación
2. **Renovaciones** — Configuración de ventanas de alerta (90-60-30-15-7 días)
3. **AI Portfolio Manager** — Activación, horario del briefing, canales (email/WhatsApp)
4. **Insurance Advisor** — Personalización de respuestas, tono, FAQs
5. **Integraciones** — Importación, APIs (fase 5)

### 10.2 Setup Automático

```typescript
// POST /api/configuracion/insurance/setup
// 1. Crear Pipeline Nuevas Pólizas (6 etapas)
// 2. Crear Pipeline Renovaciones (6 etapas)
// 3. Crear automatizaciones base
// 4. Crear campos personalizados para PerfilAsegurado
// 5. Activar flag del módulo
// 6. Programar primer escaneo de cartera
```

---

## 11. Importación de Cartera

**Crítico desde el día 1.** El 80% de los agentes tienen su cartera en Excel.

### 11.1 Formatos Soportados (Fase 1)

| Formato | Prioridad |
|:---|:---|
| Excel (.xlsx) | Crítica |
| CSV | Crítica |
| Google Sheets | Alta (Fase 2) |

### 11.2 Componente Importador

`components/insurance/ImportadorCartera.tsx`

```typescript
// Flujo:
// 1. Subir archivo Excel/CSV
// 2. Previsualizar datos (tabla con primeras 10 filas)
// 3. Mapear columnas (nuestra columna ← su columna)
// 4. Validar (NIFs duplicados, fechas inválidas, aseguradoras no registradas)
// 5. Importar (crear Aseguradora si no existe, crear Producto, crear Contacto, crear Póliza)
// 6. Resumen: "127 pólizas importadas, 3 aseguradoras nuevas, 5 warnings"
```

### 11.3 API

- `app/api/insurance/importar/route.ts` — POST multipart con archivo + mapping de columnas
- `app/api/insurance/importar/previsualizar/route.ts` — POST para preview sin guardar

---

## 12. Marketplace de Integraciones (Fase 5)

### 12.1 México

| Integración | Tipo | Prioridad |
|:---|:---|:---|
| Quálitas | API pólizas | Alta |
| GNP | API cotizador | Alta |
| AXA México | API | Media |
| Seguros Monterrey | API | Media |

### 12.2 España

| Integración | Tipo | Prioridad |
|:---|:---|:---|
| TIREA | Estándar ficheros | Alta |
| FIVA | Normativa | Alta |
| EIAC | Mediadores | Media |

---

## 13. Modelo Comercial

### 13.1 Posicionamiento

**NO** vendemos "CRM de seguros" (compites con Salesforce, Zoho, Ebroker...). Vendemos:

> **"El primer agente IA que trabaja tu cartera mientras duermes."**

### 13.2 Tiers

| Plan | Precio | Usuarios | Posicionamiento |
|:---|:---|:---|:---|
| **Insurance AI Starter** | €99/mes | 1 | "Para agentes que quieren controlar su cartera" |
| **Insurance AI Professional** | €199/mes | 3 | "Para agentes que quieren una IA trabajando su cartera" |
| **Insurance AI Agency** | €499/mes | 10 | "Para corredurías con equipos comerciales" |

### 13.3 Qué incluye cada plan

| Funcionalidad | Starter | Professional | Agency |
|:---|:---|:---|:---|
| Cartera (clientes + pólizas) | ✅ | ✅ | ✅ |
| Renovaciones + alertas | ✅ | ✅ | ✅ |
| Doble pipeline | ✅ | ✅ | ✅ |
| Importador Excel/CSV | ✅ | ✅ | ✅ |
| Mapa de Cartera básico | ✅ | ✅ | ✅ |
| WhatsApp | ✅ | ✅ | ✅ |
| AI Portfolio Manager | ❌ | ✅ | ✅ |
| Insurance Advisor | ❌ | ✅ | ✅ |
| Automatizaciones avanzadas | ❌ | ✅ | ✅ |
| Mapa de Cartera avanzado + predicciones | ❌ | ✅ | ✅ |
| Marketing / Campañas | ❌ | ❌ | ✅ |
| Equipos + roles | ❌ | ❌ | ✅ |
| Marca blanca | ❌ | ❌ | ✅ |
| Portal cliente | ❌ | ❌ | ✅ |

### 13.4 Add-ons

| Add-on | Precio |
|:---|:---|
| Usuario adicional (Starter/Pro) | €29/mes |
| AI Portfolio Manager (Starter) | €49/mes |
| Integración aseguradora (por API) | €99/mes |
| Portal cliente white-label | €149/mes |
| Onboarding + migración cartera | €499 único |

---

## 14. Plan de Implementación por Fases

### 🔴 Fase 1 — MVP Comercial (Semanas 1-4)

> **Objetivo:** Una demo que impresione. El agente debe ver su cartera organizada, el importador funcionando, y el Portfolio Manager entregando su primer briefing en la demo.

| Semana | # | Tarea | Esfuerzo |
|:---|:---|:---|:---|
| **S1** | 1.1 | Modelos Prisma: `Aseguradora`, `ProductoSeguro`, `Poliza`, `Renovacion`, `OportunidadComercial` | 6h |
| | 1.2 | Migración de BD + seed de datos de prueba (50 pólizas, 5 aseguradoras, 15 productos) | 4h |
| | 1.3 | CRUD API: `/api/insurance/polizas` (con relación Producto → Aseguradora) | 8h |
| | 1.4 | CRUD API: `/api/insurance/aseguradoras` + `/api/insurance/productos` | 6h |
| | 1.5 | **Importador Excel/CSV** (componente + API) | 12h |
| **S2** | 1.6 | Componentes UI: `PolizaCard`, `PolizaForm`, `PolizaTable` | 12h |
| | 1.7 | Páginas: `/dashboard/seguros/polizas` (listado + detalle + alta) | 8h |
| | 1.8 | Páginas: `/dashboard/seguros/aseguradoras` + productos | 6h |
| | 1.9 | Perfil asegurado en ficha de contacto | 4h |
| **S3** | 1.10 | Motor de renovaciones — cron job + Pipeline Renovaciones | 10h |
| | 1.11 | `RenovacionCalendar` + `RenovacionPipeline` (kanban) | 12h |
| | 1.12 | Alertas de renovación (in-app + email) | 6h |
| **S4** | 1.13 | AI Portfolio Manager — Skill `escanear_cartera` + `resumen_diario` | 12h |
| | 1.14 | AI Portfolio Manager — Skill `detectar_oportunidades` | 8h |
| | 1.15 | Dashboard Mapa de Cartera (widgets principales) | 12h |
| | 1.16 | Demo final + ajustes | 4h |
| | | **Total Fase 1** | **130h** |

### 🟡 Fase 2 — IA + Automatización (Semanas 5-6)

| # | Tarea | Esfuerzo | Dep. |
|:---|:---|:---|:---|
| 2.1 | Insurance Advisor: skill `atencion_cliente` (FAQ pólizas) | 12h | 1.3 |
| 2.2 | Insurance Advisor: skill `ventas` (calificación de prospectos) | 10h | 1.3 |
| 2.3 | Integración WhatsApp para ambos agentes IA | 8h | 2.1 |
| 2.4 | Automatizaciones base (renovaciones 90-60-30, cumpleaños, cross-sell) | 10h | 1.10 |
| 2.5 | Mapa de Cartera avanzado (predicciones, salud de cartera) | 8h | 1.15 |
| 2.6 | Oportunidades Comerciales UI + Pipeline Nuevas Pólizas | 10h | 1.14 |
| | **Total Fase 2** | **58h** | |

### 🟢 Fase 3 — Landing + Config + Setup (Semanas 7-8)

| # | Tarea | Esfuerzo | Dep. |
|:---|:---|:---|:---|
| 3.1 | `InsuranceLanding.tsx` (página pública, ~800 líneas) | 16h | — |
| 3.2 | Página `/soluciones/seguros` | 2h | 3.1 |
| 3.3 | `InsuranceConfigDashboard.tsx` (5 tabs) | 12h | Fase 1 |
| 3.4 | API `/api/configuracion/insurance/setup` | 6h | 1.1 |
| 3.5 | E2E tests: flujo completo importación → póliza → renovación → IA | 10h | Fases 1-2 |
| 3.6 | Documentación de usuario | 6h | Fases 1-2 |
| | **Total Fase 3** | **52h** | |

### 🔵 Fase 4 — Pulido + Early Adopters (Semanas 9-10)

| # | Tarea | Esfuerzo |
|:---|:---|:---|
| 4.1 | Google Sheets importador | 8h |
| 4.2 | Exportación de cartera (Excel/PDF) | 6h |
| 4.3 | Refinamiento IA Advisor con feedback real | 12h |
| 4.4 | Onboarding guiado (tour interactivo) | 8h |
| 4.5 | Optimización de rendimiento (carteras > 5,000 pólizas) | 8h |
| 4.6 | Analytics de uso del módulo | 6h |
| | **Total Fase 4** | **48h** | |

### ⚪ Fase 5 — Marketplace + Siniestros (Futuro)

| # | Tarea | Esfuerzo |
|:---|:---|:---|
| 5.1 | Módulo Siniestros (modelo + CRUD + UI) | 40h |
| 5.2 | Integración TIREA (España) | 24h |
| 5.3 | Integración Quálitas (México) | 24h |
| 5.4 | Portal cliente white-label | 30h |
| | **Total Fase 5** | **118h** | |

---

## 15. Estimación de Esfuerzo

| Fase | Semanas | Horas | Hito |
|:---|:---|:---|:---|
| 🔴 Fase 1 — MVP Comercial | 1-4 | 130h | **Demo que impresiona:** cartera importada, Portfolio Manager briefing, Mapa de Cartera |
| 🟡 Fase 2 — IA + Automatización | 5-6 | 58h | Insurance Advisor responde, automatizaciones activas |
| 🟢 Fase 3 — Landing + Setup | 7-8 | 52h | Landing publicada, setup automático, tests completos |
| 🔵 Fase 4 — Pulido + Early Adopters | 9-10 | 48h | Google Sheets, onboarding, optimización |
| ⚪ Fase 5 — Marketplace | Futuro | 118h | APIs de aseguradoras, siniestros |
| **Total Fase 1-4 (MVP completo)** | **10 semanas** | **288h** | **Producto listo para early adopters** |

---

## 16. Riesgos y Consideraciones

| Riesgo | Prob. | Impacto | Mitigación |
|:---|:---|:---|:---|
| Excel de agentes con formatos inconsistentes | Alta | Medio | Importador con preview interactivo + mapping flexible de columnas |
| IA Portfolio Manager requiere fine-tuning | Media | Medio | Empezar con reglas heurísticas + RAG; evolucionar a ML |
| Adopción por agentes tradicionales | Media | Medio | Onboarding guiado, demo de 5 min que impresiona, importador Excel día 1 |
| Regulación de seguros (DORA, LOPD) | Baja | Alto | Revisión legal pre-producción; datos sensibles encriptados |
| Competencia (Ebroker, Zoho, etc.) | Media | Bajo | **No competimos en features de CRM. Competimos en IA que trabaja la cartera.** |
| Volumen de pólizas (>10k) degrada rendimiento | Media | Medio | Paginación server-side, índices en BD, cacheo de escaneos IA |

---

## 📋 Checklist de Revisión (v2)

Cambios aplicados respecto a la versión anterior:

- [x] **Quitar cobros/comisiones del MVP** — El dolor principal es cartera + renovación
- [x] **Agregar `ProductoSeguro`** — Relación Póliza → Producto → Aseguradora para que la IA sepa vender
- [x] **Agregar `OportunidadComercial`** — IA detecta patrones y crea oportunidades automáticamente
- [x] **Separar Pipeline** — Pipeline Nuevas Pólizas (6 etapas) + Pipeline Renovaciones (6 etapas)
- [x] **Evolucionar IA** — AI Portfolio Manager (trabaja cartera) + Insurance Advisor (atiende cliente)
- [x] **Importador Excel/CSV desde el día 1** — Crítico para adopción
- [x] **Mapa de Cartera** — Salud de cartera, clientes sin contacto, oportunidades IA
- [x] **Fase 1 reestructurada** — 4 semanas a demo que impresiona
- [x] **Cambiar posicionamiento** — No "CRM seguros", sino "IA que trabaja tu cartera"

Pendientes de decisión:

- [ ] ¿El nombre "Volkern Insurance" se mantiene? ✅ Confirmado — permite internacionalizar
- [ ] ¿Los 3 tiers de precio (€99/€199/€499) son correctos para el mercado?
- [ ] ¿Priorizamos España o México para las primeras integraciones (Fase 5)?
- [ ] ¿El color scheme (azul + dorado) funciona para la landing?
- [ ] ¿Hay alguna aseguradora concreta que quieras priorizar en seed data?

---

> **Próximo paso:** Revisa este documento actualizado y confirma. Una vez aprobado, ramifico `feat/insurance-vertical` y comienzo la Fase 1 por el modelo de datos + importador Excel.
