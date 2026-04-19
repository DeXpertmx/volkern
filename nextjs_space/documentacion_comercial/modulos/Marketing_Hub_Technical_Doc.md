# Volkern Marketing Hub: Documentación Técnica

## 1. Arquitectura del Sistema
El Hub de Marketing de Volkern está diseñado como una plataforma **multitenant, asíncrona y soberana**. Utiliza una arquitectura basada en eventos que conecta el núcleo del ERP con acciones de marketing externas.

### Componentes Core
- **Next.js 14 (App Router)**: Frontend y API Routes.
- **Prisma + PostgreSQL**: Persistencia de datos con aislamiento estricto por `tenantId`.
- **BullMQ + Redis**: Motor de colas para ejecución asíncrona de publicaciones, correos y automatizaciones.
- **Gemma 4 (via MCP)**: Motor de inteligencia artificial para asesoría y generación de contenido.

---

## 2. Modelo de Datos
Se han implementado los siguientes modelos clave en Prisma:

- `SocialPost`: Registro de publicaciones programadas y ejecutadas.
- `AutomationRule`: Definiciones de reglas (Trigger -> Condition -> Action).
- `AutomationLog`: Trazabilidad de ejecuciones automáticas.
- `MarketingAuditLog`: Auditoría forense de todas las acciones del hub.
- `MarketingSuppression`: Lista de exclusión global por tenant (Compliance).

---

## 3. Servicios Principales

### SocialMediaService (`lib/marketing/social-media-service.ts`)
Encapsula la lógica de conexión con APIs externas (LinkedIn, YouTube, Meta).
- **OAuth Management**: Manejo de tokens y refresco automático.
- **Normalization**: Unifica métricas de diferentes redes en un formato estándar de Volkern.

### AutomationRuleEngine (`lib/marketing/automation/rule-engine.ts`)
Motor de evaluación de reglas en tiempo real.
- **Triggers**: LeadCreated, DealWon, InvoicePaid, etc.
- **Evaluator**: Procesa condiciones JSON-logic para decidir si se dispara una acción.

### MarketingAuditService (`lib/marketing/audit-service.ts`)
Centraliza el registro de gobernanza. Registra cada interacción humana e IA para cumplimiento normativo y seguridad.

---

## 4. Orquestación Asíncrona (Workers)
El sistema utiliza Workers dedicados para evitar bloquear el hilo principal:
- **Social Worker**: Procesa la cola `SOCIAL_POSTS` para publicar en redes.
- **Workflow Worker**: Procesa la cola `MARKETING_WORKFLOWS` para ejecutar acciones de automatización (ej. crear tareas en el CRM, enviar notificaciones).

---

## 5. Gobernanza y Seguridad
- **Vault Integration**: Las credenciales OAuth se almacenan cifradas en el `ThirdPartyVault`.
- **RBAC**: Solo usuarios con roles autorizados pueden ver o modificar configuraciones de gobernanza.
- **Rollback**: Capacidad de revertir versiones de reglas de automatización mediante snapshots.

---

## 6. Integración de IA (Gemma 4)
- **Marketing Advisor**: Servicio que analiza los datos del tenant y genera sugerencias de automatización.
- **Web Creator AI**: Inyección dinámica de bloques HTML/CSS generados mediante prompts de lenguaje natural.
