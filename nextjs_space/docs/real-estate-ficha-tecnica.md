# Volkern Real Estate — Ficha técnica del módulo

**Documento de inventario y estado real**
Fecha: 2026-09-29 · Rama: `master` · Migraciones cerradas en producción: 106

**Versión ilustrada en PDF:** `docs/real-estate-tecnico.pdf` — este inventario
reorganizado por flujos y con capturas reales del módulo; se regenera con
`scripts/generar-pdf-tecnico-real-estate.cjs`.

Fuentes: esquema de Prisma, rutas de `app/api`, páginas de `app/dashboard` y del portal público,
módulos de `lib/real-estate`, y consulta de solo lectura a la base de producción.

**Regla aplicada en este documento:** no aparece ninguna credencial, contraseña ni clave de
API. El inmueble no es una tabla propia: es un ítem de catálogo, y el documento lo trata como
tal en todo momento.

---

## 1. Superficie del módulo

### 1.1 Una sola entrada de menú, y el panel por URL directa

Fuente única del menú: `lib/navigation-config.ts`, bloque «Configuración» (línea 601):

```ts
{ name: 'Inmobiliaria', href: '/dashboard/configuracion/real-estate',
  icon: Home, description: 'Configuración del portal de propiedades y comisiones' }
```

Esa es **la única entrada de navegación del módulo**, y no tiene `planModule` ni
`requiredAccountType`: la ve cualquier cuenta. **No existe un hub `real-estate`** en
`lib/navigation-config.ts` (los hubs son agencia, contabilidad, ventas, comunicaciones,
marketing, academia, seguros, hospitality, rrhh, equipo, finanzas, calidad, produccion,
inventario, proyectos, taskforce, strategy, assets, knowledge, logistica, compliance, perfil y
configuracion), y **ninguna página enlaza al dashboard inmobiliario**: `/dashboard/real-estate`
solo se alcanza escribiendo la URL. Sus propios accesos rápidos llevan al Catálogo, a la
exportación y al portal público, no a sí mismo.

| # | Pantalla | Ruta | Estado |
| --- | --- | --- | --- |
| 1 | Configuración inmobiliaria (entrada de menú) | `/dashboard/configuracion/real-estate` | existe · 4 pestañas |
| 2 | Dashboard inmobiliario | `/dashboard/real-estate` | existe · **sin enlace desde la interfaz** |
| 3 | Propiedades (listado operativo) | `/dashboard/real-estate/properties` | existe |
| 4 | Catálogo filtrado por inmuebles | `/dashboard/catalogo?tipo=inmueble` | existe (pantalla compartida) |
| 5 | Campos personalizados del inmueble | `/dashboard/catalogo/campos` | existe (pantalla compartida) |
| 6 | Pipeline de venta | `/dashboard/pipeline` | existe (pantalla compartida) |
| 7 | Portal público de propiedades | `/p/<tenantSlug>/propiedades` | existe · pública |
| 8 | Ficha pública de un inmueble | `/p/<tenantSlug>/propiedades/<id>` | existe · pública |
| 9 | Página comercial del vertical | `/soluciones/real-estate` | existe · pública |

Las pestañas de la Configuración son `general`, `portal`, `commissions` y `export`
(`components/hubs/RealEstateConfigDashboard.tsx`), y la pestaña activa se refleja en la URL
(`?tab=…`), así que cada una es enlazable.

### 1.2 Cómo se enciende

- **Vertical de producto:** `lib/plans.ts` → `VERTICAL_DEFINITIONS.real_estate`, nombre
  «Inmobiliaria (Real Estate)», icono 🏠, con su lista de módulos (leads, contactos, empresas,
  pipeline, tareas, analytics, mensajes, citas, catalogo, cotizaciones, contratos,
  ordenes_venta, campanas, cms, builder_premium, mi_tarjeta, integraciones, equipo,
  configuracion).
- **Plan comercial:** `lib/vertical-plans.ts` → plan `inmobiliaria`, slug `real-estate`,
  «Propiedades, leads y cierres», 59 €/mes.
- **Módulo de la cuenta:** `Tenant.enabledModules` incluye el literal `real-estate`. La cuenta
  de demostración tiene `{crm, real-estate, leads, calendario}`. No hay comprobación de plan en
  `lib/permissions.ts` (no menciona el módulo), así que la puerta real es `enabledModules` y
  el catálogo de verticales.
- **Altas guiadas:** `app/signup/page.tsx` (selector «Inmobiliaria») y
  `app/dashboard/onboarding-quick/page.tsx` (tarjeta «Inmobiliaria · ERP inmobiliario
  completo»).
- **Escaparate público:** `lib/navigation.ts` («Inmobiliarias»), `components/public/ProductosLanding.tsx`,
  `PricingPage.tsx`, `VerticalShowcase.tsx` y `components/public/RealEstateLanding.tsx`
  (página `/soluciones/real-estate`).

---

## 2. Modelo de datos

**No existe un modelo `Property`.** El inmueble es un `CatalogoItem` con `tipo = 'inmueble'` y
sus campos propios en `customFieldValues` (JSONB). Esa decisión es la que permite que el
inmueble herede catálogo, precios, impuestos, multimedia, deals y citas sin duplicar nada.

| Modelo | Tabla | Para qué |
| --- | --- | --- |
| `CatalogoItem` | `catalogo_items` | El inmueble: `nombre`, `descripcion`, `precioBase`, `moneda`, `destacado`, `activo`, `media` (JSONB), `pricing` (JSONB), `customFieldValues` (JSONB), `metadata`, `contactId` |
| `Contact` (relación `OwnerProperties`) | `contacts` | Propietario / vendedor del inmueble (`CatalogoItem.contactId → Contact`) |
| `CatalogoFieldDefinition` | `catalogo_field_definitions` | Definición de cada campo del inmueble: `fieldKey`, `label`, `type`, `options`, `required`, `orden`, `categoria`, `placeholder`, `unidad`, `valorDefecto`, `activo` |
| `Captacion` | `captaciones` | Contrato de captación: `tipoCaptacion` (`exclusiva\|compartida\|mandato`), `estado` (`borrador\|activa\|vencida\|cancelada\|cerrada`), `fechaInicio/Fin/Firma/Vencimiento/Cancelacion`, `esExclusiva`, `clausulasExclusividad`, `precioOferta/Minimo`, `comisionPorcentaje/Fija/Moneda/Condiciones/Notas`, `condicionesPago`, `documentoUrl/Hash`, `auditHash` (único), `chainedHash`, `sealedAt`, `signatureAudit`, `metadata` |
| `Deal` | `deals` | Operación de venta/alquiler; el pipeline inmobiliario cuelga de `PipelineStage` con `categoria = 'real_estate'` |
| `Comision` | `comisiones` | Comisión calculada por operación: `tipo`, `porcentaje`, `montoFijo`, `montoCalculado`, `moneda`, `estado` (`pendiente\|aprobada\|pagada`), `metodoCalculo` (la regla, en JSON), `fechaPago`, `referenciaPago` |
| `Lead` | `Lead` | Consulta entrante; el portal público escribe `fuente = 'portal_inmobiliario'` |
| `Cita` | `Cita` | Visita a un inmueble (`catalogoItemId`) |
| `Tenant` | `Tenant` | `parentId` es la relación de franquicia: una central con oficinas hijas |
| `Configuracion` | `Configuracion` | Claves/valor del módulo por cuenta (ver §2.3) |

### 2.1 El contrato de captación tiene columnas de sellado que nadie escribe

`Captacion` declara `auditHash` (`@unique`), `chainedHash`, `sealedAt` y `signatureAudit`, y
existe el índice único `captaciones_auditHash_key` en producción. Pero `createCaptacion()`
(`lib/real-estate/captacion-helpers.ts`) **no** toca ninguna de las cuatro, y no hay ningún
sealer de captaciones: el patrón de cadena SHA-256 sí está implementado para contratos
(`lib/erp/contract-sealer.ts`), nóminas (`lib/finance/payroll/es/payroll-sealer.ts`) y
movimientos de stock (`lib/erp/stock-service.ts`), no para captaciones. Hoy la captación
**no tiene prueba de integridad encadenada**, aunque el esquema esté preparado.

### 2.2 Tres listas distintas de campos del inmueble

| Origen | Contenido |
| --- | --- |
| `app/api/catalogo/field-definitions/presets/route.ts` (preset `inmobiliaria`) | **38 campos** en cinco bloques: datos básicos, ubicación, características, certificación energética (letra, consumo, emisiones, organismo, fechas, documento) y visibilidad/SEO |
| `scripts/seed-real-estate.ts` (seed genérico del módulo) | Juego propio: incluye `superficie_construida`, `antiguedad`, `orientacion`, `trastero`, `certificacion_energetica`… |
| `scripts/seed-demo-real-estate.ts` (seed de la cuenta de demostración) | **21 campos** activos en producción, orientados a renta vacacional: añade `huespedes_max`, `wifi`, `aire_acondicionado` |

Las tres conviven y no coinciden. La cuenta de demostración enseña 21 campos activos
(`catalogo_field_definitions`), que son exactamente los que siembra su propio seed.

### 2.3 Claves de configuración del módulo

Viven en `Configuracion` (clave/valor por `tenantId`) y viajan por la ruta genérica
`/api/configuracion` —no hay ruta de configuración propia más allá del setup—. Claves usadas:
`portalSlug`, `portalEnabled`, `portalCustomDomain`, `commissionType`,
`defaultCommissionPct`, `defaultMonthlyFee`, `defaultFixedFee`, `defaultSplitAgent`,
`defaultSplitAgency`, `defaultCurrency`, `exportFormats` (lista serializada),
`autoExportEnabled`, `autoExportFormat`.

Valores reales de la cuenta de demostración: `portalSlug = realestate`,
`portalEnabled = true`, `commissionType = porcentaje_venta`, `defaultCommissionPct = 3`,
`defaultSplitAgent/defaultSplitAgency = 50/50`, `exportFormats = ["xml","csv"]`,
`autoExportEnabled = false`, `defaultCurrency =` (vacío), `portalCustomDomain =` (vacío).

---

## 3. Mapa JSONB → TypeScript

`lib/real-estate/property-helpers.ts` es la frontera: `parseInmueble()` traduce el ítem de
catálogo a un `InmuebleParsed` tipado, y el resto del módulo (API y pantallas) trabaja con ese
objeto y nunca con el JSON crudo.

| Campo en `customFieldValues` | Propiedad tipada | Tipo |
| --- | --- | --- |
| `tipo_operacion` | `operationType` | `venta \| alquiler \| traspaso \| alquiler_temporada` |
| `tipo_inmueble` | `propertyType` | `Casa`, `Departamento`, `Ático`, `Villa`, `Loft`, `Bungalow`, `Local`, `Oficina`, `Terreno`, `Nave`… |
| `estado` | `status` | `disponible \| reservada \| vendida \| alquilada` |
| `superficie_total` | `areaM2` | number |
| `superficie_construida` | `builtM2` | number |
| `habitaciones` / `banos` | `bedrooms` / `bathrooms` | number |
| `huespedes_max` | — (solo demo vacacional) | number |
| `estacionamientos` | `parking` | number |
| `direccion` / `zona` | `address` / `city` | string |
| `latitud` / `longitud` | `lat` / `lng` | number |
| `antiguedad` | `yearBuilt` | number |
| `ascensor`, `estacionamiento`, `alberca`, `jardin`, `trastero`, `terraza`, `balcon`, `aire_acondicionado`, `calefaccion`, `amueblado` | `hasElevator`, `hasParking`, `hasPool`, `hasGarden`, `hasStorageRoom`, `hasTerrace`, `hasBalcony`, `hasAirConditioning`, `hasHeating`, `furnished` | boolean |
| `orientacion` | `orientation` | string |
| `certificacion_energetica` | `energyCert` | `A`…`G` \| `En trámite` |
| `consumo_energetico` / `emisiones_co2` | `energyCertConsumption` / `energyCertEmission` | number |
| `organismo_certificador`, `fecha_certificado`, `caducidad_certificado`, `documento_certificado` | `energyCertBody`, `energyCertDate`, `energyCertExpiry`, `energyCertUrl` | string |
| `descripcion_larga` / `tags_seo` | `longDescription` / `seoTags` | string |

La certificación energética no es decorativa: se captura en el alta rápida y se exporta en los
feeds a portales (§7).

---

## 4. Capa de aplicación

### 4.1 Rutas de API (15 en total)

| Dominio | Rutas |
| --- | --- |
| Inmuebles (internas) | `/api/real-estate/properties` (GET/POST), `/api/real-estate/properties/[id]` (GET/PATCH/DELETE), `/api/real-estate/properties/[id]/media` (POST) |
| Captaciones | `/api/real-estate/captaciones` (GET/POST), `/api/real-estate/captaciones/[id]` (GET/PATCH/DELETE) |
| Métricas | `/api/real-estate/dashboard-stats` (GET) |
| Salida a portales | `/api/real-estate/export` (GET: `format=xml\|csv\|json`), `/api/real-estate/sync` (GET feed / POST delta) |
| Franquicia | `/api/real-estate/franchise/overview` (GET), `/api/real-estate/franchise/commissions` (GET) |
| Públicas (rate-limited) | `/api/public/real-estate/properties` (GET), `/api/public/real-estate/properties/[id]` (GET), `/api/public/real-estate/contact` (POST) |
| IA | `/api/ai/real-estate/consult` (POST, RAG) |
| Puesta en marcha | `/api/configuracion/real-estate/setup` (POST, `seedRealEstateModule`) |
| Portal por dominio propio | `/api/configuracion/resolve-domain` (`resolveTenantByCustomDomain`) |

Todas las internas usan `withTenantAuth()` (`lib/api-key-auth.ts`): sesión NextAuth **o** clave
de API, con el `tenant` resuelto y el aislamiento por `tenantId` aplicado en cada consulta. Las
públicas no llevan sesión: resuelven el tenant por `slug` y aplican
`applyRateLimit()` (`lib/rate-limit-middleware.ts`).

### 4.2 Módulos puros (`lib/real-estate/`)

| Fichero | Qué resuelve |
| --- | --- |
| `property-helpers.ts` | `parseInmueble()`, `getProperties()` (filtros), `getPropertyStats()`. Es el único traductor JSONB → tipado |
| `captacion-helpers.ts` | Alta/listado/edición de captaciones, `calcularComisionCaptacion()`, `isCaptacionVigente()`, `getCaptacionStats()` |
| `commission-calculator.ts` | `calculateCommission()` (porcentaje sobre venta, porcentaje sobre comisión, monto fijo, escalonada por tramos, suscripción mensual), splits agente/agencia, `createCommissionFromDeal()`, resumen de franquicia y liquidación (`approveCommission`, `markCommissionAsPaid`) |
| `setup-pipeline.ts` | Las 6 etapas del pipeline inmobiliario: Contacto inicial (10 %) → Visita programada (25 %) → Oferta recibida (50 %) → Negociación (70 %) → Escrituración (90 %) → Cerrado (100 %) |
| `seed.ts` | `seedRealEstateModule(tenantId)`: etapas, automatizaciones base (bienvenida a lead inmobiliario, recordatorio de visita) |
| `exporters/{xml,csv,json}-exporter.ts` | Feeds Idealista (XML), Fotocasa (CSV) y MLS (JSON) + `generateSyncDelta()` |
| `operation-labels.ts` | Etiquetas y colores de operación compartidos por panel y portal |
| `portal-utils.ts` | `resolveTenantBySlug()` (slug de cuenta **o** `portalSlug` configurado) y `resolveTenantByCustomDomain()` |

### 4.3 Componentes

- **Panel:** `components/hubs/RealEstateConfigDashboard.tsx` (configuración) y
  `components/real-estate/OwnerCard.tsx` (ficha del propietario, reutilizada por el listado).
- **Público del vertical:** `components/public/real-estate/` — `RealEstateAIWorks`,
  `RealEstateCompare`, `RealEstateHowItWorks`, `RealEstateIntegrations`, `RealEstateOffer`,
  `RealEstateProblemSection`, `RealEstateResults`, `RealEstateUseCases`, más
  `RealEstateLanding.tsx`.
- **Portal público del tenant:** página propia (`app/p/[tenantSlug]/propiedades/`) con
  `HeroCarousel` y `PropertyDetailClient` — mapa embebido (OpenStreetMap), galería, formulario
  de contacto y propiedades similares.
- **CMS (Puck):** `lib/puck/components/real-estate/` — `PropertyCard`, `PropertyGrid`,
  `PropertyDetail`, `PropertyContactForm` y `RealEstateDashboard` (bloque «Métricas
  Inmobiliarias» en `lib/puck/puck-config.tsx`), para incrustar catálogo y métricas en las
  páginas del constructor visual.

### 4.4 IA

- **Skills** (`lib/skills/real-estate-skills.ts`): `generate_property_description`,
  `suggest_price_based_on_market`, `calculate_property_quality_score`, `recommend_properties`,
  `calculate_franchise_commissions`, `search_properties_by_filters`. Usan `AIEngine.chat()`,
  el mismo motor con fallback de modelos del resto del ERP.
- **Consulta RAG** (`/api/ai/real-estate/consult`): extrae filtros en lenguaje natural
  (operación, tipo, zona, precio, habitaciones, baños, superficie, palabras clave, intención),
  busca hasta 8 inmuebles y responde con ellos. Requiere autenticación por API key o sesión.
- **Intenciones** (`lib/agents/intents/real-estate-intents.ts`): el vocabulario con el que el
  agente reconoce una petición inmobiliaria.

---

## 5. Flujo A — Del portal público al lead

```
Visitante
  │
  ├─ 1. Listado       /p/<tenantSlug>/propiedades
  │      · resolveTenantBySlug(): busca la cuenta por slug y, si no existe,
  │        por la clave `portalSlug` de Configuracion (dominio propio incluido)
  │      · consulta: tipo='inmueble', activo=true, con filtros de operación,
  │        tipo, zona (JSONB), precio mínimo/máximo y texto libre
  │      · ordena destacados primero; 50 por página
  │
  ├─ 2. Ficha         /p/<tenantSlug>/propiedades/<id>
  │      · galería, mapa, datos del inmueble, propiedades similares
  │
  └─ 3. Contacto      POST /api/public/real-estate/contact   (rate-limited)
         │                 body: { slug, propertyId, name, email, phone, message, preferredDate }
         ├── resuelve la cuenta por slug                    → 400/404 con causa
         ├── exige nombre y email                           → 400 con causa
         ├── crea el Lead con fuente = 'portal_inmobiliario'
         └── publica el evento en el EventBus
                └─ Automation Engine → tarea de seguimiento (plantilla del módulo:
                   «Bienvenida a nuevo lead inmobiliario», dispara con LEAD_CREATED)
```

**El lead del portal es el mismo lead del CRM**: nace con `fuente = 'portal_inmobiliario'`, que
es exactamente el filtro con el que el dashboard inmobiliario cuenta «Leads (Portal)».

---

## 6. Flujo B — Alta y edición de un inmueble

```
Listado /dashboard/real-estate/properties  ("Nueva Propiedad")
  │  · nombre y precio obligatorios
  │  · operación, tipo, ciudad, dirección, superficie, habitaciones, baños
  │  · estado: disponible | reservada | vendida | alquilada
  │  · divisa por defecto = la del tenant (llega de dashboard-stats, no fija a EUR)
  │  · bloque de certificación energética: letra, consumo, emisiones,
  │    organismo, fecha, caducidad y URL del documento
  ▼
POST /api/real-estate/properties          (withTenantAuth)
  ▼
CatalogoItem (tipo='inmueble')
  ├── columnas: nombre, descripcion, precioBase, moneda, destacado, activo
  ├── customFieldValues: los campos del mapa de §3
  ├── media: imágenes (POST /api/real-estate/properties/[id]/media)
  └── contactId → Contact (propietario/vendedor; se consulta con OwnerCard)
```

El inmueble vive en el Catálogo, así que todo lo que el ERP sabe hacer con un ítem —impuestos,
impuestos por tasa, deals, citas, multimedia, chatbot— vale para una casa sin código nuevo. El
listado pinta una tarjeta de estadísticas con los mismos números que el dashboard, y cada fila
lleva a la edición completa en `/dashboard/catalogo?edit=<id>`.

**Filtros del listado:** texto (nombre/descripción), operación, estado, tipo de inmueble,
ciudad, precio mínimo/máximo, habitaciones mínimas, superficie mínima y «solo destacadas».
Se aplican **en memoria** tras traer todos los inmuebles activos de la cuenta (§11).

---

## 7. Flujo C — Salida a portales (exportación y sincronización)

| Formato | Ruta | Contenido |
| --- | --- | --- |
| Idealista (XML) | `GET /api/real-estate/export?format=xml` | `idealista:feed` con `info` (empresa, email, fecha, nº de inmuebles) y un bloque `property` por inmueble |
| Fotocasa (CSV) | `GET /api/real-estate/export?format=csv` | 29 columnas separadas por `;`, con `FotoURLs` y `Tags` unidos por `\|` |
| MLS (JSON) | `GET /api/real-estate/export?format=json` | Feed JSON para MLS internacional |
| Sincronización | `GET /api/real-estate/sync` (feed completo) · `POST /api/real-estate/sync` (`{ previousIds }` → delta `{ added, updated, removed, total, lastSyncAt }`) | Canal incremental para integradores |

Los tres formatos (y el delta) se generan con el **mismo** `getProperties()`, de modo que un
inmueble no puede salir en un formato y desaparecer en otro.

**Verificado el 2026-09-29 sobre la cuenta de demostración:** el feed XML descargado con la
sesión real declara `totalProperties = 11` de los 12 inmuebles de la cuenta. No es un error de
recuento: `getProperties()` filtra por defecto `status = 'disponible'` y el duodécimo inmueble
(«Ático con terraza en la Condesa») está en estado `reservada`. **La exportación excluye todo lo
que no esté disponible**, y hoy no hay parámetro en la ruta interna para pedir otro estado
(el endpoint acepta `?status=`, pero el botón de la interfaz no lo usa).

Y una consecuencia de negocio visible en el propio feed: los inmuebles están en **MXN** (dato
por ítem) mientras la cuenta declara **EUR**. Cada línea del XML lleva su `<currency>MXN</currency>`
correctamente, pero los promedios del panel (§12) se escriben en la divisa de la cuenta. Los
dos orígenes de divisa —el ítem y la cuenta— no están conciliados.

---

## 8. Flujo D — Captación, comisión y franquicia

```
Captación (contrato con el propietario)
  ├── tipoCaptacion: exclusiva | compartida | mandato
  ├── estado: borrador → activa → (vencida | cerrada | cancelada)
  ├── fechas: inicio, fin, firma, vencimiento, cancelación
  ├── economía: precioOferta, precioMinimo, comisionPorcentaje o comisionFija,
  │             comisionMoneda, condiciones, condiciones de pago
  └── documento: documentoUrl + documentoHash
        └── (auditHash / chainedHash / sealedAt / signatureAudit: columnas sin uso, §2.1)

Operación cerrada (Deal)
  └── calculateCommission(regla, valor, moneda)
        ├── porcentaje_venta        → valor × %
        ├── porcentaje_comision     → valor × %
        ├── monto_fijo              → importe fijo
        ├── escalonada              → tramos desde/hasta con su % propio
        └── suscripcion_mensual     → cuota mensual (sin split: va entera a la franquicia)
              └── split agente / agencia (%)
                    └── Comision (estado pendiente → aprobada → pagada)
                          └── referencia de pago y notas al liquidar

Franquicia (Tenant.parentId)
  └── getFranchiseGlobalStats() + getFranchiseCommissionSummary(includeChildren)
        · inmuebles, deals activos, leads del portal y comisiones sumados
          de la central y de todas sus oficinas hijas
        · desglose por oficina: total, pendiente y pagado
        · getCommissionByAgent() para el ranking por agente
```

El panel de comisiones se dibuja **solo si hay comisiones**: el dashboard oculta la sección de
franquicia cuando la lista viene vacía (§12).

---

## 9. Flujo E — Puesta en marcha del módulo

`POST /api/configuracion/real-estate/setup` → `seedRealEstateModule(tenantId)`:

1. **Etapas del pipeline** — crea las 6 etapas con `categoria = 'real_estate'` solo si la cuenta
   no tiene ninguna (idempotente por recuento).
2. **Automatizaciones base** — «Bienvenida a nuevo lead inmobiliario» (condición
   `source = portal_inmobiliario` → tarea de llamada en 2 h con prioridad alta) y «Recordatorio
   de visita» (24 h antes, con retardo de 23 h).
3. **Preset de campos** — el seed **no crea campos**: solo deja un aviso de que el preset se aplica
   desde el endpoint de definiciones de campo. Los 21 campos de la cuenta de demostración los
   sembró su propio script (`scripts/seed-demo-real-estate.ts`).

Tras sembrar, la ruta escribe dos marcas en la configuración de la cuenta:
`fieldPresetApplied = true` y `pipelineStagesCreated = true`. **La primera se escribe aunque no se
haya creado ningún campo**, y `automationTemplatesCreated` —la tercera marca que lee la pantalla—
**no se escribe nunca**: el componente «Automatizaciones» aparece «Pendiente» para siempre.

La pantalla de Configuración marca tres componentes (`Preset de Campos`, `Pipeline Stages`,
`Automatizaciones`) como «Listo»/«Pendiente» y avisa cuando el setup está incompleto. Como las
marcas solo las escribe el setup, una cuenta configurada por seed —todos los datos reales— sigue
viendo los tres en «Pendiente».

---

## 10. Tests

Cinco ficheros bajo `tests/` con prefijo `real-estate-` — **85 pruebas, todas en verde**
(ejecutadas el 2026-09-29):

| Fichero | Qué cubre |
| --- | --- |
| `real-estate-api.test.ts` | Rutas de propiedades y contrato de la API |
| `real-estate-property-helpers.test.ts` | `parseInmueble`, filtros y estadísticas |
| `real-estate-commission-calculator.test.ts` | Tipos de comisión, tramos y splits |
| `real-estate-consult.test.ts` | Consulta IA sobre propiedades |
| `real-estate-intents.test.ts` | Reconocimiento de intenciones inmobiliarias |

No hay pruebas de aislamiento multi-tenant ni de las rutas de captaciones, exportación o
franquicia: la cobertura está en las piezas puras y en el camino principal de inmuebles.

---

## 11. Qué falta

### A. Deuda detectada en esta revisión

| # | Qué falta |
| --- | --- |
| 1 | **No hay interfaz de captaciones.** Existen `Captacion`, `lib/real-estate/captacion-helpers.ts` y tres rutas de API, pero **ninguna página** las muestra o las crea: la funcionalidad solo es alcanzable por API. El contrato con el propietario —la pieza que sostiene la exclusividad— no se puede firmar ni consultar desde el panel |
| 2 | **La captación no tiene sello de integridad.** `auditHash`, `chainedHash`, `sealedAt` y `signatureAudit` están en la tabla y vacíos: el mismo patrón de cadena que ya protege contratos, nóminas y stock no se aplicó aquí (§2.1) |
| 3 | **El dashboard inmobiliario no está enlazado.** No hay entrada de menú ni enlace: solo se llega por URL. La única entrada del módulo es la Configuración |
| 4 | **Los promedios del dashboard ignoran la divisa del ítem.** `getPropertyStats()` promedia `precioBase` de todos los inmuebles —ventas de 7,5 M junto a alquileres de 1 850— y `dashboard-stats` devuelve la divisa de la **cuenta**; el panel escribe el resultado con ella. En la demo: «Precio Promedio 3.451.233 €» y «13.524 €/m²» sobre inmuebles valorados en MXN (§12) |
| 5 | **El pipeline de ventas escribe en MXN fijo.** `app/dashboard/pipeline/page.tsx` formatea los KPI con `currency: string = 'MXN'` y locale `es-MX`, así que el «Valor Total» del pipeline aparece como `$66.050` en una cuenta en EUR (las filas de cada deal sí usan la divisa del deal) |
| 6 | **`getProperties()` filtra en memoria.** Trae todos los inmuebles activos de la cuenta sin `skip`/`take` y luego filtra y pagina en JavaScript: la paginación del listado no ahorra una sola fila leída |
| 7 | **Sin índices GIN sobre `customFieldValues`.** El portal público, el listado y la exportación filtran por rutas JSONB (`zona`, `tipo_operacion`, `tipo_inmueble`) y `catalogo_items` solo tiene índices btree (`tenantId`, `tipo`, `activo`, `sku`). El plan inmobiliario lo daba por hecho, y en producción no existe |
| 8 | **Tres listas de campos del inmueble** (§2.2): preset (38), seed del módulo y seed de la demo (21 activos). Un inmueble creado desde el preset y otro desde el seed de la demo no comparten vocabulario |
| 9 | **`Portal Público` del dashboard apunta mal.** El botón enlaza a `/p/propiedades`, que no resuelve a ninguna cuenta (el slug configurado es `realestate` y el subdominio `demo-real-estate`); debería ser `/p/<slug>/propiedades` |
| 10 | **«Leads (Portal)» y «Visitas Agendadas» no cuentan lo que el producto cree.** Los leads del portal solo cuentan si la `fuente` es exactamente `portal_inmobiliario` (la demo tiene 5 leads por otras fuentes), y las visitas solo suman citas en estado `pendiente` con fecha futura o `completada`: una cita `confirmada` vinculada a un inmueble no aparece en ninguna de las dos |
| 11 | **La exportación solo saca lo disponible** y la interfaz no permite elegir estado (§7), aunque la ruta sí acepta el parámetro |
| 12 | **Comisiones y captaciones sin datos en producción** (§12): el panel de franquicia, el cálculo de comisión y el contrato de captación no tienen nada que mostrar en una demo |
| 13 | **El setup se declara hecho sin crear los campos.** Marca `fieldPresetApplied = true` sin haber creado un solo campo y **nunca** escribe `automationTemplatesCreated`, así que «Automatizaciones» aparece «Pendiente» para siempre. En la demo los tres componentes salen «Pendiente» con 21 campos y 13 etapas ya existentes: el indicador mide si se pulsó el botón, no si el módulo está configurado |
| 14 | **Tres intentos de migración sin cerrar** en `_prisma_migrations` (`20260915_certificado_entidad_ses`, `20260923120000_health_snapshots`, `20260923140000_sales_contest_editions`). Su esquema sí está aplicado —las tablas y columnas existen—, pero la tabla queda con filas a medias que estorban a la verificación automática |

### B. Fuera de alcance declarado del plan (no es deuda)

Sincronización bidireccional real con portales (hoy se exporta; la vuelta la resuelve el
integrador con el delta), firma electrónica del contrato de captación, valoración automática de
mercado con datos externos, y aplicación móvil de agentes.

---

## 12. Estado real en producción (medido el 2026-09-29, solo lectura)

Cuenta inspeccionada: **Demo Real Estate** (`demo-real-estate`, `demo-real-estate.volkern.app`),
la única con datos inmobiliarios reales en producción.

| Dato | Valor |
| --- | --- |
| Módulos habilitados de la cuenta | `crm`, `real-estate`, `leads`, `calendario` |
| Plan / sector | `profesional` · `BUSINESS` · sin central de franquicia (`parentId` vacío) |
| Inmuebles (`catalogo_items`, `tipo='inmueble'`) | **12** (11 disponibles, 1 reservada; 5 destacadas; 12 activos) |
| Por operación | 6 venta · 6 alquiler de temporada |
| Por tipo de inmueble | Casa, Departamento, Villa, Bungalow, Loft, Ático, Penthouse, Terreno |
| Divisa de los inmuebles | **MXN** en los 12 · divisa de la cuenta: **EUR** |
| Certificación energética cargada | 0 inmuebles con `certificacion_energetica` |
| Captaciones | **0** (la tabla está vacía en toda la plataforma) |
| Comisiones | **0** — el panel de franquicia no llega a dibujarse |
| Pipeline inmobiliario | 2 pipelines («Renta Vacacional (Airbnb/Booking)», 6 etapas; «Venta de Propiedades», 7 etapas) |
| Deals | 6 (4 en el pipeline vacacional: 66.050 en total; 2 operaciones de 9,2 M y 3,2 M) |
| Leads | 5 (referido, instagram, booking, airbnb, google) · **0 con `fuente = 'portal_inmobiliario'`** |
| Citas | 3 en la cuenta · **1 vinculada a un inmueble** (estado `confirmada`, que el dashboard no cuenta) |
| Contactos | 28 (incluye propietarios vinculados por `contactId`) |
| Campos del inmueble activos | 21 |
| Roles / usuarios de la cuenta | 8 roles · 3 usuarios |
| Configuración del portal | `portalSlug = realestate` · publicado · sin dominio propio |
| Migraciones cerradas | 106 (más 3 intentos sin cerrar, §11.13) |

Traducción de la tabla a lo que se ve en una demo: el dashboard enseña 12 propiedades, 5
destacadas y su distribución por operación y zona; el listado enseña los 12 inmuebles con sus
fotos; el pipeline vacacional enseña 4 oportunidades; y **la sección de comisiones, el panel de
franquicia y la captación no tienen nada que enseñar**, porque las tres tablas están a cero.

Los tres puntos ciegos tienen la misma causa: la captación no tiene interfaz (§11.1), y sin
captación no hay comisión, y sin comisión el panel de franquicia se oculta. Es la pieza que
falta para que el vertical inmobiliario enseñe su ciclo completo —captar, publicar, visitar,
cerrar, comisionar— y no solo su mitad comercial.

---

## 13. Criterios del plan inmobiliario frente al estado real

| Criterio | Estado |
| --- | --- |
| El inmueble es un ítem de catálogo, no una tabla paralela | cumplido (`CatalogoItem` + `customFieldValues`) |
| Los campos del inmueble son configurables por cuenta | cumplido (21 activos en la demo) |
| Franquicia soportada | cumplido en modelo y cálculo (`Tenant.parentId`, resumen consolidado); sin datos en producción |
| Pipeline inmobiliario de 6 etapas | cumplido (`setup-pipeline.ts`, sembrado con el setup) |
| Portal público con filtros y ficha | cumplido, con SEO y dominio propio opcional |
| Exportación a portales con formatos del sector | cumplido (Idealista XML, Fotocasa CSV, MLS JSON + delta) |
| IA sobre el catálogo (descripción, precio, recomendación, RAG) | cumplido (6 skills + consulta RAG) |
| Comisión por operación con splits y liquidación | cumplido en cálculo; sin datos y sin panel cuando no hay comisiones |
| Contrato de captación con exclusividad y comisión | modelo y API implementados; **sin interfaz y sin sello de integridad** |
| Aislamiento multi-tenant | aplicado por `withTenantAuth()` en toda la API interna; **sin test específico del módulo** |
| Índices GIN para los filtros JSONB del plan | **no aplicado** en producción |
