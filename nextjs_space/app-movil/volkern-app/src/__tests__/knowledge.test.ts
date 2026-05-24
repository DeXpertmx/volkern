import { knowledgeService } from '../services/knowledge';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

const mockArticles: any[] = [
  { id: 'a1', title: 'Article 1', content: 'Content 1', summary: 'Summary 1', categoryId: 'guides', tags: ['guide'], published: true, helpful: 0, notHelpful: 0, views: 10, author: 'Test', createdAt: '', updatedAt: '' },
  { id: 'a2', title: 'Article 2', content: 'Content 2', summary: 'Summary 2', categoryId: 'faq', tags: ['faq'], published: true, helpful: 5, notHelpful: 1, views: 20, author: 'Test', createdAt: '', updatedAt: '' },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('knowledgeService.getAllArticles', () => {
  it('returns all articles', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    const result = await knowledgeService.getAllArticles();
    expect(result).toHaveLength(2);
  });
});

describe('knowledgeService.getArticles', () => {
  it('returns published articles by category', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    const result = await knowledgeService.getArticles('guides');
    expect(result).toHaveLength(1);
  });
});

describe('knowledgeService.getById', () => {
  it('returns article by id', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    const result = await knowledgeService.getById('a1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('a1');
  });
});

describe('knowledgeService.create', () => {
  it('creates article', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await knowledgeService.create({ title: 'New', content: 'Content', summary: 'Sum', categoryId: 'guides', tags: [], author: 'Test', published: true });
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('knowledgeService.search', () => {
  it('searches published articles', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    const result = await knowledgeService.search('Article');
    expect(result).toHaveLength(2);
  });
});

describe('knowledgeService.markHelpful', () => {
  it('increments helpful count', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    await knowledgeService.markHelpful('a1', true);
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('knowledgeService.incrementViews', () => {
  it('increments view count', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    await knowledgeService.incrementViews('a1');
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('no-op for non-existent article', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    await knowledgeService.incrementViews('bad-id');
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});

describe('knowledgeService.update', () => {
  it('throws on not found', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    await expect(knowledgeService.update('bad-id', { title: 'X' })).rejects.toThrow('Article not found');
  });

  it('updates existing article and saves', async () => {
    mockedGetData.mockResolvedValue([...mockArticles]);
    await knowledgeService.update('a1', { title: 'Updated' });
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('knowledgeService.delete', () => {
  it('no-op for non-existent', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    await knowledgeService.delete('bad-id');
    expect(mockedSaveData).not.toHaveBeenCalled();
  });

  it('deletes existing article and saves', async () => {
    mockedGetData.mockResolvedValue([...mockArticles]);
    await knowledgeService.delete('a1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('knowledgeService.getCategories', () => {
  it('returns saved categories when available', async () => {
    mockedGetData.mockResolvedValue([{ id: 'custom', name: 'Custom', icon: 'star', color: '#000', order: 0 }]);
    const result = await knowledgeService.getCategories();
    expect(result).toHaveLength(1);
  });

  it('returns default categories when none saved', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await knowledgeService.getCategories();
    expect(result.length).toBeGreaterThanOrEqual(5);
  });
});

describe('knowledgeService.markHelpful', () => {
  it('increments notHelpful when false', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    await knowledgeService.markHelpful('a1', false);
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('no-op for non-existent article', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    await knowledgeService.markHelpful('bad-id', true);
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});

describe('knowledgeService.search', () => {
  it('returns empty when no match', async () => {
    mockedGetData.mockResolvedValue(mockArticles);
    const result = await knowledgeService.search('zzzzz');
    expect(result).toHaveLength(0);
  });
});
