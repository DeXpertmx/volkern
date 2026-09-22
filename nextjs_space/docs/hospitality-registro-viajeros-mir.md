# Registro de viajeros — comunicación al Ministerio del Interior

Hospitality comunica los viajeros al **web service oficial** del Ministerio del
Interior (Servicio de Comunicación Hospedajes, dependiente de la Secretaría de
Estado de Seguridad). No se usa ningún agregador ni API de terceros: el mensaje
que sale del producto es el que espera el servicio del Ministerio, extremo a
extremo. Hay una guardia de test que lo fija leyendo el propio módulo.

- **Base legal**: Real Decreto 933/2021, de 26 de octubre, artículo 6.
- **Interfaz implementada**: `MIR-HOSPE-DSI-WS — Servicio de Comunicación
  Hospedajes`, **versión 3.1.2** (17/09/2024).
- **Código**: `lib/hospitality/registro-viajeros.ts` (contrato, XML, ZIP, SOAP,
  validaciones), `lib/hospitality/registro-viajeros-service.ts` (envío y traza),
  `lib/cron/hospitality-registro-viajeros.ts` (barrido horario),
  `app/api/hospitality/registro-viajeros/` (configuración y estado),
  `app/dashboard/hospitality/registro-viajeros/` (pantalla de operación).
- **Recogida de los datos del huésped** (lo que hace que el parte nazca
  completo): `lib/hospitality/guest-checkin.ts` (qué falta y cómo se guarda),
  `lib/hospitality/checkin-service.ts` (token, enlace y envío cuando toca),
  `app/api/public/checkin/[token]/` (API pública por token),
  `app/checkin/[token]/` (pantalla del huésped, ES/EN). Detalle en §8.

## 1. Qué obliga el RD 933/2021 (y cómo se cumple aquí)

El artículo 6 obliga a comunicar «de manera inmediata y, en todo caso, en un
plazo no superior a 24 horas» desde dos momentos:

| Momento legal | Comunicación del servicio | Estado en el producto |
|---|---|---|
| Al formalizar la reserva o el contrato, o su anulación | **RH** — reserva de hospedaje | **Implementado**, a la espera del namespace del XSD oficial (ver §7) |
| Al inicio del servicio contratado | **PV** — parte de viajeros | **Implementado** |
| Anulación de una comunicación ya registrada | Operación `B` | **Implementado** |

El **parte de viajeros (PV)** es el que corresponde al «registro de huéspedes»:
los datos de cada persona alojada, con contrato, fechas y pago.

## 2. Cómo viaja el mensaje (tal como lo exige el servicio)

```
POST https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion
Authorization: Basic base64(usuario:contraseña)      ← apartado 2.2
Content-Type: text/xml; charset=utf-8
SOAPAction: ""

<soapenv:Envelope …>
  <com:comunicacionRequest>
    <peticion>
      <cabecera>
        <codigoArrendador>0000000001</codigoArrendador>
        <aplicacion>Volkern</aplicacion>
        <tipoOperacion>A</tipoOperacion>
        <tipoComunicacion>PV</tipoComunicacion>
      </cabecera>
      <solicitud>UEsDBBQ…</solicitud>                ← XML + ZIP + Base64
    </peticion>
  </com:comunicacionRequest>
</soapenv:Envelope>
```

El contenido de `<solicitud>` es un fichero **XML comprimido en ZIP y codificado
en Base64** (no deflate suelto: el servicio descomprime esperando un contenedor
ZIP). El módulo construye el ZIP con su propio contenedor y CRC-32:

```xml
<alt:peticion xmlns:alt="http://www.neg.hospedajes.mir.es/altaParteHospedaje">
  <solicitud>
    <codigoEstablecimiento>1234567890</codigoEstablecimiento>
    <comunicacion>
      <contrato>
        <referencia>BOOK-1</referencia>
        <fechaContrato>2026-09-01</fechaContrato>
        <fechaEntrada>2026-09-20T15:00:00</fechaEntrada>
        <fechaSalida>2026-09-23T12:00:00</fechaSalida>
        <numPersonas>2</numPersonas>
        <numHabitaciones>1</numHabitaciones>
        <internet>true</internet>
        <pago><tipoPago>EFECT</tipoPago><fechaPago>2026-09-20</fechaPago></pago>
      </contrato>
      <persona>…</persona>
    </comunicacion>
  </solicitud>
</alt:peticion>
```

El **orden de los elementos** es el del XSD oficial y está fijado en
constantes (`ORDEN_CONTRATO`, `ORDEN_PERSONA`) con un test que lo comprueba
elemento a elemento: cambiar el orden hace que el servicio rechace el fichero
completo.

## 3. Qué se valida antes de enviar (y por qué)

El servicio valida el XML contra su XSD y, si algo falla, **no registra nada**
(el parte no se «arregla» después: hay que reenviarlo). Por eso el módulo valida
en local con las mismas reglas y devuelve el campo exacto que falla:

| Regla | Detalle |
|---|---|
| Rol | En un parte de viajeros es siempre `VI` (viajero) |
| Nombre y primer apellido | Obligatorios (50 caracteres) |
| Segundo apellido | Obligatorio si el documento es **NIF o NIE** |
| Tipo y número de documento | Obligatorios para mayores de edad; el número debe ser un **NIF o NIE válido** (dígito de control) |
| Número de soporte | Obligatorio si el documento es NIF o NIE |
| Fecha de nacimiento | Obligatoria, `AAAA-MM-DD` |
| Minoría de edad | Si hay algún menor, alguna persona del parte debe informar el **parentesco**. El propio ejemplo oficial (Anexo I) lo informa en el menor; por eso la regla se aplica al parte y no exige un bloque concreto |
| Sin fecha de nacimiento | No se puede probar que sea menor: se exige documento igualmente |
| Contacto | Al menos uno de teléfono, teléfono2 o correo (el correo, con formato válido y hasta 250 caracteres) |
| Dirección | Obligatoria, con **código de municipio del INE (5 dígitos) si el país es España**; si no lo es, nombre del municipio |
| País y nacionalidad | ISO 3166-1 alfa-3 |
| Fechas de contrato | `AAAA-MM-DD`; entrada y salida con hora `AAAA-MM-DDThh:mm:ss` |
| Pago | Bloque obligatorio con `tipoPago` del catálogo `TIPO_PAGO` |
| Código de establecimiento | Obligatorio: lo asigna el Ministerio al registrar el inmueble |

Además de los errores, el módulo produce **avisos** que no bloquean el envío
(por ejemplo, que `numPersonas` no cuadre con las personas informadas).

## 4. El alta es asíncrona: lote y consulta

Una respuesta `0 - Ok` significa **«recibido»**, no «registrado». La petición se
guarda y se procesa después, y devuelve un **número de lote**. El código de
comunicación (o el error real) se obtiene consultando el lote:

| Estado del lote | Significado | Qué hace el producto |
|---|---|---|
| 1 | Tramitado sin errores | Pasa a `aceptada` y guarda el código de comunicación |
| 6 | Tramitado con errores en algunas comunicaciones | Revisa el detalle por comunicación; si hay error, `rechazada` |
| 2 / 3 | Errores de cabecera o inesperados | `rechazada` |
| 4 / 5 | En proceso / pendiente | Sigue esperando, sin tocar la fila |

La anulación usa la operación `B` con el `codigoComunicacion`, y se dispara sola
cuando la reserva pasa a cancelada (el RD obliga también a comunicar la
anulación).

## 5. Qué separa «no enviar» de «enviar mal»

Los canales (OTA) no mandan documento, nacionalidad ni domicilio del huésped.
Cuando falta algo, el parte **no se envía**: queda registrado como
`datos_incompletos` con la lista de campos que faltan, y el operador los
completa en la pantalla (o por API con la acción `completar`, que guarda los
datos en `guestData.viajeros` y envía en el momento).

Esa elección es deliberada: el RD obliga a comunicar datos **ciertos**; rellenar
un documento o una dirección inventados sería peor que comunicar tarde y con
constancia de por qué.

Estados de una comunicación en el producto:

`pendiente` · `datos_incompletos` · `enviada` (recibida, esperando lote) ·
`aceptada` · `rechazada` · `anulada` · `error`

Los reintentos **no son ciegos**: se espacian con una espera que **crece con
cada intento gastado** — 1 h, 2 h, 4 h, 8 h, 16 h (constantes
`ESPERA_BASE_REINTENTO_MS`, `FACTOR_BACKOFF_REINTENTO` y
`ESPERA_REINTENTO_MAXIMA_MS` del módulo puro) — y se abandonan tras cinco
intentos, para no martillear el servicio del Ministerio con un parte imposible
de resolver. El tope vale también para el parte que **no llegó** (`error`): si
el servicio estuviera caído, sin tope el barrido reintentaría esa comunicación
indefinidamente y nadie la vería como atascada.

El backoff cambia el efecto de una **caída del servicio**: con la ventana fija
de una hora, una caída de una mañana recibía cada parte cinco veces en cinco
horas; con esperas crecientes, la primera hora es igual y las demás se van
espaciando — 1h + 2h + 4h = tres intentos en las siete primeras horas — hasta
que el servicio vuelve. La regla vive en el módulo puro (`esperaReintentoMs`,
`reintentoDisponible`) y el cron la traduce a su consulta de Prisma por
peldaños de intentos; una guardia de tests fija que el cron no vuelve a una
constante fija por su cuenta.

## 6. Cómo se configura

En `/dashboard/hospitality/registro-viajeros` (y por API con
`accion: 'configurar'`):

| Dato | Para qué |
|---|---|
| Código de arrendador | Identifica a la entidad ante el Ministerio (cabecera) |
| Usuario y contraseña | Autenticación básica HTTP; **se guardan cifrados** |
| Nombre de la aplicación | Viaja en la cabecera (máx. 50 caracteres) |
| Entorno | Pruebas del Ministerio o producción |
| Código de establecimiento **por propiedad** | Sin él, las reservas de esa propiedad no se pueden comunicar |
| Código de tipo de pago (y mapa de métodos) | Traduce el método interno (`efectivo`, `stripe`…) al código del catálogo `TIPO_PAGO` |

Ni el código de arrendador ni los del catálogo se inventan: los entrega la Sede
Electrónica del Ministerio en el registro de la entidad, y los códigos de los
catálogos se consultan con la operación `catalogo` del propio servicio.

## 7. La reserva de hospedaje (`RH`): hecha, esperando un dato

La comunicación de reserva de hospedaje (el momento «al formalizar la reserva o
el contrato» del artículo 6) está implementada de punta a punta:

- **Estructura** (`construirXmlAltaReservaHospedaje`): sobre SOAP, con la misma
  cabecera y el mismo ZIP + Base64 que el parte de viajeros, y el XML con el
  orden deducido de la tabla del apartado 3.1.1.2 del documento oficial
  (`solicitud/comunicacion/establecimiento`, `…/contrato` y `…/persona` 1..n).
  Dos diferencias con `PV` que el XSD marca y el código respeta: el
  establecimiento va **dentro** de `comunicacion`, y `persona` **no** lleva
  `soporteDocumento` ni `parentesco`.
- **Validación** (`validarReservaHospedaje`): hace falta el código del
  establecimiento o sus datos, el titular del contrato (`TI`, los demás `VI`) y
  un contacto. El **documento no es obligatorio** aquí —el huésped aún no lo ha
  dado al reservar— y la dirección es opcional: si el canal no la manda, el
  bloque llega vacío y no bloquea la comunicación.
- **Servicio** (`enviarReservaHospedaje`): igual que el parte, con traza por
  reserva y consulta de lote.

### De dónde tiene que salir el namespace (y por qué no está)

El namespace del XSD de `RH` es el **único** dato del contrato que no está
disponible en fuentes oficiales, y no se deduce del de las otras operaciones
(eso sería inventar el contrato y arriesgar un rechazo silencioso en firma
segura). Comprobaciones hechas, con su resultado:

| Fuente consultada | Resultado |
|---|---|
| `MIR-HOSPE-DSI-WS` v3.1.2 (PDF oficial) | Las figuras de los XSD son **imágenes sin capa de texto**: `PV`, consulta y anulación aparecen como texto; el de `RH` no |
| WSDL del servicio (`…/comunicacion?wsdl`) | **HTTP 401**: exige las credenciales del arrendador |
| Sede Electrónica del Ministerio (`hospedajes.ses.mir.es/hospedajes-sede/`) | La aplicación no publica esquemas (sin enlaces de descarga) |

Nota sobre `seshospedajes.es`: aloja el PDF oficial, pero **no es la web del
Ministerio** — es una empresa privada que ofrece la tramitación. No se toma de
ahí ningún contrato técnico.

### Cómo se activa (un solo sitio, y con procedencia)

En cuanto se disponga del fichero XSD oficial (lo entrega el Ministerio junto
con las credenciales, o viaja con el kit de integración), se informan **las dos
constantes juntas** en `lib/hospitality/registro-viajeros.ts`:

```ts
export const NS_ALTA_RESERVA: string | null =
  '…'; // namespace tal cual del targetNamespace del XSD
export const FUENTE_NS_ALTA_RESERVA: string | null =
  'XSD <fichero>.xsd, v<x.y>, entregado por <quién> el <AAAA-MM-DD>'; // procedencia
```

No hay que tocar nada más: el builder recibe el namespace por parámetro, el
servicio lo pide con `namespaceAltaReservaHospedaje()` y la pantalla deja de
mostrar el aviso sola (`reservas.habilitadas`). Mientras `NS_ALTA_RESERVA` sea
`null`, el producto **no emite** reservas de hospedaje: `enviarReservaHospedaje`
devuelve `pendiente_xsd` con el motivo, sin llamar al Ministerio y sin dejar
fila en la traza (no se llena la pantalla de ruido cada hora).

Dos guardias de test lo sostienen: una **falla si aparece un namespace de `RH`
inventado** en el código, y la otra **exige la procedencia** en cuanto la
constante se informe. Así el dato no se puede colar «razonado» a partir del
patrón de los otros namespaces: o viene del XSD, o no se emite.

## 8. De dónde salen los datos del huésped (y por qué ya no los completa nadie del hotel)

Los canales (OTA y channel manager) mandan nombre y poco más: nunca el documento
ni la dirección. Antes, el parte nacía `datos_incompletos` y **una persona del
hotel tenía que completarlo a mano**, reserva por reserva. Ahora hay dos
superficies que se lo piden **al propio huésped**:

| Dónde | Qué recoge | Cuándo |
|---|---|---|
| **Motor de reservas público** | Los datos del documento del titular, opcionales, en un bloque plegable | Al reservar |
| **Check-in online** (`/checkin/<token>`) | Los documentos de **todos** los viajeros (titular y acompañantes) | Desde la confirmación hasta la llegada |

El motor guarda el titular si el huésped dejó algo del documento (y no inventa
nada si no lo hizo). El check-in online es el que cierra el círculo: el huésped
rellena las fichas de su grupo desde el móvil, en español o en inglés.

### El flujo completo, de punta a punta

```
   Reserva creada (motor público · canal OTA/channel manager · alta manual)
        │
        ▼
[1] TOKEN Y ENLACE — sistema
    `asegurarTokenCheckin` genera el token opaco (192 bits) al crear la reserva
    o al enviar la primera comunicación; el enlace es la única credencial.
        │
        ▼
[2] EL ENLACE LLEGA AL HUÉSPED — sistema (o el hotel, a mano)
    confirmación · pre-llegada `{{enlace_checkin}}` (cron diario) · día del
    check-in · botón «Enlace de check-in» del panel para partes con faltantes
        │
        ▼
[3] FORMULARIO — el huésped
    `/checkin/<token>` (móvil primero, ES/EN): documentos de TODO el grupo,
    titular y acompañantes (tope 30). Hereda contacto del titular (y dirección
    si la marca); documento, nombre y nacimiento nunca se heredan.
        │
        ▼
[4] GUARDADO Y VALIDACIÓN — sistema
    Mismas reglas MIR que el envío. Si falta algo, se guarda igual y se dice
    qué revisar: el enlace sigue abierto y el huésped vuelve a completar.
        │
        ▼
    ¿TODO el grupo documentado Y la estancia ya empezada?
        │
        no ──► No se comunica nada (ni se reporta como «enviado»). El barrido
        │      horario lo enviará cuando toque; el hotel ve el faltante en la
        │      pantalla de reservas y puede completarlo a mano («Completar
        │      datos») si el huésped no responde.
        │
        sí
        ▼
[5] COMUNICACIÓN AL MINISTERIO — sistema
    Cron horario `hospitality-registro-viajeros` (plazo de 24 h del
    RD 933/2021); el guardado también lo dispara si la estancia ya empezó.
        │
        ▼
[6] RESPUESTA DEL SERVICIO DE HOSPEDAJES — el Ministerio
    ├─ aceptado ───────► fin: queda en la traza y en el panel
    ├─ esperando lote ──► el cron consulta hasta tener veredicto
    ├─ rechazado ───────► causa y qué corregir en pantalla + email al hotel
    └─ error / caída ───► backoff progresivo (1 h, 2 h, 4 h…), tope de
                          intentos y aviso de abandono (paneles + email)
```

Quién toca cada pieza, con dónde vive en el código:

| Pieza | Quién | Dónde vive |
|---|---|---|
| Token y enlace | Sistema (al crear la reserva o al 1.º envío) | `lib/hospitality/checkin-service.ts` |
| Envío del enlace | Sistema (crons `pre_llegada` / `check_in`) o el hotel a mano | `lib/hospitality/comunicaciones.ts`, `lib/cron/hospitality-checkin-due.ts` |
| Formulario del huésped | El huésped, desde el móvil | `app/checkin/[token]/`, `app/api/public/checkin/[token]/` |
| Recogida y validación de datos | Sistema (mismas reglas MIR que el envío) | `lib/hospitality/guest-checkin.ts` |
| Faltante en pantalla y corrección a mano | El hotel | `app/dashboard/hospitality/reservas/page.tsx`, `components/hospitality/completar-parte-viajeros-dialog.tsx` |
| Envío al Ministerio | Sistema (cron horario) | `lib/cron/hospitality-registro-viajeros.ts` |
| Rechazo, reintento y abandono | Sistema; la corrección decide el hotel (o el huésped, volviendo al enlace) | `lib/hospitality/parte-rechazo.ts`, `lib/hospitality/aviso-partes.ts` |

### El enlace del huésped, y por qué es seguro

Cada reserva tiene un **token opaco** (192 bits al azar) que se genera al crear
la reserva o al enviar la primera comunicación, y que es la única credencial de
`/checkin/<token>`: quien lo tiene edita esa reserva y solo esa. Por eso no se
expone en listados y el enlace se genera al vuelo, también para reservas
anteriores a esta función y para las que llegan por canal.

El enlace viaja de tres formas, sin que nadie del hotel persiga a nadie:

- En la **confirmación de la reserva** (el motor lo devuelve y la pantalla lo
  muestra).
- En el email/WhatsApp de **pre-llegada** (plantilla `pre_llegada`, con la
  variable `{{enlace_checkin}}`), que es la que hace el trabajo.
- En el **día del check-in** (plantilla `check_in`), por si no lo completó antes.
- Y a mano desde el panel del hotel (**«Enlace de check-in»** en los partes con
  datos pendientes), para las reservas de canal.

### Cuándo se envía el parte (y qué NO se envía)

- El Servicio de Hospedajes comunica el parte **al inicio del servicio**. Al
guardar
  los documentos, el producto solo llama al Ministerio si la estancia **ya
  empezó** (mismos estados que usa el cron); si el huésped rellenó todo un mes
  antes, no se comunica una entrada que aún no ha ocurrido — lo envía el barrido
  horario el día de la llegada.
- El parte **no se envía incompleto**: si falta algo, se guarda igual (el
  huésped puede volver al enlace) y la respuesta dice qué revisar, con las
  mismas reglas y límites que valida el Ministerio.
- Y «enviado» significa enviado: un parte que queda en `datos_incompletos` o
  `rechazado` **no** se reporta como enviado a quien lo pidió.

### Qué se hereda del grupo (y qué no)

El contacto del titular y —solo si el huésped lo marca en el formulario— su
dirección se copian a los acompañantes que no los traigan: es el dato del grupo
(el Ministerio exige contacto por persona y el huésped no tiene por qué repetir
el suyo en cada ficha). **Documento, nombre y fecha de nacimiento no se heredan
nunca**: son datos personales de cada viajero, y copiarlos sería inventar el
parte.

Tampoco se completa la dirección solo porque el país sea España: si alguien
deja el país en `ESP`, el municipio (código INE de 5 dígitos) hay que darlo.

### Dónde se ve que falta (sin esperar al día de la llegada)

Que el parte esté incompleto no puede aparecer por sorpresa en el check-in: para
entonces ya no hay margen para pedir el documento. La **pantalla de reservas** lo
avisa desde que la reserva existe, y no mirando la traza —que solo se escribe
cuando el barrido ya pasó— sino con las **mismas reglas** del check-in y del
validador del Ministerio: la lista trae, por reserva, si el parte le corresponde,
si está completo, cuántas fichas de viajero hay y qué campos faltan.

El aviso distingue dos casos, y a propósito:

- **Ninguna ficha de viajero** (`viajeros: 0`) — el caso normal de una reserva de
  canal: la fila dice «sin datos de ningún viajero» en vez de enseñar una lista
  de campos que no existen.
- **Ficha a medias** — se listan los campos que bloquean (los tres primeros, con
  el nombre que les da el formulario del huésped); el resto se ve al abrir el
  formulario.

Y desde la propia fila están los dos caminos reales: **completar los datos** (el
operador, con el mismo formulario de la pantalla del registro —un solo componente
para las dos pantallas, para que no divergan—) o **copiar el enlace de check-in**
y mandárselo al huésped, que es la única vía en las reservas de canal. El aviso
desaparece cuando el parte queda aceptado: entonces ya no hay nada que completar.

### Y si el Ministerio lo RECHAZA

Un rechazo no es «faltan datos», y confundirlos hace perder el tiempo: los datos
pueden estar completos y el servicio rechazar un campo, y hay rechazos —código de
arrendador, aplicación o usuario— que no se arreglan pidiéndole nada al huésped.
La misma pantalla enseña el rechazo **con el motivo del servicio tal cual** y con
lo que hay que corregir, en tres ámbitos:

| Ámbito | Cuándo | Qué ofrece la pantalla |
|---|---|---|
| **Datos del huésped** | Códigos de validación (`10121`, `10130`, `10131`) o un error del lote que nombra un campo (`persona[0].numeroDocumento`) | Corregir los datos en el formulario del parte (y el enlace de check-in, para que los corrija el huésped) |
| **Configuración del hotel** | Códigos del arrendador, la aplicación o el usuario (`10103`, `10107`…) | Enlace a Registro de viajeros: completar datos no arregla nada |
| **El envío** | Formato, operación o servicio (`10111`, `10999`, o un rechazo del lote que no nombra ningún campo) | Reintentar el envío en el momento, sin esperar a la hora del barrido |

Dos detalles que valen más de lo que parecen:

- **El campo se lee, no se adivina.** El servicio nombra el campo con su ruta XML
  (`persona[0].direccion.codigoMunicipio`) o lo cita dentro de la frase del error;
  el producto traduce esa ruta al campo del formulario del huésped por la **cola**
  de la ruta —el prefijo cambia según el mensaje— y solo acepta rutas que pasen
  por un nodo de persona, para no confundir el `nombre` del inmueble con el del
  huésped. No hay catálogo de mensajes ajenos que se quede obsoleto.
- **El `0` del alta no es un código de rechazo.** Cuando el alta se recibe bien y
  el rechazo llega después en el resultado del lote, la traza guarda el `0` del
  alta: usarlo como código del rechazo mandaba a «reintenta, es el envío» un
  rechazo que era un documento del huésped. **Lo destapó el ensayo E2E (bloque
  4d)**, y por eso el aviso solo enseña el código cuando explica algo.
- **Y si el barrido ya se ha rendido, la pantalla lo dice.** El producto
  reintenta un parte rechazado con esperas crecientes (1 h, 2 h, 4 h…) hasta un
  tope de intentos (`MAX_INTENTOS_PARTE`); agotado el tope **no lo vuelve a
  intentar nadie**, y un aviso que no lo dijera dejaría creer que el sistema
  sigue trabajando en ello.
  Esos partes se cuentan aparte en el aviso («*N* de ellos agotaron sus 5
  intentos…»), cada uno enseña sus intentos, la fila dice «sin reintentos
  automáticos» y la acción deja de llamarse «reintentar» —lo que hace el hotel—
  para llamarse «reenviar el parte». Un parte **incompleto** no se abandona
  nunca: no gasta intentos, porque con un parte incompleto no se llama al
  servicio.

### Y si el servicio NO contesta: el parte no llegó (y no es un rechazo)

Un rechazo es que el servicio **leyó** el parte y lo devolvió con errores. Si el
servicio no contesta —caída, timeout, un HTTP de error—, no hubo comunicación: el
parte queda en `error`, y la diferencia importa porque los dos casos se arreglan
distinto. Guardarlo como `rechazada` ponía en boca del Ministerio una decisión
que nunca tomó: el hotel leía «el Ministerio rechazó este parte» con los datos
perfectos y el aviso le mandaba a corregir un formulario donde no había nada mal.

La causa era una verdad a medias del cliente: `leerRespuestaMIR` devuelve
**siempre** un objeto, también con un cuerpo que no es SOAP (`503 Service
Unavailable` en texto plano, la página de un proxy, un cuerpo vacío) —con todos
los campos a `null`, pero verdadero—. Ese objeto pasaba por «respuesta» y el
parte se clasificaba como rechazo con motivo «Sin código de retorno». Ahora la
pregunta se hace explícita (`esRespuestaMIR`): una respuesta de verdad trae
código, descripción, lote o resultados; **un `Fault` de SOAP tampoco cuenta**,
porque dice que el servicio no pudo atender la petición, no que este parte esté
mal.

Lo que ve cada quien cuando el parte no llegó:

| Dónde | Qué dice |
|---|---|
| Traza (`hospitalityGuestRegistryCommunication`) | Estado `error`, el motivo de la no-entrega (el error de red, o el HTTP sin respuesta) y **sin** código de retorno: no hubo Ministerio que contestara |
| Pantalla de reservas | «El parte no llegó al Ministerio», con el fallo **de envío** y **ningún campo del huésped** señalado |
| Check-in del huésped | El envío no se disfraza de rechazo ni de «sin configuración»: el resultado trae `motivo: sin_entrega` y el estado real, para que nadie mande al hotel a revisar credenciales que están bien |
| Registro de viajeros y Reportes | Se cuenta como **envío que no llegó** mientras se reintenta, y el abandono se separa por causa (sin entregar frente a rechazado): la lectura del hotel no es la misma si su parte no salió por un rechazo o porque el servicio estaba caído |
| Pantalla de reservas y email | El texto dice **esperas crecientes** (1 h, 2 h, 4 h…), no «cada hora»: lo que el operador lee y lo que el barrido hace salen de la misma constante |
| Panel de estado de crons | El abandono se publica **por su causa** por tenant («sin entregar» frente a «rechazados») |

La salida es la misma que en un rechazo de envío: el barrido reintenta con
esperas crecientes (1 h, 2 h, 4 h…) hasta el tope, y cuando el servicio vuelve,
el hotel **reenvía el parte** y queda aceptado. **Lo destapó el ensayo E2E
(bloque 4e)**, que para provocarlo usa un **503 sin SOAP** a propósito: es la
forma más habitual de caerse y la que más fácilmente se colaba como rechazo.

### El abandono no se queda en el panel de la plataforma

El operador de plataforma ve los partes sin reintentar en el panel de estado de
crons (§10). Eso no basta: quien tiene los documentos y las credenciales es el
hotel, y si el dato solo viviera ahí, saber que hay una estancia sin comunicar
dependería de que alguien se lo contara por teléfono. Así que el mismo abandono
sale en **las dos pantallas del hotel**, contado desde el mismo módulo puro
(`lib/hospitality/partes-metrics.ts`):

- **Registro de viajeros** (estado, sin ventana): una tarjeta roja
  «Partes sin reintentar (*N*)» con la referencia de cada estancia, el **motivo
del servicio** y **qué corregir** — las mismas dos salidas que el aviso de la
  pantalla de reservas: *corregir los datos* (formulario del huésped, que
  reenvía al guardar) o *reenviar el parte*; más el enlace de check-in, que
  sigue siendo el único camino en las reservas de canal. La tarjeta **no
  aparece si no hay ninguno**: un «0 partes sin reintentar» permanente acaba
  ignorándose.
- **Reportes → Operación** (ventana de 30/90/180 días): el KPI *Partes sin
  reintentar*, con la tasa del ciclo del parte — **aceptados frente a los que el
  producto dejó fuera** —, su lectura y un aviso cuando el abandono pasa el
  umbral con volumen suficiente. Exportado también en el CSV de operación
  (`partes_sin_reintentar`, `partes_aceptados`, `partes_cerrados`,
  `partes_sin_reintentar_pct`).

La definición es una sola, y no es «rechazadas»: un rechazo **con intentos por
gastar** todavía se reintenta solo, y un `datos_incompletos` ni siquiera gasta
intentos (el producto está esperando el documento, no fallando). Solo entra en
la tasa el parte que el producto cerró sin ayuda —aceptado— frente al que dejó
fuera —sin reintentar—, que es el par que dice si la estancia se comunicó o no.
La ventana de Reportes es la de la traza (`fechaEdicion`): es cuando el parte se
movió por última vez y, por tanto, cuando el barrido gastó el último intento. El
panel del registro no usa ventana por la misma razón por la que su conteo por
estado tampoco la usa: es un estado a fecha de hoy, no un informe del período.

### Y el hotel se entera por email, no solo en la pantalla

Una pantalla no avisa: solo informa a quien entra a mirar. Un parte abandonado
es una estancia que **nadie va a comunicar** hasta que una persona actúe, así
que el barrido manda un **email** a los operadores del tenant (los mismos
destinatarios que el resto de avisos del módulo) con sus partes sin reintentar.

- **Solo partes nuevos.** La marca del aviso es una fila en
  `HospitalitySyncLog` (tipo `aviso_partes_sin_reintentar`) con los ids que se
  contaron: el mismo parte no se repite en cada pasada horaria. Un parte nuevo
  —entrado después del último aviso— dispara un email aunque otros ya consten;
  el email detalla los nuevos y menciona de pasada el total ya conocido.
- **Un fallo de envío no deduplica.** Si el proveedor de email falla (o no hay
  operadores con correo), la marca queda en `error`/`pendiente` y la siguiente
  pasada reintenta el aviso: dar por avisado a un hotel sin email es justo lo
  que no puede pasar.
- **El cuerpo es del módulo puro.** `aviso-partes.ts` construye asunto, texto y
  HTML (escapado) desde los datos del parte — referencia, causa en palabras
  («sin respuesta del servicio» ≠ «rechazado por el Ministerio»), intentos
  gastados, fecha, y el recorte a 5 líneas con «… y N más»—. Los tests fijan
  que el email dice exactamente lo que dice la pantalla.
- **En el ensayo E2E el email va al mock.** Con `EMAIL_E2E_ENDPOINT` apuntando
  a loopback, `sendEmail` envía por HTTP al mock en vez de a Resend/SMTP (en
  producción la variable se IGNORA, y un valor fuera de loopback lanza). El
  ensayo aserta que el email salió con la referencia de la reserva y su causa.

### Las preguntas personalizadas del hotel (y por qué no van al parte)

Además de los campos del Ministerio, cada hotel puede definir **sus propias
preguntas** en el formulario del check-in (`/checkin/<token>`): hora estimada
de llegada, matrícula para el parking, si trae mascotas… Texto, opciones,
número o fecha, con versión en español y en inglés, marcables como
obligatorias. Se configuran en **Registro de viajeros → Preguntas del hotel**
 y las respuestas del huésped se guardan con la reserva y se muestran al hotel
 en la pantalla de reservas, junto al estado del parte.

**La regla inviolable**: el parte de viajeros es un XML contra un XSD cerrado
(§2) — un elemento que el esquema no conoce rechazaría el parte entero. Por eso
las preguntas y sus respuestas son **asunto exclusivo del hotel** y se excluyen
explícitamente del mensaje: la construcción del XML ni las lee (guardia en
tests). Y el «borrar» una pregunta es una **baja lógica** (`activa: false`):
deja de aparecer en el formulario, pero las respuestas ya guardadas en reservas
no se pierden. El módulo puro vive en `lib/hospitality/checkin-preguntas.ts`,
la config del hotel en la API de registro-viajeros (acciones `pregunta_crear`,
`pregunta_actualizar`, `pregunta_eliminar`).

**El día de recepción, paso a paso**: la misma jornada en cuatro pasos —
mirar la carga, filtrar el trabajo, atender lo urgente, sacar la lista:

```
   La pantalla de reservas abre — recepción empieza el día por aquí
        │
        ▼
[1] FILA «HOY» — la carga del día, sin tocar ningún filtro
    «3 llegadas hoy · 2 salidas hoy», en todo el hotel. Dos `count`
    con la ventana del DÍA LOCAL del servidor (`ventanaDeDiaLocal`) y
    sin canceladas (`estadosSinMovimiento`). La cifra no hereda los
    filtros de la lista: aunque esté filtrada, lo que manda es el día.
        │
        ├── ¿Bajar al trabajo del día?
        ▼
[2] LA PÍLDORA ES CONTADOR Y FILTRO — recepción
    Un clic en «3 llegadas hoy» deja la lista en las llegadas del día
    (el otro clic, en las salidas). Excluyentes entre sí — nadie llega
    y sale el mismo día— y combinables con el resto (estado, canal,
    propiedad, búsqueda). El mismo `movimiento` viaja en la URL del
    listado y en la del CSV: una sola where para las dos cosas.
        │
        ├── ¿Quién llega HOY sin documento?
        ▼
[3] EL ROJO MANDA — el sistema pone la urgencia delante
    `llegaHoySinParte` (la regla de día + la regla de parte, ambas del
    módulo): fila entera en rojo, «Falta para el parte: pasaporte ·
    llega hoy» y PRIMERO en la lista, aunque su fecha la trajera más
    abajo. Las demás llegadas sin parte quedan en ámbar, en su sitio.
        │
        ▼
[4] EXPORTAR CSV — la lista del día, fuera de la pantalla
    El botón descarga EXACTAMENTE lo que se ve: mismos filtros en la
    URL, mismos datos vía `whereDeFiltrosReservas`. Columnas
    operativas (referencia, huésped, email, teléfono, unidad,
    entrada, salida, noches, canal, importe, estado del parte) y una
    columna por pregunta del hotel. BOM UTF-8 y «;» para Excel; con
    0 reservas responde 404 — nadie imprime un CSV vacío.
        │
        ▼
    Fin del ciclo: recepción llama a quien llega sin documento,
    imprime la lista para housekeeping y el parte sale completo.
```

**La lista del día, exportable**: la pantalla de reservas abre con una fila
**«Hoy»** sobre la lista: «N llegadas hoy · M salidas hoy», la carga de
recepción del día en todo el hotel, independiente de los filtros activos. Cada
píldora es a la vez contador y filtro: al pulsarla, la lista queda reducida a
las llegadas (o salidas) del día, combinable con el resto de filtros (estado,
canal, propiedad, búsqueda). **La prioridad la marca el color**: una llegada
de hoy a la que aún le faltan datos del parte se pinta en rojo y se pone al
principio de la lista — hoy no es «pendiente», es «el huésped llega hoy» y el
Ministerio exige el documento (RD 933/2021); las demás llegadas sin parte
siguen con su aviso ámbar. La ventana es el **día local del servidor**, la
misma regla con la que el planning pinta los días y el CSV exporta las fechas:
una sola definición de «día» en el módulo. Las reservas canceladas no aparecen
(carecen de movimiento, la regla del módulo de estados) y las píldoras son
excluyentes entre sí — una reserva llega y sale en días distintos. El botón
**«Exportar CSV»** descarga la lista filtrada tal cual (mismos filtros en
la URL, mismos datos vía `GET /api/hospitality/reservations/export`), con las
columnas operativas (referencia, huésped, email, teléfono, unidad, entrada,
salida, noches, canal, importe y estado del parte) y **una columna por
pregunta del hotel** con sus respuestas. BOM UTF-8 y separador `;` para que
Excel lo abra bien. Con 0 reservas responde 404 en vez de un CSV sin filas.
El módulo puro del CSV es `lib/hospitality/reservas-csv.ts`; los días se
exportan con la misma regla de «día local» que usa el planning.

**La hoja de housekeeping, para el pasillo**: junto al CSV, el botón
**«Imprimir»** abre la lista del día en papel — la misma lista filtrada
(mismos filtros, misma `whereDeFiltrosReservas`, `GET
/api/hospitality/reservations/print`), compuesta para quien trabaja en
pasillo y no frente a la pantalla:

- **Dos secciones** — *Llegadas* y *Salidas* (**11:00**, la unidad queda para
  limpiar). La hora de llegada es **la del huésped si la respondió**: si el
  hotel preguntó la hora estimada de llegada entre sus preguntas del check-in
  y el huésped contestó con una hora legible («15:30», «3:30 pm», «15h»), la
  fila la dice **destacada en negro** y las llegadas se ordenan por esa hora
  real de trabajo; las que no la dieron quedan a la convención de la vertical
  (**15:00**), en su peso normal — el subtítulo de la sección nombra la regla.
  La detección vive en el módulo de preguntas (`esPreguntaHoraLlegada`,
  `horaEstimadaLlegadaDe`): si el hotel pregunta lo mismo con otras palabras,
  no hace falta tocar la hoja. Si la consulta de preguntas falla, la hoja sale
  con la convención — como el CSV, degradación elegante.
- **Por fila**: unidad, hora, huésped con su referencia, ocupantes («2
  adultos · 1 niño»), noches y una **casilla para marcar a lápiz** cuando la
  unidad queda limpia — es papel, no un formulario: el estado de la limpieza
  lo cambia el sistema al completar la tarea, la casilla solo cierra el
  recorrido de la hoja por el pasillo.
- **Limpieza**: las unidades `dirty`/`cleaning` o con tarea de limpieza viva
  (`HospitalityCleaningTask`, la que el check-out crea sola) llevan la
  etiqueta **LIMPIAR** y su **nota tal cual** la escribió el sistema — la hoja
  resume las tareas, no las duplica ni las reescribe.
- **La urgencia de la pantalla, heredada**: la llegada de hoy sin parte sale
  con la fila en rojo y «⚠ Falta parte: …» — la misma regla `llegaHoySinParte`,
  para que recepción llame al huésped antes de las 15:00.
- **Para imprimir de verdad**: A4 con márgenes, filas que no se cortan entre
  páginas y botón de impresión que desaparece al imprimir (`@media print`).
  Sin reservas responde 404 razonado, como el CSV: nadie imprime una hoja
  vacía.

El módulo puro de la hoja es `lib/hospitality/housekeeping-sheet.ts`; el HTML
lo compone la ruta y la impresión la hace el navegador (Ctrl+P) — sin
dependencias nuevas.

**Y el huésped las recuerda a tiempo**: las plantillas de **pre-llegada** y
del **día del check-in** pueden llevar `{{preguntas_pendientes}}` — la lista
de las preguntas obligatorias que el huésped aún no ha respondido, en su
idioma, junto al enlace del formulario (`{{enlace_checkin}}`). Es la
pre-llegada el momento de pedirlas: el huésped aún no llegó y el enlace sigue
abierto. Solo se nombran las **requeridas** y solo las **activas** (un
recordatorio con cinco cosas deja de leerse); si ya está todo respondido la
lista sale vacía; y si la consulta de preguntas falla, el mensaje sale igual
sin el recordatorio — una comunicación nunca se cae por esto. El cálculo vive
en el módulo puro (`requeridasPendientes` en
`lib/hospitality/checkin-preguntas.ts`); las plantillas sugeridas ES/EN ya lo
llevan.

**Y Reportes dice si funcionan**: la pestaña de Operación lleva la **tasa de
respuesta de las preguntas obligatorias** — respondidas frente a pendientes
sobre las reservas del período (30/90/180 días), con su lectura y un aviso
cuando la mayoría no responde con volumen suficiente. El par es el ciclo
completo: cada (reserva, pregunta obligatoria activa) está respondida o
pendiente, y «pendiente» se decide con la MISMA función `requeridasPendientes`
que rellena el recordatorio — Reportes y el email al huésped no pueden
discrepar. Una tasa baja no acusa al huésped: acusa a la plantilla de
pre-llegada que perdió `{{preguntas_pendientes}}` o al enlace, y a las reservas
del canal sin email ni teléfono (`sinContacto`), a las que ningún recordatorio
puede llegar. La sección es auxiliar: si su consulta falla, el dashboard sigue
en pie con la sección vacía. Módulo puro: `lib/hospitality/preguntas-metrics.ts`.

## 9. Límites documentados (lo que NO se ha inventado)

- **Namespace de la reserva de hospedaje (`RH`)**: única pieza pendiente del
  módulo (§7). Todo lo demás de `RH` está implementado y probado.
- **El catálogo de `tipoError` del servicio no se interpreta**: no está en el
  documento v3.1.2, así que el aviso del rechazo usa el **texto** del error y la
  ruta del campo que venga dentro. Un rechazo que no nombre ningún campo se
  enseña como problema del envío, y el motivo del servicio queda a la vista tal
  cual para que lo lea una persona — no se traduce a una causa inventada.
- **Nombres de fichero y campos del ZIP**: la especificación exige un ZIP
  comprimido y en Base64, pero no fija el nombre del XML interior; se usa
  `solicitud.xml` (constante `NOMBRE_FICHERO_SOLICITUD`), que el servicio acepta.
- **Catálogos**: no se codifican a mano (tipo de documento, sexo, tipo de pago,
  parentesco, tipo de establecimiento). Se aceptan como datos validados por
  forma y longitud; los valores válidos los publica el servicio.
- **Erratas del documento oficial**, admitidas explícitamente para no depender
  de cuál devuelva cada entorno: el código de retorno llega como `codigo` o
  `codigoRetorno`, y el Anexo II rotula el bloque como `resutadoComunicacion`
  (sin la «l»). Ambas grafías se leen.
- **Códigos de error**: se implementa la tabla del apartado 5 de la v3.1.2
  (incluida la retirada de 10104 y 10123 y la incorporación de 10159). Un
  código nuevo se muestra tal cual, sin romper.

## 10. Operación

- **Homologación con el Ministerio**: el plan de validación contra el entorno
  de pruebas real (`hospedajes.pre-ses.mir.es`) está en
  `docs/hospitality-mir-homologacion-plan.md`, con su banco de ejecución
  (`scripts/homologacion-mir.mjs`, apagado por defecto: exige
  `MIR_HOMOLOGACION=1` y solo observa — las peticiones salen siempre del
  producto). Con el apagador activo, el servicio rechaza a cualquier tenant
  cuyo entorno no sea `pre`: la homologación no puede colarse en producción.
- **Cron `hospitality-registro-viajeros`** (`30 * * * *`): envía los partes
  pendientes de reservas cuyo servicio ya empezó, consulta los lotes y anula los
  de reservas canceladas, y **avisa por email a cada hotel con partes sin
  reintentar nuevos desde su último aviso** (§8, «Y el hotel se entera por
  email»). Aparece en el panel de estado de crons
  (`/api/cron-status`, visible en `/admin/hospitality` y en la configuración del
  tenant). Una pasada por hora deja el plazo legal de 24 h cubierto con margen.
- **Los partes que el barrido deja de reintentar salen en el panel, por tenant.**
  (Para el hotel, en su propio panel: ver §8, «El abandono no se queda en el
  panel de la plataforma».)
  Cada pasada cuenta los rechazados con los intentos agotados —que no aparecen en
  ningún otro contador, porque no se envían *porque no se van a enviar*— y el job
  los publica como **avisos** del último resultado: «*Hotel Uno*: 2 parte(s) sin
  reintentar…». No es un error del cron (por eso no va en rojo) pero es trabajo
  que se ha quedado sin hacer, y verlo en el panel evita ir reserva a reserva. Los
  avisos describen la **última** pasada: se limpian solos en cuanto una pasada no
  tiene nada que avisar, para no arrastrar un problema ya resuelto. El resumen de
  la línea también lo dice (`… · 3 sin reintentar`), y el mismo resumen y los
  mismos avisos salen tanto si el job lo lanzó el scheduler como si lo disparó el
  endpoint por HTTP.
- **Ventana de recuperación**: siete días hacia atrás, para que un parte que no
  salió (servicio caído, configuración recién hecha) no se pierda.
- **Trazabilidad**: cada comunicación guarda su XML, el lote, el código de
  comunicación asignado, la descripción de la respuesta, los intentos y los
  errores — la constancia documental que el propio RD 933/2021 exige.

## 11. Guardias

`tests/hospitality-registro-viajeros.test.ts` (43) — contrato, XML (parte y
reserva), ZIP, SOAP, validaciones, lectura de respuesta —**incluido qué es una
respuesta y qué no** (`esRespuestaMIR`: un 503 en texto plano y un `Fault` de
SOAP no deciden nada sobre el parte)— y que no exista un namespace de `RH`
inventado.
`tests/hospitality-registro-viajeros-service.test.ts` (42) — endpoint oficial,
autenticación básica, traza, rechazos, la compuerta de `RH`, que un parte
incompleto no sale y que **una caída del servicio no se guarda como rechazo**
(tanto el fallo de red como el HTTP de error sin cuerpo SOAP quedan en `error`,
con el motivo de la no-entrega y sin código de retorno).
`tests/hospitality-guest-checkin.test.ts` (34) — los datos del huésped: qué se
normaliza, qué se guarda, qué se hereda y, sobre todo, **que «puede salir el
parte» coincide exactamente con lo que dice `validarParteViajeros`** en un
catálogo de 18 fichas (completas, a medias, con documento inválido, con menores,
con dirección mal). Si divergen, el huésped rellena el formulario y el parte
sigue sin salir: ese es el fallo silencioso que impide este test.
`tests/hospitality-checkin-api.test.ts` (16) — token como credencial, 404/410,
prerrelleno, guardado en `guestData`, herencia con consentimiento y **cuándo se
envía al Ministerio** (completa y ya empezada sí; completa pero futura no;
incompleta nunca), y qué se le responde al huésped cuando el servicio está caído
(`sin_entrega`, estado `error`, nunca «rechazado» ni «sin configuración»).
`tests/hospitality-checkin-ui-guard.test.ts` (12) — la pantalla del huésped
habla solo con su API, todos sus textos salen del i18n y la herencia de la
dirección es un consentimiento explícito.
`tests/hospitality-checkin-page.test.tsx` (4) — la página montada de verdad:
el huésped completa los documentos y lo que viaja al servidor es la lista de
viajeros con el titular primero (grepear el fuente no ve un formulario que no se
puede rellenar).
`tests/cron-hospitality-registro-viajeros.test.ts` (15) y `…-route.test.ts` (6)
— barrido, panel de estado y coherencia con el scheduler: que el tope de intentos
del barrido y el que enseña la pantalla sean la misma cifra, que el recuento de
abandonados se haga por tenant y con la regla del módulo (sin canceladas ni
no-shows), y que el scheduler publique el mismo resumen y los mismos avisos que
el disparo por HTTP.
`tests/cron-status.test.ts` (8) y `tests/cron-status-panel.test.tsx` (3) — el
store de estado (los avisos son del último resultado: se limpian al arrancar la
siguiente pasada y con un error) y el panel que los pinta.
`tests/admin-hospitality-crons-avisos.test.tsx` (2) — el panel de operación
(`/admin/hospitality`): enseña los partes abandonados **por tenant** sin dejar de
marcar el job como OK.
`tests/hospitality-parte-rechazo.test.ts` (40) — el diagnóstico del rechazo y el
de la **no-entrega**, sin BD: la ruta del campo del servicio traducida al
formulario (y lo que NO es del huésped), el ámbito por código y por texto, las
dos formas en que llega un error, que el `0` del alta no clasifica nada, que una
caída no acusa a ningún dato del huésped, y cuándo el barrido ha abandonado el
parte (el rechazado y el no entregado con los intentos agotados; el incompleto
nunca), y la **escala del backoff**: la espera crece con cada intento gastado
con tope en el último peldaño, solo está disponible cuando el peldaño que toca
ya pasó, el tope de intentos manda antes que cualquier espera, un intento
ausente no se inventa reintentos y una caída de una mañana ya no recibe el
parte cinco veces en cinco horas.
`tests/hospitality-reservas-parte.test.tsx` (14) — el aviso de la pantalla de
reservas: avisa (y con qué) solo a quien le falta el parte, no a la ya comunicada
ni a la cancelada, y abre el formulario del parte desde la propia fila; y el
rechazo, que es otro aviso: su motivo, su campo a corregir, que un rechazo de
configuración **no** manda al hotel a rellenar datos del huésped, y que cuando el
barrido se ha rendido se dice —con sus intentos y con la acción renombrada— en
vez de dejar creer que el producto sigue insistingendo; un rechazo con intentos
de sobra no anuncia ningún abandono, el reintento llama a la acción que reenvía
de verdad y el aviso pide el enlace de check-in para que lo rellene el huésped.
`tests/hospitality-reservations-api.test.ts` (26) — el estado del parte por
reserva calculado en lote («sin ninguna ficha» frente a «campos por revisar») y
la no-entrega (`sinEntregar` con su fallo de envío y sin campos del huésped),
para que la pantalla no tenga que pedirlo reserva a reserva; y, como
diagnósticos auxiliares de la misma respuesta, el mapa de preguntas del hotel
que alimenta el CSV — con la lista resistente a que esa consulta caiga.
`tests/hospitality-registro-viajeros-ui-guard.test.ts` (17) — que la página y la
API no hablan con nadie que no sea el servicio oficial, que solo los inmuebles
PUBLICADOS entran en el flujo (son los que emiten partes), que las preguntas
personalizadas del hotel no tocan el parte (el XML es del Ministerio), y que el
panel del hotel
enseñe los partes sin reintentar con su motivo y su arreglo, con el aviso y la
lectura del módulo puro (ningún umbral en la página).
`tests/hospitality-partes-metrics.test.ts` (25) — las métricas del abandono de
partes, sin BD: la clasificación del ciclo (el incompleto con intentos agotados
**no** es un abandono), la tasa sobre los partes cerrados, el **desglose por
causa** (sin entregar frente a rechazado) y que el conteo agregado del panel y
las filas de Reportes den el mismo resultado — el hotel no puede leer dos tasas
distintas de su propio abandono.
`tests/hospitality-registro-viajeros-abandono.test.tsx` (9) — la tarjeta del
panel montada de verdad: sin abandonados no aparece, con ellos nombra la
referencia, el motivo y qué corregir, un rechazo de configuración no manda al
formulario del huésped, una no-entrega se nombra como tal (y no como rechazo),
reenviar llama a la acción real, y en las «últimas comunicaciones» solo la fila
abandonada cambia el verbo a «reenviar».

La guardia más importante es la de «solo el Ministerio»: lee el código fuente
del módulo y falla si aparece cualquier host que no sea del `mir.es`.
