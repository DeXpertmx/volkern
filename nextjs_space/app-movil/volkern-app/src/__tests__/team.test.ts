import { teamService } from '../services/team';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const mockItems: any[] = [
  { id: 'test-1', name: 'Item 1', email: 'test1@test.com', role: 'member', department: 'Eng', status: 'active', createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'test-2', name: 'Item 2', email: 'test2@test.com', role: 'admin', department: 'Sales', status: 'active', createdAt: 1700000000001, updatedAt: 1700000000001 },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('teamService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await teamService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await teamService.getAll()).toHaveLength(2);
  });
});

describe('teamService.create', () => {
  it('creates and persists item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await teamService.create({ name: 'New Member' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('teamService.update', () => {
  it('updates item fields', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await teamService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await teamService.update('bad-id', {} as any);
    expect(result).toBeNull();
  });
});

describe('teamService.delete', () => {
  it('removes item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await teamService.delete('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('teamService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const stats = await teamService.getStats();
    expect(stats).toHaveProperty('totalMembers');
  });
});

describe('teamService.getMember', () => {
  it('returns member by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await teamService.getMember('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });

  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await teamService.getMember('bad-id');
    expect(result).toBeNull();
  });
});

describe('teamService.getMembersByRole', () => {
  it('filtra por rol', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await teamService.getMembersByRole('admin');
    expect(result).toHaveLength(1);
  });
});

describe('teamService.search', () => {
  it('busca por nombre y email', async () => {
    const itemsWithExtra = mockItems.map(i => ({ ...i, specialties: [], department: 'Eng' }));
    mockedGetItem.mockResolvedValue(JSON.stringify(itemsWithExtra));
    const result = await teamService.search('Item 1');
    expect(result).toHaveLength(1);
  });
});

describe('teamService.toggleActive', () => {
  it('alterna active/suspended', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await teamService.toggleActive('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.status).toBe('suspended');
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await teamService.toggleActive('bad-id');
    expect(result).toBeNull();
  });
});

describe('teamService.getActivity', () => {
  it('devuelve array vacío sin datos', async () => {
    mockedGetItem.mockResolvedValue(null);
    const activity = await teamService.getActivity();
    expect(activity).toEqual([]);
  });
});

describe('teamService.getActivityByMember', () => {
  it('filtra por miembro', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'a1', memberId: 'test-1', action: 'login', timestamp: 1 }]));
    const result = await teamService.getActivityByMember('test-1');
    expect(result).toHaveLength(1);
  });
});

describe('teamService.resendInvite', () => {
  it('reenvía invitación', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await teamService.resendInvite('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('teamService.updateStatus', () => {
  it('actualiza status a suspended', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await teamService.updateStatus('test-1', 'suspended');
    expect(result).not.toBeNull();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

