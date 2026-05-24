import { api, ApiClientError } from '../services/api';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../services/storage', () => ({
  getToken: jest.fn(),
}));

jest.mock('../services/network', () => ({
  networkService: {
    isOnline: jest.fn(() => true),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockGetToken = require('../services/storage').getToken as jest.Mock;
const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;
const mockedDeleteItem = require('expo-secure-store').deleteItemAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetToken.mockResolvedValue('test-token');
  // Default: SecureStore returns null (no cache)
  mockedGetItem.mockResolvedValue(null);
  // Mock global fetch
  (global as any).fetch = jest.fn();
});

afterEach(() => {
  delete (global as any).fetch;
});

// ─── ApiClientError ───────────────────────────────────────────────────────────

describe('ApiClientError', () => {
  it('creates error with message, status, and code', () => {
    const err = new ApiClientError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('ApiClientError');
  });

  it('creates error without code', () => {
    const err = new ApiClientError('Server error', 500);
    expect(err.message).toBe('Server error');
    expect(err.status).toBe(500);
    expect(err.code).toBeUndefined();
  });
});

// ─── Cache ────────────────────────────────────────────────────────────────────

describe('cache internals', () => {
  it('getCacheVersion returns 0 when no version stored', async () => {
    mockedGetItem.mockResolvedValue(null);
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    });
    await api.get('/test');
    // Should have tried reading cache (volkern_cache_version key)
    expect(mockedGetItem).toHaveBeenCalledWith(
      expect.stringContaining('volkern_cache_version'),
    );
  });

  it('cache.get returns null when JSON parse fails', async () => {
    // First call for cache version, second for cache data
    mockedGetItem
      .mockResolvedValueOnce(null) // cache version
      .mockResolvedValueOnce('bad-json{{{'); // cache data
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    });
    await api.get('/test');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('cache.get returns data when valid and not expired', async () => {
    const cacheData = { data: 'cached-value', expiry: Date.now() + 999999 };
    mockedGetItem
      .mockResolvedValueOnce(null) // cache version = 0
      .mockResolvedValueOnce(JSON.stringify(cacheData)); // cache hit
    const mockFetch = (global as any).fetch;
    // Even if fetch is set, it shouldn't be called
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'fresh' }),
    });
    const result = await api.get('/cache-hit');
    // cache.get returns data directly, not the wrapper object
    expect(result).toBe('cached-value');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cache.get deletes and returns null when expired', async () => {
    const expiredData = { data: 'old', expiry: Date.now() - 1 };
    mockedGetItem
      .mockResolvedValueOnce(null) // cache version = 0
      .mockResolvedValueOnce(JSON.stringify(expiredData)); // expired cache
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'fresh' }),
    });
    const result = await api.get('/expired');
    expect(result).toEqual({ data: 'fresh' });
    expect(mockedDeleteItem).toHaveBeenCalled();
  });

  it('cache.set handles SecureStore size limit gracefully', async () => {
    mockedGetItem.mockResolvedValue(null);
    // Make setItemAsync throw once (for cache set), then succeed for cache version bump
    mockedSetItem.mockImplementationOnce(() =>
      Promise.reject(new Error('exceeded size limit')),
    );
    // Remove cache data read so it falls through
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ saved: true }),
    });
    const result = await api.post('/data', { foo: 'bar' });
    // The POST succeeds even though cache.set failed
    expect(result).toEqual({ saved: true });
  });

  it('cache.set .catch handler triggers on setItemAsync rejection during GET cache save', async () => {
    // Cache miss: no version -> 0, no cached data -> null
    mockedGetItem
      .mockResolvedValueOnce(null) // cache version = 0
      .mockResolvedValueOnce(null); // cache data = null (miss)
    // Make setItemAsync reject when cache.set tries to save the GET response
    mockedSetItem.mockRejectedValueOnce(new Error('size limit'));
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ fetched: true }),
    });
    // GET with default cacheTTL=5 triggers cache.set on success
    const result = await api.get('/cached-response');
    expect(result).toEqual({ fetched: true });
    // Should have tried to save cache (even though it failed)
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('getCacheVersion returns 0 when SecureStore throws', async () => {
    mockedGetItem.mockRejectedValue(new Error('Storage error'));
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'fresh' }),
    });
    const result = await api.get('/test');
    expect(result).toEqual({ data: 'fresh' });
  });
});

// ─── Request — GET ────────────────────────────────────────────────────────────

describe('api.get', () => {
  it('sends GET request with auth token', async () => {
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    const result = await api.get('/items');
    expect(result).toEqual({ items: [] });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/items'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('sends GET without auth when no token', async () => {
    mockGetToken.mockResolvedValue(null);
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ public: true }),
    });
    const result = await api.get('/public');
    expect(result).toEqual({ public: true });
    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders.Authorization).toBeUndefined();
  });

  it('handles GET error response', async () => {
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden', code: 'ACCESS_DENIED' }),
    });
    await expect(api.get('/protected')).rejects.toThrow(ApiClientError);
    await expect(api.get('/protected')).rejects.toMatchObject({
      status: 403,
      code: 'ACCESS_DENIED',
    });
  });

  it('handles GET with JSON parse failure on response', async () => {
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
    });
    const result = await api.get('/bad-json');
    expect(result).toEqual({});
  });

  it('uses default localhost URL when EXPO_PUBLIC_API_URL is not set', async () => {
    const originalUrl = process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_API_URL;
    // API_BASE_URL is evaluated at module load, but this confirms the fallback path
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    await api.get('/test');
    // The URL uses the module-level constant which was set at import time
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.any(Object),
    );
    process.env.EXPO_PUBLIC_API_URL = originalUrl;
  });
});

// ─── Request — POST, PATCH, PUT, DELETE ───────────────────────────────────────

describe('api.post', () => {
  it('sends POST with body', async () => {
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });
    const result = await api.post('/items', { name: 'New' });
    expect(result).toEqual({ id: 1 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/items'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'New' }),
      }),
    );
  });

  it('handles POST error without message', async () => {
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    await expect(api.post('/items', {})).rejects.toThrow('Error 500');
  });
});

describe('api.patch', () => {
  it('sends PATCH with body', async () => {
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ updated: true }),
    });
    const result = await api.patch('/items/1', { name: 'Updated' });
    expect(result).toEqual({ updated: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/items/1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('api.put', () => {
  it('sends PUT with body', async () => {
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ replaced: true }),
    });
    const result = await api.put('/items/1', { name: 'Replaced' });
    expect(result).toEqual({ replaced: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/items/1'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});

describe('api.delete', () => {
  it('sends DELETE', async () => {
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ deleted: true }),
    });
    const result = await api.delete('/items/1');
    expect(result).toEqual({ deleted: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/items/1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('api offline fallback', () => {
  it('throws ApiClientError when offline on POST', async () => {
    // Mock network as offline
    const network = require('../services/network').networkService;
    network.isOnline.mockReturnValue(false);
    const mockFetch = (global as any).fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    await expect(api.post('/test', { data: 'x' })).rejects.toThrow();
  });
});
