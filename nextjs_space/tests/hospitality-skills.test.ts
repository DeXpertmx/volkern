import { describe, expect, it, beforeEach } from 'vitest';
import {
  estado_del_dia,
  buscar_reservas,
  rentabilidad_reserva,
  estado_booking_engine,
  soloProducen,
} from '@/lib/skills/hospitality-skills';
import { skills, listSkills, type SkillName } from '@/lib/skills';
import { MCP_TOOLS, handleListTools } from '@/lib/mcp/mcp-handler';
import { INTENT_TO_SKILL } from '@/lib/agents/skill-orchestrator';
import { prisma } from '@/lib/db';

const TENANT = 'tenant-hosp-test';

// Los vi.fn() del mock de prisma son singletons del archivo: sin reset, la
// mockImplementation de un test intercepta las llamadas del siguiente y
// mock.calls[0] queda stale. Cada test monta sus propios dobles.
beforeEach(() => {
  vi.resetAllMocks();
});

// ─── Mock de prisma: solo lo que usan los skills ────────────────────────────
//
// Los skills son finos a propósito: la lógica vive en los módulos puros
// (estados, analytics, finance, calendar), que ya tienen su propia suite.
// Aquí se prueba el pegamento — mapeo de filtros, formas de respuesta y que
// la regla de producción se respeta en los agregados.

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityUnit: { count: vi.fn() },
    hospitalityReservation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    hospitalityBookingConfig: { findUnique: vi.fn() },
    hospitalityProperty: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/agents/skill-orchestrator', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/agents/skill-orchestrator')>();
  // El orquestador arrastra la configuración de NextAuth: para probar solo el
  // mapa INTENT_TO_SKILL se reexporta tal cual sin inicializar el resto.
  return { ...real, SkillOrchestratorAgent: class {} };
});

const fecha = (diasDesdeHoy: number) => {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  return d;
};

describe('hospitality-skills · estado_del_dia', () => {
  it('cuenta ocupación sobre las unidades y respeta la regla de producción en la ventana', async () => {
    vi.mocked(prisma.hospitalityUnit.count).mockResolvedValue(4);
    vi.mocked(prisma.hospitalityReservation.findMany).mockImplementation(async ({ where }: any) => {
      const checkIn = where?.checkIn as { gte?: Date; lt?: Date } | undefined;
      const checkOut = where?.checkOut as { gte?: Date; lt?: Date } | undefined;
      const estados = where?.estado as { in?: string[]; notIn?: string[] } | undefined;

      // Cruce del día (reservas en casa): hoy es una reserva confirmed.
      if (checkIn?.lt && checkOut?.gt && estados?.in) {
        return [{ id: 'r1', unitId: 'u1' }];
      }
      // Llegadas/salidas del día o de mañana (con unidad/propiedad): excluyen
      // solo 'cancelled'. La ventana de próximos días excluye también
      // 'no_show' — esa llamada debe caer al caso de abajo.
      if (estados?.notIn?.length === 1) {
        return [
          { id: 'r2', estado: 'confirmed', checkIn: fecha(0), checkOut: fecha(2), guestData: { guestName: 'Ana García' }, unit: { nombre: 'Loft Marina' }, property: { nombre: 'Villa Mar Azul' } },
        ];
      }
      // Ventana de próximos días: incluye una cancelada que NO debe sumar.
      return [
        { estado: 'confirmed', checkIn: fecha(1), checkOut: fecha(3), amountAfterTax: 200 },
        { estado: 'cancelled', checkIn: fecha(1), checkOut: fecha(3), amountAfterTax: 500 },
        { estado: 'no_show', checkIn: fecha(1), checkOut: fecha(2), amountAfterTax: 100 },
      ];
    });

    const estado = await estado_del_dia({ tenantId: TENANT });

    expect(estado.totalUnidades).toBe(4);
    expect(estado.unidadesOcupadas).toBe(1);
    expect(estado.ocupacionHoyPct).toBe(25);
    expect(estado.hoy.llegadas).toBe(1);
    expect(estado.hoy.detalleLlegadas[0]).toMatchObject({ huesped: 'Ana García', unidad: 'Loft Marina' });
    // La ventana descarta canceladas y no-show: solo la confirmed produce.
    expect(estado.proximosDias.reservas).toBe(1);
    expect(estado.proximosDias.noches).toBe(2);
    expect(estado.proximosDias.ingresos).toBe(200);
  });
});

describe('hospitality-skills · buscar_reservas', () => {
  it('mapea filtros (estado, canal, huésped) y devuelve la forma plana', async () => {
    vi.mocked(prisma.hospitalityReservation.findMany).mockResolvedValue([
      {
        id: 'r1',
        externalBookingId: 'WEB-123',
        channel: 'Directa',
        estado: 'confirmed',
        checkIn: fecha(1),
        checkOut: fecha(3),
        amountAfterTax: 5840,
        currency: 'EUR',
        guestData: { guestName: 'Ana García' },
        unit: { nombre: 'Loft Marina' },
        property: { nombre: 'Villa Mar Azul' },
      },
    ] as any);

    const resultado = await buscar_reservas({ tenantId: TENANT, estado: 'confirmed', canal: 'directa', huesped: 'Ana', limit: 5 });

    const where = vi.mocked(prisma.hospitalityReservation.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.estado).toBe('confirmed');
    expect((where.channel as any).contains).toBe('directa');
    // El filtro por huésped va como texto crudo del Json (variantes del campo).
    expect(where.guestData).toEqual({ string_contains: 'Ana' });
    expect(resultado.total).toBe(1);
    expect(resultado.reservas[0]).toMatchObject({
      referencia: 'WEB-123',
      canal: 'Directa',
      huesped: 'Ana García',
      unidad: 'Loft Marina',
      noches: 2,
      importe: 5840,
    });
  });
});

describe('hospitality-skills · rentabilidad_reserva', () => {
  it('calcula con el módulo de finanzas: líneas + pagos + comisión OTA', async () => {
    vi.mocked(prisma.hospitalityReservation.findFirst).mockResolvedValue({
      id: 'r1',
      externalBookingId: 'WEB-123',
      channel: 'Directa',
      estado: 'confirmed',
      checkIn: fecha(1),
      checkOut: fecha(3),
      amountAfterTax: 5840,
      currency: 'EUR',
      commission: 0,
      guestData: { guestName: 'Ana García' },
      unit: { nombre: 'Loft Marina' },
      property: { nombre: 'Villa Mar Azul' },
      items: [
        { tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 2, importeUnitario: 2890, importeTotal: 5780 },
        { tipo: 'limpieza', concepto: 'Limpieza', cantidad: 1, importeUnitario: 60, importeTotal: 60 },
      ],
      payments: [{ importe: 5840, estado: 'pagado', metodo: 'stripe' }],
    } as any);

    const resultado = await rentabilidad_reserva({ tenantId: TENANT, referencia: 'WEB-123' });

    expect(resultado.encontrado).toBe(true);
    expect(resultado.rentabilidad).toMatchObject({
      bruto: 5840,
      cobrado: 5840,
      pendiente: 0,
      estadoCobro: 'pagado',
    });
  });

  it('sin desglose de la OTA, construye la línea desde el importe (no inventa conceptos)', async () => {
    vi.mocked(prisma.hospitalityReservation.findFirst).mockResolvedValue({
      id: 'r2',
      externalBookingId: 'OTA-9',
      channel: 'Airbnb',
      estado: 'confirmed',
      checkIn: fecha(2),
      checkOut: fecha(4),
      amountAfterTax: 300,
      currency: 'EUR',
      commission: 45,
      guestData: null,
      unit: { nombre: 'Suite Oceano' },
      property: { nombre: 'Villa Mar Azul' },
      items: [],
      payments: [],
    } as any);

    const resultado = await rentabilidad_reserva({ tenantId: TENANT, referencia: 'OTA-9' });

    expect(resultado.encontrado).toBe(true);
    expect(resultado.rentabilidad.bruto).toBe(300);
    expect(resultado.rentabilidad.comisionOta).toBe(45);
    expect(resultado.rentabilidad.neto).toBe(255);
  });

  it('referencia desconocida: respuesta encontrada:false, sin excepción', async () => {
    vi.mocked(prisma.hospitalityReservation.findFirst).mockResolvedValue(null);
    const resultado = await rentabilidad_reserva({ tenantId: TENANT, referencia: 'NO-EXISTE' });
    expect(resultado).toEqual({ encontrado: false, mensaje: expect.stringContaining('NO-EXISTE') });
  });
});

describe('hospitality-skills · estado_booking_engine', () => {
  it('publica la URL del slug y marca qué propiedades están publicadas', async () => {
    process.env.NEXTAUTH_URL = 'https://volkern.app';
    vi.mocked(prisma.hospitalityBookingConfig.findUnique).mockResolvedValue({
      slug: 'volkern-demo',
      activo: true,
      moneda: 'EUR',
      propiedadesPublicadas: ['hprop_1'],
      requierePagoOnline: false,
    } as any);
    vi.mocked(prisma.hospitalityProperty.findMany).mockResolvedValue([
      { id: 'hprop_1', nombre: 'Villa Mar Azul', estado: 'conectada' },
      { id: 'hprop_2', nombre: 'Casa Palmeras', estado: 'activa' },
    ] as any);
    vi.mocked(prisma.hospitalityUnit.count).mockResolvedValue(2);
    vi.mocked(prisma.hospitalityReservation.findMany).mockResolvedValue([
      { estado: 'confirmed', amountAfterTax: 5840 },
      { estado: 'cancelled', amountAfterTax: 100 },
    ] as any);

    const estado = await estado_booking_engine({ tenantId: TENANT });

    expect(estado.webPublica).toBe('https://volkern.app/reservar/volkern-demo');
    expect(estado.propiedades).toEqual([
      { nombre: 'Villa Mar Azul', estado: 'conectada', publicada: true },
      { nombre: 'Casa Palmeras', estado: 'activa', publicada: false },
    ]);
    // Las ventas directas de la ventana respetan la regla de producción.
    expect(estado.ultimos30Dias).toMatchObject({ reservas: 1, ingresos: 5840 });
  });
});

// ─── Registro: skills y MCP expuestos ───────────────────────────────────────

const HOSPITALITY_SKILLS = ['estado_del_dia', 'llegadas_salidas_hoy', 'buscar_reservas', 'rentabilidad_reserva', 'estado_booking_engine'] as const;

describe('hospitality-skills · registro en el motor y en MCP', () => {
  it('los 5 skills existen en el registro y en listSkills con categoría hospitality', () => {
    for (const nombre of HOSPITALITY_SKILLS) {
      expect(typeof skills[nombre as SkillName]).toBe('function');
    }
    const catalogo = listSkills();
    for (const nombre of HOSPITALITY_SKILLS) {
      const entrada = catalogo.find((s) => s.name === nombre);
      expect(entrada?.category).toBe('hospitality');
      expect(entrada?.description.length).toBeGreaterThan(0);
    }
  });

  it('los 5 skills están expuestos como tools MCP con schema válido', () => {
    for (const nombre of HOSPITALITY_SKILLS) {
      const tool = MCP_TOOLS.find((t) => t.name === nombre);
      expect(tool, `Falta el tool MCP ${nombre}`).toBeTruthy();
      expect(tool!.inputSchema.required).toContain('tenantId');
    }
    const nombres = handleListTools().tools.map((t) => t.name);
    expect(nombres).toEqual(expect.arrayContaining([...HOSPITALITY_SKILLS]));
  });

  it('los intents en español del orquestador apuntan a los skills reales', () => {
    expect(INTENT_TO_SKILL['estado_del_hotel']).toBe('estado_del_dia');
    expect(INTENT_TO_SKILL['llegadas_hoy']).toBe('llegadas_salidas_hoy');
    expect(INTENT_TO_SKILL['buscar_reservas_hotel']).toBe('buscar_reservas');
    expect(INTENT_TO_SKILL['rentabilidad_reserva_hotel']).toBe('rentabilidad_reserva');
    expect(INTENT_TO_SKILL['estado_motor_reservas']).toBe('estado_booking_engine');
  });

  it('la regla de producción del módulo se respeta (guardia del wrapper)', () => {
    expect(soloProducen('confirmed')).toBe(true);
    expect(soloProducen('checked_in')).toBe(true);
    expect(soloProducen('cancelled')).toBe(false);
    expect(soloProducen('no_show')).toBe(false);
  });
});
