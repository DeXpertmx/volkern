# 📊 Reporte del Sistema Contable — Volkern

## Cómo se cargan Gastos, Ingresos y demás Transacciones a las Cuentas Contables

**Fecha:** Junio 2026  
**Versión:** 1.0  
**Destinatario:** Asesoría Contable / Fiscal

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Plan General Contable (Catálogo de Cuentas)](#2-plan-general-contable)
3. [Arquitectura del Sistema Contable](#3-arquitectura-del-sistema)
4. [Cómo se registra un GASTO](#4-cómo-se-registra-un-gasto)
5. [Cómo se registra un INGRESO (Facturación)](#5-cómo-se-registra-un-ingreso)
6. [Cómo se registra una NÓMINA](#6-cómo-se-registra-una-nómina)
7. [Cómo se registra un COBRO / PAGO](#7-cómo-se-registra-un-cobro--pago)
8. [Conciliación Bancaria Automática](#8-conciliación-bancaria-automática)
9. [Integridad y Seguridad del Libro Diario](#9-integridad-y-seguridad-del-libro-diario)
10. [Cierre de Periodos Contables](#10-cierre-de-periodos-contables)
11. [Gestión Fiscal (Modelos AEAT)](#11-gestión-fiscal-modelos-aeat)
12. [Diagrama de Flujo General](#12-diagrama-de-flujo-general)
13. [APÉNDICE — Resumen de Cuentas por Grupo](#apéndice--resumen-de-cuentas-por-grupo)

---

## 1. Resumen Ejecutivo

El sistema contable de Volkern implementa el **Plan General de Contabilidad español (PGC, RD 1514/2007)** en sus tres variantes: **Normal, PYMES y Microempresas**, con adaptaciones sectoriales para 14 sectores diferentes. La contabilidad es **multi-tenant** (cada cliente/empresa tiene su propio plan contable independiente).

**Principios clave del sistema:**

- **Partida doble estricta:** Todo asiento debe estar balanceado (Debe = Haber).
- **Encadenamiento criptográfico (HMAC-SHA256):** Cada asiento se encadena al anterior mediante hash, creando un libro diario **inalterable y auditable**. Similar al concepto de blockchain pero para contabilidad.
- **Clasificación automática con IA:** Los gastos se clasifican automáticamente en la cuenta contable correcta del Grupo 6 mediante inteligencia artificial (Gemma), con confirmación opcional del usuario.
- **Automatización por eventos:** Facturas, nóminas y pagos generan asientos contables automáticamente mediante un sistema de eventos.
- **Conciliación bancaria inteligente:** Los movimientos bancarios se concilian automáticamente con los asientos contables mediante un algoritmo de coincidencia multi-factor.
- **Gestión fiscal integrada:** Generación de Modelos 303 (IVA), 111 (IRPF), 130 (pago fraccionado), 347 (operaciones con terceros), 349 (intracomunitario) y 390 (resumen anual IVA).

---

## 2. Plan General Contable

### 2.1. Estructura del PGC

El plan contable se organiza en **9 grupos**, siguiendo el PGC español:

| Grupo | Nombre | Naturaleza | Ejemplos |
|-------|--------|------------|----------|
| **1** | Financiación Básica | Patrimonio Neto + Pasivo LP | 100 Capital, 112 Reserva Legal, 170 Deudas LP |
| **2** | Inmovilizado / Activo No Corriente | Activo | 210 Terrenos, 211 Construcciones, 217 Equipos informáticos, 281 Amortización acumulada |
| **3** | Existencias | Activo | 300 Mercaderías, 310 Materias primas, 340 Productos terminados |
| **4** | Acreedores y Deudores | Activo/Pasivo | 400 Proveedores, 410 Acreedores, 430 Clientes, 470 HP deudora, 475 HP acreedora, 477 IVA repercutido |
| **5** | Cuentas Financieras | Activo/Pasivo | 570 Caja, 572 Bancos, 520 Deudas CP |
| **6** | **Compras y Gastos** ⬅️ | **Gasto** | **600 Compras, 621 Arrendamientos, 623 Servicios profesionales, 628 Suministros, 640 Sueldos, 642 Seguridad Social, 681 Amortización** |
| **7** | **Ventas e Ingresos** ⬅️ | **Ingreso** | **700 Ventas, 705 Prestación servicios, 740 Subvenciones explotación** |
| **8** | Gastos imputados al Patrimonio Neto | Gasto | 800 Gastos de capital, 810 Gastos de emisión |
| **9** | Ingresos imputados al Patrimonio Neto | Ingreso | 900 Ingresos de capital, 910 Ingresos de emisión |

### 2.2. Planes disponibles y Sectores

El sistema soporta **3 planes** × **14 sectores**:

**Planes base:**
- **PGC Normal** — RD 1514/2007 (~400 cuentas)
- **PGC PYMES** — RD 1515/2007 (Grupos 1-7)
- **Microempresas** — criterios específicos (~40 cuentas simplificadas)

**Sectores adaptados:**
Inmobiliaria, Constructora, Sanitaria, Vitivinícola, Transporte Aéreo, Eléctrico, Agua, Cooperativas, Sin Fines Lucrativos, Pequeñas Sin Fines Lucrativos, Concesionarias de Infraestructuras, Federaciones Deportivas, Sociedades Anónimas Deportivas (SAD), Sector Público (PGCP).

Cada sector añade cuentas específicas (ej. una constructora tiene cuentas como "320 Obras en curso" y "321 Certificaciones de obra").

### 2.3. Inicialización del Plan

Cuando se crea un tenant (empresa), la clase `AccountingInitializer` ejecuta:

1. Carga todas las cuentas del plan seleccionado + sector desde `lib/accounting/plans/catalog.ts`
2. Las inserta mediante `upsert` (crea o actualiza) en la tabla `accounting_accounts`
3. Cada cuenta tiene: `code` (código PGC), `name` (descripción), `type` (ACTIVO/PASIVO/GASTO/INGRESO), `balance` (saldo acumulado)

**Archivo clave:** `lib/accounting/initializer.ts`  
**Catálogo de cuentas:** `lib/accounting/plans/catalog.ts`

---

## 3. Arquitectura del Sistema Contable

### 3.1. Componentes principales

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA CONTABLE VOLKERN                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐      │
│  │ EVENTOS  │  │   ENTRY      │  │   CONCILIACIÓN       │      │
│  │ (Event   │──│   MANAGER    │──│   BANCARIA           │      │
│  │  Bus)    │  │ (Asientos)   │  │   (Banking)          │      │
│  └──────────┘  └──────────────┘  └──────────────────────┘      │
│       │              │                      │                    │
│       ▼              ▼                      ▼                    │
│  ┌──────────────────────────────────────────────────────┐      │
│  │           PRISMA ORM  →  PostgreSQL                  │      │
│  │  (accounting_entries, accounting_lines,              │      │
│  │   accounting_accounts, accounting_tax_records, etc.) │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                  │
│  Servicios adicionales:                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌───────────┐   │
│  │ TAX      │  │ INTEGRITY│  │ EXPENSE    │  │ FISCAL    │   │
│  │ SERVICE  │  │ SERVICE  │  │ CLASSIFIER │  │ CALENDAR  │   │
│  │(Modelos) │  │(Cierre)  │  │  (IA)      │  │ (Plazos)  │   │
│  └──────────┘  └──────────┘  └────────────┘  └───────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2. Modelos de base de datos (tablas principales)

| Tabla | Descripción |
|-------|-------------|
| `accounting_accounts` | Catálogo de cuentas contables del tenant (código, nombre, tipo, saldo) |
| `accounting_entries` | Asientos contables (fecha, descripción, estado, hash de integridad) |
| `accounting_lines` | Líneas de cada asiento (cuenta, debe, haber) |
| `accounting_tax_records` | Registros de impacto fiscal (IVA repercutido/soportado, IRPF retenciones) |
| `accounting_periods` | Periodos contables cerrados (año, mes, hash de cierre) |
| `accounting_bank_connections` | Conexiones bancarias (Nordigen, Plaid, Stripe) |
| `accounting_bank_transactions` | Movimientos bancarios importados |
| `accounting_bank_reconciliations` | Conciliaciones entre movimientos bancarios y asientos |

---

## 4. Cómo se registra un GASTO

Esta es la parte más importante para entender el flujo contable. El proceso completo tiene **4 fases**:

### Fase 1: Registro del gasto en el sistema

Un usuario registra un gasto mediante la app (web o móvil). El gasto se almacena en la tabla `Expense`:

**Datos mínimos del gasto:**
- Descripción (ej. "Factura luz enero 2026")
- Importe (`amount`) + divisa (EUR por defecto)
- Categoría (ej. "suministro", "alquiler", "honorarios")
- Proveedor (`supplierId`)
- Fecha del gasto

### Fase 2: Clasificación automática con IA

La clase `ExpenseClassifier` (archivo: `lib/accounting/expense-classifier.ts`) utiliza el modelo de IA **Gemma** para clasificar automáticamente el gasto en la cuenta contable correcta del **Grupo 6**.

**Proceso:**
1. Recupera el gasto, el tenant y todas las cuentas del Grupo 6 disponibles
2. Construye un prompt especializado que incluye el plan contable del tenant, el sector, y las cuentas disponibles
3. Envía a Gemma para clasificación → responde con: `{ accountCode, accountName, confidence, reasoning }`
4. Si la cuenta sugerida por la IA no existe en el plan del tenant, usa por defecto la cuenta **629 "Otros servicios"** con confianza reducida (≤0.3)
5. El resultado se guarda en `expense.metadata.aiClassification`

**Ejemplo de clasificación:**
```
Descripción: "Factura reparación aire acondicionado oficina, S.L."
Categoría: "reparacion"
Importe: 350€
Proveedor: "ClimaFix S.L."

→ IA clasifica como: 622 "Reparaciones y conservación" (confidence: 0.95)
```

### Fase 3: Confirmación por el usuario

El usuario puede confirmar o cambiar la cuenta sugerida mediante `ExpenseClassifier.confirmAccount()`:

- El usuario ve la sugerencia de la IA
- Si está de acuerdo, confirma → se guarda `confirmedAccountCode` en `expense.metadata`
- Si no, puede seleccionar manualmente otra cuenta del Grupo 6

**API:** `POST /api/accounting/expenses/[id]/confirm-account`

### Fase 4: Creación del asiento contable

La clase `AccountingEventMapper.mapExpenseToEntry()` (archivo: `lib/accounting/event-mapper.ts`) transforma el gasto en un asiento contable con partida doble.

**Fórmula contable para un gasto típico con IVA:**
```
Supongamos: Gasto total = 121€ (100€ base + 21€ IVA 21%)

┌──────────────────────────────────────────────────────────┐
│  CUENTA              │  DEBE      │  HABER              │
├──────────────────────────────────────────────────────────┤
│  6xx (Gasto)         │  100.00€   │                     │
│  472 (IVA Soportado) │   21.00€   │                     │
│  410 (Acreedor)      │            │  121.00€            │
└──────────────────────────────────────────────────────────┘
```

**La cuenta de gasto (6xx) se determina así:**
1. Si el gasto tiene `confirmedAccountCode` (el usuario confirmó la clasificación IA) → usa esa
2. Si no, usa el mapeo por categoría (`fallbackAccountForCategory`):

| Categoría | Cuenta por defecto |
|-----------|-------------------|
| compras, materias primas | 600, 601 |
| arrendamiento, alquiler | 621 |
| reparacion | 622 |
| honorarios, profesional | 623 |
| transporte | 624 |
| seguro | 625 |
| banca | 626 |
| publicidad | 627 |
| suministro, luz, agua, gas, telefono | 628 |
| marketing, software, suscripcion | 629 |
| sueldo, salario, nomina | 640 |
| seguridad social | 642 |
| personal | 649 |
| **Cualquier otra** | **629 (Otros servicios)** |

### Fase 5 (automática): Registro de impacto fiscal

Simultáneamente, se crea un registro en `TaxRecord`:

```json
{
  "type": "IVA_SOPORTADO",
  "baseAmount": 100.00,
  "taxRate": 21,
  "taxAmount": 21.00,
  "periodMonth": 1,
  "periodYear": 2026
}
```

Este registro alimenta automáticamente el **Modelo 303 de IVA**.

### Resumen del flujo de gasto:

```
Usuario crea gasto → IA clasifica cuenta (Grupo 6) → Usuario confirma/rechaza
                                                    ↓
                         EntryManager.createEntry()
                         ├── Línea Debe: 6xx (cuenta de gasto clasificada) por la base
                         ├── Línea Debe: 472 (IVA soportado) por el IVA
                         ├── Línea Haber: 410 (Acreedor) por el total
                         └── TaxRecord: IVA_SOPORTADO (para Modelo 303)
```

---

## 5. Cómo se registra un INGRESO

### 5.1. Vía Facturación (flujo principal)

El ingreso se origina cuando se emite una **factura** a un cliente.

**Flujo automático por eventos:**

1. Se crea/emite una factura en el sistema (tabla `Invoice`)
2. Se dispara el evento `INVOICE_CREATED` en el bus de eventos
3. El listener contable (`AccountingEventListener`) captura el evento y llama a `mapInvoiceToEntry()`
4. Se crea automáticamente el asiento contable

**Fórmula contable (factura de 12.100€ con IVA 21% incluido):**
```
Base imponible = 12.100 / 1.21 = 10.000€
IVA repercutido = 10.000 × 21% = 2.100€

┌──────────────────────────────────────────────────────────┐
│  CUENTA                 │  DEBE      │  HABER           │
├──────────────────────────────────────────────────────────┤
│  430 (Clientes)         │  12.100€   │                  │
│  700/705 (Ventas)       │            │  10.000€         │
│  477 (IVA Repercutido)  │            │   2.100€         │
└──────────────────────────────────────────────────────────┘
```

> **Nota:** Si la factura es por prestación de servicios se usa la cuenta **705** en lugar de **700**.

**Registro fiscal automático:**
```json
{
  "type": "IVA_REPERCUTIDO",
  "baseAmount": 10000.00,
  "taxRate": 21,
  "taxAmount": 2100.00,
  "periodMonth": 1,
  "periodYear": 2026
}
```

### 5.2. Otros ingresos

Para ingresos que no provienen de facturación (subvenciones, ingresos financieros, etc.), se pueden crear asientos manualmente mediante `EntryManager.createEntry()` especificando las cuentas del Grupo 7 correspondientes.

---

## 6. Cómo se registra una NÓMINA

Las nóminas siguen un proceso similar pero con su propia lógica de mapeo.

**Flujo:** `PayrollRecord` → `mapPayrollToEntry()`

**Fórmula contable (nómina típica):**
```
Supongamos: Salario bruto = 2.500€, IRPF 15% = 375€, SS empleado 6% = 150€
Líquido = 2.500 - 375 - 150 = 1.975€

┌──────────────────────────────────────────────────────────┐
│  CUENTA                       │  DEBE      │  HABER     │
├──────────────────────────────────────────────────────────┤
│  640 (Sueldos y Salarios)     │  2.500€    │            │
│  4751 (HP acreedora IRPF)     │            │    375€    │
│  476 (SS acreedora)           │            │    150€    │
│  572 (Bancos)                 │            │  1.975€    │
└──────────────────────────────────────────────────────────┘
```

**Registro fiscal:** `IRPF_RETENCION` (para Modelo 111)

---

## 7. Cómo se registra un COBRO / PAGO

Los cobros y pagos liquidan las deudas de clientes/proveedores.

**Cobro de cliente (el cliente nos paga una factura):**
```
┌──────────────────────────────────────────────────────────┐
│  CUENTA                 │  DEBE      │  HABER           │
├──────────────────────────────────────────────────────────┤
│  572 (Bancos)           │  importe   │                  │
│  430 (Clientes)         │            │  importe         │
└──────────────────────────────────────────────────────────┘
```

**Pago a proveedor (pagamos una factura de gasto):**
```
┌──────────────────────────────────────────────────────────┐
│  CUENTA                   │  DEBE      │  HABER         │
├──────────────────────────────────────────────────────────┤
│  400/410 (Proveedor)      │  importe   │                │
│  572 (Bancos)             │            │  importe       │
└──────────────────────────────────────────────────────────┘
```

---

## 8. Conciliación Bancaria Automática

El sistema se conecta a los bancos mediante **3 proveedores**:

| Proveedor | Descripción |
|-----------|-------------|
| **Nordigen / GoCardless** | API bancaria europea (PSD2), gratuita para uso básico |
| **Plaid** | Conexión bancaria estándar (USA + internacional) |
| **Stripe Financial Connections** | Para cuentas conectadas a Stripe |

### 8.1. Sincronización de movimientos

El `ReconciliationService.syncTransactions()` obtiene los movimientos bancarios.

### 8.2. Matching automático (IA + Algoritmo)

El `AutoReconciler` compara cada movimiento bancario **no conciliado** con cada asiento contable **no conciliado** y calcula una puntuación de confianza basada en múltiples factores:

| Factor | Peso | Descripción |
|--------|------|-------------|
| **Importe exacto** | +0.40 | El importe del banco coincide exactamente con el saldo neto del asiento |
| **Importe en valor absoluto** | +0.20 | Coincide en valor absoluto pero no en signo |
| **Fecha ±1 día** | +0.30 | La fecha del banco y del asiento difieren en ≤1 día |
| **Fecha ±5 días** | +0.15 | Difieren en ≤5 días |
| **Descripción similar** | +0.30 | La descripción del banco contiene la del asiento o viceversa |
| **Palabras comunes** | +0.15 | Comparten palabras clave (ej. número de factura) |

- Si el score **≥ 0.90** → el sistema notifica proactivamente al usuario para conciliar
- Si el score **≥ 0.70** → aparece como sugerencia en el panel de conciliación
- Si el score **< 0.70** → no se sugiere automáticamente

### 8.3. Ejecución de la conciliación

Cuando se concilia un movimiento bancario con un asiento:
1. Se crea un registro en `BankReconciliation`
2. La `BankTransaction` se marca como `isReconciled = true`
3. El `AccountingEntry` pasa a estado `RECONCILED`

---

## 9. Integridad y Seguridad del Libro Diario

El sistema implementa un **encadenamiento criptográfico** que hace el libro diario **inalterable**.

### 9.1. Cómo funciona el encadenamiento

Cada asiento contable se construye sobre el hash del asiento anterior:

```
Asiento #1 (GENESIS)         Asiento #2                  Asiento #3
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ previousHash:    │         │ previousHash:    │         │ previousHash:    │
│   "GENESIS"      │────────▶│   hash(#1)       │────────▶│   hash(#2)       │
│                  │         │                  │         │                  │
│ entryHash:       │         │ entryHash:       │         │ entryHash:       │
│   HMAC-SHA256    │         │   HMAC-SHA256    │         │   HMAC-SHA256    │
│   (#1)           │         │   (#2)           │         │   (#3)           │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

**El hash de cada asiento se calcula con:**
```
HMAC-SHA256(
  secreto,
  tenantId + descripción + líneas ordenadas + previousHash
)
```

### 9.2. Verificación de integridad

`EntryManager.verifyLedgerIntegrity()` recorre **todos** los asientos del tenant y verifica:
1. Que el `previousHash` de cada asiento coincide con el `entryHash` del asiento anterior
2. Que el `entryHash` de cada asiento es correcto (recalculando el HMAC)

Si **cualquier** asiento ha sido modificado, la cadena se rompe y se detecta inmediatamente.

### 9.3. Protección contra modificaciones en periodos cerrados

`IntegrityService.isPeriodLocked()` impide cualquier modificación a asientos de periodos que ya han sido cerrados.

---

## 10. Cierre de Periodos Contables

### 10.1. Proceso de cierre mensual

El `IntegrityService.closePeriod()` ejecuta el cierre:

1. Verifica que el periodo no esté ya cerrado
2. Ejecuta `verifyLedgerIntegrity()` — si hay alguna brecha, **rechaza el cierre**
3. Genera un `closingHash` (SHA-256 de todos los entryHash del periodo)
4. Almacena el periodo cerrado en `accounting_periods` con `isClosed = true`

Una vez cerrado, **ningún asiento de ese periodo puede modificarse**.

### 10.2. Actualización de saldos

Cada vez que se crea un asiento, el `EntryManager` actualiza automáticamente el saldo (`balance`) de cada cuenta en `accounting_accounts`:

```
balance_nuevo = balance_anterior + (debe - haber)
```

Esto permite generar reportes (Balance de Sumas y Saldos, P&G, Balance de Situación) sin necesidad de recalcular desde cero.

---

## 11. Gestión Fiscal (Modelos AEAT)

El sistema genera automáticamente los datos necesarios para las declaraciones fiscales españolas:

### 11.1. Modelos generados

| Modelo | Nombre | Periodicidad | Origen de datos |
|--------|--------|-------------|-----------------|
| **303** | IVA Trimestral | Trimestral | `TaxRecord` → `IVA_REPERCUTIDO - IVA_SOPORTADO` |
| **111** | Retenciones IRPF | Trimestral | `TaxRecord` → `IRPF_RETENCION` |
| **130** | Pago fraccionado IRPF | Trimestral | Asientos contables → (Ingresos - Gastos) × 20% |
| **347** | Operaciones con terceros (>3.005,06€) | Anual | Facturas emitidas + Gastos por proveedor, agrupados por NIF |
| **349** | Operaciones intracomunitarias | Trimestral | Facturas a clientes UE + Gastos a proveedores UE |
| **390** | Resumen anual IVA | Anual | Consolida los 4 trimestres del Modelo 303 |

### 11.2. Cálculo automático

**Ejemplo Modelo 303 (IVA):**
```
IVA Repercutido (Total Debe 477):    + XXX €
IVA Soportado   (Total Debe 472):    - YYY €
────────────────────────────────────────────
Resultado:                             XXX - YYY €
  (Positivo = A ingresar | Negativo = A compensar)
```

**Ejemplo Modelo 130 (Pago fraccionado autónomos):**
```
Total Ingresos Grupo 7:               XXX €
Total Gastos Grupo 6:               - YYY €
────────────────────────────────────────────
Base neta:                             ZZZ €
× 20% = Pago fraccionado a ingresar
```

### 11.3. Calendario fiscal

El `FiscalCalendarService` mantiene un calendario con todos los plazos de presentación, calcula los días restantes hasta cada vencimiento y **notifica proactivamente** a los usuarios cuando un plazo se acerca (≤7 días) o cuando ya ha vencido.

---

## 12. Diagrama de Flujo General

```
                        ┌──────────────────────┐
                        │   USUARIO / SISTEMA   │
                        └──────────┬───────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
   │   GASTO     │         │  FACTURA    │         │   NÓMINA    │
   │  (Expense)  │         │  (Invoice)  │         │  (Payroll)  │
   └──────┬──────┘         └──────┬──────┘         └──────┬──────┘
          │                       │                       │
          ▼                       ▼                       ▼
   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
   │ Clasif. IA  │         │  Event Bus  │         │  mapPayroll │
   │ (Gemma)     │         │ INVOICE_    │         │  ToEntry()  │
   │             │         │ CREATED     │         │             │
   └──────┬──────┘         └──────┬──────┘         └──────┬──────┘
          │                       │                       │
          ▼                       ▼                       ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                 ENTRY MANAGER                               │
   │                                                             │
   │  createEntry({                                              │
   │    tenantId, descripción,                                   │
   │    lines: [                                                 │
   │      { accountId, debit, credit },  // Partida doble        │
   │      ...                                                    │
   │    ],                                                       │
   │    taxImpact: { type, base, rate, amount, period }          │
   │  })                                                         │
   │                                                             │
   │  Validaciones:                                              │
   │  ✅ Debe = Haber (balanceado)                               │
   │  ✅ Encadenamiento HMAC-SHA256                              │
   │  ✅ Actualización de saldos de cuentas                      │
   └─────────────────────────────────────────────────────────────┘
          │
          ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                  BASE DE DATOS                              │
   │                                                             │
   │  accounting_entries     ← Asiento contable (con hash)       │
   │  accounting_lines       ← Líneas del asiento                │
   │  accounting_accounts    ← Saldos actualizados               │
   │  accounting_tax_records ← Impacto fiscal (IVA, IRPF)        │
   └─────────────────────────────────────────────────────────────┘
          │
          ▼
   ┌─────────────────────────────────────────────────────────────┐
   │           CONCILIACIÓN BANCARIA                             │
   │                                                             │
   │  Bank Transactions (Nordigen/Plaid/Stripe)                  │
   │       ↓                                                     │
   │  AutoReconciler: matching por importe + fecha + descripción │
   │       ↓                                                     │
   │  BankReconciliation: transacción ↔ asiento                  │
   └─────────────────────────────────────────────────────────────┘
          │
          ▼
   ┌─────────────────────────────────────────────────────────────┐
   │           REPORTES Y FISCALIDAD                             │
   │                                                             │
   │  📊 Balance de Sumas y Saldos (Trial Balance)               │
   │  📊 Pérdidas y Ganancias (P&L)                              │
   │  📊 Balance de Situación (Balance Sheet)                    │
   │  📋 Modelo 303 (IVA)    📋 Modelo 111 (IRPF)                │
   │  📋 Modelo 130 (Pago frac.)  📋 Modelo 347 (Terceros)       │
   │  📋 Modelo 349 (Intracom.)    📋 Modelo 390 (Resumen IVA)   │
   └─────────────────────────────────────────────────────────────┘
```

---

## 13. APÉNDICE — Resumen de Cuentas por Grupo

### Grupo 6 — Compras y Gastos (principales)

| Código | Nombre | Uso típico |
|--------|--------|------------|
| 600 | Compras de mercaderías | Compra de productos para reventa |
| 601 | Compras de materias primas | Materias primas para producción |
| 621 | Arrendamientos y cánones | Alquiler de oficina/local |
| 622 | Reparaciones y conservación | Mantenimiento y reparaciones |
| 623 | Servicios profesionales | Asesoría, abogados, consultores |
| 624 | Transportes | Envíos, mensajería, logística |
| 625 | Primas de seguros | Seguros de cualquier tipo |
| 626 | Servicios bancarios | Comisiones bancarias |
| 627 | Publicidad y RRPP | Marketing, anuncios, eventos |
| 628 | Suministros | Luz, agua, gas, internet, teléfono |
| 629 | Otros servicios | Software, suscripciones, servicios no clasificados |
| 640 | Sueldos y salarios | Nóminas del personal |
| 642 | Seguridad Social empresa | Cuota patronal SS |
| 681 | Amortización inmovilizado | Amortización mensual/anual |

### Grupo 7 — Ventas e Ingresos (principales)

| Código | Nombre | Uso típico |
|--------|--------|------------|
| 700 | Ventas de mercaderías | Venta de productos |
| 705 | Prestaciones de servicios | Servicios profesionales prestados |
| 740 | Subvenciones a la explotación | Subvenciones recibidas |
| 759 | Otros ingresos de gestión | Ingresos atípicos |

### Grupo 4 — Acreedores y Deudores para impuestos

| Código | Nombre | Uso típico |
|--------|--------|------------|
| 472 | HP, IVA soportado | IVA pagado en compras/gastos (deducible) |
| 475 | HP, acreedora | Deudas con Hacienda |
| 4751 | HP, acreedora por retenciones | IRPF retenido a empleados |
| 476 | Organismos SS, acreedores | Seguridad Social pendiente de pago |
| 477 | HP, IVA repercutido | IVA cobrado en ventas (a ingresar) |

---

## Archivos clave del sistema

| Archivo | Función |
|---------|---------|
| `lib/accounting/plans/catalog.ts` | Catálogo completo de cuentas PGC (9 grupos, 400+ cuentas) + sectores |
| `lib/accounting/initializer.ts` | Inicialización del plan contable para un tenant |
| `lib/accounting/entry-manager.ts` | Creación de asientos con partida doble y HMAC |
| `lib/accounting/event-mapper.ts` | Mapeo automático de facturas/gastos/nóminas/pagos → asientos |
| `lib/accounting/expense-classifier.ts` | Clasificación IA de gastos en cuentas del Grupo 6 |
| `lib/accounting/accounting-listener.ts` | Escucha de eventos para automatización contable |
| `lib/accounting/reconciliation-service.ts` | Orquestación de conciliación bancaria |
| `lib/accounting/auto-reconciler.ts` | Algoritmo de matching automático banco ↔ contabilidad |
| `lib/accounting/banking-service.ts` | Sincronización y conciliación de movimientos bancarios |
| `lib/accounting/integrity-service.ts` | Cierre de periodos y verificación de integridad |
| `lib/accounting/tax-service.ts` | Generación de modelos fiscales (303, 111, 130, 347, 349, 390) |
| `lib/accounting/fiscal-calendar-service.ts` | Calendario de plazos fiscales con alertas |
| `lib/accounting/proactivity-worker.ts` | Notificaciones proactivas de conciliación y fiscales |
| `lib/finance/expense-integrity.ts` | Integridad de gastos con encadenamiento SHA-256 y verificación geográfica |

---

**Este reporte fue generado a partir del código fuente del sistema contable de Volkern (Junio 2026).**
