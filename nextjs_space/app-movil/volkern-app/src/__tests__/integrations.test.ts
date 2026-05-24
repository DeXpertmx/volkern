jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

import { integrationsService } from '../services/integrations';
import { getData, saveData } from '../services/secure-storage';

function createMockItems() {
  return [
    { id: 'test-1', provider: 'slack', name: 'Slack', config: {}, status: 'connected', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
    { id: 'test-2', provider: 'google_drive', name: 'Google Drive', config: {}, status: 'connected', createdAt: '2025-01-02', updatedAt: '2025-01-02' },
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('getAll returns empty array when no data', async () => {
  (getData as jest.Mock).mockResolvedValue(null);
  expect(await integrationsService.getAll()).toEqual([]);
});

test('getAll returns stored items', async () => {
  (getData as jest.Mock).mockResolvedValue(createMockItems());
  expect(await integrationsService.getAll()).toHaveLength(2);
});

test('getById returns item by id', async () => {
  (getData as jest.Mock).mockResolvedValue(createMockItems());
  const result = await integrationsService.getById('test-1');
  expect(result).not.toBeNull();
  if (result) expect(result.id).toBe('test-1');
});

test('connect creates new integration', async () => {
  (getData as jest.Mock).mockResolvedValue([]);
  const result = await integrationsService.connect('slack', { token: 'xxx' });
  expect(result.id).toBeDefined();
  expect(saveData).toHaveBeenCalled();
});

test('disconnect removes integration', async () => {
  (getData as jest.Mock).mockResolvedValue(createMockItems());
  await integrationsService.disconnect('test-1');
  expect(saveData).toHaveBeenCalled();
});

test('updateConfig updates integration config', async () => {
  (getData as jest.Mock).mockResolvedValue(createMockItems());
  await integrationsService.updateConfig('test-1', { newKey: 'val' });
  expect(saveData).toHaveBeenCalled();
});

test('updateConfig throws when integration not found', async () => {
  (getData as jest.Mock).mockResolvedValue(createMockItems());
  await expect(integrationsService.updateConfig('bad-id', { key: 'val' })).rejects.toThrow('Integration not found');
});

test('disconnect no-op for non-existent id', async () => {
  (getData as jest.Mock).mockResolvedValue(createMockItems());
  await integrationsService.disconnect('bad-id');
  expect(saveData).not.toHaveBeenCalled();
});

test('connect reuses existing provider', async () => {
  (getData as jest.Mock).mockResolvedValue(createMockItems());
  const result = await integrationsService.connect('slack', { token: 'new' });
  expect(result.provider).toBe('slack');
  expect(saveData).toHaveBeenCalled();
});

test('sync no-op for non-existent id', async () => {
  (getData as jest.Mock).mockResolvedValue(createMockItems());
  await integrationsService.sync('bad-id');
  expect(saveData).not.toHaveBeenCalled();
});

test('sync updates integration status and saves', async () => {
  (getData as jest.Mock).mockResolvedValue(createMockItems());
  await integrationsService.sync('test-1');
  expect(saveData).toHaveBeenCalled();
});
