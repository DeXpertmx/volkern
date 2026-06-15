# Reporte Técnico: Módulo de Inventario y Almacén

## Documentación para el Equipo de Desarrollo

**Plataforma:** Volkern  
**Módulos:** Catálogo · Almacenes · Stock · Kardex · Watchdog  
**Fecha:** Junio 2026

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura General](#2-arquitectura-general)
3. [Modelo de Datos (Prisma)](#3-modelo-de-datos-prisma)
4. [Componentes del Sistema](#4-componentes-del-sistema)
5. [Catálogo de Productos (CatalogoItem)](#5-catálogo-de-productos-catalogoitem)
6. [Almacenes (Warehouse)](#6-almacenes-warehouse)
7. [Niveles de Stock (StockLevel)](#7-niveles-de-stock-stocklevel)
8. [Movimientos de Stock — El Kardex Inmutable](#8-movimientos-de-stock--el-kardex-inmutable)
9. [StockService — Registro de Movimientos Sellados](#9-stockservice--registro-de-movimientos-sellados)
10. [Inventory Skills — Ajustes y Consumo](#10-inventory-skills--ajustes-y-consumo)
11. [Inventory Watchdog — Vigilancia IA](#11-inventory-watchdog--vigilancia-ia)
12. [Consumo con BoM (Bill of Materials)](#12-consumo-con-bom-bill-of-materials)
13. [Configuración de Inventario (InventoryConfig)](#13-configuración-de-inventario-inventoryconfig)
14. [API Endpoints](#14-api-endpoints)
15. [Integración con Contabilidad](#15-integración-con-contabilidad)
16. [Diagrama de Flujo Completo](#16-diagrama-de-flujo-completo)
17. [Apéndice: Árbol de Archivos](#17-apéndice-árbol-de-archivos)

---

## 1. Resumen Ejecutivo

El módulo de Inventario y Almacén de Volkern proporciona gestión completa del ciclo de vida del stock: catálogo de productos, múltiples almacenes, niveles de stock por ubicación y lote, movimientos encadenados criptográficamente (Kardex inmutable), consumo inteligente con BoM, y vigilancia proactiva IA con alertas multicanal.

### Pilares técnicos

| Pilar | Tecnología | Archivo Clave |
|-------|-----------|---------------|
| **Kardex inmutable** | SHA-256 con encadenamiento de movimientos | `lib/erp/stock-service.ts` |
| **Ajustes transaccionales** | Transacciones Prisma con upsert atómico | `lib/skills/inventory-skills.ts` |
| **Consumo con BoM** | Despiece automático de componentes | `lib/skills/inventory-skills.ts` |
| **Watchdog IA** | Detección de stock bajo + notificación multicanal | `lib/skills/inventory-watchdog.ts` |
| **Automatización** | Acciones de flujo: ajustar stock, crear órdenes de compra | `lib/automation/actions/inventory.ts` |

---

## 2. Arquitectura General

```
┌──────────────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js Route Handlers)                  │
│  /api/erp/inventory  ·  /api/erp/inventory/stock                    │
│  /api/erp/inventory/movements  ·  /api/erp/inventory/consumption    │
│  /api/erp/warehouses  ·  /api/erp/projects/[id]/inventory           │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  StockService (lib/erp/stock-service.ts)                             │
│  registerMovement()  ·  getAvailableStock()  ·  updateLotStatus()   │
└──────────┬──────────────┬──────────────┬────────────────────────────┘
           ▼              ▼              ▼
┌────────────────┐ ┌────────────┐ ┌──────────────────────────────┐
│ Inventory      │ │ Inventory  │ │ Inventory Automation          │
│ Skills         │ │ Watchdog   │ │ (actions/inventory.ts)       │
│ adjustStock()  │ │ monitor     │ │ notifyLowStock()             │
│ consume()      │ │ alertas IA  │ │ updateInventory()            │
│ health()       │ │ Telegram   │ │ createPurchaseOrder()        │
└────────┬───────┘ └─────┬──────┘ └──────────────┬───────────────┘
         ▼               ▼                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Base de Datos (PostgreSQL + Prisma)                     │
│  CatalogoItem  ·  Warehouse  ·  StockLevel  ·  StockMovement        │
│  InventoryConfig  ·  InventoryLot  ·  BillOfMaterials               │
│  ProductionLog  ·  MaterialRequirement                              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Modelo de Datos (Prisma)

### 3.1 CatalogoItem

```prisma
model CatalogoItem {
  id               String     @id @default(cuid())
  tenantId         String
  nombre           String
  descripcion      String?
  sku              String?    // Stock Keeping Unit
  tipo             String     @default("servicio") // servicio | producto | digital | curso
  precioBase       Float
  moneda           String     @default("EUR")
  categoriaFiscal  String     @default("general")
  tasaImpuestoId   String?
  unidad           String     @default("unidad")
  activo           Boolean    @default(true)
  isManufactured   Boolean    @default(false)  // ¿Se fabrica con BoM?
  costOfAcquisition Float     @default(0)
  
  inventoryConfig  InventoryConfig?
  stockLevels      StockLevel[]
  movements        StockMovement[]
  bom              BillOfMaterials?
}
```

### 3.2 Warehouse

```prisma
model Warehouse {
  id          String        @id @default(cuid())
  tenantId    String
  name        String
  location    String?
  active      Boolean       @default(true)
  description String?
  stockLevels StockLevel[]
  movements   StockMovement[]
  @@map("erp_warehouses")
}
```

### 3.3 StockLevel

```prisma
model StockLevel {
  id             String        @id @default(cuid())
  tenantId       String
  warehouseId    String
  catalogoItemId String
  quantity       Float         @default(0)
  minStock       Float?        @default(0)
  maxStock       Float?
  lastSync       DateTime      @default(now())
  lotId          String?
  catalogoItem   CatalogoItem  @relation(fields: [catalogoItemId], references: [id])
  warehouse      Warehouse     @relation(fields: [warehouseId], references: [id])
  @@unique([warehouseId, catalogoItemId, lotId])
  @@map("erp_stock_levels")
}
```

### 3.4 StockMovement — El Kardex Inmutable

```prisma
model StockMovement {
  id             String        @id @default(cuid())
  tenantId       String
  warehouseId    String
  catalogoItemId String
  userId         String?
  type           String        // IN | OUT | ADJUSTMENT | TRANSFER | CONSUMPTION | PRODUCTION_OUTPUT
  quantity       Float
  reason         String?
  referenceId    String?
  metadata       Json?         @default("{}")
  auditHash      String?       @unique    // SHA-256 encadenado
  chainedHash    String?                  // Hash del movimiento anterior
  sealedAt       DateTime?               // Timestamp de sellado
  createdAt      DateTime      @default(now())
  
  catalogoItem   CatalogoItem  @relation(fields: [catalogoItemId], references: [id])
  warehouse      Warehouse     @relation(fields: [warehouseId], references: [id])
  @@map("erp_stock_movements")
}
```

### 3.5 InventoryConfig

```prisma
model InventoryConfig {
  id              String       @id @default(cuid())
  catalogoItemId  String       @unique
  minStock        Float        @default(0)
  reorderPoint    Float        @default(0)    // Punto de reorden
  valuationMethod String       @default("AVERAGE_COST")  // AVERAGE_COST | FIFO | LIFO
  storageLocation String?
  catalogoItem    CatalogoItem @relation(fields: [catalogoItemId], references: [id])
}
```

### 3.6 InventoryLot (lotes)

Campos clave: `id`, `tenantId`, `code`, `status` (QUARANTINE | AVAILABLE | REJECTED), `expirationDate`, `catalogoItemId`.

---

## 4. Componentes del Sistema

| Archivo | Función |
|---------|---------|
| `lib/erp/stock-service.ts` | Registro sellado de movimientos (Kardex) + consulta de disponibilidad |
| `lib/skills/inventory-skills.ts` | Ajustes transaccionales, consumo BoM, salud de inventario |
| `lib/skills/inventory-watchdog.ts` | Vigilancia IA: detección de stock bajo + alertas multicanal |
| `lib/automation/actions/inventory.ts` | Acciones de automatización: notificar, ajustar, orden de compra |
| `lib/validation/schemas/inventory.ts` | Schemas Zod para catálogo, campos, servicios |
| `app/api/erp/inventory/route.ts` | API de consulta de stock + ajuste manual |
| `app/api/erp/inventory/movements/route.ts` | API de historial de movimientos |
| `app/api/erp/inventory/consumption/route.ts` | API de consumo con disparo de Watchdog |
| `app/api/erp/warehouses/route.ts` | CRUD de almacenes |
| `app/[tenant]/dashboard/inventario/page.tsx` | Dashboard principal de inventario |
| `components/hubs/InventarioDashboard.tsx` | UI del dashboard con gráficos y alertas |

---

## 5. Catálogo de Productos (CatalogoItem)

### 5.1 Tipos de ítem

| Tipo | Descripción | ¿Tiene stock? | ¿Puede tener BoM? |
|------|-------------|:------------:|:-----------------:|
| `servicio` | Servicio intangible (consultoría, diseño) | ❌ | ❌ |
| `producto` | Bien físico con stock | ✅ | ✅ |
| `digital` | Producto digital (ebook, software) | ❌ | ❌ |
| `curso` | Curso o formación | ❌ | ❌ |

### 5.2 Campos personalizados

```prisma
model CatalogoFieldDefinition {
  id           String   @id @default(cuid())
  tenantId     String
  fieldKey     String   // identificador único: "color", "talla", "material"
  label        String   // "Color", "Talla"
  type         String   // text | number | select | boolean | date | url | textarea
  options      Json?    // ["Rojo","Azul","Verde"] para tipo select
  required     Boolean  @default(false)
  orden        Int      @default(0)
  categoria    String?  // Agrupar campos por categoría
  @@unique([tenantId, fieldKey])
}
```

Los valores de estos campos se almacenan en `CatalogoItem.customFieldValues` como JSON.

### 5.3 Validación (Zod)

```typescript
// lib/validation/schemas/inventory.ts
export const CatalogoItemCreateSchema = z.object({
  nombre: z.string().min(1),
  sku: z.string().optional().nullable(),
  tipo: z.enum(['servicio', 'producto', 'digital', 'curso']),
  precioBase: z.union([z.number(), z.string()]).transform(v => Number(v)),
  categoriaFiscal: z.string().optional().default('general'),
  unidad: z.string().optional().default('unidad'),
  isManufactured: z.boolean().optional().default(false),
  costOfAcquisition: z.union([z.number(), z.string()]).transform(v => Number(v)),
  bom: z.object({
    laborCost: z.number().optional().default(0),
    overheadCost: z.number().optional().default(0),
    components: z.array(z.object({
      componentId: z.string(),
      quantityRequired: z.number(),
      unit: z.string().optional().default('unit'),
    })).optional(),
  }).optional(),
});
```

---

## 6. Almacenes (Warehouse)

### 6.1 Modelo

Un tenant puede tener múltiples almacenes. Si no se especifica uno, el sistema usa automáticamente el **"Almacén Central"** (creado on-demand).

```typescript
// lib/skills/inventory-skills.ts
async function getOrCreateDefaultWarehouse(tenantId: string) {
  let warehouse = await prisma.warehouse.findFirst({
    where: { tenantId, name: 'Almacén Central' }
  });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: { tenantId, name: 'Almacén Central', location: 'Principal' }
    });
  }
  return warehouse;
}
```

### 6.2 API

| Método | Ruta | Permiso |
|--------|------|---------|
| `GET` | `/api/erp/warehouses` | `erp:read` |
| `POST` | `/api/erp/warehouses` | `erp:write` |

---

## 7. Niveles de Stock (StockLevel)

### 7.1 Clave compuesta única

```prisma
@@unique([warehouseId, catalogoItemId, lotId])
```

Esto significa que un mismo producto puede tener **múltiples registros de stock** en diferentes almacenes y/o diferentes lotes.

### 7.2 Consulta de disponibilidad real

```typescript
// lib/erp/stock-service.ts
static async getAvailableStock(catalogoItemId, tenantId) {
  // 1. Stock físico: solo lotes AVAILABLE o sin lote
  const stockLevels = await prisma.stockLevel.findMany({
    where: { catalogoItemId, tenantId,
      OR: [
        { erp_inventory_lots: null },
        { erp_inventory_lots: { status: 'AVAILABLE' } }
      ]
    }
  });
  const totalPhysical = stockLevels.reduce((acc, curr) => acc + curr.quantity, 0);

  // 2. Reservas (requerimientos de materiales)
  const reservations = await prisma.erp_material_requirements.aggregate({
    where: { catalogItemId: catalogoItemId, tenantId, status: 'RESERVED' },
    _sum: { reservedQty: true }
  });
  const totalReserved = reservations._sum.reservedQty || 0;

  return {
    physical: totalPhysical,
    reserved: totalReserved,
    available: Math.max(0, totalPhysical - totalReserved)
  };
}
```

### 7.3 Estados de lote

| Estado | Significado | ¿Cuenta como disponible? |
|--------|-------------|:------------------------:|
| `AVAILABLE` | Lote aprobado y utilizable | ✅ |
| `QUARANTINE` | Lote en cuarentena (control calidad) | ❌ |
| `REJECTED` | Lote rechazado | ❌ |

---

## 8. Movimientos de Stock — El Kardex Inmutable

Cada movimiento de stock queda registrado en `StockMovement` con encadenamiento criptográfico SHA-256, formando un **Kardex inmutable** (principio de partida doble: toda entrada tiene salida).

### 8.1 Tipos de movimiento

| Tipo | Descripción | quantity |
|------|-------------|:--------:|
| `IN` | Entrada (compra, devolución) | + |
| `OUT` | Salida (venta, consumo) | − |
| `ADJUSTMENT` | Ajuste manual (inventario físico) | ± |
| `TRANSFER` | Transferencia entre almacenes | − origen / + destino |
| `CONSUMPTION` | Consumo en producción | − |
| `PRODUCTION_OUTPUT` | Salida de producción (producto fabricado) | + |

### 8.2 Encadenamiento

```typescript
// lib/erp/stock-service.ts
const lastMovement = await tx.stockMovement.findFirst({
  where: { tenantId },
  orderBy: { createdAt: 'desc' },
  select: { auditHash: true }
});

const chainedHash = lastMovement?.auditHash || '0'.repeat(64);

const hash = createHash('sha256')
  .update(chainedHash + JSON.stringify(data))
  .digest('hex');
```

Cada movimiento referencia el hash del anterior → **cualquier alteración rompe la cadena**.

---

## 9. StockService — Registro de Movimientos Sellados

Archivo: **`lib/erp/stock-service.ts`**

### 9.1 registerMovement()

```typescript
static async registerMovement(data: {
  tenantId, warehouseId, catalogoItemId, lotId?,
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER' | 'CONSUMPTION' | 'PRODUCTION_OUTPUT',
  quantity, reason?, referenceId?, metadata?
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Obtener hash anterior
    // 2. Generar hash SHA-256
    // 3. Crear StockMovement sellado
    // 4. Upsert StockLevel (quantity += movimiento.quantity)
  });
}
```

**Garantía transaccional**: el movimiento y la actualización de stock ocurren atómicamente.

### 9.2 updateLotStatus()

```typescript
static async updateLotStatus(lotId, status, tenantId) {
  return await prisma.erp_inventory_lots.update({
    where: { id: lotId, tenantId },
    data: { status }  // QUARANTINE | AVAILABLE | REJECTED
  });
}
```

---

## 10. Inventory Skills — Ajustes y Consumo

Archivo: **`lib/skills/inventory-skills.ts`**

### 10.1 adjustStock()

```typescript
export async function adjustStock(input: AdjustStockInput) {
  return await prisma.$transaction(async (tx) => {
    // 1. Determinar almacén (por ID o Almacén Central)
    // 2. Upsert StockLevel (increment/decrement quantity)
    // 3. Crear StockMovement
    // 4. Si es TRANSFER → crear entrada en almacén destino + movimiento adicional
    // 5. Si quantity <= minStock → emitir stock_alert
  });
}
```

### 10.2 processInventoryConsumption()

```typescript
export async function processInventoryConsumption(input) {
  return await prisma.$transaction(async (tx) => {
    // 1. Verificar BoM del producto
    // 2. SI hay BoM activo:
    //    → Para cada componente: decrementar stock según quantityRequired × quantity
    //    → Registrar ProductionLog
    //    → Alertar si stock queda negativo
    // 3. SI NO hay BoM:
    //    → Decrementar el producto directamente
    //    → Registrar ProductionLog
  });
}
```

### 10.3 getInventoryHealth()

```typescript
export async function getInventoryHealth(input) {
  // 1. Raw query SQL para encontrar items con quantity <= minStock
  // 2. Hidratar con nombres, SKUs y almacenes
  // 3. Devolver status: HEALTHY | WARNING
}
```

---

## 11. Inventory Watchdog — Vigilancia IA

Archivo: **`lib/skills/inventory-watchdog.ts`**

### 11.1 Funcionamiento

```typescript
export async function inventoryWatchdog(input: { tenantId: string }) {
  // 1. Obtener todos los StockLevel con InventoryConfig.reorderPoint definido
  // 2. Filtrar los que tienen quantity <= reorderPoint
  // 3. Para cada ítem crítico:
  //    - Construir mensaje proactivo
  //    - Generar deep link al catálogo
  //    - Buscar admins del tenant
  //    - Enviar notificación multicanal:
  //      * In-app (notificationService)
  //      * Telegram con inline keyboard (botones interactivos)
  //        [✅ Autorizar Compra] [❌ Rechazar]
}
```

### 11.2 Canales de notificación

| Canal | Método | Contenido |
|-------|--------|-----------|
| **In-app** | `notificationService.send()` | Alerta con link al catálogo |
| **Telegram** | `sendTelegramMessage()` | Mensaje con botones inline |
| **Email** | `notifyByEmail()` (vía automation) | Alerta por correo |

### 11.3 Botones interactivos de Telegram

```json
{
  "inline_keyboard": [[
    { "text": "✅ Autorizar Compra", "callback_data": "auth_buy:<itemId>:<tenantId>" },
    { "text": "❌ Rechazar", "callback_data": "reject_buy:<itemId>:<tenantId>" }
  ]]
}
```

---

## 12. Consumo con BoM (Bill of Materials)

Cuando un producto tiene `isManufactured = true` y una BoM asociada, el consumo no se aplica al producto final sino a sus **componentes**:

```
Producto: "Mesa de Oficina"
BoM:
  ├── Tablero (componentId: X) × 1
  ├── Pata metálica (componentId: Y) × 4
  └── Tornillo (componentId: Z) × 8

Consumir 2 mesas → Se descuenta:
  ├── Tablero: −2
  ├── Pata metálica: −8
  └── Tornillo: −16
```

### Código

```typescript
// lib/skills/inventory-skills.ts
if (bom && bom.isActive) {
  for (const item of bom.components) {
    const quantityToReduce = item.quantityRequired * quantity;
    
    await tx.stockLevel.upsert({
      where: { warehouseId_catalogoItemId_lotId: {...} },
      update: { quantity: { decrement: quantityToReduce } },
      create: { ... quantity: -quantityToReduce }
    });

    await tx.productionLog.create({
      data: {
        tenantId, action: 'AUTOMATIC_CONSUMPTION',
        catalogoItemId: item.componentId,
        quantity: quantityToReduce, userId
      }
    });
  }
}
```

---

## 13. Configuración de Inventario (InventoryConfig)

```prisma
model InventoryConfig {
  catalogoItemId  String       @unique
  minStock        Float        @default(0)      // Stock mínimo de seguridad
  reorderPoint    Float        @default(0)      // Punto de reorden (dispara watchdog)
  valuationMethod String       @default("AVERAGE_COST")
  storageLocation String?                        // Ubicación física en almacén
}
```

### Métodos de valoración soportados

| Método | Descripción |
|--------|-------------|
| `AVERAGE_COST` | Coste medio ponderado (por defecto) |
| `FIFO` | First In, First Out (planificado) |
| `LIFO` | Last In, First Out (planificado) |

---

## 14. API Endpoints

| Método | Ruta | Función | Permiso |
|--------|------|---------|---------|
| `GET` | `/api/erp/inventory` | Listar stock (filtrable) | `erp:read` |
| `POST` | `/api/erp/inventory/adjust` | Ajustar stock | `erp:write` |
| `GET` | `/api/erp/inventory/movements` | Historial de movimientos | `erp:read` |
| `POST` | `/api/erp/inventory/consumption` | Consumir producto (BoM o directo) | `erp:write` |
| `GET` | `/api/erp/inventory/stock?productId=` | Stock por producto | `erp:read` |
| `GET` | `/api/erp/warehouses` | Listar almacenes | `erp:read` |
| `POST` | `/api/erp/warehouses` | Crear almacén | `erp:write` |
| `GET` | `/api/erp/projects/[id]/inventory` | Inventario por proyecto | `erp:read` |

---

## 15. Integración con Contabilidad

Cuando hay movimiento de stock relevante para contabilidad, se emite evento:

```typescript
eventBus.emitEvent(EVENTS.STOCK_MOVEMENT, {
  tenantId, catalogoItemId, type, quantity, warehouseId, movementId
});
```

### Asientos contables generados

**Compra de mercancía (IN):**

```
600 Compras de mercaderías     (Debe)   XXX,XX €
  400 Proveedores               (Haber)  XXX,XX €
```

**Venta de mercancía (OUT):**

```
700 Ventas de mercaderías       (Haber)  XXX,XX €
  430 Clientes                  (Debe)   XXX,XX €
```

**Ajuste de inventario (ADJUSTMENT):**

```
610 Variación de existencias    (Debe/Haber)   XXX,XX €
  300 Mercaderías               (Haber/Debe)   XXX,XX €
```

---

## 16. Diagrama de Flujo Completo

```
┌──────────────────────────────────────────────────────────────────────┐
│                  FLUJO COMPLETO DE INVENTARIO EN VOLKERN              │
└──────────────────────────────────────────────────────────────────────┘

  USUARIO                    VOLKERN                           PROVEEDOR
─────┼──────────────────────────┼──────────────────────────────────┼─────
     │                          │                                  │
     │  1. Alta de producto     │                                  │
     │     en catálogo          │                                  │
     │  ──────────────────────> │  CatalogoItem creado            │
     │                          │  + InventoryConfig (opcional)    │
     │                          │  + BoM (si isManufactured)      │
     │                          │                                  │
     │  2. Entrada de stock     │                                  │
     │     (compra)             │                                  │
     │  ──────────────────────> │  StockService.registerMovement() │
     │                          │  ├── type: IN                    │
     │                          │  ├── SHA-256 encadenado          │
     │                          │  ├── StockLevel +quantity        │
     │                          │  └── Emitir STOCK_MOVEMENT       │
     │                          │                                  │
     │  3. Salida de stock      │                                  │
     │     (venta/consumo)      │                                  │
     │  ──────────────────────> │  inventory-skills:               │
     │                          │  ├── type: OUT/CONSUMPTION       │
     │                          │  ├── ¿BoM? → despieza            │
     │                          │  │   componentes                 │
     │                          │  ├── StockLevel −quantity        │
     │                          │  ├── ProductionLog               │
     │                          │  └── Si stock < 0 → alerta       │
     │                          │                                  │
     │  4. Consulta stock       │                                  │
     │  <────────────────────── │  getAvailableStock():            │
     │                          │  físico − reservas = disponible  │
     │                          │                                  │
     │  5. Watchdog automático  │                                  │
     │                          │  Cada X horas / tras consumo:    │
     │                          │  ├── Evaluar reorderPoint        │
     │                          │  ├── Telegram admin (inline kb)  │
     │                          │  ├── In-app notification         │
     │                          │  └── Email (vía automation)      │
     │                          │                                  │
     │  6. Crear orden compra   │                                  │
     │  ──────────────────────> │  automation/actions/inventory.ts │
     │                          │  createPurchaseOrder()           │
     │                          │  ───────────────────────────────>│
```

---

## 17. Apéndice: Árbol de Archivos

```
lib/
├── erp/
│   └── stock-service.ts              # Kardex inmutable + disponibilidad
├── skills/
│   ├── inventory-skills.ts           # Ajustes, consumo BoM, salud
│   └── inventory-watchdog.ts         # Vigilancia IA + alertas multicanal
├── automation/actions/
│   └── inventory.ts                  # Acciones: notificar, ajustar, comprar
└── validation/schemas/
    └── inventory.ts                  # Zod: CatalogoItem, campos, servicios

app/api/erp/
├── inventory/
│   ├── route.ts                      # GET lista stock + POST ajuste
│   ├── movements/route.ts            # GET historial movimientos
│   ├── consumption/route.ts          # POST consumo + disparo watchdog
│   └── stock/route.ts                # GET stock por producto
└── warehouses/
    └── route.ts                      # CRUD almacenes

app/
├── [tenant]/dashboard/inventario/
│   └── page.tsx                      # Dashboard de inventario
└── dashboard/finanzas/gastos/
    └── page.tsx                      # Gastos con columna Verifactu

components/
└── hubs/
    └── InventarioDashboard.tsx        # UI: gráficos, alertas, predicciones

prisma/
└── schema.prisma                     # CatalogoItem, Warehouse, StockLevel,
                                      # StockMovement, InventoryConfig,
                                      # InventoryLot, BillOfMaterials,
                                      # ProductionLog, MaterialRequirement
```

---

*Documento para uso interno del equipo de desarrollo. Versión junio 2026.*
