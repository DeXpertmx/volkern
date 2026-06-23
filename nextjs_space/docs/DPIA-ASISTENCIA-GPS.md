# DPIA — Control Horario basado en Geolocalización (GPS)

> **Plantilla** de Evaluación de Impacto en la Protección de Datos (DPIA, RGPD Art. 35) para el sistema de **Control de Asistencia** de Volkern, en su variante GPS-only (sin captura biométrica facial). Esta plantilla está alineada con LOPDGDD (España, Ley Orgánica 3/2018), EDPB Guidelines 8/2020 sobre geolocalización, y la guía de la AEAT sobre sistemas de registro horario (RD-ley 8/2010).

---

## 0. Resumen ejecutivo

| Item | Valor |
|---|---|
| **Tratamiento** | Registro horario de empleados vía marcaje GPS en navegador/app |
| **Responsable del tratamiento** | Volkern (Dimension eXpert LLC) por delegación del empleador (cliente/tenant) |
| **Encargado del tratamiento** | Volkern — gestiona la plataforma multi-tenant |
| **Datos personales tratados** | Geolocalización puntual (lat, lng), timestamp, employeeId, type (IN/OUT) |
| **Datos NO tratados (tras Julio 2026)** | Selfie/foto, vector facial, liveness detection, datos biométricos |
| **Base jurídica** | RGPD Art. 6.1.c (obligación legal RD-Ley 8/2010) + Art. 6.1.f (interés legítimo del empleador) |
| **Categorías especiales (Art. 9)** | **Ninguna** — la geolocalización puntual no es categoría especial |
| **Decisión automatizada con efectos jurídicos** | **No** (RGPD Art. 22). Anomalías se marcan como flag, validadas por manager humano |
| **Retención** | 4 años por defecto (prescripción laboral LISOS + Hacienda AEAT) |
| **Cesiones internacionales** | Limitadas al EEE + cláusulas contractuales tipo (SCCs) si aplica |
| **Sub-encargados** | Vercel Inc. (hosting Postgres EU, SCCs firmadas); Resend Inc. (email API, DPA firmado); Apprise (`dimension.expert/notify`, servidor propio del encargado). |

---

## 1. Descripción del tratamiento (RGPD Art. 35.7.a)

### 1.1 Finalidad
Cumplir con la obligación legal del empleador (RD-ley 8/2010 art. 10; Estatuto de los Trabajadores arts. 20.3 y 64) de registrar la jornada laboral de sus empleados. La geolocalización en el momento del marcaje verifica que el empleado está físicamente en el centro de trabajo autorizado (geofencing).

### 1.2 Titulares de los datos
Empleados del cliente (tenant). Cada tenant configura su propio centro de trabajo autorizado (lat/lng + radio) y los empleados autorizados a marcar.

### 1.3 Datos personales capturados
| Dato | Finalidad | Categoría RGPD | Retención |
|---|---|---|---|
| `employeeId` interno | Identificación del empleado | Identificador seudonimizado | Mientras esté activo el expediente |
| `timestamp` (server-stamped) | Cuándo se marcó | Metadato técnico | 4 años |
| `type` ('IN' / 'OUT') | Entrada/salida | No personal | 4 años |
| `locationLat`, `locationLng` | Geolocalización puntual | Dato personal (geolocalización) | 4 años |
| `integrityHash` HMAC-SHA256 | Anti-tampering | No personal (huella criptográfica) | 4 años |
| `isAnomaly`, `anomalyType` | Flag de auditoría | Metadato | 4 años |

### 1.4 Datos NO tratados (excluidos explícitamente)
- ❌ Selfie, foto de la cara, qualquer imagen biométrica
- ❌ Vector facial, embeddings de reconocimiento facial
- ❌ Datos continuos de geolocalización (NO tracking, sólo en el momento del marcaje)
- ❌ Datos de salud, opiniones políticas, religión, etc.

### 1.5 Flujo del tratamiento

```
Empleado abre PunchClockModal (navegador o app)
   ↓
navigator.geolocation.getCurrentPosition() (API estándar, NO captura foto)
   ↓
HTTP POST /api/erp/attendance/punch con { employeeId, type, locationLat, locationLng, Idempotency-Key }
   ↓
Backend valida:
  - GPS bounds (lat ∈ [-90,90], lng ∈ [-180,180])
  - Tenant-attendanceRules (requireGPS, retentionDays, antiSpoofingLevel)
  - Rate-limit: minPunchIntervalSec entre dos punches del mismo empleado
  - Anti-spoofing Impossible Travel: si dos punches separados >250 km/h entre sí
    desde el mismo empleado, se marca isAnomaly=true, anomalyType='GPS_IMPLAUSIBLE_XKMH'
  - Geofencing: Haversine contra baseGPSLat/Lng o homeOfficeLat/Lng + radio
   ↓
HMAC-SHA256(employeeId|serverTimestamp|type|tenantId) → integrityHash
   ↓
Persistencia Attendance.isAnomaly=true/false según geofencing / impossible travel
   ↓
Auditoría diaria: anomaly_pattern_detection() genera reporte para manager humano
```

---

## 2. Necesidad y proporcionalidad (RGPD Art. 35.7.b)

### 2.1 Base jurídica
**Doble base jurídica complementaria:**

1. **RGPD Art. 6.1.c — Cumplimiento de obligación legal**
   - **RD-ley 8/2010 art. 10.5**: obligación de registrar la jornada laboral, incluyendo hora de inicio y fin, sin obligar al registro de geolocalización.
   - **Estatuto de los Trabajadores art. 20.3**: el empresario puede adoptar medidas de vigilancia y control, siempre que sean proporcionadas.
   - **Estatuto de los Trabajadores art. 64.d**: el comité de empresa debe ser informado y consultado sobre implantación de sistemas de control.

2. **RGPD Art. 6.1.f — Interés legítimo**
   - El empleador tiene un interés legítimo en verificar que el empleado está físicamente en el centro de trabajo autorizado (geocerca), especialmente en sectores con mano de obra móvil (construcción, logística, ventas en ruta, técnicos de campo).
   - Este interés legítimo NO prevalece sobre los derechos del empleado cuando la implementación es invasiva (biometría facial) → por eso Volkern retiró la selfie.

### 2.2 Análisis de proporcionalidad
**Por qué GPS-only es proporcionado:**
- La geolocalización es **puntual** (única captura por marcaje), NO continua (no tracking 24/7).
- NO captura imágenes (no es dato biométrico → no cae en Art. 9 RGPD).
- Menor invasivo que la alternativa previamente usada (selfie + face match), que sí requería Art. 9.
- Ofrece una alternativa real al empleado: marcar en oficina (con geocerca), o solicitar autorización extraordinaria al manager en caso de incidencia.
- LOPD-GDD art. 88.1 exige "respeto al derecho a la intimidad y dignidad" — un sistema basado en coordenadas + radio autorizado cumple mejor este requisito.

### 2.3 Alternativas evaluadas y rechazadas
| Alternativa | Por qué descartada |
|---|---|
| Selfie + face match | Biométrico (RGPD Art. 9) sin base jurídica suficiente en laboral |
| Selfie + revisión humana | Biométrico + decisión humana proporcional, pero aún más invasivo |
| Marca manual sin GPS | NO permite verificar la presencia física |
| Geolocalización continua (tracking) | Invasivo y probablemente desproporcionado (EDPB Guidelines 8/2020) |
| Tarjeta RFID/fingerprint | Biométrico, mismo problema que selfie |
| **GPS puntual en marcaje** | **Escogida**: mínima invasividad, suficiente para verificar presencia |

---

## 3. Evaluación de riesgos (RGPD Art. 35.7.c)

| Riesgo | Probabilidad | Severidad | Mitigación implementada |
|---|---|---|---|
| Empleado deduce enfermedad por ausencia diaria | Baja | Media | Geofence sólo se viola al ausentarse; no hay patrón clínico |
| Localización revela domicilio del empleado | Baja | Alta | Se desaconseja `homeOffice` con lat/lng del domicilio real; usar la dirección profesional, y si es necesario telework, usar `homeOfficeLat/Lng` con `teleworkRadius` razonable. Documentar en onboarding que se recomienda no usar domicilio |
| Spoofing GPS (empleado simula estar en oficina) | Media | Media | Anti-spoofing **Impossible Travel** detecta velocidades > 250 km/h entre dos punches consecutivos |
| Doble-marcaje accidental o malicioso | Media | Baja | Rate-limit `minPunchIntervalSec` (default 30s) entre punches del mismo empleado; HTTP 429 |
| Falsificación de timestamp cliente | Media | Media | Server-stamped `timestamp` (NO usamos `clientTimestamp` salvo auditoría) |
| Hash collision en HMAC | Muy baja | Baja | HMAC-SHA256 con `ATTENDANCE_INTEGRITY_SECRET` (env-var managed en Vercel) |
| Pérdida de datos (deletes accidentales) | Baja | Alta | Prisma PGC soft-delete deshabilitado; backups diarios Vercel; retentionDays configurable |
| Acceso indebido por manager de otro tenant | Baja | Alta | RLS (Row-Level Security) vía `lib/rls-manager.ts` en cada query |
| Empleado solicita borrado (RGPD Art. 17) | Media | Alta | Política: marcajes de antigüedad > `retentionDays` se purgan; marcajes recientes no se borran (obligación legal Art. 6.1.c), pero el empleado puede ejercer derecho de ACCESO (Art. 15) y PORTABILIDAD (Art. 20) |
| Decisión automatizada sobre sanción | Baja | Alta | **No se toman decisiones automatizadas con efectos jurídicos** (RGPD Art. 22). Anomalías se marcan como flag y requieren validación humana por manager |
| Transferencia internacional a país tercero sin garantías | Baja | Media | Volkern processa datos en región `fra1` (Frankfurt, EEE) de Vercel + Postgres europeo. Para futuro expansión, usar SCCs aprobados por la CE |

---

## 4. Medidas previstas para mitigar los riesgos (RGPD Art. 35.7.d)

### 4.1 Medidas técnicas
- **Cifrado en tránsito**: TLS 1.3 (Vercel edge). HTTPS obligatorio.
- **Cifrado en reposo**: PostgreSQL cifrado en disco. Datos sensibles (sueldo, NIF, contrato) además encriptados en Vault con `vaultSeed` específico del tenant (AES-256 simétrico).
- **Hash integrity**: HMAC-SHA256 por marcaje (cadena estilo Veri*Factu).
- **Rate-limit**: HTTP 429 si paces < 30 segundos entre dos punches (configurable via `attendanceRules.minPunchIntervalSec`).
- **Idempotency-Key**: header opcional tipo Stripe; previene doble-marcaje por reintento de red.
- **Impossible-Travel**: detección de velocidades GPS imposibles entre dos punches del mismo empleado.
- **Row-Level Security (RLS)**: cada query a `prisma.attendance` está filtrada por `tenantId` (aislamiento multi-tenant).
- **Audit log de accesos**: cada consulta al modelo `Attendance` se loguea en `AuditLog` (quien consultó, a qué marcajes, cuándo, con qué rol).
- **Backup automático diario** + DR plan Vercel (`vercel rollback` para deploys, Punto-en-Tiempo recovery Postgres).

### 4.2 Medidas organizativas
- **Información al empleado (LOPDGDD Art. 88) implementado técnicamente**: cada empleado tiene campos `noticeAcknowledgedAt` (timestamp), `noticeVersionAccepted` (string) y `acceptedPolicies` (JSON list). Al activar el módulo, el endpoint POST `/api/erp/attendance/punch` exige que el empleado haya firmado al menos la cláusula GPS (LOPDGDD Art. 88) cuando `tenant.attendanceRules.blockIfNotNoticed=true`. Si no, devuelve 412 Precondition Failed con explicación textual.
- **Información a la representación legal del personal (ET art. 64)**: el empleador debe informar y consultar al comité de empresa antes de activar GPS-only.
- **Formación**: administradores de tenant reciben training sobre cómo configurar geocercas, cómo exportar datos del empleado (RGPD Art. 15), y cuándo NO activar el módulo.
- **Política de retención documentada**: `retentionDays` (default 1460 = 4 años) por tenant. Cron de limpieza pendiente en roadmap (`app/api/cron/cleanup-attendance`).
- **Reviews trimestrales**: administrador Volkern audita el uso del módulo, número de anomalías, tasa de empleados que no aceptaron `noticeAcknowledgedAt`.

---

## 5. Derechos del afectado (LOPDGDD + RGPD Capítulo III)

Volkern implementa los siguientes derechos (a través del dashboard del empleado `/dashboard/rrhh/mi-asistencia`):

| Derecho | Implementación |
|---|---|
| **Acceso** (Art. 15) | GET `/api/erp/attendance/export?employeeId=...&format=csv` → CSV con todos sus marcajes |
| **Rectificación** (Art. 16) | Si un marcaje es incorrecto por incidencia técnica comprovable, manager puede rectificar con audit hash |
| **Supresión** (Art. 17) | Marcajes de antigüedad > `retentionDays` se purgan automáticamente (Art. 5.1.e). Marcajes recientes: NO se borran (Art. 6.1.c obligación legal) |
| **Limitación** (Art. 18) | El empleado puede solicitar que sólo vean sus marcajes el manager directo (no super-admin), implementado via scope en `lib/api-keys.ts` |
| **Portabilidad** (Art. 20) | CSV y JSON exportan en formato estándar |
| **Oposición** (Art. 21) | El empleado puede solicitar marcar desde una app de tercero (e.g. su propio Fitbit) siempre que provea geolocalización verificable |
| **No decisión automatizada** (Art. 22) | Anomalías NUNCA producen descuento de nómina automático; requieren confirmación humana |

---

## 6. Plan de cumplimiento

### 6.1 Pre-producción (CRÍTICO — bloquear lanzamiento si falta)
- [ ] **DPIA firmada** por el DPO del cliente antes de activar el módulo
- [ ] **Cláusula contractual** firmada por cada empleado afectado (LOPDGDD Art. 88)
- [ ] **Información al comité de empresa** (ET art. 64)
- [ ] **Política de retención documentada** (RGPD Art. 13.2.a)
- [ ] **Endpoint de export CSV** funcional (`api/erp/attendance/export`)

### 6.2 Operación continua
- [ ] **Audit trimestral** del número de marcajes, anomalías, empleados que no firmaron cláusula
- [ ] **Review anual** de la DPIA (volver a evaluar si cambia el contexto)
- [ ] **Notificación de incidentes** en 72h a la AEPD si breach (RGPD Art. 33)

---

## 7. Contacto

- **Delegado de Protección de Datos (DPO)** Volkern: `dpo@volkern.app`
- **AEPD** (Autoridad de control en España): `https://www.aepd.es`
- **EDPB** (Autoridad europea): `https://www.edpb.europa.eu`

---

## 8. Historial de revisiones

| Fecha | Versión | Cambios |
|---|---|---|
| 2026-07 | v1-2026-gps-only | Versión inicial tras retirada de captura biométrica. Selfie/foto/vector facial retirados. Geolocalización puntual preservada con hardening anti-spoofing (Impossible Travel, rate limit, idempotency-key). |

---

**Esta plantilla se revisa al menos anualmente y siempre que:**
- Cambie la legislación aplicable (LOPDGDD, RGPD, EDPB Guidelines).
- Cambien los fines del tratamiento.
- Se introduzcan nuevas fuentes de datos (e.g. añadir sensor biométrico nuevo).
- Cambie el contexto del tratamiento (nuevo país, nuevo sub-encargado, etc.).
