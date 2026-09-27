import { describe, expect, it, beforeEach } from 'vitest';
import {
  estado_del_dia,
  buscar_reservas,
  rentabilidad_reserva,
  estado_booking_engine,
  registrar_incidencia,
  cambiar_estado_reserva,
  anotar_pago,
  resumen_diario,
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
    hospitalityUnit: { count: vi.fn(), findFirst: vi.fn() },
    hospitalityReservation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    hospitalityBookingConfig: { findUnique: vi.fn() },
    hospitalityProperty: { findMany: vi.fn(), findFirst: vi.fn() },
    hospitalityUnitBlock: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    hospitalityPayment: { create: vi.fn(), findMany: vi.fn() },
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

// ─── Escritura: registrar_incidencia ────────────────────────────────────────

describe('hospitality-skills · registrar_incidencia', () => {
  it('resuelve la unidad por nombre, crea el bloqueo y respeta la ventana', async () => {
    vi.mocked(prisma.hospitalityUnit.findFirst).mockResolvedValue({ id: 'u1', nombre: 'Loft Marina' } as any);
    vi.mocked(prisma.hospitalityUnitBlock.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.hospitalityUnitBlock.create).mockResolvedValue({ id: 'b1', fechaInicio: fecha(0), fechaFin: fecha(3) } as any);

    const resultado = await registrar_incidencia({ tenantId: TENANT, unidad: 'loft marina', descripcion: 'Bañera rota', dias: 3 });

    // Resolución por nombre insensible a mayúsculas (el operador no dice cuids).
    const unidadWhere = vi.mocked(prisma.hospitalityUnit.findFirst).mock.calls[0][0]!.where as any;
    expect(unidadWhere.OR[1].nombre).toEqual({ equals: 'loft marina', mode: 'insensitive' });
    // Tipo por defecto: mantenimiento.
    const creado = vi.mocked(prisma.hospitalityUnitBlock.create).mock.calls[0][0]!.data as any;
    expect(creado.tipo).toBe('mantenimiento');
    expect(creado.estado).toBe('activo');
    expect(resultado.ok).toBe(true);
    expect(resultado.dias).toBe(3);
    expect(resultado.mensaje).toContain('Bañera rota');
  });

  it('no duplica bloqueos: si ya hay uno activo que se solapa, avisa y no crea', async () => {
    vi.mocked(prisma.hospitalityUnit.findFirst).mockResolvedValue({ id: 'u1', nombre: 'Loft Marina' } as any);
    vi.mocked(prisma.hospitalityUnitBlock.findFirst).mockResolvedValue({ tipo: 'propietario', fechaFin: fecha(2) } as any);

    const resultado = await registrar_incidencia({ tenantId: TENANT, unidad: 'u1', descripcion: 'Fuga' });

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('propietario');
    expect(prisma.hospitalityUnitBlock.create).not.toHaveBeenCalled();
  });
});

// ─── Escritura: cambiar_estado_reserva ───────────────────────────────────

describe('hospitality-skills · cambiar_estado_reserva', () => {
  it('check-out desde checked_in guarda la salida real (opción B del panel)', async () => {
    vi.mocked(prisma.hospitalityReservation.findFirst).mockResolvedValue({
      id: 'r1',
      externalBookingId: 'WEB-123',
      estado: 'checked_in',
      checkOut: fecha(2),
      propertyId: 'hprop_1',
      channel: 'Directa',
    } as any);
    vi.mocked(prisma.hospitalityProperty.findFirst).mockResolvedValue({ politicaSalidaAnticipada: null } as any);
    vi.mocked(prisma.hospitalityReservation.update).mockResolvedValue({ id: 'r1', estado: 'checked_out', checkOutReal: new Date() } as any);

    const resultado = await cambiar_estado_reserva({ tenantId: TENANT, referencia: 'WEB-123', estado: 'checked_out' });

    const data = vi.mocked(prisma.hospitalityReservation.update).mock.calls[0][0]!.data as any;
    expect(data.estado).toBe('checked_out');
    expect(data.checkOutReal).toBeTruthy();
    expect(resultado.ok).toBe(true);
    expect(resultado.estadoAnterior).toBe('checked_in');
    expect(resultado.mensaje).toContain('checked_in → checked_out');
  });

  it('rechaza transiciones fuera de la máquina de estados del panel', async () => {
    vi.mocked(prisma.hospitalityReservation.findFirst).mockResolvedValue({
      id: 'r2',
      externalBookingId: 'OTA-9',
      estado: 'cancelled',
      checkOut: fecha(1),
      propertyId: 'hprop_1',
      channel: 'Airbnb',
    } as any);

    const resultado = await cambiar_estado_reserva({ tenantId: TENANT, referencia: 'OTA-9', estado: 'confirmed' });

    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('No se puede pasar de «cancelled»');
    expect(prisma.hospitalityReservation.update).not.toHaveBeenCalled();
  });

  it('estado desconocido: error de validación, ni consulta ni escritura', async () => {
    await expect(cambiar_estado_reserva({ tenantId: TENANT, referencia: 'WEB-123', estado: 'abierta' })).rejects.toThrow('Estado inválido');
    expect(prisma.hospitalityReservation.findFirst).not.toHaveBeenCalled();
  });
});

// ─── Escritura: anotar_pago ──────────────────────────────────────────────

describe('hospitality-skills · anotar_pago', () => {
  it('crea el pago y deriva el cobro con el módulo de finanzas (todos los pagos)', async () => {
    vi.mocked(prisma.hospitalityReservation.findFirst).mockResolvedValue({
      id: 'r1',
      externalBookingId: 'WEB-123',
      propertyId: 'hprop_1',
      unitId: 'u1',
      currency: 'EUR',
      amountAfterTax: 5840,
    } as any);
    vi.mocked(prisma.hospitalityPayment.create).mockResolvedValue({ id: 'p1', importe: 3000, moneda: 'EUR', metodo: 'efectivo', estado: 'pagado' } as any);
    vi.mocked(prisma.hospitalityPayment.findMany).mockResolvedValue([
      { importe: 3000, estado: 'pagado', metodo: 'efectivo' },
      { importe: 2840, estado: 'pagado', metodo: 'stripe' },
    ] as any);

    const resultado = await anotar_pago({ tenantId: TENANT, referencia: 'WEB-123', importe: 3000, metodo: 'efectivo' });

    const data = vi.mocked(prisma.hospitalityPayment.create).mock.calls[0][0]!.data as any;
    expect(data.moneda).toBe('EUR'); // la moneda es la de la reserva, no se inventa
    expect(data.fechaPago).toBeTruthy(); // pagado → fecha de pago de hoy
    expect(resultado.ok).toBe(true);
    expect(resultado.cobro).toMatchObject({ cobrado: 5840, pendiente: 0, estadoCobro: 'pagado' });
  });

  it('valida importe y método antes de tocar la base de datos', async () => {
    await expect(anotar_pago({ tenantId: TENANT, referencia: 'WEB-123', importe: -5 })).rejects.toThrow('importe');
    await expect(anotar_pago({ tenantId: TENANT, referencia: 'WEB-123', importe: 100, metodo: 'paypal' })).rejects.toThrow('Método inválido');
    expect(prisma.hospitalityReservation.findFirst).not.toHaveBeenCalled();
  });

  it('referencia desconocida: ok:false sin excepción', async () => {
    vi.mocked(prisma.hospitalityReservation.findFirst).mockResolvedValue(null);
    const resultado = await anotar_pago({ tenantId: TENANT, referencia: 'NO-EXISTE', importe: 10 });
    expect(resultado).toMatchObject({ ok: false, encontrado: false });
  });
});

// ─── Briefing: resumen_diario ────────────────────────────────────────────

describe('hospitality-skills · resumen_diario', () => {
  it('compone el briefing: operación del día, incidencias activas y cobros pendientes', async () => {
    vi.mocked(prisma.hospitalityUnit.count).mockResolvedValue(4);
    vi.mocked(prisma.hospitalityReservation.findMany).mockImplementation(async ({ where }: any) => {
      const checkIn = where?.checkIn as { gte?: Date; lt?: Date } | undefined;
      const checkOut = where?.checkOut as { gte?: Date; lt?: Date; gt?: Date } | undefined;
      const estados = where?.estado as { in?: string[]; notIn?: string[] } | undefined;

      // Cruce del día (reservas en casa).
      if (checkIn?.lt && checkOut?.gt && estados?.in) return [{ id: 'r1', unitId: 'u1' }];
      // Llegadas/salidas del día o de mañana.
      if (estados?.notIn?.length === 1) {
        return [
          { id: 'r2', estado: 'confirmed', checkIn: fecha(0), checkOut: fecha(2), guestData: { guestName: 'Ana García' }, unit: { nombre: 'Loft Marina' }, property: { nombre: 'Villa Mar Azul' } },
        ];
      }
      // Ventana del briefing y cobros: dos reservas con producción — una
      // saldada y otra sin pagos (el huésped debe el bruto; la comisión OTA
      // es coste del neto, no se cobra al huésped).
      return [
        {
          externalBookingId: 'WEB-123', currency: 'EUR', amountAfterTax: 5840, commission: 0,
          items: [
            { tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 2, importeUnitario: 2890, importeTotal: 5780 },
            { tipo: 'limpieza', concepto: 'Limpieza', cantidad: 1, importeUnitario: 60, importeTotal: 60 },
          ],
          payments: [{ importe: 5840, estado: 'pagado', metodo: 'stripe' }],
        },
        { externalBookingId: 'OTA-9', currency: 'EUR', amountAfterTax: 300, commission: 45, items: [], payments: [] },
      ];
    });
    vi.mocked(prisma.hospitalityUnitBlock.findMany).mockResolvedValue([
      { tipo: 'mantenimiento', motivo: 'Bañera rota', fechaInicio: fecha(-1), fechaFin: fecha(2), unit: { nombre: 'Loft Marina' } },
    ] as any);

    const briefing = await resumen_diario({ tenantId: TENANT });

    // Operación del día: reutiliza estado_del_dia, no una copia.
    expect(briefing.ocupacionHoyPct).toBe(25);
    expect(briefing.llegadasHoy).toBe(1);
    expect(briefing.detalleLlegadas[0]).toMatchObject({ huesped: 'Ana García', unidad: 'Loft Marina' });
    // Incidencias: bloqueos activos que tocan hoy.
    expect(briefing.incidenciasAbiertas).toBe(1);
    expect(briefing.incidencias[0]).toMatchObject({ unidad: 'Loft Marina', tipo: 'mantenimiento', motivo: 'Bañera rota' });
    // Cobros: WEB-123 saldada se descarta; OTA-9 debe el bruto completo (la
    // comisión de la OTA no se cobra al huésped).
    expect(briefing.cobrosPendientes).toBe(1);
    expect(briefing.mayoresPendientes[0]).toMatchObject({ referencia: 'OTA-9', pendiente: 300, estadoCobro: 'pendiente' });
    expect(briefing.totalPendientePorMoneda).toEqual({ EUR: 300 });
  });

  it('sin incidencias ni pendientes: briefing en cero, sin excepciones', async () => {
    vi.mocked(prisma.hospitalityUnit.count).mockResolvedValue(0);
    vi.mocked(prisma.hospitalityReservation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.hospitalityUnitBlock.findMany).mockResolvedValue([]);

    const briefing = await resumen_diario({ tenantId: TENANT });

    expect(briefing.ocupacionHoyPct).toBe(0);
    expect(briefing.incidenciasAbiertas).toBe(0);
    expect(briefing.cobrosPendientes).toBe(0);
    expect(briefing.totalPendientePorMoneda).toEqual({});
  });
});

// ─── Registro: skills y MCP expuestos ───────────────────────────────────────

const HOSPITALITY_SKILLS = [
  'estado_del_dia',
  'llegadas_salidas_hoy',
  'buscar_reservas',
  'rentabilidad_reserva',
  'estado_booking_engine',
  'registrar_incidencia',
  'cambiar_estado_reserva',
  'anotar_pago',
  'resumen_diario',
] as const;

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
    expect(INTENT_TO_SKILL['registrar_incidencia_hotel']).toBe('registrar_incidencia');
    expect(INTENT_TO_SKILL['cambiar_estado_reserva_hotel']).toBe('cambiar_estado_reserva');
    expect(INTENT_TO_SKILL['anotar_pago_hotel']).toBe('anotar_pago');
    expect(INTENT_TO_SKILL['resumen_diario_hotel']).toBe('resumen_diario');
    expect(INTENT_TO_SKILL['briefing_matutino']).toBe('resumen_diario');
  });

  it('la regla de producción del módulo se respeta (guardia del wrapper)', () => {
    expect(soloProducen('confirmed')).toBe(true);
    expect(soloProducen('checked_in')).toBe(true);
    expect(soloProducen('cancelled')).toBe(false);
    expect(soloProducen('no_show')).toBe(false);
  });
});
