import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { runHospitalityBriefingScan, contextoBriefing, ACCION_BRIEFING } from '@/lib/cron/hospitality-briefing';
import { prisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { sendEmail } from '@/lib/ses-email';
import { resumen_diario } from '@/lib/skills/hospitality-skills';

/**
 * Cron del briefing matutino: el destinatario NO es el huésped — es el equipo
 * del tenant con permiso de operar el PMS. Aquí se prueba el pegamento:
 * contexto de plantilla, selección de destinatarios, idempotencia por día y
 * reintento cuando todo falla. La foto del día ya la cubre la suite de
 * hospitality-skills (resumen_diario); aquí se mockea como dependencia.
 */

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityCommunicationTemplate: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    auditLog: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('@/lib/ses-email', () => ({ sendEmail: vi.fn() }));

// resumen_diario toca prisma con modelos que este mock no tiene: se finge el
// skill completo (su contrato ya está verificado en hospitality-skills.test).
// OJO: la implementación se (re)aplica en beforeEach porque resetAllMocks la
// borra — es el mismo vi.fn() que consume el cron.
const RESUMEN = {
  fecha: '2026-09-27',
  ocupacionHoyPct: 50,
  totalUnidades: 2,
  unidadesOcupadas: 1,
  llegadasHoy: 1,
  detalleLlegadas: [{ huesped: 'Ana García', unidad: 'Loft Marina' }],
  salidasHoy: 1,
  detalleSalidas: [{ huesped: 'Luis Pérez', unidad: 'Suite Oceano' }],
  llegadasManana: 1,
  salidasManana: 0,
  incidenciasAbiertas: 1,
  incidencias: [{ unidad: 'Loft Marina', tipo: 'mantenimiento', motivo: 'Bañera rota' }],
  cobrosPendientes: 1,
  mayoresPendientes: [{ referencia: 'OTA-9', moneda: 'EUR', pendiente: 300 }],
  totalPendientePorMoneda: { EUR: 300 },
};

vi.mock('@/lib/skills/hospitality-skills', () => ({
  resumen_diario: vi.fn(),
}));

const PLANTILLA_WA = {
  id: 't1',
  evento: 'briefing_diario',
  canal: 'whatsapp',
  asunto: null,
  contenido:
    '🌅 {{fecha}} — Ocupación {{ocupacion}} ({{unidades_ocupadas}}/{{total_unidades}}). Llegan {{llegadas_hoy}}, salen {{salidas_hoy}}. Incidencias: {{incidencias}}. Pendiente de cobro: {{total_pendiente}}.',
  activo: true,
};

const USUARIOS = [
  { id: 'u1', email: 'propietario@villa.es', name: 'Propietario', telefono: '+34600000001', role: { nombre: 'Owner', permisos: { all: true } } },
  { id: 'u2', email: 'limpieza@villa.es', name: 'Limpieza', telefono: null, role: { nombre: 'Limpieza', permisos: { leads: { ver: true } } } },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resumen_diario).mockResolvedValue(RESUMEN as any);
});

describe('contextoBriefing', () => {
  it('mapea el resumen a variables de plantilla legibles', () => {
    const contexto = contextoBriefing({
      fecha: '2026-09-27',
      ocupacionHoyPct: 50,
      totalUnidades: 2,
      unidadesOcupadas: 1,
      llegadasHoy: 1,
      detalleLlegadas: [{ huesped: 'Ana García', unidad: 'Loft Marina' }],
      salidasHoy: 1,
      detalleSalidas: [{ huesped: 'Luis Pérez', unidad: 'Suite Oceano' }],
      llegadasManana: 1,
      salidasManana: 0,
      incidenciasAbiertas: 1,
      incidencias: [{ unidad: 'Loft Marina', tipo: 'mantenimiento', motivo: 'Bañera rota' }],
      cobrosPendientes: 1,
      mayoresPendientes: [{ referencia: 'OTA-9', moneda: 'EUR', pendiente: 300 }],
      totalPendientePorMoneda: { EUR: 300 },
    });

    expect(contexto.ocupacion).toBe('50%');
    expect(contexto.detalle_llegadas).toContain('Ana García · Loft Marina');
    expect(contexto.incidencias).toContain('Bañera rota');
    expect(contexto.total_pendiente).toContain('300');
    expect(contexto.llegadas_manana).toBe('1');
  });

  it('sin pendientes: total_pendiente formatea a cero, sin NaN ni undefined', () => {
    const contexto = contextoBriefing({
      fecha: '2026-09-27',
      ocupacionHoyPct: 0,
      totalUnidades: 0,
      unidadesOcupadas: 0,
      llegadasHoy: 0,
      detalleLlegadas: [],
      salidasHoy: 0,
      detalleSalidas: [],
      llegadasManana: 0,
      salidasManana: 0,
      incidenciasAbiertas: 0,
      incidencias: [],
      cobrosPendientes: 0,
      mayoresPendientes: [],
      totalPendientePorMoneda: {},
    });
    expect(contexto.total_pendiente).not.toMatch(/NaN|undefined/);
    expect(contexto.detalle_pendientes).toBe('');
  });
});

describe('destinatariosBriefing', () => {
  it('solo usuarios con la capacidad de operar el PMS (no cualquier usuario del tenant)', async () => {
    const { destinatariosBriefing } = await import('@/lib/cron/hospitality-briefing');
    vi.mocked(prisma.user.findMany).mockResolvedValue(USUARIOS as any);

    const destinatarios = await destinatariosBriefing('tenant-1');

    expect(destinatarios).toHaveLength(1);
    expect(destinatarios[0]).toMatchObject({ email: 'propietario@villa.es', telefono: '+34600000001' });
  });
});

describe('runHospitalityBriefingScan', () => {
  // El cron sella cada mensaje y el guard diario con la fecha REAL del día
  // (hoy = new Date()). Sin reloj congelado, la aserción del asunto se rompía
  // al cruzar la medianoche UTC entre corridas (falló en CI el 2026-09-28
  // esperando el asunto de '2026-09-27'). Congelado, todo el describe es
  // determinista y coincide con la fecha fija de RESUMEN.
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-09-27T12:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('envía el briefing a los operadores por la plantilla activa y audita el día', async () => {
    vi.mocked(prisma.hospitalityCommunicationTemplate.findMany).mockImplementation(async (args: any) => {
      if (args?.distinct) return [{ tenantId: 'tenant-1' }];
      return [PLANTILLA_WA];
    });
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'a1' } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue(USUARIOS as any);
    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ success: true } as any);

    const resultado = await runHospitalityBriefingScan();

    expect(resultado).toMatchObject({ tenants: 1, enviados: 1, fallidos: 0 });
    // El destinatario es el teléfono del USUARIO, no de guestData.
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      '+34600000001',
      expect.stringContaining('50%'),
      'tenant-1',
      true,
    );
    // Idempotencia: el guard se buscó antes de enviar y se registró después.
    expect(prisma.auditLog.findFirst).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: ACCION_BRIEFING, entidad: 'tenant' }),
      }),
    );
  });

  it('idempotente por día: si ya salió hoy, omite sin enviar', async () => {
    vi.mocked(prisma.hospitalityCommunicationTemplate.findMany).mockImplementation(async (args: any) => {
      if (args?.distinct) return [{ tenantId: 'tenant-1' }];
      return [PLANTILLA_WA];
    });
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue({ id: 'ya-hoy' } as any);

    const resultado = await runHospitalityBriefingScan();

    expect(resultado).toMatchObject({ omitidos: 1, enviados: 0 });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('plantilla de email: envía al correo del usuario con asunto de la plantilla', async () => {
    vi.mocked(prisma.hospitalityCommunicationTemplate.findMany).mockImplementation(async ({ where }: any) => {
      if (where?.distinct) return [{ tenantId: 'tenant-1' }];
      return [{ ...PLANTILLA_WA, canal: 'email', asunto: 'Briefing {{fecha}}' }];
    });
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'a2' } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue(USUARIOS as any);
    vi.mocked(sendEmail).mockResolvedValue({ success: true } as any);

    const resultado = await runHospitalityBriefingScan();

    expect(resultado.enviados).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'propietario@villa.es', subject: 'Briefing 2026-09-27' }),
    );
  });

  it('si todos los envíos fallan, no marca el día: el siguiente disparo reintenta', async () => {
    vi.mocked(prisma.hospitalityCommunicationTemplate.findMany).mockImplementation(async (args: any) => {
      if (args?.distinct) return [{ tenantId: 'tenant-1' }];
      return [PLANTILLA_WA];
    });
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findMany).mockResolvedValue(USUARIOS as any);
    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ success: false, error: 'numero no valido' } as any);

    const resultado = await runHospitalityBriefingScan();

    expect(resultado.enviados).toBe(0);
    expect(resultado.fallidos).toBeGreaterThan(0);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('sin plantilla activa en ningún tenant: no hace nada', async () => {
    vi.mocked(prisma.hospitalityCommunicationTemplate.findMany).mockResolvedValue([]);

    const resultado = await runHospitalityBriefingScan();

    expect(resultado).toMatchObject({ tenants: 0, enviados: 0 });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
