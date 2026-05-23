import { describe, it, expect } from 'vitest';
import {
  transformAnytimebotLead,
  transformAnytimebotConversation,
  transformAnytimebotBooking,
} from '@/lib/anytimebot';

const makeLeadCapture = (overrides: Record<string, any> = {}) => ({
  conversationId: 'conv-abc-123',
  timestamp: '2024-03-15T10:30:00Z',
  contactInfo: {
    nombre: 'María García',
    email: 'maria@empresa.com',
    telefono: '+525599887766',
    empresa: 'Tech Solutions',
  },
  messages: [
    { role: 'user', content: 'Hola, quiero información sobre sus servicios', timestamp: '2024-03-15T10:30:00Z' },
    { role: 'bot' as const, content: '¡Hola! Claro, ¿qué tipo de servicio te interesa?', timestamp: '2024-03-15T10:30:05Z' },
    { role: 'user', content: 'Consultoría en IA y demo por favor', timestamp: '2024-03-15T10:30:20Z' },
    { role: 'bot' as const, content: 'Perfecto, déjame tus datos y te contactamos', timestamp: '2024-03-15T10:30:25Z' },
    { role: 'user', content: 'Es urgente', timestamp: '2024-03-15T10:30:40Z' },
  ],
  intent: 'solicitar_informacion',
  source: 'whatsapp' as const,
  ...overrides,
});

const makeBooking = (overrides: Record<string, any> = {}) => ({
  id: 'book-001',
  userId: 'user-456',
  eventTypeId: 'event-789',
  date: '2024-03-20',
  time: '14:00:00',
  duration: 60,
  clientName: 'María García',
  clientEmail: 'maria@empresa.com',
  clientPhone: '+525599887766',
  status: 'confirmed',
  notes: 'Reunión de seguimiento',
  ...overrides,
});

// ============================================================
// transformAnytimebotLead
// ============================================================
describe('transformAnytimebotLead', () => {
  it('debe transformar un lead capture completo', () => {
    const capture = makeLeadCapture();
    const result = transformAnytimebotLead(capture);

    expect(result.nombre).toBe('María García');
    expect(result.email).toBe('maria@empresa.com');
    expect(result.telefono).toBe('+525599887766');
    expect(result.empresa).toBe('Tech Solutions');
  });

  it('debe generar fuente con canal capitalizado', () => {
    const result = transformAnytimebotLead(makeLeadCapture({ source: 'whatsapp' }));
    expect(result.fuente).toBe('Anytimebot - Whatsapp');

    const result2 = transformAnytimebotLead(makeLeadCapture({ source: 'webchat' }));
    expect(result2.fuente).toBe('Anytimebot - Webchat');

    const result3 = transformAnytimebotLead(makeLeadCapture({ source: 'facebook' }));
    expect(result3.fuente).toBe('Anytimebot - Facebook');

    const result4 = transformAnytimebotLead(makeLeadCapture({ source: 'instagram' }));
    expect(result4.fuente).toBe('Anytimebot - Instagram');
  });

  it('debe asignar estado nuevo', () => {
    const result = transformAnytimebotLead(makeLeadCapture());
    expect(result.estado).toBe('nuevo');
  });

  it('debe incluir conversationId en notas', () => {
    const result = transformAnytimebotLead(makeLeadCapture());
    expect(result.notas).toContain('conv-abc-123');
    expect(result.notas).toContain('CONVERSACIÓN DESDE ANYTIMEBOT');
    expect(result.notas).toContain('Intención: solicitar_informacion');
  });

  it('debe incluir resumen de conversación en notas', () => {
    const result = transformAnytimebotLead(makeLeadCapture());
    expect(result.notas).toContain('[USER]: Hola, quiero información sobre sus servicios');
    expect(result.notas).toContain('[BOT]: ¡Hola! Claro');
    expect(result.notas).toContain('[USER]: Consultoría en IA y demo');
  });

  it('debe generar email temporal si no hay email', () => {
    const capture = makeLeadCapture({ contactInfo: { nombre: 'Sin Email' } });
    const result = transformAnytimebotLead(capture);
    expect(result.email).toContain('anytimebot-conv-abc-123@leads.volkern.com');
  });

  it('debe calcular score >= 30 (base)', () => {
    const result = transformAnytimebotLead(makeLeadCapture());
    expect(result.scoreValue).toBeGreaterThanOrEqual(30);
    expect(result.scoreValue).toBeLessThanOrEqual(100);
  });

  it('debe dar score más alto con email+teléfono+empresa', () => {
    const captureFull = makeLeadCapture();
    const resultFull = transformAnytimebotLead(captureFull);

    const captureMin = makeLeadCapture({
      contactInfo: { nombre: 'Min' },
      messages: [],
    });
    const resultMin = transformAnytimebotLead(captureMin);

    expect(resultFull.scoreValue).toBeGreaterThan(resultMin.scoreValue);
  });

  it('debe detectar keywords de alta intención y subir score', () => {
    const captureWithIntent = makeLeadCapture({
      messages: [
        { role: 'user', content: 'quiero comprar y contratar servicios', timestamp: '' },
      ],
    });
    const captureNoIntent = makeLeadCapture({
      messages: [
        { role: 'user', content: 'hola buenos días', timestamp: '' },
      ],
    });

    const resultIntent = transformAnytimebotLead(captureWithIntent);
    const resultNoIntent = transformAnytimebotLead(captureNoIntent);

    expect(resultIntent.scoreValue).toBeGreaterThan(resultNoIntent.scoreValue);
  });

  it('debe generar tags con anytimebot y source', () => {
    const result = transformAnytimebotLead(makeLeadCapture());
    expect(result.tags).toContain('anytimebot');
    expect(result.tags).toContain('whatsapp');
    expect(result.tags).toContain('solicitar_informacion');
  });

  it('debe detectar tags de interés por keywords en conversación', () => {
    const capture = makeLeadCapture({
      messages: [
        { role: 'user', content: 'quiero demo urgente de consultoría y capacitación', timestamp: '' },
      ],
    });
    const result = transformAnytimebotLead(capture);
    expect(result.tags).toContain('interesado-cursos');
    expect(result.tags).toContain('interesado-consultoría');
    expect(result.tags).toContain('solicita-demo');
    expect(result.tags).toContain('alta-prioridad');
  });

  it('debe manejar sin intent', () => {
    const capture = makeLeadCapture({ intent: undefined });
    const result = transformAnytimebotLead(capture);
    expect(result.notas).toContain('Intención: No identificada');
  });

  it('debe manejar contactInfo mínimo (solo nombre)', () => {
    const capture = makeLeadCapture({
      contactInfo: { nombre: 'Juan' },
      messages: [],
    });
    const result = transformAnytimebotLead(capture);
    expect(result.nombre).toBe('Juan');
    expect(result.telefono).toBeNull();
    expect(result.empresa).toBeNull();
  });

  it('debe ser determinista', () => {
    const capture = makeLeadCapture();
    const r1 = transformAnytimebotLead(capture);
    const r2 = transformAnytimebotLead(capture);
    expect(r1).toEqual(r2);
  });
});

// ============================================================
// transformAnytimebotConversation
// ============================================================
describe('transformAnytimebotConversation', () => {
  const tenantId = 'tenant-001';

  it('debe transformar a formato de conversación con tenantId', () => {
    const capture = makeLeadCapture();
    const result = transformAnytimebotConversation(capture, tenantId);

    expect(result.conversation.tenantId).toBe(tenantId);
    expect(result.conversation.contactoNombre).toBe('María García');
    expect(result.conversation.contactoEmail).toBe('maria@empresa.com');
    expect(result.conversation.contactoTelefono).toBe('+525599887766');
  });

  it('debe mapear canal correctamente para cada source', () => {
    const sources = ['whatsapp', 'webchat', 'facebook', 'instagram'] as const;
    const expected = ['whatsapp', 'web', 'facebook', 'instagram'];

    sources.forEach((source, i) => {
      const capture = makeLeadCapture({ source });
      const result = transformAnytimebotConversation(capture, tenantId);
      expect(result.conversation.canal).toBe(expected[i]);
    });
  });

  it('debe asignar leadId cuando se proporciona', () => {
    const capture = makeLeadCapture();
    const result = transformAnytimebotConversation(capture, tenantId, 'lead-999');
    expect(result.conversation.leadId).toBe('lead-999');
  });

  it('debe asignar leadId null cuando no se proporciona', () => {
    const result = transformAnytimebotConversation(makeLeadCapture(), tenantId);
    expect(result.conversation.leadId).toBeNull();
  });

  it('debe establecer estado abierta', () => {
    const result = transformAnytimebotConversation(makeLeadCapture(), tenantId);
    expect(result.conversation.estado).toBe('abierta');
  });

  it('debe usar último mensaje como ultimoMensaje', () => {
    const capture = makeLeadCapture();
    const result = transformAnytimebotConversation(capture, tenantId);
    expect(result.conversation.ultimoMensaje).toBe('Es urgente');
  });

  it('debe contar mensajes no leídos (user messages)', () => {
    const result = transformAnytimebotConversation(makeLeadCapture(), tenantId);
    expect(result.conversation.noLeidos).toBe(3);
  });

  it('debe transformar mensajes con direccion entrante/saliente', () => {
    const result = transformAnytimebotConversation(makeLeadCapture(), tenantId);
    expect(result.messages).toHaveLength(5);
    expect(result.messages[0].direccion).toBe('entrante');
    expect(result.messages[1].direccion).toBe('saliente');
  });

  it('debe incluir metadatos en cada mensaje', () => {
    const result = transformAnytimebotConversation(makeLeadCapture(), tenantId);
    expect(result.messages[0].metadatos).toMatchObject({
      anytimebotConversationId: 'conv-abc-123',
      messageIndex: 0,
      intent: 'solicitar_informacion',
    });
  });

  it('debe manejar sin mensajes', () => {
    const capture = makeLeadCapture({ messages: [] });
    const result = transformAnytimebotConversation(capture, tenantId);
    expect(result.messages).toHaveLength(0);
    expect(result.conversation.ultimoMensaje).toBe('Nueva conversación desde Anytimebot');
  });

  it('debe manejar contactInfo sin email ni teléfono', () => {
    const capture = makeLeadCapture({
      contactInfo: { nombre: 'Juan' },
    });
    const result = transformAnytimebotConversation(capture, tenantId);
    expect(result.conversation.contactoEmail).toBeNull();
    expect(result.conversation.contactoTelefono).toBeNull();
  });

  it('debe ser determinista', () => {
    const capture = makeLeadCapture();
    const r1 = transformAnytimebotConversation(capture, tenantId);
    const r2 = transformAnytimebotConversation(capture, tenantId);
    expect(r1).toEqual(r2);
  });
});// ============================================================
// transformAnytimebotBooking
// ============================================================
describe('transformAnytimebotBooking', () => {
  it('debe transformar un booking completo a formato cita', () => {
    const booking = makeBooking();
    const result = transformAnytimebotBooking(booking);

    expect(result.titulo).toBe('Cita desde Anytimebot - María García');
    expect(result.duracion).toBe(60);
    expect(result.estado).toBe('pendiente');
  });

  it('debe crear fechaHora combinando date y time', () => {
    const result = transformAnytimebotBooking(makeBooking());
    expect(result.fechaHora).toBeInstanceOf(Date);
    // new Date(dateTtime) construye en hora local → usamos getters locales
    expect(result.fechaHora.getFullYear()).toBe(2024);
    expect(result.fechaHora.getMonth()).toBe(2); // Marzo = 2
    expect(result.fechaHora.getDate()).toBe(20);
    expect(result.fechaHora.getHours()).toBe(14);
    expect(result.fechaHora.getMinutes()).toBe(0);
    expect(result.fechaHora.getSeconds()).toBe(0);
  });

  it('debe incluir datos del cliente en descripción (sin notas)', () => {
    const result = transformAnytimebotBooking(makeBooking({ notes: undefined }));
    expect(result.descripcion).toContain('María García');
    expect(result.descripcion).toContain('maria@empresa.com');
    expect(result.descripcion).toContain('+525599887766');
  });

  it('debe usar notas como descripción cuando están presentes', () => {
    const result = transformAnytimebotBooking(makeBooking());
    expect(result.descripcion).toBe('Reunión de seguimiento');
  });

  it('debe manejar sin teléfono (sin notas)', () => {
    const booking = makeBooking({ clientPhone: undefined, notes: undefined });
    const result = transformAnytimebotBooking(booking);
    expect(result.descripcion).toContain('No proporcionado');
  });

  it('debe usar duración del booking', () => {
    const result = transformAnytimebotBooking(makeBooking({ duration: 90 }));
    expect(result.duracion).toBe(90);
  });

  it('debe manejar fecha en otro formato', () => {
    const booking = makeBooking({ date: '2024-12-31', time: '23:59:00' });
    const result = transformAnytimebotBooking(booking);
    expect(result.fechaHora.getFullYear()).toBe(2024);
    expect(result.fechaHora.getMonth()).toBe(11); // Diciembre = 11
    expect(result.fechaHora.getDate()).toBe(31);
    expect(result.fechaHora.getHours()).toBe(23);
    expect(result.fechaHora.getMinutes()).toBe(59);
    expect(result.fechaHora.getSeconds()).toBe(0);
  });

  it('debe ser determinista', () => {
    const booking = makeBooking();
    const r1 = transformAnytimebotBooking(booking);
    const r2 = transformAnytimebotBooking(booking);
    expect(r1).toEqual(r2);
  });
});
