import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks de prisma (vi.hoisted) ────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  signatureRequestFindUnique: vi.fn(),
  signatureAuditEventCreate: vi.fn(),
  signatureRequestUpdate: vi.fn(),
  contratoTimelineCreate: vi.fn(),
}));

vi.mock('@prisma/client', () => {
  const PrismaClient = vi.fn(() => ({
    signatureRequest: {
      findUnique: mocks.signatureRequestFindUnique,
      update: mocks.signatureRequestUpdate,
    },
    signatureAuditEvent: {
      create: mocks.signatureAuditEventCreate,
    },
    contratoTimeline: {
      create: mocks.contratoTimelineCreate,
    },
  }));
  return { PrismaClient };
});

import { SignatureService } from '@/lib/signatures/SignatureService';

const REQ = {
  id: 'req-1',
  contratoId: 'ctr-1',
  libreSignUuid: 'abc-123',
  status: 'sent',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signatureRequestFindUnique.mockResolvedValue({
    ...REQ,
    auditEvents: [{ eventHash: 'hash-anterior' }],
  });
  mocks.signatureAuditEventCreate.mockResolvedValue({ id: 'evt-1' });
  mocks.signatureRequestUpdate.mockResolvedValue({ id: 'req-1', status: 'signed' });
  mocks.contratoTimelineCreate.mockResolvedValue({ id: 'tl-1' });
});

describe('SignatureService.handleWebhook → timeline del contrato', () => {
  it('registra document_signed en el timeline del contrato', async () => {
    await SignatureService.handleWebhook('t-1', {
      uuid: 'abc-123',
      status: 3,
      signer_email: 'cliente@empresa.com',
    });

    expect(mocks.signatureRequestUpdate).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { status: 'signed', completedAt: expect.any(Date) },
    });

    expect(mocks.contratoTimelineCreate).toHaveBeenCalledTimes(1);
    const call = mocks.contratoTimelineCreate.mock.calls[0][0];
    expect(call.data.contratoId).toBe('ctr-1');
    expect(call.data.action).toBe('document_signed');
    expect(call.data.note).toContain('cliente@empresa.com');
    expect(call.data.metadata.signatureRequestId).toBe('req-1');
    expect(call.data.metadata.libreSignUuid).toBe('abc-123');
  });

  it('normaliza event document_signed (JSON legacy) también registra timeline', async () => {
    await SignatureService.handleWebhook('t-1', {
      uuid: 'abc-123',
      event: 'document_signed',
      signer_email: 'a@b.c',
    });

    expect(mocks.contratoTimelineCreate).toHaveBeenCalledTimes(1);
    expect(mocks.contratoTimelineCreate.mock.calls[0][0].data.action).toBe('document_signed');
  });

  it('NO registra timeline si no es document_signed', async () => {
    await SignatureService.handleWebhook('t-1', {
      uuid: 'abc-123',
      status: 1, // ABLE_TO_SIGN
      signer_email: 'a@b.c',
    });

    expect(mocks.signatureRequestUpdate).not.toHaveBeenCalled();
    expect(mocks.contratoTimelineCreate).not.toHaveBeenCalled();
  });

  it('NO registra timeline si la solicitud no tiene contrato ligado', async () => {
    mocks.signatureRequestFindUnique.mockResolvedValue({
      ...REQ,
      contratoId: null,
      auditEvents: [{ eventHash: 'hash-anterior' }],
    });

    await SignatureService.handleWebhook('t-1', {
      uuid: 'abc-123',
      status: 3,
      signer_email: 'a@b.c',
    });

    expect(mocks.contratoTimelineCreate).not.toHaveBeenCalled();
  });

  it('no rompe el webhook si falla el timeline (log y continúa)', async () => {
    mocks.contratoTimelineCreate.mockRejectedValue(new Error('db down'));

    const result = await SignatureService.handleWebhook('t-1', {
      uuid: 'abc-123',
      status: 3,
      signer_email: 'a@b.c',
    });

    expect(result.id).toBe('evt-1'); // sigue devolviendo el evento de auditoría
  });
});
