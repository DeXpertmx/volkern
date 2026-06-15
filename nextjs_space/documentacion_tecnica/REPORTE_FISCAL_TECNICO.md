# 🏛️ Sistema de Reportes Fiscales — Documentación Técnica

## Arquitectura de generación de impuestos y reportes contables

**Fecha:** Junio 2026
**Versión:** 1.0
**Destinatario:** Equipo de Desarrollo

---

## Índice

1. [Arquitectura General](#1-arquitectura-general)
2. [TaxService: El motor de cálculo fiscal](#2-taxservice-el-motor-de-cálculo-fiscal)
3. [Modelo 303 — IVA Trimestral](#3-modelo-303--iva-trimestral)
4. [Modelo 111 — Retenciones IRPF](#4-modelo-111--retenciones-irpf)
5. [Modelo 130 — Pago Fraccionado IRPF](#5-modelo-130--pago-fraccionado-irpf)
6. [Modelo 347 — Operaciones con Terceros](#6-modelo-347--operaciones-con-terceros)
7. [Modelo 349 — Operaciones Intracomunitarias](#7-modelo-349--operaciones-intracomunitarias)
8. [Modelo 390 — Resumen Anual IVA](#8-modelo-390--resumen-anual-iva)
9. [Reportes Contables (Trial Balance, PyG, Balance Sheet)](#9-reportes-contables)
10. [Dashboard Contable](#10-dashboard-contable)
11. [Calendario Fiscal y Notificaciones](#11-calendario-fiscal-y-notificaciones)
12. [Flujo de Datos Completo](#12-flujo-de-datos-completo)

---

## 1. Arquitectura General

El sistema de reportes fiscales se compone de tres capas:

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA DE PRESENTACIÓN (Frontend / API Routes)               │
│  app/api/accounting/taxes/*     ← Endpoints REST            │
│  app/api/accounting/reports/*   ← Reportes contables        │
│  components/hubs/accounting/*   ← Dashboards React          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  CAPA DE SERVICIO (Lógica de negocio)                       │
│  lib/accounting/tax-service.ts           ← Motor fiscal     │
│  lib/accounting/reports/trial-balance.ts ← Bal. comprobación│
│  lib/accounting/reports/pyg.ts           ← PyG              │
│  lib/accounting/reports/balance-sheet.ts ← Bal. situación   │
│  lib/accounting/fiscal-calendar-service.ts ← Calendario     │
│  lib/accounting/proactivity-worker.ts    ← Notificaciones   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  CAPA DE DATOS (Prisma ORM → PostgreSQL)                    │
│  accounting_entries        ← Asientos contables             │
│  accounting_lines          ← Líneas de asiento              │
│  accounting_accounts       ← Cuentas con saldos             │
│  accounting_tax_records    ← Registros de impacto fiscal    │
│  accounting_periods        ← Periodos cerrados              │
│  invoices / expenses / payroll ← Origen transaccional       │
└─────────────────────────────────────────────────────────────┘
```

### Principio fundamental

Todos los reportes fiscales se calculan en **tiempo real** desde los datos contables normalizados. No hay duplicación de datos fiscales: cada modelo fiscal consulta las tablas contables y construye el reporte al momento. La única tabla de respaldo fiscal es `accounting_tax_records`, que almacena el impacto fiscal de cada asiento (tipo, base, tipo impositivo, cuota, periodo).

### Endpoints de la API

| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/api/accounting/taxes/vat?year=&quarter=` | Obtener Modelo 303 |
| `POST` | `/api/accounting/taxes/vat` | Marcar 303 como presentado |
| `GET` | `/api/accounting/taxes/irpf?year=&quarter=` | Obtener Modelo 111 |
| `POST` | `/api/accounting/taxes/irpf` | Marcar 111 como presentado |
| `GET` | `/api/accounting/taxes/modelo130?year=&quarter=` | Obtener Modelo 130 |
| `POST` | `/api/accounting/taxes/modelo130` | Marcar 130 como presentado |
| `GET` | `/api/accounting/taxes/modelo347?year=` | Obtener Modelo 347 |
| `POST` | `/api/accounting/taxes/modelo347` | Marcar 347 como presentado |
| `GET` | `/api/accounting/taxes/modelo349?year=&quarter=` | Obtener Modelo 349 |
| `POST` | `/api/accounting/taxes/modelo349` | Marcar 349 como presentado |
| `GET` | `/api/accounting/taxes/modelo390?year=` | Obtener Modelo 390 |
| `POST` | `/api/accounting/taxes/modelo390` | Marcar 390 como presentado |
| `GET` | `/api/accounting/reports/trial-balance` | Balance de Sumas y Saldos |
| `GET` | `/api/accounting/reports/pyg` | Pérdidas y Ganancias |
| `GET` | `/api/accounting/reports/balance-sheet` | Balance de Situación |
| `GET` | `/api/accounting/dashboard` | Dashboard contable |

---

## 2. TaxService: El motor de cálculo fiscal

**Archivo:** `lib/accounting/tax-service.ts`

### Interfaces de salida

Cada modelo fiscal tiene su propia interfaz TypeScript que define la estructura del reporte. Ejemplo para IVA:

```typescript
interface VatReportSummary {
  year: number
  quarter: number
  outputVat: { base: number; amount: number }   // IVA repercutido
  inputVat:  { base: number; amount: number }   // IVA soportado
  result: number                                 // A ingresar / compensar
  details: any[]                                 // Desglose por registro
}
```

### Mecanismo de consulta común

Todos los métodos del `TaxService` siguen el mismo patrón:

1. **Determinar el periodo:** Calcular los meses correspondientes al trimestre/año solicitado mediante `getMonthsForQuarter()`.
2. **Consultar `taxRecord`:** Filtrar por `tenantId`, `periodMonth` dentro de los meses del periodo, y `type` correspondiente (IVA_REPERCUTIDO, IVA_SOPORTADO, IRPF_RETENCION).
3. **Agregar:** Sumar bases y cuotas separando por tipo.
4. **Calcular resultado:** Para IVA = outputVat - inputVat. Para IRPF = suma de retenciones. Para 130 = (ingresos - gastos) × 20%.
5. **Devolver** la interfaz tipada.

### Cómo se pueblan los TaxRecords

Cada asiento contable que tiene impacto fiscal crea un `TaxRecord` en la misma transacción de base de datos. Esto ocurre en `EntryManager.createEntry()`:

```typescript
// En EntryManager.createEntry():
taxImpact: data.taxImpact ? {
  create: {
    tenantId: data.tenantId,
    type: data.taxImpact.type,       // IVA_REPERCUTIDO | IVA_SOPORTADO | IRPF_RETENCION
    baseAmount: data.taxImpact.baseAmount,
    taxRate: data.taxImpact.taxRate,
    taxAmount: data.taxImpact.taxAmount,
    periodMonth: data.taxImpact.periodMonth,
    periodYear: data.taxImpact.periodYear
  }
} : undefined
```

Los `TaxImpact` son generados por `AccountingEventMapper` durante el mapeo de eventos a asientos:

| Evento | Tipo de TaxRecord |
|--------|-------------------|
| `mapInvoiceToEntry()` | `IVA_REPERCUTIDO` |
| `mapExpenseToEntry()` | `IVA_SOPORTADO` |
| `mapPayrollToEntry()` | `IRPF_RETENCION` |

### Flag isFiled

Cada `TaxRecord` tiene un campo `isFiled` (boolean, default `false`). Cuando el usuario marca una declaración como presentada:
- Los métodos `fileVatReturn()`, `fileIrpfReturn()` ponen `isFiled = true` a todos los registros del periodo.
- Los modelos 130, 347, 349 y 390 crean un `AuditLog` de presentación en lugar de modificar registros (porque sus datos vienen de agregaciones, no de registros individuales).

---

## 3. Modelo 303 — IVA Trimestral

**Endpoint:** `GET /api/accounting/taxes/vat?year=2026&quarter=1`
**Método:** `TaxService.getQuarterlyVatReport(tenantId, year, quarter)`

### Algoritmo

```typescript
// 1. Determinar meses del trimestre
const months = getMonthsForQuarter(quarter)  // Q1 → [1,2,3], Q2 → [4,5,6], etc.

// 2. Consultar registros de IVA del periodo
const records = await prisma.taxRecord.findMany({
  where: {
    tenantId,
    periodYear: year,
    periodMonth: { in: months },
    type: { in: [TaxType.IVA_REPERCUTIDO, TaxType.IVA_SOPORTADO] }
  }
})

// 3. Separar y sumar
for (const record of records) {
  if (record.type === 'IVA_REPERCUTIDO') {
    outputVat.base += record.baseAmount
    outputVat.amount += record.taxAmount
  } else {
    inputVat.base += record.baseAmount
    inputVat.amount += record.taxAmount
  }
}

// 4. Resultado
result = outputVat.amount - inputVat.amount
// Positivo = a ingresar, Negativo = a compensar
```

### Estructura de la respuesta

```json
{
  "year": 2026,
  "quarter": 1,
  "outputVat": { "base": 37000.00, "amount": 7770.00 },
  "inputVat": { "base": 4300.00, "amount": 903.00 },
  "result": 6867.00,
  "details": [
    { "type": "IVA_REPERCUTIDO", "baseAmount": 10000, "taxAmount": 2100, "periodMonth": 1 },
    { "type": "IVA_SOPORTADO", "baseAmount": 1500, "taxAmount": 315, "periodMonth": 1 }
  ]
}
```

### Marcar como presentado

`POST /api/accounting/taxes/vat` con `{ year, quarter }` → `TaxService.fileVatReturn()` pone `isFiled = true` en todos los `TaxRecord` del periodo.

---

## 4. Modelo 111 — Retenciones IRPF

**Endpoint:** `GET /api/accounting/taxes/irpf?year=2026&quarter=1`
**Método:** `TaxService.getQuarterlyIrpfReport(tenantId, year, quarter)`

### Algoritmo

Idéntico al 303 pero filtrando por `type: TaxType.IRPF_RETENCION`:

```typescript
const records = await prisma.taxRecord.findMany({
  where: {
    tenantId,
    periodYear: year,
    periodMonth: { in: months },
    type: TaxType.IRPF_RETENCION
  }
})

// Sumar todas las retenciones
summary.retentions.base += record.baseAmount
summary.retentions.amount += record.taxAmount
summary.totalRetentions = summary.retentions.amount
```

### Origen de los datos

Los `TaxRecord` de tipo `IRPF_RETENCION` se generan en:
- **`mapPayrollToEntry()`:** Retención de IRPF de nóminas (cuenta 4751).
- **Facturas de profesionales:** Cuando se emite una factura a un profesional con retención.
- **Alquileres:** Retenciones por arrendamiento de inmuebles.

---

## 5. Modelo 130 — Pago Fraccionado IRPF

**Endpoint:** `GET /api/accounting/taxes/modelo130?year=2026&quarter=1`
**Método:** `TaxService.getQuarterlyModelo130Report(tenantId, year, quarter)`

### Algoritmo

A diferencia del 303/111, el Modelo 130 **no se calcula desde `TaxRecord`**, sino directamente desde los asientos contables:

```typescript
// 1. Obtener todos los asientos del trimestre (excluyendo anulados)
const entries = await prisma.accountingEntry.findMany({
  where: {
    tenantId,
    date: { gte: startDate, lte: endDate },
    status: { not: 'VOIDED' }
  },
  include: { lines: { include: { account: true } } }
})

// 2. Recorrer cada línea de cada asiento
for (const entry of entries) {
  for (const line of entry.lines) {
    const account = line.account
    if (account.type === 'INGRESO') {
      // Ingreso = suma del HABER de cuentas del Grupo 7
      incomeByAccount[account.code] += Number(line.credit)
    } else if (account.type === 'GASTO') {
      // Gasto = suma del DEBE de cuentas del Grupo 6
      expenseByAccount[account.code] += Number(line.debit)
    }
  }
}

// 3. Calcular
netBase = totalIncome - totalExpenses
resultToPay = netBase > 0 ? netBase × 0.20 : 0
```

### Por qué se calcula desde asientos y no desde TaxRecord

El Modelo 130 requiere el **resultado neto de la actividad** (ingresos - gastos), no solo impuestos. Los `TaxRecord` solo almacenan impactos fiscales (IVA, IRPF), no la base completa de ingresos/gastos. Por tanto, hay que consultar directamente las cuentas de los Grupos 6 y 7.

### Particularidad

Si la base neta es negativa (gastos > ingresos), el resultado a pagar es **0,00 €**. No se genera cantidad negativa.

### Marcar como presentado

Crea un `AuditLog` con acción `MODELO_130_FILED`. No modifica `TaxRecord` porque el 130 no tiene registros individuales.

---

## 6. Modelo 347 — Operaciones con Terceros

**Endpoint:** `GET /api/accounting/taxes/modelo347?year=2025`
**Método:** `TaxService.getAnnualModelo347Report(tenantId, year)`

### Umbral

**3.005,06 €** — solo se declaran clientes/proveedores cuyo total anual supere este importe.

### Algoritmo

```typescript
// 1. Ventas: Agrupar facturas por contactId
const invoices = await prisma.invoice.findMany({
  where: { tenantId, fechaEmision: { gte: startDate, lte: endDate } },
  include: { contact: { include: { perfilFiscal: true } } }
})

// Agrupar por contacto
for (const inv of invoices) {
  const contactId = inv.contactId
  clientMap.get(contactId).total += Number(inv.monto)
  clientMap.get(contactId).count++
}

// 2. Compras: Agrupar gastos por supplierId
const expenses = await prisma.expense.findMany({
  where: { tenantId, date: { gte: startDate, lte: endDate } },
  include: { supplier: true }
})

for (const exp of expenses) {
  supplierMap.get(exp.supplierId).total += Number(exp.amount)
  supplierMap.get(exp.supplierId).count++
}

// 3. Filtrar por umbral (> 3.005,06 €)
const clientOps = [...clientMap].filter(([_, data]) => data.total > 3005.06)
const supplierOps = [...supplierMap].filter(([_, data]) => data.total > 3005.06)
```

### Datos del perfil fiscal

Para cada contraparte, el sistema extrae del `PerfilFiscalCliente`:
- `idFiscal` → NIF del declarado
- `country` → país de residencia fiscal
- Para clientes intracomunitarios: `idIntracomunitario` → VAT ID

### Marcar como presentado

Crea `AuditLog` con acción `MODELO_347_FILED`.

---

## 7. Modelo 349 — Operaciones Intracomunitarias

**Endpoint:** `GET /api/accounting/taxes/modelo349?year=2026&quarter=1`
**Método:** `TaxService.getQuarterlyModelo349Report(tenantId, year, quarter)`

### Algoritmo en dos partes

**Parte A — Entregas (Deliveries):**

```typescript
// 1. Buscar clientes con perfil fiscal UE (country ≠ 'ES' y con idIntracomunitario)
const euProfiles = await prisma.perfilFiscalCliente.findMany({
  where: {
    tenantId,
    country: { not: 'ES' },
    idIntracomunitario: { not: null }
  }
})

// 2. Validar que el país es realmente UE (lista blanca de 27 países)
const contactIds = euProfiles
  .filter(p => isEuCountry(p.country))
  .map(p => p.contactId)

// 3. Buscar facturas emitidas a esos clientes UE en el trimestre
const invoices = await prisma.invoice.findMany({
  where: {
    tenantId,
    contactId: { in: contactIds },
    fechaEmision: { gte: startDate, lte: endDate }
  }
})

// 4. Mapear a estructura de entrega
deliveries = invoices.map(inv => ({
  clientName: inv.contact.nombre,
  clientNif: profile.idFiscal,
  clientCountry: profile.country,
  clientVatId: profile.idIntracomunitario,
  invoiceNumber: inv.numero,
  amount: Number(inv.monto)
}))
```

**Parte B — Adquisiciones (Acquisitions):**

```typescript
// 1. Buscar proveedores cuyo taxId sugiera un país UE
const euSupplierIds = suppliers
  .filter(s => guessCountryFromTaxId(s.taxId))
  .map(s => s.id)

// guessCountryFromTaxId extrae el prefijo de 2 letras del NIF
// ej: "FR123456789" → "FR" (Francia), "DE987654321" → "DE" (Alemania)

// 2. Buscar gastos a esos proveedores UE en el trimestre
const expenses = await prisma.expense.findMany({
  where: {
    tenantId,
    supplierId: { in: euSupplierIds },
    date: { gte: startDate, lte: endDate }
  }
})
```

### Lista de países UE detectados

```typescript
private static readonly EU_COUNTRY_CODES = [
  'DE','FR','IT','PT','NL','BE','AT','IE','PL','SE','DK','FI',
  'GR','CZ','RO','HU','SK','BG','HR','SI','LT','LV','EE','CY','LU','MT'
]
```

---

## 8. Modelo 390 — Resumen Anual IVA

**Endpoint:** `GET /api/accounting/taxes/modelo390?year=2025`
**Método:** `TaxService.getAnnualModelo390Report(tenantId, year)`

### Algoritmo

Consolida los 4 informes trimestrales del Modelo 303:

```typescript
const quarters = [1, 2, 3, 4]
for (const q of quarters) {
  const report = await this.getQuarterlyVatReport(tenantId, year, q)
  quarterDetails.push({
    quarter: q,
    outputVatBase: report.outputVat.base,
    outputVatAmount: report.outputVat.amount,
    inputVatBase: report.inputVat.base,
    inputVatAmount: report.inputVat.amount,
    result: report.result,
    isFiled: unfiledCount === 0  // true si todos los registros tienen isFiled=true
  })
}

annualResult = Σ q.outputVatAmount - Σ q.inputVatAmount
```

### Verificación de trimestres presentados

Para cada trimestre, se comprueba si quedan registros sin `isFiled`:

```typescript
const unfiledCount = await prisma.taxRecord.count({
  where: {
    tenantId,
    periodYear: year,
    periodMonth: { in: months },
    type: { in: [TaxType.IVA_REPERCUTIDO, TaxType.IVA_SOPORTADO] },
    isFiled: false
  }
})
// isFiled = unfiledCount === 0
```

---

## 9. Reportes Contables

Los tres reportes contables fundamentales se generan mediante servicios independientes en `lib/accounting/reports/`.

### 9.1. Balance de Sumas y Saldos (Trial Balance)

**Archivo:** `lib/accounting/reports/trial-balance.ts`
**Endpoint:** `GET /api/accounting/reports/trial-balance`

```typescript
export async function getTrialBalance(tenantId: string) {
  const accounts = await prisma.accountingAccount.findMany({
    where: { tenantId },
    orderBy: [{ group: 'asc' }, { code: 'asc' }]
  })

  const rows = accounts.map(a => {
    const balance = Number(a.balance)
    return {
      code: a.code,
      name: a.name,
      type: a.type,
      group: parseInt(a.code.charAt(0)),
      debit: balance > 0 ? balance : 0,    // Saldo deudor
      credit: balance < 0 ? Math.abs(balance) : 0,  // Saldo acreedor
      balance
    }
  })

  return { rows, totalDebit, totalCredit }
}
```

**Lógica de signos:**
- `balance > 0` → saldo deudor (se muestra en columna DEBE)
- `balance < 0` → saldo acreedor (se muestra en columna HABER)
- El `balance` se actualiza automáticamente en cada creación de asiento (`EntryManager.createEntry()`)

### 9.2. Pérdidas y Ganancias (PyG)

**Archivo:** `lib/accounting/reports/pyg.ts`
**Endpoint:** `GET /api/accounting/reports/pyg`

```typescript
export async function getPyG(tenantId: string) {
  const accounts = await prisma.accountingAccount.findMany({
    where: { tenantId, type: { in: ['GASTO', 'INGRESO'] } }
  })

  const gastos = accounts.filter(a => a.type === 'GASTO' && Number(a.balance) !== 0)
  const ingresos = accounts.filter(a => a.type === 'INGRESO' && Number(a.balance) !== 0)

  return {
    sections: [
      { label: '1. Gastos de Explotación', accounts: gastos.filter(a => a.code.startsWith('6')) },
      { label: '2. Ingresos de Explotación', accounts: ingresos.filter(a => a.code.startsWith('7')) }
    ],
    totalGastos,
    totalIngresos,
    resultadoEjercicio: totalIngresos - totalGastos  // Positivo = beneficio
  }
}
```

**Agrupación:** Las cuentas se agrupan por el primer dígito del código (Grupo PGC). Grupo 6 → Gastos, Grupo 7 → Ingresos.

### 9.3. Balance de Situación (Balance Sheet)

**Archivo:** `lib/accounting/reports/balance-sheet.ts`
**Endpoint:** `GET /api/accounting/reports/balance-sheet`

Estructura de secciones:

```typescript
// ACTIVO
const ACTIVO_SECTIONS = [
  { label: 'A) Activo No Corriente', groupFilter: (g) => g === 2 },  // Grupo 2
  { label: 'B) Activo Corriente', groupFilter: (g) => g === 3 || g === 4 || g === 5 },  // Grupos 3,4,5
]

// PASIVO + PATRIMONIO NETO
const PASIVO_SECTIONS = [
  { label: 'A) Patrimonio Neto', groupFilter: (g) => g === 1 },
  { label: 'B) Pasivo No Corriente', groupFilter: (g) => false },  // Pendiente
  { label: 'C) Pasivo Corriente', groupFilter: (g) => g === 4 || g === 5 },
]
```

### 9.4. Permisos de acceso

Todos los endpoints de reportes requieren el scope `accounting:read`:

```typescript
export const GET = withTenantAuth(async (_request, auth) => {
  const report = await getTrialBalance(auth.tenant!.id)
  return NextResponse.json(report)
}, ['accounting:read'])
```

---

## 10. Dashboard Contable

**Endpoint:** `GET /api/accounting/dashboard`
**Archivo:** `app/api/accounting/dashboard/route.ts`

El dashboard agrega 4 fuentes de datos en paralelo:

```typescript
// 1. Resumen por tipo de cuenta
const summary = {
  assets:      Σ balance cuentas tipo ACTIVO
  liabilities: Σ balance cuentas tipo PASIVO
  expenses:    Σ balance cuentas tipo GASTO
  income:      Σ balance cuentas tipo INGRESO
}

// 2. Últimos 5 asientos
const recentEntries = await prisma.accountingEntry.findMany({
  orderBy: { date: 'desc' }, take: 5,
  include: { lines: { include: { account: true } } }
})

// 3. Verificación de integridad
const integrity = await EntryManager.verifyLedgerIntegrity(tenantId)
// → { isValid: boolean, breaches: [...] }

// 4. Estado de conexiones bancarias
const bankConnections = await prisma.bankConnection.findMany({
  include: { _count: { select: { transactions: { where: { isReconciled: false } } } } }
})
```

---

## 11. Calendario Fiscal y Notificaciones

### FiscalCalendarService

**Archivo:** `lib/accounting/fiscal-calendar-service.ts`

Gestiona los plazos de los 6 modelos fiscales con fechas de vencimiento calculadas según normativa española:

```typescript
static readonly MODELS = {
  '303': { dueDayMonth: { 1: { day: 20, month: 4 }, ... } },  // 20 abril, 20 julio...
  '111': { dueDayMonth: { 1: { day: 20, month: 4 }, ... } },
  '130': { dueDayMonth: { 1: { day: 20, month: 4 }, ... } },
  '349': { dueDayMonth: { 1: { day: 30, month: 4 }, ... } },
  '347': { annualDueDayMonth: { day: 31, month: 3 } },  // 31 marzo
  '390': { annualDueDayMonth: { day: 30, month: 1 } },  // 30 enero
}
```

### Método principal

`getCalendarSummary(tenantId, year)` devuelve:

```typescript
{
  today: Date,
  upcomingDeadlines: [...],   // Próximos 90 días
  overdueDeadlines: [...],    // Vencidos hasta 90 días atrás
  nextDeadline: {...},        // El más próximo
  totalPending: number,
  totalOverdue: number
}
```

Cada deadline se enriquece con `estimatedAmount` desde los `TaxRecord` reales del tenant.

### AccountingProactivityWorker

**Archivo:** `lib/accounting/proactivity-worker.ts`

Dos workers independientes:

1. **`scanForSuggestions()`:** Busca conciliaciones con confianza ≥ 90% y notifica al owner del tenant.
2. **`scanForTaxAlerts()`:** Agrega IVA repercutido pendiente (`isFiled: false`) y alerta si hay cantidades a declarar.

Ambos usan `notificationService.send()` para enviar notificaciones in-app al usuario.

### Control de duplicados

`FiscalCalendarService.markNotified()` registra en `AuditLog` cada notificación enviada. Antes de notificar, verifica que no se haya notificado en las últimas 24 horas:

```typescript
const recentNotifications = await prisma.auditLog.findMany({
  where: {
    tenantId,
    accion: 'FISCAL_DEADLINE_NOTIFIED',
    fechaCreacion: { gte: twentyFourHoursAgo }
  }
})
const alreadyNotified = new Set(recentNotifications.map(n => n.entidadId))
```

---

## 12. Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ORIGEN DE LA TRANSACCIÓN                       │
│                                                                     │
│  Invoice (factura)    Expense (gasto)    PayrollRecord (nómina)     │
│  Contact (cliente)    Supplier (prov.)   Employee (empleado)        │
└──────────┬──────────────────┬─────────────────────┬────────────────┘
           │                  │                     │
           ▼                  ▼                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│  AccountingEventMapper                                               │
│  ┌─────────────────┐ ┌──────────────────┐ ┌────────────────────┐   │
│  │mapInvoiceToEntry │ │mapExpenseToEntry │ │mapPayrollToEntry   │   │
│  │                  │ │                  │ │                    │   │
│  │ Calcula:         │ │ Calcula:         │ │ Calcula:           │   │
│  │ base = total/1.21│ │ subtotal=total/  │ │ irpf = bruto * 15% │   │
│  │ iva = total-base │ │   (1+0.21)       │ │ ss = bruto * 6%    │   │
│  │                  │ │ iva = total-subt │ │ neto = bruto-irpf-ss│   │
│  └────────┬─────────┘ └────────┬─────────┘ └─────────┬──────────┘   │
└───────────┼────────────────────┼─────────────────────┼──────────────┘
            │                    │                     │
            ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│  EntryManager.createEntry()                                          │
│                                                                      │
│  ✅ Valida balance (Debe = Haber)                                    │
│  ✅ Calcula HMAC-SHA256 y encadena                                   │
│  ✅ Crea AccountingEntry + AccountingLines                           │
│  ✅ Crea TaxRecord (si hay taxImpact)                                │
│  ✅ Actualiza accounting_accounts.balance                            │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     BASE DE DATOS                                    │
│                                                                      │
│  ┌─────────────────────┐  ┌────────────────────┐                    │
│  │ accounting_entries   │  │ accounting_tax_    │                    │
│  │ accounting_lines     │  │ records            │                    │
│  │ accounting_accounts  │  │ (IVA_REPERCUTIDO,  │                    │
│  │ (saldos actualizados)│  │  IVA_SOPORTADO,    │                    │
│  └─────────────────────┘  │  IRPF_RETENCION)    │                    │
│                           └────────────────────┘                    │
└──────────────┬────────────────────────┬──────────────────────────────┘
               │                        │
               ▼                        ▼
┌──────────────────────────┐  ┌────────────────────────────────────────┐
│  REPORTES CONTABLES       │  │  REPORTES FISCALES                     │
│                          │  │                                        │
│  • Trial Balance          │  │  • 303 (IVA)    ← accounting_tax_records│
│    → accounting_accounts  │  │  • 111 (IRPF)   ← accounting_tax_records│
│                          │  │  • 130 (P.F.)   ← accounting_entries    │
│  • PyG                    │  │  • 347 (3ºs)    ← invoices + expenses  │
│    → accounting_accounts  │  │  • 349 (Intra.) ← invoices + expenses  │
│    (tipo GASTO/INGRESO)   │  │  • 390 (Anual)  ← consolida 4× 303     │
│                          │  │                                        │
│  • Balance Sheet          │  │  + Calendario fiscal con alertas       │
│    → accounting_accounts  │  │  + Notificaciones proactivas           │
│    (tipo ACTIVO/PASIVO)   │  │                                        │
└──────────────────────────┘  └────────────────────────────────────────┘
```

---

## Archivos clave

| Archivo | Función |
|---------|---------|
| `lib/accounting/tax-service.ts` | Motor de cálculo de los 6 modelos fiscales |
| `lib/accounting/reports/trial-balance.ts` | Balance de Sumas y Saldos |
| `lib/accounting/reports/pyg.ts` | Cuenta de Pérdidas y Ganancias |
| `lib/accounting/reports/balance-sheet.ts` | Balance de Situación |
| `lib/accounting/fiscal-calendar-service.ts` | Calendario de plazos fiscales |
| `lib/accounting/proactivity-worker.ts` | Notificaciones proactivas fiscales |
| `lib/accounting/entry-manager.ts` | Creación de asientos + TaxRecords |
| `lib/accounting/event-mapper.ts` | Cálculo de impacto fiscal por tipo de evento |
| `app/api/accounting/taxes/*` | Endpoints REST para cada modelo |
| `app/api/accounting/reports/*` | Endpoints REST para reportes contables |
| `app/api/accounting/dashboard/route.ts` | Dashboard contable agregado |
