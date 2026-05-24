import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────
export type DocumentType = 'pdf' | 'image' | 'spreadsheet' | 'text' | 'archive' | 'other';
export type DocumentStatus = 'active' | 'archived' | 'deleted';

export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  size: number;
  uri: string;
  folderId: string | null;
  tags: string[];
  status: DocumentStatus;
  favorite: boolean;
  sharedWith: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentFolder {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentInput {
  name: string;
  type: DocumentType;
  size: number;
  uri: string;
  folderId?: string | null;
  tags?: string[];
}

export interface CreateFolderInput {
  name: string;
  icon?: string;
  color?: string;
  parentId?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY_DOCS = 'VOLKERN_DOCUMENTS';
const STORAGE_KEY_FOLDERS = 'VOLKERN_DOC_FOLDERS';

export const DOCUMENT_TYPES: { value: DocumentType; label: string; icon: string; color: string }[] = [
  { value: 'pdf', label: 'PDF', icon: 'document', color: '#EF4444' },
  { value: 'image', label: 'Imagen', icon: 'image', color: '#3B82F6' },
  { value: 'spreadsheet', label: 'Hoja de cálculo', icon: 'grid', color: '#10B981' },
  { value: 'text', label: 'Texto', icon: 'document-text', color: '#8B5CF6' },
  { value: 'archive', label: 'Archivo comprimido', icon: 'archive', color: '#F59E0B' },
  { value: 'other', label: 'Otro', icon: 'document-attach', color: '#64748B' },
];

export const FOLDER_ICONS = [
  'folder', 'folder-open', 'bookmarks', 'briefcase', 'calculator',
  'calendar', 'camera', 'cart', 'chatbubbles', 'clipboard',
  'cloud', 'code-slash', 'color-palette', 'compass', 'construct',
  'contract', 'copy', 'create', 'cube', 'diamond',
];

export const FOLDER_COLORS = [
  '#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#64748B', '#84CC16',
];

const SEED_FOLDERS: DocumentFolder[] = [
  { id: 'f1', name: 'Documentos', icon: 'folder', color: '#2563EB', parentId: null, documentCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'f2', name: 'Imágenes', icon: 'image', color: '#3B82F6', parentId: null, documentCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'f3', name: 'Contratos', icon: 'document-text', color: '#EF4444', parentId: null, documentCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'f4', name: 'Facturas', icon: 'calculator', color: '#10B981', parentId: null, documentCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const SEED_DOCUMENTS: Document[] = [
  { id: 'd1', name: 'Manual de usuario.pdf', type: 'pdf', size: 2450000, uri: '/docs/manual.pdf', folderId: 'f1', tags: ['manual', 'guía'], status: 'active', favorite: false, sharedWith: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'd2', name: 'Logo empresa.png', type: 'image', size: 512000, uri: '/docs/logo.png', folderId: 'f2', tags: ['logo', 'branding'], status: 'active', favorite: true, sharedWith: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'd3', name: 'Contrato servicio.pdf', type: 'pdf', size: 1800000, uri: '/docs/contrato.pdf', folderId: 'f3', tags: ['contrato', 'cliente'], status: 'active', favorite: false, sharedWith: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'd4', name: 'Factura enero.pdf', type: 'pdf', size: 890000, uri: '/docs/factura-ene.pdf', folderId: 'f4', tags: ['factura', 'enero'], status: 'active', favorite: false, sharedWith: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'd5', name: 'Reporte ventas.xlsx', type: 'spreadsheet', size: 3200000, uri: '/docs/ventas.xlsx', folderId: 'f1', tags: ['reporte', 'ventas'], status: 'active', favorite: true, sharedWith: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'd6', name: 'Notas reunión.txt', type: 'text', size: 12000, uri: '/docs/notas.txt', folderId: null, tags: ['notas', 'reunión'], status: 'active', favorite: false, sharedWith: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'd7', name: 'Backup proyecto.zip', type: 'archive', size: 15000000, uri: '/docs/backup.zip', folderId: null, tags: ['backup', 'proyecto'], status: 'active', favorite: false, sharedWith: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'd8', name: 'Foto equipo.jpg', type: 'image', size: 2100000, uri: '/docs/equipo.jpg', folderId: 'f2', tags: ['equipo', 'evento'], status: 'active', favorite: false, sharedWith: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocumentTypeConfig(type: DocumentType) {
  return DOCUMENT_TYPES.find(t => t.value === type) || DOCUMENT_TYPES[5];
}

function generateId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────
class DocumentService {
  private foldersCache: DocumentFolder[] | null = null;
  private docsCache: Document[] | null = null;

  private async loadFolders(): Promise<DocumentFolder[]> {
    if (this.foldersCache) return this.foldersCache;
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY_FOLDERS);
      if (raw) {
        this.foldersCache = JSON.parse(raw);
        return this.foldersCache!;
      }
    } catch { /* ignore */ }
    this.foldersCache = [...SEED_FOLDERS];
    await this.persistFolders();
    return this.foldersCache;
  }

  private async persistFolders(): Promise<void> {
    if (!this.foldersCache) return;
    await SecureStore.setItemAsync(STORAGE_KEY_FOLDERS, JSON.stringify(this.foldersCache));
  }

  private async loadDocuments(): Promise<Document[]> {
    if (this.docsCache) return this.docsCache;
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY_DOCS);
      if (raw) {
        this.docsCache = JSON.parse(raw);
        return this.docsCache!;
      }
    } catch { /* ignore */ }
    this.docsCache = [...SEED_DOCUMENTS];
    await this.persistDocuments();
    return this.docsCache;
  }

  private async persistDocuments(): Promise<void> {
    if (!this.docsCache) return;
    await SecureStore.setItemAsync(STORAGE_KEY_DOCS, JSON.stringify(this.docsCache));
  }

  async getAllFolders(): Promise<DocumentFolder[]> {
    return this.loadFolders();
  }

  async getAllDocuments(params?: { folderId?: string | null; search?: string; type?: DocumentType }): Promise<Document[]> {
    let docs = await this.loadDocuments();
    docs = docs.filter(d => d.status !== 'deleted');
    if (params?.folderId !== undefined) {
      docs = docs.filter(d => d.folderId === params.folderId);
    }
    if (params?.type) {
      docs = docs.filter(d => d.type === params.type);
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      docs = docs.filter(d => d.name.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q)));
    }
    return docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getFavorites(): Promise<Document[]> {
    const docs = await this.loadDocuments();
    return docs.filter(d => d.favorite && d.status === 'active');
  }

  async getRecent(limit: number = 10): Promise<Document[]> {
    const docs = await this.loadDocuments();
    return docs.filter(d => d.status === 'active').sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, limit);
  }

  async getStats(): Promise<{ total: number; byType: Record<string, number>; totalSize: number; favoritesCount: number; foldersCount: number }> {
    const docs = await this.loadDocuments();
    const active = docs.filter(d => d.status === 'active');
    const byType: Record<string, number> = {};
    let totalSize = 0;
    for (const d of active) {
      byType[d.type] = (byType[d.type] || 0) + 1;
      totalSize += d.size;
    }
    const folders = await this.loadFolders();
    return {
      total: active.length,
      byType,
      totalSize,
      favoritesCount: active.filter(d => d.favorite).length,
      foldersCount: folders.length,
    };
  }

  async createDocument(input: CreateDocumentInput): Promise<Document> {
    const docs = await this.loadDocuments();
    const doc: Document = {
      id: generateId(),
      name: input.name,
      type: input.type,
      size: input.size,
      uri: input.uri,
      folderId: input.folderId ?? null,
      tags: input.tags || [],
      status: 'active',
      favorite: false,
      sharedWith: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    docs.push(doc);
    this.docsCache = docs;
    await this.persistDocuments();
    return doc;
  }

  async updateDocument(id: string, input: Partial<Pick<Document, 'name' | 'folderId' | 'tags' | 'favorite' | 'status'>>): Promise<Document> {
    const docs = await this.loadDocuments();
    const idx = docs.findIndex(d => d.id === id);
    if (idx === -1) throw new Error('Documento no encontrado');
    docs[idx] = { ...docs[idx], ...input, updatedAt: new Date().toISOString() };
    this.docsCache = docs;
    await this.persistDocuments();
    return docs[idx];
  }

  async deleteDocument(id: string): Promise<void> {
    const docs = await this.loadDocuments();
    const idx = docs.findIndex(d => d.id === id);
    if (idx === -1) throw new Error('Documento no encontrado');
    docs[idx].status = 'deleted';
    docs[idx].updatedAt = new Date().toISOString();
    this.docsCache = docs;
    await this.persistDocuments();
  }

  async toggleFavorite(id: string): Promise<Document> {
    const docs = await this.loadDocuments();
    const doc = docs.find(d => d.id === id);
    if (!doc) throw new Error('Documento no encontrado');
    doc.favorite = !doc.favorite;
    doc.updatedAt = new Date().toISOString();
    this.docsCache = docs;
    await this.persistDocuments();
    return doc;
  }

  async createFolder(input: CreateFolderInput): Promise<DocumentFolder> {
    const folders = await this.loadFolders();
    const folder: DocumentFolder = {
      id: `f-${Date.now()}`,
      name: input.name,
      icon: input.icon || 'folder',
      color: input.color || '#2563EB',
      parentId: input.parentId ?? null,
      documentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    folders.push(folder);
    this.foldersCache = folders;
    await this.persistFolders();
    return folder;
  }

  async updateFolder(id: string, input: Partial<Pick<DocumentFolder, 'name' | 'icon' | 'color'>>): Promise<DocumentFolder> {
    const folders = await this.loadFolders();
    const idx = folders.findIndex(f => f.id === id);
    if (idx === -1) throw new Error('Carpeta no encontrada');
    folders[idx] = { ...folders[idx], ...input, updatedAt: new Date().toISOString() };
    this.foldersCache = folders;
    await this.persistFolders();
    return folders[idx];
  }

  async deleteFolder(id: string): Promise<void> {
    const folders = await this.loadFolders();
    const idx = folders.findIndex(f => f.id === id);
    if (idx === -1) throw new Error('Carpeta no encontrada');
    folders.splice(idx, 1);
    // Move documents to root
    const docs = await this.loadDocuments();
    for (const doc of docs) {
      if (doc.folderId === id) {
        doc.folderId = null;
        doc.updatedAt = new Date().toISOString();
      }
    }
    this.foldersCache = folders;
    this.docsCache = docs;
    await this.persistFolders();
    await this.persistDocuments();
  }

  async clearAll(): Promise<void> {
    this.docsCache = [];
    this.foldersCache = [];
    await SecureStore.deleteItemAsync(STORAGE_KEY_DOCS);
    await SecureStore.deleteItemAsync(STORAGE_KEY_FOLDERS);
  }
}

export const documentService = new DocumentService();
export { formatSize, getDocumentTypeConfig };
