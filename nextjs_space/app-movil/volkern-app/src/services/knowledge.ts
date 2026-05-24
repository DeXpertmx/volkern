import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_knowledge';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  summary: string;
  categoryId: string;
  tags: string[];
  author: string;
  views: number;
  helpful: number;
  notHelpful: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const DEFAULT_CATEGORIES: KnowledgeCategory[] = [
  { id: 'getting_started', name: 'Primeros Pasos', icon: 'rocket', color: '#3B82F6', order: 0 },
  { id: 'guides', name: 'Guías', icon: 'book', color: '#10B981', order: 1 },
  { id: 'faq', name: 'FAQ', icon: 'help-circle', color: '#F59E0B', order: 2 },
  { id: 'troubleshooting', name: 'Solución de Problemas', icon: 'wrench', color: '#EF4444', order: 3 },
  { id: 'best_practices', name: 'Mejores Prácticas', icon: 'star', color: '#8B5CF6', order: 4 },
];

export const knowledgeService = {
  async getArticles(categoryId?: string): Promise<KnowledgeArticle[]> {
    const items = await getData<KnowledgeArticle[]>(STORAGE_KEY);
    if (!items) return [];
    let filtered = items.filter(a => a.published);
    if (categoryId) filtered = filtered.filter(a => a.categoryId === categoryId);
    return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getAllArticles(): Promise<KnowledgeArticle[]> {
    const items = await getData<KnowledgeArticle[]>(STORAGE_KEY);
    return items || [];
  },

  async getById(id: string): Promise<KnowledgeArticle | null> {
    const items = await this.getAllArticles();
    return items.find(a => a.id === id) || null;
  },

  async create(data: Omit<KnowledgeArticle, 'id' | 'views' | 'helpful' | 'notHelpful' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeArticle> {
    const items = await this.getAllArticles();
    const now = new Date().toISOString();
    const item: KnowledgeArticle = {
      ...data,
      id: generateId(),
      views: 0,
      helpful: 0,
      notHelpful: 0,
      createdAt: now,
      updatedAt: now,
    };
    items.unshift(item);
    await saveData(STORAGE_KEY, items);
    return item;
  },

  async update(id: string, data: Partial<KnowledgeArticle>): Promise<void> {
    const items = await this.getAllArticles();
    const idx = items.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Article not found');
    items[idx] = { ...items[idx], ...data, updatedAt: new Date().toISOString() };
    await saveData(STORAGE_KEY, items);
  },

  async delete(id: string): Promise<void> {
    const items = await this.getAllArticles();
    const idx = items.findIndex(a => a.id === id);
    if (idx === -1) return;
    items.splice(idx, 1);
    await saveData(STORAGE_KEY, items);
  },

  async markHelpful(id: string, helpful: boolean): Promise<void> {
    const items = await this.getAllArticles();
    const idx = items.findIndex(a => a.id === id);
    if (idx === -1) return;
    if (helpful) items[idx].helpful++;
    else items[idx].notHelpful++;
    await saveData(STORAGE_KEY, items);
  },

  async incrementViews(id: string): Promise<void> {
    const items = await this.getAllArticles();
    const idx = items.findIndex(a => a.id === id);
    if (idx === -1) return;
    items[idx].views++;
    await saveData(STORAGE_KEY, items);
  },

  async getCategories(): Promise<KnowledgeCategory[]> {
    const saved = await getData<KnowledgeCategory[]>(STORAGE_KEY + '_categories');
    return saved || DEFAULT_CATEGORIES;
  },

  async search(query: string): Promise<KnowledgeArticle[]> {
    const items = await this.getAllArticles();
    const q = query.toLowerCase();
    return items.filter(a =>
      a.published && (
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q))
      )
    );
  },
};
