# Hospitality (PMS + Booking Engine) — Resumen ejecutivo

> **Para:** dirección del hotel / cliente del piloto.
> **Propósito:** qué es, qué está probado hoy, el guion de la sesión de una hora y los datos que conviene traer decididos. Una página.
> **Fecha:** 21 de septiembre de 2026.

## En una frase

El hotel que se vende solo: tus canales, tu calendario y tus cobros en un mismo
sistema, sin comisión por reserva y sin hojas de cálculo.

## Qué hace hoy (y está probado)

| Pieza | Qué resuelve |
|---|---|
| **Planning** | Calendario por unidad (semana y mes) con bloqueos por tipo (propietario, mantenimiento, administrativo), tareas de limpieza y mantenimiento, y check-in/check-out operativo. |
| **Dashboard** | La operación de un vistazo: ocupación, KPIs, mix de canales y tareas del día. Con el **tablón de «Movimiento de mañana»**: las llegadas y salidas del día siguiente con huésped y unidad, para preparar asignaciones y limpiezas antes de que pasen. |
| **Reservas** | Alta manual, webhook de canal y motor público, con desglose de cobro y rentabilidad desde el minuto uno. Y el **flujo diario de recepción**: la fila «Hoy» con las llegadas y salidas del día — contador y filtro a la vez —, **en rojo las llegadas a las que aún les falta el parte de viajeros**, y en cada fila el teléfono, el email y las respuestas a tus preguntas del check-in; la lista se exporta a CSV tal como se ve, **y sale en papel para el pasillo**: la hoja imprimible de housekeeping con unidades, la nota de limpieza y una casilla por fila para marcar la unidad limpia — y la **hora que el huésped respondió** destacada cuando la dio, ordenando las llegadas por trabajo real en vez de la convención de 15:00. |
| **Motor de reservas** | Página pública propia (enlace/embed) con tu marca y tu precio, **en español e inglés** (enlace `?lang=en` para tu web internacional). El huésped paga con tarjeta y **el dinero entra íntegro en tu cuenta**: 0 % de comisión de plataforma. |
| **Conectividad** | Inventario y tarifas publicados a los canales, reservas entrantes por webhook, reconciliación diaria de divergencias y panel de incidencias con vinculación automática revisable. |
| **Huéspedes y comunicaciones** | Ficha del huésped con su historial y valor, y mensajes automáticos (confirmación, pre-llegada, post-estancia) **en el idioma del huésped**: quien reservó en inglés los recibe en inglés, con fechas e importes localizados. La **pre-llegada además recuerda lo que falta**: si el hotel preguntó algo obligatorio en el check-in y el huésped no lo respondió, el email se lo nombra en su idioma, con el enlace directo al formulario. |
| **Finanzas de la reserva** | Ingreso bruto, comisiones de canal, gastos del ERP imputados con su IVA, margen, cobrado y pendiente. |
| **Reportes** | ADR, RevPAR, estancia media, no-shows, cancelaciones y antelación media/mediana, con exportación CSV. En operación, los dos abandonos que cuestan dinero: **holds caducados** frente a confirmados y **partes de viajeros sin reintentar** frente a aceptados por el Ministerio, cada uno con su tasa, su lectura y las columnas del CSV. En ventas, **reservas directas por idioma (ES vs EN)**: cuota del inglés sobre las reservas directas y su lectura — si la web internacional convierte o si el enlace `?lang=en` no está llegando. Y la **tasa de respuesta de las preguntas obligatorias**: si los recordatorios de la pre-llegada funcionan o si hay reservas sin email ni teléfono a las que nada puede llegar. |
| **Registro de viajeros** | La comunicación de los huéspedes al **Ministerio del Interior** sale sola, por el servicio oficial de hospedajes y dentro del plazo legal de 24 h desde el inicio del servicio (RD 933/2021). Pantalla propia con el estado de cada parte (aceptado, esperando lote, rechazado o con datos pendientes). **Los datos que el canal no manda los aporta el propio huésped**: al reservar puede dejar su documento y, con el enlace de check-in que recibe por email (en su idioma), completa los de todo su grupo desde el móvil — así ni tu equipo persigue a nadie ni hay ningún dato inventado, porque un parte con un documento inventado no sale. **Y tú preguntas lo tuyo**: además de los campos del Ministerio, el formulario de check-in lleva tus preguntas propias (hora de llegada, matrícula, mascotas…) con sus respuestas junto a cada reserva y en la lista del día exportable a CSV. |

## Las decisiones de producto de este ciclo

1. **El no-show no bloquea la habitación.** Un huésped que no se presenta deja de
   ocupar: la unidad vuelve al inventario vendible y a los canales, y la
   penalización se emite (y se factura) según la política del hotel — una noche
   por defecto. Cobrar y ocupar son dos hechos distintos, y ahora el sistema los
   separa.
2. **Salida anticipada: tú eliges qué pasa con las noches no usadas.** Con
   «registrar la salida real» (por defecto) la habitación vacía se libera sin
   tocar las noches vendidas ni las métricas; con «cerrar la estancia» la reserva
   se acorta. Se configura por propiedad y el cambio avisa al equipo.
3. **Los holds caducan.** Una reserva pendiente de confirmación bloquea la unidad
   solo durante su ventana (24 h por defecto, ajustable, o desactivado). Si nadie
   la confirma, se cancela sola, la unidad se libera y el equipo recibe el
   resumen. **Un hold con pagos registrados nunca caduca solo**: eso lo decide
   una persona. Y en **Reportes** el hotel ve *holds abandonados* (caducados
   frente a confirmados) con su tasa: si sube de forma sostenida, o la ventana de
   retención es más corta que el tiempo que tardan en decidir, o los canales
   están confirmando tarde — el aviso lo dice con esas dos causas, sin alarmar
   cuando el volumen todavía es ruido.
4. **Lo que no se comunica, se ve — y se avisa.** Un parte de viajeros que el
   Ministerio rechaza, o que no llega porque el servicio está caído, se
   reintenta con esperas que crecen (1 h, 2 h, 4 h…) hasta un tope de 5
   intentos; agotado, **el sistema deja de intentarlo** y esa estancia se queda
   sin comunicar. Ya no depende de que alguien entre reserva a reserva:
   en **Registro de viajeros** aparecen los *partes sin reintentar* con el
   motivo y lo que hay que corregir (el dato del huésped, o la configuración
   del arrendador — que no se arregla rellenando formularios), en **Reportes**
   su tasa frente a los aceptados, y **el hotel recibe un email** en cuanto un
   parte nuevo se queda fuera: referencia, causa en palabras y qué hacer — no
   hace falta entrar a la plataforma para enterarse. Un parte **incompleto**
   nunca se contabiliza como abandonado: ese solo está esperando el documento.
5. **El hotel pregunta lo suyo en el check-in (cerrado y probado).** Cada
   propiedad define sus preguntas propias —hora estimada de llegada, matrícula
   para el parking, mascotas…— en español y en inglés, obligatorias u
   opcionales, y el huésped las responde **en el mismo formulario** del
   check-in, sin fricción extra. Las respuestas se ven junto a cada reserva y
   en la **lista del día exportable a CSV** (columna por pregunta, con
   teléfono y email listos para llamar). **Y si el huésped no las respondió,
   la pre-llegada se lo recuerda**: el email de antes de la llegada nombra la
   pregunta pendiente en su idioma, con el enlace del formulario — un toque
   desde el móvil y listo. En **Reportes** el hotel ve si funciona: la tasa de
   respuesta de las preguntas obligatorias, con aviso cuando la mayoría no
   responde. La línea que no se cruza: el parte del Ministerio es un formato
   cerrado — **lo del hotel nunca viaja al parte**, y «borrar» una pregunta
   conserva las respuestas ya guardadas.

## Estado verificado (21 sep 2026)

- **7.529 pruebas automáticas en verde** (412 ficheros), typecheck y lint limpios.
- **Ensayos de punta a punta contra el sistema real:** **160 comprobaciones del
  motor de reservas** (incluyen una retención que caduca sola y la unidad que
  vuelve a venderse por la página pública, el ciclo completo en inglés —
  reserva con `?lang=en` que nace con su idioma para las comunicaciones —, el
  ciclo completo del registro de viajeros: parte rechazado, parte que el
  servicio no recibe, abandono tras el tope de intentos, **email de aviso al
  hotel** y rescate al reenviar —, **el ciclo de las preguntas del hotel:
  crearla, responderla desde el móvil y verla en la lista de reservas** — y
  **el recordatorio de la pre-llegada**: con una pregunta obligatoria sin
  responder, el email real que envía el sistema la nombra en el idioma del
  huésped, ES y EN, con su enlace, y repetir el envío no lo duplica) y
  **76 del ciclo de no-show**, disponibilidad y salida anticipada (incluye que
  la vista de planning deja de pintar las noches liberadas).
- El ciclo completo se ha recorrido con HTTP real: publicar propiedad, vincular
  canales, reservar, marcar no-show, facturar la penalización por el ERP y cobrarla.

## Cumplimiento del registro de viajeros

El producto **no** usa agregadores ni APIs de terceros para esta obligación: se
habla directamente con el servicio del Ministerio (interfaz v3.1.2) y hay una
prueba automática que lo verifica sobre el propio código. Para arrancar solo
hacen falta los datos que entrega la Sede Electrónica (código de arrendador,
usuario y contraseña) y el código de establecimiento de cada inmueble; el resto
—envío, consulta del lote, anulación si se cancela la reserva y reintentos
espaciados, y el aviso por email si una estancia se queda sin comunicar— ya
está automatizado. La comunicación de **reserva** (el otro momento que exige el
RD, al formalizar el contrato) está construida y probada de punta a punta; solo
le falta un dato que entrega el propio Ministerio —el esquema oficial de ese
mensaje, que no está publicado en abierto— y se activa en cuanto llegue. Hasta
entonces el producto **no la emite**: no se envía nada con un formato supuesto.
La validación contra el **entorno de pruebas real del Ministerio**
(homologación) tiene su plan escrito y su banco de ejecución con apagador;
arranca en cuanto el hotel facilita sus credenciales de pruebas
([plan de homologación](./hospitality-mir-homologacion-plan.md)).

Más detalle: [docs/hospitality-registro-viajeros-mir.md](./hospitality-registro-viajeros-mir.md)

## Lo que queda para el arranque

1. **Go-live con tu PMS/canal real** — depende de tu proveedor: acuerdo, alta de
   credenciales, ensayo controlado y corte con vuelta atrás. El procedimiento
   operativo (etapas, responsables y checklist) ya está escrito y probado contra
   un simulador; se ejecuta con tu conectividad el día que se firma.
2. **Precio público de la vertical** — decisión comercial, en pausa hasta el
   piloto.

**Límites por diseño (no prometer):** la factura del huésped no se emite desde la
reserva — el ERP sí la emite con Veri*Factu en **España**, mientras que en
**México no hay timbrado CFDI** (si la operación lo exige, la factura se emite en
su contabilidad y Volkern aporta el desglose) —; y el cobro en línea es de la
reserva directa — las de canal se liquidan por su circuito y se registran a mano
en Finanzas.

**Cómo se cobra, en claro (para no sorprender en la propuesta):** un plan de software por
tamaño del hotel **más un add-on de conectividad por tramo de unidades vendibles** — la
conectividad tiene un coste variable propio que crece con el número de unidades que se venden
por separado (un apartamento que se alquila completo cuenta como una), así que se factura
aparte y no se esconde dentro del plan. El 0 % por reserva no cambia: la pasarela cobra su
procesamiento y el dinero del huésped entra en la cuenta del hotel.

## Guion de la sesión (60 minutos)

Objetivo: salir con **fecha de ensayo con el proveedor** y **las políticas de
cada propiedad elegidas**. Procedimiento de referencia:
[`hospitality-go-live-pms-guia.md`](./hospitality-go-live-pms-guia.md).

| Min | Bloque | Contenido | Salida |
|---|---|---|---|
| 0–10 | Demo (10') | Planning con una reserva de canal y una directa; **el tablón de mañana con sus llegadas y salidas**; el día de recepción en reservas (la fila «Hoy» con sus llegadas y salidas, las llegadas sin parte en rojo, y **la hoja de housekeeping impresa — unidades, horarios, notas de limpieza y casillas—**); motor público en ES y EN; Reportes (ocupación, no-shows, holds abandonados, partes sin reintentar, ES vs EN, tasa de respuesta de las preguntas). Registro de viajeros con el ciclo completo: aceptado, rechazado con su corrección, el email de aviso de un parte abandonado, **el formulario del huésped con las preguntas del hotel, el recordatorio de la pre-llegada y la lista del día exportable a CSV**. | — |
| 10–20 | Ensayo con el proveedor (10') | Etapa 0 de la guía: qué necesitamos de su proveedor (URLs de endpoints, credenciales, contacto técnico) y qué es el ensayo controlado (etapa 2): book idempotente, cancel y no-show entrantes, push de disponibilidad, reconciliación. Todo tiene vuelta atrás (etapa 3). | Los tres datos en la mesa; si no están, responsable y fecha para traerlos. |
| 20–30 | Fecha del ensayo (10') | Ventana de 2–5 días con calendario real del hotel y tráfico controlado, antes de abrir ventas. | **Fecha comprometida** en el calendario. |
| 30–50 | Políticas por propiedad (20') | Elegir para cada propiedad: **no-show** (cargo de 1 noche por defecto: ¿sí/no? ¿distinta?), **salida anticipada** («registrar la salida real» por defecto vs «cerrar la estancia») y **caducidad de holds** (24 h por defecto: ¿la subimos o la bajamos? ¿desactivamos?). | Las tres decisiones anotadas por propiedad; se aplican en configuración ese día. |
| 50–60 | Cierre (10') | Dudas; qué verá el hotel la primera semana (incidencias y divergencias a cero, holds revisados en su pestaña Operación); **borrador de las preguntas propias del check-in** (2–4, ES/EN); siguiente hito. | Acuerdos y responsables por escrito. |

**Traer decidido (si se puede, antes de la sesión):** el contacto técnico del
proveedor, qué canal se conecta primero, si las políticas del punto 4 son iguales
para todas las propiedades o cambian por tipo (hotel / apartamentos) y **qué
quiere saber el hotel de sus huéspedes en el check-in** (las 2–4 preguntas
propias, si las hay — hora de llegada y matrícula son las más comunes).

## Referencias

- Pack comercial (ICPs, competencia, argumentarios, FAQ y validación del precio):
  [`COMMERCIAL-HOSPITALITY.md`](./COMMERCIAL-HOSPITALITY.md)
- Plan funcional completo: [`hospitality-booking-payments-plan.md`](./hospitality-booking-payments-plan.md)
- Procedimiento de go-live: [`hospitality-go-live-pms-guia.md`](./hospitality-go-live-pms-guia.md)
- Contrato técnico de conectividad: [`hospitality-connectivity-contract.md`](./hospitality-connectivity-contract.md)
- Ensayos: [`hospitality-booking-engine-e2e.md`](./hospitality-booking-engine-e2e.md), [`hospitality-no-show-e2e.md`](./hospitality-no-show-e2e.md)
- Homologación con el Ministerio: [`hospitality-mir-homologacion-plan.md`](./hospitality-mir-homologacion-plan.md)
