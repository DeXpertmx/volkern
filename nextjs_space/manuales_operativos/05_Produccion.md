# 5. Producción

## 1. Nombre del hub
Hub Industrial y de Producción.

## 2. Propósito operativo
Ejecutar, monitorizar y trazar la manufactura o transformación física de recursos. Es el receptor principal de las órdenes automatizadas por el orquestador (CTP) y gestiona el consumo de materia prima basándose en Listas de Materiales (BoM).

## 3. Quién lo usa
- Gerentes de Planta (Planificadores).
- Operadores de Línea / Manufactura.
- Supervisores de Calidad.

## 4. Qué ve el usuario al entrar por primera vez
- **Dashboard de Producción (Kanban):** Órdenes de Trabajo (`WorkOrders`) distribuidas en columnas: Planificadas, En Curso, Detenidas (por falta de material), y Completadas.
- Alertas de "Bloqueo Operativo" (por ej: un operario sin "Skill-Guard" intentando iniciar una máquina).
- Eficiencia de línea y reportes de desperdicio.

## 5. Qué puede hacer
- Iniciar, pausar y finalizar `WorkOrders`.
- Registrar mermas (desperdicios) y consumo de lotes específicos de materia prima.
- Aprobar controles de calidad obligatorios.
- Configurar y consultar las `BillOfMaterials` (Recetas/BoM).

## 6. Qué no puede hacer
- **No puede alterar los Pedidos de Venta (`SalesOrders`).**
- **No puede operar maquinaria/WorkOrders si su certificación técnica (Academia) ha caducado.**
- No puede completar una WorkOrder si el inventario de materia prima física (`InventoryLot`) es insuficiente en el almacén de producción, a menos que un supervisor autorice una varianza.

## 7. Qué ayudas necesita el administrador de tenant
- Soporte para crear estructuras de Árboles BoM (Bill of Materials) complejas.
- Entendimiento de cómo el "Orquestador de Ventas" arroja las WorkOrders aquí mágicamente cuando no hay stock de un producto terminado.

## 8. Problemas o dudas frecuentes
- **"El sistema no me deja iniciar la WorkOrder"**: El operario no ha pasado el curso requerido en el módulo de Academia (Skill-Guard activo).
- **"Falta material en el sistema pero sí lo tengo en físico"**: Descuadre de inventario. La WorkOrder exigirá que Logística haga un traspaso (`StockMovement`) a la línea de producción antes de dejarte consumir.
- **"¿Por qué apareció esta orden sola?"**: Fue creada de forma autónoma (CTP) por el Hub de Ventas para cumplir una orden urgente de un cliente. Revisa los metadatos `sourceOrderId`.

## 9. Reglas de jerarquía y seguridad
- **Skill-Guard:** El acceso a ejecución de órdenes está filtrado por habilidades acreditadas.
- **Trazabilidad:** Cada WorkOrder guarda un registro estricto de QUÉ lote de materia prima se usó, para auditoría y retiros del mercado (Recalls).
- Los Operarios registran avances; los Gerentes reprograman tiempos.

## 10. Flujo normal de uso
1. La orden llega (planificada por el Gerente o generada autónomamente por CTP de Ventas).
2. El Operador la abre, el sistema verifica su "Skill" y autoriza el inicio.
3. El Operador consume los materiales, el sistema descuenta del inventario en tiempo real.
4. Finaliza el proceso, reporta mermas, pasa el control de calidad.
5. El sistema da ingreso ("Stock IN") al producto terminado al almacén, notificando a Ventas/Logística que ya pueden enviar el pedido.

## 11. Indicadores operativos importantes
- OEE (Efectividad General del Equipo).
- Tiempo de ciclo productivo.
- Índice de Mermas (Waste %).
- Cuellos de botella por falta de material (Material Shortage).

## 12. Escalamiento cuando algo falla
1. Revisar los "Logs de Producción" (`productionLogs`) adheridos a la orden.
2. Si el consumo de inventario falla, validar si el Lote (`InventoryLot`) se encuentra en estado `QUARANTINE` o no tiene saldo en `StockLevel`.
3. Consultar las configuraciones del BoM (`billOfMaterials`) por errores en las fórmulas.

---

### Resumen para soporte y administración
1. **La Producción es Ciega, Ventas ve todo:** Producción ejecuta lo que entra; los metadatos de las WorkOrders (`sourceOrderId`) son cruciales para trazar para quién es el producto.
2. **Interdependencia total:** Producción no existe en el vacío; depende del módulo de Inventarios (Materia Prima) y de Academia (Skill-Guard).
3. **El BoM es la biblia:** Los errores de consumo siempre apuntan a una Lista de Materiales mal configurada (Ej: usar kilos en vez de gramos).
4. **Desbloqueos Manuales:** Un Administrador puede sobreescribir un bloqueo de Skill-Guard bajo su propio riesgo en casos de emergencia, dejando huella en la auditoría.
5. **Autosuficiencia IA:** El orquestador programa las órdenes calculando las fechas mediante el `leadTimeDays` de la BoM; es vital mantener ese número actualizado.
