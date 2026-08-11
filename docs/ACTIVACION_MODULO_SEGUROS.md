# Activación del Módulo Insurance (Seguros)

> Guía operativa: cómo el superadmin activa/desactiva el módulo **Seguros** por tenant,
> cómo el seed de planes lo publica en `subscriptionPlan`, y cómo verificar que el hub
> aparece en el dashboard.
>
> Aplica desde el commit `520fc4e` (feat(seguros): integrar módulo Insurance).

---

## 📐 Índice

1. [Cómo funciona la activación (jerarquía)](#1-cómo-funciona-la-activación-jerarquía)
2. [API del Superadmin — override por tenant](#2-api-del-superadmin--override-por-tenant)
3. [Seed de `subscriptionPlan` — insurance en los planes](#3-seed-de-subscriptionplan--insurance-en-los-planes)
4. [Verificar que el hub aparece](#4-verificar-que-el-hub-aparece)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Cómo funciona la activación (jerarquía)

El módulo **insurance** se activa si está presente en los **módulos activos del tenant**.
La resolución es en dos capas, en este orden:

```
getActiveModules(plan, tenantFeatures)
        │
        ├─ 1. Módulos del PLAN  →  getPlanConfig(plan).modules
        │        (subscriptionPlan en BD, o fallback PLAN_MODULES en lib/plans.ts)
        │
        └─ 2. Overrides por tenant →  tenantFeature (feature, habilitado, razon)
                 habilitado=true  → añade el módulo (incluso si no está en el plan)
                 habilitado=false → lo quita (incluso si está en el plan)
```

- **`lib/plans.ts` → `isModuleActive(moduleId, plan, tenantFeatures)`** es lo que usan los
  skills del chatbot para decidir si un intent de Seguros está permitido.
- **`lib/navigation-config.ts`** define el hub `seguros` con `requiredModule: 'insurance'`,
  y el sidebar (`components/sidebar.tsx`) lo oculta si el módulo no está en `activeModules`.

> **Regla de oro:** la vía normal es que el módulo venga en el plan. El `tenantFeature`
> override es la excepción: sirve para activar/desactivar **manualmente** un módulo
> concreto de un tenant, por encima del plan.

---

## 2. API del Superadmin — override por tenant

Endpoint: `PATCH /api/admin/tenants/[id]/modules` (solo rol `Superadmin`).

### 2.1 Activar insurance en un tenant

```bash
curl -X PATCH "https://volkern.app/api/admin/tenants/<TENANT_ID>/modules" \
  -H "Content-Type: application/json" \
  -H "Cookie: __Secure-next-auth.session-token=<sesión superadmin>" \
  -d '{
    "moduleId": "insurance",
    "habilitado": true,
    "razon": "Cliente contrata vertical Seguros"
  }'
```

> ⚠️ **Cookie de sesión:** en producción NextAuth v4 usa `__Secure-next-auth.session-token`;
> en local (dev, sin HTTPS) el nombre es `next-auth.session-token`.

Respuestas posibles:

| Respuesta | Significado |
|:---|:---|
| `{ "success": true, "action": "restored_to_plan" }` | El módulo **ya está en el plan** del tenant → se borró el override redundante y queda activo por plan. Es el caso normal tras el seed. |
| `{ "success": true, "action": "enabled" }` | El módulo **no está en el plan** → se creó un `tenantFeature` con `habilitado: true`. |
| `{ "error": "No autorizado" }` | Sesión inválida o ausente (401). |
| `{ "error": "Acceso denegado" }` | El usuario no es Superadmin (403). |
| `{ "error": "moduleId y habilitado requeridos" }` | Body incompleto (400). |

### 2.2 Desactivar insurance en un tenant

```bash
curl -X PATCH "https://volkern.app/api/admin/tenants/<TENANT_ID>/modules" \
  -H "Content-Type: application/json" \
  -H "Cookie: __Secure-next-auth.session-token=<sesión superadmin>" \
  -d '{ "moduleId": "insurance", "habilitado": false, "razon": "Cliente lo da de baja" }'
```

→ `{ "success": true, "action": "disabled" }` y se crea un `tenantFeature` con
`habilitado: false`. Este override **gana al plan**: aunque insurance esté en el plan,
el módulo queda apagado para ese tenant.

### 2.3 Consultar el estado del módulo

```bash
curl "https://volkern.app/api/admin/tenants/<TENANT_ID>/modules" \
  -H "Cookie: next-auth.session-token=<sesión superadmin>"
```

Por cada módulo devuelve:

| Campo | Valores |
|:---|:---|
| `status` | `plan` (activo por plan), `addon`, `override_on`, `override_off`, `disabled` |
| `active` | booleano — el que decide la UI |
| `isInPlan` | si el módulo viene en el plan del tenant |
| `overrideId` / `razon` | datos del override si existe |

Para insurance esperado: `status: "plan"`, `active: true`, `isInPlan: true` tras el seed.

### 2.4 UI del superadmin

La API anterior es la misma que consume la UI del panel SaaS (`/admin/*`) de gestión de
tenants cuando existe la pestaña de módulos/features del tenant. Si en tu despliegue la
UI aún no expone esa pestaña, los pasos 2.1–2.3 son la vía canónica (curl o Postman) y
equivalentes a lo que hace el panel.

---

## 3. Seed de `subscriptionPlan` — insurance en los planes

### 3.1 Qué hace el seed

`scripts/seed-subscription-plans.ts` crea/actualiza (upsert por slug) los registros
`subscriptionPlan` para: `esencial`, `profesional`, `infinity`, `scale`, `compliance`.

Desde el commit `520fc4e`, **los módulos ya no se mantienen a mano**: el seed deriva la
lista completa de `ALL_MODULES` de `lib/plans.ts`:

```ts
const ALL_FEATURES_SET: string[] = ALL_MODULES.map(m => m.id)
```

Como `insurance` es un `ALL_MODULES` (grupo ERP), **se incluye automáticamente** en todos
los planes del seed. `compliance_pro` se filtra por plan (ver 3.3).

### 3.2 Cobertura de insurance por plan (tras el commit 520fc4e)

| Plan | Fuente de módulos | ¿Incluye insurance? |
|:---|:---|:---|
| trial / esencial / profesional / infinity / scale / compliance / pro-agency | `ALL_FEATURES_SET` (derivado) | ✅ Sí |
| `basico` | lista explícita en `PLAN_MODULES` | ✅ Sí |
| `agency-slot` | lista explícita en `PLAN_MODULES` | ✅ Sí |
| `accounting-slot` | lista explícita en `PLAN_MODULES` | ✅ Sí (22 módulos) |
| `pro-accounting` | lista explícita en `PLAN_MODULES` | ✅ Sí (30 módulos, superset del slot) |
| Planes no listados (ej. `premium`) | fallback a `esencial` en `getPlanConfig` | ✅ Sí |

> **Nota sobre planes legacy no definidos** (ej. `premium`): `getPlanConfig` cae al
> fallback hardcodeado de `PLAN_MODULES[PLANS.ESENCIAL]`, que incluye insurance.
> Por eso DeXpert (plan `premium`) ve el hub Seguros sin override.

### 3.3 Filtrado de `compliance_pro` por plan (no romper)

El seed respeta la regla de `lib/plans.ts` por plan:

```ts
// esencial y scale: SIN compliance_pro
modules: ALL_FEATURES_SET.filter(m => m !== 'compliance_pro')

// profesional, infinity y compliance: CON compliance_pro
modules: [...ALL_FEATURES_SET]
```

Esto es **idéntico al comportamiento anterior** (la lista vieja ya lo traía); la única
diferencia es que ahora se deriva en runtime y ya no se puede desincronizar.

### 3.4 Ejecutar el seed

```bash
cd nextjs_space
npx tsx scripts/seed-subscription-plans.ts
```

Es idempotente (upsert por slug). La verificación final imprime una columna
`insurance=✅/❌` por plan para confirmar el estado.

> ⚠️ Ejecuta el seed en **producción** solo cuando quieras publicar el módulo en los
> planes; en local/PR puedes probar con el fallback hardcodeado sin tocar la BD.

---

## 4. Verificar que el hub aparece

### 4.1 Verificación de datos (solo lectura)

```bash
cd nextjs_space
npx tsx scripts/verify-dexpert-insurance.ts      # insurance activo + hub definido
npx tsx scripts/verify-nav-accounting.ts         # simula el filtro del sidebar (contable/agencia)
```

`verify-dexpert-insurance.ts` confirma:
1. El tenant existe y su plan.
2. Si hay override de insurance (`tenantFeature`).
3. `getActiveModules(plan, tfs)` **contiene `insurance`**.
4. El hub `seguros` existe en `navigation-config.ts` con `requiredModule: 'insurance'`.

### 4.2 Lógica del sidebar (qué hace visible el hub)

`components/sidebar.tsx` muestra el hub `seguros` si:

```
requiredAccountType 'BUSINESS'  →  aplica a cuentas BUSINESS y AGENCY
                                   (y a roles Superadmin/Admin/Administrador)
     AND
requiredModule 'insurance'  →  está en activeModules
```

O sea: **un tenant con insurance en su plan ve el hub** sin ninguna otra configuración.

### 4.3 Verificación manual en el dashboard

1. Entrar como admin del tenant (`admin@<subdominio>.volkern.app`).
2. Abrir `/dashboard` → el sidebar debe mostrar **"🛡️ Seguros — Cartera de pólizas,
   renovaciones y aseguradoras con IA"**.
3. Entrar a `/dashboard/seguros` y a las 5 subpáginas:

| Ruta | Contenido |
|:---|:---|
| `/dashboard/seguros` | Dashboard con KPIs de cartera |
| `/dashboard/seguros/polizas` | Gestión de pólizas |
| `/dashboard/seguros/renovaciones` | Motor de renovaciones |
| `/dashboard/seguros/cartera` | Mapa de cartera IA |
| `/dashboard/seguros/aseguradoras` | Directorio de aseguradoras |

4. Probar el chatbot con intents de la vertical, ej.:
   - `crea la póliza POL-001 para juan@mail.com con AXA vence 2026-12-31`
   - `¿qué pólizas vencen en 30 días?`

---

## 5. Troubleshooting

| Síntoma | Causa probable | Solución |
|:---|:---|:---|
| El hub Seguros **no** aparece | `insurance` no está en `activeModules` del tenant | Revisar plan del tenant (`getPlanConfig`) y overrides; activar vía API (sección 2.1) o asignar plan con PUT `/api/admin/tenants/[id]/modules` |
| `restored_to_plan` al activar | El módulo ya estaba en el plan; el override se borró (correcto) | No es error — verificar con GET que `status: "plan"` |
| El hub aparece en UI pero el chatbot dice "No tienes acceso" | El tenant usa un plan en BD (`subscriptionPlan`) sin insurance | Re-ejecutar el seed (sección 3.4) para publicar insurance en los planes |
| Desactivé insurance pero sigue visible | El override de `habilitado: false` no se guardó (upsert falló) | Rehacer PATCH con `habilitado: false`; confirmar con GET `status: "override_off"` |
| 403 en la API | La sesión no es Superadmin | Revisar el rol del usuario (`role.nombre === 'Superadmin'`) |

---

## Archivos clave

| Archivo | Rol |
|:---|:---|
| `lib/plans.ts` | `insurance` en `CrmModule`, `ALL_MODULES`, `PLAN_MODULES`; `getActiveModules`/`isModuleActive` |
| `lib/navigation-config.ts` | Hub `seguros` (`requiredModule: 'insurance'`) |
| `app/api/admin/tenants/[id]/modules/route.ts` | GET (estado) / PATCH (override) / PUT (plan) del superadmin |
| `scripts/seed-subscription-plans.ts` | Publica `insurance` en `subscriptionPlan` derivando de `ALL_MODULES` |
| `scripts/verify-dexpert-insurance.ts` / `verify-nav-accounting.ts` | Verificación solo lectura |
| `lib/skills/insurance-skills.ts` + `lib/agents/intents/insurance-intents.ts` | Skills e intents del chatbot |
