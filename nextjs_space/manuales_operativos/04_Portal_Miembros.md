# 4. Portal de Miembros

## 1. Nombre del hub
Portal de Miembros (Customer/B2B Portal).

## 2. Propósito operativo
Brindar un canal de autoservicio para que los clientes B2B (empresas) o B2C (individuos) interactúen con el Tenant. Funciona como una ventanilla única para revisar cotizaciones, pedidos, facturas y enviar mensajes.

## 3. Quién lo usa
- Clientes finales del Tenant.
- Proveedores o Partners (si se les habilita acceso B2B).

## 4. Qué ve el usuario al entrar por primera vez
- Una interfaz simplificada, sin las herramientas complejas del ERP.
- Un **Dashboard Resumen** con el estado de sus pedidos (Ej: "En Producción", "Enviado").
- Notificaciones sobre cotizaciones pendientes de firma o facturas impagas.

## 5. Qué puede hacer
- Consultar el historial y estado detallado de sus Pedidos (`SalesOrder`).
- Aprobar, firmar digitalmente o rechazar Cotizaciones enviadas por Ventas.
- Descargar facturas.
- Enviar tickets o mensajes al equipo de atención del Tenant.

## 6. Qué no puede hacer
- **No puede modificar los precios ni las fechas.**
- **No puede ver información interna operativa** (No ve las "WorkOrders" ni los retrasos de inventario del orquestador, solo ve el estado comercial macro).
- Naturalmente, **bajo ninguna circunstancia** puede saltar los límites del Tenant.

## 7. Qué ayudas necesita el administrador de tenant
- Cómo generar tokens públicos o accesos seguros para que un cliente pueda entrar a su portal sin requerir contraseñas complejas.
- Configurar qué tanta visibilidad (tracking logístico) desea exponer a los clientes.

## 8. Problemas o dudas frecuentes
- **"El cliente no puede firmar la cotización"**: Generalmente es porque el enlace público caducó o el token de sesión ha sido revocado.
- **"El cliente no ve el pedido"**: Asegurarse de que el `contactId` del cliente esté correctamente vinculado al pedido en el CRM interno.

## 9. Reglas de jerarquía y seguridad
- Acceso altamente restrictivo: Limitado mediante `publicToken` o sesiones específicas de cliente (CustomerSession).
- El Portal de Miembros utiliza rutas aisladas en el sistema para prevenir inyección de comandos hacia el backend administrativo.

## 10. Flujo normal de uso
1. El Vendedor (desde el Hub Ventas) envía una cotización por correo con un "Enlace Mágico".
2. El Cliente hace clic y entra a su Portal de Miembro.
3. El Cliente revisa el PDF embebido, aprueba el documento.
4. El sistema notifica al Vendedor y el pedido avanza automáticamente.
5. El Cliente vuelve periódicamente al portal para ver el "Tracking" logístico de su paquete.

## 11. Indicadores operativos importantes
- Tasa de uso del portal (autoservicio vs soporte telefónico).
- Tiempo de aprobación de cotizaciones por portal.

## 12. Escalamiento cuando algo falla
1. Validar que el `CustomerPortalAccess` siga activo en la base de datos.
2. Si hay errores de carga de facturas o PDFs, revisar la integración de almacenamiento de archivos.

---

### Resumen para soporte y administración
1. **Entorno Aislado:** El portal es una vista "ReadOnly" y de "Firma", el cliente nunca tiene acceso a lógicas del negocio.
2. **Los enlaces son el pase de oro:** Gestiona correctamente la caducidad de los "Magic Links".
3. **Visibilidad controlada:** Oculta los problemas internos; el orquestador CTP no se expone aquí, el cliente solo ve "Confirmado" o "En Proceso".
4. **Auto-Servicio = Ahorro:** Instruye a los vendedores a empujar el uso del portal para reducir llamadas de seguimiento.
5. **Fallos de PDF:** Si un documento no se ve, el administrador debe verificar la generación del render en el CRM.
