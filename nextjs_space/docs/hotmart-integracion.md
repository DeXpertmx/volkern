# Integración Hotmart ↔ Volkern Academia

**Estado:** 🔴 Pendiente — requiere decisión del cliente. NO implementar OAuth/webhooks hasta que un cliente confirme.
**Última revisión:** 2026-08-26
**Alcance de referencia:** `nextjs_space` (módulo Academia / LMS)

---

## 1. Objetivo y contexto

Integrar **Hotmart** (plataforma de venta de cursos/Club) con el módulo Academia de Volkern para clientes que **ya tienen 8+ años operando en Hotmart** y no pueden migrar de golpe.

La idea central **no es eliminar Hotmart**, sino:

1. **Absorber** la operación (alumnos, ventas, progreso) en Volkern para centralizar los datos.
2. **Migrar gradualmente** curso por curso: primero conviven ambos, luego el contenido pasa a Volkern.
3. Que el **portal del alumno de Volkern** sea el punto de entrada único (dashboard + progreso) aunque el contenido esté temporalmente en Hotmart.

> ⚠️ **Regla del proyecto:** no implementar la integración (OAuth, webhooks, backfill) antes de tiempo. Solo preparar el terreno que no bloquea (campos de origen en el schema + adecuación del portal), y documentar el plan para ejecutarse cuando el cliente decida venir.

---

## 2. Estado actual del módulo Academia (lo que ya existe)

El portal del alumno **ya está operativo y maduro**. NO hay que construirlo. Piezas ya funcionando:

| Capa | Rutas / modelo | Estado |
|---|---|---|
| **Modelo de datos** | `Estudiante`, `Curso`, `Modulo`, `Leccion`, `Inscripcion`, `ProgresoLeccion`, `Certificado`, `Quiz`, `AcademyPath`, `BundleCurso` | ✅ Completo (schema) |
| **Portal del alumno** (login CRM) | `/estudiante/*` (mis-cursos, certificados, perfil, configuración) | ✅ Funciona |
| **Portal de onboarding** (login propio) | `/academy/*` (login, dashboard, paths, quiz) | ✅ Funciona |
| **Player de lecciones** | `/estudiante/mis-cursos/[id]/leccion/[leccionId]` | ✅ Video/iframe/texto, materiales, notas |
| **Marcar progreso** | `POST /api/inscripciones/[id]/progreso` | ✅ Recálcula % + emite triggers |
| **Perfil del alumno** | `GET/PUT /api/estudiantes/perfil` | ✅ Existe y funciona |
| **Mis cursos** | `GET /api/inscripciones/mis-cursos` | ✅ Existe y funciona |
| **Triggers de automatización** | `emitLeccionCompletada`, `emitCursoCompletado` (`lib/academy/automation-events`) | ✅ Se disparan al completar |

**Conclusión:** el LMS nativo está completo. La integración Hotmart se apoya sobre esto; no compite con él.

---

## 3. Modelo de coexistencia (cómo conviven ambos)

Se agregan **solo campos de origen/trazabilidad** al schema — no se toca la lógica existente.

### 3.1 Nuevos campos por modelo

```prisma
// ===== Curso =====
// Añadir:
hotmartProductId  String?   // id del producto en Hotmart (puente de mapeo)
hotmartSubdomain  String?   // club.hotmart.com subdomain (para redirigir/embed durante convivencia)
proveedorContenido String  @default("propio")  // "propio" | "hotmart" — ¿dónde vive el contenido?

// ===== Estudiante =====
hotmartUserId String?  @unique   // puente para no duplicar alumnos al importar progreso

// ===== Inscripcion =====
hotmartTransactionId String?   // trazabilidad de la venta Hotmart
metodoPago           String?   // "hotmart" | "stripe" | ...
```

`proveedorContenido` es **el interruptor de la migración**:
- `"hotmart"` → el alumno ve el dashboard/progreso en Volkern, pero al entrar al contenido se le redirige al Club de Hotmart (`https://{hotmartSubdomain}.club.hotmart.com/...`).
- `"propio"` → el contenido está en Volkern (player de lecciones normal).

Cuando un cliente migra un curso de Hotmart a Volkern, se cambia `proveedorContenido` a `"propio"` y se importa la estructura (`Modulo`/`Leccion`). Los alumnos conservan su `Inscripcion` sin re-registrar.

### 3.2 Transición gradual (lo que resuelve la coexistencia)

1. **Conectar** (`proveedorContenido="hotmart"`): OAuth + webhook → cada venta crea `Estudiante`+`Inscripcion` en Volkern. El alumno sigue consumiendo en Hotmart, pero Volkern ya tiene la venta/progreso.
2. **Convivencia:** Volkern absorbe datos (webhooks + API Club para sync de progreso). Dashboard unificado de todos los cursos, aunque el contenido siga en Hotmart.
3. **Migración curso a curso:** importar estructura + progreso al `Curso` propio, pasar `proveedorContenido="propio"`, desconectar el último curso → apagar Hotmart.

---

## 4. Bloques de implementación (cuando se apruebe)

### Bloque A — OAuth + Webhook de compras (valor inmediato)
Replica el patrón del webhook de **Stripe** ya existente (`app/api/webhooks/stripe/route.ts`):
- `lib/hotmart/client.ts` — cliente API con refresh automático de token.
- `lib/hotmart/webhook-verify.ts` — verificación de firma (`X-Hotmart-Signature`).
- `app/api/webhooks/hotmart/route.ts` — endpoint público, dedup con `ProcessedWebhook`, auditLog.
- Mapeo de eventos: `PURCHASE_APPROVED` → upsert `Estudiante`+`Inscripcion`; `SUBSCRIPTION_CANCELLATION` → estado; `CHARGEBACK/REFUNDED` → baja.
- Guardar credenciales de cada cliente en `Integration` (modelo ya existente, campo `credenciales`).

**No toca** el contenido de Hotmart. Da el dashboard unificado de ventas/alumnos de inmediato.

### Bloque B — Sincronización de progreso (API Club)
- Consulta de estructura y progreso desde la API de Hotmart Club.
- Gate: el `hotmartUserId` + `hotmartTransactionId` son la clave para no duplicar.
- Dashboard de engagement (derivado de `ProgresoLeccion` + `fechaUltimoAcceso`).

### Bloque C — Migración e importación
- Import de `Modulo`/`Leccion` desde Hotmart al `Curso` propio.
- Backfill histórico en lotes con backoff (respeta rate-limit de Hotmart; usar cola/Redis ya existente).
- Cambiar `proveedorContenido` a `"propio"` curso por curso.

---

## 5. Riesgos y decisiones pendientes

### Decisiones que definen el alcance (responder antes de implementar Bloque A)

1. **Mapeo del curso:** ¿el curso de Hotmart se mapea a un `Curso` existente de Volkern (implica pantalla de "mapear producto Hotmart → Curso"), o se auto-crea al recibir la primera venta con el título de Hotmart? → **Recomendado: mapeo explícito** (A). Evita cursos huérfanos con datos mínimos.
2. **Configuración de la integración:** ¿la conecta el **superadmin** del control plane en nombre del cliente, o **cada tenant** desde su panel (`app/api/integraciones/route.ts` ya existe)? → Determina dónde vive la pantalla de configuración.
3. **Backfill:** ¿hay ventas históricas que migrar (8 años) o arranca con compras nuevas a partir del deploy? → Dimensiona la sincronización inicial.

### Riesgos técnicos
- **Rate-limit de Hotmart:** el backfill histórico es donde se estrella. Hacer con cola + Redis, no síncrono.
- **SSO/embed:** el "sin doble login" con iframe de `club.hotmart.com` es frágil (cookies de terceros, CORS). El embed es **prescindible al inicio**: alcanza con redirigir al Club en otra pestaña; el dashboard vive en Volkern.
- **Id de Hotmart como puente:** sin `hotmartUserId`/`hotmartTransactionId` el backfill crea duplicados. Es el campo más crítico.
- **Pruebas con navegador real** (móvil + desktop) para el flujo SSO/embed.

---

## 6. Qué avanza sin esperar al cliente (NO bloqueado por Hotmart)

Con el estado actual del módulo, el avance libre de bloqueo es acotado y no toca la lógica existente:

1. **Añadir los campos de coexistencia al schema** (§3.1) + migración Prisma. No rompe nada; deja el terreno listo.
2. **Dashboard/admin:** indicar en el `Curso` si el contenido es `"propio"` o `"hotmart"` (y el subdomain), para que el equipo vea el estado de la migración.
3. **Punto de entrada del alumno:** cuando `proveedorContenido="hotmart"`, el botón de "Continuar" en `/estudiante/mis-cursos` redirige al Club en vez de al player (aún sin API, el flag + campo ya permiten la lógica de redirección hardcodeada por subdomain).

**NO se implementa todavía:** OAuth, webhook, backfill, rate-limit (dependen del cliente real).

---

## 7. Checklist de verificación (al implementarse, por bloque)

- [ ] OAuth funcional con refresh automático.
- [ ] Webhook con verificación de firma + dedup (patrón Stripe).
- [ ] `PURCHASE_APPROVED` → `Estudiante`+`Inscripcion` creados.
- [ ] `proveedorContenido` respeta la redirección al Club.
- [ ] Backfill sin duplicados (gate por `hotmartUserId`).
- [ ] Dashboard de engagement con datos reales.

---

## 8. Referencias en el código

- Modelo: `nextjs_space/prisma/schema.prisma` model `Curso`, `Estudiante`, `Inscripcion`, `ProgresoLeccion`.
- Patrón webhook: `nextjs_space/app/api/webhooks/stripe/route.ts`.
- Patrón dedup: `model ProcessedWebhook`.
- Credenciales por tenant: `model Integration`.
- Portal alumno: `nextjs_space/app/estudiante/*`, `nextjs_space/app/academy/*`.
- Progreso + triggers: `nextjs_space/app/api/inscripciones/[id]/progreso/route.ts`.