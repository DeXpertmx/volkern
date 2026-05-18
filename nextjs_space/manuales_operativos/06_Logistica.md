# 6. Logística

## 1. Nombre del hub
Hub de Logística e Inventarios.

## 2. Propósito operativo
Controlar y proteger la exactitud de los bienes físicos. Rastrea cada lote, caducidad, niveles de stock, movimientos (Entradas, Salidas, Traspasos) y coordina los envíos finales a clientes (Pick, Pack & Ship).

## 3. Quién lo usa
- Jefes de Almacén.
- Operarios de Montacargas/Bodega.
- Personal de Despachos y Envíos.

## 4. Qué ve el usuario al entrar por primera vez
- **Stock Dashboard:** Resumen de niveles críticos de inventario, valoraciones y alertas de reabastecimiento.
- Visor de Tareas Logísticas: Órdenes pendientes de recoger (Pick) y empacar (Pack).
- Gestor de Lotes y Movimientos: Historial detallado de Entradas y Salidas físicas.

## 5. Qué puede hacer
- Registrar movimientos manuales de inventario (Ajustes positivos o negativos).
- Gestionar `InventoryLot` (Lotes de Inventario) cambiando su estado (Ej: `AVAILABLE`, `QUARANTINE`, `REJECTED`).
- Ejecutar el proceso de Pick/Pack (recolección física en pasillos) para los `SalesOrder` confirmados.
- Aprobar la generación de números de rastreo (Tracking) y procesar salidas finales.

## 6. Qué no puede hacer
- **No puede alterar los precios de venta.**
- **No puede eliminar un movimiento de inventario.** Todos los `StockMovement` son inmutables. Si hay un error, debe crear un "Movimiento de Ajuste" para compensarlo.
- No puede modificar las listas de materiales (BoM) que usa Producción.

### 📦 Kardex Inmutable - Ledger Blockchain
Cada movimiento de inventario se registra con:
1. **Hash SHA-256** calculado a partir del movimiento anterior
2. **Encadenamiento** al movimiento previo (como una cadena)
3. **Timestamp** exacto del registro

Esto crea un **Kardex inviolable**. Si alguien intenta borrar o alterar un movimiento, la cadena de hashes se rompe y el sistema lo detecta.

**Tipos de Movimiento Protegidos:**
| Tipo | Acción |
|------|--------|
| **IN** | Entrada de mercancía |
| **OUT** | Salida (venta, consumo) |
| **ADJUSTMENT** | Ajuste (requiere supervisión) |
| **TRANSFER** | Entre almacenes |

## 7. Qué ayudas necesita el administrador de tenant
- Configuración de la estructura física: Mapeo de Almacenes (`Warehouse`), Pasillos y Estantes.
- Soporte para ejecutar auditorías cíclicas de inventario (Conteo físico vs Sistema).

## 8. Problemas o dudas frecuentes
- **"El vendedor prometió algo pero aquí no hay stock"**: Esto ocurre si los niveles físicos no concuerdan con el sistema. Se debe realizar un conteo cíclico y un "Ajuste de Inventario". El sistema debió haberlo enviado a Producción (CTP) si la información era correcta.
- **"No puedo mover este lote"**: Es posible que el lote se encuentre en estado de "Cuarentena" (`QUARANTINE`) pendiente de revisión de calidad.
- **"¿Puedo reconstruir el inventario en una fecha pasada?"**: Sí, sumando todos los movimientos desde el origen (el primer movimiento tiene hash '0'.repeat(64)).

## 9. Reglas de jerarquía y seguridad
- Solo ciertos roles pueden aprobar movimientos de merma o ajustes negativos elevados, previniendo robos silenciosos.
- El inventario físico disponible para Ventas es siempre el total de todos los lotes en estado `AVAILABLE` menos cualquier cantidad ya "Reservada" por Producción (`MaterialRequirement`).
- **Auditoría Automática:** El sistema puede verificar que ningún movimiento haya sido alterado reconstructendo la cadena.

## 10. Flujo normal de uso
1. El Hub de Ventas confirma un pedido y lo marca como `STOCK` (ATP).
2. La orden aparece en el monitor de Logística como "Pendiente de Recolección (Pick)".
3. El operario va al estante físico, escanea y recoge la mercancía, descontándola de un Lote Específico.
4. El paquete se empaca ("Pack") y se genera la etiqueta de envío.
5. Se efectúa la salida de inventario (`OUT`) y el estado del pedido cambia a "SHIPPED".

## 11. Indicadores operativos importantes
- Exactitud de Inventario (Físico vs Sistema).
- Nivel de Servicio Logístico (On-Time Delivery).
- Valor Inmovilizado en Cuarentena.

## 12. Escalamiento cuando algo falla
1. Identificar si el problema es "Físico" o "Virtual" cruzando `StockLevel` (Saldo Unificado) contra `StockMovement` (Kardex).
2. Si un pedido no se libera, validar que no tenga retenciones por fraude en el módulo de ventas.

---

### Resumen para soporte y administración
1. **La inmutabilidad es la regla:** Los errores no se borran, se compensan con nuevos movimientos de ajuste.
2. **Cuarentena Automática:** Los lotes recién creados o recibidos suelen caer en "Quarantine" hasta que Calidad los libere; esto evita despachos defectuosos.
3. **El concepto ATP:** El inventario que ve ventas no es el físico, es el Físico menos lo Reservado.
4. **Trazabilidad de Lotes:** Es obligatorio vincular movimientos a `batchNumbers` para lidiar con caducidades o "Recalls" (Retiros).
5. **Separación de funciones:** El almacenista no tasa ni pone precio; el almacenista cuenta cajas.
