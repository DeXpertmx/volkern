# Cláusula informativa — Sistema de Control Horario (GPS-only)

> **Cláusula laboral tipo** para el cumplimiento del deber de información previa regulado en el **artículo 88 de la Ley Orgánica 3/2018 (LOPDGDD)** sobre tratamiento de datos personales en las relaciones laborales.
>
> Esta cláusula es vinculante para todos los empleados del tenant que tengan activado el módulo de Control Horario. Cubre exclusivamente el tratamiento de **geolocalización puntual (GPS) en el momento del fichaje**. **No realiza captura biométrica facial** (selfie, reconocimiento facial, ni reto de prueba de vida); cualquier referencia a ese tipo de captura en cláusulas previas está derogada.

---

## 1. Finalidad del tratamiento

El sistema de Control Horario de Volkern trata los datos personales descritos en este documento con **una única finalidad**: el **registro de la jornada laboral** del empleado, conforme a la obligación legal establecida en el **artículo 12 del Real Decreto-ley 8/2010** y normativa concordante de la Inspección de Trabajo.

El sistema NO utiliza los datos para:

- Vigilancia continua de la ubicación del empleado fuera del momento del fichaje.
- Medición del rendimiento individual, geofencing del desplazamiento o análisis de patrones de movilidad.
- Publicidad, perfilado automatizado, segmentación comercial, ni ninguna decisión con efectos jurídicos sobre el empleado (RGPD Art. 22).
- Cesión a terceros con fines distintos al cumplimiento de obligaciones legales del empleador.

## 2. Base jurídica

El tratamiento descansa sobre **dos bases jurídicas acumulativas**:

| Base jurídica | Norma | Alcance |
|---|---|---|
| **RGPD Art. 6.1.c** — Cumplimiento de una obligación legal | Real Decreto-ley 8/2010, Art. 12 | El empleador está obligado por ley a registrar la jornada del empleado. |
| **RGPD Art. 6.1.f** — Interés legítimo del empleador | Estatuto de los Trabajadores, Arts. 20.3 y 64 | Derecho del empleador a verificar el cumplimiento horario y a proteger su patrimonio empresarial. |

**Análisis de proporcionalidad (RGPD Art. 5.1.c y LOPDGDD Art. 88):**

Se ha evaluado explícitamente la proporcionalidad entre la medida adoptada (geolocalización puntual) y la finalidad (registro horario). En particular, **se descarta el uso de captura biométrica facial (selfie) o reconocimiento de huella** porque:

- Introduce datos de categoría especial (RGPD Art. 9: datos biométricos).
- Es intrusivo para la dignidad del empleado (Constitución Española Art. 18.1).
- Existen alternativas menos invasivas (GPS + geocerca) plenamente funcionales para el registro horario.

La geolocalización **sólo se activa en el momento exacto del fichaje** (entrada/salida/pausa). No se ejecuta ningún tracking en segundo plano.

## 3. Datos personales tratados

| Dato | Finalidad específica | Categoría RGPD | Origen |
|---|---|---|---|
| **Latitud, longitud** del fichaje | Acreditar ubicación al marcar | Geolocalización (NO es dato biométrico) | Proporcionado por el navegador/dispositivo del empleado vía API estándar del navegador (`navigator.geolocation` y `WiFi/Bluetooth scanning`). |
| **Marca temporal** (timestamp UTC) | Acreditar hora del marcaje | Metadato técnico | Generada por el cliente y verificada por servidor. |
| **Dirección IP** cifrada (hash) | Anti-spoofing y auditoría | Metadato técnico | Generada por infraestructura. |
| **Estado de firma** (`noticeAcknowledgedAt`, `noticeVersionAccepted`, `acceptedPolicies`) | Acreditar que el empleado ha sido informado (Art. 88 LOPDGDD) | Metadato de cumplimiento | Generada al firmar electrónicamente esta cláusula. |

**Datos NO tratados**: nombre capturado en selfie, vector facial, huella dactilar, audio, vídeo del empleado, fotografía del puesto de trabajo, datos de otras aplicaciones en el dispositivo, sensores inactivos.

## 4. Sistema anti-fraude (no biométrico)

El sistema incorpora medidas técnicas para impedir la suplantación o manipulación de marcajes, **sin recurrir a captura biométrica**:

- **HMAC-SHA256** por marcaje con clave secreta por tenant: garantiza que cada registro de jornada no ha sido manipulado tras la firma. La clave nunca se transmite al cliente.
- **Geocerca configurable**: compara la ubicación del fichaje con la dirección del centro de trabajo del empleado (configurada por el administrador del tenant). Si está fuera del radio, se marca como anomalía `GPS_OUT_OF_RANGE` (no bloquea automáticamente — RGPD Art. 22).
- **Detección de imposible-travel**: si entre dos marcajes consecutivos la velocidad calculada por Haversine supera `maxTravelKmh` (configurable, por defecto 250 km/h), se marca `anomalyType: GPS_IMPLAUSIBLE_*KMH`. Tampoco bloquea — sólo flag.
- **Anti-brute-force**: el sistema rechaza marcajes inferiores al intervalo `minPunchIntervalSec` (por defecto 30 s) con `HTTP 429 Too Many Requests`.
- **Idempotency-Key**: el endpoint acepta cabeceras `X-Idempotency-Key` para evitar duplicación en reintentos de red (rápidamente observa una sola entrada por cada marcaje fallido).

## 5. Período de conservación (RGPD Art. 5.1.e)

Los registros de jornada se conservan durante **cuatro (4) años** desde la fecha del marcaje, plazo alineado con:

- **Ley General Tributaria (Art. 66)** y concordantes: prescripción de obligaciones tributarias.
- **Ley sobre Infracciones y Sanciones en el Orden Social (Art. 7)**: prescripción de sanciones laborales.
- **Estatuto de los Trabajadores**: plazos generales de reclamación.

Configurable por tenant hasta un máximo recomendado de **5 años**. Pasado este plazo, los registros son anonimizados o eliminados en procesos batch mensuales.

Los metadatos de cumplimiento de esta cláusula (`noticeAcknowledgedAt`, `noticeVersionAccepted`, `acceptedPolicies`) se conservan mientras dure la relación laboral más el plazo anterior, y nunca son cedidos fuera del Espacio Económico Europeo sin cláusulas contractuales tipo (SCCs) firmadas con el encargado del tratamiento.

## 6. Encargados del tratamiento

Para la operación del sistema, Volkern utiliza exclusivamente encargados del tratamiento que cumplen con el RGPD y firman acuerdo de encargo (Art. 28):

| Encargado | Función | Ubicación |
|---|---|---|
| Vercel Inc. | Hosting Next.js / Edge runtime | EEE+US (SCCs firmadas) |
| Neon (Postgres) | Alojamiento de base de datos cifrada | EEE+US (SCCs firmadas) |
| Resend Inc. | Notificaciones transaccionales al empleado (solo alertas, no datos GPS) | EEE+US (SCCs firmadas) |
| Apprise / Push | Notificaciones push al dispositivo (sin payload GPS, sólo aviso "tienes fichajes sin firmar") | EEE+US (SCCs firmadas) |

**Ningún sub-encargado recibe datos de geolocalización del empleado.** Sólo reciben metadatos administrativos.

## 7. Derechos del empleado (RGPD Cap. III y LOPDGDD)

El empleado puede ejercer, en cualquier momento, los siguientes derechos a través del dashboard `/dashboard/rrhh/mi-asistencia` o mediante solicitud por escrito al Delegado de Protección de Datos (DPO):

| Derecho | Cómo ejercerlo | Plazo de respuesta |
|---|---|---|
| **Acceso** (RGPD Art. 15) | Ver todos sus marcajes y metadatos en `/dashboard/rrhh/mi-asistencia` | Inmediato (autoservicio) |
| **Rectificación** (RGPD Art. 16) | Solicitar corrección de marcajes erróneos al manager o DPO | 30 días |
| **Supresión / Olvido** (RGPD Art. 17) | Solicitar borrado de marcajes antiguos (sujeto a obligación legal Art. 6.1.c) | 30 días |
| **Limitación** (RGPD Art. 18) | Solicitar restricción temporal del procesamiento | 30 días |
| **Portabilidad** (RGPD Art. 20) | Recibir sus marcajes en formato CSV/JSON legible por máquina | 30 días |
| **Oposición** (RGPD Art. 21) | Oponerse al tratamiento fundado en Art. 6.1.f; el DPO evaluará caso por caso | 30 días |
| **No ser objeto de decisiones automatizadas** (RGPD Art. 22) | Las anomalías son flag, nunca bloqueos automáticos ni sanciones automatizadas | Ya garantizado en diseño (ver §4) |

**Importante**: Cuando la solicitud afecte a marcajes comprendidos dentro de los **últimos 4 años**, la misma no podrá ser atendida en su totalidad por la obligación legal del Art. 6.1.c (registro horario del empresario). Esto se comunicará por escrito al empleado, junto con la respuesta motivada del DPO.

## 8. Contacto del Delegado de Protección de Datos

| | |
|---|---|
| **Responsable del tratamiento (empleador)** | La entidad identificada como tenant en la cuenta de Volkern |
| **Encargado del tratamiento (Volkern)** | Dimension eXpert LLC |
| **Email del DPO** | `dpo@volkern.app` |
| **Dirección postal** | A disposición del empleado previa solicitud al DPO |
| **Autoridad de control ante la que reclamar** | Agencia Española de Protección de Datos (AEPD) — `www.aepd.es` |

El plazo de respuesta del DPO es de **treinta (30) días naturales** desde la recepción de la solicitud, ampliable a dos meses si la complejidad lo justifica, previa notificación al empleado.

## 9. Validez y firma electrónica (LOPDGDD Art. 88.3)

Al pulsar el botón **“Acepto la cláusula”**, el empleado:

1. Confirma haber leído y comprendido íntegramente este documento.
2. Da su consentimiento informado al tratamiento de los datos descritos en §3 con la finalidad de §1 y las bases jurídicas de §2.
3. Acepta el sistema anti-fraude no biométrico descrito en §4.
4. Reconoce haber sido informado sobre sus derechos (RGPD Cap. III) y cómo ejercerlos (LOPDGDD Art. 88).
5. Recibe una copia firmada de esta cláusula vía email y puede re-firmarla si cambia la versión.

El sistema registra de forma inmutable:

- **Timestamp UTC** del momento exacto de la firma: `Employee.noticeAcknowledgedAt`.
- **Versión firmada** de la cláusula: `Employee.noticeVersionAccepted`.
- **Set acumulado de cláusulas aceptadas**: `Employee.acceptedPolicies` (campo JSON del modelo Prisma, append-only).

Estos metadatos sirven como **prueba robusta de cumplimiento** ante una eventual inspección de la AEPD o conflicto laboral individual.

## 10. Cambios en la cláusula

Cualquier modificación material de esta cláusula (finalidad, base jurídica, datos tratados, retención, encargados, derechos o datos de contacto del DPO) generará **una nueva versión** (`v1-2027-gps-only`, etc.). Los empleados con cuenta activa serán avisados al iniciar sesión y deberán **re-firmar la cláusula** para continuar usando el sistema de fichaje.

El sistema rechaza marcajes de empleados cuya cláusula firmada tenga una versión anterior, salvo que el administrador del tenant haya configurado `attendanceRules.blockIfNotNoticed=false` (lo cual desactiva el blocker y NO es recomendable).

## 11. Vigencia

Esta cláusula entra en vigor el **1 de julio de 2026** y sustituye automáticamente a cualquier cláusula referida a “selfie”, “captura biométrica facial”, “vision-lock selfie” o “AttendanceChallenge” publicada con anterioridad.

---

**Versión**: `v1-2026-gps-only`
**Fecha de entrada en vigor**: 2026-07-01
**Marco normativo aplicable**: RGPD (UE 2016/679) · LOPDGDD (LO 3/2018) · Estatuto de los Trabajadores (RDLeg 2/2015) · RD-Ley 8/2010.

*Fin del documento.*
