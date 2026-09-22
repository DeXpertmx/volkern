# Homologación del registro de viajeros contra el Ministerio (SESHospedajes)

Plan de validación del módulo de registro de viajeros (RD 933/2021) contra el
**entorno de homologación real del Ministerio** — el que el propio servicio
llama «pruebas», host `hospedajes.pre-ses.mir.es` — no solo contra nuestro mock
del ensayo E2E.

**Por qué este plan existe.** El mock del ensayo (`hospedajes-web/ws/v1/comunicacion`
en loopback) verifica que el producto HACE lo que creemos que hace: sobre SOAP
correcto, lote consultado, rechazo leído. Lo que NO puede verificar es que el
Ministerio ACEPTE eso que hacemos. La homologación es la prueba contraria y
complementaria: hablar con el servicio de verdad y que sea ÉL quien diga «código
0, comunicacion número X». Difiere en tres cosas que un mock no puede
reproducir: la respuesta real del servicio (tramas, códigos y textos que no
están en el documento v3.1.2), el comportamiento del ZIP (compresión real
frente a la que el servicio espera) y los plazos reales de resolución de lotes.

**Principio que lo gobierna todo**: `HOSTS_MIR_OFICIALES` y la guardia del
módulo (`endpointParaEnvio`) solo permiten hablar con los dos hosts oficiales.
Este plan no añade ninguno: usa el entorno `pre` que ya existe en
`ENDPOINTS_MIR` y la configuración «Entorno: pruebas» que la pantalla ya
ofrece.

---

## 0. Precondiciones (lo que hay que tener ANTES de tocar el producto)

| # | Precondición | De dónde sale | Nota |
|---|---|---|---|
| 1 | Registro de la entidad arrendadora en la Sede Electrónica | Sede Electrónica del Ministerio | Un hotel piloto REAL, no una entidad de prueba de la plataforma |
| 2 | **Credenciales del entorno de pruebas** (usuario y contraseña de servicio web, distintos de los de producción) | Carta/email de alta del servicio de Hospedajes | Sin ellas ni el WSDL responde (ya lo comprobamos: HTTP 401) |
| 3 | Código de arrendador y código(s) de aplicación | Idem | El código de aplicación se declara con nombre de la nuestra (máx. 50 caracteres) |
| 4 | Código(s) de establecimiento de pruebas | Alta del establecimiento en la Sede (modo pruebas) | Uno por propiedad del piloto |
| 5 | Fichero(s) XSD oficiales si el servicio los entrega con las credenciales | Mismo paquete de alta | **Objetivo crítico**: de ahí sale el `targetNamespace` del alta de reserva de hospedaje (`NS_ALTA_RESERVA`), la ÚNICA pieza pendiente del módulo (doc §9) |
| 6 | Hotel piloto con datos reales de viajeros para 2-3 estancias de prueba | Cliente del piloto | Los documentos deben ser VÁLIDOS pero la estancia puede ser ficticia dentro del entorno de pruebas |
| 7 | Ventana acordada con el hotel para probar (una mañana basta) | Planificación | El cron corre cada hora; algunas pruebas necesitan esperar resolución de lote |

Sin las precondiciones 1-4 no hay homologación posible: el servicio rechaza
todo con `10100`/`10101` (arrendador/aplicación no informados) o 401 de
autenticación, y eso solo demuestra que las credenciales no valen.

---

## 1. Qué NO es este plan (límites declarados)

- **No es un paso a producción.** Todo el ciclo ocurre en `pre`. La migración a
  prod es otro plan (rotación de credenciales, `Entorno: producción`, y la
  vigilancia del primer día de partes reales).
- **No prueba la plataforma completa.** Las pantallas, el check-in online y el
  cron ya están probados por el ensayo E2E con mock (160 comprobaciones).
  Aquí solo se valida el **contrato con el servicio**: XML, ZIP, SOAP,
  autenticación, lectura de respuesta y los plazos de lote.
- **No inventa casos.** La matriza de la sección 3 viene de los apartados de la
  especificación v3.1.2 que ya implementa el módulo, no de suposiciones.

---

## 2. Preparación del entorno (medio día)

1. **Aislar la prueba.** Crear (o dedicar) un tenant de homologación que no
   sea el del hotel en producción de la plataforma. Si se usa el tenant del
   piloto, se indica aquí y se restaura la configuración al terminar (el
   producto ya guarda la configuración previa — el ensayo la restaura, y aquí
   se aplica el mismo hábito manual).
2. **Configurar el registro en el tenant** (pantalla
   `/dashboard/hospitality/registro-viajeros` o API `accion: 'configurar'`):
   - Entorno: **pruebas** (debe resultar en `endpoint:
     https://hospedajes.pre-ses.mir.es/...`; se verifica con `accion:
     'estado'` o mirando la fila de `HospitalityMirConfig`).
   - Credenciales del servicio de pruebas (se guardan cifradas).
   - Código de arrendador y aplicación del alta.
   - Código de establecimiento de pruebas en la propiedad de prueba.
   - Un mapa de tipos de pago (mínimo: el tipo por defecto).
3. **Encender el registro** (`activo: true`) y comprobar que
   `tenantPuedeComunicar` responde `true`.
4. **Dejar el cron activo** (`hospitality-registro-viajeros`, cada hora) y el
   panel de estado visible, para observar las pasadas con datos reales.
5. **Congelar la traza de partida.** Guardar copia de la tabla
   `HospitalityGuestRegistryCommunication` antes de empezar: es el comparativo
   de «antes» para auditar cada fila que cambie.

Criterio de salida de esta fase: un parte de prueba manual (`accion: 'enviar'`
desde la API con una reserva real de la propiedad) llega a `enviada` con un
lote REAL distinto de `E2E-LOTE-1` (el del mock). Con eso sabemos que
autenticación, sobre SOAP, ZIP y XML pasan el primer filtro del servicio.

---

## 3. Matriza de casos de homologación

Se ejecutan con reservas reales del piloto, marcando `referencia` con el
prefijo `HOM-` para poder retirarlas y auditarlas después. Cada caso anota:
petición enviada (XML de la traza), HTTP, código de retorno, lote si lo hay, y
estado final en la traza.

### 3.a Camino feliz del parte de viajeros (PV) — apartado 3.1.1.1

| # | Caso | Esperado | Qué valida |
|---|---|---|---|
| 1 | Alta PV con viajero titular con documento válido, 1 persona | HTTP 200, retorno `0`, lote; luego consulta → `codigoComunicacion` asignado y estado `aceptada` | Todo el ciclo: XML, ZIP+Base64, SOAP, autenticación, alta asíncrona y consulta |
| 2 | Alta PV con 2 personas (titular + acompañante, parentesco) | Igual que 1 | El bloque `persona` repetido y `parentesco` |
| 3 | Alta PV con dirección española completa (CP + municipio reales) | Igual que 1 | `direccion` con `codigoMunicipio` del INE: es el campo más frágil de la matriza |
| 4 | Consulta de un lote que todavía NO se ha resuelto (consulta inmediata tras el alta) | Respuesta sin resultado final o «en proceso»; la traza NO cambia a aceptada | `leerRespuestaMIR` con respuesta parcial, y `enVuelo()` |
| 5 | Consulta del mismo lote cuando el servicio lo resuelve | `codigoComunicacion` + estado `aceptada` en la traza | El camino del cron (bloque 2 del barrido) con datos reales |

### 3.b Anulación (operación `B`) — apartado 3.1.1.3

| # | Caso | Esperado | Qué valida |
|---|---|---|---|
| 6 | Anular la comunicación del caso 1 (la reserva se cancela en el producto) | Retorno `0` y estado `anulada` en la traza | `construirXmlAnulacion` + `anularComunicacion` con el `codigoComunicacion` real |
| 7 | Anulación de un `codigoComunicacion` INEXISTENTE | Código de error del servicio; la traza queda coherente | Que un rechazo de anulación no corrompa el estado ni la UI |

### 3.c Rechazos reales — tabla de códigos del apartado 5

| # | Caso | Esperado | Qué valida |
|---|---|---|---|
| 8 | Alta con `codigoArrendador` vacío (se borra temporalmente de la configuración) | `10100` rechazado; la pantalla de reservas muestra «Corregir los datos»/configuración, no «reintentar» | El catálogo REAL de errores contra el que escribimos las descripciones |
| 9 | Alta con documento con letra inválida (NIE/NIF mal) | `10121`/`10130` con la RUTA del campo en el mensaje | `campoDeRutaMIR` con las rutas que el servicio REALMENTE nombra (las del documento son hipótesis hasta hoy) |
| 10 | Alta con `codigoMunicipio` inexistente | Código de la tabla que aplique | El mismo objetivo: contrastar el catálogo |
| 11 | Alta con contraseña errada (se pone una credencial mala a propósito) | 401 o Fault de SOAP; la traza queda en `error` (no en `rechazada`) | La regla ya implementada: «un 503/401/Fault no es un rechazo del Ministerio». Ahora con el servicio real de testigo |
| 12 | Alta con el ZIP manipulado (XML corrupto dentro) | Error de formato (`2`: lote con errores en cabecera o formato) | Que el servicio realmente descomprime lo que mandamos y que los errores de formato se leen |

### 3.d Reserva de hospedaje (RH) — apartado 3.1.1.2

| # | Caso | Esperado | Qué valida |
|---|---|---|---|
| 13 | **XSD y namespace de RH.** Con el fichero XSD de las credenciales (precondición 5) se extrae el `targetNamespace` y se informa `NS_ALTA_RESERVA` + su procedencia; el test de guardia ya exige que vengan juntas | El alta de RH sale del estado `pendienteXsd` y se puede emitir | La única pieza pendiente del módulo — sin este paso, RH no se homologa y queda documentado como tal |
| 14 | Alta RH al formalizar una reserva (titular con `TI`, contacto, sin documento si el canal no lo dio) | Retorno `0` + lote, luego aceptada | Toda la estructura deducida de la tabla 3.1.1.2: establecimiento dentro de `comunicacion`, `persona` sin `soporteDocumento` ni `parentesco` |
| 15 | Alta RH con titular sin documento | O pasa (el documento no es obligatorio en RH) o devuelve el código que toque; se documenta la respuesta REAL | La decisión ya tomada («la dirección es opcional; el documento se espera») frente al servicio real |

### 3.e El ciclo completo del producto (lo que hace solo)

| # | Caso | Esperado | Qué valida |
|---|---|---|---|
| 16 | Dejar que el **cron** procese el piloto una jornada completa (partes, lotes, anulaciones) | Panel de estado con las pasadas en verde y contadores coherentes con la traza; avisos solo si toca | El barrido horario contra el servicio real, no contra el mock |
| 17 | Un parte rechazado se deja agotar los intentos (backoff 1h→16h, 5 intentos) | Email de aviso al hotel + tarjeta «Partes sin reintentar» + `abandonados` en el panel | El abandono y su aviso con un rechazo REAL (no fabricado) |
| 18 | El hotel corrige el dato y reenvía | Parte aceptado y avisos limpiados | El desenlace completo del ciclo con el servicio de testigo |

Criterio de salida de la fase: los 18 casos ejecutados o marcados como
**no ejecutables con la causa documentada** (p. ej. el 13 si el Ministerio no
entrega el XSD en el alta). Cualquier diferencia entre el comportamiento
esperado y el real se convierte en dos cosas: una fila en la sección «Lo que
aprendió la homologación» del doc MIR y, si procede, un cambio de código con
su test.

---

## 4. Cómo se ejecutan los casos (sin romper las guardias)

La plataforma tiene una regla dura: `endpointParaEnvio` solo deja hablar con
los hosts del Ministerio, y el override `MIR_E2E_ENDPOINT` (mock) se ignora en
producción. Para la homologación **no se salta ninguna guardia**: el entorno
`pre` es uno de los dos destinos legítimos.

Por caso:
- **Configuración y acciones manuales** (casos 1-12, 14, 15): desde la
  configuración del registro del tenant o por API
  (`/api/hospitality/registro-viajeros` con `accion: 'enviar' | 'consultar' |
  'anular'`), con las reservas `HOM-` creadas en el piloto.
- **Ciclo autónomo** (casos 16-18): el cron hace su trabajo; la observación es
  pasiva (panel de estado + traza + logs).
- **Trazado**: cada petición queda en la traza con su XML (la constancia que
  exige el RD); para el análisis offline, las tablas
  `HospitalityGuestRegistryCommunication` y `HospitalitySyncLog` son la fuente
  de la verdad.

---

## 5. Riesgos y salvaguardas

| Riesgo | Salvaguarda |
|---|---|
| Enviar partes de PRUEBA por error a producción | El tenant de homologación está en `Entorno: pruebas` y se verifica el endpoint ANTES del primer envío (fase 2); la pantalla muestra el entorno activo |
| Ruido legal: datos de personas reales en entorno de pruebas | Usar los datos del piloto que el propio hotel comunicaría de todos modos; si no, los mínimos y con consentimiento del hotel. El entorno `pre` es del propio Ministerio y exige las mismas credenciales |
| Machacar el servicio con reintentos durante las pruebas | El backoff ya limita a 5 intentos (1h, 2h, 4h…); para los casos manuales, usar `accion: 'enviar'` con intención y no en bucle |
| Confundir «no respondió» con «rechazó» (lo que ya nos costó un bug) | Ya resuelto en código (`esRespuestaMIR`); los casos 11 y 12 lo re-verifican con el servicio real |
| Dejar la configuración apuntando a pruebas tras la homologación | Paso de cierre explícito (sección 6): restaurar o migrar, y dejarlo escrito |

---

## 6. Cierre (lo que queda escrito)

1. **Actualizar el doc MIR** (`docs/hospitality-registro-viajeros-mir.md`):
   - Nueva sección «Lo que aprendió la homologación»: códigos reales vistos,
     textos reales del servicio, plazos reales de lote observados, y las
     diferencias (si las hay) frente al documento v3.1.2.
   - Si el caso 13 se ejecutó: `NS_ALTA_RESERVA` informado **con su
     procedencia** (de qué fichero XSD y qué entrega) y RH sale de la lista de
     límites del §9.
2. **Tests**: cualquier catálogo o texto que la homologación haya corregido,
   con su test; el catálogo de códigos del módulo solo crece con códigos
   REALES vistos en la respuesta.
3. **Decisiones de producto** documentadas: si el Ministerio rechaza algo que
   nuestro validador aceptaba, la validación del formulario se endurece al
   contrato real (con test), no a mano.
4. **Decisión de go-live**: con los 18 casos verdes y el piloto de acuerdo, el
   paso a `prod` es rotar credenciales y cambiar el entorno; el plan de
   vigilancia del primer día (panel de crons + email de partes abandonados)
   ya existe.

---

## 7. Qué NO cambia en el código para esta homologación

Nada. Este plan no modifica el módulo: todo lo que necesita ya existe — los
dos endpoints oficiales, el selector de entorno por tenant, las credenciales
cifradas, la traza auditable, el cron con backoff y tope, el aviso por email y
el panel de estado. Lo único que la homologación puede AÑADIR al código es el
`NS_ALTA_RESERVA` (del XSD oficial, caso 13) y los ajustes de catálogo que
solo el servicio real puede enseñar.
