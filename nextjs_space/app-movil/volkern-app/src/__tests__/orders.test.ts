import { ordersService, type Order } from '../services/orders';
import { getData, saveData } from '../services/secure-storage';

// Mock secure-storage module
jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.MockedFunction<typeof getData>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

const mockOrder: Order = {
  id: 'test-1',
  number: 'ORD-0001',
  customer: 'Test Client',
  customerEmail: 'test@example.com',
  items: [
    { id: 'item-1', product: 'Widget A', quantity: 2, unitPrice: 25, total: 50 },
    { id: 'item-2', product: 'Widget B', quantity: 1, unitPrice: 30, total: 30 },
  ],
  subtotal: 80,
  tax: 8,
  shipping: 10,
  total: 98,
  status: 'pending',
  notes: '',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockOrder2: Order = {
  ...mockOrder,
  id: 'test-2',
  number: 'ORD-0002',
  customer: 'Another Client',
  status: 'delivered',
  total: 150,
  createdAt: '2025-01-02T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ordersService.getAll', () => {
  it('returns empty array when no data exists', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await ordersService.getAll();
    expect(result).toEqual([]);
  });

  it('returns stored orders', async () => {
    mockedGetData.mockResolvedValue([mockOrder, mockOrder2]);
    const result = await ordersService.getAll();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('test-1');
    expect(result[1].id).toBe('test-2');
  });

  it('calls getData with correct key', async () => {
    mockedGetData.mockResolvedValue([]);
    await ordersService.getAll();
    expect(mockedGetData).toHaveBeenCalledWith('volkern_orders');
  });
});

describe('ordersService.getById', () => {
  it('returns the matching order', async () => {
    mockedGetData.mockResolvedValue([mockOrder, mockOrder2]);
    const result = await ordersService.getById('test-2');
    expect(result).not.toBeNull();
    expect(result!.customer).toBe('Another Client');
  });

  it('returns null for non-existent id', async () => {
    mockedGetData.mockResolvedValue([mockOrder]);
    const result = await ordersService.getById('non-existent');
    expect(result).toBeNull();
  });
});

describe('ordersService.create', () => {
  const createPayload = {
    customer: 'New Client',
    customerEmail: 'new@example.com',
    items: [{ id: 'i1', product: 'Product', quantity: 1, unitPrice: 100, total: 100 }],
    subtotal: 100,
    tax: 0,
    shipping: 0,
    total: 100,
    status: 'pending' as const,
    notes: '',
  };

  it('creates an order with generated id and number', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await ordersService.create(createPayload);
    expect(result.id).toBeDefined();
    expect(result.number).toMatch(/^ORD-\d{4}$/);
    expect(result.customer).toBe('New Client');
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it('prepends the new order to the list', async () => {
    mockedGetData.mockResolvedValue([mockOrder]);
    const result = await ordersService.create(createPayload);
    expect(mockedSaveData).toHaveBeenCalledTimes(1);
    const saved = mockedSaveData.mock.calls[0][1] as Order[];
    expect(saved[0].id).toBe(result.id);
    expect(saved).toHaveLength(2);
  });
});

describe('ordersService.update', () => {
  it('updates order fields and sets updatedAt', async () => {
    mockedGetData.mockResolvedValue([mockOrder, mockOrder2]);
    await ordersService.update('test-1', { status: 'shipped', notes: 'Shipped today' });
    expect(mockedSaveData).toHaveBeenCalledTimes(1);
    const saved = mockedSaveData.mock.calls[0][1] as Order[];
    const updated = saved.find(o => o.id === 'test-1')!;
    expect(updated.status).toBe('shipped');
    expect(updated.notes).toBe('Shipped today');
    expect(updated.updatedAt).not.toBe(mockOrder.updatedAt);
  });

  it('throws if order not found', async () => {
    mockedGetData.mockResolvedValue([mockOrder]);
    await expect(ordersService.update('bad-id', { status: 'delivered' })).rejects.toThrow('Order not found');
  });
});

describe('ordersService.delete', () => {
  it('removes the order from storage', async () => {
    mockedGetData.mockResolvedValue([mockOrder, mockOrder2]);
    await ordersService.delete('test-1');
    const saved = mockedSaveData.mock.calls[0][1] as Order[];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('test-2');
  });

  it('does nothing if id not found', async () => {
    mockedGetData.mockResolvedValue([mockOrder]);
    await ordersService.delete('bad-id');
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});

describe('ordersService.getStats', () => {
  it('calculates correct totals', async () => {
    mockedGetData.mockResolvedValue([mockOrder, mockOrder2]);
    const stats = await ordersService.getStats();
    expect(stats.total).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.revenue).toBe(98 + 150); // both orders not cancelled
  });

  it('excludes cancelled orders from revenue', async () => {
    const cancelled = { ...mockOrder, id: 'cancelled-1', status: 'cancelled' as const, total: 999 };
    mockedGetData.mockResolvedValue([mockOrder, cancelled]);
    const stats = await ordersService.getStats();
    expect(stats.revenue).toBe(98);
  });

  it('returns zeroes when no orders', async () => {
    mockedGetData.mockResolvedValue([]);
    const stats = await ordersService.getStats();
    expect(stats).toEqual({ total: 0, pending: 0, revenue: 0 });
  });
});
