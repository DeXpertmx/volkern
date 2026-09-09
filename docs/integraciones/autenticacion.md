# 01 · Autenticación y API Keys

Toda la API de integración se protege con **API keys** que se generan dentro del
panel de cada cuenta (tenant). Una clave identifica de forma inequívoca al tenant y
al usuario que la creó: **no es necesario (ni posible) indicar el tenant en cada
llamada**.

---

## 1. Crear una API key

1. Inicia sesión en `https://volkern.app` con un usuario administrador del tenant.
2. Ve a **Configuración → API Keys** (ruta: `/dashboard/configuracion/api-keys`).
3. Pulsa **Crear API key** e indica:
   - **Nombre** (obligatorio). Ej.: `integracion-anytimebot`.
   - **Descripción** (opcional).
   - **Scopes** (al menos uno). Marca solo lo que la integración necesita.
   - **Expiración** (opcional): fecha tras la cual la clave deja de funcionar.
4. **Copia la clave en ese instante.** Solo se muestra una vez en la creación; en el
   listado solo se conserva el prefijo, los scopes y las estadísticas de uso.

Formato de la clave:

```text
vk_prod_<64 caracteres hexadecimales>
vk_live_<64 caracteres hexadecimales>   (equivalente, mismo comportamiento)
```

El prefijo visible en el panel es `vk_prod_` + los 8 primeros caracteres del cuerpo
(útil para identificar la clave sin exponerla).

---

## 2. Enviar la clave en las llamadas

Cualquiera de estas dos cabeceras es válida:

```http
X-API-Key: vk_prod_...
```

```http
Authorization: Bearer vk_prod_...
```

Ejemplo con cURL:

```bash
curl https://volkern.app/api/leads \
  -H "X-API-Key: vk_prod_tu_clave_aqui"
```

Si la clave falta, tiene un formato inválido, está desactivada o caducó, el servidor
responde:

```json
HTTP 401
{ "error": "API key inválida o inactiva" }
```

Otros mensajes posibles de `401`: `API key no proporcionada`,
`Formato de API key inválido`, `API key expirada`, `Sesión inválida o expirada`.

---

## 3. Scopes disponibles

Los scopes se evalúan contra la clave. Si un endpoint requiere un scope que la clave
no tiene, responde `401` indicando los scopes requeridos:

```json
HTTP 401
{ "error": "Permisos insuficientes (deals:write, leads:write)" }
```

> Nota: además del scope, algunas operaciones comprueban el **permiso de rol** del
> usuario que creó la clave (p. ej. crear deals requiere permiso `leads:crear` en el
> rol). Si el usuario no tiene ese permiso, responde `403 Sin permiso ...`.

### Módulo CRM / ventas

| Scope | Acceso |
|---|---|
| `leads:read` | Leer leads y sus subrecursos |
| `leads:write` | Crear/actualizar leads |
| `leads:delete` | Eliminar leads |
| `contacts:read` | Leer contactos |
| `contacts:write` | Crear/actualizar contactos |
| `contacts:delete` | Eliminar contactos |
| `deals:read` | Leer deals y pipeline |
| `deals:write` | Crear/actualizar deals |
| `deals:delete` | Eliminar deals |
| `citas:read` / `appointments:read` | Leer citas y disponibilidad |
| `citas:write` / `citas:create` / `appointments:write` | Crear/actualizar citas |
| `citas:delete` / `appointments:delete` | Cancelar/eliminar citas |

### Tareas y automatización

| Scope | Acceso |
|---|---|
| `tasks:read` | Leer tareas |
| `tasks:write` | Crear/actualizar tareas |
| `tasks:delete` | Eliminar tareas |
| `automations:read` / `automations:write` / `automations:delete` | Automatizaciones |

### Mensajería y comunicaciones

| Scope | Acceso |
|---|---|
| `messages:read` / `messages:write` | Mensajes |
| `messaging:read` / `messaging:write` / `messaging:send` | Mensajería (WhatsApp, Telegram…) |
| `telephony:read` / `telephony:write` / `telephony:calls` | Telefonía / llamadas |
| `campaigns:read` / `campaigns:write` | Campañas |
| `social:read` / `social:write` / `social:publish` | Redes sociales |

### Calendario y agenda

| Scope | Acceso |
|---|---|
| `calendar:read` / `calendar:write` / `calendar:webhook` | Calendarios conectados |

### Facturación, inventario y ERP

| Scope | Acceso |
|---|---|
| `invoices:read` / `invoices:write` / `invoices:create` | Facturas |
| `billing:read` / `billing:write` | Facturación / pagos |
| `inventory:read` / `inventory:write` / `inventory:adjust` | Inventario / catálogo |
| `accounting:read` / `accounting:write` | Contabilidad |
| `production:read` / `production:write` | Producción (ERP) |
| `payroll:read` / `payroll:write` | Nóminas (lectura) |

### Otros

| Scope | Acceso |
|---|---|
| `analytics:read` | Métricas y analítica |
| `webhooks:read` / `webhooks:write` / `webhooks:delete` | Webhooks |
| `projects:read` / `projects:write` | Proyectos |
| `hr:read` / `hr:write` | RRHH |
| `mcp:read` / `mcp:execute` / `mcp:admin` | Servidor MCP |
| `agent:skill` | Skills del agente |
| `n8n:read` / `n8n:write` / `n8n:execute` | n8n |
| `config:read` / `config:write` | Configuración general |
| `insurance:read` / `insurance:write` | Seguros |
| `audit:read` | Registros de auditoría (solo partner, ver abajo) |

> Scopes con `audit:*`, `partners:*`, `attendance:*`, `employees:*`, `payroll:run`
> corresponden a la **API Partner** (`/api/v1/partner/*`), un contrato SaaS-a-SaaS
> restringido que solo se habilita por contrato; no se usan en la integración
> estándar descrita en esta guía.

### Módulos recientes (ampliación del catálogo)

El catálogo se amplió para cubrir los scopes que ya exigían los endpoints de los
módulos más nuevos, de modo que una clave pueda conceder acceso a ellos:

| Scope | Módulo / uso |
|---|---|
| `catalogo:read` / `catalogo:write` | Catálogo de productos/servicios (incl. importar/exportar y campos personalizados) |
| `insurance:read` / `insurance:write` | Módulo de seguros (productos, aseguradoras, pólizas, renovaciones, cartera) |
| `contratos:read` / `contratos:write` / `contratos:delete` | Contratos, envío y firma (Volkern Sign). Además existe el alias histórico `contracts:write` (usado en `/api/contratos/from-cotizacion`) |
| `cotizaciones:read` / `cotizaciones:write` | Cotizaciones |
| `quotes:read` / `quotes:write` | Alias históricos de cotizaciones usados por rutas antiguas |
| `orders:read` / `orders:write` | Órdenes de venta (crear, facturar) |
| `invoices:send` | Envío de facturas por email |
| `services:read` / `services:write` | Servicios (agenda) |
| `servicios:read` / `servicios:write` | Alias históricos del módulo de servicios |
| `chatbot:read` | Búsqueda en catálogo desde el chatbot |
| `config:read` / `config:write` | Configuración del tenant (fiscal, moneda, disponibilidad, email…) |
| `settings:read` / `settings:write` | Alias de configuración general |
| `configuracion:editar` | Edición de configuración (p. ej. etapas de pipeline) |
| `subscriptions:read` / `subscriptions:write` | Límites, uso y suscripción del propio tenant |
| `knowledge:read` / `knowledge:write` | Base de conocimiento y guía contextual |
| `team:read` / `team:write` | Equipo / usuarios del tenant |
| `conversations:read` / `conversations:write` / `conversations:delete` | Conversaciones de mensajería |
| `skills:execute` / `skills:write` | Skills del agente |
| `leads:update` | Alias de actualización de leads (junto a `leads:write`) |
| `tasks:create` | Alias de creación de tareas (junto a `tasks:write`) |
| `dashboard:read` / `conversion:read` | Métricas del dashboard y conversión |
| `marketing:read` / `sales:read` | Analítica de campañas y señales de venta |
| `finanzas:read` | Snapshot y alertas de estrategia financiera |
| `cms:read` / `cms:write` | Páginas y contenido (CMS) del tenant |
| `erp:read` / `erp:write` | Módulos ERP (RRHH, proveedores, producción) |
| `ads:read` / `ads:write` / `ads:manage` / `ads:admin` | Módulo de publicidad (campañas, plataformas, watchdog) |

Notas importantes:

- **Ampliar el catálogo no rompe claves existentes**: cada clave guarda su propia
  lista de scopes. Las claves creadas antes de la ampliación siguen funcionando tal
  cual; solo las claves **nuevas** pueden incluir estos scopes.
- Para conectar un módulo reciente necesitas **crear una clave nueva** (o regenerar)
  marcando los scopes de ese módulo.
- Los scopes `admin:read` y `admin:write` (área de plataforma / Superadmin) **no**
  están en el catálogo: no se conceden a claves de tenant.

---

## 4. Ciclo de vida y estadísticas

En **Configuración → API Keys** puedes ver por cada clave:

- `id` (cuid interno), `nombre`, `descripcion`.
- `prefix` (identificador público de la clave).
- `scopes`, `activo`, `expiraEn`.
- `ultimoUso` (fecha) y `totalUsos` (contador de llamadas autenticadas).

Desde el panel puedes:

- **Desactivar/reactivar** una clave (sin borrarla).
- **Eliminar** una clave (deja de ser válida inmediatamente).
- **Rotar**: elimina la clave antigua y crea una nueva con el mismo nombre/scopes.

Toda creación/borrado queda registrada en el registro de auditoría de la cuenta.

> La gestión programática de claves (`/api/api-keys`) exige sesión de administrador;
> una API key **no puede** crear, listar ni borrar otras claves (por diseño de
> seguridad). Las claves se gestionan desde el panel.

---

## 5. Aislamiento por tenant y reglas de oro

- Cada clave pertenece a **un único tenant** y solo puede acceder a los datos de ese
  tenant.
- Los permisos efectivos son: **scopes de la clave** + **permisos de rol** del
  usuario que la creó.
- Los listados respetan el aislamiento por rol: si el rol del usuario es de tipo
  agente/comercial con visibilidad restringida (`canOnlySeeOwnLeads`), solo verá sus
  propios leads/deals asignados.
- Si la clave es de una cuenta **agencia**, puede operar sobre sus subcuentas (slots)
  enviando la cabecera `X-Impersonate-Tenant-Id: <id del slot>`; el resto de cuentas
  no puede cruzar tenants (se responde `403 Violación de jerarquía`).

---

## 6. Ejemplo completo de una llamada autenticada

```bash
curl -X POST https://volkern.app/api/leads \
  -H "X-API-Key: vk_prod_tu_clave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "María López",
    "email": "maria@ejemplo.com",
    "telefono": "+34 611 222 333",
    "fuente": "integracion-api",
    "canal": "web"
  }'
```

Respuesta esperada (`200 OK`): el objeto del lead creado o actualizado con su `id`,
`estado` (por defecto `nuevo`) y `tokenPublico`, entre otros campos.
