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
      case 'inventory_watchdog': {
        if (data?.status === 'OK') return `📦 ${this.escapeMarkdown(String(data?.message || 'Inventario saludable.'))}`;
        const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
        const count = Number(data?.alertsCount ?? alerts.length);
        const lines = alerts.slice(0, 5).map((a: any) => {
          const msg = String(a?.message || '').replace(/<[^>]+>/g, '');
          return `• ${this.escapeMarkdown(msg)}`;
        });
        const suffix = count > 5 ? `\n… y ${count - 5} alertas más` : '';
        return `⚠️ *Watchdog de inventario — ${count} alerta(s) de reposición:*\n${lines.join('\n')}${suffix}`;
      }
      case 'calculate_production_cost': {
        const product = data?.productName ? this.escapeMarkdown(String(data.productName)) : 'Producto';
        const qty = Number(data?.quantity ?? 1);
        const total = data?.totalCost != null ? this.escapeMarkdown(Number(data.totalCost).toLocaleString('es-ES')) : '—';
        const unit = data?.unitCost != null ? this.escapeMarkdown(Number(data.unitCost).toFixed(2)) : '—';
        const material = data?.materialCost != null ? this.escapeMarkdown(Number(data.materialCost).toLocaleString('es-ES')) : '—';
        const labor = data?.laborCost != null ? this.escapeMarkdown(Number(data.laborCost).toLocaleString('es-ES')) : '—';
        return `🏭 *Costo de producción — ${product} (${qty}u):*\n🧱 Materiales: ${material}€\n👷 Mano de obra: ${labor}€\n💰 Costo total: ${total}€ (${unit}€/u)`;
      }
      case 'detect_quality_anomalies': {
        if (data?.status === 'OPTIMAL') return `✅ ${this.escapeMarkdown(String(data?.message || 'Sin anomalías de calidad.'))}`;
        const report = data?.data || {};
        const total = Number(report?.totalFailures ?? 0);
        const source = report?.topFailureSource ? this.escapeMarkdown(String(report.topFailureSource)) : '';
        const supplier = report?.supplierAlert ? `\n🏢 ${this.escapeMarkdown(String(report.supplierAlert))}` : '';
        const rec = report?.recommendation ? `\n💡 ${this.escapeMarkdown(String(report.recommendation))}` : '';
        const risk = String(report?.riskLevel || 'MEDIUM');
        const riskLabel: Record<string, string> = { HIGH: '🔴 Alto', MEDIUM: '🟡 Medio', LOW: '🟢 Bajo' };
        return `✅ *Anomalías de calidad (${total} en 30 días):*\n🎯 Fuente: ${source}\n⚠️ Riesgo: ${riskLabel[risk] || risk}${supplier}${rec}`;
      }
      case 'verify_waste_integrity': {
        const status = String(data?.status || '');
        const statusLabel: Record<string, string> = {
          VERIFIED: '🟢 VERIFICADA',
          FLAGGED_FOR_REVIEW: '🟡 REVISIÓN',
          REJECTED: '🔴 RECHAZADA',
        };
        const verdict = data?.verdict ? `\n🔍 Veredicto: ${this.escapeMarkdown(String(data.verdict))}` : '';
        const root = data?.rootCause ? `\n🎯 Causa raíz: ${this.escapeMarkdown(String(data.rootCause))}` : '';
        const action = data?.correctiveAction ? `\n🛠 Acción: ${this.escapeMarkdown(String(data.correctiveAction))}` : '';
        const recapture = data?.isRecapture ? '\n📸 Se solicita recaptura de evidencia.' : '';
        return `♻️ *Merma auditada (Vision-Lock):* ${statusLabel[status] || status}${verdict}${root}${action}${recapture}`;
      }
      case 'register_qc_inspection': {
        const hash = data?.integrityHash ? String(data.integrityHash).slice(0, 16) + '…' : '';
        return `✅ *Inspección de calidad registrada.*${hash ? `\n🔐 Hash SHA-256: ${this.escapeMarkdown(hash)}` : ''}\n${data?.message ? this.escapeMarkdown(String(data.message)) : ''}`;
      }
      case 'get_project_profitability': {
        const income = data?.totalIncome != null ? this.escapeMarkdown(Number(data.totalIncome).toLocaleString('es-ES')) : '—';
        const expenses = data?.totalExpenses != null ? this.escapeMarkdown(Number(data.totalExpenses).toLocaleString('es-ES')) : '—';
        const materials = data?.materialCosts != null ? this.escapeMarkdown(Number(data.materialCosts).toLocaleString('es-ES')) : '—';
        const net = data?.netProfit != null ? this.escapeMarkdown(Number(data.netProfit).toLocaleString('es-ES')) : '—';
        const margin = data?.margin != null ? this.escapeMarkdown(String(data.margin)) : '—';
        const status = String(data?.status || '');
        const statusLabel: Record<string, string> = { HEALTHY: '🟢', WARNING: '🟡', CRITICAL: '🔴' };
        return `📐 *Rentabilidad del proyecto:*\n💰 Ingresos: ${income}€\n💸 Gastos: ${expenses}€\n🧱 Materiales: ${materials}€\n📈 Resultado: ${net}€ (margen ${margin}%) ${statusLabel[status] || ''}`;
      }
      case 'detect_project_drifting': {
        const projects = Array.isArray(data?.projects) ? data.projects : [];
        if (projects.length === 0) return '📐 No hay proyectos con desviaciones detectadas.';
        const lines = projects.slice(0, 6).map((p: any) => {
          const level = String(p?.driftLevel || 'LOW');
          const label: Record<string, string> = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🔴' };
          const delayed = Number(p?.delayedMilestonesCount ?? 0);
          const margin = p?.currentMargin != null ? this.escapeMarkdown(String(p.currentMargin)) : '—';
          const rec = p?.recommendation ? ` — ${this.escapeMarkdown(String(p.recommendation))}` : '';
          return `${label[level] || '⚪'} ${this.escapeMarkdown(String(p?.projectId || ''))} · margen ${margin}%${delayed > 0 ? ` · ${delayed} hitos retrasados` : ''}${rec}`;
        });
        const suffix = projects.length > 6 ? `\n… y ${projects.length - 6} más` : '';
        return `📐 *Desviaciones en proyectos (${projects.length}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'detect_ghosting': {
        const leads = Array.isArray(data) ? data : [];
        if (leads.length === 0) return '👻 No hay leads fantasma: todos tus leads activos tienen actividad reciente.';
        const lines = leads.slice(0, 8).map((l: any) => {
          const nombre = this.escapeMarkdown(String(l?.nombre || ''));
          const horas = Number(l?.horasInactivo ?? 0);
          const dias = (horas / 24).toFixed(1).replace(/\.0$/, '');
          const res = l?.draftRescate ? `\n   💬 ${this.escapeMarkdown(String(l.draftRescate))}` : '';
          return `• ${nombre} — inactivo ${horas}h (~${dias} días)${res}`;
        });
        const suffix = leads.length > 8 ? `\n… y ${leads.length - 8} más` : '';
        return `👻 *Leads fantasma (${leads.length}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'generate_success_path': {
        const steps = Array.isArray(data?.steps) ? data.steps : [];
        const reasoning = data?.metadata?.reasoning ? `\n🧠 ${this.escapeMarkdown(String(data.metadata.reasoning))}` : '';
        if (steps.length === 0) return '🗺 No pude generar la ruta de éxito.';
        const lines = steps.map((s: any, i: number) => `\n${i + 1}. *${this.escapeMarkdown(String(s?.title || ''))}* — ${this.escapeMarkdown(String(s?.description || ''))}`);
        return `🗺 *Ruta de éxito para cerrar el deal:*${lines.join('')}${reasoning}`;
      }
      case 'audit_expense_integrity': {
        return String(data?.status === 'ALERT' ? '🚨 ' : '✅ ') + this.escapeMarkdown(String(data?.content || 'Auditoría completada.'));
      }
      case 'audit_finance_integrity': {
        const status = String(data?.status || 'ÍNTEGRA');
        const invoice = data?.invoiceAudit?.breaches?.length ?? 0;
        const expense = Array.isArray(data?.expenseBreaches) ? data.expenseBreaches.length : 0;
        const ledger = Array.isArray(data?.ledgerAudit?.breaches) ? data.ledgerAudit.breaches.length : 0;
        const total = invoice + expense + ledger;
        if (status === 'COMPROMETIDA') {
          return `🚨 *PROTOCOLO DE DESCONFIANZA ACTIVADO*\n🔴 Integridad comprometida — ${total} infracción(es):\n🧾 Facturas: ${invoice}\n💸 Gastos: ${expense}\n📒 Libro diario: ${ledger}`;
        }
        return `🟢 *Integridad financiera íntegra.* Sin brechas en facturas, gastos ni libro diario.`;
      }
      case 'audit_material_leaks': {
        const summary = data?.leakSummary || {};
        const anomalies = Number(summary?.anomaliesCount ?? 0);
        const consumption = Number(summary?.automaticConsumptionCount ?? 0);
        const status = String(data?.status || 'STABLE');
        const statusLabel: Record<string, string> = { CRITICAL: '🔴 CRÍTICO', STABLE: '🟢 ESTABLE' };
        const rec = data?.recommendation ? `\n💡 ${this.escapeMarkdown(String(data.recommendation))}` : '';
        return `🕳 *Auditoría de fugas de material:* ${statusLabel[status] || status}\n⚠️ Ajustes sospechosos: ${anomalies}\n🏭 Consumos automáticos (7 días): ${consumption}${rec}`;
      }
      case 'get_field_activity': {
        const techs = Array.isArray(data?.activeTechs) ? data.activeTechs : [];
        if (techs.length === 0) return '📍 No hay técnicos con check-in registrado hoy.';
        const lines = techs.slice(0, 10).map((t: any) => {
          const nombre = this.escapeMarkdown(String(t?.technician || ''));
          const role = t?.role ? this.escapeMarkdown(String(t.role)) : '';
          const state = String(t?.status || '');
          const stateLabel: Record<string, string> = { CLOCK_IN: '🟢 activo', CLOCK_OUT: '⚪ fuera' };
          const loc = t?.lat != null && t?.lng != null ? ` · ${this.escapeMarkdown(String(t.lat))},${this.escapeMarkdown(String(t.lng))}` : '';
          const anomaly = t?.isAnomaly ? ' ⚠️' : '';
          return `• ${nombre}${role ? ` (${role})` : ''} — ${stateLabel[state] || state}${loc}${anomaly}`;
        });
        const suffix = techs.length > 10 ? `\n… y ${techs.length - 10} más` : '';
        return `📍 *Actividad de campo (${techs.length}):*\n${lines.join('\n')}${suffix}`;
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
      case 'project_financial_forecast': {
        const expectedIn = data?.expectedIn != null ? this.escapeMarkdown(Number(data.expectedIn).toLocaleString('es-ES')) : '—';
        const committedOut = data?.committedOut != null ? this.escapeMarkdown(Number(data.committedOut).toLocaleString('es-ES')) : '—';
        const runway = data?.runwayDays != null ? this.escapeMarkdown(Number(data.runwayDays).toFixed(0)) : '—';
        return `🔮 *Proyección a 30 días:*\n📥 Ingreso esperado: ${expectedIn}€\n📤 Gasto comprometido: ${committedOut}€\n🛟 Runway: ${runway} días estimados.`;
      }
      case 'tax_prospector': {
        const region = String(data?.region || 'MX');
        const regionLabel: Record<string, string> = {
          MX: 'México',
          ES: 'España',
          USA_LLC: 'USA (LLC)',
        };
        const liability = data?.estimatedLiability != null ? this.escapeMarkdown(Number(data.estimatedLiability).toLocaleString('es-ES')) : '—';
        const advice = data?.advice ? `\n💡 ${this.escapeMarkdown(String(data.advice))}` : '';
        return `🧾 *Provisión de impuestos (${regionLabel[region] || region}):*\n💰 Estimación: ${liability}€${advice}`;
      }
      // ─── Impuestos & Declaraciones (Décimo octavo entrenamiento) ───
      case 'tax_overview': {
        const upcoming: any[] = data?.upcoming || [];
        const overdue: any[] = data?.overdue || [];
        const fmtAmount = (a: any) =>
          a != null && Number(a) !== 0
            ? ` · 💰 ${this.escapeMarkdown(Number(a).toLocaleString('es-ES'))}€`
            : '';
        const fmtDeadline = (d: any) => {
          const model = this.escapeMarkdown(String(d?.model || ''));
          const name = this.escapeMarkdown(String(d?.name || ''));
          const period = d?.periodLabel ? ` (${this.escapeMarkdown(String(d.periodLabel))})` : '';
          const due = d?.dueDate
            ? this.escapeMarkdown(new Date(d.dueDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))
            : '';
          const days = d?.daysUntilDue !== undefined ? ` · ${d.daysUntilDue < 0 ? 'venció hace' : 'faltan'} ${this.escapeMarkdown(String(Math.abs(Number(d.daysUntilDue))))}d` : '';
          return `• Modelo ${model} · ${name}${period} — ${due}${days}${fmtAmount(d.estimatedAmount)}`;
        };
        const overdueLines = overdue.slice(0, 4).map(fmtDeadline);
        const upcomingLines = upcoming.slice(0, 6).map(fmtDeadline);
        const parts: string[] = [];
        if (overdueLines.length > 0) parts.push(`🔴 *Vencidas (${overdue.length}):*\n${overdueLines.join('\n')}`);
        if (upcomingLines.length > 0) parts.push(`📅 *Por declarar (${upcoming.length}):*\n${upcomingLines.join('\n')}`);
        if (parts.length === 0) return '✅ No tienes declaraciones pendientes ni vencidas.';
        return `🧾 *Impuestos y declaraciones:*\n\n${parts.join('\n\n')}`;
      }
      case 'tax_model_report': {
        const modelo = this.escapeMarkdown(String(data?.modelo || ''));
        const nombre = this.escapeMarkdown(String(data?.nombre || ''));
        const periodo = data?.trimestre
          ? `T${this.escapeMarkdown(String(data.trimestre))} ${this.escapeMarkdown(String(data.año || new Date().getFullYear()))}`
          : `Anual ${this.escapeMarkdown(String(data.año || new Date().getFullYear()))}`;
        const eur = (n: any) => this.escapeMarkdown(Number(n || 0).toLocaleString('es-ES'));
        const report: any = data?.report || {};
        const header = `🧾 *Modelo ${modelo} — ${nombre} (${periodo}):*`;
        if (modelo === '303') {
          const out = report.outputVat?.amount || 0;
          const inn = report.inputVat?.amount || 0;
          const sur = report.equivalenceSurcharge?.amount || 0;
          const result = Number(report.result ?? out - inn);
          return `${header}\n📤 IVA repercutido: ${eur(out)}€\n📥 IVA soportado: ${eur(inn)}€${sur ? `\n➕ Recargo equiv.: ${eur(sur)}€` : ''}\n💰 Resultado: ${eur(result)}€${result > 0 ? ' a ingresar' : result < 0 ? ' a compensar' : ''}`;
        }
        if (modelo === '111') {
          const total = Number(report.totalRetentions ?? report.retentions?.amount ?? 0);
          return `${header}\n📥 Base retenciones: ${eur(report.retentions?.base)}€\n💰 Retenciones a ingresar: ${eur(total)}€`;
        }
        if (modelo === '115') {
          if (report.hasActivity === false) return `${header}\nℹ️ Sin retenciones por arrendamientos en el periodo.`;
          return `${header}\n🏠 Rentas base: ${eur(report.totalRentBase)}€\n💰 Retenciones (${Number(report.retentionRate ?? 19)}%): ${eur(report.totalRetentions)}€`;
        }
        if (modelo === '130') {
          if (report.hasActivity === false) return `${header}\nℹ️ Sin actividad en el periodo.`;
          return `${header}\n💰 Ingresos: ${eur(report.totalIncome)}€\n💸 Gastos: ${eur(report.totalExpenses)}€\n📈 Pago fraccionado (${Number(report.paymentRate ?? 20) * 100}%): ${eur(report.resultToPay)}€`;
        }
        if (modelo === '349') {
          if (report.hasOperations === false) return `${header}\nℹ️ Sin operaciones intracomunitarias en el periodo.`;
          return `${header}\n📤 Entregas: ${report.deliveryCount ?? 0} · ${eur(report.totalDeliveries)}€\n📥 Adquisiciones: ${report.acquisitionCount ?? 0} · ${eur(report.totalAcquisitions)}€`;
        }
        if (modelo === '347') {
          if (report.hasOperations === false) return `${header}\nℹ️ Sin operaciones que reportar.`;
          return `${header}\n👥 Contrapartes: ${report.totalOperations ?? 0}\n💰 Importe total: ${eur(report.totalAmount)}€`;
        }
        if (modelo === '390') {
          if (report.hasActivity === false) return `${header}\nℹ️ Sin actividad anual.`;
          return `${header}\n📤 IVA repercutido: ${eur(report.annualOutputVatAmount)}€\n📥 IVA soportado: ${eur(report.annualInputVatAmount)}€\n💰 Resultado anual: ${eur(report.annualResult)}€`;
        }
        if (modelo === '180') {
          if (report.hasActivity === false) return `${header}\nℹ️ Sin retenciones por arrendamientos en el año.`;
          return `${header}\n🏠 Arrendadores: ${report.totalLandlords ?? 0}\n💰 Retenciones totales: ${eur(report.totalRetentions)}€`;
        }
        return `${header}\nℹ️ Resumen disponible.`;
      }
      case 'file_tax_return': {
        const modelo = this.escapeMarkdown(String(data?.modelo || ''));
        const nombre = this.escapeMarkdown(String(data?.nombre || ''));
        const periodo = data?.trimestre
          ? `T${this.escapeMarkdown(String(data.trimestre))} ${this.escapeMarkdown(String(data.año || new Date().getFullYear()))}`
          : `anual ${this.escapeMarkdown(String(data.año || new Date().getFullYear()))}`;
        const count = Number(data?.actualizados ?? 0);
        return `✅ *Modelo ${modelo} (${nombre}) del ${periodo} marcado como presentado.*\n${count > 0 ? `${count} registro(s) actualizados.` : 'No había registros pendientes para ese periodo.'}`;
      }
      // ─── Contabilidad (Décimo noveno entrenamiento) ───
      case 'balance_sheet': {
        const report: any = data?.report || {};
        const eur = (n: any) => this.escapeMarkdown(Number(n || 0).toLocaleString('es-ES'));
        const fmtSection = (sec: any) => `\n▪ ${this.escapeMarkdown(String(sec?.label || ''))}: ${eur(sec?.total)}€`;
        const activo = report.activo || {};
        const pasivo = report.pasivo || {};
        const activoSections = Array.isArray(activo.sections) ? activo.sections.map(fmtSection).join('') : '';
        const pasivoSections = Array.isArray(pasivo.sections) ? pasivo.sections.map(fmtSection).join('') : '';
        const totalActivo = Number(activo.total ?? 0);
        const totalPasivo = Number(pasivo.total ?? 0);
        const diferencia = Math.round((totalActivo - totalPasivo) * 100) / 100;
        return `📊 *Balance General:*\n🟢 *Activo:* ${eur(totalActivo)}€${activoSections}\n🔴 *Pasivo + Patrimonio:* ${eur(totalPasivo)}€${pasivoSections}\n${diferencia !== 0 ? `⚖️ Diferencia: ${eur(diferencia)}€ (debe cuadrar a 0)` : '✅ Cuadra (activo = pasivo + patrimonio neto).'}`;
      }
      case 'profit_loss': {
        const report: any = data?.report || {};
        const eur = (n: any) => this.escapeMarkdown(Number(n || 0).toLocaleString('es-ES'));
        const ingresos = Number(report.totalIngresos ?? 0);
        const gastos = Number(report.totalGastos ?? 0);
        const resultado = Number(report.resultadoEjercicio ?? 0);
        const secciones = Array.isArray(report.sections) && report.sections.length > 0
          ? '\n' + report.sections.map((s: any) => `▪ ${this.escapeMarkdown(String(s?.label || ''))}: ${eur(s?.total)}€`).join('\n')
          : '';
        return `📈 *Cuenta de Resultados:*\n💰 Ingresos: ${eur(ingresos)}€\n💸 Gastos: ${eur(gastos)}€\n📊 Resultado del ejercicio: ${eur(resultado)}€${resultado >= 0 ? ' (beneficio)' : ' (pérdida)'}${secciones}`;
      }
      case 'trial_balance': {
        const report: any = data?.report || {};
        const eur = (n: any) => this.escapeMarkdown(Number(n || 0).toLocaleString('es-ES'));
        const rows: any[] = report.rows || [];
        if (rows.length === 0) return '🧮 El balance de comprobación está vacío (no hay cuentas).';
        const lines = rows.slice(0, 10).map((r: any) => {
          const code = this.escapeMarkdown(String(r?.code || ''));
          const name = this.escapeMarkdown(String(r?.name || ''));
          const d = Number(r?.debit ?? 0);
          const c = Number(r?.credit ?? 0);
          return `• ${code} ${name} — debe ${eur(d)}€ / haber ${eur(c)}€`;
        });
        const suffix = rows.length > 10 ? `\n… y ${rows.length - 10} cuentas más` : '';
        const totalDebit = Number(report.totalDebit ?? 0);
        const totalCredit = Number(report.totalCredit ?? 0);
        const cuadra = Math.abs(totalDebit - totalCredit) < 0.01;
        return `🧮 *Balance de Comprobación (${rows.length} cuentas):*\n${lines.join('\n')}${suffix}\n\nΣ Debe: ${eur(totalDebit)}€ · Σ Haber: ${eur(totalCredit)}€\n${cuadra ? '✅ Sumas cuadradas.' : '⚠️ Las sumas NO cuadran.'}`;
      }
      case 'analyze_global_profitability': {
        const income = data?.revenue != null ? this.escapeMarkdown(Number(data.revenue).toLocaleString('es-ES')) : '—';
        const expenses = data?.expenses != null ? this.escapeMarkdown(Number(data.expenses).toLocaleString('es-ES')) : '—';
        const margin = data?.margin != null ? this.escapeMarkdown(String(data.margin)) : '—';
        const status = String(data?.status || '');
        const statusLabel: Record<string, string> = {
          SALUDABLE: '🟢 SALUDABLE',
          CRÍTICO: '🔴 CRÍTICO',
          CRITICO: '🔴 CRÍTICO',
        };
        const statusTxt = statusLabel[status] || (status ? this.escapeMarkdown(status) : '');
        return `📊 *Rentabilidad global:*\n💰 Ingresos: ${income}€\n💸 Gastos: ${expenses}€\n📈 Margen: ${margin}%\n${statusTxt ? `🩺 Estado: ${statusTxt}` : ''}`;
      }

      // ─── Citas & Bookings ───
      case 'create_booking': {
        const cita = data?.cita || data;
        const titulo = cita?.titulo ? this.escapeMarkdown(String(cita.titulo)) : 'Cita';
        const nombre = data?.lead?.nombre ? this.escapeMarkdown(String(data.lead.nombre)) : (data?.nombre ? this.escapeMarkdown(String(data.nombre)) : '');
        // Si el skill devolvió fechaHoraLocal (formateada en la zona horaria del
        // tenant), usarla: el toLocaleString del servidor está en UTC y mostraría
        // una hora distinta a la que el usuario pidió.
        const fecha = cita?.fechaHoraLocal
          ? String(cita.fechaHoraLocal)
          : cita?.fechaHora
            ? new Date(cita.fechaHora).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
            : 'la fecha indicada';
        const duplicada = data?.duplicada ? '\n⚠️ Ya tenías una cita agendada a esa hora; no creé un duplicado.' : '';
        return `📅 *Cita agendada:* ${titulo}${nombre ? ` con ${nombre}` : ''}\n🗓 ${this.escapeMarkdown(fecha)}${duplicada}`;
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

      // ─── Logística (Undécimo entrenamiento) ───
      case 'get_shipment_status': {
        if (!data?.found) return `🚚 ${this.escapeMarkdown(String(data?.message || 'No se encontró el envío.'))}`;
        const s = data?.shipment || {};
        const tracking = this.escapeMarkdown(String(s?.trackingNumber || ''));
        const status = this.escapeMarkdown(String(s?.status || '').replace(/_/g, ' '));
        const carrier = s?.carrier ? ` · ${this.escapeMarkdown(String(s.carrier))}` : '';
        const cliente = s?.customerName ? `\n👤 ${this.escapeMarkdown(String(s.customerName))}` : '';
        const entrega = s?.estimatedDelivery
          ? `\n📅 Entrega estimada: ${this.escapeMarkdown(String(s.estimatedDelivery).slice(0, 10))}`
          : '';
        return `🚚 *Envío ${tracking}:* ${status}${carrier}${cliente}${entrega}`;
      }
      case 'track_order': {
        if (!data?.found) return `📦 ${this.escapeMarkdown(String(data?.message || 'No se encontró el pedido.'))}`;
        const estado = this.escapeMarkdown(String(data?.status || '').replace(/_/g, ' '));
        const carrier = data?.carrier ? ` · ${this.escapeMarkdown(String(data.carrier))}` : '';
        const receiver = data?.receiver ? ` · 👤 ${this.escapeMarkdown(String(data.receiver))}` : '';
        const events = (data?.timeline || []).map((t: any) => {
          const icon = t?.done ? '✅' : '⏳';
          const fecha = t?.date ? ` (${this.escapeMarkdown(String(t.date).slice(0, 10))})` : '';
          return `${icon} ${this.escapeMarkdown(String(t?.event || ''))}${fecha}`;
        }).join('\n');
        return `📦 *Pedido:* ${estado}${carrier}${receiver}\n${events}`;
      }
      case 'check_fleet_health': {
        if (data?.message) return `🚛 ${this.escapeMarkdown(String(data.message))}`;
        const kpis = data?.kpis || {};
        const activos = kpis?.active !== undefined ? this.escapeMarkdown(String(kpis.active)) : '';
        const total = kpis?.total !== undefined ? this.escapeMarkdown(String(kpis.total)) : '';
        const mant = (data?.maintenanceDue || []).map((v: any) => `• ${this.escapeMarkdown(String(v?.plate || ''))} ${this.escapeMarkdown(String(v?.brand || ''))} ${this.escapeMarkdown(String(v?.model || ''))}`).join('\n');
        const itv = (data?.expiringItv || []).map((v: any) => `• ${this.escapeMarkdown(String(v?.plate || ''))} — ${this.escapeMarkdown(String(v?.daysLeft ?? ''))}d`).join('\n');
        let out = `🚛 *Flota:* ${activos} de ${total} vehículos activos.`;
        if (mant) out += `\n\n🛠️ *En mantenimiento:*\n${mant}`;
        if (itv) out += `\n\n📋 *ITV próximas a vencer:*\n${itv}`;
        if (!mant && !itv) out += '\n✅ Sin mantenimientos pendientes ni ITV próxima.';
        return out;
      }
      case 'optimize_route': {
        return `🗺️ ${this.escapeMarkdown(String(data?.suggestion || 'Sin sugerencia de ruta.'))}`;
      }
      case 'suggest_warehouse_reorg': {
        return `🏭 ${this.escapeMarkdown(String(data?.suggestion || 'Sin sugerencia de reorganización.'))}`;
      }

      // ─── RRHH (Duodécimo entrenamiento) ───
      case 'get_hr_daily_brief': {
        if (data?.text) return `👥 ${this.escapeMarkdown(String(data.text))}`;
        const m = data?.metrics || {};
        const activos = Number(m?.activeCount ?? 0);
        const total = Number(m?.totalCount ?? 0);
        const ausentes = Number(m?.absentCount ?? 0);
        const alertas = Number(m?.integrityAlerts ?? 0);
        const conflictos = Array.isArray(m?.criticalConflicts) ? m.criticalConflicts.length : 0;
        let out = `👥 *Resumen RRHH:* ${activos} de ${total} activos (${ausentes} ausentes).`;
        out += `\n🔍 Alertas de integridad: ${alertas}.`;
        out += `\n⚠️ Conflictos con hitos críticos: ${conflictos}.`;
        return out;
      }
      case 'approve_vacation_voice': {
        const empleado = data?.empleadoNombre
          ? ` de ${this.escapeMarkdown(String(data.empleadoNombre))}`
          : '';
        const fechas = data?.vacation?.startDate || data?.vacation?.endDate
          ? `\n🗓 ${data.vacation.startDate ? new Date(data.vacation.startDate).toISOString().slice(0, 10) : '—'} → ${data.vacation.endDate ? new Date(data.vacation.endDate).toISOString().slice(0, 10) : '—'}`
          : '';
        return `🏖️ *Vacaciones aprobadas*${empleado}.${fechas}`;
      }
      case 'talent_retention_risk': {
        if (data?.teamAnalysis) {
          const resumen = data?.summary ? `\n${String(data.summary)}` : '';
          const top =
            data?.mostAtRisk && data.mostAtRisk.riskLevel !== 'LOW'
              ? `\n⚠️ *Mayor riesgo:* ${this.escapeMarkdown(String(data.mostAtRisk.employeeName))} (${this.escapeMarkdown(String(data.mostAtRisk.riskLevel))})`
              : '';
          return `⚠️ *Riesgo de rotación del equipo:*\n🔴 Alto: ${data.highRisk ?? 0} · 🟡 Medio: ${data.mediumRisk ?? 0} · 🟢 Analizados: ${data.analyzed ?? 0}${resumen}${top}`;
        }
        const nivel = String(data?.riskLevel || 'LOW');
        const icono = nivel === 'HIGH' ? '🔴' : nivel === 'MEDIUM' ? '🟡' : '🟢';
        const nombre = this.escapeMarkdown(String(data?.employeeName || ''));
        const carga = data?.factors?.workload ? this.escapeMarkdown(String(data.factors.workload)) : '';
        const formacion = data?.factors?.trainingMaturity ? this.escapeMarkdown(String(data.factors.trainingMaturity)) : '';
        const rec = data?.recommendation ? `\n💡 ${this.escapeMarkdown(String(data.recommendation))}` : '';
        return `${icono} *Riesgo de rotación — ${nombre}:* ${nivel}${carga ? `\n📊 ${carga}` : ''}${formacion ? `\n🎓 ${formacion}` : ''}${rec}`;
      }

      // ─── Marketing (Decimotercer entrenamiento) ───
      case 'generate_marketing_copy': {
        const copy = data?.copy ? this.escapeMarkdown(String(data.copy)) : '';
        const plat = data?.platform ? ` · ${this.escapeMarkdown(String(data.platform))}` : '';
        const tono = data?.tone ? ` (tono ${this.escapeMarkdown(String(data.tone))})` : '';
        return `✍️ *Copy generado*${plat}${tono}:\n${copy}`;
      }
      case 'analyze_marketing_sentiment': {
        const s = String(data?.sentiment || 'NEUTRAL');
        const icono = s === 'POSITIVE' ? '🟢' : s === 'NEGATIVE' ? '🔴' : '🟡';
        const score = data?.score !== undefined ? ` (${this.escapeMarkdown(String(data.score))})` : '';
        const texto = data?.text ? `\n💬 "${this.escapeMarkdown(String(data.text))}"` : '';
        return `${icono} *Sentimiento:* ${this.escapeMarkdown(s)}${score}${texto}`;
      }
      case 'suggest_campaign_optimization': {
        const items = Array.isArray(data?.suggestions) ? data.suggestions : [];
        if (items.length === 0) return '📣 No hay sugerencias de campaña por ahora.';
        const conf = data?.confidence ? ` (confianza ${this.escapeMarkdown(String(data.confidence))})` : '';
        const lines = items.slice(0, 5).map((s: any) => `• ${this.escapeMarkdown(String(s))}`).join('\n');
        return `📣 *Sugerencias de campaña*${conf}:\n${lines}`;
      }
      case 'generate_web_creator_block': {
        const desc = data?.description ? `\n📝 ${this.escapeMarkdown(String(data.description))}` : '';
        return `🧱 *Bloque generado:*${desc}\nPuedes pegarlo en el editor visual (GrapesJS) o pedirme otro tipo.`;
      }
      case 'generate_seo_metadata': {
        const titulo = data?.metaTitulo ? `\n🏷 *Title:* ${this.escapeMarkdown(String(data.metaTitulo))}` : '';
        const desc = data?.metaDescripcion ? `\n📝 *Description:* ${this.escapeMarkdown(String(data.metaDescripcion))}` : '';
        const kw = data?.metaKeywords ? `\n🔑 *Keywords:* ${this.escapeMarkdown(String(data.metaKeywords))}` : '';
        return `🔎 *SEO generado:*${titulo}${desc}${kw}`;
      }
      case 'advise_on_automation_rules': {
        const items = Array.isArray(data?.suggestions) ? data.suggestions : [];
        if (items.length === 0) return '🤖 No hay sugerencias de automatización por ahora.';
        const lines = items.slice(0, 5).map((s: any) => `• *${this.escapeMarkdown(String(s?.name || ''))}*: ${this.escapeMarkdown(String(s?.reason || ''))}`).join('\n');
        return `🤖 *Automatizaciones sugeridas:*\n${lines}`;
      }

      // ─── ADS: programación de campañas y tests A/B ───
      case 'create_ad_schedule': {
        return data?.message ? `⏰ ${this.escapeMarkdown(String(data.message))}` : '⏰ Programación creada.';
      }
      case 'list_ad_schedules': {
        const items = Array.isArray(data?.schedules) ? data.schedules : [];
        if (items.length === 0) return '📋 No hay programaciones activas.';
        const lines = items.slice(0, 8).map((s: any) => {
          const nombre = this.escapeMarkdown(String(s?.name || ''));
          const camp = s?.campaign?.name ? ` — ${this.escapeMarkdown(String(s.campaign.name))}` : '';
          const dias = Array.isArray(s?.daysOfWeek) ? (s.daysOfWeek as string[]).join(',').toLowerCase() : '';
          const horario = `${this.escapeMarkdown(String(s?.startTime || ''))}–${this.escapeMarkdown(String(s?.endTime || ''))}`;
          const act = s?.enabled === false ? ' ⏸' : ' ✅';
          return `• ${nombre}${camp} · ${dias} · ${horario}${act}`;
        });
        const total = Number(data?.total ?? items.length);
        const suffix = total > 8 ? `\n… y ${total - 8} más` : '';
        return `📋 *Programaciones (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'delete_ad_schedule': {
        return data?.message ? `🗑️ ${this.escapeMarkdown(String(data.message))}` : '🗑️ Programación eliminada.';
      }
      case 'create_ab_test':
      case 'start_ab_test':
      case 'calculate_ab_test_significance':
      case 'declare_ab_test_winner': {
        return data?.message ? `🧪 ${this.escapeMarkdown(String(data.message))}` : '🧪 Operación A/B completada.';
      }

      // ─── Real Estate (Decimocuarto entrenamiento) ───
      case 'generate_property_description': {
        const desc = data?.description
          ? `\n${this.escapeMarkdown(String(data.description))}`
          : '';
        return `🏠 *Descripción generada:*${desc}`;
      }
      case 'suggest_price_based_on_market': {
        if (data?.message && data.suggestedPrice == null) return `🏠 ${this.escapeMarkdown(String(data.message))}`;
        const precio = data?.suggestedPrice != null ? this.escapeMarkdown(Number(data.suggestedPrice).toLocaleString('es-ES')) : '—';
        const conf = String(data?.confidence || 'low');
        const confLabel: Record<string, string> = { high: 'alta', medium: 'media', low: 'baja' };
        const muestra = data?.sampleSize != null ? ` (basado en ${this.escapeMarkdown(String(data.sampleSize))} similares)` : '';
        const op = data?.operationType ? ` · ${this.escapeMarkdown(String(data.operationType))}` : '';
        return `🏠 *Precio sugerido:* ${precio}€${op}\n🎯 Confianza: ${confLabel[conf] || conf}${muestra}`;
      }
      case 'calculate_property_quality_score': {
        const score = data?.score != null ? this.escapeMarkdown(String(data.score)) : '—';
        const grade = data?.grade ? ` · Grado ${this.escapeMarkdown(String(data.grade))}` : '';
        const detalles = data?.details && typeof data.details === 'object'
          ? `\n${Object.entries(data.details).map(([k, v]) => `• ${this.escapeMarkdown(k)}: ${this.escapeMarkdown(String(v))}`).join('\n')}`
          : '';
        return `📊 *Score de calidad:* ${score}/100${grade}${detalles}`;
      }
      case 'search_properties_by_filters': {
        const items = Array.isArray(data?.properties) ? data.properties : [];
        const total = Number(data?.total ?? items.length);
        if (items.length === 0) return '🏠 No encontré propiedades que coincidan con tu búsqueda.';
        const lines = items.slice(0, 6).map((p: any) => {
          const nombre = this.escapeMarkdown(String(p?.nombre || p?.propertyType || 'Inmueble'));
          const op = p?.operationType ? ` · ${this.escapeMarkdown(String(p.operationType))}` : '';
          const precio = p?.precioBase != null ? ` · ${this.escapeMarkdown(Number(p.precioBase).toLocaleString('es-ES'))}€` : '';
          const zona = p?.city ? ` · ${this.escapeMarkdown(String(p.city))}` : '';
          const habs = p?.bedrooms ? ` · ${this.escapeMarkdown(String(p.bedrooms))} habs` : '';
          return `• ${nombre}${op}${precio}${zona}${habs}`;
        });
        const suffix = total > 6 ? `\n… y ${total - 6} más` : '';
        return `🏠 *Propiedades (${total}):*\n${lines.join('\n')}${suffix}`;
      }
      case 'recommend_properties': {
        const items = Array.isArray(data?.recommendations) ? data.recommendations : [];
        if (items.length === 0) return `🏠 ${this.escapeMarkdown(String(data?.mensaje || 'No encontré propiedades recomendadas.'))}`;
        const lines = items.slice(0, 5).map((r: any) => {
          const titulo = this.escapeMarkdown(String(r?.titulo || 'Inmueble'));
          const precio = r?.precioFormateado ? ` · ${this.escapeMarkdown(String(r.precioFormateado))}` : '';
          const ubicacion = r?.ubicacion ? ` · ${this.escapeMarkdown(String(r.ubicacion))}` : '';
          const razon = r?.razon ? `\n   💡 ${this.escapeMarkdown(String(r.razon))}` : '';
          return `• ${titulo}${precio}${ubicacion}${razon}`;
        });
        return `🏠 *Recomendaciones:*\n${lines.join('\n')}`;
      }
      case 'calculate_franchise_commissions': {
        if (data?.success === false) return `💼 ${this.escapeMarkdown(String(data?.error || 'No pude calcular la comisión.'))}`;
        const monto = data?.montoCalculado != null ? this.escapeMarkdown(Number(data.montoCalculado).toLocaleString('es-ES')) : '—';
        const desglose = Array.isArray(data?.desglose) && data.desglose.length > 0
          ? `\n${data.desglose.map((d: any) => `• ${this.escapeMarkdown(String(d))}`).join('\n')}`
          : '';
        return `💼 *Comisión calculada:* ${monto}€${desglose}`;
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