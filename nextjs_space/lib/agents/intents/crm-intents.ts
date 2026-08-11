import { IntentSchema } from './types';

/**
 * Intenciones de CRM: leads, contactos, citas, pipeline de ventas,
 * mensajes, conversaciones, tareas y notas.
 */
export const crmIntents: IntentSchema[] = [
  // ========== CONTACTOS & LEADS ==========
  {
    name: 'crear_lead',
    description: 'Crear un nuevo lead (prospecto sin formalizar) en el sistema',
    requiredParams: ['nombre', 'email'],
    optionalParams: ['telefono', 'empresa', 'contexto', 'cargo', 'fuente'],
    examples: [
      'agrega a Juan Pérez con email juan@email.com por tema de ventas',
      'nuevo lead: María García, maria@empresa.com, tel 123456789, contexto: interesado en software',
      'registra el lead Carlos Ruiz, carlos@test.com, de la empresa Acme',
      'agrega un lead: Ana Torres, ana@torres.com, tel 5551234'
    ],
    destructive: false
  },
  {
    name: 'crear_contacto',
    description: 'Crear un nuevo contacto (persona ya formalizada) en el sistema',
    requiredParams: ['nombre', 'email'],
    optionalParams: ['telefono', 'empresa', 'contexto', 'cargo', 'linkedin', 'ubicacion'],
    examples: [
      'agrega el contacto Laura Gómez con email laura@empresa.com',
      'crea un contacto llamado Pedro Sánchez, pedro@test.com, tel 987654321',
      'nuevo contacto: Sofía Ruiz, sofia@ruiz.com, de la empresa Ruiz y Asociados',
      'registra el contacto Carlos Díaz, carlos@diaz.com'
    ],
    destructive: false
  },
  {
    name: 'crear_empresa',
    description: 'Crear una nueva empresa o compañía en el sistema',
    requiredParams: ['nombre'],
    optionalParams: ['email', 'telefono', 'contexto', 'ubicacion', 'linkedin', 'tags'],
    examples: [
      'crea la empresa Acme Corporation',
      'agrega una empresa nueva: Tecnologías del Norte, contacto@tnorte.com',
      'registra la empresa Ruiz y Asociados con teléfono 555-0101',
      'nueva empresa: Global Soft, gsoft@corp.com, ubicada en Ciudad de México'
    ],
    destructive: false
  },
  {
    name: 'buscar_lead',
    description: 'Buscar un lead existente por email o nombre',
    requiredParams: [],
    optionalParams: ['email', 'nombre'],
    examples: [
      'busca el lead con email juan@email.com',
      'encuentra a María García',
      'dame los datos de juan@email.com'
    ],
    destructive: false
  },
  {
    name: 'listar_contactos',
    description: 'Listar todos los contactos del tenant con filtros opcionales (búsqueda, tipo, tags)',
    requiredParams: [],
    optionalParams: ['search', 'tipo', 'tags', 'page', 'limit'],
    examples: [
      'lista los contactos',
      'muéstrame todos los contactos',
      'ver contactos',
      'dame una lista de contactos',
      'busca contactos que contengan "García"',
      'contactos tipo empresa'
    ],
    destructive: false
  },
  {
    name: 'listar_leads',
    description: 'Listar todos los leads del tenant con filtros opcionales (búsqueda, estado, fuente)',
    requiredParams: [],
    optionalParams: ['search', 'estado', 'fuente', 'page', 'limit'],
    examples: [
      'lista los leads',
      'muéstrame todos los leads',
      'ver leads nuevos',
      'dame una lista de leads',
      'leads en estado contactado',
      'busca leads que contengan "Martínez"'
    ],
    destructive: false
  },
  {
    name: 'actualizar_lead',
    description: 'Actualizar, modificar o agregar contexto a un lead o contacto existente',
    requiredParams: [],
    optionalParams: ['email', 'telefono', 'nombre', 'empresa', 'contexto'],
    examples: [
      'actualiza el telefono de juan@email.com a 555-1234',
      'ponle contexto a Alejandra Velázquez: Interesada en automatización',
      'pon contexto al contacto Alejandra Velázquez',
      'cambia el nombre de maria@empresa.com a Maria Perez',
      'actualiza el contacto de Alejandra Vázquez',
      'agregar contexto a Alejandra Velázquez',
      'ponle notas a Juan Pérez: Cliente importante',
      'agrega contexto al lead María García'
    ],
    destructive: false
  },
  {
    name: 'convertir_lead',
    description: 'Convertir un lead en contacto formal',
    requiredParams: ['email'],
    optionalParams: [],
    examples: [
      'convierte a juan@email.com en contacto',
      'convierte lead de María García a contacto',
      'pasa a contacto a carlos@test.com'
    ],
    destructive: false
  },
  {
    name: 'obtener_telefono',
    description: 'Obtener el número de teléfono de un contacto o lead por su nombre',
    requiredParams: ['nombre'],
    optionalParams: [],
    examples: [
      'dame el teléfono de Juan Pérez',
      'cuál es el número de María García',
      'pásame el cel de Carlos Ruiz'
    ],
    destructive: false
  },
  {
    name: 'registrar_interaccion',
    description: 'Registrar una interacción (llamada, email, whatsapp, reunión, nota) con un contacto o lead',
    requiredParams: ['tipo', 'contenido'],
    optionalParams: ['email', 'nombre', 'resultado'],
    examples: [
      'registra una llamada con Juan Pérez: "Hablamos sobre el presupuesto"',
      'nueva interacción tipo email con maria@test.com: "Enviado catálogo"',
      'anota una reunión con Carlos: "Quedamos en firmar contrato mañana"',
      'registra una interacción con Alejandra Velázquez',
      'quiero anotar algo sobre mi llamada con Juan',
      'tuve una reunión con el cliente y quiero registrarla'
    ],
    destructive: false
  },
  {
    name: 'diagnosticos_lead',
    description: 'Obtener diagnósticos de un lead o completar un flujo de diagnóstico',
    requiredParams: [],
    optionalParams: ['email', 'nombre', 'leadId', 'accion'],
    examples: [
      'dame los diagnósticos de juan@email.com',
      'completa el diagnóstico de María García',
      'qué diagnósticos tiene Carlos Ruiz'
    ],
    destructive: false
  },

  // ========== CITAS / BOOKINGS ==========
  {
    name: 'agendar_cita',
    description: 'Agendar una cita o reunión con un lead. El bot busca el lead por nombre o email; si no existe en el CRM lo registra automáticamente (email sintético si solo se da el nombre) y vincula la cita',
    // Solo fecha+hora son obligatorios: el wrapper resuelve el contacto por
    // nombre O email (si falta el nombre lo deriva del email; si falta el
    // email y el lead no existe, lo auto-registra con email sintético).
    requiredParams: ['fecha', 'hora'],
    optionalParams: ['nombre', 'email', 'telefono', 'duracion', 'notas', 'tipo'],
    examples: [
      'agenda cita con Juan Pérez para mañana a las 10am',
      'agenda cita con juan@email.com para mañana a las 10am',
      'programa reunión con María el viernes a las 15:30 por 1 hora'
    ],
    destructive: false
  },
  {
    name: 'mis_citas',
    description: 'Consultar citas próximas o existentes',
    requiredParams: [],
    optionalParams: ['fecha', 'email', 'estado'],
    examples: [
      'qué citas tengo hoy',
      'muéstrame mis citas de esta semana',
      'citas pendientes con juan@email.com'
    ],
    destructive: false
  },
  {
    name: 'cancelar_cita',
    description: 'Cancelar una cita existente',
    requiredParams: ['nombre'],
    optionalParams: ['email', 'fecha', 'citaId'],
    examples: [
      'cancela la cita de Alejandra Velázquez',
      'elimina mi reunión con juan@email.com de mañana',
      'anula la cita del viernes con María'
    ],
    destructive: true
  },
  {
    name: 'reagendar_cita',
    description: 'Reprogramar o cambiar la fecha/hora de una cita existente',
    requiredParams: ['citaId', 'fecha', 'hora'],
    optionalParams: ['email'],
    examples: [
      'cambia la cita que teníamos con Alejandra al viernes a las 4pm',
      'reprograma mi reunión con Juan para el lunes a las 10am',
      'mueve la cita #123 al martes a las 3:30pm',
      'cambia la cita de María del viernes al lunes'
    ],
    destructive: true
  },
  {
    name: 'confirmar_cita',
    description: 'Confirmar una cita existente',
    requiredParams: ['citaId'],
    optionalParams: [],
    examples: [
      'confirma la cita #123',
      'marca como confirmada la reunión con Juan',
      'confirma la cita de mañana con María'
    ],
    destructive: false
  },
  {
    name: 'auto_agendar',
    description: 'Agendar cita automáticamente verificando disponibilidad y notificando al cliente',
    requiredParams: ['email'],
    optionalParams: ['fecha', 'hora', 'titulo'],
    examples: [
      'agenda automáticamente una cita con juan@email.com',
      'auto-agenda reunión con María para el viernes',
      'programa cita automática con carlos@test.com'
    ],
    destructive: false
  },

  // ========== CONVERSACIONES & MENSAJES ==========
  {
    name: 'enviar_mensaje',
    description: 'Enviar un mensaje a un lead o contacto',
    requiredParams: ['email', 'mensaje'],
    optionalParams: ['canal'],
    examples: [
      'envía mensaje a juan@email.com: "Hola, ¿cómo estás?"',
      'notifica a María por WhatsApp: tu cita está confirmada',
      'manda email a carlos@test.com con el presupuesto'
    ],
    destructive: false
  },
  {
    name: 'enviar_mensaje_interno',
    description: 'Envía un mensaje al equipo interno',
    requiredParams: ['to', 'message'],
    optionalParams: ['context'],
    examples: [
      'envía mensaje a @soporte: el cliente Juan necesita factura',
      'notifica a @maria que llegó un lead nuevo',
      'dile al #ventas que tenemos una reunión mañana'
    ],
    destructive: false
  },
  {
    name: 'crear_conversacion',
    description: 'Iniciar una nueva conversación con un lead',
    requiredParams: ['email'],
    optionalParams: ['nombre', 'canal'],
    examples: [
      'inicia conversación con juan@email.com',
      'crea conversación con María García',
      'nuevo hilo con carlos@test.com'
    ],
    destructive: false
  },
  {
    name: 'cerrar_conversacion',
    description: 'Cerrar una conversación activa',
    requiredParams: ['email'],
    optionalParams: [],
    examples: [
      'cierra la conversación con juan@email.com',
      'termina hilo con María García',
      'cierra el chat con carlos@test.com'
    ],
    destructive: false
  },

  // ========== TAREAS ==========
  {
    name: 'crear_tarea',
    description: 'Crear una nueva tarea pendiente para un lead o contacto',
    requiredParams: ['titulo'],
    optionalParams: ['email', 'nombre', 'descripcion', 'fechaVencimiento', 'prioridad'],
    examples: [
      'crea una tarea con Alejandra Velázquez',
      'registra una tarea con Juan Pérez',
      'crea tarea: llamar a Juan Pérez',
      'nueva tarea para María: revisar cotización',
      'agrega pendiente: enviar documento a Carlos, vence el viernes',
      'tarea con el lead juan@email.com: llamar para seguimiento'
    ],
    destructive: false
  },
  {
    name: 'completar_tarea',
    description: 'Marcar una tarea como completada',
    requiredParams: ['titulo'],
    optionalParams: ['email'],
    examples: [
      'marca como completada la tarea de llamar a Juan',
      'termina la tarea de revisar cotización',
      'completa el pendiente de enviar documento'
    ],
    destructive: false
  },
  {
    name: 'mis_tareas',
    description: 'Ver tareas pendientes o de un lead',
    requiredParams: [],
    optionalParams: ['email', 'estado'],
    examples: [
      'qué tareas tengo pendientes',
      'muéstrame mis tareas',
      'tareas pendientes de juan@email.com'
    ],
    destructive: false
  },

  // ========== NOTAS ==========
  {
    name: 'crear_nota',
    description: 'Agregar una nota a un lead o contacto',
    // el wrapper resuelve el lead también por nombre; email se pide solo si no
    // hay forma de identificar al lead (crear_nota sin email ni nombre falla
    // con un mensaje informativo en el wrapper)
    requiredParams: ['contenido'],
    optionalParams: ['email', 'nombre'],
    examples: [
      'agrega nota a juan@email.com: "Cliente interesado en paquete premium"',
      'nota para María García: "Prefiere contacto por WhatsApp"',
      'anota en el perfil de Carlos: "Llamar después de las 5pm"'
    ],
    destructive: false
  },
  {
    name: 'ver_notas',
    description: 'Ver notas de un lead o contacto',
    // email opcional: el wrapper resuelve el lead también por nombre
    requiredParams: [],
    optionalParams: ['email', 'nombre'],
    examples: [
      'muéstrame las notas de juan@email.com',
      'qué notas tiene María García',
      'ver notas de Carlos Ruiz'
    ],
    destructive: false
  },

  // ========== DEALS / PIPELINE ==========
  {
    name: 'crear_negocio',
    description: 'Crear un nuevo deal u oportunidad en el pipeline de ventas',
    requiredParams: ['email', 'titulo'],
    optionalParams: ['monto', 'etapa', 'prioridad'],
    examples: [
      'crea un deal con juan@email.com por 5000€ por el paquete empresarial',
      'nueva oportunidad con María García: consultoría, 3000€',
      'abre negocio con carlos@test.com para el servicio premium'
    ],
    destructive: false
  },
  {
    name: 'actualizar_negocio',
    description: 'Actualizar etapa, monto o prioridad de un deal existente',
    requiredParams: ['email'],
    optionalParams: ['etapa', 'monto', 'prioridad', 'titulo'],
    examples: [
      'mueve el deal de juan@email.com a etapa negociación',
      'actualiza el monto del negocio con María a 7000€',
      'pon prioridad alta al deal de Carlos Ruiz'
    ],
    destructive: false
  },
  {
    name: 'mis_negocios',
    description: 'Listar deals del pipeline de ventas',
    requiredParams: [],
    optionalParams: ['etapa', 'email'],
    examples: [
      'cómo va mi pipeline de ventas',
      'muéstrame los deals activos',
      'negocios en etapa propuesta',
      'qué deals tengo con juan@email.com'
    ],
    destructive: false
  },
  {
    name: 'calificar_lead',
    description: 'Prequalificar un lead registrando nota, actualizando deal y buscando en catálogo',
    requiredParams: ['email'],
    optionalParams: ['nota'],
    examples: [
      'califica a juan@email.com como lead caliente',
      'prequalifica a María García: "Interesada en el paquete completo"',
      'haz el pre-qual de carlos@test.com'
    ],
    destructive: false
  },

  // ========== PROACTIVIDAD ==========
  {
    name: 'detectar_ghosting',
    description: 'Detectar leads inactivos o fantasmas que están en etapas calientes pero sin actividad reciente',
    requiredParams: [],
    optionalParams: ['dias_inactivo'],
    examples: [
      'detecta leads fantasmas',
      'hay leads que dejaron de responder',
      'qué leads están inactivos en etapa negociación',
      'encuentra leads que no han tenido actividad en 7 días'
    ],
    destructive: false
  },
  {
    name: 'generar_ruta_exito',
    description: 'Generar una sugerencia estratégica (success path) para un lead basada en patrones de cierre exitosos de leads similares',
    requiredParams: ['email'],
    optionalParams: [],
    examples: [
      'genera una ruta de éxito para juan@email.com',
      'cómo puedo cerrar el deal con María García',
      'sugiere siguiente paso para el lead de Carlos',
      'dame una estrategia para convertir a este lead'
    ],
    destructive: false
  },
];
