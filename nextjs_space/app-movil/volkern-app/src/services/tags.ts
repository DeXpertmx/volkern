import { getData, saveData } from './secure-storage';

const STORAGE_KEY = '@volkern_tags';

// ─── Types ────────────────────────────────────────────────────────────────────
export type TagGroup = 'general' | 'client' | 'lead' | 'project' | 'internal';

export interface Tag {
  id: string;
  name: string;
  color: string;
  group: TagGroup;
  isSmart: boolean;
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface TagGroupInfo {
  value: TagGroup;
  labelKey: string;
  icon: string;
  color: string;
}

export const TAG_GROUPS: TagGroupInfo[] = [
  { value: 'general', labelKey: 'groupGeneral', icon: 'apps', color: '#6B7280' },
  { value: 'client', labelKey: 'groupClient', icon: 'person', color: '#3B82F6' },
  { value: 'lead', labelKey: 'groupLead', icon: 'trending-up', color: '#F59E0B' },
  { value: 'project', labelKey: 'groupProject', icon: 'folder', color: '#10B981' },
  { value: 'internal', labelKey: 'groupInternal', icon: 'shield', color: '#8B5CF6' },
];

export const TAG_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981', '#3B82F6',
  '#6366F1', '#8B5CF6', '#EC4899', '#6B7280', '#14B8A6',
  '#84CC16', '#06B6D4', '#D946EF', '#F43F5E', '#0EA5E9',
];

// ─── Seed Tags ────────────────────────────────────────────────────────────────
const SEED_TAGS: Tag[] = [
  { id: 'seed-vip', name: 'VIP', color: '#EF4444', group: 'client', isSmart: false, usageCount: 0, createdAt: 0, updatedAt: 0 },
  { id: 'seed-regular', name: 'Regular', color: '#3B82F6', group: 'client', isSmart: false, usageCount: 0, createdAt: 1, updatedAt: 1 },
  { id: 'seed-new', name: 'Nuevo', color: '#10B981', group: 'lead', isSmart: true, usageCount: 0, createdAt: 2, updatedAt: 2 },
  { id: 'seed-hot', name: 'Caliente', color: '#F59E0B', group: 'lead', isSmart: false, usageCount: 0, createdAt: 3, updatedAt: 3 },
  { id: 'seed-followup', name: 'Seguimiento', color: '#8B5CF6', group: 'general', isSmart: true, usageCount: 0, createdAt: 4, updatedAt: 4 },
  { id: 'seed-internal', name: 'Interno', color: '#6B7280', group: 'internal', isSmart: false, usageCount: 0, createdAt: 5, updatedAt: 5 },
  { id: 'seed-partner', name: 'Partner', color: '#EC4899', group: 'general', isSmart: false, usageCount: 0, createdAt: 6, updatedAt: 6 },
];

// ─── Service ──────────────────────────────────────────────────────────────────
class TagsService {
  private cache: Tag[] | null = null;

  private isSeedTag(id: string): boolean {
    return id.startsWith('seed-');
  }

  private async loadAll(): Promise<Tag[]> {
    if (this.cache) return this.cache;
    const stored = await getData<Tag[]>(STORAGE_KEY);
    const userTags = stored || [];
    const all = [...SEED_TAGS, ...userTags];
    this.cache = all;
    return all;
  }

  private async persistUserTags(userTags: Tag[]): Promise<void> {
    await saveData(STORAGE_KEY, userTags);
    this.cache = null;
  }

  async getAll(): Promise<Tag[]> {
    return this.loadAll();
  }

  async getByGroup(group: TagGroup): Promise<Tag[]> {
    const all = await this.loadAll();
    return all.filter((t) => t.group === group);
  }

  async getSmartTags(): Promise<Tag[]> {
    const all = await this.loadAll();
    return all.filter((t) => t.isSmart);
  }

  async getById(id: string): Promise<Tag | undefined> {
    const all = await this.loadAll();
    return all.find((t) => t.id === id);
  }

  async create(data: { name: string; color: string; group: TagGroup; isSmart: boolean }): Promise<Tag> {
    const stored = await getData<Tag[]>(STORAGE_KEY);
    const userTags = stored || [];
    const now = Date.now();
    const tag: Tag = {
      ...data,
      id: `tag_${now}_${Math.random().toString(36).slice(2, 8)}`,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    userTags.push(tag);
    await this.persistUserTags(userTags);
    return tag;
  }

  async update(id: string, data: Partial<Omit<Tag, 'id' | 'createdAt' | 'usageCount'>>): Promise<Tag | undefined> {
    if (this.isSeedTag(id)) return SEED_TAGS.find((t) => t.id === id);
    const stored = await getData<Tag[]>(STORAGE_KEY);
    const userTags = stored || [];
    const idx = userTags.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    userTags[idx] = { ...userTags[idx], ...data, updatedAt: Date.now() };
    await this.persistUserTags(userTags);
    return userTags[idx];
  }

  async delete(id: string): Promise<boolean> {
    if (this.isSeedTag(id)) return false;
    const stored = await getData<Tag[]>(STORAGE_KEY);
    const userTags = stored || [];
    const filtered = userTags.filter((t) => t.id !== id);
    if (filtered.length === userTags.length) return false;
    await this.persistUserTags(filtered);
    return true;
  }

  async incrementUsage(id: string): Promise<void> {
    if (this.isSeedTag(id)) return;
    const stored = await getData<Tag[]>(STORAGE_KEY);
    const userTags = stored || [];
    const idx = userTags.findIndex((t) => t.id === id);
    if (idx !== -1) {
      userTags[idx].usageCount += 1;
      await this.persistUserTags(userTags);
    }
  }

  async toggleSmart(id: string): Promise<void> {
    if (this.isSeedTag(id)) return;
    const stored = await getData<Tag[]>(STORAGE_KEY);
    const userTags = stored || [];
    const idx = userTags.findIndex((t) => t.id === id);
    if (idx !== -1) {
      userTags[idx].isSmart = !userTags[idx].isSmart;
      userTags[idx].updatedAt = Date.now();
      await this.persistUserTags(userTags);
    }
  }

  async getStats(): Promise<{ total: number; smartCount: number; mostUsed: Tag[] }> {
    const all = await this.loadAll();
    const sorted = [...all].sort((a, b) => b.usageCount - a.usageCount);
    return {
      total: all.length,
      smartCount: all.filter((t) => t.isSmart).length,
      mostUsed: sorted.slice(0, 5),
    };
  }
}

export const tagsService = new TagsService();
