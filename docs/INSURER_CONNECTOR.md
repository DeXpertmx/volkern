# 🔌 InsurerConnector — Arquitectura para integración con aseguradoras

**Versión:** 1.0 (Fase 5.2 START, 2026-08-03)
**Estado actual:** 1 implementación (Quálitas MOCK), 6 pendientes.

---

## 🎯 Visión

Una abstracción que permita hablar con Quálitas, GNP, AXA México, Seguros
Monterrey, TIREA, FIVA y EIAC **sin que el código del caller ramifique por
proveedor**. Cuando un agente o un skill necesita hablar con la aseguradora
\'A\', llama `getInsurerConnector(\'A\')` y obtiene el connector listo.

Sin la abstracción, cada nueva integración toca 5-7 archivos.
Con la abstracción, **swappear el mock por una integración real es
100% localizado al archivo del connector**.

---

## 🏗️ Estructura

```
lib/insurance/connectors/
├── InsurerConnector.ts          # Interface abstracta + tipos + factory getInsurerConnector()
├── qualitas/
│   ├── index.ts                 # QualitasConnector class (mock) — implementa InsurerConnector
│   └── mock-data.ts             # Datos determinísticos (clientes, productos, pólizas, siniestros)
├── gnp/                         # 🔜 pendiente
├── axa-mx/                      # 🔜 pendiente
├── seguros-monterrey/           # 🔜 pendiente
├── tirea/                       # 🔜 pendiente — estándar ficheros (no REST)
├── fiva/                        # 🔜 pendiente — solo normativo (consulta ramos autorizados)
└── eiac/                        # 🔜 pendiente — solo mediadores (consulta red)
```

> **Decisión clave:** CLASE por aseguradora, no archivo monolítico.
> `qualitas/index.ts` ya exporta una `instance` singleton; el factory sólo
> la importa lazy.

---

## ✅ Estado actual (Fase 5.2 commit 1)

| Slug | País | Ramos | Capabilities | Tipo |
|---|---|---|---|---|
| `qualitas` | MX | AUTO | AUTH_API_KEY, POLICIES_LIST, POLICIES_ISSUE, CLAIMS_SUBMIT, CLAIMS_STATUS | **MOCK** |

Los 6 conectores restantes lanzarán con `isMock: true` hasta que llegue
Partner Engineering con cada uno. La firma de la interfaz es estable,
así que el caller no ramifica.

---

## 🛠️ Cómo añadir un nuevo connector (3 pasos)

### Paso 1: Crear la estructura de carpeta

```bash
mkdir -p lib/insurance/connectors/<slug>/
touch lib/insurance/connectors/<slug>/index.ts
touch lib/insurance/connectors/<slug>/mock-data.ts
```

### Paso 2: Implementar la clase

```ts
// lib/insurance/connectors/<slug>/index.ts
import type { InsurerConnector, InsurerMetadata, /* ... */ } from '../InsurerConnector';
import { /* tu data */ } from './mock-data';

const MOCK_METADATA: InsurerMetadata = {
  slug: '<slug>',
  nombre: 'Aseguradora X, S.A.',
  country: 'MX' | 'ES',
  regulatoryId: '...',
  website: 'https://...',
  monedaBase: 'MXN' | 'EUR',
  supportedRamos: ['AUTO', /* ... */],
  capabilities: [/* 'AUTH_OAUTH', etc */],
  isMock: true,
};

class <Aseguradora>Connector implements InsurerConnector {
  readonly metadata = MOCK_METADATA;

  async authenticate(config) { /* tu impl */ }
  async fetchPolicies(input) { /* tu impl */ }
  async issuePolicy(input)  { /* tu impl */ }
  async submitClaim(input)  { /* tu impl */ }
}

const connector = new <Aseguradora>Connector();
export default connector;
```

### Paso 3: Registrar en el factory

```ts
// lib/insurance/connectors/InsurerConnector.ts
export type InsurerSlug = /* añade tu slug */;

export const VALID_INSURER_SLUGS: InsurerSlug[] = [
  'qualitas',
  // añade el tuyo
];

// En getInsurerConnector:
case '<slug>':
  return (await import('./<slug>')).default;
```

---

## 🔄 Swap Mock → Real

Cada conector arranca como MOCK. Cuando llegue Partner Engineering:

1. Reemplazar los cuerpos de los 4 métodos con llamadas `fetch()` al API
   real del partner. Mantener firmas idénticas.
2. Usar `validarTaxId()` (ya está en `InsurerConnector.ts`) antes de cada
   llamada — algunos partners validan en sandbox vs prod.
3. Mapear respuestas del partner a los tipos `ExternalPolicy` / `IssuePolicyResult` /
   `SubmitClaimResult`. Si el partner devuelve un shape distinto, el
   transformer es local al connector — no toca `InsurerConnector.ts`.
4. Cambiar `isMock: false` en el metadata.
5. Activar la capability faltante en el metadata (e.g. `WEBHOOK_IN` cuando
   se configure el webhook real en el panel del partner).

Tests del connector NO cambian — sólo el cuerpo del método.

---

## 🧪 Convenciones de tests

- **Factory** (`tests/insurer-connector.test.ts`): cubre resolución
  correcta, rechazo de slugs inválidos, lista de slugs válidos.
- **Cada connector** (e.g. `tests/qualitas-connector.test.ts` cuando se
  añada): cubre metadata, authenticate, fetchPolicies, issuePolicy,
  submitClaim con golden responses determinísticas.
- **Mocks**: la primera implementación siempre es MOCK con seed data
  determinístico. Cuando llegue la integración real, los tests siguen
  pasando porque validan la interfaz, no la implementación.

---

## 🚨 Decisiones arquitectónicas (defendidas)

### ¿Por qué interfaz en lugar de clase abstracta?

- TypeScript structural typing: cualquier clase que implemente los métodos
  satisface `InsurerConnector`. No requiere `extends`.
- Permite mocks parciales (mockear 1 método es trivial en tests).
- Cero overhead de virtual dispatch en runtime.

### ¿Por qué factory lazy (`await import`)?

- Cold-start del bundle: las 7 posibles implementaciones no se cargan
  hasta que el caller pide una específica.
- Evita ciclos de import (e.g. qualitas no carga gnp).
- Soporta deployments parciales (si `gnp/index.ts` aún no existe, el
  factory sólo lanza claro cuando se pide `gnp`).

### ¿Por qué unit tests sin red?

- Partner Engineering tarda 3-6 meses. No podemos esperar para validar
  la arquitectura.
- Tests con mocks son 100% determinísticos y corren en CI sin sandbox.
- Cuando llegue la integración real, sustituimos el mock y los tests
  siguen pasando porque validan la interfaz.

### ¿Por qué `validarTaxId` y no validación en cada connector?

- RFC y NIF son formatos similares pero distintos. Centralizar evita
  reimplementaciones inconsistentes (un connector que acepta 14 chars en
  RFC, otro que rechaza).
- Si mañana añadimos un connector suizo (AHV-AVS-Nummer), centralizar
  también.

---

## 🚦 Cómo se invoca desde un caller (futuro)

```ts
// Proyectado: en Fase 5.2 commit 2, sincronización masiva desde partner.
import { getInsurerConnector } from '@/lib/insurance/connectors/InsurerConnector';

const qualitas = await getInsurerConnector('qualitas');

// 1. Auth
const { token } = await qualitas.authenticate({
  apiKey: process.env.QUALITAS_API_KEY!,
});

// 2. Listar cartera del partner
const { policies } = await qualitas.fetchPolicies({
  clienteId: clienteId,
});

// 3. Mapear a Poliza interno de Volkern
const polizasVolkern = policies.map((p) => ({
  tenantId: ctx.tenantId,
  numeroPoliza: p.numeroPoliza,
  sumaAsegurada: p.sumaAsegurada,
  primaAnual: p.primaAnual,
  moneda: p.moneda,
  fechaInicio: p.fechaInicio,
  fechaVencimiento: p.fechaVencimiento,
  // ...
}));

// 4. Submitir un siniestro contra el partner
const result = await qualitas.submitClaim({
  externalPolicyId: 'qua-pol-2024-003',
  descripcion: 'Siniestro reportado por Bruno',
  fechaSuceso: new Date('2026-07-15'),
  montoReclamado: 50000,
});
```

---

## 📋 Archivos creados en este commit

| Archivo | Líneas | Propósito |
|---|---|---|
| `lib/insurance/connectors/InsurerConnector.ts` | ~270 | Interface + tipos + factory + helpers `validarTaxId` `inferirInsurerSlug` |
| `lib/insurance/connectors/qualitas/index.ts` | ~165 | `QualitasConnector` class implementando la interfaz (mock) |
| `lib/insurance/connectors/qualitas/mock-data.ts` | ~140 | Seed determinístico: 3 clientes, 3 productos AUTO, 4 pólizas, helper mocks |
| `tests/insurer-connector.test.ts` | ~165 | 30+ tests cubriendo factory + Qualitas (no toca red en sandbox) |
| `docs/INSURER_CONNECTOR.md` | ~115 | Este documento |

Total: ~855 líneas, 1 commit atómico.

---

## ⏭️ Próximos commits (orden propuesto)

| # | Commit | Esfuerzo |
|---|---|---|
| 1 | Skill wrapper `lib/insurance/connectors-skills.ts` + tests | ~4h |
| 2 | API REST `app/api/insurance/connectors/[slug]/sync/route.ts` + tests | ~4h |
| 3 | UI `/dashboard/seguros/aseguradoras/conectores/page.tsx` — listado de conectores | ~6h |
| 4 | Conector GNP mock (segundo conector México) | ~3h |
| 5 | Conector TIREA mock (España — primero del mercado español) | ~6h |
| 6 | Conector FIVA mock (solo consulta normativa) | ~2h |
| 7 | Conector EIAC mock (solo red de mediadores) | ~2h |
| 8 | Webhook genérico `app/api/insurance/webhooks/[aseguradora]/route.ts` | ~4h |
| 9 | Swap Qualitas mock → real (cuando llegue Partner Engineering) | ~8h+ |
