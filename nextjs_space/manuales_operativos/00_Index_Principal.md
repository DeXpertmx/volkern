# Índice General de Documentación Operativa Volkern

Bienvenido a la documentación operativa oficial del ecosistema ERP de Volkern. Este manual está diseñado para ser la guía pedagógica y operativa definitiva para administradores de tenant, supervisores y usuarios finales. 

La plataforma Volkern opera sobre un esquema multi-tenant seguro con arquitectura descentralizada y criptográficamente verificable. Cada rol de usuario tiene acceso exclusivo a determinados Hubs (módulos operativos) basados en sus permisos y en la validación de su "Master Key" (ADN y Vault).

---

## Documentación de Visión General
- **[Volkern CRM: Front-Office e Inteligencia Comercial](file:///home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/Volkern_CRM_Commercial.md)**
- **[Volkern ERP: Back-Office y Operación Industrial](file:///home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/Volkern_ERP_Commercial.md)**
- **[Whitepaper Comercial Global](file:///home/dexpert/Volkern/nextjs_space/documentacion_comercial/Volkern_Whitepaper_Comercial.md)**

---

## Guías por Módulo (Hubs)

1. **Primer Ingreso a la Plataforma:** Guía sobre qué ocurre al entrar, la identificación de inquilino (tenant), asignación de roles y flujos de seguridad.
2. **Hub de Ventas:** Orquestación, validación de márgenes, y toma de pedidos con el motor ATP/CTP.
3. **Academia (Skill-Guard):** [Roleplay y Entrenamiento con IA](file:///home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/Sales_Academy_Roleplay_Commercial.md) | Gestión del talento y validación de habilidades usando MCP y AI.
4. **Portal de Miembros:** La ventana de acceso para clientes B2B/B2C a sus pedidos y cotizaciones.
5. **Producción:** Listas de Materiales (BoM), ejecución de WorkOrders y registro de consumos.
6. **Logística:** Gestión de inventario en almacenes, lotes de existencias (InventoryLot), y reservas operativas.
7. **HR / Nómina / Beneficios:** El Payroll Vault, comisiones automatizadas y cumplimiento fiscal (IRPF/SS).
8. **Contracts:** Gestión de contratos, renovaciones y firmas digitales.
10. **Hub de Finanzas y Facturación:** Emisión de facturas (Invoices), gestión de cobranza y tesorería.
11. **Hub de Proyectos:** Planificación, hitos, presupuestos consolidados y diagramas de avance.
12. **Catálogo de Inventarios:** Maestro de productos, gestión de ubicaciones y definición de SKUs (Stock vs Manufactura).
13. **Comunicaciones:** Inbox centralizado, notificaciones en tiempo real y chat interno de operarios.
14. **Marketing:** [Manual de Operación](file:///home/dexpert/Volkern/nextjs_space/manuales_operativos/14_Marketing_Hub.md) | [Ficha Técnica](file:///home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/Marketing_Hub_Technical_Doc.md) | [Ficha Comercial](file:///home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/Marketing_Hub_Commercial_Doc.md) | [Marca Blanca para Agencias](file:///home/dexpert/Volkern/nextjs_space/documentacion_comercial/modulos/Marketing_Hub_WhiteLabel_Agencies.md)
15. **Recursos Humanos (Core):** Altas, bajas, gestión de vacaciones, tiempo y evaluación de desempeño.
16. **Calidad:** Inspección de lotes físicos, gestión de No Conformidades (Cuarentena/Rechazo) y control de procesos.
17. **Integraciones:** Mapeo de Webhooks, configuración de Pasarelas y gestión de llaves externas de terceros.
18. **Configuración del Tenant:** Preferencias generales, zonas horarias, impuestos base y Branding empresarial.
19. **Perfil de Usuario:** Seguridad individual (MFA/2FA), notificaciones, idioma y avatares.
20. **Servidor MCP:** Operativa para conectar herramientas y capacidades del ERP a Modelos y Agentes de IA.
21. **Gemma 4 en Móvil:** Asistencia conversacional en campo, control de inventario por voz e interfaces inteligentes.

---

> [!NOTE]
> Todos los módulos respetan una estricta jerarquía: **Tenant -> Rol -> Hub -> Acción**. Si algún usuario experimenta un bloqueo, el primer paso del administrador debe ser validar los permisos del rol frente al tenant.
