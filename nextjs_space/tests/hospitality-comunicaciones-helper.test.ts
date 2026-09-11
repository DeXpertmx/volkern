import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests del helper de comunicaciones (plan maestro §21):
 *   - guestNombre/guestEmail/guestTelefono (formatos del seed y del webhook)
 *   - renderPlantilla con variables
 *   - buildContextoPlantilla (noches, importe, fechas)
 *   - dispararComunicacionPorEvento (plantillas activas, sin destinatario)
 */

const mockSendWhatsApp = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  hospitalityCommunicationTemplate: { findMany: vi.fn() },
  hospitalityReservation: { findFirst: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: (...a: any[]) => mockSendWhatsApp(...a) }));
vi.mock('@/lib/ses-email', () => ({ sendEmail: (...a: any[]) => mockSendEmail(...a) }));

import {
  guestNombre,
  guestEmail,
  guestTelefono,
  renderPlantilla,
  buildContextoPlantilla,
  dispararComunicacionPorEvento,
} from '../lib/hospitality/comunicaciones';

describe('guestNombre / guestEmail / guestTelefono', () => {
  it('soporta el formato del seed ({ nombre, email, telefono })', () => {
    const gd = { nombre: 'María García', email: 'maria@x.com', telefono: '+52 984 123 4567' };
    expect(guestNombre(gd)).toBe('María García');
    expect(guestEmail(gd)).toBe('maria@x.com');
    expect(guestTelefono(gd)).toBe('+52 984 123 4567');
  });

  it('soporta el formato del webhook ({ firstName, lastName, phone })', () => {
    const gd = { firstName: 'John', lastName: 'Smith', email: 'john@x.com', phone: '+52 1' };
    expect(guestNombre(gd)).toBe('John Smith');
    expect(guestEmail(gd)).toBe('john@x.com');
    expect(guestTelefono(gd)).toBe('+52 1');
  });

  it('tolera datos vacíos (OTAs anonimizadas)', () => {
    expect(guestNombre(null)).toBe('');
    expect(guestEmail({})).toBe('');
    expect(guestTelefono({ email: 'x@y.com' })).toBe('');
  });
});

describe('renderPlantilla', () => {
  it('reemplaza variables y deja intactas las desconocidas', () => {
    const out = renderPlantilla('Hola {{nombre}}, llega el {{checkIn}}', { nombre: 'Ana', checkIn: 'viernes' });
    expect(out).toBe('Hola Ana, llega el viernes');
    const out2 = renderPlantilla('Hola {{nombre}} {{desconocida}}', { nombre: 'Ana' });
    expect(out2).toBe('Hola Ana {{desconocida}}');
  });

  it('tolera espacios dentro de las llaves', () => {
    expect(renderPlantilla('{{ nombre }}', { nombre: 'X' })).toBe('X');
  });
});

describe('buildContextoPlantilla', () => {
  it('calcula noches, importe formateado y fechas', () => {
    const ctx = buildContextoPlantilla({
      reserva: {
        checkIn: new Date('2026-10-15T00:00:00Z'),
        checkOut: new Date('2026-10-18T00:00:00Z'),
        amountAfterTax: 6900,
        currency: 'MXN',
        channel: 'Airbnb',
        externalBookingId: 'BK-1',
        estado: 'confirmed',
        guestData: { nombre: 'Pedro Ruiz' },
      },
      unidad: { nombre: 'Suite Océano' },
      propiedad: { nombre: 'Villa Mar' },
    });
    expect(ctx.noches).toBe('3');
    expect(ctx.nombre).toBe('Pedro Ruiz');
    expect(ctx.unidad).toBe('Suite Océano');
    expect(ctx.propiedad).toBe('Villa Mar');
    expect(ctx.canal).toBe('Airbnb');
    expect(ctx.referencia).toBe('BK-1');
    expect(ctx.importe).toContain('6,900');
  });

  it('sin importe no inventa precio', () => {
    const ctx = buildContextoPlantilla({
      reserva: {
        checkIn: new Date('2026-10-15T00:00:00Z'),
        checkOut: new Date('2026-10-16T00:00:00Z'),
        guestData: {},
      },
    });
    expect(ctx.importe).toBe('');
    expect(ctx.noches).toBe('1');
  });
});

describe('dispararComunicacionPorEvento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // sendWhatsAppMessage devuelve { success, messageId } (no lanza).
    mockSendWhatsApp.mockResolvedValue({ success: true, messageId: 'mid-1' });
  });

  it('no envía si no hay plantillas activas para el evento', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([]);
    const res = await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'confirmacion',
      reserva: { id: 'r1', guestData: { nombre: 'Ana' } },
    });
    expect(res).toEqual([]);
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });

  it('envía por whatsapp con el teléfono del huésped y las variables renderizadas', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { id: 'ct1', tenantId: 't1', evento: 'confirmacion', canal: 'whatsapp', asunto: null, contenido: 'Hola {{nombre}}', activo: true },
    ]);
    const res = await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'confirmacion',
      reserva: {
        id: 'r1',
        channel: 'Booking',
        externalBookingId: 'B-9',
        guestData: { nombre: 'Ana Torres', telefono: '+52 998 555 0102' },
      },
    });
    expect(res).toHaveLength(1);
    expect(res[0].ok).toBe(true);
    // El cuarto argumento habilita el respaldo con el número oficial de la
    // plataforma cuando el tenant no tiene WhatsApp propio conectado.
    expect(mockSendWhatsApp).toHaveBeenCalledWith('+52 998 555 0102', 'Hola Ana Torres', 't1', true);
  });

  it('reporta fallo real cuando WhatsApp no acepta el envío (no miente con éxito)', async () => {
    // sendWhatsAppMessage no lanza: devuelve { success: false, error }.
    mockSendWhatsApp.mockResolvedValue({ success: false, error: 'Error 403: instancia no conectada' });
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { id: 'ct9', tenantId: 't1', evento: 'confirmacion', canal: 'whatsapp', asunto: null, contenido: 'Hola {{nombre}}', activo: true },
    ]);

    const res = await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'confirmacion',
      reserva: { id: 'r9', guestData: { nombre: 'Ana', telefono: '+52 1' } },
    });

    expect(res[0].ok).toBe(false);
    expect(res[0].error).toContain('instancia no conectada');
  });

  it('no intenta enviar si el huésped no tiene destinatario para el canal', async () => {
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { id: 'ct1', tenantId: 't1', evento: 'check_in', canal: 'whatsapp', asunto: null, contenido: 'Hola', activo: true },
    ]);
    const res = await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'check_in',
      reserva: { id: 'r1', guestData: { nombre: 'Huésped sin teléfono' } },
    });
    expect(res[0].ok).toBe(false);
    expect(res[0].error).toContain('no tiene destinatario');
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });

  it('envía por email usando el asunto y el email del huésped', async () => {
    mockSendEmail.mockResolvedValue({ success: true });
    prisma.hospitalityCommunicationTemplate.findMany.mockResolvedValue([
      { id: 'ct2', tenantId: 't1', evento: 'resena', canal: 'email', asunto: 'Reseña {{propiedad}}', contenido: 'Hola {{nombre}}', activo: true },
    ]);
    const res = await dispararComunicacionPorEvento({
      tenantId: 't1',
      evento: 'resena',
      reserva: {
        id: 'r1',
        guestData: { nombre: 'María García', email: 'maria@x.com' },
      },
      propiedad: { nombre: 'Villa Mar' },
    });
    expect(res[0].ok).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'maria@x.com',
        subject: 'Reseña Villa Mar',
        text: 'Hola María García',
      })
    );
  });
});