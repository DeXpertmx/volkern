import { registerPushToken, setBadgeCount, resetBadgeCount, setupPushNotifications } from '../services/push-notification';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    post: jest.fn(),
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'mock-token' }),
  setBadgeCountAsync: jest.fn().mockResolvedValue(true),
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}));

const mockPost = api.post as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('registerPushToken', () => {
  it('registers token via api.post', async () => {
    mockPost.mockResolvedValue({});
    const result = await registerPushToken();
    expect(result).toBe(true);
    expect(mockPost).toHaveBeenCalled();
  });
});

describe('setBadgeCount', () => {
  it('sets badge count', async () => {
    await setBadgeCount(5);
  });
});

describe('resetBadgeCount', () => {
  it('resets badge to 0', async () => {
    await resetBadgeCount();
  });
});


// ─── Extra coverage: edge cases ─────────────────────────────────────────


describe('setBadgeCount', () => {
  it('handles errors gracefully', async () => {
    const expoNotif = require('expo-notifications');
    expoNotif.setBadgeCountAsync.mockRejectedValueOnce(new Error('fail'));
    await expect(setBadgeCount(5)).resolves.toBeUndefined();
  });
});

describe('resetBadgeCount', () => {
  it('calls setBadgeCount with 0', async () => {
    const expoNotif = require('expo-notifications');
    await resetBadgeCount();
    expect(expoNotif.setBadgeCountAsync).toHaveBeenCalledWith(0);
  });
});

// ─── setupPushNotifications ───────────────────────────────────────────
// Saves the response listener callback in the first test (before clearAllMocks
// wipes mock call history) and reuses it for navigation tests.

describe('setupPushNotifications', () => {
  let listenerCallback: ((response: { notification: { request: { content: { data: unknown } } } }) => void) | null = null;
  let handleNotificationFn: ((notification: { request: { content: { data: unknown } } }) => Promise<unknown>) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets up handlers and navigates on cold start tap', async () => {
    const expoNotif = require('expo-notifications');
    const { router } = require('expo-router');

    // Mock a cold-start notification (getLastNotificationResponseAsync)
    expoNotif.getLastNotificationResponseAsync.mockResolvedValue({
      notification: {
        request: {
          content: { data: { type: 'lead', id: '123' } },
        },
      },
    });

    setupPushNotifications();

    // Save callbacks for subsequent tests (before clearAllMocks wipes history)
    listenerCallback = expoNotif.addNotificationResponseReceivedListener.mock.calls[0][0];
    handleNotificationFn = expoNotif.setNotificationHandler.mock.calls[0][0].handleNotification;

    // Handler was set up
    expect(expoNotif.setNotificationHandler).toHaveBeenCalledWith(
      expect.objectContaining({ handleNotification: expect.any(Function) }),
    );

    // Listener was registered
    expect(expoNotif.addNotificationResponseReceivedListener).toHaveBeenCalledWith(
      expect.any(Function),
    );

    // Flush microtasks (getLastNotificationResponseAsync.then) and run timers
    await Promise.resolve();
    jest.runAllTimers();

    // Navigated to lead with id
    expect(router.push).toHaveBeenCalledWith('/(tabs)/hubs?id=123');
  });

  it('is idempotent (second call does nothing)', () => {
    const expoNotif = require('expo-notifications');

    // clearAllMocks already ran in top-level beforeEach, but clear explicitly too
    expoNotif.setNotificationHandler.mockClear();
    expoNotif.getLastNotificationResponseAsync.mockClear();
    expoNotif.addNotificationResponseReceivedListener.mockClear();

    setupPushNotifications();

    expect(expoNotif.setNotificationHandler).not.toHaveBeenCalled();
    expect(expoNotif.getLastNotificationResponseAsync).not.toHaveBeenCalled();
    expect(expoNotif.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  });

  // ── Navigate tests via response listener callback ──

  it('navigates to lead with id on tap via listener', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: { type: 'lead', id: '999' } },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledWith('/(tabs)/hubs?id=999');
  });

  it('navigates to leads hub on tap without id', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: { type: 'lead' } },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledWith('/(tabs)/hubs');
  });

  it('navigates to appointment hub with id', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: { type: 'cita', id: '456' } },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledWith('/(tabs)/hubs?id=456');
  });

  it('navigates to appointments hub for cita without id', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: { type: 'cita' } },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledWith('/(tabs)/hubs');
  });

  it('navigates to gemma on message type', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: { type: 'chat' } },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledWith('/(tabs)/gemma');
  });

  it('navigates to notifications for system type', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: { type: 'system' } },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledWith('/(tabs)/notifications');
  });

  it('navigates to custom url when payload has url', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: { url: '/(tabs)/settings' } },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledWith('/(tabs)/settings');
  });

  it('does nothing on tap with null data', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: null },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('does nothing on tap with undefined data', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: undefined },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('navigates to appointment hub for appointment type', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: { type: 'appointment', id: '789' } },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledWith('/(tabs)/hubs?id=789');
  });

  it('navigates to notifications for alert type', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();

    listenerCallback!({
      notification: {
        request: {
          content: { data: { type: 'alert' } },
        },
      },
    });

    jest.runAllTimers();
    expect(router.push).toHaveBeenCalledWith('/(tabs)/notifications');
  });

  it('handleNotification callback returns banner config', async () => {
    const result = await handleNotificationFn!({ request: { content: { data: {} } } });
    expect(result).toEqual({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it('falls back to notifications when navigation throws', () => {
    const { router } = require('expo-router');
    (router.push as jest.Mock).mockClear();
    (router.push as jest.Mock).mockImplementationOnce(() => { throw new Error('nav fail'); });

    listenerCallback!({
      notification: {
        request: {
          content: { data: { type: 'lead', id: '123' } },
        },
      },
    });

    jest.runAllTimers();

    // First call throws → fallback to notifications
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenLastCalledWith('/(tabs)/notifications');
  });
});

// ─── registerPushToken permission denied ──────────────────────────────

describe('registerPushToken permission denied', () => {
  it('returns false when permission denied', async () => {
    // Use mockImplementation instead of mockResolvedValue to be explicit
    const expoNotif = require('expo-notifications');
    expoNotif.getPermissionsAsync.mockImplementation(() =>
      Promise.resolve({ status: 'denied' }),
    );
    expoNotif.requestPermissionsAsync.mockImplementation(() =>
      Promise.resolve({ status: 'denied' }),
    );

    const result = await registerPushToken();
    expect(result).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// ─── registerPushToken error handling ────────────────────────────────

describe('registerPushToken error handling', () => {
  it('returns false when api.post throws', async () => {
    mockPost.mockRejectedValueOnce(new Error('network error'));
    const result = await registerPushToken();
    expect(result).toBe(false);
  });

  it('returns false when getExpoPushTokenAsync throws', async () => {
    const expoNotif = require('expo-notifications');
    expoNotif.getExpoPushTokenAsync.mockImplementation(() =>
      Promise.reject(new Error('token error')),
    );
    const result = await registerPushToken();
    expect(result).toBe(false);
  });
});

// ─── registerPushToken web platform ──────────────────────────────────

describe('registerPushToken web platform', () => {
  it('returns false on web', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('../services/api', () => ({
      api: { post: jest.fn() },
    }));
    jest.doMock('expo-notifications', () => ({}));

    const { registerPushToken: webRegister } = require('../services/push-notification');
    const result = await webRegister();
    expect(result).toBe(false);
  });
});
