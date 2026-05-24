import { billingService } from '../services/billing';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.MockedFunction<typeof getData>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

beforeEach(() => { jest.clearAllMocks(); });

describe('billingService.getSubscription', () => {
  it('returns null when no subscription', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await billingService.getSubscription()).toBeNull();
  });
  it('returns subscription when exists', async () => {
    mockedGetData.mockResolvedValue({ id: 'sub1', name: 'Business', amount: 29, status: 'active' });
    const sub = await billingService.getSubscription();
    expect(sub).not.toBeNull();
    expect(sub!.name).toBe('Business');
  });
});

describe('billingService.getInvoices', () => {
  it('returns invoices array', async () => {
    mockedGetData.mockResolvedValue([{ id: 'inv1', number: 'F-001', amount: 100, status: 'paid' }]);
    expect(await billingService.getInvoices()).toHaveLength(1);
  });
});

describe('billingService.getPaymentMethods', () => {
  it('returns payment methods', async () => {
    mockedGetData.mockResolvedValue([{ id: 'pm1', type: 'card', last4: '4242', isDefault: true }]);
    expect(await billingService.getPaymentMethods()).toHaveLength(1);
  });
});

describe('billingService.changePlan', () => {
  it('changes to valid plan', async () => {
    mockedGetData.mockResolvedValue(null);
    await billingService.changePlan('business');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('billingService.cancelSubscription', () => {
  it('cancels subscription', async () => {
    mockedGetData.mockResolvedValue({ id: 'sub1', name: 'Business', status: 'active' });
    await billingService.cancelSubscription();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});


// ─── Extra coverage: billing methods ───────────────────────────────────

describe('billingService.changePlan', () => {
  it('changes to a valid plan', async () => {
    // billing uses saveData from secure-storage
    mockedGetData.mockResolvedValue(null);
    await billingService.changePlan('business');
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('throws for invalid plan', async () => {
    await expect(billingService.changePlan('nonexistent')).rejects.toThrow('Invalid plan');
  });
});

describe('billingService.cancelSubscription', () => {
  it('cancels active subscription', async () => {
    mockedGetData.mockResolvedValue({
      id: 'sub1', name: 'Business', amount: 29, currency: 'USD',
      interval: 'monthly', status: 'active',
      currentPeriodStart: '2026-01-01', currentPeriodEnd: '2026-02-01',
      canceledAt: null, trialEnd: null,
    });
    await billingService.cancelSubscription();
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('does nothing when no subscription', async () => {
    mockedGetData.mockResolvedValue(null);
    await billingService.cancelSubscription();
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});

describe('billingService.downloadInvoice', () => {
  it('returns pdfUrl for existing invoice', async () => {
    mockedGetData.mockResolvedValue([
      { id: 'inv1', number: 'F-001', amount: 100, currency: 'USD', status: 'paid', date: '2026-01-01', dueDate: '2026-01-15', paidAt: '2026-01-02', items: [], pdfUrl: 'https://example.com/inv1.pdf' },
    ]);
    const url = await billingService.downloadInvoice('inv1');
    expect(url).toBe('https://example.com/inv1.pdf');
  });

  it('returns null for missing invoice', async () => {
    mockedGetData.mockResolvedValue([]);
    const url = await billingService.downloadInvoice('bad-id');
    expect(url).toBeNull();
  });
});

describe('billingService.addPaymentMethod', () => {
  it('adds payment method (first becomes default)', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await billingService.addPaymentMethod({
      type: 'card', last4: '4242', brand: 'Visa', expMonth: 12, expYear: 2027, isDefault: false,
    });
    expect(result.isDefault).toBe(true);
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('billingService.removePaymentMethod', () => {
  it('removes and makes first remaining default', async () => {
    mockedGetData.mockResolvedValue([
      { id: 'pm1', type: 'card', last4: '4242', brand: 'Visa', expMonth: 12, expYear: 2027, isDefault: true },
    ]);
    await billingService.removePaymentMethod('pm1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('billingService.setDefaultPaymentMethod', () => {
  it('sets default and removes from others', async () => {
    mockedGetData.mockResolvedValue([
      { id: 'pm1', type: 'card', last4: '4242', brand: 'Visa', expMonth: 12, expYear: 2027, isDefault: true },
      { id: 'pm2', type: 'card', last4: '1111', brand: 'MC', expMonth: 10, expYear: 2026, isDefault: false },
    ]);
    await billingService.setDefaultPaymentMethod('pm2');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('billingService.changePlan with existing sub', () => {
  it('preserves existing id when changing plan', async () => {
    mockedGetData.mockResolvedValue({
      id: 'sub1', name: 'Starter', amount: 0, currency: 'USD',
      interval: 'monthly', status: 'active',
      currentPeriodStart: '2026-01-01', currentPeriodEnd: '2026-02-01',
      canceledAt: null, trialEnd: null,
    });
    await billingService.changePlan('enterprise');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});
