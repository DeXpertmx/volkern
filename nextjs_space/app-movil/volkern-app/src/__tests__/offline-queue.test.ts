import { offlineQueue } from '../services/offline-queue';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;
const mockedDeleteItem = require('expo-secure-store').deleteItemAsync as jest.Mock;

jest.mock('../services/network', () => ({
  networkService: {
    isOnline: jest.fn(() => true),
  },
}));

const mockApiPost = jest.fn().mockResolvedValue({ id: 1 });
const mockApiPatch = jest.fn().mockResolvedValue({ updated: true });
const mockApiPut = jest.fn().mockResolvedValue({ replaced: true });
const mockApiDelete = jest.fn().mockResolvedValue({ deleted: true });

jest.mock('../services/api', () => ({
  api: {
    post: (...args: any[]) => mockApiPost(...args),
    patch: (...args: any[]) => mockApiPatch(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}));

beforeEach(async () => {
  jest.resetAllMocks();
  // Default: no saved queue
  mockedGetItem.mockResolvedValue(null);
  mockedSetItem.mockResolvedValue(undefined);
  mockedDeleteItem.mockResolvedValue(undefined);
  mockApiPost.mockResolvedValue({ id: 1 });
  mockApiPatch.mockResolvedValue({ updated: true });
  mockApiPut.mockResolvedValue({ replaced: true });
  mockApiDelete.mockResolvedValue({ deleted: true });
  // Reset internal state
  (offlineQueue as any).queue = [];
  (offlineQueue as any).loaded = false;
  (offlineQueue as any).processing = false;
});

// ─── Load / Save ──────────────────────────────────────────────────────────────

describe('load', () => {
  it('loads queue from storage when data exists', async () => {
    const ops = [{ id: 'op-1', method: 'POST', endpoint: '/test', status: 'pending' }];
    mockedGetItem.mockResolvedValue(JSON.stringify(ops));
    await offlineQueue.load();
    expect((offlineQueue as any).queue).toEqual(ops);
    expect((offlineQueue as any).loaded).toBe(true);
  });

  it('initializes empty queue when no data and on error', async () => {
    mockedGetItem.mockRejectedValue(new Error('storage error'));
    await offlineQueue.load();
    expect((offlineQueue as any).queue).toEqual([]);
  });

  it('skips load if already loaded', async () => {
    (offlineQueue as any).loaded = true;
    (offlineQueue as any).queue = [{ id: 'existing' }];
    await offlineQueue.load();
    // Should not call getItemAsync
    expect(mockedGetItem).not.toHaveBeenCalled();
  });

  it('handles JSON parse error', async () => {
    mockedGetItem.mockResolvedValue('bad-json{{{');
    await offlineQueue.load();
    expect((offlineQueue as any).queue).toEqual([]);
    expect((offlineQueue as any).loaded).toBe(true);
  });
});

describe('save', () => {
  it('persists queue to storage', async () => {
    (offlineQueue as any).queue = [{ id: 'op-1', method: 'POST' }];
    await (offlineQueue as any).save();
    expect(mockedSetItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('op-1'),
    );
  });

  it('handles save error gracefully', async () => {
    mockedSetItem.mockRejectedValue(new Error('write error'));
    (offlineQueue as any).queue = [{ id: 'op-1' }];
    // Should not throw
    await expect((offlineQueue as any).save()).resolves.toBeUndefined();
  });
});

// ─── Enqueue ──────────────────────────────────────────────────────────────────

describe('enqueue', () => {
  it('adds operation with defaults', async () => {
    await offlineQueue.enqueue({
      method: 'POST',
      endpoint: '/items',
      body: { name: 'Test' },
      label: 'POST /items',
    });
    const ops = await offlineQueue.getAllOperations();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      method: 'POST',
      endpoint: '/items',
      body: { name: 'Test' },
      label: 'POST /items',
      retries: 0,
      maxRetries: 3,
      status: 'pending',
    });
    expect(ops[0].id).toBeDefined();
    expect(ops[0].timestamp).toBeDefined();
  });

  it('allows custom maxRetries', async () => {
    await offlineQueue.enqueue({
      method: 'DELETE',
      endpoint: '/items/1',
      label: 'DELETE /items/1',
      maxRetries: 5,
    });
    const ops = await offlineQueue.getAllOperations();
    expect(ops[0].maxRetries).toBe(5);
  });

  it('persists after enqueue', async () => {
    await offlineQueue.enqueue({
      method: 'POST',
      endpoint: '/test',
      label: 'POST /test',
    });
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

// ─── Queue access ─────────────────────────────────────────────────────────────

describe('queue access', () => {
  beforeEach(async () => {
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/a', label: 'A' });
    await offlineQueue.enqueue({ method: 'PATCH', endpoint: '/b', label: 'B' });
    // Manually mark one as syncing
    (offlineQueue as any).queue[0].status = 'syncing';
    (offlineQueue as any).queue[1].status = 'pending';
  });

  it('pendingCount returns pending operations', () => {
    expect(offlineQueue.pendingCount).toBe(1);
  });

  it('totalCount returns all operations', () => {
    expect(offlineQueue.totalCount).toBe(2);
  });

  it('getPendingOperations returns only pending', async () => {
    const ops = await offlineQueue.getPendingOperations();
    expect(ops).toHaveLength(1);
    expect(ops[0].status).toBe('pending');
  });

  it('getAllOperations returns all with copies', async () => {
    const ops = await offlineQueue.getAllOperations();
    expect(ops).toHaveLength(2);
    expect(ops[0].status).toBe('syncing');
  });
});

// ─── Mutation ─────────────────────────────────────────────────────────────────

describe('mutation', () => {
  beforeEach(async () => {
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/a', label: 'A' });
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/b', label: 'B' });
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/c', label: 'C' });
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/d', label: 'D' });
  });

  it('deleteOperation removes by id', async () => {
    const ops = await offlineQueue.getAllOperations();
    const id = ops[0].id;
    await offlineQueue.deleteOperation(id);
    const remaining = await offlineQueue.getAllOperations();
    expect(remaining).toHaveLength(3);
    expect(remaining.find((o: any) => o.id === id)).toBeUndefined();
  });

  it('clearByStatus removes matching', async () => {
    // Mark two as completed
    (offlineQueue as any).queue[0].status = 'completed';
    (offlineQueue as any).queue[1].status = 'completed';
    await offlineQueue.clearByStatus('completed');
    const remaining = await offlineQueue.getAllOperations();
    expect(remaining).toHaveLength(2);
  });

  it('clear empties queue', async () => {
    await offlineQueue.clear();
    const ops = await offlineQueue.getAllOperations();
    expect(ops).toHaveLength(0);
  });

  it('clearAll empties queue and history', async () => {
    mockedGetItem.mockResolvedValue(
      JSON.stringify([{ id: 'sync-1', timestamp: 1000, total: 1, succeeded: 1, failed: 0, duration: 100, status: 'completed' }]),
    );
    await offlineQueue.clearAll();
    expect((offlineQueue as any).queue).toHaveLength(0);
    expect(mockedDeleteItem).toHaveBeenCalled(); // clearHistory + lastSync
  });
});

// ─── Replay Queue ─────────────────────────────────────────────────────────────

describe('replayQueue', () => {
  it('returns empty when no pending operations', async () => {
    const result = await offlineQueue.replayQueue();
    expect(result).toEqual({ succeeded: 0, failed: 0 });
  });

  it('processes all pending successfully', async () => {
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/items', label: 'POST /items' });
    await offlineQueue.enqueue({ method: 'PATCH', endpoint: '/items/1', body: {}, label: 'PATCH /items/1' });

    const result = await offlineQueue.replayQueue();
    expect(result).toEqual({ succeeded: 2, failed: 0 });
    // Completed operations should be cleaned up
    const remaining = await offlineQueue.getAllOperations();
    expect(remaining).toHaveLength(0);
  });

  it('retries on failure and marks as failed after max retries', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    // maxRetries=0 means fail immediately on first error
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/fail', label: 'POST /fail', maxRetries: 0 });

    const result = await offlineQueue.replayQueue();
    expect(result).toEqual({ succeeded: 0, failed: 1 });

    // Failed operation stays in queue
    const remaining = await offlineQueue.getAllOperations();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe('failed');
    expect(remaining[0].lastError).toContain('Server error');
  });

  it('retries pending when maxRetries > 0 and operation fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Temp error'));
    // maxRetries=1 means one retry allowed
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/retry', label: 'POST /retry', maxRetries: 1 });

    const result = await offlineQueue.replayQueue();
    // Operation was retried (retries went from 0→1) and stays pending
    expect(result).toEqual({ succeeded: 0, failed: 0 });

    const remaining = await offlineQueue.getAllOperations();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe('pending');
    expect(remaining[0].retries).toBe(1);
  });

  it('prevents concurrent processing', async () => {
    (offlineQueue as any).processing = true;
    const result = await offlineQueue.replayQueue();
    expect(result).toEqual({ succeeded: 0, failed: 0 });
  });

  it('calls onProgress callback', async () => {
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/a', label: 'A' });
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/b', label: 'B' });

    const onProgress = jest.fn();
    await offlineQueue.replayQueue(onProgress);
    expect(onProgress).toHaveBeenCalled();
  });

  it('records sync history entry after replay', async () => {
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/item', label: 'POST /item' });

    await offlineQueue.replayQueue();
    // Should have saved history
    expect(mockedSetItem).toHaveBeenCalledWith(
      expect.stringContaining('sync_history'),
      expect.any(String),
    );
  });

  it('updates last sync timestamp', async () => {
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/item', label: 'POST /item' });

    await offlineQueue.replayQueue();
    expect(mockedSetItem).toHaveBeenCalledWith(
      expect.stringContaining('last_sync'),
      expect.any(String),
    );
  });

  it('handles partial failure with some succeeding', async () => {
    mockApiPost.mockResolvedValueOnce({ id: 1 });
    mockApiPost.mockRejectedValueOnce(new Error('Fail'));
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/ok', label: 'OK' });
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/fail', label: 'Fail', maxRetries: 0 });

    const result = await offlineQueue.replayQueue();
    expect(result).toEqual({ succeeded: 1, failed: 1 });
  });

  it('uses Unknown error fallback when error has no message', async () => {
    // Reject with a non-Error object that has no message property
    mockApiPost.mockRejectedValue({ code: 500 });
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/fail', label: 'POST /fail', maxRetries: 0 });

    await offlineQueue.replayQueue();
    const remaining = await offlineQueue.getAllOperations();
    expect(remaining[0].lastError).toBe('Unknown error');
  });

  it('triggers addHistoryEntry catch when saving history fails', async () => {
    // Only fail setItemAsync when it's for sync_history; other saves succeed
    mockedSetItem.mockImplementation(async (key: string) => {
      if (key.includes('sync_history')) {
        throw new Error('history write fail');
      }
      return undefined;
    });
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/item', label: 'POST /item' });
    const result = await offlineQueue.replayQueue();
    expect(result).toEqual({ succeeded: 1, failed: 0 });
  });

  it('truncates history when exceeding MAX_HISTORY', async () => {
    // Create history with 21 entries (MAX_HISTORY=20)
    const manyEntries = Array.from({ length: 21 }, (_, i) => ({
      id: `sync-${i}`,
      timestamp: 1000 + i,
      total: 1,
      succeeded: 1,
      failed: 0,
      duration: 50,
      status: 'completed' as const,
    }));
    mockedGetItem.mockResolvedValue(JSON.stringify(manyEntries));
    // Trigger addHistoryEntry via replayQueue
    await offlineQueue.enqueue({ method: 'POST', endpoint: '/item', label: 'POST /item' });
    await offlineQueue.replayQueue();
    // Should have saved history with at most 20 entries
    const callArg = mockedSetItem.mock.calls.find(
      (c: string[]) => c[0].includes('sync_history'),
    );
    expect(callArg).toBeDefined();
    const saved = JSON.parse(callArg[1]);
    expect(saved.length).toBeLessThanOrEqual(20);
  });
});

// ─── Sync History ─────────────────────────────────────────────────────────────

describe('sync history', () => {
  it('getLastSyncTimestamp returns null when empty', async () => {
    mockedGetItem.mockResolvedValue(null);
    const ts = await offlineQueue.getLastSyncTimestamp();
    expect(ts).toBeNull();
  });

  it('getLastSyncTimestamp returns parsed number', async () => {
    mockedGetItem.mockResolvedValue('1234567890');
    const ts = await offlineQueue.getLastSyncTimestamp();
    expect(ts).toBe(1234567890);
  });

  it('getLastSyncTimestamp returns null on error', async () => {
    mockedGetItem.mockRejectedValue(new Error('fail'));
    const ts = await offlineQueue.getLastSyncTimestamp();
    expect(ts).toBeNull();
  });

  it('getHistory returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const history = await offlineQueue.getHistory();
    expect(history).toEqual([]);
  });

  it('getHistory parses stored entries', async () => {
    const entries = [{ id: 's1', timestamp: 100, total: 2, succeeded: 2, failed: 0, duration: 50, status: 'completed' }];
    mockedGetItem.mockResolvedValue(JSON.stringify(entries));
    const history = await offlineQueue.getHistory();
    expect(history).toEqual(entries);
  });

  it('getHistory returns empty on parse error', async () => {
    mockedGetItem.mockResolvedValue('bad-json');
    const history = await offlineQueue.getHistory();
    expect(history).toEqual([]);
  });

  it('clearHistory deletes storage key', async () => {
    await offlineQueue.clearHistory();
    expect(mockedDeleteItem).toHaveBeenCalledWith(expect.stringContaining('sync_history'));
  });
});

// ─── executeOperation ─────────────────────────────────────────────────────────

describe('executeOperation', () => {
  it('calls api.post for POST operations', async () => {
    await (offlineQueue as any).executeOperation({
      method: 'POST',
      endpoint: '/items',
      body: { name: 'Test' },
    });
    expect(mockApiPost).toHaveBeenCalledWith('/items', { name: 'Test' });
  });

  it('calls api.patch for PATCH operations', async () => {
    await (offlineQueue as any).executeOperation({
      method: 'PATCH',
      endpoint: '/items/1',
      body: { name: 'Updated' },
    });
    expect(mockApiPatch).toHaveBeenCalledWith('/items/1', { name: 'Updated' });
  });

  it('calls api.put for PUT operations', async () => {
    await (offlineQueue as any).executeOperation({
      method: 'PUT',
      endpoint: '/items/1',
      body: { name: 'Replaced' },
    });
    expect(mockApiPut).toHaveBeenCalledWith('/items/1', { name: 'Replaced' });
  });

  it('calls api.delete for DELETE operations', async () => {
    await (offlineQueue as any).executeOperation({
      method: 'DELETE',
      endpoint: '/items/1',
    });
    expect(mockApiDelete).toHaveBeenCalledWith('/items/1');
  });
});
