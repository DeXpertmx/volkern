import { callAssistantWithFallback } from '@/lib/assistant/openrouter-client';
import { prisma } from '@/lib/db';

export interface IntentClassification {
  intent: string;
  confidence: number;
  needsMoreInfo: boolean;
  missingParams: string[];
  extractedParams: Record<string, any>;
  rawResponse: string;
}

export interface IntentSchema {
  name: string;
  description: string;
  requiredParams: string[];
  optionalParams: string[];
  examples: string[];
  destructive: boolean;
}

export class IntentClassifierAgent {
  private readonly intentsSchema: IntentSchema[] = [
    // ========== CONTACTOS & LEADS ==========
    {
      name: 'crear_lead',
      description: 'Crear un nuevo lead o contacto en el sistema',
      requiredParams: ['nombre', 'email', 'contexto'],
      optionalParams: ['telefono', 'empresa'],
      examples: [
        'agrega a Juan Pérez con email juan@email.com por tema de ventas',
        'nuevo lead: María García, maria@empresa.com, tel 123456789, contexto: interesado en software',
        'crea un contacto llamado Carlos Ruiz con email carlos@test.com para seguimiento'
      ],
      destructive: false
    },
    {
      name: 'buscar_lead',
      description: 'Buscar un lead existente por email o nombre o listar todos',
      requiredParams: [],
      optionalParams: ['email', 'nombre'],
      examples: [
        'busca el lead con email juan@email.com',
        'encuentra a María García',
        'dame una lista de mis leads',
        'muéstrame los leads',
        'listar contactos'
      ],
      destructive: false
    },
    {
      name: 'actualizar_lead',
      description: 'Modificar o actualizar un lead o contacto existente',
      requiredParams: [],
      optionalParams: ['email', 'telefono', 'nombre', 'empresa', 'contexto'],
      examples: [
        'actualiza el telefono de juan@email.com a 555-1234',
        'ponle contexto a Alejandra Velázquez: Interesada en automatización',
        'cambia el nombre de maria@empresa.com a Maria Perez',
        'actualiza el contacto de Alejandra Vázquez',
        'agregar contexto a Alejandra Velázquez'
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
      description: 'Agendar una cita o reunión con un lead',
      requiredParams: ['fecha', 'hora'],
      optionalParams: ['email', 'nombre', 'duracion', 'notas', 'tipo'],
      examples: [
        'agenda cita con juan@email.com para mañana a las 10am',
        'programa reunión con María el viernes a las 15:30 por 1 hora',
        'crea una cita con alejandra.vvalvede@gmail.com el 2024-12-20 a las 11:00'
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
      requiredParams: ['citaId'],
      optionalParams: ['email', 'fecha'],
      examples: [
        'cancela la cita #123',
        'elimina mi reunión con juan@email.com de mañana',
        'anula la cita del viernes con María'
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
      description: 'Crear una nueva tarea pendiente',
      requiredParams: ['titulo'],
      optionalParams: ['descripcion', 'fechaVencimiento', 'email', 'prioridad'],
      examples: [
        'crea tarea: llamar a Juan Pérez',
        'nueva tarea: revisar cotización para mañana',
        'agrega pendiente: enviar documento a María, vence el viernes'
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
      requiredParams: ['email', 'contenido'],
      optionalParams: [],
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
      requiredParams: ['email'],
      optionalParams: [],
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

    // ========== FACTURACIÓN & VERI*FACTU ==========
    {
      name: 'crear_factura',
      description: 'Generar una factura legal con sello Veri*factu',
      requiredParams: ['leadId'],
      optionalParams: ['monto', 'concepto'],
      examples: [
        'genera una factura para el lead juan@email.com',
        'crea factura para María García por 5000€',
        'factura para Carlos Ruiz por consultoría'
      ],
      destructive: false
    },
    {
      name: 'estado_fiscal',
      description: 'Consultar el estado fiscal e integridad de una factura',
      requiredParams: ['invoiceId'],
      optionalParams: [],
      examples: [
        'dime el estado fiscal de la factura FAC-001',
        'verifica la integridad de la factura #123',
        'estado de la factura de juan@email.com'
      ],
      destructive: false
    },
    {
      name: 'cancelar_factura',
      description: 'Cancelar o anular una factura existente',
      requiredParams: ['invoiceId'],
      optionalParams: [],
      examples: [
        'cancela la factura FAC-001',
        'anula la factura #123',
        'elimina la factura de juan@email.com'
      ],
      destructive: true
    },
    {
      name: 'rectificar_factura',
      description: 'Rectificar una factura existente (corregir monto o datos)',
      requiredParams: ['invoiceId', 'razon'],
      optionalParams: ['monto'],
      examples: [
        'rectifica la factura FAC-001, el monto correcto es 4500€',
        'corrige la factura #123 por error en el concepto',
        'rectificar factura de juan@email.com, motivo: cálculo incorrecto'
      ],
      destructive: true
    },

    // ========== GASTOS & FINANZAS ==========
    {
      name: 'registrar_gasto',
      description: 'Registrar un gasto o egreso',
      requiredParams: ['monto', 'concepto'],
      optionalParams: ['fecha', 'proveedor', 'email', 'categoria', 'fotoUrl'],
      examples: [
        'registra gasto de 45.90 en comida',
        'nuevo gasto: 120€ de electricidad, proveedor Iberdrola',
        'gasto de 300€ en software, categoría herramientas'
      ],
      destructive: false
    },
    {
      name: 'crear_proveedor',
      description: 'Registrar un nuevo proveedor',
      requiredParams: ['nombre'],
      optionalParams: ['email', 'telefono', 'direccion'],
      examples: [
        'registra proveedor: Suministros SA, email ventas@suministros.com',
        'nuevo proveedor: Papelería López',
        'crea proveedor Tecnología Plus SA de CV'
      ],
      destructive: false
    },
    {
      name: 'analizar_gastos',
      description: 'Analizar gastos, burn rate o salud financiera',
      requiredParams: [],
      optionalParams: ['periodo'],
      examples: [
        'cómo vamos de gastos este mes',
        'analiza mi burn rate',
        'dame mi salud financiera',
        'qué gastos hemos tenido'
      ],
      destructive: false
    },
    {
      name: 'proyeccion_financiera',
      description: 'Proyección financiera, EBITDA, flujo de caja o forecast',
      requiredParams: [],
      optionalParams: ['periodo'],
      examples: [
        'cómo se ve el flujo de caja para el próximo mes',
        'pronóstico financiero',
        'proyecta el EBITDA del trimestre'
      ],
      destructive: false
    },

    // ========== INVENTARIO ==========
    {
      name: 'salud_inventario',
      description: 'Consultar la salud del inventario, stock bajo o predicción de rupturas',
      requiredParams: [],
      optionalParams: ['producto'],
      examples: [
        'cómo está el inventario',
        'qué productos tienen stock bajo',
        'salud del inventario del producto X',
        'hay riesgo de ruptura de stock'
      ],
      destructive: false
    },
    {
      name: 'ajustar_stock',
      description: 'Ajustar cantidades de stock (entrada, salida o transferencia)',
      requiredParams: ['producto', 'cantidad'],
      optionalParams: ['tipo'],
      examples: [
        'ajusta el stock del producto X, entrada de 50 unidades',
        'salida de 10 unidades del producto Y',
        'transfiere 20 unidades del producto Z al almacén 2'
      ],
      destructive: true
    },
    {
      name: 'buscar_producto',
      description: 'Buscar productos en el catálogo o inventario',
      requiredParams: [],
      optionalParams: ['producto', 'categoria'],
      examples: [
        'busca el producto X en el catálogo',
        'qué productos hay en la categoría Y',
        'encuentra el ítem Z en el inventario'
      ],
      destructive: false
    },
    {
      name: 'gestionar_catalogo',
      description: 'Exportar catálogo, ver definiciones o ver ítems del catálogo',
      requiredParams: [],
      optionalParams: ['accion'],
      examples: [
        'exporta el catálogo completo',
        'dame las definiciones del catálogo',
        'muéstrame los ítems del catálogo'
      ],
      destructive: false
    },

    // ========== MARKETING ==========
    {
      name: 'generar_copy',
      description: 'Generar copy publicitario, contenido social o textos de marketing con IA',
      requiredParams: ['tema'],
      optionalParams: ['tono', 'formato'],
      examples: [
        'genera un copy para una campaña de email sobre nuestro nuevo producto',
        'crea un post para redes sociales promocionando descuento',
        'escribe un texto publicitario para WhatsApp'
      ],
      destructive: false
    },
    {
      name: 'analizar_sentimiento',
      description: 'Analizar sentimiento de feedback social o comentarios de clientes',
      requiredParams: ['texto'],
      optionalParams: [],
      examples: [
        'analiza el sentimiento de este feedback: "El servicio fue excelente"',
        'qué opinan los clientes sobre nosotros',
        'analiza estos comentarios: "Muy mal servicio"'
      ],
      destructive: false
    },
    {
      name: 'sugerir_campania',
      description: 'Sugerir optimizaciones de campaña basadas en datos',
      requiredParams: [],
      optionalParams: [],
      examples: [
        'sugiere mejoras para mi campaña actual',
        'cómo puedo optimizar mis campañas de marketing',
        'dame sugerencias de campaña'
      ],
      destructive: false
    },

    // ========== RRHH ==========
    {
      name: 'resumen_rrhh',
      description: 'Obtener el resumen ejecutivo diario de RH (briefing militar)',
      requiredParams: [],
      optionalParams: [],
      examples: [
        'dame el resumen diario de RH',
        'briefing de recursos humanos',
        'cómo está el equipo hoy'
      ],
      destructive: false
    },
    {
      name: 'aprobar_vacaciones',
      description: 'Aprobar solicitud de vacaciones con nota personalizada',
      requiredParams: ['solicitudId'],
      optionalParams: ['nota'],
      examples: [
        'aprueba la solicitud de vacaciones #123',
        'autoriza vacaciones de María con nota: "Disfruta tus días"',
        'confirma la solicitud de vacaciones de Juan Pérez'
      ],
      destructive: false
    },
    {
      name: 'riesgo_rotacion',
      description: 'Analizar riesgo de rotación de talento en el equipo',
      requiredParams: [],
      optionalParams: ['empleadoId'],
      examples: [
        'analiza el riesgo de rotación del equipo',
        'quién tiene riesgo de irse',
        'dame el análisis de retención de talento'
      ],
      destructive: false
    },

    // ========== PROYECTOS ==========
    {
      name: 'rentabilidad_proyecto',
      description: 'Calcular la rentabilidad real de un proyecto',
      requiredParams: ['proyectoId'],
      optionalParams: [],
      examples: [
        'cuál es la rentabilidad del proyecto Alpha',
        'dame el profitability del proyecto X',
        'cómo va el proyecto Y financieramente'
      ],
      destructive: false
    },
    {
      name: 'desviaciones_proyecto',
      description: 'Detectar desviaciones presupuestarias o de cronograma en proyectos',
      requiredParams: [],
      optionalParams: [],
      examples: [
        'detecta desviaciones en mis proyectos',
        'hay proyectos con problemas de presupuesto',
        'qué proyectos se están desviando del plan'
      ],
      destructive: false
    },

    // ========== ANÁLISIS GLOBAL ==========
    {
      name: 'auditar_integridad',
      description: 'Auditar integridad financiera, brechas en Veri*factu o anomalías en gastos',
      requiredParams: [],
      optionalParams: [],
      examples: [
        'audita la integridad financiera',
        'hay anomalías en los gastos',
        'verifica la integridad fiscal'
      ],
      destructive: false
    },
    {
      name: 'analizar_rentabilidad_global',
      description: 'Analizar rentabilidad global: EBITDA, margen real y salud financiera integral',
      requiredParams: [],
      optionalParams: ['periodo'],
      examples: [
        'dame la rentabilidad global del negocio',
        'cómo vamos financieramente en general',
        'analiza el EBITDA del último trimestre',
        'estado de salud financiera integral'
      ],
      destructive: false
    },

    // ========== PRODUCCIÓN / CALIDAD ==========
    {
      name: 'calcular_costo_produccion',
      description: 'Calcular costo proyectado de fabricación (BoM + mano de obra)',
      requiredParams: ['productoId'],
      optionalParams: [],
      examples: [
        'calcula el costo de producción del producto X',
        'cuánto cuesta fabricar el producto Y',
        'dame el costo de manufactura del lote Z'
      ],
      destructive: false
    },
    {
      name: 'detectar_anomalias_calidad',
      description: 'Detectar anomalías de calidad cruzando materiales y proveedores',
      requiredParams: [],
      optionalParams: [],
      examples: [
        'detecta anomalías de calidad',
        'hay problemas de calidad con algún proveedor',
        'análisis de calidad del último lote'
      ],
      destructive: false
    },

    // ========== CONSULTA GENERAL ==========
    {
      name: 'consulta_general',
      description: 'Consulta general, saludo, ayuda, o conversación no relacionada con CRUD',
      requiredParams: [],
      optionalParams: [],
      examples: [
        'hola, ¿cómo estás?',
        'gracias por tu ayuda',
        'qué puedes hacer?',
        'ayuda',
        'comandos disponibles'
      ],
      destructive: false
    }
  ];

  private readonly MIN_CONFIDENCE = 0.5;

  async classify(params: {
    message: string;
    context?: string;
    userId: string;
    tenantId: string;
  }): Promise<IntentClassification> {
     const startTime = Date.now();
    
    const systemPrompt = this.buildSystemPrompt(params.context);
    const userPrompt = this.buildUserPrompt(params.message);
    console.log(`[IntentClassifier] Using classification-only prompt for: "${params.message}"`);
    
    try {
      console.log(`[IntentClassifier] Classifying: "${params.message}"`);
      const response = await callAssistantWithFallback([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      
      const content = response.choices[0].message.content;
      console.log(`[IntentClassifier] AI Response: "${content}"`);
      const rawResponse = content || '';
      const parsed = this.parseResponse(rawResponse);
      
      const intentExists = this.intentsSchema.some(i => i.name === parsed.intent);
      if (!intentExists && parsed.intent !== 'unknown') {
        console.warn(`Intent desconocido: ${parsed.intent}, usando consulta_general`);
        parsed.intent = 'consulta_general';
        parsed.confidence = Math.min(parsed.confidence, 0.3);
      }

      if (Object.keys(parsed.extractedParams || {}).length === 0 && parsed.intent !== 'consulta_general') {
        parsed.extractedParams = this.fallbackExtract(params.message, parsed.intent);
      }

      await this.logClassification({
        ...params,
        intent: parsed.intent,
        confidence: parsed.confidence,
        duration: Date.now() - startTime,
        rawResponse
      });

      const missingParams = this.getMissingParams(parsed.intent, parsed.extractedParams);
      const needsMoreInfo = missingParams.length > 0;
      
      if (needsMoreInfo) {
        parsed.missingParams = missingParams;
      }
      
      return {
        intent: parsed.intent,
        confidence: parsed.confidence,
        needsMoreInfo,
        missingParams,
        extractedParams: parsed.extractedParams || {},
        rawResponse
      };
      
    } catch (error) {
      console.error('Error en IntentClassifierAgent:', error);
      
      return {
        intent: 'consulta_general',
        confidence: 0.1,
        needsMoreInfo: false,
        missingParams: [],
        extractedParams: {},
        rawResponse: 'Error en clasificación'
      };
    }
  }

  private getMissingParams(intent: string, extractedParams: Record<string, any>): string[] {
    const schema = this.intentsSchema.find(i => i.name === intent);
    if (!schema) return [];
    
    return schema.requiredParams.filter(param => !extractedParams[param]);
  }

  private buildSystemPrompt(context?: string): string {
    const intentsList = this.intentsSchema.map(i => 
      `- ${i.name}: ${i.description}. Parámetros requeridos: ${i.requiredParams.join(', ') || 'ninguno'}`
    ).join('\n');
    
    return `Eres un clasificador de intenciones para Volkern CRM.

INTENCIONES DISPONIBLES:
${intentsList}

REGLAS ESTRICTAS:
1. Devuelve SOLO JSON, nada más.
2. confidence debe ser un número entre 0 y 1.
3. Si faltan parámetros requeridos, needsMoreInfo = true y lista missingParams.
4. Si todos los parámetros requeridos están presentes, needsMoreInfo = false.
5. Para mensajes ambiguos, confidence < 0.7 y usa consulta_general.
6. Extrae los parámetros del mensaje en extractedParams.
7. Para fechas relativas ("mañana", "viernes"), conviértelas a YYYY-MM-DD.

FORMATO DE RESPUESTA:
{
  "intent": "nombre_intent",
  "confidence": 0.95,
  "needsMoreInfo": false,
  "missingParams": [],
  "extractedParams": {
    "nombre": "Juan Pérez",
    "email": "juan@email.com"
  }
}

${context ? `CONTEXTO DE CONVERSACIÓN PREVIA:\n${context}\n` : ''}
`;
  }

  private buildUserPrompt(message: string): string {
    return `Mensaje del usuario: "${message}"\n\nClasifica la intención y extrae los parámetros.`;
  }

  private parseResponse(rawResponse: string): any {
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(rawResponse);
    } catch (error) {
      console.error('Error parsing response:', rawResponse);
      return {
        intent: 'consulta_general',
        confidence: 0.1,
        needsMoreInfo: false,
        missingParams: [],
        extractedParams: {}
      };
    }
  }

  private fallbackExtract(message: string, intent: string): Record<string, any> {
    const extracted: Record<string, any> = {};
    
    const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch) {
      extracted.email = emailMatch[1];
    }
    
    const nameMatch = message.match(/(?:agrega|crea|nuevo|contacto)\s+(?:a\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (nameMatch) {
      extracted.nombre = nameMatch[1];
    }
    
    const amountMatch = message.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros|euro|pesos|dolares|USD|EUR)/i);
    if (amountMatch && intent === 'registrar_gasto') {
      extracted.monto = parseFloat(amountMatch[1].replace(',', '.'));
    }
    
    return extracted;
  }

  private async logClassification(data: {
    message: string;
    userId: string;
    tenantId: string;
    intent: string;
    confidence: number;
    duration: number;
    rawResponse: string;
  }): Promise<void> {
    try {
      await prisma.chatbotAuditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          intent: data.intent,
          status: 'PENDING',
          inputRaw: data.message.substring(0, 500),
          executionTimeMs: data.duration,
          gemmaOutput: data.rawResponse.substring(0, 1000),
          detectedEntities: { confidence: data.confidence },
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error logging classification:', error);
    }
  }

  getIntentSchema(intentName: string): IntentSchema | undefined {
    return this.intentsSchema.find(i => i.name === intentName);
  }

  isDestructive(intentName: string): boolean {
    const schema = this.getIntentSchema(intentName);
    return schema?.destructive || false;
  }

  getRequiredParams(intentName: string): string[] {
    const schema = this.getIntentSchema(intentName);
    return schema?.requiredParams || [];
  }
}

export const intentClassifier = new IntentClassifierAgent();