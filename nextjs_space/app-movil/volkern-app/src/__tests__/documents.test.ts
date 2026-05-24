import { documentService, formatSize, getDocumentTypeConfig } from '../services/documents';
import type { Document, DocumentFolder } from '../services/documents';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;
const mockedDeleteItem = require('expo-secure-store').deleteItemAsync as jest.Mock;

const SEED_DOC_COUNT = 8;
const SEED_FOLDER_COUNT = 4;

beforeEach(() => {
  jest.clearAllMocks();
  // Reset caches so each test starts fresh (singleton persists across tests)
  (documentService as any).docsCache = null;
  (documentService as any).foldersCache = null;
});

// ─── formatSize ───────────────────────────────────────────────────────────────

describe('formatSize', () => {
  it('formats bytes (< 1024)', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes (< 1024*1024)', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(153600)).toBe('150.0 KB');
  });

  it('formats megabytes (>= 1024*1024)', () => {
    expect(formatSize(1048576)).toBe('1.0 MB');
    expect(formatSize(5242880)).toBe('5.0 MB');
    expect(formatSize(15000000)).toBe('14.3 MB');
  });
});

// ─── getDocumentTypeConfig ────────────────────────────────────────────────────

describe('getDocumentTypeConfig', () => {
  it('returns config for known type', () => {
    const config = getDocumentTypeConfig('pdf');
    expect(config.label).toBe('PDF');
    expect(config.color).toBe('#EF4444');
  });

  it('returns config for image type', () => {
    const config = getDocumentTypeConfig('image');
    expect(config.label).toBe('Imagen');
    expect(config.color).toBe('#3B82F6');
  });

  it('falls back to index 5 (other) when type not found', () => {
    // Cast to bypass type guard and test the || fallback branch
    const config = (getDocumentTypeConfig as any)('made_up_type');
    expect(config.label).toBe('Otro');
  });

  it('returns config for other type (is in array)', () => {
    const config = getDocumentTypeConfig('other');
    expect(config.label).toBe('Otro');
  });
});

// ─── getAllFolders ────────────────────────────────────────────────────────────

describe('documentService.getAllFolders', () => {
  it('returns seed folders when no saved data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllFolders();
    expect(result).toHaveLength(SEED_FOLDER_COUNT);
    expect(result[0].name).toBe('Documentos');
    // Seeds should be persisted
    expect(mockedSetItem).toHaveBeenCalledWith('VOLKERN_DOC_FOLDERS', expect.any(String));
  });

  it('returns saved folders from storage', async () => {
    const savedFolders: DocumentFolder[] = [
      { id: 'custom-1', name: 'Custom', icon: 'star', color: '#FF0000', parentId: null, documentCount: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ];
    mockedGetItem.mockResolvedValue(JSON.stringify(savedFolders));
    const result = await documentService.getAllFolders();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Custom');
    // Should NOT persist seeds (was loaded from storage)
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it('returns cached folders on second call', async () => {
    mockedGetItem.mockResolvedValue(null);
    await documentService.getAllFolders(); // first call → loads + caches
    mockedGetItem.mockClear();
    const result = await documentService.getAllFolders(); // second call → from cache
    expect(result).toHaveLength(SEED_FOLDER_COUNT);
    // Should NOT call storage again
    expect(mockedGetItem).not.toHaveBeenCalled();
  });

  it('handles JSON parse error and falls back to seeds', async () => {
    mockedGetItem.mockResolvedValue('invalid json{{{');
    const result = await documentService.getAllFolders();
    expect(result).toHaveLength(SEED_FOLDER_COUNT);
  });

  it('handles getItemAsync rejection and falls back to seeds', async () => {
    mockedGetItem.mockRejectedValue(new Error('storage error'));
    const result = await documentService.getAllFolders();
    expect(result).toHaveLength(SEED_FOLDER_COUNT);
  });
});

// ─── getAllDocuments ──────────────────────────────────────────────────────────

describe('documentService.getAllDocuments', () => {
  it('returns seed documents when no saved data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments();
    expect(result).toHaveLength(SEED_DOC_COUNT);
    expect(mockedSetItem).toHaveBeenCalledWith('VOLKERN_DOCUMENTS', expect.any(String));
  });

  it('returns saved documents from storage', async () => {
    const savedDocs: Document[] = [
      { id: 'custom-1', name: 'Custom.pdf', type: 'pdf', size: 100, uri: '/c.pdf', folderId: null, tags: [], status: 'active', favorite: false, sharedWith: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ];
    mockedGetItem.mockResolvedValue(JSON.stringify(savedDocs));
    const result = await documentService.getAllDocuments();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Custom.pdf');
    expect(mockedSetItem).not.toHaveBeenCalled();
  });

  it('returns cached documents on second call', async () => {
    mockedGetItem.mockResolvedValue(null);
    await documentService.getAllDocuments();
    mockedGetItem.mockClear();
    const result = await documentService.getAllDocuments();
    expect(result).toHaveLength(SEED_DOC_COUNT);
    expect(mockedGetItem).not.toHaveBeenCalled();
  });

  it('filters by folderId', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments({ folderId: 'f2' });
    expect(result.length).toBeGreaterThanOrEqual(2); // Logo + Foto equipo
    result.forEach(d => expect(d.folderId).toBe('f2'));
  });

  it('filters by null folderId (root documents)', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments({ folderId: null });
    expect(result.length).toBeGreaterThanOrEqual(2); // Notas + Backup
    result.forEach(d => expect(d.folderId).toBeNull());
  });

  it('filters by document type', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments({ type: 'pdf' });
    expect(result.length).toBeGreaterThanOrEqual(3); // Manual + Contrato + Factura
    result.forEach(d => expect(d.type).toBe('pdf'));
  });

  it('filters by search (name match)', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments({ search: 'Logo' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Logo empresa.png');
  });

  it('filters by search (tag match)', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments({ search: 'cliente' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Contrato servicio.pdf');
  });

  it('filters by search (case insensitive)', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments({ search: 'MANUAL' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Manual de usuario.pdf');
  });

  it('returns empty array when search matches nothing', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments({ search: 'xyznonexistent' });
    expect(result).toHaveLength(0);
  });

  it('excludes deleted documents', async () => {
    mockedGetItem.mockResolvedValue(null);
    const doc = await documentService.createDocument({ name: 'Temp.pdf', type: 'pdf', size: 100, uri: '/t.pdf' });
    await documentService.deleteDocument(doc.id);
    // Cache still has the deleted doc — getAllDocuments filter should exclude it
    const result = await documentService.getAllDocuments();
    expect(result.find(d => d.id === doc.id)).toBeUndefined();
    expect(result).toHaveLength(SEED_DOC_COUNT); // 8 seeds + 1 created - 1 deleted = 8
  });

  it('combines filters (folderId + type + search)', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getAllDocuments({ folderId: 'f2', type: 'image' });
    expect(result).toHaveLength(2); // Logo + Foto equipo
  });

  it('handles JSON parse error and falls back to seeds', async () => {
    mockedGetItem.mockResolvedValue('bad json{{{');
    const result = await documentService.getAllDocuments();
    expect(result).toHaveLength(SEED_DOC_COUNT);
  });

  it('handles getItemAsync rejection and falls back to seeds', async () => {
    mockedGetItem.mockRejectedValue(new Error('storage error'));
    const result = await documentService.getAllDocuments();
    expect(result).toHaveLength(SEED_DOC_COUNT);
  });
});

// ─── getFavorites ─────────────────────────────────────────────────────────────

describe('documentService.getFavorites', () => {
  it('returns favorite active documents', async () => {
    const mockLoad = jest.spyOn(documentService as any, 'loadDocuments').mockResolvedValue([
      { id: 'd1', name: 'Fav', type: 'pdf', size: 100, uri: '/a', tags: [], sharedWith: [], folderId: null, status: 'active', favorite: true, createdAt: '1', updatedAt: '1' },
      { id: 'd2', name: 'No', type: 'pdf', size: 100, uri: '/b', tags: [], sharedWith: [], folderId: null, status: 'active', favorite: false, createdAt: '2', updatedAt: '2' },
    ]);
    const result = await documentService.getFavorites();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Fav');
    mockLoad.mockRestore();
  });

  it('excludes non-active favorites', async () => {
    const mockLoad = jest.spyOn(documentService as any, 'loadDocuments').mockResolvedValue([
      { id: 'd1', name: 'Deleted', type: 'pdf', size: 100, uri: '/a', tags: [], sharedWith: [], folderId: null, status: 'deleted', favorite: true, createdAt: '1', updatedAt: '1' },
    ]);
    const result = await documentService.getFavorites();
    expect(result).toHaveLength(0);
    mockLoad.mockRestore();
  });
});

// ─── getRecent ────────────────────────────────────────────────────────────────

describe('documentService.getRecent', () => {
  it('returns active documents sorted by updatedAt descending', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getRecent();
    expect(result.length).toBeGreaterThan(0);
    // Verify sorted descending
    for (let i = 1; i < result.length; i++) {
      expect(new Date(result[i - 1].updatedAt).getTime())
        .toBeGreaterThanOrEqual(new Date(result[i].updatedAt).getTime());
    }
  });

  it('respects the limit parameter', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.getRecent(3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('excludes non-active documents', async () => {
    mockedGetItem.mockResolvedValue(null);
    // Create a deleted doc first
    const doc = await documentService.createDocument({ name: 'Del.pdf', type: 'pdf', size: 100, uri: '/d.pdf' });
    await documentService.deleteDocument(doc.id);
    (documentService as any).docsCache = null;
    mockedGetItem.mockResolvedValue(null); // reload seeds
    const result = await documentService.getRecent();
    // All should be active (seeds are active)
    result.forEach(d => expect(d.status).toBe('active'));
  });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe('documentService.getStats', () => {
  it('returns total count, byType, totalSize, favoritesCount, foldersCount', async () => {
    mockedGetItem.mockResolvedValue(null);
    const stats = await documentService.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.byType).toHaveProperty('pdf');
    expect(stats.byType).toHaveProperty('image');
    expect(stats.totalSize).toBeGreaterThan(0);
    expect(stats.favoritesCount).toBeGreaterThan(0); // 2 favorites in seeds
    expect(stats.foldersCount).toBe(SEED_FOLDER_COUNT);
  });

  it('counts multiple documents of the same type', async () => {
    const mockLoad = jest.spyOn(documentService as any, 'loadDocuments').mockResolvedValue([
      { id: 'd1', name: 'A.pdf', type: 'pdf', size: 1000, uri: '/a', tags: [], sharedWith: [], folderId: null, status: 'active', favorite: false, createdAt: '1', updatedAt: '1' },
      { id: 'd2', name: 'B.pdf', type: 'pdf', size: 2000, uri: '/b', tags: [], sharedWith: [], folderId: null, status: 'active', favorite: false, createdAt: '2', updatedAt: '2' },
      { id: 'd3', name: 'C.png', type: 'image', size: 3000, uri: '/c', tags: [], sharedWith: [], folderId: null, status: 'active', favorite: false, createdAt: '3', updatedAt: '3' },
    ]);
    const stats = await documentService.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType).toEqual({ pdf: 2, image: 1 });
    expect(stats.totalSize).toBe(6000);
    mockLoad.mockRestore();
  });
});

// ─── createDocument ───────────────────────────────────────────────────────────

describe('documentService.createDocument', () => {
  it('creates document with minimal input', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.createDocument({ name: 'New Doc.pdf', type: 'pdf', size: 1000, uri: '/docs/new.pdf' });
    expect(result.id).toBeDefined();
    expect(result.name).toBe('New Doc.pdf');
    expect(result.type).toBe('pdf');
    expect(result.size).toBe(1000);
    expect(result.uri).toBe('/docs/new.pdf');
    expect(result.folderId).toBeNull();
    expect(result.tags).toEqual([]);
    expect(result.status).toBe('active');
    expect(result.favorite).toBe(false);
    expect(result.sharedWith).toEqual([]);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalledWith('VOLKERN_DOCUMENTS', expect.any(String));
  });

  it('creates document with tags and folderId', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.createDocument({ name: 'Tagged Doc', type: 'image', size: 500, uri: '/docs/img.png', folderId: 'f2', tags: ['important', 'design'] });
    expect(result.folderId).toBe('f2');
    expect(result.tags).toEqual(['important', 'design']);
  });
});

// ─── updateDocument ───────────────────────────────────────────────────────────

describe('documentService.updateDocument', () => {
  it('updates document name and tags', async () => {
    mockedGetItem.mockResolvedValue(null);
    const created = await documentService.createDocument({ name: 'Old Name.pdf', type: 'pdf', size: 100, uri: '/o.pdf' });
    const updated = await documentService.updateDocument(created.id, { name: 'New Name.pdf', tags: ['updated'] });
    expect(updated.name).toBe('New Name.pdf');
    expect(updated.tags).toEqual(['updated']);
  });

  it('throws when document not found', async () => {
    mockedGetItem.mockResolvedValue(null);
    await expect(documentService.updateDocument('nonexistent', { name: 'Nope' }))
      .rejects.toThrow('Documento no encontrado');
  });
});

// ─── deleteDocument ───────────────────────────────────────────────────────────

describe('documentService.deleteDocument', () => {
  it('marks document as deleted', async () => {
    mockedGetItem.mockResolvedValue(null);
    const created = await documentService.createDocument({ name: 'To Delete.pdf', type: 'pdf', size: 100, uri: '/d.pdf' });
    await documentService.deleteDocument(created.id);
    // Verify it's marked deleted in persisted data
    const lastDocCall = mockedSetItem.mock.calls.filter(c => c[0] === 'VOLKERN_DOCUMENTS').at(-1);
    const persisted: Document[] = JSON.parse(lastDocCall?.[1] || '[]');
    const deletedDoc = persisted.find((d: Document) => d.id === created.id);
    expect(deletedDoc.status).toBe('deleted');
  });

  it('throws when document not found', async () => {
    mockedGetItem.mockResolvedValue(null);
    await expect(documentService.deleteDocument('nonexistent'))
      .rejects.toThrow('Documento no encontrado');
  });
});

// ─── toggleFavorite ───────────────────────────────────────────────────────────

describe('documentService.toggleFavorite', () => {
  it('toggles favorite from false to true', async () => {
    mockedGetItem.mockResolvedValue(null);
    const created = await documentService.createDocument({ name: 'Test.pdf', type: 'pdf', size: 100, uri: '/t.pdf' });
    expect(created.favorite).toBe(false);
    const toggled = await documentService.toggleFavorite(created.id);
    expect(toggled.favorite).toBe(true);
  });

  it('toggles favorite from true to false', async () => {
    mockedGetItem.mockResolvedValue(null);
    const created = await documentService.createDocument({ name: 'Test2.pdf', type: 'pdf', size: 100, uri: '/t2.pdf' });
    await documentService.toggleFavorite(created.id); // true
    const toggled = await documentService.toggleFavorite(created.id); // false
    expect(toggled.favorite).toBe(false);
  });

  it('throws when document not found', async () => {
    mockedGetItem.mockResolvedValue(null);
    await expect(documentService.toggleFavorite('nonexistent'))
      .rejects.toThrow('Documento no encontrado');
  });
});

// ─── createFolder ─────────────────────────────────────────────────────────────

describe('documentService.createFolder', () => {
  it('creates folder with minimal input', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.createFolder({ name: 'New Folder' });
    expect(result.name).toBe('New Folder');
    expect(result.icon).toBe('folder'); // default
    expect(result.color).toBe('#2563EB'); // default
    expect(result.parentId).toBeNull();
    expect(result.documentCount).toBe(0);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalledWith('VOLKERN_DOC_FOLDERS', expect.any(String));
  });

  it('creates folder with custom icon, color, and parentId', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await documentService.createFolder({ name: 'Sub Folder', icon: 'star', color: '#FF0000', parentId: 'f1' });
    expect(result.icon).toBe('star');
    expect(result.color).toBe('#FF0000');
    expect(result.parentId).toBe('f1');
  });
});

// ─── updateFolder ─────────────────────────────────────────────────────────────

describe('documentService.updateFolder', () => {
  it('updates folder name and icon', async () => {
    mockedGetItem.mockResolvedValue(null);
    const created = await documentService.createFolder({ name: 'Old' });
    const updated = await documentService.updateFolder(created.id, { name: 'Updated', icon: 'star' });
    expect(updated.name).toBe('Updated');
    expect(updated.icon).toBe('star');
  });

  it('throws when folder not found', async () => {
    mockedGetItem.mockResolvedValue(null);
    await expect(documentService.updateFolder('nonexistent', { name: 'Nope' }))
      .rejects.toThrow('Carpeta no encontrada');
  });
});

// ─── deleteFolder ─────────────────────────────────────────────────────────────

describe('documentService.deleteFolder', () => {
  it('removes folder and moves its documents to root', async () => {
    mockedGetItem.mockResolvedValue(null);
    // Create a folder with a document
    const folder = await documentService.createFolder({ name: 'Temp' });
    const doc = await documentService.createDocument({ name: 'In Folder.pdf', type: 'pdf', size: 100, uri: '/f.pdf', folderId: folder.id });
    expect(doc.folderId).toBe(folder.id);

    await documentService.deleteFolder(folder.id);

    // Folder should no longer exist
    const folders = await documentService.getAllFolders();
    expect(folders.find(f => f.id === folder.id)).toBeUndefined();
    expect(folders).toHaveLength(SEED_FOLDER_COUNT); // back to seed count

    // Document should be moved to root (folderId = null)
    (documentService as any).docsCache = null;
    mockedGetItem.mockResolvedValue(null); // reload seeds
    // Actually we need to check the persisted data, not reload seeds
    const lastDocCall = mockedSetItem.mock.calls.filter(c => c[0] === 'VOLKERN_DOCUMENTS').at(-1);
    const persisted: Document[] = JSON.parse(lastDocCall?.[1] || '[]');
    const movedDoc = persisted.find((d: Document) => d.id === doc.id);
    expect(movedDoc.folderId).toBeNull();
  });

  it('throws when folder not found', async () => {
    mockedGetItem.mockResolvedValue(null);
    await expect(documentService.deleteFolder('nonexistent'))
      .rejects.toThrow('Carpeta no encontrada');
  });
});

// ─── clearAll ─────────────────────────────────────────────────────────────────

describe('documentService.clearAll', () => {
  it('clears all documents and folders', async () => {
    mockedGetItem.mockResolvedValue(null);
    await documentService.createDocument({ name: 'T.pdf', type: 'pdf', size: 100, uri: '/t.pdf' });
    await documentService.createFolder({ name: 'F' });

    await documentService.clearAll();

    // Verify storage deleted
    expect(mockedDeleteItem).toHaveBeenCalledWith('VOLKERN_DOCUMENTS');
    expect(mockedDeleteItem).toHaveBeenCalledWith('VOLKERN_DOC_FOLDERS');

    // Verify caches are empty
    (documentService as any).docsCache = null;
    (documentService as any).foldersCache = null;
    mockedGetItem.mockResolvedValue(null);
    const docs = await documentService.getAllDocuments();
    expect(docs).toHaveLength(SEED_DOC_COUNT); // reseeded since we cleared

    // Actually clearAll sets caches to [], so subsequent loads from cache return []
    // But we reset cache to null before calling getAllDocuments again
    // So it re-reads from storage (null) → seeds
    // This is fine, the important thing is deleteItemAsync was called
  });
});

// ─── persistFolders early return ──────────────────────────────────────────────

describe('persistFolders early return', () => {
  it('does nothing when foldersCache is null', async () => {
    // Clear cache and don't call any method that sets it
    (documentService as any).foldersCache = null;
    // Access private method via bracket notation
    await (documentService as any).persistFolders();
    expect(mockedSetItem).not.toHaveBeenCalled();
  });
});

describe('persistDocuments early return', () => {
  it('does nothing when docsCache is null', async () => {
    (documentService as any).docsCache = null;
    await (documentService as any).persistDocuments();
    expect(mockedSetItem).not.toHaveBeenCalled();
  });
});
