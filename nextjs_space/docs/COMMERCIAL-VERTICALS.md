# Estrategia Comercial y Verticales de Negocio

**Versión:** 2.1 · **Actualizado:** 17 de septiembre de 2026
**Propósito:** mapa completo de las verticales que Volkern ofrece, su estado real de
producto y cómo empaquetarlas para la estrategia comercial (a quién venderle, qué
vender hoy y qué vender en piloto).

Volkern no se comercializa como un software fragmentado (módulos sueltos), sino como el
**Sistema Operativo** integral para empresas. Cada vertical se empaqueta de forma que resuelva el
flujo de valor completo (End-to-End) de una industria específica, respaldado por la Capa de
Seguridad (Hardening) y la Inteligencia Artificial (Gemma).

---

## Cómo leer este documento

- **Estado de producto** es lo que hoy existe y funciona (verificable en el código y en los
  manuales); es lo que se puede vender sin sorpresas.
- La **matriz de hubs** (§8) muestra qué módulos consume cada vertical: casi todas comparten los
  mismos 7 hubs, y lo que se construya para una levanta a todas.
- Las **prioridades** (§9) ordenan el esfuerzo comercial por madurez del producto y claridad del
  comprador, no por entusiasmo.

---

## 1. Vertical Industrial (Smart Factory)

**El concepto:** "La fábrica que piensa, se auto-gestiona y blinda sus procesos."

* **Flujo Operativo:** MRP (Planeación) -> Producción (Work Orders) -> Inventario -> Facturación.
* **Hubs Principales:** Producción, Logística/Inventario, ERP/Finanzas.
* **Propuesta de Valor (Pitch):** "Volkern es el sistema nervioso de tu planta. Te dice exactamente cuánto te cuesta producir, automatiza tus requerimientos de material y garantiza matemáticamente (vía hash chaining) que cada tornillo de tu inventario está protegido contra fraude interno o alteraciones."
* **Factor Diferencial:** Inventario inmutable y orquestación automática de abastecimiento (AIOps de stock).
* **Estado:** Producto maduro (producción, BoM, calidad, inventario multi-almacén, finanzas Veri*Factu). Lista para venta activa.

## 2. Vertical Real Estate (PropTech Hub)

**El concepto:** "Cierres rápidos, propiedades seguras y flujo de caja garantizado."

* **Flujo Operativo:** Portafolio de Propiedades -> Gestión de Citas -> Firmas de Contratos -> Property Management (Cobros/Mantenimiento).
* **Hubs Principales:** CRM Inmobiliario, Portafolio (Catálogo especializado), Gestión de Contratos, Cobranza.
* **Propuesta de Valor (Pitch):** "Controla el ciclo completo de tus propiedades en una sola pantalla. Gemma agenda automáticamente las visitas con tus interesados. Al momento del cierre, Volkern genera contratos blindados con firma digital inalterable. Administra el cobro de rentas mes a mes sin persecuciones."
* **Factor Diferencial:** Seguridad jurídica extrema gracias a los "Contratos Blindados" (ContractSealer) y la gestión inteligente de citas.
* **Estado:** La vertical más documentada comercialmente (ver
  [`COMMERCIAL-REAL-ESTATE.md`](./COMMERCIAL-REAL-ESTATE.md): ICPs, pricing por plan, competencia,
  casos de uso, argumentos por canal). Lista para venta activa; es la vertical de referencia para
  replicar el material comercial del resto.

## 3. Vertical Servicios Profesionales (Enterprise Hub)

**El concepto:** "Crecimiento sin caos administrativo. Inteligencia Fiscal y Laboral."

* **Flujo Operativo:** CRM/Ventas -> Gestión de Proyectos -> Nóminas -> Cumplimiento Fiscal.
* **Hubs Principales:** Gestión de Proyectos, Finanzas, HR (Nóminas), Ventas.
* **Propuesta de Valor (Pitch):** "Unifica tu despacho o agencia. Vende más rápido, controla la rentabilidad de tus proyectos en tiempo real y ten la tranquilidad de que tus nóminas y facturas cumplen estrictamente con regulaciones como Veri*Factu, con auditorías inmutables generadas automáticamente."
* **Factor Diferencial:** Forecast Fiscal mediante IA (predicción de IVA e ingresos) y sellado digital de nóminas (PayrollSealer).
* **Estado:** Producto maduro (proyectos, RRHH/nóminas selladas, contabilidad y fiscal Veri*Factu). Lista para venta activa.

## 4. Vertical Hospitality (PMS + Booking Engine) — *nueva*

**El concepto:** "El hotel que se vende solo: canales, calendario y cobros sin gestión manual."

* **Flujo Operativo:** Calendario de unidades -> Motor de reservas y pagos -> Conectividad con
  canales (channel manager) -> Huéspedes en casa -> Facturación y desastres (no-shows) fiscales.
* **Hubs Principales:** Hospitality (calendario, reservas, pagos), Finanzas, Comunicaciones
  (confirmaciones y recordatorios al huésped), CRM.
* **Propuesta de Valor (Pitch):** "Conecta tu hotel con los canales sin perder el control. Cada
  reserva entra en tu calendario con su desglose de cobro y su rentabilidad; si un canal y tu PMS
  se desincronizan, Volkern lo detecta, te avisa y lo reconcilia — incluso cancelando por ti lo
  que el canal canceló y tú nunca supiste."
* **Pitch de venta directa (lo nuevo):** "Publica tu motor de reservas en tu propia web, con tu
  marca y tu precio. El huésped reserva y paga con tarjeta y **el dinero entra íntegro en tu
  cuenta**: Volkern no se queda comisión de tus reservas. Y lo que ningún channel manager te da:
  cuánto ganas por reserva —ingreso bruto, comisiones de OTA, gastos, margen, cobrado y
  pendiente— sin abrir una hoja de cálculo."
* **Factor Diferencial:** Cobro de la reserva directa **a la cuenta del propio hotel** (Stripe
  Connect, sin comisión de plataforma) + reconciliación de divergencias con acción revisada
  (cancelaciones auditadas), vinculación automática de unidades con revisión y deshacer, y panel
  de incidencias de conectividad: control operativo y financiero que los channel managers
  genéricos no dan.
* **Estado (18 sep 2026): plan completo.** Las fases 3.A–3.E de
  [`hospitality-booking-payments-plan.md`](./hospitality-booking-payments-plan.md) están cerradas y   **ensayadas de punta a punta** contra un servidor de desarrollo (60 comprobaciones en verde: se
  publica una propiedad, se reserva desde la página pública, la reserva entra en el planning y una
  retención sin confirmar caduca sola devolviendo la unidad a la venta — ver
  [`hospitality-booking-engine-e2e.md`](./hospitality-booking-engine-e2e.md)). Existe y funciona:
  PMS (propiedades, unidades, tarifas, planning con bloqueos por tipo —propietario, mantenimiento,
  administrativo—, tareas de limpieza y mantenimiento), motor de reservas público con enlaces y
  embed, cobro con tarjeta a la cuenta del hotel y captura de pagos manuales, finanzas por reserva
  (comisiones, cobros, pendientes, sobrepagos, margen) con los **gastos del ERP imputados** y su
  IVA, reportes (ADR, RevPAR, estancia media, no-shows, cancelaciones, antelación media y mediana)
  con exportación CSV, conectividad de canales con webhook de reservas, reconciliación diaria e
  incidencias, huéspedes y comunicaciones.  **Lista para venta activa con piloto acompañado.** El
  **pack comercial completo** (ICPs, competencia, argumentarios, FAQ, checklist del piloto y cómo se
  valida el precio) está en [`COMMERCIAL-HOSPITALITY.md`](./COMMERCIAL-HOSPITALITY.md), copiado del
  esqueleto de Real Estate. Los dos pendientes que detectó el pack están **resueltos**: la vertical
  está dada de alta en `VERTICAL_DEFINITIONS` (el provisioner siembra su paquete de módulos al
  provisionar un hotel, con hospitality en el wizard y el bulk de partners) y la página pública de
  reserva está en **español e inglés** (`?lang=en`, con conmutador visible y enlace inglés por
  propiedad en la sección Booking Engine). En el lado de producto, lo que dice el punto siguiente. Para el go-live de conectividad con un PMS
  real existe el procedimiento operativo
  [`hospitality-go-live-pms-guia.md`](./hospitality-go-live-pms-guia.md) (acuerdo, alta, ensayo
  controlado y corte a producción).
* **Lo que NO se debe prometer todavía:** la factura del huésped **no** se emite desde la reserva
  (el ERP factura al huésped con Veri*Factu en España; de la reserva a esa factura no llega nada
  por ahora, y **en México no hay timbrado CFDI**: el hueco fiscal real es ese). Tampoco hay cobro
  automático de la reserva de canal: el cobro en línea es de la reserva directa; las de OTA se
  liquidan por su circuito y se registran a mano en Finanzas.
* **Pricing (bandas hipotéticas, a validar en el piloto — ver el método en
  [`COMMERCIAL-HOSPITALITY.md`](./COMMERCIAL-HOSPITALITY.md), sección «Cómo se valida el precio»):**

  | Plan | Precio | Ideal para | Comisión por reserva |
  |---|---:|---|---:|
  | Starter | 49–79 €/mes | Casa rural o boutique de hasta ~10 unidades, un canal | 0% |
  | Growth | 149–299 €/mes | Hotel boutique y apartamentos de 10–50 unidades: multi-canal + booking engine + pagos | 0% |
  | Enterprise | 499–999 €/mes | Cadenas y multi-propiedad de 50+ unidades, AIOps y Gemma | 0% |

  La escala se mide en **unidades y canales**, no en usuarios de oficina: es lo que crece con el
  negocio del hotel y lo que hace el precio defendible. **Cero comisión por reserva** (el fee de
  plataforma es 0 por defecto: el dinero del huésped va a la cuenta del hotel), que es la venta
  más fácil de esta vertical frente a las OTAs y frente a los channel managers que cobran por
  canal.

  Ejemplo de argumento en demo: un hotel de 20 unidades a 120 €/noche con 60% de ocupación factura
  ~43.000 €/mes; si la mitad pasa por OTAs al 15%, son ~3.200 €/mes en comisiones. Growth cuesta
  entre 149 y 299 € fijos y no crece con la venta: cada reserva que se lleva a directo es comisión
  que el hotel no paga.

## 5. Vertical Academia y Formación (LMS Hub) — *nueva*

**El concepto:** "Forma, certifica y cobra: la academia que se gestiona sola."

* **Flujo Operativo:** Catálogo de cursos -> Estudiantes e inscripciones -> Contenido y quizzes ->
  Certificación -> Cobros y marketing de nuevos cursos.
* **Hubs Principales:** Academia (cursos, estudiantes, quizzes), Ventas (inscripción como deal),
  Marketing (campañas de captación), Finanzas (cobros).
* **Propuesta de Valor (Pitch):** "Publica tus cursos, matricula alumnos, evalúa y certifica sin
  salir de tu ERP. Las campañas de captación alimentan las inscripciones, y cada inscripción
  genera su cobro y su factura automáticamente."
* **Factor Diferencial:** No es un LMS suelto: la academia vive dentro del mismo sistema que
  factura y hace marketing, con certificados emitidos automáticamente al completar rutas.
* **Estado:** Producto funcional (cursos, lecciones, quizzes, estudiantes, certificación, portal
  público). Lista para venta en nicho; pack comercial básico pendiente.

## 6. Vertical Marketing y Agencia (Agency Hub) — *en preparación*

**El concepto:** "La agencia que ejecuta campañas multi-canal y cobra por resultados, sin hojas de cálculo."

* **Flujo Operativo:** Cliente (CRM) -> Campañas (email/WhatsApp/ads) -> Contenido y creatividades
  -> Resultados y reporting -> Facturación por retainer o fee.
* **Hubs Principales:** Marketing (campañas, emails, audiencias, scoring), CRM, Web Creator
  (entregables web), Proyectos (rentabilidad por cliente), Finanzas.
* **Propuesta de Valor (Pitch):** "Gestiona todos tus clientes y sus campañas desde una sola
  plataforma: email, WhatsApp y ads, con el reporting que tu cliente quiere ver y la factura que
  tú quieres cobrar, generadas desde el mismo lugar."
* **Factor Diferencial:** El módulo de Ads gestionado dentro del ERP donde ya viven los contratos
  y las facturas del cliente — la agencia no peleará con integraciones aisladas.
* **Estado:** Base de campañas y marketing automation madura; el módulo Ads con integraciones a
  plataformas externas está en desarrollo por fases (ver
  [`MARKETING_ADS_MODULE.md`](./MARKETING_ADS_MODULE.md)). No vender ads integrados hasta que la
  fase de integraciones esté cerrada; sí vender la capa actual (campañas email/WhatsApp,
  scoring, automatizaciones).

## 7. Verticales emergentes (visión, no promesa)

- **Seguros (Insurance Hub):** cartera, pólizas, renovaciones, aseguradoras y productos ya tienen
  módulo propio con importación de carteras. Comprador claro (corredurías), producto aún joven:
  tratar como piloto exploratorio, no como oferta pública.
- **Telefonía, Compliance Pro, Web Creator:** capacidades que refuerzan el "Sistema Operativo"
  transversal (ventas por teléfono, cumplimiento, webs del cliente) más que verticales
  independientes hoy.

---

## 8. Matriz de hubs por vertical

| Hub | Smart Factory | Real Estate | Servicios Prof. | Hospitality | Academia | Agencia |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| CRM y Ventas | ● | ● | ● | ● | ● | ● |
| Marketing y Campañas | ○ | ○ | ○ | ○ | ● | ● |
| Contratos Blindados | ● | ● | ● | ○ | ○ | ● |
| Inventario / Logística / Producción | ● | — | — | — | — | — |
| Finanzas y Fiscal (Veri*Factu) | ● | ● | ● | ● | ● | ● |
| RRHH y Nóminas Selladas | ● | ○ | ● | ○ | ○ | ○ |
| Comunicaciones Omnicanal | ● | ● | ● | ● | ○ | ● |
| Proyectos | — | — | ● | — | — | ● |
| Academia (LMS) | ○ | — | ○ | — | ● | ○ |
| Hospitality (PMS) | — | — | — | ● | — | — |
| AIOps + Gemma (transversal) | ● | ● | ● | ● | ● | ● |

● núcleo de la oferta · ○ complementario vendible · — no relevante

**Lectura comercial:** el 80% de las verticales comparte CRM, Contratos, Finanzas Veri*Factu y
Omnicanal. Cualquier mejora en esos cuatro hubs sube el valor de todas las verticales a la vez —
es el argumento de inversión de producto más rentable y la razón por la que el "Sistema Operativo"
no es marketing: es la arquitectura.

---

## 9. Prioridades comerciales recomendadas

1. **Ahora (venta activa):** Smart Factory, Real Estate y Servicios Profesionales. Producto
   maduro, pitch y pricing definidos. Real Estate además ya tiene el pack comercial completo
   (ICPs, competencia, FAQ, argumentarios) que sirve de plantilla al resto. Se suma
   **Hospitality**: con el plan de Booking Engine + Payments completo y ensayado, el producto ya
   no es el freno — el pitch de venta directa (sin comisión) y las bandas de precio están en §4, y
   lo que queda es su pack comercial.
2. **Siguiente trimestre (piloto dirigido):** Academia en nicho (academias pequeñas que hoy
   gestionan con Excel + WhatsApp); y Hospitality con 2-3 hoteles de diseño para confirmar las
   bandas de precio y hacer de referencia (la conectividad, el panel de incidencias y el cobro sin
   comisión son diferenciadores reales). Su pack comercial ya existe
   ([`COMMERCIAL-HOSPITALITY.md`](./COMMERCIAL-HOSPITALITY.md)), incluidas las hipótesis de precio y
   la señal que las falsaría: la tarifa se publica cuando el piloto dé evidencia, no antes.
3. **En preparación (no prometer fechas):** Agencia — vender la capa actual de campañas y
   scoring; anunciar Ads integrado solo cuando las integraciones de plataforma estén cerradas.
4. **Exploratorio:** Seguros y verticales emergentes — conversaciones, no catálogo.

---

## Estrategia de Precios Transversal (SaaS por Resultados)

Para facilitar la adopción, los precios escalan según el grado de automatización e inteligencia, no limitando funciones básicas, sino premiando el volumen y la eficiencia.

1. **Starter (Cimentación Digital)**
   * Acceso a la vertical elegida.
   * Capa base de protección (Sellos Digitales, Hash Chaining).
   * Ideal para empresas pequeñas que buscan formalizarse y proteger su información.

2. **Growth (Orquestación)**
   * Todo lo de Starter + Sistema de Eventos y Automatizaciones Cross-Hub.
   * Ideal para empresas donde el trabajo manual empieza a ser un cuello de botella.
   * Incluye integraciones nativas (Facturación automatizada, envío de correos).

3. **Enterprise (Autopilot & AIOps)**
   * Todo lo de Growth + Inteligencia Artificial (Gemma) y Auto-Healing.
   * Predicciones de negocio (Forecasts fiscales, saturación de capacidad).
   * Prevención automática de riesgos (Policy Engine).
   * Ideal para corporativos que exigen escalabilidad sin contratar más personal administrativo.

> **Nota Comercial:** En Real Estate, el plan puede complementarse con un "Transaction Fee" (pago por uso) por cada contrato de arrendamiento o compraventa blindado con firma digital, ya que esto ahorra costos notariales y legales masivos al cliente. En Hospitality ese fee **no existe y es deliberado**: el precio es suscripción por tamaño (unidades y canales, ver §4) y **cero comisión por reserva**, porque el dinero del huésped entra íntegro en la cuenta Stripe del hotel. Es el argumento más fuerte de la vertical: frente a las OTAs (15–18% por reserva) y frente a los channel managers que cobran por canal, aquí el software cuesta lo mismo si se vende mucho o poco — y lo que se vende es del hotel.

---

## Documentos relacionados

| Documento | Contenido |
|---|---|
| [`COMMERCIAL-REAL-ESTATE.md`](./COMMERCIAL-REAL-ESTATE.md) | Pack comercial completo de la vertical Real Estate (plantilla para el resto) |
| [`COMMERCIAL-HOSPITALITY.md`](./COMMERCIAL-HOSPITALITY.md) | Pack comercial de Hospitality (ICPs, competencia, argumentarios, FAQ, checklist del piloto y validación del precio) |
| [`VOLKERN-SYSTEM-MODULES.md`](./VOLKERN-SYSTEM-MODULES.md) | Arquitectura funcional de los 7 hubs (base técnica del pitch) |
| [`MANUAL-DE-USUARIO-VOLKERN.md`](./MANUAL-DE-USUARIO-VOLKERN.md) | Demo paso a paso por módulo (ideal para preparar demos de venta) |
| [`hospitality-booking-payments-plan.md`](./hospitality-booking-payments-plan.md) | Plan de Booking Engine y pagos de Hospitality (fases 3.A–3.E completas) |
| [`hospitality-booking-engine-e2e.md`](./hospitality-booking-engine-e2e.md) | Ensayo E2E del booking engine: cómo se corre y qué comprueba |
| [`hospitality-resumen-ejecutivo.md`](./hospitality-resumen-ejecutivo.md) | Resumen ejecutivo de una página para el cliente (qué hace, qué está probado y qué falta) |
| [`MARKETING_ADS_MODULE.md`](./MARKETING_ADS_MODULE.md) | Estado por fases del módulo Ads (Agencia) |
