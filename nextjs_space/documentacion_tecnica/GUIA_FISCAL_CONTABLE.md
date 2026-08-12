# 📋 Guía de Reportes Fiscales — Volkern

## Cómo funcionan los Modelos de Impuestos y Reportes Contables

**Fecha:** Junio 2026
**Versión:** 1.0
**Destinatario:** Asesoría Contable y Fiscal

---

## Índice

1. [Introducción](#1-introducción)
2. [De dónde salen los datos fiscales](#2-de-dónde-salen-los-datos-fiscales)
3. [Modelo 303 — IVA Trimestral](#3-modelo-303--iva-trimestral)
4. [Modelo 111 — Retenciones de IRPF](#4-modelo-111--retenciones-de-irpf)
5. [Modelo 115 — Retenciones por Arrendamientos](#5-modelo-115--retenciones-por-arrendamientos)
6. [Modelo 130 — Pago Fraccionado de IRPF](#6-modelo-130--pago-fraccionado-de-irpf)
7. [Modelo 347 — Operaciones con Terceros](#7-modelo-347--operaciones-con-terceros)
8. [Modelo 349 — Operaciones Intracomunitarias](#8-modelo-349--operaciones-intracomunitarias)
9. [Modelo 390 — Resumen Anual de IVA](#9-modelo-390--resumen-anual-de-iva)
10. [Modelo 180 — Resumen Anual de Retenciones por Arrendamientos](#10-modelo-180--resumen-anual-de-retenciones-por-arrendamientos)
11. [Reportes Contables](#11-reportes-contables)
12. [Calendario Fiscal y Alertas](#12-calendario-fiscal-y-alertas)
13. [Resumen: Qué reporte y cuándo](#13-resumen-qué-reporte-y-cuándo)

---

## 1. Introducción

Volkern genera automáticamente los **8 modelos fiscales** que una empresa española necesita presentar ante la AEAT, más los **3 informes contables** fundamentales. Todo ello se calcula en tiempo real a partir de los asientos contables que el sistema registra automáticamente al contabilizar facturas, gastos y nóminas.

**Lo que el contable debe saber:**

- ✅ Los modelos fiscales se **calculan solos** desde la contabilidad. No hay que introducir datos manualmente.
- ✅ El sistema **sabe qué trimestre** corresponde a cada operación y agrupa los importes automáticamente.
- ✅ El contable solo tiene que **revisar las cifras** y, cuando esté conforme, **marcar el modelo como presentado**.
- ✅ El calendario fiscal **avisa con antelación** de todos los vencimientos.

---

## 2. De dónde salen los datos fiscales

Cada vez que se registra un asiento contable con impacto fiscal (IVA, IRPF), el sistema guarda automáticamente un **registro de impacto fiscal** con estos datos:

- **Tipo:** IVA repercutido, IVA soportado, o Retención de IRPF
- **Base imponible:** sobre la que se aplica el impuesto
- **Tipo impositivo:** 21%, 10%, 4%, 15%, etc.
- **Cuota:** el importe del impuesto
- **Periodo:** mes y año al que corresponde

**Ejemplo: Al registrar una factura de venta de 1.210 € (IVA 21% incluido):**

| Dato | Valor |
|------|-------|
| Tipo | IVA REPERCUTIDO |
| Base imponible | 1.000,00 € |
| Tipo impositivo | 21% |
| Cuota | 210,00 € |
| Periodo | Febrero 2026 |

Este registro alimenta automáticamente los modelos 303, 111, 115, 130, 347, 349, 390, 180 y el calendario fiscal.

---

## 3. Modelo 303 — IVA Trimestral

### ¿Qué es?

La declaración-liquidación trimestral del IVA. Se presenta cada trimestre.

### ¿Cómo se calcula?

El sistema suma todos los registros de IVA del trimestre:

```
┌─────────────────────────────────────────────────────────────┐
│                     IVA REPERCUTIDO                          │
│  (cobrado en las facturas emitidas a clientes)              │
│                                                             │
│  Factura F2026-001 (base 1.000€ × 21%) ........   210,00 €  │
│  Factura F2026-002 (base 3.000€ × 21%) ........   630,00 €  │
│  Factura F2026-003 (base 2.000€ × 21%) ........   420,00 €  │
│  ─────────────────────────────────────────────────          │
│  Total IVA Repercutido ....................... 1.260,00 €    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     IVA SOPORTADO                            │
│  (pagado en las facturas de gastos y compras)                │
│                                                             │
│  Reparación oficina (base 100€ × 21%) ..........    21,00 €  │
│  Alquiler oficina (base 1.500€ × 21%) .........   315,00 €  │
│  Suministros (base 400€ × 21%) ................    84,00 €  │
│  Servicios profesionales (base 600€ × 21%) ....   126,00 €  │
│  Publicidad (base 1.200€ × 21%) ...............   252,00 €  │
│  ─────────────────────────────────────────────────          │
│  Total IVA Soportado ..........................   798,00 €   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  RESULTADO:  1.260,00 − 798,00 = +462,00 € A INGRESAR       │
│                                                             │
│  Si el resultado es positivo → a ingresar                    │
│  Si el resultado es negativo → a compensar                   │
└─────────────────────────────────────────────────────────────┘
```

### ¿Qué ve el contable en la pantalla?

El sistema muestra una tabla con:

| Concepto | Base imponible | Cuota |
|----------|---------------|-------|
| IVA Repercutido | 6.000,00 € | 1.260,00 € |
| IVA Soportado | 3.800,00 € | 798,00 € |
| **Resultado** | | **+462,00 €** |

Y debajo, el **detalle de cada factura y gasto** que compone cada suma, con su fecha, proveedor/cliente e importe.

### ¿Cómo se marca como presentado?

El contable pulsa **"Marcar como presentado"**. A partir de ese momento:
- Esos registros de IVA quedan marcados como `presentados`.
- Ya no se modifican aunque se añadan nuevos asientos al trimestre (porque el trimestre no está cerrado, pero los registros ya declarados sí están bloqueados).
- El Modelo 390 (resumen anual) refleja ese trimestre como "presentado".

---

## 4. Modelo 111 — Retenciones de IRPF

### ¿Qué es?

Declaración trimestral de las retenciones de IRPF practicadas a:
- **Empleados** (nóminas)
- **Profesionales** (facturas de autónomos con retención)

> Las retenciones por **arrendamiento de inmuebles urbanos** se declaran en el **Modelo 115** (y su resumen anual en el **Modelo 180**), no en el 111.

### ¿Cómo se calcula?

Igual que el 303, pero filtrando solo los registros de tipo **"Retención IRPF"**:

```
┌─────────────────────────────────────────────────────────────┐
│                 RETENCIONES PRACTICADAS                      │
│                                                             │
│  Nómina enero (base 2.500€ × 15%) ..............   375,00 €  │
│  Nómina febrero (base 2.500€ × 15%) ............   375,00 €  │
│  Nómina marzo (base 2.500€ × 15%) ..............   375,00 €  │
│  Factura profesional (base 800€ × 15%) .........   120,00 €  │
│  ─────────────────────────────────────────────────          │
│  Total retenciones ............................. 1.245,00 €   │
└─────────────────────────────────────────────────────────────┘
```

### Origen de los datos

- **Nóminas:** El sistema calcula la retención al registrar cada nómina (cuenta 4751).
- **Profesionales:** Al registrar una factura de un proveedor profesional con retención.

---

## 5. Modelo 115 — Retenciones por Arrendamientos

### ¿Qué es?

Declaración **trimestral** de las retenciones de IRPF que debes practicar al pagar el alquiler de un **inmueble urbano** a un arrendador (persona física o entidad sin actividad económica). Tipo general de retención: **19%** sobre la renta pagada.

### ¿Cómo se calcula?

El sistema toma los gastos con categoría **«Alquiler»** que incluyeron retención de IRPF en el trimestre:

```
┌─────────────────────────────────────────────────────────────┐
│                 RETENCIONES POR ARRENDAMIENTO (1T 2026)      │
│                                                             │
│  Alquiler local (base 1.500€ × 19%) ..............   285,00 € │
│  Alquiler oficina (base 1.000€ × 19%) ............   190,00 € │
│  ─────────────────────────────────────────────────          │
│  Rentas pagadas ................................ 2.500,00 €   │
│  Retenciones a ingresar ........................   475,00 €   │
└─────────────────────────────────────────────────────────────┘
```

### Origen de los datos

- **Gastos con categoría «Alquiler»** registrados en el sistema con retención de IRPF (`metadata.irpfAmount > 0`).
- El detalle muestra el **arrendador** (proveedor), su NIF, la renta y la retención practicada.
- Presentación: 20 abril, 20 julio, 20 octubre y 30 enero.
- El resumen anual de estas retenciones se declara en el **Modelo 180**.

---

## 6. Modelo 130 — Pago Fraccionado de IRPF

### ¿Qué es?

El pago fraccionado trimestral que deben presentar los **autónomos en estimación directa**. Se calcula como el **20% del beneficio neto** del trimestre.

### ¿Cómo se calcula?

A diferencia del 303 y 111, el Modelo 130 **no se calcula desde registros de impuestos**, sino directamente desde los ingresos y gastos contables:

```
┌─────────────────────────────────────────────────────────────┐
│  TOTAL INGRESOS DEL TRIMESTRE (Cuentas del Grupo 7)          │
│                                                             │
│  Ventas de mercaderías (700) ...................... 0,00 €   │
│  Prestaciones de servicios (705) .............. 6.000,00 €   │
│  ─────────────────────────────────────────────────          │
│  Total ingresos ................................ 6.000,00 €   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  TOTAL GASTOS DEL TRIMESTRE (Cuentas del Grupo 6)            │
│                                                             │
│  Reparaciones (622) .............................. 100,00 €   │
│  Alquiler (621) ................................ 1.500,00 €   │
│  Suministros (628) ............................... 400,00 €   │
│  Servicios profesionales (623) .................. 600,00 €   │
│  Publicidad (627) .............................. 1.200,00 €   │
│  Sueldos (640) ................................. 2.500,00 €   │
│  S.S. empresa (642) ............................. 750,00 €    │
│  Amortización (681) ............................. 950,00 €    │
│  ─────────────────────────────────────────────────          │
│  Total gastos .................................. 8.000,00 €   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  CÁLCULO:                                                    │
│                                                             │
│  Ingresos .............................. 6.000,00 €          │
│  Gastos ................................ 8.000,00 €   −      │
│  ─────────────────────────────────────────────────          │
│  Base neta ............................ −2.000,00 €          │
│                                                             │
│  Si base neta > 0 → Base neta × 20%                          │
│  Si base neta ≤ 0 → 0,00 € (no hay pago fraccionado)        │
│                                                             │
│  Resultado a ingresar: 0,00 €                                │
└─────────────────────────────────────────────────────────────┘
```

### Detalle adicional

El sistema muestra el desglose de ingresos y gastos por cuenta contable, ordenado por código:

```
Ingresos:
  705  Prestaciones de servicios .............. 6.000,00 €

Gastos:
  621  Arrendamientos y cánones ............... 1.500,00 €
  622  Reparaciones y conservación .............. 100,00 €
  623  Servicios profesionales independientes ... 600,00 €
  627  Publicidad, propaganda y RRPP .......... 1.200,00 €
  628  Suministros .............................. 400,00 €
  640  Sueldos y salarios ..................... 2.500,00 €
  642  Seguridad Social a cargo empresa ......... 750,00 €
  681  Amortización inmovilizado material ....... 950,00 €
```

---

## 7. Modelo 347 — Operaciones con Terceros

### ¿Qué es?

Declaración **anual** informativa de operaciones con clientes y proveedores que superen **3.005,06 €** en el año natural. Se presenta en **marzo** del año siguiente.

### ¿Cómo se calcula?

El sistema agrupa automáticamente:

**Paso 1 — Operaciones con CLIENTES (ventas):**

Agrupa todas las facturas emitidas durante el año por cada cliente:

```
Cliente: TechCorp S.L. (NIF: B12345678)
  Factura F2026-001 (02/01/2026) .............. 1.210,00 €
  Factura F2026-005 (15/03/2026) .............. 2.420,00 €
  Factura F2026-012 (10/06/2026) .............. 3.630,00 €
  ─────────────────────────────────────────────────
  Total anual ................................. 7.260,00 €  ← SUPERIOR A 3.005,06 € → SE DECLARA

Cliente: SmallShop (NIF: 12345678Z)
  Factura F2026-003 (20/01/2026) ................ 500,00 €
  ─────────────────────────────────────────────────
  Total anual ................................... 500,00 €  ← INFERIOR A 3.005,06 € → NO SE DECLARA
```

**Paso 2 — Operaciones con PROVEEDORES (compras/gastos):**

Agrupa todos los gastos del año por cada proveedor:

```
Proveedor: ClimaFix S.L. (NIF: B87654321)
  Gasto reparación (15/01/2026) ................. 121,00 €
  Gasto mantenimiento (20/06/2026) .............. 605,00 €
  Gasto revisión anual (10/11/2026) ........... 3.025,00 €
  ─────────────────────────────────────────────────
  Total anual ................................. 3.751,00 €  ← SUPERIOR → SE DECLARA
```

### ¿Qué ve el contable?

Una tabla con todas las contrapartes que superan el umbral:

| Tipo | Nombre | NIF | Nº facturas | Total anual |
|------|--------|-----|-------------|-------------|
| CLIENTE | TechCorp S.L. | B12345678 | 3 | 7.260,00 € |
| PROVEEDOR | ClimaFix S.L. | B87654321 | 3 | 3.751,00 € |

Y un resumen:

```
Total operaciones declaradas: 2
Total importe clientes:        7.260,00 €
Total importe proveedores:     3.751,00 €
```

---

## 8. Modelo 349 — Operaciones Intracomunitarias

### ¿Qué es?

Declaración **trimestral** recapitulativa de operaciones con empresas de la Unión Europea. Se presentan:
- **Entregas:** Ventas a clientes con NIF intracomunitario (exentas de IVA en España).
- **Adquisiciones:** Compras a proveedores de otros países de la UE.

### ¿Cómo se calcula?

El sistema detecta automáticamente las operaciones intracomunitarias:

**Entregas (ventas a la UE):**
- Busca clientes que tengan un **NIF intracomunitario** (identificador de IVA europeo) en su perfil fiscal.
- Verifica que el país del cliente sea uno de los 27 países de la UE.
- Lista todas las facturas emitidas a esos clientes en el trimestre.

```
┌─────────────────────────────────────────────────────────────┐
│  ENTREGAS INTRACOMUNITARIAS (1T 2026)                        │
│                                                             │
│  Cliente: TechFrance SARL                                   │
│  NIF: FR12345678901                                         │
│  País: Francia                                              │
│  Factura F2026-008 (15/02/2026) ................ 5.000,00 €   │
│                                                             │
│  Total entregas: 5.000,00 € (1 operación)                    │
└─────────────────────────────────────────────────────────────┘
```

**Adquisiciones (compras desde la UE):**
- Busca proveedores cuyo NIF empiece por un código de país UE (ej. "DE" para Alemania, "FR" para Francia).
- Lista todos los gastos registrados de esos proveedores en el trimestre.

```
┌─────────────────────────────────────────────────────────────┐
│  ADQUISICIONES INTRACOMUNITARIAS (1T 2026)                   │
│                                                             │
│  Proveedor: DeutscheSoft GmbH                               │
│  NIF: DE987654321                                           │
│  País: Alemania                                             │
│  Licencia software (10/02/2026) ............... 1.200,00 €   │
│                                                             │
│  Total adquisiciones: 1.200,00 € (1 operación)               │
└─────────────────────────────────────────────────────────────┘
```

### ¿Cómo detecta el sistema los países de la UE?

Lista blanca de los 27 países: Alemania (DE), Francia (FR), Italia (IT), Portugal (PT), Países Bajos (NL), Bélgica (BE), Austria (AT), Irlanda (IE), Polonia (PL), Suecia (SE), Dinamarca (DK), Finlandia (FI), Grecia (GR), República Checa (CZ), Rumanía (RO), Hungría (HU), Eslovaquia (SK), Bulgaria (BG), Croacia (HR), Eslovenia (SI), Lituania (LT), Letonia (LV), Estonia (EE), Chipre (CY), Luxemburgo (LU), Malta (MT).

---

## 9. Modelo 390 — Resumen Anual de IVA

### ¿Qué es?

Declaración **anual** que resume los 4 modelos 303 presentados durante el año. Se presenta en **enero** del año siguiente.

### ¿Cómo se calcula?

El sistema consolida automáticamente los datos de los 4 trimestres. **No recalcula nada:** recoge los totales ya declarados en cada 303.

```
┌─────────────────────────────────────────────────────────────┐
│  MODELO 390 — EJERCICIO 2026                                 │
│                                                             │
│  Trimestre │ IVA Repercutido │ IVA Soportado │ Resultado     │
│  ──────────┼─────────────────┼───────────────┼────────────── │
│  1T        │    1.260,00 €   │    798,00 €   │  +462,00 €    │
│  2T        │    1.890,00 €   │    945,00 €   │  +945,00 €    │
│  3T        │    2.100,00 €   │  1.260,00 €   │  +840,00 €    │
│  4T        │    1.575,00 €   │  1.050,00 €   │  +525,00 €    │
│  ──────────┼─────────────────┼───────────────┼────────────── │
│  TOTAL     │    6.825,00 €   │  4.053,00 €   │ +2.772,00 €   │
└─────────────────────────────────────────────────────────────┘
```

### Estado de los trimestres

El sistema indica si cada trimestre ha sido "presentado" o está "pendiente", para que el contable sepa qué trimestres faltan por declarar antes de presentar el 390.

---

## 10. Modelo 180 — Resumen Anual de Retenciones por Arrendamientos

### ¿Qué es?

Declaración **anual informativa** de las retenciones e ingresos a cuenta sobre **arrendamientos de inmuebles urbanos**. Se presenta en **enero** del año siguiente y resume los 4 trimestres del Modelo 115.

### ¿Cómo se calcula?

El sistema consolida los 4 trimestres del Modelo 115 y agrupa las retenciones **por arrendador**:

```
┌─────────────────────────────────────────────────────────────┐
│  MODELO 180 — EJERCICIO 2026                                 │
│                                                             │
│  Arrendador            │ NIF        │ Rentas      │ Reten.   │
│  ──────────────────────┼────────────┼─────────────┼───────── │
│  Inmobiliaria Ruiz S.L.│ B12345678  │ 6.000,00 €  │ 1.140 €  │
│  García, Ana           │ 45678901X  │ 4.000,00 €  │  760 €  │
│  ──────────────────────┼────────────┼─────────────┼───────── │
│  TOTAL                 │            │10.000,00 €  │ 1.900 €  │
└─────────────────────────────────────────────────────────────┘
```

### Estado de los trimestres

El dashboard muestra la consolidación trimestral (retenciones declaradas en cada Modelo 115) para que el contable verifique que los 4 trimestres cuadran antes de presentar el 180.

---

## 11. Reportes Contables

Además de los modelos fiscales, el sistema genera los 3 informes contables fundamentales.

### 11.1. Balance de Sumas y Saldos

Muestra **todas las cuentas** con su saldo deudor o acreedor.

```
┌─────────────────────────────────────────────────────────────┐
│  Código  │ Nombre                    │ Debe       │ Haber    │
│  ────────┼───────────────────────────┼────────────┼──────────│
│  100     │ Capital social            │            │ 3.000,00 │
│  112     │ Reserva legal             │            │ 1.000,00 │
│  170     │ Deudas LP ent. crédito    │            │28.500,00 │
│  216     │ Mobiliario                │   8.000,00 │          │
│  217     │ Equipos informáticos      │  12.000,00 │          │
│  281     │ Amort. acumulada inmov.   │            │   950,00 │
│  430     │ Clientes                  │  44.770,00 │          │
│  472     │ H.P. IVA Soportado        │   5.607,00 │          │
│  ...                                  │            │          │
│  ────────┼───────────────────────────┼────────────┼──────────│
│  TOTAL                                │ XXX.XXX €  │ XXX.XXX €│
└─────────────────────────────────────────────────────────────┘
```

### 11.2. Pérdidas y Ganancias (PyG)

Muestra el **resultado del ejercicio** (beneficio o pérdida):

```
┌─────────────────────────────────────────────────────────────┐
│  1. Gastos de Explotación                                    │
│    621  Arrendamientos ....................... 4.500,00 €     │
│    622  Reparaciones .......................... 100,00 €     │
│    623  Servicios profesionales ............... 600,00 €     │
│    627  Publicidad ........................... 3.600,00 €     │
│    628  Suministros .......................... 1.200,00 €     │
│    640  Sueldos y salarios .................. 13.500,00 €     │
│    642  Seguridad Social ..................... 4.455,00 €     │
│    681  Amortización ......................... 2.850,00 €     │
│    ─────────────────────────────────────────                 │
│    Total gastos ............................. 30.805,00 €     │
│                                                              │
│  2. Ingresos de Explotación                                  │
│    700  Ventas de mercaderías ...................... 0 €     │
│    705  Prestaciones de servicios ........... 37.000,00 €     │
│    ─────────────────────────────────────────                 │
│    Total ingresos ........................... 37.000,00 €     │
│                                                              │
│  ┌──────────────────────────────────────────┐                │
│  │  RESULTADO: +6.195,00 € (BENEFICIO)       │                │
│  └──────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

### 11.3. Balance de Situación

Muestra la **situación patrimonial** de la empresa:

```
┌─────────────────────────────────────────────────────────────┐
│  ACTIVO                                │  PATRIMONIO + PASIVO│
│  ───────────────────────────────────── │ ─────────────────── │
│  A) Activo No Corriente                │ A) Patrimonio Neto  │
│     Inmovilizado material .. 20.000 €  │   Capital ... 3.000€│
│     Amort. acumulada ....... −950 €    │   Reservas .. 1.000€│
│     Total ................. 19.050 €   │   Resultado . 6.195€│
│                                        │   Total .... 10.195€│
│  B) Activo Corriente                   │                      │
│     Clientes ............... 44.770 €  │ B) Pasivo No Corr.  │
│     H.P. deudora ............ 5.607 €  │   Deudas LP..28.500€│
│     Bancos ................. 32.090 €  │                      │
│     Total ................. 82.467 €   │ C) Pasivo Corriente │
│                                        │   Acreedores .1.815€│
│                                        │   H.P. acreed. 7.082€│
│                                        │   S.S. acreed. .910€│
│                                        │   Total ...... 9.807€│
│  ───────────────────────────────────── │ ─────────────────── │
│  TOTAL ACTIVO .............. 101.517€  │ TOTAL PN+PASIVO 101.517€│
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Calendario Fiscal y Alertas

### Plazos de presentación

| Modelo | Impuesto | Periodicidad | Plazo |
|--------|----------|-------------|-------|
| **303** | IVA | Trimestral | 20 abril / 20 julio / 20 octubre / 30 enero |
| **111** | Retenciones IRPF | Trimestral | Los mismos que el 303 |
| **115** | Retenciones por arrendamientos | Trimestral | Los mismos que el 303 |
| **130** | Pago fraccionado IRPF | Trimestral | Los mismos que el 303 |
| **349** | Operaciones intracomunitarias | Trimestral | 30 abril / 30 julio / 30 octubre / 30 enero |
| **347** | Operaciones con terceros | Anual | 31 de marzo (año siguiente) |
| **390** | Resumen anual IVA | Anual | 30 de enero (año siguiente) |
| **180** | Resumen anual retenciones arrendamientos | Anual | 30 de enero (año siguiente) |

### Sistema de alertas

El sistema avisa proactivamente:

- ⚠️ **7 días antes** de cada vencimiento, mostrando una estimación del importe a pagar.
- 🚨 **A diario** si un modelo ya ha vencido y no se ha marcado como presentado.
- ✅ El calendario muestra en verde los presentados, en amarillo los próximos, y en rojo los vencidos.

---

## 13. Resumen: Qué reporte y cuándo

### Calendario trimestral tipo

| Cuándo | Qué hacer |
|--------|-----------|
| **Abril** (1-20) | Revisar y presentar: 303 (1T), 111 (1T), 115 (1T), 130 (1T), 349 (1T) |
| **Julio** (1-20) | Revisar y presentar: 303 (2T), 111 (2T), 115 (2T), 130 (2T) |
| **Julio** (1-30) | Revisar y presentar: 349 (2T) |
| **Octubre** (1-20) | Revisar y presentar: 303 (3T), 111 (3T), 115 (3T), 130 (3T) |
| **Octubre** (1-30) | Revisar y presentar: 349 (3T) |
| **Enero** (1-30) | Revisar y presentar: 303 (4T), 111 (4T), 115 (4T), 130 (4T), 349 (4T), **390 (anual)**, **180 (anual)** |
| **Marzo** (1-31) | Revisar y presentar: **347 (anual)** |

### Operativa recomendada

1. **Cada trimestre**, unos días antes del vencimiento:
   - Abrir el panel de cada modelo (303, 111, 115, 130, 349).
   - Revisar que los importes cuadran con la contabilidad.
   - Pulsar "Marcar como presentado".

2. **En enero**, además de los trimestrales:
   - Revisar el **Modelo 390** (resumen anual de IVA). El sistema ya ha consolidado los 4 trimestres.
   - Revisar el **Modelo 180** (resumen anual de retenciones por arrendamientos).

4. **En cualquier momento:**
   - Consultar el **Balance de Sumas y Saldos** para verificar que no hay descuadres.
   - Consultar la **Cuenta de Pérdidas y Ganancias** para ver el resultado acumulado.
   - Consultar el **Balance de Situación** para ver la situación patrimonial.

---

**Volkern — Sistema de Reportes Fiscales**
*Junio 2026*
