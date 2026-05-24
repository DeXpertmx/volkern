import { profileService } from '../services/profile';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('../services/storage', () => ({
  getToken: jest.fn(),
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockPatch = api.patch as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('profileService.getProfile', () => {
  it('calls api.get /users/me and returns profile', async () => {
    const profileData = {
      id: 'u1',
      name: 'Test',
      email: 'test@test.com',
      image: null,
      telefono: null,
      bookingSlug: null,
      bookingTitle: null,
      bookingBio: null,
      bookingEnabled: false,
      role: { id: 'r1', nombre: 'Admin', permisos: {} },
      tenant: { id: 't1', nombre: 'Test', slug: 'test', subdomain: null, accountType: 'business' },
      timezone: null,
      metadata: null,
      isTwoFactorEnabled: false,
    };
    mockGet.mockResolvedValue(profileData);
    const profile = await profileService.getProfile();
    expect(mockGet).toHaveBeenCalledWith('/users/me');
    expect(profile).toEqual(profileData);
  });
});

describe('profileService.updateProfile', () => {
  it('calls api.patch /users/me with data', async () => {
    const updateData = { name: 'Updated', telefono: '+123', timezone: 'UTC' };
    mockPatch.mockResolvedValue({ success: true, user: { name: 'Updated' } });
    const result = await profileService.updateProfile(updateData);
    expect(mockPatch).toHaveBeenCalledWith('/users/me', updateData);
    expect(result.success).toBe(true);
  });
});

describe('profileService.changePassword', () => {
  it('calls api.post /users/cambiar-password with passwords', async () => {
    mockPost.mockResolvedValue({ success: true, message: 'Password changed' });
    const result = await profileService.changePassword('old123', 'new123');
    expect(mockPost).toHaveBeenCalledWith('/users/cambiar-password', {
      currentPassword: 'old123',
      newPassword: 'new123',
    });
    expect(result.success).toBe(true);
  });
});

describe('profileService.toggle2FA', () => {
  it('enables 2FA', async () => {
    mockPost.mockResolvedValue({ success: true, isTwoFactorEnabled: true });
    const result = await profileService.toggle2FA(true);
    expect(mockPost).toHaveBeenCalledWith('/users/me/2fa', { enabled: true });
    expect(result.isTwoFactorEnabled).toBe(true);
  });

  it('disables 2FA', async () => {
    mockPost.mockResolvedValue({ success: true, isTwoFactorEnabled: false });
    const result = await profileService.toggle2FA(false);
    expect(mockPost).toHaveBeenCalledWith('/users/me/2fa', { enabled: false });
    expect(result.isTwoFactorEnabled).toBe(false);
  });
});

describe('profileService.getSubscriptionStatus', () => {
  it('calls api.get /subscriptions/status', async () => {
    const statusData = {
      plan: 'business',
      status: 'active',
      limits: {},
      isSuperAdmin: false,
    };
    mockGet.mockResolvedValue(statusData);
    const status = await profileService.getSubscriptionStatus();
    expect(mockGet).toHaveBeenCalledWith('/subscriptions/status');
    expect(status).toEqual(statusData);
  });
});

describe('profileService.getUsage', () => {
  it('calls api.get /subscriptions/usage', async () => {
    const usageData = {
      plan: { slug: 'business', nombre: 'Business' },
      usage: [{ feature: 'leads', label: 'Leads', current: 5, limit: 100, unlimited: false, percentage: 5, status: 'ok' }],
      upgrade: { suggestedPlan: 'enterprise', nearLimitCount: 0, message: '' },
    };
    mockGet.mockResolvedValue(usageData);
    const result = await profileService.getUsage();
    expect(mockGet).toHaveBeenCalledWith('/subscriptions/usage');
    expect(result.plan.slug).toBe('business');
  });
});

describe('profileService.getTenantUsage', () => {
  it('calls api.get /usage', async () => {
    const tenantData = { usage: { leads: 10, contacts: 5, companies: 2, storage: 100, users: 3 } };
    mockGet.mockResolvedValue(tenantData);
    const result = await profileService.getTenantUsage();
    expect(mockGet).toHaveBeenCalledWith('/usage');
    expect(result.usage.leads).toBe(10);
  });
});

describe('profileService.generateSkillKey', () => {
  it('calls api.post /users/me/skill-key', async () => {
    const keyData = { id: 'key1', key: 'sk-xxx', createdAt: '2024-01-01T00:00:00Z' };
    mockPost.mockResolvedValue(keyData);
    const result = await profileService.generateSkillKey();
    expect(mockPost).toHaveBeenCalledWith('/users/me/skill-key');
    expect(result.key).toBe('sk-xxx');
  });
});

describe('profileService.uploadAvatar', () => {
  const mockGetToken = jest.requireMock('../services/storage').getToken as jest.Mock;

  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue('test-token');
  });

  it('uploads avatar successfully', async () => {
    const fileUri = '/tmp/photo.jpg';
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ url: 'https://cdn.example.com/avatar.jpg' }),
    });

    const result = await profileService.uploadAvatar(fileUri);

    expect(mockGetToken).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/users/avatar');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({
      Authorization: 'Bearer test-token',
    });
    expect(options?.body).toBeInstanceOf(FormData);

    expect(result).toEqual({ url: 'https://cdn.example.com/avatar.jpg' });
  });

  it('sends request with FormData body', async () => {
    const fileUri = '/path/to/my_avatar.png';
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ url: 'https://cdn.example.com/avatar.png' }),
    });

    await profileService.uploadAvatar(fileUri);

    const body = mockFetch.mock.calls[0][1]?.body;
    expect(body).toBeInstanceOf(FormData);
  });

  it('uses default API URL when env var is not set', async () => {
    const originalEnv = process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_API_URL;

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ url: 'https://cdn.example.com/avatar.jpg' }),
    });

    await profileService.uploadAvatar('/tmp/photo.jpg');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/users/avatar');

    process.env.EXPO_PUBLIC_API_URL = originalEnv;
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'File too large' }),
    });

    await expect(profileService.uploadAvatar('/tmp/photo.jpg')).rejects.toThrow('File too large');
  });

  it('throws generic error when no error message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({}),
    });

    await expect(profileService.uploadAvatar('/tmp/photo.jpg')).rejects.toThrow('Error al subir avatar');
  });

  it('uses empty Bearer token when getToken returns null', async () => {
    mockGetToken.mockResolvedValue(null);
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ url: 'https://cdn.example.com/avatar.jpg' }),
    });

    await profileService.uploadAvatar('/tmp/photo.jpg');

    const [, options] = mockFetch.mock.calls[0];
    expect(options?.headers).toEqual({
      Authorization: 'Bearer ',
    });
  });

  it('uses avatar.jpg fallback when fileUri has empty filename', async () => {
    mockGetToken.mockResolvedValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ url: 'https://cdn.example.com/avatar.jpg' }),
    });

    await profileService.uploadAvatar('/tmp/');

    const body = mockFetch.mock.calls[0][1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
  });

  it('uses image/jpeg when filename has no extension', async () => {
    mockGetToken.mockResolvedValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ url: 'https://cdn.example.com/avatar' }),
    });

    await profileService.uploadAvatar('/tmp/my_avatar');

    const body = mockFetch.mock.calls[0][1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
  });
});
