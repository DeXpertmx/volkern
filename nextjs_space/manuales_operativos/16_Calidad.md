# 16. Control de Calidad y No Conformidades

## 1. Nombre del hub
Hub de Inspección, Calidad y Mejora Continua (QC Hub).

## 2. Propósito operativo
Asegurar que los productos físicos que se fabrican o reciben cumplan los estándares de la empresa. Interviene los Lotes de Inventario y las Órdenes de Trabajo para rechazar o liberar mercancía, previniendo que un producto defectuoso llegue al cliente.

## 3. Quién lo usa
- Inspectores de Calidad.
- Técnicos de Laboratorio (En caso industrial).
- Gerentes de Mejora Continua.

## 4. Qué ve el usuario al entrar por primera vez
- **Bandeja de Cuarentenas:** Lista de todos los lotes (`InventoryLot`) que el sistema detuvo y esperan inspección manual.
- Gestor de Casos (No Conformidades - NCR).
- Dashboard de métricas de calidad (Ej: PPM - Piezas por Millón defectuosas, Yield Rate).

## 5. Qué puede hacer
- Generar tickets de "No Conformidad" si halla un defecto de proveedor o en línea de ensamblaje.
- Modificar el estado de un Lote de Inventario: De `QUARANTINE` a `AVAILABLE` (Aprobado) o `REJECTED` (Deshecho/Devolución).
- Auditar check-lists paso a paso sobre `WorkOrders` específicas en planta.

## 6. Qué no puede hacer
- No puede modificar las ventas ni alterar las Listas de Materiales. Su rol es evaluar el resultado físico final, no el diseño base (Salvo que levante un Ticket de Ingeniería).

## 7. Qué ayudas necesita el administrador de tenant
- Ayuda para configurar las reglas automáticas de Cuarentena (Ej: "Todo lote que entre por el muelle de Proveedor X va a Cuarentena obligatoria").
- Parametrizar flujos de aprobación si un rechazo implica un costo superior a 10,000 EUR.

## 8. Problemas o dudas frecuentes
- **"Logística y Producción me odian por bloquearles el trabajo"**: Calidad tiene la autoridad absoluta. Si un lote está rechazado, el ERP detendrá cualquier movimiento o despacho hasta que se emita un "Concesión Especial" aprobada por Gerencia.
- **"¿Cómo vinculo una foto del defecto?"**: Desde la app móvil, el inspector puede subir evidencias fotográficas atadas al ticket de No Conformidad.

## 9. Reglas de jerarquía y seguridad
- **Segregación Crítica:** Los operadores de producción NO pueden aprobar sus propias inspecciones de calidad finales.
- Los reportes de calidad no se borran, se cierran.

## 10. Flujo normal de uso
1. Logística recibe un camión con materia prima. El sistema la ingresa e inmediatamente le pone etiqueta de `QUARANTINE`.
2. El Inspector de Calidad toma una muestra.
3. Ingresa al QC Hub, busca el Lote, y rellena el formulario "Plan de Control".
4. Si pasa: Presiona "Aprobar". El lote cambia a `AVAILABLE` y mágicamente aparece en los radares de Ventas (ATP) como "Listo para vender".
5. Si falla: Levanta un NCR, avisa a Finanzas para no pagar esa factura al proveedor, y manda el lote a devolución.

## 11. Indicadores operativos importantes
- Costo de la No Calidad (Desperdicio + Retrabajo).
- Tiempo promedio de liberación de lotes (Impacta la velocidad de ventas).
- Reclamos de cliente vinculados a lotes aprobados previamente.

## 12. Escalamiento cuando algo falla
1. Alertas de contaminación masiva: Si se detecta un defecto post-producción, el QC Hub tiene una herramienta de "Trazabilidad Inversa" (Recall) para ver a qué clientes específicos se les envió ese Lote particular en base a los logs del Logistics Hub.

---

### Resumen para soporte y administración
1. **Calidad es un Freno Inteligente:** Su trabajo es interponerse entre Producción y el Cliente Final. Las alertas naranjas (Cuarentena) en los inventarios son sanas.
2. **Impacto Financiero Directo:** Rechazar un lote afecta el estado de resultados del ERP y detona órdenes a finanzas para congelar pagos a proveedores.
3. **No Conformidades (NCR):** No las trates como simples correos electrónicos; son el expediente legal para forzar el cumplimiento de garantías.
4. **Agilidad desde el Móvil:** Instaura que tus inspectores usen tablets o móviles. La calidad se mide donde ocurre, no en un escritorio tres días después.
5. **Auditorías a Tiempo Real:** Los historiales de liberación atados al usuario (`ContactId`) garantizan saber exactamente quién firmó la calidad de un producto antes del despacho.
