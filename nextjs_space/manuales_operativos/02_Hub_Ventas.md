# 2. Hub de Ventas

## 1. Nombre del hub
Hub de Ventas y Orquestación.

## 2. Propósito operativo
Gestionar el ciclo de vida comercial completo (desde Cotización hasta Pedido Confirmado), garantizando que las ventas prometidas sean rentables (Margin Guard) y operativamente viables mediante el análisis de cumplimiento de inventario y producción (ATP/CTP).

## 3. Quién lo usa
- Ejecutivos de Venta (Vendedores).
- Supervisores Comerciales.
- Planificadores Operativos (para revisar Orquestación).

## 4. Qué ve el usuario al entrar por primera vez
- Un **Dashboard Comercial** mostrando las cotizaciones pendientes, los pedidos en tránsito y métricas de ventas.
- El panel **Orchestration Monitor**, que muestra en tiempo real cómo se cumplirán los pedidos recientes (Stock físico vs Necesidad de Producción).
- Panel lateral con acceso rápido a clientes (Contactos), Leads/Deals, Cotizaciones y Pedidos (`SalesOrder`).

## 5. Qué puede hacer
- Crear, editar y enviar cotizaciones a clientes.
- Transformar cotizaciones en Pedidos de Venta (`SalesOrder`).
- Consultar los márgenes de ganancia estimados antes de vender.
- Confirmar pedidos, lo cual dispara la validación automática del "Margin Guard" y la "Orquestación".
- Recibir asistencia del "Gemma Deal Coach" (Asistente IA) para consejos de negociación.

## 6. Qué no puede hacer
- **No puede confirmar pedidos que violen la política de margen (< 5% margen bruto)**. El Margin Guard lo bloqueará y lanzará una alerta de rentabilidad.
- **No puede forzar fechas de entrega mágicas**. El sistema calcula (ATP/CTP) la fecha realista basándose en inventario o tiempos de manufactura (BoM Lead Time) y la ajusta automáticamente.

## 7. Qué ayudas necesita el administrador de tenant
- Comprensión clara de cómo configurar los márgenes mínimos permitidos (Políticas del Margin Guard).
- Ayuda para explicar a los vendedores por qué el sistema postergó una fecha de entrega (por falta de Stock y desvío a Producción).

## 8. Problemas o dudas frecuentes
- **"El sistema no me deja confirmar el pedido"**: Error `POLÍTICA DE MARGEN inaceptable`. La solución es subir el precio de venta o reducir el costo.
- **"El ítem cambió mágicamente a 'PRODUCTION'"**: Es el comportamiento esperado si el Stock disponible (`Available To Promise`) es menor a la cantidad solicitada. El orquestador generará una `WorkOrder`.
- **"La IA Gemma no responde"**: Puede requerir validación de conectividad del API Key o permisos de MCP en la capa de Skills.

## 9. Reglas de jerarquía y seguridad
- **Vendedores Base:** Solo ven sus propios pedidos y leads.
- **Supervisores:** Ven todo el flujo del Tenant, alertas de margen y registros del Orquestador.
- **Auditoría:** Todas las confirmaciones generan un hash inmutable.

## 10. Flujo normal de uso
1. El Vendedor recibe requerimiento y crea Cotización.
2. Cliente acepta; Cotización pasa a `SalesOrder` (DRAFT).
3. Vendedor verifica precios vs. Costos Operativos (`Margin Guard`).
4. Vendedor presiona "CONFIRMAR".
5. El sistema evalúa Stock (ATP). Si falta, evalúa Producción (CTP).
6. Se aprueba la fecha final, el pedido pasa a `CONFIRMED` y se despachan las órdenes logísticas o de producción necesarias.

## 11. Indicadores operativos importantes
- Tasa de Conversión (Cotización a Pedido).
- Alertas de Margen Detonadas (Frecuencia).
- Confidence Score de Orquestación (Qué tan seguros estamos de la fecha de entrega).
- Volúmen de ítems derivados a `STOCK` vs `PRODUCTION`.

## 12. Escalamiento cuando algo falla
1. Revisar los "Logs de Orquestación" dentro del detalle del Pedido para entender por qué la IA tomó una decisión.
2. Si un margen da negativo, el administrador debe validar que el costo del `CatalogoItem` o de sus componentes BoM (`precioBase`) esté capturado correctamente.
3. Escalar a nivel técnico si las `WorkOrders` no aparecen en el módulo de Producción.

---

### Resumen para soporte y administración
1. **Margin Guard es ley:** Bloquea ventas no rentables. Si bloquea por error, revisa los costos base de los productos.
2. **Motor ATP/CTP automatizado:** El vendedor vende, el sistema decide CÓMO cumplir (Stock o Producción).
3. **Orchestration Log:** Siempre está visible en el detalle del pedido para auditar las decisiones operativas.
4. **Fechas de Entrega Dinámicas:** La "Fulfillment Date" se ajusta según el Lead Time más largo encontrado en la orquestación.
5. **Evidencia IA:** Cada sugerencia generada por la IA Gemma (Gemma Deal Coach) se guarda en un log de decisiones para evitar alucinaciones no auditadas.
