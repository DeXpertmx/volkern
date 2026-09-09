# 05 · Errores, límites y buenas prácticas

## 1. Códigos de estado HTTP

| Código | Significado | Cómo actuar |
|---|---|---|
| `200` / `201` | Éxito. `201` = recurso creado | Procesa el cuerpo |
| `400` | Solicitud inválida (validación Zod, falta un campo obligatorio, formato incorrecto, regla de negocio como "cita en el pasado") | Revisa `details` por campo y corrige el payload |
| `401` | No autenticado (falta la API key, inválida, inactiva o caducó) **o scopes insuficientes** (error `Permisos insuficientes (…scopes…)`) | Revisa la clave y añade a ella los scopes que pide el endpoint |
| `403` | Autenticado pero sin permiso: el rol del usuario no tiene el permiso (p. ej. `Sin permiso para crear deals`), el módulo no está activo en el plan, o se intentó cruzar a otro tenant | Revisa rol/usuario de la clave, activa el módulo o contacta soporte |
| `404` | Recurso no encontrado (lead, contacto, pipeline, cita…) o el `id` no pertenece a tu tenant | Comprueba el `id` |
| `409` | Conflicto de estado: cita con horario solapado, nombre duplicado | Cambia el horario o consulta disponibilidad antes |
| `429` | Límite de uso del plan alcanzado | Contacta soporte o espera a ampliar el plan |
| `500` | Error interno del servidor | Reintenta con backoff; si persiste, avisa a soporte |

## 2. Formato de errores

Cuando hay validación estricta (Zod) el error tiene esta forma:

```json
HTTP 400
{
  "error": "Datos inválidos",
  "details": {
    "nombre": ["Nombre requerido"],
    "fechaHora": ["Formato de fecha inválido (ISO 8601)"]
  }
}
```

Otros endpoints históricos pueden responder solo `{ "error": "..." }` o
`{ "success": false, "error": "..." }`. **Regla para tu código:** confía siempre en
el código HTTP y, si hay `error`/`details`, inclúyelos en tus logs.

Errores frecuentes y su `details`:

| Campo | Mensaje típico |
|---|---|
| `id` | `ID inválido (se espera un cuid de 25 caracteres)` — los IDs son CUIDs de 25 caracteres, no los envies truncados |
| `email` | `Email inválido` |
| `linkedin` | `LinkedIn URL inválida` |
| `moneda` | `Código de moneda de 3 caracteres` |
| `valor` | `El valor debe ser >= 0` |
| `fechaEstimadaCierre` | `Formato de fecha inválido (YYYY-MM-DD o ISO 8601)` |
| `canal` / `tipo` / `prioridad` / `estado` | El valor no está en el enum permitido |

## 3. Fechas y horas

- Las fechas de **cierre** de un deal aceptan `YYYY-MM-DD` **o** datetime ISO 8601.
- Las **citas** (`fechaHora`) exigen datetime ISO 8601; el servidor valida que no sea
  pasada y que respete `avisoMinimo`.
- Los filtros de rango (`fechaDesde`/`fechaHasta` en leads) se envían como
  `YYYY-MM-DD` y se interpretan en UTC (inicio de día / fin de día).
- Los datetimes se serializan como ISO 8601 con zona horaria; usa siempre UTC o
  envía el offset explícito.

## 4. Deduplicación e idempotencia

| Recurso | Comportamiento al reintentar |
|---|---|
| **Leads** | `POST /api/leads` con el mismo `email` (o `telefono` si no hay email) **actualiza** el lead existente en lugar de duplicarlo. Reintentar es seguro a efectos de duplicados (aunque vuelve a disparar notificaciones solo en la creación real) |
| **Contactos** | `POST /api/contacts` con un email existente responde `400`; reintentar no duplica |
| **Deals** | No hay deduplicación automática: si reintentas un `POST /api/deals`, puedes crear duplicados. Guarda el `id` devuelto y, si dudas, consulta `GET /api/deals?search=` antes de reintentar |
| **Citas** | No hay deduplicación: reintentar puede crear citas duplicadas o devolver `409` por conflicto si se solapan |

No existe una cabecera `Idempotency-Key` (por ahora). Para operaciones no
deduplicables, implementa tu propia tabla de `externalId` → id de Volkern y consulta
antes de crear.

## 5. Límites y uso

- Cada cuenta tiene **límites por plan** (p. ej. nº de leads, contactos, pipelines).
  Si se supera el límite del plan en la creación, el endpoint responde con un error
  cuyo estado HTTP depende de la configuración del plan (normalmente `4xx`, a menudo
  `429`/`403`) y un mensaje del tipo *"límite alcanzado"*.
- El número de pipelines está limitado por plan (`maxPipelines` lo devuelve el panel
  o la respuesta de pipelines).
- **No hay paginación** en los listados actuales: para volúmenes grandes consulta con
  filtros (fechas, estados, `search`) o contacta a soporte para una solución batch.
- Estadísticas de uso de cada clave: `ultimoUso` y `totalUsos` visibles en
  **Configuración → API Keys**.

## 6. Timeouts y reintentos

- Timeout de red recomendado: **30 s** para la mayoría de endpoints.
- Implementa reintentos con **backoff exponencial** (p. ej. 1 s → 2 s → 4 s) solo
  sobre respuestas `5xx` y errores de red; no reintentes ciegamente `4xx` (no se
  corregirán solos).
- Si la respuesta es `429` (límite), reintenta tras el tiempo indicado en la cabecera
  `Retry-After` si existe; de lo contrario espera y avisa.

## 7. Seguridad — checklist para tu integración

- [ ] Guarda la API key en **variables de entorno o gestor de secretos**; nunca en el
      repositorio ni en el cliente.
- [ ] Usa **scopes mínimos** por clave (crea una clave distinta por integración y
      propósito).
- [ ] **Rota las claves** periódicamente o al perderlas: elimínalas en
      Configuración → API Keys y crea nuevas.
- [ ] Verifica las **firmas HMAC** de los webhooks salientes con comparación
      *timing-safe* y rechaza las que fallen (`401`).
- [ ] En webhooks de entrada, exige siempre el secret y valida la firma sobre el
      cuerpo exacto.
- [ ] Usa **HTTPS** en tu endpoint receptor.
- [ ] No registres la clave, secretos ni payloads completos con datos personales en
      tus logs.
- [ ] Cumple la normativa de protección de datos: si envías datos personales a
      terceros, asegúrate de tener base legal y contrato de encargado de tratamiento.
- [ ] La integración solo ve los datos del tenant dueño de la clave. No intentes
      acceder a otros tenants: está bloqueado (403).

## 8. Guía de depuración

1. Confirma el **código HTTP** y lee `error`/`details`.
2. Comprueba que la clave tiene los **scopes** necesarios (Configuración → API Keys)
   y que no está desactivada o caducada.
3. Verifica que los `id` que envías son CUIDs válidos y pertenecen a tu tenant.
4. Si el problema es un webhook: revisa el **historial de entregas** (payload, estado
   HTTP, reintentos) en el panel.
5. Prueba con el mínimo posible: primero `GET /api/leads` con la clave; después
   amplía.
