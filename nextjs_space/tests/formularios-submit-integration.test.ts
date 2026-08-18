import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks del módulo db y del event bus antes de importar la ruta
const mocks = vi.hoisted(() => ({
  webFormFindUnique: vi.fn(),
  webFormSubmissionCreate: vi.fn(),
  webFormSubmissionUpdate: vi.fn(),
  leadCreate: vi.fn(),
  emitEvent: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    webForm: { findUnique: mocks.webFormFindUnique },
    webFormSubmission: { create: mocks.webFormSubmissionCreate, update: mocks.webFormSubmissionUpdate },
    lead: { create: mocks.leadCreate },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  EVENTS: { FORM_SUBMITTED: 'form_submitted' },
  eventBus: { emitEvent: (...args: any[]) => mocks.emitEvent(...args) },
}));

const { POST } = await import('@/app/api/formularios/[id]/submit/route');

function makeRequest(payload: any): Request {
  return new Request('https://volkern.app/api/formularios/wf-1/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'test-agent' },
    body: JSON.stringify({ payload }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webFormFindUnique.mockResolvedValue({
    id: 'wf-1',
    tenantId: 'tenant-1',
    name: 'Formulario de Contacto',
    config: { title: 'Formulario de Contacto' },
  });
  mocks.webFormSubmissionCreate.mockResolvedValue({ id: 'sub-1' });
  mocks.webFormSubmissionUpdate.mockResolvedValue({ id: 'sub-1', leadId: 'lead-1' });
  mocks.leadCreate.mockImplementation(async (args: any) => ({ id: 'lead-1', ...args.data }));
});

describe('POST /api/formularios/[id]/submit — integración', () => {
  it('crea el lead con email y notifica + emite evento', async () => {
    const res = await POST(makeRequest({ nombre: 'Ana', email: 'ana@x.com', telefono: '555', pais: 'México' }), {
      params: { id: 'wf-1' },
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.leadId).toBe('lead-1');

    // Lead creado con campos estándar
    const leadArgs = mocks.leadCreate.mock.calls[0][0];
    expect(leadArgs.data.email).toBe('ana@x.com');
    expect(leadArgs.data.nombre).toBe('Ana');
    expect(leadArgs.data.telefono).toBe('555');
    expect(leadArgs.data.fuente).toBe('Formulario Web');
    // Campos no estándar van a notas
    expect(leadArgs.data.notas).toContain('pais: México');
    expect(leadArgs.data.notas).toContain('Formulario de Contacto');

    // Evento FORM_SUBMITTED emitido con leadId
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      'form_submitted',
      expect.objectContaining({ formId: 'wf-1', leadId: 'lead-1', email: 'ana@x.com' })
    );
  });

  it('sin email no crea lead pero igual emite el evento', async () => {
    const res = await POST(makeRequest({ nombre: 'Sin Email' }), { params: { id: 'wf-1' } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.leadId).toBeUndefined();
    expect(mocks.leadCreate).not.toHaveBeenCalled();
    expect(mocks.emitEvent).toHaveBeenCalledWith('form_submitted', expect.objectContaining({ formId: 'wf-1' }));
  });

  it('responde 404 si el formulario no existe', async () => {
    mocks.webFormFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ email: 'a@b.com' }), { params: { id: 'nope' } } as any);
    expect(res.status).toBe(404);
  });
});
