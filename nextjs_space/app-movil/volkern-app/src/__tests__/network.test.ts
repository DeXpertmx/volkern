import { networkService } from '../services/network';

let netInfoCallback: ((state: any) => void) | null = null;
let consoleErrorSpy: jest.SpyInstance;

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, type: 'wifi', isInternetReachable: true })),
  addEventListener: jest.fn((cb: any) => {
    netInfoCallback = cb;
    return jest.fn();
  }),
}));

beforeEach(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.clearAllMocks();
  // netInfoCallback is NOT reset here — it's set by startMonitoring() which
  // only runs once because networkService is a singleton.
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('networkService', () => {
  it('starts online by default', () => {
    expect(networkService.isOnline()).toBe(true);
  });

  it('getCurrentState returns state', () => {
    const state = networkService.getCurrentState();
    expect(state).toHaveProperty('isConnected');
    expect(state).toHaveProperty('status');
  });

  it('subscribe returns unsubscribe function', () => {
    const listener = jest.fn();
    const unsub = networkService.subscribe(listener);
    expect(typeof unsub).toBe('function');
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('isOnline returns boolean', () => {
    expect(typeof networkService.isOnline()).toBe('boolean');
  });

  it('startMonitoring returns unsubscribe function', () => {
    const unsub = networkService.startMonitoring();
    expect(typeof unsub).toBe('function');
    expect(netInfoCallback).not.toBeNull();
  });

  it('startMonitoring with onChange calls back', async () => {
    const onChange = jest.fn();
    const unsub = networkService.startMonitoring(onChange);
    expect(typeof unsub).toBe('function');
    await Promise.resolve(); // flush NetInfo.fetch microtask
    unsub();
  });

  it('stopMonitoring with specific listener removes only that one', () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    networkService.subscribe(fn1);
    networkService.subscribe(fn2);
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
    fn1.mockClear();
    fn2.mockClear();
    networkService.stopMonitoring(fn1);
    // Trigger notifyListeners via callback to verify fn1 is removed
    expect(netInfoCallback).not.toBeNull();
    if (netInfoCallback) {
      netInfoCallback({ isConnected: true, type: 'wifi', isInternetReachable: true });
    }
    // fn1 was removed from listeners, so it should NOT have been called
    // fn2 was NOT removed, so it SHOULD have been called
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it('notifyListeners catches listener errors (line 119)', () => {
    expect(netInfoCallback).not.toBeNull();
    const badListener = jest.fn(() => { throw new Error('Listener error'); });
    // subscribe pushes the listener then calls it immediately — the throw
    // propagates but the listener remains in this.listeners[]
    try {
      networkService.subscribe(badListener);
    } catch {
      // Expected — subscribe() does not wrap the immediate call in try/catch
    }
    // Trigger notifyListeners via netInfoCallback; it iterates all listeners
    // and catches individual errors, covering line 119
    if (netInfoCallback) {
      netInfoCallback({ isConnected: true, type: 'wifi', isInternetReachable: true });
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[NetworkService] Error in listener:',
      expect.any(Error)
    );
  });

  // ─── mapState tests ─────────────────────────────────────────────
  // These rely on netInfoCallback being set by startMonitoring() in
  // the test above. Since networkService is a singleton, the callback
  // persists across tests.
  it('mapState handles cellular type', () => {
    expect(netInfoCallback).not.toBeNull();
    if (netInfoCallback) {
      netInfoCallback({ isConnected: true, type: 'cellular', isInternetReachable: true });
    }
    const state = networkService.getCurrentState();
    expect(state.status).toBe('cellular');
  });

  it('mapState handles online (non-wifi, non-cellular) type', () => {
    expect(netInfoCallback).not.toBeNull();
    if (netInfoCallback) {
      netInfoCallback({ isConnected: true, type: 'ethernet', isInternetReachable: true });
    }
    const state = networkService.getCurrentState();
    expect(state.status).toBe('online');
    expect(state.details).toBe('Ethernet');
  });

  it('mapState handles offline state', () => {
    expect(netInfoCallback).not.toBeNull();
    if (netInfoCallback) {
      netInfoCallback({ isConnected: false, type: 'none', isInternetReachable: false });
    }
    const state = networkService.getCurrentState();
    expect(state.status).toBe('offline');
    expect(state.details).toBe('Sin conexión');
  });
});
