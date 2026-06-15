# 📊 Sistema Contable Volkern — Guía para el Contable

## Cómo se registran Gastos, Ingresos, Nóminas, Cobros y Pagos en la Contabilidad

**Fecha:** Junio 2026
**Versión:** 1.0
**Destinatario:** Asesoría Contable y Fiscal

---

## Índice

1. [Visión General](#1-visión-general)
2. [El Plan General Contable en Volkern](#2-el-plan-general-contable-en-volkern)
3. [Registro de un Gasto](#3-registro-de-un-gasto)
4. [Registro de un Ingreso (Facturación)](#4-registro-de-un-ingreso-facturación)
5. [Registro de una Nómina](#5-registro-de-una-nómina)
6. [Registro de Cobros y Pagos](#6-registro-de-cobros-y-pagos)
7. [Conciliación Bancaria](#7-conciliación-bancaria)
8. [Cierre de Periodos y Seguridad del Libro Diario](#8-cierre-de-periodos-y-seguridad-del-libro-diario)
9. [Modelos Fiscales (AEAT)](#9-modelos-fiscales-aeat)
10. [Calendario Fiscal](#10-calendario-fiscal)
11. [Resumen Práctico para el Día a Día](#11-resumen-práctico-para-el-día-a-día)
12. [Apéndice: Cuentas Contables Principales](#12-apéndice-cuentas-contables-principales)

---

## 1. Visión General

Volkern incorpora un sistema contable completo basado en el **Plan General de Contabilidad español (PGC, RD 1514/2007)**, que automatiza la mayor parte del trabajo contable diario.

**Lo que el sistema hace automáticamente:**

- ✅ **Clasifica cada gasto** en la cuenta contable correcta del Grupo 6 mediante inteligencia artificial, con opción a que el contable confirme o corrija la clasificación.
- ✅ **Genera los asientos contables** de facturas, gastos, nóminas y movimientos bancarios de forma automática aplicando la partida doble.
- ✅ **Calcula el IVA** repercutido y soportado, y lo registra en las cuentas fiscales correspondientes (472, 477).
- ✅ **Calcula las retenciones de IRPF** de nóminas y facturas de profesionales.
- ✅ **Concilia los movimientos bancarios** con los asientos contables, sugiriendo coincidencias automáticas.
- ✅ **Genera los modelos fiscales:** 303 (IVA), 111 (IRPF), 130 (pago fraccionado), 347 (operaciones con terceros), 349 (intracomunitario) y 390 (resumen anual IVA).
- ✅ **Sella y protege el libro diario** para que ningún asiento pueda modificarse sin dejar huella.
- ✅ **Cierra periodos contables** (mensuales) con verificación de integridad.
- ✅ **Produce los informes contables:** Balance de Sumas y Saldos, Pérdidas y Ganancias, y Balance de Situación.

**Lo que el contable debe hacer:**

- Revisar y, si es necesario, corregir las clasificaciones automáticas de gastos.
- Revisar las conciliaciones bancarias sugeridas y confirmarlas.
- Cerrar los periodos mensuales.
- Revisar los modelos fiscales antes de presentarlos.

---

## 2. El Plan General Contable en Volkern

### 2.1. Estructura de los 9 Grupos del PGC

El sistema implementa fielmente los 9 grupos del PGC español. Cada empresa puede elegir el plan que le corresponda:

| Grupo | Nombre | Naturaleza principal |
|-------|--------|---------------------|
| **1** | Financiación Básica | Patrimonio Neto y Pasivo a largo plazo |
| **2** | Inmovilizado / Activo No Corriente | Activo fijo (inmuebles, maquinaria, equipos informáticos) |
| **3** | Existencias | Inventario (mercaderías, materias primas, productos terminados) |
| **4** | Acreedores y Deudores por operaciones comerciales | Clientes, proveedores, Hacienda Pública, Seguridad Social |
| **5** | Cuentas Financieras | Bancos, caja, deudas a corto plazo, inversiones financieras |
| **6** | **Compras y Gastos** | Todos los gastos del ejercicio |
| **7** | **Ventas e Ingresos** | Todos los ingresos del ejercicio |
| **8** | Gastos imputados al Patrimonio Neto | Gastos que van directamente a patrimonio |
| **9** | Ingresos imputados al Patrimonio Neto | Ingresos que van directamente a patrimonio |

### 2.2. Planes disponibles

Cada empresa cliente de Volkern tiene asignado uno de estos planes según su tamaño:

| Plan | Normativa | Nº de cuentas | Para quién |
|------|-----------|---------------|------------|
| **PGC Normal** | RD 1514/2007 | ~400 cuentas | Empresas que no pueden acogerse a planes simplificados |
| **PGC PYMES** | RD 1515/2007 | Grupos 1 al 7 | Pequeñas y medianas empresas |
| **Microempresas** | Criterios específicos RD 1515/2007 | ~40 cuentas | Empresas que cumplen los límites de microempresa |

### 2.3. Adaptaciones sectoriales disponibles

Además del plan base, el sistema incorpora cuentas específicas para **14 sectores** diferentes. Por ejemplo:

- **Constructora:** añade cuentas como "320 Obras en curso" y "321 Certificaciones de obra".
- **Inmobiliaria:** añade "2503 Existencias de terrenos para la venta" y "7010 Ventas de edificaciones".
- **Sanitaria:** añade "216 Equipamiento clínico", "6001 Compras de material sanitario" e "Ingresos por actos sanitarios".
- **Sociedades Anónimas Deportivas (SAD):** añade "204 Derechos federativos de jugadores", "205 Derechos de traspaso", "7003 Ingresos por traspasos de jugadores".
- **Entidades sin fines lucrativos:** añade "651 Ayudas monetarias", "732 Cuotas de usuarios y afiliados", "734 Ingresos por patrocinios".
- Y 9 sectores más.

---

## 3. Registro de un Gasto

Este es el proceso contable más frecuente. Veámoslo paso a paso con un ejemplo real.

### 3.1. Ejemplo práctico

> **Un empleado registra en la app:** *"Factura de reparación del aire acondicionado de la oficina. Proveedor: ClimaFix S.L. Importe total: 121,00 €. Fecha: 15/01/2026."*

### 3.2. Qué hace el sistema automáticamente

**Paso 1 — Clasificación contable inteligente**

El sistema analiza la descripción y categoría del gasto y lo asigna automáticamente a la cuenta contable correcta. En este caso, al ser una reparación, lo clasifica en:

> **Cuenta 622 "Reparaciones y conservación"**

La clasificación se muestra al usuario, que puede confirmarla o elegir manualmente otra cuenta si no está de acuerdo.

Las cuentas de gasto más habituales y su uso:

| Categoría del gasto | Cuenta asignada | Ejemplo |
|---------------------|-----------------|---------|
| Compras de mercaderías | **600** | Compra de productos para reventa |
| Alquiler de oficina/local | **621** | Arrendamientos y cánones |
| Reparaciones | **622** | Reparación de equipos, mantenimiento |
| Servicios profesionales | **623** | Asesoría, abogados, consultores |
| Transporte y envíos | **624** | Mensajería, portes, logística |
| Seguros | **625** | Seguro de responsabilidad civil, local, etc. |
| Comisiones bancarias | **626** | Comisiones de mantenimiento de cuenta |
| Publicidad y marketing | **627** | Anuncios, Google Ads, redes sociales |
| Suministros (luz, agua, gas) | **628** | Factura de electricidad, agua, internet |
| Software, suscripciones | **629** | Licencias, SaaS, hosting |
| Nóminas | **640** | Sueldos y salarios del personal |
| Seguridad Social empresa | **642** | Cuota patronal de la Seguridad Social |

**Paso 2 — Cálculo automático del IVA**

Con el tipo general del 21%:

```
Total factura:      121,00 €
Base imponible:     100,00 €  (121,00 ÷ 1,21)
IVA soportado:       21,00 €  (100,00 × 21%)
```

**Paso 3 — Asiento contable automático**

El sistema genera inmediatamente el siguiente asiento en el libro diario:

```
FECHA: 15/01/2026
CONCEPTO: Gasto: Factura reparación aire acondicionado oficina, ClimaFix S.L.

┌──────────────────────────────────────┬────────────┬────────────┐
│                CUENTA                │    DEBE    │   HABER    │
├──────────────────────────────────────┼────────────┼────────────┤
│  622  Reparaciones y conservación    │   100,00   │            │
│  472  H.P. IVA Soportado            │    21,00   │            │
│  410  Acreedores por prest. serv.    │            │   121,00   │
└──────────────────────────────────────┴────────────┴────────────┘
```

**Paso 4 — Registro fiscal automático**

El IVA soportado queda registrado automáticamente para el **Modelo 303** del trimestre correspondiente (en este caso, 1er trimestre 2026, a presentar en abril 2026).

### 3.3. Si el gasto no lleva IVA o lleva IVA reducido

El sistema calcula automáticamente el IVA al tipo general del 21%. Si un gasto tiene un tipo diferente (10%, 4%, o está exento), el contable puede ajustar manualmente los importes en el asiento.

---

## 4. Registro de un Ingreso (Facturación)

### 4.1. Ejemplo práctico

> **Se emite una factura a un cliente:** *Factura Nº F2026-001. Prestación de servicios informáticos. Importe total: 1.210,00 €. Fecha: 02/02/2026. Cliente: TechCorp S.L.*

### 4.2. Qué hace el sistema automáticamente

**Paso 1 — Cálculo del IVA repercutido**

```
Total factura:       1.210,00 €
Base imponible:      1.000,00 €  (1.210,00 ÷ 1,21)
IVA repercutido:       210,00 €  (1.000,00 × 21%)
```

**Paso 2 — Asiento contable automático**

Al emitir la factura, el sistema registra automáticamente:

```
FECHA: 02/02/2026
CONCEPTO: Factura Emitida F2026-001

┌──────────────────────────────────────┬────────────┬────────────┐
│                CUENTA                │    DEBE    │   HABER    │
├──────────────────────────────────────┼────────────┼────────────┤
│  430  Clientes                       │  1.210,00  │            │
│  705  Prestaciones de servicios      │            │  1.000,00  │
│  477  H.P. IVA Repercutido           │            │    210,00  │
└──────────────────────────────────────┴────────────┴────────────┘
```

> **Nota:** Si la empresa vende productos en lugar de servicios, se usa la cuenta **700 "Ventas de mercaderías"** en lugar de la 705.

**Paso 3 — Registro fiscal automático**

El IVA repercutido queda registrado para el Modelo 303.

**Paso 4 — Cuando el cliente paga la factura** *(ver sección 6)*

---

## 5. Registro de una Nómina

### 5.1. Ejemplo práctico

> **Nómina de enero 2026 de un empleado:**
> - Salario bruto: 2.500,00 €
> - Retención IRPF (15%): 375,00 €
> - Seguridad Social a cargo del trabajador (6,4%): 160,00 €
> - Líquido a percibir: 1.965,00 €
> - Seguridad Social a cargo de la empresa (30%): 750,00 € *(se registra en un asiento aparte o junto con el salario)*

### 5.2. Asiento contable automático

```
FECHA: 31/01/2026
CONCEPTO: Nómina Periodo 1/2026 - Empleado: [Nombre]

┌──────────────────────────────────────┬────────────┬────────────┐
│                CUENTA                │    DEBE    │   HABER    │
├──────────────────────────────────────┼────────────┼────────────┤
│  640  Sueldos y salarios             │  2.500,00  │            │
│  642  Seguridad Social a cargo emp.  │    750,00  │            │
│  4751 H.P. acreedora retenciones     │            │    375,00  │
│  476  Organismos S.S. acreedores     │            │    910,00  │
│  465  Remuneraciones pend. de pago   │            │  1.965,00  │
└──────────────────────────────────────┴────────────┴────────────┘
```

> **Nota sobre el 476:** Los 910,00 € en el haber incluyen tanto la cuota obrera (160,00 €) como la cuota patronal (750,00 €). El sistema permite desglosarlas si se prefiere mayor detalle.

### 5.3. Registro fiscal

- La retención de IRPF (375,00 €) se registra automáticamente para el **Modelo 111**.
- Las bases y cuotas de Seguridad Social quedan trazadas para los seguros sociales (TC1, TC2).

### 5.4. Pago de la nómina

Cuando se realiza la transferencia al empleado, se registra:

```
FECHA: 31/01/2026
CONCEPTO: Pago nómina Periodo 1/2026

┌──────────────────────────────────────┬────────────┬────────────┐
│                CUENTA                │    DEBE    │   HABER    │
├──────────────────────────────────────┼────────────┼────────────┤
│  465  Remuneraciones pend. de pago   │  1.965,00  │            │
│  572  Bancos                         │            │  1.965,00  │
└──────────────────────────────────────┴────────────┴────────────┘
```

---

## 6. Registro de Cobros y Pagos

### 6.1. Cobro de un cliente

Cuando el cliente paga una factura pendiente:

```
CONCEPTO: Cobro factura F2026-001 - TechCorp S.L.

┌──────────────────────────────────────┬────────────┬────────────┐
│                CUENTA                │    DEBE    │   HABER    │
├──────────────────────────────────────┼────────────┼────────────┤
│  572  Bancos                         │  1.210,00  │            │
│  430  Clientes                       │            │  1.210,00  │
└──────────────────────────────────────┴────────────┴────────────┘
```

### 6.2. Pago a un proveedor

Cuando se paga la factura de un gasto:

```
CONCEPTO: Pago factura reparación - ClimaFix S.L.

┌──────────────────────────────────────┬────────────┬────────────┐
│                CUENTA                │    DEBE    │   HABER    │
├──────────────────────────────────────┼────────────┼────────────┤
│  410  Acreedores por prest. serv.    │   121,00   │            │
│  572  Bancos                         │            │    121,00  │
└──────────────────────────────────────┴────────────┴────────────┘
```

> **Nota:** Si el proveedor se gestiona con la cuenta 400 "Proveedores" (porque suministra mercaderías), el sistema usa automáticamente la 400 en lugar de la 410.

---

## 7. Conciliación Bancaria

### 7.1. Conexión con el banco

El sistema puede conectarse directamente con las cuentas bancarias de la empresa para descargar los movimientos automáticamente.

**¿Cómo funciona?**

1. La empresa autoriza la conexión con su banco (a través de los estándares europeos PSD2).
2. El sistema descarga periódicamente los movimientos bancarios.
3. Cada movimiento del banco aparece en el panel de conciliación.

### 7.2. Conciliación automática inteligente

El sistema compara cada movimiento bancario con los asientos contables registrados y sugiere coincidencias basándose en:

| Criterio | Qué busca |
|----------|-----------|
| **Importe exacto** | El movimiento del banco coincide exactamente con el saldo del asiento contable |
| **Fecha cercana** | La fecha del banco está a 1 día o menos del asiento |
| **Descripción similar** | La descripción del banco contiene palabras clave del asiento (ej. "FACTURA", "NÓMINA") |
| **Referencia común** | Ambos comparten un número de factura o referencia |

Cada coincidencia sugerida muestra un **porcentaje de confianza**. El contable solo tiene que revisar y confirmar.

**Ejemplo de conciliación sugerida:**

```
🏦 Banco: COBRO TRANSFERENCIA TechCorp S.L.        1.210,00 € (15/02/2026)
📄 Asiento: Factura Emitida F2026-001               1.210,00 € (02/02/2026)
✅ Confianza: 95% — Confirmar conciliación
```

Cuando el contable confirma, el movimiento bancario y el asiento quedan vinculados y marcados como "conciliados".

---

## 8. Cierre de Periodos y Seguridad del Libro Diario

### 8.1. Sellado del libro diario

Cada asiento contable que se registra en Volkern queda **sellado criptográficamente** y **encadenado al asiento anterior**. Esto significa que:

- ❌ **Ningún asiento puede modificarse** sin romper la cadena de sellos.
- ❌ **Ningún asiento puede eliminarse** sin que el sistema lo detecte.
- ✅ Cualquier intento de alteración queda **registrado y es detectable** de inmediato.

Este sistema equivale a un **libro diario encuadernado y sellado** en formato digital, cumpliendo con los requisitos legales de inalterabilidad de los registros contables.

### 8.2. Cierre mensual

Al final de cada mes, el contable puede **cerrar el periodo**:

1. El sistema verifica que toda la cadena de asientos esté íntegra.
2. Si hay alguna irregularidad, **el cierre se rechaza** y se notifica al contable.
3. Si todo es correcto, el periodo se cierra y **ningún asiento de ese mes puede modificarse**.
4. Se genera un **hash de cierre** (una huella digital única de todo el periodo) que certifica el estado de la contabilidad a esa fecha.

Este proceso es análogo al cierre contable tradicional pero automatizado y con verificación matemática de integridad.

### 8.3. Actualización automática de saldos

Cada vez que se registra un asiento, los saldos de las cuentas contables se actualizan automáticamente. Esto permite consultar en cualquier momento:

- **Balance de Sumas y Saldos**
- **Pérdidas y Ganancias (PyG)**
- **Balance de Situación**

---

## 9. Modelos Fiscales (AEAT)

El sistema genera automáticamente los datos para las declaraciones fiscales. El contable solo tiene que revisar y presentar.

### 9.1. Modelos generados

| Modelo | Impuesto | Periodicidad | Cómo se calcula |
|--------|----------|-------------|-----------------|
| **303** | IVA | Trimestral | `Total IVA Repercutido (477) − Total IVA Soportado (472)` |
| **111** | Retenciones IRPF | Trimestral | Suma de todas las retenciones practicadas (nóminas, profesionales, alquileres) |
| **130** | Pago fraccionado IRPF | Trimestral | `(Ingresos del Grupo 7 − Gastos del Grupo 6) × 20%` |
| **347** | Operaciones con terceros | Anual | Facturas emitidas + Gastos recibidos por cada NIF, si superan 3.005,06 € |
| **349** | Operac. intracomunitarias | Trimestral | Facturas a clientes UE + Compras a proveedores UE con NIF intracomunitario |
| **390** | Resumen anual IVA | Anual | Consolida los 4 modelos 303 del año |

### 9.2. Ejemplo: Modelo 303 del 1er Trimestre 2026

El sistema suma automáticamente:

```
IVA REPERCUTIDO (cuenta 477):
  Factura F2026-001 (base 1.000€) ..................   210,00 €
  Factura F2026-002 (base 3.000€) ..................   630,00 €
  Factura F2026-003 (base 2.000€) ..................   420,00 €
  ─────────────────────────────────────────────────────────
  Total IVA Repercutido ............................ 1.260,00 €

IVA SOPORTADO (cuenta 472):
  Reparación ClimaFix (base 100€) ..................    21,00 €
  Alquiler oficina (base 1.500€) ...................   315,00 €
  Suministros (base 400€) ..........................    84,00 €
  Servicios profesionales (base 600€) ..............   126,00 €
  Publicidad (base 1.200€) .........................   252,00 €
  ─────────────────────────────────────────────────────────
  Total IVA Soportado ..............................   798,00 €

┌───────────────────────────────────────────────────────────┐
│ RESULTADO:   1.260,00 − 798,00 = +462,00 € A INGRESAR     │
└───────────────────────────────────────────────────────────┘
```

### 9.3. Ejemplo: Modelo 130 (Pago fraccionado autónomos)

```
TOTAL INGRESOS (Grupo 7):
  Ventas y prestaciones de servicios ...............  6.000,00 €
  ─────────────────────────────────────────────────────────
  Total ingresos ...................................  6.000,00 €

TOTAL GASTOS (Grupo 6):
  Reparaciones (622) ...............................    100,00 €
  Alquiler (621) ...................................  1.500,00 €
  Suministros (628) ................................    400,00 €
  Servicios profesionales (623) ....................    600,00 €
  Publicidad (627) .................................  1.200,00 €
  Sueldos (640) ....................................  2.500,00 €
  S.S. empresa (642) ...............................    750,00 €
  Amortización (681) ...............................    950,00 €
  ─────────────────────────────────────────────────────────
  Total gastos .....................................  8.000,00 €

BASE NETA:    6.000,00 − 8.000,00 = −2.000,00 €
             (Base negativa → Pago fraccionado = 0,00 €)
```

---

## 10. Calendario Fiscal

El sistema mantiene un calendario con todos los plazos de presentación de la AEAT y **avisa con antelación** cuando se acerca un vencimiento.

### 10.1. Plazos de presentación

| Modelo | Trimestre | Plazo de presentación |
|--------|-----------|----------------------|
| 303 (IVA) | 1T (ene-mar) | 20 de abril |
| 303 (IVA) | 2T (abr-jun) | 20 de julio |
| 303 (IVA) | 3T (jul-sep) | 20 de octubre |
| 303 (IVA) | 4T (oct-dic) | 30 de enero (año siguiente) |
| 111 (IRPF) | Todos | Los mismos que el 303 |
| 130 (Pago fracc.) | Todos | Los mismos que el 303 |
| 349 (Intracom.) | Todos | Día 30 del mes siguiente al trimestre |
| 347 (Terceros) | Anual | 31 de marzo (año siguiente) |
| 390 (Resumen IVA) | Anual | 30 de enero (año siguiente) |

### 10.2. Sistema de alertas

- ⚠️ **7 días antes** del vencimiento: el sistema envía una alerta con el importe estimado a pagar.
- 🚨 **Vencido:** si no se ha presentado, el sistema alerta diariamente.
- El calendario muestra el estado de cada modelo: **Pendiente**, **Notificado** o **Presentado**.

---

## 11. Resumen Práctico para el Día a Día

### 11.1. Operativa diaria recomendada

| Tarea | Frecuencia | Qué hace el contable |
|-------|------------|---------------------|
| **Revisar clasificación de gastos** | Diaria/semanal | Revisar que el sistema haya clasificado correctamente los nuevos gastos en las cuentas del Grupo 6. Corregir si es necesario. |
| **Revisar conciliaciones** | Semanal | Revisar las sugerencias de conciliación bancaria y confirmarlas. |
| **Verificar saldos** | Semanal | Consultar el Balance de Sumas y Saldos para detectar posibles descuadres. |
| **Cierre mensual** | Fin de mes | Ejecutar el cierre del periodo una vez revisado todo. |
| **Revisar modelos fiscales** | Trimestral | Revisar los modelos 303, 111, 130 y 349 antes de presentarlos. |
| **Modelo 347** | Anual (enero-marzo) | Revisar el listado de operaciones con terceros >3.005,06€. |
| **Modelo 390** | Anual (enero) | Revisar el resumen anual de IVA. |

### 11.2. Flujo completo de una operación

```
                    ┌─────────────────────────┐
                    │   REGISTRO INICIAL      │
                    │  (App web o móvil)      │
                    └───────────┬─────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
      ┌──────────┐      ┌──────────────┐     ┌──────────┐
      │  GASTO   │      │   FACTURA    │     │  NÓMINA  │
      │          │      │   EMITIDA    │     │          │
      └────┬─────┘      └──────┬───────┘     └────┬─────┘
           │                   │                  │
           ▼                   ▼                  ▼
      ┌─────────────────────────────────────────────────┐
      │         CLASIFICACIÓN Y CONTABILIZACIÓN         │
      │                                                 │
      │  • El sistema clasifica el gasto (Grupo 6)      │
      │  • Calcula IVA automáticamente                  │
      │  • Genera el asiento contable                   │
      │  • Actualiza los saldos de las cuentas          │
      │  • Registra el impacto fiscal (modelos AEAT)    │
      └──────────────────────┬──────────────────────────┘
                             │
                             ▼
      ┌─────────────────────────────────────────────────┐
      │            CONCILIACIÓN BANCARIA                │
      │                                                 │
      │  • Movimientos del banco se descargan           │
      │  • El sistema sugiere coincidencias             │
      │  • El contable confirma las conciliaciones      │
      └──────────────────────┬──────────────────────────┘
                             │
                             ▼
      ┌─────────────────────────────────────────────────┐
      │           CIERRE Y REPORTES                     │
      │                                                 │
      │  • Cierre mensual con verificación de integridad│
      │  • Balance de Sumas y Saldos                    │
      │  • Pérdidas y Ganancias                         │
      │  • Balance de Situación                         │
      │  • Modelos fiscales trimestrales y anuales      │
      └─────────────────────────────────────────────────┘
```

### 11.3. Lo más importante que debe saber el contable

1. **Cada gasto se clasifica automáticamente** en la cuenta del Grupo 6 que le corresponde. El contable solo tiene que revisar y confirmar.

2. **Cada factura emitida genera automáticamente** el asiento de ventas (430 Clientes / 700 Ventas / 477 IVA repercutido).

3. **Cada nómina genera automáticamente** el asiento de personal (640 Sueldos / 4751 IRPF / 476 SS / 465 Remuneraciones pendientes).

4. **Los movimientos bancarios se concilian** con los asientos de forma semiautomática: el sistema sugiere, el contable confirma.

5. **El libro diario está sellado:** una vez registrado un asiento, no se puede modificar sin dejar constancia. Esto protege contra errores y fraudes.

6. **Los periodos cerrados son inmutables:** tras el cierre mensual, ningún asiento de ese mes puede tocarse.

7. **Los modelos fiscales se calculan solos** a partir de los asientos contables. El contable solo tiene que revisarlos y presentarlos.

---

## 12. Apéndice: Cuentas Contables Principales

### Grupo 6 — Compras y Gastos

| Código | Nombre | Uso más frecuente |
|--------|--------|-------------------|
| 600 | Compras de mercaderías | Productos comprados para reventa |
| 601 | Compras de materias primas | Materias primas para fabricación |
| 621 | Arrendamientos y cánones | Alquiler de oficina, local, maquinaria |
| 622 | Reparaciones y conservación | Mantenimiento y reparaciones |
| 623 | Servicios de profesionales independientes | Asesoría, abogados, consultores IT |
| 624 | Transportes | Envíos, mensajería, portes |
| 625 | Primas de seguros | RC, local, vehículos, salud |
| 626 | Servicios bancarios | Comisiones de cuenta, TPV |
| 627 | Publicidad, propaganda y RRPP | Marketing, anuncios, ferias |
| 628 | Suministros | Luz, agua, gas, internet, teléfono |
| 629 | Otros servicios | Software, suscripciones SaaS, hosting |
| 640 | Sueldos y salarios | Nóminas del personal |
| 642 | Seguridad Social a cargo de la empresa | Cuota patronal |
| 681 | Amortización del inmovilizado material | Dotación mensual/anual |
| 662 | Intereses de deudas | Intereses de préstamos |

### Grupo 7 — Ventas e Ingresos

| Código | Nombre | Uso más frecuente |
|--------|--------|-------------------|
| 700 | Ventas de mercaderías | Venta de productos |
| 705 | Prestaciones de servicios | Servicios profesionales facturados |
| 740 | Subvenciones, donaciones y legados a la explotación | Subvenciones recibidas |
| 759 | Otros ingresos de gestión | Ingresos atípicos o menores |

### Grupo 4 — Acreedores y Deudores (cuentas fiscales más usadas)

| Código | Nombre | Uso |
|--------|--------|-----|
| 400 | Proveedores | Deudas por compras de mercaderías |
| 410 | Acreedores por prestaciones de servicios | Deudas por servicios recibidos |
| 430 | Clientes | Derechos de cobro por ventas |
| 465 | Remuneraciones pendientes de pago | Sueldos netos pendientes de transferir |
| 472 | H.P. IVA Soportado | IVA pagado en compras (deducible) |
| 475 | H.P. acreedora por diversos conceptos | Deudas con Hacienda |
| 4751 | H.P. acreedora por retenciones practicadas | IRPF retenido a empleados y profesionales |
| 476 | Organismos de la Seguridad Social, acreedores | Seguridad Social pendiente de pago |
| 477 | H.P. IVA Repercutido | IVA cobrado en facturas (a ingresar) |

---

**Volkern — Sistema Contable**
*Junio 2026*
