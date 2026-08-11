/**
 * Execution Engine - Motor de ejecución de skills
 * 
 * Ejecuta planes de ejecución con soporte para:
 * - Multi-step execution
 * - Control de flujo (break)
 * - Timeouts por skill
 * - Retry automático
 * - Auditoría
 */

import { SkillRegistry, SkillOutput } from './skill-registry';
import { ChatbotAuditLogger } from './audit-logger';

export interface ExecutionStep {
  action: string;
  params?: Record<string, any>;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
}

export interface ExecutionInput {
  plan: ExecutionPlan;
  userId: string;
  tenantId: string;
  sessionId?: string;
}

export interface ExecutionOutput {
  message: string;
  skill?: string;
  data?: any;
  error?: boolean;
  executionTimeMs?: number;
}

const SKILL_TIMEOUT_MS = 10000; // 10 segundos por skill
const MAX_RETRIES = 1;

export const ExecutionEngine = {
  /**
   * Ejecuta un plan de steps
   */
  async run(input: ExecutionInput): Promise<ExecutionOutput> {
    const startTime = Date.now();
    const { plan, userId, tenantId, sessionId } = input;

    if (!plan.steps || plan.steps.length === 0) {
      return {
        message: 'No se pudo completar la acción.',
        error: true
      };
    }

    const results: Array<{ action: string; output: SkillOutput }> = [];

    for (const step of plan.steps) {
      try {
        // 1. Obtener skill del registry
        let skill = SkillRegistry.get(step.action);

        // 2. Si es "ask_user" (special skill), handled differently
        if (step.action === 'ask_user') {
          const message = step.params?.message || '¿Podrías darme más información?';
          results.push({
            action: step.action,
            output: {
              message,
              break: true // Detiene el flujo
            }
          });
          break; // Salir del loop
        }

        // 3. Si no existe local, intentar ejecutar como skill de Volkern
        if (!skill) {
          const { skills } = await import('@/lib/skills');
          const volkernSkill = skills[step.action as keyof typeof skills];
          
          if (volkernSkill) {
            skill = {
              execute: async (params: any) => {
                try {
                  const result = await volkernSkill(params);
                  return { message: 'OK', data: result };
                } catch (error: any) {
                  // Propagar el mensaje real del skill (ej. "Ya existe un contacto con el email X")
                  return { message: error.message || 'Error', error: error.message };
                }
              }
            };
          }
        }

        if (!skill) {
          throw new Error(`Skill no encontrado: ${step.action}`);
        }

        // 3. Inyectar contexto seguro
        const safeParams = {
          ...step.params,
          userId,
          tenantId,
          sessionId
        };

        // 4. Ejecutar con timeout
        const output = await this.executeWithTimeout(skill.execute, safeParams);

        // 5. Guardar resultado
        results.push({
          action: step.action,
          output
        });

        // 6. Control de flujo: break si el skill lo indica
        if (output?.break === true) {
          console.log(`[ExecutionEngine] Break triggered by ${step.action}`);
          break;
        }

        // 7. Si hay error en el output, romper
        if (output?.error) {
          throw new Error(output.message || 'Error en skill');
        }

      } catch (error: any) {
        console.error(`[ExecutionEngine] Step error [${step.action}]:`, error.message);

        // Log de error
        await ChatbotAuditLogger.log({
          tenantId,
          userId,
          sessionId: sessionId || undefined,
          skillExecuted: step.action,
          skillParams: step.params,
          status: 'ERROR',
          errorMessage: error.message
        });

        // Mostrar el mensaje real del error cuando sea informativo.
        // Comparación case-insensitive + patrones amplios para cubrir los
        // mensajes en español de todos los skills (incl. insurance: "No encontré
        // el cliente...", "...es requerida", "No se pudo identificar...").
        const rawMessage = error.message || '';
        const raw = rawMessage.toLowerCase();
        const meaningfulError =
          raw.includes('no encontr') ||
          raw.includes('no se encontr') ||
          raw.includes('requerid') ||
          raw.includes('ya existe') ||
          raw.includes('no se pudo') ||
          raw.includes('no fue posible') ||
          raw.includes('no es válido') ||
          raw.includes('no parece') ||
          // Citas: pedir el email que falta (multi-turno) y desambiguar
          // cuando hay varias citas del mismo contacto.
          raw.includes('email_required') ||
          raw.includes('no tengo el email') ||
          raw.includes('varias citas') ||
          raw.includes('no hay disponibilidad');

        // Solo el error de skill inexistente ("Skill no encontrado: X") muestra
        // "Acción no disponible". El resto de mensajes "no encontré..."
        // (ej. cliente/aseguradora de insurance) deben mostrar el texto real.
        // El prefijo EMAIL_REQUIRED: lo consume la ruta /api/ai/chat (guarda
        // contexto multi-turno); aquí solo se limpia para no filtrarse al usuario.
        const cleanMessage = rawMessage.replace(/^EMAIL_REQUIRED:\s*/i, '');
        return {
          message: raw.includes('skill no encontr')
            ? `❌ Acción no disponible: ${step.action}`
            : meaningfulError
              ? `❌ ${cleanMessage}`
              : '⚠️ Error ejecutando la operación.',
          skill: step.action,
          error: true,
          executionTimeMs: Date.now() - startTime
        };
      }
    }

    // 8. Construir respuesta final
    const response = this.buildResponse(results);
    response.executionTimeMs = Date.now() - startTime;

    // 9. Loggear éxito
    if (results.length > 0) {
      await ChatbotAuditLogger.log({
        tenantId,
        userId,
        sessionId: sessionId || undefined,
        skillExecuted: results[results.length - 1].action,
        skillResult: results[results.length - 1].output?.data,
        status: 'SUCCESS',
        executionTimeMs: response.executionTimeMs
      });
    }

    return response;
  },

  /**
   * Ejecuta una función con timeout
   */
  async executeWithTimeout(
    fn: (params: any) => Promise<SkillOutput>,
    params: any
  ): Promise<SkillOutput> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SKILL_TIMEOUT_MS);

        const result = await Promise.race([
          fn(params),
          new Promise<SkillOutput>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), SKILL_TIMEOUT_MS)
          )
        ]);

        clearTimeout(timeoutId);
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // No reintentar en timeout
        if (lastError.message === 'Timeout') {
          break;
        }
      }
    }

    return {
      message: 'Error en ejecución',
      error: lastError?.message
    };
  },

  /**
   * Escapa caracteres especiales de Markdown de Telegram en valores interpolados
   * (evita que un nombre con * _ [ ] rompa el parseo del mensaje).
   */
  escapeMarkdown(value: string): string {
    return value.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  },

  /**
   * Formatea un mensaje amigable para skills de creación/actualización de CRM.
   * Retorna '' si el skill no tiene formateador (se usa la respuesta del skill).
   */
  formatSkillResult(skillName: string, data: any): string {
    if (!data) return '';
    const nombre = this.escapeMarkdown(String(data.nombre || data.name || data.titulo || ''));
    const email = data.email ? ` (${this.escapeMarkdown(String(data.email))})` : '';

    switch (skillName) {
      case 'create_lead':
        return `✅ *Lead creado:* ${nombre}${email}`;
      case 'create_contact':
        return `✅ *Contacto creado:* ${nombre}${email}`;
      case 'create_company':
        return `🏢 *Empresa creada:* ${nombre}${email}`;
      case 'update_lead':
        return `✏️ *Lead actualizado:* ${nombre}${email}`;
      case 'update_contact':
        return `✏️ *Contacto actualizado:* ${nombre}${email}`;
      case 'convert_lead':
        return '🔄 *Lead convertido a contacto* correctamente.';

      // ─── Ventas: búsqueda y listados (muestran los datos reales) ───
      case 'find_lead_by_email': {
        const nombre = this.escapeMarkdown(String(data?.nombre || ''));
        const email = this.escapeMarkdown(String(data?.email || ''));
        const tel = data?.telefono ? `\n📱 Teléfono: ${this.escapeMarkdown(String(data.telefono))}` : '';
        const emp = data?.empresa ? `\n🏢 Empresa: ${this.escapeMarkdown(String(data.empresa))}` : '';
        const cargo = data?.cargo ? `\n💼 Cargo: ${this.escapeMarkdown(String(data.cargo))}` : '';
        const estado = data?.estado ? `\n📊 Estado: ${this.escapeMarkdown(String(data.estado))}` : '';
        const notas = data?.notas ? `\n📝 Notas: ${this.escapeMarkdown(String(data.notas))}` : '';
        return `🔍 *Lead encontrado:*\n👤 ${nombre} (${email})${tel}${emp}${cargo}${estado}${notas}`;
      }
      case 'list_leads': {
        const items = data?.items || [];
        const total = Number(data?.total ?? (Array.isArray(items) ? items.length : 0));
        if (!Array.isArray(items) || items.length === 0) return '👥 No hay leads registrados.';
        const lines = items.slice(0, 5).map((l: any) => {
          const n = this.escapeMarkdown(String(l?.nombre || ''));
          const e = l?.email ? ` (${this.escapeMarkdown(String(l.email))})` : '';
          const st = l?.estado ? ` · ${this.escapeMarkdown(String(l.estado))}` : '';
          return `• ${n}${e}${st}`;
        });
        const suffix = total > 5 ? `\n… y ${total - 5} más` : '';
        return `👥 *Leads (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'list_contacts': {
        const items = data?.items || [];
        const total = Number(data?.total ?? (Array.isArray(items) ? items.length : 0));
        if (!Array.isArray(items) || items.length === 0) return '📇 No hay contactos registrados.';
        const lines = items.slice(0, 5).map((c: any) => {
          const n = this.escapeMarkdown(String(c?.nombre || ''));
          const e = c?.email ? ` (${this.escapeMarkdown(String(c.email))})` : '';
          const t = c?.tipo === 'company' ? ' · 🏢 Empresa' : '';
          return `• ${n}${e}${t}`;
        });
        const suffix = total > 5 ? `\n… y ${total - 5} más` : '';
        return `📇 *Contactos (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      // ─── Ventas: pipeline de deals ───
      case 'create_deal': {
        const t = this.escapeMarkdown(String(data?.titulo || ''));
        const v = data?.valor ? ` por ${this.escapeMarkdown(String(data.valor))}${data?.moneda ? ` ${this.escapeMarkdown(String(data.moneda))}` : ''}` : '';
        const e = data?.etapa ? ` · etapa ${this.escapeMarkdown(String(data.etapa))}` : '';
        return `📊 *Negocio creado:* ${t}${v}${e}`;
      }
      case 'update_deal': {
        const t = this.escapeMarkdown(String(data?.titulo || ''));
        const e = data?.etapa ? `\n📍 Etapa: ${this.escapeMarkdown(String(data.etapa))}` : '';
        const v = data?.valor ? `\n💰 Valor: ${this.escapeMarkdown(String(data.valor))}${data?.moneda ? ` ${this.escapeMarkdown(String(data.moneda))}` : ''}` : '';
        const p = data?.prioridad ? `\n⚡ Prioridad: ${this.escapeMarkdown(String(data.prioridad))}` : '';
        return `✏️ *Negocio actualizado:* ${t}${e}${v}${p}`;
      }
      case 'list_deals': {
        const deals = data?.deals || [];
        const total = Number(data?.total ?? (Array.isArray(deals) ? deals.length : 0));
        if (!Array.isArray(deals) || deals.length === 0) return '📊 No hay negocios en el pipeline.';
        const lines = deals.slice(0, 5).map((d: any) => {
          const t = this.escapeMarkdown(String(d?.titulo || ''));
          const l = d?.lead?.nombre ? ` — ${this.escapeMarkdown(String(d.lead.nombre))}` : '';
          const v = d?.valor ? ` · ${this.escapeMarkdown(String(d.valor))}${d?.moneda ? ` ${this.escapeMarkdown(String(d.moneda))}` : ''}` : '';
          const e = d?.etapa ? ` · ${this.escapeMarkdown(String(d.etapa))}` : '';
          return `• ${t}${l}${v}${e}`;
        });
        const suffix = total > 5 ? `\n… y ${total - 5} más` : '';
        return `📊 *Pipeline (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'prequalify_lead':
        return data?.note?.contenido
          ? `📝 *Lead precalificado.* Nota registrada: "${this.escapeMarkdown(String(data.note.contenido))}"`
          : '📝 Lead precalificado y nota registrada.';
      case 'registrar_interaccion': {
        const tipo = data?.tipo ? ` (${this.escapeMarkdown(String(data.tipo))})` : '';
        const contenido = data?.contenido ? `: "${this.escapeMarkdown(String(data.contenido))}"` : '';
        return `📞 *Interacción registrada*${tipo}${contenido}`;
      }
      case 'create_task': {
        const t = this.escapeMarkdown(String(data?.titulo || data?.name || ''));
        const vence = data?.fechaVencimiento
          ? ` · vence ${this.escapeMarkdown(new Date(data.fechaVencimiento).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))}`
          : '';
        return `📝 *Tarea creada:* ${t}${vence}`;
      }
      case 'complete_task': {
        const t = this.escapeMarkdown(String(data?.titulo || data?.name || 'la tarea'));
        return `✅ *Tarea completada:* ${t}`;
      }
      case 'get_pending_tasks': {
        const items = Array.isArray(data) ? data : data?.items || [];
        const total = Array.isArray(items) ? items.length : 0;
        if (total === 0) return '✅ No tienes tareas pendientes.';
        const lines = items.slice(0, 6).map((t: any) => {
          const titulo = this.escapeMarkdown(String(t?.titulo || ''));
          const vence = t?.fechaVencimiento
            ? ` · ${this.escapeMarkdown(new Date(t.fechaVencimiento).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))}`
            : '';
          const lead = t?.lead?.nombre ? ` — ${this.escapeMarkdown(String(t.lead.nombre))}` : '';
          return `• ${titulo}${vence}${lead}`;
        });
        const suffix = total > 6 ? `\n… y ${total - 6} más` : '';
        return `📋 *Tareas pendientes (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'create_note': {
        const contenido = data?.contenido ? `: "${this.escapeMarkdown(String(data.contenido))}"` : '';
        return `📝 *Nota agregada*${contenido}`;
      }
      case 'get_notes_by_lead': {
        const items = Array.isArray(data) ? data : data?.items || [];
        const total = Array.isArray(items) ? items.length : 0;
        if (total === 0) return '📓 No hay notas registradas para este contacto.';
        const lines = items.slice(0, 5).map((n: any) => {
          const contenido = this.escapeMarkdown(String(n?.contenido || ''));
          const fecha = n?.fechaCreacion
            ? ` (${this.escapeMarkdown(new Date(n.fechaCreacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))})`
            : '';
          return `• ${contenido}${fecha}`;
        });
        const suffix = total > 5 ? `\n… y ${total - 5} más` : '';
        return `📓 *Notas (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'create_poliza':
        return data?.message ? `📋 ${this.escapeMarkdown(String(data.message))}` : '';

      // ─── Catálogo: búsqueda y listado (el skill ya devuelve mensaje amigable) ───
      case 'buscar_catalogo':
        // buscarCatalogo retorna { message: '🔍 *Resultados…*', items, total }.
        // El texto formateado del skill ya incluye el markdown de Telegram
        // correcto (no se escapa para no romper los asteriscos).
        return data?.message ? String(data.message) : '';
      case 'export_catalog': {
        const items = data?.items || [];
        if (!Array.isArray(items) || items.length === 0) return '📋 El catálogo está vacío.';
        const lines = items.slice(0, 8).map((i: any) => {
          const n = this.escapeMarkdown(String(i?.nombre || ''));
          const p = i?.precioBase !== undefined && i?.precioBase !== null ? `${this.escapeMarkdown(String(i.precioBase))} ${this.escapeMarkdown(String(i.moneda || 'EUR'))}` : '';
          const t = i?.tipo ? ` · ${this.escapeMarkdown(String(i.tipo))}` : '';
          return `• ${n}${p ? ` — ${p}` : ''}${t}`;
        });
        const total = Number(data?.totalItems ?? items.length);
        const suffix = total > 8 ? `\n… y ${total - 8} más` : '';
        return `📋 *Catálogo (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      // ─── Finanzas: proveedores y gastos ───
      case 'create_supplier': {
        const n = this.escapeMarkdown(String(data?.name || data?.nombre || ''));
        const cat = data?.category ? ` · ${this.escapeMarkdown(String(data.category))}` : '';
        const em = data?.email ? ` (${this.escapeMarkdown(String(data.email))})` : '';
        return `🏢 *Proveedor creado:* ${n}${em}${cat}.`;
      }
      case 'list_suppliers': {
        const items = data?.suppliers || [];
        const total = Number(data?.total ?? (Array.isArray(items) ? items.length : 0));
        if (!Array.isArray(items) || items.length === 0) return '🏢 No hay proveedores registrados.';
        const lines = items.slice(0, 8).map((s: any) => {
          const n = this.escapeMarkdown(String(s?.name || s?.nombre || ''));
          const cat = s?.category ? ` · ${this.escapeMarkdown(String(s.category))}` : '';
          const em = s?.email ? ` (${this.escapeMarkdown(String(s.email))})` : '';
          return `• ${n}${em}${cat}`;
        });
        const suffix = total > 8 ? `\n… y ${total - 8} más` : '';
        return `🏢 *Proveedores (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'create_expense': {
        const monto = data?.amount !== undefined && data?.amount !== null ? this.escapeMarkdown(String(data.amount)) : '';
        const desc = data?.description ? this.escapeMarkdown(String(data.description)) : '';
        const cat = data?.category ? ` · ${this.escapeMarkdown(String(data.category))}` : '';
        return `💳 *Gasto registrado:* ${monto}€${desc ? ` — ${desc}` : ''}${cat}.`;
      }

      // ─── Inventario: stock, salud y consumo ───
      case 'adjust_stock': {
        const sl = data?.stockLevel;
        const mv = data?.movement; // hermano de stockLevel en el retorno del skill
        const item = sl?.catalogoItem;
        const nombre = item?.nombre ? this.escapeMarkdown(String(item.nombre)) : (sl?.catalogoItemId ? this.escapeMarkdown(String(sl.catalogoItemId)) : '');
        const tipo = String(mv?.type || sl?.movement?.type || '');
        const tipoLabel: Record<string, string> = { IN: '📥 Entrada', OUT: '📤 Salida', TRANSFER: '🔁 Transferencia' };
        const cant = mv?.quantity !== undefined ? this.escapeMarkdown(String(mv.quantity)) : '';
        const qty = sl?.quantity !== undefined ? this.escapeMarkdown(String(sl.quantity)) : '';
        return `📦 *${tipoLabel[tipo] || 'Ajuste'} de stock:* ${nombre}${cant ? ` — ${cant}u` : ''}.${qty ? `\n📊 Stock actual: ${qty}u` : ''}`;
      }
      case 'get_inventory_health': {
        const status = String(data?.status || 'HEALTHY');
        const items = Array.isArray(data?.items) ? data.items : [];
        const statusLabel: Record<string, string> = {
          HEALTHY: '🟢 Inventario sano',
          WARNING: '🟡 Stock bajo detectado',
          CRITICAL: '🔴 Riesgo de ruptura',
        };
        if (status === 'HEALTHY') return `📦 ${statusLabel[status]}.\n${data?.recommendation ? this.escapeMarkdown(String(data.recommendation)) : ''}`;
        const lines = items.slice(0, 8).map((i: any) => {
          const n = this.escapeMarkdown(String(i?.name || ''));
          const cur = i?.current !== undefined ? this.escapeMarkdown(String(i.current)) : '';
          const min = i?.min !== undefined ? this.escapeMarkdown(String(i.min)) : '';
          return `• ${n} — ${cur}u (mín ${min}u)`;
        });
        const total = Number(data?.criticalItemsCount ?? items.length);
        const suffix = total > 8 ? `\n… y ${total - 8} más` : '';
        const rec = data?.recommendation ? `\n💡 ${this.escapeMarkdown(String(data.recommendation))}` : '';
        return `📦 *${statusLabel[status]} (${total}):*\n${lines.join('\n')}${suffix}${rec}`;
      }
      case 'process_inventory_consumption': {
        // El skill retorna { success, warehouse } (descontó producto o BoM).
        const wh = data?.warehouse ? this.escapeMarkdown(String(data.warehouse)) : '';
        return `📤 *Consumo registrado.*${wh ? ` Almacén: ${wh}.` : ''} Stock actualizado.`;
      }
      case 'analyze_burn_rate': {
        const months = Number(data?.periodMonths ?? 3);
        const periodo = months === 1 ? '1 mes' : `${months} meses`;
        const income = data?.totalIncome !== undefined ? this.escapeMarkdown(String(data.totalIncome)) : '0';
        const expense = data?.totalExpense !== undefined ? this.escapeMarkdown(String(data.totalExpense)) : '0';
        const net = data?.netProfit !== undefined ? this.escapeMarkdown(String(data.netProfit)) : '0';
        const status = String(data?.burnRateStatus || 'HEALTHY');
        const statusLabel: Record<string, string> = {
          HEALTHY: '🟢 Estable',
          WARNING: '🟡 Alerta',
          CRITICAL: '🔴 Crítico',
        };
        const rec = data?.recommendation ? `\n💡 ${this.escapeMarkdown(String(data.recommendation))}` : '';
        return `📊 *Análisis financiero (${this.escapeMarkdown(periodo)}):*\n💰 Ingresos: ${income}€\n💸 Gastos: ${expense}€\n📈 Resultado: ${net}€\n🩺 Estado: ${statusLabel[status] || status}${rec}`;
      }

      // ─── Citas & Bookings ───
      case 'create_booking': {
        const cita = data?.cita || data;
        const titulo = cita?.titulo ? this.escapeMarkdown(String(cita.titulo)) : 'Cita';
        const nombre = data?.lead?.nombre ? this.escapeMarkdown(String(data.lead.nombre)) : (data?.nombre ? this.escapeMarkdown(String(data.nombre)) : '');
        const fecha = cita?.fechaHora
          ? new Date(cita.fechaHora).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
          : 'la fecha indicada';
        return `📅 *Cita agendada:* ${titulo}${nombre ? ` con ${nombre}` : ''}\n🗓 ${this.escapeMarkdown(fecha)}`;
      }
      case 'get_upcoming_bookings': {
        const citas = data?.citas || [];
        const total = Array.isArray(citas) ? citas.length : 0;
        if (total === 0) return '📋 No tienes citas próximas.';
        const lines = citas.slice(0, 6).map((c: any) => {
          const raw = c?.fechaHoraLocal || c?.fechaHora;
          let f = 'fecha sin definir';
          if (raw) {
            try {
              f = new Date(raw).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            } catch {
              f = String(raw);
            }
          }
          const t = c?.titulo ? this.escapeMarkdown(String(c.titulo)) : 'Cita';
          const n = c?.lead?.nombre ? ` — ${this.escapeMarkdown(String(c.lead.nombre))}` : '';
          const tipo = c?.fuente === 'google_calendar' ? ' 📌' : '';
          return `• ${this.escapeMarkdown(f)} — ${t}${n}${tipo}`;
        });
        const suffix = total > 6 ? `\n… y ${total - 6} más` : '';
        return `📋 *Tus próximas citas (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'cancel_booking': {
        const titulo = data?.titulo ? this.escapeMarkdown(String(data.titulo)) : 'la cita';
        const fecha = data?.fechaHora
          ? new Date(data.fechaHora).toLocaleString('es-MX', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
          : '';
        return `❌ *Cita cancelada:* ${titulo}${fecha ? ` del ${this.escapeMarkdown(fecha)}` : ''}.`;
      }

      // ─── Insurance: skills de lectura (muestran resultados al usuario) ───
      case 'list_polizas': {
        const polizas = data?.polizas || [];
        if (!Array.isArray(polizas) || polizas.length === 0) return '📋 No hay pólizas registradas.';
        const lines = polizas.slice(0, 5).map((p: any) => {
          const numero = this.escapeMarkdown(String(p?.numeroPoliza || ''));
          const cliente = this.escapeMarkdown(String(p?.cliente?.nombre || ''));
          const ase = this.escapeMarkdown(String(p?.aseguradora?.nombre || ''));
          const vence = p?.fechaVencimiento ? new Date(p.fechaVencimiento).toISOString().slice(0, 10) : '—';
          return `• ${numero} — ${cliente} (${ase}) vence ${vence}`;
        });
        const total = Number(data?.total ?? polizas.length);
        const suffix = total > 5 ? `\n… y ${total - 5} más` : '';
        return `📋 *Pólizas (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'polizas_por_vencer': {
        const polizas = data?.polizas || [];
        const dias = Number(data?.dias ?? 30);
        if (!Array.isArray(polizas) || polizas.length === 0) return `⏰ No hay pólizas por vencer en los próximos ${dias} días.`;
        const lines = polizas.slice(0, 5).map((p: any) => {
          const numero = this.escapeMarkdown(String(p?.numeroPoliza || ''));
          const cliente = this.escapeMarkdown(String(p?.cliente?.nombre || ''));
          const vence = p?.fechaVencimiento ? new Date(p.fechaVencimiento).toISOString().slice(0, 10) : '—';
          return `• ${numero} — ${cliente} vence ${vence}`;
        });
        const total = Number(data?.total ?? polizas.length);
        const suffix = total > 5 ? `\n… y ${total - 5} más` : '';
        return `⏰ *Pólizas por vencer (${dias}d):*\n${lines.join('\n')}${suffix}`;
      }
      case 'renovaciones_pendientes': {
        const renovaciones = data?.renovaciones || [];
        if (!Array.isArray(renovaciones) || renovaciones.length === 0) return '🔄 No hay renovaciones pendientes.';
        const lines = renovaciones.slice(0, 5).map((r: any) => {
          const numero = this.escapeMarkdown(String(r?.poliza?.numeroPoliza || ''));
          const cliente = this.escapeMarkdown(String(r?.poliza?.cliente?.nombre || ''));
          const estado = this.escapeMarkdown(String(r?.estado || ''));
          return `• ${numero} — ${cliente} (${estado})`;
        });
        const total = Number(data?.total ?? renovaciones.length);
        const suffix = total > 5 ? `\n… y ${total - 5} más` : '';
        return `🔄 *Renovaciones pendientes (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'clientes_sin_contacto': {
        const clientes = data?.clientes || [];
        const dias = Number(data?.dias ?? 180);
        if (!Array.isArray(clientes) || clientes.length === 0) return `👥 No hay clientes sin contacto en los últimos ${dias} días.`;
        const lines = clientes.slice(0, 5).map((c: any) => {
          const nombre = this.escapeMarkdown(String(c?.nombre || ''));
          const polizasCount = Array.isArray(c?.polizasSeguro) ? c.polizasSeguro.length : 0;
          const extra = polizasCount > 0 ? ` (${polizasCount} póliza(s))` : '';
          return `• ${nombre}${extra}`;
        });
        const total = Number(data?.total ?? clientes.length);
        const suffix = total > 5 ? `\n… y ${total - 5} más` : '';
        return `👥 *Clientes sin contacto (${dias}d):*\n${lines.join('\n')}${suffix}`;
      }

      // ─── Siniestros (Fase 5.1) ───
      case 'create_siniestro':
      case 'update_siniestro':
        return data?.message ? `🛡️ ${this.escapeMarkdown(String(data.message))}` : '';
      case 'list_siniestros': {
        const siniestros = data?.siniestros || [];
        const total = Number(data?.total ?? (Array.isArray(siniestros) ? siniestros.length : 0));
        if (!Array.isArray(siniestros) || siniestros.length === 0) return '🛡️ No hay siniestros registrados.';
        const lines = siniestros.slice(0, 5).map((s: any) => {
          const num = this.escapeMarkdown(String(s?.numeroSiniestro || s?.descripcion?.slice(0, 24) || '—'));
          const cliente = this.escapeMarkdown(String(s?.cliente?.nombre || ''));
          const ase = this.escapeMarkdown(String(s?.aseguradora?.nombre || ''));
          const estado = this.escapeMarkdown(String(s?.estado || '').replace('_', ' '));
          const monto =
            s?.montoReclamado !== null && s?.montoReclamado !== undefined
              ? ` · ${this.escapeMarkdown(String(s.montoReclamado))} ${this.escapeMarkdown(String(s?.moneda || ''))}`
              : '';
          return `• ${num} — ${cliente} (${ase}) [${estado}]${monto}`;
        });
        const suffix = total > 5 ? `\n… y ${total - 5} más` : '';
        return `🛡️ *Siniestros (${total}):*\n${lines.join('\n')}${suffix}`;
      }

      // ─── Facturación & Veri*factu (Décimo entrenamiento) ───
      case 'create_invoice': {
        const numero = this.escapeMarkdown(String(data?.numero || data?.sequenceNumber || ''));
        const monto = data?.monto !== undefined && data?.monto !== null ? this.escapeMarkdown(String(data.monto)) : '';
        const moneda = data?.moneda ? ` ${this.escapeMarkdown(String(data.moneda))}` : '';
        const sello = data?.isSealed || data?.verifactuVersion === 2 ? ' · sello Veri*factu ✅' : '';
        return `🧾 *Factura creada:* ${numero}${monto ? ` por ${monto}${moneda}` : ''}${sello}.`;
      }
      case 'cancel_invoice': {
        const numero = this.escapeMarkdown(String(data?.numero || ''));
        const anulada = data?.fiscalStatus === 'anulada' ? ' (anulada)' : '';
        return `🗑️ *Factura cancelada:* ${numero}${anulada}.`;
      }
      case 'get_invoice_fiscal_status': {
        const numero = this.escapeMarkdown(String(data?.numero || ''));
        const estado = data?.fiscalStatus ? ` · Estado: ${this.escapeMarkdown(String(data.fiscalStatus))}` : '';
        const sello = data?.isSealed
          ? `✅ Válida (Veri*factu${data?.verifactuVersion ? ` v${this.escapeMarkdown(String(data.verifactuVersion))}` : ''})`
          : '⚠️ Sin sello';
        return `🔎 *Estado fiscal de ${numero}:* ${sello}${estado}.`;
      }
      case 'rectify_invoice': {
        const numero = this.escapeMarkdown(String(data?.numero || ''));
        const monto = data?.monto !== undefined && data?.monto !== null ? ` por ${this.escapeMarkdown(String(data.monto))} ${this.escapeMarkdown(String(data?.moneda || 'EUR'))}` : '';
        return `🔄 *Factura rectificada:* ${numero}${monto}. La factura anterior queda anulada.`;
      }
      default:
        return '';
    }
  },

  /**
   * Construye la respuesta final desde los resultados
   */
  buildResponse(results: Array<{ action: string; output: SkillOutput }>): ExecutionOutput {
    if (!results.length) {
      return {
        message: 'No se pudo completar la acción.',
        error: true
      };
    }

    const last = results[results.length - 1];

    // Prioridad 1: mensaje formateado amigable para skills de CRM
    const formatted = this.formatSkillResult(last.action, last.output?.data);
    if (formatted) {
      return {
        message: formatted,
        skill: last.action,
        data: last.output?.data || undefined,
        error: !!last.output?.error || false
      };
    }

    // Prioridad 2: respuesta del skill (si no es el placeholder genérico "OK")
    if (last.output?.message && last.output.message !== 'OK') {
      return {
        message: last.output.message,
        skill: last.action,
        data: last.output.data || undefined,
        error: !!last.output.error || false
      };
    }

    return {
      message: '✅ Operación completada',
      skill: last.action,
      data: last.output?.data || last.output
    };
  }
};

export default ExecutionEngine;