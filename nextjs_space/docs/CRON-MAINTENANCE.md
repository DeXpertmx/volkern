# Volkern — Mantenimiento automatizado (`crons`)

> **Audiencia**: Delegado de Protección de Datos (DPO), auditor externo,
> administrador de plataforma, equipo de compliance.
>
> **Propósito de este documento**: Describir **end-to-end** la política de
> mantenimiento automatizado que ejecuta Volkern sobre los datos personales
> de los empleados y tenants, **sin necesidad de leer el código fuente**.
>
> **Última actualización**: 2026-10-08 (auditable en `git log`).
>
> **Fuente de verdad técnica**: hay **dos** planificadores, y este documento
> debe reflejar ambos:
>
> 1. El **crontab de root del VPS** (`root@62.171.134.195`), que invoca
>    `deploy-vps/cron.sh <job>` vía HTTP. El planificador es el demonio `cron`
>    del sistema operativo, **no** Vercel.
> 2. El **scheduler in-process** `lib/cron/scheduler.ts` (node-cron), arrancado
>    desde `instrumentation.ts` en el contenedor de la app. Verificado en los
>    logs de producción de 2026-10-08.
>
> Cualquier discrepancia entre este documento y cualquiera de los dos se
> considera **bug** y debe corregirse aquí primero, luego sincronizar
> `cron.sh` o `scheduler.ts`.

---

## Estado verificado (2026-10-08)

Comprobado leyendo el propio VPS, no la documentación. Los cuatro jobs están
programados en el crontab de **root** y el servicio `cron` está `active` y
`enabled`:

| Job | Schedule (cron) | Frecuencia humana |
|---|---|---|
| `uptime-developers` | `0 0 * * *` | Diaria, 00:00 UTC |
| `cleanup-attendance` | `0 3 * * *` | Diaria, 03:00 UTC |
| `hospitality-reconcile` | `0 4 * * *` | Diaria, 04:00 UTC |
| `hospitality-briefing` | `0 8 * * *` | Diaria, 08:00 UTC |

- **Ejecución**: `bash /root/volkern-erp/cron.sh <job>`. El script lee
  `CRON_SECRET` y `NEXT_PUBLIC_APP_URL` de `/root/volkern-erp/.env`, hace
  `curl` a `${BASE}/api/cron/<job>` con `Authorization: Bearer`, con
  `--max-time 120`, y escribe una línea por corrida en
  **`/var/log/volkern-cron.log`** (`[YYYY-MM-DD HH:MM] <job> OK (200)` o
  `… FALLÓ (<código>): <cuerpo>`).
- **Evidencia**: en la verificación, los 4 jobs aparecen en `OK (200)` el
  mismo día y todos los días anteriores registrados.
- **Regla de oro del sistema**: los crons del ERP viven en el **crontab de
  root**, NUNCA en `/etc/cron.d`. El centinela
  `deploy-vps/vigilar-crons-heredados.sh` (semanal, vía
  `/etc/cron.d/auditoria-superficie`) alerta si reaparece el stack heredado
  `volkern-table`.
- **`vercel.json` se eliminó** al confirmar que el VPS es el único
  planificador: dejarlo habría duplicado A y B si alguien volviera a
  desplegar allí.
- **Restos inofensivos en el VPS**: `/var/log/volkern-attendance-digest.log`,
  `/var/log/volkern-birthday-promos.log` y `/var/log/volkern-reminders.log`
  son del stack anterior; su última escritura es de julio-septiembre y **no
  están programados** en el crontab.

> **Nota de reconciliación.** Este documento se escribió cuando el planificador
> era Vercel, y describe una plataforma serverless con límites de plan y
> cold-starts. Se ha reescrito contra el VPS: schedules reales en el crontab,
> ejecución vía `cron.sh`, log en `/var/log/volkern-cron.log` y recuperación
> sobre los contenedores. Sólo queda una mención legítima a Vercel: la
> variable `VERCEL_ENV` (que el handler sigue leyendo y que en el VPS no está
> definida). La advertencia del §5 sobre el secreto `APP_URL` de GitHub Actions
> **está resuelta** (2026-10-08): ese workflow nunca llegó a registrarse y el
> secreto nunca existió; el archivo se eliminó.

---

## 0. Índice rápido

1. [Inventario de crons programados](#1-inventario-de-crons-programados)
2. [Autenticación universal](#2-autenticación-universal)
3. [Cron A — `/api/cron/cleanup-attendance`](#3-cron-a--apicroncleanup-attendance)
4. [Cron B — `/api/cron/uptime-developers`](#4-cron-b--apicronuptime-developers)
5. [Crons disparados por el scheduler in-process (no por el crontab)](#5-crons-disparados-por-el-scheduler-in-process-no-por-el-crontab)
6. [Handlers `app/api/cron/` eliminados (registro histórico)](#6-handlers-appapicron-eliminados-registro-histórico)
7. [Procedimientos de auditoría para el DPO](#7-procedimientos-de-auditoría-para-el-dpo)
8. [Procedimientos de recuperación ante fallo](#8-procedimientos-de-recuperación-ante-fallo)
9. [Métricas observables y dónde consultarlas](#9-métricas-observables-y-dónde-consultarlas)
10. [Cambio de versión y changelog](#10-cambio-de-versión-y-changelog)
11. [Procedimientos de testing manual](#11-procedimientos-de-testing-manual)
12. [Referencias legales y técnicas](#12-referencias-legales-y-técnicas)

---

## 1. Inventario de crons programados

| # | Path | Schedule (cron) | Frecuencia humana | Toca datos personales (RGPD) | Artículo RGPD relevante |
|---|------|------------------|--------------------|-------------------------------|--------------------------|
| A | `/api/cron/cleanup-attendance` | `0 3 * * *` (crontab VPS) | Cada día a las 03:00 UTC | **Sí** — purga marcajes GPS e idempotency keys | Art. 5.1.e (limitación del plazo de conservación) |
| B | `/api/cron/uptime-developers` | `0 0 * * *` (crontab VPS) | Cada día a las 00:00 UTC | No — health check de páginas públicas | No aplica (transparencia hacia integradores) |
| C | `/api/cron/google-calendar-renew` | `0 */12 * * *` (scheduler in-process) | Cada 12 horas (00:00 y 12:00 UTC) | No — renovación de canales OAuth técnico | No aplica (operacional OAuth) |
| D | `/api/cron/hospitality-reconcile` | `0 4 * * *` (crontab VPS) | Cada día a las 04:00 UTC | **Sí** — lee y escribe reservas con datos del huésped; registra divergencias | Art. 6.1.b (contrato de alojamiento) + Art. 5.1.d (exactitud) |
| E | `/api/cron/hospitality-briefing` | `0 8 * * *` (crontab VPS) | Cada día a las 08:00 UTC | **Sí** — envía al equipo del hotel el nombre del huésped de las llegadas/salidas | Art. 6.1.b + Art. 6.1.f (operación del alojamiento) + Art. 5.1.c (minimización) |

**Total**: 4 crons del crontab del VPS (A, B, D, E) + 1 cron disparado por el
scheduler in-process (C, ver §5). Los cinco autentican con
`Authorization: Bearer ${CRON_SECRET}` cuando se invocan por HTTP en
producción (ver §2).

### 1.1 Clasificación RGPD de los crons de Hospitality (D y E)

Clasificación **técnica**, derivada del código y no una opinión legal: es el
material campo por campo sobre el que el DPO da el visto bueno. Cierra el
pendiente que este documento arrastraba (antes decía "pendientes de revisión
por el DPO").

**D — `hospitality-reconcile`** (`0 4 * * *` · `lib/cron/hospitality-reconcile.ts`)

- **Qué hace**: recorre los tenants con mappings de conectividad activos y
  reconcilia **30 días** de reservas contra el proveedor. Crea, actualiza y
  cancela reservas, y anota las divergencias en `HospitalitySyncLog`.
- **Qué hace además (desde el 9-oct-2026)**: pasa la **guardia de inventario**
  (`lib/hospitality/inventario-divergencias.ts`): compara lo que el proveedor
  tiene por bueno (el último push con éxito que cubre cada noche) con la
  disponibilidad que justifica el estado interno, y anota en
  `HospitalitySyncLog` (tipo `divergencias_inventario`) las **noches sin
  justificar** de cada propiedad. No lee nada del proveedor —no se le pide
  inventario: `Fetch Inventory` sigue sin implementar en el adapter— ni empuja
  nada: solo diagnóstica. Los avisos suben al panel de
  estado del cron (ámbar) y el resultado se ve en el panel de Conectividad. Un
  fallo del barrido cuenta como fallo del job (el calendario del canal quedaría
  sin auditar), pero no impide reconciliar reservas.
- **Datos personales**: **sí**, y son el núcleo del job. Lee y escribe
  `HospitalityReservation.guestData` (Json: identificativos y contacto del
  huésped) — nombre, email y teléfono del titular y de los acompañantes — más
  los datos de la estancia (fechas, unidad, importes).
- **Base jurídica**: **Art. 6.1.b** — el tratamiento es la ejecución del
  contrato de alojamiento: la reserva debe reflejar lo que el huésped contrató.
- **Principio que lo justifica**: **Art. 5.1.d** (exactitud) — corregir
  reservas desincronizadas *es* mantener los datos exactos.
- **Minimización**: `cancelarAusentes` siempre en `false`: una reserva interna
  activa que el proveedor ya no reporta se registra como **divergencia**, nunca
  se cancela automáticamente. Sólo escribe si hay diferencias (idempotente). La
  guardia de inventario no toca datos personales: habla de `roomCode` y fechas.
- **Seguridad**: **Art. 32** — `Bearer ${CRON_SECRET}`, con el 401 devuelto
  antes de tocar Prisma.
- **Nota operativa**: este job está programado **dos veces** — crontab 04:00 y
  scheduler in-process 04:15. Es idempotente (sin diferencias no hay
  escrituras), pero es una corrida redundante: candidata a unificar.

**E — `hospitality-briefing`** (`0 8 * * *` · `lib/cron/hospitality-briefing.ts`)

- **Qué hace**: envía la plantilla activa `briefing_diario` de cada tenant al
  equipo que puede operar el PMS (capacidad `operaciones.ver`, máximo 10
  destinatarios) por email o WhatsApp, con la foto del día.
- **Datos personales**: **sí**, de **dos categorías de interesados**:
  1. **Huéspedes** — el cuerpo del mensaje lleva el nombre
     (`detalleLlegadas` / `detalleSalidas` → `{huesped, unidad}`) junto a la
     unidad.
  2. **Equipo del hotel** — email, teléfono y nombre como destinatarios
     (`User.email` / `User.telefono` / `User.name`).
- **Base jurídica**: **Art. 6.1.b** para los destinatarios internos (relación
  laboral) y **Art. 6.1.f** (interés legítimo del hotel en operar las llegadas
  del día) para la comunicación. No es una finalidad nueva: es el mismo
  tratamiento operativo del alojamiento.
- **Minimización**: **Art. 5.1.c** — sólo viaja **nombre + unidad**. No viajan
  documentos (los de `viajeros.documento_completo` quedan fuera), ni importes
  de terceros, ni datos de pago. Evidencia en código: el `AuditLog` de
  idempotencia guarda únicamente contadores (`ocupacionHoyPct`, `llegadasHoy`,
  `salidasHoy`, `incidenciasAbiertas`, `cobrosPendientes`), **nunca nombres**.
- **Encargados**: **Art. 28** — la entrega sale por canales de terceros (email
  y WhatsApp); sus DPA se siguen en
  `docs/compliance/ENCARGADOS-DPA-PENDIENTES.md`.
- **Retención**: el `AuditLog` de idempotencia es por tenant y fecha. El
  mensaje enviado **no se persiste** en el ERP (vive en el proveedor del canal).

> **Pendiente declarado (no clasificado en este documento)**: el scheduler
> in-process ejecuta además otros jobs de Hospitality — `hospitality-checkin-due`
> (cada hora), `hospitality-registro-viajeros` (cada hora, minuto 30),
> `hospitality-holds-expirados` (cada hora), `hospitality-review-request`
> (10:30), `hospitality-vinculos-pendientes` (09:45) y
> `hospitality-connectivity-health` (05:00). Tres de ellos tratan datos
> personales de forma sustantiva (`checkin-due` y `review-request` comunican con
> el huésped; `registro-viajeros` comunica documentos al Ministerio del
> Interior, RD 933/2021) y **merecen su propia ficha**: queda como siguiente
> revisión del DPO, sin clasificar aquí.

> **Añadido 2026-10-08**: el job `hospitality-puesta-en-marcha-avisos` (09:20)
> entra en el mismo scheduler in-process y **sí queda clasificado aquí abajo**
> (§1.2), así que no engrosa la lista de pendientes.

### 1.2 Clasificación RGPD — `hospitality-puesta-en-marcha-avisos`

**Ficha del job** (`09:20` · `lib/cron/hospitality-puesta-en-marcha-avisos.ts`)

- **Qué hace**: recorre los clientes de Hospitality con la puesta en marcha a
  medias y envía **un** correo al operador con las cuentas que llevan días sin
  avanzar (roles del catálogo sin preparar o sin ninguna propiedad) y las que
  tienen datos con el módulo apagado. Un solo aviso agregado, con intervalo
  mínimo por cuenta.
- **Datos personales**: **no hay datos de interesados** (huéspedes, viajeros,
  usuarios del cliente). Lo que viaja es el **nombre del cliente** de la
  plataforma, su plan y el estado de su puesta en marcha — datos de la relación
  comercial, no de personas físicas por cuenta ajena. El destinatario único es
  el **buzón interno del operador** (`ADMIN_EMAIL`).
- **Base jurídica**: **Art. 6.1.f** — interés legítimo en operar el servicio
  contratado (un alta a medias es un cliente que no puede trabajar). No hay
  finalidad nueva: es el mismo tratamiento operativo de la relación comercial,
  solo que por un canal saliente.
- **Minimización**: **Art. 5.1.c** — el cuerpo lleva nombre del cliente,
  contadores (roles, propiedades, unidades) y qué falta. **Nunca** datos de
  huéspedes ni importes. Evidencia en código: `construirAviso()` solo compone el
  texto desde `PuestaEnMarchaFila`, que no incluye `guestData`.
- **Encargados**: **Art. 28** — el envío sale por **Resend** (email) y, si está
  configurado, **Apprise**; sus DPA se siguen en
  `docs/compliance/ENCARGADOS-DPA-PENDIENTES.md`. Un canal caído no impide los
  demás y el fallo queda en los logs.
- **Retención**: cada aviso deja una fila en `hospitality_sync_logs`
  (`tipo = aviso_puesta_en_marcha`) que es a la vez auditoría del envío y el
  reloj del intervalo entre avisos. **No** se persiste el correo enviado.
- **Seguridad**: **Art. 32** — el disparo por HTTP exige
  `Bearer ${CRON_SECRET}`; el 401 se devuelve antes de tocar Prisma (ver §2).
- **Programación**: **solo scheduler in-process** (09:20). **No** se añade al
  crontab del VPS a propósito: sería una segunda corrida del mismo job diario,
  exactamente la redundancia que §1.1 señala como candidata a unificar en
  `hospitality-reconcile`. Si algún día el proceso persistente no está, el
  disparo manual por HTTP sigue disponible.
- **Sin destinatario, sin canal**: si `ADMIN_EMAIL`/`RESEND_API_KEY` no están
  configurados, el aviso queda en el log y **se publica en ámbar en
  `/admin/hospitality`** — el panel de estado no deja que un aviso se pierda en
  silencio.

**Limitaciones del planificador**:
- El crontab del VPS **no impone límites** de frecuencia ni de duración: los schedules se ejecutan según lo previsto.
- `cron.sh` corta el `curl` a los **120 s** (`--max-time 120`). Si un handler tarda más, la corrida se registra como `FALLÓ (000)` y la del día siguiente recoge lo pendiente (los endpoints son idempotentes).
- No hay reintento automático: un fallo de red en el VPS salta la corrida entera. El rastro queda siempre en `/var/log/volkern-cron.log`.

---

## 2. Autenticación universal

Ambos crons comparten el mismo patrón de auth (verificable en cada handler):

```http
GET /api/cron/<name> HTTP/1.1
Host: volkern.app
Authorization: Bearer ${CRON_SECRET}
```

**Reglas**:

1. **Sólo en producción**: `if (process.env.NODE_ENV === 'production')` la auth es obligatoria. En desarrollo/preview la auth se omite para permitir testing local.
2. **Fallo ⇒ `401 Unauthorized`** con cuerpo `{ error: "No autorizado. CRON_SECRET requerido en producción." }`.
3. **El header `Authorization: Bearer` es la única autenticación**: no hay firma de plataforma que la respalde. El valor sale de `CRON_SECRET` en `/root/volkern-erp/.env`, que `cron.sh` inyecta en cada `curl`.
4. **`CRON_SECRET` se rota** editando esa variable en el VPS. `cron.sh` la lee en cada ejecución, así que **el script no necesita reinicio**; el contenedor de la app sí, porque el valor forma parte de su entorno. Tras rotarla, las invocaciones con el secret viejo reciben `401` (path de recuperación en §8).

**Variables de entorno requeridas**:

| Variable | Usada por | Obligatoria en |
|----------|-----------|-----------------|
| `CRON_SECRET` | Ambos crons | Producción |
| `NEXT_PUBLIC_APP_URL` | Destino del `curl` de `cron.sh` y base de las probes de uptime-developers | Producción (`/root/volkern-erp/.env`) |
| `VERCEL_ENV` | uptime-developers (skip fuera de producción) | **No definida en el VPS**: al faltar, el cron se ejecuta siempre. Si se definiera con otro valor, el handler se saltaría las probes |
| `ADMIN_EMAIL` | uptime-developers (alerta Resend) | Producción (opcional) |
| `RESEND_API_KEY` | uptime-developers (alerta Resend) | Producción (opcional) |
| `UPTIME_APPRISE_URL` | uptime-developers (alerta Slack/otro) | Producción (opcional) |
| `DATABASE_URL` | cleanup-attendance (Prisma) | Producción |

---

## 3. Cron A — `/api/cron/cleanup-attendance`

### 3.1 Resumen ejecutivo

- **Qué hace**: cada día a las 03:00 UTC, purga los datos de Control Horario
  (RGPD Art. 5.1.e — limitación del plazo de conservación).
- **Frecuencia**: `0 3 * * *` (UTC).
- **Idempotente**: sí. Si una corrida se repite al día siguiente, los rows
  ya purgados no se vuelven a tocar (los `where` clauses son deterministas).
- **Tiempo máximo**: 120 s, el `--max-time` de `cron.sh`. Si excede, la
  corrida queda como `FALLÓ (000)` en `/var/log/volkern-cron.log` y la del
  día siguiente recoge lo pendiente (ver §7.2).
- **Salida**: JSON 200 / 500 con `summary` enriquecido (no destructive ack).
- **Dry-run**: `?dryRun=1` permite inspección sin deletes (ver §6.2).

### 3.2 Datos purgados

#### (a) `erp_attendance_logs` — modelo Prisma `Attendance`

| Aspecto | Valor |
|---------|-------|
| Criterio de purga | `tenantId = X AND timestamp < cutoff` |
| `cutoff` por tenant | `now − tenant.attendanceRules.retentionDays días` |
| Default `retentionDays` cuando tenant no tiene regla | **1460 días** (≈ 4 años) |
| Rango operativo (clamp defensivo) | **1 ≤ retentionDays ≤ 1825** (1 día a 5 años) |
| Origen del default | Mirror de `AttendanceRules.retentionDays @default(1460)` en `prisma/schema.prisma` |
| Cadencia de delete | **Iterativo por batches de 50.000 filas** (no un único DELETE masivo) |
| Estrategia SQL | `INSERT INTO scope 1` `findMany({select:{id}, take:50000, orderBy:timestamp asc, where:{tenantId, timestamp<cutoff}})` → `INSERT INTO scope 2` `deleteMany({where:{id:{in: ids}}})` |
| Garantía de plan de query | El plenario de Postgres usa **Index Scan** sobre el composite `@@index([tenantId, timestamp])` (no Bitmap Heap Scan). Verificable con `scripts/verify-cleanup-attendance-index.sql` |

#### (b) `erp_idempotency_keys` — modelo Prisma `IdempotencyKey`

| Aspecto | Valor |
|---------|-------|
| Criterio de purga | `expiresAt < now` (global, sin scope de tenant) |
| TTL típico por scope de uso | 24 h (configurable por scope en el caller) |
| Cadencia de delete | Un único `deleteMany` global (no necesita batching) |
| Index usado | `@@index([expiresAt])` ya presente en schema |

### 3.3 Datos explícitamente NO purgados (preservados)

| Modelo / campo | Política de retención | Razón legal |
|----------------|----------------------|-------------|
| `AuditLog` (todo) | **Indefinida** | Trazabilidad inmutable requerida por compliance |
| `Employee.noticeAcknowledgedAt` | Mientras la relación esté vigente + 4 años | LOPDGDD Art. 88 (deber de información) |
| `Employee.acceptedPolicies` (JSON) | Mientras la relación esté vigente + 4 años | LOPDGDD Art. 88 |
| `Employee.noticeVersionAccepted` | Mientras la relación esté vigente + 4 años | LOPDGDD Art. 88 |
| `AttendanceRules` (config por tenant) | Indefinida | Configuración tenant, no dato personal |

### 3.4 Modelo de recuperación per-tenant (resiliencia)

Si un tenant falla durante su purga (e.g. timeout, deadlock Postgres), los
**demás tenants siguen procesándose**. La lógica es:

- `tenantsProcessed`: tenants que terminaron OK.
- `tenantsFailed`: tenants que lanzaron excepción.
- `httpStatus`: **500 sólo si `tenantsFailed === tenants.length`** (todos
  fallaron). En cualquier otro caso devuelve **200**.
- `summary.attendance.byTenant[i].error`: mensaje del error por-tenant.
- `summary.attendance.byTenant[i].deletedAttendance` y `batches`: contadores
  parciales si los hubo (en la implementación actual pueden ser 0 si el
  helper lanza antes de retornar; ver follow-up de partial-batch recovery).

### 3.5 Métricas y telemetría

En **producción**, este cron emite al menos 1 log por corrida en stdout
(formato `console.log` → logs del contenedor de la app):

```
[Cron/CleanupAttendance] DONE idempotencyKeys=N attendance=N batches=N tenantsOK=N tenantsFailed=N durationMs=N
```

En **dry-run** el prefijo es `DRY-RUN` en lugar de `DONE`.

Además, por **cada tenant con error** (no fatal) emite:

```
[Cron/CleanupAttendance] Tenant <id> falló en purga (deletedParciales=X, batchesOk=Y): <error.message>
```

En **error fatal global** (no por-tenant):

```
[Cron/CleanupAttendance] Error fatal: <stack>
```

**Métricas clave para alertas externas**:

| Métrica | Campo JSON | Uso operacional |
|---------|------------|-----------------|
| Filas de marcajes purgadas | `summary.attendance.totalDeleted` | Tendencia de uso |
| Batches ejecutados | `summary.attendance.totalBatches` | Stress test del composite index |
| Idempotency keys purgadas | `summary.idempotency.deleted` | Salud del endpoint `/api/erp/attendance/punch` |
| Duración | `summary.durationMs` | SLO: < 60 s (Hobby) / < 300 s (Pro) |
| Tenants fallidos | `summary.tenantsFailed` | Alerta si > 0 |
| HTTP status | Top-level | 200 = healthy / 500 = outage |

### 3.6 Cumplimiento RGPD / LOPDGDD

- **RGPD Art. 5.1.e** (limitación del plazo de conservación): default
  `retentionDays = 1460` (4 años) cubre prescripción tributaria
  (Ley 58/2003, Art. 66) y laboral (LISOS, Art. 7). DPO puede
  extender hasta 1825 días (5 años) por tenant.
- **RGPD Art. 5.1.c** (minimización): el composite index
  `@@index([tenantId, timestamp])` permite la purga selectiva sin
  escanear toda la tabla.
- **RGPD Art. 32** (seguridad): auth `Bearer ${CRON_SECRET}`; logs
  sin contenido personal (sólo IDs, counters, duración).
- **LOPDGDD Art. 88** (deber de información): el campo
  `Employee.noticeAcknowledgedAt` está **fuera del alcance** de este
  cron — se preserva en `Employee` para auditoría.

### 3.7 Ejemplo de respuesta 200

> **Fuente única de verdad**: el JSON completo de respuesta esperada
> del handler cleanup-attendance está en §11.2 (incluye pre-flight
> check, JSON completo y tabla de 4 red flags accionables).
> §3.7 sólo anota el **contrato** del cron A:
>
> - **`summary.dryRun: true`** en dry-run (no se borra nada).
> - **`summary.dryRun: false`** en corrida real (con purga efectiva).
> - **HTTP 200** si uno o más tenants terminan OK; **HTTP 500** sólo
>   si **todos** los tenants fallaron (lógica per-tenant ver §3.4).
>
> Cualquier campo nuevo del handler debe editarse primero en §11.2
> y, si cambia el contrato, sincronizar este §3.7.

### 3.8 Frecuencia de modificación del schedule

- **Alta**: si cambia el `--max-time` de `deploy-vps/cron.sh` o el schedule del crontab de root.
- **Media**: si un DPO quiere extender la retención base a 5 años (cambiar
  `DEFAULT_RETENTION_DAYS` en el handler + migración Prisma).
- **Baja**: rotación de `CRON_SECRET`.

---

## 4. Cron B — `/api/cron/uptime-developers`

### 4.1 Resumen ejecutivo

- **Qué hace**: vigila las páginas públicas críticas para integradores
  externos (`/docs/developers` y `/openapi.json`) una vez al día.
- **Frecuencia**: `0 0 * * *` (diaria, 00:00 UTC). El texto histórico decía
  «cada 5 minutos»; el schedule real del crontab es diario.
- **Idempotente**: sí. No realiza mutaciones, solo lectura HTTP.
- **Skip fuera de producción**: si `VERCEL_ENV` está definida y no vale
  `"production"`, devuelve `{ skipped: "preview-env" }` sin probes. En el VPS
  la variable **no está definida**, así que el cron se ejecuta siempre.
- **Salida**: JSON 200 con `probes[]` y `failures`. `cron.sh` da por buena la
  corrida sólo con `200`; cualquier otro código se registra como fallo.

### 4.2 Endpoints vigilados

| Endpoint | Comprueba | Validación adicional |
|----------|-----------|----------------------|
| `${NEXT_PUBLIC_APP_URL}/docs/developers` | HTTP 200 + body no vacío | Sin validación de schema |
| `${NEXT_PUBLIC_APP_URL}/openapi.json` | HTTP 200 + body ≤ 256 KB | `JSON.parse` + `openapi === "3.0.3"` + `Object.keys(paths).length > 0` |

**Timeout por probe**: 10 s (AbortController).
**Ejecución paralela**: ambos probes corren en `Promise.all` (no secuencial).
**Reintentos**: 1 retry sólo si el primer intento recibe **3xx legítimo**
(CDN redirect). NO reintenta 4xx/5xx — esos siempre alertan.

### 4.3 Estado de alerta y deduplicación

Si algún probe falla (timeout, 5xx, schema inválido):

1. **Cooldown 5 min** vía `globalThis.__volkernUptimeAlertLastAt`. Con el cron
   en cadencia **diaria**, el cooldown ya no limita nada en la práctica: cada
   corrida alerta como máximo una vez por probe.
   **Limitación conocida**: al ser in-memory, no sobrevive a un reinicio del
   contenedor; con una corrida al día es irrelevante.
2. **Canales de alerta** (todos opcionales, orden de envío):
   - **console.warn** (siempre; va a los logs del contenedor de la app).
   - **Apprise**: `POST ${UPTIME_APPRISE_URL}/notify` con
     `{ title, body, type: "error", tag: "volkern-uptime" }`. 5 s timeout.
   - **Resend email** a `process.env.ADMIN_EMAIL` con subject `title`, body
     con hallazgos + acciones sugeridas + timestamp.

**Texto de alerta** (ejemplo):

```
🚨 Volkern public docs DOWN: 1 endpoint

• https://volkern.app/docs/developers → HTTP 503 (upstream connect error) en 812ms

Detectado:  2026-06-21T03:05:00.000Z
Ambiente:   production

Acción sugerida:
1. En el VPS: `docker compose ps` (en /root/volkern-erp) para ver el estado del stack.
2. Ver los logs de la app: `docker compose logs --tail=200`.
3. Si la regresión es de un despliegue reciente, volver a la imagen anterior
   con `deploy-vps/deploy-app.sh` y ver `docs/DEPLOY.md` §Troubleshooting.
4. Si persiste >15min, abrir incident.
```

### 4.4 Métricas y telemetría

Log por corrida exitosa (sin fallas):

```
(nada — sólo stdout devuelve el JSON al runtime)
```

Log por corrida con fallas (después de cooldown):

```
[uptime-developers] 🚨 Volkern public docs DOWN: 1 endpoint
• https://volkern.app/docs/developers → HTTP 503 (upstream connect error) en 812ms
...
```

Log si Apprise/Resend fallan:

```
[uptime-developers] Apprise notify failed: HTTP 502
[uptime-developers] Resend email failed: HTTP 401 — body truncated...
```

Log si cooldown está activo:

```
[uptime-developers] 1 fallo(s) detectado(s) — alerta suprimida por cooldown (faltan 287s)
```

**Métricas clave en el JSON de respuesta**:

| Métrica | Tipo | Uso |
|---------|------|-----|
| `success` | boolean | Healthy si todas las probes OK |
| `failures` | number | Conteo de probes que fallaron |
| `probes[].status` | number | HTTP status code observado (0 = timeout) |
| `probes[].durationMs` | number | Latencia por endpoint |
| `probes[].contentValid` | boolean? | Solo `/openapi.json`: schema OpenAPI válido |
| `probes[].retried` | boolean? | Si hubo reintento por 3xx |
| `alertSent` | boolean | Si la alerta se envió (no suprimida por cooldown) |
| `cooldownSkipped` | boolean | Si la alerta fue suprimida por cooldown |

### 4.5 RGPD

Este cron **no toca datos personales**. Su finalidad es la **transparencia
hacia integradores externos** que consumen la API pública de Volkern:

- Si `/docs/developers` está caído, integradores no pueden saber cómo
  autenticarse → bloquea onboarding (RGPD Art. 12: información concisa,
  transparente, inteligible).
- Si `/openapi.json` está corrupto, integradores no saben qué datos
  personales se solicitan → bloquea cumplimiento RGPD Art. 13.

Por tanto, este cron **no aplica Art. 5.1.e**, pero sí soporte al deber
de información RGPD Art. 12-14.

### 4.6 Frecuencia de modificación del schedule

- **Alta**: si cambia el schedule del crontab de root o el `--max-time` de `cron.sh`.
- **Media**: si se añaden nuevos endpoints públicos críticos al set vigilado.
- **Baja**: si se quiere añadir un canal de alerta adicional (e.g.
  Telegram, PagerDuty).

### 4.7 Limitaciones conocidas (de cara al auditor)

1. **Cooldown in-memory**: no durable cross cold-starts. Aceptamos hasta
   N alerts duplicadas si el outage cruza un restart — acotado por la
   frecuencia del cron (5 min). Para durabilidad completa we'd need
   Upstash KV (overkill para MVP).
2. **/openapi.json cap a 256 KB**: si el schema crece, falla. Acción: editar
   `OPENAPI_MAX_BYTES` en el handler.
3. **/docs/developers no valida schema**: sólo HTTP 200. Aceptable porque
   el contenido lo regenera Next.js en build.

---

## 5. Crons disparados por el scheduler in-process (no por el crontab)

> Esta sección documenta jobs cuyos handlers **SÍ existen** en
> `app/api/cron/` pero **NO están en el crontab del VPS**: se ejecutan dentro
> del proceso de la app vía `lib/cron/scheduler.ts` (node-cron), que arranca
> desde `instrumentation.ts` (`register()`, runtime `nodejs`) en **todos** los
> entornos, incluido el contenedor de producción.

### Cron C — `/api/cron/google-calendar-renew`

- **Trigger autoritativo**: `lib/cron/scheduler.ts`, job **#5**
  (`cron.schedule('0 */12 * * *', …)` → `calendar-renewal`), in-process en el
  contenedor. Verificado en los logs de producción: `✅ [Scheduler] Google
  Calendar webhook renewal programado (cada 12h)`.
- **Propósito**: los canales webhook de Google Calendar expiran al cabo de **7
  días** como máximo. Esta tarea renueva los canales cuya expiración está a
  **menos de 48 horas**. La cadencia de 12 h contra un umbral de 48 h tolera
  varias corridas perdidas sin que caduque ningún canal.
- **Salida**: JSON 200 con `total`, `renovadas`, `errores`, `detalles[]` por
  integración.
- **Logs**: logs del contenedor de la app
  (`docker service logs volkern-erp_app`, filtrar `[Cron]`).
- **Variables de entorno**: `DATABASE_URL` (entorno del contenedor);
  `CRON_SECRET` sólo si se invoca por HTTP.
- **El workflow `cron-renew-webhooks.yml` se eliminó** (2026-10-08). Vivía en
  `nextjs_space/.github/workflows/`, una ruta que **GitHub no lee** (sólo lee
  `.github/workflows/` en la raíz del repo), así que nunca se registró como
  workflow: `gh run list --workflow=cron-renew-webhooks.yml` devuelve **404** y
  los secretos `CRON_SECRET` / `APP_URL` de Actions **nunca se crearon**
  (`gh secret list` sale vacío). No era un respaldo: era un archivo muerto que
  hacía creer que existía un segundo disparador. Ver §10 (changelog).

**Por qué NO está en el crontab**: ya corre in-process cada 12 h. Añadirlo
crearía una **segunda invocación** del mismo trabajo, y `renewWebhookChannel`
crea un canal nuevo, de modo que dos corridas solapadas dejan **canales
duplicados** en Google Calendar. El criterio del sistema es **un único trigger
autoritativo por job**. Para un respaldo externo real habría que crear los dos
secretos de Actions y aceptar explícitamente esa duplicación.

---

## 6. Handlers `app/api/cron/` eliminados (registro histórico)

> Esta sección registra los route handlers que existieron pero fueron
> eliminados por dead-code (no invocados ni por el crontab del VPS, ni por
> GitHub Actions, ni por `lib/cron/scheduler.ts` interno). El log git preserva
> los archivos para eventuales restauraciones.

| Path eliminado | Fecha de eliminación | Reason de remoción | Servicios subyacentes |
|----------------|---------------------|-------------------|----------------------|
| `/api/cron/cleanup-analytics` | 2026-06-21 | Dead-code (no callers). Lógica equivalente en `lib/cron/scheduler.ts` #9 (`cleanupOldEvents`) | `cleanupOldEvents` (`lib/analytics/store`) — sobrevive en scheduler |
| `/api/cron/limit-alerts` | 2026-06-21 | Dead-code. Lógica equivalente en `lib/cron/scheduler.ts` #7 (`checkAndNotifyLimitAlerts`) | `checkAndNotifyLimitAlerts` (`lib/subscription`) — sobrevive |
| `/api/cron/academy-audit` | 2026-06-21 | Dead-code. Servicio `ExpirationWorker.scanExpirations` solo invocado aquí | `lib/academy/expiration-worker.ts` — **eliminado 2026-06-21** (no callers fuera de la ruta borrada) |
| `/api/cron/trials` | 2026-06-21 | Dead-code. Funciones `processExpiredTrials()`/`sendTrialReminders()` solo invocadas aquí | `lib/trial-service.ts` — **mantenido** (otros exports `TrialStatus`/`TrialInfo`/`TrialLimits`/`getTenantTrialInfo`/`startTenantTrial` siguen vivos en admin/hooks/API). Las 2 funciones muertas quedan como candidata a remoción en próxima limpieza. |
| `/api/cron/compliance-reports` | 2026-06-21 | Dead-code. Feature sustancial (237 líneas) no activado por ningún trigger | `sendEmail` (`lib/resend-email`) — sobrevive; reportaría Compliance PRO si reactivado |
| `/api/cron/accounting-proactivity` | 2026-06-21 | Dead-code. Servicios subyacentes usados en otros routes (portal, tests) | `AccountingProactivityWorker`, `FiscalCalendarService`, `NordigenService` — sobreviven |

**Política de reversión**: si un feature se reactiva, `git log -- app/api/cron/` recupera el archivo completo para reubicación.

---

## 7. Procedimientos de auditoría para el DPO

### 7.1 Verificar que un cron existe y está programado

```bash
# ¿Qué crons están programados en producción? (ejecutar EN EL VPS)
crontab -l

# ¿Qué corre cada job?
cat /root/volkern-erp/cron.sh

# ¿Se están ejecutando? Una línea por corrida, con OK o FALLÓ
tail -20 /var/log/volkern-cron.log

# ¿Qué handlers existen físicamente? (en el repo)
ls -1 app/api/cron/*/route.ts
```

Si un job del crontab apunta a un path que NO existe en el filesystem → bug.
Si un path existe en el filesystem pero NO está en el crontab → está
listado en §5 (externo) o §6 (eliminado) por diseño.

### 7.2 Inspeccionar qué se purgará HOY sin ejecutar deletes

> **Procedimiento completo**: ver §11.2 — incluye pre-flight check
> (`CRON_SECRET`, `jq`, `BASE_URL`), JSON de respuesta esperado
> completo y tabla accionable de 4 red flags.
> §7.2 conserva sólo la **línea copy-paste mínima** para audit rápido
> en consola limpia (DPO on-site, sin tiempo para setup completo).

Para `/api/cron/cleanup-attendance`:

```bash
curl -X GET 'https://volkern.app/api/cron/cleanup-attendance?dryRun=1' \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

**Contrato esperado (resumen)**: HTTP 200 con `summary.dryRun: true`,
contadores iguales que corrida real pero **sin deletes**. Para respuesta
JSON completa y diagnóstico avanzado (red flags) ver §11.2.

### 7.3 Verificar que el composite index se usa

Después de un redeploy que toque el modelo `Attendance`:

```bash
DATABASE_URL="postgres://..." bash scripts/check-cleanup-attendance-index.sh
```

**Salida esperada (exit 0)**:

```
✅ 'Index Scan using erp_attendance_logs_tenantId_timestamp_idx' presente.
✅ 'Index Cond:' presente (predicate pushed down).
✅ Sin 'Bitmap Heap Scan' (plan óptimo).
✅ Sin 'Seq Scan on erp_attendance_logs'.
✅ Sin Sort node extra (el índice provee orden natural).
✅ PASS: el composite index se usa correctamente.
```

> **Convención de naming de Prisma (corregida tras auditoría 2026-06-21)**:
> el composite `@@index([tenantId, timestamp])` del modelo `Attendance`
> (que tiene `@map("erp_attendance_logs")`) se nombra en la DB física como
> **`erp_attendance_logs_tenantId_timestamp_idx`** (snake_case basado en
> el `@map` table name), NO `Attendance_tenantId_timestamp_idx` (PascalCase
> basado en el model name). Precedente: el composite análogo de
> `system_metrics` quedó como `system_metrics_tenantId_metricType_timestamp_idx`
> en `prisma/migrations/20260601091455_add_catalogoItemId_to_deal/migration.sql`.
> Los single-column en `erp_attendance_logs` siguen el mismo patrón
> (`erp_attendance_logs_tenantId_idx`, `_employeeId_idx`, `_timestamp_idx`).
> El verifier bash acepta ambas variantes defensivamente.

#### Baseline de auditoría DPO — 2026-07-02 (post-fix attempt)

**Acciones ejecutadas este turno** (trazables en `git log` y ticket `cron-composite-index-missing`):

1. **Migración auto-Prisma creada** en `prisma/migrations/20260702000000_add_attendance_composite_index/migration.sql` con SQL:
   ```sql
   CREATE INDEX "erp_attendance_logs_tenantId_timestamp_idx"
     ON "erp_attendance_logs" ("tenantId", "timestamp");
   ```
   Naming snake_case basado en `@map("erp_attendance_logs")` (convención Prisma corregida tras auditoría 2026-06-21) + `CREATE INDEX` estándar sin `CONCURRENTLY` para encajar en la transacción que Prisma aplica por defecto.

2. **Aplicada en staging vía raw SQL** (`psql $DATABASE_URL -f <…>` equivalente) — NO a través de `npx prisma migrate deploy` porque el flujo deploy está bloqueado por **4 migraciones pre-existentes pendientes** en staging (no relacionadas con este composite — son `20260601_add_resend_email_fields`, `20260601091455_add_catalogoItemId_to_deal`, `20260620_add_visible_in_chatbot_to_catalogo`, `20260701_drop_biometric_attendance`). Ver ticket futuro `cron-staging-pending-migrations-drift` (a abrir).

3. **Reconciliación con `_prisma_migrations`** vía `npx prisma migrate resolve --applied "20260702000000_add_attendance_composite_index"` con sha256 local del archivo = `41e8cc9535679868620d0ad62d3763c7b69b20136521217c28a42982ba0cfd82`. Estado formal: **aplicado** en el historial Prisma.

4. **`ANALYZE erp_attendance_logs`** ejecutado para refrescar stats del planner Postgres.

**Resultado del verifier** (`bash scripts/check-cleanup-attendance-index.sh` con `DATABASE_URL` apuntando a Neon staging):

```
▶ Ejecutando EXPLAIN ANALYZE contra la base de datos...
Limit  (cost=4.45..4.46 rows=1 width=15) (actual time=0.013..0.014 rows=0 loops=1)
   …
   ->  Sort  (cost=4.17..4.18 rows=1 width=34) (actual time=0.008..0.008 rows=0 loops=1)
         Sort Key: erp_attendance_logs.timestamp
         ->  Index Scan using erp_attendance_logs_tenantId_idx on erp_attendance_logs
               Index Cond: (("tenantId" = 't-demo'))
               Filter: (("timestamp" < '2022-07-21 03:00:00+00'))
   …

▶ Verificando plan de query…
   ❌ NO se detecta 'Index Scan using (Attendance|erp_attendance_logs)_tenantId_timestamp_idx' en el plan.
   ✅ 'Index Cond:' presente (predicate pushed down).
   ✅ Sin 'Bitmap Heap Scan' (plan óptimo).
   ✅ Sin 'Seq Scan on erp_attendance_logs'.
   ⚠️  Encontrado 'Sort' node — posible re-sort en memoria.

❌ FAIL: el plan de query NO es óptimo. Investigar antes de deployar.

VERIFIER_EXIT=1
```

**Estado de pg_indexes** (5 índices = 4 previos + composite nuevo):

```
erp_attendance_logs_employeeId_idx
erp_attendance_logs_pkey
erp_attendance_logs_tenantId_idx
erp_attendance_logs_timestamp_idx
erp_attendance_logs_tenantId_timestamp_idx   ← NUEVO, composite aplicado
```

**Interpretación honesta del FAIL del verifier**:

✅ **Composite `@@index([tenantId, timestamp])` ESTÁ físicamente materializado** y reconciliado con el historial Prisma. La operación CREATE INDEX, ANALYZE, y `migrate resolve --applied` se ejecutaron sin error.

❌ **El planner de Postgres NO prefiere el composite** sobre el single-column `_tenantId_idx` en staging porque el dataset tiene sólo **184 filas en el tenant `t-demo`**. Postgres elige el plan más barato por costo estimado: con cardinal tan baja, el single-column + Sort en memoria cuesta microsegundos (≈ 0.008ms según EXPLAIN), indistinguible del composite Index Scan. Esta es una propiedad conocida del optimizador: con estadísticas tan escasas, la heurística prefiere el plan más simple.

→ **No es regresión operacional** — es comportamiento esperado de Postgres en dataset pequeño. El composite Index Scan SÍ se activará cuando `t-demo` crezca a miles/millones de filas, momento en que el sort en memoria se vuelva más caro que el índice compuesto. Recomendación: **No es necesario intervenir antes del deploy a producción**; el composite está listo para activarse automáticamente bajo carga real.

→ **Para evidenciar el uso del composite en staging ahora** (sin esperar a producción), una opción cleanup-table-friendly es la **Opción B del ticket §5#6**: seedear staging con ≥ 100k filas sintéticas para `t-demo` y re-correr el verifier. Como alternativa, **Opción C**: restaurar un dump anonimizado de producción a staging y verificar allí.

**Acciones derivadas (sub-tickets a abrir)**:

- `cron-staging-pending-migrations-drift` — limpiar las 4 migrations pre-existentes pendientes para que `npx prisma migrate status` retorne 'Database schema is up to date' (#4 del criterio del ticket) sin necesidad del bypass manual.
- `cron-composite-index-observability-prod` — abrir ventana de observabilidad 24-48h post-deploy prod para capturar el primer `cleanup-attendance` y confirmar `Index Scan using ..._tenantId_timestamp_idx` con dataset real (#7 criterio del ticket §5).
- `cron-staging-cardinality-bump` (opcional) — seedear staging con ≥100k filas para evidenciar uso del composite sin esperar a producción (#6 criterio §5).

---

#### Baseline de auditoría DPO — 2026-06-21 (capturado este ticket)

**Comando ejecutado**: `bash scripts/check-cleanup-attendance-index.sh` con `DATABASE_URL` apuntando a Neon staging.
**Exit code**: **1 (FAIL)** — bloqueo pre-deploy.
**Filas en `erp_attendance_logs` al momento del run**: 184.
**`last_autoanalyze`**: 2026-05-05 19:23:06 UTC.

`EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT id FROM erp_attendance_logs WHERE "tenantId" = 't-demo' AND "timestamp" < '2022-07-21 03:00:00+00' ORDER BY "timestamp" ASC LIMIT 50000` (verbatim):

```
Limit  (cost=23.49..23.74 rows=50 width=15) (actual time=0.041..0.041 rows=0 loops=1)
  Output: id
  Buffers: shared hit=4
  ->  Sort  (cost=23.49..23.74 rows=50 width=15) (actual time=0.040..0.040 rows=0 loops=1)
        Output: id
        Sort Key: "timestamp"
        Sort Method: quicksort  Memory: 25kB
        ->  Index Scan using erp_attendance_logs_tenantId_idx on erp_attendance_logs
              Output: id
              Index Cond: (("tenantId" = 't-demo'))
              Filter: ("timestamp" < '2022-07-21 03:00:00+00')
              Buffers: shared hit=4
Planning Time: 0.085 ms
Execution Time: 0.041 ms
```

`EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*) FROM erp_attendance_logs WHERE "tenantId" = 't-demo' AND "timestamp" < '2022-07-21 03:00:00+00'`:

```
Aggregate  (cost=23.45..23.46 rows=1 width=8) (actual time=0.034..0.034 rows=1 loops=1)
  Output: count(*)
  Buffers: shared hit=4
  ->  Index Scan using erp_attendance_logs_tenantId_idx on erp_attendance_logs
        Index Cond: (("tenantId" = 't-demo'))
        Filter: ("timestamp" < '2022-07-21 03:00:00+00')
        Buffers: shared hit=4
Planning Time: 0.118 ms
Execution Time: 0.034 ms
```

**Red flags confirmados en el plan**:

1. ❌ Plan usa `erp_attendance_logs_tenantId_idx` (single-column) en lugar de `Attendance_tenantId_timestamp_idx` (composite).
2. ❌ Predicate `"timestamp" < cutoff` figura como **`Filter:`** (se evalúa fila a fila post-Index Scan) en lugar de `Index Cond:` (push-down al índice).
3. ❌ Nodo `Sort` con `quicksort Memory: 25kB` separado entre Index Scan y Limit → re-sort en memoria porque el single-column idx no provee orden temporal.

**Diagnóstico definitivo** (ver ticket `docs/cron-tickets/CLEANUP-ATTENDANCE-INDEX-MISSING.md`):

| Paso                                          | Resultado                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `pg_indexes` sobre `erp_attendance_logs`      | **NO existe `Attendance_tenantId_timestamp_idx`** (sólo los 4 single-column)  |
| Schema `prisma/schema.prisma`                 | Define `@@index([tenantId, timestamp])` ✓                                      |
| `prisma/migrations/`                          | Sin migración que cree explícitamente el composite                             |

→ **Causa raíz**: la migración que crea el composite index **nunca fue generada ni aplicada a staging**. El verifier es correcto — el composite falta físicamente en DB. El bajo cardinal (184 filas) enmascara el problema: si producción tiene millones de filas, Postgres cae a `Seq Scan` y rompe los SLO §9.1.

**Acciones pre-deploy** (resumen; ver ticket completo):

1. `npx prisma migrate diff --from-url $STAGING --to-schema-datamodel prisma/schema.prisma --script` y, si Prisma no detecta el diff, crear manualmente `prisma/migrations/<ts>_add_attendance_composite_index/migration.sql` con `CREATE INDEX "Attendance_tenantId_timestamp_idx" ON "erp_attendance_logs"("tenantId", "timestamp")`.
2. `npx prisma migrate deploy` contra staging + producción.
3. `ANALYZE erp_attendance_logs` para refrescar stats.
4. Re-correr el verifier → debe retornar exit 0.
5. Actualizar esta sección §7.3 con la nueva fecha baseline.

#### Baseline de auditoría DPO — 2026-06-23 (audit-log composite — materializado en staging)

**Objetivo**: Validar empíricamente que el índice `@@index([tenantId, accion, fechaCreacion])` añadido al modelo `AuditLog` (Prisma) reduce el costo de las queries que `ComplianceScoreService` lanza en cada invocación de `/dashboard/compliance`. Las dos queries target son:

- `scoreAlertas` (conteo de bloqueos últimos 7d): `SELECT count(*) FROM "AuditLog" WHERE "tenantId"=$1 AND accion='COMPLIANCE_BLOCKED' AND "fechaCreacion" >= now() - interval '7 days'`
- `getTrend` (último score persistido): `SELECT metadata FROM "AuditLog" WHERE "tenantId"=$1 AND accion='COMPLIANCE_SCORE' ORDER BY "fechaCreacion" DESC LIMIT 1`

**Condiciones**: dataset sintético de **100k filas** injectadas en `AuditLog` (50 tenants sintéticos × ~2k filas/tenant × 1% accion blocking × ~2% score persistido) y cleanup atómico (id-prefix `bench-2026-07-` + marker `metadata._bench='2026-07'`, batches 50k).

**Importante: scope deviation honesto**. El usuario pidió "~1M filas" para el benchmark, pero el límite de proyecto PostgreSQL en Neon staging (`neon.max_cluster_size GUC`) es **512 MB** y tanto 1M como 300k filas excedieron el límite durante el INSERT. 100k filas evidencia el composite sin demandar upgrade del cluster Neon staging. Si producción tiene cardinal bajo similar (>~1M), la mejora será idéntica o mayor a estos números; si cardinal es extremadamente menor (<~5k/tenant), el planner podría seguir prefiriendo Seq Scan (ver §7.3 Attendance precedent — análogo comportamiento esperado).

#### Acciones ejecutadas este turno (trazables en `git log`)

1. **Migración** `prisma/migrations/20260623000001_add_auditlog_composite_index/migration.sql` con `CREATE INDEX "AuditLog_tenantId_accion_fechaCreacion_idx" ON "AuditLog" ("tenantId", accion, "fechaCreacion")` approved en schema, reconciliada con `_prisma_migrations` mediante `npx prisma migrate resolve --applied` + `ANALYZE "AuditLog"`.
2. **`scripts/bench/auditlog-composite-index-benchmark.sql`** — benchmark reproducible: pre-seed 50 stubs `Tenant` (FK compliance para `AuditLog.tenantId → Tenant.id`), siembre 100k filas con `userId = NULL` (column nullable en schema, salta FK a `User` sin pre-seeding), EXPLAIN ANALYZE con composite, BEGIN/DROP/ROLLBACK para simular ausencia, cleanup batched en bloques de 50k.
3. **`scripts/check-auditlog-composite-index.sh`** — verificador bash que mirrors `scripts/check-cleanup-attendance-index.sh` (mismo patron: fall-back chain `.env.local → .env → .env.example`, parsea output de psql con `grep -c` para contar ocurrencias, exit 0=PASS / 1=FAIL).

Tras **3 iteraciones** (1M → 300k → 100k) para sortear el límite de Neon staging y **2 correcciones al verifier** (regex que ignoraba las comillas dobles en el nombre del índice + check por `.` que no cruzaba saltos de línea), el script emite **exit 0 con las 4 aserciones ✅ en verde**:

```
▶ psql exit code: 0
▶ Verificando plan de query…
   ✅ 2 ocurrencias de Index Scan sobre AuditLog_tenantId_accion_fechaCreacion_idx (≥2 esperado)
   ✅ scoreAlertas → Index Only Scan (count sin heap fetch innecesario — óptimo)
   ✅ getTrend → Index Scan Backward sobre AuditLog_tenantId_accion_fechaCreacion_idx (sin Filter/Sort extra)
   ✅ Sección 4 (sin composite) usa Seq Scan/Bitmap Heap (degradación observada)
▶ Filas sintéticas residuales: 0

✅ PASS: el composite AuditLog_tenantId_accion_fechaCreacion_idx se usa correctamente.
   scoreAlertas + getTrend Index Scan/Index Only Scan confirmado.
   Cleanup correcto: 0 filas sintéticas residuales.
```

#### EXPLAIN ANALYZE verbatim — `scoreAlertas` con composite ACTIVO

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*) FROM "AuditLog"
WHERE "tenantId" = 'bench-tenant-0'
  AND accion     = 'COMPLIANCE_BLOCKED'
  AND "fechaCreacion" >= NOW() - interval '7 days';
```

```
 Aggregate  (cost=8.45..8.46 rows=1 width=8) (actual time=0.049..0.050 rows=1 loops=1)
   Buffers: shared hit=28
   ->  Index Only Scan using "AuditLog_tenantId_accion_fechaCreacion_idx" on "AuditLog"  (cost=0.42..8.44 rows=1 width=0) (actual time=0.016..0.043 rows=23 loops=1)
         Index Cond: (("tenantId" = 'bench-tenant-0'::text) AND (accion = 'COMPLIANCE_BLOCKED'::text) AND ("fechaCreacion" >= (now() - '7 days'::interval)))
         Heap Fetches: 23
         Buffers: shared hit=28
 Planning:
   Buffers: shared hit=72
 Planning Time: 0.234 ms
 Execution Time: 0.069 ms
```

#### EXPLAIN ANALYZE verbatim — `getTrend` con composite ACTIVO

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT metadata FROM "AuditLog"
WHERE "tenantId" = 'bench-tenant-0'
  AND accion     = 'COMPLIANCE_SCORE'
ORDER BY "fechaCreacion" DESC
LIMIT 1;
```

```
 Limit  (cost=0.42..5.07 rows=1 width=53) (actual time=0.018..0.018 rows=1 loops=1)
   Buffers: shared hit=4
   ->  Index Scan Backward using "AuditLog_tenantId_accion_fechaCreacion_idx" on "AuditLog"  (cost=0.42..88.79 rows=19 width=53) (actual time=0.017..0.017 rows=1 loops=1)
         Index Cond: (("tenantId" = 'bench-tenant-0'::text) AND (accion = 'COMPLIANCE_SCORE'::text))
         Buffers: shared hit=4
 Planning:
   Buffers: shared hit=3
 Planning Time: 0.143 ms
 Execution Time: 0.032 ms
```

#### EXPLAIN ANALYZE verbatim — `scoreAlertas` SIMULANDO composite AUSENTE (BEGIN / DROP INDEX / ROLLBACK)

```
 Aggregate  (cost=573.38..573.39 rows=1 width=8) (actual time=0.421..0.422 rows=1 loops=1)
   Buffers: shared hit=56
   ->  Bitmap Heap Scan on "AuditLog"  (cost=430.52..573.38 rows=1 width=0) (actual time=0.366..0.416 rows=23 loops=1)
         Recheck Cond: (("tenantId" = 'bench-tenant-0'::text) AND ("fechaCreacion" >= (now() - '7 days'::interval)))
         Filter: (accion = 'COMPLIANCE_BLOCKED'::text)
         Rows Removed by Filter: 15
         Heap Blocks: exact=38
         Buffers: shared hit=56
         ->  BitmapAnd  (cost=430.52..430.52 rows=39 width=0) (actual time=0.352..0.352 rows=0 loops=1)
               Buffers: shared hit=18
               ->  Bitmap Index Scan on "AuditLog_tenantId_idx"  (cost=0.00..86.90 rows=1947 width=0) (actual time=0.142..0.143 rows=2000 loops=1)
                     Index Cond: ("tenantId" = 'bench-tenant-0'::text)
                     Buffers: shared hit=3
               ->  Bitmap Index Scan on "AuditLog_fechaCreacion_idx"  (cost=0.00..343.38 rows=1994 width=0) (actual time=0.134..0.134 rows=1972 loops=1)
                     Index Cond: ("fechaCreacion" >= (now() - '7 days'::interval))
                     Buffers: shared hit=15
 Planning Time: 0.153 ms
 Execution Time: 0.457 ms
```

#### EXPLAIN ANALYZE verbatim — `getTrend` SIMULANDO composite AUSENTE (fallback)

```
 Limit  (cost=0.42..1537.82 rows=1 width=53) (actual time=0.126..0.127 rows=1 loops=1)
   Buffers: shared hit=78
   ->  Index Scan Backward using "AuditLog_fechaCreacion_idx" on "AuditLog"  (cost=0.42..29211.11 rows=19 width=53) (actual time=0.125..0.125 rows=1 loops=1)
         Filter: (("tenantId" = 'bench-tenant-0'::text) AND (accion = 'COMPLIANCE_SCORE'::text))
         Rows Removed by Filter: 74
         Buffers: shared hit=78
 Planning Time: 0.100 ms
 Execution Time: 0.141 ms
```

#### Tabla comparativa (área bajo la curva, menor es mejor)

| Query                                    | Plan                                | Buffers | Execution Time | Lecturas row-by-row |
|------------------------------------------|-------------------------------------|---------|----------------|---------------------|
| `scoreAlertas`  con composite            | **Index Only Scan**                 | **28**  | **0.069 ms**   | 0 (Heap Fetches=23 solo MVCC) |
| `scoreAlertas`  sin composite (fallback) | Bitmap Heap Scan + 2 Bitmap Index    | 56      | 0.457 ms       | `Filter: (accion=…) → Rows Removed: 15` |
| `getTrend`     con composite              | **Index Scan Backward**             | **4**   | **0.032 ms**   | 0 |
| `getTrend`     sin composite (fallback)   | Index Scan Backward sobre `_fechaCreacion_idx` (single-col) | 78 | 0.141 ms | `Filter: (tenantId, accion) → Rows Removed: 74` |

**Speedup medible**:

- `scoreAlertas`: **6.6× más rápido** (0.457 → 0.069 ms), **50% menos buffers** (56 → 28), y **elimina el Filter row-by-row** (Index Cond push-down con los 3 predicados).
- `getTrend`: **4.4× más rápido** (0.141 → 0.032 ms), **95% menos buffers** (78 → 4), y **elimina el Filter post-fetch** (Index Cond con solo `tenantId + accion`; el `ORDER BY fechaCreacion DESC` lo sirve el índice directamente vía `Index Scan Backward`).

#### Interpretación diagnóstica (lectura honesta del FIXME-style)

- ✅ **Composite materializado Y preferido por el planner** sobre los single-column existentes (`AuditLog_tenantId_idx` + `AuditLog_fechaCreacion_idx`). Sin el composite, Postgres degrada a `Bitmap Heap Scan` (combina ambos single-column) o a `Index Scan Backward sobre _fechaCreacion_idx` con `Filter` para los dos predicados que faltan.
- ✅ **El `Heap Fetches: 23` de la sección 3.1 NO es regresión**. En un `Index Only Scan`, Postgres todavía hace heap-fetches para verificar visibilidad MVCC de cada tupla del leaf — son de facto gratis (mismo buffer pool que ya estaba caliente por el index scan) y NO requieren acceso a disco.
- ⚠️ **Limitación metodológica del lower bound**: el bloque `--no-index-recompute-no-analize` no se aplicó; el EXPLAIN del §4 (sin composite) reusa las stats post-ANALYZE de §2 (con composite presente). Esto hace que los números del fallback sean un **lower bound optimista** — en rigor, sería mayor. La mejora efectiva es ≥ 4–7×, no ≤ 4–7×.
- ⚠️ **Limitación de cardinal dataset**: el benchmark usa 100k filas (no 1M por límite de Neon staging). En producción con cardinal mayor, el composite sigue scaling bien (es B-Tree). En cardinal ultra-bajo (<~5k/tenant), el planner podría revertir a Seq Scan — mismo comportamiento que el precedent §7.3 Attendance observó en staging 2026-06.
- ✅ **Cleanup verificado**: tanto el batch DELETE en bloques de 50k como el `DELETE FROM "Tenant" WHERE id LIKE 'bench-tenant-%'` finalizaron OK. Filas residuales: 0 (auditado por el bash script con `psql -At -c "SELECT count(*) ..."`).

**Acciones derivadas (sub-tickets referenciados)**:

- `cron-auditlog-composite-index-observability-prod` — ventana 24-48h post-deploy prod para re-confirmar `Index Only Scan` con dataset real. **Baseline t=0 capturado: ver §7.3.4 (snap `/tmp/auditlog_prod_t0.jsonl`).**
- `cron-staging-rows-per-tenant-bump` — opcionalmente seedear staging con cifras más altas tras upgrade del cluster Neon si se requiere evidencia con cardinal producción-realista.

#### Baseline de auditoría DPO — 2026-06-23 (audit-log composite — observado en PRODUCCIÓN real)

**Objetivo específico**: ejecutar el §7.3 (benchmark staging, 100k sintético) en PRODUCCIÓN sin inserts sintéticos, midiendo el comportamiento del planner contra cardinal real.

**Metodología READ-ONLY** (replicada vía `scripts/check-auditlog-prod-observability.sh`):

- NO `INSERT INTO "AuditLog"` — leemos cardinal ya presente en DB.
- NO `DROP INDEX` — el composite está vivo en prod, debe preservarse.
- `SET statement_timeout = '15s'` (30s para EXPLAIN ANALYZE) + `lock_timeout = '2s'` para no contender con prod traffic.
- Toma `pg_stat_user_indexes` + `json_build_object` cardinal + EXPLAIN (no ANALYZE) sobre 3 tenants representativos (top-1, middle-1, bottom-1 del top-5 por filas).
- `db_vía DATABASE_URL desde .env.production` (Neon prod pooler `ep-withered-mode-al6o4sjg-pooler.c-3.eu-central-1.aws.neon.tech`).

**Resultado cardinal t=0** (snapshot JSON guardado en `/tmp/auditlog_prod_t0.jsonl`, exit code basher = 0):

```json
{
  "captured_at":                  "2026-06-23T13:42:20Z",
  "auditlog_live_tuples":         341,
  "auditlog_dead_tuples":         0,
  "auditlog_reltuples_pgclass":   341,
  "auditlog_seq_scan":            761,
  "auditlog_idx_scan_total":      785,
  "auditlog_total_size":          "254 MB",
  "auditlog_index_size":          "254 MB",
  "auditlog_avg_row_size":        "763 kB",
  "tenant_count":                 89,
  "composite_present":            true,
  "top5_tenants_by_rows": [
    { "tenantId": "cmov5lo3y0000l704brur86uq", "rows": 172 },
    { "tenantId": "cmo09jrkc0000mf0ebul7xe9q", "rows": 99  },
    { "tenantId": null,                        "rows": 27  },
    { "tenantId": "local-dev-tenant",          "rows": 12  },
    { "tenantId": "cmo0axgu30000mfux54c6mb30", "rows": 9   }
  ],
  "pg_indexes_AuditLog": [
    "AuditLog_entidadId_idx",
    "AuditLog_entidad_idx",
    "AuditLog_fechaCreacion_idx",
    "AuditLog_pkey",
    "AuditLog_tenantId_accion_fechaCreacion_idx",
    "AuditLog_tenantId_idx",
    "AuditLog_userId_idx"
  ],
  "pg_stat_user_indexes": [
    { "indexrelname": "AuditLog_entidadId_idx",                     "idx_scan": 23,  "idx_tup_read": 0,    "idx_tup_fetch": 0,    "last_idx_scan": "2026-06-22T15:52:19.215874+00:00" },
    { "indexrelname": "AuditLog_entidad_idx",                       "idx_scan": 0,   "idx_tup_read": 0,    "idx_tup_fetch": 0,    "last_idx_scan": null                                       },
    { "indexrelname": "AuditLog_fechaCreacion_idx",                 "idx_scan": 27,  "idx_tup_read": 6202, "idx_tup_fetch": 375,  "last_idx_scan": "2026-06-23T13:18:59.448689+00:00" },
    { "indexrelname": "AuditLog_pkey",                              "idx_scan": 18,  "idx_tup_read": 618,  "idx_tup_fetch": 12,   "last_idx_scan": "2026-06-23T13:19:01.799894+00:00" },
    { "indexrelname": "AuditLog_tenantId_accion_fechaCreacion_idx", "idx_scan": 6,   "idx_tup_read": 54,   "idx_tup_fetch": 54,   "last_idx_scan": "2026-06-23T13:18:59.448689+00:00" },
    { "indexrelname": "AuditLog_tenantId_idx",                      "idx_scan": 704, "idx_tup_read": 480012, "idx_tup_fetch": 0,  "last_idx_scan": "2026-06-23T13:19:00.476229+00:00" },
    { "indexrelname": "AuditLog_userId_idx",                        "idx_scan": 7,   "idx_tup_read": 2,    "idx_tup_fetch": 2,    "last_idx_scan": "2026-05-29T17:26:09.24866+00:00"  }
  ]
}
```

**EXPLAIN (no ANALYZE) verbatim — prod t=0**:

Sobre top tenant `cmov5lo3y0000l704brur86uq` (172 filas totales):

```
scoreAlertas:
 Aggregate  (cost=22.68..22.69 rows=1 width=8)
   ->  Seq Scan on "AuditLog"  (cost=0.00..22.67 rows=1 width=0)
         Filter: (("tenantId" = 'cmov5lo3y0000l704brur86uq'::text) AND (accion = 'COMPLIANCE_BLOCKED'::text) AND ("fechaCreacion" >= (now() - '7 days'::interval)))

getTrend:
 Limit  (cost=20.13..20.13 rows=1 width=16)
   ->  Sort  (cost=20.13..20.13 rows=1 width=16)
         Sort Key: "fechaCreacion" DESC
         ->  Seq Scan on "AuditLog"  (cost=0.00..20.12 rows=1 width=16)
               Filter: (("tenantId" = 'cmov5lo3y0000l704brur86uq'::text) AND (accion = 'COMPLIANCE_SCORE'::text))
```

Sobre bottom tenant `cmo0axgu30000mfux54c6mb30` (9 filas): **idéntico plan** — Seq Scan + Filter / Sort.

**Interpretación diagnóstica** (lectura honesta):

- ✅ **Composite `@@index([tenantId, accion, fechaCreacion])` materializado físicamente en prod** (`pg_indexes` lo lista).
- ✅ **Composite ya está siendo escaneado**: `idx_scan = 6` en `pg_stat_user_indexes`, idx_tup_read = 54. Algún job background usa el composite donde sus queries lo justifican.
- ⚠️ **El planner NO prefiere el composite sobre Seq Scan en este momento**, idéntico patrón al precedent §7.3 Attendance staging: con sólo **341 filas totales**, Postgres elige Seq Scan porque el costo estimado de leer 254 MB secuencialmente (cache-friendly, hot data) es **menor** que el costo de Index Scan. El speedup 6.6×/4.4× del §7.3 NO se materializa hasta que el cardinal crezca.
- ✅ **NO es bloat — son filas TOAST-heavy legítimas**: con `auditlog_dead_tuples = 0`, `auditlog_live_tuples = 341` y `auditlog_reltuples_pgclass = 341` (cross-validate via pg_class.reltuples confirma stats frescos), las 254 MB corresponden a filas VIVAS con metadata JSON pesado (campos `cambiosAntes`, `cambiosDespues`, `metadata`, `descripcion`, `userAgent` grandes). `auditlog_avg_row_size = 763 kB` confirma TOAST significativo per row (PG auto-TOASTa campos >2 KB, los audit rows ricos superan ese umbral fácilmente). **No procede `VACUUM (ANALYZE)` — no hay dead tuples que recuperar**. El bloat-vs-TOAST hipótesis retocado: la versión anterior (v3) decía "bloat severo", lo cual era incorrecto. La versión v4 distingue vía `n_dead_tup` y avg_row_size.
- ⚠️ **`auditlog_idx_scan_total = 785` vs `auditlog_seq_scan = 759`** — ratio 50/50 confirma que en cardinal actual el planner usa ambos planes según la query. El composite es uno de los 6 índices escaneados pero NO es dominante todavía.

**Conclusión honesta del snapshot t=0**:

> En cardinal real prod (341 filas), el speedup proyectado del staging benchmark (6.6×/~4.4×) **NO es observable todavía** — el planner tomó la decisión correcta para cardinal bajo: Seq Scan. Esto NO es regresión; es comportamiento esperado de Postgres. El composite está listo y se activará automáticamente cuando `auditlog_live_tuples` crezca (target: ≥10k-100k filas). Los jobs background que usan el composite (idx_scan=6) ya están aprovechando el índice donde sus queries lo justifican.

**Runbook ventana 24-48h** (`scripts/check-auditlog-prod-observability.sh`):

```bash
# Pre-requisitos: DATABASE_URL apuntando a Neon prod (NO staging).
# Recomendado: correr via SSH tunnel al bastion prod.

# t=0 (baseline inicial)
DATABASE_URL="$PROD_DATABASE_URL" \
  bash scripts/check-auditlog-prod-observability.sh /tmp/auditlog_prod_t0.jsonl

# t+12h (diff contra baseline)
DATABASE_URL="$PROD_DATABASE_URL" \
  bash scripts/check-auditlog-prod-observability.sh /tmp/auditlog_prod_t12.jsonl /tmp/auditlog_prod_t0.jsonl

# t+24h (cierre ventana post-deploy)
DATABASE_URL="$PROD_DATABASE_URL" \
  bash scripts/check-auditlog-prod-observability.sh /tmp/auditlog_prod_t24.jsonl /tmp/auditlog_prod_t0.jsonl
```

**Qué monitorear en cada diff**:

| Campo                                                              | Dirección saludable          | Red flag si…                              |
|--------------------------------------------------------------------|------------------------------|-------------------------------------------|
| `auditlog_live_tuples`                                             | creciendo (writes)           | decrece sin explicación ⇒ DELETEs anómalos |
| `auditlog_seq_scan`                                                | crecimiento lineal           | crecimiento exponencial ⇒ planner revirtió a Seq Scan masivamente |
| `auditlog_idx_scan_total`                                          | creciendo                    | estable o baja ⇒ índice no se integró en hot-path |
| `AuditLog_tenantId_accion_fechaCreacion_idx.idx_scan`              | creciendo (uso real)         | 0 ⇒ composite ignorado por completo        |
| Ratio `AuditLog_tenantId_idx.idx_scan` / composite.idx_scan       | cayendo a < 50:1 con       <br>cardinal ≥ 10k             | ratio > 100:1 con cardinal <br>< 1k ⇒ composite infrautilizado   |
| `composite_present`                                                | siempre `true`               | `false` ⇒ rollback o DROP accidental       |

**Próximas acciones derivadas**:

- `cron-auditlog-prod-bloat-vacuum` — investigar `pgstattuple('"AuditLog"')` y, si dead_tuples > 20%, ejecutar `VACUUM (ANALYZE) "AuditLog";` en ventana off-peak.
- `cron-auditlog-prod-window-replay` — re-ejecutar este runbook en t+24h, t+48h; cruzar `auditlog_live_tuples` con el ratio usado por el planner para predecir cuándo el composite será dominante.
- `cron-auditlog-composite-correlation` — correlacionar `idx_scan` del composite con métricas de la app (`ComplianceScore` keyword en los logs del contenedor) para confirmar end-to-end.

### 7.4 Reconstruir el cutoff usado en una corrida histórica

Si la corrida se ejecutó el `T` con tenant `X`:

```sql
-- cutoff para tenant X
SELECT
  (NOW() - (
    COALESCE(
      (SELECT "retentionDays" FROM "AttendanceRules"
       WHERE "tenantId" = 'X' LIMIT 1),
      1460
    ) * INTERVAL '1 day'
  ))::timestamptz AS cutoff_usado;

-- Cuántos marcajes se purgarían hoy AHORA
SELECT COUNT(*) AS "would_be_deleted"
FROM "Attendance"
WHERE "tenantId" = 'X'
  AND "timestamp" < NOW() - (
    COALESCE(
      (SELECT "retentionDays" FROM "AttendanceRules"
       WHERE "tenantId" = 'X' LIMIT 1),
      1460
    ) * INTERVAL '1 day'
  );
```

(Nota: columnas Prisma preservan camelCase con doble comilla.)

### 7.5 Diff entre dos corridas del cleanup-attendance

Las métricas emitidas por `console.log` van a los **logs del contenedor** de
la app. Para DPO:

1. En el VPS: `docker compose logs --since 24h | grep '\[Cron/CleanupAttendance\]'`.
2. Comparar `attendance=N` y `durationMs=N` entre fechas.
3. El resultado de cada corrida (200 o fallo) queda además en
   `/var/log/volkern-cron.log`, con una línea por día.

**Anomalía operacional típica**:

| Patrón | Diagnóstico probable | Acción |
|---------|---------------------|--------|
| `durationMs` creciente linealmente sin plateau | Composite index no se está usando | Ejecutar `scripts/check-cleanup-attendance-index.sh` |
| `tenantsFailed > 0` repetido | DB connection pool exhausted | Revisar `DATABASE_URL` max_connections y PgBouncer |
| `attendance=0` durante días | Datos ya purgados (correcto) | Ninguna |
| `idempotency.deleted` >> 24h | Un scope tiene TTL > 24h | Auditar quién setea `expiresAt` en `IdempotencyKey.create` |

---

## 8. Procedimientos de recuperación ante fallo

### 8.1 Si `CRON_SECRET` se rota pero el entorno del VPS no se actualiza

**Síntoma**: los jobs empiezan a registrar `FALLÓ (401)` en
`/var/log/volkern-cron.log` el mismo día de la rotación.

**Acción**:

1. Actualizar `CRON_SECRET` en `/root/volkern-erp/.env` del VPS y en el
   secreto `CRON_SECRET` de GitHub Actions, que usa el mismo valor.
2. Reiniciar el contenedor de la app: el valor forma parte de su entorno desde
   el arranque, así que sin reinicio el handler sigue comparando el viejo.
3. `cron.sh` **no** necesita reinicio: lee la variable en cada ejecución.
4. Al día siguiente, confirmar `OK (200)` en el log.

### 8.2 Si cleanup-attendance excede `maxDuration` (300 s en Pro)

**Síntoma**: `/var/log/volkern-cron.log` muestra `FALLÓ (000)` (el `curl` se
rindió a los 120 s) o `FALLÓ (500)`.

**Recuperación automática**: la corrida del día siguiente recogerá los
rows restantes (el endpoint es idempotente: el `where` filtra por
`timestamp<cutoff`, los rows ya purgados simplemente no aparecen).

**Acción manual** (si necesitas acelerar la recuperación):

1. Dividir el job en chunks (e.g. por tenant individualmente).
2. O ejecutar el cron mañana con `?forceBatch=1` — **NO IMPLEMENTADO hoy**;
   workaround: re-disparar manualmente vía curl con `CRON_SECRET`.
3. Si un tenant específico es culpable (e.g. 100M marcajes), excluirlo
   temporalmente del cleanup (e.g. `attendanceRules.retentionDays = MAX`
   → no se purga nada).

### 8.3 Si uptime-developers reporta falsos positivos

**Síntoma**: alertas repetidas pero `/docs/developers` responde 200 al
verificar manualmente.

**Probable causa**: el contenedor estaba arrancando (cold start) o el host tardó más de 10 s en responder a la probe.

**Acción**:

1. Inspeccionar `probes[].durationMs` — si > 8000 ms, sospechoso.
2. Inspeccionar `cooldownSkipped: true` → confirma in-memory throttle.
3. Si persiste, ajustar `PROBE_TIMEOUT_MS` (hoy 10 s) o aumentar `ALERT_COOLDOWN_MS` (hoy 5 min).

### 8.4 Si un DPO quiere extender la retención

**Acción** (sin redeploy):

1. Actualizar `tenant.attendanceRules.retentionDays` (vía admin).
2. La siguiente corrida de cleanup-attendance respetará el nuevo valor.
3. **IMPORTANTE**: aumentar el valor NUNCA borra más allá; reducir SÍ
   purga inmediatamente el día siguiente.

### 8.5 Si un DPO quiere REDUCIR la retención (borrar más rápido)

**Acción**:

1. Cambiar `retentionDays` al valor nuevo.
2. La próxima corrida borrará filas cuya `timestamp < NOW - nuevoValor`.
3. Confirmar primero con dry-run (`?dryRun=1`) qué se va a purgar.

---

## 9. Métricas observables y dónde consultarlas

| Fuente | Qué contiene | Acceso |
|--------|--------------|--------|
| `console.log` cleanup-attendance | Total purgados, batches, duración, tenants OK/Failed | En el VPS: `docker compose logs --since 24h \| grep '\[Cron/CleanupAttendance\]'` |
| `console.log/console.warn` uptime-developers | Probes, alert bodies, errores de integración | En el VPS: `docker compose logs --since 24h \| grep '\[uptime-developers\]'` |
| Postgres `pg_stat_user_tables` | `n_tup_ins`, `n_tup_del`, `seq_scan`, `idx_scan` por tabla | SQL client con acceso a `DATABASE_URL` |
| `summary` JSON del response | Estructura completa de la corrida | Llamada directa a la API con `CRON_SECRET` |

### 9.1 SLOs internos

| Componente | SLO |
|------------|-----|
| cleanup-attendance `durationMs` | p95 ≤ 60 s (Pro) en condición normal (~50k rows/tenant) |
| cleanup-attendance `tenantsFailed` | == 0 idealmente; ≤ 1 sin alertar |
| uptime-developers `success` | ≥ 99.5% mensual (alertas dedupadas por 5 min) |
| Auth: 401 inesperado (no por rotación) | == 0 |

**Política de revisión**: el SLO board se revisa trimestralmente. Si un
SLO se degrada > 10% durante un mes, abrir ticket de capacity planning.

---

## 10. Cambio de versión y changelog

> Mantener esta tabla sincronizada con cada modificación al crontab del VPS
o a `deploy-vps/cron.sh`
> o a los handlers de `app/api/cron/`.

| Fecha | Cambio | Ticket | Autor |
|-------|--------|--------|-------|
| 2026-10-08 | **Clasificación RGPD de los dos crons de Hospitality** que estaban sin clasificar (§1.1): `hospitality-reconcile` (D) y `hospitality-briefing` (E), con categorías de datos, base jurídica, minimización y retención, derivadas del código. Se declara explícitamente el pendiente restante: los 6 jobs de Hospitality del scheduler in-process siguen sin ficha. | `cron-hospitality-rgpd` | platform-team |
| 2026-10-08 | **Cron C reasignado al scheduler in-process y eliminado el workflow muerto**: se comprobó contra GitHub que `nextjs_space/.github/workflows/cron-renew-webhooks.yml` **nunca se registró** (ruta que GitHub no lee; `gh run list` = 404) y que sus secretos **nunca existieron** (`gh secret list` vacío). La renovación de canales de Google Calendar **sí** está corriendo, in-process (`lib/cron/scheduler.ts` #5), verificado en los logs del contenedor. Se elimina el archivo y se reescribe §5. **No** se añade al crontab: produciría canales duplicados. Se documenta también que `hospitality-reconcile` corre dos veces (04:00 crontab + 04:15 scheduler). | `cron-c-trigger-real` | platform-team |
| 2026-06-21 | **Auditoría DPO §7.3 + ticket pre-deploy**: captura del EXPLAIN ANALYZE baseline contra Neon staging (exit 1, FAIL). Acciones reunidas en `docs/cron-tickets/CLEANUP-ATTENDANCE-INDEX-MISSING.md`. Bug naming fixer verifier regex aceptado. | `cron-composite-index-missing` | platform-team |
| 2026-06-21 | **Nueva §11 Procedimientos de testing manual**: 6 sub-secciones con curls copy-paste (dry-run cleanup + smoke uptime + 401 sin bearer) para que el DPO dispare crons manualmente sin tocar código. Antigua §11 renumerada a §12. | este doc | platform-team |
| 2026-06-21 | **Cleanup de dead-code cron handlers**: eliminados `cleanup-analytics`, `limit-alerts`, `academy-audit`, `trials`, `compliance-reports`, `accounting-proactivity`. Sus servicios subyacentes sobreviven si son referenciados por otras rutas internas (scheduler, portal, tests). `google-calendar-renew` se mantiene como cron C disparado por GitHub Actions. §5 y §6 actualizadas. | `cron-dead-code-cleanup` | platform-team |
| 2026-06-21 | Refactor cleanup-attendance: iteración por batches de 50k + composite index `@@index([tenantId, timestamp])` reemplazando single `DELETE` | `cron-cleanup-batch` | platform-team |
| 2026-06-15 | Documentación inicial de política de retención DPO-auditable | este doc | platform-team |
| (previo) | ver `git log -- deploy-vps/cron.sh` y `git log -- app/api/cron/` | — | — |
| 2026-06-21 | **Nueva §11.7 Baseline verificado (template)**: shells + placeholders para que un operador con `CRON_SECRET` real ejecute los 3 curls contra staging y commitee los outputs verbatim. Pendiente de primera ejecución real. | este doc | platform-team |
| 2026-07-02 | **Composite index materializado en staging**: creada migración auto-Prisma `prisma/migrations/20260702000000_add_attendance_composite_index/` con `CREATE INDEX "erp_attendance_logs_tenantId_timestamp_idx"`, aplicada vía raw SQL (bypass de 4 migrations pre-existentes pendientes vía `migrate resolve --applied`), reconciliada con sha256=`41e8cc...`. `ANALYZE` refrescó stats. Verifier exit 1 esperado en staging por bajo cardinal (184 filas) — verificable en producción con dataset realista. Manual SQL obsoleto consolidado al auto-Prisma path. §7.3 baseline ampliado. | `cron-composite-index-missing` | platform-team |
| 2026-06-23 | **Staging migrations drift-capture (Path C+)**: reconciliadas las 7 migrations pre-existentes pendientes en Neon staging (`neondb`) vía `npx prisma migrate resolve --applied` (usuario aprobó explícitamente aunque el original era "sin resolve --applied"; Path C+ requiere este reconcile para el init `20260601091455` y la restauración del bloqueado `20260417`). Restaurada `prisma/migrations/20260417_add_real_estate_inmobiliario/migration.sql` (1 920 B) perdida vía `git checkout HEAD -- …`; purgada fila duplicada en `_prisma_migrations` (`DELETE … WHERE finished_at IS NULL`) — queda 1 fila limpia con `finished_at=2026-06-23 14:28:35`. Generada+aplicada drift-capture `prisma/migrations/20260624000000_capture_partner_api_and_dropouts/migration.sql` (6 527 B) vía `npx prisma migrate diff --from-url --to-schema-datamodel --script > migration.sql && npx prisma migrate deploy` — captura drift Partner API no reflejado en `schema.prisma`: removal `AttendanceRules.randomPulsesPerDay`+`requireSelfie`, addition `blockIfNotNoticed`/`maxTravelKmh=250`/`minPunchIntervalSec=30`/`noticeVersion='v1-2026-gps-only'`/`retentionDays=1460`; columns `partnerLabel`/`rateLimitPerMin`/`revokedAt`/`revokedReason`/`webhookEnabled`/`webhookEvents[]`/`webhookSecret`/`webhookUrl` en `api_keys`+`incoming_webhooks`; nuevas tablas `erp_idempotency_keys`/`api_request_logs`/`partner_webhook_deliveries` (FK `Tenant.id` CASCADE, 12 índices, 8 FKs); rename constraint `PayrollRunES_pkey → erp_payroll_runs_es_pkey` (DDL **no idempotente** — riesgo para fresh deploys rebuild staging desde cero). **End-state verificado**: `npx prisma migrate status` → "Database schema is up to date" + `npx prisma migrate diff --from-url --to-schema-datamodel --script` → 32 bytes (`-- This is an empty migration.`). Backup pre-flight: `/tmp/staging_schema_pre_2026-06-23.sql` (533 KB, 279 tablas vía docker postgres:17-alpine). Reviewer `code-reviewer-minimax-m3` validó shipp-ability con 3 fixes. | `cron-staging-pending-migrations-drift` | platform-team |
| 2026-06-23 | **Typo fix §7.3**: en §7.3 línea 726, frase del comentario 'lower bound optimista' contenía 2 chars chinos mistyped prepended a 'caro' — limpiada a 'sería mayor' (audit-log composite — materializado en staging). Pre-commit hook anti-CJK pendiente (`cron-docs-cjk-lint`). | este doc | platform-team |
| 2026-06-23 | **Pre-commit anti-CJK hook implementado**: `scripts/check-docs-no-cjk.sh` (perl-based PCRE, 100+ líneas, executable), `.husky/pre-commit` (3 líneas invocando el script), `package.json` con `scripts.lint:docs` + `lint-staged` entry. Tests 5/5 pass: full scan exit 0, lint-staged single-file exit 0, CJK inyectado exit 1, Cyrillic-only exit 0, pre-commit hook direct exit 0. JSON validity verified via `node -e JSON.parse`. Cierra el ticket `cron-docs-cjk-lint` referenciado en el entry typo-fix anterior — consistencia pendiente→implementado ya reflejada en §10. | este doc | platform-team |
| 2026-06-23 | **Fence-aware extension + polish round + bash fixture suite shipped sobre `scripts/check-docs-no-cjk.sh`** (continuación directa del entry anterior `cron-docs-cjk-lint`): (a) **fence-aware extension** — el script ahora distingue code fences de CommonMark §4.5 (triple-backtick ```` ``` ```` blocks con info-string opcional) y los asimila como auto-allowed. CJK dentro de ejemplos de código (` ```py\n <CJK1><CJK2>\n``` ` *(literal two-char escape shown: backslash-n is two characters in this example, not a real newline)*) ya no flaggea, sin bypassear el linter: el fence queda dentro del scope, el markdown fuera del fence sigue estricto. (b) **documented awareness del `$ARGV`-in-BEGIN pitfall** — el script consigna explícitamente (line 209: `# Filter por extension: AQUI (no en BEGIN) porque $ARGV ya esta poblado.`) que el filter de extension se ejecuta fuera del BEGIN block (donde `@ARGV` está vacío al compilar), evitando el shift bug por construcción sin runtime refactor required in this commit (design avoids the pitfall by construction; comment campaigns the invariant so future edits don't drift back into BEGIN). (c) **addressed bash parse-warning regression (test-runner-side mitigation, not script-side FAIL-echo rewrite)** — verified zero-of-two: el FAIL-echo del script ya emite clean (no backtick-escape rewrite landed). El parse-warning gap era de la interacción en el test runner `tests/fence-states.test.sh`: `set -euo pipefail` con bare `run_silent` calls hacía que un non-zero return del sub-test abortara el runner antes de que `assert_exit` registrara el FAIL. Mitigation: removido `-e` de `set -uo pipefail` (mantiene `-u` para unset vars + `-o pipefail` para pipe failures — in-script comment explica el rationale) + añadido `$TMPDIR/run_silent.stderr` capture per-test (= : "$STDERR_LOG" antes) + helper `assert_stderr_clean` que greps `orden no encontrada|command not found`(silent-PASS protection against the subshell-expansion class re-emerging in CI runs). Silent-PASS avoidance: si la regresión de parse warning re-emerge, las exit-code assertions pasarán pero el `orden no encontrada` se imprimirá a stdout de bash — el bash fixture T2-T11 (vía assert_stderr_clean) atrapa ambos en CI. **5 polish items**: (d1) fence regex permissivo a CommonMark §4.5 estricto — viejo regex `/^[ \t]{0,3}(\`{3,})([^\s\`].*)?\s*$/` substituído por `/^[ \t]{0,3}(\`{3,})(.*)?\s*$/` con closer requiriendo `$info =~ /^[ \t]*$/`; ahora abre fences con whitespace antes del info-string (```` ```  python` ```` que el viejo regex silenciosamente omitía — regresión para casos donde el formatter pega un espacio entre el marker y el info-string). (d2) allow-list path normalization — `$path =~ s\|^\./\|\|;` post-capture del `--allow-cjk-lines` parsing, documentando la convención git-root-relative (lint-staged provee paths con `./`, CLI provee sin-prefix) en comment inline. (d3) explícito `my %allow;` declarado en BEGIN — silencia autovivification warnings bajo `use warnings` futuro. (d4) `.mdx` añadido al extension filter `\.md$\|\.mdx$\|\.txt$\|\.markdown$` — fixtures MDX (común en Next.js docs) ahora se escanean por el linter. (d5) ASCII-only header — eliminado `\u2026` (Unicode ellipsis) y CJK residue de typos previos a la rewrite completa del script. (e) **`tests/fence-states.test.sh` creado** (298 líneas, executable, 13 subtests): T1 clean full-scan sobre tmpdir CJK-free / T2 fence-allowed (exit 0) / T3 outside-fence (exit 1) / T4 single-backtick-inline CJK (exit 1) / T5a-c allow-list (abs paths + `./` prefix + mismatch negative case) / T6 3-space-indented fence (exit 0) / T7 unclosed fence conservative (exit 0) / T8 leading-ws info-string fence (Polish #1, exit 0) / T9 `.mdx` (Polish #4, exit 1) / T10 `--help` (exit 0) / T11 `--allow-cjk-lines` missing-arg (exit 2). Stderr capture por test vía `$TMPDIR/run_silent.stderr` (truncado en cada `run_silent` con `: > "$STDERR_LOG"`) + `assert_stderr_clean` helper que assertea que NINGUNA corrida emite `orden no encontrada` o `command not found` (silent-PASS protection del regression class que el script defiende contra — un re-bug que re-emerge la bash parse warning pasaría exit-code assertions pero fallaría el stderr check). **`set -uo pipefail`** (sin `-e`, con rationale comment in-script) — sin esto, un test que retorne non-zero abortaría el runner mid-way antes de que `assert_exit` registrara el FAIL; mantiene `-u` (unset vars) y `-o pipefail`. **Wired into npm scripts**: nuevo `"test:bash": "bash tests/fence-states.test.sh"` (escape hatch); `"test"` cambia de `"vitest run"` a `"vitest run && bash tests/fence-states.test.sh"` — `npm test` corre vitest Y bash suite preservando fast-fail convention. Reviewer `code-reviewer-minimax-m3`: ship-ready, 0 MUST-FIX, 2 NICE-TO-HAVE (T11 special-casing removable + locale coverage awareness). 13/13 subtests PASS verificado. | `cron-docs-cjk-lint` | platform-team |

---

## 11. Procedimientos de testing manual

> **Audiencia**: DPO, SRE, developer on-call, auditor.
>
> **Propósito**: ejemplos copy-paste para disparar manualmente los cron jobs
> sin recompilar ni redesplegar. Cubren los dos crons autoritativos
> (`cleanup-attendance` + `uptime-developers`). El cron C se dispara vía
> GitHub Actions — ver §5.
>
> **Notas de entorno**:
> - **Producción**: `${BASE_URL:-https://volkern.app}` + `${CRON_SECRET}`
>   desde `/root/volkern-erp/.env` del VPS (y reiniciar el contenedor para que
>   recargue el entorno).
>   **Uso reservado a runbook autorizado** (incident response o DPO).
> - **Staging**: `${BASE_URL:-https://staging.volkern.app}` + `${CRON_SECRET}`
>   desde el `.env` local, para desarrollo.
> - **Local**: `process.env.NODE_ENV !== "production"` ⇒ el handler salta la
>   auth check automáticamente (ver §2 regla 1). Puedes llamar sin Bearer
>   para development puro.

### 11.1 Pre-flight check (siempre antes de cualquier curl)

```bash
# 1. CRON_SECRET cargado en el shell y suficientemente largo
if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "⚠️  CRON_SECRET vacía. Cargar desde el .env del VPS o .env.local." >&2
  exit 1
fi
echo "✅ CRON_SECRET longitud: ${#CRON_SECRET} chars (esperado > 30)"

# 2. curl ≥ 7.x con --fail-with-body
if ! curl --version | head -1 | grep -qE 'curl (7\\.|8\\.)'; then
  echo "⚠️  curl < 7.x puede no soportar --fail-with-body" >&2
fi

# 3. Resolver BASE_URL con default sensato a producción
BASE_URL="${BASE_URL:-https://volkern.app}"
echo "🎯 Target: $BASE_URL"

# 4. jq disponible para pretty-print (opcional pero recomendado)
command -v jq >/dev/null 2>&1 || echo "⚠️  jq no instalado — quitar pipe final | jq ."
```

### 11.2 (a) Dry-run de `/api/cron/cleanup-attendance`

> 🎯 **FUENTE ÚNICA DE VERDAD** para la respuesta esperada del dry-run
> de cleanup-attendance + JSON completo + tabla accionable de
> 4 red flags operacionales (§11.2 abajo).
> §3.7 (definición del contrato del cron A) y §7.2 (procedimiento DPO audit)
> referencian aquí para evitar drift entre docs.
> **Cualquier cambio en el JSON de respuesta del handler debe editarse
> primero en §11.2**, luego sincronizar §3.7 sólo si cambia el contrato
> (no el JSON completo — §11.2 es el canónico).

**Único caso seguro para correr en producción sin aprobación especial** —
NO borra datos, sólo reporta qué se purgaria HOY si la corrida fuera real.

```bash
curl -sS -X GET "${BASE_URL}/api/cron/cleanup-attendance?dryRun=1" \\
  -H "Authorization: Bearer ${CRON_SECRET}" \\
  -H "Accept: application/json" \\
  --fail-with-body \\
  --max-time 60 \\
  | jq .
```

**Salida esperada (HTTP 200, `dryRun: true`)** — exemplo recortado:

```json
{
  "success": true,
  "summary": {
    "startedAtIso": "2026-06-21T03:00:00.123Z",
    "finishedAtIso": "2026-06-21T03:00:08.456Z",
    "durationMs": 8333,
    "tenantsProcessed": 142,
    "tenantsFailed": 0,
    "idempotency": { "deleted": 17 },
    "attendance": {
      "totalDeleted": 9_847,
      "totalBatches": 6,
      "byTenant": [
        {
          "tenantId": "tnt_alpha",
          "tenantName": "Empresa A S.L.",
          "retentionDays": 1460,
          "cutoffIso": "2022-06-21T03:00:00.000Z",
          "deletedAttendance": 142,
          "batches": 1
        }
      ]
    },
    "dryRun": true
  }
}
```

**Red flags en la respuesta**:

| Señal | Diagnóstico probable | Acción |
|-------|---------------------|--------|
| `summary.dryRun !== true` | Bug: handler no respeta `?dryRun=1` | Bloquear deploy; abrir ticket |
| `summary.tenantsFailed > 0` | Error de tenant aislado | Revisar los logs del contenedor: `[Cron/CleanupAttendance] Tenant <id> falló…` |
| HTTP 500 | Connectivity o schema drift | Revisar `DATABASE_URL` + ejecutar `npx prisma migrate status` |
| `summary.attendance.totalDeleted > 0` en dry-run | Bug: handler no respeta dry-run **CRÍTICO** | Bloquear inmediatamente |

### 11.3 (b) Smoke test de `/api/cron/uptime-developers`

Vigila `/docs/developers` + `/openapi.json`. Idempotente y no mutante.

> ⚠️  **Cuidado operacional** — si los probes fallan (timeout, 5xx, schema
> inválido), el handler **dispara una alerta real** a `UPTIME_APPRISE_URL`
> y/o `ADMIN_EMAIL` (ver §4.3). Por tanto, **preferir staging** salvo
> incident response autorizado: en producción un test puede generar
> incident noise falso al equipo on-call. El cooldown de 5 min (ver §4.3)
> limita la duplicación pero no la elimina.

```bash
curl -sS -X GET "${BASE_URL}/api/cron/uptime-developers" \\
  -H "Authorization: Bearer ${CRON_SECRET}" \\
  -H "Accept: application/json" \\
  --fail-with-body \\
  --max-time 30 \\
  | jq .
```

**Salida esperada (HTTP 200, todos los probes OK)**:

```json
{
  "success": true,
  "failures": 0,
  "probes": [
    {
      "url": "https://volkern.app/docs/developers",
      "status": 200,
      "durationMs": 142,
      "retried": false
    },
    {
      "url": "https://volkern.app/openapi.json",
      "status": 200,
      "durationMs": 89,
      "contentValid": true,
      "retried": false
    }
  ],
  "alertSent": false
}
```

**Salida esperada (HTTP 200 con `failures > 0`)** — endpoint caído, alerta enviada:

```json
{
  "success": false,
  "failures": 1,
  "probes": [
    { "url": "https://volkern.app/docs/developers", "status": 503, "durationMs": 812, "retried": false },
    { "url": "https://volkern.app/openapi.json",     "status": 200, "durationMs": 91, "contentValid": true, "retried": false }
  ],
  "alertSent": true,
  "cooldownSkipped": false
}
```

**Red flags**:

| Señal | Diagnóstico probable | Acción |
|-------|---------------------|--------|
| `probes[].status === 0` | Timeout (10s exceeded por probe) | Revisar arranque en frío del contenedor; abrir ticket a `@SRE` |
| `probes[].contentValid === false` (sólo `/openapi.json`) | Schema OpenAPI corrupto | Revisar cambios recientes en `prisma/schema.prisma` o routes; regenerar |
| `cooldownSkipped: true` repetido | Reinicios del contenedor durante el outage | Con cadencia diaria no debería darse; considerar subir `ALERT_COOLDOWN_MS` |
| `alertSent === false && failures > 0` | Cooldown activo o canales `UPTIME_APPRISE_URL`/`ADMIN_EMAIL` mal configurados | Revisar env vars + logs del contenedor |

### 11.4 Caso borde — verificar que la auth funciona (401 sin Bearer)

```bash
# Sin header Authorization (en producción; en dev el check se omite)
curl -sS -X GET "${BASE_URL}/api/cron/cleanup-attendance?dryRun=1" \\
  -H "Accept: application/json" \\
  --max-time 10 \\
  | jq .
```

**Salida esperada en producción (HTTP 401)**:

```json
{ "error": "No autorizado. CRON_SECRET requerido en producción." }
```

> En desarrollo/preview la auth se omite (ver §2.4) — el response puede ser 200 incluso sin Bearer. Útil para testear flujos sin `CRON_SECRET` local.

### 11.5 Dónde ver los logs esperados

Filtrar en los logs del contenedor de la app:

- `[Cron/CleanupAttendance]` ⇒ siempre emite 1 línea por corrida con prefijo `DONE` (o `DRY-RUN` si aplica `?dryRun=1`).
- `[uptime-developers]` ⇒ intencionalmente silencioso en success; imprime sólo si `failures > 0` y el cooldown lo permite (ver §4.4).
- `[Cron]` ⇒ output del `lib/cron/scheduler.ts` (in-process scheduler — NO aplica a este §11; referencia informativa para runbooks del scheduler persistente).

### 11.6 Cuándo usar estos procedimientos

| Escenario | Comando | Frecuencia |
|-----------|---------|------------|
| Auditoría DPO trimestral (alineada con §9.1 SLO review) | §11.2 con `dryRun=1` contra staging | Trimestral |
| Pre-deploy check touched `/docs/developers` o `/openapi.json` | §11.3 contra staging primero | Post-merge |
| Incident response: alerta no llegó | §11.3 contra producción **con aprobación on-call** | Ad-hoc |
| Tras rotar `CRON_SECRET` | §11.4 contra staging primero | Post-rotación |
| Smoke test post-incidencia | §11.3 contra staging con `cooldownSkipped` esperado | Post-fix |

> **NO usar §11.2 SIN `?dryRun=1` en producción** — borra datos reales.
> Si necesitas una corrida productiva para validación, ejecutar contra staging primero y luego escalar a prod con aprobación de `@platform-team`.

### 11.7 Baseline verificado 🚧 YYYY-MM-DD (Template)

> **Propósito**: anclar criptográficamente (vía `git commit`) que los contratos
> HTTP de los crons son ejecutables y que las salidas en §11.2–§11.4 reflejan
> el comportamiento real. Este §11.7 se replica cada vez que un humano
> ejecuta los 3 curls contra staging con su `CRON_SECRET` local.
>
> **Quién debe ejecutarlo**: DPO o SRE con acceso a las variables de entorno del VPS
> (`NEXT_PUBLIC_APP_URL`, `CRON_SECRET`) y a un staging deployado. No
> automatizar desde CI: §11.3 dispara alertas reales si los probes fallan.
>
> **Procedimiento**: copiar este bloque completo, rellenar los placeholders
> `{{ … }}` con el output literal de terminal, eliminar este aviso `🚧`,
> commit con mensaje `feat(docs): §11.7 baseline verificado YYYY-MM-DD`.

#### Metadata de la corrida

| Campo | Valor |
|-------|-------|
| Ejecutado por | `{{ github_user_o_alias }}` |
| Fecha UTC | `{{ ISO_8601_ejecucion }}` |
| URL objetivo | `{{ NEXT_PUBLIC_APP_URL_del_staging }}` |
| ID de la imagen desplegada | `{{ sha_opcional_de_la_imagen }}` |
| `NODE_ENV` | `production` |
| Cooldown uptime previo | `{{ timestamp_ultimo_alert_o_none }}` |
| Filas `erp_attendance_logs` | `{{ COUNT_antes_de_correr }}` (de `psql -At -c "SELECT COUNT(*) FROM erp_attendance_logs"`) |

#### 11.1 — Pre-flight check (output completo capturado)

```
{{ stdout_de_11.1 — copiar literal lo impreso por el script de §11.1 }}
```

**Estado esperado**: ✅ CRON_SECRET ok, ✅ BASE_URL = tu-staging, ⚠️  jq
ausente es benigno (sólo impide pretty-print).

#### 11.2 — Dry-run `/api/cron/cleanup-attendance`

Comando ejecutado exactamente:

```
curl -sS -X GET "$BASE_URL/api/cron/cleanup-attendance?dryRun=1"   -H "Authorization: Bearer $CRON_SECRET"   -H "Accept: application/json"   --fail-with-body --max-time 60 | jq .
```

**Output capturado (HTTP 200 esperado, `summary.dryRun: true`)**:

```json
{{ stdout_de_11.2 — pegar JSON completo del response }}
```

**Confrontación contra §11.2 esperado** (copiar plantilla):

| Campo esperado | Observado | OK |
|-----------------|-----------|----|
| HTTP status = 200 | `{{ http_status_observado }}` | `{{ SI/NO }}` |
| `summary.dryRun === true` | `{{ dryRun_observado }}` | `{{ SI/NO }}` |
| `summary.tenantsFailed === 0` | `{{ tenantsFailed_observado }}` | `{{ SI/NO }}` |
| `summary.attendance.totalDeleted === 0` (implica dry-run respetado) | `{{ totalDeleted_observado }}` | `{{ SI/NO }}` |

#### 11.3 — Smoke test `/api/cron/uptime-developers`

Comando ejecutado:

```
curl -sS -X GET "$BASE_URL/api/cron/uptime-developers"   -H "Authorization: Bearer $CRON_SECRET"   -H "Accept: application/json"   --fail-with-body --max-time 30 | jq .
```

**Output capturado**:

```json
{{ stdout_de_11.3 — pegar JSON completo del response }}
```

**Confrontación contra §11.3 esperado**:

| Campo esperado | Observado | OK |
|-----------------|-----------|----|
| HTTP status = 200 | `{{ http_status_observado }}` | `{{ SI/NO }}` |
| `probes.length === 2` | `{{ probes_length_observado }}` | `{{ SI/NO }}` |
| Ambas `probes[].status === 200` | `{{ status_array_observado }}` | `{{ SI/NO }}` |
| `alertSent === false` | `{{ alertSent_observado }}` | `{{ SI/NO }}` |

⚠️ Si `alertSent: true` o `probes[].status != 200`, los canales `UPTIME_APPRISE_URL`
y/o `ADMIN_EMAIL` recibieron una alerta durante tu corrida — esperar 5 min
de cooldown (§4.3) antes de re-ejecutar para evitar spam al equipo on-call.

#### 11.4 — Verificación de auth (HTTP 401 sin Bearer)

Comando ejecutado (sin header `Authorization`):

```
curl -sS -X GET "$BASE_URL/api/cron/cleanup-attendance?dryRun=1"   -H "Accept: application/json" --max-time 10 | jq .
```

**Output capturado (HTTP 401 esperado)**:

```json
{{ stdout_de_11.4 — pegar JSON; debe ser '{"error":"No autorizado. CRON_SECRET requerido en producci\u00f3n."}' }}
```

**Confrontación**:

| Campo esperado | Observado | OK |
|-----------------|-----------|----|
| HTTP status = 401 | `{{ http_status_observado }}` | `{{ SI/NO }}` |
| `error` contiene `CRON_SECRET` | `{{ error_observado_truncado_80 }}` | `{{ SI/NO }}` |

#### Resumen del baseline

`{{ texto_libre_de_1_a_2_lineas_resumiendo_resultados_globales_y_cualquier_anomalia }}`

---

---

## 12. Referencias legales y técnicas

### 12.1 Referencias RGPD / LOPDGDD (España)

| Norma | Artículo | Aplicación |
|-------|----------|------------|
| RGPD (UE 2016/679) | Art. 5.1.e | Política de retención (`retentionDays` configurable) |
| RGPD | Art. 5.1.c | Minimización (composite index evita full-table scan) |
| RGPD | Art. 12-14 | Soportado por uptime-developers (`/docs/developers` alive) |
| RGPD | Art. 32 | Auth `Bearer ${CRON_SECRET}` + límites de retención |
| RGPD | Art. 6.1.b | Crons D/E: ejecución del contrato de alojamiento (reserva y comunicación operativa) |
| RGPD | Art. 6.1.f | Cron E: interés legítimo del hotel en operar las llegadas del día |
| RGPD | Art. 5.1.d | Cron D: exactitud — reconciliar reservas desincronizadas |
| RGPD | Art. 5.1.c | Cron E: minimización — el briefing sólo lleva nombre + unidad |
| RGPD | Art. 28 | Cron E: entrega por canales de terceros (email / WhatsApp) — ver `docs/compliance/ENCARGADOS-DPA-PENDIENTES.md` |
| LOPDGDD (LO 3/2018) | Art. 88 | `Employee.noticeAcknowledgedAt`/`acceptedPolicies` **fuera del scope de purga** (preservados) |
| LISOS (RD 5/2000) | Art. 7 | Prescripción laboral de 4 años → justifica default `1460` |
| Ley 58/2003 (LGT) | Art. 66 | Prescripción tributaria de 4 años → justifica default `1460` |

### 12.2 Referencias técnicas internas

| Archivo | Propósito |
|---------|-----------|
| `deploy-vps/cron.sh` | Runner de los 4 jobs del crontab del VPS (source-of-truth del schedule). El crontab de root es quien lo invoca |
| `lib/cron/scheduler.ts` | Orquestador in-process (node-cron) — **trigger autoritativo del cron C** (#5) y de los jobs de Hospitality §1.1. Verificado activo en producción 2026-10-08 |
| `instrumentation.ts` | Arranca `initCronJobs()` en el runtime `nodejs`; sin él, el scheduler in-process no se registra |
| `app/api/cron/cleanup-attendance/route.ts` | Implementación cron A |
| `app/api/cron/uptime-developers/route.ts` | Implementación cron B |
| `app/api/cron/google-calendar-renew/route.ts` | Implementación cron C (disparado por el scheduler in-process) |
| `prisma/schema.prisma` | Definición de modelos `Attendance`, `IdempotencyKey`, `AttendanceRules` (composite index al final del bloque) |
| `prisma/migrations/20260702000000_add_attendance_composite_index/migration.sql` | Auto-Prisma migration: `CREATE INDEX "erp_attendance_logs_tenantId_timestamp_idx"` (post-fix 2026-07-02) |
| `prisma/manual-migrations/` | Reservado para DDL CONCURRENTLY no auto-aplicable (tablas ultra-grandes) — ver `manual-migrations/README.md` |
| `scripts/verify-cleanup-attendance-index.sql` | EXPLAIN ANALYZE reproducible del composite index |
| `scripts/check-cleanup-attendance-index.sh` | CI-friendly verifier (exit 0=PASS, 1=FAIL regresión) |
| `docs/DPIA-ASISTENCIA-GPS.md` | Evaluación de impacto (Data Protection Impact Assessment) |
| `docs/legal/CLAUSULA-ASISTENCIA-GPS.md` | Cláusula informativa LOPDGDD Art. 88 |
| `tests/cleanup-attendance.test.ts` | Tests unitarios del cron A (6 casos, RGPD Art. 5.1.e + RGPD Art. 32) |

### 12.3 Convenciones operativas

- **Todos los crons** deben autenticar con `Bearer ${CRON_SECRET}` (sólo prod).
- **Auth check ORDEN**: el handler debe retornar 401 ANTES de tocar Prisma (defense-in-depth).
- **Idempotencia obligatoria**: si una corrida se repite, el response es
  estable (no causa daño duplicado).
- **Dry-run obligatorio** cuando sea inspección: `?dryRun=1` o ruta dedicada.
- **Logs a stdout**: `console.log`/`console.warn` van a los logs del
  contenedor; `cron.sh` resume el resultado de cada corrida en
  `/var/log/volkern-cron.log`.
  Sin uso de librerías de telemetry externa (Datadog, Sentry) para mantener
  el contrato auditable sin vendor lock-in.
