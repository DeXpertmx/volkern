# 11. Hub de Proyectos

## 1. Nombre del hub
Gestión de Proyectos e Hitos (Projects Hub).

## 2. Propósito operativo
Planificar y ejecutar iniciativas a mediano o largo plazo que engloban múltiples órdenes de trabajo, compras o hitos facturables. Se utiliza cuando el producto no es un bien unitario de catálogo, sino una entrega compleja (Ej: "Implementación de Software" o "Construcción de Bodega").

## 3. Quién lo usa
- Project Managers (PMs).
- Directores de Operaciones.
- Equipos de despliegue o consultoría.

## 4. Qué ve el usuario al entrar por primera vez
- **Kanban de Proyectos:** Vista visual de proyectos (Planificación, En Curso, Detenido, Entregado).
- Gantt Chart: Línea de tiempo de hitos y dependencias.
- Presupuesto Consumido (Burn-rate): Comparativa entre el presupuesto planificado vs los costos reales absorbidos de las WorkOrders asociadas.

## 5. Qué puede hacer
- Crear un nuevo proyecto asociado a un cliente (`Contact`) y asignar un líder de proyecto.
- Dividir un proyecto en "Hitos" (Milestones).
- Ligar `WorkOrders` (Órdenes de Producción) y `SalesOrders` a un proyecto específico.
- Autorizar la facturación de un hito cuando se completa.

## 6. Qué no puede hacer
- **No puede alterar los costos de las WorkOrders vinculadas.** El costo del proyecto hereda el cálculo real desde Producción y Logística.
- No puede borrar un proyecto que ya ha recibido abonos (Pagos) financieros. Debe cancelarlo.

## 7. Qué ayudas necesita el administrador de tenant
- Soporte para configurar plantillas (Templates) de proyectos recurrentes.
- Entender cómo vincular Hitos a facturación parcial en el Hub de Finanzas.

## 8. Problemas o dudas frecuentes
- **"El costo del proyecto se disparó"**: Ocurre cuando Producción registra muchas mermas (`WasteReported`) en una WorkOrder vinculada. El PM debe justificar la desviación.
- **"No puedo facturar el hito"**: El Hito debe estar en estado `COMPLETED` y debe ser aprobado antes de que Finanzas pueda jalarlo como un ítem facturable.

## 9. Reglas de jerarquía y seguridad
- **Visibilidad:** Los miembros de equipo solo ven los proyectos donde están etiquetados como "Asignados".
- Los líderes de proyecto pueden modificar cronogramas pero no presupuestos base una vez aprobados.

## 10. Flujo normal de uso
1. Se firma un contrato (Contracts Hub) por una instalación grande.
2. El PM crea el `Project` y define los Hitos a 3, 6 y 9 meses.
3. El PM genera las órdenes de trabajo necesarias y las vincula al `projectId`.
4. El equipo ejecuta las tareas.
5. Al completar el primer hito, el PM lo marca como "Hecho" y esto detona un aviso a Finanzas para cobrar la primera parcialidad.

## 11. Indicadores operativos importantes
- Desviación de Cronograma (Schedule Variance).
- Desviación de Costo (Cost Variance).
- Tasa de utilización de recursos.

## 12. Escalamiento cuando algo falla
1. Si un hito completado no aparece en Finanzas para facturarse, revisar los "Triggers" de Integración Interna.
2. Validar que la factura final no exceda el "Presupuesto Tope" del cliente configurado en el CRM.

---

### Resumen para soporte y administración
1. **El Proyecto es un "Contenedor":** Agrupa elementos sueltos (Ventas, Contratos, WorkOrders) en un presupuesto unificado.
2. **Facturación por Hitos:** Si un cliente paga "por avance de obra", este es el único módulo capaz de orquestarlo sin generar inventario fantasma.
3. **El Costo Real Manda:** El margen del proyecto se recalcula en tiempo real según la eficiencia o ineficiencia del equipo de Producción.
4. **Dependencias Estrictas:** No se puede cerrar el proyecto si hay `WorkOrders` en estado `IN_PROGRESS`.
5. **No apto para retail:** Si la empresa vende tornillos en volumen, este hub no debe usarse; el Hub de Ventas es suficiente.
