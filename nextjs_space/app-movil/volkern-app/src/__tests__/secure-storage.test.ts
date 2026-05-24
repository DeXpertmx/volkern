import { getData, saveData } from '../services/secure-storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getData', () => {
  it('returns parsed data when key exists', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ name: 'test', count: 42 }));
    const result = await getData<{ name: string; count: number }>('my-key');
    expect(result).toEqual({ name: 'test', count: 42 });
    expect(mockedGetItem).toHaveBeenCalledWith('my-key');
  });

  it('returns null when key does not exist', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await getData('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null when getItemAsync throws', async () => {
    mockedGetItem.mockRejectedValue(new Error('storage error'));
    const result = await getData('failing-key');
    expect(result).toBeNull();
  });

  it('returns null when JSON is invalid', async () => {
    mockedGetItem.mockResolvedValue('not valid json{{{');
    const result = await getData('bad-json');
    expect(result).toBeNull();
  });
});

describe('saveData', () => {
  it('saves JSON-stringified data', async () => {
    mockedSetItem.mockResolvedValue(undefined);
    await saveData('my-key', { foo: 'bar', num: 123 });
    expect(mockedSetItem).toHaveBeenCalledWith('my-key', JSON.stringify({ foo: 'bar', num: 123 }));
  });

  it('handles setItemAsync error gracefully', async () => {
    mockedSetItem.mockRejectedValue(new Error('disk full'));
    // Should not throw — just console.error
    await expect(saveData('err-key', 'data')).resolves.toBeUndefined();
  });

  it('saves primitive values', async () => {
    mockedSetItem.mockResolvedValue(undefined);
    await saveData('str-key', 'hello');
    expect(mockedSetItem).toHaveBeenCalledWith('str-key', '"hello"');
  });

  it('saves arrays', async () => {
    mockedSetItem.mockResolvedValue(undefined);
    await saveData('arr-key', [1, 2, 3]);
    expect(mockedSetItem).toHaveBeenCalledWith('arr-key', '[1,2,3]');
  });
});
