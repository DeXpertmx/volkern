# 📑 Reporte Técnico Integral — Sistema Contable y Fiscal Volkern

**Documento técnico para asesorías contables y fiscales**  
**Plataforma:** Volkern (volkern.app) · **Módulo:** Contabilidad, Fiscalidad y Gestión Documental  
**Fecha:** Agosto 2026 · **Versión:** 1.0

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Alcance y destinatarios](#2-alcance-y-destinatarios)
3. [Arquitectura General](#3-arquitectura-general)
4. [Núcleo Contable](#4-núcleo-contable)
5. [Motor Fiscal (TaxService)](#5-motor-fiscal-taxservice)
6. [Calendario Fiscal y Alertas Proactivas](#6-calendario-fiscal-y-alertas-proactivas)
7. [Reportes Contables](#7-reportes-contables)
8. [Gestión Documental y Gastos (OCR)](#8-gestión-documental-y-gastos-ocr)
9. [Facturación Veri\*Factu](#9-facturación-verifactu)
10. [Perfiles Fiscales y Configuración del Emisor](#10-perfiles-fiscales-y-configuración-del-emisor)
11. [Nóminas y Retenciones](#11-nóminas-y-retenciones)
12. [Control desde Telegram y Canales de Chat](#12-control-desde-telegram-y-canales-de-chat)
13. [Catálogo de Endpoints de la API](#13-catálogo-de-endpoints-de-la-api)
14. [Modelo de Datos (Tablas Principales)](#14-modelo-de-datos-tablas-principales)
15. [Seguridad, Integridad y Auditoría](#15-seguridad-integridad-y-auditoría)
16. [Operativa Recomendada para la Asesoría](#16-operativa-recomendada-para-la-asesoría)
17. [Limitaciones y Roadmap](#17-limitaciones-y-roadmap)
18. [Índice de Archivos Clave](#18-índice-de-archivos-clave)
19. [Anexo — Glosario](#19-anexo--glosario)

---

## 1. Resumen Ejecutivo

Volkern implementa un **sistema integral de contabilidad y fiscalidad española (y multijurisdiccional)** pensado para que una asesoría contable/fiscal pueda operar sobre los datos de sus clientes con garantías de integridad, trazabilidad y automatización.

**Los 10 pilares del sistema:**

| # | Pilar | Qué aporta |
|---|-------|-----------|
| 1 | **Plan General Contable completo** | PGC Normal, PYMES y Microempresas × 14 sectores (RD 1514/2007 y RD 1515/2007) |
| 2 | **Partida doble estricta + encadenamiento HMAC-SHA256** | Libro diario inalterable, auditable y verificable (análogo a blockchain) |
| 3 | **Automatización por eventos** | Facturas, gastos y nóminas generan asientos contables automáticamente |
| 4 | **Clasificación automática de gastos con IA** | El gasto se clasifica en la cuenta del Grupo 6 correcta con confirmación del usuario |
| 5 | **Motor fiscal de 8 modelos AEAT** | 303, 111, 115, 130, 180, 347, 349 y 390, calculados en tiempo real desde la contabilidad |
| 6 | **Calendario fiscal proactivo** | Plazos, importes estimados y notificaciones automáticas de vencimientos |
| 7 | **Reportes contables en tiempo real** | Balance de comprobación, Pérdidas y Ganancias y Balance de Situación |
| 8 | **Captura documental con OCR + aprendizaje** | Escaneo de facturas (imagen/PDF), desglose de IVA múltiple por tramos, plantillas por proveedor que aprenden de las correcciones del usuario |
| 9 | **Facturación Veri\*Factu** | Facturas encadenadas, selladas y enviadas a la AEAT con QR y CSV |
| 10 | **Control total desde Telegram** | 19 «entrenamientos» del asistente: el contable consulta y opera la contabilidad y los impuestos sin abrir la web |

---

## 2. Alcance y Destinatarios

Este reporte está dirigido a **asesorías contables y fiscales** que necesiten entender:

- **Qué datos alimentan cada modelo fiscal** y con qué periodicidad.
- **Cómo se garantiza la integridad** del libro diario y del libro registro de facturas.
- **Qué puede automatizar** el sistema (OCR, clasificación IA, asientos, calendario) y **qué debe revisar/validar el contable**.
- **Cómo se opera** desde la web y desde Telegram.
- **Qué endpoints y tablas** componen la solución (nivel técnico).

Metodología: el documento se ha elaborado **directamente del código fuente** (`nextjs_space/lib/accounting/*`, `nextjs_space/lib/skills/*`, `nextjs_space/prisma/schema.prisma`, `nextjs_space/app/api/*`) y de la documentación técnica existente, verificando firmas, modelos de datos y flujos.

---

## 3. Arquitectura General

### 3.1. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| **Frontend / API** | Next.js (App Router, Server Actions + Route Handlers), React, TypeScript |
| **Base de datos** | PostgreSQL (Neon) vía **Prisma ORM** |
| **Almacenamiento** | S3 (R2) para recibos, PDFs y XML firmados |
| **Autenticación** | Sesiones + `withTenantAuth` con scopes por módulo (`accounting:read`, etc.) |
| **Colas / trabajos** | Cron/workers internos (proactivity, calendario fiscal) |
| **Visión/OCR** | OCR.space (principal + respaldo), OpenRouter (GPT-4o-mini), Google Gemini, DeepSeek, Tesseract.js (local) |
| **LLM del asistente** | Cadena DeepSeek → Ling 3.0 tiny free → Nemotron 3 free → Gemini 3.5 flash lite (configurable) |
| **Banca** | Nordigen/GoCardless (PSD2), Plaid, Stripe Financial Connections |
| **Infraestructura** | VPS con Docker Swarm (producción: volkern.app) |

### 3.2. Multi-tenant y aislamiento

Todo el sistema es **multi-tenant**: cada cliente de la asesoría es un `Tenant` con su propio plan contable, sus propias cuentas, asientos, gastos, facturas y registros fiscales. **Todas las consultas se filtran por `tenantId`**, y los endpoints exigen autenticación con scopes por módulo (p. ej. `accounting:read` para reportes).

### 3.3. Diagrama de capas

```
┌──────────────────────────────────────────────────────────────────────┐
│  CAPA DE PRESENTACIÓN (Web + Telegram)                                │
│  app/dashboard/finanzas/*  ·  app/api/accounting/*  ·  webhooks/telegram │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  CAPA DE SERVICIO (lógica de negocio)                                 │
│  lib/accounting/entry-manager.ts       ← asientos + hashes            │
│  lib/accounting/event-mapper.ts        ← facturas/gastos/nóminas→asiento│
│  lib/accounting/tax-service.ts         ← 8 modelos AEAT               │
│  lib/accounting/fiscal-calendar-service.ts ← plazos y alertas         │
│  lib/accounting/reports/*              ← trial-balance, pyg, balance-sheet │
│  lib/accounting/expense-classifier.ts  ← clasificación IA de gastos   │
│  lib/accounting/reconciliation-service.ts · auto-reconciler.ts        │
│  lib/accounting/integrity-service.ts   ← cierres y verificación       │
│  lib/skills/tax-skills.ts · accounting-skills.ts · finance-skills.ts  │
│  lib/invoice-parser.ts · lib/finance/ocr-template.ts · vat.ts         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  CAPA DE DATOS (Prisma → PostgreSQL)                                  │
│  accounting_accounts · accounting_entries · accounting_lines          │
│  accounting_tax_records · accounting_periods                          │
│  accounting_bank_*  · invoices · erp_expenses · erp_suppliers         │
│  erp_supplier_ocr_templates · perfil_fiscal_cliente                   │
│  configuracion_fiscal_emisor · audit_log                              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Núcleo Contable

### 4.1. Plan General Contable

**Archivo:** `lib/accounting/plans/catalog.ts` · **Inicializador:** `lib/accounting/initializer.ts`

El sistema implementa el **Plan General de Contabilidad español (PGC, RD 1514/2007)** en 3 variantes:

- **PGC Normal** (~400 cuentas, 9 grupos)
- **PGC PYMES** (RD 1515/2007, Grupos 1–7)
- **Microempresas** (~40 cuentas simplificadas)

…con adaptaciones sectoriales para **14 sectores**: Inmobiliaria, Constructora, Sanitaria, Vitivinícola, Transporte Aéreo, Eléctrico, Agua, Cooperativas, Sin Fines Lucrativos, Pequeñas Sin Fines Lucrativos, Concesionarias, Federaciones Deportivas, SAD y Sector Público (PGCP).

Cuando se crea un tenant, `AccountingInitializer` hace `upsert` del catálogo en `accounting_accounts`, donde cada cuenta tiene `code` (código PGC), `name`, `type` (ACTIVO/PASIVO/GASTO/INGRESO) y `balance` (saldo acumulado).

### 4.2. Asientos y partida doble

**Archivo:** `lib/accounting/entry-manager.ts`

`EntryManager.createEntry()` es la única puerta de entrada de asientos. Validaciones:

1. **Balanceado**: Σ Debe = Σ Haber (si no, rechaza).
2. **Encadenamiento**: calcula `entryHash` con HMAC-SHA256 sobre `tenantId + descripción + líneas ordenadas + previousHash`.
3. **Saldos**: actualiza `balance` de cada cuenta (`balance += debe − haber`).
4. **Impacto fiscal**: si el asiento lleva `taxImpact`, crea el `TaxRecord` en la misma transacción.

### 4.3. Encadenamiento criptográfico (integridad del libro diario)

```
Asiento #1 (GENESIS)       Asiento #2                Asiento #3
previousHash: "GENESIS" ──▶ previousHash: hash(#1) ──▶ previousHash: hash(#2)
entryHash: HMAC(#1)        entryHash: HMAC(#2)        entryHash: HMAC(#3)
```

`EntryManager.verifyLedgerIntegrity(tenantId)` recorre **todos** los asientos y verifica previousHash y entryHash. Si alguien modifica cualquier asiento, la cadena se rompe y se detecta al instante. El dashboard contable ejecuta esta verificación en cada carga.

### 4.4. Mapeo automático por eventos

**Archivo:** `lib/accounting/event-mapper.ts` + `lib/accounting/accounting-listener.ts`

| Evento origen | Asiento generado | Impacto fiscal |
|---------------|------------------|----------------|
| `INVOICE_CREATED` (factura emitida) | Debe 430 Clientes / Haber 700-705 Ventas / Haber 477 IVA repercutido | `IVA_REPERCUTIDO` |
| Gasto registrado (confirmado) | Debe 6xx (cuenta clasificada) / Debe 472 IVA soportado / Haber 410 Acreedor | `IVA_SOPORTADO` |
| Nómina | Debe 640 Sueldos / Haber 4751 HP IRPF / Haber 476 SS / Haber 572 Bancos | `IRPF_RETENCION` |
| Cobro de cliente | Debe 572 Bancos / Haber 430 Clientes | — |
| Pago a proveedor | Debe 400/410 / Haber 572 Bancos | — |

**Mapeo por categoría de gasto (fallback del clasificador):**

| Categoría | Cuenta |
|-----------|--------|
| compras / materias primas | 600 / 601 |
| arrendamiento / alquiler | 621 |
| reparacion | 622 |
| honorarios / profesional | 623 |
| transporte | 624 |
| seguro | 625 |
| banca | 626 |
| publicidad | 627 |
| suministro / luz / agua / gas / telefono | 628 |
| marketing / software / suscripcion | 629 |
| sueldo / salario / nomina | 640 |
| seguridad social | 642 |
| personal | 649 |
| resto | **629 Otros servicios** |

### 4.5. Clasificación automática de gastos con IA

**Archivo:** `lib/accounting/expense-classifier.ts` · **API:** `POST /api/accounting/expenses/[id]/confirm-account`

1. Recupera el gasto, el tenant y las cuentas del Grupo 6 del plan del cliente.
2. Construye un prompt especializado (plan contable + sector + cuentas disponibles) y pide a la IA `{ accountCode, accountName, confidence, reasoning }`.
3. Si la cuenta sugerida no existe en el plan → cae a **629** con confianza ≤ 0.3.
4. El usuario **confirma o cambia** la sugerencia (`confirmedAccountCode`), y solo entonces se genera el asiento. Nada entra en el libro diario sin validación humana en el caso de gastos.

### 4.6. Cierres de periodo

**Archivo:** `lib/accounting/integrity-service.ts`

`IntegrityService.closePeriod()`:
1. Rechaza si el periodo ya está cerrado.
2. Ejecuta `verifyLedgerIntegrity()` — si hay cualquier brecha, **no cierra**.
3. Genera `closingHash` (SHA-256 de todos los entryHash del periodo) y marca `accounting_periods.isClosed = true`.

`isPeriodLocked()` impide modificar asientos de periodos cerrados.

### 4.7. Conciliación bancaria

**Archivo:** `lib/accounting/reconciliation-service.ts` + `auto-reconciler.ts` + `banking-service.ts`

Proveedores: **Nordigen/GoCardless (PSD2)**, **Plaid** y **Stripe Financial Connections**.

`AutoReconciler` puntúa cada pareja (movimiento bancario ↔ asiento) multi-factor:

| Factor | Peso |
|--------|------|
| Importe exacto | +0.40 |
| Importe en valor absoluto (signo distinto) | +0.20 |
| Fecha ±1 día | +0.30 |
| Fecha ±5 días | +0.15 |
| Descripción similar | +0.30 |
| Palabras comunes (nº factura…) | +0.15 |

- **≥ 0.90** → notifica proactivamente para conciliar.
- **≥ 0.70** → sugerencia en el panel.
- **< 0.70** → no se sugiere.

Al conciliar, se crea `BankReconciliation`, la transacción pasa a `isReconciled` y el asiento a `RECONCILED`.

---

## 5. Motor Fiscal (TaxService)

**Archivo:** `lib/accounting/tax-service.ts`

**Principio:** todos los modelos se calculan **en tiempo real** desde la contabilidad normalizada. No hay duplicación de datos fiscales: cada modelo consulta asientos/cuentas/`TaxRecord` y construye el reporte al momento.

### 5.1. Cómo se pueblan los `TaxRecord`

Cada asiento con impacto fiscal crea un `TaxRecord` **en la misma transacción** de `createEntry()`:

```
{ tenantId, entryId, type, baseAmount, taxRate, taxAmount, periodMonth, periodYear, isFiled }
```

Tipos (`TaxType`): `IVA_REPERCUTIDO`, `IVA_SOPORTADO`, `IRPF_RETENCION` (+ `RECARGO_EQUIVALENCIA` para el recargo del régimen de equivalencia).

### 5.2. Modelo 303 — IVA Trimestral

`getQuarterlyVatReport(tenantId, year, quarter)`

- Suma `IVA_REPERCUTIDO` (cuota) → `outputVat` y `IVA_SOPORTADO` → `inputVat` de los meses del trimestre.
- **Resultado** = repercutido − soportado (positivo = a ingresar, negativo = a compensar).
- Incluye `equivalenceSurcharge` (recargo de equivalencia) cuando existe.
- `fileVatReturn()` → marca `isFiled = true` en todos los TaxRecord del periodo (updateMany → `{ count }`).

### 5.3. Modelo 111 — Retenciones IRPF

`getQuarterlyIrpfReport(tenantId, year, quarter)`

- Suma de los `TaxRecord` tipo `IRPF_RETENCION` del trimestre.
- Origen: retenciones de nóminas (cuenta 4751) y facturas de profesionales con retención.
- `fileIrpfReturn()` → `isFiled = true`.

### 5.4. Modelo 115 — Retenciones por Arrendamientos

`getQuarterlyModelo115Report(tenantId, year, quarter)`

- Se calcula **desde los gastos** (no desde TaxRecord): gastos con categoría `alquiler` y `metadata.irpfAmount > 0`. Tipo general **19%**.
- Detalle por arrendador (proveedor), con NIF, renta y retención.
- `fileModelo115Return(tenantId, year, quarter, userId)` → **AuditLog** `MODELO_115_FILED`.

### 5.5. Modelo 130 — Pago Fraccionado IRPF

`getQuarterlyModelo130Report(tenantId, year, quarter)`

- Se calcula **desde los asientos** (Grupos 6 y 7): Ingresos − Gastos → base neta; resultado = base × **20%**.
- Base negativa → resultado 0,00 € (nunca negativo).
- `fileModelo130Return(..., userId)` → AuditLog `MODELO_130_FILED`.

### 5.6. Modelo 180 — Resumen Anual de Retenciones de Arrendamientos

`getAnnualModelo180Report(tenantId, year)`

- Consolida los 4 trimestres del Modelo 115 agrupando por **arrendador** (proveedor): rentas pagadas + retenciones por arrendador.
- Salida: `landlords[]` + `quarters[]`.
- `fileModelo180Return(..., userId)` → AuditLog `MODELO_180_FILED`.

### 5.7. Modelo 347 — Operaciones con Terceros

`getAnnualModelo347Report(tenantId, year)`

- Agrupa **facturas emitidas por contacto** y **gastos por proveedor**; solo declara contrapartes con total anual **> 3.005,06 €**.
- Usa el `PerfilFiscalCliente` de cada contraparte (`idFiscal`, `country`, `idIntracomunitario`).
- `fileModelo347Return(..., userId)` → AuditLog `MODELO_347_FILED`.

### 5.8. Modelo 349 — Operaciones Intracomunitarias

`getQuarterlyModelo349Report(tenantId, year, quarter)`

- **Entregas**: clientes con perfil fiscal UE (país ≠ ES con `idIntracomunitario`) + facturas del trimestre.
- **Adquisiciones**: proveedores cuyo `taxId` sugiera país UE (`guessCountryFromTaxId` lee el prefijo de 2 letras, p. ej. `FR…`, `DE…`) + gastos del trimestre.
- Whitelist de 27 países UE.
- `fileModelo349Return(..., userId)` → AuditLog `MODELO_349_FILED`.

### 5.9. Modelo 390 — Resumen Anual IVA

`getAnnualModelo390Report(tenantId, year)`

- Consolida los 4 trimestres del 303. Por trimestre expone `isFiled` (true si no quedan registros sin presentar).
- Resultado anual = Σ repercutido − Σ soportado.
- `fileModelo390Return(..., userId)` → AuditLog `MODELO_390_FILED`.

### 5.10. Marcar como presentado

- **303 y 111**: `updateMany` sobre TaxRecord del periodo (devuelven `{ count }`).
- **115, 130, 180, 347, 349, 390**: crean un **AuditLog** de presentación (sus datos provienen de agregaciones, no de registros individuales). Estas funciones aceptan `userId` para dejar trazabilidad de quién presentó.

---

## 6. Calendario Fiscal y Alertas Proactivas

**Archivo:** `lib/accounting/fiscal-calendar-service.ts`

### 6.1. Plazos configurados (normativa española — Orden HAC/1177/2024)

| Modelo | Periodicidad | Vencimiento |
|--------|--------------|-------------|
| **303** IVA | Trimestral | 20 abr · 20 jul · 20 oct · 30 ene (T4) |
| **111** Retenciones IRPF | Trimestral | 20 abr · 20 jul · 20 oct · 30 ene |
| **115** Arrendamientos | Trimestral | 20 abr · 20 jul · 20 oct · 30 ene |
| **130** IRPF Est. Directa | Trimestral | 20 abr · 20 jul · 20 oct · 30 ene |
| **349** Intracomunitario | Trimestral | 30 abr · 30 jul · 30 oct · 30 ene |
| **347** Operaciones terceros | Anual | 31 marzo (año siguiente) |
| **390** IVA anual | Anual | 30 enero |
| **180** Resumen arrendamientos | Anual | 30 enero |

### 6.2. Estimaciones de importes

`getCalendarSummary(tenantId, year)` enriquece cada deadline con `estimatedAmount` real del tenant:

- **303** → diferencia (repercutido − soportado) de los TaxRecord del periodo.
- **111** → total retenciones del periodo.
- **130** → `resultToPay` del reporte (si hay actividad).
- **115** → total retenciones de alquileres del periodo.
- **180** → total retenciones anuales.

### 6.3. Notificaciones proactivas

`scanAndNotify()` recorre los tenants y notifica al owner cuando:

- Un modelo **vence en ≤ 7 días** (pendiente de presentar) → prioridad alta, con importe estimado.
- Un modelo **ya venció** → prioridad urgente.

Control de duplicados: registra cada notificación en `AuditLog` (`FISCAL_DEADLINE_NOTIFIED`) y no repite la misma combinación `modelo_periodo` en las últimas 24 h. Los mensajes incluyen un enlace directo al calendario fiscal del panel (`/dashboard/finanzas/contabilidad/calendario-fiscal`).

---

## 7. Reportes Contables

**Carpeta:** `lib/accounting/reports/` · **Endpoints:** `app/api/accounting/reports/*` (scope `accounting:read`)

### 7.1. Balance de Comprobación (Sumas y Saldos)

`getTrialBalance(tenantId)` — `GET /api/accounting/reports/trial-balance`

- Lee el catálogo de cuentas ordenado por grupo/código y usa el `balance` acumulado.
- `balance > 0` → columna DEBE; `balance < 0` → columna HABER.
- Devuelve `totalDebit` / `totalCredit` y la verificación de que cuadren.

### 7.2. Cuenta de Resultados (PyG)

`getPyG(tenantId)` — `GET /api/accounting/reports/pyg`

- Cuentas de tipo GASTO (Grupo 6) e INGRESO (Grupo 7) con saldo ≠ 0.
- `resultadoEjercicio = ingresos − gastos` (positivo = beneficio).

### 7.3. Balance de Situación

`getBalanceSheet(tenantId)` — `GET /api/accounting/reports/balance-sheet`

- **Activo No Corriente** (Grupo 2) y **Activo Corriente** (Grupos 3, 4, 5).
- **Patrimonio Neto** (Grupo 1) y **Pasivo Corriente** (Grupos 4, 5).
- Verificación Activo = Pasivo + Patrimonio Neto (la respuesta de Telegram indica si «cuadra» o muestra la diferencia).

### 7.4. Dashboard Contable

`GET /api/accounting/dashboard` — agrega en paralelo:

1. Resumen por tipo de cuenta (activos, pasivos, gastos, ingresos).
2. Últimos 5 asientos con sus líneas y cuentas.
3. **Verificación de integridad** del libro diario (`verifyLedgerIntegrity` → `{ isValid, breaches }`).
4. Estado de conexiones bancarias (con transacciones sin conciliar).

---

## 8. Gestión Documental y Gastos (OCR)

### 8.1. Flujo de escaneo (cadena de proveedores)

**Endpoint:** `POST /api/erp/expenses/scan` · **Ruta:** `app/api/erp/expenses/scan/route.ts` · **Parser:** `lib/invoice-parser.ts`

Al subir una imagen o PDF, `callVision()` intenta en cascada:

1. **OCR.space** — texto + cajas de palabras (`TextOverlay`), con **clave principal y de respaldo** (`OCR_SPACE_API_KEY` / `OCR_SPACE_API_KEY_BACKUP`). Si la principal falla (HTTP, límite mensual, error, sin texto parseable) reintenta con la de respaldo.
2. **OpenRouter GPT-4o-mini** — visión multimodal con el mismo prompt estructurado.
3. **Google Gemini** (`gemini-2.0-flash`, fallback).
4. **DeepSeek** — solo imágenes (no soporta PDF).

El prompt fuerza un **JSON estructurado** (emisor, receptor, líneas, totales, desglose de IVA, IRPF, recargo, IBAN, categoría…). Tras el proveedor, `parseInvoiceText()` reconstruye el objeto y `normalizeVisionResult()` sanea el proveedor (evita que la cabecera contamine la razón social).

### 8.2. Desglose de IVA múltiple (tramos)

El sistema soporta facturas con **varios tipos de IVA a la vez** (p. ej. 21% + 10% + 4%). El parser extrae `totales.desglose_iva[]` con `{ tipo, base, cuota }` por tramo, y `normalizeVatBreakdown()` tolera formatos ES/EN y estructuras anidadas o planas. Si el modelo devuelve un solo tipo/base/cuota, se deriva un desglose de un tramo.

### 8.3. Asociación posicional de tramos (geometría)

**`associateVatRowsByPosition(overlay, desglose, totales)`** en `lib/invoice-parser.ts`

El texto plano leído pierde la geometría y puede desordenar o emparejar mal base/cuota. Con las **cajas de palabras** del OCR.space se recupera la **fila real** de cada tramo (posición en la imagen), asociando cada base con su tipo y cuota aunque el texto esté desordenado. **Verificado en producción**: recuperó los 3 tramos de una factura simulada (21%→300/63, 10%→250/25, 4%→100/4) cuya suma coincide exactamente con el total (742,00 €); a baja resolución rechaza filas ilegibles en vez de inventar tramos.

### 8.4. Tramos automáticos en el formulario

**Archivo:** `lib/finance/vat.ts`

- `computeVatAmount(base, rate)` / `computePercentageAmount` → cuota = base × tipo / 100 (autocálculo de IVA e IRPF al elegir el tipo).
- `fillEmptyTranches(rows, target)` → reparte la base imponible total entre los tramos vacíos (el último absorbe el redondeo) para que Σ base = objetivo.
- `fillLastTranche(rows, target)` → **modo «resto en el último»**: solo el último tramo rellenable absorbe el resto y los intermedios quedan vacíos hasta que el usuario los llene.
- `computeInvoiceTotalMismatch(base, vat, irpf, total, surcharge, tol=0.02)` → valida que **base + IVA + recargo − IRPF = total** de la factura y avisa si no cuadra.

### 8.5. Verificación de totales

Antes de guardar, el formulario comprueba que la suma de tramos cuadre con la base imponible y con el total de la factura detectado por OCR; si no, bloquea el registro y solicita corregir (misma lógica aplicada al flujo de Telegram).

### 8.6. Plantillas por proveedor (aprendizaje human-in-the-loop)

**Archivo:** `lib/finance/ocr-template.ts` · **Tabla:** `erp_supplier_ocr_templates` · **API:** `GET/POST/DELETE /api/erp/expenses/ocr-templates`

Cada empresa tiene su formato. Cuando el OCR genérico lee mal un campo, el usuario lo señala **dibujando un rectángulo sobre la imagen** en el visualizador; esa región (coordenadas relativas 0..1) se guarda en la plantilla del proveedor:

- `fields[]` → regiones de los 23 campos anotables (fechas, folio, moneda, forma de pago, bases, IVA, IRPF, recargo, régimen, total, emisor/receptor con NIF y dirección, IBAN…), con `page` y `reference` (valor corregido guardado como referencia).
- `vatRows[]` → posiciones de las columnas **tipo/base/cuota** de cada fila de impuestos, aprendidas al **confirmar los tramos** tras el escaneo (asociación posicional persistida para no volver a detectar).
- Un mismo proveedor puede tener **varias plantillas** (`name`: «Formato 1», «Sucursal Madrid»…) y el selector permite elegir cuál usar.
- `applyTemplate(overlay, fields, page)` extrae cada campo desde su región; `validateReference()` valida lecturas futuras contra el formato de la referencia (si la región apunta mal, avisa).

**Aprendizaje automático:** `findRegionForValue(overlay, value, def)` — cuando el usuario **corrige un campo en el formulario** tras el escaneo, el sistema busca el valor corregido en las cajas de palabras (fechas, importes europeos/US, NIF con/sin guiones, textos por línea) y **propone automáticamente la región** para guardarla en la plantilla.

### 8.7. Visualizador de corrección (zoom + lupa)

- **Zoom** del visor para ser precisos al seleccionar regiones.
- **Lupa que sigue el cursor** al dibujar una región (ve el área ampliada sin cambiar el zoom del visor).
- La **lupa se adapta a la densidad de píxeles** de la imagen (fuente más grande → más aumento).
- Renderizado de **PDF a imagen con pdf.js en el navegador**, para que el visualizador funcione también con facturas PDF.
- Comparación **lado a lado** (OCR genérico vs. plantilla) para confirmar antes de aplicar cuando hay discrepancia.

### 8.8. Bandeja de documentos (inbox)

**Tabla:** `erp_expense_inbox_documents` (PENDING_REVIEW → REVIEW → CONFIRMED/DISCARDED/ERROR)

Los documentos llegan a la **bandeja** (web y Telegram) con su `extractedData`; desde ahí se revisan, se escanean/confirman o se descartan (el archivo siempre se conserva para auditoría). El detalle del gasto y la bandeja muestran el **desglose de IVA por tramo (base + cuota)** para auditar la asociación posicional.

### 8.9. Datos fiscales del receptor y emisor

- Si el OCR no lee al **receptor**, el formulario lo completa con los **datos fiscales del tenant** (`ConfiguracionFiscalEmisor`).
- Si el **proveedor no está registrado**, el flujo ofrece **registrarlo desde el gasto** mediante un modal que pide los datos mínimos (email, teléfono, categoría) y permite **editar sus tipos de IVA**, con **validación del NIF/CIF** con la misma lógica fiscal que los perfiles antes de guardar.

---

## 9. Facturación Veri\*Factu

**Documentación completa:** `GUIA_VERIFACTU_CONTABLE.md` · **Normativa:** Ley 11/2021 · RD 1007/2023 · Orden HAC/1177/2024

### 9.1. Qué implementa Volkern

Modalidad «VERI\*FACTU» (envío automático a la AEAT):

1. Genera la factura con todos los campos del reglamento.
2. Calcula la **huella SHA-256** (`fingerprint` + `sequenceNumber`).
3. **Encadena** cada factura con la anterior (`parentFingerprint`), con génesis `GENESIS_VERIFACTU_2026`.
4. **Firma XAdES** opcional con el certificado `.p12` de la empresa.
5. Genera el **código QR** de verificación en el PDF.
6. Envía el registro a la AEAT (`aeatStatus`: PENDING → SENT → ACCEPTED/REJECTED/ERROR), guardando CSV, XML firmado y trazas SOAP (request/response en S3).
7. **Bloquea** la factura: no se puede modificar ni borrar (solo rectificar/anular).

### 9.2. Tipos de factura

| Código | Tipo |
|--------|------|
| **F1** | Factura completa |
| **F2** | Simplificada (< 400 €) |
| **R1** | Rectificativa por sustitución |
| **R2** | Rectificativa por diferencia |
| **R3** | Rectificativa por descuento financiero |
| **R4** | Rectificativa por bien de inversión |

**Principio operativo:** nunca se borra; se emite rectificativa (`R-…`) o anulación (`ANUL-…`), ambas encadenadas y selladas.

### 9.3. Desde Telegram

El asistente permite **crear, cancelar, rectificar y consultar el estado fiscal** de facturas (`crear_factura`, `cancelar_factura`, `rectificar_factura`, `estado_fiscal`) con resolución automática del lead/contacto por nombre o email.

---

## 10. Perfiles Fiscales y Configuración del Emisor

### 10.1. PerfilFiscalCliente (`perfil_fiscal_cliente`)

Asociado a un lead o contacto (1:1). Campos clave:

| Campo | Uso |
|-------|-----|
| `nif` / `tipoIdFiscal` | NIF/CIF/NIE y su tipo |
| `razonSocial` | Razón social |
| `regimenFiscal` | Régimen fiscal |
| `idIntracomunitario` | VAT ID para operaciones intracomunitarias (349) |
| `exentoImpuestos` + `motivoExencion` | Exención de IVA y su motivo (evita el 400 al guardar) |
| `aplicaRetencion` | Retención aplicable |
| `defaultIva` / `defaultIrpf` | Tipos por defecto |
| `recargoEquivalencia` | Recargo de equivalencia |
| `idFiscalValidado` + `fechaValidacion` | Validación del NIF con checksum (CIF/NIE/IVA) |
| `country`, `address`, `city`, `province`, `zipCode`, `iban`, `emailFacturacion` | Datos fiscales completos |
| `isLocked` | Bloqueo de edición |

### 10.2. ConfiguracionFiscalEmisor (`configuracion_fiscal_emisor`)

Datos fiscales del propio tenant (el «receptor» de las facturas de gasto): `razonSocial`, `idFiscal`, `regimenFiscal`, dirección completa, `serieFactura`, `siguienteNumero`, `verifactuEnabled`, certificado `.p12` (almacenado seguro), `certFingerprint`, `certExpiresAt`.

### 10.3. Proveedores con múltiples tipos de IVA

**Tabla:** `erp_suppliers` — campo `vatRates Float[]` (p. ej. `[21, 10, 4]`). Un proveedor puede facturar a varios tipos; al registrar un gasto se ofrecen sus tipos como opciones de IVA del documento (y el formulario autocrea tantas bases como tramos detecte). Se puede editar dentro del modal de registro del proveedor desde el gasto.

### 10.4. TasaImpuesto (`tasas_impuesto`)

Catálogo por tenant/país/estado: `nombre`, `codigo`, `porcentaje`, `tipo` (iva…), `aplicaRetencion`, `inversionSujetoPasivo`, vigencia (`fechaInicioVigencia`/`fechaFinVigencia`), `activo`. Referenciado por ítems de catálogo, contratos, cotizaciones y órdenes de venta.

---

## 11. Nóminas y Retenciones

Las nóminas (`PayrollRecord`) se mapean a asiento (640 Sueldos / 4751 HP IRPF / 476 SS / 572 Bancos) y generan `IRPF_RETENCION` que alimenta el **Modelo 111**. Existen módulos de nómina segura (`orchestrate_secure_payroll`) y la guía técnica de nóminas (`GUIA_NOMINAS_CONTABLE.md`, `REPORTE_NOMINAS_TECNICO.md`) documenta el flujo completo, incluida la parte de Seguridad Social.

---

## 12. Control desde Telegram y Canales de Chat

### 12.1. Arquitectura del asistente

```
Mensaje (Telegram/WhatsApp/web) 
  → webhook (app/api/webhooks/telegram/route.ts)
  → IntentClassifier (lib/agents/intent-classifier.ts)   ← ruta determinista SIN LLM
  → SkillOrchestrator (createPlan + checkSkillAccess)     ← permisos por módulo
  → Skills (lib/skills/*)                                 ← ejecución con datos reales
  → ExecutionEngine (formateo markdown de Telegram)       ← respuesta
```

### 12.2. Ruta determinista vs. LLM

El clasificador tiene **bloques deterministas por entrenamiento** que clasifican e **extraen parámetros con regex** (modelos, trimestres, años, nombres, fechas, horas…), de modo que los flujos críticos **no dependen del LLM** (que puede fallar o agotarse). Cuando no hay ruta determinista, cae al LLM con cadena de modelos.

### 12.3. Entrenamientos relevantes para la asesoría

| # | Módulo | Intents deterministas (ejemplos) |
|---|--------|----------------------------------|
| 10 | **Facturación Veri\*Factu** | `crear_factura`, `cancelar_factura`, `rectificar_factura`, `estado_fiscal` |
| 15 | **Finanzas** | `registrar_gasto`, `registrar_gasto_vision` (foto), `crear_proveedor`, `listar_proveedores`, `analizar_gastos`, `proyeccion_financiera`, `proyeccion_impuestos`, `analizar_rentabilidad_global`, `auditar_integridad_gastos` |
| 17 | **Proactividad/Auditoría** | Integridad de gastos, leads fantasma, ruta de éxito |
| 18 | **Impuestos** | `impuestos_pendientes` («qué impuestos tengo que declarar», «dame mi calendario fiscal»), `resumen_impuesto` («modelo 303 del tercer trimestre», «retenciones de IRPF del segundo trimestre»), `marcar_impuesto_presentado` («marca como presentado el modelo 115») |
| 19 | **Contabilidad** | `balance_general`, `cuenta_resultados` («cuánto gané este mes»), `balance_comprobacion` |

**Formateadores** (`execution-engine.ts`): `tax_overview`, `tax_model_report`, `file_tax_return`, `balance_sheet`, `profit_loss`, `trial_balance`, `analyze_global_profitability`… — todos en markdown de Telegram con verificación de cuadre (Balance) y de sumas (Comprobación).

### 12.4. Gastos y bandeja desde Telegram

- **Enviar foto de factura** → escaneo, revisión y confirmación del gasto sin escribir los datos a mano (flujo con teclados inline).
- **Bandeja (`inbox:…`)**: solo el admin exacto puede ver, revisar, escanear, confirmar o descartar documentos; con confirmación explícita para descartar y opción de restaurar.
- **Citas con lead y auto-registro**: `agendar_cita` crea la cita (con enlace de Google Meet para videollamadas) y **registra automáticamente el lead** si no existe en el CRM.
- Control de duplicados de gastos (fingerprint) y bloqueo del registro si el total no cuadra.

---

## 13. Catálogo de Endpoints de la API

### Fiscal (app/api/accounting/taxes/*)

| Método | Ruta | Función |
|--------|------|---------|
| GET | `/api/accounting/taxes/vat?year=&quarter=` | Modelo 303 |
| POST | `/api/accounting/taxes/vat` | Marcar 303 presentado |
| GET | `/api/accounting/taxes/irpf?year=&quarter=` | Modelo 111 |
| POST | `/api/accounting/taxes/irpf` | Marcar 111 presentado |
| GET | `/api/accounting/taxes/modelo115?year=&quarter=` | Modelo 115 |
| POST | `/api/accounting/taxes/modelo115` | Marcar 115 presentado |
| GET | `/api/accounting/taxes/modelo180?year=` | Modelo 180 |
| POST | `/api/accounting/taxes/modelo180` | Marcar 180 presentado |
| GET | `/api/accounting/taxes/modelo130?year=&quarter=` | Modelo 130 |
| POST | `/api/accounting/taxes/modelo130` | Marcar 130 presentado |
| GET | `/api/accounting/taxes/modelo347?year=` | Modelo 347 |
| POST | `/api/accounting/taxes/modelo347` | Marcar 347 presentado |
| GET | `/api/accounting/taxes/modelo349?year=&quarter=` | Modelo 349 |
| POST | `/api/accounting/taxes/modelo349` | Marcar 349 presentado |
| GET | `/api/accounting/taxes/modelo390?year=` | Modelo 390 |
| POST | `/api/accounting/taxes/modelo390` | Marcar 390 presentado |

### Reportes y dashboard

| Método | Ruta | Función |
|--------|------|---------|
| GET | `/api/accounting/reports/trial-balance` | Balance de sumas y saldos |
| GET | `/api/accounting/reports/pyg` | Pérdidas y Ganancias |
| GET | `/api/accounting/reports/balance-sheet` | Balance de situación |
| GET | `/api/accounting/dashboard` | Dashboard contable (resumen + integridad + bancos) |

### Gastos / OCR / bandeja

| Método | Ruta | Función |
|--------|------|---------|
| POST | `/api/erp/expenses/scan` | Escaneo de imagen/PDF con OCR |
| GET/POST/DELETE | `/api/erp/expenses/ocr-templates` | Plantillas por proveedor (incl. `vatRows`) |
| GET/POST | `/api/erp/expenses/inbox` | Bandeja de documentos |
| POST | `/api/accounting/expenses/[id]/confirm-account` | Confirmar cuenta clasificada por IA |
| GET/POST | `/api/erp/expenses` | Gastos (CRUD + listado) |

### Chat

| Método | Ruta | Función |
|--------|------|---------|
| POST | `/api/webhooks/telegram` | Webhook de Telegram (mensajes + callbacks) |

> Todos los endpoints contables requieren `withTenantAuth` con scopes (`accounting:read`, etc.).

---

## 14. Modelo de Datos (Tablas Principales)

### Contabilidad

| Tabla | Descripción |
|-------|-------------|
| `accounting_accounts` | Catálogo de cuentas del tenant (código, nombre, tipo, saldo) |
| `accounting_entries` | Asientos (fecha, descripción, estado, `previousHash`, `entryHash`) |
| `accounting_lines` | Líneas de asiento (cuenta, debe, haber) |
| `accounting_tax_records` | Impacto fiscal (`type`, `baseAmount`, `taxRate`, `taxAmount`, `periodMonth/Year`, `isFiled`) |
| `accounting_periods` | Periodos cerrados (año, mes, `isClosed`, `closingHash`) |
| `accounting_bank_connections` | Conexiones bancarias (Nordigen/Plaid/Stripe) |
| `accounting_bank_transactions` | Movimientos bancarios |
| `accounting_reconciliations` | Conciliación banco ↔ asiento (score, método) |

### Facturación y emisor

| Tabla | Descripción |
|-------|-------------|
| `invoices` | Facturas: `numero`, `monto`, `fingerprint`, `parentFingerprint`, `sequenceNumber`, `isSealed`, `signature`, `aeatStatus` (PENDING/SENT/ACCEPTED/REJECTED/ERROR), `aeatCsv`, `signedXmlUrl`, `soapRequest/ResponseUrl` |
| `configuracion_fiscal_emisor` | Emisor: `idFiscal`, `regimenFiscal`, `serieFactura`, `siguienteNumero`, `verifactuEnabled`, cert `.p12` |
| `ordenes_venta` / `orden_venta_items` | Órdenes de venta con impuestos y retenciones por línea |

### Perfiles y proveedores

| Tabla | Descripción |
|-------|-------------|
| `perfil_fiscal_cliente` | Perfil fiscal de lead/contacto (NIF, régimen, exención, IVA/IRPF por defecto, intracomunitario…) |
| `erp_suppliers` | Proveedores con `vatRates[]` (múltiples tipos de IVA), NIF validado |
| `erp_supplier_ocr_templates` | Plantillas de lectura por proveedor: `fields` (regiones) + `vatRows` (asociación posicional de tramos) |
| `tasas_impuesto` | Catálogo de impuestos por tenant/país con vigencia |

### Gastos y documentos

| Tabla | Descripción |
|-------|-------------|
| `erp_expenses` | Gastos: `amount`, `taxableBase`, `vatRate`, `vatAmount`, `operationDate`, `issuer*`, `fingerprint`, `parentFingerprint`, `isAnomaly`, `verificationStatus`, `exifLat/Lng` |
| `erp_expense_inbox_documents` | Bandeja: `fileName`, `storageKey`, `status` (PENDING_REVIEW/REVIEW/CONFIRMED/DISCARDED/ERROR), `extractedData`, `pageStart/End` |

### Auditoría

| Tabla | Descripción |
|-------|-------------|
| `audit_log` | Trazabilidad de acciones: `accion`, `entidad`, `entidadId`, `cambiosAntes/Despues`, `hash`, `ipAddress`, `userAgent`; usado también para presentaciones fiscales (`MODELO_*_FILED`) y notificaciones (`FISCAL_DEADLINE_NOTIFIED`) |

---

## 15. Seguridad, Integridad y Auditoría

1. **Libro diario inalterable**: encadenamiento HMAC-SHA256 con verificación automática y cierre de periodos que rechaza si hay brechas.
2. **Libro registro Veri\*Factu inalterable**: encadenamiento SHA-256 de facturas + bloqueo de borrado a nivel de BD (`Billing Lock`).
3. **Integridad de gastos**: `lib/finance/expense-integrity.ts` — hash SHA-256 por gasto, `fingerprint` único (control de duplicados), `parentFingerprint`, detección de anomalías (`isAnomaly`) y **verificación geográfica** (EXIF de la foto del recibo).
4. **AuditLog con hash**: cada acción relevante queda registrada con `cambiosAntes/Despues` y `hash`.
5. **Trazabilidad de presentaciones fiscales**: las funciones `file*Return` reciben `userId` y dejan evidencia de quién marcó cada modelo como presentado.
6. **Multi-tenant estricto** con scopes por módulo (`accounting:read`, etc.).
7. **Certificados cifrados**: el `.p12` del emisor se almacena cifrado (`certPassword`) con `certFingerprint` y `certExpiresAt`.
8. **Compliance**: bloqueos registrados en `AuditLog` (`COMPLIANCE_BLOCKED`) con score de cumplimiento (`lib/compliance-score.ts`).

---

## 16. Operativa Recomendada para la Asesoría

### Configuración inicial (una vez por cliente)

1. Crear el tenant → se inicializa el plan contable (PGC × sector).
2. Configurar el **emisor fiscal** (razón social, NIF, régimen, serie) y activar Veri\*Factu + cargar certificado `.p12`.
3. Validar los **NIF/CIF de los proveedores** y sus `vatRates` (tipos de IVA que aplican).
4. Conectar la banca (Nordigen/Plaid/Stripe) si se desea conciliación automática.

### Operativa trimestral (recomendada)

| Tarea | Herramienta |
|-------|-------------|
| Revisar el **calendario fiscal** (vencimientos con importe estimado) | Web + Telegram (`impuestos_pendientes`) |
| Consultar el **303, 111, 115 o 130** del trimestre y contrastar con los libros | Web + Telegram (`resumen_impuesto`) |
| Verificar que **base + IVA − IRPF = total** en los gastos pendientes | Formulario de gasto + bandeja |
| Revisar el **balance de comprobación** (sumas y saldos cuadradas) | Web + Telegram (`balance_comprobacion`) |
| Revisar la **cuenta de resultados** y el **balance de situación** | Web + Telegram |
| Marcar como presentado cada modelo tras declararlo | Web + Telegram (`marcar_impuesto_presentado`) |

### Operativa anual

- **347** (marzo) y **390 / 180** (enero): datos ya calculados desde facturas/gastos/retenciones; revisar umbrales y agrupaciones por NIF.
- **Conciliación bancaria**: revisar sugerencias ≥ 0.70 y cerrar el ejercicio con `closePeriod`.
- **Auditoría forense**: ejecutar `verifyLedgerIntegrity` y exportar el informe de integridad del libro registro.

### Qué automatiza el sistema vs. qué debe validar el contable

| Automatizado (con supervisión) | Decisión/validación humana |
|--------------------------------|-----------------------------|
| Escaneo y extracción de datos de facturas | Confirmación de campos leídos mal (visualizador + plantillas) |
| Clasificación de gasto en cuenta del Grupo 6 | Confirmación de la cuenta sugerida por la IA |
| Generación de asientos por eventos | Revisión del asiento antes de cerrar el periodo |
| Cálculo de modelos fiscales | Verificación de los importes antes de presentar |
| Alertas de vencimientos | Presentación efectiva en la AEAT y marcado como presentado |

---

## 17. Limitaciones y Roadmap

**Limitaciones actuales (documentadas):**

- El **balance de situación** aún tiene secciones de pasivo no corriente sin agrupar (pendiente de refinar la clasificación por grupo).
- La **cadena de modelos LLM** del asistente depende de créditos de proveedores externos (DeepSeek, OpenRouter); los flujos críticos tienen ruta determinista, pero las consultas generales sin determinismo necesitan al menos un proveedor operativo.
- El **modelo Gemini del escaneo** (`gemini-2.0-flash`) está deprecado por Google; el asistente de chat ya usa `gemini-3.5-flash-lite` configurable, pero el escaneo aún apunta al modelo antiguo como tercer fallback.
- **Veri\*Factu**: el envío a la AEAT requiere que cada cliente tenga activado el emisor y, opcionalmente, certificado. SII está en roadmap.

**Roadmap sugerido (para la asesoría):**

1. **Firma de asientos (XAdES) del libro diario** para reforzar la validez probatoria ante inspecciones.
2. **Modelo 100 (IRPF anual)** y **modelo 200 (IS)** a partir del resultado del ejercicio.
3. **Integración SII** para clientes grandes.
4. **Exportación de libros oficiales** (Libro Mayor, Diario, Registro de facturas) en formato AEAT (TXT/CSV).
5. **Firma electrónica de la asesoría** en la presentación de modelos (hoy se marca como presentado; el envío telemático se hace desde la AEAT).

---

## 18. Índice de Archivos Clave

| Archivo | Función |
|---------|---------|
| `lib/accounting/plans/catalog.ts` | Catálogo PGC (9 grupos, 400+ cuentas) × 14 sectores |
| `lib/accounting/initializer.ts` | Inicialización del plan contable del tenant |
| `lib/accounting/entry-manager.ts` | Asientos con partida doble y encadenamiento HMAC |
| `lib/accounting/event-mapper.ts` | Mapeo facturas/gastos/nóminas/pagos → asientos + TaxRecord |
| `lib/accounting/accounting-listener.ts` | Escucha de eventos contables |
| `lib/accounting/expense-classifier.ts` | Clasificación IA de gastos (Grupo 6) |
| `lib/accounting/integrity-service.ts` | Cierres de periodo y verificación de integridad |
| `lib/accounting/tax-service.ts` | Motor fiscal: 303, 111, 115, 130, 180, 347, 349, 390 |
| `lib/accounting/fiscal-calendar-service.ts` | Calendario fiscal, importes estimados y alertas |
| `lib/accounting/proactivity-worker.ts` | Notificaciones proactivas (conciliación, fiscales) |
| `lib/accounting/reconciliation-service.ts` / `auto-reconciler.ts` | Conciliación bancaria |
| `lib/accounting/banking-service.ts` | Sincronización bancaria (Nordigen/Plaid/Stripe) |
| `lib/accounting/reports/trial-balance.ts` / `pyg.ts` / `balance-sheet.ts` | Reportes contables |
| `lib/invoice-parser.ts` | Parser de facturas + `associateVatRowsByPosition` |
| `lib/finance/ocr-template.ts` | Plantillas por proveedor, lupa, aprendizaje de regiones |
| `lib/finance/vat.ts` | Autocálculo IVA/IRPF, tramos automáticos, verificación de totales |
| `lib/finance/expense-integrity.ts` | Integridad de gastos (hash, duplicados, geolocalización) |
| `lib/finance/expense-inbox.ts` / `telegram-expense.ts` | Bandeja y gastos desde Telegram |
| `app/api/erp/expenses/scan/route.ts` | Escaneo OCR con cadena de proveedores y claves de respaldo |
| `app/api/accounting/taxes/*` | Endpoints de los 8 modelos |
| `app/api/accounting/reports/*` · `app/api/accounting/dashboard` | Reportes y dashboard |
| `lib/agents/intent-classifier.ts` | Clasificador con rutas deterministas (19 entrenamientos) |
| `lib/agents/skill-orchestrator.ts` | Planificación y control de acceso por módulo |
| `lib/skills/tax-skills.ts` · `accounting-skills.ts` · `finance-skills.ts` | Skills de impuestos, contabilidad y finanzas |
| `lib/agents/execution-engine.ts` | Formateo markdown de Telegram |
| `app/api/webhooks/telegram/route.ts` | Webhook de Telegram (mensajes + bandeja) |
| `prisma/schema.prisma` | Modelo de datos completo |

---

## 19. Anexo — Glosario

| Término | Significado |
|---------|-------------|
| **TaxRecord** | Registro de impacto fiscal de un asiento (IVA/IRPF/retención) con periodo e `isFiled` |
| **isFiled** | Marca de declaración presentada por periodo |
| **PGC** | Plan General de Contabilidad español |
| **Veri\*Factu** | Sistema de facturación verificable de la AEAT (Ley 11/2021, RD 1007/2023) |
| **CSV** | Código Seguro de Verificación que devuelve la AEAT |
| **XAdES** | Firma electrónica avanzada XML |
| **Overlay / cajas de palabras** | Coordenadas de cada palabra detectada por el OCR, base del visualizador y de las plantillas |
| **Plantilla OCR** | Regiones (0..1) donde aparecen los campos y tramos de IVA de un proveedor |
| **Tramo de IVA** | Fila del desglose de impuestos: tipo + base + cuota |
| **Entrenamiento** | Bloque de intents deterministas del asistente (sin LLM) por módulo |
| **Scope** | Permiso de API por módulo (`accounting:read`, …) |

---

*Reporte generado a partir del código fuente y la documentación técnica de Volkern (agosto 2026). Para el detalle contable operativo, consulte también `REPORTE_SISTEMA_CONTABLE.md`, `REPORTE_FISCAL_TECNICO.md` y `GUIA_VERIFACTU_CONTABLE.md`.*
