# Volkern Partner API — Volkern Hostelería (industria restaurantera)

> **Audience**: Equipo de ingeniería de **Volkern Hostelería** (SaaS restaurantero
> interno de Volkern) que se integra con **Volkern Core** (HR / Payroll / Verifactu).
>
> **Propósito de este documento**: Describir los endpoints REST que Volkern Core
> expone bajo `/api/v1/partner/*` para que un software externo (SaaS-a-SaaS)
> — caso de uso inicial: Volkern Hostelería — pueda:
>
>   1. Registrar marcajes de asistencia (entrada/salida) de los empleados
>      del tenant en Volkern Core (Phase 1).
>   2. Lanzar el cálculo de nómina y enviar a AEAT vía Verifactu (Phase 2).
>   3. Onboarding self-service de nuevos tenants (Phase 3).
>
> **Última actualización**: 2026-07-02 (Phase 1 + Phase 1.5 implementados).
>
> **Source-of-truth de contratos**: `app/api/v1/partner/**/route.ts` +
> `lib/api-keys.ts` (lista de scopes partner).

---

## 0. Convenciones generales

- **Base URL**:
  - Producción: `https://api.volkern.com/api/v1/partner`
  - Sandbox: `https://sandbox.volkern.com/api/v1/partner` (próximamente)
  - Local: `http://localhost:3000/api/v1/partner`
- **Autenticación**: API Key per-tenant via header `x-api-key` (recomendado)
  o `Authorization: Bearer vk_live_...`. Formato: prefijo `vk_live_` o `vk_prod_`
  seguido de 64 hex chars (generada por `generateApiKey()` en `lib/api-keys.ts`).
- **Multi-tenancy**: 1 Restaurantero SaaS = 1 Tenant Volkern = 1 API Key. El
  Restaurantero SaaS NO opera múltiples tenants Volkern con la misma key.
- **CORS**: middleware global (`/middleware.ts`) permite
  `Access-Control-Allow-Origin: <origen SaaS>` y
  `Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key,
  X-Tenant-Id, X-Idempotency-Key, x-request-id`.
- **Idempotency**: header `x-idempotency-key` (RFC Stripe-style, TTL 24h).
  Si repites la misma key dentro de 24h recibes la respuesta cacheada con
  `idempotent: true`.
- **Rate limit edge**: 30 req/min por IP (ver `middleware.ts` PUBLIC_API_RATE_LIMITED).
  Limit específico por API Key se añadirá en Phase 1.5 si los benchmarks lo exigen.
- **Errores**: mapping RGPD-aware (200/400/401/403/404/429). Mensajes en
  castellano legibles para humanos + códigos machine-readable para retry logic.

---

## 1. Marcaje de asistencia — `POST /api/v1/partner/attendance/punch`

Endpoint principal de **Phase 1** (implementado el 2026-07-02). Reutiliza 100%
del `AttendanceService` existente: GPS bounds, geofencing, impossible-travel,
rate-limit, LOPDGDD Art. 88 — toda la lógica está probada en
`tests/attendance-punch-rgpd.test.ts`.

### 1.1 Auth

- Header: `x-api-key: vk_live_<64hex>`
- O: `Authorization: Bearer vk_live_<64hex>`
- Scope requerido: **`attendance:write`** (ver `lib/api-keys.ts`).
- Si llega por sesión NextAuth (no API Key): `401 Unauthorized` (rechazo explícito).

### 1.2 Request

```
POST /api/v1/partner/attendance/punch
x-api-key: vk_live_<64hex>
x-idempotency-key: punch-emp123-2026-07-02T13-04-00Z   ← recomendado, UUID v4 estable
Content-Type: application/json

{
  "employeeId": "ckl5g8z3p0001...",        // Volkern Employee.id
                                           //  (use GET /api/v1/partner/employees en Phase 1.5 para mapear externalEmployeeId)
  "type": "IN",                           // "IN" o "OUT"
  "method": "KIOSK_TABLET_1",             // opcional, default "PARTNER_APP" (auditoría)
  "locationLat": 40.4168,                 // opcional pero recomendado
  "locationLng": -3.7038,
  "clientTimestamp": "2026-07-02T13:04:00.000Z"  // opcional; server usa su reloj oficial
}
```

### 1.3 Response 200

```json
{
  "ok": true,
  "id": "ckl5h8z3p...log",
  "isAnomaly": false,
  "anomalyType": null,
  "message": "Marcaje Entrada registrado con éxito.",
  "idempotent": false            // true sólo si vino de cache de idempotency
}
```

### 1.4 Errores

| HTTP | `error`                                                         | Cuándo                                                                         |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 400  | Datos inválidos / `GPS_REQUIRED` / `GPS_OUT_OF_RANGE` / `NO_BASE_LOCATION` | body Zod falla, falta GPS, geofence violado, empleado sin base configurada |
| 401  | API key inválida / inactiva / expirada / sesión no permitida    | Auth falla o llegó por sesión NextAuth                                         |
| 403  | `NOTICE_NOT_ACKNOWLEDGED` + `required_action`                   | Empleado no firmó LOPDGDD Art. 88                                              |
| 404  | Empleado no encontrado en este tenant                           | `employeeId` no existe en Volkern                                              |
| 429  | `RATE_LIMITED` (header `retry-after: 30`)                       | Anti-doble-tap del tenant (`attendanceRules.minPunchIntervalSec`)              |

### 1.5 Ejemplo — Restaurantero SaaS en Python

```python
import os
import uuid
import requests
from datetime import datetime, timezone

API_BASE = os.environ["VOLKERN_API_BASE"]   # https://api.volkern.com
API_KEY  = os.environ["VOLKERN_API_KEY"]    # vk_live_xxx…

def registrar_marcaje(employee_id: str, tipo: str, lat: float, lng: float):
    idem = f"punch-{employee_id}-{int(datetime.now(timezone.utc).timestamp())}"
    r = requests.post(
        f"{API_BASE}/api/v1/partner/attendance/punch",
        headers={
            "x-api-key":            API_KEY,
            "x-idempotency-key":    idem,                # dedupe post-retries
            "Content-Type":         "application/json",
        },
        json={
            "employeeId":   employee_id,
            "type":         tipo,                          # "IN" o "OUT"
            "locationLat":  lat,
            "locationLng":  lng,
            "method":       "KIOSK_TABLET",
        },
        timeout=5,
    )
    r.raise_for_status()
    return r.json()
```

### 1.6 Ejemplo — curl + Node.js (fetch nativo)

```bash
# Happy path: IN punch desde un kiosko de Hostelería
curl -X POST https://api.volkern.com/api/v1/partner/attendance/punch \
  -H "x-api-key: vk_live_<tu-key>" \
  -H "x-idempotency-key: punch-emp123-2026-07-02T13-04-00Z" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "ckl5g8z3p0001...",
    "type": "IN",
    "locationLat": 40.4168,
    "locationLng": -3.7038,
    "method": "KIOSK_TABLET_1"
  }'

# Respuesta:
# { "ok": true, "id": "ckl5h8z3p...log", "isAnomaly": false,
#   "anomalyType": null, "message": "Marcaje Entrada registrado con éxito.",
#   "idempotent": false }
```

```javascript
// Node 18+ (fetch nativo)
const res = await fetch('https://api.volkern.com/api/v1/partner/attendance/punch', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.VOLKERN_API_KEY,
    'x-idempotency-key': `punch-${employeeId}-${Date.now()}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    employeeId, type: 'IN', locationLat: 40.4168, locationLng: -3.7038,
  }),
});
const json = await res.json();
if (!res.ok) throw new Error(`Volkern error: ${res.status} ${json.error}`);
```

### 1.7 Volumen esperado (50 Restauranteros × hostelería)

- ~30k-50k marcajes / día (50 tenants × 100 empleados × 4 marcajes/día)
- Ráfagas en comida (13:00-14:30) + cena (21:00-22:30) — p95 < 400ms objetivo
- El middleware edge (`/middleware.ts`) tiene rate-limit por IP; añadir
  rate-limit por `apiKeyId` es extensión natural cuando se necesiten SLAs
  por Restaurantero.

---

## 1.8 Marcaje con `externalEmployeeId` — flujo end-to-end (Phase 1 + 1.5)

El Restaurantero SaaS típicamente conoce empleados por su ID propio (p. ej.
`EMP-1234`). Tras Phase 1.5 puede:

```python
# 1. Lookup una sola vez al onboarding del restaurante o cuando contratan
#    un empleado nuevo.
lookup = requests.get(f"{API_BASE}/api/v1/partner/employees",
    params={"externalEmployeeId": "EMP-1234"},
    headers={"x-api-key": API_KEY},
).json()

volkern_employee_id = lookup["data"][0]["id"]

# 2. Cache en el SaaS de Hostelería (no volver a pedir cada marcaje).
# 3. Cada marcaje usa volkern_employee_id como employeeId.
punch = requests.post(f"{API_BASE}/api/v1/partner/attendance/punch",
    headers={"x-api-key": API_KEY, "x-idempotency-key": idem},
    json={"employeeId": volkern_employee_id, "type": "IN",
          "locationLat": 40.4168, "locationLng": -3.7038}
).json()
```

## 1.9 Empleados — Reference Phase 1.5

### 1.9.1 `GET /api/v1/partner/employees`

**Auth**: API Key per-tenant. Scope requerido: **`employees:read`**.

Tres modos de lookup soportados:

```
# 1) Single lookup
GET /api/v1/partner/employees?externalEmployeeId=EMP-1234

# 2) Bulk lookup (≤ 50)
GET /api/v1/partner/employees?externalEmployeeId=EMP-1,EMP-2,EMP-3

# 3) List paginado (todos los empleados sincronizados con este partner)
GET /api/v1/partner/employees?limit=25&cursor=ckl5g8z3p...
```

> ⚙️ **GET listado paginado** (sin `externalEmployeeId`) devuelve
> **solo empleados sincronizados con un partner externo** (aquellos con
> `externalEmployeeId != null`). Los empleados legacy creados vía UI interna
> **NO** aparecen en el listado — comportamiento intencional (consulta
> `GET /api/erp/hr/employees/{id}` para esos casos).

**Response 200** (single mode):

```json
{
  "schemaVersion": "2026-07-02",
  "count": 1,
  "data": [
    {
      "id": "ckl5g8z3p...",
      "tenantId": "tenant-1",
      "externalEmployeeId": "EMP-1234",
      "fullName": "María Pérez",
      "email": "maria@volkern.es",
      "jobTitle": "Camarera",
      "role": "WAITER",
      "department": "DINING",
      "hiringDate": "2025-12-01T00:00:00.000Z",
      "isActive": true,
      "baseGPSLat": 40.4168,
      "baseGPSLng": -3.7038,
      "createdAt": "2025-12-01T10:00:00.000Z",
      "updatedAt": "2026-06-30T13:04:00.000Z"
    }
  ]
}
```

> ⚠️ Por RGPD Art. 5 §1.c **NO** se devuelven: `salaryEncrypted`,
> `governmentIdEncrypted`, `bankDetailsEncrypted`, ni biometría.

**Errores**:

| HTTP | Causa                              |
| ---- | ---------------------------------- |
| 400  | `externalEmployeeId` >80 chars o `limit>100` |
| 401  | Sesión NextAuth o API Key inválida |
| 501  | (futuro si se añade GET listing con más fields) |

### 1.9.2 `POST /api/v1/partner/employees` (upsert idempotente)

**Auth**: API Key per-tenant. Scope requerido: **`employees:write`**.

**Body**:

```json
{
  "externalEmployeeId": "EMP-NUEVO-5678",
  "fullName": "Carlos García",
  "email": "carlos@volkern.es",
  "jobTitle": "Cocinero",
  "role": "KITCHEN",
  "department": "KITCHEN",
  "hiringDate": "2026-07-02T09:00:00.000Z",
  "isActive": true,
  "baseGPSLat": 40.4168,
  "baseGPSLng": -3.7038
}
```

**Semántica**:

- Si `externalEmployeeId` ya existe en este tenant → **PATCH semantics**:
  solo se actualizan los campos enviados. Campos no enviados se preservan
  intactos en la DB.
- Si no existe → **CREATE** con los defaults:
  `role=OPERATOR, department=GENERAL, isActive=true, hiringDate=now`.

**Semántica de `null` vs ausencia**:

- **Key ausente** (no aparece en el JSON) → no tocar el campo (PATCH skip).
- **Key con `null`** → limpiar el campo en DB (clear). Solo aplica a columnas
  nullable: `email`, `mobilePhone`, `jobTitle`, `baseGPSLat`, `baseGPSLng`.
- **Key con valor** → asignar valor.

`null` no se acepta en columnas **non-nullable** (`role`, `department`,
`isActive`, `hiringDate`, `fullName`); se rechaza con **400** en Zod. Si
necesitas “resetear” uno de estos campos, lo más sencillo es enviar un valor
por defecto (p. ej. `isActive: true` para desactivar un empleado, podría
usarse `archiveEmployee()` externo cuando se implemente si quieres
mantenerlo en DB).

**Response 200**:

```json
{
  "schemaVersion": "2026-07-02",
  "created": true,
  "employee": {
    "id": "ckl5h8z3p...",
    "tenantId": "tenant-1",
    "externalEmployeeId": "EMP-NUEVO-5678",
    "fullName": "Carlos García",
    "email": "carlos@volkern.es",
    ...
  }
}
```

Cuando la respuesta vino de cache de idempotency, se añade `"idempotent": true`.

**Idempotency-Key**: recomendado

```
x-idempotency-key: employee-EMP-NUEVO-5678-v1
```

Si lo reintentan con la misma key, reciben la respuesta original cacheada
(TTL 24h).

**Errores**:

| HTTP | Causa                                                   |
| ---- | ------------------------------------------------------- |
| 400  | Zod falla (fullName vacío, longitudes, etc.)            |
| 400  | `x-idempotency-key` >255 chars                          |
| 401  | Sesión NextAuth o API Key inválida                      |
| 409  | Conflicto de unicidad no resuelto (raro, reintentar)    |

### 1.9.3 Race condition handling (SaaS reintentos)

`prisma employee.create` puede lanzar `P2002` si dos POSTs concurrentes
intentan crear el `externalEmployeeId` a la vez. El partner endpoint **recupera
automáticamente** leyedo la fila ganadora y aplicando el update. Lo mismo con
`idempotencyKey.create` → cache hit race-safe.

---

## 2. Scope necesario por endpoint (resumen)

| Endpoint                                     | Scope              | Phase    |
| -------------------------------------------- | ------------------ | -------- |
| `POST /api/v1/partner/attendance/punch`      | `attendance:write` | ✅ 1     |
| `GET  /api/v1/partner/employees`             | `employees:read`   | ✅ 1.5   |
| `POST /api/v1/partner/employees`             | `employees:write`  | ✅ 1.5   |
| `POST /api/v1/partner/payroll/run`           | `payroll:run`      | ✅ 2     |
| `GET  /api/v1/partner/payroll/{id}/receipts` | `payroll:read`     | ✅ 2     |
| `GET  /api/v1/partner/payroll/{id}/aeat-status` | `payroll:read`  | ✅ 2     |
| `POST /api/v1/partner/onboard/tenant`        | `partners:onboard` | ⏳ 3     |
| `GET  /api/v1/partner/usage`                 | `audit:read`       | ✅ 1.5   |

---

## 3. Roadmap detallado

### Phase 1.5 — Empleados + listado ✅ IMPLEMENTADO

- ✅ `GET /api/v1/partner/employees?externalEmployeeId=...` → lookup
  bidirectional para que el Restaurantero SaaS pueda mapear su `employee_id`
  interno al `Volkern Employee.id` sin mantener su propia tabla de mapping.
  Acepta `externalEmployeeId=X,Y,Z` (bulk lookup hasta 50) y list paginado
  con cursor.
- ✅ `POST /api/v1/partner/employees` → alta/actualización de empleado en
  Volkern desde el SaaS partner con persistencia de
  `Employee.externalEmployeeId`. Semántica upsert idempotente:
  - Si existe `(tenantId, externalEmployeeId) → PATCH semantics` (solo los
    campos enviados se actualizan — el partner no necesita mandar todo).
  - Si no existe → CREATE.
- ✅ Migration Prisma añadida:
  `prisma/migrations/20260702000001_add_employee_external_id/migration.sql`
  añade columna `externalEmployeeId String?` + `@@unique([tenantId, externalEmployeeId])`
  + `@@index([tenantId, externalEmployeeId])`.
- ✅ Idempotency cache scope namespace-separado: `partner.employees.upsert`
  (no choca con `partner.attendance.punch`).
- ✅ Data minimization RGPD Art. 5 §1.c: nunca se exponen campos cifrados
  (`salaryEncrypted`, `governmentIdEncrypted`, `bankDetailsEncrypted`,
  biometría retirada) en la respuesta al partner.
- ✅ AuditLog RGPD Art. 30: cada GET y POST escribe
  `accion=PARTNER_EMPLOYEE_LOOKUP | PARTNER_EMPLOYEE_UPSERT`.

### Phase 2 — Nómina + AEAT Verifactu ✅ IMPLEMENTADO

- ✅ `POST /api/v1/partner/payroll/run` — calcula nóminas mensuales y las
  envía a AEAT del tenant. El flow es:
  - Lookup empleados por `externalEmployeeId` (creates cache Volkern).
  - Per empleado: `PayrollEngineES.calculatePayroll(employeeId, tenantId, period)`
    (lee `EmployeePayrollProfileES` + tramos).
  - Persist `PayrollRecordES` (status=DRAFT, fiscalStatus=PENDING) + lines
    (engine lines + overrides del partner con `isOverride=true`).
  - `PayrollSealer.sealPayroll(recordId, payload, note)` (encadenado SHA-256,
    auditHash + chainedHash + AuditLog `PAYROLL_HARDENED_SEAL`).
  - `shipNominaToAEAT({tenantId, payrollRecordId, runId, apiKeyId})` → genera
    XML VeriFactu con prefijo `NOM-` y delega envío en
    `InvoicingService.shipToAEAT` + `AEATClient.sendSoap`.
  - Final: `PayrollRunES.status=AEAT_SUBMITTED`.
- ✅ `GET /api/v1/partner/payroll/{runId}/receipts` — devuelve recibos
  sanitizados por empleado (totales + lines conceptuales, **sin cifrados**).
- ✅ `GET /api/v1/partner/payroll/{runId}/aeat-status` — distribución
  `PENDING|SIGNED|ARCHIVED` por record + `summary` humano-friendly.
- ✅ Idempotency scope namespace-separado: `partner.payroll.run`.
- ✅ AuditLog RGPD Art. 30: cada POST/GET escribe `PARTNER_PAYROLL_RUN |
  PARTNER_PAYROLL_RECEIPTS | PARTNER_PAYROLL_AEAT_STATUS | PARTNER_PAYROLL_AEAT_SUBMIT`.
- ✅ Data minimization: NUNCA salaryEncrypted / governmentIdEncrypted /
  bankDetailsEncrypted se exponen al partner.

### Phase 2.5 — SILTRA + Modelo 111 (roadmap)

- Sustituir `AEATXmlGenerator` placeholder por `lib/fiscal/siltra/xml-generator.ts`
  para TGSS (SILTRA/Creta) + `lib/fiscal/aeat/modelos/irpf-111.ts` para
  retenciones IRPF mensuales. Mismo contrato partner; canal interno cambia.
- Async worker con reintentos + reconciliación polling via webhook AEAT.
- Phase 2 actual es “first happy path” para validar contrato con los primeros
  Restauranteros.

### Phase 3 — Onboarding self-service + Compliance

- `POST /api/v1/partner/onboard/tenant`
  - Auth scope: `partners:onboard` (admin Volkern flag-only, NO auto-servicio).
  - Crea `Tenant` + `ApiKey` + `ConvenioConfig` por convenio hostelería elegido.
  - Devuelve `{ tenantId, apiKey, convenioCode }` para que el Restaurantero
    SaaS pueda comunicar al usuario "Tu cuenta en Volkern está activa, esta
    es tu key".
- `GET /api/v1/partner/audit-log`
  - Auth scope: `audit:read`.
  - Devuelve los `AuditLog` del tenant asociados al `apiKeyId` del partner.
  - Cumplimiento RGPD Art. 30 — registro de actividades de tratamiento.

### Convenios hostelería — Configuración por tenant

- Campo: `Tenant.configuracion.convenioCode: enum`
  - `ES_HOSTELERIA_ESTATAL` (default)
  - `ES_HOSTELERIA_CAT`, `ES_HOSTELERIA_MAD`, `ES_HOSTELERIA_PV`, `ES_HOSTELERIA_AND`
  - `CUSTOM` (convenio de empresa específico)
- `lib/finance/payroll/es/payroll-engine-es.ts` leerá este campo para
  seleccionar las tablas salariales aplicables (estatal vs CCAA).

### Idempotency-Key — Recomendaciones

- Generar UUID v4 estable por **acción**, no por intento.
- Formatos recomendados:
  - Marcajes: `punch-{employeeExternalId}-{ISO8601 timestamp local}`
  - Nóminas: `payroll-{period}-{tenantShortCode}` (idempotente por mes)
  - Onboarding: `onboard-{cif}-{nombreCorto}` (idempotente por restaurante)
- Permite dedupe robusto si la red del restaurante cae y el Restaurantero
  SaaS reintenta la misma operación varias veces en segundos.

---

## 4. Compliance y RGPD — Lo que el equipo de Hostelería debe saber

- **Art. 28 RGPD (Encargado del tratamiento)**: La integración SaaS-a-SaaS
  entre Volkern Hostelería y Volkern Core requiere un **DPA** (Data Processing
  Agreement). Se firmará automáticamente en el endpoint
  `/api/v1/partner/onboard/tenant` cuando esté implementado (Phase 3).
- **Art. 30 RGPD (Registro de actividades)**: Cada llamada API genera un
  `AuditLog` con `{ tenantId, apiKeyId, action, ipAddress, userAgent,
  timestamp }` — disponible vía `GET /api/v1/partner/audit-log` desde Phase 3.
- **Art. 88 LOPDGDD + geolocalización**: Marcajes siguen exigiendo GPS válido,
  empleado con `noticeAcknowledgedAt`, y rate-limit anti-doble-tap. Si el
  empleado no firma la cláusula, devolvemos `403 NOTICE_NOT_ACKNOWLEDGED`
  con `required_action: /dashboard/rrhh/mi-asistencia` — el Restaurantero
  SaaS debe mostrar ese mensaje en su UI.
- **Art. 9 RGPD (datos biométricos)**: NO se capturan selfies ni face match.
  Solo GPS — patrón heredado del endpoint interno (`attendance-service.ts`
  RGPD-sainetizado en Julio 2026).

---

## 5. Sandbox y onboarding de los 50 Restauranteros

- Onboarding por Restaurantero: vía panel admin Volkern o vía endpoint
  self-service Phase 3 (`POST /api/v1/partner/onboard/tenant`).
- API Key entregada: scopes por defecto
  `[attendance:write, attendance:read, employees:write, employees:read,
  payroll:run, payroll:read, audit:read]`.
- Sandbox URL (próximamente): `https://sandbox.volkern.com/api/v1/partner`
  con datos sintéticos aislados por tenant — pensado para que el equipo de
  Volkern Hostelería pueda integration-test antes de tocar producción.
- **SLA objetivo**: 99.5% uptime, p95 < 400ms, p99 < 1s sobre ~50k
  marcajes/día cuando los 50 Restauranteros estén operativos (~mes 6).

---

## 6. Cambios incompatibles hacia atrás

- Versión v1 (este documento). Cambios incompatibles se publicarán como v2
  con nuevo prefijo `/api/v1/partner/v2/*`.
- Scopes añadidos son retrocompatibles — denegar uno que ya estaba presente
  requeriría rotación explícita de keys.


## Rate Limiting (Edge Middleware — Upstash Redis REST)

Volkern Partner API aplica rate-limit por **API key + scope** en el middleware edge antes de `withTenantAuth`. Aislara cada Restaurantero SaaS y protege SLA durante el rollout a 50 tenants.

### Per-scope limits (single source-of-truth: `lib/rate-limit/partner-rate-limit-config.ts`)

| Scope              | Path                                                          | N req/min | Fail policy |
|--------------------|---------------------------------------------------------------|-----------|-------------|
| `payroll:run`      | POST `/api/v1/partner/payroll/run`                            | 10        | **CLOSED**  |
| `payroll:read`     | GET `/api/v1/partner/payroll/[runId]/{receipts,aeat-status}` | 60        | OPEN        |
| `attendance:write` | POST `/api/v1/partner/attendance/punch`                       | 300       | OPEN        |
| `attendance:read`  | GET `/api/v1/partner/attendance/*`                            | 120       | OPEN        |
| `employees:write`  | POST/PUT `/api/v1/partner/employees`                          | 30        | OPEN        |
| `employees:read`   | GET `/api/v1/partner/employees`                               | 120       | OPEN        |
| `default`          | (catch-all)                                                   | 60        | OPEN        |

**Fail-CLOSED** para `payroll:run`: si Upstash no responde en 300ms o devuelve 5xx, el rate-limiter devuelve `429 RATE_LIMITER_UNAVAILABLE`. Por qué: nóminas mensuales con cómputo AEAT pesado — preferimos rechazar preventivamente durante un outage Upstash a poner en stress el motor de nóminas. El resto es OPEN por UX.

### Isolation

Cada `apiKeyId` se deriva vía `SHA-256(apiKey + UPSTASH_SALT).substring(0, 16)` (Web Crypto API, edge-safe). El bucket Upstash es `volkern:rl:partner:<scope>:<apiKeyId>`. PII del apiKey NUNCA aparece en headers `X-RateLimit-*` ni en logs Redis.

### Response headers

Todas las respuestas (permitidas o 429) llevan `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `x-rate-limit-scope`. Adicional solo en 429: `Retry-After` + body `code: RATE_LIMIT_EXCEEDED` (límite real) o `RATE_LIMITER_UNAVAILABLE` (Upstash caído).

### Algorithm

Sliding window via Upstash Redis Sorted Set. Pipeline `/pipeline` atómico (4 comandos): `ZREMRANGEBYSCORE → ZCARD → ZADD → EXPIRE`. Si `count_old+1 > limit` → 429.

### Edge Runtime compat

NO `ioredis` (TCP). NO Prisma. NO `crypto.createHash`. Sí `fetch` + `AbortController`. Sí `crypto.subtle.digest`.

### Env vars requeridos (producción)

`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_SALT`. Sin ellos, `payroll:run` rechaza todo y el resto pasa con warn.

### Ajustar límites temporales

Editar `PARTNER_RATE_LIMITS` en `lib/rate-limit/partner-rate-limit-config.ts`.


## Rate Limiting (Edge Middleware — Upstash Redis REST)

Volkern Partner API aplica rate-limit por **API key + scope** en el middleware edge antes de `withTenantAuth`. Esto aislara cada Restaurantero SaaS y protege SLA durante el rollout a 50 tenants.

### Per-scope limits (single source-of-truth: `lib/rate-limit/partner-rate-limit-config.ts`)

| Scope              | Path                                                     | N req/min | Fail policy |
|--------------------|----------------------------------------------------------|-----------|-------------|
| `payroll:run`      | POST `/api/v1/partner/payroll/run`                       | 10        | **CLOSED**  |
| `payroll:read`     | GET `/api/v1/partner/payroll/[runId]/{receipts,aeat-status}` | 60    | OPEN        |
| `attendance:write` | POST `/api/v1/partner/attendance/punch`                  | 300       | OPEN        |
| `attendance:read`  | GET `/api/v1/partner/attendance/*`                       | 120       | OPEN        |
| `employees:write`  | POST/PUT `/api/v1/partner/employees`                     | 30        | OPEN        |
| `employees:read`   | GET `/api/v1/partner/employees`                          | 120       | OPEN        |
| `default`          | (catch-all)                                              | 60        | OPEN        |

**Fail-CLOSED** significa: si Upstash no responde en 300ms o devuelve 5xx, el rate-limiter devuelve `429 RATE_LIMITER_UNAVAILABLE`. Por qué para `payroll:run`: nóminas mensuales con cómputo AEAT pesado — durante un outage Upstash queremos rechazar tráfico preventivamente para no poner en stress el motor de nóminas (que también podría degradarse). El resto es OPEN por UX: una integración legítimamente ocupada no debe quedar bloqueada por un Redis caído.

### Isolation

Cada `apiKeyId` se deriva vía `SHA-256(apiKey + UPSTASH_SALT).substring(0, 16)` (Web Crypto API, edge-safe). El bucket Upstash es `volkern:rl:partner:<scope>:<apiKeyId>`. PII del apiKey NUNCA aparece en headers `X-RateLimit-*` ni en logs Redis.

### Response headers (estándar industria)

Todas las respuestas (permitidas o 429) llevan:
- `X-RateLimit-Limit`: límite del scope.
- `X-RateLimit-Remaining`: slots restantes en la ventana sliding.
- `X-RateLimit-Reset`: epoch seconds cuando la ventana reinicia.
- `x-rate-limit-scope`: scope del bucket (debugging).

Adicional sólo en 429:
- `Retry-After`: segundos hasta poder reintentar.
- body `code`: `RATE_LIMIT_EXCEEDED` (límite real) o `RATE_LIMITER_UNAVAILABLE` (Upstash caído).

### Algorithm

Sliding window via Upstash Redis Sorted Set. Pipeline `/pipeline` atómico (4 comandos):
1. `ZREMRANGEBYSCORE key -inf (now-60000)` — purga entries viejos.
2. `ZCARD key` — count viejo antes del insert.
3. `ZADD key now <random_member>` — añade el request actual.
4. `EXPIRE key TTL` — autolimpia.

Si `count_old+1 > limit` → 429. Sliding window garantiza que el rate vuelve a estar disponible gradualmente (no "fixed time reset" brusco).

### Edge Runtime

El middleware corre en Next.js Edge Runtime. Por eso:
- **NO** usa `ioredis` (TCP no soportado en edge).
- **NO** usa Prisma (Node-only).
- **NO** usa `crypto.createHash` (Node crypto module).
- **SÍ** usa `fetch` + `AbortController` (Web API estándar).
- **SÍ** usa `crypto.subtle.digest('SHA-256', ...)` (Web Crypto API).

### Env vars requeridos (producción)

```
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=<rest-token>
UPSTASH_SALT=<rotate-me-in-each-env>
```

Sin `UPSTASH_REDIS_REST_URL`+`TOKEN` configurados en producción, `payroll:run` rechaza todo (fail-closed) y el resto deja pasar (warning en logs). Esto es operacionalmente inaceptable durante rollout — configúralos ANTES de habilitar partner APIs para nuevos Restauranteros.

### Cómo ajustar límites temporales

Editar `PARTNER_RATE_LIMITS` en `lib/rate-limit/partner-rate-limit-config.ts`. Una vez desplegado, Upstash ve el nuevo `limit` pero los buckets sliding ya tienen cuenta histórica — los clientes deben esperar 60s para refrescar. Para un Restaurantero específico entrando en bargaining, considera temporalmente subir el `limit` y desplegar.

> **Nota sobre `RATE_LIMITER_UNAVAILABLE`:** cuando el rate-limiter devuelve 429 con `code: RATE_LIMITER_UNAVAILABLE` (solo en `payroll:run` con Upstash caido), el header `X-RateLimit-Reset` se acerca al backoff ~1s (no la ventana completa de 60s). Razon: reintentar dentro del mismo ventana sliding no sirve de nada si Upstash sigue caido. Los partners SaaS deben esperar ~1s.

> **Race condition note (Usage endpoint):** `GET /api/v1/partner/usage` ejecuta `inspectPartnerRateLimit` SIN hacer `ZADD` (read-only). Si un SaaS llama `GET /usage` mientras simultáneamente un write pasa el check en el mismo bucket (`volkern:rl:partner:<scope>:<apiKeyId>`), el contador visto puede ser ±1 vs el valor real exacto — `inspectPartnerRateLimit` y `checkPartnerRateLimit` ejecutan pipelines atómicos independientes, así que el orden de arrival determina si vemos `count_old` o `count_old + 1`. ±1 es aceptable para uso informativo; NO para lógica de throttling estricta. Si necesitas exactitud, combina con `X-RateLimit-Remaining` del write response (que SI incluye la entry recién insertada).
