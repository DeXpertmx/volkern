# Manual Técnico — Compliance & Auditoría Volkern

> **Versión:** 1.0  
> **Última actualización:** Junio 2026  
> **Propósito:** Documentar el detalle técnico, arquitectura y configuración de cada feature de cumplimiento normativo.

---

## Índice

1. [🛡️ Trazabilidad Total](#1-traza)
2. [📄 Gestión Documental Avanzada](#2-docs)
3. [✍️ Firma Digital + Evidencia](#3-firma)
4. [⚙️ Workflows Controlados](#4-workflows)
5. [👥 Control de Roles y Permisos](#5-roles)
6. [📊 Reportes de Auditoría](#6-reportes)
7. [🔔 Alertas y Monitoreo](#7-alertas)

---

<a id="1-traza"></a>
## 1. 🛡️ Trazabilidad Total

### 1.1 Core Audit Service

**Archivo:** `lib/audit-service.ts`

Servicio central de auditoría que registra **todas las acciones** del sistema con encadenamiento hash SHA-256.

```typescript
import { AuditService } from '@/lib/audit-service';

await AuditService.log({
  tenantId: 'tenant_xxx',
  userId: 'user_xxx',           // null para acciones del sistema
  action: 'LEAD_CREATED',       // Código de acción
  entity: 'Lead',               // Tipo de entidad
  entityId: 'lead_xxx',         // ID de la entidad afectada
  description: 'Lead creado desde formulario web',
  changesBefore: null,          // Estado anterior (para updates)
  changesAfter: { status: 'nuevo', ... },  // Estado nuevo
  ipAddress: '192.168.1.1',     // Opcional
  userAgent: 'Mozilla/...',     // Opcional
  metadata: { source: 'web_form' }  // Metadatos adicionales
});
```

**Campos del modelo `auditLog` (Prisma):**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String (cuid) | ID único |
| `tenantId` | String | Tenant al que pertenece |
| `userId` | String? | Usuario que ejecutó la acción |
| `accion` | String | Código de acción (`LEAD_CREATED`, `CONTRACT_SIGNED`, etc.) |
| `entidad` | String | Tipo de entidad (`Lead`, `Contact`, `Deal`, etc.) |
| `entidadId` | String | ID de la entidad |
| `descripcion` | String | Descripción legible |
| `cambiosAntes` | Json? | Snapshot del estado anterior |
| `cambiosDespues` | Json? | Snapshot del estado nuevo |
| `hash` | String? | Hash SHA-256 de la entrada |
| `metadata` | Json? | Metadatos adicionales (previousHash, chainVersion, sealedAt) |
| `ipAddress` | String? | Dirección IP |
| `userAgent` | String? | User agent del navegador |
| `fechaCreacion` | DateTime | Timestamp |

### 1.2 Encadenamiento Hash

**Archivo:** `lib/audit-hash.ts`

Cada entrada de auditoría contiene un hash SHA-256 que incluye el hash de la entrada anterior, formando una **cadena inmutable**.

```
Genesis: 0000000000000000...
    ↓
Entry 1: sha256(tenantId|userId|entity|entityId|action|...|GENESIS_HASH)
    ↓
Entry 2: sha256(tenantId|userId|entity|entityId|action|...|hash(Entry1))
    ↓
Entry 3: ...
```

**Fórmula del hash:**
```
hash = sha256([
  tenantId,
  userId || '',
  entidad,
  entidadId,
  accion,
  descripcion,
  fechaCreacion.toISOString(),
  previousHash || GENESIS_HASH,
  JSON.stringify(cambiosAntes) || '',
  JSON.stringify(cambiosDespues) || ''
].join('|'))
```

**Funciones disponibles:**

```typescript
// Verificar integridad de una entrada
const result = await verifyAuditIntegrity(tenantId, auditLogId);
// → { valid: boolean, expectedHash: string, actualHash: string, error?: string }

// Verificar cadena completa
const chainResult = await createAuditHashChain(tenantId, fromDate, toDate);
// → { valid: boolean, brokenAtIndex?: number, totalEntries, verifiedEntries, errors[] }
```

### 1.3 Script Forense

**Archivo:** `scripts/audit-tenant-chain.ts`

```bash
npx tsx scripts/audit-tenant-chain.ts <tenantId>
```

Verifica la integridad de toda la cadena de auditoría de un tenant, reportando:
- Número total de entradas
- Posición exacta de cualquier breach
- Detalle de cada inconsistencia

### 1.4 Audit Services Especializados

| Servicio | Archivo | Propósito |
|---|---|---|
| `AuditService` | `lib/audit-service.ts` | Auditoría general del sistema |
| `MarketingAuditService` | `lib/marketing/audit-service.ts` | Auditoría de acciones de marketing (campañas, redes sociales, decisiones IA) |
| `ChatbotAuditLogger` | `lib/agents/audit-logger.ts` | Auditoría de interacciones del chatbot (intenciones, skills ejecutados, tiempos) |
| `FiscalAuditService` | `lib/fiscal/audit-service.ts` | Auditoría forense fiscal con Veri*factu |
| `logAuditAction` | `lib/permissions.ts` | Helper simplificado para logging rápido |

### 1.5 Configuración

No requiere configuración adicional — el `AuditService.log()` se llama automáticamente desde:

- **API Routes:** Contacts, Leads, Deals, Cotizaciones, Contratos, Assets, Support Tickets, ERP Projects
- **Middleware:** `lib/tenant-middleware.ts` registra acceso a rutas protegidas
- **Skills:** `lib/skills/audit-skills.ts` registra auditorías financieras

---

<a id="2-docs"></a>
## 2. 📄 Gestión Documental Avanzada

### 2.1 Arquitectura

La gestión documental se compone de múltiples subsistemas integrados:

```
📁 Gestión Documental Volkern
├── 📄 WebCreator (Editor visual)
│   ├── Autosave cada 5s con versionado
│   └── Historial de versiones con restore
├── 📄 Contratos
│   ├── Generación dinámica desde plantillas
│   ├── Versionado por estado (borrador → enviado → firmado → vigente)
│   └── Firma digital integrada
├── 📄 Cotizaciones
│   ├── PDF descargable
│   ├── Enlace público con firma de aceptación
│   └── Historial de cambios
└── 📄 Documentos de calidad (NO CONFORMIDAD)
    └── Gestión con hash de integridad
```

### 2.2 WebCreator — Versionado de Documentos

**Archivos relevantes:**
- `components/webcreator/GrapesEditor.tsx`
- `components/webcreator/EditorSidebar.tsx`

El editor visual GrapesJS incluye:

- **Autosave cada 5 segundos** con detección de cambios
- **Historial de versiones** accesible desde el panel lateral
- **Restauración** a cualquier versión anterior
- **Templates predefinidos** por vertical (inmobiliaria, contabilidad, academia, etc.)

### 2.3 Contratos — Ciclo de Vida

**Archivo:** `app/dashboard/contratos/[id]/page.tsx`

```
Estado: borrador → enviado → firmado → vigente → vencido
                            ↓
                      (rechazado)
```

Cada transición de estado queda registrada en el audit log con:
- Quién realizó la acción
- Cuándo se realizó
- Cambios en los campos del contrato

### 2.4 Control de Accesos

El acceso a documentos está gobernado por:

1. **RLS (Row Level Security) por tenant** — Aísla datos entre clientes
2. **Roles y permisos** — Control granular por módulo (contratos: ver/crear/editar/eliminar/enviar)
3. **Enlaces públicos con token** — Para compartir documentos con firmantes externos sin autenticación

### 2.5 Configuración

No requiere configuración adicional. El versionado está activo por defecto en todos los módulos documentales.

---

<a id="3-firma"></a>
## 3. ✍️ Firma Digital + Evidencia

### 3.1 SignatureService

**Archivos:**
- `lib/security/signature-service.ts` — Firma nativa con hash SHA-256
- `lib/signatures/SignatureService.ts` — Integración con VolkernSign (API externa)

### 3.2 Firma Nativa (SHA-256 + Vault Seed)

**Hash de documento:**
```typescript
import { SignatureService } from '@/lib/security/signature-service';

// Generar hash del documento
const docHash = SignatureService.hashDocument(documentContent);

// Generar firma con seed del tenant
const signature = SignatureService.generateSignature(docHash, tenant.vaultSeed);

// Verificar integridad
const isValid = SignatureService.verifyIntegrity(docHash, signature, vaultSeed);
```

**Registro de firma (`digitalSignature`):**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String | ID único |
| `tenantId` | String | Tenant |
| `documentHash` | String | SHA-256 del documento |
| `signatureHash` | String | Firma generada |
| `entityType` | String | Tipo: `CONTRACT`, `PAYROLL`, `QUALITY_REPORT` |
| `entityId` | String | ID de la entidad firmada |
| `signedBy` | String? | Usuario que firmó |
| `signedAt` | DateTime | Momento de la firma |
| `vaultSeedVersion` | String | Versión del seed usado |
| `qrData` | String? | Datos para QR de verificación |

**Verificación pública:**
```typescript
// Endpoint público
GET /api/public/verify/:id
// → { valid: boolean, documentHash, signatureHash, signedAt, entityType }

// Endpoint soberano
GET /api/v1/sovereignty/verify/:id
// → Verificación completa con cadena de integridad
```

### 3.3 VolkernSign (Firma Externa)

**Archivo:** `lib/signatures/SignatureService.ts`

Integración con API de firma digital externa:

```typescript
const signatureRequest = await SignatureService.createSignatureRequest({
  tenantId,
  documentBuffer,    // Buffer del documento
  fileName,          // Nombre del archivo
  title,             // Título de la solicitud
  signers: [         // Firmantes
    { email: 'cliente@email.com', name: 'Cliente', role: 'signer' }
  ],
  leadId?,           // Lead asociado (opcional)
  contratoId?,       // Contrato asociado (opcional)
});
```

**Webhook** — `app/api/webhooks/signatures/route.ts`

Recibe notificaciones de VolkernSign cuando:
- El documento se ha visualizado
- Un firmante ha firmado
- El documento se ha completado

Cada evento se registra en `signatureAuditEvent` con hash encadenado:

```typescript
// Auditoría de eventos de firma
eventHash = sha256(`${request.id}-${eventType}-${prevEventHash}`)
```

### 3.4 Firma en Contratos Públicos

**Archivo:** `app/contrato/[token]/ContratoPublicView.tsx`

Los contratos se pueden firmar desde un enlace público:

```
POST /api/contratos/sign/:id
Body: { nombreFirma: string }
```

El sistema registra:
- `firmadoPorCliente` / `firmadoPorEmpresa`
- `nombreFirmaCliente` / `nombreFirmaEmpresa`
- `fechaFirmaCliente` / `fechaFirmaEmpresa`

### 3.5 Integridad Financiera

**Archivo:** `lib/security/integrity-service.ts`

Para registros financieros se usa un sistema de integridad encadenado:

```typescript
// Generar hash encadenado
const hash = await generateIntegrityHash(data, tenantId);
// → sha256(JSON.stringify(data) + lastHash)

// Verificar cadena completa
const isValid = await verifyFinancialIntegrity(tenantId);
// → true/false
```

### 3.6 Configuración

**Variables de entorno:**
```env
# Para VolkernSign (opcional — si no se configura, usa firma nativa)
NEXT_PUBLIC_APP_URL=https://tu-dominio.com
```

**Seed del vault** — Se genera automáticamente al crear el tenant (`tenant.vaultSeed`).

**Para activar VolkernSign:**
1. Ir a `Configuración → Documentos`
2. Configurar URL y API token de VolkernSign
3. Activar "Firma digital"

---

<a id="4-workflows"></a>
## 4. ⚙️ Workflows Controlados

### 4.1 ApprovalWorkflowService

**Archivo:** `lib/approval-workflow-service.ts`

Sistema de **workflows predefinidos con aprobación por roles**. Cada vez que un usuario intenta ejecutar una acción que supera un umbral, se crea automáticamente una solicitud de aprobación.

### 4.2 Reglas Predefinidas (10 reglas)

| ID | Regla | Categoría | Umbral | Requiere Rol | Prioridad |
|---|---|---|---|---|---|
| `expense-high` | Gastos > €500 | EXPENSE | >500€ | Manager | MEDIUM |
| `expense-critical` | Gastos > €2,000 | EXPENSE | >2.000€ | Admin | HIGH |
| `deal-large` | Deals > €10,000 | DEAL | >10.000€ | Admin | HIGH |
| `deal-enterprise` | Deals > €50,000 | DEAL | >50.000€ | Superadmin | CRITICAL |
| `contract-signing` | Firma de contratos | CONTRACT | — | Manager | MEDIUM |
| `vacation-long` | Vacaciones > 5 días | VACATION | >5 días | Manager | LOW |
| `budget-change` | Cambio presupuestario > €1,000 | BUDGET | >1.000€ | Admin | HIGH |
| `discount-high` | Descuento > 20% | DISCOUNT | >20% | Manager | MEDIUM |
| `quality-nonconformity` | No conformidad calidad | QUALITY | — | Manager | HIGH |
| `production-order-change` | Cambio orden producción | PRODUCTION | — | Admin | MEDIUM |

### 4.3 Jerarquía de Aprobación

```
OWNER (5)       → Puede aprobar todo
Superadmin (4)  → Puede aprobar todo
Admin (3)       → Puede aprobar Manager y Agent
Manager (2)     → Puede aprobar Agent
Agent (1)       → No puede aprobar
Viewer (0)      → No puede aprobar
```

**Auto-aprobación:** Si el usuario solicitante tiene nivel >= 3 (Admin+) y su nivel es >= al nivel requerido, la acción se auto-aprueba sin crear solicitud.

### 4.4 API de Aprobaciones

**`GET /api/aprobaciones`** — Listar solicitudes

| Parámetro | Tipo | Descripción |
|---|---|---|
| `type` | `pending` / `history` / `mine` | Filtro |
| `role` | string | Filtrar por rol del aprobador |
| `userId` | string | Para type=mine |

**Respuesta:**
```json
{
  "success": true,
  "data": [ ... ApprovalRequest[] ],
  "stats": {
    "pending": 5,
    "approved": 42,
    "rejected": 3,
    "total": 50,
    "approvalRate": 84,
    "pendingByCategory": [
      { "category": "EXPENSE", "count": 3, "label": "Gastos" }
    ]
  },
  "rules": [ ... WorkflowRule[] ]
}
```

**`POST /api/aprobaciones`** — Crear solicitud

```json
Body: {
  "category": "EXPENSE",
  "title": "Compra de equipos",
  "description": "3 monitores 4K para diseño",
  "amount": 1500,
  "currency": "EUR"
}
```

**`PATCH /api/aprobaciones/:id`** — Aprobar o rechazar

```json
Body: { "action": "approve", "note": "Autorizado" }
Body: { "action": "reject", "note": "Presupuesto insuficiente" }
```

### 4.5 Dashboard de Aprobaciones

**Ruta:** `/dashboard/aprobaciones`

Tres tabs:
- **Pendientes** — Solicitudes activas con botones de aprobar/rechazar
- **Historial** — Solicitudes resueltas (aprobadas/rechazadas)
- **Reglas** — Listado de todas las reglas predefinidas activas

### 4.6 Integración con Auditoría

Cada acción del sistema de aprobaciones genera un audit log:
- `APPROVAL_REQUESTED` — Cuando se crea la solicitud
- `APPROVAL_APPROVED` — Cuando se aprueba
- `APPROVAL_REJECTED` — Cuando se rechaza

### 4.7 Configuración

Las reglas se pueden modificar directamente en `lib/approval-workflow-service.ts` en el array `PREDEFINED_RULES`. No requieren migración de base de datos.

**Para añadir una nueva regla:**
```typescript
{
  id: 'expense-xlarge',
  name: 'Gastos > €10,000',
  category: 'EXPENSE',
  description: 'Gastos mayores a 10.000€ requieren aprobación del Superadmin',
  condition: 'monto > 10.000€',
  requiredRole: 'Superadmin',
  amountThreshold: 10000,
  priority: 'CRITICAL',
  active: true,
}
```

### 4.8 Executive Governance

**Archivo:** `components/strategy/ExecutiveGovernance.tsx`

Panel de gobierno ejecutivo que permite:
- Registrar decisiones estratégicas con firma digital
- Cada acción del Autopilot requiere firma SHA-256
- Sello de aprobación con trazabilidad completa

---

<a id="5-roles"></a>
## 5. 👥 Control de Roles y Permisos

### 5.1 Arquitectura RBAC

```
User → Role → Permissions (por módulo)
        ↓
  5 roles predefinidos
  Superadmin | Admin | Sales Agent | Support | Instructor
```

**Modelo `Role` (Prisma):**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String | ID único |
| `tenantId` | String | Tenant |
| `nombre` | String | Nombre del rol |
| `descripcion` | String? | Descripción |
| `permisos` | Json | Mapa de permisos por módulo y acción |
| `esPersonalizado` | Boolean | Si es un rol custom |
| `orden` | Int | Para ordenamiento |

### 5.2 Seed de Roles

**Script:** `scripts/seed-roles.ts`

```bash
npx tsx scripts/seed-roles.ts
```

**Permisos granulares por módulo:**

```typescript
type PermissionModule =
  | 'leads' | 'citas' | 'pipeline' | 'contactos' | 'empresas'
  | 'estudiantes' | 'cursos' | 'automatizaciones' | 'campanas'
  | 'mensajes' | 'analytics' | 'configuracion' | 'equipo'
  | 'integraciones' | 'pages' | 'whitelabel';

type PermissionAction =
  | 'ver' | 'crear' | 'editar' | 'eliminar' | 'asignar'
  | 'exportar' | 'gestionar' | 'inscribir' | 'publicar'
  | 'activar' | 'enviar' | 'responder' | 'invitar';
```

### 5.3 Matriz de Permisos

| Módulo | Superadmin | Admin | Sales Agent | Support | Instructor |
|---|---|---|---|---|---|
| leads | CRUD+Asignar | CRUD+Asignar | Leer/Crear/Editar | Solo Leer | ❌ |
| citas | CRUD+Exportar | CRUD+Exportar | CRUD | Leer/Crear/Editar | Leer/Crear/Editar |
| pipeline | CRUD+Exportar | CRUD+Exportar | CRUD | ❌ | ❌ |
| contactos | CRUD+Exportar | CRUD+Exportar | CRUD | Leer | ❌ |
| estudiantes | CRUD+Inscribir | CRUD+Inscribir | ❌ | Leer/Editar | CRUD+Inscribir |
| cursos | CRUD+Publicar | CRUD+Publicar | ❌ | ❌ | CRUD+Publicar |
| configuracion | Total | Ver/Editar | ❌ | ❌ | ❌ |
| equipo | Total | CRUD+Invitar | ❌ | Solo Leer | ❌ |

### 5.4 Middleware RBAC

**Archivo:** `lib/rbac-middleware.ts`

Protección de API routes con decoradores:

```typescript
import { withRBAC } from '@/lib/rbac-middleware';

// Proteger por permiso específico
export const GET = withRBAC(
  { permission: 'ver', module: 'leads' },
  async (req, user) => { ... }
);

// Proteger por rol
export const GET = withRBAC(
  { roles: ['Admin', 'Superadmin'] },
  async (req, user) => { ... }
);

// Proteger por permisos múltiples (cualquiera)
export const GET = withRBAC(
  { permissions: [
    { permission: 'ver', module: 'leads' },
    { permission: 'ver', module: 'contactos' }
  ], mode: 'any' },
  async (req, user) => { ... }
);
```

**Middlewares disponibles:**

| Función | Descripción |
|---|---|
| `requirePermission(permission, module)` | Requiere permiso específico |
| `requireAnyPermission(checks[])` | Requiere ALGUNO de los permisos |
| `requireAllPermissions(checks[])` | Requiere TODOS los permisos |
| `requireRole(roles[])` | Requiere uno de los roles |
| `requireOwner(getResource)` | Verifica propiedad del recurso |
| `withRBAC(requirement, handler)` | Decorator para API routes |
| `chainMiddlewares(...mws)` | Encadena múltiples middlewares |

### 5.5 Permission Check en Cliente

**Archivo:** `lib/permissions.ts`

```typescript
import { hasPermission, canViewModule, getVisibleModules } from '@/lib/permissions';

// Verificar permiso
if (hasPermission(user, 'leads', 'editar')) { ... }

// Verificar acceso a módulo
if (canViewModule(user, 'analytics')) { ... }

// Obtener módulos visibles
const modules = getVisibleModules(user);
```

### 5.6 Filtro en Sidebar

**Archivo:** `components/sidebar.tsx`

La navegación del dashboard se filtra automáticamente según:
1. **Módulos activos del plan** — Si el módulo no está contratado, se oculta
2. **Región** — Items marcados con `requiredRegion` (MX/ES/CO)
3. **Tipo de cuenta** — AGENCY / BUSINESS
4. **Permisos de rol** — `userPermissions[module].ver === false` oculta el item

### 5.7 Configuración

**Para seed inicial de roles:**
```bash
npx tsx scripts/seed-roles.ts
```

**Desde el dashboard:** `Equipo → Roles y Permisos`
- Gestionar roles existentes
- Crear roles personalizados
- Asignar roles a usuarios

---

<a id="6-reportes"></a>
## 6. 📊 Reportes de Auditoría

### 6.1 API de Reportes

**`GET /api/admin/audit`** — Obtener historial de auditoría con estadísticas

```json
{
  "success": true,
  "logs": [ ... AuditLog[] ],
  "stats": {
    "totalLogs": 1500,
    "totalUsers": 25,
    "uniqueActions": 12,
    "last24h": 45,
    "topEntities": [
      { "entidad": "Lead", "count": 500 },
      { "entidad": "Contact", "count": 300 }
    ],
    "logsByDay": [
      { "date": "2026-06-01", "count": 120 }
    ]
  },
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1500
  }
}
```

### 6.2 Exportación de Auditoría

**`GET /api/admin/audit/export`** — Exportar historial

| Parámetro | Tipo | Descripción |
|---|---|---|
| `tenantId` | string | Filtrar por tenant |
| `userId` | string | Filtrar por usuario |
| `entity` | string | Filtrar por entidad (Lead, Contact, etc.) |
| `action` | string | Filtrar por acción |
| `fromDate` | ISO date | Desde |
| `toDate` | ISO date | Hasta |
| `format` | `json` / `csv` | Formato de exportación |

### 6.3 GDPR — Exportación de Datos de Usuario

**`GET /api/admin/audit/gdpr/export`**

```json
{
  "userId": "user_xxx",
  "tenantId": "tenant_xxx",
  "exportDate": "2026-06-16T...",
  "totalEntries": 250,
  "entries": [
    { "id": "...", "action": "LEAD_CREATED", "timestamp": "...", "ipAddress": "..." }
  ]
}
```

### 6.4 GDPR — Anonimización de Usuario

**`POST /api/admin/audit/gdpr/anonymize`**

```json
Body: { "userId": "user_xxx" }
Response: { "anonymizedCount": 250 }
```

Anonimiza los logs del usuario: elimina el `userId` del registro pero mantiene la entrada de auditoría. El ID original se guarda en `metadata.originalUserId`.

### 6.5 Verificación de Sellos

**Archivo:** `scripts/verify-ticket-integrity.ts`

```bash
npx tsx scripts/verify-ticket-integrity.ts
```

Script que verifica la integridad de todos los sellos de auditoría (tickets de soporte).

### 6.6 Audit Logs Viewer

**Archivo:** `components/audit-logs-viewer.tsx`

Componente de UI para visualizar logs de auditoría con:
- Filtros por fecha, acción, entidad, usuario
- Paginación
- Exportación a CSV
- Indicador visual de integridad (verde = íntegro, rojo = manipulado)

### 6.7 Configuración

No requiere configuración adicional. Los datos se exportan directamente desde los logs de auditoría.

---

<a id="7-alertas"></a>
## 7. 🔔 Alertas y Monitoreo

### 7.1 Sistema de Alertas (SystemAlert)

**Modelo Prisma:**
```prisma
model SystemAlert {
  id          String    @id @default(cuid())
  level       String    // 'INFO' | 'WARNING' | 'URGENT'
  message     String
  auditId     String?
  resolved    Boolean   @default(false)
  resolvedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### 7.2 Alertas de Seguridad

**Archivo:** `lib/security/integrity-service.ts`

```typescript
import { reportSecurityIncident } from '@/lib/security/integrity-service';

await reportSecurityIncident({
  tenantId,
  type: 'UNAUTHORIZED_ACCESS',
  severity: 'HIGH',       // CRITICAL | HIGH | MEDIUM | LOW
  details: 'Intento de acceso a recurso sin permisos desde IP x.x.x.x'
});
```

### 7.3 Protocolo de Desconfianza (Veri*factu)

**Archivo:** `lib/erp/audit-log-service.ts` / `lib/skills/audit-skills.ts`

Cuando `audit_finance_integrity` detecta una breach de integridad:

1. Se crea una `SystemAlert` con nivel `URGENT`
2. Se envía notificación por **Telegram** al chat del admin
3. Se registra en el log de skills con detalle de todas las brechas
4. El dashboard de calidad muestra el estado "COMPROMETIDA"

```typescript
const result = await audit_finance_integrity({ tenantId });
// → { status: 'ÍNTEGRA' | 'COMPROMETIDA', invoiceAudit, expenseBreaches, ledgerAudit }
```

### 7.4 Monitoreo de SLA (Soporte)

**Archivo:** `lib/support/sla-monitor.ts`

Monitor de SLA que:
- Calcula tiempo de respuesta vs objetivo
- Dispara alertas cuando se supera el umbral
- Escala automáticamente si se viola el SLA crítico
- Registra cada acción en el audit log

### 7.5 Alertas de Inventario

**Archivo:** `components/operations/inventory-watchdog.tsx`

Watchdog de inventario con:
- Alertas de stock bajo
- Predicciones de ruptura de stock
- Notificaciones de pedidos pendientes

### 7.6 Alertas de RRHH

- Gastos de empleados que exceden umbrales
- Solicitudes de vacaciones pendientes
- Cuotas de contratación alcanzadas

### 7.7 Alertas de Logística

- Mantenimiento de vehículos programado
- ITV próxima a vencer
- Capacidad de almacenes al límite

### 7.8 Canal de Denuncias (Igualdad y Transparencia)

**Archivo:** `components/equality/EqualityConfigSection.tsx`

- Buzón confidencial de denuncias
- Todas las denuncias se firman digitalmente con SHA-256
- Configuración de notificaciones por Telegram
- Registro inmutable en audit log

### 7.9 Configuración de Notificaciones

**Archivo:** `components/dashboard/notifications/NotificationConfig.tsx`

Canales disponibles:
- **Telegram** — Mensajes directos con bot token y chat ID
- **Slack** — Webhook URL
- **Email** — Notificaciones por correo
- **In-app** — Bandeja de notificaciones en el dashboard

---

## Apéndice A: Mapa de Archivos

| Feature | Archivos Clave |
|---|---|
| Trazabilidad | `lib/audit-service.ts`, `lib/audit-hash.ts`, `scripts/audit-tenant-chain.ts` |
| Gestión Documental | `components/webcreator/GrapesEditor.tsx`, `app/dashboard/contratos/` |
| Firma Digital | `lib/security/signature-service.ts`, `lib/signatures/SignatureService.ts` |
| Workflows | `lib/approval-workflow-service.ts`, `app/dashboard/aprobaciones/` |
| Roles y Permisos | `lib/permissions.ts`, `lib/rbac-middleware.ts`, `scripts/seed-roles.ts` |
| Reportes | `app/api/admin/audit/`, `components/audit-logs-viewer.tsx` |
| Alertas | `lib/security/integrity-service.ts`, `lib/skills/audit-skills.ts` |

## Apéndice B: Variables de Entorno

```env
# Opcional — URL para logging externo de auditoría fiscal
EXTERNAL_AUDIT_LOG_URL=https://...

# Requerido para VolkernSign
NEXT_PUBLIC_APP_URL=https://tu-dominio.com
```

## Apéndice C: Comandos Útiles

```bash
# Seed de roles
npx tsx scripts/seed-roles.ts

# Verificar cadena de auditoría de un tenant
npx tsx scripts/audit-tenant-chain.ts <tenantId>

# Verificar integridad de tickets
npx tsx scripts/verify-ticket-integrity.ts

# Verificar firma digital
npx tsx scripts/verify-signature.ts

# Test de firma digital
npx tsx scripts/test-digital-signature.ts
```
