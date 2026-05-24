import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'starred' | 'archived' | 'trash';

export interface EmailAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  uri: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  folder: EmailFolder;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bcc: { name: string; email: string }[];
  subject: string;
  body: string;
  bodyPreview: string;
  attachments: EmailAttachment[];
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  labels: string[];
  sentAt: number;
  receivedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface EmailThread {
  id: string;
  subject: string;
  participants: { name: string; email: string }[];
  lastMessage: EmailMessage;
  messages: EmailMessage[];
  unreadCount: number;
  isStarred: boolean;
  updatedAt: number;
}

export interface EmailStats {
  totalMessages: number;
  unreadCount: number;
  byFolder: Record<EmailFolder, number>;
  starredCount: number;
  attachmentCount: number;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'volkern_email_messages';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `em_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const SEED_SENDERS = [
  { name: 'María García', email: 'maria.garcia@ejemplo.com' },
  { name: 'Carlos López', email: 'carlos.lopez@empresa.com' },
  { name: 'Ana Martínez', email: 'ana.mtz@clientes.com' },
  { name: 'Juan Pérez', email: 'juan.perez@proveedor.com' },
  { name: 'Sofía Rodríguez', email: 'sofia.r@ventas.com' },
  { name: 'Miguel Ángel', email: 'miguel.a@partner.com' },
  { name: 'Laura Sánchez', email: 'laura.s@marketing.com' },
  { name: 'Roberto Vargas', email: 'r.vargas@consultora.com' },
];

// ─── Service ──────────────────────────────────────────────────────────────────

class EmailService {
  // ── Messages ──────────────────────────────────────────────────────────

  async getAll(): Promise<EmailMessage[]> {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as EmailMessage[];
    } catch { /* ignore */ }
    return [];
  }

  async getByFolder(folder: EmailFolder): Promise<EmailMessage[]> {
    const all = await this.getAll();
    return all.filter(m => m.folder === folder)
      .sort((a, b) => b.receivedAt - a.receivedAt);
  }

  async getById(id: string): Promise<EmailMessage | null> {
    const all = await this.getAll();
    const msg = all.find(m => m.id === id);
    if (msg && !msg.isRead) {
      await this.markRead(id);
      return { ...msg, isRead: true };
    }
    return msg || null;
  }

  async getThread(threadId: string): Promise<EmailMessage[]> {
    const all = await this.getAll();
    return all.filter(m => m.threadId === threadId)
      .sort((a, b) => a.sentAt - b.sentAt);
  }

  async search(query: string): Promise<EmailMessage[]> {
    const all = await this.getAll();
    const lower = query.toLowerCase();
    return all.filter(m =>
      m.subject.toLowerCase().includes(lower) ||
      m.body.toLowerCase().includes(lower) ||
      m.from.name.toLowerCase().includes(lower) ||
      m.from.email.toLowerCase().includes(lower) ||
      m.to.some(t => t.name.toLowerCase().includes(lower) || t.email.toLowerCase().includes(lower))
    ).sort((a, b) => b.receivedAt - a.receivedAt);
  }

  async send(data: Omit<EmailMessage, 'id' | 'threadId' | 'folder' | 'isRead' | 'isStarred' | 'isFlagged' | 'receivedAt' | 'createdAt' | 'updatedAt'>): Promise<EmailMessage> {
    const all = await this.getAll();
    const threadId = generateId();
    const msg: EmailMessage = {
      ...data,
      id: generateId(),
      threadId,
      folder: 'sent',
      isRead: true,
      isStarred: false,
      isFlagged: false,
      receivedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(msg);
    await this.persist(all);
    return msg;
  }

  async saveDraft(data: Partial<EmailMessage>): Promise<EmailMessage> {
    const all = await this.getAll();
    const msg: EmailMessage = {
      id: data.id || generateId(),
      threadId: data.threadId || generateId(),
      folder: 'drafts',
      from: data.from || { name: 'Yo', email: 'yo@volkern.com' },
      to: data.to || [],
      cc: data.cc || [],
      bcc: data.bcc || [],
      subject: data.subject || '',
      body: data.body || '',
      bodyPreview: (data.body || '').slice(0, 100),
      attachments: data.attachments || [],
      isRead: true,
      isStarred: false,
      isFlagged: false,
      labels: data.labels || [],
      sentAt: data.sentAt || Date.now(),
      receivedAt: Date.now(),
      createdAt: data.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    if (data.id) {
      const idx = all.findIndex(m => m.id === data.id);
      if (idx >= 0) all[idx] = msg;
      else all.push(msg);
    } else {
      all.push(msg);
    }
    await this.persist(all);
    return msg;
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    const msg = all.find(m => m.id === id);
    if (msg && msg.folder === 'trash') {
      await this.persist(all.filter(m => m.id !== id));
    } else if (msg) {
      const idx = all.findIndex(m => m.id === id);
      all[idx] = { ...msg, folder: 'trash', updatedAt: Date.now() };
      await this.persist(all);
    }
  }

  async permanentlyDelete(id: string): Promise<void> {
    const all = await this.getAll();
    await this.persist(all.filter(m => m.id !== id));
  }

  // ── Actions ───────────────────────────────────────────────────────────

  async markRead(id: string): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex(m => m.id === id);
    if (idx >= 0 && !all[idx].isRead) {
      all[idx].isRead = true;
      all[idx].updatedAt = Date.now();
      await this.persist(all);
    }
  }

  async markUnread(id: string): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex(m => m.id === id);
    if (idx >= 0) {
      all[idx].isRead = false;
      all[idx].updatedAt = Date.now();
      await this.persist(all);
    }
  }

  async toggleStar(id: string): Promise<boolean> {
    const all = await this.getAll();
    const idx = all.findIndex(m => m.id === id);
    if (idx >= 0) {
      all[idx].isStarred = !all[idx].isStarred;
      all[idx].updatedAt = Date.now();
      await this.persist(all);
      return all[idx].isStarred;
    }
    return false;
  }

  async moveToFolder(id: string, folder: EmailFolder): Promise<void> {
    const all = await this.getAll();
    const idx = all.findIndex(m => m.id === id);
    if (idx >= 0) {
      all[idx].folder = folder;
      all[idx].updatedAt = Date.now();
      await this.persist(all);
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async getStats(): Promise<EmailStats> {
    const all = await this.getAll();
    const byFolder = { inbox: 0, sent: 0, drafts: 0, starred: 0, archived: 0, trash: 0 };
    let unreadCount = 0;
    let starredCount = 0;
    let attachmentCount = 0;

    for (const m of all) {
      byFolder[m.folder]++;
      if (!m.isRead && m.folder === 'inbox') unreadCount++;
      if (m.isStarred) starredCount++;
      attachmentCount += m.attachments.length;
    }

    return {
      totalMessages: all.length,
      unreadCount,
      byFolder,
      starredCount,
      attachmentCount,
    };
  }

  // ── Seed ──────────────────────────────────────────────────────────────

  async seedIfEmpty(): Promise<void> {
    const all = await this.getAll();
    if (all.length > 0) return;

    const subjects = [
      'Propuesta comercial - Paquete Premium',
      'Seguimiento de la reunión de ayer',
      'Factura F-2024-0012 pendiente de pago',
      'Nueva oportunidad de colaboración',
      'Informe mensual de ventas - Octubre',
      'Invitación a webinar: CRM y productividad',
      'Actualización de términos del servicio',
      'Confirmación de cita para el próximo jueves',
      'Reporte de campaña de marketing',
      'Bienvenida a nuestro nuevo sistema',
    ];

    const bodies = [
      'Estimado equipo,\n\nAdjunto la propuesta comercial con los detalles del paquete premium que comentamos. Quedo atento a sus comentarios.\n\nSaludos cordiales.',
      'Hola,\n\nTal como acordamos en la reunión de ayer, les comparto los puntos clave que discutimos y los siguientes pasos acordados.\n\nQuedo pendiente.',
      'Estimado cliente,\n\nLe recordamos que la factura F-2024-0012 se encuentra pendiente de pago. Agradeceremos realizar el pago a la brevedad.\n\nAtentamente.',
      '¡Hola! Somos una empresa especializada en soluciones digitales y creemos que podríamos colaborar en proyectos interesantes.\n\n¿Agendamos una llamada?',
      'Adjunto el informe mensual de ventas con los resultados del período. Destaca un crecimiento del 15% respecto al mes anterior.\n\nSaludos.',
      'Te invitamos a nuestro próximo webinar sobre CRM y productividad empresarial. Será el jueves 15 a las 11:00 AM.\n\n¡Te esperamos!',
      'Por medio de la presente, informamos la actualización de nuestros términos del servicio. Lo invitamos a revisar los cambios.',
      'Su cita ha sido confirmada para el próximo jueves a las 10:00 AM. Por favor confirme su asistencia.\n\nGracias.',
      'Adjunto el reporte de la campaña de marketing del último trimestre. Los resultados superan las expectativas iniciales.',
      '¡Bienvenido a nuestro nuevo sistema! Estamos emocionados de tenerte con nosotros. Aquí encontrarás toda la información para empezar.',
    ];

    const seedMessages: EmailMessage[] = subjects.map((subject, i) => {
      const sender = SEED_SENDERS[i % SEED_SENDERS.length];
      const receivedAt = Date.now() - (i * 3600000 * 2); // cada 2 horas
      return {
        id: generateId(),
        threadId: generateId(),
        folder: i < 7 ? 'inbox' : 'inbox',
        from: sender,
        to: [{ name: 'Usuario', email: 'usuario@volkern.com' }],
        cc: [],
        bcc: [],
        subject,
        body: bodies[i],
        bodyPreview: bodies[i].slice(0, 100),
        attachments: i % 3 === 0 ? [{ id: generateId(), name: `documento_${i}.pdf`, size: 1024 * (i + 1), type: 'application/pdf', uri: '' }] : [],
        isRead: i > 3,
        isStarred: i < 2,
        isFlagged: i === 0,
        labels: i % 2 === 0 ? ['importante'] : [],
        sentAt: receivedAt - 60000,
        receivedAt,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      };
    });

    await this.persist(seedMessages);
  }

  // ── Private ───────────────────────────────────────────────────────────

  private async persist(items: EmailMessage[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(items));
    } catch {
      console.error('[EmailService] Error saving messages');
    }
  }
}

export const emailService = new EmailService();
