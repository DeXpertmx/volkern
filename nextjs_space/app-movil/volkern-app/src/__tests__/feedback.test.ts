import { feedbackService } from '../services/feedback';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.MockedFunction<typeof getData>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

beforeEach(() => { jest.clearAllMocks(); });

describe('feedbackService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await feedbackService.getAll()).toEqual([]);
  });
});

describe('feedbackService.create', () => {
  it('creates feedback with userId and userName', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await feedbackService.create({ type: 'bug', message: 'Bug found', rating: 3 }, 'user1', 'Test User');
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('creates feedback with default rating when not provided', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await feedbackService.create({ type: 'feature', message: 'New feature' }, 'user2', 'Test User');
    expect(result.rating).toBe(0);
    expect(result.screenshot).toBeNull();
  });
});

describe('feedbackService.updateStatus', () => {
  it('updates feedback status', async () => {
    mockedGetData.mockResolvedValue([{ id: 'f1', type: 'bug', message: 'Bug', status: 'new', createdAt: '', updatedAt: '' }]);
    await feedbackService.updateStatus('f1', 'reviewed');
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('does nothing for non-existent id', async () => {
    mockedGetData.mockResolvedValue([{ id: 'f1', type: 'bug', message: 'Bug', status: 'new', createdAt: '', updatedAt: '' }]);
    mockedSaveData.mockClear();
    await feedbackService.updateStatus('nonexistent', 'reviewed');
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});

describe('feedbackService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetData.mockResolvedValue([{ id: 'f1', type: 'bug', message: 'Bug', status: 'new', createdAt: '', updatedAt: '' }]);
    const stats = await feedbackService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('byType');
  });
});
