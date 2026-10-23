# Roadmap: canal de seguridad — vínculos automáticos bajo revisión (15 oct 2026)

## Problema que resuelve

La vinculación automática por webhook crea un vínculo unidad ↔ habitación del
proveedor **sin que nadie lo pida** (llega una reserva de un `roomCode`
desconocido y si el vínculo es inequívoco, se crea). Antes de hoy ese vínculo
nacía `estado: 'activo'` y el dispatcher lo publicaba **en la siguiente pasada
de sync**: el canal empezaba a vender una habitación que nadie había revisado —
la solicitud del operador tras revisar el hotel primero, "al importar datos,
que no deje enviar datos a OTAs hasta revisar" (15-oct-2026).

## Lo implementado (listo)

### 1. Módulo puro — `lib/hospitality/vinculo-revision.ts`

Regla única y sin dependencias:

- Estado nuevo, `pendiente_revision`, que SOLO nace del webhook
  (`origen: 'vinculacion_automatica_webhook'`).
- **Entrada** (importar: reservas, mensajes, reconciliación, recuperación de
  faltantes) acepta `['activo', 'pendiente_revision']`.
- **Salida** (publicar: dispatcher de sync, availability, blocks) filtra
  `estado: 'activo'` y NO toca lo pendiente: el canal no lo ve.
- Los vínculos automáticos ANTERIORES (`activo` con metadata webhook) conservan
  su estado y siguen en el recordatorio periódico; no bloquean nada.
- Los vínculos de operador (wizard, panel de incidencias, reseñas manuales)
  siguen naciendo `activo` como siempre.

### 2. Webhook — nacer pendiente y no perder la entrada

- `vincularUnidadAMapping` (incidencias.ts) calcula el estado con
  `estadoDeVinculoAutomatico(metadata)`.
- Las lecturas de entrada aceptan lo pendiente: `resolveMappingDetailed`
  (reservas), `resolverPropiedad` (mensajes), reconciliación de reservas,
  recuperación de reservas faltantes, barrido diario, re-verificación de
  divergencias y el deshacer del wizard.
- Una unidad con vínculo pendiente NO vuelve a ofrecerse para otra habitación
  (`proponerVinculacion` cuenta lo pendiente como unidad ocupada).

### 3. Wizard — el peaje del paso 6 y del paso 10

- Paso 6: banda ámbar/roja con los vínculos que esperan revisión, badge
  «Pendiente de revisión» por unidad y botón «Confirmar» que guarda el cotejo
  tal cual (el servidor revalida contra el catálogo real del proveedor, mismas
  reglas que el guardado completo). El botón «Deshacer» apaga el vínculo y
  marca `bloqueaAutoVinculacion` para que el webhook no lo vuelva a crear solo.
- Paso 10 (`puedeActivar`): mantener un vínculo pendiente sin revisar bloquea
  la activación de producción con el motivo exacto. La ruta `/activar` revalida
  en servidor, así que la UI no puede saltarse el peaje.
- Guardar el paso 6 ES la revisión: `metadataConfirmado` reescribe el origen
  y el vínculo pasa a `activo` (publica de nuevo).

## Siguiente iteración (propuesto)

### 4. Buffer de seguridad por unidad

Traducción al modelo de lo que ya hace el proveedor (push de inventario con
`count` y `stop_sell`): permitir declarar por unidad `bufferUnidades: 1|2` —
noches que NO se empujan como disponibles aunque estén libres. El margen
absorbe retrasos de sync y picos de última hora. Va en la unidad (datos
operativos) y en el push de inventario (solo se descuenta, nada más).

### 5. Stop sell automático en la última unidad

Mismo push: cuando el tipo de habitación queda con 1 unidad vendible, empujar
`count: 0` (cerrar la venta) además de la disponibilidad real. Elimina el
caso típico de la última reserva duplicada si el webhook del `book` pierde
la carrera contra un fetch del canal. Hoy el sistema depende de que las OTAs
respeten el `count` que les manda el push; esta regla lo hace explícito.

### 6. Informe diario de pick-up

Sobre lo que ya existe (`hospitality-briefing`, `reservas-faltantes`):
añadir al briefing diario el pick-up del día (reservas nuevas por canal) y
las anomalías de patrón (picos de cancelación, noches sin justificar ya
detectadas en el barrido §29). El operador ve las raras cada mañana sin
abrir el panel de reconciliación.

## Fuera de alcance por ahora, anotado

- **Predicción de cancelaciones (ML)**: para sobreventa dinámica. No hay datos
  históricos suficientes en esta base; reconsiderar al superar ~1.000 reservas
  por temporada.
- **Capacitación del personal**: protocolos de sobreventa — documentado en la
  guía de la conectividad; no es código.

## Archivos tocados por la primera iteración

- `lib/hospitality/vinculo-revision.ts` (nuevo, puro)
- `lib/hospitality/incidencias.ts`, `lib/hospitality/reservations.ts`,
  `lib/hospitality/mensajes-service.ts`, `lib/hospitality/reconciliation.ts`,
  `lib/hospitality/reservas-faltantes.ts`,
  `lib/cron/hospitality-reconcile.ts` (lecturas de entrada)
- `lib/hospitality/onboarding.ts`, `lib/hospitality/onboarding-status.ts`
  (peaje paso 6/10)
- `app/api/hospitality/onboarding/mapping/route.ts` (guardado = revisión)
- `app/api/hospitality/onboarding/activar/route.ts` (revalida peaje)
- `app/api/hospitality/onboarding/mapping/deshacer/route.ts`

## Pruebas

- `tests/hospitality-vinculo-revision.test.ts` (módulo puro + guardias de fuente)
- `tests/hospitality-vinculo-entrada.test.ts` (nacimiento pendiente + lectura
  de entrada)
- `tests/hospitality-onboarding.test.ts` (peaje del paso 10, banda del paso 6)
