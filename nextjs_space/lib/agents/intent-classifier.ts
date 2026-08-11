import { callAssistantWithFallback } from '@/lib/assistant/openrouter-client';
import { prisma } from '@/lib/db';
import { ALL_INTENTS } from './intents/operations-intents';

type IntentSchema = any;

export interface IntentClassification {
  intent: string;
  confidence: number;
  needsMoreInfo: boolean;
  missingParams: string[];
  extractedParams: Record<string, any>;
  rawResponse: string;
}

export class IntentClassifierAgent {
  private readonly intentsSchema: IntentSchema[] = ALL_INTENTS;

  private readonly MIN_CONFIDENCE = 0.5;

  async classify(params: {
    message: string;
    context?: string;
    userId: string;
    tenantId: string;
    pendingIntent?: string;
    collectedEntities?: Record<string, any>;
    missingEntities?: string[];
  }): Promise<IntentClassification> {
     const startTime = Date.now();

    // ═══ RUTA RÁPIDA DETERMINISTA (sin LLM) ═══════════════════════════════
    // Los intents de creación (crear_lead / crear_contacto / crear_empresa) se
    // detectan con regex para que funcionen aunque la cadena de LLM esté caída
    // o lenta — evitando el PIPELINE_TIMEOUT de 25s del webhook de Telegram
    // (el último respaldo de la cadena, gemini-2.5-flash, ya no existe).
    const deterministic = await this.classifyDeterministic(params)
    if (deterministic) {
      return deterministic
    }

    const systemPrompt = this.buildSystemPrompt(
      params.context,
      params.pendingIntent,
      params.collectedEntities,
      params.missingEntities
    );
    const userPrompt = this.buildUserPrompt(params.message);
    console.log(`[IntentClassifier] Using classification-only prompt for: "${params.message}"`);
    
    try {
      console.log(`[IntentClassifier] Classifying: "${params.message}"`);
      const response = await callAssistantWithFallback([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], 10000);
      
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

      // Continuar el intent pendiente (multi-turno): si el clasificador devolvió
      // algo ambiguo pero hay una acción pendiente, mantenerla.
      if (params.pendingIntent && (parsed.intent === 'unknown' || parsed.intent === 'consulta_general')) {
        parsed.intent = params.pendingIntent;
      }

      if (Object.keys(parsed.extractedParams || {}).length === 0 && parsed.intent !== 'consulta_general') {
        parsed.extractedParams = this.fallbackExtract(params.message, parsed.intent);
      }

      // Fusionar entidades ya capturadas en turnos previos (nunca perderlas).
      // Solo cuando hay un intent pendiente activo: las entidades recolectadas
      // pertenecen a ese flujo y no deben inyectarse en intents nuevos.
      if (params.pendingIntent && params.collectedEntities && Object.keys(params.collectedEntities).length > 0) {
        parsed.extractedParams = {
          ...params.collectedEntities,
          ...(parsed.extractedParams || {}),
        };
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
      
    } catch (error: any) {
      // Log imprescindible: un fallo aquí degrada a consulta_general y el usuario
      // ve una respuesta LLM genérica. Sin este log (ej. rate limit 429 de Gemini
      // free tier) el fallo quedaba invisible en el audit log.
      console.error('[IntentClassifier] Error en clasificación:', error?.message || error);
      try {
        await this.logClassification({
          ...params,
          intent: 'ERROR_CLASIFICACION',
          confidence: 0,
          duration: Date.now() - startTime,
          rawResponse: `Error en clasificación: ${error?.message || error}`.substring(0, 1000)
        });
      } catch (logError) {
        console.warn('[IntentClassifier] Error logueando fallo de clasificación:', logError);
      }

      // Fallback determinista multi-turno: si la cadena LLM falló pero hay una
      // acción pendiente y el mensaje contiene el dato faltante, completarla.
      const multiTurn = this.tryMultiTurnDeterministic(params)
      if (multiTurn) {
        return multiTurn
      }

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
    
    const missing = schema.requiredParams.filter((param: string) => !extractedParams[param]);

    // agendar_cita: el contacto puede venir como nombre O email. Si falta por
    // completo se pide el NOMBRE (nunca el email — el wrapper auto-registra el
    // lead con email sintético cuando solo se da el nombre).
    if (intent === 'agendar_cita' && !extractedParams.nombre && !extractedParams.email) {
      if (!missing.includes('nombre')) missing.push('nombre');
    }

    // aprobar_vacaciones: la solicitud puede localizarse por número (solicitudId)
    // o por el nombre del empleado (su solicitud pendiente). Si el usuario dio el
    // nombre, el parámetro está satisfecho y NO se pide la solicitud. Si falta
    // por completo, se pide la solicitud.
    if (intent === 'aprobar_vacaciones') {
      if (extractedParams.nombre) {
        return missing.filter((p: string) => p !== 'solicitudId');
      }
      if (!extractedParams.solicitudId && !missing.includes('solicitudId')) {
        missing.push('solicitudId');
      }
    }

    // crear_test_ab: el nombre del test se sintetiza desde la campaña ("Test
    // A/B — verano"), así que nunca se pide por separado.
    if (intent === 'crear_test_ab') {
      return missing.filter((p: string) => p !== 'nombre');
    }

    // Real estate: el usuario se refiere a la propiedad por id, nombre o zona
    // ("la casa del centro"); el parámetro 'propiedad' satisface el
    // requiredParams 'propiedadId' del schema.
    const RE_PROP_INTENTS = ['generar_descripcion_inmueble', 'sugerir_precio_inmueble', 'calificar_inmueble', 'calcular_comision_franquicia']
    if (RE_PROP_INTENTS.includes(intent) && extractedParams.propiedad) {
      return missing.filter((p: string) => p !== 'propiedadId');
    }

    // ERP industrial: el usuario se refiere al producto por nombre ('producto')
    // y al proyecto por nombre ('proyecto') — el wrapper resuelve a los ids.
    if (['calcular_costo_produccion', 'verificar_mermas', 'registrar_inspeccion_calidad'].includes(intent) && extractedParams.producto) {
      return missing.filter((p: string) => p !== 'productoId');
    }
    if (intent === 'rentabilidad_proyecto' && extractedParams.proyecto) {
      return missing.filter((p: string) => p !== 'proyectoId');
    }

    return missing;
  }

  private buildSystemPrompt(
    context?: string,
    pendingIntent?: string,
    collectedEntities?: Record<string, any>,
    missingEntities?: string[]
  ): string {
    const intentsList = this.intentsSchema.map(i => 
      `- ${i.name}: ${i.description}. Parámetros requeridos: ${i.requiredParams.join(', ') || 'ninguno'}`
    ).join('\n');

    // Contexto multi-turno: el usuario está completando una acción pendiente
    let turnContext = '';
    if (pendingIntent) {
      const collected = collectedEntities && Object.keys(collectedEntities).length > 0
        ? JSON.stringify(collectedEntities)
        : 'ninguno';
      const missing = missingEntities?.length ? missingEntities.join(', ') : 'ninguno';
      turnContext = `\n\nCONTEXTO MULTI-TURNO (OBLIGATORIO):\nEl usuario está completando la intención "${pendingIntent}".\nParámetros ya capturados: ${collected}.\nFaltan por capturar: ${missing}.\nDebes mantener la intención "${pendingIntent}" y extraer SOLO los parámetros que falten del mensaje actual.`;
    }
    
    return `Eres un clasificador de intenciones para Volkern CRM.

INTENCIONES DISPONIBLES:\n${intentsList}\n
REGLAS ESTRICTAS:\n1. Devuelve SOLO JSON, nada más.\n2. confidence debe ser un número entre 0 y 1.\n3. Si faltan parámetros requeridos, needsMoreInfo = true y lista missingParams.\n4. Si todos los parámetros requeridos están presentes, needsMoreInfo = false.\n5. Para mensajes ambiguos, confidence < 0.7 y usa consulta_general.\n6. Extrae los parámetros del mensaje en extractedParams.\n7. Para fechas relativas ("mañana", "viernes"), conviértelas a YYYY-MM-DD.\n\nFORMATO DE RESPUESTA:\n{\n  "intent": "nombre_intent",\n  "confidence": 0.95,\n  "needsMoreInfo": false,\n  "missingParams": [],\n  "extractedParams": {\n    "nombre": "Juan Pérez",\n    "email": "juan@email.com"\n  }\n}\n\n${context ? `CONTEXTO DE CONVERSACIÓN PREVIA:\n${context}\n` : ''}${turnContext}\n`;
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

  // ═══ CLASIFICACIÓN DETERMINISTA (sin LLM) ═══════════════════════════════
  // Ruta rápida para los intents de creación del CRM. Al no depender del LLM,
  // garantiza que crear leads/contactos/empresas funcione incluso cuando la
  // cadena de modelos está caída o lenta (el webhook de Telegram solo permite
  // ~25s y el último respaldo de la cadena, gemini-2.5-flash, ya no existe).

  private async classifyDeterministic(params: {
    message: string;
    userId: string;
    tenantId: string;
    pendingIntent?: string;
    collectedEntities?: Record<string, any>;
    missingEntities?: string[];
  }): Promise<IntentClassification | null> {
    const startTime = Date.now()

    // Caso multi-turno: completar la acción pendiente con el dato del mensaje.
    // PERO si el mensaje coincide con una intención de creación nueva y clara
    // (ej. el usuario cambió de idea y dice "crea la empresa X" mientras había
    // un crear_lead pendiente), la nueva intención gana para no secuestrar el
    // flujo con un pendingIntent colgado de un turno anterior.
    if (params.pendingIntent) {
      const freshDet = this.detectIntentDeterministically(params.message)
      if (freshDet) {
        return await this.completeDeterministic(params, freshDet.intent, freshDet.extractedParams)
      }
      const completed = this.tryMultiTurnDeterministic(params)
      if (completed) return completed
      return null
    }

    // Caso nuevo mensaje: detectar intent de creación
    const det = this.detectIntentDeterministically(params.message)
    if (!det) return null

    return this.completeDeterministic(params, det.intent, det.extractedParams, startTime)
  }

  private async completeDeterministic(
    params: { message: string; userId: string; tenantId: string },
    intent: string,
    extractedParams: Record<string, any>,
    startTime = Date.now()
  ): Promise<IntentClassification> {
    const missingParams = this.getMissingParams(intent, extractedParams)
    console.log(`[IntentClassifier] ✅ Ruta determinista: ${intent} (${Date.now() - startTime}ms)`)

    await this.logClassification({
      message: params.message,
      userId: params.userId,
      tenantId: params.tenantId,
      intent,
      confidence: 0.85,
      duration: Date.now() - startTime,
      rawResponse: '[determinista] ' + JSON.stringify(extractedParams),
    })

    return {
      intent,
      confidence: 0.85,
      needsMoreInfo: missingParams.length > 0,
      missingParams,
      extractedParams,
      rawResponse: '[determinista]',
    }
  }

  /**
   * Multi-turno sin LLM: si hay una acción pendiente y el mensaje contiene el
   * dato que falta (email, nombre, teléfono…), lo captura y completa.
   */
  private tryMultiTurnDeterministic(params: {
    message: string;
    pendingIntent?: string;
    collectedEntities?: Record<string, any>;
    missingEntities?: string[];
  }): IntentClassification | null {
    if (!params.pendingIntent || !params.missingEntities?.length) return null

    const extracted: Record<string, any> = {}
    for (const missing of params.missingEntities) {
      const val = this.extractParamDeterministically(missing, params.message)
      if (val) extracted[missing] = val
    }

    if (Object.keys(extracted).length === 0) return null

    const merged = { ...(params.collectedEntities || {}), ...extracted }
    const missingParams = this.getMissingParams(params.pendingIntent, merged)
    console.log(`[IntentClassifier] ✅ Multi-turno determinista: ${params.pendingIntent} → ${JSON.stringify(extracted)}`)

    return {
      intent: params.pendingIntent,
      confidence: 0.85,
      needsMoreInfo: missingParams.length > 0,
      missingParams,
      extractedParams: merged,
      rawResponse: '[determinista-multiturno]',
    }
  }

  /**
   * Detecta por patrones de texto (sin LLM) los intents del módulo Ventas:
   * - convertir_lead ("convierte a X en contacto")
   * - crear_lead / crear_contacto / crear_empresa
   * - buscar_lead ("busca el lead X", "encuentra a María", "dame los datos de X")
   * - listar_leads / listar_contactos ("lista los leads", "contactos tipo empresa")
   * y extrae sus parámetros con regex.
   */
  private detectIntentDeterministically(message: string): {
    intent: string;
    confidence: number;
    extractedParams: Record<string, any>;
  } | null {
    // Guard amplio: cualquier verbo de acción del módulo Ventas. Sin esto, los
    // mensajes de búsqueda/listado ("busca el lead…", "lista los contactos…")
    // nunca entrarían en la ruta determinista. También acepta frases de filtro
    // sin verbo: "leads en estado X", "contactos tipo empresa".
    const ACTION_VERB = /\b(?:agrega|crea|registra|nuev[oa]|añade|alta|abre|busca|encuentra|consulta|localiza|lista|listame|mu[eé]strame|muestra|ver|ens[eé][ñn]ame|dame|convierte|convertir|pasa|transforma|mueve|actualiza|cambia|modifica|pon|ponle|anota|anotar|tuve|registro|agenda|agendar|programa|programar|reserva|reservar|aparta|apartar|cancela|cancelar|anula|anular|reagenda|reagendar|confirmar|analiza|analizar|revisa|revisar|completa|completar|termina|terminar|finaliza|finalizar|marca|marcar|cierra|cerrar)\b/i
    const FILTER_ONLY = /\b(?:contactos?|leads?)\b.*\b(?:en\s+estado|por\s+estado|tipo|que\s+contengan|tags?)\b/i
    // Entidades del pipeline sin verbo: "cómo va mi pipeline", "qué deals tengo"
    const ENTITY_TRIGGER = /\b(?:pipeline|deals?|negocios?|oportunidad)\b/i
    // Entidades de citas sin verbo: "qué citas tengo", "reunión con X"
    const CITA_TRIGGER = /\b(?:citas?|reuni[oó]n|reuniones|videollamada)\b/i
    // Entidades de finanzas sin verbo: "gasto de 300€", "cómo vamos de gastos",
    // "proyección financiera", "impuestos", "rentabilidad" (décimo quinto entrenamiento)
    const FINANZA_TRIGGER = /\b(?:gastos?|egresos?|gast[ée]|burn\s*rate|salud\s+financiera|flujo\s+de\s+caja|proyecci[oó]n|pron[oó]stic(?:o|a|os)?|forecast|impuestos?|fiscal|provisi[oó]n|rentabilidad|ebitda|margen|financieramente)\b/i
    // Entidades de tareas/notas sin verbo: "qué tareas tengo", "ver notas de X"
    const TAREA_TRIGGER = /\b(?:tareas?|pendientes?|notas?|to[- ]?do)\b/i
    // Entidades de proveedores sin verbo: "lista de proveedores", "qué proveedores tengo"
    const PROVEEDOR_TRIGGER = /\bproveedor(?:es)?\b/i
    // Entidades de catálogo sin verbo: "qué productos hay", "precio de X", "cuánto cuesta X"
    const CATALOGO_TRIGGER = /\b(?:cat[aá]logo|productos?|servicios?|art[ií]culos?|inmuebles?|propiedad(?:es)?|precios?|cu[aá]nto\s+cuesta|cu[aá]nto\s+vale|qu[eé]\s+precio|precio\s+de)\b/i
    // Entidades de inventario sin verbo: "stock bajo", "existencias", "entrada/salida de X unidades"
    const INVENTARIO_TRIGGER = /\b(?:inventario|stock|existencias|unidades|reorden|ruptura)\b/i
    // Entidades de seguros sin verbo: "qué pólizas vencen", "siniestros abiertos",
    // "renovaciones pendientes", "clientes sin contacto", "pólizas por vencer"
    const INSURANCE_TRIGGER = /\b(?:p[oó]lizas?|siniestros?|renovaciones?|aseguradoras?|vence|vencen|indemnizaci[oó]n|sin\s+contacto|no\s+tienen\s+contacto|no\s+han\s+tenido\s+contacto|cartera\s+de\s+seguros?)\b/i
    // Entidades de facturación sin verbo: "factura para X", "estado fiscal de
    // FAC-001", "verifica la integridad de la factura" (décimo entrenamiento)
    const FACTURA_TRIGGER = /\b(?:facturas?|factur[aá]ci[oó]n|facturar|estado\s+fiscal|integridad\s+fiscal)\b/i
    // Entidades de ERP industrial sin verbo: producción, calidad, mermas,
    // proyectos y watchdog (décimo sexto entrenamiento)
    const ERP_TRIGGER = /\b(?:producci[oó]n|manufactura|fabricar|fabricaci[oó]n|calidad|mermas?|desperdicios?|scrap|inspecci[oó]n|qc\b|proyectos?|watchdog|reorden|reponer|desviaci[oó]n|rentabilidad\s+del\s+proyecto)\b/i
    // Entidades de logística sin verbo: "estado del envío TRK-123", "cómo está
    // la flota", "qué pedidos en tránsito", "ITV próxima a vencer" (undécimo)
    const LOGISTICA_TRIGGER = /\b(?:env[ií]os?|tracking|pedidos?|flota|veh[ií]culos?|cami[oó]nes?|rutas?|reparto|entregas?|paquetes?|itv|almac[eé]n(?:es)?)\b/i
    // Entidades de RRHH sin verbo: "resumen diario de RH", "briefing del equipo",
    // "quién tiene riesgo de irse", "solicitudes de vacaciones" (duodécimo)
    const RRHH_TRIGGER = /\b(?:rrhh|recursos\s+humanos|vacaciones|rotaci[oó]n|retenci[oó]n|irse|briefing|resumen\s+diario|estado\s+de\s+fuerza|equipo\s+hoy|talento)\b/i
    // Entidades de marketing/ads sin verbo: "copy para…", "sentimiento del
    // feedback", "sugerencias de campaña", "bloque hero para la landing",
    // "SEO de la página", "test A/B", "programaciones activas" (decimotercero)
    const MARKETING_TRIGGER = /\b(?:copy|post|publicaci[oó]n|texto\s+publicitario|sentimiento|opinan|opini[oó]n|feedback|comentarios?|rese[nñ]as?|campa[nñ]as?|marketing|bloque|secci[oó]n|landing|seo|metadatos|keywords?|palabras\s+clave|tests?|programaci[oó]n(?:es)?|horarios?\s+programados|automatizaci[oó]n|automatiza|automatizar|reglas\s+automa[á]?ticas?)\b/i
    // Entidades de real estate sin verbo: "la casa del centro", "departamento
    // en alquiler", "precio de la propiedad", "comisión de la venta"
    // (decimocuarto entrenamiento)
    const RE_TRIGGER = /\b(?:inmuebles?|propiedad(?:es)?|departamentos?|casas?|pisos?|oficinas?|locales?|terrenos?|solares?|chalets?|villas?|alquiler|en\s+venta|presupuesto\s+de|precio\s+(?:de|sugerido|de\s+venta)|comisi[oó]n(?:es)?\s+de|score\s+de\s+calidad|franquicia)\b/i
    if (!ACTION_VERB.test(message) && !ENTITY_TRIGGER.test(message) && !FILTER_ONLY.test(message) && !CITA_TRIGGER.test(message) && !FINANZA_TRIGGER.test(message) && !TAREA_TRIGGER.test(message) && !PROVEEDOR_TRIGGER.test(message) && !CATALOGO_TRIGGER.test(message) && !INVENTARIO_TRIGGER.test(message) && !INSURANCE_TRIGGER.test(message) && !FACTURA_TRIGGER.test(message) && !LOGISTICA_TRIGGER.test(message) && !RRHH_TRIGGER.test(message) && !MARKETING_TRIGGER.test(message) && !RE_TRIGGER.test(message) && !ERP_TRIGGER.test(message)) return null

    const extracted: Record<string, any> = {}
    const email = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/)
    if (email) extracted.email = email[1]

    // Mensaje sin emails: los tests de entidad (tarea/nota/gasto/cita) no deben
    // matchear palabras dentro de direcciones ("x@tareas.com" → no es una tarea).
    const msgNoEmails = message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}/g, ' ')

    // Campos opcionales del primer entrenamiento (Ventas): si el usuario los
    // menciona (cargo, teléfono, LinkedIn, ubicación, tags, contexto) se capturan
    // para que el skill los guarde en la BD — antes quedaban en null.
    const cargo = this.extractCargoDe(message)
    if (cargo) extracted.cargo = cargo
    const telefono = this.extractTelefonoDe(message)
    if (telefono) extracted.telefono = telefono
    const linkedin = this.extractLinkedinDe(message)
    if (linkedin) extracted.linkedin = linkedin
    const ubicacion = this.extractUbicacionDe(message)
    if (ubicacion) extracted.ubicacion = ubicacion
    const tags = this.extractTagsDe(message)
    if (tags) extracted.tags = tags
    const contexto = this.extractContextoDe(message)
    if (contexto) extracted.contexto = contexto

    const CREATE_VERB = /\b(?:agrega|crea|registra|nuev[oa]|añade|alta)\b/i
    const BUSCAR_VERB = /\b(?:busca|encuentra|consulta|localiza)\b/i

    // ═══ 0. SEGUROS (Noveno entrenamiento): pólizas, renovaciones y siniestros ═══
    // Se detectan ANTES que el resto del CRM: "registra un siniestro de la
    // póliza 8888: …" contiene ':' y caería en registrar_interaccion; "pasa el
    // siniestro SIN-001 a en trámite" no debe confundirse con convertir_lead.
    // Los términos (póliza/siniestro/renovación) son distintivos y ganan sobre
    // las ramas de Ventas/Finanzas. Permite controlar el módulo Seguros desde
    // Telegram sin depender del LLM (misma garantía que crear_lead).
    const POLIZA_ENTITY = /\b(?:p[oó]liza|p[oó]lizas)\b/i
    const SINIESTRO_ENTITY = /\b(?:siniestro|siniestros)\b/i
    const RENOVACION_ENTITY = /\brenovaciones?\b/i

    // 0a. ACTUALIZAR SINIESTRO ("pasa el siniestro SIN-001 a en trámite",
    // "marca como pagado el siniestro de la póliza AXA-1234 con indemnización
    // 1200", "rechaza el siniestro SIN-002 por no estar cubierto") — antes que
    // crear para que "marca como pagado…" no se lea como creación ═══
    const UPDATE_SINIESTRO_VERB = /\b(?:pasa|pasar|avanza|avanzar|actualiza|actualizar|cambia|cambiar|marca\s+como|marcar\s+como|rechaza|rechazar|cierra|cerrar|paga|pagar|aprueba|aprobar)\b/i
    const CREATE_SINIESTRO_VERB = /\b(?:reporta|reportar|crea|crear|registra|registrar|nuev[oa]|abre|abrir|añade|añadir)\b/i
    if (SINIESTRO_ENTITY.test(message) && UPDATE_SINIESTRO_VERB.test(message) && !CREATE_SINIESTRO_VERB.test(message)) {
      const siniestro = this.extractNumeroSiniestroDe(message) || this.extractPolizaRefDe(message)
      if (siniestro) extracted.siniestro = siniestro
      // Estado: texto explícito ("a en trámite", "abierto") o inferido del verbo
      // ("rechaza" → RECHAZADO, "cierra" → CERRADO, "paga" → PAGADO).
      const estado = this.extractEstadoSiniestroDe(message)
      if (estado) extracted.estado = estado
      else if (/\b(?:rechaza|rechazar)\b/i.test(message)) extracted.estado = 'RECHAZADO'
      else if (/\b(?:cierra|cerrar)\b/i.test(message)) extracted.estado = 'CERRADO'
      else if (/\b(?:paga|pagar|aprueba|aprobar)\b/i.test(message)) extracted.estado = 'PAGADO'
      else if (/\b(?:pasa|pasar|avanza|avanzar|actualiza|actualizar|cambia|cambiar)\b/i.test(message)) extracted.estado = 'EN_TRAMITE'
      const montoIndemnizado = this.extractIndemnizacionDe(message)
      if (montoIndemnizado !== null) extracted.montoIndemnizado = montoIndemnizado
      const motivo = this.extractMotivoRechazoDe(message)
      if (motivo) extracted.motivoRechazo = motivo
      return { intent: 'actualizar_siniestro', confidence: 0.85, extractedParams: extracted }
    }

    // 0b. CREAR SINIESTRO ("reporta un siniestro para la póliza AXA-1234:
    // colisión leve, monto reclamado 1500", "crea un siniestro contra POL-001…") ═══
    if (SINIESTRO_ENTITY.test(message) && CREATE_SINIESTRO_VERB.test(message)) {
      const poliza = this.extractPolizaRefDe(message)
      if (poliza) extracted.poliza = poliza
      const numeroSiniestro = this.extractNumeroSiniestroDe(message)
      if (numeroSiniestro) extracted.numeroSiniestro = numeroSiniestro
      const descripcion = this.extractDescripcionSiniestroDe(message)
      if (descripcion) extracted.descripcion = descripcion
      const monto = this.extractMontoReclamadoDe(message)
      if (monto !== null) extracted.montoReclamado = monto
      const fechaSuceso = this.extractFechaDe(message)
      if (fechaSuceso) extracted.fechaSuceso = fechaSuceso
      const estado = this.extractEstadoSiniestroDe(message)
      if (estado) extracted.estado = estado
      return { intent: 'crear_siniestro', confidence: 0.85, extractedParams: extracted }
    }

    // 0c. LISTAR SINIESTROS ("muéstrame los siniestros", "qué siniestros
    // están abiertos", "siniestros de AXA", "cuántos siniestros tiene Juan") ═══
    const LISTAR_SINIESTROS = /\b(?:lista|listame|mu[eé]strame|muestra|ver|ens[eé][ñn]ame)\s+(?:los\s+|mis\s+|tus\s+|todos\s+los\s+)?siniestros?\b|(?:qu[eé]|cu[aá]ntos)\s+siniestros?\s+(?:tengo|hay|tienes|tenemos|est[aá]n|tiene|tienen)|siniestros?\s+(?:de|del|por|en|abiertos?|rechazados?|pagados?|cerrados?|en\s+tr[aá]mite|reportados?|pendientes?)\b/i
    if (SINIESTRO_ENTITY.test(message) && LISTAR_SINIESTROS.test(message)) {
      const estado = this.extractEstadoSiniestroDe(message)
      if (estado) extracted.estado = estado
      const aseguradora = this.extractAseguradoraDe(message)
      if (aseguradora) extracted.aseguradora = aseguradora
      const cliente = this.extractClienteSeguroDe(message)
      if (cliente) extracted.cliente = cliente
      return { intent: 'listar_siniestros', confidence: 0.85, extractedParams: extracted }
    }

    // 0d. CREAR PÓLIZA ("registra la póliza AXA-1234 para Juan Pérez con
    // vencimiento el 2026-12-31", "crea una póliza para maria@empresa.com:
    // producto Vida, aseguradora AXA, prima 850") ═══
    if (POLIZA_ENTITY.test(message) && CREATE_VERB.test(message)) {
      const numeroPoliza = this.extractNumeroPolizaDe(message)
      if (numeroPoliza) extracted.numeroPoliza = numeroPoliza
      const aseguradora = this.extractAseguradoraDe(message)
      if (aseguradora) extracted.aseguradora = aseguradora
      // Vencimiento: la fecha que sigue a "vence/vencimiento" ("vence en 1 año"
      // no se parsea → pide el dato en multi-turno). Si no hay keyword, la
      // última fecha explícita del mensaje.
      const venceIdx = message.search(/\b(?:vence|vencimiento|vence\s+el|vence\s+en)\b/i)
      let fechaVencimiento: string | null = null
      if (venceIdx >= 0) {
        fechaVencimiento = this.extractFechaDe(message.slice(venceIdx))
      } else {
        const dates = [...message.matchAll(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/g)]
        if (dates.length > 0) fechaVencimiento = dates[dates.length - 1][1]
      }
      if (fechaVencimiento) extracted.fechaVencimiento = fechaVencimiento
      const fechaInicio = this.extractFechaInicioDe(message)
      if (fechaInicio) extracted.fechaInicio = fechaInicio
      const ramo = this.extractRamoSeguroDe(message)
      if (ramo) extracted.ramo = ramo
      const prima = this.extractPrimaDe(message)
      if (prima !== null) extracted.primaAnual = prima
      const suma = this.extractSumaAseguradaDe(message)
      if (suma !== null) extracted.sumaAsegurada = suma
      const cliente = this.extractClienteSeguroDe(message)
      if (cliente) extracted.cliente = cliente
      return { intent: 'crear_poliza', confidence: 0.85, extractedParams: extracted }
    }

    // 0e. PÓLIZAS POR VENCER ("qué pólizas vencen pronto", "pólizas por
    // vencer en 60 días", "renovaciones en los próximos 30 días") — antes que
    // mis_polizas para que "muéstrame las pólizas que vencen este mes" no se
    // lea como listado simple ═══
    if ((POLIZA_ENTITY.test(message) || RENOVACION_ENTITY.test(message)) && /\b(?:vence|vencen|venc[eí]|por\s+vencer|a\s+vencer|pr[oó]ximas?\s+a\s+vencer|pr[oó]ximos?\s+\d+\s+d[ií]as)\b/i.test(message)) {
      const dias = this.extractDiasDe(message)
      if (dias !== null) extracted.dias = dias
      return { intent: 'polizas_por_vencer', confidence: 0.85, extractedParams: extracted }
    }

    // 0f. RENOVACIONES PENDIENTES ("qué renovaciones están pendientes",
    // "renovaciones en riesgo de perderse") ═══
    if (RENOVACION_ENTITY.test(message) && /\b(?:pendientes?|en\s+riesgo|riesgo\s+de\s+p[eé]rdida|estado\s+de\s+las|con\s+oferta|en\s+proceso)\b/i.test(message)) {
      if (/\b(?:en\s+riesgo|riesgo\s+de\s+p[eé]rdida)\b/i.test(message)) extracted.riesgo = true
      const estado = this.extractEstadoRenovacionDe(message)
      if (estado) extracted.estado = estado
      return { intent: 'renovaciones_pendientes', confidence: 0.85, extractedParams: extracted }
    }

    // 0g. CLIENTES SIN CONTACTO ("qué clientes no tienen contacto hace tiempo",
    // "clientes sin contacto en 90 días", "dame los clientes abandonados") ═══
    if (/\b(?:clientes?|asegurados?)\b/i.test(message) && /\b(?:sin\s+contacto|no\s+tienen\s+contacto|no\s+han\s+tenido\s+contacto|abandonados?|sin\s+actividad)\b/i.test(message)) {
      const dias = this.extractDiasDe(message)
      if (dias !== null) extracted.dias = dias
      return { intent: 'clientes_sin_contacto', confidence: 0.85, extractedParams: extracted }
    }

    // 0h. MIS PÓLIZAS ("muéstrame las pólizas", "lista las pólizas activas",
    // "qué pólizas tiene Juan Pérez", "pólizas del ramo auto", "ver pólizas de AXA") ═══
    const LIST_VERB_POLIZAS = /\b(?:lista|listame|mu[eé]strame|muestra|ver|ens[eé][ñn]ame)\b/i
    const FILTER_SIGNAL_POLIZAS = /\b(?:en\s+estado|por\s+estado|en\s+etapa|por\s+etapa|tipo|de\s+ramo|del\s+ramo|por\s+ramo)\b/i
    if (POLIZA_ENTITY.test(message) && (LIST_VERB_POLIZAS.test(message) || FILTER_SIGNAL_POLIZAS.test(message) || BUSCAR_VERB.test(message) || /qu[eé]\s+p[oó]lizas?\s+(?:tiene|hay|tengo|tienes|tenemos)\b/i.test(message) || /\bp[oó]lizas?\s+(?:de|del|por|en)\b/i.test(message))) {
      const estado = this.extractEstadoPolizaDe(message)
      if (estado) extracted.estado = estado
      const ramo = this.extractRamoSeguroDe(message)
      if (ramo) extracted.ramo = ramo
      const aseguradora = this.extractAseguradoraDe(message)
      if (aseguradora) extracted.aseguradora = aseguradora
      const cliente = this.extractClienteSeguroDe(message)
      if (cliente) extracted.cliente = cliente
      return { intent: 'mis_polizas', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0i. FACTURACIÓN (Décimo entrenamiento): crear, cancelar, estado fiscal
    // y rectificar facturas Veri*factu. Se detectan ANTES que registrar_interaccion
    // ("crea factura para María: consultoría por 500€" contiene ':' y caería en
    // interacción) y antes que los gastos ("anula la factura #123" tiene verbo
    // de gasto pero la entidad factura gana). Permite controlar el módulo de
    // facturación desde Telegram sin depender del LLM ═══
    const FACTURA_ENTITY = /\bfacturas?\b/i

    // 0i-a. ESTADO FISCAL ("dime el estado fiscal de la factura FAC-001",
    // "verifica la integridad de la factura #123", "estado de la factura de
    // juan@email.com") — antes que crear/cancelar para que "verifica la
    // factura…" no se lea como creación ═══
    const ESTADO_FISCAL_SIGNAL = /\b(?:estado\s+fiscal|estado\s+de\s+(?:la\s+|mi\s+)?factura|integridad\s+fiscal|integridad\s+(?:de\s+la\s+)?factura|verifica|verificar|revisa|revisar)\b/i
    if (FACTURA_ENTITY.test(message) && ESTADO_FISCAL_SIGNAL.test(message)) {
      const factura = this.extractNumeroFacturaDe(message)
      if (factura) extracted.factura = factura
      return { intent: 'estado_fiscal', confidence: 0.85, extractedParams: extracted }
    }

    // 0i-b. CANCELAR FACTURA ("cancela la factura FAC-001", "anula la factura
    // #123", "cancelar factura de Juan Pérez, motivo: error en datos") ═══
    const CANCEL_FACTURA_VERB = /\b(?:cancela|cancelar|anula|anular|elimina|eliminar)\b/i
    if (FACTURA_ENTITY.test(message) && CANCEL_FACTURA_VERB.test(message)) {
      const factura = this.extractNumeroFacturaDe(message)
      if (factura) extracted.factura = factura
      const motivo = this.extractMotivoFacturaDe(message)
      if (motivo) extracted.motivo = motivo
      return { intent: 'cancelar_factura', confidence: 0.85, extractedParams: extracted }
    }

    // 0i-c. RECTIFICAR FACTURA ("rectifica la factura FAC-001, el monto
    // correcto es 4500€", "corrige la factura #123 por error en el concepto") ═══
    const RECTIFICAR_FACTURA_VERB = /\b(?:rectifica|rectificar|corrige|corregir)\b/i
    if (FACTURA_ENTITY.test(message) && RECTIFICAR_FACTURA_VERB.test(message)) {
      const factura = this.extractNumeroFacturaDe(message)
      if (factura) extracted.factura = factura
      const razon = this.extractMotivoFacturaDe(message)
      if (razon) extracted.razon = razon
      const monto = this.extractMontoFacturaDe(message)
      if (monto !== null) extracted.monto = monto
      return { intent: 'rectificar_factura', confidence: 0.85, extractedParams: extracted }
    }

    // 0i-d. CREAR FACTURA ("genera una factura para el lead juan@email.com",
    // "crea factura para María García por 5000€", "factura para Carlos Ruiz
    // por consultoría") — el cliente se resuelve por email o nombre en el
    // wrapper; aquí solo se captura. Sin verbo solo entra con "para/a" (no
    // "de"): "pago la factura de juan@…" es un pago, no una creación ═══
    const CREATE_FACTURA_VERB = /\b(?:crea|crear|genera|generar|emite|emitir|registra|registrar|nueva|nuevo|haz|hacer)\b/i
    if (FACTURA_ENTITY.test(message) && (CREATE_FACTURA_VERB.test(message) || /\bfacturas?\s+(?:para|a)\b/i.test(message))) {
      const cliente = this.extractClienteFacturaDe(message)
      // Si viene un email ("factura para el lead juan@email.com") se usa como
      // referencia de cliente; el wrapper distingue email vs nombre.
      if (cliente) extracted.cliente = cliente
      else if (email) extracted.cliente = email
      const monto = this.extractMontoFacturaDe(message)
      if (monto !== null) extracted.monto = monto
      const concepto = this.extractConceptoFacturaDe(message)
      if (concepto) extracted.concepto = concepto
      return { intent: 'crear_factura', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0j. LOGÍSTICA (Undécimo entrenamiento): envíos, pedidos, flota, rutas
    // y almacén. Son consultas operativas (no crean nada) — el dueño las hace
    // desde el móvil; no deben depender del LLM ═══
    const PEDIDO_SIGNAL = /\b(?:pedidos?|#?ORD[-_][A-Z0-9]+|#?PED[-_][A-Z0-9]+)\b/i
    const TRACKING_WORD = /\btracking\b/i
    const TRACKING_REF = /\b(?:TRK|ABC|ENV|SHP)[-_]\d+\b/i
    const ENVIO_SIGNAL = /\benv[ií]os?\b|\bpaquetes?\b/i
    const QUERY_LOGISTICA = /\b(?:estado|d[oó]nde|cu[aá]ndo|llega|consulta|consultar|dame|mu[eé]strame|muestra|rastrea|rastrear|seguimiento|timeline|en\s+qu[eé]\s+estado|haz\s+seguimiento)\b/i

    // 0j-a. RASTREAR PEDIDO ("rastrea el pedido #ORD-456", "en qué estado
    // está mi pedido #PED-100", "seguimiento del pedido de María García") —
    // antes que los envíos: "pedido" gana sobre "envío" cuando vienen juntos ═══
    if (PEDIDO_SIGNAL.test(message) && QUERY_LOGISTICA.test(message)) {
      const pedidoId = this.extractPedidoRefDe(message)
      if (pedidoId) extracted.pedidoId = pedidoId
      return { intent: 'rastrear_pedido', confidence: 0.85, extractedParams: extracted }
    }

    // 0j-b. TRACKING ENVÍO ("consultar el tracking del paquete", "dónde está
    // mi envío TRK-998") — la palabra "tracking" es la señal más fuerte ═══
    if (TRACKING_WORD.test(message) && QUERY_LOGISTICA.test(message)) {
      const tracking = this.extractTrackingDe(message)
      if (tracking) extracted.tracking = tracking
      return { intent: 'tracking_envio', confidence: 0.85, extractedParams: extracted }
    }

    // 0j-c. ESTADO ENVÍO ("dónde está el envío ABC-987", "cuál es el estado
    // del envío TRK-12345") — envío/paquete o código de tracking sin verbo ═══
    if ((ENVIO_SIGNAL.test(message) || TRACKING_REF.test(message)) && QUERY_LOGISTICA.test(message)) {
      const tracking = this.extractTrackingDe(message)
      if (tracking) extracted.tracking = tracking
      return { intent: 'estado_envio', confidence: 0.85, extractedParams: extracted }
    }

    // 0j-d. FLOTA ("cómo está la flota", "dame la salud de la flota", "qué
    // mantenimientos pendientes hay", "qué vehículos tienen ITV próxima") —
    // "salud/mantenimiento/ITV" → salud_flota; el resto → estado_flota ═══
    const FLOTA_SIGNAL = /\b(?:flota|veh[ií]culos?|cami[oó]nes?|itv|mantenimientos?\s+pendientes?|mantenimiento)\b/i
    if (FLOTA_SIGNAL.test(message)) {
      const vehiculoId = this.extractVehiculoRefDe(message)
      if (vehiculoId) extracted.vehiculoId = vehiculoId
      if (/\b(?:salud|mantenimientos?\s+pendientes?|itv)\b/i.test(message)) {
        return { intent: 'salud_flota', confidence: 0.85, extractedParams: extracted }
      }
      return { intent: 'estado_flota', confidence: 0.85, extractedParams: extracted }
    }

    // 0j-e. OPTIMIZAR RUTA ("optimiza la ruta de reparto para mañana",
    // "sugiere la mejor ruta para los pedidos pendientes") ═══
    const RUTA_SIGNAL = /\b(?:rutas?|reparto|entregas?)\b/i
    const OPTIMIZAR_SIGNAL = /\b(?:optimiza|optimizar|organiza|organizar|sugiere|sugerir|planifica|planificar|mejor\s+ruta)\b/i
    if (RUTA_SIGNAL.test(message) && OPTIMIZAR_SIGNAL.test(message)) {
      const fecha = this.extractFechaDe(message)
      if (fecha) extracted.fecha = fecha
      const vehiculoId = this.extractVehiculoRefDe(message)
      if (vehiculoId) extracted.vehiculoId = vehiculoId
      return { intent: 'optimizar_ruta', confidence: 0.85, extractedParams: extracted }
    }

    // 0j-f. REORGANIZAR ALMACÉN ("sugiere cómo reorganizar el almacén",
    // "cómo puedo optimizar el espacio del almacén") ═══
    const ALMACEN_SIGNAL = /\balmac[eé]n(?:es)?\b/i
    const REORGANIZAR_SIGNAL = /\b(?:reorganiza|reorganizar|reorganizaci[oó]n|optimizar\s+el\s+espacio|mejorar\s+la\s+distribuci[oó]n)\b/i
    if (ALMACEN_SIGNAL.test(message) && REORGANIZAR_SIGNAL.test(message)) {
      const almacenId = this.extractAlmacenRefDe(message)
      if (almacenId) extracted.almacenId = almacenId
      return { intent: 'reorganizar_almacen', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0g. RESUMEN RRHH ("dame el resumen diario de RH", "briefing de
    // recursos humanos", "cómo está el equipo hoy") ═══
    const RH_ENTITY = /\b(?:rrhh|recursos\s+humanos|rh)\b/i
    const BRIEFING_VERB = /\b(?:resumen|briefing|dame\s+el\s+resumen|dame\s+el\s+briefing|estado\s+del\s+equipo|estado\s+de\s+fuerza|c[oó]mo\s+est[aá]\s+(?:el|mi)\s+equipo|c[oó]mo\s+va\s+el\s+equipo)\b/i
    const EQUIPO_SOLO = /\b(?:equipo|colaboradores|plantilla|estado\s+de\s+fuerza)\b/i
    if ((RH_ENTITY.test(message) && BRIEFING_VERB.test(message)) ||
        (BRIEFING_VERB.test(message) && EQUIPO_SOLO.test(message) && /\bhoy|ahora|actual|diario|d[ií]a/i.test(message))) {
      return { intent: 'resumen_rrhh', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0h. APROBAR VACACIONES ("aprueba la solicitud de vacaciones #123",
    // "autoriza vacaciones de María con nota: Disfruta tus días",
    // "confirma la solicitud de vacaciones de Juan Pérez") ═══
    const VACACIONES_ENTITY = /\b(?:vacaciones|asuntos\s+propios|d[ií]as\s+libres|permisos?)\b/i
    const APROBAR_VERB = /\b(?:aprueba|aprobar|aprobaci[oó]n|autoriza|autorizar|confirma|confirmar|acepta|aceptar|valida|validar|da\s+el\s+ok|dale\s+ok)\b/i
    if (VACACIONES_ENTITY.test(message) && APROBAR_VERB.test(message)) {
      const solicitudId = this.extractSolicitudIdDe(message)
      if (solicitudId) extracted.solicitudId = solicitudId
      const msgNombre = this.stripFechaPhrases(message)
      const nombre = this.extractNombreAfter(msgNombre, /\b(?:vacaciones|d[ií]as\s+libres|permisos?)\s+(?:de|del|del empleado)\s+/i)
      if (nombre) extracted.nombre = nombre
      const nota = this.extractNotaDe(message)
      if (nota) extracted.nota = nota
      return { intent: 'aprobar_vacaciones', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0i. RIESGO ROTACIÓN ("analiza el riesgo de rotación del equipo",
    // "quién tiene riesgo de irse", "análisis de retención de talento") ═══
    const ROTACION_ENTITY = /\b(?:rotaci[oó]n|retenci[oó]n|irse|renunciar|abandonar)\b/i
    const RIESGO_SIGNAL = /\b(?:riesgo|an[aá]lisis|analiza|analizar|qu[ié]n\s+tiene|dame\s+el\s+an[aá]lisis|qui[eé]nes\s+est[aá]n)\b/i
    if (ROTACION_ENTITY.test(message) && RIESGO_SIGNAL.test(message)) {
      const msgEmpleado = this.stripFechaPhrases(message)
      // "de María" / "del equipo": el lookahead exige mayúscula inicial para no
      // capturar "riesgo de rotación" como nombre.
      const nombre = this.extractNombreAfter(msgEmpleado, /\b(?:de|del|empleado|colaborador)\s+(?=[A-ZÁÉÍÓÚÑÜ])/)
      // Evitar capturar "el equipo", "el personal" como nombre
      if (nombre && !/\b(?:equipo|personal|talento|la\s+empresa|todos?)\b/i.test(nombre)) {
        extracted.nombre = nombre
      }
      return { intent: 'riesgo_rotacion', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0j. GENERAR COPY ("genera un copy para email sobre nuestro nuevo
    // producto", "crea un post promocionando descuento", "escribe un texto
    // publicitario para WhatsApp") ═══
    const COPY_VERB = /\b(?:genera|generar|crea|crear|escribe|escribir|redacta|redactar|dame\s+un\s+copy|hazme\s+un\s+copy)\b/i
    const COPY_ENTITY = /\b(?:copy|post|publicaci[oó]n|texto\s+publicitario|anuncio|eslogan|slogan|mensaje\s+de\s+marketing)\b/i
    if (COPY_VERB.test(message) && COPY_ENTITY.test(message)) {
      const tema = this.extractTemaDe(message)
      if (tema) extracted.tema = tema
      const formato = this.extractFormatoDe(message)
      if (formato) extracted.formato = formato
      const tono = this.extractTonoDe(message)
      if (tono) extracted.tono = tono
      return { intent: 'generar_copy', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0k. ANALIZAR SENTIMIENTO ("analiza el sentimiento de este feedback:
    // …", "qué opinan los clientes sobre nosotros") ═══
    const SENTIMIENTO_ENTITY = /\b(?:sentimiento|opinan|opini[oó]n|feedback|comentarios?|rese[nñ]as?)\b/i
    const ANALIZAR_VERB = /\b(?:analiza|analizar|qu[eé]\s+opinan|c[oó]mo\s+ven)\b/i
    if (SENTIMIENTO_ENTITY.test(message) && ANALIZAR_VERB.test(message)) {
      const texto = this.extractTextoDe(message)
      if (texto) extracted.texto = texto
      return { intent: 'analizar_sentimiento', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0l. SUGERIR CAMPAÑA ("sugiere mejoras para mi campaña actual",
    // "cómo puedo optimizar mis campañas de marketing") ═══
    const CAMPANIA_ENTITY = /\bcampa[nñ]as?\b/i
    const SUGGEST_VERB = /\b(?:sugiere|sugerir|sugerencias?|mejoras?|optimiza|optimizar|optimizaci[oó]n|recomienda|recomendar|recomendaciones?)\b/i
    if (CAMPANIA_ENTITY.test(message) && SUGGEST_VERB.test(message) && !COPY_ENTITY.test(message)) {
      return { intent: 'sugerir_campania', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0m. GENERAR BLOQUE WEB ("genera un bloque hero para la landing de mi
    // producto", "dame un bloque CTA para promocionar el servicio") ═══
    const BLOQUE_ENTITY = /\b(?:bloque|secci[oó]n|landing)\b/i
    const WEB_VERB = /\b(?:genera|generar|crea|crear|dame\s+un\s+bloque|dame\s+una\s+secci[oó]n)\b/i
    if (BLOQUE_ENTITY.test(message) && WEB_VERB.test(message)) {
      const tipoBloque = this.extractTipoBloqueDe(message)
      if (tipoBloque) extracted.tipoBloque = tipoBloque
      const producto = this.extractProductoWebDe(message)
      if (producto) extracted.producto = producto
      return { intent: 'generar_web_block', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0n. GENERAR SEO ("genera el SEO para la página de servicios",
    // "dame metadatos SEO para mi landing de ventas") ═══
    const SEO_ENTITY = /\b(?:seo|metadatos|keywords?|palabras\s+clave|t[ií]tulo\s+y\s+descripci[oó]n|meta\s+(?:t[ií]tulo|descripci[oó]n))\b/i
    const SEO_VERB = /\b(?:genera|generar|dame|optimiza|crea|crear)\b/i
    if (SEO_ENTITY.test(message) && SEO_VERB.test(message)) {
      const tituloPagina = this.extractTituloPaginaDe(message)
      if (tituloPagina) extracted.tituloPagina = tituloPagina
      return { intent: 'generar_seo', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0o. SUGERIR AUTOMATIZACIÓN ("sugiere reglas de automatización para
    // mi negocio", "cómo puedo automatizar mi marketing") ═══
    const AUTO_ENTITY = /\b(?:automatiza|automatizar|automatizaci[oó]n|reglas?\s+automa[á]?ticas?)\b/i
    if (AUTO_ENTITY.test(message) && /\b(?:sugiere|sugerir|ideas?|qu[eé]|c[oó]mo|dame)\b/i.test(message)) {
      return { intent: 'sugerir_automatizacion', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0p. PROGRAMAR CAMPAÑA ("programa mi campaña de Meta para horario
    // laboral", "pausa mi campaña de Google Ads los fines de semana") ═══
    const CAMPANIA_PROG_VERB = /\b(?:programa|programar|pausa|pausar|activa|activar|desactiva|desactivar)\b/i
    if (CAMPANIA_PROG_VERB.test(message) && CAMPANIA_ENTITY.test(message)) {
      const campania = this.extractCampaniaDe(message)
      if (campania) extracted.campania = campania
      extracted.accion = /\b(?:pausa|pausar|desactiva|desactivar)\b/i.test(message) ? 'PAUSE' : 'ACTIVATE'
      const dias = this.extractDiasSemanaDe(message)
      if (dias) extracted.dias = dias
      const horario = this.extractHorarioDe(message)
      if (horario) {
        extracted.horaInicio = horario.inicio
        extracted.horaFin = horario.fin
      }
      return { intent: 'programar_campania', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0q. LISTAR HORARIOS ("muéstrame las programaciones activas",
    // "lista las programaciones de mis campañas") ═══
    const HORARIO_LIST_ENTITY = /\b(?:programaciones?|horarios?\s+(?:programados?|activos?))\b/i
    const LISTAR_VERB = /\b(?:mu[eé]strame|lista|listar|qu[eé]\s+campa[nñ]as|ver|dame)\b/i
    if (HORARIO_LIST_ENTITY.test(message) && LISTAR_VERB.test(message)) {
      return { intent: 'listar_horarios', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0r. ELIMINAR HORARIO ("elimina la programación de la campaña de
    // verano", "borra el horario de la campaña de Meta") ═══
    const ELIMINAR_PROG_VERB = /\b(?:elimina|eliminar|borra|borrar|cancela|cancelar)\b/i
    if (ELIMINAR_PROG_VERB.test(message) && /\b(?:programaci[oó]n|horario)\b/i.test(message)) {
      const programacion = this.extractProgramacionDe(message)
      if (programacion) extracted.programacion = programacion
      return { intent: 'eliminar_horario', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0s. TESTS A/B (crear / iniciar / evaluar / declarar ganador) ═══
    const TEST_AB_ENTITY = /\btest\s+(?:a\/?b|de\s+la\s+campa[nñ]a|de\s+mi\s+campa[nñ]a)\b/i
    const CREATE_TEST_VERB = /\b(?:crea|crear|configura|configurar|haz|hacer|quiero)\b/i
    if (TEST_AB_ENTITY.test(message) && CREATE_TEST_VERB.test(message)) {
      const campania = this.extractCampaniaDe(message)
      if (campania) {
        extracted.campania = campania
        extracted.nombre = `Test A/B — ${campania}`
      }
      return { intent: 'crear_test_ab', confidence: 0.85, extractedParams: extracted }
    }
    const START_TEST_VERB = /\b(?:inicia|iniciar|activa|activar|pon\s+en\s+marcha|empieza|empiezar)\b/i
    if (TEST_AB_ENTITY.test(message) && START_TEST_VERB.test(message)) {
      const test = this.extractTestAbDe(message)
      if (test) extracted.test = test
      return { intent: 'iniciar_test_ab', confidence: 0.85, extractedParams: extracted }
    }
    const EVAL_TEST_VERB = /\b(?:c[oó]mo\s+va|significancia|va\s+ganando|ganando|evalu[aá]|calcular|dame\s+la\s+significancia)\b/i
    if (TEST_AB_ENTITY.test(message) && EVAL_TEST_VERB.test(message)) {
      const test = this.extractTestAbDe(message)
      if (test) extracted.test = test
      return { intent: 'evaluar_test_ab', confidence: 0.85, extractedParams: extracted }
    }
    if (/\b(?:declara|declarar)\b/i.test(message) && /\bganador|ganadora\b/i.test(message)) {
      const test = this.extractTestAbDe(message)
      if (test) extracted.test = test
      const variante = this.extractVarianteDe(message)
      if (variante) extracted.variante = variante
      return { intent: 'declarar_ganador', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0t. GENERAR DESCRIPCIÓN INMUEBLE ("genera la descripción de la
    // propiedad #PROP-001", "escribe la descripción de la casa en venta") ═══
    const PROP_ENTITY = /\b(?:propiedad|inmueble|casa|departamento|piso|oficina|local|terreno|chalet|villa)\b/i
    const DESCRIPCION_SIGNAL = /\b(?:descripci[oó]n)\b/i
    const GENERAR_VERB = /\b(?:genera|generar|crea|crear|escribe|escribir|redacta|redactar|dame|hazme)\b/i
    if (DESCRIPCION_SIGNAL.test(message) && PROP_ENTITY.test(message) && GENERAR_VERB.test(message)) {
      const propiedad = this.extractPropiedadDe(message)
      if (propiedad) extracted.propiedad = propiedad
      return { intent: 'generar_descripcion_inmueble', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0u. SUGERIR PRECIO ("sugiere un precio para la propiedad #PROP-001",
    // "a qué precio debería vender la casa de la colonia Roma") ═══
    const PRECIO_SIGNAL = /\b(?:precio|a\s+qu[eé]\s+precio|cu[aá]nto\s+vale|cu[aá]nto\s+cuesta|estimaci[oó]n\s+de\s+precio)\b/i
    const PRECIO_VERB = /\b(?:sugiere|sugerir|vender|vende|alquilar|alquila|deber[ií]a|vale|cuesta|cu[aá]nto|dame|estimaci[oó]n)\b/i
    if (PRECIO_SIGNAL.test(message) && PROP_ENTITY.test(message) && PRECIO_VERB.test(message)) {
      const propiedad = this.extractPropiedadDe(message)
      if (propiedad) extracted.propiedad = propiedad
      const tipoOperacion = /\b(?:alquilar|alquiler|rentar|renta)\b/i.test(message)
        ? 'alquiler'
        : (/\b(?:vender|vende|venta|comprar)\b/i.test(message) ? 'venta' : undefined)
      if (tipoOperacion) extracted.tipo_operacion = tipoOperacion
      return { intent: 'sugerir_precio_inmueble', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0v. CALIFICAR INMUEBLE ("califica la propiedad #PROP-001", "qué
    // score de calidad tiene el inmueble del centro") ═══
    const CALIFICAR_SIGNAL = /\b(?:califica|calificar|score\s+de\s+calidad|puntuaci[oó]n|eval[uú]a|evaluar|qu[eé]\s+score)\b/i
    if (CALIFICAR_SIGNAL.test(message) && PROP_ENTITY.test(message)) {
      const propiedad = this.extractPropiedadDe(message)
      if (propiedad) extracted.propiedad = propiedad
      return { intent: 'calificar_inmueble', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0w. BUSCAR INMUEBLES ("busca inmuebles en venta en Madrid",
    // "qué departamentos en alquiler hay en Barcelona") ═══
    const BUSCAR_RE_VERB = /\b(?:busca|buscar|encuentra|encontrar|mu[eé]strame|listame|hay|qu[eé]\s+[a-záéíóúñü]+\s+en)\b/i
    const INMUEBLE_BUSQ = /\b(?:inmuebles?|propiedad(?:es)?|departamentos?|casas?|pisos?|oficinas?|locales?|terrenos?|solares?)\b/i
    if (BUSCAR_RE_VERB.test(message) && INMUEBLE_BUSQ.test(message)) {
      const tipoOperacion = /\b(?:venta|comprar|compr[ée])\b/i.test(message)
        ? 'venta'
        : (/\b(?:alquiler|rentar|arrendar|renta)\b/i.test(message) ? 'alquiler' : undefined)
      if (tipoOperacion) extracted.tipo_operacion = tipoOperacion
      const tipoInmueble = this.extractTipoInmuebleDe(message)
      if (tipoInmueble) extracted.tipo_inmueble = tipoInmueble
      const zona = this.extractZonaDe(message)
      if (zona) extracted.zona = zona
      const habitaciones = this.extractHabitacionesDe(message)
      if (habitaciones) extracted.habitaciones = habitaciones
      return { intent: 'buscar_inmuebles', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0x. RECOMENDAR INMUEBLES ("recomiéndame propiedades para un
    // inversor con presupuesto de 500k") ═══
    const RECOMENDAR_VERB = /\b(?:recomi[eé]ndame|recomendar|sugiere\s+propiedades|sugerir\s+propiedades|dame\s+recomendaciones|qu[eé]\s+inmuebles\s+le\s+puedo)\b/i
    if (RECOMENDAR_VERB.test(message)) {
      const presupuesto = this.extractPresupuestoDe(message)
      if (presupuesto) extracted.presupuesto = presupuesto
      const tipoOperacion = /\b(?:alquilar|alquiler|rentar|renta)\b/i.test(message)
        ? 'alquiler'
        : (/\b(?:comprar|venta|inversor)\b/i.test(message) ? 'venta' : undefined)
      if (tipoOperacion) extracted.tipo_operacion = tipoOperacion
      const zona = this.extractZonaDe(message)
      if (zona) extracted.zona = zona
      return { intent: 'recomendar_inmuebles', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0y. CALCULAR COMISIÓN ("calcula la comisión de la propiedad
    // #PROP-001", "cuánto gana el agente por la venta del inmueble") ═══
    const COMISION_SIGNAL = /\b(?:comisi[oó]n|comisiones|split|cu[aá]nto\s+gana)\b/i
    if (COMISION_SIGNAL.test(message) && (PROP_ENTITY.test(message) || /\b(?:franquicia|agente|agencia)\b/i.test(message))) {
      const propiedad = this.extractPropiedadDe(message)
      if (propiedad) extracted.propiedad = propiedad
      return { intent: 'calcular_comision_franquicia', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 0. CONVERTIR LEAD (antes que crear: "convierte… en contacto" también
    // contiene la palabra "contacto" y no debe clasificarse como creación) ═══
    if (/\b(?:convierte|convertir|pasa|transforma)\b/i.test(message) && /\bcontacto\b/i.test(message)) {
      let nombre = this.extractNombreAfter(message, /\blead\b|\bprospecto\b/i)
      if (!nombre) {
        nombre = this.extractNombreAfter(message, /(?:convierte|pasa|transforma)\s+(?:a\s+|al\s+|el\s+)?/i)
      }
      // Recortar el sufijo "a contacto" / "en contacto" ("convierte lead de
      // María García a contacto" → "María García").
      if (nombre) nombre = nombre.split(/\s+(?:a|en|al)\s+contacto\b/i)[0].trim() || null
      if (nombre) extracted.nombre = nombre
      return { intent: 'convertir_lead', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 1. CREAR LEAD / PROSPECTO ═══
    if (CREATE_VERB.test(message) && /\blead\b|\bprospecto\b/i.test(message)) {
      const nombre = this.extractNombreAfter(message, /\blead\b|\bprospecto\b/i)
      if (nombre) extracted.nombre = nombre
      const empresa = this.extractEmpresaDe(message)
      if (empresa) extracted.empresa = empresa
      return { intent: 'crear_lead', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 2. CREAR EMPRESA (antes que contacto: "crea la empresa X, contacto@…"
    // trae "contacto" dentro del email y no debe clasificarse como contacto) ═══
    if (/(?:crea|agrega|registra|nueva|nuevo|añade)\s+(?:una\s+|la\s+|nueva\s+)?empresa\b/i.test(message)) {
      const nombre = this.extractNombreAfter(message, /\bempresa\b/i)
      if (nombre) extracted.nombre = nombre
      return { intent: 'crear_empresa', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 3. CREAR CONTACTO ═══
    if (CREATE_VERB.test(message) && /\bcontacto\b/i.test(message)) {
      const nombre = this.extractNombreAfter(message, /\bcontacto\b/i)
      if (nombre) extracted.nombre = nombre
      const empresa = this.extractEmpresaDe(message)
      if (empresa) extracted.empresa = empresa
      return { intent: 'crear_contacto', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 4. BUSCAR LEAD (individual, por email o nombre) ═══
    const leadMention = /\blead\b|\bprospecto\b/i.test(message)
    const nameTarget = /(?:busca|encuentra|consulta|localiza)\s+(?:a\s+|al\s+)?[A-ZÁÉÍÓÚÑÜ]/.test(message)
    const dameDatos = /\bdame\s+los\s+datos\s+de\b/i.test(message)
    // "busca Cafeteras Pro" / "busca Propiedades en Madrid" son búsquedas de
    // catálogo, no de leads (una entidad de catálogo desactiva esta rama).
    const CATALOGO_ENTITY_EARLY = /\b(?:productos?|servicios?|cat[aá]logo|art[ií]culos?|inmuebles?|propiedades?|precios?)\b/i
    if (((BUSCAR_VERB.test(message) && (leadMention || nameTarget)) || dameDatos) && !CATALOGO_ENTITY_EARLY.test(message)) {
      const nombre =
        this.extractNombreAfter(message, /\blead\b|\bprospecto\b/i) ||
        this.extractNombreAfter(message, /(?:busca|encuentra|consulta|localiza)\s+(?:a\s+|al\s+)?/i) ||
        this.extractNombreAfter(message, /\bdame\s+los\s+datos\s+de\b/i)
      if (nombre) extracted.nombre = nombre
      return { intent: 'buscar_lead', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 5. LISTAR LEADS / CONTACTOS ═══
    const hasContacts = /\bcontactos?\b/i.test(message)
    const hasLeads = /\bleads?\b/i.test(message)
    const LIST_VERB = /\b(?:lista|listame|mu[eé]strame|muestra|ver|ens[eé][ñn]ame|dame\s+(?:una|la)\s+lista)\b/i
    const FILTER_SIGNAL = /\b(?:que\s+contengan?|en\s+estado|por\s+estado|en\s+etapa|por\s+etapa|tipo|con\s+tags?)\b/i
    // "busca/consulta contactos" (plural, sin nombre propio) también es un
    // listado — los casos individuales ya los capturó la rama 4.
    const listSignal = LIST_VERB.test(message) || FILTER_SIGNAL.test(message) || BUSCAR_VERB.test(message)

    if (hasLeads && listSignal) {
      const estado = this.extractEstadoDe(message)
      if (estado) extracted.estado = estado
      const search = this.extractSearchDe(message, /\bleads?\b/i)
      if (search) extracted.search = search
      return { intent: 'listar_leads', confidence: 0.85, extractedParams: extracted }
    }

    if (hasContacts && listSignal) {
      const tipo = this.extractTipoDe(message)
      if (tipo) extracted.tipo = tipo
      const search = this.extractSearchDe(message, /\bcontactos?\b/i)
      if (search) extracted.search = search
      // Los tags ya se capturaron globalmente (extractTagsDe) si venían como
      // "con tags vip" — el skill list_contacts los usa como filtro.
      return { intent: 'listar_contactos', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 6. DEALS / PIPELINE DE VENTAS ═══
    const DEAL_ENTITY = /\b(?:deal|deals|negocio|negocios|oportunidad|pipeline)\b/i

    // 6a. CREAR NEGOCIO ("crea un deal con juan@x.com por 5000€ por el paquete")
    // NOTA: verbo propio sin "alta" — "pon prioridad alta al deal" no debe
    // disparar creación ("alta" solo es crear en "dar de alta").
    if (/\b(?:crea|agrega|registra|nueva|nuevo|abre|añade)\b/i.test(message) && DEAL_ENTITY.test(message)) {
      let nombre = this.extractNombreAfter(message, /\b(?:con|para)\b/i)
      // Recortar el monto: "María García a 3000€" → "María García"
      if (nombre) nombre = nombre.split(/\s+(?:a|al|en)\s+(?:\d|€|etapa|prioridad|alta|media|baja)/i)[0].trim() || null
      if (nombre) extracted.nombre = nombre
      const monto = this.extractMontoDe(message)
      if (monto) extracted.monto = monto
      const titulo = this.extractTituloDe(message)
      // Sintetizar título si no viene explícito ("Negocio - María García") para
      // no bloquear el flujo preguntando un campo que el skill puede inferir.
      extracted.titulo = titulo || `Negocio - ${nombre || extracted.email || 'sin nombre'}`
      const etapa = this.extractEtapaDe(message)
      if (etapa) extracted.etapa = etapa
      const prioridad = this.extractPrioridadDe(message)
      if (prioridad) extracted.prioridad = prioridad
      return { intent: 'crear_negocio', confidence: 0.85, extractedParams: extracted }
    }

    // 6b. ACTUALIZAR NEGOCIO ("mueve el deal de juan@x.com a etapa negociación")
    if (/\b(?:mueve|actualiza|cambia|pon)\b/i.test(message) && DEAL_ENTITY.test(message)) {
      // "con" primero: "actualiza el monto del negocio con María" → María
      // (si usáramos "del" primero capturaría "negocio con María").
      let nombre = this.extractNombreAfter(message, /\bcon\b/i) || this.extractNombreAfter(message, /\b(?:de|del)\b/i)
      // Recortar el destino: "María a 7000€" → "María"
      if (nombre) nombre = nombre.split(/\s+(?:a|al|en)\s+(?:\d|etapa|prioridad|€|alta|media|baja)/i)[0].trim() || null
      if (nombre) extracted.nombre = nombre
      const etapa = this.extractEtapaDe(message)
      if (etapa) extracted.etapa = etapa
      const monto = this.extractMontoDe(message)
      if (monto) extracted.monto = monto
      const prioridad = this.extractPrioridadDe(message)
      if (prioridad) extracted.prioridad = prioridad
      const titulo = this.extractTituloDe(message)
      if (titulo) extracted.titulo = titulo
      return { intent: 'actualizar_negocio', confidence: 0.85, extractedParams: extracted }
    }

    // 6c. MIS NEGOCIOS (listar pipeline con filtro de etapa)
    if (
      DEAL_ENTITY.test(message) &&
      (LIST_VERB.test(message) || FILTER_SIGNAL.test(message) || BUSCAR_VERB.test(message) ||
        // "cómo va mi pipeline" / "deals activos" / "qué deals tengo/hay".
        // "tengo/hay" SOLO en el patrón de consulta (no "tengo una oportunidad…")
        /\bpipeline\b|\bactivos?\b|qu[eé]\s+(?:deals|negocios)\s+(?:tengo|hay)\b/i.test(message))
    ) {
      const etapa = this.extractEtapaDe(message)
      if (etapa) extracted.etapa = etapa
      return { intent: 'mis_negocios', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 7. ACTUALIZAR LEAD / CONTACTO ("actualiza el teléfono de X a 555-1234",
    // "ponle contexto a X: …") — después de los deals para no chocar con
    // "actualiza el monto del negocio…" ═══
    const UPDATE_VERB = /\b(?:actualiza|cambia|modifica|ponle|pon|agrega\s+contexto|agregar\s+contexto|agrega\s+notas|ponle\s+notas|pon\s+contexto|pon\s+notas)\b/i
    const UPDATE_TARGET = /\b(?:lead|contacto|contexto|notas?|tel[eé]fono|cargo|empresa|correo|nombre)\b/i
    if (UPDATE_VERB.test(message) && !DEAL_ENTITY.test(message) && UPDATE_TARGET.test(message)) {
      // Nombre: de la parte anterior a los dos puntos ("ponle contexto a
      // Alejandra: …" → "Alejandra"), para no arrastrar el contenido.
      // Primero el patrón "al contacto X" / "al lead X" (no tiene conector
      // con/de/a suelto antes del nombre), luego el conector genérico.
      const beforeColon = message.split(/\s*:\s*/)[0]
      let nombre = this.extractNombreAfter(beforeColon, /\b(?:contacto|lead|cliente)\b/i) ||
        this.extractNombreAfter(beforeColon, /\b(?:con|de|del|a)\b/i)
      if (nombre) nombre = nombre.split(/\s+(?:a|al)\s+(?:\d|tel|€)/i)[0].trim() || null
      if (nombre) extracted.nombre = nombre

      // Teléfono: primero con keyword, luego "a 555-1234" ("actualiza el teléfono de X a 555")
      const telefono = this.extractTelefonoDe(message) ||
        (message.match(/(?:a|al)\s+(\+?[\d\s()\-.]{6,15})/) || [])[1]
      if (telefono) extracted.telefono = telefono.trim()

      // Contexto/notas: contenido tras los dos puntos ("ponle contexto a X: Interesada…")
      const colonIdx = message.indexOf(':')
      if (colonIdx >= 0 && /\b(?:contexto|notas?)\b/i.test(message)) {
        const ctx = message.slice(colonIdx + 1).trim()
        if (ctx.length >= 2) extracted.contexto = ctx.replace(/["'”]+\s*$/, '').trim()
      }

      return { intent: 'actualizar_lead', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 8. REGISTRAR INTERACCIÓN ("registra una llamada con Juan: …",
    // "anota una reunión con Carlos: …") ═══
    const INTERACTION_VERB = /\b(?:registra|registrar|registro|anota|anotar|tuve)\b|\binteracci[oó]n\b/i
    const INTERACTION_TIPO = /\b(?:llamad[oa]|llam[aá]r|email|correo|whatsapp|reuni[oó]n|visita|mensaje|nota)\b/i
    // "registra un gasto de 50€: ..." NO es una interacción (va a la rama de gastos), PERO
    // "registra una llamada: hablamos de un gasto de 50€" SÍ lo es (tipo explícito).
    const hasGastoWord = /\b(?:gastos?|egresos?|gast[ée])\b/i.test(message)
    // "registra proveedor: X" / "crea proveedor Y" NO son interacciones (van a
    // la rama de proveedores), pero "registra una llamada con el proveedor Juan"
    // SÍ lo es (tipo explícito). Ojo: "email" es un CAMPO del proveedor
    // ("proveedor: X, email y@z.com"), no un tipo de interacción → se excluye
    // del guard para no bloquear la creación.
    const hasProveedorCreate = /\b(?:registra|registrar|nuev[oa]|crea|crear|agrega|agregar|añade)\s+(?:un\s+|el\s+|este\s+|nuev[oa]\s+)?proveedor\b/i.test(message)
    const INTERACTION_TIPO_NO_EMAIL = /\b(?:llamad[oa]|llam[aá]r|whatsapp|reuni[oó]n|visita|mensaje|nota)\b/i
    // "anota en el perfil de X: …" / "anota una nota para X: …" NO son
    // interacciones (van a crear_nota). "anota una reunión con…" sí lo es.
    const notaLibre = /\b(?:en\s+el\s+perfil|una\s+nota|notas?\s+(?:para|a|de))\b/i.test(message)
    if (INTERACTION_VERB.test(message) && (INTERACTION_TIPO.test(message) || message.includes(':')) && !(hasGastoWord && !INTERACTION_TIPO.test(message)) && !(hasProveedorCreate && !INTERACTION_TIPO_NO_EMAIL.test(message)) && !notaLibre) {
      let nombre = this.extractNombreAfter(message, /\b(?:con|de|del|a)\b/i)
      if (nombre) nombre = nombre.split(/\s*:/)[0].trim() || null
      if (nombre) extracted.nombre = nombre
      const tipo = this.extractTipoInteraccionDe(message)
      if (tipo) extracted.tipo = tipo
      const colonIdx = message.indexOf(':')
      if (colonIdx >= 0) {
        const contenido = message.slice(colonIdx + 1).trim()
        if (contenido.length >= 2) extracted.contenido = contenido.replace(/["'”]+\s*$/, '').trim()
      }
      return { intent: 'registrar_interaccion', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 9. CANCELAR CITA ("cancela la cita de Alejandra", "cancela mi reunión
    // de mañana con juan@x.com") — antes que agendar para no chocar con el
    // sustantivo "cita" del guard de agendar ═══
    if (/\b(?:cancela|cancelar|elimina|eliminar|anula|anular)\b/i.test(message) && /\b(?:cita|reuni[oó]n|reuniones|videollamada)\b/i.test(message)) {
      // Quitar frases de fecha para que no se cuelen en el nombre
      // ("reunión de mañana con Juan" → "reunión con Juan").
      const msgForNombre = this.stripFechaPhrases(message)
      const nombre =
        this.extractNombreAfter(msgForNombre, /\bcon\b/i) ||
        this.extractNombreAfter(msgForNombre, /(?:cita|reuni[oó]n)\s+(?:de|del)\s+/i)
      if (nombre) extracted.nombre = nombre
      const fecha = this.extractFechaDe(message)
      if (fecha) extracted.fecha = fecha
      const idx = message.indexOf(':')
      if (idx >= 0) {
        const motivo = message.slice(idx + 1).trim()
        if (motivo.length >= 2) extracted.motivo = motivo.replace(/["'”]+\s*$/, '').trim()
      }
      return { intent: 'cancelar_cita', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 10. MIS CITAS ("qué citas tengo", "muéstrame mis citas",
    // "citas de mañana/esta semana") ═══
    const hasCitas = /\b(?:citas?|reuni[oó]n|reuniones)\b/i.test(message)
    const QUERY_CITAS = /qu[eé]\s+(?:citas?|reuniones?)\s+(?:tengo|hay|tienes|tenemos|tiene)\b/i
    const LIST_CITAS = /\b(?:lista|listame|mu[eé]strame|muestra|ver|ens[eé][ñn]ame|dame)\s+(?:mis\s+|las\s+|tus\s+)?(?:citas?|reuniones?)\b/i
    // "tengo una cita para mañana" es una afirmación, no una consulta de listado.
    // También se excluyen los verbos de agenda: "agenda una cita para mañana"
    // es una petición de crear, no un listado (bug corregido — caía en mis_citas).
    const DATE_CITAS = /^(?!.*\b(?:tengo|tienes|tenemos|tiene|hay|hago|haces|quedo|quedamos|agenda|agendar|programa|programar|reserva|reservar|aparta|apartar|crea|crear|haz|hacer|pon|ponme)\b).*\b(?:citas?|reuniones?)\s+(?:de|para|del)\s+(?:hoy|ma[nñ]ana|esta\s+semana|la\s+semana|el\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo))\b/i
    if (hasCitas && (QUERY_CITAS.test(message) || LIST_CITAS.test(message) || DATE_CITAS.test(message))) {
      // "qué citas tengo mañana" → filtrar por ese día. El wrapper de
      // get_upcoming_bookings espera el parámetro `date` (no `fecha`).
      const fecha = this.extractFechaDe(message)
      if (fecha) extracted.date = fecha
      return { intent: 'mis_citas', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 11. AGENDAR CITA ("agenda una cita con María para mañana a las 10am",
    // "programa reunión con Juan el viernes a las 15:30 por 1 hora") ═══
    // Nota: "cita con/para" sin verbo NO agenda ("tengo una cita para mañana"
    // es una afirmación, no una petición) — se excluyen los verbos de estado.
    // El negative lookahead va anclado a ^ para que barra TODO el mensaje
    // (si no, se evalúa solo en la posición de inicio y "tengo una cita para…"
    // seguía pasando desde la posición siguiente).
    const NO_AGENDAR_STMT = /^(?!.*\b(?:tengo|tienes|tenemos|tiene|hay|hago|haces|quedo|quedamos|dej[oa])\b)/i
    const AGENDAR_VERB = new RegExp(
      NO_AGENDAR_STMT.source + '.*\\b(?:agenda|agendar|programa|programar|reserva|reservar|aparta|apartar)\\b' +
      '|' + NO_AGENDAR_STMT.source + '.*\\b(?:haz|hacer|crea|crear|pon)\\s+(?:me\\s+|una\\s+|la\\s+)?cita\\b' +
      '|' + NO_AGENDAR_STMT.source + '.*\\b(?:cita|reuni[oó]n)\\s+(?:con|para)\\b',
      'i'
    )
    if (AGENDAR_VERB.test(message) && /\b(?:cita|reuni[oó]n|reuniones|videollamada)\b/i.test(message)) {
      const msgForNombre = this.stripFechaPhrases(message)
      // "con" primero ("cita con María"), luego "cita para X".
      const nombre =
        this.extractNombreAfter(msgForNombre, /\bcon\b/i) ||
        this.extractNombreAfter(msgForNombre, /(?:cita|reuni[oó]n)\s+(?:para|de|del)\s+/i)
      if (nombre) extracted.nombre = nombre
      const fecha = this.extractFechaDe(message)
      if (fecha) extracted.fecha = fecha
      const hora = this.extractHoraDe(message)
      if (hora) extracted.hora = hora
      const tipo = this.extractTipoCitaDe(message)
      if (tipo) extracted.tipo = tipo
      const titulo = this.extractTituloDe(message)
      if (titulo) extracted.servicio = titulo
      return { intent: 'agendar_cita', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 11a. WATCHDOG INVENTARIO ("revisa las alertas de inventario", "qué
    // productos necesito reponer", "ejecuta el watchdog", "hay productos por
    // debajo del punto de reorden") ═══
    // Nota: "riesgo de ruptura" y "stock bajo" siguen siendo salud_inventario.
    const WATCHDOG_SIGNAL = /\b(?:watchdog|alertas?\s+de\s+inventario|revisa\s+las\s+alertas|reponer|reabastecer|punto\s+de\s+reorden|debajo\s+(?:del|de\s+su)\s+punto|por\s+debajo\s+del\s+punto|sugiere\s+compras)\b/i
    if (WATCHDOG_SIGNAL.test(message) && /\b(?:inventario|stock|reponer|reorden|watchdog|alertas?)\b/i.test(message)) {
      return { intent: 'watchdog_inventario', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 11b. DETECTAR ANOMALÍAS DE CALIDAD ("detecta anomalías de calidad",
    // "hay problemas de calidad con algún proveedor", "análisis de calidad") ═══
    const ANOMALIAS_CALIDAD = /\b(?:anomal[ií]as?\s+de\s+calidad|problemas?\s+de\s+calidad|an[aá]lisis\s+de\s+calidad|fallos?\s+de\s+calidad|calidad\s+del\s+[úu]ltimo\s+lote)\b/i
    if (ANOMALIAS_CALIDAD.test(message)) {
      return { intent: 'detectar_anomalias_calidad', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 11c. CALCULAR COSTO DE PRODUCCIÓN ("calcula el costo de producción
    // del producto X", "cuánto cuesta fabricar el producto Y", "dame el costo
    // de manufactura del lote Z") ═══
    const COSTO_PRODUCCION = /\b(?:costo|coste)\s+(?:de\s+)?(?:producci[oó]n|manufactura|fabricaci[oó]n|proyectado)\b|\b(?:fabricar|manufactura|producir)\b|costo\s+de\s+fabricaci[oó]n\b/i
    if (COSTO_PRODUCCION.test(message) && !/\b(?:gastos?|egresos?|gast[ée])\b/i.test(message)) {
      const loteMatch = message.match(/\blote\s+([A-Za-z0-9-]{1,20})\b/i)
      const producto = this.extractProductoDe(message) || this.extractProductoIndustrialDe(message) || (loteMatch ? loteMatch[1] : null)
      if (producto) extracted.producto = producto
      const cantidad = this.extractCantidadStockDe(message)
      if (cantidad !== null) extracted.cantidad = cantidad
      return { intent: 'calcular_costo_produccion', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 11d. VERIFICAR MERMAS ("verifica las mermas de la orden de
    // producción #OP-001", "reporta merma de 3 unidades", "audita el
    // desperdicio del producto X") ═══
    const MERMA_SIGNAL = /\b(?:verifica|verificar|audita|auditar|reporta|reportar|registra|registrar)\s+(?:las\s+|la\s+|una\s+|el\s+)?(?:mermas?|desperdicios?|scrap)\b|\b(?:reporta|reportar)\s+merma\b/i
    if (MERMA_SIGNAL.test(message)) {
      const orden = this.extractOrdenProduccionDe(message)
      if (orden) extracted.ordenProduccionId = orden
      const producto = this.extractProductoDe(message) || this.extractProductoIndustrialDe(message)
      if (producto) extracted.producto = producto
      const cantidad = this.extractCantidadStockDe(message)
      if (cantidad !== null) extracted.cantidad = cantidad
      const url = message.match(/https?:\/\/[^\s]+/i)
      if (url) extracted.evidenciaUrl = url[0]
      return { intent: 'verificar_mermas', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 11e. REGISTRAR INSPECCIÓN DE CALIDAD ("registra inspección de
    // calidad del producto X, resultado aprobado", "crea un registro de QC
    // para el lote #L-123, rechazado") ═══
    const INSPECCION_QC = /\b(?:registra|registrar|crea|crear|anota|anotar)\s+(?:una\s+|la\s+|un\s+)?(?:inspecci[oó]n|registro|control)\s+de\s+calidad\b|\b(?:registro|registra)\s+de\s+qc\b/i
    if (INSPECCION_QC.test(message)) {
      const producto = this.extractProductoDe(message) || this.extractProductoIndustrialDe(message)
      if (producto) extracted.producto = producto
      const resultado = this.extractResultadoQcDe(message)
      if (resultado) extracted.resultado = resultado
      const lote = message.match(/\b#?L-?\d{1,6}\b/i)
      if (lote) extracted.lote = lote[0].replace(/^#/, '')
      const inspector = this.extractInspectorDe(message)
      if (inspector) extracted.inspector = inspector
      return { intent: 'registrar_inspeccion_calidad', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 11f. RENTABILIDAD DE PROYECTO ("cuál es la rentabilidad del proyecto
    // Alpha", "dame el profitability del proyecto X", "cómo va el proyecto Y
    // financieramente") ═══
    const PROYECTO_RENTABILIDAD = /\b(?:rentabilidad|profitability)\b.*\bproyecto\b|\bproyecto\b.*\b(?:rentabilidad|profitability|financieramente)\b|c[oó]mo\s+va\s+el\s+proyecto\b/i
    if (PROYECTO_RENTABILIDAD.test(message)) {
      const proyecto = this.extractProyectoDe(message)
      if (proyecto) extracted.proyecto = proyecto
      return { intent: 'rentabilidad_proyecto', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 11g. DESVIACIONES DE PROYECTO ("detecta desviaciones en mis
    // proyectos", "hay proyectos con problemas de presupuesto", "qué proyectos
    // se están desviando del plan") ═══
    const DESVIACIONES = /\b(?:desviaci[oó]n(?:es)?|desviando|fuera\s+del\s+plan|problemas?\s+de\s+presupuesto)\b.*\bproyecto|\bproyecto.*\b(?:desviaci[oó]n|desviando|fuera\s+del\s+plan)\b/i
    if (DESVIACIONES.test(message)) {
      const proyecto = this.extractProyectoDe(message)
      if (proyecto) extracted.proyecto = proyecto
      return { intent: 'desviaciones_proyecto', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 12. REGISTRAR GASTO ("registra gasto de 45.90 en comida",
    // "nuevo gasto: 120€ de electricidad, proveedor Iberdrola",
    // "gasto de 300€ en software, categoría herramientas") ═══
    const GASTO_ENTITY = /\b(?:gastos?|egresos?|gast[ée])\b/i
    const REGISTRO_GASTO_VERB = /\b(?:registra|registrar|registro|nuev[oa]|crea|crear|anota|anotar|agrega|agregar)\b/i
    const MONTO_SIGNAL = /\b(?:de|por|en)\s+\d+(?:[.,]\d{1,2})?\s*(?:€|euros?|eur|pesos|dolares|usd|mxn)?\b|\b\d+(?:[.,]\d{1,2})?\s*(?:€|euros?|eur)\b/i
    if (GASTO_ENTITY.test(message) && (REGISTRO_GASTO_VERB.test(message) || MONTO_SIGNAL.test(message))) {
      // Monto: el que sigue a la keyword de gasto ("gasto de 45.90"), o con divisa
      const gAmount = message.match(/(?:gasto|egreso|pago|compra|gast[éeoó])\s*(?::|de|por|en)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur)?/i)
      const monto = gAmount ? parseFloat(gAmount[1].replace(',', '.')) : this.extractMontoDe(message)
      if (monto !== null && Number.isFinite(monto)) extracted.monto = monto
      const concepto = this.extractConceptoDe(message)
      if (concepto) extracted.concepto = concepto
      const categoria = this.extractCategoriaDe(message)
      if (categoria) extracted.categoria = categoria
      const proveedor = this.extractProveedorDe(message)
      if (proveedor) extracted.proveedor = proveedor
      const fecha = this.extractFechaDe(message)
      if (fecha) extracted.fecha = fecha
      return { intent: 'registrar_gasto', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 12a. PROYECCIÓN DE IMPUESTOS ("calcula la provisión de impuestos
    // para España", "proyección fiscal de México", "cuánto debo pagar de
    // impuestos en USA") ═══
    const PROYECCION_IMPUESTOS = /\b(?:impuestos?|fiscal|provisi[oó]n\s+(?:de\s+)?impuestos?)\b/i
    if (PROYECCION_IMPUESTOS.test(message)) {
      const pais = this.extractPaisDe(message)
      if (pais) extracted.pais = pais
      const months = this.extractMesesDe(message)
      if (months) extracted.months = months
      return { intent: 'proyeccion_impuestos', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 12b. PROYECCIÓN FINANCIERA ("cómo se ve el flujo de caja para el
    // próximo mes", "proyecta el EBITDA del trimestre", "dame un pronóstico
    // financiero") ═══
    const PROYECCION_FIN = /\b(?:proyecci[oó]n|proyecta|proyectar|pron[oó]stic(?:o|a|os)?|forecast|flujo\s+de\s+caja)\b/i
    if (PROYECCION_FIN.test(message)) {
      const months = this.extractMesesDe(message)
      if (months) extracted.months = months
      return { intent: 'proyeccion_financiera', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 12c. RENTABILIDAD GLOBAL ("dame la rentabilidad global del negocio",
    // "analiza el EBITDA del último trimestre", "cómo vamos financieramente en
    // general") ═══
    const RENTABILIDAD_GLOBAL = /\b(?:rentabilidad|ebitda|margen(?:\s+real|\s+bruto|\s+neto)?|c[oó]mo\s+vamos\s+financieramente|salud\s+financiera\s+integral)\b/i
    if (RENTABILIDAD_GLOBAL.test(message)) {
      const months = this.extractMesesDe(message)
      if (months) extracted.months = months
      return { intent: 'analizar_rentabilidad_global', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 13. ANALIZAR GASTOS / SALUD FINANCIERA ("cómo vamos de gastos este
    // mes", "analiza mi burn rate", "dame mi salud financiera") ═══
    // Nota: "flujo de caja" y "rentabilidad" ya fueron reclamados por las
    // ramas 12a/12c (proyecciones) — aquí solo quedan gastos/burn rate/salud.
    const ANALIZAR_GASTOS = /\b(?:analiza|analizar|revisa|revisar|an[aá]lisis|c[oó]mo\s+vamos|c[oó]mo\s+van|c[oó]mo\s+est[aá]\s+(?:el\s+|la\s+|mi\s+)?(?:inventario\s+de\s+)?gastos|salud\s+financiera|burn\s*rate|qu[eé]\s+gastos\s+(?:hemos|hay|tengo|tenemos)|cu[aá]nto\s+hemos\s+gastado|gastos?\s+(?:del\s+)?mes)\b/i
    if (ANALIZAR_GASTOS.test(message) && /\b(?:gastos?|financ|burn|salud\s+financiera|ingresos?|egresos?)\b/i.test(message)) {
      const months = this.extractMesesDe(message)
      if (months) extracted.months = months
      return { intent: 'analizar_gastos', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 14. CREAR PROVEEDOR ("registra proveedor: Suministros SA, email
    // ventas@suministros.com", "nuevo proveedor: Papelería López", "crea
    // proveedor Tecnología Plus SA de CV") ═══
    const PROVEEDOR_ENTITY = /\bproveedor(?:es)?\b/i
    const CREATE_PROVEEDOR_VERB = /\b(?:registra|registrar|nuev[oa]|crea|crear|agrega|agregar|añade|alta|anota|anotar)\b/i
    if (PROVEEDOR_ENTITY.test(message) && CREATE_PROVEEDOR_VERB.test(message)) {
      // Nombre: tras "proveedor" (extractNombreAfter ya corta en coma y en
      // "con email/teléfono"). "registra proveedor: X" → tras quitar los dos
      // puntos queda "X".
      const nombre = this.extractNombreAfter(message, /\bproveedor\b/i)
      if (nombre) extracted.nombre = nombre
      const categoria = this.extractCategoriaDe(message)
      if (categoria) extracted.categoria = categoria
      const direccion = this.extractDireccionDe(message)
      if (direccion) extracted.direccion = direccion
      // email y telefono ya se capturaron globalmente (extractEmailDe en la
      // entrada, extractTelefonoDe arriba).
      return { intent: 'crear_proveedor', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 15. LISTAR PROVEEDORES ("lista los proveedores", "qué proveedores
    // tengo", "muéstrame mis proveedores") ═══
    const LISTAR_PROVEEDORES = /\b(?:lista|listame|mu[eé]strame|muestra|ver|ens[eé][ñn]ame|qu[eé])\s+(?:los\s+|mis\s+|tus\s+|todos\s+los\s+)?proveedor(?:es)?\b|qu[eé]\s+proveedores\s+(?:tengo|hay|tenemos|tienes)\b|proveedor(?:es)?\s+(?:de\s+)?categor[ií]a\b/i
    if (PROVEEDOR_ENTITY.test(message) && LISTAR_PROVEEDORES.test(message)) {
      const categoria = this.extractCategoriaDe(message)
      if (categoria) extracted.categoria = categoria
      return { intent: 'listar_proveedores', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 16. COMPLETAR TAREA ("marca como completada la tarea de llamar a
    // Juan", "completa el pendiente de enviar documento") ═══
    const TAREA_ENTITY = /\b(?:tareas?|pendientes?)\b/i
    const COMPLETAR_TAREA = /\b(?:completa|completar|termina|terminar|finaliza|finalizar|cierra|cerrar|marca\s+como\s+completada|marcar\s+como\s+completada|d[ae]\s+por\s+completada)\b/i
    // "la tarea ya está completa" es una afirmación, no una petición de completar
    if (COMPLETAR_TAREA.test(message) && TAREA_ENTITY.test(msgNoEmails) && !/\b(?:est[aá]|ya|qued[oó])\s+(?:completa|completada|terminada)\b/i.test(message)) {
      const titulo = this.extractTituloTareaDe(message) ||
        this.extractNombreAfter(message, /(?:tarea|pendiente)\s+(?:de|del)\s+/i)
      if (titulo) extracted.titulo = titulo
      return { intent: 'completar_tarea', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 17. CREAR TAREA ("crea tarea: llamar a Juan Pérez", "nueva tarea
    // para María: revisar cotización", "agrega pendiente: enviar documento,
    // vence el viernes") ═══
    const CREATE_TASK_VERB = /\b(?:crea|crear|agrega|agregar|registra|registrar|nuev[oa]|nueva|nuevo|añade|anota|anotar|pon|poner)\b/i
    if (CREATE_TASK_VERB.test(message) && TAREA_ENTITY.test(msgNoEmails)) {
      const titulo = this.extractTituloTareaDe(message)
      if (titulo) extracted.titulo = titulo
      // Nombre cortado en los dos puntos ("para María: revisar…" → "María")
      let nombre = this.extractNombreAfter(message, /\b(?:con|para)\b/i)
      if (nombre) nombre = nombre.split(':')[0].trim() || null
      if (nombre) extracted.nombre = nombre
      const fechaVencimiento = this.extractFechaDe(message)
      if (fechaVencimiento) extracted.fechaVencimiento = fechaVencimiento
      const prioridad = this.extractPrioridadDe(message)
      if (prioridad) extracted.prioridad = prioridad
      // "crea tarea para mañana: …" → "mañana" es fecha, no persona
      if (nombre && /^(?:hoy|ma[nñ]ana|ayer|pasado\s+ma[nñ]ana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|esta\s+semana)$/i.test(nombre.trim())) nombre = null
      // Título sintetizado si no vino ("tarea con Alejandra" → seguimiento)
      if (!titulo) extracted.titulo = `Seguimiento ${nombre || extracted.email || 'sin nombre'}`
      return { intent: 'crear_tarea', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 18. MIS TAREAS ("qué tareas tengo pendientes", "muéstrame mis
    // tareas", "tareas pendientes de juan@email.com") ═══
    const MIS_TAREAS = /\b(?:qu[eé]\s+(?:tareas|pendientes)\s+(?:tengo|hay|tienes|tenemos)|(?:mis|las|tus)\s+tareas|tareas\s+pendientes|lista\s+de\s+tareas)\b/i
    if (TAREA_ENTITY.test(msgNoEmails) && MIS_TAREAS.test(message)) {
      return { intent: 'mis_tareas', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 19. CREAR NOTA ("agrega nota a juan@x.com: Cliente interesado…",
    // "nota para María García: Prefiere WhatsApp") — después de interacción
    // ("anota en el perfil de X: …") y actualizar_lead ("ponle notas"). ═══
    const CREATE_NOTA_VERB = /\b(?:agrega|agregar|crea|crear|registra|registrar|deja|dejar|anota|anotar|nueva|nuevo)\b|^\s*nota\b|\bnota\s+(?:para|de|a)\b/i
    if (/\bnotas?\b|\bperfil\b/i.test(message) && CREATE_NOTA_VERB.test(message)) {
      const idx = message.indexOf(':')
      if (idx >= 0) {
        const contenido = message.slice(idx + 1).trim()
        if (contenido.length >= 2) extracted.contenido = contenido.replace(/["'”]+\s*$/, '').trim()
      }
      // "nota para María García: …" / "anota en el perfil de Carlos: …"
      let nombre = this.extractNombreAfter(message, /\b(?:para|de|a|en\s+el\s+perfil\s+de)\b/i)
      if (nombre) nombre = nombre.split(':')[0].trim() || null
      if (nombre) extracted.nombre = nombre
      return { intent: 'crear_nota', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 20. VER NOTAS ("muéstrame las notas de juan@x.com", "qué notas
    // tiene María García") ═══
    const VER_NOTAS = /\b(?:ver|mu[eé]strame|muestra|listame|lista|qu[eé])\s+(?:las\s+|sus\s+|tus\s+|mis\s+)?notas?\b|\bqu[eé]\s+notas\s+(?:tiene|tenga|tienen)\b/i
    if (/\bnotas?\b/i.test(message) && VER_NOTAS.test(message)) {
      const nombre = this.extractNombreAfter(message, /\bqu[eé]\s+notas\s+(?:tiene|tenga|tienen)\s+/i) ||
        this.extractNombreAfter(message, /\b(?:de|del|de\s+la)\b/i)
      if (nombre) extracted.nombre = nombre
      return { intent: 'ver_notas', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 21. SALUD DE INVENTARIO / STOCK BAJO ("cómo está el inventario",
    // "qué productos tienen stock bajo", "hay riesgo de ruptura",
    // "productos por debajo del punto de reorden") ═══
    // "inventario de gastos" / "inventario de egresos" son gastos, no stock
    const INVENTARIO_ENTITY = /\b(?:inventario|stock|existencias|unidades)\b/i
    const SALUD_INVENTARIO = /\b(?:c[oó]mo\s+est[aá]\s+(?:el\s+|mi\s+)?inventario|salud\s+del\s+inventario|stock\s+baj[oa]|baj[oa]\s+stock|riesgo\s+de\s+ruptura|ruptura\s+de\s+stock|punto\s+de\s+reorden|debajo\s+del\s+punto\s+de\s+reorden|necesito\s+reponer|qu[eé]\s+(?:productos|art[ií]culos)\s+tienen\s+stock\s+baj[oa]|qu[eé]\s+productos\s+(?:tengo|hay|tenemos)\s+con\s+stock|alertas?\s+de\s+inventario|revisa\s+las\s+alertas|qu[eé]\s+productos\s+necesito\s+reponer)\b/i
    if (INVENTARIO_ENTITY.test(message) && (SALUD_INVENTARIO.test(message) || /\b(?:c[oó]mo\s+vamos?|c[oó]mo\s+est[aá]|salud|an[aá]lisis)\b/i.test(message)) && !/\b(?:gastos?|egresos?)\b/i.test(message)) {
      const producto = this.extractProductoDe(message)
      if (producto) extracted.producto = producto
      return { intent: 'salud_inventario', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 22. AJUSTAR STOCK ("entrada de 50 unidades del producto X",
    // "ajusta el stock del producto Y, salida de 10", "transfiere 20
    // unidades del producto Z al almacén 2") ═══
    const AJUSTAR_STOCK_VERB = /\b(?:ajusta|ajustar|entrada|ingreso|salida|egreso|transfiere|transferir|mueve|mover|agrega\s+stock|quita\s+stock|dar\s+de\s+alta|dar\s+de\s+baja)\b/i
    const UNIDADES_SIGNAL = /\b(?:unidades?|uds?|piezas?|pzs?|kg|lt|litros?)\b/i
    if (INVENTARIO_ENTITY.test(message) && AJUSTAR_STOCK_VERB.test(message) && (UNIDADES_SIGNAL.test(message) || /\b\d+\b/.test(message))) {
      const producto = this.extractProductoDe(message)
      if (producto) extracted.producto = producto
      const cantidad = this.extractCantidadStockDe(message)
      if (cantidad !== null) extracted.cantidad = cantidad
      const tipo = this.extractTipoStockDe(message)
      if (tipo) extracted.tipo = tipo
      // Sin producto → pedirlo (el skill necesita saber a qué ítem ajustar)
      return { intent: 'ajustar_stock', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 23. CONSUMIR INVENTARIO ("consume 5 unidades del producto X",
    // "descarga 10 del material Z", "registra consumo de 3 unidades") ═══
    const CONSUMIR_VERB = /\b(?:consum(?:e|o|ir)|descarga|descargar|descuenta|descontar|us[aeo]\s+\d+|registra\s+consumo|procesa\s+la\s+salida)\b/i
    if ((INVENTARIO_ENTITY.test(message) || /\b(?:material|materia\s+prima)\b/i.test(message)) && CONSUMIR_VERB.test(message) && UNIDADES_SIGNAL.test(message)) {
      const producto = this.extractProductoDe(message)
      if (producto) extracted.producto = producto
      const cantidad = this.extractCantidadStockDe(message)
      if (cantidad !== null) extracted.cantidad = cantidad
      return { intent: 'consumir_inventario', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 24. BUSCAR EN CATÁLOGO / CONSULTAR PRECIO ("busca cafeteras en el
    // catálogo", "qué precio tiene X", "cuánto cuesta el paquete premium",
    // "busca propiedades en Madrid por menos de 300000") ═══
    const CATALOGO_ENTITY = /\b(?:cat[aá]logo|productos?|servicios?|art[ií]culos?|inmuebles?|propiedades?|apartamentos?|casas?|precios?)\b/i
    const PRECIO_QUERY = /\b(?:qu[eé]\s+precio|cu[aá]nto\s+cuesta|cuestan|vale|valen|precio\s+de|precios\s+de)\b/i
    const BUSCAR_CATALOGO_VERB = /\b(?:busca|buscar|encuentra|encontrar|consulta|consultar|qu[eé]\s+(?:productos|servicios|art[ií]culos)\b|qu[eé]\s+precio|cu[aá]nto\s+cuesta|cu[aá]nto\s+cuestan|cu[aá]nto\s+vale|cu[aá]nto\s+valen|precio\s+de|precios\s+de)\b/i
    // "cuánto cuesta fabricar el producto Y" es producción (calcular_costo), no catálogo
    const NO_PRODUCCION = /\b(?:fabricar|manufactura|producir|producci[oó]n|fabricaci[oó]n)\b/i
    // "cuánto cuesta la cita de un abogado" no es catálogo (entidad de cita)
    const NO_CITA = /\b(?:citas?|reuni[oó]n|videollamada)\b/i
    // Patrón de listado ("qué productos hay", "lista el catálogo") — se
    // declara aquí (rama 22) para poder excluirlo de la rama 21 de búsqueda.
    const LISTAR_CATALOGO = /\b(?:lista|listame|mu[eé]strame|muestra|ver|ens[eé][ñn]ame)\s+(?:el\s+|los\s+|las\s+|todos\s+los\s+)?(?:cat[aá]logo|productos?|servicios?|art[ií]culos?|[íi]tems?)\b|qu[eé]\s+(?:productos|servicios|art[ií]culos)\s+(?:hay|tienes|tenemos|tiene|existen)\b/i
    // "qué productos hay" / "lista el catálogo" son listados (rama 22), no
    // búsquedas con query — aquí solo búsqueda/con precio explícito.
    if ((CATALOGO_ENTITY.test(message) || PRECIO_QUERY.test(message)) && BUSCAR_CATALOGO_VERB.test(message) && !LISTAR_CATALOGO.test(message) && !NO_PRODUCCION.test(message) && !NO_CITA.test(message)) {
      const query = this.extractCatalogoQueryDe(message)
      if (query) extracted.query = query
      const tipo = this.extractTipoCatalogoDe(message)
      if (tipo) extracted.tipo = tipo
      const categoria = this.extractCategoriaDe(message)
      if (categoria) extracted.categoria = categoria
      const rango = this.extractPrecioRangoDe(message)
      if (rango.precioMin !== null) extracted.precioMin = rango.precioMin
      if (rango.precioMax !== null) extracted.precioMax = rango.precioMax
      return { intent: 'buscar_catalogo', confidence: 0.85, extractedParams: extracted }
    }

    // ═══ 25. LISTAR CATÁLOGO ("lista el catálogo", "qué productos hay",
    // "muéstrame los servicios disponibles") → buscar_catalogo sin query (el
    // skill lista el catálogo visible en el chatbot) ═══
    if (CATALOGO_ENTITY.test(message) && LISTAR_CATALOGO.test(message)) {
      const tipo = this.extractTipoCatalogoDe(message)
      if (tipo) extracted.tipo = tipo
      const categoria = this.extractCategoriaDe(message)
      if (categoria) extracted.categoria = categoria
      return { intent: 'buscar_catalogo', confidence: 0.85, extractedParams: extracted }
    }

    return null
  }

  /**
   * Quita frases de fecha ("mañana", "el viernes", "15 de mayo", "15/05/2026")
   * del mensaje para que no se cuelen en la extracción del nombre.
   */
  private stripFechaPhrases(message: string): string {
    return message
      .replace(/\bpasado\s+ma[nñ]ana\b/gi, ' ')
      .replace(/\bma[nñ]ana\b|\bhoy\b/gi, ' ')
      .replace(/\b(?:el|este)\s+(?:pr[oó]xim[oa]\s+)?(?:domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\b/gi, ' ')
      .replace(/\b\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+\b/gi, ' ')
      .replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/gi, ' ')
      .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/gi, ' ')
      // Horas: "a las 10am", "a las 15:30", "las 2pm" (no se cuelan en el nombre)
      .replace(/\b(?:a\s+las|a\s+la|las)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi, ' ')
      .replace(/\s{2,}/g, ' ')
  }

  /**
   * Extrae la fecha de "mañana", "pasado mañana", "el viernes", "15/05/2026",
   * "15 de mayo". Normaliza SIEMPRE a YYYY-MM-DD (createBookingWrapper solo
   * entiende ese formato; DD/MM/YYYY caía al default de mañana 10am).
   */
  private extractFechaDe(message: string): string | null {
    const months: Record<string, number> = {
      enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
      julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    }
    const days: Record<string, number> = {
      domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
    }
    const today = new Date()
    const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const addDays = (d: Date, n: number) => { const t = new Date(d); t.setDate(t.getDate() + n); return t }

    // 1. Fecha explícita YYYY-MM-DD / YYYY/MM/DD
    const iso = message.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/)
    if (iso) {
      const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }

    // 2. Fecha DD/MM/YYYY o DD/MM → normalizar a YYYY-MM-DD
    const dmy = message.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/)
    if (dmy && Number(dmy[1]) <= 31 && Number(dmy[2]) >= 1 && Number(dmy[2]) <= 12) {
      const d = Number(dmy[1]); const m = Number(dmy[2])
      let y = dmy[3] ? Number(dmy[3]) : today.getFullYear()
      if (dmy[3] && y < 100) y += 2000
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }

    // 3. Relativos ("pasado mañana" antes que "mañana")
    if (/\bpasado\s+ma[nñ]ana\b|\bma[nñ]ana\s+despu[eé]s\b/i.test(message)) return isoDate(addDays(today, 2))
    if (/\bma[nñ]ana\b/i.test(message) && !/(?:por|en|de)\s+la\s+ma[nñ]ana\b/i.test(message)) return isoDate(addDays(today, 1))
    if (/\bhoy\b/i.test(message)) return isoDate(today)
    if (/\bayer\b/i.test(message)) return isoDate(addDays(today, -1))

    // 4. Día de la semana: "el viernes", "el lunes que viene". Un día de la
    // semana desnudo SIEMPRE es la próxima ocurrencia ("el viernes" dicho un
    // viernes = el próximo viernes, semántica de agendamiento).
    for (const [name, dow] of Object.entries(days)) {
      const re = new RegExp(`\\b${name}\\b`, 'i')
      if (re.test(message)) {
        let daysAhead = (dow - today.getDay() + 7) % 7
        if (daysAhead === 0) daysAhead = 7
        return isoDate(addDays(today, daysAhead))
      }
    }

    // 5. Textual: "15 de mayo", "15 de mayo de 2026"
    const dmyTxt = message.match(/\b(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü]+)(?:\s+de\s+(\d{2,4}))?\b/i)
    if (dmyTxt) {
      const monthKey = dmyTxt[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const month = months[monthKey]
      if (month !== undefined && Number(dmyTxt[1]) >= 1 && Number(dmyTxt[1]) <= 31) {
        const d = Number(dmyTxt[1])
        let y = dmyTxt[3] ? Number(dmyTxt[3]) : today.getFullYear()
        if (dmyTxt[3] && y < 100) y += 2000
        const candidate = new Date(y, month, d)
        if (!dmyTxt[3] && candidate.getTime() < today.getTime()) candidate.setFullYear(y + 1)
        return isoDate(candidate)
      }
    }

    return null
  }

  // ═══ Helpers del Noveno entrenamiento (módulo Seguros) ═══════════════════

  /**
   * Nombres de aseguradoras conocidas (para capturar "pólizas de AXA" sin
   * keyword). Compartidos por aseguradora y cliente (un nombre de aseguradora
   * nunca es un cliente).
   */
  private readonly ASEGURADORAS_CONOCIDAS = /\b(?:AXA|MAPFRE|Ma?pfre|Qu[aá]litas|GNP|Seguros\s+Monterrey|Monterrey|TIREA|FIVA|EIAC|Zurich|Allianz|HDI|Banorte|HSBC|BBVA|F[ée]nix|Atlas|Chubb|Generali|Inbursa|Hidalgo|San\s+Rafael|La\s+Latinoamericana)\b/i

  /**
   * Número de póliza: el token tras la keyword "póliza" ("póliza AXA-1234" →
   * "AXA-1234", "póliza: número P-001" → "P-001", "la póliza 8888" → "8888").
   */
  private extractNumeroPolizaDe(message: string): string | null {
    // "la póliza es AXA-1234" (multi-turno) y "la póliza AXA-1234" (1 turno)
    const m = message.match(/(?:p[oó]liza)\s*:?\s*(?:n[úu]mero\s+|nº\s*|#\s*|es\s+(?:el\s+|la\s+|n[úu]mero\s+)?)?((?:[A-Za-z]{1,4}[-_][A-Za-z0-9]{2,}[A-Za-z0-9-]*|\d{3,}))/i)
    if (!m) return null
    let n = m[1].trim()
    n = n.split(/\s+(?:vence|venc|para|con|de|del|el|la|por|inicia|,|;)/i)[0].trim()
    return n.length >= 3 ? n : null
  }

  /**
   * Referencia a póliza para siniestros: token tras "póliza", "contra",
   * "de la póliza" ("siniestro contra POL-001" → "POL-001", "siniestro de la
   * póliza 8888" → "8888").
   */
  private extractPolizaRefDe(message: string): string | null {
    const m = message.match(/(?:p[oó]liza|contra|para\s+la\s+p[oó]liza|de\s+la\s+p[oó]liza)\s*(?::|n[úu]mero\s+|nº\s*|#\s*)?((?:[A-Za-z]{1,4}[-_][A-Za-z0-9]{2,}[A-Za-z0-9-]*|\d{3,}))/i)
    if (!m) return null
    let n = m[1].trim()
    n = n.split(/\s+(?:vence|venc|para|con|de|del|el|la|por|,|;)/i)[0].trim()
    return n.length >= 3 ? n : null
  }

  /**
   * Aseguradora: tras la keyword "aseguradora" o por nombre conocido suelto
   * ("pólizas de AXA", "hogar MAPFRE"). NO usa "con" como ancla ("con
   * vencimiento el 2026-12-31" capturaría la fecha como aseguradora).
   */
  private extractAseguradoraDe(message: string): string | null {
    const kw = message.match(/\baseguradora\s*(?::|de|con)?\s*([A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜ0-9 .'\-]{1,30})/i)
    let a: string | null = kw ? kw[1] : null
    if (!a) {
      const known = message.match(this.ASEGURADORAS_CONOCIDAS)
      if (known) a = known[0]
    }
    if (!a) return null
    let cleaned = a.trim()
    cleaned = cleaned.split(/\s+(?:vence|venc|prima|inicia|con\s+venc|para|el|la|del|por|,|;)/i)[0].trim()
    return cleaned.length >= 2 ? cleaned : null
  }

  /**
   * Rama del seguro: tras "ramo", "del ramo", "de ramo" o "póliza de auto".
   */
  private extractRamoSeguroDe(message: string): string | null {
    const RAMOS = '(?:auto|autos|vida|hogar|salud|gastos?\\s+m[eé]dicos?|m[eé]dicos?|empresarial|transporte|responsabilidad\\s+civil|rc|incendio|ahorro|jubilaci[oó]n)'
    const kw = message.match(new RegExp(`\\b(?:ramo|de\\s+ramo)\\s*(?::|de)?\\s*(${RAMOS})\\b`, 'i'))
    if (kw) return kw[1].toLowerCase()
    const dePoliza = message.match(new RegExp(`\\b(?:p[oó]lizas?|seguros?)\\s+(?:de|del|de\\s+ramo)\\s+(${RAMOS})\\b`, 'i'))
    if (dePoliza) return dePoliza[1].toLowerCase()
    const suelto = message.match(new RegExp(`\\b(${RAMOS})\\b`, 'i'))
    return suelto ? suelto[1].toLowerCase() : null
  }

  /**
   * Estado de póliza: "activas" → ACTIVA, "próximas a vencer" →
   * PROXIMA_A_VENCER, "vencidas" → VENCIDA, "canceladas" → CANCELADA.
   */
  private extractEstadoPolizaDe(message: string): string | null {
    if (/\b(?:pr[oó]ximas?\s+a\s+vencer|por\s+vencer)\b/i.test(message)) return 'PROXIMA_A_VENCER'
    if (/\bactivas?\b/i.test(message)) return 'ACTIVA'
    if (/\bvencid[oa]s?\b/i.test(message)) return 'VENCIDA'
    if (/\bcanceladas?\b/i.test(message)) return 'CANCELADA'
    if (/\bpendientes?\b/i.test(message)) return 'PENDIENTE'
    const m = message.match(/(?:en|por)\s+estado\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü]{2,20})/i)
    if (m) {
      const e = m[1].toLowerCase()
      if (e.includes('vencer')) return 'PROXIMA_A_VENCER'
      if (e.startsWith('activ')) return 'ACTIVA'
      if (e.startsWith('vencid')) return 'VENCIDA'
      if (e.startsWith('cancel')) return 'CANCELADA'
      if (e.startsWith('pend')) return 'PENDIENTE'
    }
    return null
  }

  /**
   * Estado de siniestro normalizado al enum (REPORTADO / EN_TRAMITE / ABIERTO /
   * PAGADO / RECHAZADO / CERRADO): "a en trámite" → EN_TRAMITE, "abiertos" →
   * ABIERTO, "pagado" → PAGADO, "rechazado" → RECHAZADO, "cerrado" → CERRADO.
   */
  private extractEstadoSiniestroDe(message: string): string | null {
    const ALIASES: Record<string, string> = {
      'reportado': 'REPORTADO', 'reportados': 'REPORTADO',
      'en tramite': 'EN_TRAMITE', 'en trámite': 'EN_TRAMITE', 'tramite': 'EN_TRAMITE',
      'trámite': 'EN_TRAMITE', 'en proceso': 'EN_TRAMITE', 'proceso': 'EN_TRAMITE',
      'abierto': 'ABIERTO', 'abiertos': 'ABIERTO',
      'pagado': 'PAGADO', 'pagados': 'PAGADO', 'aprobado': 'PAGADO',
      'rechazado': 'RECHAZADO', 'rechazados': 'RECHAZADO',
      'cerrado': 'CERRADO', 'cerrados': 'CERRADO',
    }
    // "a en trámite" / "a abierto" / "en estado pagado"
    const m = message.match(/(?:a\s+en|a\s+|en\s+estado|a\s+estado|estado)\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü]{2,20})/i)
    if (m) {
      const key = m[1].trim().toLowerCase().replace(/\s+/g, ' ')
      if (ALIASES[key]) return ALIASES[key]
    }
    // Palabra suelta: "siniestros abiertos", "los rechazados", "marca pagado"
    for (const [phrase, val] of Object.entries(ALIASES)) {
      if (new RegExp(`\\b${phrase.replace(/ /g, '\\s+')}\\b`, 'i').test(message)) return val
    }
    return null
  }

  /**
   * Estado de renovación: "pendientes" → PENDIENTE, "contacto inicial" →
   * CONTACTO_INICIAL, "revisión" → REVISION, "oferta enviada" → OFERTA_ENVIADA.
   */
  private extractEstadoRenovacionDe(message: string): string | null {
    if (/\bpendientes?\b/i.test(message)) return 'PENDIENTE'
    if (/\bcontacto\s+inicial\b/i.test(message)) return 'CONTACTO_INICIAL'
    if (/\brevisi[oó]n\b/i.test(message)) return 'REVISION'
    if (/\boferta\s+enviada\b/i.test(message)) return 'OFERTA_ENVIADA'
    return null
  }

  /**
   * Prima anual: número tras "prima"/"prima anual"/"primaAnual".
   */
  private extractPrimaDe(message: string): number | null {
    const m = message.match(/(?:prima\s+anual|primaAnual|prima)\s*(?::|de|por)?\s*(\d+(?:[.,]\d{1,2})?)/i)
    if (!m) return null
    const v = parseFloat(m[1].replace(',', '.'))
    return Number.isFinite(v) ? v : null
  }

  /**
   * Suma asegurada: número tras "suma asegurada"/"sumaAsegurada"/"cobertura".
   */
  private extractSumaAseguradaDe(message: string): number | null {
    const m = message.match(/(?:suma\s+asegurada|sumaAsegurada|cobertura)\s*(?::|de|por)?\s*(\d+(?:[.,]\d{1,2})?)/i)
    if (!m) return null
    const v = parseFloat(m[1].replace(',', '.'))
    return Number.isFinite(v) ? v : null
  }

  /**
   * Cliente asegurado: tras "cliente/asegurado/para/de/tiene/tienen". Rechaza
   * nombres de aseguradoras conocidas ("pólizas de AXA" → cliente null, no
   * "AXA") y palabras en minúscula ("de la", "de los"…).
   */
  private extractClienteSeguroDe(message: string): string | null {
    const m = message.match(/\b(?:cliente|asegurado|para|de|tiene|tienen)\s+([A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜ0-9 ]{2,30})/i)
    if (!m) return null
    let c = m[1].trim()
    c = c.split(/\s+(?:con|de|del|la|el|por|y|,|;|vence|venc)/i)[0].trim()
    if (c.length < 2 || /^(?:la|el|los|las|una|un|es|son|y|o|con|de|del)$/i.test(c)) return null
    if (this.ASEGURADORAS_CONOCIDAS.test(c)) return null
    return c
  }

  /**
   * Número de días: "en 60 días" → 60 (para pólizas por vencer y clientes sin
   * contacto).
   */
  private extractDiasDe(message: string): number | null {
    const m = message.match(/\b(\d{1,3})\s*(?:d[ií]as?)\b/i)
    if (!m) return null
    const v = Number(m[1])
    return v >= 1 && v <= 365 ? v : null
  }

  /**
   * Número de siniestro: "SIN-001" / "SIN_001" / "S-12345" / "nº X" tras
   * "siniestro".
   */
  private extractNumeroSiniestroDe(message: string): string | null {
    const m = message.match(/\b(?:SIN[-_]\d+|S[-_]?\d{3,})\b/i)
    if (m) return m[0]
    const kw = message.match(/\bsiniestro\s*(?:n[úu]mero\s*|nº\s*|#\s*)?([A-Za-z0-9][A-Za-z0-9-]{2,})/i)
    if (kw) {
      let n = kw[1].trim()
      n = n.split(/\s+(?:a|en|por|con|de|del|,|;)/i)[0].trim()
      return n.length >= 3 ? n : null
    }
    return null
  }

  /**
   * Descripción del siniestro: tras "descripción:" o el texto tras los dos
   * puntos ("…: colisión leve, monto reclamado 1500" → "colisión leve").
   */
  private extractDescripcionSiniestroDe(message: string): string | null {
    const kw = message.match(/(?:descripci[oó]n|descripcion)\s*:\s*([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][\s\S]{2,120})/i)
    if (kw) {
      let d = kw[1].trim()
      d = d.split(/\s*(?:,|;)\s*monto\s+reclamado/i)[0].trim()
      if (d.length >= 2) return d
    }
    const idx = message.indexOf(':')
    if (idx >= 0) {
      let d = message.slice(idx + 1).trim()
      d = d.split(/\s*(?:,|;)\s*monto\s+reclamado/i)[0].trim()
      d = d.replace(/["'”]+\s*$/, '').trim()
      if (d.length >= 2) return d
    }
    return null
  }

  /**
   * Monto reclamado: "monto reclamado 1500" → 1500, "reclamado 30000 MXN" →
   * 30000.
   */
  private extractMontoReclamadoDe(message: string): number | null {
    const m = message.match(/(?:monto\s+reclamado|monto\s+de\s+la\s+reclamaci[oó]n|reclamad[oa]|reclamando)\s*(?::|de|por)?\s*(\d+(?:[.,]\d{1,2})?)/i)
    if (!m) return null
    const v = parseFloat(m[1].replace(',', '.'))
    return Number.isFinite(v) ? v : null
  }

  /**
   * Indemnización: "con indemnización 1200" → 1200, "monto indemnizado 800" →
   * 800.
   */
  private extractIndemnizacionDe(message: string): number | null {
    const m = message.match(/(?:indemnizaci[oó]n|monto\s+indemnizado|indemnizado)\s*(?::|de|por)?\s*(\d+(?:[.,]\d{1,2})?)/i)
    if (!m) return null
    const v = parseFloat(m[1].replace(',', '.'))
    return Number.isFinite(v) ? v : null
  }

  /**
   * Motivo de rechazo: tras los dos puntos o "por" ("rechaza el siniestro
   * SIN-002 por no estar cubierto" → "no estar cubierto").
   */
  private extractMotivoRechazoDe(message: string): string | null {
    const idx = message.indexOf(':')
    if (idx >= 0) {
      const m = message.slice(idx + 1).trim().replace(/["'”]+\s*$/, '').trim()
      if (m.length >= 3) return m
    }
    const m = message.match(/\bpor\s+(.{3,60})$/i)
    if (m) {
      const r = m[1].trim().replace(/["'”]+\s*$/, '').trim()
      return r.length >= 3 ? r : null
    }
    return null
  }

  /**
   * Fecha de inicio de cobertura: la fecha que sigue a "inicia/inicio/empieza/
   * desde" ("inicia hoy" → hoy, "inicia el 2026-09-01" → 2026-09-01).
   */
  private extractFechaInicioDe(message: string): string | null {
    const m = message.match(/(?:inicia|inicio|empieza|desde|fecha\s+de\s+inicio)\s*(?:el\s+|el\s+d[ií]a\s+)?([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9/\- ]{3,25})/i)
    if (!m) return null
    return this.extractFechaDe(m[1])
  }

  /**
   * Número de factura: "FAC-001" / "FAC_001" / "MOCK-1754…" / "#123" / el
   * token tras "factura". Normaliza quitando el '#' inicial.
   */
  private extractNumeroFacturaDe(message: string): string | null {
    const m = message.match(/\b(?:FAC[-_]\d+|[A-Z]{2,6}[-_]\d{2,}|MOCK[-_]\d+|#\d{2,})\b/i)
    if (m) return m[0].replace(/^#/, '')
    const kw = message.match(/\bfactura\s*(?:n[úu]mero\s*|nº\s*|#\s*)?([A-Za-z0-9][A-Za-z0-9-]{2,})/i)
    if (kw) {
      let n = kw[1].trim()
      n = n.split(/\s+(?:de|del|por|con|para|,|;)/i)[0].trim()
      if (n.length >= 3) return n
    }
    return null
  }

  /**
   * Monto de factura: con divisa ("por 5000€", "el monto correcto es 4500 €")
   * o tras la keyword "monto" ("monto 4500", "monto de 4500").
   */
  private extractMontoFacturaDe(message: string): number | null {
    // (?!\w) en vez de \b: "€" es un carácter no-palabra, así que \b tras él
    // nunca matchea al final de la cadena ("5000€" → null).
    const withCur = message.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur)(?!\w)/i)
    if (withCur) {
      const v = parseFloat(withCur[1].replace(',', '.'))
      if (Number.isFinite(v)) return v
    }
    const kw = message.match(/\bmonto\s*(?::|de\s+|es\s+|de\s+la\s+factura\s+)?(\d+(?:[.,]\d{1,2})?)/i)
    if (kw) {
      const v = parseFloat(kw[1].replace(',', '.'))
      if (Number.isFinite(v)) return v
    }
    return null
  }

  /**
   * Cliente de la factura: tras "para/para el lead/a/de" ("crea factura para
   * María García por 5000€" → "María García", "para el lead juan@email.com"
   * → "juan@email.com"). Corta en el siguiente campo (por, con, motivo…).
   */
  private extractClienteFacturaDe(message: string): string | null {
    const m = message.match(/\b(?:para|a|de)\s+(?:el\s+lead\s+|el\s+cliente\s+|la\s+cliente\s+|nuestr[oa]\s+cliente\s+)?([A-ZÁÉÍÓÚÑÜ0-9][A-Za-zÁÉÍÓÚÑÜ0-9@.\- ]{2,40})/i)
    if (!m) return null
    let c = m[1].trim()
    c = c.split(/\s+(?:por|con|de|del|la|el|y|o|motivo|raz[oó]n|rectifica|corrige|,|;)/i)[0].trim()
    if (c.length < 2 || /^(?:el|la|los|las|un|una|por|con|de|del)$/i.test(c)) return null
    return c
  }

  /**
   * Concepto de la factura: tras "por" que no sea un monto ("factura para
   * Carlos Ruiz por consultoría" → "consultoría").
   */
  private extractConceptoFacturaDe(message: string): string | null {
    const m = message.match(/\bpor\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{2,40})/i)
    if (!m) return null
    let c = m[1].trim()
    if (/^\d/.test(c)) return null // es un monto ("por 5000€"), no un concepto
    c = c.split(/\s*(?:,|;|con\s+|motivo|raz[oó]n|rectifica|corrige)/i)[0].trim()
    return c.length >= 2 ? c : null
  }

  /**
   * Motivo de cancelación/rectificación: tras "motivo:"/"razón:" o "por" al
   * final ("…por error en el concepto" → "error en el concepto").
   */
  private extractMotivoFacturaDe(message: string): string | null {
    const kw = message.match(/(?:motivo|raz[oó]n)\s*:\s*([\s\S]{2,80})/i)
    if (kw) {
      let r = kw[1].trim().replace(/["'”]+\s*$/, '').trim()
      if (r.length >= 2) return r
    }
    const por = message.match(/\bpor\s+(.{2,60})$/i)
    if (por) {
      const r = por[1].trim().replace(/["'”]+\s*$/, '').trim()
      return r.length >= 2 ? r : null
    }
    return null
  }

  /**
   * Número de tracking: "TRK-12345" / "ABC-987" / "ENV-550" / el token tras
   * "tracking"/"envío"/"paquete" ("el envío ABC-987" → "ABC-987").
   */
  private extractTrackingDe(message: string): string | null {
    const ref = message.match(/\b(?:TRK|ABC|ENV|SHP|SHIP)[-_]?\d{2,}\b/i)
    if (ref) return ref[0]
    const kw = message.match(/\b(?:tracking|env[ií]o|paquete)\s*(?:n[úu]mero\s*|#\s*)?([A-Za-z0-9][A-Za-z0-9-]{2,})/i)
    if (kw) {
      let t = kw[1].trim()
      t = t.split(/\s+(?:de|del|por|con|para|,|;)/i)[0].trim()
      // Rechazar conectores que se cuelan tras la keyword ("tracking del
      // paquete" → "del" no es un número de tracking)
      if (t.length >= 3 && !/^(?:de|del|el|la|los|las|un|una|por|con|para|mi|tu|su)$/i.test(t)) return t
    }
    return null
  }

  /**
   * Referencia de pedido: "#ORD-456" / "PED-100" / "ORD-456" / el número
   * tras "pedido" ("el pedido 789" → "789").
   */
  private extractPedidoRefDe(message: string): string | null {
    const ref = message.match(/\b#?(?:ORD|PED)[-_][A-Z0-9]+\b/i)
    if (ref) return ref[0].replace(/^#/, '')
    const kw = message.match(/\bpedido\s*(?:n[úu]mero\s*|#\s*)?([A-Za-z0-9][A-Za-z0-9-]{1,})/i)
    if (kw) {
      let p = kw[1].trim()
      p = p.split(/\s+(?:de|del|por|con|para|,|;)/i)[0].trim()
      // Rechazar conectores ("pedido de María" → "de" no es una referencia)
      if (p.length >= 2 && !/^(?:de|del|el|la|los|las|un|una|por|con|para|mi|tu|su)$/i.test(p)) return p
    }
    return null
  }

  /**
   * Referencia de vehículo: "VEH-001" / "#VEH-002" / matrícula corta tras
   * "vehículo"/"camión"/"flota del".
   */
  private extractVehiculoRefDe(message: string): string | null {
    const ref = message.match(/\b#?VEH[-_][A-Z0-9]+\b/i)
    if (ref) return ref[0].replace(/^#/, '')
    const kw = message.match(/\b(?:veh[ií]culo|cami[oó]n|veh[ií]culos)\s+(?:n[úu]mero\s*|#\s*)?([A-Za-z0-9][A-Za-z0-9-]{1,})/i)
    if (kw) {
      let v = kw[1].trim()
      v = v.split(/\s+(?:de|del|por|con|para|,|;)/i)[0].trim()
      if (v.length >= 2) return v
    }
    return null
  }

  /**
   * Referencia de almacén: tras "almacén" ("reorganización del almacén
   * principal" → "principal").
   */
  private extractAlmacenRefDe(message: string): string | null {
    const kw = message.match(/\balmac[eé]n\s+(?:principal\s+|central\s+|secundario\s+|de\s+|del\s+)?([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,30})/i)
    if (!kw) return null
    let a = kw[1].trim()
    a = a.split(/\s*(?:,|;|para|con|y)/i)[0].trim()
    return a.length >= 2 ? a : null
  }

  /**
   * Extrae el identificador de una solicitud de vacaciones: "#123",
   * "solicitud 123", "solicitud #123", "VAC-123". Normaliza a "123" o "VAC-123".
   */
  private extractSolicitudIdDe(message: string): string | null {
    const hash = message.match(/#\s?(\d{1,8})/)
    if (hash) return hash[1]
    const kw = message.match(/\b(?:solicitud|solicitud\s+de\s+vacaciones)\s+(?:n[úu]mero\s+|#\s*)?(\d{1,8})/i)
    if (kw) return kw[1]
    const prefijo = message.match(/\b(VAC-\d{1,8})/i)
    if (prefijo) return prefijo[1]
    return null
  }

  /**
   * Extrae la nota personalizada: tras "con nota: X", "nota: X", "con el
   * mensaje: X". Corta en comillas de cierre o fin de mensaje.
   */
  private extractNotaDe(message: string): string | null {
    const m = message.match(/\b(?:con\s+)?nota\s*:\s*["“']?([^"”']+)/i)
    if (m) {
      let nota = m[1].trim()
      nota = nota.replace(/["'”]+\s*$/, '').trim()
      if (nota.length >= 2) return nota
    }
    const m2 = message.match(/\bcon\s+el\s+mensaje\s*:\s*["“']?([^"”']+)/i)
    if (m2) {
      let nota = m2[1].trim()
      nota = nota.replace(/["'”]+\s*$/, '').trim()
      if (nota.length >= 2) return nota
    }
    return null
  }

  /**
   * Extrae el tema del copy: tras "sobre", "acerca de", "promocionando" o
   * "para". Descarta si solo captura el formato ("para WhatsApp").
   */
  private extractTemaDe(message: string): string | null {
    const FORMAT_ONLY = /^(?:email|correo|whatsapp|linkedin|instagram|facebook|tiktok|youtube|web|redes?\s+sociales?|sms|mi\s+producto|mi\s+servicio)$/i
    const m = message.match(/(?:sobre|acerca\s+de|promocionando)\s+([^,.]+)/i)
    if (m) {
      let tema = m[1].trim()
      tema = tema.split(/\s+(?:con\s+un\s+tono|en\s+formato)\b/i)[0].trim()
      tema = tema.replace(/["'”]+\s*$/, '').trim()
      if (tema.length >= 2 && !FORMAT_ONLY.test(tema)) return tema
    }
    const m2 = message.match(/\b(?:copy|post|publicaci[oó]n|anuncio|eslogan|slogan)\s+(?:de\s+|para\s+)?([^,.]+)/i)
    if (m2) {
      let tema = m2[1].trim()
      tema = tema.split(/\s+(?:con\s+un\s+tono|en\s+formato|para\s+email|para\s+redes|para\s+whatsapp)\b/i)[0].trim()
      tema = tema.replace(/["'”]+\s*$/, '').trim()
      if (tema.length >= 2 && !FORMAT_ONLY.test(tema)) return tema
    }
    return null
  }

  /**
   * Extrae el formato del copy: "para email" → EMAIL, "para LinkedIn" →
   * LINKEDIN, "para YouTube" → YOUTUBE, "para TikTok" → TIKTOK.
   */
  private extractFormatoDe(message: string): string | null {
    if (/\b(?:email|correo)\b/i.test(message)) return 'EMAIL'
    if (/\blinkedin\b/i.test(message)) return 'LINKEDIN'
    if (/\byoutube\b/i.test(message)) return 'YOUTUBE'
    if (/\btiktok\b/i.test(message)) return 'TIKTOK'
    if (/\b(?:redes\s+sociales|instagram|facebook|whatsapp|web)\b/i.test(message)) return 'EMAIL'
    return null
  }

  /**
   * Extrae el tono: profesional/formal → professional, agresivo → aggressive,
   * amigable/casual/divertido → friendly, educativo → educational.
   */
  private extractTonoDe(message: string): string | null {
    const m = message.match(/\b(?:con\s+un\s+tono\s+|tono\s+)([a-záéíóúñü]+)/i)
    if (m) {
      const t = m[1].toLowerCase()
      if (/^profesional|formal$/.test(t)) return 'professional'
      if (/^agresiv/.test(t)) return 'aggressive'
      if (/^amigable|casual|divertid/.test(t)) return 'friendly'
      if (/^educativ/.test(t)) return 'educational'
    }
    if (/\bprofesional\b|\bformal\b/i.test(message)) return 'professional'
    if (/\bagresiv[oa]\b/i.test(message)) return 'aggressive'
    if (/\bamigable\b|\bcasual\b|\bdivertid[oa]\b/i.test(message)) return 'friendly'
    if (/\beducativ[oa]\b/i.test(message)) return 'educational'
    return null
  }

  /**
   * Extrae el texto a analizar: tras "feedback:", "comentarios:", "texto:".
   */
  private extractTextoDe(message: string): string | null {
    const m = message.match(/(?:feedback|comentarios?|texto|rese[nñ]as?|mensaje)\s*[:]\s*["“']?([^"”']+)/i)
    if (m) {
      let t = m[1].trim()
      t = t.replace(/["'”]+\s*$/, '').trim()
      if (t.length >= 2) return t
    }
    return null
  }

  /**
   * Extrae el tipo de bloque web: hero, features, testimonials, pricing, cta,
   * team, contact, footer, stats, faq, gallery, blog.
   */
  private extractTipoBloqueDe(message: string): string | null {
    const tipos = ['testimonials', 'features', 'pricing', 'footer', 'gallery', 'contact', 'blog', 'stats', 'faq', 'team', 'hero', 'cta']
    const low = message.toLowerCase()
    for (const t of tipos) {
      if (new RegExp(`\\b${t}\\b`).test(low)) return t
    }
    // Sin anglicismo: "bloque de testimonios" → testimonials, "sección de características" → features
    if (/\btestimonio/.test(low)) return 'testimonials'
    if (/\bcaracter[ií]sticas?\b|\bfuncionalidades?\b/.test(low)) return 'features'
    if (/\bprecios?\b/.test(low)) return 'pricing'
    if (/\bllamada\s+a\s+la\s+acci[oó]n\b|\bcta\b/.test(low)) return 'cta'
    return null
  }

  /**
   * Extrae el producto/servicio de un bloque web: tras "para la landing de",
   * "para la web", "para promocionar", "para el/la". (Nombre distinto de
   * extractProductoDe del módulo de inventario.)
   */
  private extractProductoWebDe(message: string): string | null {
    const m = message.match(/(?:para\s+la\s+landing\s+de|para\s+la\s+web\s+de|para\s+promocionar|para\s+mi\s+landing\s+de|para\s+el|para\s+la)\s+([^,.]+)/i)
    if (m) {
      let prod = m[1].trim()
      prod = prod.replace(/["'”]+\s*$/, '').trim()
      // Descarta si lo capturado es solo el tipo de bloque o "web"
      if (this.extractTipoBloqueDe(prod)) return null
      if (/^web$/i.test(prod)) return null
      if (prod.length >= 2) return prod
    }
    return null
  }

  /**
   * Extrae el título de página del SEO: tras "para la página de", "para mi
   * landing de", "de la página de", "para la página".
   */
  private extractTituloPaginaDe(message: string): string | null {
    const m = message.match(/(?:para\s+la\s+p[aá]gina\s+de|para\s+mi\s+landing\s+de|para\s+la\s+p[aá]gina|de\s+la\s+p[aá]gina\s+de|para\s+mi\s+p[aá]gina\s+de)\s+([^,.]+)/i)
    if (m) {
      let titulo = m[1].trim()
      titulo = titulo.replace(/["'”]+\s*$/, '').trim()
      if (titulo.length >= 2) return titulo
    }
    return null
  }

  /**
   * Extrae el nombre de la campaña: tras "campaña de/para", o el adjetivo
   * descriptor de la campaña ("campaña de verano" → verano, "campaña de
   * Meta" → Meta).
   */
  private extractCampaniaDe(message: string): string | null {
    const m = message.match(/\bcampa[nñ]a\s+(?:de|para|en|con|\b)?\s*([^,.]+)/i)
    if (m) {
      let camp = m[1].trim()
      camp = camp.split(/\s+(?:para|con|en\s+horario|los\s+fines|solo|de\s+lunes)\b/i)[0].trim()
      camp = camp.replace(/["'”]+\s*$/, '').trim()
      // Evitar capturar palabras genéricas que siguen a "campaña"
      if (/^(?:actual|nueva|existente|que|de|mi|la|el|publicitaria|de\s+marketing)$/i.test(camp)) return null
      if (camp.length >= 2) return camp
    }
    return null
  }

  /**
   * Extrae los días de la semana de una programación: "lunes a viernes" →
   * [MON..FRI], "los fines de semana" → [SAT, SUN], "todos los días" → todos.
   */
  private extractDiasSemanaDe(message: string): string[] | null {
    const dayMap: Record<string, string> = {
      lunes: 'MON', martes: 'TUE', miercoles: 'WED', miércoles: 'WED', jueves: 'THU',
      viernes: 'FRI', sabado: 'SAT', sábado: 'SAT', domingo: 'SUN',
    }
    const order = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    const found: string[] = []
    const has = (re: RegExp) => re.test(message)
    if (has(/\btodos\s+los\s+d[ií]as\b/i)) return [...order]
    if (has(/\bfines?\s+de\s+semana\b/i)) found.push('SAT', 'SUN')
    const range = message.match(/\bde\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+a\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i)
    if (range) {
      const norm = (w: string) => dayMap[w.toLowerCase().replace(/é/g, 'e').replace(/á/g, 'a')]
      const start = order.indexOf(norm(range[1]))
      const end = order.indexOf(norm(range[2]))
      for (let i = start; i <= end && i < order.length; i++) found.push(order[i])
    }
    for (const [es, code] of Object.entries(dayMap)) {
      if (new RegExp(`\\b${es}\\b`, 'i').test(message) && !found.includes(code)) found.push(code)
    }
    return found.length ? [...new Set(found)] : null
  }

  /**
   * Extrae el rango horario "de 9 a 18", "de 9am a 6pm", "de 09:00 a 18:00".
   * Normaliza a HH:MM (24h). Atajos: "horario laboral" → 09:00-18:00,
   * "por la noche" → 22:00-06:00.
   */
  private extractHorarioDe(message: string): { inicio: string; fin: string } | null {
    const norm = (h: number, mRaw: string | undefined, pm: boolean): string => {
      let hour = h
      if (pm && hour < 12) hour += 12
      if (!pm && hour === 12) hour = 0
      return `${String(hour).padStart(2, '0')}:${String(mRaw ? Number(mRaw) : 0).padStart(2, '0')}`
    }
    if (/\bhorario\s+laboral\b/i.test(message)) return { inicio: '09:00', fin: '18:00' }
    if (/\bpor\s+la\s+noche\b/i.test(message)) return { inicio: '22:00', fin: '06:00' }
    const m = message.match(/\b(?:de|desde|entre)\s+(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:a|hasta|y)\s+(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
    if (m) {
      return { inicio: norm(Number(m[1]), m[2], /pm/i.test(m[3] || '')), fin: norm(Number(m[4]), m[5], /pm/i.test(m[6] || '')) }
    }
    return null
  }

  /**
   * Extrae la referencia de la programación a eliminar: tras "de la campaña
   * de" o el descriptor ("programación de la campaña de verano" → verano).
   */
  private extractProgramacionDe(message: string): string | null {
    const m = message.match(/(?:de\s+la\s+campa[nñ]a\s+de|de\s+la\s+campa[nñ]a|de\s+la\s+programaci[oó]n|de\s+mi\s+campa[nñ]a)\s+([^,.]+)/i)
    if (m) {
      let ref = m[1].trim()
      ref = ref.replace(/["'”]+\s*$/, '').trim()
      if (ref.length >= 2) return ref
    }
    const m2 = message.match(/\b(?:programaci[oó]n|horario)\s+(?:de\s+)?([^,.]+)/i)
    if (m2) {
      let ref = m2[1].trim()
      ref = ref.split(/\s+(?:nocturn[oa]|laboral|activa)\b/i)[0].trim()
      if (ref.length >= 2) return ref
    }
    return null
  }

  /**
   * Extrae la referencia del test A/B: tras "test A/B de la campaña de" o
   * "test A/B de". "el test A/B que creé" → null (pide más info).
   */
  private extractTestAbDe(message: string): string | null {
    const m = message.match(/test\s+a\/?b\s+(?:de\s+la\s+campa[nñ]a\s+de|de\s+la\s+campa[nñ]a|de)\s+([^,.]+)/i)
    if (m) {
      let ref = m[1].trim()
      ref = ref.replace(/["'”]+\s*$/, '').trim()
      if (ref.length >= 2) return ref
    }
    const m2 = message.match(/\btest\s+a\/?b\s+(?:de\s+la\s+campa[nñ]a\s+de|de\s+la\s+campa[nñ]a|de\s+)?([^,.]+)/i)
    if (m2) {
      let ref = m2[1].trim()
      ref = ref.split(/\s+(?:que|para)\b/i)[0].trim()
      if (ref.length >= 2 && !/^(?:que|que\s+cre[eé]|borrador|activo|en\s+curso)$/i.test(ref)) return ref
    }
    // "test de Facebook" sin A/B explícito ("declara ganadora la variante B
    // del test de Facebook")
    const m3 = message.match(/\btest\s+(?:de\s+la\s+campa[nñ]a\s+de|de\s+)?([^,.]+)/i)
    if (m3) {
      let ref = m3[1].trim()
      ref = ref.split(/\s+(?:que|para)\b/i)[0].trim()
      if (ref.length >= 2 && !/^a\/?b$/i.test(ref) && !/^(?:que|que\s+cre[eé]|borrador|activo|en\s+curso)$/i.test(ref)) return ref
    }
    return null
  }

  /**
   * Extrae la variante declarada: "variante B" → B, "la B" → B.
   */
  private extractVarianteDe(message: string): string | null {
    const m = message.match(/\b(?:variante|variant)\s+([A-Za-z0-9]+)/i)
    if (m) return m[1]
    const m2 = message.match(/\bganador[ao]?\s+la\s+([A-Za-z0-9]+)\b/i)
    if (m2) return m2[1]
    return null
  }

  /**
   * Extrae la referencia de la propiedad: id/sku ("#PROP-001", "PROP-001") o
   * descriptiva ("la casa de la colonia Roma" → "la colonia Roma", "el
   * departamento en la playa" → "playa").
   */
  private extractPropiedadDe(message: string): string | null {
    // 1. Id/sku: "#PROP-001", "propiedad PROP-001"
    const ref = message.match(/(?:propiedad|inmueble)\s*(?:#\s*|n[úu]mero\s+)?(PROP-\d{1,6}|\d{1,6})/i)
    if (ref && ref[1]) return ref[1]
    // 2. Descriptiva: "la casa de la colonia Roma", "el departamento en la playa"
    const kw = message.match(/\b(?:la|el|una|un|mi|del|de\s+la)\s+(casa|departamento|piso|oficina|local|terreno|chalet|villa|inmueble|propiedad)(?:\s+(?:de|del|de\s+la|en|en\s+el|en\s+la|que\s+est[aá]\s+en))?\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,40})/i)
    if (kw) {
      let refDesc = kw[2].trim()
      refDesc = refDesc.split(/\s+(?:en\s+venta|en\s+alquiler|para|con\s+nota|que\s+est[aá])\b/i)[0].trim()
      refDesc = refDesc.replace(/["'”]+\s*$/, '').trim()
      // Normaliza el artículo: "la playa" → "playa" (consistente con
      // "la colonia Roma" → "colonia Roma").
      refDesc = refDesc.replace(/^(?:la|el|los|las|una|un)\s+/i, '').trim()
      if (/^(?:venta|alquiler|arriendo)$/i.test(refDesc)) return kw[1]
      if (refDesc.length >= 2) return refDesc
      return kw[1]
    }
    // Respuesta multi-turno: "la del centro", "el de la playa"
    const pron = message.match(/\b(?:la|el|los|las)\s+(?:de|del)\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,25})/i)
    if (pron) return pron[1].trim()
    return null
  }

  /**
   * Extrae el tipo de inmueble: casa/chalet → Casa, departamento/piso →
   * Departamento, oficina/local → Oficina, terreno/solar → Terreno.
   */
  private extractTipoInmuebleDe(message: string): string | null {
    if (/\b(?:casas?|chalets?|villas?|adosados?)\b/i.test(message)) return 'Casa'
    if (/\b(?:departamentos?|pisos?|apartamentos?)\b/i.test(message)) return 'Departamento'
    if (/\b(?:oficinas?|locales?\s+comerciales?)\b/i.test(message)) return 'Oficina'
    if (/\b(?:terrenos?|solares?)\b/i.test(message)) return 'Terreno'
    return null
  }

  /**
   * Extrae la zona/ciudad tras "en": "en Madrid", "en la playa" (salta
   * "en venta"/"en alquiler").
   */
  private extractZonaDe(message: string): string | null {
    const m = message.match(/\ben\s+(?!(?:venta|alquiler|arriendo|comprar|rentar)\b)([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,25})/i)
    if (m) {
      let zona = m[1].trim()
      zona = zona.split(/\s+(?:con|de\s+m[aá]s|para|y|por|con\s+alberca)\b/i)[0].trim()
      zona = zona.replace(/["'”]+\s*$/, '').trim()
      if (zona.length >= 2) return zona
    }
    return null
  }

  /**
   * Extrae el número de habitaciones: "con más de 3 habitaciones", "3
   * dormitorios", "2 recámaras".
   */
  private extractHabitacionesDe(message: string): string | null {
    const m = message.match(/\b(?:m[aá]s\s+de\s+)?(\d{1,2})\s*(?:habitaciones|habs?|dormitorios?|rec[aá]maras?|cuartos?)\b/i)
    if (m) return m[1]
    return null
  }

  /**
   * Extrae el presupuesto: "presupuesto de 500k", "500 mil", "presupuesto
   * de 500,000", "500000". Normaliza a número.
   */
  private extractPresupuestoDe(message: string): string | null {
    const k = message.match(/\b(?:presupuesto\s+(?:de\s+)?)?(\d{1,3}(?:[.,]\d{3})?)\s*(k|mil)\b/i)
    if (k) {
      const base = Number(k[1].replace(/[.,]/g, ''))
      return String(k[2] === 'k' ? base * 1000 : base * 1000)
    }
    const plain = message.match(/\b(?:presupuesto\s+(?:de\s+)?)?(\d{4,7})\b/i)
    if (plain) return plain[1]
    return null
  }

  /**
   * Extrae la hora de "a las 10am", "a las 15:30", "las 2pm", "10:00 AM",
   * "2:30 PM". Normaliza a HH:MM (24h).
   */
  private extractHoraDe(message: string): string | null {
    const withPrefix = message.match(/\b(?:a\s+las|a\s+la|las)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?!\s*(?:citas?|reuniones?))/i)
    const ampm = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i)
    const bare = message.match(/\b(\d{1,2}):(\d{2})\b/)
    const m = withPrefix || ampm || bare
    if (!m) return null
    let h = Number(m[1])
    const min = m[2] ? Number(m[2]) : 0
    const meridian = (m[3] || '').toLowerCase().replace(/\./g, '')
    if (meridian.startsWith('p') && h !== 12) h += 12
    if (meridian.startsWith('a') && h === 12) h = 0
    if (h > 23 || min > 59) return null
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  /**
   * Extrae el título de una tarea: contenido tras los dos puntos ("crea tarea:
   * llamar a Juan Pérez" → "llamar a Juan Pérez"), cortado en fecha/prioridad/
   * descripción; o tras "tarea"/"pendiente" sin dos puntos.
   */
  private extractTituloTareaDe(message: string): string | null {
    const idx = message.indexOf(':')
    if (idx >= 0) {
      let t = message.slice(idx + 1).trim()
      t = t.split(/\s*(?:,|;|vence|vencimiento|prioridad|descripci[oó]n|con\s+prioridad|para\s+(?:el|la|hoy|ma[nñ]ana|viernes|lunes|martes|mi[eé]rcoles|jueves|s[aá]bado|domingo))/i)[0].trim()
      t = t.replace(/["'”]+\s*$/, '').trim()
      if (t.length >= 2) return t
    }
    // Sin dos puntos: lo que sigue a "tarea"/"pendiente" ("marca como completada
    // la tarea de llamar a Juan" → "llamar a Juan"). Sin filtro de mayúscula
    // porque los títulos suelen empezar en minúscula ("llamar a…").
    const kw = message.match(/\btarea\b|\bpendiente\b/i)
    if (kw && kw.index !== undefined) {
      let t = message.slice(kw.index + kw[0].length).trim()
      // NO se quita "con/para": "tarea con Alejandra" es una persona, no un título
      // (se sintetiza "Seguimiento X"); "tarea de llamar a Juan" sí es título.
      t = t.replace(/^(?:de|del|por|a)\s+/i, '')
      t = t.split(/\s*(?:,|;|vence|vencimiento|prioridad|descripci[oó]n)/i)[0].trim()
      t = t.replace(/["'”]+\s*$/, '').trim()
      if (t.length >= 2 && !/^(?:con|para|de|del|el|la|un|una)\b/i.test(t)) return t
    }
    return null
  }

  /**
   * Extrae el concepto de un gasto: el texto tras el monto y su conector
   * ("gasto de 45.90 en comida" → "comida"), cortando en el siguiente campo
   * (proveedor, categoría, coma…).
   */
  private extractConceptoDe(message: string): string | null {
    // Texto posterior al monto de la frase de gasto. Primero con monto
    // ("gasto de 45.90 en comida"), luego sin monto ("gasto en comida").
    const gWith = message.match(/(?:gasto|egreso|pago|compra|gast[éeoó])\s*(?::|de|por|en)?\s*\d+(?:[.,]\d{1,2})?\s*(?:€|euros?|eur)?/i)
    // "del" solo en gNoAmount: "gasto del 15/05…" → tras "del" viene un dígito
    // (el (?!\s*\d) mira más allá de los espacios) → el match falla y no se
    // captura la fecha como concepto.
    // \b en "de"/"del" evita que "de" matchee dentro de "del" (si no,
    // "gasto del 15/05…" consumiría solo "de" y capturaría la fecha).
    const gNoAmount = message.match(/(?:gasto|egreso|pago|compra|gast[éeoó])\s*(?::|por|en|del\b|de\b)\s*(?!\s*\d)/i)
    const gMatch = gWith || gNoAmount
    if (!gMatch || gMatch.index === undefined) return null
    let rest = message.slice(gMatch.index + gMatch[0].length).trim()
    rest = rest.replace(/^(?:en|de|por|para|con|el|la|al|del|a|de\s+la)\s+/i, '').replace(/^:\s*/, '')
    rest = rest.split(/\s*(?:,|;|proveedor|categor[ií]a|con\s+\S+@|\s+con\s+|email|el\s+d[ií]a|de\s+la\s+empresa|de\s+empresa)/i)[0].trim()
    rest = rest.replace(/["'”]+\s*$/, '').trim()
    return rest.length >= 2 ? rest : null
  }

  /**
   * Extrae la categoría de "categoría herramientas" / "categoria: viajes".
   */
  private extractCategoriaDe(message: string): string | null {
    const m = message.match(/\b(?:categor[ií]a|categoria)\s*(?::|de\s+)?\s*([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,25})/i)
    if (!m) return null
    let c = m[1].trim()
    c = c.split(/\s*(?:,|;|proveedor|con\s+)/i)[0].trim()
    return c.length >= 2 ? c : null
  }

  /**
   * Extrae la dirección de "dirección: Calle 5 #12" / "direccion Av. Reforma 123".
   * El skill de proveedores guarda la dirección por partes (streetName,
   * city…) pero para el chatbot basta con capturarla como texto libre y
   * createSupplierWrapper la asigna a streetName.
   */
  private extractDireccionDe(message: string): string | null {
    const m = message.match(/\b(?:direcci[oó]n|direccion|domicilio|calle)\s*(?::|de\s+)?\s*([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9.,'#\- ]{2,60})/i)
    if (!m) return null
    let d = m[1].trim()
    d = d.split(/\s*(?:,|;|con\s+(?:email|correo|tel[eé]fono)|categor[ií]a|provincia|ciudad)/i)[0].trim()
    d = d.replace(/["'”]+\s*$/, '').trim()
    return d.length >= 3 ? d : null
  }

  /**
   * Extrae la query de búsqueda de catálogo: el texto tras el verbo y la
   * entidad ("busca cafeteras en el catálogo" → "cafeteras", "qué precio
   * tiene el paquete premium" → "el paquete premium"), cortando en filtros
   * (categoría, tipo, rango de precio, ciudad…).
   */
  private extractCatalogoQueryDe(message: string): string | null {
    let q = message
      // Verbo + entidad opcional: "busca X", "busca en el catálogo X",
      // "consulta el catálogo de X", "cuánto cuesta X", "precio de X"…
      .replace(/\b(?:busca|buscar|encuentra|encontrar|consulta|consultar|dame|mu[eé]strame|muestra|ver|lista|listame)\s+(?:en\s+el\s+|el\s+|los\s+|las\s+)?(?:cat[aá]logo|productos?|servicios?|art[ií]culos?|precios?)?\s*/i, '')
      .replace(/\b(?:en\s+el\s+cat[aá]logo)\b/i, ' ')
      .replace(/\b(?:cu[aá]nto\s+cuesta|cuestan|vale|valen|qu[eé]\s+precio\s+tiene|qu[eé]\s+precio\s+tienen|precio\s+de|precios\s+de)\b/i, ' ')
      .trim()
    // Cortar en filtros estructurados
    q = q.split(/\s*(?:por\s+(?:menos|m[aá]s)\s+de|categor[ií]a|tipo|de\s+tipo|con\s+\d+\s+habitaciones|en\s+\S+\s+con\s+\d+|en\s+la\s+categor[ií]a)\b/i)[0].trim()
    q = q.replace(/["'”]+\s*$/, '').trim()
    // Quitar artículo inicial sobrante ("cuánto cuesta la consultoría" →
    // "consultoría") y descartar solo si queda vacío o es un artículo suelto.
    q = q.replace(/^(?:el|la|los|las|un|una|al|del)\s+/i, '').trim()
    if (!q || q.length < 2 || /^(?:el|la|los|las|un|una|al|del)$/i.test(q)) return null
    // Palabras genéricas de entidad no son un término de búsqueda real
    // ("busca productos por menos de 500" → query null, se usa el filtro tipo)
    if (/^(?:productos?|servicios?|art[ií]culos?|cat[aá]logo|precios?|[íi]tems?|propiedades?|inmuebles?|casas?)$/i.test(q)) return null
    return q
  }

  /**
   * Extrae el tipo de ítem de catálogo: "propiedades/inmuebles/casas" →
   * inmueble, "servicios" → servicio, "productos/artículos" → producto.
   */
  private extractTipoCatalogoDe(message: string): string | null {
    const m = message.match(/\b(?:tipo|de\s+tipo|tipo\s+de)\s+(\w+)\b/i)
    if (m) {
      const t = m[1].toLowerCase()
      if (t.includes('inmueble') || t.includes('propiedad') || t.includes('casa') || t.includes('departamento')) return 'inmueble'
      if (t.includes('servicio')) return 'servicio'
      if (t.includes('producto')) return 'producto'
    }
    if (/\b(?:propiedades?|inmuebles?|apartamentos?|casas?|departamentos?)\b/i.test(message)) return 'inmueble'
    if (/\b(?:servicios?)\b/i.test(message) && !/\b(?:productos?|art[ií]culos?|cat[aá]logo)\b/i.test(message)) return 'servicio'
    if (/\b(?:productos?|art[ií]culos?)\b/i.test(message) && !/\b(?:servicios?)\b/i.test(message)) return 'producto'
    return null
  }

  /**
   * Extrae rango de precio: "por menos de 300000" → precioMax,
   * "más de 150000" → precioMin, "entre 100 y 200" → ambos.
   */
  private extractPrecioRangoDe(message: string): { precioMin: number | null; precioMax: number | null } {
    let precioMin: number | null = null
    let precioMax: number | null = null
    const num = (s: string) => { const v = parseFloat(s.replace(',', '.')); return Number.isFinite(v) ? v : null }
    const entre = message.match(/\bentre\s+(\d+(?:[.,]\d+)?)\s+y\s+(\d+(?:[.,]\d+)?)\b/i)
    if (entre) {
      return { precioMin: num(entre[1]), precioMax: num(entre[2]) }
    }
    const menos = message.match(/\b(?:menos\s+de|por\s+menos\s+de|hasta|m[aá]ximo)\s+(\d+(?:[.,]\d+)?)\b/i)
    if (menos) precioMax = num(menos[1])
    const mas = message.match(/\b(?:m[aá]s\s+de|por\s+m[aá]s\s+de|desde|m[ií]nimo)\s+(\d+(?:[.,]\d+)?)\b/i)
    if (mas) precioMin = num(mas[1])
    return { precioMin, precioMax }
  }

  /**
   * Extrae el producto/materia de "del producto X", "producto Y", "del material
   * Z", "de las 10 unidades del producto Z". Corta en unidades/cantidades.
   */
  private extractProductoDe(message: string): string | null {
    const m = message.match(/(?:del\s+producto|del\s+material|producto|material|art[ií]culo|de\s+la\s+existencia|de\s+los\s+productos)\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,50})/i)
    if (!m) return null
    let p = m[1].trim()
    p = p.split(/\s*(?:,|;|unidades?|uds?|piezas?|pzs?|kg|lt|litros?|al\s+almac[eé]n|a\s+otro|stock|hacia|al\s+)\b/i)[0].trim()
    p = p.replace(/["'”]+\s*$/, '').trim()
    return p.length >= 2 ? p : null
  }

  /**
   * Extrae el producto en frases industriales sin la palabra "producto":
   * "producción del panel solar" → panel solar, "fabricar el inversor" →
   * inversor, "desperdicio del panel solar" → panel solar, "inspección de
   * calidad del panel solar" → panel solar.
   */
  private extractProductoIndustrialDe(message: string): string | null {
    const m = message.match(/(?:producci[oó]n|fabricar|manufactura|desperdicio|merma(?:s)?\s+(?:de|en)|inspecci[oó]n\s+de\s+calidad|control\s+de\s+calidad|registro\s+de\s+qc)\s+(?:(?:del|de\s+la|de\s+los|de\s+las|de|el|la|los|las|para\s+el|para\s+la)\s+)?([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,50})/i)
    if (!m) return null
    let p = m[1].trim()
    p = p.split(/\s*(?:,|;|resultado|con\s+notas?|notas?|en\s+el\s+lote|unidades?|uds?|piezas?)\b/i)[0].trim()
    p = p.replace(/["'”]+\s*$/, '').trim()
    // "manufactura del lote Z" → la ref es la etiqueta del lote, no el lote en sí
    if (/^lote\s+/i.test(p)) p = p.replace(/^lote\s+/i, '').trim()
    return p.length >= 2 ? p : null
  }

  /**
   * Extrae la cantidad de stock: "entrada de 50 unidades" → 50,
   * "salida de 10" → 10, "consume 5 unidades" → 5.
   */
  private extractCantidadStockDe(message: string): number | null {
    const m = message.match(/(?:de|por|en|a)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:unidades?|uds?|piezas?|pzs?|kg|lt|litros?)?\b/i)
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'))
      if (Number.isFinite(v)) return v
    }
    const bare = message.match(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:unidades?|uds?|piezas?|pzs?|kg|lt|litros?)\b/i)
    if (bare) {
      const v = parseFloat(bare[1].replace(',', '.'))
      if (Number.isFinite(v)) return v
    }
    return null
  }

  /**
   * Extrae la referencia de orden de producción / work order:
   * "#OP-001" → OP-001, "la orden #123" → 123, batch "L-987".
   */
  private extractOrdenProduccionDe(message: string): string | null {
    const m = message.match(/\b(?:#?OP-?\d{1,6}|#?WO-?\d{1,6}|batch\s+(?:#?[A-Z0-9-]{2,12})|orden\s+(?:de\s+producci[oó]n\s+)?#?\d{1,6})\b/i)
    if (m) return m[0].replace(/^#/, '').trim()
    return null
  }

  /**
   * Extrae el resultado de una inspección de calidad:
   * "aprobado/conforme/pasa" → PASSED, "rechazado/falla/failed" → FAILED.
   */
  private extractResultadoQcDe(message: string): string | null {
    if (/\b(?:aprobad[oa]|conforme|pasa|pas[oó]|ok|bien|pass(?:ed)?)\b/i.test(message)) return 'PASSED'
    if (/\b(?:rechazad[oa]|falla|fall[oó]|fail(?:ed)?|no\s+conforme|defectuos[oa])\b/i.test(message)) return 'FAILED'
    return null
  }

  /**
   * Extrae el inspector de una inspección de calidad ("inspector: María").
   */
  private extractInspectorDe(message: string): string | null {
    const m = message.match(/(?:inspector|por|realizada\s+por)\s*(?::|\s+por)?\s+([A-Z][A-Za-zÁÉÍÓÚÑÜáéíóúñü]+(?:\s+[A-Z][A-Za-zÁÉÍÓÚÑÜáéíóúñü]+)?)/i)
    if (m && /\b(?:inspector|realizada\s+por)\b/i.test(message)) return m[1]
    return null
  }

  /**
   * Extrae el nombre del proyecto: "del proyecto Alpha" → Alpha,
   * "proyecto X" → X, "el proyecto de la obra central" → la obra central.
   */
  private extractProyectoDe(message: string): string | null {
    const m = message.match(/(?:del\s+proyecto|proyecto)\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,40})/i)
    if (!m) return null
    let p = m[1].trim()
    p = p.split(/\s*(?:,|;|\bde\s+mis\b|\bque\s+|\bfinancieramente\b|\bprofitability\b)\b/i)[0].trim()
    p = p.replace(/["'”]+\s*$/, '').trim()
    return p.length >= 2 ? p : null
  }

  /**
   * Extrae el tipo de ajuste: "entrada/ingreso" → IN, "salida/egreso" → OUT,
   * "transfiere/mueve" → TRANSFER.
   */
  private extractTipoStockDe(message: string): string | null {
    if (/\b(?:transfiere|transferir|mueve|mover|transferencia)\b/i.test(message)) return 'TRANSFER'
    if (/\b(?:salida|egreso|dar\s+de\s+baja|quita)\b/i.test(message)) return 'OUT'
    if (/\b(?:entrada|ingreso|dar\s+de\s+alta|agrega\s+stock)\b/i.test(message)) return 'IN'
    return null
  }

  /**
   * Extrae el proveedor de "proveedor Iberdrola" / "proveedor: Acme".
   */
  private extractProveedorDe(message: string): string | null {
    const m = message.match(/\b(?:proveedor(?:es)?|proveedora)\s*(?::|de\s+)?\s*([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,40})/i)
    if (!m) return null
    let p = m[1].trim()
    p = p.split(/\s*(?:,|;|categor[ií]a|con\s+)/i)[0].trim()
    p = p.replace(/["'”]+\s*$/, '').trim()
    return p.length >= 2 ? p : null
  }

  /**
   * Extrae el periodo de análisis en meses: "este mes" → 1, "este trimestre"
   * / "3 meses" → 3, "este año" → 12.
   */
  private extractMesesDe(message: string): number | null {
    // Nota: sin \b inicial porque JS no considera word-char a los acentos
    // ("último" precedido de espacio no tendría boundary). "del trimestre"
    // y "para el próximo año" también cubren el periodo.
    if (/(?:este|el|del|para\s+el|pr[oó]ximo|pr[oó]ximos|último|ultimo)\s+a[nñ]o\b|\b12\s+meses\b/i.test(message)) return 12
    if (/(?:este|el|del|para\s+el|pr[oó]ximo|último|ultimo)\s+trimestre\b|\b3\s+meses\b/i.test(message)) return 3
    if (/\b6\s+meses\b|\bsemestre\b/i.test(message)) return 6
    if (/(?:este|el|del|para\s+el|pr[oó]ximo|último|ultimo)\s+mes\b/i.test(message)) return 1
    const m = message.match(/\b(\d{1,2})\s+meses?\b/i)
    if (m) {
      const v = Number(m[1])
      if (v >= 1 && v <= 24) return v
    }
    return null
  }

  /**
   * Extrae el país/región fiscal de la proyección de impuestos:
   * "España/ES" → ES, "México/MX" → MX, "USA/US/EE.UU/LLC" → USA_LLC.
   */
  private extractPaisDe(message: string): string | null {
    if (/\b(?:espa[nñ]a|espa[nñ]ol)\b|\bES\b/i.test(message)) return 'ES'
    if (/\b(?:m[eé]xico|mexicano)\b|\bMX\b/i.test(message)) return 'MX'
    if (/\b(?:usa|estados\s+unidos|ee\.?\s?uu|am[eé]rica)\b|\bUS\b|\bLLC\b/i.test(message)) return 'USA_LLC'
    return null
  }

  /**
   * Extrae el tipo de cita: "videollamada/virtual/zoom" → videollamada,
   * "presencial/oficina" → presencial.
   */
  private extractTipoCitaDe(message: string): string | null {
    if (/\b(?:videollamada|video|virtual|online|zoom|meet|google\s+meet)\b/i.test(message)) return 'videollamada'
    if (/\b(?:presencial|oficina|en\s+persona|domicilio)\b/i.test(message)) return 'presencial'
    return null
  }

  /**
   * Extrae el tipo de interacción (llamada/email/whatsapp/reunión/visita/mensaje/nota).
   */
  private extractTipoInteraccionDe(message: string): string | null {
    if (/\bllamad[oa]\b|\bllam[aá]r\b/i.test(message)) return 'llamada'
    if (/\bemail\b|\bcorreo\b/i.test(message)) return 'email'
    if (/\bwhatsapp\b/i.test(message)) return 'whatsapp'
    if (/\breuni[oó]n\b/i.test(message)) return 'reunión'
    if (/\bvisita\b/i.test(message)) return 'visita'
    if (/\bmensaje\b/i.test(message)) return 'mensaje'
    if (/\bnota\b/i.test(message)) return 'nota'
    return null
  }

  /**
   * Extrae el monto monetario de "por 5000€" / "a 7000€" / "3000 euros".
   */
  private extractMontoDe(message: string): number | null {
    const m = message.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur|pesos|dolares|usd|mxn)/i)
    if (!m) return null
    const v = parseFloat(m[1].replace(',', '.'))
    return Number.isFinite(v) ? v : null
  }

  /**
   * Extrae el título/servicio de "por el paquete empresarial" / "para el servicio X".
   */
  private extractTituloDe(message: string): string | null {
    const m = message.match(/(?:por|para|del?)\s+(?:el|la|un|una)\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{2,40})/i)
    if (!m) return null
    let t = m[1].trim()
    t = t.split(/\s*(?:,|;|\s+y\s+)/i)[0].trim()
    if (/^\d/.test(t)) return null // es un monto, no un título
    return t.length >= 2 ? t : null
  }

  /**
   * Extrae la etapa de "a etapa negociación" / "en etapa X" / "etapa propuesta".
   */
  private extractEtapaDe(message: string): string | null {
    const m = message.match(/(?:a\s+etapa|en\s+etapa|por\s+etapa|etapa)\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü]{2,25})/i)
    if (!m) return null
    return m[1].toLowerCase()
  }

  /**
   * Extrae la prioridad de "prioridad alta/media/baja".
   */
  private extractPrioridadDe(message: string): string | null {
    const m = message.match(/\bprioridad\s+([a-zA-ZÁÉÍÓÚÑÜáéíóúñü]+)/i)
    if (!m) return null
    const p = m[1].toLowerCase()
    return /^(alta|media|baja)$/.test(p) ? p : null
  }

  /**
   * Extrae el estado de un lead de "leads en estado X" / "leads por estado X"
   * o de palabras sueltas comunes ("nuevos", "convertidos").
   */
  private extractEstadoDe(message: string): string | null {
    const m = message.match(/(?:en|por)\s+estado\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü]{2,20})/i)
    if (m) return m[1].toLowerCase()
    // "nuevos"/"convertidos" sueltos SOLO si no vienen como tag ("leads con tags
    // nuevos" → "nuevos" es una etiqueta, no un estado).
    if (/\bnuevos?\b/i.test(message) && !/tags?\s+nuevos?\b/i.test(message)) return 'nuevo'
    if (/\bconvertidos?\b/i.test(message) && !/tags?\s+convertidos?\b/i.test(message)) return 'convertido'
    return null
  }

  /**
   * Extrae el tipo de contacto de "contactos tipo empresa/persona".
   */
  private extractTipoDe(message: string): string | null {
    const m = message.match(/\btipo\s+([a-zA-ZÁÉÍÓÚÑÜáéíóúñü\-]{2,25})/i)
    if (!m) return null
    const t = m[1].toLowerCase()
    if (/^(?:empresa|company|compañ[ií]a|empresas)$/.test(t)) return 'company'
    if (/^(?:persona|person|personas)$/.test(t)) return 'person'
    return null
  }

  /**
   * Extrae el término de búsqueda de un listado:
   * - "que contengan X" / "con la palabra X"
   * - nombre propio justo después de la entidad ("busca el contacto Laura" → "Laura")
   */
  private extractSearchDe(message: string, entityKeyword: RegExp): string | null {
    const m = message.match(/(?:que\s+contengan?\s+|con\s+la\s+palabra\s+)(?:["'“])?([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'.\- ]{0,40})/i)
    if (m) {
      let s = m[1].trim()
      // Recortar en el siguiente conector ("que contengan García y de Acme" → "García")
      s = s.split(/\s+(?:y|de|con|por)\b/i)[0].trim()
      s = s.replace(/(?<=[a-záéíóúñü0-9])\.\s*$/, '').trim()
      s = s.replace(/["'”]\s*$/, '').trim()
      return s.length >= 2 ? s : null
    }

    // "busca el contacto Laura Gómez" → término tras la entidad. Se rechaza si
    // empieza con palabras estructurales (todos/los/en/tipo…) para no capturar
    // "tipo empresa" ni "en estado contactado" (esas van por sus helpers).
    const afterEntity = this.extractNombreAfter(message, entityKeyword)
    if (afterEntity && !/^(?:todos?|todas|los|las|en|por|con|que|tipo|de|una|un)\b/i.test(afterEntity.trim())) {
      return afterEntity.trim()
    }
    return null
  }

  /**
   * Extrae el nombre que sigue a una keyword (lead/contacto/empresa) hasta un
   * delimitador natural (coma, punto, ";", "con email", "de la empresa", …).
   */
  private extractNombreAfter(message: string, keyword: RegExp): string | null {
    const match = message.match(keyword)
    if (!match || match.index === undefined) return null

    let rest = message.slice(match.index + match[0].length).trim()
    rest = rest.replace(/^[:\s]+/, '')

    // Paso 1: delimitadores fuertes (coma, punto y coma, "con email/correo/
    // teléfono", "para", "de la empresa").
    const parts = rest.split(/\s*(?:,|;|para\s+|con\s+(?:email|correo|tel[eé]fono|nota)|de\s+la\s+empresa|de\s+empresa)/i)
    let name = parts[0].trim()

    // Paso 2: el punto solo separa cuando cierra una oración nueva (seguido de
    // mayúscula case-sensitive) — NUNCA dentro de razones sociales con
    // abreviaturas ("S.A. de C.V.", "Inc.", "S.L.", "U.S."). El flag /i del
    // paso 1 no aplica aquí porque este split se hace sin /i.
    name = name.split(/\.\s+(?=[A-ZÁÉÍÓÚÑÜ])/)[0].trim()
    // Quitar SOLO el punto final de oración (nombre de persona: "Juan Perez."),
    // preservando el de abreviaturas/razones sociales ("S.A. de C.V.", "Inc.")
    // cuyo carácter previo es mayúscula.
    name = name.replace(/(?<=[a-záéíóúñü0-9])\.\s*$/, '').trim()

    name = name.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/g, '').trim()
    name = name.replace(/^(?:llamad[oa]|a|nuev[oa])\s+/i, '').trim()

    const words = name.split(/\s+/).filter(Boolean)
    const keep: string[] = []
    const CONNECTORS = /^(?:de|del|la|el|y|los|las|san|santa)$/i
    for (const w of words) {
      if (!/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9]/.test(w)) continue
      if (CONNECTORS.test(w)) {
        if (keep.length > 0) keep.push(w)
        continue
      }
      keep.push(w)
      if (keep.length >= 5) break
    }
    while (keep.length > 0 && CONNECTORS.test(keep[keep.length - 1])) keep.pop()
    if (keep.length === 0) return null

    const finalName = keep.join(' ')
    if (finalName.length < 2 || /^[a-z]/.test(finalName)) return null
    return finalName
  }

  /**
   * Extrae el nombre de empresa de "de la empresa X" / "empresa X"
   * (usado en lead/contacto). Soporta razones sociales con "S.A.", "Inc.",
   * "S.A. de C.V.", etc.
   */
  private extractEmpresaDe(message: string): string | null {
    // 1. "de la empresa X" / "de empresa X" (más específico)
    const m1 = message.match(/(?:de\s+la\s+empresa|de\s+empresa)\s+([A-ZÁÉÍÓÚÑÜ][a-zA-ZÁÉÍÓÚÑÜ0-9]+(?:[^,;]{0,50}))/i)
    if (m1) {
      let e = m1[1].trim()
      e = e.replace(/\s*(?:con|y|tel[eé]fono|email|correo)\b.*$/i, '').trim()
      e = e.replace(/[.\s]+$/, '').trim()
      return e.length >= 2 ? e : null
    }
    // 2. "empresa X" suelto (ej: "empresa Volkern Test")
    const m2 = message.match(/\bempresa\s+([A-ZÁÉÍÓÚÑÜ][a-zA-ZÁÉÍÓÚÑÜ0-9]+(?:[^,;]{0,50}))/i)
    if (m2) {
      let e = m2[1].trim()
      e = e.replace(/\s*(?:con|y|tel[eé]fono|email|correo)\b.*$/i, '').trim()
      e = e.replace(/[.\s]+$/, '').trim()
      return e.length >= 2 ? e : null
    }
    return null
  }

  /**
   * Extrae el cargo/puesto de "cargo Gerente", "puesto Director", etc.
   */
  private extractCargoDe(message: string): string | null {
    const m = message.match(/(?:cargo|puesto|posici[oó]n)\s*(?::|de\s+)?\s*([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,40})/i)
    if (!m) return null
    let c = m[1].trim()
    // Recortar hasta un delimitador natural (coma, punto y coma, "con email",
    // "de la empresa"). El punto suelto NO corta para no partir abreviaturas
    // tipo "Director de S.A." (mismo criterio que extractNombreAfter).
    c = c.split(/\s*(?:,|;|con\s+(?:email|correo|tel[eé]fono)|de\s+la\s+empresa|empresa\b)/i)[0].trim()
    return c.length >= 2 ? c : null
  }

  /**
   * Extrae teléfono de "teléfono +52..." / "tel 555-1234" / "celular ...".
   */
  private extractTelefonoDe(message: string): string | null {
    const m = message.match(/(?:tel[eé]fono|tel|celular|cel|m[oó]vil|whatsapp)\s*(?::|de\s+)?\s*(\+?[\d\s()\-.]{6,18})/i)
    if (!m) return null
    let t = m[1].trim()
    t = t.split(/\s*(?:,|;|\s+y\s+)/i)[0].trim()
    t = t.replace(/[^+\d\-()\s]/g, '').trim()
    t = t.replace(/\.\s*$/, '').trim() // punto final colgante ("555-1234.")
    if (t.replace(/\D/g, '').length < 6) return null
    return t
  }

  /**
   * Extrae LinkedIn de "linkedin.com/in/usuario" / "linkedin: usuario" /
   * "linkedin de usuario". NO acepta "linkedin" como sustantivo en frases tipo
   * "el lead que llegó por linkedin" (capturaría "con" o "de").
   */
  private extractLinkedinDe(message: string): string | null {
    // URL completa: linkedin.com/in/usuario
    const url = message.match(/linkedin\.com\/in\/([A-Za-z0-9._\-]{2,60})/i)
    if (url) return url[1].trim()

    // Etiqueta de campo: "linkedin: usuario" / "linkedin de usuario" /
    // "linkedin usuario" (un solo token, no un conector).
    const m = message.match(/linkedin\s*(?::|de\s+)?\s*(?:in\/)?([A-Za-z0-9._\-]{2,60})/i)
    if (!m) return null
    let l = m[1].trim()
    l = l.split(/\s*(?:,|;|\s+y\s+)/i)[0].trim()
    const firstToken = l.split(/[.\/_-]/)[0].toLowerCase()
    if (/^(?:con|de|el|la|los|las|por|que|del|para|en|y|al|un|una|tengo|soy|es|mi)$/.test(firstToken)) return null
    return l.length >= 2 ? l : null
  }

  /**
   * Extrae ubicación de "ubicación Ciudad de México" / "ubicado en ...".
   * NOTA: NO se acepta el "en" desnudo como ancla (matcheaba el "en" dentro
   * de palabras tipo "Elena" y capturaba "a Ruiz" en vez de la ciudad).
   */
  private extractUbicacionDe(message: string): string | null {
    const m = message.match(/(?:ubicaci[oó]n|ubicad[oa]\s+en)\s*(?::|de\s+)?\s*([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,40})/i)
    if (!m) return null
    let u = m[1].trim()
    u = u.split(/\s*(?:,|;|\.|con\s+(?:email|correo|tel[eé]fono)|empresa\b)/i)[0].trim()
    return u.length >= 2 ? u : null
  }

  /**
   * Extrae tags de "tags vip,cliente" / "etiquetas a,b,c".
   */
  private extractTagsDe(message: string): string | null {
    const m = message.match(/\b(?:tags?|etiquetas)\b\s*(?::|de\s+)?\s*([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9_,\- ]{1,60})/i)
    if (!m) return null
    let t = m[1].trim()
    // Cortar en el siguiente campo (evita capturar "de la empresa X", "con email"…)
    t = t.split(/\b(?:de\s+la\s+empresa|de\s+empresa|con\s+(?:email|correo|tel[eé]fono)|cargo|tel[eé]fono|linkedin|ubicaci[oó]n)\b/i)[0].trim()
    t = t.replace(/^[,\s]+|[,\s]+$/g, '')
    return t.length >= 1 ? t : null
  }

  /**
   * Extrae contexto/notas de "contexto: interesado en software" /
   * "notas: llamar después". Requiere que la palabra funcione como campo
   * (seguida de ":") para no confundirse con palabras sueltas tipo
   * "Nota Azul" o "notas de prensa".
   */
  private extractContextoDe(message: string): string | null {
    const m = message.match(/\b(?:contexto|notas?)\b\s*:\s*([A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9'\- ]{1,80})/i)
    if (!m) return null
    let c = m[1].trim()
    c = c.split(/\s*(?:,|;|\s+y\s+(?:el|la|tel[eé]fono|email|correo))/i)[0].trim()
    return c.length >= 2 ? c : null
  }

  /**
   * Extrae un parámetro faltante concreto del mensaje (multi-turno sin LLM).
   */
  private extractParamDeterministically(param: string, message: string): string | null {
    if (param === 'email') {
      const m = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/)
      return m ? m[1] : null
    }
    if (param === 'telefono' || param === 'phone') {
      // Primero con keyword ("teléfono 555..."), luego acepta número desnudo:
      // en multi-turno el usuario responde SOLO el número ("5551234567")
      // cuando el bot pregunta "¿Cuál es el número de teléfono?".
      const withKeyword = this.extractTelefonoDe(message)
      if (withKeyword) return withKeyword
      const bare = message.match(/(?:\+?\d[\d\s\-().]{6,}\d)/)
      return bare ? bare[0].replace(/\s+/g, ' ').trim() : null
    }
    if (param === 'nombre') {
      const trimmed = message.trim()
      // Acepta nombres con mayúscula inicial ("Ana Torres") o en minúscula
      // simple ("ana") para no estancar el multi-turno. También razones
      // sociales / nombres con conectores en minúscula ("Suministros del
      // Norte", "Tecnología Plus SA de CV"): cada token significativo debe
      // empezar con mayúscula y solo se permiten conectores cortos
      // (de/del/la/las/los/el/y/e/sa). Esto NO captura frases tipo "Fue en
      // comida" o "Llámame mañana" como nombre.
      // Token: palabra capitalizada ("Norte") o sigla/abreviatura en mayúscula
      // ("SA", "CV", "S.A.", "Inc."). Tras un conector corto o un espacio.
      const TOKEN = '(?:[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+|[A-ZÁÉÍÓÚÑÜ]{1,5}(?:\.)?)'
      const NAME_RE = new RegExp(
        '^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+(?:\\s+(?:de|del|la|las|los|el|y|e|sa)\\s+' + TOKEN + '|\\s+' + TOKEN + '){0,5}$'
      )
      if (NAME_RE.test(trimmed) || /^[a-záéíóúñü]{2,20}$/.test(trimmed)) {
        return trimmed
      }
      return null
    }
    if (param === 'empresa') {
      return this.extractEmpresaDe(message)
    }
    if (param === 'categoria' || param === 'category') {
      return this.extractCategoriaDe(message)
    }
    if (param === 'direccion' || param === 'address' || param === 'domicilio') {
      return this.extractDireccionDe(message)
    }
    if (param === 'cargo' || param === 'puesto') {
      return this.extractCargoDe(message)
    }
    if (param === 'linkedin') {
      return this.extractLinkedinDe(message)
    }
    if (param === 'ubicacion') {
      return this.extractUbicacionDe(message)
    }
    if (param === 'tags') {
      return this.extractTagsDe(message)
    }
    if (param === 'contexto' || param === 'notas' || param === 'nota') {
      return this.extractContextoDe(message)
    }
    if (param === 'tipo') {
      return this.extractTipoInteraccionDe(message) || this.extractTipoCitaDe(message)
    }
    if (param === 'fecha' || param === 'date') {
      return this.extractFechaDe(message)
    }
    if (param === 'monto' || param === 'amount') {
      const gAmount = message.match(/(?:gasto|egreso|pago|compra|gast[éeoó])\s*(?::|de|por|en)?\s*(\d+(?:[.,]\d{1,2})?)/i)
      const withKeyword = gAmount ? parseFloat(gAmount[1].replace(',', '.')) : null
      if (withKeyword !== null && Number.isFinite(withKeyword)) return String(withKeyword)
      // Facturación (décimo entrenamiento): "el monto es 4500", "por 5000€"
      const facturaMonto = this.extractMontoFacturaDe(message)
      if (facturaMonto !== null && facturaMonto !== withKeyword) return String(facturaMonto)
      // Respuesta desnuda del usuario: "45.90" / "300"
      const bare = message.match(/^(?:\s*)(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?)?\s*$/i)
      return bare ? String(parseFloat(bare[1].replace(',', '.'))) : null
    }
    if (param === 'concepto' || param === 'description') {
      // Facturación (décimo entrenamiento): "por consultoría" tras la factura
      const facturaConcepto = this.extractConceptoFacturaDe(message)
      if (facturaConcepto) return facturaConcepto
      const withField = this.extractConceptoDe(message)
      if (withField) return withField
      const trimmed = message.trim()
        .replace(/^(?:fue|es|era|son)\s+/i, '')
        .replace(/^(?:en|por|de|un|una)\s+/i, '')
        .replace(/^:\s*/, '')
        .trim()
      if (/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/.test(trimmed) && trimmed.length >= 2 && trimmed.length <= 60) return trimmed
      return null
    }
    if (param === 'proveedor') {
      return this.extractProveedorDe(message)
    }
    if (param === 'categoria' || param === 'category') {
      return this.extractCategoriaDe(message)
    }
    if (param === 'months' || param === 'periodo') {
      return this.extractMesesDe(message) !== null ? String(this.extractMesesDe(message)) : null
    }
    if (param === 'pais' || param === 'region') {
      return this.extractPaisDe(message)
    }
    if (param === 'titulo') {
      const withField = this.extractTituloTareaDe(message)
      if (withField) return withField
      const trimmed = message.trim().replace(/^:\s*/, '').trim()
      if (/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/.test(trimmed) && trimmed.length >= 2 && trimmed.length <= 80) return trimmed
      return null
    }
    if (param === 'fechaVencimiento' || param === 'dueDate') {
      return this.extractFechaDe(message)
    }
    if (param === 'prioridad') {
      return this.extractPrioridadDe(message)
    }
    if (param === 'hora' || param === 'time') {
      return this.extractHoraDe(message)
    }
    if (param === 'servicio' || param === 'service') {
      return this.extractTituloDe(message)
    }
    if (param === 'contenido') {
      const idx = message.indexOf(':')
      const content = (idx >= 0 ? message.slice(idx + 1) : message).trim()
      return content.length >= 2 ? content.replace(/["'”]+\s*$/, '').trim() : null
    }
    // ─── Módulo Seguros (Noveno entrenamiento) ───
    if (param === 'numeroPoliza') {
      return this.extractNumeroPolizaDe(message)
    }
    if (param === 'aseguradora') {
      return this.extractAseguradoraDe(message)
    }
    if (param === 'ramo') {
      return this.extractRamoSeguroDe(message)
    }
    if (param === 'estado') {
      return this.extractEstadoPolizaDe(message) || this.extractEstadoSiniestroDe(message) || this.extractEstadoRenovacionDe(message)
    }
    if (param === 'primaAnual' || param === 'prima') {
      const v = this.extractPrimaDe(message)
      return v !== null ? String(v) : null
    }
    if (param === 'sumaAsegurada') {
      const v = this.extractSumaAseguradaDe(message)
      return v !== null ? String(v) : null
    }
    if (param === 'fechaInicio' || param === 'fechaSuceso' || param === 'fechaCierre' || param === 'fechaReporte') {
      return this.extractFechaDe(message) || this.extractFechaInicioDe(message)
    }
    if (param === 'cliente') {
      // Email desnudo ("juan@email.com") o nombre ("María García") de facturación
      const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/)
      if (emailMatch) return emailMatch[1]
      return this.extractClienteSeguroDe(message) || this.extractClienteFacturaDe(message)
    }
    if (param === 'dias') {
      const v = this.extractDiasDe(message)
      return v !== null ? String(v) : null
    }
    if (param === 'poliza') {
      return this.extractPolizaRefDe(message)
    }
    if (param === 'siniestro' || param === 'numeroSiniestro') {
      return this.extractNumeroSiniestroDe(message) || this.extractPolizaRefDe(message)
    }
    if (param === 'descripcion') {
      return this.extractDescripcionSiniestroDe(message)
    }
    if (param === 'montoReclamado') {
      const v = this.extractMontoReclamadoDe(message)
      return v !== null ? String(v) : null
    }
    if (param === 'montoIndemnizado') {
      const v = this.extractIndemnizacionDe(message)
      return v !== null ? String(v) : null
    }
    if (param === 'motivoRechazo') {
      return this.extractMotivoRechazoDe(message)
    }
    // ─── Módulo Facturación (Décimo entrenamiento) ───
    if (param === 'factura' || param === 'invoiceId' || param === 'numeroFactura') {
      return this.extractNumeroFacturaDe(message)
    }
    if (param === 'razon' || param === 'motivo') {
      return this.extractMotivoFacturaDe(message)
    }
    // ─── Módulo Logística (Undécimo entrenamiento) ───
    if (param === 'tracking' || param === 'trackingNumber') {
      return this.extractTrackingDe(message)
    }
    if (param === 'pedidoId' || param === 'orderRef') {
      return this.extractPedidoRefDe(message)
    }
    if (param === 'vehiculoId' || param === 'vehicleId') {
      return this.extractVehiculoRefDe(message)
    }
    if (param === 'almacenId' || param === 'warehouseId') {
      return this.extractAlmacenRefDe(message)
    }
    // ─── Módulo RRHH (Duodécimo entrenamiento) ───
    if (param === 'solicitudId' || param === 'vacationRequestId') {
      const ref = this.extractSolicitudIdDe(message)
      if (ref) return ref
      // Si responde con el nombre del empleado ("la de María") en vez del nº,
      // el wrapper lo resuelve a su solicitud pendiente.
      return this.extractNombreAfter(message, /\b(?:de|del|empleado|colaborador)\s+/i)
    }
    if (param === 'nota' || param === 'note') {
      return this.extractNotaDe(message)
    }
    if (param === 'empleadoId' || param === 'employeeId') {
      return this.extractNombreAfter(message, /\b(?:empleado|colaborador|de|del)\s+/i)
    }
    // ─── Módulo ERP Industrial (Décimo sexto entrenamiento) ───
    if (param === 'productoId' || param === 'productId') {
      return this.extractProductoDe(message) || this.extractProductoWebDe(message) || (message.trim().length >= 2 ? message.trim() : null)
    }
    if (param === 'ordenProduccionId' || param === 'workOrderId') {
      return this.extractOrdenProduccionDe(message) || (message.trim().length >= 2 ? message.trim() : null)
    }
    if (param === 'resultado' || param === 'status') {
      return this.extractResultadoQcDe(message)
    }
    if (param === 'proyectoId' || param === 'projectId' || param === 'proyecto') {
      return this.extractProyectoDe(message) || (message.trim().length >= 2 ? message.trim() : null)
    }
    if (param === 'cantidad') {
      const v = this.extractCantidadStockDe(message)
      return v !== null ? String(v) : null
    }
    if (param === 'lote') {
      const m = message.match(/\b#?L-?\d{1,6}\b/i)
      return m ? m[0].replace(/^#/, '') : null
    }
    // ─── Módulo Marketing/Ads (Decimotercer entrenamiento) ───
    if (param === 'tema' || param === 'topic') {
      return this.extractTemaDe(message)
    }
    if (param === 'formato' || param === 'platform') {
      return this.extractFormatoDe(message)
    }
    if (param === 'tono' || param === 'tone') {
      return this.extractTonoDe(message)
    }
    if (param === 'texto' || param === 'text') {
      return this.extractTextoDe(message)
    }
    if (param === 'tipoBloque' || param === 'category') {
      return this.extractTipoBloqueDe(message)
    }
    if (param === 'tituloPagina' || param === 'pageTitle') {
      return this.extractTituloPaginaDe(message)
    }
    if (param === 'producto' || param === 'description') {
      return this.extractProductoWebDe(message)
    }
    if (param === 'campania' || param === 'campaignId' || param === 'campaign') {
      return this.extractCampaniaDe(message)
    }
    if (param === 'test' || param === 'testId') {
      return this.extractTestAbDe(message)
    }
    if (param === 'programacion' || param === 'scheduleId') {
      return this.extractProgramacionDe(message)
    }
    if (param === 'variante' || param === 'variantId') {
      return this.extractVarianteDe(message)
    }
    if (param === 'dias' || param === 'daysOfWeek') {
      const dias = this.extractDiasSemanaDe(message)
      return dias ? dias.join(',') : null
    }
    // ─── Módulo Real Estate (Decimocuarto entrenamiento) ───
    if (param === 'propiedad' || param === 'propiedadId' || param === 'propertyId') {
      return this.extractPropiedadDe(message)
    }
    if (param === 'tipo_operacion' || param === 'operationType') {
      return /\b(?:alquiler|rentar|arrendar|renta|alquilar)\b/i.test(message) ? 'alquiler' : (/\b(?:venta|vender|comprar)\b/i.test(message) ? 'venta' : null)
    }
    if (param === 'tipo_inmueble' || param === 'propertyType') {
      return this.extractTipoInmuebleDe(message)
    }
    if (param === 'zona' || param === 'ciudad' || param === 'city') {
      return this.extractZonaDe(message)
    }
    if (param === 'habitaciones' || param === 'bedrooms') {
      return this.extractHabitacionesDe(message)
    }
    if (param === 'presupuesto' || param === 'precioMax' || param === 'budget') {
      return this.extractPresupuestoDe(message)
    }
    return null
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