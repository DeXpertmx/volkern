import { prisma } from '@/lib/db';

export interface FormattedResponse {
  text: string;
  emoji: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'confirmation';
  markdown?: string;
  quickReplies?: string[];
  metadata?: Record<string, any>;
}

export interface FormatParams {
  intent: string;
  action: 'execute' | 'ask_clarification' | 'fallback_to_human' | 'reject' | 'confirmation_pending';
  success: boolean;
  data?: any;
  error?: string;
  missingParams?: string[];
  confirmationId?: string;
  entityType?: string;
}

export class ResponseFormatterAgent {
  private readonly intentEmojis: Record<string, string> = {
    'crear_lead': '👤', 'buscar_lead': '🔍', 'actualizar_lead': '✏️', 'convertir_lead': '⭐',
    'obtener_telefono': '📱', 'registrar_interaccion': '📝', 'diagnosticos_lead': '🩺',
    'agendar_cita': '📅', 'mis_citas': '📋', 'cancelar_cita': '❌', 'confirmar_cita': '✅',
    'auto_agendar': '🤖',
    'crear_tarea': '✅', 'completar_tarea': '✔️', 'mis_tareas': '📋',
    'crear_nota': '📝', 'ver_notas': '📓',
    'crear_conversacion': '💬', 'cerrar_conversacion': '🔒',
    'enviar_mensaje': '💬', 'enviar_mensaje_interno': '📢',
    'crear_negocio': '💼', 'actualizar_negocio': '📊', 'mis_negocios': '📈', 'calificar_lead': '🎯',
    'crear_factura': '🧾', 'estado_fiscal': '🔎', 'cancelar_factura': '🚫', 'rectificar_factura': '🔄',
    'registrar_gasto': '💰', 'crear_proveedor': '🏢', 'analizar_gastos': '📊', 'proyeccion_financiera': '🔮',
    'salud_inventario': '📦', 'ajustar_stock': '📤', 'buscar_producto': '🔎', 'gestionar_catalogo': '📋',
    'generar_copy': '✍️', 'analizar_sentimiento': '📊', 'sugerir_campania': '📣',
    'resumen_rrhh': '👥', 'aprobar_vacaciones': '🏖️', 'riesgo_rotacion': '⚠️',
    'rentabilidad_proyecto': '📊', 'desviaciones_proyecto': '🚨',
    'auditar_integridad': '🔍', 'analizar_rentabilidad_global': '📈',
    'calcular_costo_produccion': '🏭', 'detectar_anomalias_calidad': '🔬',
    'consulta_general': '🤖'
  };

  private readonly templates: Record<string, Record<string, (params: any) => string>> = {
    'crear_lead': {
      execute: (data) => `He creado el contacto ${data?.nombre || 'nuevo'} con email ${data?.email || 'registrado'}. ¿Necesitas algo más?`,
      error: (error) => `No pude crear el contacto: ${error}. ¿Quieres intentarlo de nuevo?`,
      ask_clarification: (params) => `Para crear un contacto, necesito saber ${params.missingParams?.join(' y ') || 'nombre y email'}.`
    },
    'actualizar_lead': {
      execute: (data) => `¡Listo! He actualizado la información de ${data?.nombre || 'contacto'}. ¿Necesitas algo más?`,
      error: (error) => `No pude actualizar el contacto: ${error}. ¿Quieres intentarlo de nuevo?`,
      ask_clarification: (params) => `Para actualizar un contacto, necesito saber su nombre o email.`
    },
    'agendar_cita': {
      execute: (data) => `✅ Cita agendada para ${data?.fechaHora ? new Date(data.fechaHora).toLocaleString() : 'la fecha indicada'}.`,
      error: (error) => `No pude agendar la cita: ${error}.`,
      ask_clarification: (params) => `Para agendar una cita, necesito saber con quién, la fecha y la hora.`
    },
    'mis_citas': {
      execute: (data) => this.formatCitasList(data),
      error: () => 'No pude recuperar tus citas.',
      empty: () => 'No tienes citas programadas.'
    },
    'cancelar_cita': {
      confirmation_pending: () => `⚠️ ¿Seguro que quieres cancelar esta cita? Responde "SÍ" para confirmar.`,
      execute: (data) => `He cancelado la cita correctamente.`,
      error: (error) => `No pude cancelar: ${error}.`
    },
    'crear_tarea': {
      execute: (data) => `✅ Tarea creada: "${data?.titulo || 'sin título'}"${data?.fechaVencimiento ? `, vence ${new Date(data.fechaVencimiento).toLocaleDateString()}` : ''}.`,
      error: (error) => `No pude crear la tarea: ${error}.`,
      ask_clarification: () => `Necesito el título de la tarea para poder agendarla.`
    },
    'registrar_gasto': {
      execute: (data) => `💰 Gasto registrado: ${data?.concepto || 'Sin concepto'} por ${data?.monto || '0'}€.`,
      error: (error) => `No pude registrar el gasto: ${error}.`,
      ask_clarification: () => `Necesito saber el monto y el concepto del gasto.`
    },
    'buscar_lead': {
      execute: (data) => this.formatLeadsList(data),
      error: (error) => `No pude buscar los contactos: ${error}.`,
      ask_clarification: () => `¿A quién buscas? Dame un nombre o email.`
    },
    'registrar_interaccion': {
      execute: (data) => `¡Listo! He registrado la ${data?.tipo || 'interacción'} con ${data?.lead?.nombre || data?.contact?.nombre || 'el contacto'}.`,
      error: (error) => `Vaya, tuve un problema al registrar la interacción: ${error}`,
      ask_clarification: (params) => {
        if (params.missingParams?.includes('tipo')) return 'Claro, ¿qué tipo de interacción fue? (Llamada, Email, WhatsApp, etc.)';
        if (params.missingParams?.includes('contenido')) return 'Entendido, ¿qué fue lo más importante de la interacción? (Un breve resumen)';
        return 'Ayúdame con el tipo y resumen de la interacción para guardarla correctamente.';
      }
    },
    'obtener_telefono': {
      execute: (data) => `Claro, el teléfono de ${data?.nombre} es: ${data?.telefono}`,
      error: (error) => `Lo siento, no pude encontrar ese teléfono: ${error}`,
      ask_clarification: () => '¿De quién quieres que busque el teléfono? Dime su nombre completo.'
    },
    'convertir_lead': {
      execute: (data) => `⭐ ¡Lead convertido a contacto! ${data?.nombre || ''} ahora es un contacto formal.`,
      error: (error) => `No pude convertir el lead: ${error}.`
    },
    'diagnosticos_lead': {
      execute: (data) => data?.diagnosis ? `🩺 Diagnósticos encontrados: ${data.diagnosis.length} registros.` : `✅ Diagnóstico completado correctamente.`,
      error: (error) => `Error con diagnósticos: ${error}.`
    },
    'confirmar_cita': {
      execute: () => `✅ Cita confirmada correctamente.`,
      error: (error) => `No pude confirmar la cita: ${error}.`
    },
    'auto_agendar': {
      execute: (data) => `🤖 Cita agendada automáticamente para ${data?.cita?.fechaHora ? new Date(data.cita.fechaHora).toLocaleString() : 'la fecha disponible'}. Notificación enviada.`,
      error: (error) => `No pude agendar automáticamente: ${error}.`
    },
    'completar_tarea': {
      execute: () => `✔️ Tarea marcada como completada.`,
      error: (error) => `No pude completar la tarea: ${error}.`
    },
    'mis_tareas': {
      execute: (data) => this.formatTasksList(data),
      error: () => 'No pude recuperar tus tareas.',
      empty: () => 'No tienes tareas pendientes.'
    },
    'crear_nota': {
      execute: () => `📝 Nota agregada correctamente.`,
      error: (error) => `No pude agregar la nota: ${error}.`
    },
    'ver_notas': {
      execute: (data) => this.formatNotesList(data),
      error: () => 'No pude recuperar las notas.',
      empty: () => 'No hay notas para este contacto.'
    },
    'crear_conversacion': {
      execute: (data) => `💬 Conversación iniciada con ${data?.contactoNombre || 'el contacto'}.`,
      error: (error) => `No pude crear la conversación: ${error}.`
    },
    'cerrar_conversacion': {
      execute: () => `🔒 Conversación cerrada correctamente.`,
      error: (error) => `No pude cerrar la conversación: ${error}.`
    },
    'crear_negocio': {
      execute: (data) => `💼 Nuevo deal creado: "${data?.titulo || 'sin título'}"${data?.monto ? ` por ${data.monto}€` : ''}.`,
      error: (error) => `No pude crear el deal: ${error}.`,
      ask_clarification: () => `Para crear un deal necesito el email del lead y el título del negocio.`
    },
    'actualizar_negocio': {
      execute: () => `📊 Deal actualizado correctamente.`,
      error: (error) => `No pude actualizar el deal: ${error}.`
    },
    'mis_negocios': {
      execute: (data) => this.formatDealsList(data),
      error: () => 'No pude recuperar los deals.',
      empty: () => 'No hay deals en el pipeline.'
    },
    'calificar_lead': {
      execute: (data) => `🎯 Lead calificado: ${data?.message || 'proceso completado'}.`,
      error: (error) => `No pude calificar el lead: ${error}.`
    },
    'crear_factura': {
      execute: (data) => `🧾 Factura generada: ${data?.invoice?.sequenceNumber || data?.sequenceNumber || '#'} con sello Veri*factu.`,
      error: (error) => `No pude generar la factura: ${error}.`
    },
    'estado_fiscal': {
      execute: (data) => {
        const inv = data?.invoice || data;
        return `🔎 Estado fiscal de ${inv?.sequenceNumber || 'la factura'}: ${inv?.signature ? '✅ Válida (Veri*factu)' : '❌ Sin sello'}.`;
      },
      error: (error) => `No pude consultar el estado: ${error}.`
    },
    'cancelar_factura': {
      confirmation_pending: () => `⚠️ ¿Seguro que quieres cancelar esta factura? Esta acción es irreversible. Responde "SÍ" para confirmar.`,
      execute: () => `🚫 Factura cancelada correctamente.`,
      error: (error) => `No pude cancelar la factura: ${error}.`
    },
    'rectificar_factura': {
      confirmation_pending: () => `⚠️ ¿Seguro que quieres rectificar esta factura? Responde "SÍ" para confirmar.`,
      execute: (data) => `🔄 Factura rectificada correctamente. Nueva versión: ${data?.sequenceNumber || '#'}.`,
      error: (error) => `No pude rectificar la factura: ${error}.`
    },
    'crear_proveedor': {
      execute: (data) => `🏢 Proveedor ${data?.nombre || 'registrado'} creado correctamente.`,
      error: (error) => `No pude crear el proveedor: ${error}.`
    },
    'analizar_gastos': {
      execute: (data) => this.formatBurnRate(data),
      error: () => 'No pude analizar los gastos.',
      empty: () => 'No hay datos de gastos para analizar.'
    },
    'proyeccion_financiera': {
      execute: (data) => {
        if (!data || Object.keys(data).length === 0) return '🔮 No hay suficientes datos para una proyección.';
        return `🔮 Proyección financiera:\n${data?.summary || JSON.stringify(data, null, 2).substring(0, 500)}`;
      },
      error: () => 'No pude generar la proyección.'
    },
    'salud_inventario': {
      execute: (data) => this.formatInventoryHealth(data),
      error: () => 'No pude consultar el inventario.',
      empty: () => 'Inventario sin datos o sin productos.'
    },
    'ajustar_stock': {
      execute: () => `📤 Stock ajustado correctamente.`,
      error: (error) => `No pude ajustar el stock: ${error}.`
    },
    'buscar_producto': {
      execute: (data) => this.formatCatalogSearch(data),
      error: () => 'No pude buscar productos.',
      empty: () => 'No se encontraron productos.'
    },
    'gestionar_catalogo': {
      execute: (data) => {
        if (data?.items) return `📋 Catálogo: ${data.items.length} ítems encontrados.`;
        if (data?.fields) return `📋 Definiciones del catálogo: ${data.fields.length} campos.`;
        return '📋 Operación de catálogo completada.';
      },
      error: (error) => `Error con el catálogo: ${error}.`
    },
    'generar_copy': {
      execute: (data) => `✍️ Copy generado:\n\n${data?.text || data?.copy || 'Texto generado por IA.'}`,
      error: (error) => `No pude generar el copy: ${error}.`
    },
    'analizar_sentimiento': {
      execute: (data) => `📊 Análisis de sentimiento:\n${data?.summary || JSON.stringify(data, null, 2).substring(0, 500)}`,
      error: () => 'No pude analizar el sentimiento.'
    },
    'sugerir_campania': {
      execute: (data) => `📣 Sugerencias de campaña:\n${data?.suggestions || data?.advice || JSON.stringify(data, null, 2).substring(0, 500)}`,
      error: () => 'No pude generar sugerencias.'
    },
    'resumen_rrhh': {
      execute: (data) => {
        const brief = data?.brief || data;
        return `👥 *Resumen RRHH:*\n${typeof brief === 'string' ? brief : JSON.stringify(brief, null, 2).substring(0, 1000)}`;
      },
      error: () => 'No pude obtener el resumen de RRHH.'
    },
    'aprobar_vacaciones': {
      confirmation_pending: () => `⚠️ ¿Seguro que quieres aprobar esta solicitud de vacaciones? Responde "SÍ" para confirmar.`,
      execute: () => `🏖️ Vacaciones aprobadas correctamente.`,
      error: (error) => `No pude aprobar las vacaciones: ${error}.`
    },
    'riesgo_rotacion': {
      execute: (data) => `⚠️ Análisis de rotación:\n${data?.summary || JSON.stringify(data, null, 2).substring(0, 500)}`,
      error: () => 'No pude analizar el riesgo de rotación.'
    },
    'rentabilidad_proyecto': {
      execute: (data) => `📊 Rentabilidad del proyecto:\n${data?.summary || JSON.stringify(data, null, 2).substring(0, 500)}`,
      error: () => 'No pude calcular la rentabilidad.'
    },
    'desviaciones_proyecto': {
      execute: (data) => `🚨 Desviaciones detectadas:\n${data?.summary || JSON.stringify(data, null, 2).substring(0, 500)}`,
      error: () => 'No pude detectar desviaciones.',
      empty: () => '✅ No se detectaron desviaciones en los proyectos.'
    },
    'auditar_integridad': {
      execute: (data) => `🔍 Auditoría de integridad:\n${data?.summary || JSON.stringify(data, null, 2).substring(0, 500)}`,
      error: () => 'No pude completar la auditoría.'
    },
    'analizar_rentabilidad_global': {
      execute: (data) => {
        const report = data?.report || data;
        return `📈 *Rentabilidad Global:*\n${typeof report === 'string' ? report : JSON.stringify(report, null, 2).substring(0, 1000)}`;
      },
      error: () => 'No pude analizar la rentabilidad global.'
    },
    'calcular_costo_produccion': {
      execute: (data) => `🏭 Costo de producción:\n${data?.summary || JSON.stringify(data, null, 2).substring(0, 500)}`,
      error: () => 'No pude calcular el costo de producción.'
    },
    'detectar_anomalias_calidad': {
      execute: (data) => `🔬 Anomalías de calidad:\n${data?.summary || JSON.stringify(data, null, 2).substring(0, 500)}`,
      error: () => 'No pude detectar anomalías.',
      empty: () => '✅ No se detectaron anomalías de calidad.'
    },
    'consulta_general': {
      success: () => '🤖 *Asistente Volkern*\n\nEstos son los módulos que puedes usar por chat o voz:\n\n👤 *Contactos* — crear, buscar, actualizar leads\n📅 *Citas* — agendar, consultar, cancelar\n✅ *Tareas* — crear, completar, consultar\n💬 *Mensajes* — enviar a leads o al equipo\n💼 *Deals* — pipeline, oportunidades, calificar\n🧾 *Facturación* — facturas Veri*factu\n💰 *Gastos* — registrar, proveedores, análisis\n📦 *Inventario* — stock, catálogo, productos\n✍️ *Marketing* — copy, sentimiento, campañas\n👥 *RRHH* — resumen diario, vacaciones\n📊 *Proyectos* — rentabilidad, desviaciones\n🏭 *Producción* — costos, calidad\n\n¿En qué módulo quieres trabajar?',
      ask_clarification: () => 'Dime qué necesitas hacer. Por ejemplo: "Registra una llamada con Juan", "Mis citas de hoy", "Crea una factura" o "Cómo está el inventario?".',
      fallback_to_human: () => 'Parece que esto es algo complejo para mí por ahora. Te pondré en contacto con un agente humano enseguida. 👨‍💻',
      reject: () => 'No estoy del todo seguro de lo que necesitas. ¿Podrías explicármelo de otra forma? 😊'
    },
    'common': {
      rate_limited: () => '⏳ Demasiadas solicitudes. Espera un momento.',
      internal_error: () => 'Error interno. Por favor, intenta más tarde.',
      not_authorized: () => 'No tienes permisos para esta acción.'
    }
  };

  async format(params: FormatParams): Promise<FormattedResponse> {
    const { intent, action, success, data, error, missingParams, confirmationId } = params;

    if (intent === 'rate_limited') return this.formatRateLimited();

    const intentTemplates = this.templates[intent] || this.templates['consulta_general'];
    let template = intentTemplates[action];

    if (!template) template = this.getGenericTemplate(action, success);

    let text = '';
    try {
      text = typeof template === 'function' ? template({ data, error, missingParams, confirmationId }) : template || this.getDefaultResponse(action, success);
    } catch (err) {
      text = this.getDefaultResponse(action, success);
    }

    const responseType = this.getResponseType(action, success);
    const quickReplies = this.getQuickReplies(intent, action, success);
    const emoji = this.intentEmojis[intent] || this.getEmojiByType(responseType);

    return { text, emoji, type: responseType, quickReplies, metadata: { intent, action, success, ...(confirmationId && { confirmationId }) } };
  }

  private formatCitasList(data: any): string {
    if (!data?.citas || data.citas.length === 0) return 'No tienes citas programadas.';
    const citas = data.citas.slice(0, 5);
    const timezone = data.timezone || 'America/Mexico_City';
    const total = data.citas.length;
    let response = `📋 ${total} cita${total > 1 ? 's' : ''} encontrada${total > 1 ? 's' : ''}:\n\n`;
    citas.forEach((cita: any, i: number) => {
      const fechaLocal = cita.fechaHoraLocal || cita.fechaHora;
      const fechaStr = fechaLocal
        ? new Date(fechaLocal).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone })
        : 'Pendiente';
      const horaStr = fechaLocal
        ? new Date(fechaLocal).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
        : '--:--';
      const nombre = cita.lead?.nombre || cita.nombre || 'Sin nombre';
      const estado = cita.estado === 'confirmada' ? '✅' : cita.estado === 'pendiente' ? '⏳' : '❓';
      response += `${i + 1}. ${estado} ${fechaStr} ${horaStr}\n   ${nombre}${cita.titulo ? ` — ${cita.titulo}` : ''}\n`;
    });
    if (total > 5) response += `\nY ${total - 5} más...`;
    return response;
  }

  private formatLeadsList(data: any): string {
    if (!data?.leads || data.leads.length === 0) return 'No se encontraron contactos.';
    const leads = data.leads.slice(0, 5);
    let response = `🔍 He encontrado ${data.count || data.leads.length} contactos:\n\n`;
    leads.forEach((lead: any, i: number) => {
      response += `${i + 1}. *${lead.name || 'Sin nombre'}*\n`;
      if (lead.email) response += `   📧 ${lead.email}\n`;
      if (lead.phone) response += `   📱 ${lead.phone}\n`;
      if (lead.stage) response += `   📊 Estado: ${lead.stage}\n`;
      response += '\n';
    });
    if (data.leads.length > 5) response += `...y ${data.leads.length - 5} más.`;
    return response;
  }

  private formatTasksList(data: any): string {
    if (!data?.tasks && !data?.length) return 'No tienes tareas pendientes.';
    const tasks = data.tasks || data;
    if (tasks.length === 0) return 'No tienes tareas pendientes.';
    const slice = tasks.slice(0, 5);
    let response = `📋 ${tasks.length} tarea${tasks.length > 1 ? 's' : ''}:\n\n`;
    slice.forEach((t: any, i: number) => {
      response += `${i + 1}. ${t.titulo || t.title || 'Sin título'}`;
      if (t.fechaVencimiento || t.dueDate) response += ` (vence: ${new Date(t.fechaVencimiento || t.dueDate).toLocaleDateString()})`;
      if (t.lead?.nombre) response += ` — ${t.lead.nombre}`;
      response += '\n';
    });
    if (tasks.length > 5) response += `\nY ${tasks.length - 5} más...`;
    return response;
  }

  private formatNotesList(data: any): string {
    if (!data?.notes && !data?.length) return 'No hay notas para este contacto.';
    const notes = data.notes || data;
    if (notes.length === 0) return 'No hay notas.';
    const slice = notes.slice(0, 5);
    let response = `📓 ${notes.length} nota${notes.length > 1 ? 's' : ''}:\n\n`;
    slice.forEach((n: any, i: number) => {
      response += `${i + 1}. ${n.contenido || n.content || n.text || 'Sin contenido'}\n`;
      if (n.createdAt) response += `   🕐 ${new Date(n.createdAt).toLocaleDateString()}\n`;
      response += '\n';
    });
    return response;
  }

  private formatDealsList(data: any): string {
    if (!data?.deals && !data?.length) return 'No hay deals en el pipeline.';
    const deals = data.deals || data;
    if (deals.length === 0) return 'No hay deals.';
    const slice = deals.slice(0, 5);
    let response = `📈 Pipeline — ${deals.length} deal${deals.length > 1 ? 's' : ''}:\n\n`;
    slice.forEach((d: any, i: number) => {
      response += `${i + 1}. *${d.titulo || d.title || 'Sin título'}*`;
      if (d.monto || d.amount) response += ` — ${d.monto || d.amount}€`;
      if (d.etapa || d.stage) response += `\n   📊 Etapa: ${d.etapa || d.stage}`;
      if (d.prioridad || d.priority) response += ` | Prioridad: ${d.prioridad || d.priority}`;
      if (d.lead?.nombre) response += `\n   👤 ${d.lead.nombre}`;
      response += '\n';
    });
    if (deals.length > 5) response += `\nY ${deals.length - 5} más...`;
    return response;
  }

  private formatBurnRate(data: any): string {
    if (!data || Object.keys(data).length === 0) return 'No hay datos de gastos.';
    const rate = data.burnRate || data.rate || data;
    let response = '💰 *Análisis de Gastos:*\n';
    if (rate.totalExpenses || rate.total) response += `Total gastos: ${rate.totalExpenses || rate.total}€\n`;
    if (rate.burnRate) response += `Burn rate: ${rate.burnRate}€/mes\n`;
    if (rate.monthlyAverage) response += `Promedio mensual: ${rate.monthlyAverage}€\n`;
    if (rate.incomeVsExpenses) response += `Relación ingresos/gastos: ${rate.incomeVsExpenses}\n`;
    if (rate.summary) response += `\n${rate.summary}`;
    return response || JSON.stringify(data, null, 2).substring(0, 500);
  }

  private formatInventoryHealth(data: any): string {
    if (!data || Object.keys(data).length === 0) return 'No hay datos de inventario.';
    const health = data.health || data;
    let response = '📦 *Salud del Inventario:*\n';
    if (health.totalItems || health.total) response += `Total productos: ${health.totalItems || health.total}\n`;
    if (health.lowStock) response += `⚠️ Stock bajo: ${health.lowStock} producto${health.lowStock > 1 ? 's' : ''}\n`;
    if (health.outOfStock) response += `❌ Agotados: ${health.outOfStock}\n`;
    if (health.overStock) response += `📦 Exceso: ${health.overStock}\n`;
    if (health.breakRisk) response += `🚨 Riesgo de ruptura: ${health.breakRisk}\n`;
    if (health.items?.length) {
      response += '\nProductos con riesgo:\n';
      health.items.slice(0, 5).forEach((item: any, i: number) => {
        response += `${i + 1}. ${item.nombre || item.name || 'Producto'} — stock: ${item.stock || item.cantidad || 0}\n`;
      });
    }
    if (health.summary) response += `\n${health.summary}`;
    return response || JSON.stringify(data, null, 2).substring(0, 500);
  }

  private formatCatalogSearch(data: any): string {
    if (!data?.items && !data?.length) return 'No se encontraron productos.';
    const items = data.items || data;
    if (items.length === 0) return 'No se encontraron productos.';
    const slice = items.slice(0, 5);
    let response = `🔎 ${items.length} producto${items.length > 1 ? 's' : ''} encontrado${items.length > 1 ? 's' : ''}:\n\n`;
    slice.forEach((item: any, i: number) => {
      response += `${i + 1}. *${item.nombre || item.name || 'Sin nombre'}*`;
      if (item.precio || item.price) response += ` — ${item.precio || item.price}€`;
      if (item.stock || item.cantidad !== undefined) response += ` | Stock: ${item.stock ?? item.cantidad}`;
      if (item.categoria || item.category) response += `\n   📂 ${item.categoria || item.category}`;
      response += '\n';
    });
    if (items.length > 5) response += `\nY ${items.length - 5} más...`;
    return response;
  }

  private getGenericTemplate(action: string, success: boolean): (params: any) => string {
    if ((action === 'success' || action === 'execute') && success) return () => '✅ ¡Hecho! ¿Necesitas algo más?';
    if (action === 'error') return (p) => `❌ ${p.error || 'Hubo un problema.'}`;
    if (action === 'ask_clarification') return (p) => `Necesito ${p.missingParams?.join(', ') || 'más información'}.`;
    return () => 'Procesando...';
  }

  private getDefaultResponse(action: string, success: boolean): string {
    const defaults: Record<string, string> = { 'success_execute': '✅ Completado.', 'error_execute': '❌ Error.', 'ask_clarification': '¿Más información?', 'fallback_to_human': 'Te atiende un agente.', 'reject': 'No entendí.' };
    return defaults[`${action}_${success ? 'success' : 'error'}`] || 'Procesando...';
  }

  private getResponseType(action: string, success: boolean): FormattedResponse['type'] {
    if (action === 'success') return success ? 'success' : 'error';
    if (action === 'error') return 'error';
    if (action === 'confirmation_pending') return 'warning';
    if (action === 'fallback_to_human' || action === 'ask_clarification') return 'info';
    if (action === 'reject') return 'warning';
    return 'info';
  }

  private getEmojiByType(type: FormattedResponse['type']): string {
    const emojis: Record<string, string> = { 'success': '✅', 'error': '❌', 'info': 'ℹ️', 'warning': '⚠️', 'confirmation': '🤔' };
    return emojis[type] || '🤖';
  }

  private getQuickReplies(intent: string, action: string, success: boolean): string[] | undefined {
    if (action === 'confirmation_pending') return ['SÍ', 'NO'];
    if (action === 'ask_clarification') {
      if (intent === 'mis_citas') return ['📅 Hoy', '📆 Esta semana'];
      if (intent === 'buscar_lead' || intent === 'actualizar_lead') return ['👤 Ver todos', '🔍 Buscar por email'];
      if (intent === 'crear_lead') return ['👤 Nuevo lead', '📋 Ver leads'];
      if (intent.includes('cita') || intent.includes('citas')) return ['📅 Hoy', '📅 Mañana', '📆 Esta semana'];
      if (intent.includes('tarea')) return ['✅ Pendientes', '➕ Nueva tarea'];
      if (intent.includes('gasto') || intent.includes('financi')) return ['💰 Registrar gasto', '📊 Ver análisis'];
      if (intent.includes('factura')) return ['🧾 Nueva factura', '🔎 Estado fiscal'];
      if (intent.includes('negocio') || intent.includes('deal')) return ['💼 Ver pipeline', '➕ Nuevo deal'];
      if (intent.includes('inventario') || intent.includes('producto')) return ['📦 Salud inventario', '🔎 Buscar producto'];
      if (intent.includes('proyecto')) return ['📊 Rentabilidad', '🚨 Desviaciones'];
      return ['🤖 Ayuda', '➕ Nueva acción'];
    }
    if (action === 'success' && success) {
      if (intent === 'crear_lead') return ['➕ Otro lead', '📅 Agendar cita', '📝 Registrar interacción'];
      if (intent === 'mis_citas') return ['📅 Hoy', '📆 Mañana', '➕ Nueva cita'];
      if (intent === 'crear_tarea') return ['➕ Otra tarea', '✅ Ver pendientes'];
      if (intent === 'mis_tareas') return ['✅ Completar tarea', '➕ Nueva tarea'];
      if (intent === 'mis_negocios') return ['➕ Nuevo deal', '📊 Ver pipeline'];
      if (intent === 'salud_inventario') return ['📤 Ajustar stock', '🔎 Buscar producto'];
      if (intent === 'buscar_lead') return ['👤 Crear lead', '🔍 Buscar otro'];
      if (intent === 'registrar_gasto') return ['💰 Otro gasto', '📊 Ver análisis'];
      if (intent === 'resumen_rrhh') return ['🏖️ Aprobar vacaciones', '⚠️ Riesgo rotación'];
      return ['✅ Ver más', '➕ Nueva acción'];
    }
    return undefined;
  }

  private formatRateLimited(): FormattedResponse {
    return { text: '⏳ Demasiados mensajes. Espera un momento.', emoji: '⏳', type: 'warning' };
  }

  async formatAndLog(params: FormatParams & { userId: string; tenantId: string }): Promise<FormattedResponse> {
    const response = await this.format(params);
    try {
      await prisma.chatbotAuditLog.create({
        data: { event: 'response_formatted', userId: params.userId, tenantId: params.tenantId, intent: params.intent, metadata: { action: params.action, success: params.success, responseType: response.type }, severity: params.success ? 'info' : 'warning' }
      });
    } catch (e) { console.error('Error logging response:', e); }
    return response;
  }
}

export const responseFormatter = new ResponseFormatterAgent();