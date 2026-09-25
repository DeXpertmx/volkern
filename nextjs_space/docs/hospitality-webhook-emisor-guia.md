# Guía de integración — Emisión de eventos de reserva al webhook de Volkern

> **Para quién es este documento:** para quien implementa el **emisor** de
> eventos de reserva — el sistema que envía `book` / `modify` / `cancel` /
> `no_show` al webhook de reservas de Volkern Hospitality. Describe qué enviar,
> qué vas a recibir y cómo comportarte ante cada respuesta, con la política de
> reintentos lista para copiar en tu cola de reenvíos.
>
> No reemplaza al contrato técnico interno
> ([`hospitality-connectivity-contract.md`](./hospitality-connectivity-contract.md)),
> que es la fuente de verdad de la API del proveedor de conectividad
> (inventario, tarifas, credenciales). Aquí solo se trata el lado del emisor.
> **Regla de marca:** en ninguna UI, correo o PDF visible al cliente se cita el
> nombre del proveedor de conectividad; este documento es material técnico
> interno/de integración, no material de cliente.

## Requisitos previos

- **Endpoint:** `POST /api/hospitality/webhook/reservations`
  (la URL base definitiva te la da el equipo de Volkern durante el onboarding).
- **Autenticación:** HTTP Basic Auth con las credenciales que Volkern emite al
  registrarte. `Authorization: Basic base64(usuario:contraseña)`. Si cambian,
  pide las nuevas: no hay recuperación por reintento (un 401 no se cura
  reintentando).
- **Content-Type:** `application/json` en cada petición.
- **Fechas:** `YYYY-MM-DD` en `checkin`/`checkout`.

## Los cuatro eventos

Un único endpoint, campo `action`:

| `action` | Cuándo enviarlo | Efecto en Volkern |
|----------|-----------------|-------------------|
| `book` | Se crea una reserva nueva | La registra, ocupa la unidad y empuja inventario |
| `modify` | Cambia datos de una reserva existente | Reemplaza el estado completo (no es un patch) |
| `cancel` | El huésped cancela | La reserva pasa a `cancelled`; libera la unidad |
| `no_show` | El huésped **no se presentó** | La marca `no_show`; libera la unidad y emite la penalización según la política del hotel |

### El evento `no_show` en detalle

Envíalo cuando tu sistema determine que el huésped no se presentó (fin de la
noche de check-in sin llegada, o tu flujo de "Mark No Show" interno). El
payload es el de una reserva normal, con `action: "no_show"`:

```json
{
  "action": "no_show",
  "hotelCode": "sandbox-pms",
  "channel": "Directa",
  "bookingId": "BKG-2026-00042",
  "checkin": "2026-09-18",
  "checkout": "2026-09-20",
  "guest": { "firstName": "María", "lastName": "García", "email": "maria@example.com" },
  "rooms": [
    { "roomCode": "suite", "rateplanCode": "suite-ep", "occupancy": { "adults": 2 } }
  ]
}
```

Dos campos que **no son opcionales** aunque sea un aviso de no-presentación:

- `rooms[].roomCode`: sin el contexto de habitación el sistema no puede
  resolver el mapping y responderá 400.
- `bookingId`: el mismo con el que emitiste el `book` original. Un `no_show` no
  crea reservas: localiza la tuya por `bookingId` + `channel`.

## Qué vas a recibir

### Respuestas con éxito (200)

```json
{
  "success": true,
  "status": "actualizada",
  "reservationId": "cmu6mvqnc0…",
  "penalizacion": { "emitida": true, "importe": 1200, "motivo": null }
}
```

- `status` describe el resultado de la operación (`actualizada`).
- `penalizacion` es **informativo**: te dice si el hotel emitió el cargo por el
  no-show (`emitida: true` + `importe`), o por qué no lo hizo (`emitida: false`
  + `motivo`: `canal_del_proveedor` — tú ya cobras la tuya —,
  `politica_ninguna`, `sin_importe`, …).
- **No es un acuse de cobro.** El cargo lo emite, cobra y factura el hotel con
  su política (primera noche por defecto) y puede tardar días. Si necesitas
  conciliarlo, es el flujo de reportes — nunca un reintento del webhook.

### Tabla completa de respuestas y reintentos

| HTTP | Cuándo | ¿Reintentar? | Cómo |
|------|--------|--------------|------|
| **200** | Aplicado, o ya estaba marcado (idempotente) | **No** | Nada que hacer. Reenviar el mismo evento no cambia nada y no duplica cargos. |
| **404** | Tu `bookingId` no existe en Volkern | **Sí, con backoff limitado** | El `book` original puede estar aún en camino (entregas desordenadas). Espera el `Retry-After` y reintenta: 5 min → 1 h → 6 h, hasta **24 h** desde el primer 404. Si sigue 404, **escala a soporte**: significa que el `book` se perdió — reenviar el `book` original (no el `no_show` convertido en `book`). |
| **401** | Credenciales incorrectas, o una cabecera que no se puede leer | **No** | Detén la cola y revisa credenciales. Reintentar no cambia nada. El cuerpo trae `diagnostico` (ver abajo): dice si el problema es el esquema, el base64 o el par. |
| **400** | Payload inválido (falta `hotelCode`/`bookingId`/`channel`/`rooms`, acción desconocida, multi-habitación) | **No** | Es un defecto del payload, no transitorio. Corrige y envía solo si cambias el payload. |
| **503** | Volkern aún no tiene la conectividad configurada | **Sí, con backoff** | Transitorio del receptor. Espera el `Retry-After` (60 s) y reintenta. |
| **500** | Fallo interno no esperado | **Sí, con backoff** | Transitorio. Espera el `Retry-After` (60 s) y reintenta; todo el ciclo es idempotente, reintentar no duplica nada. |

### Si te llega un 401: el campo `diagnostico` te dice por qué

El 401 no es un «no» opaco. Trae `diagnostico` con el motivo y, cuando tus
credenciales eran legibles, las **huellas** de lo que enviaste (nunca los
valores, y nada de nuestro par guardado):

```json
{
  "success": false,
  "error": "No autorizado",
  "diagnostico": {
    "motivo": "credenciales_no_coinciden",
    "esquema": "basic",
    "usuarioLen": 7,
    "passwordLen": 11,
    "usuarioHuella": "8c7e40780bbf",
    "huella": "30284edbd493"
  }
}
```

| `motivo` | Qué pasó del lado receptor | Qué hacer |
|---|---|---|
| `sin_cabecera` | La petición llegó **sin** `Authorization`. | Revisa que la cabecera se añade también en los reintentos y no la borra ningún proxy. |
| `esquema_no_basic` | Llegó otro esquema (mira `esquema`: `bearer`…). | Corrige el emisor a `Basic`. |
| `cabecera_malformada` | Esquema `basic` sin valor. | Cabecera truncada: revisa cómo la construyes. |
| `encoding_no_utf8` | Los bytes decodificados no son UTF-8 (p. ej. latin-1). | Codifica el par en UTF-8 antes del base64. |
| `sin_separador` | El base64 no decodifica a `usuario:contraseña`. | Falta el `:`. |
| `credenciales_no_coinciden` | El par llegó completo pero no es el vigente. | Compara las huellas (abajo). |

**Comparar huellas (sin intercambiar secretos).** `huella` es
`sha256(usuario + ":" + contraseña)` truncado a los 12 primeros caracteres hex,
calculado sobre **lo que llegó**. Calcula el tuyo igual y compáralo:

```bash
# mismo cálculo que hace el receptor, con lo que TÚ tienes configurado
printf '%s:%s' "$USER" "$PASS" | sha256sum | cut -c1-12
```

- **Coincide** → tu configuración llegó intacta y el par vigente en el receptor
es otro: pídele al equipo de Volkern el par que emite (o reenvíale el tuyo).
- **No coincide** → algo altera la cabecera por el camino (proxy, codificación,
recorte de comillas).

> **Nota:** este diagnóstico no solo viaja en la respuesta: queda registrado en
> el panel de administración de Volkern (`/admin/conectividad`), con motivo,
> longitudes, huellas y hora. Si se te pierde una respuesta 401, el equipo de
> Volkern puede leerte el último rechazo de la pantalla, sin tocar logs.

El esquema `Basic` se acepta en cualquier caja y con espacios de más
(`basic …` es válido, RFC 7235). Si cambian las credenciales, **pide las nuevas**:
un 401 no se cura reintentando.

### La cabecera `Retry-After`

Las respuestas reintentables (404, 503, 500) llevan `Retry-After` en **segundos**:
el mínimo de espera antes de tu primer reintento. Tu backoff escala **a partir
de** ese valor. Las respuestas no reintentables (200, 401, 400) **no** la
llevan: si no llega cabecera, no reenvíes.

```text
404 → Retry-After: 300   (luego 3600, 21600… máx. 24 h)
503 → Retry-After: 60    (luego 300, 1800…)
500 → Retry-After: 60    (luego 300, 1800…)
```

## Reglas de oro del emisor

1. **Un evento, un destino.** Cada evento se entrega a la cola una vez y se
   reintenta por la política de la tabla; nunca en paralelo.
2. **Idempotencia de tu lado también.** Un mismo `bookingId` + `action` no debe
   encolarse dos veces por un reintento de *tu* infraestructura: aunque Volkern
   lo deduplica, tu cola no debe multiplicar tráfico.
3. **Nunca conviertas un `no_show` fallido en `book`.** Si el 404 persiste, el
   problema es el `book` perdido: reenvía el `book` original tal cual, y el
   `no_show` después.
4. **No interpretes `penalizacion` como dinero confirmado.** Es la decisión del
   hotel en el momento del evento.
5. **Multi-habitación no se parte del lado del emisor sin avisar.** Un booking
   con varias `rooms` se rechaza completo (400); si tu flujo emite un booking
   por habitación, hazlo con `bookingId` distintos y coherentes — el formato
   `bookingId#n` es el que Volkern espera para las partes.

## Checklist antes de dar por buena tu integración

- [ ] Envías `no_show` con el mismo `bookingId` + `channel` del `book` original.
- [ ] Tu cola respeta `Retry-After` y tiene tope de 24 h en el 404.
- [ ] Un 401 o un 400 detienen los reintentos (no queman la cola).
- [ ] Tratas los 200 (incluido el idempotente) como fin de la historia.
- [ ] No interpretas `penalizacion` como acuse de cobro.
- [ ] Tu reloj usa `YYYY-MM-DD` en fechas y no envías timestamps en las fechas.

## Referencias

- El **procedimiento de go-live** (acuerdo con el partner, alta del
  proveedor, ensayo controlado y corte a producción) lo ejecuta el equipo de
  Volkern siguiendo
  [`hospitality-go-live-pms-guia.md`](./hospitality-go-live-pms-guia.md).

- Contrato técnico completo (inventario, tarifas, resolución de unidad):
  [`hospitality-connectivity-contract.md`](./hospitality-connectivity-contract.md)
  — sección «Ciclo completo de un no_show entrante: respuestas y reintentos».
- Ensayo de punta a punta que ejercita este webhook con un proveedor simulado:
  [`hospitality-no-show-e2e.md`](./hospitality-no-show-e2e.md) —
  `npm run test:e2e:noshow`.
- Guardias del contrato HTTP (`Retry-After`, ausencia en no reintentables,
  idempotencia): `tests/hospitality-webhook-reservations-route.test.ts`.
