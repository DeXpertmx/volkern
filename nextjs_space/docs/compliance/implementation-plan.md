# 📋 Plan de Implementación — VOLKERN COMPLIANCE PRO

> **Estado:** Análisis completado | **Prioridad:** Alta
> **Base:** 80% del código ya existe → falta arquitectura de control y empaquetado comercial

---

## Resumen Ejecutivo

| Métrica | Valor |
|---|---|
| Código existente aprovechable | **~80%** |
| Nuevo código requerido | **~20%** |
| Esfuerzo estimado | **2-3 semanas** |
| Módulos afectados | 12 archivos nuevos + 8 modificaciones |
| Pricing objetivo | €150–€800/mes como upgrade |

---

## 🎯 Diagnóstico: Lo que YA existe vs. lo que FALTA

### ✅ Punto 1: Trazabilidad Total — **95% LISTO**

| Sub-item | Estado | Archivos |
|---|---|---|
| AuditLog con SHA-256 encadenado | ✅ Completo | `lib/audit-service.ts`, `lib/audit-hash.ts` |
| Logs por usuario/entidad | ✅ Completo | Integrado en +15 API routes |
| Exportación CSV/JSON | ✅ Completo | `app/api/admin/audit/export/route.ts` |
| Dashboard de auditoría | ✅ Completo | `app/admin/auditoria/` |
| Certificado de cumplimiento | ✅ Completo | `components/admin/CertificadoCumplimiento.tsx` |
| Verificación de cadena forense | ✅ Completo | `scripts/audit-tenant-chain.ts` |
| **🔴 GDPR: frontend de exportación/anonimización** | ❌ No tiene UI de usuario | APIs existen, falta UI en dashboard |
| **🔴 Historial visible para el cliente** | ❌ Solo en admin | Falta página en `/dashboard/auditoria` |

### ✅ Punto 2: Gestión Documental — **85% LISTO**

| Sub-item | Estado | Archivos |
|---|---|---|
| WebCreator con versionado | ✅ Completo | `components/webcreator/` |
| Contratos con ciclo de vida | ✅ Completo | `app/dashboard/contratos/` |
| Firma digital integrada | ✅ Completo | `lib/security/signature-service.ts` |
| Control de accesos por rol | ✅ Completo | `lib/permissions.ts`, `lib/rbac-middleware.ts` |
| **🔴 Procesos obligatorios** | ❌ No existen | Ver Punto 1 de la estrategia |

### ✅ Punto 3: Firma Digital — **90% LISTO**

| Sub-item | Estado | Archivos |
|---|---|---|
| Firma SHA-256 nativa | ✅ Completo | `lib/security/signature-service.ts` |
| VolkernSign (API externa) | ✅ Completo | `lib/signatures/SignatureService.ts` |
| Contratos públicos con firma | ✅ Completo | `app/contrato/[token]/ContratoPublicView.tsx` |
| QR de verificación | ✅ Completo | `components/sovereignty/DigitalSignatureStatus.tsx` |
| **🔴 Evidencia descargable (PDF sellado)** | ❌ Parcial | Existe para facturas, falta para compliance |

### ✅ Punto 4: Workflows Controlados — **75% LISTO**

| Sub-item | Estado | Archivos |
|---|---|---|
| 10 reglas predefinidas | ✅ Nuevo | `lib/approval-workflow-service.ts` |
| API de aprobaciones | ✅ Nuevo | `app/api/aprobaciones/` |
| Dashboard de aprobaciones | ✅ Nuevo | `app/dashboard/aprobaciones/` |
| Executive Governance | ✅ Completo | `components/strategy/ExecutiveGovernance.tsx` |
| **🔴 Procesos NO evitables** | ❌ Crítico | **No existe el concepto de "gate" obligatorio** |
| **🔴 Bloqueo de acciones si no se cumple** | ❌ Crítico | Las reglas existen pero no se aplican forzosamente |

### ✅ Punto 5: Control de Roles — **95% LISTO**

| Sub-item | Estado | Archivos |
|---|---|---|
| 5 roles predefinidos | ✅ Completo | `scripts/seed-roles.ts` |
| Permisos granulares (16 módulos) | ✅ Completo | `lib/permissions.ts` |
| Middleware RBAC para APIs | ✅ Completo | `lib/rbac-middleware.ts` |
| Sidebar filtra por permisos | ✅ Completo | `components/sidebar.tsx` |
| Gestión visual de roles | ✅ Completo | `components/RoleManagement.tsx` |

### ✅ Punto 6: Reportes de Auditoría — **80% LISTO**

| Sub-item | Estado | Archivos |
|---|---|---|
| API de exportación | ✅ Completo | `app/api/admin/audit/` |
| Audit Logs Viewer | ✅ Completo | `components/audit-logs-viewer.tsx` |
| Certificado de cumplimiento | ✅ Completo | `components/admin/CertificadoCumplimiento.tsx` |
| **🔴 Score de cumplimiento** | ❌ Nuevo | Falta dashboard ejecutivo con % global |
| **🔴 Reportes agendados (PDF por email)** | ❌ Nuevo | Envío automático de reportes |

### ✅ Punto 7: Alertas y Monitoreo — **70% LISTO**

| Sub-item | Estado | Archivos |
|---|---|---|
| SystemAlert CRUD | ✅ Completo | Integrado en admin auditoría |
| Protocolo de Desconfianza | ✅ Completo | `lib/skills/audit-skills.ts` |
| Alertas de inventario | ✅ Completo | `components/operations/inventory-watchdog.tsx` |
| Notificaciones Telegram/Slack | ✅ Completo | `components/dashboard/notifications/` |
| **🔴 Alertas inteligentes (acciones fuera de flujo)** | ❌ Nuevo | Detección de anomalías en tiempo real |
| **🔴 Panel de alertas visible en dashboard** | ❌ Nuevo | Solo visible en admin, no en dashboard usuario |

### Webhooks — **90% LISTO**

| Sub-item | Estado | Archivos |
|---|---|---|
| Incoming webhooks | ✅ Completo | `app/api/webhooks/incoming/` |
| Outgoing webhooks (14 eventos) | ✅ Completo | `lib/outgoing-webhooks.ts` |
| HMAC signature | ✅ Completo | Con retry exponencial |
| UI de gestión | ✅ Completo | `app/[tenant]/dashboard/integraciones/webhooks-salientes/` |
| Integración n8n | ✅ Completo | `app/[tenant]/dashboard/integraciones/n8n/` |
| **🔴 Audit logging de webhooks** | ❌ Parcial | Se registran deliveries pero no en el audit chain |

### Pricing — **ESTRUCTURA ACTUAL**

| Plan | Precio | Compliance incluido |
|---|---|---|
| Esencial | €69/mes | ❌ Solo trazabilidad básica |
| Profesional | €149/mes | ❌ Trazabilidad + roles |
| Infinity | €299/mes | ❌ Trazabilidad + roles + firmas |
| **🔴 Compliance PRO** | **€150–€800** | **❌ No existe como producto** |

---

## 🧱 Plan de Implementación

### 🔴 PRIORIDAD 1: "Procesos No Evitables" (3-4 días)

**El cambio más importante de todo el plan.**

#### Arquitectura

```
Acción del usuario
    ↓
[Compliance Gate] ← verifica reglas activas
    ├── ✅ Todo OK → acción permitida + audit log
    └── ❌ Bloqueado → mensaje + crear ApprovalRequest
```

#### Archivos a crear

| Archivo | Descripción |
|---|---|
| `lib/compliance-gate.ts` | **Motor de gates.** Evalúa si una acción está permitida según el modo actual y las reglas activas |
| `lib/compliance-rules.ts` | **Reglas de compliance.** Definiciones de qué acciones requieren pasos previos obligatorios |

#### Ejemplos de reglas "no evitables"

```
❌ Cerrar un deal sin contrato firmado
❌ Enviar cotización sin aprobación (si monto > umbral)
❌ Facturar sin orden de venta aprobada
❌ Avanzar pipeline sin completar tareas obligatorias
❌ Eliminar contacto sin justificación escrita
❌ Modificar presupuesto sin aprobación
```

#### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `app/api/deals/route.ts` | Añadir verificación de complianceGate antes de cerrar deal |
| `app/api/cotizaciones/route.ts` | Verificar que el deal tenga contrato firmado antes de avanzar |
| `app/api/pipeline/route.ts` | Verificar tareas obligatorias completadas antes de cambiar etapa |
| `app/api/contratos/route.ts` | Verificar firma antes de marcar como vigente |

### 🔴 PRIORIDAD 2: "Modos de Control" (2-3 días)

#### Arquitectura

```
Tenant
└── complianceMode: 'normal' | 'compliance'
    ├── Modo Normal → sistema flexible (como ahora)
    └── Modo Compliance → gates activos + trazabilidad forzada
```

#### Archivos a crear

| Archivo | Descripción |
|---|---|
| `lib/compliance-mode.ts` | Servicio para gestionar el modo activo |
| `app/api/tenant/compliance-mode/route.ts` | API para cambiar modo |
| `components/compliance/ComplianceModeToggle.tsx` | UI Toggle con confirmación y auditoría |
| `components/compliance/ComplianceBadge.tsx` | Badge visible en todo el dashboard indicando el modo activo |

#### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `lib/plans.ts` | Añadir `compliance_mode` a `PLAN_LIMITS` |
| `components/sidebar.tsx` | Mostrar badge de modo activo |
| `app/api/tenant/modules/route.ts` | Incluir complianceMode en respuesta |

### 🔴 PRIORIDAD 3: "Score de Cumplimiento" (2-3 días)

#### Dashboard ejecutivo con métricas en tiempo real

```
Score Global: 87% ──── Excelente
├── 🛡️ Trazabilidad:      95% (12,450 registros, cadena intacta)
├── 📄 Documentación:      82% (45/55 contratos firmados)
├── ⚙️ Procesos:          78% (14/18 workflows completados)
├── 👥 Roles:             100% (todos los usuarios tienen rol)
└── 🚨 Alertas:           3 activas (1 crítica, 2 warnings)
```

#### Archivos a crear

| Archivo | Descripción |
|---|---|
| `lib/compliance-score.ts` | Motor de cálculo de score con pesos configurables |
| `app/api/compliance/score/route.ts` | API del score |
| `app/dashboard/compliance/page.tsx` | Dashboard de compliance visible para el usuario |
| `components/compliance/ScoreGauge.tsx` | Componente de gauge visual |
| `components/compliance/ScoreBreakdown.tsx` | Desglose por categoría |

### 🔴 PRIORIDAD 4: "Alertas Inteligentes" (2-3 días)

#### Tipos de alertas a implementar

| Alerta | Disparador | Severidad |
|---|---|---|
| Acción fuera de flujo | Usuario intenta saltar un paso obligatorio | HIGH |
| Acceso inusual | Mismo usuario >10 acciones/minuto en módulo crítico | MEDIUM |
| Proceso incompleto | Workflow iniciado pero no completado en >48h | LOW |
| Cambio crítico sin aprobación | Modificación de entidad >umbral sin ApprovalRequest | CRITICAL |
| Cadena de auditoría comprometida | verifyFinancialIntegrity() retorna false | URGENT |

#### Archivos a crear

| Archivo | Descripción |
|---|---|
| `lib/compliance-alerts.ts` | Motor de detección y disparo de alertas inteligentes |
| `components/compliance/AlertTimeline.tsx` | Timeline visual de alertas |
| `components/compliance/AlertRulesConfig.tsx` | Configuración de umbrales por alerta |

### 🔴 PRIORIDAD 5: "Paquetización Compliance PRO" (2-3 días)

#### Definición del upgrade

```typescript
COMPLIANCE_PRO: {
  price: { monthly: 199, yearly: 1910 }, // Ejemplo: Profesional +150€
  requires: 'profesional', // Solo disponible en planes ≥ Profesional
  features: [
    'Modo Compliance (control estricto)',
    'Procesos obligatorios no evitables',
    'Score de cumplimiento en tiempo real',
    'Alertas inteligentes con notificaciones',
    'Panel de auditoría para el cliente',
    'Exportación de reportes certificados',
    'Webhooks auditables con trazabilidad',
    'Historial visible en dashboard',
  ]
}
```

#### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `lib/plans.ts` | Añadir `compliance_pro` como add-on o plan |
| `components/public/Pricing.tsx` | Añadir tarjeta de Compliance PRO |
| `app/api/subscriptions/limits/check/route.ts` | Verificar acceso a compliance |
| `lib/onboarding-modules.ts` | Añadir módulo `compliance_pro` |

### 🟡 PRIORIDAD 6: "Webhooks Auditables" (1 día)

#### Reposicionamiento comercial

> ~~Webhooks~~ → **"Integración con sistemas externos y auditoría conectada"**

#### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `lib/outgoing-webhooks.ts` | Añadir logging de cada webhook en audit chain |
| `components/dashboard/integraciones/WebhookComplianceSection.tsx` | Nueva sección de auditoría de webhooks |

### 🟡 PRIORIDAD 7: "Landing Compliance PRO" (1-2 días)

#### Archivos a crear

| Archivo | Descripción |
|---|---|
| `components/public/ComplianceProLanding.tsx` | Landing page para Compliance PRO |
| `app/compliance-pro/page.tsx` | Ruta pública |

---

## 📐 Arquitectura Técnica

### Compliance Gate — Flujo

```typescript
// lib/compliance-gate.ts
class ComplianceGate {
  static async check(
    tenantId: string,
    action: ComplianceAction,
    context: ActionContext
  ): Promise<GateResult> {
    // 1. Obtener modo del tenant
    const mode = await getComplianceMode(tenantId);
    if (mode === 'normal') return { allowed: true };

    // 2. Evaluar reglas aplicables
    const rules = getRulesForAction(action);
    for (const rule of rules) {
      const result = await rule.evaluate(context);
      if (!result.allowed) {
        // 3. Bloquear + registrar + notificar
        await createBlockedActionAudit(tenantId, action, context, result);
        return {
          allowed: false,
          reason: result.reason,
          requiredAction: result.requiredAction,  // "Firma el contrato primero"
        };
      }
    }

    return { allowed: true };
  }
}
```

### Compliance Score — Fórmula

```
Score = Σ(peso_categoria × score_categoria) / Σ(pesos)

Categorías y pesos sugeridos:
  Trazabilidad (25%):  % de entidades con audit log completo
  Documentación (20%): % de procesos con documentos firmados
  Procesos (25%):      % de workflows completados sin saltos
  Roles (15%):         % de usuarios con rol asignado
  Alertas (15%):       1 - (alertas_criticas × 0.1 / total_usuarios)
```

### Modos de Control — Estados

```typescript
type ComplianceMode = 
  | 'normal'      // Sin restricciones (comportamiento actual)
  | 'compliance'  // Gates activos + trazabilidad forzada

// Transiciones requieren:
// normal → compliance: cualquier Admin
// compliance → normal: Superadmin + justificación escrita + audit log
```

---

## 📦 Roadmap de Implementación

### Semana 1: Fundación (P1 + P2)

| Día | Tarea | Archivos |
|---|---|---|
| 1-2 | **Compliance Gate** — Motor de reglas obligatorias | `lib/compliance-gate.ts`, `lib/compliance-rules.ts` |
| 2-3 | **Integrar gates en APIs clave** (deals, contratos, pipeline) | 4 API routes |
| 3-4 | **Modos de Control** — Toggle + middleware | `lib/compliance-mode.ts`, toggle UI |

### Semana 2: Producto (P3 + P4)

| Día | Tarea | Archivos |
|---|---|---|
| 5-6 | **Score de Cumplimiento** — Motor + dashboard | `lib/compliance-score.ts`, dashboard |
| 6-7 | **Alertas Inteligentes** — Detección + timeline | `lib/compliance-alerts.ts`, componentes |
| 7-8 | **Panel de auditoría para cliente** | `app/dashboard/compliance/page.tsx` |

### Semana 3: Comercial (P5 + P6 + P7)

| Día | Tarea | Archivos |
|---|---|---|
| 9-10 | **Paquetización** — Plans + pricing + checkout | `lib/plans.ts`, `Pricing.tsx` |
| 10-11 | **Webhooks auditables** | `lib/outgoing-webhooks.ts` |
| 11-12 | **Landing Compliance PRO** | Landing page + documentación |

---

## 💰 Estrategia de Pricing Recomendada

| Plan | Precio Base | Compliance PRO | Total |
|---|---|---|---|
| Esencial + Compliance | €69 + €99 | **€168/mes** ↓ |
| Profesional + Compliance | €149 + €99 | **€248/mes** |
| Infinity + Compliance | €299 + €150 | **€449/mes** |
| Enterprise (todo incluido) | — | **€600–€800/mes** |

**Trigger de venta:** Cuando el cliente diga "tenemos equipo", "necesitamos control", "queremos demostrar" → ahí entra Compliance PRO.

---

## 📁 Resumen de Archivos

### Nuevos (12-15 archivos)

```
lib/compliance-gate.ts          ← Motor de gates obligatorios
lib/compliance-rules.ts         ← Reglas de compliance predefinidas
lib/compliance-mode.ts          ← Gestión de modos normal/compliance
lib/compliance-score.ts         ← Cálculo de score de cumplimiento
lib/compliance-alerts.ts        ← Alertas inteligentes
app/api/tenant/compliance-mode/route.ts
app/api/compliance/score/route.ts
app/dashboard/compliance/page.tsx   ← Dashboard visible para cliente
components/compliance/ComplianceModeToggle.tsx
components/compliance/ComplianceBadge.tsx
components/compliance/ScoreGauge.tsx
components/compliance/ScoreBreakdown.tsx
components/compliance/AlertTimeline.tsx
components/compliance/AlertRulesConfig.tsx
components/public/ComplianceProLanding.tsx
```

### Modificaciones (8-10 archivos)

```
lib/plans.ts                    ← Añadir compliance_pro
lib/outgoing-webhooks.ts        ← Audit chain logging
lib/onboarding-modules.ts       ← Nuevo módulo compliance
components/public/Pricing.tsx   ← Tarjeta Compliance PRO
app/api/deals/route.ts          ← Compliance gate
app/api/contratos/route.ts      ← Compliance gate
app/api/pipeline/route.ts       ← Compliance gate
app/api/cotizaciones/route.ts   ← Compliance gate
components/sidebar.tsx          ← Badge de modo activo
```

---

## 🔥 Recomendación Final

**El 80% del código ya existe.** Lo que falta no es tecnología — es **arquitectura de control**:

1. Los procesos existen → hay que hacerlos **obligatorios** (Compliance Gate)
2. La trazabilidad existe → hay que hacerla **visible** (Score Dashboard)
3. Las alertas existen → hay que hacerlas **inteligentes** (Anomaly Detection)
4. Todo existe → hay que **empaquetarlo y venderlo** (Compliance PRO)

**Estimación total: 2-3 semanas** para pasar de "80% producto, 40% monetización" a "80% producto, 90% monetización".
