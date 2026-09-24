# Comparativa Lodgify vs Hospitality — decisiones de producto (24 sep 2026)

> **Fuente de Lodgify:** página de precios capturada el 18/9/2026
> (`Vacation Rental Software Pricing & Plans | Lodgify.pdf`): Basic 16€ ·
> Starter 28€ · Professional 44€ · Ultimate 64€/mes por propiedad, 0% comisión
> de reserva. Es una herramienta para *hosts* de alquiler vacacional; Volkern
> es el ERP del negocio entero.
>
> **Qué es este documento:** el veredicto de cada hueco frente a Lodgify con
> la decisión de producto tomada por Bruno el 24/9, y —para los que se hacen—
> el cómo. Los huecos que dependen del proveedor (Vrbo/Google en su lista de
> canales) ya tienen su pregunta en el email; la respuesta se apunta aquí.

## 1. Veredicto por hueco

| Hueco frente a Lodgify | Decisión (Bruno, 24/9) | Estado |
| --- | --- | --- |
| Vrbo vía API | **No interesa: poco impacto; Expedia pesa más** | Cerrado — preguntar al proveedor igualmente (la lista completa de canales ya está en la pregunta 29 del email) |
| Google Vacation Rentals | **Manejarlo nosotros sin conflictos con el canal manager** | Diseño abajo (§2.1) — es un feed, no un canal del proveedor |
| Website builder | **Ya lo tenemos (Web Creator propio)**; falta crear las herramientas/páginas de hospitality en él | Pendiente de producto: conectores entre hospitality y Web Creator |
| iCal | **Se crea si vale la pena** | Recomendación abajo (§2.2): sí, pero después del go-live |
| 32 idiomas | **Añadir si no es problema** | Recomendación abajo (§2.3): sí, con frontera clara |
| Inbox IA / SMS | **IA: sí, aprovechar la que ya existe** (detalles §2.4). **SMS: aparcado** — email + WhatsApp lo cubren; se analiza si lo piden clientes | IA diseñada abajo; SMS en backlog con trigger de demanda |
| Dynamic Pricing | **Ya hay gestión de precios**; evaluar si es "dinámico" | Respuesta honesta abajo (§2.5): hoy es estático por noche; dinámico = capas |
| Smart Locks | **En negociación con una marca de cerraduras** para convenio con marca asociada | Seguimiento comercial — integración cuando haya convenio |
| Fianza / damage protection | **Falta información** — explicación abajo (§2.6) con opciones de resolución | Diseño propuesto abajo |
| Portal de propietarios (statements) | **Aparcado: hoy no vendemos a gestores**; se hará después | Backlog sin fecha |
| App de huésped | **PWA en vez de app nativa** — que no tenga que descargar nada | Diseño abajo (§2.7) |

**Nuestra arma invendible, que Lodgify no tiene:** registro de viajeros
MIR/SES.Hospedajes + ERP completo (Veri*Factu, contabilidad, CRM) + fichajes.
La comparativa de precios (16–64€/mes) compara con un producto de host; el
nuestro vende el negocio entero — el precio público sigue pendiente de
decisión comercial (así consta en la guía de go-live).

## 2. Las respuestas detalladas que pidió Bruno

### 2.1 Google Vacation Rentals — sí, sin conflictos con el canal manager

Google Vacation Rentals **no es un canal con reservas**: es un listado de
visibilidad. El huésped descubre tu propiedad en Google, y al reservar **cae
en tu web directa** (nuestro Booking Engine) o en el canal que corresponda.
No hay webhook de reservas de Google que chocar con las del canal manager.

**Diseño sin empalmes:**

1. **Origen único de disponibilidad:** el feed que le demos a Google lee del
   MISMO motor que el Booking Engine (`availability.ts`), no de una copia.
   Así lo que Google muestra es lo que el motor realmente tiene.
2. **El feed solo anuncia; nunca recibe reservas.** Si Google soporta booking
   links profundos, enlazan a la página de reserva propia del hotel — la
   reserva nace SIEMPRE por el Booking Engine, con su hold y su idempotencia,
   o por el webhook del canal manager. Un solo camino por origen, cero
   empalmes.
3. **Formato:** el estándar de Google es un feed XML/JSON de habitaciones y
   tarifas + `Last-Minute` actualizado periódicamente. Generarlo es un cron
   nuevo (o un endpoint cacheado) que lee disponibilidad y planes de tarifa —
   con la misma regla del motor: sin precio no se publica.
4. **Qué NO hace falta:** credenciales de terceros, mapping, Basic Auth. Es
   nuestro, se prueba con las mismas guardias que el Booking Engine.

**Tamaño estimado:** medio (feed + validación en Google Hospitality/Partner
Hub + prueba del link de reserva). Sí lo haría **después** del go-live del
piloto: primero vender, luego ampliar superficie de captación.

### 2.2 iCal — recomendación: sí, pero al final

iCal resuelve el problema que ya resuelve el canal manager (calendarios
sincronizados), solo que de forma inferior: sin importe, sin huésped, sin
modify (un cambio es borrar+recrear), y sin idempotencia real. **Su valor es
cero por sí solo y alto como último recurso**: cobertura para los canales
pequeños que ni el proveedor ni Google alcanzan (portales locales, paginas
propias de terceros, Airbnb sin API…).

**Recomendación:** crearlo, pero **después** del go-live. Cuando se haga:

- Exportar bloques de fechas (`checkout.ts`/`holds.ts` ya computan los
  períodos ocupados); importar bloqueos de reservas entrantes como
  `unidad_bloqueada` (protegido de doble reserva, NUNCA como reserva real).
- Por unidad, con token por URL (el feed expone el calendario; la URL es el
  secreto).
- Riesgo conocido: iCal no confirma — se puede dar de alta en dos portales y
  ambos venden las mismas noches; por eso nunca importa reservas completas.

### 2.3 Idiomas — sí, con frontera clara

No es problema añadir idiomas. La frontera para no explotar el alcance:

- **Sí se traduce**: la web pública del Booking Engine (formulario, textos,
  emails de confirmación) y el check-in online del huésped. Son cadenas
  cerradas, alto valor, bajo volumen de contenido.
- **No se traduce (nunca en v1)**: el backoffice (dashboard) del hotel.
  Un traducir-todo rompe las pruebas del backoffice (los guardias verifican
  textos ES) y el valor es bajo: el personal del hotel opera en su idioma.
- **Cómo**: `next-intl` o el mecanismo de locales de Next.js, empezando por
  EN (ya existe en parte: el contenido de extras es bilingüe) + PT/FR/DE si
  el mercado lo pide. El idioma se detecta del navegador con fallback a ES,
  y cada plantilla de comunicación por evento ya puede tener su versión por
  idioma (`hospitality_communication_templates` ya es por evento y canal —
  añadir el idioma es una columna/selector, no un rediseño).

**Tamaño:** pequeño-medio. Bien acotado, no bloquea nada.

### 2.4 IA — sí, y ya tenemos la base montada

La plataforma ya tiene un stack de IA propio (`lib/ai/`): cliente Gemma
(`gemma-client.ts`), filtro de PII (`pii-filter.ts`) y un router por agente
(`agents/gemma-router.ts`) que ya atiende ventas, soporte y connect. El
chatbot-processor no toca hospitality hoy — es territorio libre. Y
hospitality ya genera comunicaciones automáticas por evento
(`hospitality_communication_templates`): los disparadores existen, solo falta
el cerebro. **Aplicaciones concretas, por valor:**

1. **Autogestión del huésped vía chat** (la más valiosa): un asistente que
   responde "¿a qué hora es el check-in?", "¿hay parking?", "¿puedo llegar
   más tarde?" usando el contexto de la RESERVA y de la PROPIEDAD (normas,
   wifi, horarios). Está todo el dato en el sistema; el asistente solo lo
   consulta. Respuesta instantánea 24/7 sin cargar al operador — la "IA
   inbox" de Lodgify, pero con contexto real de reserva, que ellos no tienen.
   *Canal:* el mismo chat del check-in online o el WhatsApp del tenant.
2. **Sugerencia de respuesta para el operador**: en la bandeja de
   comunicaciones, sugerir el texto de respuesta con la reserva en contexto
   (patrón que ya existe en `suggest-reply` de otros módulos). El operador
   edita y envía — control humano, ahorra 80% del tiempo de redacción.
3. **Redacción inicial de plantillas**: cuando el hotel crea una plantilla
   por evento (confirmación, llegada, salida), sugerir el borrador bilingüe
   ES/EN partiendo de las normas y datos de la propiedad. Una vez por
   plantilla, no en cada envío.
4. **Resumen del briefing de hospitalidad**: como el Morning Briefing de
   ventas, un resumen diario de llegadas/salidas/pendientes con alertas de
   riesgo (reserva sin check-in completado, estancia que termina hoy sin
   parte aún no enviado al Ministerio…). Lee datos; no escribe nada.
5. **Traducción al vuelo de mensajes del huésped** (cuando el huésped escribe
   en alemán): la bandeja muestra la traducción junto al original. Se apoya
   en el mismo Gemma; sin nuevo pipeline.

**Qué NO haría (v1):** pricing dinámico con IA (decisión económica sensible
sin datos de demanda; primero las capas manuales de §2.5), y análisis de
sentimiento de reseñas (bajo valor real).

**Gobernanza que ya está resuelta en la casa:** el filtro PII existe
(`pii-filter.ts`), los agentes van por router, y el coste es el mismo
cliente Gemma que ya se usa. Cada nueva función es un skill nuevo del router,
no un sistema nuevo.

**Tamaño por aplicación:** 1 y 2 son medianas (skill + contexto de reserva +
UI); 3–5 son pequeñas. Empezaría por la 1 en cuanto el piloto esté vivo, con
datos reales que valgan la pena.

### 2.5 ¿Nuestro pricing es dinámico? — respuesta honesta

**Hoy, no.** La tarifa por noche sale de dos fuentes estáticas: el plan de
tarifa activo (rate plan) o, si no hay, la tarifa base de la unidad
(`tarifaPorNocheDe` en `pricing.ts`). No hay estacionalidad, ni fines de
semana, ni ajustes por ocupación.

Lo que Lodgify llama *Dynamic Pricing* es otra cosa: un motor que ajusta
tarifas por mercado y ocupación (lo venden como add-on, conectado a un
tercero como PriceLabs). Nuestra vía natural, en capas:

1. **Estacionalidad manual** (barata, la haría ya): listas de rangos por
   temporada y fin de semana sobre el rate plan — el hotel define "julio=
   120€", "viernes/sábado +20%". Todo determinista y auditable.
2. **Reglas por ocupación** (media): "si a 14 días vista la ocupación del
   mes va por encima del 70%, +15% en lo que queda" — reglas declaradas por
   el hotel, aplicadas por el sistema. Dinámico con control humano.
3. **Dinámico real con IA/tercero** (caro, posterior): PriceLabs-like o
   modelo propio. Solo con volumen de datos del piloto. Es el add-on que
   Lodgify cobra aparte; también lo podemos cobrar aparte.

Con las capas 1-2 ya superamos a Lodgify Basic/Starter (que no incluyen
dynamic pricing de serie) sin entrar en decisiones económicas automáticas.

### 2.6 Fianza / Damage protection — qué es y cómo lo resolveríamos

**Qué es:** en alquiler vacacional, el huésped deja garantía por posibles
daños a la propiedad. Lodgify la vende como add-on ("Damage Protection") con
dos modelos de mercado:

- **Depósito de seguridad (security deposit)**: pre-autorización de tarjeta
  por importe fijo (p. ej. 150€) al confirmar; se libera a los X días de la
  salida si no hay incidencias. El dinero nunca se cobra si todo va bien.
- **Seguro de daños (damage waiver)**: cuota pequeña por reserva (10–30€)
  que compra cobertura ante daños — la empresa cobra la cuota y el riesgo
  lo lleva la aseguradora. Lodgify integra un tercero; también existe el
  modelo "waiver propio" (el hotel cobra la cuota y asume el riesgo).

**Qué tenemos ya y qué falta:** el módulo Seguros del ERP existe, y
hospitality ya emite cargos (la penalización de no-show usa ese emisor con
las reglas de la propiedad). Falta el puente: ligar al flujo de reserva una
**garantía** (importe, tipo depósito/waiver, condiciones) y su ciclo de vida
(pre-autorizada al confirmar → liberada tras salida → cargo si hay daños).

**Cómo lo resolveríamos (en orden de coste):**

1. **Fianza manual de pago** (rápido): "manual payments" de la reserva —
   registrar fianza pendiente, cobrar por Stripe link/terminal del hotel,
   devolver a la salida. Sin pre-autorización real: depende del hotel. Una
   semana de trabajo, cubre el 80% del caso.
2. **Pre-autorización Stripe** (la solución de verdad): Stripe soporta
   `manual capture`/`separate auth & capture` — autorizar al confirmar la
   reserva (hold en la tarjeta), capturar solo si hay daños, liberar si no.
   Se integra en el flujo de pagos de la reserva; vence a los 7 días, así
   que hay que re-autorizar en estancias largas (Stripe no extiende holds).
   Dos-tres semanas de trabajo, requiere cuenta Stripe activa del hotel.
3. **Damage waiver con aseguradora** (posterior, comercial): convenio con
   una aseguradora como el de cerraduras — cuota por reserva, claim por
   panel. Requiere acuerdo comercial, no es software primero.

**Recomendación:** la 1 para el piloto si algún hotel la pide, la 2 como
feature seria del roadmap (encaja con el Stripe Connect que ya usamos), y la
3 cuando el convenio de la marca de cerraduras abra la puerta a otros
convenios con marca.

### 2.7 PWA de huésped — correcto, y ya hay base

Totalmente de acuerdo: **PWA, no app nativa**. El check-in online ya es la
experiencia del huésped (enlace por token, sin login); la PWA es esa misma
superficie ampliada: "mis reservas" por token, estado del check-in, normas,
wifi, mensajes del asistente (§2.4.1) y el enlace de reseña post-salida.
Instalable desde el navegador ("Añadir a inicio"), sin tienda, sin
descargas. El servicio worker es la parte nueva; el resto son páginas que ya
existen presentadas en contenedor de app.

## 3. Mensaje para el proveedor (añadir al hilo del email)

> Two follow-ups on channels, from our product planning:
>
> 1. **Channels list**: you'll already be answering question 29 (full list of
> channels you support). For our planning, could you confirm specifically
> whether **Vrbo** and **Google Vacation Rentals** are (or will be) among
> them, and in what timeframe if they're on the roadmap?
>
> 2. **Google Vacation Rentals**: our understanding is that GVR is a listing
> feed, not a bookings channel — guests book through the property's own site
> or a listed channel. If that matches your setup, we plan to run GVR
> ourselves (feed from our engine, bookings land on our direct booking
> engine). **Any conflict you see** with your channel manager if a property
> appears both on GVR (self-managed) and on Booking.com/Expedia/Airbnb
> (through you)? Anything we should avoid (e.g. double-listing the same
> unit, rate mismatches)?
>
> Context: Expedia is our priority channel; Vrbo is low-priority for our
> market. No action needed on Vrbo beyond the confirmation above.
