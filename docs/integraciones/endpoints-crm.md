# 02 · Endpoints del CRM

Todos los endpoints de este documento viven bajo la raíz:

```text
https://volkern.app/api
```

y requieren una API key con los scopes indicados (ver
[autenticación](autenticacion.md)).

**Convenciones de respuesta.** Cada recurso devuelve el cuerpo en el formato nativo
del endpoint (la mayoría devuelve directamente el/los objetos en JSON; `deals` y
`pipeline/stages` envuelven en `{ deals, metrics }` y `{ stages }`). **Confía en el
código de estado HTTP y en el campo `error`, no en la forma del JSON**, porque hay
endpoints históricos con envolturas distintas. La validación de cuerpo es estricta:
los campos no declarados en el esquema se **ignoran** (no fallan) y los tipos
incorrectos devuelven `400` con detalle por campo.

---

## 1. Leads

### Listar leads — `GET /api/leads` · scope `leads:read`

Devuelve un **array** de leads con sus citas (`citas[]` con `servicio`), el usuario
asignado (`asignadoUsuario`) y el scoring (`score`), ordenados por
`fechaCreacion` descendente.

Parámetros de consulta (todos opcionales):

| Parámetro | Descripción |
|---|---|
| `search` / `q` | Busca en nombre, email, teléfono o empresa (insensible a mayúsculas) |
| `estado` / `etapa` | Filtra por estado del lead. `all`/`todos` = sin filtro |
| `empresa` | Filtro por empresa (parcial, insensible) |
| `assignedToMe=true` | Solo leads asignados al usuario de la clave |
| `unassigned=true` | Solo leads sin asignar |
| `fechaDesde` / `fechaHasta` | Rango por `fechaCreacion`, formato `YYYY-MM-DD` (se interpreta en UTC) |

### Crear un lead — `POST /api/leads` · scope `leads:write`

**Deduplicación:** si ya existe un lead con el mismo `email` (o, si no hay email, con
el mismo `telefono`), el lead existente se **actualiza** con los campos enviados y se
devuelve ese lead actualizado. Si `notas` incluye texto, además se crea una nota
asociada.

Cuerpo (validado con Zod):

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `nombre` | string (≤255) | ✅ | |
| `email` | email (≤255) | — | Clave de deduplicación |
| `telefono` | string (≤30) | — | Clave de deduplicación si no hay email |
| `empresa` | string (≤255) | — | |
| `cargo` | string (≤255) | — | |
| `ubicacion`, `direccion`, `ciudad` | string | — | |
| `codigoPostal` | string (≤20) | — | |
| `pais` | string (≤100) | — | |
| `linkedin` | URL válida | — | |
| `notas` | string (≤10000) | — | Crea una nota en el lead |
| `fuente` | string (≤100) | — | P. ej. `integracion-api` |
| `canal` | enum | — | `web`, `referido`, `whatsapp`, `telefono`, `email`, `linkedin`, `redes_sociales`, `evento`, `otro` |
| `etapa` | string (≤50) | — | Se guarda como `estado` del lead |
| `scoreValue` | número entero | — | |
| `contextoProyecto` | string (≤5000) | — | |
| `metadataExterna` | objeto JSON | — | Metadatos libres del integrador |
| `tags` | string (≤500) | — | Separados por comas si son varios |

Efectos adicionales de la creación: asignación automática inteligente (si está
configurada), recálculo de scoring, disparo de la automatización `nuevo_lead` y
notificaciones (email/Telegram) al equipo.

### Un lead — `GET /api/leads/[id]` · scope `leads:read`

### Actualizar — `PATCH /api/leads/[id]` · scope `leads:write` (o `leads:update`)

Mismos campos que la creación, todos opcionales.

### Eliminar — `DELETE /api/leads/[id]` · scope `leads:delete`

### Subrecursos de un lead (rutas bajo `/api/leads/[id]/…`)

| Ruta | Métodos | Scopes | Uso |
|---|---|---|---|
| `/notes` | GET, POST | `leads:read` / `leads:write` | Notas (`contenido`) |
| `/interactions` | GET, POST | `leads:read` / `leads:write` | Interacciones (`tipo`, `contenido`) |
| `/tasks` | GET, POST | `leads:read`+`tasks:read` / `leads:write`+`tasks:write` | Tareas vinculadas |
| `/attachments` | GET, POST | `leads:read` / `leads:write` | Adjuntos |

Campos personalizados globales del tenant: `GET`/`POST` `/api/leads/custom-fields`
(scopes `leads:read` / `leads:write`).

---

## 2. Contactos

### Listar — `GET /api/contacts` · scope `contacts:read`

Devuelve un **array** de contactos (incluye `company`, `perfilFiscal` y contadores
`_count.deals` / `_count.persons`).

Parámetros:

| Parámetro | Descripción |
|---|---|
| `tipo` | `person` o `company` |
| `search` | Busca en nombre o email |
| `sinEmpresa=true` | Solo contactos sin empresa vinculada |

### Crear — `POST /api/contacts` · scope `contacts:write`

**Regla:** el `email` es único por tenant. Si ya existe, responde `400`:

```json
{ "success": false, "error": "Ya existe un contacto con este email" }
```

Cuerpo (esquema `ContactCreateSchema`):

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `nombre` | string (≤255) | ✅ | |
| `email` | email (≤255) | ✅ | Único por tenant |
| `telefono` | string (≤30) | — | |
| `tipo` | enum | — | `person` (defecto) o `company` |
| `companyId` | cuid | — | Si `tipo=person`, empresa padre |
| `cargo`, `ubicacion`, `direccion`, `ciudad`, `pais` | string | — | |
| `codigoPostal` | string (≤20) | — | |
| `linkedin` | URL | — | `""` o `null` se tratan como ausente |
| `notas` | string (≤10000) | — | |
| `tags` | string (≤500) | — | |

Para crear además el perfil fiscal del contacto, envía en el mismo cuerpo:

```json
{
  "createFiscalProfile": true,
  "fiscalProfileData": {
    "tipo": "EMPRESA",
    "razonSocial": "Ejemplo S.L.",
    "country": "ES",
    "nif": "B12345678",
    "address": "Calle Falsa 123",
    "city": "Madrid",
    "zipCode": "28001"
  }
}
```

### Un contacto — `GET /api/contacts/[id]` · scope `contacts:read`

### Actualizar — `PATCH /api/contacts/[id]` · scope `contacts:write`

### Eliminar — `DELETE /api/contacts/[id]` · scope `contacts:delete`

### Subrecursos

| Ruta | Métodos | Uso |
|---|---|---|
| `/api/contacts/[id]/notes` | GET, POST | Notas |
| `/api/contacts/[id]/interactions` | GET, POST | Interacciones |
| `/api/contacts/[id]/tasks` | GET, POST | Tareas |
| `/api/contacts/[id]/attachments` | GET, POST | Adjuntos |
| `/api/contacts/[id]/conversaciones` | GET | Conversaciones (canales de mensajería) |

---

## 3. Deals y pipeline

### Etapas del pipeline — `GET /api/pipeline/stages` · scopes `leads:read` o `deals:read`

```http
GET /api/pipeline/stages?pipelineId=<id_opcional>
```

Respuesta:

```json
{
  "stages": [
    {
      "id": "cuid_de_la_etapa",
      "pipelineId": "cuid_del_pipeline",
      "nombre": "Calificación",
      "probabilidad": 25,
      "orden": 1,
      "color": "#3b82f6",
      "esEtapaFinal": false,
      "tipoEtapaFinal": null,
      "activo": true
    }
  ]
}
```

> Para crear un deal en la etapa correcta envía `pipelineId` y usa como `etapa` el
> `nombre` de la etapa objetivo (p. ej. `calificacion` o el nombre mostrado en el
> panel).

### Listar deals — `GET /api/deals` · scopes `deals:read` y `leads:read`

Respuesta:

```json
{
  "deals": [
    {
      "id": "cuid_del_deal",
      "titulo": "Venta villa en Marbella",
      "valor": 125000,
      "moneda": "EUR",
      "etapa": "calificacion",
      "estado": "activo",
      "probabilidad": 25,
      "prioridad": "media",
      "pipelineId": "cuid_del_pipeline",
      "lead": { "id": "...", "nombre": "Ana García" },
      "contact": { "id": "...", "nombre": "...", "tipo": "person" },
      "usuarioAsignado": { "id": "...", "name": "...", "email": "..." },
      "_count": { "cotizaciones": 0, "actividades": 0 }
    }
  ],
  "metrics": {
    "totalDeals": 1,
    "totalValor": 125000,
    "valorPonderado": 31250,
    "porEtapa": { "calificacion": 1 },
    "porEstado": { "activo": 1 }
  }
}
```

Parámetros de consulta:

| Parámetro | Descripción |
|---|---|
| `pipelineId` | Filtra al pipeline indicado. Los deals sin pipeline se asignan automáticamente al primer pipeline activo |
| `etapa` / `estado` | Filtra por etapa (`etapa`) o estado (`activo`, `ganado`, `perdido`, `pausado`) |
| `leadId`, `contactId`, `catalogoItemId` | Filtra por entidad vinculada |
| `usuarioAsignadoId` | Filtra por comercial asignado |
| `search` | Busca en título o descripción |

> Aislamiento: si el rol del usuario de la clave solo ve lo propio, la lista se
> restringe automáticamente a sus deals asignados (ignora `usuarioAsignadoId`).

### Crear un deal — `POST /api/deals` · scopes `deals:write` y `leads:write`

Cuerpo (`DealCreateSchema`):

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `titulo` | string (1–500) | ✅ | |
| `valor` | número ≥ 0 | ✅ | Acepta strings numéricos (`"1500.50"`) |
| `leadId` | cuid | — | El lead debe estar **convertido** a contacto antes |
| `contactId` | cuid | — | Contacto existente en el tenant |
| `newContact` | objeto | — | Crea el contacto en línea (ver abajo) |
| `pipelineId` | cuid | — | Si se omite, se asigna el primer pipeline activo del tenant |
| `etapa` | string (≤100) | — | Defecto `calificacion` |
| `estado` | enum | — | `activo` (defecto), `ganado`, `perdido`, `pausado` |
| `probabilidad` | 0–100 | — | Defecto 25 |
| `prioridad` | enum | — | `baja`, `media` (defecto), `alta`, `urgente` |
| `moneda` | 3 letras | — | Defecto `EUR` |
| `fechaEstimadaCierre` | `YYYY-MM-DD` o ISO 8601 | — | Acepta fecha de calendario o datetime |
| `descripcion`, `origen`, `tags` | string | — | |
| `usuarioAsignadoId` | cuid | — | Defecto: el usuario de la clave |
| `catalogoItemId` | cuid | — | Producto/servicio del catálogo |

`newContact` (crea contacto en la misma llamada, requiere `nombre` y `email` únicos):

```json
"newContact": {
  "nombre": "Carlos Ruiz",
  "email": "carlos@ejemplo.com",
  "telefono": "+34 622 111 222",
  "tipo": "person",
  "cargo": "Director"
}
```

Reglas de negocio:

- Se necesita exactamente uno de: `contactId`, `newContact`, o un `leadId` cuyo lead
  ya esté convertido a contacto (`400`/`404` en caso contrario).
- Si envías un `pipelineId` inexistente o inactivo → `404 Pipeline no encontrado`.
- Responde `201 Created` con `{ "deal": { ... } }` (incluye `lead`, `contact`,
  `company`, `propiedad` y `usuarioAsignado`).

### Un deal — `GET /api/deals/[id]`

### Actualizar — `PATCH /api/deals/[id]`

Campos de `DealUpdateSchema` (todos opcionales): `titulo`, `descripcion`, `valor`,
`moneda`, `etapa`, `probabilidad`, `prioridad`, `estado`, `fechaEstimadaCierre`,
`fechaCierre` (ISO), `razonPerdida`, `competidor`, `tags`, `usuarioAsignadoId`,
`catalogoItemId`, `notasInternas`.

---

## 4. Citas (agenda)

### Consultar disponibilidad — `GET /api/citas/disponibilidad` · scope `citas:read`

```http
GET /api/citas/disponibilidad?fecha=2026-09-20&duracion=30&buffer=0&avisoMinimo=0
```

Parámetros:

| Parámetro | Descripción |
|---|---|
| `fecha` | ✅ obligatorio, `YYYY-MM-DD` |
| `duracion` | Minutos de la cita (defecto 60) |
| `buffer` | Minutos de margen entre citas (defecto 0) |
| `avisoMinimo` | Antelación mínima para agendar (defecto 0) |

Respuesta (resumen):

```json
{
  "fecha": "2026-09-20",
  "duracion": 30,
  "diaActivo": true,
  "disponibles": {
    "total": 8,
    "slots": [ "10:00", "10:30", "11:00" ]
  },
  "recomendacion": "Hay 8 horarios disponibles."
}
```

### Listar citas — `GET /api/citas` · scope `citas:read`

Devuelve un **array** de citas (incluye `lead` y `servicio`).

Parámetros:

| Parámetro | Descripción |
|---|---|
| `estado` | `pendiente`, `confirmada`, `cancelada`, `completada` (varios separados por coma) |
| `tipo` | `reunion`, `llamada`, `demo`, `servicio`, `otro` |
| `fecha` | Día concreto (`YYYY-MM-DD`) |
| `fechaInicio` / `fechaFin` | Rango de fechas (datetime) |
| `sort` | `asc` o `desc` por `fechaHora` |

### Crear una cita — `POST /api/citas` · scopes `citas:write` (o `appointments:write`)

Cuerpo (`CitaCreateSchema`) — se exige al menos uno de `leadId`, `contactId` o
`titulo`:

| Campo | Tipo | Defecto | Notas |
|---|---|---|---|
| `titulo` | string (≤500) | — | Si falta, se usa el nombre del servicio/ítem |
| `tipo` | enum | `reunion` | `reunion`, `llamada`, `demo`, `servicio`, `otro` |
| `fechaHora` | ISO 8601 | — | ✅ obligatorio |
| `duracion` | 5–480 min | 60 | |
| `estado` | enum | `pendiente` | `pendiente`, `confirmada`, `cancelada`, `completada` |
| `leadId` / `contactId` | cuid | — | Se valida que existan en el tenant |
| `servicioId` / `catalogoItemId` | cuid | — | Completan título/duración y permiten confirmación por email |
| `descripcion` | string (≤5000) | — | |
| `ubicacion` | string (≤500) | — | |
| `linkReunion` | URL | — | |
| `tipoLinkReunion` | enum | `ninguno` | `ninguno`, `generar` (Meet), `pegar` |
| `linkReunionPegado` | URL | — | Usado si `tipoLinkReunion=pegar` |
| `bufferMinutos` | 0–120 | 0 | Añade margen a la duración para detectar conflictos |
| `avisoMinimo` | ≥ 0 | 0 | Rechaza citas con menos antelación |
| `connectedCalendarId` | cuid | — | Calendario conectado destino |

Reglas de negocio aplicadas por el servidor:

- **No se permiten citas en el pasado** (margen de 5 min) → `400`.
- **Aviso mínimo**: si se exige antelación y la cita es demasiado pronto → `400`.
- **Conflictos de horario** → `409 Conflicto de horario`.
- Si el usuario tiene Google Calendar conectado, la cita se crea en su calendario
  (y se genera Meet si `tipoLinkReunion=generar`).
- Si hay `servicio` + email del lead, se envía la confirmación por email.
- Respuesta `201 Created` con el objeto de la cita (incluye `lead` y `servicio`).

### Modificar / cancelar — `PATCH /api/citas/[id]` · `DELETE /api/citas/[id]`

Scopes `citas:write` (+`appointments:write`) para PATCH y `citas:delete`
(+`appointments:delete`) para DELETE. PATCH acepta `CitaUpdateSchema` (los mismos
campos de creación, opcionales); el estado `cancelada` se usa para cancelar.
