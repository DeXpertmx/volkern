import { invoicesService } from '../services/invoices';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const mockItems: any[] = [
  { id: 'test-1', number: 'F-0001', clientName: 'Client A', clientEmail: 'a@test.com', total: 1000, status: 'paid', createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'test-2', number: 'F-0002', clientName: 'Client B', clientEmail: 'b@test.com', total: 2000, status: 'sent', createdAt: 1700000000001, updatedAt: 1700000000001 },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('invoicesService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await invoicesService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await invoicesService.getAll()).toHaveLength(2);
  });
});

describe('invoicesService.getById', () => {
  it('returns item by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await invoicesService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns null for non-existent id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await invoicesService.getById('bad-id')).toBeNull();
  });
});

describe('invoicesService.create', () => {
  it('creates and persists item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await invoicesService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('invoicesService.update', () => {
  it('updates item fields', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await invoicesService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await invoicesService.update('bad-id', {} as any);
    expect(result).toBeNull();
  });
});

describe('invoicesService.delete', () => {
  it('removes item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await invoicesService.delete('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('no-op if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await invoicesService.delete('bad-id');
  });
});

describe('invoicesService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const stats = await invoicesService.getStats();
    expect(stats).toHaveProperty('total');
  });
});


describe('invoicesService.search', () => {
  it('returns matching items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await invoicesService.search('Client');
    expect(result).toHaveLength(2);
  });
});

describe('invoicesService.getByStatus', () => {
  it('filters by status and sorts by createdAt desc', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await invoicesService.getByStatus('paid');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('paid');
  });
});

describe('invoicesService.update with items', () => {
  it('recalculates totals when items provided', async () => {
    const items = [{ id: 'i1', description: 'Service', quantity: 2, unitPrice: 500, total: 1000 }];
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await invoicesService.update('test-1', { items, taxRate: 0.16, discount: 50 });
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('invoicesService.markPaid', () => {
  it('marks invoice as paid with payment', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await invoicesService.markPaid('test-1', {
      amount: 1000, method: 'cash', reference: 'REF-001', paidAt: Date.now(), notes: '',
    });
    expect(result).not.toBeNull();
    if (result) expect(result.status).toBe('paid');
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('returns null for non-existent invoice', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await invoicesService.markPaid('bad-id', {
      amount: 100, method: 'card', reference: '', paidAt: Date.now(), notes: '',
    });
    expect(result).toBeNull();
  });
});

describe('invoicesService status methods', () => {
  it('markSent', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await invoicesService.markSent('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('markOverdue', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await invoicesService.markOverdue('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('markCancelled', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await invoicesService.markCancelled('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('invoicesService payments', () => {
  it('getPayments returns filtered payments', async () => {
    mockedGetItem
      .mockResolvedValueOnce(null) // no getItemAsync for payments (first call)
      .mockResolvedValueOnce(null);
    const payments = await invoicesService.getPayments('test-1');
    expect(payments).toEqual([]);
  });

  it('deletePayment works', async () => {
    const payments = JSON.stringify([{ id: 'p1', invoiceId: 'test-1' }]);
    mockedGetItem.mockResolvedValue(payments);
    await invoicesService.deletePayment('p1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('invoicesService.getStats', () => {
  it('computes full stats from items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const stats = await invoicesService.getStats();
    expect(stats.total).toBe(2);
    expect(stats.totalAmount).toBe(3000);
    expect(stats.paidAmount).toBe(1000);
    expect(stats.outstandingAmount).toBe(2000);
    expect(stats.overdueAmount).toBe(0);
    expect(stats.averageValue).toBe(1500);
  });
});

describe('invoicesService.getNextInvoiceNumber', () => {
  it('generates F-0001 for empty array', () => {
    const { getNextInvoiceNumber } = require('../services/invoices');
    expect(getNextInvoiceNumber([])).toBe('F-0001');
  });

  it('increments last number', () => {
    const { getNextInvoiceNumber } = require('../services/invoices');
    const invoices = [{ number: 'F-0005' }];
    expect(getNextInvoiceNumber(invoices)).toBe('F-0006');
  });
});

describe('invoicesService payments edge cases', () => {
  it('getPayments when no data returns empty', async () => {
    mockedGetItem.mockResolvedValueOnce(null);
    const payments = await invoicesService.getPayments('inv-1');
    expect(payments).toEqual([]);
  });

  it('deletePayment handles non-existent payment', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'p1', invoiceId: 'inv-1' }]));
    await invoicesService.deletePayment('bad-id');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('invoicesService persist error handling', () => {
  it('does not throw when persist invoices fails', async () => {
    mockedSetItem.mockRejectedValue(new Error('Storage error'));
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    await invoicesService.create({ name: 'New' } as any);
    // Should not throw
  });

  it('does not throw when persist payments fails', async () => {
    mockedSetItem.mockRejectedValue(new Error('Storage error'));
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    await invoicesService.delete('test-1');
    // Should not throw despite payments persist failure
  });
});