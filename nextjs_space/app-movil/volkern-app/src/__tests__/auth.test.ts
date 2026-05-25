import { authService } from '../services/auth';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/storage', () => ({
  setToken: jest.fn(),
  setUserData: jest.fn(),
  clearAll: jest.fn(),
  getUserData: jest.fn(),
  setBiometricEnabled: jest.fn(),
  setBiometricToken: jest.fn(),
  removeBiometricToken: jest.fn(),
  getBiometricToken: jest.fn(),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

const mockPost = api.post as jest.Mock;
const mockGet = api.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authService', () => {
  it('login calls api.post and stores data', async () => {
    mockPost.mockResolvedValue({ token: 'tok', user: { id: '1', name: 'Test' } });
    const result = await authService.login({ email: 'a@b.com', password: 'p' });
    expect(result.token).toBe('tok');
  });

  it('checkSession validates token', async () => {
    mockGet.mockResolvedValue({ session: { id: '1', name: 'Test' } });
    const { getUserData } = require('../services/storage');
    (getUserData as jest.Mock).mockResolvedValue({ id: '1', name: 'Test' });
    const result = await authService.checkSession();
    expect(result).not.toBeNull();
  });

  it('logout clears storage', async () => {
    const { clearAll } = require('../services/storage');
    await authService.logout();
    expect(clearAll).toHaveBeenCalled();
  });
});

// ─── checkSession error path ──────────────────────────────────────────

describe('authService.checkSession', () => {
  it('returns null when api.get throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('network error'));
    const { clearAll } = require('../services/storage');
    const result = await authService.checkSession();
    expect(result).toBeNull();
    expect(clearAll).toHaveBeenCalled();
  });
});

// ─── forgotPassword ───────────────────────────────────────────────────

describe('authService.forgotPassword', () => {
  it('calls api.post with email', async () => {
    mockPost.mockResolvedValue({});
    await authService.forgotPassword('test@test.com');
    expect(mockPost).toHaveBeenCalledWith(
      '/auth/recuperar-contrasena',
      { email: 'test@test.com' },
    );
  });
});

// ─── validateResetToken ───────────────────────────────────────────────

describe('authService.validateResetToken', () => {
  it('returns valid status', async () => {
    mockGet.mockResolvedValue({ valid: true });
    const result = await authService.validateResetToken('tok123');
    expect(result.valid).toBe(true);
    expect(mockGet).toHaveBeenCalledWith(
      '/auth/validar-token?token=tok123',
    );
  });
});

// ─── resetPassword ────────────────────────────────────────────────────

describe('authService.resetPassword', () => {
  it('calls api.post with token and password', async () => {
    mockPost.mockResolvedValue({});
    await authService.resetPassword('tok123', 'newpass');
    expect(mockPost).toHaveBeenCalledWith(
      '/auth/resetear-contrasena',
      { token: 'tok123', password: 'newpass' },
    );
  });
});

// ─── isBiometricAvailable ─────────────────────────────────────────────

describe('authService.isBiometricAvailable', () => {
  it('returns false when no hardware', async () => {
    const localAuth = require('expo-local-authentication');
    localAuth.hasHardwareAsync.mockResolvedValue(false);
    const result = await authService.isBiometricAvailable();
    expect(result).toBe(false);
  });

  it('returns false when not enrolled', async () => {
    const localAuth = require('expo-local-authentication');
    localAuth.hasHardwareAsync.mockResolvedValue(true);
    localAuth.isEnrolledAsync.mockResolvedValue(false);
    const result = await authService.isBiometricAvailable();
    expect(result).toBe(false);
  });

  it('returns true when hardware and enrolled', async () => {
    const localAuth = require('expo-local-authentication');
    localAuth.hasHardwareAsync.mockResolvedValue(true);
    localAuth.isEnrolledAsync.mockResolvedValue(true);
    const result = await authService.isBiometricAvailable();
    expect(result).toBe(true);
  });
});

// ─── loginWithBiometrics ──────────────────────────────────────────────

describe('authService.loginWithBiometrics', () => {
  it('returns null when no biometric token', async () => {
    const { getBiometricToken } = require('../services/storage');
    (getBiometricToken as jest.Mock).mockResolvedValue(null);
    const result = await authService.loginWithBiometrics();
    expect(result).toBeNull();
  });

  it('returns null when authentication fails', async () => {
    const { getBiometricToken } = require('../services/storage');
    (getBiometricToken as jest.Mock).mockResolvedValue('user@test.com');
    const localAuth = require('expo-local-authentication');
    localAuth.authenticateAsync.mockResolvedValue({ success: false });
    const result = await authService.loginWithBiometrics();
    expect(result).toBeNull();
  });

  it('logs in when biometric auth succeeds', async () => {
    const { getBiometricToken } = require('../services/storage');
    (getBiometricToken as jest.Mock).mockResolvedValue('user@test.com');
    const localAuth = require('expo-local-authentication');
    localAuth.authenticateAsync.mockReset();
    localAuth.authenticateAsync.mockResolvedValue({ success: true });
    mockPost.mockResolvedValue({ token: 'bio-tok', user: { id: '2', name: 'Bio User' } });
    const result = await authService.loginWithBiometrics();
    expect(result).not.toBeNull();
    expect(result!.token).toBe('bio-tok');
    expect(mockPost).toHaveBeenCalledWith(
      '/customer/auth/login',
      { email: 'user@test.com', password: '__biometric__' },
    );
  });
});

// ─── enableBiometric ──────────────────────────────────────────────────

describe('authService.enableBiometric', () => {
  it('returns false when biometric not available', async () => {
    const localAuth = require('expo-local-authentication');
    localAuth.hasHardwareAsync.mockResolvedValue(false);
    const result = await authService.enableBiometric('test@test.com');
    expect(result).toBe(false);
  });

  it('returns false when authentication fails', async () => {
    const localAuth = require('expo-local-authentication');
    localAuth.hasHardwareAsync.mockResolvedValue(true);
    localAuth.isEnrolledAsync.mockResolvedValue(true);
    localAuth.authenticateAsync.mockResolvedValue({ success: false });
    const result = await authService.enableBiometric('test@test.com');
    expect(result).toBe(false);
  });

  it('enables biometric when auth succeeds', async () => {
    const { setBiometricEnabled, setBiometricToken } = require('../services/storage');
    const localAuth = require('expo-local-authentication');
    localAuth.hasHardwareAsync.mockResolvedValue(true);
    localAuth.isEnrolledAsync.mockResolvedValue(true);
    localAuth.authenticateAsync.mockResolvedValue({ success: true });
    const result = await authService.enableBiometric('test@test.com');
    expect(result).toBe(true);
    expect(setBiometricEnabled).toHaveBeenCalledWith(true);
    expect(setBiometricToken).toHaveBeenCalledWith('test@test.com');
  });

  it('returns false when authenticateAsync throws', async () => {
    const localAuth = require('expo-local-authentication');
    localAuth.hasHardwareAsync.mockResolvedValue(true);
    localAuth.isEnrolledAsync.mockResolvedValue(true);
    localAuth.authenticateAsync.mockRejectedValueOnce(new Error('auth error'));
    const result = await authService.enableBiometric('test@test.com');
    expect(result).toBe(false);
  });
});

// ─── disableBiometric ─────────────────────────────────────────────────

describe('authService.disableBiometric', () => {
  it('calls storage to disable biometric', async () => {
    const { setBiometricEnabled, removeBiometricToken } = require('../services/storage');
    await authService.disableBiometric();
    expect(setBiometricEnabled).toHaveBeenCalledWith(false);
    expect(removeBiometricToken).toHaveBeenCalled();
  });
});

// ─── isBiometricAvailable web platform ────────────────────────────────
// Placed LAST to avoid jest.resetModules affecting other tests

describe('authService.isBiometricAvailable web', () => {
  it('returns false on web', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    jest.doMock('../services/api', () => ({
      api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
    }));
    jest.doMock('../services/storage', () => ({
      setToken: jest.fn(), setUserData: jest.fn(), clearAll: jest.fn(), getUserData: jest.fn(),
      setBiometricEnabled: jest.fn(), setBiometricToken: jest.fn(), removeBiometricToken: jest.fn(),
      getBiometricToken: jest.fn(),
    }));
    jest.doMock('expo-local-authentication', () => ({
      hasHardwareAsync: jest.fn(), isEnrolledAsync: jest.fn(), authenticateAsync: jest.fn(),
    }));
    const { authService: auth } = require('../services/auth');
    const result = await auth.isBiometricAvailable();
    expect(result).toBe(false);
  });
});
