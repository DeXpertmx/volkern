# Volkern ERP — Sistema Operativo Empresarial

Plataforma modular de gestión empresarial (ERP + CRM) diseñada para agencias, franquicias inmobiliarias y emprendedores digitales en España y LATAM. Construida como un Sistema Operativo Empresarial donde todos los módulos comparten una base de datos única (Single Source of Truth).

🌐 **Sitio web:** [volkern.com](https://volkern.com)  
📖 **Documentación:** [`docs/`](docs/)

---

## 🚀 Módulos Principales

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| 🏠 **Inmobiliario** | ✅ Completo | Gestión de propiedades, franquicias, comisiones y portal público |
| 📊 **Ventas y Marketing (CRM)** | ✅ Activo | Leads, contactos, deals, cotizaciones, pipelines Kanban |
| 🏭 **Operaciones y ERP** | ✅ Activo | Contratos blindados, proyectos, inventario, producción |
| 💰 **Financiero y Fiscal** | ✅ Activo | Facturación Veri*Factu, contabilidad, cobranza, conciliación |
| 👥 **Recursos Humanos** | ✅ Activo | Expedientes, asistencia, nóminas con payroll sealing |
| 💬 **Omnicanal** | ✅ Activo | WhatsApp, email, web chat, Telegram, helpdesk |
| 📚 **Academia (LMS)** | ✅ Activo | Cursos, lecciones, evaluaciones, certificaciones |
| 🤖 **Gemma AI** | ✅ Activo | Asistente nativo con skills contextuales y auto-healing |

---

## 🏠 Módulo Inmobiliario

Sistema completo de gestión inmobiliaria con:

- **Catálogo de propiedades:** Campos extensibles vía JSONB (tipo, operación, ubicación, características)
- **Portal público embebible:** Listado y detalle de propiedades con filtros
- **Dashboard analítico:** KPIs, gráficos (Recharts), propiedades recientes
- **Widgets Puck CMS:** Componentes arrastrables para landing pages
- **Franquicias:** Gestión multi-tenant con jerarquía de agencias
- **Comisiones:** Cálculo automático con splits (agente/agencia/franquicia)
- **AI Consult:** Búsqueda en lenguaje natural con fallback inteligente

📘 [Documentación técnica completa](docs/REAL-ESTATE-MODULE.md) — Arquitectura, API, modelo de datos, diagramas Mermaid
📊 [Documentación comercial](docs/COMMERCIAL-REAL-ESTATE.md) — Propuesta de valor, pricing, casos de uso, competencia
📋 [Manual operativo](docs/OPERATIONAL-MANUAL-REAL-ESTATE.md) — Guía paso a paso para agentes, administradores y franquicias

---

## 🛠️ Stack Tecnológico

- **Frontend:** Next.js 14 + React 18 + TypeScript
- **Estilos:** Tailwind CSS + Shadcn/UI + Lucide icons
- **Base de Datos:** PostgreSQL + Prisma ORM
- **Autenticación:** NextAuth.js + API Keys
- **Pagos:** Stripe
- **Emails:** Resend (AWS SES retirado)
- **CMS:** @measured/puck (páginas editables)
- **Gráficos:** Recharts + Chart.js
- **Colas:** BullMQ + Redis
- **AI:** OpenAI + Gemma (local vía Opencode)
- **Testing:** Vitest + Supertest
- **Notificaciones:** Apprise (WhatsApp, Telegram, Slack)

---

## 📦 Instalación Rápida

### Requisitos

- Node.js 20 LTS (`>=20.19.0 <21`, ver `.nvmrc` y `engines`; el setup lo comprueba y avisa)
- PostgreSQL 15+ accesible (local o el que apunte tu `DATABASE_URL`; en
  producción es el Postgres del propio VPS)
- Redis 7+ (para colas; lo necesita la app en marcha, no el setup)
- Git
- npm (gestor del proyecto: hay `package-lock.json`; Yarn no es necesario)

### 1. Primer arranque — un solo comando

```bash
npm run setup
```

Encadena todo: preflight (Node/git) → dependencias (`npm install` solo si
falta `node_modules`) → cliente Prisma → base de datos (`db:setup`:
migraciones + tenant + seed + verificación). Es idempotente: en una máquina
ya lista termina en segundos.

**Punto de control la primera vez:** si no existe `.env`, lo crea desde
`.env.example` y **se detiene** — edita `.env` con tus credenciales (mínimo
`DATABASE_URL`; opcional `SHADOW_DATABASE_URL` para el chequeo de drift de
`db:verify`, y `NEXTAUTH_SECRET`/`NEXTAUTH_URL` para arrancar la app) y
relanza `npm run setup`. La lista completa de variables está en
`.env.example` y [la guía de deploy](docs/DEPLOY-GUIDE.md).

### 2. Alternativa manual (paso a paso)

```bash
npm install
npx prisma generate
npm run db:setup             # Migraciones + tenant + seed + verificación, de una vez
```

`db:setup` es idempotente (re-ejecutarlo es barato) y deja la base lista sin
memoria tribal. Para verificar sin escribir nada: `yarn db:verify`.
Si la base quedó en un estado roto (migraciones a medias, datos de prueba
inconsistentes) y quieres partir de limpio: `yarn db:reset` borra TODO el
esquema y los datos, y reconstruye con `db:setup`. Antes del drop crea un
volcado de seguridad `backup-db-<fecha>-<base>.sql` en la raíz del proyecto
(gitignorado; con pg_dump; si pg_dump no puede —p. ej. más viejo que el
servidor— exporta un JSON alternativo con Prisma). En interactivo se pregunta;
con `--force` se hace siempre y con `--sin-volcado` se omite a conciencia.
Pide escribir `RESET` para confirmar (con `--force` se salta la pregunta,
pensado para CI); **nunca** apuntarlo a producción.

> Desde el baseline de 2026-09-17 (ver `docs/PRISMA-BASELINE.md`) el proyecto
> usa el flujo oficial de migraciones: `migrate dev` en desarrollo y
> `migrate deploy` en entornos desplegados. `prisma db push` quedó obsoleto
> para la base principal.

### 4. Ejecutar

```bash
yarn dev
```

La aplicación estará disponible en `http://localhost:3000`

---

## 🔑 Credenciales por Defecto (Seed)

| Rol | Email | Password |
|-----|-------|----------|
| Superadmin | `bruno.hess@dimensionexpert.com` | `SEED_SUPERADMIN_PASSWORD` |
| Admin | `admin@volkern.com` | `SEED_ADMIN_PASSWORD` |
| Admin Test | `john@doe.com` | `SEED_TEST_USER_PASSWORD` |

Las contraseñas ya no están escritas en ningún sitio: el seed las lee del entorno
(`scripts/bootstrap-admin.env.example`) y aborta si faltan. Ver
docs/ROTACION-CREDENCIALES-ADMIN.md.

---

## 📁 Estructura del Proyecto

```
nextjs_space/
├── app/
│   ├── api/                  # API routes modulares
│   │   ├── real-estate/      #   Módulo inmobiliario
│   │   ├── erp/              #   ERP (proyectos, inventario)
│   │   ├── leads/            #   CRM (leads, contactos, deals)
│   │   └── ...               #   Otros módulos
│   ├── dashboard/            # Panel administrativo
│   ├── auth/                 # Autenticación
│   └── embed/               # Páginas embebibles (booking, portal)
├── components/               # Componentes React reutilizables
├── lib/                      # Utilidades, helpers, skills AI
│   ├── real-estate/          #   Helpers inmobiliarios
│   ├── skills/               #   Skills de Gemma AI
│   └── puck/                 #   Configuración de CMS
├── prisma/                   # Esquema + migraciones DB
├── scripts/                  # Scripts de utilidad (seed, backup, etc.)
└── tests/                    # Tests unitarios y de integración
```

---

## 📊 Tests

```bash
# Todos los tests
npx vitest run

# Solo módulo inmobiliario
npx vitest run tests/real-estate-*.test.ts

# Coverage
npx vitest run --coverage
```

Estado actual: **842+ tests, 50+ suites — 100% passing**  
Cobertura: **98.3% Statements**

---

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
| [Módulo Inmobiliario (Técnico)](docs/REAL-ESTATE-MODULE.md) | Arquitectura, API, modelo de datos, diagramas Mermaid, tests |
| [Inmobiliario (Comercial)](docs/COMMERCIAL-REAL-ESTATE.md) | Propuesta de valor, pricing, casos de uso, competencia, roadmap |
| [Inmobiliario (Manual)](docs/OPERATIONAL-MANUAL-REAL-ESTATE.md) | Guía operativa paso a paso para agentes y franquicias |
| [Módulos del Sistema](docs/VOLKERN-SYSTEM-MODULES.md) | Arquitectura de los 7 hubs |
| [Verticales y Estrategia Comercial](docs/COMMERCIAL-VERTICALS.md) | Verticales completas con estado real, matriz de hubs, prioridades de venta y pricing |
| [Hospitality (Comercial)](docs/COMMERCIAL-HOSPITALITY.md) | Pack comercial del PMS + Booking Engine: ICPs, competencia, argumentarios, FAQ y validación del precio en el piloto |
| [Hospitality (Resumen para dirección)](docs/hospitality-resumen-ejecutivo.md) | Una página: qué hace hoy, qué está probado y qué falta para arrancar |
| [Plan de Modularización](docs/MODULARIZATION_PLAN.md) | Optimización de build y monorepo |
| [Guía de Deploy](docs/DEPLOY-GUIDE.md) | VPS, Docker, migraciones |
| [Infraestructura VPS](docs/volkern-plan-infraestructura-vps.pdf) | Plan detallado de infraestructura |

---

## 🚀 Deploy

### Producción: VPS (Docker Swarm) — el camino que sirve `volkern.app`

> ⚠️ **No hay auto-deploy desde GitHub** a día de hoy. Cada release se
> despliega a mano con el pipeline de `deploy-vps/`: build local de las
> imágenes (app + migrator), migraciones contra el Postgres del VPS con capa
> de seguridad (puerta destructiva + backup previo), `service update` y
> smoke tests.

```bash
bash deploy-vps/deploy-local.sh   # build → migraciones → VPS → smokes
```

> El pipeline salta el build si solo cambió documentación/workflows/tests,
> y si solo cambiaron migraciones (`prisma/`) reconstruye solo el migrator
> sin reiniciar la app.

> ⚠️ **No uses `vercel deploy`**: el proyecto de Vercel sigue enlazado pero
> ya no sirve el dominio, y sus variables de producción aún apuntan a la
> base antigua (Neon). Desplegar ahí reabriría esa base sin querer
> (ver docs/AUDITORIA-NEON-Y-DESPLIEGUES.md, hallazgo H1).

📘 **Flujo de deploy, migraciones y troubleshooting:** [`docs/DEPLOY-GUIDE.md`](docs/DEPLOY-GUIDE.md)

---

## 🏢 Modelo Multi-Tenant por Subdominio

Cada tenant accede con su propio subdominio — `https://{subdomain}.volkern.app` — sin cambios de DNS ni de proxy por cliente. La cadena completa:

```text
https://dexpert.volkern.app
        ↓  DNS wildcard (Cloudflare)
Cloudflare edge (TLS: Universal SSL *.volkern.app)
        ↓  Full (strict)
Traefik router volkern_erp_tenant (VPS 62.171.134.195)
        ↓
Volkern ERP → lib/tenant-resolver.ts → Tenant.subdomain
```

### 1. DNS (Cloudflare, zona `volkern.app`)

| Registro | Valor | Proxy |
|----------|-------|-------|
| `A  *` | `62.171.134.195` | 🟠 Proxied |

- El wildcard dirige **cualquier** subdominio al VPS; los registros específicos existentes (`www`, `admin`, `table`, `s3`…) tienen prioridad sobre `*`.
- El certificado Universal SSL cubre `volkern.app` + `*.volkern.app` — no hace falta ACM ni Cloudflare for SaaS para subdominios propios.
- Los tenants con dominio externo propio sí requerirían Cloudflare for SaaS (no implementado).

### 2. Router Traefik (`deploy-vps/volkern-erp.yaml`)

```yaml
- "traefik.http.routers.volkern_erp_tenant.rule=HostRegexp(`{subdomain:[a-zA-Z0-9-]+}.volkern.app`)"
- "traefik.http.routers.volkern_erp_tenant.priority=10"   # por debajo de volkern.app / www / erp.dimension.expert (100)
- "traefik.http.routers.volkern_erp_tenant.entrypoints=websecure"
- "traefik.http.routers.volkern_erp_tenant.tls=true"
```

> ⚠️ **Sintaxis obligatoria**: usa placeholders v2 (`{subdomain:...}`). Una regex cruda tipo `^.+\.volkern\.app$` (a) rompe `docker stack deploy` por interpolación del `$` y (b) no matchea en el metarouter v2 de Traefik 2.11.
> ⚠️ **El router vive en las labels del servicio Swarm**: `deploy-app.sh` hace `docker service update --image` que **no aplica cambios de labels**. Tras editar el yaml hay que redesplegar el stack en el VPS (fuente de verdad: `/root/volkern-erp/volkern-erp.yaml`):
> ```bash
> cd /root/volkern-erp && docker stack deploy -c volkern-erp.yaml volkern-erp
> ```

### 3. Resolución del tenant en la app

| Capa | Archivo | Función |
|------|---------|---------|
| Resolver | `lib/tenant-resolver.ts` | Extrae el primer segmento del host y busca `Tenant.subdomain` (fallback: cookie `x-tenant-subdomain`, header de API key) |
| Subdominios reservados | `lib/tenant-middleware.ts` | `www`, `app`, `admin`, `auth`… no se tratan como tenants |
| Cookie de sesión | `lib/auth.ts` | `AUTH_COOKIE_DOMAIN=.volkern.app` → la sesión sirve en apex y todos los subdominios (cookies JWE de next-auth v4) |
| Validación cruzada | `lib/auth.ts authorize()` | Solo se puede iniciar sesión desde `{tenant}.volkern.app` con usuarios de ESE tenant; el mismatch se audita en `auditLog` como `LOGIN_FAILURE` |
| Callback de redirect | `lib/auth.ts redirect()` | Solo acepta rutas relativas y orígenes `*.volkern.app` |

> Nota: el redirect a login de usuarios sin sesión conserva el subdominio actual (derivado de `host`/`x-forwarded-host`, con fallback al apex canónico para hosts internos o desconocidos) — ver `middleware.ts`. Tras autenticarse, la sesión (dominio `.volkern.app`) sirve en todos los subdominios.

### 4. URLs públicas por tenant

- **Booking:** `https://{subdomain}.volkern.app/booking/{bookingSlug}`
- **Tarjeta digital:** `https://{subdomain}.volkern.app/tarjeta/{urlUnica}` (el QR incluye su booking relativo)

Las lookups públicos (`/api/public/users/[slug]`, `/api/tarjetas-digitales/public/[cardId]`, `/api/tarjetas-digitales/connect`) resuelven **por tenant primero y con fallback global** (`lib/public-slug-lookup.ts`): si la request viene de `{subdomain}.volkern.app` buscan dentro de ese tenant y, si no encuentran, resuelven global para que los QRs ya impresos sigan funcionando. Consecuencia: `bookingSlug` y `urlUnica` son únicos POR TENANT (`@@unique([tenantId, slug])`, migración `20260828110000_tenant_scoped_slugs`) — dos tenants pueden usar el mismo slug sin conflicto y sin fuga de datos.

### 5. Alta de un tenant nuevo

No hay que tocar DNS ni Traefik: basta crear el tenant con su `subdomain` (slug) en la BD y el subdominio funciona automáticamente. Verificación rápida:

```bash
dig +short {subdomain}.volkern.app          # IPs de Cloudflare (proxied)
curl -I https://{subdomain}.volkern.app      # 200/307/302 — nunca 404 "page not found" de Traefik
```

Además existe un E2E automatizado del flujo completo (crea usuario temporal, loguea por el subdominio, verifica dashboard y limpia):

```bash
npm run test:e2e:login                       # por defecto contra dexpert.volkern.app
E2E_BASE_URL=https://otro.volkern.app E2E_TENANT=otro npm run test:e2e:login
```

---

## 🔧 Comandos Útiles

```bash
# Desarrollo
yarn dev                    # Servidor de desarrollo
yarn build                  # Build de producción
yarn start                  # Servidor de producción

# Base de datos
yarn prisma studio          # Explorador visual de BD
yarn db:setup               # Migraciones + tenant + seed + verificación (idempotente)
npm run setup               # Primer arranque completo: install + env + prisma + db:setup
yarn db:verify              # Solo verificación, sin escribir
yarn db:reset               # BORRA todo y reconstruye desde cero (pide confirmación)
yarn prisma migrate dev     # Genera y aplica una migración (desarrollo)
yarn prisma migrate deploy  # Aplica migraciones pendientes (deploy)
yarn prisma db seed         # Seed de datos
yarn prisma generate        # Generar cliente

# Testing
npx vitest run              # Todos los tests
npx vitest run --coverage   # Con coverage
npm run test:e2e:booking    # Ensayo E2E del booking engine: arranca next dev, publica una
                            # propiedad de prueba, reserva por la API pública y verifica
                            # que la reserva entra en el planning (docs/hospitality-booking-engine-e2e.md)
npm run test:e2e:noshow     # Ensayo E2E del no-show: con el proveedor de conectividad
                            # simulado, comprueba que la unidad vuelve a venderse y que la
                            # disponibilidad empujada al canal sube (docs/hospitality-no-show-e2e.md)
                            # · Guía para el emisor de eventos (respuestas y reintentos del
                            #   webhook, incl. no_show): docs/hospitality-webhook-emisor-guia.md

# Lint y tipo
yarn lint                   # ESLint
yarn typecheck              # TypeScript check
```

---

## 🌐 Endpoints API Principales

### Inmobiliarios
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/real-estate/dashboard-stats` | Estadísticas del dashboard |
| GET | `/api/real-estate/franchise/overview` | Vista general de franquicia |
| GET | `/api/real-estate/franchise/commissions` | Comisiones de agentes |
| GET | `/api/real-estate/export` | Exportación CSV |
| POST | `/api/ai/real-estate/consult` | Consulta AI en lenguaje natural |
| GET | `/api/public/real-estate/properties` | Portal público — listado con filtros y paginación |
| GET | `/api/public/real-estate/properties/[id]` | Portal público — detalle con vistas |
| POST | `/api/public/real-estate/contact` | Portal público — formulario de contacto |

### CRM
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/leads` | Listar leads |
| POST | `/api/leads` | Crear lead |
| GET | `/api/contacts` | Listar contactos |
| GET | `/api/deals` | Listar deals (oportunidades) |
| GET | `/api/cotizaciones` | Listar cotizaciones |

### ERP
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/erp/projects` | Listar proyectos |
| POST | `/api/erp/projects` | Crear proyecto |
| PATCH | `/api/erp/projects/[id]` | Actualizar proyecto |
| DELETE | `/api/erp/projects/[id]` | Eliminar proyecto |

---

## 🤖 Gemma AI

Volkern incluye un asistente nativo de IA (Gemma) que:

- Entiende el contexto del negocio
- Redacta correos y mensajes
- Responde dudas financieras y operativas
- Interactúa transversalmente mediante **Skills** integrados
- Se auto-diagnostica cada 5 minutos (AIOps)

---

## 📄 Licencia

Este proyecto está bajo licencia privada — uso exclusivo del equipo Volkern.

## 🤝 Soporte

- 📖 Documentación: [`docs/`](docs/)
- 🐛 Issues: Repositorio interno
- 📧 Email: support@volkern.com

---

*Volkern — Tu Sistema Operativo Empresarial*
