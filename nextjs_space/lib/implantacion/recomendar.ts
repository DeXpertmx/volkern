/**
 * Motor de recomendación del alta guiada.
 *
 * **Determinista a propósito.** La propuesta de módulos sale de reglas sobre
 * respuestas estructuradas, no de un prompt libre: se puede cubrir con casos
 * dorados (`tests/implantacion-recomendar.test.ts`) y corregir la semana
 * siguiente sin volver a entrenar nada. La IA, cuando llegue (R3), solo
 * redacta el motivo y detecta contradicciones; no elige módulos.
 *
 * Entradas: el descubrimiento + el plan del tenant.
 * Salidas: módulos con motivo, requisito y límite; embudo con criterio de
 * salida por etapa; informes y plantillas que se fijan; riesgos detectados.
 *
 * Puro: sin Prisma, sin red, sin fechas. Dos llamadas con la misma entrada
 * devuelven exactamente lo mismo.
 */

import { ALL_MODULES } from '@/lib/plans'
import { PIPELINE_LIMITS_BY_PLAN } from '@/lib/pipelines'
import { getDefaultModules } from '@/lib/onboarding-modules'
import {
  dijoNoSe,
  hayMaterialSuficiente,
  preguntasPendientes,
  respuestasDe,
  type Descubrimiento,
  type RespuestaId,
} from './descubrimiento'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ContextoRecomendacion {
  plan: string
  /** Módulos que el plan incluye (`getPlanConfig(plan).modules`). */
  modulosPlan: string[]
  /** Módulos activos hoy en el tenant (`resolverModulosTenant`). */
  modulosActivos?: string[]
  /** Tope de embudos del plan (`PIPELINE_LIMITS_BY_PLAN`). */
  limiteEmbudos?: number
  /** Tope de usuarios del plan, si se conoce. */
  limiteUsuarios?: number | null
}

export interface ModuloRecomendado {
  id: string
  etiqueta: string
  icono: string
  /** En las palabras del cliente, no en jerga de producto. */
  motivo: string
  /** Qué necesita para funcionar de verdad. */
  requisito: string
  /** Qué NO hace. `null` cuando no hay un límite relevante que declarar. */
  limite: string | null
  incluidoEnPlan: boolean
  /** Confianza de la regla (0–1). No es una probabilidad del modelo. */
  peso: number
  /** Reglas que lo han propuesto; sirve para explicar y depurar. */
  senales: string[]
}

export interface EtapaEmbudo {
  nombre: string
  /** Criterio observable para salir de la etapa. Sin esto, la etapa es un adorno. */
  criterio: string
  probabilidad: number
}

export interface Recomendacion {
  modulos: ModuloRecomendado[]
  /** Módulos que se dan por hecho: proponerlos sería ruido. */
  nucleo: { ids: string[]; nota: string }
  embudo: { nombre: string; etapas: EtapaEmbudo[] }
  informes: string[]
  plantillas: string[]
  riesgos: string[]
  limites: { plan: string; embudos: number; usuarios: number | null }
  preguntasSinResponder: RespuestaId[]
  /** Módulos que quedaron fuera de la propuesta por ruido, no por descarte. */
  omitidos: number
}

// ─── Catálogos de apoyo ──────────────────────────────────────────────────────

export const INFORMES: Record<string, { etiqueta: string; demuestra: string }> = {
  embudo_etapas: {
    etiqueta: 'Embudo por etapa',
    demuestra: 'Dónde se cae el volumen: cuántas oportunidades hay en cada etapa.',
  },
  prevision_trimestral: {
    etiqueta: 'Previsión de ventas',
    demuestra: 'Si el mes cierra o no, con tres cifras en vez de una corazonada.',
  },
  actividad_por_comercial: {
    etiqueta: 'Actividad por comercial',
    demuestra: 'Quién trabaja su cartera y quién la deja enfriar.',
  },
  conversion_por_origen: {
    etiqueta: 'Conversión por origen',
    demuestra: 'Qué canal trae clientes y cuál solo trae curiosos.',
  },
  tiempo_de_cierre: {
    etiqueta: 'Tiempo de cierre',
    demuestra: 'Cuánto tarda de media una oportunidad en cerrarse.',
  },
  margen_por_linea: {
    etiqueta: 'Margen por línea',
    demuestra: 'Qué producto o servicio deja dinero después del coste.',
  },
  cobros_pendientes: {
    etiqueta: 'Cobros pendientes',
    demuestra: 'Qué está facturado y sin cobrar, y desde cuándo.',
  },
  oportunidades_sin_accion: {
    etiqueta: 'Oportunidades sin próxima acción',
    demuestra: 'Qué está abierto y nadie ha tocado: lo que se pierde por olvido.',
  },
}

export const PLANTILLAS: Record<string, { etiqueta: string; nota: string }> = {
  cotizacion: {
    etiqueta: 'Cotización',
    nota: 'Condiciones, validez y forma de pago precargadas.',
  },
  contrato_desde_cotizacion: {
    etiqueta: 'Contrato desde cotización',
    nota: 'Se genera con las cláusulas del vertical: revísalas con tu asesoría.',
  },
  email_primer_contacto: {
    etiqueta: 'Email de primer contacto',
    nota: 'Se edita antes de usarlo: ninguna plantilla sale sin revisar.',
  },
  email_seguimiento: {
    etiqueta: 'Email de seguimiento',
    nota: 'Para el «no contestó» de los tres días, no para insistir cada hora.',
  },
  briefing_manana: {
    etiqueta: 'Briefing de la mañana',
    nota: 'Cada persona lo activa en su perfil (opt-in, no se impone).',
  },
}

/**
 * Qué necesita cada módulo y qué no hace. Sin estas dos frases, una tarjeta de
 * módulo es publicidad: el cliente acepta cosas que no puede usar.
 */
const FICHAS: Record<string, { requisito: string; limite: string | null }> = {
  scoring: {
    requisito: 'Oportunidades con importe, origen y al menos un mes de historial (o un criterio de prioridad escrito).',
    limite: 'Sin historial, la puntuación inicial es una hipótesis: se calibra en el primer mes.',
  },
  pronosticos: {
    requisito: 'Cada oportunidad con importe y fecha de cierre prevista.',
    limite: 'Es una previsión, no un compromiso: sin calibración trimestral se desvía.',
  },
  cotizaciones: {
    requisito: 'Catálogo cargado e impuestos configurados.',
    limite: 'No hace firma electrónica cualificada.',
  },
  contratos: {
    requisito: 'Una plantilla de contrato revisada por tu asesoría.',
    limite: 'No sustituye la revisión legal de las cláusulas.',
  },
  ordenes_venta: {
    requisito: 'Catálogo y series de facturación definidas.',
    limite: 'La facturación electrónica depende de la configuración fiscal de tu país.',
  },
  catalogo: {
    requisito: 'Lista de productos o servicios con precio y unidad.',
    limite: 'No gestiona variantes complejas (tallas, colores) más allá de campos personalizados.',
  },
  inventario: {
    requisito: 'Almacenes y stock inicial contado.',
    limite: 'No es un ERP de fabricación: para escandallos y BOM hace falta Producción.',
  },
  campanas: {
    requisito: 'Una lista propia con consentimiento o un canal conectado.',
    limite: 'Sin consentimiento no se envía: la base sin opt-in no se usa.',
  },
  email_marketing: {
    requisito: 'Dominio de envío verificado.',
    limite: 'Sin dominio verificado, la entregabilidad se cae.',
  },
  cms: {
    requisito: 'Dominio o subdominio disponible.',
    limite: 'No migra automáticamente una web existente.',
  },
  formularios: {
    requisito: 'Saber a qué etapa del embudo entra cada formulario.',
    limite: 'No sustituye a una herramienta de lógica condicional compleja.',
  },
  social_manager: {
    requisito: 'Cuentas de redes conectadas.',
    limite: 'Publica dentro de lo que permita la API de cada red.',
  },
  ads: {
    requisito: 'Cuenta publicitaria y método de pago.',
    limite: 'No revisa por ti los claims legales de los anuncios.',
  },
  automatizaciones: {
    requisito: 'Un flujo concreto que quieras dejar de hacer a mano.',
    limite: 'Solo hace acciones que existan en el motor.',
  },
  chatbot_whatsapp: {
    requisito: 'WhatsApp Business conectado.',
    limite: 'Fuera de la ventana de 24 h necesita plantilla aprobada.',
  },
  telefonia: {
    requisito: 'Proveedor de telefonía contratado y números.',
    limite: 'La grabación depende de la normativa y del consentimiento.',
  },
  finanzas: {
    requisito: 'Plan contable y saldos de apertura.',
    limite: 'Prepara los datos de impuestos; no presenta declaraciones por ti.',
  },
  conciliacion: {
    requisito: 'Banco con Open Banking disponible.',
    limite: 'Si el banco no expone API, la conciliación sigue siendo manual.',
  },
  proyectos: {
    requisito: 'Proyectos con fases y responsables.',
    limite: 'No sustituye a un software de certificaciones de obra.',
  },
  hospitality: {
    requisito: 'Propiedades, unidades y tarifas cargadas.',
    limite: 'Cada canal se activa uno a uno: no hay conexión automática con todos.',
  },
  compras: {
    requisito: 'Proveedores y productos ya cargados.',
    limite: 'No incluye portal para que el proveedor gestione sus pedidos.',
  },
  estrategia: {
    requisito: 'Objetivos y KPI por persona.',
    limite: 'Es planificación; no calcula retribución variable.',
  },
  compliance_pro: {
    requisito: 'Un procedimiento interno que quieras hacer auditable.',
    limite: 'No sustituye una certificación externa.',
  },
  rrhh: {
    requisito: 'Puestos, convenio y calendario laboral.',
    limite: 'No sustituye a la gestoría para presentar nóminas.',
  },
  cursos: {
    requisito: 'Contenido y estructura del curso.',
    limite: 'No es una productora de vídeo: el contenido lo pones tú.',
  },
}

const FICHA_GENERICA = {
  requisito: 'Definir quién lo usa y con qué datos arranca.',
  limite: null as string | null,
}

// Clave `string` a propósito: las reglas declaran ids como texto y un typo no
// debe romper el tipado, sino no llegar al cliente (`POR_ID.has`).
const POR_ID = new Map<string, (typeof ALL_MODULES)[number]>(ALL_MODULES.map((m) => [m.id, m]))
const INDICE = new Map<string, number>(ALL_MODULES.map((m, i) => [m.id, i]))

/** Módulos que ya vienen encendidos: no se proponen, se explican. */
const NUCLEO = getDefaultModules()

/** Tope de tarjetas: más de ocho convierte la elección en un catálogo. */
const MAX_PROPUESTAS = 8

// ─── Reglas ──────────────────────────────────────────────────────────────────

interface Regla {
  id: string
  cuando: (d: Descubrimiento) => boolean
  modulos: { id: string; motivo: string; peso: number }[]
}

const incluye = (d: Descubrimiento, id: RespuestaId, valor: string) =>
  respuestasDe(d, id).includes(valor)

const alguno = (d: Descubrimiento, id: RespuestaId, valores: string[]) =>
  valores.some((v) => respuestasDe(d, id).includes(v))

/**
 * Cada regla nace de una respuesta concreta y declara a qué módulo lleva, por
 * qué y con cuánta confianza. El motivo está escrito para que el cliente se
 * reconozca: si dijiste «las propuestas tardan», la tarjeta habla de eso.
 */
const REGLAS: Regla[] = [
  {
    id: 'dolor_leads_frios',
    cuando: (d) => incluye(d, 'dolor', 'leads_frios'),
    modulos: [
      {
        id: 'scoring',
        motivo: 'Te avisa de la oportunidad que lleva días sin movimiento, antes de que la pierdas.',
        peso: 0.9,
      },
      {
        id: 'automatizaciones',
        motivo: 'Un lead nuevo se asigna y se le pone tarea sin que nadie tenga que acordarse.',
        peso: 0.6,
      },
    ],
  },
  {
    id: 'dolor_prevision',
    cuando: (d) => incluye(d, 'dolor', 'prevision'),
    modulos: [
      {
        id: 'pronosticos',
        motivo: 'Tres cifras de lo que vas a vender, no una bola de cristal.',
        peso: 0.92,
      },
      {
        id: 'scoring',
        motivo: 'Ordena la cartera por probabilidad real para que la previsión no sea optimismo.',
        peso: 0.6,
      },
    ],
  },
  {
    id: 'dolor_cotizaciones_lentas',
    cuando: (d) => incluye(d, 'dolor', 'cotizaciones_lentas'),
    modulos: [
      {
        id: 'cotizaciones',
        motivo: 'Del catálogo al PDF en un clic, con enlace que avisa cuando la abren.',
        peso: 0.92,
      },
      {
        id: 'catalogo',
        motivo: 'Sin precios a mano, cada propuesta se reescribe: el catálogo quita ese trabajo.',
        peso: 0.85,
      },
    ],
  },
  {
    id: 'dolor_no_se_equipo',
    cuando: (d) => incluye(d, 'dolor', 'no_se_equipo'),
    modulos: [
      {
        id: 'estrategia',
        motivo: 'Cada comercial con su actividad y su objetivo del mes, sin preguntarlo por WhatsApp.',
        peso: 0.7,
      },
      {
        id: 'scoring',
        motivo: 'Cada oportunidad con una prioridad visible, para comparar carteras con el mismo criterio.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'dolor_pierdo_seguimiento',
    cuando: (d) => incluye(d, 'dolor', 'pierdo_seguimiento'),
    modulos: [
      {
        id: 'automatizaciones',
        motivo: 'Nada se queda sin próxima acción: el sistema te devuelve lo que llevas días sin tocar.',
        peso: 0.85,
      },
      {
        id: 'scoring',
        motivo: 'Marca en rojo la oportunidad parada para que no dependa de que te acuerdes.',
        peso: 0.8,
      },
    ],
  },
  {
    id: 'dolor_facturo_tarde',
    cuando: (d) => incluye(d, 'dolor', 'facturo_tarde'),
    modulos: [
      {
        id: 'ordenes_venta',
        motivo: 'De la oportunidad ganada a la orden y la factura, sin volver a teclear importes.',
        peso: 0.9,
      },
      {
        id: 'finanzas',
        motivo: 'Cada factura emitida queda en el asiento correcto, no en una hoja aparte.',
        peso: 0.85,
      },
      {
        id: 'cotizaciones',
        motivo: 'Si el importe nace en la propuesta, no hay dos versiones del mismo precio.',
        peso: 0.6,
      },
    ],
  },
  {
    id: 'tras_propuesta_sin_seguimiento',
    cuando: (d) => alguno(d, 'tras_propuesta', ['nada', 'se_pierde']),
    modulos: [
      {
        id: 'cotizaciones',
        motivo: 'La propuesta se envía con enlace y tú ves si la han abierto.',
        peso: 0.9,
      },
      {
        id: 'automatizaciones',
        motivo: 'Si no contesta en tres días, se te recuerda: el seguimiento deja de ser memoria.',
        peso: 0.7,
      },
      {
        id: 'contratos',
        motivo: 'Cuando dice que sí, se firma desde la misma propuesta en vez de empezar un documento nuevo.',
        peso: 0.55,
      },
    ],
  },
  {
    id: 'tras_propuesta_papel',
    cuando: (d) => incluye(d, 'tras_propuesta', 'se_firma_papel'),
    modulos: [
      {
        id: 'contratos',
        motivo: 'El contrato se genera desde la cotización aceptada, sin reenviar el PDF a mano.',
        peso: 0.85,
      },
      {
        id: 'cotizaciones',
        motivo: 'La aceptación queda registrada con fecha, no en un correo suelto.',
        peso: 0.7,
      },
    ],
  },
  {
    id: 'vende_productos',
    cuando: (d) => alguno(d, 'que_vende', ['productos', 'ambos']),
    modulos: [
      {
        id: 'catalogo',
        motivo: 'Productos con precio y unidad, para no cotizar de memoria.',
        peso: 0.9,
      },
      {
        id: 'inventario',
        motivo: 'Sabes qué puedes prometer antes de prometerlo.',
        peso: 0.7,
      },
    ],
  },
  {
    id: 'vende_servicios',
    cuando: (d) => alguno(d, 'que_vende', ['servicios', 'ambos']),
    modulos: [
      {
        id: 'catalogo',
        motivo: 'Servicios con tarifa y alcance, para no inventar precio en cada llamada.',
        peso: 0.8,
      },
      {
        id: 'cotizaciones',
        motivo: 'El alcance del servicio en una propuesta con validez y condiciones.',
        peso: 0.75,
      },
      {
        id: 'proyectos',
        motivo: 'Lo vendido se ejecuta con fases y responsable, no en una lista de tareas suelta.',
        peso: 0.55,
      },
    ],
  },
  {
    id: 'vende_suscripcion',
    cuando: (d) => incluye(d, 'que_vende', 'suscripcion'),
    modulos: [
      {
        id: 'contratos',
        motivo: 'La cuota se apoya en un contrato con permanencia y condiciones.',
        peso: 0.8,
      },
      {
        id: 'ordenes_venta',
        motivo: 'Cada renovación o alta deja su orden, para que no se pierda la facturación.',
        peso: 0.7,
      },
      {
        id: 'finanzas',
        motivo: 'Los ingresos recurrentes se ven juntos, no mes a mes en el banco.',
        peso: 0.65,
      },
    ],
  },
  {
    id: 'vende_alojamiento',
    cuando: (d) => incluye(d, 'que_vende', 'alojamiento'),
    modulos: [
      {
        id: 'hospitality',
        motivo: 'Propiedades, unidades y reservas sin cruzar tres hojas de cálculo.',
        peso: 0.95,
      },
      {
        id: 'catalogo',
        motivo: 'Tarifas y extras con un precio de referencia.',
        peso: 0.7,
      },
      {
        id: 'compras',
        motivo: 'Consumos y proveedores del día a día con su coste.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'origen_web',
    cuando: (d) => incluye(d, 'origen', 'web'),
    modulos: [
      {
        id: 'formularios',
        motivo: 'Lo que rellena en tu web entra al embudo con la etapa ya asignada.',
        peso: 0.85,
      },
      {
        id: 'cms',
        motivo: 'Puedes cambiar la página que convierte sin pedirle nada a nadie.',
        peso: 0.7,
      },
    ],
  },
  {
    id: 'seguimiento_email',
    cuando: (d) => alguno(d, 'origen', ['web', 'redes']),
    modulos: [
      {
        id: 'email_marketing',
        motivo: 'El lead que no compra hoy se recupera con un email, no con una llamada a ciegas.',
        peso: 0.7,
      },
    ],
  },
  {
    id: 'origen_redes',
    cuando: (d) => incluye(d, 'origen', 'redes'),
    modulos: [
      {
        id: 'campanas',
        motivo: 'Sabes qué publicación o campaña trajo el cliente, no solo que «vino de redes».',
        peso: 0.8,
      },
      {
        id: 'social_manager',
        motivo: 'Programas y mides las redes en el mismo sitio donde está el lead.',
        peso: 0.7,
      },
      {
        id: 'ads',
        motivo: 'El gasto en anuncios con su retorno al lado, no en otra pestaña.',
        peso: 0.6,
      },
    ],
  },
  {
    id: 'origen_llamadas',
    cuando: (d) => incluye(d, 'origen', 'llamadas'),
    modulos: [
      {
        id: 'telefonia',
        motivo: 'La llamada queda ligada al cliente y al comercial que la atendió.',
        peso: 0.85,
      },
      {
        id: 'scoring',
        motivo: 'Prioriza a quién llamar cuando entran más llamadas de las que puedes atender.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'origen_ferias',
    cuando: (d) => incluye(d, 'origen', 'ferias'),
    modulos: [
      {
        id: 'formularios',
        motivo: 'Las tarjetas del stand entran por un formulario, no transcritas a mano.',
        peso: 0.65,
      },
      {
        id: 'catalogo',
        motivo: 'En la feria cotizas con la tarifa de casa, también desde el móvil.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'origen_partners',
    cuando: (d) => incluye(d, 'origen', 'partners'),
    modulos: [
      {
        id: 'cotizaciones',
        motivo: 'El partner cotiza con tu catálogo y tú ves la propuesta que ha enviado.',
        peso: 0.55,
      },
      {
        id: 'contratos',
        motivo: 'El acuerdo con el partner y el del cliente final no se mezclan.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'equipo_6_mas',
    cuando: (d) => alguno(d, 'equipo', ['6_20', 'mas_20']),
    modulos: [
      {
        id: 'estrategia',
        motivo: 'Cada comercial ve lo suyo y tú ves todo, sin pedir informes por correo.',
        peso: 0.75,
      },
      {
        id: 'automatizaciones',
        motivo: 'El reparto y los recordatorios se hacen solos: con seis personas, a mano se cae.',
        peso: 0.55,
      },
      {
        id: 'compliance_pro',
        motivo: 'Con varias manos, saber quién cambió qué deja de ser opcional.',
        peso: 0.55,
      },
    ],
  },
  {
    id: 'equipo_20_mas',
    cuando: (d) => incluye(d, 'equipo', 'mas_20'),
    modulos: [
      {
        id: 'compliance_pro',
        motivo: 'Con más de veinte personas, la trazabilidad de cada cambio protege al negocio.',
        peso: 0.6,
      },
      {
        id: 'estrategia',
        motivo: 'Objetivos por equipo y por persona, comparables con el mismo criterio.',
        peso: 0.55,
      },
    ],
  },
  {
    id: 'ciclo_largo',
    cuando: (d) => alguno(d, 'ciclo', ['1_3m', 'mas_3m']),
    modulos: [
      {
        id: 'pronosticos',
        motivo: 'Con ciclos largos, la previsión necesita fecha de cierre por etapa, no un porcentaje fijo.',
        peso: 0.7,
      },
      {
        id: 'contratos',
        motivo: 'Una venta de meses se cierra con condiciones por escrito, no con un sí por teléfono.',
        peso: 0.6,
      },
      {
        id: 'scoring',
        motivo: 'Con tres meses de ciclo, la salud de la oportunidad importa más que la prisa.',
        peso: 0.55,
      },
    ],
  },
  {
    id: 'ciclo_corto',
    cuando: (d) => incluye(d, 'ciclo', 'menos_7d'),
    modulos: [
      {
        id: 'chatbot_whatsapp',
        motivo: 'Con compra inmediata, el que contesta primero suele ser el que vende.',
        peso: 0.65,
      },
      {
        id: 'scoring',
        motivo: 'Señala al que está listo para comprar hoy entre el volumen de consultas.',
        peso: 0.6,
      },
    ],
  },
  {
    id: 'coste_perder_cliente',
    cuando: (d) => incluye(d, 'coste_error', 'perder_cliente'),
    modulos: [
      {
        id: 'scoring',
        motivo: 'Marca la cuenta que se está enfriando antes de que se vaya.',
        peso: 0.75,
      },
      {
        id: 'automatizaciones',
        motivo: 'Un recordatorio en el momento justo evita el «se me pasó».',
        peso: 0.65,
      },
    ],
  },
  {
    id: 'coste_precio',
    cuando: (d) => incluye(d, 'coste_error', 'precio'),
    modulos: [
      {
        id: 'catalogo',
        motivo: 'Un precio por producto, no una tarifa inventada por comercial.',
        peso: 0.85,
      },
      {
        id: 'cotizaciones',
        motivo: 'Descuentos con límite y aprobación, para que el error no llegue al PDF.',
        peso: 0.7,
      },
    ],
  },
  {
    id: 'coste_factura',
    cuando: (d) => incluye(d, 'coste_error', 'factura'),
    modulos: [
      {
        id: 'finanzas',
        motivo: 'Los impuestos se calculan desde el catálogo, no desde la prisa.',
        peso: 0.85,
      },
      {
        id: 'ordenes_venta',
        motivo: 'La factura nace de la orden, con los datos fiscales ya validados.',
        peso: 0.8,
      },
    ],
  },
  {
    id: 'coste_no_cobrar',
    cuando: (d) => incluye(d, 'coste_error', 'no_cobrar'),
    modulos: [
      {
        id: 'finanzas',
        motivo: 'Ves lo facturado y lo cobrado en la misma pantalla.',
        peso: 0.8,
      },
      {
        id: 'ordenes_venta',
        motivo: 'Cada trabajo entregado tiene su orden: lo que no está facturado, se ve.',
        peso: 0.75,
      },
      {
        id: 'conciliacion',
        motivo: 'El banco cuadra solo lo que ya está registrado.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'herramienta_whatsapp',
    cuando: (d) => incluye(d, 'herramienta', 'whatsapp'),
    modulos: [
      {
        id: 'chatbot_whatsapp',
        motivo: 'Las conversaciones de WhatsApp dejan de ser un archivo personal y entran al CRM.',
        peso: 0.6,
      },
    ],
  },
  {
    id: 'herramienta_excel',
    cuando: (d) => incluye(d, 'herramienta', 'excel'),
    modulos: [
      {
        id: 'catalogo',
        motivo: 'La lista de Excel se importa una vez y deja de tener diez versiones.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'panel_cobros',
    cuando: (d) => incluye(d, 'panel', 'cobros'),
    modulos: [
      {
        id: 'finanzas',
        motivo: 'El lunes ves lo que está pendiente de cobro sin abrir el banco.',
        peso: 0.6,
      },
      {
        id: 'ordenes_venta',
        motivo: 'Para cobrar hay que haber facturado: la orden es el paso previo.',
        peso: 0.55,
      },
    ],
  },
  {
    id: 'decision_precio',
    cuando: (d) => incluye(d, 'decision', 'que_precio'),
    modulos: [
      {
        id: 'catalogo',
        motivo: 'El precio deja de decidirse a ojo: hay una tarifa y un margen.',
        peso: 0.6,
      },
      {
        id: 'cotizaciones',
        motivo: 'El descuento se aplica con una regla, no según quién llame.',
        peso: 0.55,
      },
    ],
  },
  {
    id: 'decision_contratar',
    cuando: (d) => incluye(d, 'decision', 'cuando_contratar'),
    modulos: [
      {
        id: 'pronosticos',
        motivo: 'La decisión de contratar se toma con la carga prevista, no con la sensación del mes.',
        peso: 0.6,
      },
    ],
  },
  {
    id: 'decision_producto',
    cuando: (d) => incluye(d, 'decision', 'que_producto'),
    modulos: [
      {
        id: 'estrategia',
        motivo: 'Qué línea empujar deja de ser intuición cuando ves margen y conversión juntos.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'exito_no_perder',
    cuando: (d) => incluye(d, 'exito_90d', 'no_perder'),
    modulos: [
      {
        id: 'automatizaciones',
        motivo: 'El éxito se mide en oportunidades sin tocar: la automatización ataca justo eso.',
        peso: 0.6,
      },
      {
        id: 'scoring',
        motivo: 'Una oportunidad olvidada sube de color antes de perderse.',
        peso: 0.55,
      },
    ],
  },
  {
    id: 'exito_cerrar_antes',
    cuando: (d) => incluye(d, 'exito_90d', 'cerrar_antes'),
    modulos: [
      {
        id: 'cotizaciones',
        motivo: 'Acortar el cierre empieza por enviar la propuesta el mismo día.',
        peso: 0.55,
      },
      {
        id: 'contratos',
        motivo: 'Si la firma se bloquea una semana, el ciclo se alarga una semana.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'exito_cobrar_antes',
    cuando: (d) => incluye(d, 'exito_90d', 'cobrar_antes'),
    modulos: [
      {
        id: 'finanzas',
        motivo: 'Para cobrar antes hay que facturar antes, y ver lo pendiente.',
        peso: 0.6,
      },
      {
        id: 'ordenes_venta',
        motivo: 'La orden cierra el trabajo y abre la factura sin esperar al cierre de mes.',
        peso: 0.5,
      },
    ],
  },
  {
    id: 'exito_saber_antes',
    cuando: (d) => incluye(d, 'exito_90d', 'saber_antes'),
    modulos: [
      {
        id: 'pronosticos',
        motivo: 'Saber antes es exactamente lo que hace la previsión: ver el mes en curso, no cerrarlo.',
        peso: 0.6,
      },
    ],
  },
]

// ─── Embudo ──────────────────────────────────────────────────────────────────

const EMBUDO_CORTO: EtapaEmbudo[] = [
  { nombre: 'Contacto', criterio: 'Ha respondido y sabemos qué quiere', probabilidad: 10 },
  { nombre: 'Propuesta', criterio: 'Tiene la propuesta en su correo', probabilidad: 35 },
  { nombre: 'Decisión', criterio: 'Hay una fecha para el sí o el no', probabilidad: 65 },
  { nombre: 'Cerrado', criterio: 'Firmado o descartado con motivo escrito', probabilidad: 100 },
]

const EMBUDO_MEDIO: EtapaEmbudo[] = [
  { nombre: 'Contacto', criterio: 'Ha respondido y encaja con lo que vendes', probabilidad: 10 },
  { nombre: 'Interés', criterio: 'Hemos hablado y hay una necesidad concreta', probabilidad: 25 },
  { nombre: 'Propuesta', criterio: 'Propuesta enviada y abierta', probabilidad: 50 },
  { nombre: 'Negociación', criterio: 'Hay una objeción concreta sobre la mesa', probabilidad: 75 },
  { nombre: 'Cerrado', criterio: 'Firmado o descartado con motivo escrito', probabilidad: 100 },
]

const EMBUDO_LARGO: EtapaEmbudo[] = [
  { nombre: 'Contacto', criterio: 'Ha respondido y encaja con lo que vendes', probabilidad: 5 },
  { nombre: 'Calificación', criterio: 'Presupuesto, decisor y fecha identificados', probabilidad: 15 },
  { nombre: 'Diagnóstico', criterio: 'Hemos visto su situación y la hemos escrito', probabilidad: 30 },
  { nombre: 'Propuesta', criterio: 'Propuesta enviada y abierta, con importe', probabilidad: 50 },
  { nombre: 'Negociación', criterio: 'Condiciones revisadas y fecha de decisión', probabilidad: 75 },
  { nombre: 'Cerrado', criterio: 'Firmado o descartado con motivo escrito', probabilidad: 100 },
]

function construirEmbudo(d: Descubrimiento): { nombre: string; etapas: EtapaEmbudo[] } {
  const ciclo = respuestasDe(d, 'ciclo')[0]
  const etapas =
    ciclo === 'menos_7d'
      ? EMBUDO_CORTO
      : ciclo === '2_4s'
        ? EMBUDO_MEDIO
        : ciclo === '1_3m' || ciclo === 'mas_3m'
          ? EMBUDO_LARGO
          : EMBUDO_MEDIO

  // Copia defensiva: la recomendación se guarda en JSON y no debe compartir
  // referencias con las constantes del módulo.
  return { nombre: 'Ventas', etapas: etapas.map((e) => ({ ...e })) }
}

// ─── Informes y plantillas ───────────────────────────────────────────────────

const INFORME_POR_PANEL: Record<string, string> = {
  embudo: 'embudo_etapas',
  prevision: 'prevision_trimestral',
  actividad: 'actividad_por_comercial',
  conversion: 'conversion_por_origen',
  ciclo: 'tiempo_de_cierre',
  margen: 'margen_por_linea',
  cobros: 'cobros_pendientes',
}

function elegirInformes(d: Descubrimiento): string[] {
  const informes: string[] = []

  for (const panel of respuestasDe(d, 'panel')) {
    const informe = INFORME_POR_PANEL[panel]
    if (informe && !informes.includes(informe)) informes.push(informe)
  }

  // Derivados del dolor: el informe que demuestra que el dolor se ha tocado.
  if (incluye(d, 'dolor', 'pierdo_seguimiento') || incluye(d, 'decision', 'a_quien_llamar')) {
    if (!informes.includes('oportunidades_sin_accion')) informes.push('oportunidades_sin_accion')
  }
  if (incluye(d, 'dolor', 'prevision') && !informes.includes('prevision_trimestral')) {
    informes.push('prevision_trimestral')
  }
  if (alguno(d, 'equipo', ['6_20', 'mas_20']) && !informes.includes('actividad_por_comercial')) {
    informes.push('actividad_por_comercial')
  }

  // Nadie debería aterrizar en un panel vacío: mínimo dos informes.
  for (const porDefecto of ['embudo_etapas', 'prevision_trimestral']) {
    if (informes.length >= 2) break
    if (!informes.includes(porDefecto)) informes.push(porDefecto)
  }

  return informes.slice(0, 4)
}

function elegirPlantillas(modulos: ModuloRecomendado[]): string[] {
  const ids = new Set(modulos.map((m) => m.id))
  const plantillas = ['email_primer_contacto', 'email_seguimiento', 'briefing_manana']
  if (ids.has('cotizaciones')) plantillas.push('cotizacion')
  if (ids.has('contratos')) plantillas.push('contrato_desde_cotizacion')
  return plantillas
}

// ─── Recomendación ───────────────────────────────────────────────────────────

function motivoNucleo(d: Descubrimiento): string {
  const base =
    'Leads, contactos, empresas, embudo, tareas y panel ya vienen encendidos: no hay nada que decidir aquí.'
  if (incluye(d, 'a_quien', 'empresas') || incluye(d, 'a_quien', 'ambos')) {
    return `${base} Cada empresa con sus contactos y una sola cuenta por cliente, sin duplicar.`
  }
  return base
}

function detectarRiesgos(d: Descubrimiento, modulos: ModuloRecomendado[], ctx: ContextoRecomendacion, limiteUsuarios: number | null): string[] {
  const riesgos: string[] = []

  const contestadas = preguntasPendientes(d).length
  if (!hayMaterialSuficiente(d)) {
    riesgos.push(
      'Hay muy pocas respuestas: la propuesta es un punto de partida, no un diagnóstico. Con tres respuestas más cambia bastante.',
    )
  } else if (contestadas > 0) {
    riesgos.push(
      `Quedan ${contestadas} preguntas sin responder: lo que no has contestado no se ha usado para recomendar.`,
    )
  }

  if (dijoNoSe(d, 'dolor')) {
    riesgos.push(
      'No has marcado un dolor concreto: los módulos propuestos salen del perfil del negocio, no de tu problema. Es la respuesta que más cambia la propuesta.',
    )
  }

  if (
    (incluye(d, 'a_quien', 'empresas') || incluye(d, 'a_quien', 'ambos')) &&
    incluye(d, 'ciclo', 'menos_7d')
  ) {
    riesgos.push(
      'Vendes a empresas y cierras en menos de 7 días: si el ciclo real es más largo, el embudo de cuatro etapas se quedará corto en el segundo mes.',
    )
  }

  if (alguno(d, 'equipo', ['6_20', 'mas_20']) && limiteUsuarios !== null && limiteUsuarios < 6) {
    riesgos.push(
      `Tu plan incluye ${limiteUsuarios} usuarios y has dicho que venden entre 6 y 20 personas: hay que ampliar usuarios antes de dar accesos al equipo.`,
    )
  }

  if (incluye(d, 'herramienta', 'otro_crm')) {
    riesgos.push(
      'Vienes de otro CRM: el orden de carga es contactos y empresas, después catálogo, después oportunidades abiertas. Empezar por las oportunidades deja cuentas huérfanas.',
    )
  }

  const sinDatos = alguno(d, 'herramienta', ['papel', 'ninguna'])
  if (sinDatos) {
    riesgos.push(
      'Si hoy está todo en papel o en la cabeza, la primera semana es de carga: un panel vacío no convence a nadie y el equipo vuelve a su Excel.',
    )
  }

  if (!respondidaExito(d)) {
    riesgos.push(
      'Sin un criterio de éxito a 90 días no hay forma de saber si el alta ha funcionado: se fija en la revisión de los 14 días.',
    )
  }

  if (incluye(d, 'ciclo', 'mas_3m')) {
    riesgos.push(
      'Con ciclos de más de tres meses, la previsión solo es fiable si cada etapa tiene fecha de cierre: revisa la calibración al primer mes.',
    )
  }

  const fueraDePlan = modulos.filter((m) => !m.incluidoEnPlan)
  if (fueraDePlan.length > 0) {
    riesgos.push(
      `${fueraDePlan.length === 1 ? 'Un módulo propuesto no entra' : `${fueraDePlan.length} módulos propuestos no entran`} en tu plan actual (${fueraDePlan
        .map((m) => m.etiqueta)
        .join(', ')}): se pueden activar como addon, pero no se activan solos.`,
    )
  }

  if (ctx.limiteEmbudos !== undefined && ctx.limiteEmbudos <= 1) {
    riesgos.push(
      'Tu plan permite un embudo: el de ventas. Si necesitas captación y compra por separado (inmobiliaria, proyectos), hay que subir de nivel.',
    )
  }

  return riesgos
}

function respondidaExito(d: Descubrimiento): boolean {
  return respuestasDe(d, 'exito_90d').length > 0
}

export function recomendar(d: Descubrimiento, ctx: ContextoRecomendacion): Recomendacion {
  const activos = new Set([...(ctx.modulosActivos ?? []), ...ctx.modulosPlan])
  const limiteEmbudos = ctx.limiteEmbudos ?? PIPELINE_LIMITS_BY_PLAN[ctx.plan] ?? 1
  const limiteUsuarios = ctx.limiteUsuarios ?? null

  // 1. Reglas → candidatos, quedándose con el motivo de mayor peso y sumando señales.
  const candidatos = new Map<string, { peso: number; motivo: string; senales: string[] }>()
  for (const regla of REGLAS) {
    if (!regla.cuando(d)) continue
    for (const propuesta of regla.modulos) {
      if (NUCLEO.includes(propuesta.id)) continue // el núcleo no se propone
      if (!POR_ID.has(propuesta.id)) continue // typo en una regla: no llega al cliente

      const previo = candidatos.get(propuesta.id)
      if (!previo) {
        candidatos.set(propuesta.id, {
          peso: propuesta.peso,
          motivo: propuesta.motivo,
          senales: [regla.id],
        })
        continue
      }

      const gana = propuesta.peso > previo.peso
      candidatos.set(propuesta.id, {
        peso: Math.max(previo.peso, propuesta.peso),
        motivo: gana ? propuesta.motivo : previo.motivo,
        senales: [...previo.senales, regla.id],
      })
    }
  }

  // 2. Orden estable: peso, y a igual peso el orden del catálogo.
  const ordenados = [...candidatos.entries()]
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => {
      if (b.peso !== a.peso) return b.peso - a.peso
      return (INDICE.get(a.id) ?? 0) - (INDICE.get(b.id) ?? 0)
    })

  const total = ordenados.length
  const modulos: ModuloRecomendado[] = ordenados.slice(0, MAX_PROPUESTAS).map((c) => {
    const definicion = POR_ID.get(c.id)!
    const ficha = FICHAS[c.id] ?? FICHA_GENERICA
    return {
      id: c.id,
      etiqueta: definicion.label,
      icono: definicion.icon,
      motivo: c.motivo,
      requisito: ficha.requisito,
      limite: ficha.limite,
      incluidoEnPlan: activos.has(c.id),
      peso: Math.round(c.peso * 100) / 100,
      senales: c.senales,
    }
  })

  return {
    modulos,
    nucleo: { ids: [...NUCLEO], nota: motivoNucleo(d) },
    embudo: construirEmbudo(d),
    informes: elegirInformes(d),
    plantillas: elegirPlantillas(modulos),
    riesgos: detectarRiesgos(d, modulos, ctx, limiteUsuarios),
    limites: { plan: ctx.plan, embudos: limiteEmbudos, usuarios: limiteUsuarios },
    preguntasSinResponder: preguntasPendientes(d).map((p) => p.id),
    omitidos: Math.max(0, total - modulos.length),
  }
}
