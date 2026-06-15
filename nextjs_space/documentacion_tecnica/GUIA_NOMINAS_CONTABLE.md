# Guía del Módulo de Nóminas y RRHH para la Asesoría Contable

## Sistema de Gestión de Personal, Cálculo de Nóminas y Cumplimiento Fiscal

**Plataforma:** Volkern  
**Módulo:** Nóminas y RRHH  
**Fecha:** Junio 2026

---

## Índice

1. [¿Qué hace el módulo de Nóminas?](#1-qué-hace-el-módulo-de-nóminas)
2. [Cómo se da de alta un empleado](#2-cómo-se-da-de-alta-un-empleado)
3. [El perfil fiscal del empleado](#3-el-perfil-fiscal-del-empleado)
4. [Cómo se calcula una nómina paso a paso](#4-cómo-se-calcula-una-nómina-paso-a-paso)
5. [Los conceptos de la nómina](#5-los-conceptos-de-la-nómina)
6. [Comisiones y variables desde el CRM](#6-comisiones-y-variables-desde-el-crm)
7. [Beneficios sociales y su fiscalidad](#7-beneficios-sociales-y-su-fiscalidad)
8. [El sellado de la nómina: inmutabilidad garantizada](#8-el-sellado-de-la-nómina-inmutabilidad-garantizada)
9. [El asiento contable de la nómina](#9-el-asiento-contable-de-la-nómina)
10. [El cierre mensual y la conciliación con Veri\*Factu](#10-el-cierre-mensual-y-la-conciliación-con-verifactu)
11. [El recibo de nómina (PDF oficial)](#11-el-recibo-de-nómina-pdf-oficial)
12. [Lo que el contable debe hacer en el día a día](#12-lo-que-el-contable-debe-hacer-en-el-día-a-día)
13. [Preguntas frecuentes](#13-preguntas-frecuentes)
14. [Resumen práctico](#14-resumen-práctico)

---

## 1. ¿Qué hace el módulo de Nóminas?

El módulo de Nóminas y RRHH de Volkern gestiona todo el ciclo de vida de la compensación de los empleados:

| Función | Qué significa |
|---------|---------------|
| **Altas y perfil fiscal** | Registrar empleados con su situación fiscal completa |
| **Asistencias y vacaciones** | Control diario de fichajes, ausencias y vacaciones aprobadas |
| **Cálculo automático** | Nómina calculada automáticamente cada mes: salario base, comisiones, beneficios, deducciones |
| **IRPF y Seguridad Social** | Cálculo de retenciones según tablas fiscales vigentes y perfil personal del empleado |
| **Sellado inmutable** | La nómina sellada no se puede modificar (cumplimiento Veri\*Factu) |
| **Asiento contable** | Generación automática del asiento de nómina en contabilidad |
| **Recibo oficial** | PDF de nómina descargable basado estrictamente en el cálculo sellado |
| **Cierre mensual** | Validación completa de integridad antes del cierre del periodo |

---

## 2. Cómo se da de alta un empleado

Para que un empleado aparezca en nómina, debe estar dado de alta en Volkern con los siguientes datos:

### Datos obligatorios

| Campo | Ejemplo |
|-------|---------|
| Nombre completo | Ana García López |
| Email corporativo | ana.garcia@empresa.es |
| Departamento | Desarrollo |
| Puesto / Rol | Senior Developer |
| Fecha de contratación | 15/01/2025 |
| Salario base (bruto mensual) | 4.500 € |

### Datos del perfil fiscal (España)

| Campo | Ejemplo | Importancia |
|-------|---------|-------------|
| Grupo de cotización SS | 1 (Ingenieros/Licenciados) | Determina bases mínimas y máximas |
| Tipo de contrato | 100 (Indefinido) | Afecta bonificaciones |
| % Jornada | 100% | Para contratos a tiempo parcial |
| Modo de pagas extra | Prorrateadas | Simplifica el cálculo mensual |
| Situación IRPF | 1 (Soltero sin hijos) | Determina el % de retención |
| Nº de hijos | 0, 1, 2, ... | Reduce la retención |
| Retención IRPF voluntaria | — | Si el empleado pide que le retengan más |

---

## 3. El perfil fiscal del empleado

El perfil fiscal (`EmployeePayrollProfileES`) es la ficha que determina cómo se calculan las retenciones de cada empleado. Se configura una vez y puede tener **versiones históricas** si cambia durante el año (por ejemplo, un cambio de salario a mitad de mes).

### Tablas fiscales aplicadas

| Impuesto | Quién lo paga | % aproximado |
|----------|:------------:|:------------:|
| **Contingencias Comunes** (trabajador) | Empleado | 4,70% |
| **Desempleo** (trabajador) | Empleado | 1,55% |
| **Formación Profesional** (trabajador) | Empleado | 0,10% |
| **Total SS trabajador** | Empleado | **~6,35%** |
| **Contingencias Comunes** (empresa) | Empresa | 23,60% |
| **Desempleo** (empresa) | Empresa | 5,50% |
| **Formación Profesional** (empresa) | Empresa | 0,60% |
| **FOGASA** | Empresa | 0,20% |
| **Total SS empresa** | Empresa | **~29,90%** |
| **IRPF** (retención) | Empleado | 15% - 24% (según salario y situación) |

### Cambios salariales a mitad de mes

Si un empleado cambia de salario el día 15, Volkern **divide automáticamente el mes en tramos**:

```
Días 1-14: salario antiguo × (14/30)
Días 15-30: salario nuevo × (16/30)
```

Esto garantiza que la nómina refleje exactamente lo que corresponde, sin necesidad de cálculos manuales.

---

## 4. Cómo se calcula una nómina paso a paso

Cada mes, el sistema calcula automáticamente la nómina de cada empleado siguiendo estos pasos:

### Paso 1: Obtener el perfil del empleado

- Salario base, complementos, situación IRPF, grupo de cotización
- Si hay cambios durante el mes, se detectan los tramos automáticamente

### Paso 2: Contar días trabajados

| Tipo de día | Cómo se determina | Impacto |
|-------------|-------------------|---------|
| **Presente** | Ha fichado entrada (CLOCK_IN) | Cobra el día completo |
| **Vacaciones** | Tiene solicitud aprobada para ese día | Cobra el día completo |
| **Ausente** | No ha fichado ni está de vacaciones | Se descuenta del salario |

Los fines de semana **no cuentan como ausencias** (solo se contabilizan días laborables).

### Paso 3: Sumar ingresos variables

- **Comisiones** del CRM (ventas cerradas con factura pagada en el periodo)
- **Beneficios sociales** (ticket restaurante, transporte, etc.)
- **Bonos manuales** (incentivos puntuales autorizados por dirección)

### Paso 4: Calcular deducciones

```
Total Devengado = Salario Base + Complementos + Comisiones + Beneficios + Bonos
                 − Deducción por días de ausencia

IRPF = Total Devengado × % IRPF del empleado
SS Trabajador = Total Devengado × 6,35%
SS Empresa = Total Devengado × ~29,90%

Neto a percibir = Total Devengado − IRPF − SS Trabajador
```

### Paso 5: Ejemplo numérico completo

```
Empleado: Ana García
Salario base: 4.500 €/mes
Situación IRPF: Soltera sin hijos → 15%
Días trabajados: 20 (de 22 laborables)
Días de ausencia: 2

Cálculo:
  Salario base:                        4.500,00 €
  Deducción ausencias (2 × 150 €):      −300,00 €
  Comisiones del mes:                    250,00 €
  Ticket restaurante (beneficio):         80,00 €
  ─────────────────────────────────────────────
  Total devengado:                     4.530,00 €

  IRPF (15%):                           −679,50 €
  SS Trabajador (6,35%):                −287,66 €
  ─────────────────────────────────────────────
  NETO A PERCIBIR:                     3.562,84 €

  Coste empresa adicional:
  SS Empresa (29,90% de 4.530):        1.354,47 €
  ─────────────────────────────────────────────
  COSTE TOTAL EMPRESA:                 5.884,47 €
```

---

## 5. Los conceptos de la nómina

Cada línea de la nómina tiene un código estandarizado:

### Devengos (lo que el empleado gana)

| Código | Concepto | Ejemplo |
|--------|----------|---------|
| 101 | Salario Base | 4.500,00 € |
| 102 | Complemento Salarial | 200,00 € |
| 103 | Antigüedad | 150,00 € |
| 201 | Plus Transporte | 80,00 € |
| 202 | Ticket Restaurante | 60,00 € |
| 301 | Comisión por ventas | 250,00 € |
| 302 | Bonus por objetivos | 500,00 € |

### Deducciones (lo que se descuenta)

| Código | Concepto | Ejemplo |
|--------|----------|---------|
| 801 | Seguridad Social (trabajador) | −287,66 € |
| 901 | Retención IRPF | −679,50 € |

---

## 6. Comisiones y variables desde el CRM

Una de las ventajas de Volkern es que las **comisiones se calculan automáticamente** desde el CRM:

1. El empleado cierra una venta en el CRM
2. Se genera la factura y el cliente paga (`estado = PAID`)
3. La comisión queda registrada con estado `aprobada`
4. Al calcular la nómina del mes, Volkern **suma automáticamente** todas las comisiones aprobadas en ese periodo

### Trazabilidad de comisiones

Cada comisión en la nómina es trazable: puedes ver exactamente qué venta la generó, el método de cálculo y la fecha de aprobación. Esto elimina disputas sobre "cuánto me corresponde este mes".

---

## 7. Beneficios sociales y su fiscalidad

Volkern gestiona automáticamente los beneficios sociales con su tratamiento fiscal correcto:

| Beneficio | ¿Imponible IRPF? | ¿Cotiza SS? | Límite exento |
|-----------|:---------------:|:----------:|---------------|
| Ticket restaurante | Sí (salvo exceso) | No | 11 €/día laborable |
| Plus transporte | Parcial | Parcial | Hasta 1.500 €/año |
| Seguro médico | No | No | 500 €/año por persona |
| Guardería | No | No | — |
| Formación | No | No | — |
| Teletrabajo | No hasta 26,67 €/mes | No | Para gastos sin justificar |

### Detección de anomalías en beneficios

Volkern incluye un **sistema automático de detección de anomalías** que verifica:

- ¿El empleado tiene la **asistencia mínima** requerida para recibir este beneficio?
- Si el beneficio exige **presencia física**, ¿ha fichado desde la oficina o desde casa?
- ¿La **ubicación GPS** del fichaje coincide con el centro de trabajo?

Si se detecta una anomalía, el sistema **alerta al responsable** antes de sellar la nómina, y exige una **justificación por escrito**.

---

## 8. El sellado de la nómina: inmutabilidad garantizada

Una vez revisada y validada la nómina, se procede a su **sellado**. Este paso es irreversible y tiene las mismas garantías que Veri\*Factu para las facturas:

### ¿Qué significa "sellar" una nómina?

1. Se toma una **fotografía completa** (snapshot) del cálculo: empleado, periodo, todos los devengos, todas las deducciones, totales
2. Se calcula una **huella digital SHA-256** que combina el snapshot con la huella de la nómina anterior del mismo empleado
3. Se genera un registro de auditoría con acción `SELLADO_REFORZADO_NOMINA`
4. La nómina pasa a estado **SELLADA** y ya **no se puede modificar**

### ¿Qué pasa si hay un error después del sellado?

**No se modifica la nómina sellada.** En su lugar, se genera un **ajuste retroactivo** en la nómina del mes siguiente con el concepto correspondiente (por ejemplo, "Abono por ajuste retroactivo" o "Deducción por ajuste retroactivo").

Este principio es idéntico al de las facturas Veri\*Factu: **nunca se borra, se rectifica**.

### Verificación de integridad

En cualquier momento se puede verificar que una nómina sellada no ha sido manipulada. El sistema:

- Recalcula la huella desde el snapshot guardado
- Compara con la huella almacenada
- Verifica que los totales en la base de datos coinciden con el snapshot

Resultados posibles:

| Estado | Significado |
|--------|-------------|
| ✅ VÁLIDA | Todo coincide, la nómina está íntegra |
| ⚠️ ALTERADA | La huella coincide pero los valores en BD son diferentes |
| 🔴 HUELLA_NO_COINCIDE | La huella no coincide: posible manipulación detectada |

---

## 9. El asiento contable de la nómina

Cuando una nómina es sellada, Volkern genera **automáticamente** el asiento contable correspondiente:

### Asiento tipo de una nómina mensual

```
                                                      DEBE         HABER
──────────────────────────────────────────────────────────────────────────
640  Sueldos y Salarios                             4.530,00
642  Seguridad Social a cargo de la empresa         1.354,47
     ─────────────────────────────────────────────────────────────────────
     4751  H.P. acreedora por IRPF                                679,50
     476   Organismos de la Seguridad Social acreedores          1.642,13
           (287,66 trabajador + 1.354,47 empresa)
     572   Bancos (neto a pagar al empleado)                     3.562,84
     ─────────────────────────────────────────────────────────────────────
     TOTAL                                           5.884,47     5.884,47
```

### Modelos fiscales afectados

| Modelo | Qué se declara | Periodicidad |
|--------|---------------|:------------:|
| **Modelo 111** | Retenciones de IRPF de las nóminas | Trimestral |
| **Modelo 190** | Resumen anual de retenciones | Anual (enero) |
| **Sistema RED** | Cotizaciones a la Seguridad Social | Mensual |
| **Modelo 303** | IVA (no afecta directamente a nóminas) | Trimestral |

---

## 10. El cierre mensual y la conciliación con Veri\*Factu

Al final de cada mes, Volkern ejecuta un **cierre mensual** que garantiza la integridad completa antes de consolidar:

### Regla de seguridad

> El cierre solo se ejecuta si el **100% de los gastos** del periodo tienen su huella Veri\*Factu y están en estado `VALIDADO`. Si un solo gasto falla, el cierre **se bloquea** y se notifica al responsable.

### Proceso de cierre

```
1. Obtener todos los gastos del mes creados por los empleados
2. Verificar que cada gasto tiene fingerprint Veri*Factu y estado VALIDADO
3. Sumar los importes y contar anomalías detectadas
4. Generar un certificado de cierre con hash de control
5. Cifrar el payload completo en la Bóveda (Vault)
```

### Certificado de cierre

Al finalizar el cierre, el sistema genera un certificado como este:

```
✅ Cierre de Periodo Finalizado - Junio 2026 - Empresa Ejemplo SA

Gastos Procesados: 45
Validación Veri*factu: 100% Coincidencia de Hash (Chain OK).
Seguridad: Datos de personal re-cifrados y validados.
Alertas VISION-LOCK: 2 gastos con excepciones de ubicación.

Hash de control: abc123def456...
Los datos sensibles permanecen bajo cifrado AES-256.
```

---

## 11. El recibo de nómina (PDF oficial)

El PDF de nómina se genera **exclusivamente desde el snapshot sellado**, no desde los datos vivos de la base de datos. Esto garantiza que el recibo que recibe el empleado coincide exactamente con lo que se calculó y selló.

### Lo que contiene el recibo

| Sección | Contenido |
|---------|-----------|
| **Encabezado** | Empresa, empleado, periodo, fecha de cálculo |
| **Devengos** | Todas las percepciones (salario base, complementos, comisiones, beneficios) |
| **Deducciones** | SS trabajador, IRPF, otras retenciones |
| **Totales** | Bruto, neto a percibir, bases de cotización |
| **Pie** | Huella de auditoría, versión del motor, sello de confianza |

### Medida de seguridad

Antes de generar el PDF, el sistema verifica la integridad de la nómina. Si se detecta cualquier anomalía (`TAMPERED` o `HASH_MISMATCH`), la generación del PDF **se bloquea** y se notifica al equipo de seguridad.

---

## 12. Lo que el contable debe hacer en el día a día

### Configuración inicial (una sola vez por empleado)

| Tarea | Frecuencia |
|-------|-----------|
| Dar de alta al empleado con sus datos completos | Una vez |
| Configurar el perfil fiscal: grupo cotización, tipo contrato, situación IRPF | Una vez |
| Verificar que el salario base es correcto | Una vez |
| Configurar beneficios sociales si los hay (ticket restaurante, transporte, etc.) | Una vez |

### Operativa mensual

| Tarea | Frecuencia |
|-------|-----------|
| Revisar las nóminas pendientes (estado BORRADOR) al inicio del mes | Mensual |
| Verificar asistencias: ¿los días de ausencia son correctos? | Mensual |
| Revisar comisiones automáticas del CRM: ¿cuadran con lo esperado? | Mensual |
| Revisar alertas de anomalías en beneficios (si las hay) | Mensual |
| Añadir bonos manuales si corresponde (con concepto y justificación) | Mensual |
| Sellar las nóminas una vez revisadas | Mensual |
| Verificar que los asientos contables de nóminas se han generado correctamente | Mensual |
| Descargar los PDF de nómina para entrega a empleados | Mensual |

### Operativa trimestral

| Tarea | Frecuencia |
|-------|-----------|
| Presentar el **Modelo 111** (retenciones IRPF de nóminas) | Trimestral (abril, julio, octubre, enero) |
| Verificar que los totales del 111 coinciden con los IRPF de las nóminas selladas | Trimestral |
| Revisar recibos de liquidación de SS (Sistema RED) contra los datos de Volkern | Mensual |

### Operativa anual

| Tarea | Frecuencia |
|-------|-----------|
| Presentar el **Modelo 190** (resumen anual de retenciones) | Enero |
| Generar y entregar certificados de retenciones a empleados | Enero |
| Revisar tablas fiscales actualizadas para el nuevo ejercicio | Enero |

---

## 13. Preguntas frecuentes

### ¿Puedo modificar una nómina ya sellada?

No. Una nómina sellada es inmutable. Si hay un error, se genera un **ajuste retroactivo** en la nómina del mes siguiente. Esto cumple con los mismos principios de Veri\*Factu.

### ¿Qué pasa si un empleado cambia de salario a mitad de mes?

Volkern divide automáticamente el mes en tramos y calcula cada tramo proporcionalmente. Solo necesitas registrar la nueva versión del perfil fiscal con su fecha de efecto.

### ¿Cómo se calculan las comisiones?

Automáticamente desde el CRM. Las comisiones de ventas con factura pagada en el periodo se suman a la nómina con trazabilidad completa.

### ¿Los datos bancarios de los empleados están protegidos?

Sí. Los salarios y datos bancarios se almacenan **cifrados en la Bóveda (The Vault)** con AES-256. Ni siquiera los administradores del sistema pueden verlos en claro sin autorización expresa.

### ¿Qué ocurre si un empleado está de baja por IT?

Las ausencias por incapacidad temporal se registran en `EmployeeAbsenceES` con el tipo correspondiente. Si la baja es con pago delegado, la empresa adelanta el pago y luego lo descuenta de la liquidación de la SS.

### ¿Volkern genera el fichero para el Sistema RED?

Sí. El sistema genera automáticamente los datos necesarios para la liquidación de cotizaciones a la Seguridad Social.

---

## 14. Resumen práctico

### Checklist para la asesoría contable

| # | Punto a verificar | Estado |
|---|-------------------|--------|
| 1 | Todos los empleados están dados de alta con perfil fiscal completo | ☐ |
| 2 | Los salarios base coinciden con los contratos | ☐ |
| 3 | Las situaciones IRPF son correctas (consultar con cada empleado) | ☐ |
| 4 | Los beneficios sociales están configurados con su fiscalidad correcta | ☐ |
| 5 | Las nóminas del mes se revisan antes de sellar | ☐ |
| 6 | Las anomalías detectadas se justifican por escrito | ☐ |
| 7 | Los asientos contables de nóminas cuadran con los PDF sellados | ☐ |
| 8 | El Modelo 111 se presenta con los totales de IRPF de las nóminas | ☐ |
| 9 | Los recibos de nómina se entregan a los empleados | ☐ |
| 10 | Las tablas fiscales se revisan al inicio de cada ejercicio | ☐ |

### Beneficios para la asesoría

- **Cálculo automático sin errores manuales:** IRPF, SS, comisiones, beneficios, tramos
- **Trazabilidad total:** cada euro de la nómina tiene un origen rastreable
- **Inmutabilidad garantizada:** una nómina sellada no se puede alterar
- **Conciliación automática con contabilidad:** el asiento se genera al sellar
- **Modelos fiscales precargados:** 111 y 190 se alimentan de las nóminas selladas
- **Privacidad de datos:** salarios y datos bancarios cifrados en la Bóveda

---

*Documento elaborado para la asesoría contable. Versión junio 2026.*  
*Para cualquier duda adicional, contacte con el equipo de soporte de Volkern.*
