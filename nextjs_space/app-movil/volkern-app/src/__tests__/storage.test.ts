import { getToken, setToken, removeToken, getUserData, setUserData, clearAll } from '../services/storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;
const mockedDeleteItem = require('expo-secure-store').deleteItemAsync as jest.Mock;

describe('storage', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('getToken returns null when empty', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await getToken()).toBeNull();
  });

  it('setToken stores value', async () => {
    await setToken('abc123');
    expect(mockedSetItem).toHaveBeenCalledWith(expect.any(String), 'abc123');
  });

  it('removeToken deletes key', async () => {
    await removeToken();
    expect(mockedDeleteItem).toHaveBeenCalled();
  });

  it('getUserData returns parsed user', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ id: 'u1', name: 'Test' }));
    const user = await getUserData();
    expect(user).not.toBeNull();
    expect(user!.name).toBe('Test');
  });

  it('clearAll removes all keys', async () => {
    await clearAll();
    expect(mockedDeleteItem).toHaveBeenCalledTimes(3);
  });

  it('getUserData returns null on parse error', async () => {
    mockedGetItem.mockResolvedValue('invalid-json');
    const user = await getUserData();
    expect(user).toBeNull();
  });

  it('getUserData returns null when empty', async () => {
    mockedGetItem.mockResolvedValue(null);
    const user = await getUserData();
    expect(user).toBeNull();
  });

  it('handles getItem error gracefully', async () => {
    mockedGetItem.mockRejectedValue(new Error('Storage error'));
    const token = await getToken();
    expect(token).toBeNull();
  });
});

describe('storage biometric', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('isBiometricEnabled returns true when enabled', async () => {
    const { isBiometricEnabled, setBiometricEnabled, getBiometricToken, setBiometricToken, removeBiometricToken } = require('../services/storage');
    mockedGetItem.mockResolvedValue('true');
    expect(await isBiometricEnabled()).toBe(true);

    mockedGetItem.mockResolvedValue('false');
    expect(await isBiometricEnabled()).toBe(false);
  });

  it('setBiometricEnabled stores value', async () => {
    const { setBiometricEnabled } = require('../services/storage');
    await setBiometricEnabled(true);
    expect(mockedSetItem).toHaveBeenCalledWith(expect.any(String), 'true');
  });

  it('getBiometricToken returns token', async () => {
    const { getBiometricToken } = require('../services/storage');
    mockedGetItem.mockResolvedValue('token-123');
    expect(await getBiometricToken()).toBe('token-123');
  });

  it('setBiometricToken stores token', async () => {
    const { setBiometricToken } = require('../services/storage');
    await setBiometricToken('token-456');
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('removeBiometricToken deletes token', async () => {
    const { removeBiometricToken } = require('../services/storage');
    await removeBiometricToken();
    expect(mockedDeleteItem).toHaveBeenCalled();
  });
});
