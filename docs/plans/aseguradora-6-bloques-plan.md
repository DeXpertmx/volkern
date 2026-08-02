# Volkern Insurance — Ficha de Aseguradora: Gap Analysis & Plan de los 6 Bloques

> **Documento de planificación: expansión del modelo de datos de Aseguradora con los 6 bloques de información legal, regulatoria, operativa, financiera y técnica.**
>
> Estado: ✅ **IMPLEMENTADO (Fase 1 + Migración completa 6 bloques)**
> Fecha: Agosto 2026
> Rama: `master` (working tree)

---

## 📐 Índice

1. [Contexto y Objetivo](#1-contexto-y-objetivo)
2. [Los 6 Bloques de Datos](#2-los-6-bloques-de-datos)
3. [Gap Analysis: Estado previo vs. Requerido](#3-gap-analysis-estado-previo-vs-requerido)
4. [Bugs de Integración Detectados](#4-bugs-de-integración-detectados)
5. [Modelo de Datos Final](#5-modelo-de-datos-final)
6. [Plan de Implementación por Fases](#6-plan-de-implementación-por-fases)
7. [Seguridad de Secretos (Bloque 6)](#7-seguridad-de-secretos-bloque-6)
8. [Estado Actual del Trabajo](#8-estado-actual-del-trabajo)
9. [Próximos Pasos (Fases 2-4)](#9-próximos-pasos-fases-2-4)

---

## 1. Contexto y Objetivo

El módulo de Seguros (`/dashboard/seguros/*`) gestiona aseguradoras, productos, pólizas y renovaciones. La entidad **Aseguradora** solo guardaba datos de contacto básicos (`nombre`, `nif`, `direccion`, `telefono`, `email`, `web`), insuficientes para:

- Emisión de pólizas con validez legal (razón social, identificación fiscal, domicilio).
- Verificación regulatoria (licencia de la superintendencia, ramos autorizados, vigencia).
- Liquidación de comisiones y recaudación de primas (cuentas bancarias, modelos de comisión, monedas).
- Integración técnica con la aseguradora vía API (endpoints, credenciales, formatos).

**Objetivo:** ampliar `Aseguradora` con los 6 bloques de datos completos (escalares + JSON tipados), manteniendo compatibilidad total con los datos existentes (migración aditiva, sin pérdida).

---

## 2. Los 6 Bloques de Datos

| # | Bloque | Función |
|:--|:---|:---|
| 1 | **Identificación Legal y Fiscal** | Razón social, nombre comercial, ID fiscal, domicilio fiscal, régimen fiscal |
| 2 | **Regulación y Licencias** | Nº de registro/licencia reguladora, ramos autorizados, vigencia de la licencia |
| 3 | **Contacto y Representación Legal** | Representante legal, mesa de entradas, contactos operativos, teléfonos y web |
| 4 | **Parámetros Operativos y Comerciales** | Modelos de comisión, condiciones de pago, límites de suscripción, gestión de siniestros |
| 5 | **Configuración Financiera y Bancaria** | Cuentas bancarias, moneda base y multimoneda, moneda de liquidación |
| 6 | **Integración Técnica y Seguridad** | Credenciales API, endpoints staging/prod, formatos de intercambio, certificados |

---

## 3. Gap Analysis: Estado previo vs. Requerido

### Estado previo real

**Schema `Aseguradora`** (`insurance_aseguradoras`):

```prisma
nombre | nif | direccion | telefono | email | web | codigoExterno | activa
```

**API** (`/api/insurance/aseguradoras`): CRUD de esos campos + búsqueda por nombre/nif + `_count` de pólizas/productos.

**UI** (`/dashboard/seguros/aseguradoras`): tarjetas con nombre/email/teléfono/web + dialog crear/editar.

### Comparativa bloque por bloque

| Bloque | Lo que se pidió | Estado previo | Cobertura |
|:---|:---|:---|:---|
| **1. Legal/Fiscal** | Razón Social, Nombre Comercial, ID Fiscal, Domicilio completo (CP/provincia/país), Régimen | ⚠️ Solo `nif` + `direccion` libre | Faltaban 6 campos |
| **2. Regulación** | Nº Registro/Licencia, Ramos Autorizados, Vigencia | ❌ Nada | Faltaban 3 campos |
| **3. Contacto/Representación** | Representante Legal, Mesa de Entradas, Contactos Operativos | ⚠️ Solo `telefono`/`web`/`email` | Faltaban 3 campos |
| **4. Parámetros Operativos** | Modelos de Comisión, Condiciones de Pago, Límites de Suscripción, Gestión de Siniestros | ❌ Nada | Faltaban 4 campos |
| **5. Financiero/Bancario** | Cuentas Bancarias, Moneda Base/Multimoneda, Moneda de Liquidación | ❌ Nada | Faltaban 3 campos |
| **6. Integración Técnica** | Credenciales API, Formatos, Firma Digital/Certificados | ❌ Solo placeholder `codigoExterno` | Faltaban 3 campos |

**Resumen:** de ~24 puntos de datos, solo 3 existían (y 2 mal cableados).

---

## 4. Bugs de Integración Detectados

1. **La lista nunca cargaba**: la página hacía `setAseguradoras(data.aseguradoras || [])` pero la API devolvía un **array pelado** (`NextResponse.json(aseguradoras)`). Resultado: siempre "No hay aseguradoras".
2. **`notas` se perdía**: el form enviaba `notas` pero la API POST lo ignoraba silenciosamente (el campo no existía en el schema).
3. **`fechaCreacion` inexistente**: la UI usaba `fechaCreacion`, pero el campo real del schema es `createdAt`.

---

## 5. Modelo de Datos Final

```prisma
model Aseguradora {
  // ─── Base (ya existía) ─────────────────────────────────
  id              String   @id @default(cuid())
  tenantId        String
  nombre          String
  nif             String?
  direccion       String?
  telefono        String?
  email           String?
  web             String?

  // ─── Bloque 1: Identificación Legal y Fiscal ───────────
  razonSocial     String?
  nombreComercial String?
  codigoPostal    String?
  provincia       String?
  pais            String?
  regimenFiscal   String?

  // ─── Bloque 2: Regulación y Licencias ──────────────────
  numeroRegistro              String?
  ramosAutorizados           Json?   // string[] — ramos de negocio autorizados (Vida, Salud, Autos...)
  fechaVigenciaLicenciaInicio DateTime?
  fechaVigenciaLicenciaFin    DateTime?

  // ─── Bloque 3: Contacto y Representación Legal ─────────
  representanteLegal   Json?   // { nombre, documento, cargo }
  mesaEntradas         String?
  contactosOperativos  Json?   // [{ cargo, nombre, email, telefono }]

  // ─── Bloque 4: Parámetros Operativos y Comerciales ─────
  modelosComision      Json?   // [{ nombre, tipo, pct, aplicaA }]
  condicionesPago      Json?   // { diasGracia, politicaCancelacion, requiereAnticipo }
  limitesSuscripcion   Json?   // { montoMaximoAutomatico, moneda, requiereAprobacionManual }
  gestionSiniestros    Json?   // { slaRespuestaHoras, limiteIndemnizacion, tipoLimite, deducible }

  // ─── Bloque 5: Configuración Financiera y Bancaria ─────
  cuentasBancarias     Json?   // [{ banco, tipoCuenta, numeroCuenta, clabe, iban, swift, moneda }]
  monedaBase           String?
  monedaLiquidacion    String?

  // ─── Bloque 6: Integración Técnica y Seguridad ─────────
  integracionApi       Json?   // { apiKey, oauth, endpoints, formatos, certificados }

  notas           String?
  codigoExterno   String?
  activa          Boolean  @default(true)
}
```

Los bloques 3-6 se guardan como **JSONB tipado** (definido en `lib/insurance/aseguradora-types.ts`).

---

## 6. Plan de Implementación por Fases

### Fase 1 — Base + Bugs (✅ COMPLETADA)

- Corregir los 3 bugs de integración (lista vacía, `notas` perdida, `fechaCreacion`).
- Añadir campos escalares de los Bloques 1 y 2 + `notas`.
- Migración aditiva + API (GET/POST/PATCH) + UI con secciones.
- **Archivos:** `20260802_add_aseguradora_fase1/migration.sql`, `route.ts`, `[id]/route.ts`, `aseguradoras/page.tsx`.

### Fase 1.5 — Migración completa 6 bloques (✅ COMPLETADA)

- Definir tipos TS de los bloques 3-6 (`lib/insurance/aseguradora-types.ts`).
- Migración aditiva única e idempotente de los 6 bloques (`20260803_add_aseguradora_bloques_completo/migration.sql`).
- APIs: POST/PATCH aceptan los bloques 3-6; GET enmascara secretos del Bloque 6.
- Seed de ejemplo AXA/MAPFRE con los 6 bloques (`scripts/seed-aseguradoras-bloques.ts`).
- Tests de round-trip JSON + enmascaramiento + merge seguro.

### Fase 2 — Datos estructurados en UI (🟡 PENDIENTE)

- Página de detalle de aseguradora con tabs por bloque.
- Formularios de edición para cada bloque JSON tipado (representante legal, contactos operativos, comisiones, cuentas, integración).
- Visualización de vigencia de licencia con alerta de expiración.

### Fase 3 — Integración técnica activa (🟡 PENDIENTE)

- Endpoints de cotización/emisión/sincronización contra `integracionApi.endpoints`.
- Historial de intentos de conexión y estados de sincronización.
- Gestión de certificados y firmas digitales.

### Fase 4 — Operaciones comerciales (🟡 PENDIENTE)

- Aplicar `modelosComision` en liquidación de comisiones.
- Respetar `limitesSuscripcion` al emitir pólizas automáticas (aprobación manual vs. automática).
- SLA de `gestionSiniestros` en el módulo de siniestros.

---

## 7. Seguridad de Secretos (Bloque 6)

El Bloque 6 contiene credenciales (API keys, OAuth, certificados). Decisiones tomadas:

1. **GET enmascara** `integracionApi`: los valores sensibles se devuelven como `••••ultimos4` (o `••••••••` si tienen ≤ 4 chars, incluido el caso exacto de 4). Nunca se exponen en respuestas.
2. **PATCH hace deep-merge, no reemplaza**: Prisma *reemplaza* el campo Json completo en `update` (no hace merge). Por eso PATCH usa `mergeIntegracionApiForSave` (lee el valor almacenado + el payload saneado y construye el objeto final). **Fix 2026-08-04:** el merge es *deep* para los objetos anidados (`oauth`, `certificados`, `endpoints`) — el merge shallow `{ ...current, ...cleaned }` reemplazaba el objeto entero y borraba secretos reales cuando el cliente reenviaba solo un campo enmascarado del `oauth` (p.ej. clientId real nuevo + clientSecret enmascarado).
3. **`null` explícito limpia** campos individuales; `integracionApi: null` limpia todo el bloque.
4. **POST sanitiza** también: un flujo de clonado desde el GET no persiste sentinels.

---

## 8. Estado Actual del Trabajo

| Área | Estado |
|:---|:---|
| **Schema** (`schema.prisma`) | ✅ 6 bloques completos + `ramosAutorizados` (Bloque 2) |
| **Migración** (`20260803_add_aseguradora_bloques_completo`) | ✅ Aplicada a producción Neon, verificada |
| **Migración extra** (`20260804_add_aseguradora_ramos_autorizados`) | ✅ Aditiva, `ramosAutorizados` JSONB |
| **Tipos TS** (`lib/insurance/aseguradora-types.ts`) | ✅ `maskIntegracionApi`, `sanitizeIntegracionApiForSave`, interfaces |
| **API** (`/api/insurance/aseguradoras*`) | ✅ GET wrapped + masked, POST/PATCH con 6 bloques |
| **Seed AXA/MAPFRE** (`scripts/seed-aseguradoras-bloques.ts`) | ✅ Upsert idempotente, 6 bloques |
| **Tests** (`tests/aseguradoras.test.ts`) | ✅ 24 tests (50 con insurance-skills) |
| **Validación** | ✅ tsc 0 errores, vitest 50/50, code review 3 rondas |

**Checkpoints de seguridad** (read-only, en `.checkpoints/`):
- `20260801T204338Z-insurance-fase1`
- `20260801T205106Z-aseguradora-bloques3-6`

---

## 9. Próximos Pasos (Fases 2-4)

1. **Fase 2**: página de detalle con tabs por bloque + formularios JSON.
2. **Fase 3**: ejecutar el seed contra el tenant de prueba y verificar la ficha completa en la UI.
3. **Fase 4**: commit + push del trabajo acumulado (Fase 1 + migración 6 bloques + tests).

---

## Apéndice A: Cómo ejecutar el seed

```bash
# Tenant por defecto 'demo'
npx tsx scripts/seed-aseguradoras-bloques.ts

# Tenant específico
TENANT_ID=<tenantId> npx tsx scripts/seed-aseguradoras-bloques.ts
```

El seed hace `upsert` con `update`, por lo que es idempotente: enriquece AXA/MAPFRE si ya existen (creadas por `seed-insurance-demo.ts` o `lib/insurance/seed.ts`) sin duplicar ni borrar nada.
