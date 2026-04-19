# Ficha Técnica: Social Hub (Comunicaciones y Colaboración B2B)
**La Intranet Viva: Contexto, Chat y Colaboración en Tiempo Real**

---

## 1. Descripción General (El Alcance)
El **Social Hub** de Volkern no es simplemente una herramienta de chat genérica. Es el sistema nervioso de colaboración contextual de la empresa. Su objetivo principal es erradicar el uso de correos electrónicos internos y grupos de WhatsApp descentralizados, trayendo toda la comunicación directamente a la transacción o registro donde ocurre el problema. 

En lugar de decir *"Oye, revisa la factura 1234"*, un usuario simplemente etiqueta (`@usuario`) a su compañero dentro del panel lateral de la misma factura, manteniendo el historial inmutable y anclado al documento.

---

## 2. Alcances y Funcionalidades Principales

### A. Colaboración Contextual (Entity-Level Comments)
- **Hilos de Discusión Anclados:** Los usuarios pueden abrir un hilo de comentarios en cualquier entidad del sistema (Una Factura, una Orden de Trabajo, un Lead de Ventas).
- **Menciones (@ Mentions):** Al escribir `@nombre`, el sistema dispara una notificación Push e In-App al destinatario, dirigiéndolo exactamente al registro en cuestión.
- **Trazabilidad Forense:** Los comentarios no se pueden borrar. Si hay una disputa sobre por qué se aprobó un descuento, el hilo de chat de esa Cotización sirve como evidencia auditable.

### B. Chat Interno y Salas (Real-Time Messaging)
- **Mensajería Directa (DM):** Chat 1-a-1 entre empleados del mismo Tenant.
- **Canales de Proyecto:** Integración automática con el `Projects Hub`. Cuando se crea un proyecto, se aprovisiona una sala de chat dedicada para todos los miembros involucrados.
- **Notificaciones de Lectura:** Indicadores en tiempo real (Tick azul) impulsados por WebSockets para confirmar que un operario recibió una instrucción crítica.

### C. Feeds de Actividad (Audit & Social Feeds)
- **Activity Stream:** Similar al "Muro" de una red social, pero para negocios. Muestra en tiempo real qué está ocurriendo en la empresa (Ej: *"Juan cerró el Trato X"*, *"María aprobó la Factura Y"*).
- **Filtros de Relevancia:** Cada usuario ve un feed personalizado basado en sus permisos y su departamento, evitando el "Ruido" de notificaciones irrelevantes.

### D. Interacción B2B (External Collaboration)
- **Comentarios Seguros en el Member Portal:** Los clientes externos (Guest Users) pueden usar un chat cifrado dentro de su Portal de Miembros para discutir los términos de un contrato o reclamar una factura directamente con el vendedor asignado, sin usar emails.

---

## 3. Especificaciones Técnicas (Ficha Técnica Arquitectónica)

| Componente | Especificación Tecnológica |
| :--- | :--- |
| **Protocolo de Tiempo Real** | WebSockets (Socket.io / Pusher) con fallback a Long Polling HTTP. |
| **Arquitectura de Eventos** | Arquitectura Pub/Sub (Publish/Subscribe) mediada por el `EventBus` de Volkern. |
| **Persistencia de Datos** | PostgreSQL (Tablas `ChatMessage`, `Notification`, y `EntityComment`). |
| **Notificaciones Offline** | Cola de mensajes asíncrona (RabbitMQ/Inngest) para disparar fallbacks por Email (SendGrid/SES) si el usuario no tiene la sesión WebSocket activa. |
| **Control de Acceso (RBAC)** | Validación estricta de herencia de permisos. Un usuario no puede ser mencionado ni invitado a comentar en una `WorkOrder` si su Rol no tiene permisos de Producción. |

---

## 4. El Poder de la IA y MCP en el Social Hub

El Social Hub es el lugar de residencia natural de **Gemma 4**. La IA no es una ventana flotante asilada; es un participante más en la red social de la empresa.

- **IA como Participante del Chat:** Puedes invocar a la Inteligencia Artificial dentro de un hilo de discusión humano usando `@Gemma`. 
  - *Ejemplo Humano:* "@Gemma, resume la discusión que tuvimos arriba sobre este cliente y redacta un correo de disculpa oficial".
- **Agentes Proactivos:** Si un hilo de discusión en una Factura Vencida lleva inactivo 3 días, la IA puede "comentar" automáticamente: *"Notifico que este cliente sigue sin pagar. ¿Desean que envíe un recordatorio automático?"*.
- **Sentiment Analysis:** La IA audita anónimamente el "Tono" de los chats de servicio al cliente en el Member Portal. Si detecta enojo o frustración en el lenguaje del cliente, escala inmediatamente la notificación a un Supervisor humano (`Escalation Event`).

---

## 5. Impacto en el Negocio (ROI)
1. **Velocidad de Resolución (SLA):** Al tener la discusión en la misma pantalla que los datos (Ej: Chat y Factura lado a lado), el contexto no se pierde. Las disputas internas se resuelven un 70% más rápido.
2. **Propiedad de la Información:** Si un vendedor clave renuncia, no se lleva el historial de negociaciones en su WhatsApp personal. Toda la relación y acuerdos verbales con el cliente quedan centralizados en el Social Hub de Volkern.
3. **Cero Fatiga de Correos:** Reduce drásticamente la cadena interminable de "Reply All" que ahoga la productividad corporativa.
