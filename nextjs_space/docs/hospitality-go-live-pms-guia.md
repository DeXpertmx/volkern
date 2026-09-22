# Go-live de conectividad con un PMS/canal real — guía operativa

**Fecha:** 18 sep 2026 · **Para quién:** el equipo de Volkern que ejecuta la
primera integración con un proveedor de conectividad real (el PMS/canal del
cliente). **Fuente técnica:** [`hospitality-connectivity-contract.md`](./hospitality-connectivity-contract.md)
— esta guía no redefine nada del contrato; convierte su checklist de go-live
en un procedimiento con etapas, responsable y verificación. La guía para quien
implementa el **emisor** del proveedor es otra:
[`hospitality-webhook-emisor-guia.md`](./hospitality-webhook-emisor-guia.md).

**Estado del ciclo hoy:** todo el recorrido está probado contra el mock del
proveedor (libro entrante, modify, cancel, no_show, push de disponibilidad y
tarifas, reconciliación diaria, incidencias, auto-vínculo) y con ensayos E2E
de punta a punta contra servidor de desarrollo. Lo que falta para producción
no es código: es ejecutar estas etapas con el partner real.

**Regla de marca:** material técnico; sin nombres comerciales del proveedor.

---

## Etapa 0 · Acuerdo con el partner (comercial → técnico)

**Responsable:** dirección. **Duración:** fuera de nuestro control.

1. Contrato firmado y contacto técnico designado por el proveedor (los
   checklists los firma quien opera su lado).
2. Tres datos sin los cuales no se puede empezar: **URLs de los endpoints**
   de su API (update/avail/rates/data), **credenciales** del canal para su
   plataforma y las **nuestras** para el webhook (usuario/contraseña que
   ellos enviarán en el Basic Auth del webhook de reservas).
3. Acordar una **ventana de ensayo**: fechas con calendario real del hotel
   pero tráfico controlado, antes de abrir al tráfico completo.

**Verificación de etapa:** los tres datos existen y hay fecha de ensayo.

## Diagrama de credenciales — quién emite qué y dónde se cifra

Las credenciales del ciclo viven en **una sola fila global**
(`ConnectivityProvider`, `providerKey 'channel_connectivity'`) y sirven a las
dos direcciones. Fuente técnica: `lib/hospitality/connectivity.ts` y
`lib/core/crypto.ts`.

```
      VOLKERN                                      PROVEEDOR DE CONECTIVIDAD
      (adapter lib/hospitality/connectivity.ts)    (su API + su emisor de webhooks)
           |                                                   |
           |  SALIENTE · push de inventario y tarifas          |
           |  POST {baseUrl}/api/v2/cm/update/{pms}            |
           |  y update-rates/{pms}                             |
           |  Authorization: Basic base64(user:pass) --------->|  valida el par
           |                                                   |
           |<------- ENTRANTE · webhook de reservas -----------|
           |  POST /api/hospitality/webhook/reservations       |
           |  Authorization: Basic base64(user:pass)           |
           |  comparación en tiempo constante (safeCompare)    |
           v                                                   v
           +-----------------------+     +---------------------+
                                   |     |
                                   v     v
     +-- ConnectivityProvider · UNA fila global (providerKey 'channel_connectivity') --+
     |  baseUrl       EN CLARO (no es secreto) · columna + env CONNECTIVITY_BASE_URL   |
     |  partnerIdEnc  AES-256-CBC · lib/core/crypto.ts                                 |
     |  usernameEnc   AES-256-CBC · idem — el MISMO par sirve en las dos direcciones   |
     |  passwordEnc   AES-256-CBC · idem                                               |
     +---------------------------------------------------------------------------------+
```

**Pieza por pieza:**

| Pieza | Quién la emite | Dónde viaja | Dónde se cifra |
|---|---|---|---|
| `partnerId` | **El proveedor**, tras el onboarding (contrato, flujo paso 4) | En la ruta `{pms}` de cada llamada saliente | `partnerIdEnc` — AES-256-CBC |
| Par Basic (`usuario`/`contraseña`) | **Volkern**, en el alta (Etapa 1); se entrega al proveedor por canal seguro | Saliente: header `Authorization` de cada push/fetch. Entrante: header `Authorization` del webhook | `usernameEnc` / `passwordEnc` — AES-256-CBC |
| `baseUrl` del servicio | **El proveedor** — la URL byte a byte del checklist de la reunión | Prefijo de cada llamada saliente | **No se cifra** (no es un secreto): columna `baseUrl` + variable de entorno `CONNECTIVITY_BASE_URL` |
| `hotelCode`, `roomCode`, `rateplanCode` | **El proveedor** (catálogo `property_details`) | Rutas salientes y payload del webhook | **En claro** en `ConnectivityMapping` — identificadores, no secretos |
| URL del webhook | **Volkern** (su endpoint público) | La recibe el emisor del proveedor para programarlo | n/a — pública |

**Reglas del cifrado** (el resto del módulo usa el mismo mecanismo: los partes
de viajeros guardan sus credenciales del Ministerio como `usuarioEnc` /
`passwordEnc`):

- **Mecanismo único:** `encrypt`/`decrypt` de `lib/core/crypto.ts` —
  AES-256-CBC con la clave `ENCRYPTION_KEY` del entorno (32 bytes), formato
  `iv:payload` en hex. Nada en claro en la BD ni en los logs; los tests lo
  asertan (el valor cifrado nunca es igual al secreto).
- **Plaintext solo en memoria:** el único punto que descifra es
  `getConnectivityCredentials()`, dentro del adapter (llamadas salientes) y de
  la validación del webhook. No hay un tercer consumidor.
- **La UI nunca ve valores:** el estado del panel muestra solo marcadores de
  presencia (`••••••`) cuando el secreto existe, jamás su contenido; el `GET`
  informativo del webhook tampoco filtra secretos.
- **Rotación:** volver a guardar desde el panel cifra los valores nuevos; los
  campos que llegan vacíos no borran lo existente (hace falta `null`
  explícito). Cambiar el par es operación del panel, no un despliegue.
- **Un par compartido a propósito:** que el mismo par sirva en las dos
  direcciones deja una sola pieza que rotar y un único sitio donde validarla.

## Etapa 1 · Alta del proveedor y credenciales (Volkern)

**Responsable:** ingeniería. **Duración:** horas.

1. **ConectividadProvider**: alta del proveedor con `hotelCode` único por
   propiedad, credenciales de su API y del webhook. Cifrar los secretos con
   el mismo mecanismo del mock (nada en claro en la BD ni en logs).
   - Consulta operativa: si el proveedor solo implementa parte del ciclo
     (típico: no implementa `no_show` entrante), documentar en el proveedor
     qué eventos quedan fuera — el webhook responde 400 a acciones
     desconocidas y el operador sigue teniendo el PATCH manual.
2. **Mapeos** (`ConnectivityMapping`): propiedad → `externalPropertyId`,
   cada unidad → `externalUnitCode`, cada rate plan → `externalRatePlanCode`.
   - Validar **capacidad dentro de min/max_occ** del catálogo del proveedor
     (checklist del contrato); la resolución por `roomCode` con rateplan de
     desempate depende de que estos códigos sean los de `property_details`.
3. **Banderas de entorno** por tenant según lo acordado:
   `HOSPITALITY_AUTO_MAPPING=on|off` (vínculo automático de unidades;
   apágalo si el Anfitrión quiere controlar cada vínculo a mano),
   `HOSPITALITY_EDAD_NINO_UMBRAL` (desempate por ocupación).

**Verificación de etapa:** `ConnectivityProvider` activo, mappings con estado
`activo`, y el endpoint informativo del webhook (`GET`) responde sin filtrar
secretos. Botón «Probar» del wizard de puesta en marcha en verde.

## Etapa 2 · Ensayo controlado (Volkern + proveedor)

**Responsable:** ingeniería + proveedor. **Duración:** 2–5 días.

**Del lado del proveedor** (comprueba su implementación del emisor con la
guía del emisor): URLs byte a byte, fechas `YYYY-MM-DD`/timestamps
`YYYY-MM-DD HH:MM:SS`, restricciones opcionales como `null`, `modify` como
reemplazo completo, `no_show` con el `bookingId` del `book` original y su
`roomCode`, cola con `Retry-After` y tope de 24 h en el 404.

**Del lado de Volkern**, en orden:

1. **Book entrante con duplicación.** Enviar el mismo `book` dos veces:
   el segundo debe ser idempotente (una sola reserva). Si el payload trae
   `rooms` con más de un elemento, debe registrarse como incidente
   multi-habitación (el registro manual del panel permite partirlo en una
   reserva por habitación).
2. **roomCode sin mapping → incidencia.** Un `book` con un `roomCode` sin
   vínculo debe terminar en `sin_mapping`, verse en el panel de incidencias
   y, si el caso es inequívoco, el auto-vínculo lo resuelve dejando traza de
   quién y por qué; probar también **deshacer** desde el wizard.
3. **Cancel entrante** (y su **barrido de reconciliación** si se pierde):
   la reserva interna queda cancelada y el inventario se re-publica.
4. **No-show entrante** (si el proveedor lo emite): cargo por la política de
   la propiedad, `Retry-After` respetado en los reintentos, idempotente.
5. **Push de disponibilidad y tarifas.** Bloqueos del planning y reservas
   directas deben bajar la disponibilidad en el canal; un no-show o una
   cancelación debe subirla.
6. **Divergencias.** Provocar una cancelación perdida y verificar que la
   reconciliación diaria la detecta y el panel de admin la lista para
   cancelar tras revisión.

**Verificación de etapa:** los seis casos anteriores en verde con tráfico
del proveedor real; `HospitalitySyncLog` sin errores no explicados;
`npm run test:e2e:booking` y `npm run test:e2e:noshow` siguen en verde (el de
booking incluye el hold que caduca solo y la unidad que vuelve a venderse por la
página pública).

## Etapa 3 · Corte a producción (Volkern)

**Responsable:** ingenieria + operador del hotel. **Duración:** un día.

1. **Cierre de inventario.** Congelar altas/edits de mappings y unidades
   hasta terminar la ventana.
2. **Doble publish.** Activar el proveedor y comparar, durante unas horas,
   disponibilidad y tarifas publicadas contra el planning interno
   (`HospitalitySyncLog` + panel de admin) antes de abrir ventas.
3. **Plan de vuelta atrás:** desactivar el proveedor (estado inactivo) y
   re-publicar a los canales previos del hotel. El webhook 404 ante eventos
   de un booking que no entró es un síntoma del rollback: se responde y se
   escalar al proveedor.
4. **Monitoreo de la primera semana:** resumen periódico de vínculos
   automáticos pendientes de revisar, panel de incidencias en cero (o
   explicado), divergencias revisadas a diario, y holds caducados revisados en
   el panel `/admin/hospitality` (si aparecen muchos, la ventana `holdHoras` de
   la propiedad está corta o los canales confirman tarde). El hotel tiene la
   misma lectura en su propia **pestaña Operación de Reportes** (*holds
   abandonados*: caducados frente a confirmados y su tasa), que es la que se
   revisa en la reunión semanal sin abrir el panel de plataforma.

**Verificación de etapa (la que cierra el checklist del contrato):** una
semana con incidencias explicadas, divergencias a cero o revisadas, y ninguna
reserva de canal perdida ni duplicada. Ahí el checklist byte-a-byte del
contrato queda firmado por ambos lados.

---

## Qué NO cubre este go-live

- **Factura al huésped**: el circuito fiscal es del ERP y va aparte; de la
  conectividad solo llega la atribución de gastos a la reserva. En **España** el
  ERP factura al huésped con Veri*Factu; en **México no hay timbrado CFDI** (la
  factura del huésped se emite en la contabilidad del hotel) y en mercados sin
  factura electrónica obligatoria no hay requisito que cubrir.
- **Cobro automático de reservas de canal**: el cobro en línea es de la
  reserva directa (Stripe Connect); las de OTA se liquidan por su circuito y
  se registran a mano en Finanzas.
- **Precio público de la vertical** (decisión comercial pendiente).

## Referencias

- Resumen ejecutivo (para el cliente): [`hospitality-resumen-ejecutivo.md`](./hospitality-resumen-ejecutivo.md)
- Checklist de la reunión con el proveedor: [`hospitality-checklist-reunion-conectividad.md`](./hospitality-checklist-reunion-conectividad.md)
- Contrato técnico: [`hospitality-connectivity-contract.md`](./hospitality-connectivity-contract.md)
- Guía del emisor (proveedor): [`hospitality-webhook-emisor-guia.md`](./hospitality-webhook-emisor-guia.md)
- Ensayos E2E: `docs/hospitality-booking-engine-e2e.md`, `docs/hospitality-no-show-e2e.md`
- Reconciliación diaria: `lib/cron/hospitality-reconcile.ts` (§14 del contrato)
- Health-check diario de la capa (05:00): `lib/cron/hospitality-connectivity-health.ts`,
  disparador `GET /api/cron/hospitality-connectivity-health` — la marca
  «Última verificación» del panel de Conectividad.
- Caducidad de holds pendientes (cada hora): `lib/cron/hospitality-holds.ts`,
  disparador `GET /api/cron/hospitality-holds-expirados` · panel de estado y
  métricas por tenant: `/admin/hospitality` (`/api/admin/hospitality/holds`)
