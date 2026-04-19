# 13. Comunicaciones y Notificaciones

## 1. Nombre del hub
Comunicaciones Omni-canal (Comms Hub).

## 2. Propósito operativo
Centralizar todo el intercambio de información. Esto incluye chats internos entre empleados, notificaciones de sistema (Ej: "Tu pedido requiere aprobación"), y correos salientes hacia los clientes (Ej: Envío de contratos o cotizaciones).

## 3. Quién lo usa
- Todos los usuarios de la plataforma (Bandeja de entrada personal).
- Administradores (Para broadcasts o avisos globales).

## 4. Qué ve el usuario al entrar por primera vez
- **Inbox Central:** Una bandeja unificada de notificaciones.
- Mensajes directos con otros colegas (Chat interno).
- Avisos urgentes del sistema (Ej: "Alerta de Skill-Guard Caducado").

## 5. Qué puede hacer
- Enviar mensajes y etiquetar a otros empleados (`@usuario`).
- Responder o aprobar acciones directamente desde la notificación (Ej: Aprobar un reembolso desde el Inbox sin tener que ir al Hub de Ventas).
- Personalizar preferencias de qué alertas quiere recibir en el email y cuáles solo en la app.

## 6. Qué no puede hacer
- No puede borrar alertas de auditoría del sistema (Ej: Notificaciones de que modificó un precio crítico).
- No puede leer los mensajes directos de otros empleados, salvo que sea un Oficial de Cumplimiento ejecutando una orden de revisión de seguridad (Data eDiscovery).

## 7. Qué ayudas necesita el administrador de tenant
- Configurar servidores SMTP personalizados para que los correos hacia los clientes salgan con el dominio de la empresa (Ej: `ventas@miempresa.com`).
- Gestionar plantillas de notificaciones push para móviles.

## 8. Problemas o dudas frecuentes
- **"El cliente dice que no recibe el enlace mágico"**: Verificar los logs del servicio de correo saliente. Suele ser que rebotó o cayó en Spam.
- **"Tengo demasiadas notificaciones"**: Enseñar al usuario a usar el Perfil de Usuario para desactivar notificaciones no críticas.

## 9. Reglas de jerarquía y seguridad
- Las notificaciones de sistema se rigen por Roles. Una notificación de "Nómina Sellada" solo la recibe el `FINANCE_ROLE`.
- End-to-End Encryption (E2EE) opcional para chats ejecutivos confidenciales.

## 10. Flujo normal de uso
1. El usuario inicia su jornada, ve un globo rojo en la campana de notificaciones.
2. Abre el Inbox y lee: "La producción de la orden X se detuvo por falta de material".
3. Dentro de la misma notificación, etiqueta al encargado de compras por chat: `@juan, urge comprar aluminio`.
4. Juan recibe el aviso en su móvil instantáneamente.

## 11. Indicadores operativos importantes
- Tasa de Entrega de Correos (Deliverability Rate).
- Tiempos promedio de respuesta interna.
- Volumen de alertas del sistema (Útil para detectar procesos ruidosos).

## 12. Escalamiento cuando algo falla
1. Si los emails no salen, revisar los "Webhooks de Entrega" del proveedor de email (Sendgrid/Resend).
2. Si los websockets fallan (El chat interno no es en tiempo real), revisar el servidor de Pub/Sub en infraestructura.

---

### Resumen para soporte y administración
1. **Es el sistema nervioso:** Si el Hub de comunicaciones cae, los flujos asíncronos (Aprobaciones de Contratos, Nómina) requerirán avisos manuales.
2. **Dominio Corporativo:** Por profesionalismo, asegúrate de configurar el registro DNS y DKIM del tenant para evitar la carpeta de SPAM del cliente.
3. **Alertas de Acción Rápida (Actionable Alerts):** Educar al usuario para que no use el sistema como un email pasivo; las notificaciones tienen botones vivos que cambian estados en el ERP.
4. **Broadcasts de Empresa:** Útil para que HR mande avisos generales (Ej: "Día festivo mañana") asegurando que todos los empleados dejen "Visto".
5. **Logs de Entregabilidad:** Ante cualquier disputa legal ("Nunca recibí el contrato"), el Hub guarda confirmaciones criptográficas de "Leído/Abierto".
