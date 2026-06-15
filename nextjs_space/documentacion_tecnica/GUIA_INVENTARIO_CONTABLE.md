# Guía del Módulo de Inventario y Almacén para la Asesoría Contable

## Gestión de Catálogo, Stock, Movimientos y Control de Existencias

**Plataforma:** Volkern  
**Módulo:** Inventario y Almacén  
**Fecha:** Junio 2026

---

## Índice

1. [¿Qué hace el módulo de Inventario?](#1-qué-hace-el-módulo-de-inventario)
2. [El Catálogo de productos](#2-el-catálogo-de-productos)
3. [Los Almacenes](#3-los-almacenes)
4. [Cómo se gestiona el stock](#4-cómo-se-gestiona-el-stock)
5. [Tipos de movimientos de inventario](#5-tipos-de-movimientos-de-inventario)
6. [El Kardex: trazabilidad total de cada movimiento](#6-el-kardex-trazabilidad-total-de-cada-movimiento)
7. [Productos fabricados y listas de materiales](#7-productos-fabricados-y-listas-de-materiales)
8. [Lotes y control de calidad](#8-lotes-y-control-de-calidad)
9. [Puntos de reorden y alertas automáticas](#9-puntos-de-reorden-y-alertas-automáticas)
10. [El asiento contable de las operaciones de inventario](#10-el-asiento-contable-de-las-operaciones-de-inventario)
11. [Valoración de existencias](#11-valoración-de-existencias)
12. [Lo que el contable debe hacer en el día a día](#12-lo-que-el-contable-debe-hacer-en-el-día-a-día)
13. [Preguntas frecuentes](#13-preguntas-frecuentes)
14. [Resumen práctico](#14-resumen-práctico)

---

## 1. ¿Qué hace el módulo de Inventario?

El módulo de Inventario y Almacén de Volkern gestiona todo el ciclo de vida de los productos y las existencias de la empresa:

| Función | Qué significa |
|---------|---------------|
| **Catálogo de productos** | Registrar todo lo que la empresa compra, vende o fabrica |
| **Múltiples almacenes** | Gestionar stock en distintas ubicaciones físicas |
| **Control de stock** | Saber exactamente cuántas unidades hay de cada producto y dónde |
| **Kardex inmutable** | Registro cronológico de cada entrada y salida, sin posibilidad de alteración |
| **Productos fabricados** | Si la empresa fabrica, consumir automáticamente materias primas al producir |
| **Lotes** | Trazabilidad por lote con control de calidad (cuarentena, aprobado, rechazado) |
| **Alertas de stock bajo** | Avisos automáticos cuando un producto está por debajo del mínimo |
| **Asientos contables** | Generación automática de asientos de compras, ventas y variación de existencias |

---

## 2. El Catálogo de productos

El catálogo es la base de datos de todo lo que maneja la empresa. Cada producto o servicio se registra con:

### Datos básicos

| Campo | Ejemplo | Notas |
|-------|---------|-------|
| **Nombre** | "Silla de Oficina Ergonómica" | Obligatorio |
| **SKU** | CHAIR-ERG-001 | Código único opcional pero recomendado |
| **Tipo** | Producto, Servicio, Digital, Curso | Solo "Producto" tiene stock |
| **Precio base** | 180,00 € | Precio de venta sin IVA |
| **Categoría fiscal** | General (21%), Reducido (10%), Superreducido (4%) | Determina el IVA en facturas |
| **Unidad** | Unidad, kg, m², litros... | Unidad de medida |
| **Coste de adquisición** | 95,00 € | Para calcular márgenes y valorar existencias |

### Tipos de ítem

| Tipo | ¿Tiene stock? | Ejemplo |
|------|:-----------:|---------|
| **Producto** | ✅ | Silla, ordenador, materia prima |
| **Servicio** | ❌ | Consultoría, diseño, instalación |
| **Digital** | ❌ | Ebook, licencia de software |
| **Curso** | ❌ | Formación presencial u online |

### Campos personalizados

Cada empresa puede añadir los campos que necesite: color, talla, material, marca, proveedor habitual, etc. Estos campos aparecen luego en las fichas de producto y son buscables.

---

## 3. Los Almacenes

Volkern permite gestionar múltiples almacenes. Si no se configura ninguno, el sistema crea automáticamente un **"Almacén Central"**.

### Ejemplo de configuración multi-almacén

| Almacén | Ubicación | Uso |
|---------|-----------|-----|
| Almacén Central | Nave principal | Stock general |
| Tienda Física | Calle Mayor, 12 | Productos en exposición |
| Depósito Externo | Polígono Industrial | Mercancía en tránsito |

Cada producto puede tener stock en uno o varios almacenes simultáneamente, y el sistema sabe exactamente cuánto hay en cada uno.

---

## 4. Cómo se gestiona el stock

### El nivel de stock (StockLevel)

Por cada combinación de **producto + almacén + lote**, Volkern mantiene un registro:

| Campo | Ejemplo |
|-------|---------|
| **Producto** | Silla Ergonómica (SKU: CHAIR-ERG-001) |
| **Almacén** | Almacén Central |
| **Cantidad actual** | 47 unidades |
| **Stock mínimo** | 10 unidades |
| **Stock máximo** | 200 unidades |
| **Lote** | L-2026-003 (opcional) |
| **Última actualización** | 15/06/2026 14:30 |

### Disponibilidad real

El sistema calcula automáticamente tres cifras:

```
Stock físico:      47 unidades  (lo que realmente hay en el almacén)
Stock reservado:    5 unidades  (pedidos pendientes de servir)
────────────────────────────────────────────────────────────
Stock disponible:  42 unidades  (lo que realmente se puede usar/vender)
```

Las reservas provienen de pedidos de clientes que ya han sido confirmados pero aún no se ha servido la mercancía, o de órdenes de producción que requieren esos materiales.

---

## 5. Tipos de movimientos de inventario

Cada cambio en el stock queda registrado con su tipo:

| Tipo | Cuándo ocurre | Efecto en stock |
|------|---------------|:--------------:|
| **Entrada (IN)** | Compra a proveedor, devolución de cliente | + |
| **Salida (OUT)** | Venta a cliente, envío | − |
| **Ajuste (ADJUSTMENT)** | Recuento físico, corrección manual | ± |
| **Transferencia (TRANSFER)** | Mover mercancía entre almacenes | − origen / + destino |
| **Consumo (CONSUMPTION)** | Usar materia prima en producción | − |
| **Producción (PRODUCTION_OUTPUT)** | Fabricar un producto terminado | + |

### Ejemplo práctico

```
Fecha       Tipo       Producto            Cantidad  Almacén        Motivo
15/06/2026  IN         Silla Ergonómica    +50       Almacén Cent.  Compra prov. Muebles SA
17/06/2026  OUT        Silla Ergonómica     −2       Almacén Cent.  Venta a Cliente ABC
18/06/2026  TRANSFER   Silla Ergonómica     −5       Almacén Cent.  Traslado a Tienda
18/06/2026  TRANSFER   Silla Ergonómica     +5       Tienda Física  Recepción traslado
20/06/2026  ADJUSTMENT Silla Ergonómica     −1       Almacén Cent.  Recuento: merma detectada
```

---

## 6. El Kardex: trazabilidad total de cada movimiento

Volkern implementa un **Kardex inmutable**: cada movimiento de inventario queda encadenado criptográficamente con el movimiento anterior mediante una huella digital (hash SHA-256), igual que las facturas Veri\*Factu.

### ¿Qué es el Kardex?

El Kardex es el **libro registro de almacén** que muestra, para cada producto, todas las entradas y salidas en orden cronológico, con el saldo resultante después de cada movimiento.

### ¿Por qué es inmutable?

Cada movimiento incluye una huella digital que depende del movimiento anterior. Si alguien intentara borrar o modificar un movimiento antiguo, la cadena se rompería y sería inmediatamente detectable.

```
Movimiento #1 → Hash #1
Movimiento #2 → Hash(Hash #1 + datos mov #2)
Movimiento #3 → Hash(Hash #2 + datos mov #3)
```

Esto cumple con el mismo estándar de integridad que Veri\*Factu para las facturas.

### Lo que el contable puede consultar

En cualquier momento se puede ver el historial completo de movimientos de un producto, filtrado por:

- **Producto específico**: todo el historial de ese SKU
- **Almacén**: qué ha entrado y salido de una ubicación
- **Tipo de movimiento**: solo entradas, solo salidas, solo ajustes
- **Rango de fechas**: cierre mensual, trimestral, anual

---

## 7. Productos fabricados y listas de materiales

Si la empresa fabrica productos, Volkern gestiona las **listas de materiales (BoM - Bill of Materials)**.

### ¿Qué es una lista de materiales?

Es la receta de fabricación: qué componentes y en qué cantidad se necesitan para producir una unidad del producto final.

```
Producto final: "Mesa de Oficina Modelo X"
Componentes:
  ├── Tablero de roble          × 1
  ├── Pata metálica cromada     × 4
  └── Tornillo allen M6         × 8
  ─────────────────────────────────
  Coste materiales:           47,50 €
  Coste mano de obra:         22,00 €
  Costes indirectos:           5,50 €
  ─────────────────────────────────
  Coste total fabricación:    75,00 €
```

### ¿Qué pasa cuando se consume?

Si se registra la producción de **3 mesas**, el sistema automáticamente:

1. **Descuenta** del stock: 3 tableros, 12 patas, 24 tornillos
2. **Registra** la salida de cada componente en el Kardex
3. **Añade** al stock: 3 mesas terminadas (tipo `PRODUCTION_OUTPUT`)

Todo esto ocurre en una **única operación atómica**: o se hace todo o no se hace nada, garantizando que el inventario nunca quede inconsistente.

---

## 8. Lotes y control de calidad

Para productos que requieren trazabilidad por lote (alimentación, farmacia, químicos...), Volkern permite asignar lotes:

### Estados de lote

| Estado | Significado | ¿Se puede usar? |
|--------|-------------|:---------------:|
| **DISPONIBLE** | Lote aprobado y listo para usar | ✅ |
| **CUARENTENA** | Lote pendiente de control de calidad | ❌ |
| **RECHAZADO** | Lote que no pasó el control | ❌ |

### Trazabilidad

Cada lote registra:

- **Código único** (ej: L-2026-003)
- **Fecha de recepción**
- **Fecha de caducidad** (si aplica)
- **Estado actual**
- **Proveedor origen**
- **Producto asociado**

El stock disponible solo cuenta los lotes en estado `DISPONIBLE`. Los lotes en cuarentena o rechazados no se consideran disponibles para venta o consumo.

---

## 9. Puntos de reorden y alertas automáticas

### Configuración por producto

Cada producto puede tener definidos:

| Parámetro | Significado | Ejemplo |
|-----------|-------------|---------|
| **Stock mínimo** | Nivel por debajo del cual salta la alerta | 10 unidades |
| **Punto de reorden** | Nivel que dispara la sugerencia de compra | 15 unidades |

### Cómo funciona el sistema de alertas

1. Cada vez que se registra un consumo o salida, el sistema verifica si el stock ha bajado del punto de reorden
2. Si es así, envía una **alerta automática** al administrador por:
   - **Notificación dentro de la aplicación**
   - **Telegram** (con botones para autorizar o rechazar la compra directamente)
   - **Email**
3. El administrador puede autorizar la reposición con un solo clic desde Telegram

### Ejemplo de alerta

```
⚠️ ALERTA DE STOCK: Silla Ergonómica

El stock ha bajado a 8 unidades en Almacén Central.
El punto de reorden configurado es de 15 unidades.

[✅ Autorizar Compra]  [❌ Rechazar]
```

---

## 10. El asiento contable de las operaciones de inventario

### Compra de mercancía (entrada)

Cuando entra mercancía de un proveedor, Volkern genera automáticamente:

```
                                                 DEBE         HABER
──────────────────────────────────────────────────────────────────────
600  Compras de mercaderías                     1.000,00
472  H.P. IVA soportado (21%)                    210,00
     ────────────────────────────────────────────────────────────────
     400  Proveedores                                         1.210,00
     ────────────────────────────────────────────────────────────────
     TOTAL                                      1.210,00      1.210,00
```

### Venta de mercancía (salida)

Cuando se vende un producto, Volkern genera:

```
                                                 DEBE         HABER
──────────────────────────────────────────────────────────────────────
430  Clientes                                   1.815,00
     ────────────────────────────────────────────────────────────────
     700  Ventas de mercaderías                                1.500,00
     477  H.P. IVA repercutido (21%)                             315,00
     ────────────────────────────────────────────────────────────────
     TOTAL                                      1.815,00      1.815,00
```

### Ajuste de inventario (recuento físico)

```
                                                 DEBE         HABER
──────────────────────────────────────────────────────────────────────
610  Variación de existencias                     50,00
     ────────────────────────────────────────────────────────────────
     300  Mercaderías                                             50,00
     ────────────────────────────────────────────────────────────────
     TOTAL                                         50,00         50,00
```

### Cierre del ejercicio (regularización)

Al cierre del ejercicio, las existencias finales se regularizan contra la cuenta de variación de existencias (610/300), calculando automáticamente el **coste de ventas**.

---

## 11. Valoración de existencias

Volkern soporta el método de **coste medio ponderado (PMP)**, que es el más usado en España:

### Cómo funciona

```
Stock inicial:       20 unidades × 80 € c/u =  1.600 €
Compra 1:            30 unidades × 90 € c/u =  2.700 €
                    ─────────────────────────────────
Total:               50 unidades             =  4.300 €
Coste medio:         4.300 / 50             =   86,00 €/unidad

Venta de 10 unidades:
  Coste de ventas:   10 × 86,00 € = 860,00 €
  Stock restante:    40 unidades valoradas a 86,00 € = 3.440,00 €
```

El cálculo se actualiza automáticamente con cada entrada de mercancía.

---

## 12. Lo que el contable debe hacer en el día a día

### Configuración inicial

| Tarea | Frecuencia |
|-------|-----------|
| Dar de alta todos los productos en el catálogo con su SKU, precio y categoría fiscal | Una vez |
| Configurar almacenes si hay múltiples ubicaciones | Una vez |
| Establecer stock mínimo y punto de reorden para cada producto | Una vez |
| Configurar listas de materiales para productos fabricados | Una vez |
| Si se usan lotes, definir la nomenclatura y los criterios de control de calidad | Una vez |

### Operativa diaria / semanal

| Tarea | Frecuencia |
|-------|-----------|
| Registrar entradas de mercancía (compras a proveedores) | Según llegada |
| Revisar alertas de stock bajo y autorizar reposiciones | Según alertas |
| Registrar salidas por ventas (automático si se usan los módulos de ventas) | Automático |
| Revisar transferencias entre almacenes si las hay | Según necesidad |

### Operativa mensual

| Tarea | Frecuencia |
|-------|-----------|
| Revisar el Kardex de los productos principales: ¿cuadran entradas y salidas? | Mensual |
| Verificar que no hay movimientos con stock negativo (posible error) | Mensual |
| Revisar las alertas de stock bajo del mes: ¿se atendieron todas? | Mensual |
| Conciliar las compras del mes con los extractos de proveedores | Mensual |

### Operativa de cierre de ejercicio

| Tarea | Frecuencia |
|-------|-----------|
| Realizar recuento físico y registrar ajustes (mermas, roturas, obsolescencia) | Anual |
| Verificar que el stock en Volkern coincide con el recuento físico | Anual |
| Revisar la valoración de existencias finales (coste medio ponderado) | Anual |
| Generar el asiento de regularización de existencias (610/300) | Anual |

---

## 13. Preguntas frecuentes

### ¿Puedo tener el mismo producto en dos almacenes?

Sí. Volkern mantiene el stock por separado para cada combinación de producto + almacén. Una transferencia entre almacenes descuenta del origen y suma al destino automáticamente.

### ¿Qué pasa si vendo más unidades de las que tengo?

El sistema permite registrar la salida, pero el stock quedará en negativo. Esto genera una **alerta visual** y el contable debe investigar: ¿se olvidó registrar una entrada? ¿hubo un error en el recuento?

### ¿Cómo sé cuánto vale mi inventario?

En cualquier momento puedes consultar el valor total del inventario: `cantidad × coste medio unitario` de cada producto. Esto es especialmente útil para el cierre contable y para el seguro de la empresa.

### ¿Se pueden hacer recuentos parciales?

Sí. Puedes filtrar por almacén, por familia de productos o por proveedor, hacer el recuento físico y registrar un ajuste por la diferencia. El ajuste queda registrado en el Kardex con el motivo que especifiques.

### ¿Los movimientos de inventario se pueden borrar?

No. Al igual que las facturas Veri\*Factu, los movimientos del Kardex están encadenados y no se pueden borrar. Si hay un error, se registra un **ajuste** con el motivo correspondiente.

### ¿Funciona con productos que se venden por peso o medida?

Sí. La unidad de medida es configurable (kg, litros, metros, m²...). El stock se gestiona con decimales para permitir cantidades fraccionarias.

---

## 14. Resumen práctico

### Checklist para la asesoría contable

| # | Punto a verificar | Estado |
|---|-------------------|--------|
| 1 | Todos los productos están en el catálogo con su SKU y categoría fiscal correcta | ☐ |
| 2 | Los almacenes están configurados si hay más de una ubicación | ☐ |
| 3 | Los stocks mínimos y puntos de reorden están definidos para productos críticos | ☐ |
| 4 | Las listas de materiales (BoM) están correctas para productos fabricados | ☐ |
| 5 | Las entradas de mercancía del mes coinciden con las facturas de proveedores | ☐ |
| 6 | Las salidas del mes coinciden con las ventas facturadas | ☐ |
| 7 | No hay productos con stock negativo sin explicación | ☐ |
| 8 | Los ajustes por recuento físico están documentados con su motivo | ☐ |
| 9 | La valoración de existencias al cierre es correcta (coste medio ponderado) | ☐ |
| 10 | El asiento de regularización de existencias (610/300) se ha generado al cierre | ☐ |

### Beneficios para la asesoría

- **Kardex inmutable y trazable**: cada movimiento tiene huella digital y no se puede alterar
- **Valoración automática**: coste medio ponderado calculado en tiempo real
- **Alertas proactivas**: nunca más un "me quedé sin stock y no me enteré"
- **Asientos contables automáticos**: compras, ventas y regularización de existencias
- **Conciliación simplificada**: el Kardex cuadra con proveedores y clientes
- **Cumplimiento normativo**: mismo estándar de integridad que Veri\*Factu

---

*Documento elaborado para la asesoría contable. Versión junio 2026.*  
*Para cualquier duda adicional, contacte con el equipo de soporte de Volkern.*
