# 10. Hub de Finanzas y Facturación

## 1. Nombre del hub
Hub de Finanzas, Facturación y Tesorería.

## 2. Propósito operativo
Controlar el ciclo económico de la empresa. Gestiona la emisión y cobro de facturas (Invoices), registra los ingresos a caja y activa los disparadores financieros para el cálculo de comisiones en el Hub de Recursos Humanos.

## 3. Quién lo usa
- Personal de Finanzas y Contabilidad.
- Tesoreros y Cajeros.
- Administradores de Tenant.

## 4. Qué ve el usuario al entrar por primera vez
- **Dashboard Financiero:** Resumen de flujo de caja, cuentas por cobrar (Cuentas pendientes), y facturas vencidas (Overdue).
- Gestor de Facturas (`Invoices`): Listado de documentos fiscales emitidos.
- Panel de Pagos: Registro de transferencias, cheques o tarjetas de crédito conciliados contra las facturas.

## 5. Qué puede hacer
- Generar Facturas a partir de un Pedido (`SalesOrder`) confirmado en el Hub de Ventas.
- Registrar pagos (Parciales o Totales) contra una factura.
- Emitir Notas de Crédito por devoluciones o ajustes.
- Configurar las tasas impositivas estándar (Ej: IVA, IGIC).

## 6. Qué no puede hacer
- **No puede alterar el historial de una factura ya emitida y enviada al Trust Protocol.** Si hay un error, debe anularla mediante una Nota de Crédito.
- No puede modificar las ventas o cotizaciones en el Hub de Ventas; Finanzas es el receptor de las transacciones comerciales, no el creador.

## 7. Qué ayudas necesita el administrador de tenant
- Configuración de Pasarelas de Pago (Ej: Stripe, PayPal) para el cobro automatizado mediante el Portal de Miembros.
- Sincronización del catálogo de cuentas contables.

## 8. Problemas o dudas frecuentes
- **"Las comisiones de los vendedores no aparecen"**: El sistema de RRHH no liberará comisiones hasta que Finanzas marque la Factura correspondiente como `PAID` (Pagada).
- **"No puedo borrar esta factura errónea"**: Por cumplimiento (VeriFactu), Volkern prohíbe el borrado de facturas. Debes emitir una nota de crédito o cancelación oficial.

## 9. Reglas de jerarquía y seguridad
- Roles estrictos de acceso financiero. Los Vendedores (Sales) solo pueden "solicitar" la emisión, pero no pueden marcar pagos como recibidos.
- Trazabilidad total de pagos.

## 10. Flujo normal de uso
1. El Hub de Ventas pasa un pedido a `CONFIRMED`.
2. El sistema (o un contador) genera la Factura (`Invoice`) en estado `ISSUED`.
3. El cliente transfiere el dinero.
4. El Tesorero registra el pago, la factura cambia a `PAID`.
5. El sistema dispara el evento a HR para autorizar la comisión del vendedor de ese pedido.

## 11. Indicadores operativos importantes
- DSO (Días de Venta Pendientes de Cobro).
- Tasa de Morosidad (Facturas Vencidas).
- Recaudación Mensual (Cash Flow).

## 12. Escalamiento cuando algo falla
1. Problemas de correlación fiscal: Verificar si el Trust Protocol bloqueó la emisión por pérdida de integridad de la cadena.
2. Si un pago automático falla, revisar los logs del webhook de la pasarela de pagos.

---

### Resumen para soporte y administración
1. **Facturas = Piedra Angular:** Nada es oficial hasta que se factura. Y nada genera comisión hasta que se paga.
2. **Cumplimiento por Diseño:** La imposibilidad de borrar facturas no es un bug, es la ley (Trust Protocol/VeriFactu).
3. **Roles Segregados:** El vendedor vende, el logístico entrega, el contador cobra. Finanzas es la última barrera de control.
4. **Flujo de Caja en Tiempo Real:** Mantén los registros de pago actualizados diariamente para que el Dashboard de la empresa refleje la liquidez real.
5. **Notas de Crédito:** Es la única herramienta legal dentro del sistema para corregir errores de facturación.
