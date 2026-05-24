import * as SecureStore from 'expo-secure-store';

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

// ─── Keys ─────────────────────────────────────────────────────────────────────

const CONTACTS_KEY = 'volkern_contacts';
const INTERACTIONS_KEY = 'volkern_contact_interactions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `ct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class ContactsService {
  // ── Contacts ──────────────────────────────────────────────────────────

  async getAll(): Promise<Contact[]> {
    try {
      const raw = await SecureStore.getItemAsync(CONTACTS_KEY);
      if (raw) {
        return JSON.parse(raw) as Contact[];
      }
    } catch {
      // ignore
    }
    return [];
  }

  async getById(id: string): Promise<Contact | null> {
    const all = await this.getAll();
    return all.find((c) => c.id === id) || null;
  }

  async search(query: string): Promise<Contact[]> {
    const all = await this.getAll();
    const lower = query.toLowerCase();
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.phone.includes(query) ||
        c.email.toLowerCase().includes(lower) ||
        c.company.toLowerCase().includes(lower) ||
        c.tags.some((t) => t.toLowerCase().includes(lower)),
    );
  }

  async create(data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contact> {
    const all = await this.getAll();
    const contact: Contact = {
      ...data,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(contact);
    await this.persist(all);
    return contact;
  }

  async update(id: string, data: Partial<Omit<Contact, 'id' | 'createdAt'>>): Promise<Contact | null> {
    const all = await this.getAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, updatedAt: Date.now() };
    await this.persist(all);
    return all[idx];
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    const filtered = all.filter((c) => c.id !== id);
    await this.persist(filtered);
    // Also remove associated interactions
    const interactions = await this.getAllInteractions();
    const filteredInteractions = interactions.filter((i) => i.contactId !== id);
    await this.persistInteractions(filteredInteractions);
  }

  async clearAll(): Promise<void> {
    await this.persist([]);
    await this.persistInteractions([]);
  }

  // ── Interactions ──────────────────────────────────────────────────────

  async getInteractions(contactId: string): Promise<Interaction[]> {
    const all = await this.getAllInteractions();
    return all
      .filter((i) => i.contactId === contactId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async addInteraction(contactId: string, type: InteractionType, notes: string): Promise<Interaction> {
    const all = await this.getAllInteractions();
    const interaction: Interaction = {
      id: generateId(),
      contactId,
      type,
      notes,
      timestamp: Date.now(),
    };
    all.push(interaction);
    await this.persistInteractions(all);
    return interaction;
  }

  async deleteInteraction(id: string): Promise<void> {
    const all = await this.getAllInteractions();
    const filtered = all.filter((i) => i.id !== id);
    await this.persistInteractions(filtered);
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async getStats(): Promise<ContactStats> {
    const all = await this.getAll();
    const interactions = await this.getAllInteractions();

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const interactionsThisWeek = interactions.filter((i) => i.timestamp > oneWeekAgo).length;

    const recentContacts = all
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);

    return {
      total: all.length,
      interactionsThisWeek,
      recentContacts,
    };
  }

  // ── Private ───────────────────────────────────────────────────────────

  private async persist(items: Contact[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(CONTACTS_KEY, JSON.stringify(items));
    } catch {
      console.error('[ContactsService] Error saving contacts');
    }
  }

  private async getAllInteractions(): Promise<Interaction[]> {
    try {
      const raw = await SecureStore.getItemAsync(INTERACTIONS_KEY);
      if (raw) return JSON.parse(raw) as Interaction[];
    } catch {
      // ignore
    }
    return [];
  }

  private async persistInteractions(items: Interaction[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(INTERACTIONS_KEY, JSON.stringify(items));
    } catch {
      console.error('[ContactsService] Error saving interactions');
    }
  }
}

export const contactsService = new ContactsService();
