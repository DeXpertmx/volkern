import { getData, saveData } from './secure-storage';

const STORAGE_KEY = '@volkern_templates';

// ─── Types ────────────────────────────────────────────────────────────────────
export type TemplateCategory = 'sales' | 'marketing' | 'followup' | 'welcome' | 'reminder' | 'survey' | 'custom';
export type TemplateChannel = 'email' | 'sms' | 'whatsapp' | 'push';
export type TemplateStatus = 'active' | 'inactive' | 'draft';

export interface TemplateVariable {
  key: string;
  label: string;
  defaultValue?: string;
}

export interface Template {
  id: string;
  title: string;
  description: string;
  content: string;
  category: TemplateCategory;
  channel: TemplateChannel;
  status: TemplateStatus;
  variables: TemplateVariable[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  isBuiltIn: boolean;
}

export interface TemplateCategoryInfo {
  value: TemplateCategory;
  labelKey: string;
  icon: string;
  color: string;
}

export const TEMPLATE_CATEGORIES: TemplateCategoryInfo[] = [
  { value: 'sales', labelKey: 'categorySales', icon: 'trending-up', color: '#10B981' },
  { value: 'marketing', labelKey: 'categoryMarketing', icon: 'megaphone', color: '#8B5CF6' },
  { value: 'followup', labelKey: 'categoryFollowup', icon: 'refresh', color: '#3B82F6' },
  { value: 'welcome', labelKey: 'categoryWelcome', icon: 'hand-left', color: '#F59E0B' },
  { value: 'reminder', labelKey: 'categoryReminder', icon: 'alarm', color: '#EF4444' },
  { value: 'survey', labelKey: 'categorySurvey', icon: 'chatbubbles', color: '#EC4899' },
  { value: 'custom', labelKey: 'categoryCustom', icon: 'create', color: '#6366F1' },
];

export const TEMPLATE_CHANNELS: { value: TemplateChannel; labelKey: string; icon: string; color: string }[] = [
  { value: 'email', labelKey: 'channelEmail', icon: 'mail', color: '#3B82F6' },
  { value: 'sms', labelKey: 'channelSms', icon: 'chatbox', color: '#10B981' },
  { value: 'whatsapp', labelKey: 'channelWhatsapp', icon: 'logo-whatsapp', color: '#25D366' },
  { value: 'push', labelKey: 'channelPush', icon: 'notifications', color: '#8B5CF6' },
];

// ─── Built-in Templates ──────────────────────────────────────────────────────
const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'builtin-welcome-email',
    title: 'Bienvenida',
    description: 'Correo de bienvenida para nuevos clientes',
    content: 'Hola {{nombre}},\n\n¡Bienvenido a {{empresa}}! Estamos emocionados de tenerte con nosotros.\n\nTu registro ha sido exitoso. A continuación, te compartimos los próximos pasos:\n\n{{contenido_personalizado}}\n\nSaludos,\nEl equipo de {{empresa}}',
    category: 'welcome',
    channel: 'email',
    status: 'active',
    variables: [
      { key: 'nombre', label: 'Nombre del cliente' },
      { key: 'empresa', label: 'Nombre de la empresa' },
      { key: 'contenido_personalizado', label: 'Contenido personalizado' },
    ],
    tags: ['bienvenida', 'automatización', 'onboarding'],
    createdAt: 0,
    updatedAt: 0,
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'builtin-followup-sms',
    title: 'Seguimiento',
    description: 'SMS de seguimiento post-contacto',
    content: 'Hola {{nombre}}, soy {{vendedor}} de {{empresa}}. Queríamos darte seguimiento sobre {{tema}}. ¿Qué te parece si agendamos una llamada? Responde SÍ para que te contactemos.',
    category: 'followup',
    channel: 'sms',
    status: 'active',
    variables: [
      { key: 'nombre', label: 'Nombre del cliente' },
      { key: 'vendedor', label: 'Nombre del vendedor' },
      { key: 'empresa', label: 'Nombre de la empresa' },
      { key: 'tema', label: 'Tema de seguimiento' },
    ],
    tags: ['seguimiento', 'ventas', 'sms'],
    createdAt: 1,
    updatedAt: 1,
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'builtin-sales-whatsapp',
    title: 'Propuesta Comercial',
    description: 'WhatsApp de propuesta comercial rápida',
    content: '¡Hola {{nombre}}! 👋\n\nTe comparto nuestra propuesta para {{servicio}}:\n💰 Inversión: {{monto}}\n📋 Beneficios: {{beneficios}}\n\n¿Te parece bien si agendamos una llamada de 15 min para resolver tus dudas? 😊',
    category: 'sales',
    channel: 'whatsapp',
    status: 'active',
    variables: [
      { key: 'nombre', label: 'Nombre del cliente' },
      { key: 'servicio', label: 'Servicio o producto' },
      { key: 'monto', label: 'Monto de inversión' },
      { key: 'beneficios', label: 'Beneficios clave' },
    ],
    tags: ['ventas', 'whatsapp', 'propuesta'],
    createdAt: 2,
    updatedAt: 2,
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'builtin-reminder-push',
    title: 'Recordatorio Cita',
    description: 'Notificación push recordatorio de cita',
    content: '⏰ Recordatorio: Tienes una cita mañana a las {{hora}} con {{persona}}. No olvides confirmar tu asistencia.',
    category: 'reminder',
    channel: 'push',
    status: 'active',
    variables: [
      { key: 'hora', label: 'Hora de la cita' },
      { key: 'persona', label: 'Persona con quien es la cita' },
    ],
    tags: ['recordatorio', 'cita', 'push'],
    createdAt: 3,
    updatedAt: 3,
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'builtin-survey-email',
    title: 'Encuesta de Satisfacción',
    description: 'Correo para encuesta NPS post-servicio',
    content: 'Hola {{nombre}},\n\nGracias por usar {{servicio}}. Nos encantaría conocer tu opinión.\n\n¿Qué tan probable es que nos recomiendes? (0-10)\n{{link_encuesta}}\n\nTu feedback nos ayuda a mejorar.',
    category: 'survey',
    channel: 'email',
    status: 'active',
    variables: [
      { key: 'nombre', label: 'Nombre del cliente' },
      { key: 'servicio', label: 'Servicio recibido' },
      { key: 'link_encuesta', label: 'Link de encuesta' },
    ],
    tags: ['encuesta', 'nps', 'satisfacción'],
    createdAt: 4,
    updatedAt: 4,
    usageCount: 0,
    isBuiltIn: true,
  },
  {
    id: 'builtin-marketing-email',
    title: 'Campaña Promocional',
    description: 'Correo de marketing para promociones',
    content: '🎉 ¡Oferta especial para ti, {{nombre}}!\n\nPor tiempo limitado, {{empresa}} te ofrece {{descuento}} de descuento en {{producto}}.\n\nUsa el código: {{codigo}}\n\nVálido hasta {{fecha_limite}}.\n\n¡No dejes pasar esta oportunidad!',
    category: 'marketing',
    channel: 'email',
    status: 'active',
    variables: [
      { key: 'nombre', label: 'Nombre del cliente' },
      { key: 'empresa', label: 'Nombre de la empresa' },
      { key: 'descuento', label: 'Porcentaje o monto de descuento' },
      { key: 'producto', label: 'Producto o servicio' },
      { key: 'codigo', label: 'Código promocional' },
      { key: 'fecha_limite', label: 'Fecha límite' },
    ],
    tags: ['marketing', 'promoción', 'descuento'],
    createdAt: 5,
    updatedAt: 5,
    usageCount: 0,
    isBuiltIn: true,
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────
class TemplatesService {
  private cache: Template[] | null = null;

  private async loadAll(): Promise<Template[]> {
    if (this.cache) return this.cache;
    const stored = await getData<Template[]>(STORAGE_KEY);
    const userTemplates = stored || [];
    const all = [...BUILT_IN_TEMPLATES, ...userTemplates];
    this.cache = all;
    return all;
  }

  private async persistUserTemplates(userTemplates: Template[]): Promise<void> {
    await saveData(STORAGE_KEY, userTemplates);
    this.cache = null;
  }

  async getAll(): Promise<Template[]> {
    return this.loadAll();
  }

  async getByCategory(category: TemplateCategory): Promise<Template[]> {
    const all = await this.loadAll();
    return all.filter((t) => t.category === category);
  }

  async getByChannel(channel: TemplateChannel): Promise<Template[]> {
    const all = await this.loadAll();
    return all.filter((t) => t.channel === channel);
  }

  async search(query: string): Promise<Template[]> {
    const all = await this.loadAll();
    const q = query.toLowerCase();
    return all.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.content.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  async getById(id: string): Promise<Template | undefined> {
    const all = await this.loadAll();
    return all.find((t) => t.id === id);
  }

  async create(data: Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'isBuiltIn'>): Promise<Template> {
    const stored = await getData<Template[]>(STORAGE_KEY);
    const userTemplates = stored || [];
    const now = Date.now();
    const template: Template = {
      ...data,
      id: `template_${now}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      isBuiltIn: false,
    };
    userTemplates.push(template);
    await this.persistUserTemplates(userTemplates);
    return template;
  }

  async update(id: string, data: Partial<Omit<Template, 'id' | 'createdAt' | 'isBuiltIn'>>): Promise<Template | undefined> {
    const stored = await getData<Template[]>(STORAGE_KEY);
    const userTemplates = stored || [];
    const idx = userTemplates.findIndex((t) => t.id === id);
    if (idx === -1) {
      // Built-in templates cannot be modified
      const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === id);
      return builtIn;
    }
    userTemplates[idx] = { ...userTemplates[idx], ...data, updatedAt: Date.now() };
    await this.persistUserTemplates(userTemplates);
    return userTemplates[idx];
  }

  async delete(id: string): Promise<boolean> {
    const stored = await getData<Template[]>(STORAGE_KEY);
    const userTemplates = stored || [];
    const filtered = userTemplates.filter((t) => t.id !== id);
    if (filtered.length === userTemplates.length) return false; // Built-in
    await this.persistUserTemplates(filtered);
    return true;
  }

  async incrementUsage(id: string): Promise<void> {
    const stored = await getData<Template[]>(STORAGE_KEY);
    const userTemplates = stored || [];
    const idx = userTemplates.findIndex((t) => t.id === id);
    if (idx !== -1) {
      userTemplates[idx].usageCount += 1;
      await this.persistUserTemplates(userTemplates);
    }
  }

  async getStats(): Promise<{ total: number; active: number; byCategory: Record<TemplateCategory, number> }> {
    const all = await this.loadAll();
    const byCategory = {} as Record<TemplateCategory, number>;
    for (const cat of TEMPLATE_CATEGORIES) {
      byCategory[cat.value] = 0;
    }
    for (const t of all) {
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    }
    return {
      total: all.length,
      active: all.filter((t) => t.status === 'active').length,
      byCategory,
    };
  }
}

export const templatesService = new TemplatesService();
