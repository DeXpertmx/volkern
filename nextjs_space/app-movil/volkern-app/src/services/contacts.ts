import { api, ApiClientError } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InteractionType = 'call' | 'email' | 'meeting' | 'note' | 'message';

export interface Interaction {
  id: string;
  contactId: string;
  type: InteractionType;
  notes: string;
  timestamp: number;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  position: string;
  notes: string;
  tags: string[];
  source: 'manual' | 'import' | 'lead';
  createdAt: number;
  updatedAt: number;
}

export interface ContactStats {
  total: number;
  interactionsThisWeek: number;
  recentContacts: Contact[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mapea un contacto de la API al tipo Contact local */
function mapApiContact(apiContact: any): Contact {
  const tags = apiContact.tags
    ? String(apiContact.tags).split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];
  return {
    id: apiContact.id,
    name: apiContact.nombre || '',
    phone: apiContact.telefono || '',
    email: apiContact.email || '',
    company: apiContact.company?.nombre || apiContact.empresa || '',
    position: apiContact.cargo || '',
    notes: apiContact.notas || '',
    tags,
    source: apiContact.origen === 'lead' ? 'lead' : apiContact.origen === 'import' ? 'import' : 'manual',
    createdAt: apiContact.fechaCreacion
      ? new Date(apiContact.fechaCreacion).getTime()
      : Date.now(),
    updatedAt: apiContact.fechaActualizacion
      ? new Date(apiContact.fechaActualizacion).getTime()
      : Date.now(),
  };
}

/** Mapea una interacción de la API al tipo Interaction local */
function mapApiInteraction(apiInteraction: any): Interaction {
  const typeMap: Record<string, InteractionType> = {
    llamada: 'call',
    call: 'call',
    email: 'email',
    correo: 'email',
    reunion: 'meeting',
    meeting: 'meeting',
    nota: 'note',
    note: 'note',
    mensaje: 'message',
    message: 'message',
  };
  return {
    id: apiInteraction.id,
    contactId: apiInteraction.contactId || '',
    type: typeMap[apiInteraction.tipo?.toLowerCase()] || 'note',
    notes: apiInteraction.contenido || apiInteraction.notas || '',
    timestamp: apiInteraction.fechaCreacion
      ? new Date(apiInteraction.fechaCreacion).getTime()
      : Date.now(),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class ContactsService {
  // ── Contacts ──────────────────────────────────────────────────────────

  async getAll(): Promise<Contact[]> {
    try {
      const data = await api.get<any[]>('/contacts');
      return (data || []).map(mapApiContact).sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
      console.error('[ContactsService] Error fetching contacts:', e);
      return [];
    }
  }

  async getById(id: string): Promise<Contact | null> {
    try {
      const resp = await api.get<any>(`/contacts/${id}`);
      const data = resp.data || resp;
      return data ? mapApiContact(data) : null;
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 404) return null;
      console.error('[ContactsService] Error fetching contact:', e);
      return null;
    }
  }

  async search(query: string): Promise<Contact[]> {
    try {
      const data = await api.get<any[]>(`/contacts?search=${encodeURIComponent(query)}`);
      return (data || []).map(mapApiContact);
    } catch (e) {
      console.error('[ContactsService] Error searching contacts:', e);
      return [];
    }
  }

  async create(data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contact> {
    const body: any = {
      nombre: data.name,
      email: data.email,
      telefono: data.phone,
      cargo: data.position,
      notas: data.notes,
      tipo: 'person',
    };
    if (data.company) body.empresa = data.company;
    if (data.tags?.length) body.tags = data.tags.join(',');

    const result = await api.post<any>('/contacts', body);
    return mapApiContact(result);
  }

  async update(id: string, data: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<Contact | null> {
    const body: any = {};
    if (data.name !== undefined) body.nombre = data.name;
    if (data.email !== undefined) body.email = data.email;
    if (data.phone !== undefined) body.telefono = data.phone;
    if (data.position !== undefined) body.cargo = data.position;
    if (data.notes !== undefined) body.notas = data.notes;
    if (data.company !== undefined) body.empresa = data.company;
    if (data.tags !== undefined) body.tags = data.tags.join(',');

    try {
      const resp = await api.patch<any>(`/contacts/${id}`, body);
      const contactData = resp.data || resp;
      return mapApiContact(contactData);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 404) return null;
      throw e;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/contacts/${id}`);
    } catch (e) {
      console.error('[ContactsService] Error deleting contact:', e);
    }
  }

  async clearAll(): Promise<void> {
    console.warn('[ContactsService] clearAll no soportado vía API');
  }

  // ── Interactions ──────────────────────────────────────────────────────

  async getInteractions(contactId: string): Promise<Interaction[]> {
    try {
      const resp = await api.get<any>(`/contacts/${contactId}`);
      const historial = resp.data?.historialInteracciones || resp.historialInteracciones || [];
      return historial.map(mapApiInteraction).sort((a: Interaction, b: Interaction) => b.timestamp - a.timestamp);
    } catch (e) {
      console.error('[ContactsService] Error fetching interactions:', e);
      return [];
    }
  }

  async addInteraction(contactId: string, type: InteractionType, notes: string): Promise<Interaction> {
    // Intentar usar interacciones del contacto
    const typeReverse: Record<InteractionType, string> = {
      call: 'llamada',
      email: 'email',
      meeting: 'reunion',
      note: 'nota',
      message: 'mensaje',
    };

    try {
      const resp = await api.post<any>(`/contacts/${contactId}/notes`, {
        contenido: `[${typeReverse[type]}] ${notes}`,
        metadata: { type, source: 'app-movil' },
      });
      const note = resp.note || resp;
      return {
        id: note.id,
        contactId,
        type,
        notes: note.contenido || notes,
        timestamp: note.fechaCreacion ? new Date(note.fechaCreacion).getTime() : Date.now(),
      };
    } catch (e) {
      console.error('[ContactsService] Error adding interaction:', e);
      // Fallback: devolver objeto local
      return {
        id: `int_${Date.now()}`,
        contactId,
        type,
        notes,
        timestamp: Date.now(),
      };
    }
  }

  async deleteInteraction(id: string): Promise<void> {
    console.warn('[ContactsService] deleteInteraction no soportado vía API');
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async getStats(): Promise<ContactStats> {
    try {
      const all = await this.getAll();
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const recentContacts = all
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5);

      return {
        total: all.length,
        interactionsThisWeek: 0, // Se podría obtener de históricos si se necesita
        recentContacts,
      };
    } catch (e) {
      console.error('[ContactsService] Error fetching stats:', e);
      return { total: 0, interactionsThisWeek: 0, recentContacts: [] };
    }
  }
}

export const contactsService = new ContactsService();
