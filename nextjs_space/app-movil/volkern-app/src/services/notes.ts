import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NoteCategory = 'general' | 'idea' | 'todo' | 'meeting' | 'personal';
export type NoteColor = '#6366F1' | '#EC4899' | '#F59E0B' | '#10B981' | '#3B82F6' | '#EF4444' | '#8B5CF6' | '#6B7280';

export interface Note {
  id: string;
  title: string;
  content: string;
  category: NoteCategory;
  color: NoteColor;
  pinned: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateNoteInput {
  title: string;
  content: string;
  category?: NoteCategory;
  color?: NoteColor;
  tags?: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTES_KEY = 'volkern_notes';

export const NOTE_CATEGORIES: { value: NoteCategory; label: string; icon: string }[] = [
  { value: 'general', label: 'General', icon: 'document-text' },
  { value: 'idea', label: 'Idea', icon: 'bulb' },
  { value: 'todo', label: 'Por Hacer', icon: 'checkbox' },
  { value: 'meeting', label: 'Reunión', icon: 'calendar' },
  { value: 'personal', label: 'Personal', icon: 'person' },
];

export const NOTE_COLORS: NoteColor[] = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981',
  '#3B82F6', '#EF4444', '#8B5CF6', '#6B7280',
];

// ─── Service ──────────────────────────────────────────────────────────────────

class NotesService {
  async getAll(): Promise<Note[]> {
    try {
      const raw = await SecureStore.getItemAsync(NOTES_KEY);
      if (raw) {
        const items = JSON.parse(raw) as Note[];
        return items.sort((a, b) => {
          // Pinned first, then by updatedAt desc
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        });
      }
    } catch {
      // ignore
    }
    return [];
  }

  async getById(id: string): Promise<Note | undefined> {
    const all = await this.getAll();
    return all.find((n) => n.id === id);
  }

  async getByCategory(category: NoteCategory): Promise<Note[]> {
    const all = await this.getAll();
    return all.filter((n) => n.category === category);
  }

  async search(query: string): Promise<Note[]> {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  async create(data: CreateNoteInput): Promise<Note> {
    const all = await this.getAll();
    const note: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: data.title,
      content: data.content,
      category: data.category || 'general',
      color: data.color || '#6366F1',
      pinned: false,
      tags: data.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(note);
    await this.persist(all);
    return note;
  }

  async update(id: string, data: Partial<Omit<Note, 'id' | 'createdAt'>>): Promise<Note | null> {
    const all = await this.getAll();
    const idx = all.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, updatedAt: Date.now() };
    await this.persist(all);
    return all[idx];
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    const filtered = all.filter((n) => n.id !== id);
    await this.persist(filtered);
  }

  async togglePin(id: string): Promise<Note | null> {
    const all = await this.getAll();
    const idx = all.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    all[idx].pinned = !all[idx].pinned;
    all[idx].updatedAt = Date.now();
    await this.persist(all);
    return all[idx];
  }

  async clearAll(): Promise<void> {
    await this.persist([]);
  }

  async getStats(): Promise<{ total: number; pinned: number; categories: Record<NoteCategory, number> }> {
    const all = await this.getAll();
    const categories = {
      general: 0,
      idea: 0,
      todo: 0,
      meeting: 0,
      personal: 0,
    } as Record<NoteCategory, number>;
    for (const note of all) {
      categories[note.category] = (categories[note.category] || 0) + 1;
    }
    return {
      total: all.length,
      pinned: all.filter((n) => n.pinned).length,
      categories,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async persist(items: Note[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(NOTES_KEY, JSON.stringify(items));
    } catch {
      console.error('[NotesService] Error saving notes');
    }
  }
}

export const notesService = new NotesService();
