# 🎬 Guion y accesos de la demo — Dimension eXpert (cliente renta vacacional)

> **Última actualización:** 2026-09-03 · **Entorno:** producción (`volkern.app`, VPS `62.171.134.195`)
> ⚠️ Este documento refleja el **estado tras el intercambio de slugs** entre los workspaces
> `dexpert` y `dimension-expert`. Las URLs/credenciales anteriores a ese cambio **ya no valen**.

---

## 1. Mapa de workspaces (estado actual en producción)

| Workspace | Empresa / rol | Slug · subdominio | URL de acceso |
|---|---|---|---|
| **Dimension eXpert** | Bruno Hess + Admin (la empresa que presenta) | `dexpert` | `https://dexpert.volkern.app` |
| **DeXpert Inmobiliaria** | El cliente (datos reales: 14 leads, 24 contactos, 2 deals, 5 propiedades, 16 citas) | `dimension-expert` | `https://dimension-expert.volkern.app` |
| **Demo Real Estate** | Demo sintética de bienes raíces (Airbnb/Booking) | `demo-real-estate` | `https://demo-real-estate.volkern.app` |

> 💡 **Antes vs. después del intercambio de slugs (2026-09-03):**
>
> | Slug/subdominio | ANTES | DESPUÉS |
> |---|---|---|
> | `dexpert.volkern.app` | DeXpert Inmobiliaria (datos del cliente) | **Dimension eXpert** (Bruno + Admin) |
> | `dimension-expert.volkern.app` | Dimension eXpert (Bruno + Admin) | **DeXpert Inmobiliaria** (datos del cliente) |

---

## 2. Credenciales de acceso

### 🏢 DeXpert Inmobiliaria — el cliente (entrar por `dimension-expert.volkern.app`)

| Rol | Email | Contraseña |
|---|---|---|
| **Admin (principal)** | `dximobilia@dimensionexpert.com` | `SXqvhCDd_Qm5` ⚠️ provisional — cambiar antes de compartir con el cliente |
| Admin (legado, en desuso) | `direccion@dexpert.volkern.app` | `Dexpert123!` (cuenta antigua, pendiente de eliminar) |

### 🏢 Dimension eXpert — Bruno / la empresa que presenta (entrar por `dexpert.volkern.app`)

| Rol | Email | Contraseña |
|---|---|---|
| **Admin** | `admin@dexpert.volkern.app` | `Dexpert123!` |
| Propietario | `bruno.hess@dimensionexpert.com` | 🔒 Contraseña propia del usuario (se cambió tras el reset del 03/09 — **no** usar la antigua `DimensionExpert2024!`) |

### 🏢 Demo Real Estate — demo sintética (entrar por `demo-real-estate.volkern.app`)

| Rol | Email | Contraseña |
|---|---|---|
| Directora | `admin@demorealestate.com` | `DemoRE2026!` |
| Ejecutivo | `agente@demorealestate.com` | `DemoRE2026!` |

---

## 3. Qué mostrar en cada workspace

1. **Dimension eXpert** (`dexpert.volkern.app`) — sesión `admin@dexpert.volkern.app`
   - Workspace con **logo y nombre reales** de Dimension eXpert (Configuración → Identidad Visual).
   - Sirve como cabecera de la presentación: quién presenta y con qué marca.
2. **DeXpert Inmobiliaria** (`dimension-expert.volkern.app`) — sesión `dximobilia@dimensionexpert.com`
   - **Datos del cliente**: 14 leads, 24 contactos, 2 deals, 5 propiedades en catálogo, 16 citas, tareas.
   - Es el workspace con el que el cliente se ve trabajando en el día a día.
3. **Demo Real Estate** (`demo-real-estate.volkern.app`) — sesión de directora/ejecutivo
   - **Demo de bienes raíces / renta vacacional** (estilo Airbnb/Booking): 12 propiedades
     (6 renta vacacional + 6 venta), pipelines "Renta Vacacional" y "Venta de Propiedades",
     5 leads, 6 oportunidades, citas/tareas/notas, marca blanca habilitada.

---

## 4. Notas operativas

- **Entrar siempre por el subdominio nuevo** de cada workspace. Las sesiones abiertas antes del
  intercambio deben volver a iniciar sesión.
- `dimension-expert.volkern.app` ya **no** es el workspace de Bruno → apunta al cliente.
- `dexpert.volkern.app` ya **no** contiene los datos del cliente → es el workspace de Dimension eXpert.
- Los emails tipo `*@dexpert.volkern.app` son internos de la plataforma (no buzones reales);
  los accesos "reales" del cliente van con `@dimensionexpert.com` (p. ej. `dximobilia@…`).

## 5. Referencia de la operación (para soporte)

- **Backup previo (VPS):** `/root/backups/pre-swap-expert-slugs-20260903-185958.sql`
- **Script aplicado (idempotente):** `nextjs_space/scripts/production-swap-expert-slugs.sql`
- **Creada en el swap:** `dximobilia@dimensionexpert.com` (bcrypt 10 rondas, password provisional en §2)
- El intercambio solo cambió `slug` + `subdomain` de los tenants; **no** movió usuarios ni datos.
