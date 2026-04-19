# Ficha Técnica: Marketing Campaigns
**Lead Nurturing Autónomo y Emisiones Masivas Nativas**

---

## 1. Descripción General (El Alcance)
El módulo de **Marketing Campaigns** de Volkern elimina la necesidad de pagar costosas licencias de terceros (como Mailchimp o HubSpot) y los problemas de sincronización de bases de datos. Al vivir dentro del mismo núcleo que el CRM y la Facturación, puedes lanzar campañas masivas hacia segmentos de audiencia hiper-precisos, como: *"Todos los clientes que compraron el 'Producto X' hace 11 meses y aún no han renovado"*. 

Es el motor de retención y adquisición proactiva de la empresa, operando bajo demanda o mediante *triggers* (disparadores) automáticos.

---

## 2. Alcances y Funcionalidades Principales

### A. Segmentación Dinámica (Dynamic Audiences)
- **Filtros Transaccionales:** Las listas de correos no son estáticas. Puedes filtrar prospectos no solo por etiquetas, sino por su comportamiento real (Ej: Clientes con facturas pagadas por más de 10,000 EUR, o Leads que no han contestado en 30 días).
- **Auto-Actualización:** Si un Lead se convierte en Cliente hoy, sale automáticamente de la campaña de "Prospectos en Frío" y entra a la campaña de "Onboarding".

### B. Emisión y Ruteo de Correos (Email Dispatching)
- **Plantillas (Templates) Dinámicas:** Soporte para sintaxis Handlebars (`{{contact.name}}`, `{{last_invoice.amount}}`) para inyectar variables en tiempo real en el cuerpo del correo.
- **Rastreo de Aperturas (Analytics):** Inyección de píxeles de rastreo y reescritura de enlaces para medir Tasas de Apertura (Open Rate) y Tasas de Clic (CTR) nativamente en Volkern.
- **Gestión de Opt-outs (Unsubscribe):** Cumplimiento automático con GDPR y CAN-SPAM. Si un contacto se da de baja, el sistema lo bloquea a nivel de base de datos para futuras campañas masivas, previniendo penalizaciones de dominio.

---

## 3. Especificaciones Técnicas (Ficha Técnica Arquitectónica)

| Componente | Especificación Tecnológica |
| :--- | :--- |
| **Motor de Envío Masivo** | Integración nativa a través de **AWS SES**, **SendGrid** o **Resend** mediante inyección de credenciales encriptadas en el `ThirdPartyVault`. |
| **Colas de Tareas (Queues)** | Uso de Background Workers (Inngest / RabbitMQ) para procesar miles de correos en lotes (batching). Previene el bloqueo del EventLoop principal de Node.js/Next.js. |
| **Webhooks de Rebote (Bounces)** | Endpoints Ingress (Ej: `/api/webhooks/sendgrid`) que escuchan quejas de Spam o "Hard Bounces" para marcar automáticamente el correo como `INVALID` en Prisma. |
| **Protección contra Rate-Limits** | Estrategia de Backoff Exponencial y `Throttle` para no exceder las cuotas por segundo del proveedor SMTP. |
| **Almacenamiento de Analytics** | Modelo de datos optimizado para escritura rápida (`CampaignAnalyticsLog`) que registra cada evento de apertura sin saturar la tabla principal del Contacto. |

---

## 4. El Poder de la IA y MCP en Campañas

Las campañas de correo en Volkern dejan de ser estáticas gracias a **Gemma 4**. La IA actúa como el "Chief Marketing Officer" interno.

- **Generación de Copy Contextual:** En lugar de plantillas genéricas, puedes pedirle a la IA: *"Gemma, redacta una campaña de re-engagement para los clientes del sector industrial que perdieron su licencia. Usa un tono urgente pero cordial"*. La IA redacta el HTML listo para enviar.
- **Micro-Personalización 1-a-1 (Agentic Outreach):** Usando el servidor MCP, un Agente IA puede iterar sobre una lista de 50 leads prioritarios, leer las notas técnicas de su última reunión en el CRM, y re-escribir el primer párrafo del correo **específicamente para cada individuo** antes de enviarlo a la cola.
- **A/B Testing Predictivo:** Antes de enviar 10,000 correos, Gemma puede evaluar dos "Subject Lines" (Asuntos) y predecir cuál tendrá mejor Tasa de Apertura basándose en los datos históricos del Tenant.

---

## 5. Impacto en el Negocio (ROI)
1. **Cero Fugas de Datos (Data Sovereignty):** No exportas tus clientes a servidores de terceros para mandarles un correo. Todo tu capital relacional se queda cifrado dentro del Tenant de Volkern.
2. **Atribución de ROI Absoluta (Closed-Loop Analytics):** Como Marketing, Ventas y Finanzas comparten base de datos, puedes ver si un click en una campaña enviada el Lunes se convirtió en una Factura pagada el Viernes. Esta visibilidad es imposible cuando usas software fragmentado.
3. **Eficiencia en Costos (TCO):** Ahorro inmediato de licencias mensuales (SaaS externos de email marketing) al utilizar la infraestructura core (solo pagas los centavos del uso del protocolo SMTP).
