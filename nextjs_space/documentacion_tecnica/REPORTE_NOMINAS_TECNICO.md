# Reporte Técnico: Módulo de Nóminas y RRHH

## Documentación para el Equipo de Desarrollo

**Plataforma:** Volkern  
**Versión:** 2.1 (Hardened)  
**Fecha:** Junio 2026  
**Módulos:** HR Hub · Payroll Vault · Payroll Engine ES · Cierre Mensual

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura General](#2-arquitectura-general)
3. [Modelo de Datos (Prisma)](#3-modelo-de-datos-prisma)
4. [Stack Tecnológico](#4-stack-tecnológico)
5. [Componentes del Sistema](#5-componentes-del-sistema)
6. [Motor de Cálculo Español (PayrollEngineES)](#6-motor-de-cálculo-español-payrollenginees)
7. [Servicio de Nómina General (PayrollService)](#7-servicio-de-nómina-general-payrollservice)
8. [Payroll Sealer — Sellado con Encadenamiento](#8-payroll-sealer--sellado-con-encadenamiento)
9. [Generador de PDF Oficial](#9-generador-de-pdf-oficial)
10. [Worker de Cierre Mensual](#10-worker-de-cierre-mensual)
11. [Vault Payroll Skills — Orquestación Segura](#11-vault-payroll-skills--orquestación-segura)
12. [Frontend — PayrollVault Component](#12-frontend--payrollvault-component)
13. [Beneficios Sociales y Detección de Anomalías](#13-beneficios-sociales-y-detección-de-anomalías)
14. [API Endpoints](#14-api-endpoints)
15. [Integración con Contabilidad](#15-integración-con-contabilidad)
16. [Seguridad y Permisos](#16-seguridad-y-permisos)
17. [Diagrama de Flujo Completo](#17-diagrama-de-flujo-completo)
18. [Scripts de Prueba](#18-scripts-de-prueba)
19. [Apéndice: Árbol de Archivos](#19-apéndice-árbol-de-archivos)

---

## 1. Resumen Ejecutivo

El módulo de Nóminas y RRHH de Volkern gestiona la capa identitaria y compensatoria del ecosistema. Va más allá de un CRUD de empleados: incluye **cálculo de nóminas con segmentación por tramos** (cambios salariales intra-mes), **sellado criptográfico con encadenamiento SHA-256** (compatible Veri\*Factu), **detección de anomalías en beneficios** (telework, presencialidad), **cifrado de datos sensibles en bóveda (The Vault)**, y **orquestación de cierre mensual** con validación completa de integridad.

### Pilares técnicos

| Pilar | Tecnología | Archivo Clave |
|-------|-----------|---------------|
| **Cálculo España** | Segmentación por tramos + tablas legales + IRPF/SS | `lib/finance/payroll/es/payroll-engine-es.ts` |
| **Cálculo General** | Asistencias, comisiones, beneficios, anomalías | `lib/erp/payroll-service.ts` |
| **Sellado criptográfico** | SHA-256 con encadenamiento (blockchain-style) | `lib/finance/payroll/es/payroll-sealer.ts` |
| **Cierre mensual** | Validación 100% Veri\*Factu + cifrado Vault | `lib/workers/payroll-closure.ts` |
| **Cifrado de datos** | AES-256-GCM en The Vault + vaultSeed por tenant | `lib/security/vault.ts` |

---

## 2. Arquitectura General

```
┌──────────────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js Route Handlers)                  │
│  /api/erp/payroll/pending  ·  /api/erp/payroll/seal                 │
│  /api/erp/payroll/sign/[id]  ·  /api/payroll/download/[id]          │
└────────────────────────────────┬─────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PayrollService (lib/erp/payroll-service.ts)                         │
│  calculateEmployeePayroll()  ·  getPendingPayrolls()                 │
│  shouldApplyBenefitInPeriod()                                        │
└──────────┬─────────────┬──────────────┬──────────────────────────────┘
           ▼             ▼              ▼
┌──────────────────┐ ┌──────────────┐ ┌─────────────────────────────┐
│ PayrollEngineES  │ │PayrollSealer │ │ PayrollClosureService       │
│ (cálculo España) │ │(sellado SHA) │ │ (cierre mensual)            │
│ segmentación por  │ │encadenamiento│ │ validación 100% Veri*Factu  │
│ tramos + tablas   │ │blockchain    │ │ cifrado Vault               │
└────────┬─────────┘ └──────┬───────┘ └──────────────┬──────────────┘
         ▼                 ▼                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│           The Vault (lib/security/vault.ts)                          │
│  VaultService.encrypt() · .decrypt() · .encryptJson()               │
│  Cifrado AES-256-GCM con vaultSeed por tenant                       │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│         Base de Datos (PostgreSQL + Prisma)                          │
│  Employee  ·  PayrollRecord  ·  PayrollRecordES  ·  PayrollLineES   │
│  EmployeePayrollProfileES  ·  EmployeeBenefit  ·  EmployeeAbsenceES │
│  LegalTaxTable  ·  CollectiveAgreement  ·  AuditLog                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Modelo de Datos (Prisma)

### 3.1 Employee (tabla principal de empleados)

```prisma
model Employee {
  id                     String        @id @default(cuid())
  tenantId               String
  userId                 String?       @unique
  fullName               String
  email                  String?
  role                   String        @default("OPERATOR")
  department             String        @default("GENERAL")
  hiringDate             DateTime      @default(now())
  salaryEncrypted        String?       // Salario cifrado en The Vault
  contractUrlEncrypted   String?       // Contrato cifrado
  encryptionKeyId        String?
  isActive               Boolean       @default(true)
  allowedTeleworkLat     Float?
  allowedTeleworkLng     Float?
  isTeleworkAllowed      Boolean       @default(false)
  teleworkRadius         Int           @default(100)
  baseGPSLat             Float?
  baseGPSLng             Float?
  
  payrollRecords         PayrollRecord[]
  payrollRecordsES       PayrollRecordES[]
  benefits               EmployeeBenefit[]
  absences               EmployeeAbsenceES[]
  payrollProfile         EmployeePayrollProfileES?
}
```

### 3.2 PayrollRecordES (nómina sellada - España)

```prisma
model PayrollRecordES {
  id                   String          @id @default(cuid())
  tenantId             String
  employeeId           String
  period               String          // "2026-06"
  status               String          // DRAFT | LOCKED | SEALED
  grossTotal           Decimal         @db.Decimal(10, 2)
  netTotal             Decimal         @db.Decimal(10, 2)
  socialSecurityEmp    Decimal         @db.Decimal(10, 2)
  socialSecurityWorker Decimal         @db.Decimal(10, 2)
  irpfTotal            Decimal         @db.Decimal(10, 2)
  calculationSnapshot  Json            // Copia completa del cálculo
  operatorNote         String?
  auditHash            String?         @unique  // SHA-256 del snapshot
  chainedHash          String?         // Hash de la nómina anterior
  sealedAt             DateTime?
  fiscalStatus         String?         @default("PENDING") // PENDING | SIGNED | ARCHIVED
  signedXmlUrl         String?
  signatureAudit       Json?
  lines                PayrollLineES[]

  employee             Employee        @relation(fields: [employeeId], references: [id])
  tenant               Tenant          @relation(fields: [tenantId], references: [id])
}
```

### 3.3 PayrollLineES (líneas de nómina)

```prisma
model PayrollLineES {
  id              String          @id @default(cuid())
  payrollRecordId String
  conceptCode     String          // 101=Salario Base, 102=Complemento, 801=SS, 901=IRPF
  conceptType     String          // SALARY | DEDUCTION | BENEFIT | COMMISSION
  amount          Decimal         @db.Decimal(10, 2)
  taxable         Boolean         @default(true)
  cotizable       Boolean         @default(true)
  isOverride      Boolean         @default(false)
  notes           String?
  payrollRecord   PayrollRecordES @relation(fields: [payrollRecordId], references: [id])
}
```

### 3.4 EmployeePayrollProfileES (perfil fiscal España)

```prisma
model EmployeePayrollProfileES {
  id                   String        @id @default(cuid())
  employeeId           String        @unique
  tenantId             String
  groupCotizacion      Int           // Grupo de cotización SS (1-11)
  contractTypeCode     String        // 100=Indefinido, 200=Temporal, etc.
  workingDayPercent    Decimal       @default(100.00)  // % jornada
  extraPaysMode        String        @default("PRORRATED") // PRORRATED | SEMIANNUAL
  salaryBase           Decimal       @db.Decimal(10, 2)
  salaryComplement     Decimal       @default(0.0)
  irpfSituation        Int           @default(1)  // 1=Soltero, 2=Casado, 3=Familia numerosa
  irpfChildrenCount    Int           @default(0)
  voluntaryIrpfRate    Decimal?      // Retención voluntaria adicional
  socialSecurityRegime String        @default("GENERAL")
  
  versions             EmployeePayrollVersionES[]  // Historial de cambios
  absences             EmployeeAbsenceES[]
  employee             Employee      @relation(fields: [employeeId], references: [id])
}
```

### 3.5 EmployeeBenefit (beneficios sociales)

```prisma
model EmployeeBenefit {
  id                           String           @id
  employeeId                   String
  tenantId                     String
  concept                      String           // Ticket restaurante, transporte, etc.
  description                  String?
  amount                       Decimal          @db.Decimal(10, 2)
  isTaxable                    Boolean          @default(true)
  frequency                    BenefitFrequency @default(MONTHLY)
  category                     BenefitCategory  @default(OTHER)
  minimumAttendancePercent     Float?           // Mínimo % asistencias para recibirlo
  requiresAttendanceValidation Boolean          @default(false)
  requiresPhysicalPresence     Boolean          @default(false)
  employee                     Employee         @relation(fields: [employeeId], references: [id])
}
```

### 3.6 LegalTaxTable (tablas fiscales)

```prisma
model LegalTaxTable {
  id        String    @id @default(cuid())
  name      String    // "IRPF_2026", "SS_GENERAL_2026"
  type      String    // IRPF | SOCIAL_SECURITY | MINIMUM_WAGE
  data      Json      // Datos de tramos en JSON
  validFrom DateTime
  validTo   DateTime?
  version   String
  source    String?   // BOE-A-2025-XXXXX
}
```

### 3.7 PayrollRecord (nómina genérica - internacional)

```prisma
model PayrollRecord {
  id              String    @id @default(cuid())
  tenantId        String
  status          String    @default("PENDING")  // PENDING | SIGNED
  amountEncrypted String    // Monto cifrado
  employeeId      String
  month           Int
  year            Int
  auditHash       String?   @unique
  chainedHash     String?
  sealedAt        DateTime?
  vaultSeed       String?
  employee        Employee  @relation(fields: [employeeId], references: [id])
}
```

---

## 4. Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Runtime** | Node.js (Next.js App Router) |
| **Lenguaje** | TypeScript |
| **BD** | PostgreSQL + Prisma |
| **Cálculos decimales** | `decimal.js` (precisión financiera) |
| **Fechas** | `date-fns` (startOfMonth, endOfMonth, eachDayOfInterval) |
| **Cifrado** | AES-256-GCM (`lib/security/vault.ts`) |
| **Hashing** | Node.js `crypto.createHash('sha256')` |
| **PDF** | `lib/finance/payroll/es/pdf-generator-es.ts` |
| **UI** | React + Tailwind CSS + shadcn/ui |

---

## 5. Componentes del Sistema

### 5.1 Archivos Clave

| Archivo | Función |
|---------|---------|
| `lib/erp/payroll-service.ts` | Servicio principal: cálculo de nómina con asistencias, comisiones, beneficios y detección de anomalías |
| `lib/finance/payroll/es/payroll-engine-es.ts` | Motor de cálculo específico España: segmentación por tramos, IRPF, SS |
| `lib/finance/payroll/es/payroll-sealer.ts` | Sellado criptográfico con encadenamiento SHA-256 |
| `lib/finance/payroll/es/pdf-generator-es.ts` | Generador de PDF oficial basado en snapshot sellado |
| `lib/workers/payroll-closure.ts` | Worker de cierre mensual con validación Veri\*Factu + cifrado Vault |
| `lib/skills/vault-payroll-skills.ts` | Skill de orquestación segura (solo OWNER/ADMIN) |
| `lib/erp/benefit-anomaly-service.ts` | Detección de anomalías en beneficios (telework, presencialidad) |
| `lib/erp/hr-service.ts` | Servicio de gestión de gastos con workflow adaptativo |
| `components/hr/PayrollVault.tsx` | UI de Caja de Nóminas: vista previa, firma, bonos manuales |
| `components/hr/PayrollExecutionConsole.tsx` | Consola de ejecución de nóminas España |
| `components/hr/EmployeePayrollConfig.tsx` | Configuración de perfil fiscal del empleado |
| `prisma/schema.prisma` | Modelos: Employee, PayrollRecordES, PayrollLineES, EmployeePayrollProfileES, etc. |

---

## 6. Motor de Cálculo Español (PayrollEngineES)

Archivo: **`lib/finance/payroll/es/payroll-engine-es.ts`**

### 6.1 Algoritmo de Cálculo

```typescript
export class PayrollEngineES {
  static async calculatePayroll(employeeId, tenantId, period) {
    // 1. Obtener perfil fiscal (EmployeePayrollProfileES)
    //    + versiones históricas (EmployeePayrollVersionES)
    
    // 2. Segmentación por tramos
    //    Si hubo cambio de salario/base intra-mes, se divide el mes en tramos
    //    Cada tramo se calcula proporcionalmente (días/30)
    
    // 3. Procesar cada tramo:
    //    - Salario base = salaryBase × (días/30)
    //    - Complemento = salaryComplement × (días/30)
    //    - SS trabajador = totalDevengos × 6.35%
    //    - SS empresa = totalDevengos × 23.6%
    
    // 4. IRPF según situación personal (irpfSituation, hijos, voluntaryIrpfRate)
    
    // 5. Líneas generadas:
    //    101 = Salario Base (SALARY, taxable, cotizable)
    //    102 = Complemento Salarial (SALARY, taxable, cotizable)
    //    801 = S.S. Trabajador (DEDUCTION, no taxable, no cotizable)
    //    901 = Retención IRPF (DEDUCTION, no taxable, no cotizable)
  }
}
```

### 6.2 Conceptos de Nómina

| Código | Tipo | Descripción | Imponible | Cotizable |
|--------|------|-------------|:---------:|:---------:|
| 101 | SALARY | Salario Base | ✅ | ✅ |
| 102 | SALARY | Complemento Salarial | ✅ | ✅ |
| 103 | SALARY | Antigüedad | ✅ | ✅ |
| 201 | BENEFIT | Plus Transporte | Parcial | Parcial |
| 202 | BENEFIT | Ticket Restaurante | Parcial | ❌ |
| 301 | COMMISSION | Comisión por ventas | ✅ | ✅ |
| 302 | COMMISSION | Bonus por objetivos | ✅ | ✅ |
| 801 | DEDUCTION | S.S. Trabajador | ❌ | ❌ |
| 901 | DEDUCTION | Retención IRPF | ❌ | ❌ |

### 6.3 Tablas Fiscales (simplificado)

| Concepto | Trabajador | Empresa |
|----------|:----------:|:-------:|
| **Contingencias Comunes** | 4.70% | 23.60% |
| **Desempleo** | 1.55% | 5.50% |
| **Formación Profesional** | 0.10% | 0.60% |
| **FOGASA** | — | 0.20% |
| **Total aproximado** | **~6.35%** | **~29.90%** |

### 6.4 Segmentación por Tramos

Si un empleado cambia de salario el día 15, el motor:

```
Tramo 1: días 1-14 → salaryBase_v1 × 14/30
Tramo 2: días 15-30 → salaryBase_v2 × 16/30
```

Las versiones se obtienen de `EmployeePayrollVersionES` ordenadas por `effectiveFrom`.

---

## 7. Servicio de Nómina General (PayrollService)

Archivo: **`lib/erp/payroll-service.ts`**

### 7.1 Cálculo Completo

```typescript
static async calculateEmployeePayroll(employeeId, month, year) {
  // 1. Obtener empleado + salario base + tasas fiscales
  const employee = await prisma.employee.findUnique({...});
  const baseSalary = Number(employee?.salary || 0);
  const irpfRate = Number(employee?.irpfrate || 0);
  const ssRate = Number(employee?.ssrate || 0);

  // 2. Obtener asistencias del mes (CLOCK_IN)
  const attendanceLogs = await prisma.attendance.findMany({...});

  // 3. Vacaciones aprobadas
  const approvedVacations = await prisma.erp_vacation_requests.findMany({...});

  // 4. Comisiones del CRM (solo si tienen userId vinculado)
  const approvedCommissions = await prisma.comision.findMany({
    where: { userId: employee.userId, estado: 'aprobada', fechaAprobacion: { gte: start, lte: end } }
  });

  // 5. Beneficios sociales activos (EmployeeBenefit)
  const activeBenefits = await prisma.employeeBenefit.findMany({...});

  // 6. Sniffer de anomalías (BenefitAnomalyService)
  const snifferResult = await BenefitAnomalyService.sniff(
    employeeId, applicableBenefits, attendanceLogs,
    expectedWorkingDays, employee?.isTeleworkAllowed
  );

  // 7. Cálculo día a día: PRESENT / VACATION / ABSENT
  //    Deducciones: absentDays × dailyRate
  //    Total devengos = baseSalary - deductions + commissions + bonuses + benefits
  //    IRPF = totalDevengos × (irpfRate/100)
  //    SS = totalDevengos × (ssRate/100)
  //    Neto = devengos - IRPF - SS
}
```

### 7.2 Estructura de PayrollCalculation

```typescript
interface PayrollCalculation {
  baseSalary: number;
  totalDays: number;
  presentDays: number;
  vacationDays: number;
  absentDays: number;
  deductions: number;
  commissionAmount: number;
  bonusAmount: number;
  irpfRate: number;
  ssRate: number;
  irpfAmount: number;
  ssAmount: number;
  totalNet: number;
  commissionsDetails: { id: string; monto: number; metodo: string }[];
  bonusesDetails: { concept: string; amount: number }[];
  benefitsDetails: { id: string; concept: string; amount: number }[];
  flaggedBenefits: BenefitAnomaly[];
  excludedBenefits: any[];
  attendancePercent: number;
  details: { date: string; status: 'PRESENT' | 'VACATION' | 'ABSENT' }[];
}
```

---

## 8. Payroll Sealer — Sellado con Encadenamiento

Archivo: **`lib/finance/payroll/es/payroll-sealer.ts`**

### 8.1 Flujo de Sellado

```
DRAFT → LOCKED → SEALED (con SHA-256 encadenado)
```

### 8.2 Algoritmo

```typescript
static async sealPayroll(recordId, userId, operatorNote?) {
  // 1. Generar snapshot completo del cálculo
  const snapshot = {
    employee: record.employee.fullName,
    period: record.period,
    totals: { gross, net, ssWorker, irpf },
    lines: record.lines.map(l => ({ code, amount, isOverride })),
    timestamp: new Date().toISOString(),
    sealedBy: userId,
    operatorNote
  };

  // 2. Buscar última nómina sellada → obtener su auditHash como chainedHash
  const lastRecord = await prisma.payrollRecordES.findFirst({
    where: { tenantId, status: 'SEALED' },
    orderBy: { sealedAt: 'desc' }
  });
  const chainedHash = lastRecord?.auditHash || '0'.repeat(64);

  // 3. SHA-256(chainedHash + JSON.stringify(snapshot))
  const hash = createHash('sha256')
    .update(chainedHash + JSON.stringify(snapshot))
    .digest('hex');

  // 4. Transacción atómica: actualizar nómina + auditLog
  //    - status: SEALED, fiscalStatus: SIGNED
  //    - auditHash: hash, chainedHash: chainedHash
  //    - calculationSnapshot: snapshot
  //    - auditLog: acción PAYROLL_HARDENED_SEAL
}
```

### 8.3 Verificación de Integridad

```typescript
static async verifyIntegrity(recordId): Promise<
  'VALID' | 'TAMPERED' | 'SNAPSHOT_MISSING' | 'HASH_MISMATCH' | 'RECORD_NOT_FOUND'
>
```

Casos:
- Sin `auditHash` → `VALID` (aún no sellada)
- Sin `calculationSnapshot` → `SNAPSHOT_MISSING`
- Hash recalculado coincide con `auditHash` pero `netTotal` en BD ≠ snapshot → `TAMPERED`
- Hash recalculado ≠ `auditHash` → `HASH_MISMATCH` (alerta roja + auditLog `VIOLACION_INTEGRIDAD_NOMINA`)
- Todo coincide → `VALID`

---

## 9. Generador de PDF Oficial

Archivo: **`lib/finance/payroll/es/pdf-generator-es.ts`**

### 9.1 Características

- Se genera **exclusivamente** desde el snapshot sellado (no desde los datos vivos en BD)
- Verifica integridad antes de generar (`PayrollSealer.verifyIntegrity`)
- Si la integridad no es `VALID` → bloquea la generación con `BLOQUEO_SEGURIDAD`

```typescript
static async renderOfficialPDF(recordId) {
  const integrity = await PayrollSealer.verifyIntegrity(recordId);
  if (integrity !== 'VALID')
    throw new Error(`BLOQUEO_SEGURIDAD: No se puede generar PDF de una nómina comprometida (${integrity})`);
  
  const record = await prisma.payrollRecordES.findUnique({ where: { id: recordId } });
  return { success: true, url: `/api/payroll/download/${recordId}` };
}
```

### 9.2 Estructura del PDF

- **Metadatos:** engineVersion, calculationDate, auditHash, trustProtocolVerified
- **Encabezado:** employeeName, period, tenantName
- **Devengos:** líneas con amount > 0
- **Deducciones:** líneas con amount < 0
- **Totales:** bruto, neto, SS trabajador, IRPF

---

## 10. Worker de Cierre Mensual

Archivo: **`lib/workers/payroll-closure.ts`**

### 10.1 Regla de Seguridad Soberana

> El cierre solo se dispara si el **100% de los gastos** del empleado tienen fingerprint Veri\*Factu y `verificationStatus === 'VALIDATED'`. Si un hash falla o falta, **se bloquea la exportación**.

```typescript
const invalidExpenses = expenses.filter(
  e => !e.fingerprint || e.verificationStatus !== 'VALIDATED'
);

if (invalidExpenses.length > 0) {
  throw new Error(`BLOQUEO DE SEGURIDAD: ${invalidExpenses.length} tickets pendientes de validación`);
}
```

### 10.2 Flujo

```
1. Obtener empleado + vaultSeed del tenant
2. Obtener todos los gastos del periodo creados por el empleado
3. Validación 100% Veri*Factu (fingerprint + VALIDATED)
4. Sumar montos, contar anomalías
5. Generar closureData con controlHash (SHA-256 del payload)
6. Cifrar payload con VaultService.encryptJson() usando vaultSeed
7. Generar certificado de cierre formateado
```

### 10.3 Certificado de Cierre

```
Asunto: ✅ Cierre de Periodo Finalizado - 06/2026 - Tenant: Empresa Ejemplo

Resumen de Integridad:
------------------------------------------
Gastos Procesados: 45
Validación Veri*factu: 100% Coincidencia de Hash (Chain OK).
Seguridad The Vault: Datos de personal re-cifrados y validados.
Alertas VISION-LOCK: 2 gastos validados con excepciones de ubicación.

Payload de Salida:
------------------------------------------
Hash de control: [abc123def456...]
Los datos sensibles permanecen bajo cifrado AES-256-GCM.
```

---

## 11. Vault Payroll Skills — Orquestación Segura

Archivo: **`lib/skills/vault-payroll-skills.ts`**

### 11.1 Skill: `orchestrate_secure_payroll`

Solo accesible por **OWNER** o **ADMIN**:

```typescript
if (ctx.user?.role !== 'OWNER' && ctx.user?.role !== 'ADMIN') {
  throw new Error('ACCESO DENEGADO');
}
```

### 11.2 Flujo

```
1. Descifrar salario desde The Vault (salaryEncrypted)
2. Cross-reference con gastos validados (Veri*factu, status PAID)
3. Calcular total consolidado = salario + gastos validados
4. Generar controlHash (SHA-256)
5. Devolver resumen SIN exponer IBAN ni datos bancarios al LLM
```

### 11.3 Principio de Privacidad

- El salario está cifrado en `salaryEncrypted`
- Se descifra solo en el momento del cálculo con el `vaultSeed` del tenant
- Los datos bancarios (IBAN) NUNCA se exponen al agente de IA
- El skill solo devuelve un resumen consolidado sin PII

---

## 12. Frontend — PayrollVault Component

Archivo: **`components/hr/PayrollVault.tsx`**

### 12.1 Pestañas

| Pestaña | Componente | Función |
|---------|-----------|---------|
| **Caja de Nóminas** | PayrollVault | Lista de nóminas pendientes, vista previa, firma |
| **Mesa de Nóminas (ES)** | PayrollExecutionConsole | Ejecución de nóminas con motor España |
| **Configuración Laboral** | EmployeePayrollConfig | Perfil fiscal del empleado, tablas, convenios |

### 12.2 Modal de Auditoría Pre-Firma

El modal muestra:
- **Devengos fijos** (salario base)
- **Ingresos variables** (comisiones del CRM con trazabilidad)
- **Deducciones** (faltas × tasa diaria)
- **Incentivos adicionales** (bonos manuales con concepto + importe)
- **Retenciones fiscales** (IRPF + SS con tasas)
- **Panel Sniffer** (alertas de anomalías con severidad, beneficios excluidos)
- **Justificación obligatoria** si hay anomalías (textarea + checkbox)

### 12.3 Flujo de Firma

```
1. Revisar cálculo → 2. Añadir bonos manuales (opcional) → 3. Revisar anomalías →
4. Justificar anomalías (si las hay) → 5. GENERAR SELLO DEL CEO →
6. POST /api/erp/payroll/sign/[id] → 7. Nómina sellada con hash inmutable
```

---

## 13. Beneficios Sociales y Detección de Anomalías

### 13.1 Tipos de Beneficio

| Frecuencia | Cuándo aplica |
|-----------|---------------|
| `MONTHLY` | Todos los meses |
| `QUARTERLY` | Enero, Abril, Julio, Octubre |
| `YEARLY` | Solo Enero |

### 13.2 BenefitAnomalyService

`lib/erp/benefit-anomaly-service.ts`

El sniffer analiza:

| Dimensión | Qué verifica |
|-----------|-------------|
| **Asistencia mínima** | `attendancePercent` vs `minimumAttendancePercent` |
| **Presencia física** | Si `requiresPhysicalPresence=true` y el empleado está en teletrabajo |
| **Ubicación GPS** | `allowedTeleworkLat/Lng` vs `baseGPSLat/Lng` dentro de `teleworkRadius` |
| **Frecuencia** | Si el beneficio aplica en este periodo según su `frequency` |

Resultado:
- `appliedBenefits[]` — beneficios que pasan el filtro
- `flaggedBenefits[]` — beneficios con anomalías (severidad: high/medium/low)
- `excludedBenefits[]` — beneficios excluidos por no cumplir condiciones
- `snapshot` — evidencia forense del análisis

---

## 14. API Endpoints

| Método | Ruta | Función | Permiso |
|--------|------|---------|---------|
| `GET` | `/api/erp/payroll/pending?month=4&year=2026` | Listar nóminas pendientes | FINANCE_ROLE |
| `POST` | `/api/erp/payroll/seal` | Sellar lote de nóminas | FINANCE_ROLE |
| `POST` | `/api/erp/payroll/sign/[id]` | Firmar nómina individual con bonos | FINANCE_ROLE |
| `GET` | `/api/payroll/download/[id]` | Descargar PDF oficial | FINANCE_ROLE |
| `GET` | `/api/erp/hr/employees` | Listar empleados | HR_READ |
| `PUT` | `/api/erp/hr/employees/[id]` | Actualizar empleado | HR_WRITE |
| `GET` | `/api/erp/hr/employees/[id]/benefits` | Listar beneficios del empleado | HR_READ |
| `GET` | `/api/erp/hr/org-chart` | Organigrama | HR_READ |

---

## 15. Integración con Contabilidad

Cuando una nómina es sellada, se emite el evento `PAYROLL_SEALED`:

```typescript
eventBus.emitEvent(EVENTS.PAYROLL_SEALED, {
  tenantId, employeeId, period, grossTotal, netTotal,
  socialSecurityEmp, irpfTotal, payrollRecordId
});
```

El **AccountingEventListener** genera automáticamente el asiento contable:

```
640 Sueldos y Salarios              (Debe)   X,XXX.XX €
642 Seguridad Social empresa        (Debe)     XXX.XX €
  4751 H.P. acreedora IRPF          (Haber)    XXX.XX €
  476 Organismos S.S. acreedores    (Haber)    XXX.XX €
  572 Bancos (neto empleado)        (Haber)  X,XXX.XX €
```

---

## 16. Seguridad y Permisos

### 16.1 Niveles de Acceso

| Rol | Lectura | Escritura | Sellado | Skills |
|-----|:-------:|:---------:|:-------:|:------:|
| **OWNER** | ✅ | ✅ | ✅ | ✅ (orchestrate_secure_payroll) |
| **ADMIN** | ✅ | ✅ | ✅ | ✅ |
| **HR (grado 2)** | ✅ | ✅ (borrador) | ❌ | ❌ |
| **FINANCE (grado 3)** | ✅ | ✅ | ✅ | ❌ |
| **IA (Gemma/MCP)** | ✅ (org chart) | ❌ Hard-Ban | ❌ | ❌ |

### 16.2 Cifrado

| Dato | Método | Clave |
|------|--------|-------|
| `salaryEncrypted` | AES-256-GCM | `vaultSeed` del tenant |
| `contractUrlEncrypted` | AES-256-GCM | `vaultSeed` del tenant |
| `amountEncrypted` (PayrollRecord) | AES-256-GCM | `vaultSeed` del tenant |
| `auditHash` | SHA-256 | No reversible |
| `chainedHash` | SHA-256 | No reversible |
| Payload de cierre mensual | AES-256-GCM | `vaultSeed` del tenant |

### 16.3 Hard-Ban de IA

La IA (Gemma o cualquier LLM) tiene **prohibido a nivel de backend** ejecutar cálculos u operaciones de escritura sobre nóminas. Solo puede leer el organigrama vía `hr_query_org_chart`.

---

## 17. Diagrama de Flujo Completo

```
┌──────────────────────────────────────────────────────────────────────┐
│                  FLUJO COMPLETO DE NÓMINA EN VOLKERN                  │
└──────────────────────────────────────────────────────────────────────┘

  HR / FINANCE               VOLKERN                           EMPLEADO
─────┼──────────────────────────┼──────────────────────────────────┼─────
     │                          │                                  │
     │  1. Configurar perfil    │                                  │
     │     fiscal del empleado   │                                  │
     │  ──────────────────────> │                                  │
     │                          │  EmployeePayrollProfileES       │
     │                          │  + versiones históricas          │
     │                          │                                  │
     │                          │  2. Registro diario de           │
     │                          │     asistencias (CLOCK_IN)      │
     │                          │  <──────────────────────────────│
     │                          │                                  │
     │  3. Iniciar cálculo      │                                  │
     │     mensual              │                                  │
     │  ──────────────────────> │                                  │
     │                          │                                  │
     │              ┌───────────┴───────────┐                      │
     │              │ PayrollService /      │                      │
     │              │ PayrollEngineES       │                      │
     │              │ • Asistencias         │                      │
     │              │ • Vacaciones          │                      │
     │              │ • Comisiones CRM      │                      │
     │              │ • Beneficios sociales │                      │
     │              │ • Sniffer anomalías   │                      │
     │              │ • IRPF + SS           │                      │
     │              └───────────┬───────────┘                      │
     │                          │                                  │
     │              ┌───────────┴───────────┐                      │
     │              │ PayrollSealer         │                      │
     │              │ • Snapshot completo   │                      │
     │              │ • SHA-256(chained +   │                      │
     │              │   JSON(snapshot))     │                      │
     │              │ • Encadenamiento      │                      │
     │              └───────────┬───────────┘                      │
     │                          │                                  │
     │              ┌───────────┴───────────┐                      │
     │              │ Status: SEALED        │                      │
     │              │ auditHash: abc123...  │                      │
     │              │ fiscalStatus: SIGNED  │                      │
     │              └───────────┬───────────┘                      │
     │                          │                                  │
     │              ┌───────────┴───────────┐                      │
     │              │ PDF Generator         │                      │
     │              │ (desde snapshot)      │                      │
     │              │ verifyIntegrity()     │                      │
     │              └───────────┬───────────┘                      │
     │                          │                                  │
     │  4. Revisar y firmar     │                                  │
     │  <────────────────────── │                                  │
     │                          │                                  │
     │  5. GENERAR SELLO        │                                  │
     │  ──────────────────────> │                                  │
     │                          │  auditLog:                      │
     │                          │  PAYROLL_HARDENED_SEAL          │
     │                          │                                  │
     │              ┌───────────┴───────────┐                      │
     │              │ Emitir PAYROLL_SEALED │                      │
     │              │ → AccountingListener  │                      │
     │              │ → Asiento contable    │                      │
     │              └───────────┬───────────┘                      │
     │                          │                                  │
     │                          │  6. Recibo de nómina PDF         │
     │                          │     (descargable)                │
     │                          │  ──────────────────────────────>│
     │                          │                                  │
     │                          │  7. Cierre mensual               │
     │                          │     (PayrollClosureService)      │
     │                          │     • Validación Veri*Factu      │
     │                          │     • Cifrado Vault              │
     │                          │     • Certificado de cierre      │
```

---

## 18. Scripts de Prueba

| Script | Función |
|--------|---------|
| `scripts/seed-payroll-test.ts` | Seed de datos de prueba para nóminas |
| `scripts/test-verifactu-cases.ts` | Batería de pruebas Veri\*Factu (incluye nóminas) |
| `scripts/verify-verifactu-security.ts` | Verificación de seguridad criptográfica |

### Comandos útiles

```bash
# Seed de datos de prueba
npx tsx scripts/seed-payroll-test.ts

# Verificar integridad de todas las nóminas selladas de un tenant
# (vía lib/fiscal/audit-service.ts)
npx tsx scripts/audit-tenant-chain.ts <tenantId>
```

---

## 19. Apéndice: Árbol de Archivos

```
lib/
├── erp/
│   ├── payroll-service.ts              # Servicio principal de nómina
│   ├── hr-service.ts                   # Servicio de RRHH y gastos
│   └── benefit-anomaly-service.ts      # Detección de anomalías
├── finance/payroll/es/
│   ├── payroll-engine-es.ts            # Motor de cálculo España
│   ├── payroll-sealer.ts               # Sellado SHA-256 con encadenamiento
│   └── pdf-generator-es.ts             # PDF oficial desde snapshot
├── workers/
│   └── payroll-closure.ts              # Cierre mensual con Veri*Factu
├── skills/
│   └── vault-payroll-skills.ts         # Orquestación segura (OWNER/ADMIN)
├── security/
│   └── vault.ts                        # The Vault: AES-256-GCM
└── accounting/
    └── accounting-listener.ts          # PAYROLL_SEALED → asiento contable

components/hr/
├── PayrollVault.tsx                     # UI principal de nóminas
├── PayrollExecutionConsole.tsx         # Consola ejecución España
└── EmployeePayrollConfig.tsx           # Configuración fiscal empleado

prisma/
└── schema.prisma                       # Modelos: Employee, PayrollRecordES,
                                        # PayrollLineES, EmployeePayrollProfileES,
                                        # EmployeeBenefit, LegalTaxTable, etc.

scripts/
├── seed-payroll-test.ts                # Seed de datos de prueba
└── test-verifactu-cases.ts             # Pruebas Veri*Factu
```

---

*Documento para uso interno del equipo de desarrollo. Versión junio 2026.*
