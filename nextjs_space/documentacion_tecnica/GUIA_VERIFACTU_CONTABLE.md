# Guía de Veri\*Factu para la Asesoría Contable

## Sistema de Facturación Verificable — Agencia Tributaria Española

**Plataforma:** Volkern  
**Normativa:** Ley 11/2021 · Real Decreto 1007/2023 · Orden HAC/1177/2024  
**Versión del sistema:** 1.0.0  
**Modalidad:** «VERI\*FACTU» (envío automático a la AEAT)  
**Fecha de elaboración:** Junio 2026

---

## Índice

1. [¿Qué es Veri\*Factu?](#1-qué-es-verifactu)
2. [¿Por qué existe esta normativa?](#2-por-qué-existe-esta-normativa)
3. [¿A quién afecta?](#3-a-quién-afecta)
4. [¿Cómo funciona el sistema en Volkern?](#4-cómo-funciona-el-sistema-en-volkern)
5. [El encadenamiento de facturas: la clave de la inmutabilidad](#5-el-encadenamiento-de-facturas-la-clave-de-la-inmutabilidad)
6. [Flujo completo de una factura Veri\*Factu](#6-flujo-completo-de-una-factura-verifactu)
7. [Tipos de factura soportados](#7-tipos-de-factura-soportados)
8. [El código QR y la verificación por el cliente](#8-el-código-qr-y-la-verificación-por-el-cliente)
9. [Rectificaciones y anulaciones](#9-rectificaciones-y-anulaciones)
10. [Lo que el contable debe hacer en el día a día](#10-lo-que-el-contable-debe-hacer-en-el-día-a-día)
11. [Preguntas frecuentes](#11-preguntas-frecuentes)
12. [Calendario de obligatoriedad](#12-calendario-de-obligatoriedad)
13. [Diferencias con SII y TicketBAI](#13-diferencias-con-sii-y-ticketbai)
14. [Resumen práctico](#14-resumen-práctico)

---

## 1. ¿Qué es Veri\*Factu?

Veri\*Factu es el nuevo **sistema de facturación electrónica verificable** impuesto por la Agencia Tributaria Española (AEAT). No es un impuesto nuevo ni un modelo fiscal adicional, sino una **norma técnica que todo software de facturación debe cumplir** para garantizar que las facturas no pueden ser manipuladas, borradas ni ocultadas.

En otras palabras: Veri\*Factu convierte cada factura en un documento **inalterable, trazable y verificable** por Hacienda en tiempo real.

### Lo esencial en 30 segundos

| Concepto | Significado práctico |
|----------|---------------------|
| **Factura verificable** | Hacienda puede comprobar cada factura individualmente |
| **Encadenamiento** | Las facturas se enlazan entre sí; no se puede borrar una sin romper la cadena |
| **Envía automático** | Volkern envía cada factura a la AEAT al emitirla (modo «VERI\*FACTU») |
| **QR obligatorio** | Toda factura lleva un código QR para verificación por el cliente |
| **Software certificado** | El software debe tener una Declaración Responsable firmada ante la AEAT |

---

## 2. ¿Por qué existe esta normativa?

Hasta ahora, muchos programas de facturación permitían lo que se conoce como **"software de doble uso"**: programas que permitían emitir facturas legales, pero también modificarlas, borrarlas o no declararlas después. Esto se usaba para ocultar ventas y evadir el pago del IVA y del Impuesto de Sociedades.

La Ley 11/2021 de lucha contra el fraude fiscal establece que **todo software de facturación debe garantizar la integridad, conservación, accesibilidad, legibilidad, trazabilidad e inalterabilidad** de los registros de facturación.

Veri\*Factu es la respuesta técnica a esa ley.

---

## 3. ¿A quién afecta?

| Tipo de empresa | ¿Debe cumplir Veri\*Factu? |
|-----------------|---------------------------|
| Empresas (Impuesto de Sociedades) | ✅ Sí — desde enero 2026 |
| Autónomos | ✅ Sí — desde julio 2026 |
| Empresas ya en SII (grandes empresas) | Parcialmente: el software debe ser certificado, pero no duplican envíos |
| Empresas en País Vasco | ❌ No — están bajo TicketBAI (normativa foral equivalente) |

**En la práctica:** toda empresa o autónomo que use un software para emitir facturas debe asegurarse de que ese software cumple con Veri\*Factu.

---

## 4. ¿Cómo funciona el sistema en Volkern?

Volkern implementa Veri\*Factu en la **modalidad más completa** («VERI\*FACTU»), que consiste en:

1. **Generar la factura** con todos los campos obligatorios del reglamento
2. **Calcular una huella digital única** (hash SHA-256) que identifica la factura de forma irrepetible
3. **Encadenar la factura** con la factura anterior de la misma empresa, creando una cadena de integridad
4. **Firmar electrónicamente** la factura con el certificado digital de la empresa (firma XAdES, voluntaria pero implementada)
5. **Incluir un código QR** para verificación
6. **Enviar automáticamente** el registro de facturación a la AEAT
7. **Bloquear la factura** en la base de datos: no se puede modificar ni borrar

### Configuración inicial necesaria

Para que una empresa opere en modo Veri\*Factu, debe configurarse en Volkern:

- ☑ Activar el interruptor **"Veri\*Factu"** en la configuración del emisor fiscal
- ☑ Cargar el **certificado digital .p12** de la empresa (opcional pero recomendado para firma electrónica)
- ☑ Verificar que los **datos fiscales del emisor** (NIF, razón social, dirección) están completos

Una vez activado, **todas las facturas nuevas** se emitirán automáticamente bajo el estándar Veri\*Factu.

---

## 5. El encadenamiento de facturas: la clave de la inmutabilidad

El mecanismo central de Veri\*Factu es el **encadenamiento criptográfico**. Funciona así:

### Analogía sencilla

Imagina un tren de vagones donde cada vagón (factura) está soldado al anterior. Si alguien intenta quitar el vagón nº 15, el vagón nº 16 se descuelga automáticamente porque su enganche apuntaba al 15. Un inspector que revise el tren ve inmediatamente que falta un vagón y dónde estaba.

### Cómo funciona en la práctica

```
Factura nº 1  →  Huella: ABC123...
Factura nº 2  →  Huella: DEF456... (calculada usando ABC123 + datos propios)
Factura nº 3  →  Huella: GHI789... (calculada usando DEF456 + datos propios)
```

Para la primera factura de cada empresa, se usa una huella especial llamada **GENESIS_VERIFACTU_2026**, que marca el inicio de la cadena.

### ¿Qué pasa si alguien intenta borrar una factura?

- La factura **no puede borrarse físicamente** de Volkern (el sistema lo impide a nivel de base de datos)
- Si alguien con acceso directo a la base de datos intentara manipularla, el hash de la factura siguiente dejaría de coincidir
- Volkern ejecuta **auditorías forenses automáticas** que detectan inmediatamente cualquier rotura en la cadena
- Si se detecta una brecha, se activa el **Protocolo de Desconfianza** que bloquea la emisión de nuevas facturas hasta investigar

### Lo que el contable debe saber

- Ninguna factura se puede eliminar. Si hay un error, se debe **rectificar o anular mediante una factura rectificativa**, nunca borrando.
- La cadena de facturas es auditable en cualquier momento.
- Volkern mantiene un **libro registro de facturas** con todas las facturas emitidas, ordenadas cronológicamente y encadenadas.

---

## 6. Flujo completo de una factura Veri\*Factu

A continuación se muestra el recorrido completo de una factura desde que se crea hasta que queda registrada en la AEAT:

```
┌─────────────────────────────────────────────────────────────┐
│  1. El usuario crea la factura en Volkern                    │
│     • Datos del emisor (NIF, razón social)                  │
│     • Datos del cliente (NIF, nombre)                       │
│     • Líneas de factura (concepto, base, IVA)               │
│     • Importe total                                          │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Volkern calcula la huella digital (hash SHA-256)        │
│     • Toma el hash de la factura anterior                   │
│     • Lo combina con NIF emisor, NIF receptor, número,     │
│       fecha, importe y moneda                               │
│     • Genera un código único e irrepetible de 64 caracteres │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Se genera el código QR                                  │
│     • Incluido automáticamente en el PDF de la factura      │
│     • El cliente puede escanearlo para verificar            │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Firma electrónica XAdES (si hay certificado .p12)       │
│     • Firma avanzada conforme al estándar europeo           │
│     • Refuerza la autenticidad y no repudio                │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Envío automático a la AEAT (modo «VERI*FACTU»)          │
│     • El registro se envía por SOAP/XAdES                   │
│     • La AEAT responde con:                                 │
│       - Código de retorno (0 = OK)                          │
│       - CSV (Código Seguro de Verificación)                 │
│       - Fecha de registro                                   │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  6. La factura queda SELLADA                                │
│     • Estado: CONFIRMADA                                    │
│     • No se puede modificar ni borrar                       │
│     • Aparece en el libro registro de facturas              │
│     • El hash queda encadenado para la siguiente factura    │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Tipos de factura soportados

Volkern soporta todos los tipos de factura requeridos por la normativa:

| Código | Tipo | Cuándo se usa | Ejemplo |
|--------|------|---------------|---------|
| **F1** | Factura completa | Factura ordinaria con IVA desglosado | Venta de servicios de consultoría |
| **F2** | Factura simplificada | Ticket o factura simplificada (< 400€) | Venta al por menor |
| **R1** | Rectificativa por sustitución | Corrige completamente una factura errónea | Error en el NIF del cliente |
| **R2** | Rectificativa por diferencia | Ajusta el importe de una factura ya emitida | Descuento aplicado con posterioridad |
| **R3** | Rectificativa por descuento financiero | Ajuste por pronto pago o similar | Descuento del 2% por pago anticipado |
| **R4** | Rectificativa por bien de inversión | Autofactura o regularización de inversión | Regularización de IVA de un vehículo |

---

## 8. El código QR y la verificación por el cliente

Toda factura emitida en Volkern incluye automáticamente un **código QR** que permite:

- Al **cliente receptor** escanearlo y verificar que la factura es auténtica
- A la **AEAT** comprobar la trazabilidad de la factura en cualquier momento
- Al **contable** validar rápidamente que una factura está correctamente registrada

El QR aparece impreso en el PDF de la factura, normalmente en la esquina inferior derecha, con la leyenda "QR Veri\*Factu".

### ¿Qué información contiene el QR?

- NIF del emisor
- NIF del receptor
- Número de factura y serie
- Fecha de emisión
- Importe total
- Huella digital (hash) de la factura

---

## 9. Rectificaciones y anulaciones

### Principio fundamental

> **NUNCA se borra una factura. Si hay un error, se rectifica.**

Esta es quizás la diferencia operativa más importante para el contable acostumbrado a sistemas antiguos. En Veri\*Factu:

| Situación | Acción correcta | Acción INCORRECTA |
|-----------|----------------|-------------------|
| Error en el importe | Emitir **factura rectificativa R1 o R2** | Intentar borrar la factura ❌ |
| Error en el NIF del cliente | Emitir **factura rectificativa R1** | Editar la factura original ❌ |
| Factura duplicada | **Anular** la factura duplicada | Borrarla ❌ |
| Devolución del cliente | Emitir **factura rectificativa R2** por diferencia | Modificar la original ❌ |

### Cómo se hace en Volkern

1. Localizar la factura original en el libro registro
2. Usar la opción **"Rectificar"** o **"Anular"**
3. Volkern genera automáticamente una nueva factura con numeración `R-` (rectificativa) o `ANUL-` (anulación)
4. La nueva factura también queda encadenada y sellada
5. La factura original permanece inalterada en el libro registro, con su estado actualizado a "anulada"

### Ejemplo práctico

```
Factura original:  F2026-00042 — 1.210,00 € (Base: 1.000 € + IVA 21%: 210 €)
Error detectado:   El IVA debía ser del 10%, no 21%

Acción correcta:
→ Emitir R1-F2026-00042 (rectificativa por sustitución)
  Base: -1.000 € / IVA: -210 € / Total: -1.210 € (anula la original)
→ Emitir nueva factura F2026-00043
  Base: 1.000 € / IVA 10%: 100 € / Total: 1.100 €

Resultado en libros:
- La factura original F2026-00042 sigue existiendo pero consta como rectificada
- La cadena de hashes permanece íntegra
- La AEAT recibe tanto la original como la rectificativa
```

---

## 10. Lo que el contable debe hacer en el día a día

### Configuración inicial (una sola vez)

| Tarea | Frecuencia |
|-------|-----------|
| Verificar que el emisor fiscal tiene el interruptor «Veri\*Factu» activado | Una vez |
| Cargar el certificado digital .p12 de la empresa | Una vez |
| Revisar que los datos fiscales del emisor son correctos (NIF, razón social, dirección) | Una vez |

### Operativa diaria

| Tarea | Frecuencia |
|-------|-----------|
| Emitir facturas normalmente desde Volkern (el sistema las sella y envía automáticamente) | Según necesidad |
| Si un cliente pide verificación, indicarle que escanee el QR de la factura | Según necesidad |
| Si se detecta un error en una factura ya emitida, usar «Rectificar» (nunca intentar borrar) | Según necesidad |

### Operativa mensual / trimestral

| Tarea | Frecuencia |
|-------|-----------|
| Revisar el libro registro de facturas: todo debe estar en estado CONFIRMADA | Mensual |
| Verificar que no hay facturas en estado PENDING o ERROR | Mensual |
| Si hay facturas con error de envío a la AEAT, revisar la configuración del certificado | Según incidencia |
| Para la presentación del **Modelo 303** (IVA), los datos ya están calculados automáticamente | Trimestral |
| Para la presentación del **Modelo 347** (operaciones con terceros), los datos se extraen del libro registro | Anual (febrero) |

### Operativa ante una inspección de Hacienda

| Tarea |
|-------|
| Volkern mantiene el libro registro de facturas con todas las facturas encadenadas |
| Se puede exportar el libro completo con los CSV (Códigos Seguros de Verificación) de la AEAT |
| La cadena de hashes demuestra que ninguna factura ha sido alterada ni borrada |
| Volkern proporciona un **informe de integridad** (auditoría forense) que certifica que la cadena está intacta |

---

## 11. Preguntas frecuentes

### ¿Puedo seguir usando mi antiguo programa de facturación?

No, salvo que el fabricante haya certificado que cumple con Veri\*Factu y haya presentado su Declaración Responsable ante la AEAT. Si el programa no está certificado, las facturas emitidas con él no serán válidas.

### ¿Qué pasa si no tengo certificado digital?

Volkern puede emitir facturas en modo Veri\*Factu sin certificado digital. Las facturas igualmente se encadenan, se genera el QR y se registran. El certificado digital (`.p12`) añade la **firma electrónica avanzada XAdES**, que es voluntaria pero muy recomendable porque refuerza la autenticidad legal de la factura.

### ¿Las facturas enviadas a la AEAT se comparten con otros organismos?

No. El envío es exclusivamente a la AEAT y solo con fines de verificación fiscal. Los datos están protegidos y solo son accesibles por la Agencia Tributaria en el marco de sus competencias.

### ¿Qué diferencia hay entre una factura Veri\*Factu y una factura electrónica normal?

Una factura electrónica "normal" puede ser un PDF enviado por email. Una factura Veri\*Factu incluye adicionalmente:

- Huella digital SHA-256 encadenada
- Código QR verificable
- Registro enviado a la AEAT
- Inalterabilidad garantizada

### ¿Volkern envía también las facturas recibidas?

Sí. Volkern permite registrar facturas de proveedores y también las encadena y sella. Las facturas recibidas también pueden enviarse a la AEAT si la empresa está acogida al SII.

### ¿Qué ocurre si me hackean y borran facturas?

Volkern implementa **Billing Lock**, un bloqueo a nivel de base de datos que impide físicamente borrar facturas selladas. Incluso si alguien obtuviera acceso administrativo a la base de datos, no podría eliminar una factura sin romper la cadena, lo cual sería inmediatamente detectable.

---

## 12. Calendario de obligatoriedad

| Fecha | Hito |
|-------|------|
| **Julio 2025** | Los fabricantes de software deben cumplir con la normativa para nuevo software |
| **1 de enero de 2026** | Obligatorio para empresas sujetas al Impuesto de Sociedades |
| **Julio 2026** | Obligatorio para autónomos y resto de obligados tributarios |

> **Nota:** Las fechas exactas pueden estar sujetas a ajustes por reales decretos publicados en el BOE. Consulte siempre la normativa más reciente.

---

## 13. Diferencias con SII y TicketBAI

Es frecuente confundir estos tres sistemas. Aquí tiene una comparativa clara:

| Característica | Veri\*Factu | SII | TicketBAI |
|---------------|-------------|-----|-----------|
| **¿Qué es?** | Sistema de facturación verificable (control del software) | Suministro Inmediato de Información (envío de libros de IVA) | Sistema antifraude del País Vasco |
| **¿Quién debe usarlo?** | Casi todas las empresas y autónomos | Grandes empresas, grupos de IVA, REDEME | Empresas en Vizcaya, Guipúzcoa, Álava |
| **¿Qué se envía?** | Registro individual de cada factura al emitirla | Libros de IVA emitido y soportado | Registro de cada factura |
| **Plazo de envío** | Inmediato (modo «VERI\*FACTU») o bajo requerimiento | 4 días hábiles | Inmediato o 24 horas |
| **¿Sustituye al 303/390?** | No — el 303/390 se siguen presentando | No — el SII complementa pero no sustituye | No |
| **Relación con Volkern** | ✅ Implementado | En roadmap | No aplica (salvo empresas vascas) |

### ¿Qué pasa si mi empresa está en SII y también debe cumplir Veri\*Factu?

Si su empresa ya está en SII (grandes empresas, grupos de IVA), no necesita duplicar el envío de facturas por el canal «VERI\*FACTU». Sin embargo, el software debe estar igualmente **certificado** como conforme. Volkern cumple ambos requisitos.

---

## 14. Resumen práctico

### Para la asesoría contable: lista de verificación

| # | Punto a verificar | Estado |
|---|-------------------|--------|
| 1 | El software de facturación del cliente (Volkern) tiene Declaración Responsable presentada | ☐ |
| 2 | El emisor fiscal está configurado con sus datos correctos (NIF, razón social) | ☐ |
| 3 | El interruptor «Veri\*Factu» está activado para ese emisor | ☐ |
| 4 | Si se desea, el certificado digital .p12 está cargado | ☐ |
| 5 | Las facturas emitidas aparecen en el libro registro con estado CONFIRMADA | ☐ |
| 6 | El personal que emite facturas sabe que NO se borran: se rectifican o anulan | ☐ |
| 7 | Los modelos fiscales (303, 347, 390) se revisan antes de presentar, usando los datos del libro registro | ☐ |

### Beneficios para la asesoría

- **Tranquilidad total:** las facturas no pueden ser manipuladas por el cliente
- **Auditoría simplificada:** la cadena de hashes demuestra la integridad de todas las facturas
- **Conciliación fiscal automática:** los datos del libro registro alimentan directamente los modelos 303, 347 y 390
- **Respuesta inmediata ante inspecciones:** informe de integridad forense disponible en cualquier momento
- **Sin riesgo de sanciones:** Volkern asume la responsabilidad como productor del SIF mediante su Declaración Responsable

---

## Anexo: Datos de la Declaración Responsable de Volkern

| Campo | Valor |
|-------|-------|
| **Razón Social** | Dimension Expert LLC |
| **Nombre Comercial** | Volkern |
| **Tax ID / EIN** | 35-2823149 |
| **Código SIF** | VOLKERN-SIF-2026-001 |
| **Versión del sistema** | 1.0.0 |
| **Fecha de declaración** | 14 de mayo de 2026 |
| **Representante legal** | Bruno Konstantin Hess Gómez Tagle |
| **NIE Representante** | Z4090988Y |
| **Normativa aplicable** | Ley 58/2003 · RD 1007/2023 · Orden HAC/1177/2024 |
| **Página pública** | https://volkern.com/verifactu |

---

*Documento elaborado para la asesoría contable. Versión junio 2026.*  
*Para cualquier duda adicional, consulte la página pública de Veri\*Factu de Volkern o contacte con el equipo de soporte.*
