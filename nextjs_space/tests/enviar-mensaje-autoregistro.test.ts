// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  leadFindFirst: vi.fn(),
  leadCreate: vi.fn(),
  contactFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  findLeadByEmail: vi.fn(),
  findContactByEmail: vi.fn(),
  getOrCreateConversation: vi.fn(),
  createConversation: vi.fn(),
  sendMessage: vi.fn(),
  sendEmail: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    lead: { findFirst: mocks.leadFindFirst, create: mocks.leadCreate },
    contact: { findFirst: mocks.contactFindFirst },
    tenant: { findUnique: mocks.tenantFindUnique },
    user: { findUnique: mocks.userFindUnique, findFirst: mocks.userFindFirst },
    conversation: { findFirst: mocks.conversationFindFirst },
  },
}));

vi.mock('@/lib/skills/contact-skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/skills/contact-skills')>();
  return {
    ...actual,
    findLeadByEmail: (...args: any[]) => mocks.findLeadByEmail(...args),
    findContactByEmail: (...args: any[]) => mocks.findContactByEmail(...args),
  };
});

vi.mock('@/lib/skills/conversation-skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/skills/conversation-skills')>();
  return {
    ...actual,
    getOrCreateConversation: (...args: any[]) => mocks.getOrCreateConversation(...args),
    createConversation: (...args: any[]) => mocks.createConversation(...args),
    sendMessage: (...args: any[]) => mocks.sendMessage(...args),
  };
});

vi.mock('@/lib/ses-email', () => ({
  sendEmail: (...args: any[]) => mocks.sendEmail(...args),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: (...args: any[]) => mocks.sendWhatsAppMessage(...args),
}));

const { crmIntents } = await import('@/lib/agents/intents/crm-intents');
const { skills } = await import('@/lib/skills');

const TENANT = 'tenant-1';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue({ nombre: 'Dimension Expert' });
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.userFindFirst.mockResolvedValue({
    name: 'Bruno Hess',
    bookingEnabled: true,
    bookingSlug: 'bruno-hess',
    bookingTitle: 'Asesoría contable',
  });
  mocks.getOrCreateConversation.mockResolvedValue({ id: 'conv-1' });
  mocks.sendMessage.mockResolvedValue({ ok: true });
  mocks.sendEmail.mockResolvedValue({ success: true });
});

// ─── 1. Schema: mensaje requerido, destinatario opcional (se resuelve) ─────

describe('enviar_mensaje — schema', () => {
  it('exige solo el contenido; email/nombre/canal son opcionales', () => {
    const intent = crmIntents.find((i) => i.name === 'enviar_mensaje')!;
    expect(intent.requiredParams).toEqual(['mensaje']);
    expect(intent.optionalParams).toEqual(expect.arrayContaining(['email', 'nombre', 'canal']));
  });
});

// ─── 2. Wrapper: auto-registro del lead si no está en el CRM ───────────────

describe('send_message — auto-registro del lead', () => {
  it('destinatario NO existe, SIN confirmación → NO crea lead y pide registrar', async () => {
    mocks.findLeadByEmail.mockResolvedValue(null);
    mocks.findContactByEmail.mockResolvedValue(null);
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);

    await expect(
      (skills as any).send_message({
        tenantId: TENANT,
        nombre: 'Alejandra Velázquez',
        mensaje: 'Gracias por la reunión',
      }),
    ).rejects.toThrow(/No encontré|regístralo/i);

    expect(mocks.leadCreate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('destinatario NO existe + confirmación pero SIN email real → no inventa nada', async () => {
    mocks.findLeadByEmail.mockResolvedValue(null);
    mocks.findContactByEmail.mockResolvedValue(null);
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);

    await expect(
      (skills as any).send_message({
        tenantId: TENANT,
        nombre: 'Alejandra Velázquez',
        mensaje: 'Gracias por la reunión',
        registrarContacto: 'true',
      }),
    ).rejects.toThrow(/email real|No voy a inventar/i);

    expect(mocks.leadCreate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('destinatario NO existe + confirmación + email real → crea el lead y envía el email', async () => {
    mocks.findLeadByEmail.mockResolvedValue(null);
    mocks.findContactByEmail.mockResolvedValue(null);
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);
    mocks.leadCreate.mockResolvedValue({
      id: 'lead-nuevo',
      nombre: 'Alejandra Velázquez',
      email: 'alevvalverde@gmail.com',
      telefono: '+34664702631',
    });

    const result = await (skills as any).send_message({
      tenantId: TENANT,
      nombre: 'Alejandra Velázquez',
      email: 'alevvalverde@gmail.com',
      telefono: '+34664702631',
      empresa: 'ARA Works',
      mensaje: 'Gracias por la reunión',
      registrarContacto: 'true',
    });

    expect(mocks.leadCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: 'Alejandra Velázquez',
          email: 'alevvalverde@gmail.com',
          telefono: '+34664702631',
          empresa: 'ARA Works',
        }),
      }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alevvalverde@gmail.com' }),
    );
    expect(result.ok).toBe(true);
    expect(result.destinatario).toBe('Alejandra Velázquez');
  });

  it('destinatario YA existe por email → no crea duplicado y envía', async () => {
    mocks.findLeadByEmail.mockResolvedValue({
      id: 'lead-existente',
      nombre: 'Alejandra Velázquez',
      email: 'alevvalverde@gmail.com',
    });

    const result = await (skills as any).send_message({
      tenantId: TENANT,
      email: 'alevvalverde@gmail.com',
      mensaje: 'Gracias por la reunión',
    });

    expect(mocks.leadCreate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alevvalverde@gmail.com' }),
    );
    expect(result.ok).toBe(true);
  });
});

// ─── 3. Remitente: firma del usuario con booking activo ────────────────────

describe('send_message — firma y link de calendario del remitente', () => {
  it('firma con el usuario de booking activo (nombre + link real), no con el tenant', async () => {
    mocks.findLeadByEmail.mockResolvedValue({
      id: 'lead-existente',
      nombre: 'Alejandra Velázquez',
      email: 'alevvalverde@gmail.com',
    });
    // userId de Telegram es el id de la conversación, no un User real
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userFindFirst.mockResolvedValue({
      name: 'Bruno Hess',
      bookingEnabled: true,
      bookingSlug: 'bruno-hess',
      bookingTitle: 'Asesoría contable',
    });

    await (skills as any).send_message({
      tenantId: TENANT,
      email: 'alevvalverde@gmail.com',
      mensaje: 'Gracias por la reunión',
      userId: 'conv-id-no-real',
    });

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Mensaje de Bruno Hess',
        text: expect.stringContaining('Bruno Hess'),
      }),
    );
    const text = mocks.sendEmail.mock.calls[0][0].text as string;
    expect(text).toContain('/booking/bruno-hess');
    expect(text).toContain('Asesoría contable');
    // El nombre del tenant se añade debajo de la persona (comportamiento correcto)
    expect(text).toContain('Dimension Expert');
  });

  it('sin usuario con booking → cae a un admin del tenant (case-insensitive)', async () => {
    mocks.findLeadByEmail.mockResolvedValue({
      id: 'lead-existente',
      nombre: 'Alejandra Velázquez',
      email: 'alevvalverde@gmail.com',
    });
    mocks.userFindUnique.mockResolvedValue(null);
    // Primer findFirst (booking activo) no encuentra nada; el segundo (admin) sí
    mocks.userFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: 'DeXpert Admin', bookingEnabled: false, bookingSlug: null, bookingTitle: null });

    await (skills as any).send_message({
      tenantId: TENANT,
      email: 'alevvalverde@gmail.com',
      mensaje: 'Gracias por la reunión',
    });

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Mensaje de DeXpert Admin',
        text: expect.stringContaining('DeXpert Admin'),
      }),
    );
    // Sin booking activo, no debe añadir link de calendario
    const text = mocks.sendEmail.mock.calls[0][0].text as string;
    expect(text).not.toContain('/booking/');
  });
});
