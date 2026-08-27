import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks del módulo db y del event bus antes de importar la ruta
const mocks = vi.hoisted(() => ({
  webFormFindUnique: vi.fn(),
  webFormSubmissionCreate: vi.fn(),
  webFormSubmissionUpdate: vi.fn(),
  leadCreate: vi.fn(),
  leadFieldDefinitionFindMany: vi.fn(),
  transaction: vi.fn(),
  emitEvent: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: mocks.transaction,
    webForm: { findUnique: mocks.webFormFindUnique },
    webFormSubmission: { create: mocks.webFormSubmissionCreate, update: mocks.webFormSubmissionUpdate },
    lead: { create: mocks.leadCreate },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  EVENTS: { FORM_SUBMITTED: 'form_submitted' },
  eventBus: { emitEvent: (...args: any[]) => mocks.emitEvent(...args) },
}));

// El route asegura el listener antes de emitir (fix de bundles separados en
// Next.js standalone). En el test es un no-op: el event bus ya está mockeado.
vi.mock('@/lib/skills/automation-listener', () => ({
  ensureAutomationListeners: vi.fn(),
}));

const { POST } = await import('@/app/api/formularios/[id]/submit/route');
const { parseSubmissionPayload } = await import('@/lib/marketing/form-submit-helpers');

function makeRequest(payload: any): Request {
  return new Request('https://volkern.app/api/formularios/wf-1/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'test-agent' },
    body: JSON.stringify({ payload }),
  });
}

function makeUrlEncodedRequest(payload: Record<string, string>): Request {
  return new Request('https://volkern.app/api/formularios/wf-1/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'user-agent': 'test-agent' },
    body: new URLSearchParams(payload).toString(),
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
  mocks.leadFieldDefinitionFindMany.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback({
    webFormSubmission: {
      create: mocks.webFormSubmissionCreate,
      update: mocks.webFormSubmissionUpdate,
    },      lead: { create: mocks.leadCreate },
    leadFieldDefinition: { findMany: mocks.leadFieldDefinitionFindMany },
  }));

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
    // Los nombres estándar conocidos se ligan automáticamente y el contexto permanece en notas.
    expect(leadArgs.data.pais).toBe('México');
    expect(leadArgs.data.notas).toContain('Formulario de Contacto');

    // Evento FORM_SUBMITTED emitido con leadId
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      'form_submitted',
      expect.objectContaining({ formId: 'wf-1', leadId: 'lead-1', email: 'ana@x.com' })
    );
  });

  it('aplica el mapeo explícito a campos estándar y personalizados del CRM', async () => {
    mocks.webFormFindUnique.mockResolvedValue({
      id: 'wf-1',
      tenantId: 'tenant-1',
      name: 'Formulario con mapeo',
      config: {
        fieldMappings: {
          correo_personal: 'standard:email',
          nombre_persona: 'standard:nombre',
          sector: 'custom:sector',
        },
      },
    });
    mocks.leadFieldDefinitionFindMany.mockResolvedValue([
      { fieldKey: 'sector', activo: true },
    ]);

    await POST(makeRequest({
      correo_personal: 'mapeado@example.com',
      nombre_persona: 'Persona Mapeada',
      sector: 'Construcción',
    }), { params: { id: 'wf-1' } } as any);

    const leadArgs = mocks.leadCreate.mock.calls[0][0];
    expect(leadArgs.data.email).toBe('mapeado@example.com');
    expect(leadArgs.data.nombre).toBe('Persona Mapeada');
    expect(leadArgs.data.metadataExterna).toEqual({ sector: 'Construcción' });
    expect(leadArgs.data.notas).not.toContain('sector: Construcción');
  });

  it('acepta el envío HTML application/x-www-form-urlencoded del Web Creator y devuelve agradecimiento HTML', async () => {
    const res = await POST(makeUrlEncodedRequest({
      nombre: 'Bruno Hess',
      email: 'bruno@example.com',
      empresa: 'DeXpert',
      '¿Qué buscas?': 'Conectar',
    }), { params: { id: 'wf-1' } } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('¡Gracias! Hemos recibido tus datos.');
    expect(mocks.leadCreate.mock.calls[0][0].data.notas).toContain('¿Qué buscas?: Conectar');
  });

  it('redirige el envío HTML a la URL externa configurada después de crear el lead', async () => {
    mocks.webFormFindUnique.mockResolvedValue({
      id: 'wf-1',
      tenantId: 'tenant-1',
      name: 'Formulario con redirección',
      config: { thankYou: { redirectUrl: 'https://ejemplo.com/gracias' } },
    });

    const res = await POST(makeUrlEncodedRequest({
      nombre: 'Bruno Hess',
      email: 'bruno-redirect@example.com',
    }), { params: { id: 'wf-1' } } as any);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://ejemplo.com/gracias');
  });

  it('parsea un payload JSON envuelto y uno directo', async () => {
    const wrapped = await parseSubmissionPayload(makeRequest({ nombre: 'Ana', email: 'ana@x.com' }));
    expect(wrapped).toEqual({ nombre: 'Ana', email: 'ana@x.com' });

    const direct = await parseSubmissionPayload(new Request('https://volkern.app/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Directo' }),
    }));
    expect(direct).toEqual({ nombre: 'Directo' });
  });

  it('si falla la persistencia no muestra agradecimiento ni inventa un registro correcto', async () => {
    mocks.leadCreate.mockRejectedValue(new Error('fallo de base de datos'));

    const res = await POST(makeUrlEncodedRequest({
      nombre: 'No Guardado',
      email: 'no-guardado@example.com',
    }), { params: { id: 'wf-1' } } as any);

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('No pudimos registrar tus datos');
    expect(mocks.emitEvent).not.toHaveBeenCalled();
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
