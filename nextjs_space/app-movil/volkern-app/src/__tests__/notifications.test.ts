import { notificationsService, toLocalNotification } from '../services/notifications';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

const mockGet = api.get as jest.Mock;
const mockPatch = api.patch as jest.Mock;
const mockPost = api.post as jest.Mock;

const mockPermissions = require('expo-notifications').getPermissionsAsync as jest.Mock;
const mockRequestPermissions = require('expo-notifications').requestPermissionsAsync as jest.Mock;
const mockGetToken = require('expo-notifications').getExpoPushTokenAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('notificationsService.getAll', () => {
  it('calls api.get', async () => {
    mockGet.mockResolvedValue([]);
    await notificationsService.getAll();
    expect(mockGet).toHaveBeenCalled();
  });
});

describe('notificationsService.markAsRead', () => {
  it('calls api.patch with id', async () => {
    mockPatch.mockResolvedValue(undefined);
    await notificationsService.markAsRead('notif-1');
    expect(mockPatch).toHaveBeenCalled();
  });
});

describe('notificationsService.getUnreadCount', () => {
  it('returns count from filtered list', async () => {
    mockGet.mockResolvedValue([{ read: false }, { read: true }, { read: false }]);
    const count = await notificationsService.getUnreadCount();
    expect(count).toBe(2);
  });
});


// ─── Extra coverage: helpers ─────────────────────────────────────────────

describe('toLocalNotification', () => {
  it('maps InAppNotification to LocalNotification', () => {
    const result = toLocalNotification({
      id: 'n1', title: 'Test', body: 'Body', type: 'lead',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: new Date().toISOString(),
      tenantId: 't1', userId: 'u1',
    });
    expect(result.type).toBe('lead');
    expect(result.title).toBe('Test');
    expect(result.read).toBe(false);
  });

  it('returns 0 when api.get throws', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    const count = await notificationsService.getUnreadCount();
    expect(count).toBe(0);
  });
});

describe('notificationsService.markAllAsRead', () => {
  it('calls api.patch with all:true', async () => {
    mockPatch.mockResolvedValue(undefined);
    await notificationsService.markAllAsRead();
    expect(mockPatch).toHaveBeenCalledWith('/notifications', { all: true });
  });
});

describe('notificationsService.cleanupRead', () => {
  it('returns undefined for any days', async () => {
    await expect(notificationsService.cleanupRead()).resolves.toBeUndefined();
    await expect(notificationsService.cleanupRead(7)).resolves.toBeUndefined();
  });
});

describe('notificationsService.registerPushToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns early on web platform', async () => {
    const RN = require('react-native');
    const originalOS = RN.Platform.OS;
    RN.Platform.OS = 'web';
    try {
      await notificationsService.registerPushToken('user-1');
      // No expo-notifications API should be called
      const Notifications = require('expo-notifications');
      expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    } finally {
      RN.Platform.OS = originalOS;
    }
  });

  it('registers push token when permission granted', async () => {
    const RN = require('react-native');
    const originalOS = RN.Platform.OS;
    RN.Platform.OS = 'ios';
    try {
      mockPermissions.mockResolvedValue({ status: 'granted' });
      mockGetToken.mockResolvedValue({ data: 'expo-token-123' });

      await notificationsService.registerPushToken('user-1');

      expect(mockPermissions).toHaveBeenCalled();
      expect(mockGetToken).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith('/users/me/push-subscription', {
        userId: 'user-1',
        permission: 'granted',
        pushToken: 'expo-token-123',
      });
      const Notifications = require('expo-notifications');
      expect(Notifications.setNotificationHandler).toHaveBeenCalled();
    } finally {
      RN.Platform.OS = originalOS;
    }
  });

  it('requests permission if not yet granted', async () => {
    const RN = require('react-native');
    const originalOS = RN.Platform.OS;
    RN.Platform.OS = 'ios';
    try {
      mockPermissions.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissions.mockResolvedValue({ status: 'granted' });
      mockGetToken.mockResolvedValue({ data: 'token' });

      await notificationsService.registerPushToken('user-1');

      expect(mockRequestPermissions).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalled();
    } finally {
      RN.Platform.OS = originalOS;
    }
  });

  it('returns early if permission denied', async () => {
    const RN = require('react-native');
    const originalOS = RN.Platform.OS;
    RN.Platform.OS = 'ios';
    try {
      mockPermissions.mockResolvedValue({ status: 'denied' });
      // Explicitly set request mock to denied too, because jest.clearAllMocks
      // does not clear mockResolvedValue implementations between tests
      mockRequestPermissions.mockResolvedValue({ status: 'denied' });

      await notificationsService.registerPushToken('user-1');

      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    } finally {
      RN.Platform.OS = originalOS;
    }
  });
});

// ─── Helpers coverage ───────────────────────────────────────────────────
describe('toLocalNotification timeAgo', () => {
  it('now returns Ahora', () => {
    const now = new Date().toISOString();
    const result = toLocalNotification({
      id: 'n1', title: 'T', body: 'B', type: 'system',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: now, tenantId: 't1', userId: 'u1',
    });
    expect(result.time).toBe('Ahora');
  });

  it('returns mins for recent notifications', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = toLocalNotification({
      id: 'n1', title: 'T', body: 'B', type: 'system',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: past, tenantId: 't1', userId: 'u1',
    });
    expect(result.time).toMatch(/Hace/);
  });

  it('returns hours for older notifications', () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const result = toLocalNotification({
      id: 'n2', title: 'T', body: 'B', type: 'system',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: past, tenantId: 't1', userId: 'u1',
    });
    expect(result.time).toMatch(/h$/);
  });

  it('returns days for old notifications', () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = toLocalNotification({
      id: 'n3', title: 'T', body: 'B', type: 'system',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: past, tenantId: 't1', userId: 'u1',
    });
    expect(result.time).toMatch(/d$/);
  });

  it('returns date for very old notifications', () => {
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = toLocalNotification({
      id: 'n4', title: 'T', body: 'B', type: 'system',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: past, tenantId: 't1', userId: 'u1',
    });
    expect(typeof result.time).toBe('string');
  });
});

describe('toLocalNotification type mapping', () => {
  it('maps appointment to cita', () => {
    const result = toLocalNotification({
      id: 'n1', title: 'T', body: 'B', type: 'appointment',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: new Date().toISOString(), tenantId: 't1', userId: 'u1',
    });
    expect(result.type).toBe('cita');
  });

  it('maps chat to message', () => {
    const result = toLocalNotification({
      id: 'n2', title: 'T', body: 'B', type: 'chat',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: new Date().toISOString(), tenantId: 't1', userId: 'u1',
    });
    expect(result.type).toBe('message');
  });

  it('maps task to lead', () => {
    const result = toLocalNotification({
      id: 'n3', title: 'T', body: 'B', type: 'task',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: new Date().toISOString(), tenantId: 't1', userId: 'u1',
    });
    expect(result.type).toBe('lead');
  });

  it('maps unknown type to system', () => {
    const result = toLocalNotification({
      id: 'n4', title: 'T', body: 'B', type: 'unknown',
      read: false, readAt: null, data: null, actionUrl: null,
      createdAt: new Date().toISOString(), tenantId: 't1', userId: 'u1',
    });
    expect(result.type).toBe('system');
  });
});
