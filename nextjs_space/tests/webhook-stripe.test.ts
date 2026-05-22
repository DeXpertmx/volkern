import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkIfEventProcessed, DUNNING_NOTIFICATION_DAYS } from '@/app/api/webhooks/stripe/route';

// Mock stripe to prevent Stripe SDK initialization in test environment
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
  },
}));

// Mock email/ses/automation/fiscal imports from the route module
vi.mock('@/lib/email', () => ({ sendPaymentConfirmation: vi.fn() }));
vi.mock('@/lib/ses-email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/automation-engine', () => ({ triggerAutomation: vi.fn() }));
vi.mock('@/lib/finance/mexico/stripe-mx-service', () => ({
  StripeMXService: { syncFiscalFiles: vi.fn() },
}));

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    processedWebhook: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

describe('Stripe Webhook — DUNNING_NOTIFICATION_DAYS', () => {
  it('debe contener los días 3, 7 y 14', () => {
    expect(DUNNING_NOTIFICATION_DAYS).toEqual([3, 7, 14]);
  });

  it('debe estar ordenado ascendentemente', () => {
    const sorted = [...DUNNING_NOTIFICATION_DAYS].sort((a, b) => a - b);
    expect(DUNNING_NOTIFICATION_DAYS).toEqual(sorted);
  });

  it('todos los días deben ser positivos', () => {
    DUNNING_NOTIFICATION_DAYS.forEach((day) => {
      expect(day).toBeGreaterThan(0);
    });
  });
});

describe('Stripe Webhook — checkIfEventProcessed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver false si stripeEventId está vacío', async () => {
    const result = await checkIfEventProcessed('', 'tenant-1');
    expect(result).toBe(false);
  });

  it('debe devolver false si stripeEventId es undefined (string vacío)', async () => {
    const result = await checkIfEventProcessed('', undefined);
    expect(result).toBe(false);
  });

  it('debe devolver true si el evento ya fue procesado', async () => {
    const mockFindUnique = prisma.processedWebhook.findUnique as ReturnType<typeof vi.fn>;
    mockFindUnique.mockResolvedValue({
      id: 'wh-1',
      stripeEventId: 'evt_123',
      tenantId: 'tenant-1',
    });

    const result = await checkIfEventProcessed('evt_123', 'tenant-1');
    expect(result).toBe(true);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        stripeEventId_tenantId: {
          stripeEventId: 'evt_123',
          tenantId: 'tenant-1',
        },
      },
    });
  });

  it('debe devolver false si el evento no fue procesado', async () => {
    const mockFindUnique = prisma.processedWebhook.findUnique as ReturnType<typeof vi.fn>;
    mockFindUnique.mockResolvedValue(null);

    const result = await checkIfEventProcessed('evt_456', 'tenant-2');
    expect(result).toBe(false);
  });

  it('debe manejar tenantId vacío correctamente', async () => {
    const mockFindUnique = prisma.processedWebhook.findUnique as ReturnType<typeof vi.fn>;
    mockFindUnique.mockResolvedValue(null);

    const result = await checkIfEventProcessed('evt_789', '');
    expect(result).toBe(false);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        stripeEventId_tenantId: {
          stripeEventId: 'evt_789',
          tenantId: '',
        },
      },
    });
  });

  it('debe manejar tenantId undefined convirtiéndolo a string vacío', async () => {
    const mockFindUnique = prisma.processedWebhook.findUnique as ReturnType<typeof vi.fn>;
    mockFindUnique.mockResolvedValue(null);

    const result = await checkIfEventProcessed('evt_000', undefined);
    expect(result).toBe(false);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        stripeEventId_tenantId: {
          stripeEventId: 'evt_000',
          tenantId: '',
        },
      },
    });
  });

  it('debe manejar errores de Prisma propagándolos', async () => {
    const mockFindUnique = prisma.processedWebhook.findUnique as ReturnType<typeof vi.fn>;
    mockFindUnique.mockRejectedValue(new Error('DB connection error'));

    await expect(checkIfEventProcessed('evt_error', 'tenant-1')).rejects.toThrow('DB connection error');
  });

  it('debe llamar a findUnique con el composite key correcto', async () => {
    const mockFindUnique = prisma.processedWebhook.findUnique as ReturnType<typeof vi.fn>;
    mockFindUnique.mockResolvedValue(null);

    await checkIfEventProcessed('evt_comp_1', 'tenant-comp');

    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    const callArg = mockFindUnique.mock.calls[0][0];
    expect(callArg.where.stripeEventId_tenantId.stripeEventId).toBe('evt_comp_1');
    expect(callArg.where.stripeEventId_tenantId.tenantId).toBe('tenant-comp');
  });
});
