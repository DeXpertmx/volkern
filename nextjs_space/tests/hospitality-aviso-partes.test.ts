// @vitest-environment node
//
// Guardia del aviso por email de los partes de viajeros SIN REINTENTAR
// (lib/hospitality/aviso-partes.ts + el bloque de aviso del barrido
// lib/cron/hospitality-registro-viajeros.ts).
//
// El contrato que importa: cuando el barrido deja fuera un parte, el hotel se
// entera POR EMAIL, no solo en la pantalla — y solo una vez por parte, sin
// repetir el mismo aviso en cada pasada horaria.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const __mockPrisma = vi.hoisted(() => ({
  hospitalityGuestRegistryCommunication: { findMany: vi.fn() },
  hospitalitySyncLog: { findMany: vi.fn(), create: vi.fn() },
  tenant: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
}));

const __mockSendEmail = vi.hoisted(() => vi.fn());
const __mockOperadores = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ prisma: __mockPrisma }));
vi.mock('@/lib/ses-email', () => ({ sendEmail: (...a: unknown[]) => __mockSendEmail(...a) }));
vi.mock('@/lib/hospitality/incidencias', () => ({
  operadoresDelTenant: (...a: unknown[]) => __mockOperadores(...a),
}));

import {
  asuntoAvisoPartes,
  cuerpoAvisoPartes,
  htmlAvisoPartes,
  lineasDePartes,
  MAX_PARTES_EN_EMAIL,
  TIPO_AVISO_PARTES,
  type ParteParaAviso,
} from '../lib/hospitality/aviso-partes';
import { avisarPartesAbandonados } from '../lib/cron/hospitality-registro-viajeros';
import { MAX_INTENTOS_PARTE } from '../lib/hospitality/parte-rechazo';

describe('asunto del aviso', () => {
  it('lleva el total para poder filtrar sin abrir el email', () => {
    expect(asuntoAvisoPartes(3)).toBe('Partes de viajeros sin comunicar (3)');
  });
});

describe('cuerpo del aviso', () => {
  const parte: ParteParaAviso = {
    id: 'p1',
    referencia: 'BE-123',
    estado: 'error',
    descripcion: 'El servicio no respondió (HTTP 503)',
    intentos: MAX_INTENTOS_PARTE,
    fechaEdicion: new Date('2026-09-19T10:30:00Z'),
  };

  it('sin partes no hay cuerpo: un email en vacío entrena a ignorarlo', () => {
    expect(cuerpoAvisoPartes({ tenant: 'Hotel Uno', partes: [] })).toBe('');
  });

  it('dice lo esencial: las estancias NO están comunicadas y alguien tiene que actuar', () => {
    const cuerpo = cuerpoAvisoPartes({ tenant: 'Hotel Uno', partes: [parte] });
    expect(cuerpo).toContain('Hotel Uno');
    expect(cuerpo).toContain('NO están comunicadas');
    expect(cuerpo).toContain('Registro de viajeros');
  });

  it('nombra la causa según el estado: no-entrega ≠ rechazo', () => {
    const caida = cuerpoAvisoPartes({ tenant: 'H', partes: [parte] });
    expect(caida).toContain('sin respuesta del servicio');
    const rechazado = cuerpoAvisoPartes({
      tenant: 'H',
      partes: [{ ...parte, estado: 'rechazada', descripcion: '10130: campo inválido' }],
    });
    expect(rechazado).toContain('rechazado por el Ministerio');
    expect(rechazado).toContain('10130');
  });

  it('la línea del parte lleva referencia, intentos y fecha', () => {
    const [linea] = lineasDePartes([parte]);
    expect(linea).toContain('BE-123');
    expect(linea).toContain(`${MAX_INTENTOS_PARTE}/${MAX_INTENTOS_PARTE} intentos`);
    expect(linea).toContain('19/09 10:30 UTC');
  });

  it('sin referencia muestra la id en su lugar: nunca un hueco', () => {
    const [linea] = lineasDePartes([{ ...parte, referencia: null }]);
    expect(linea).toContain('p1');
  });

  it('el detalle se recorta: el resto se cuenta, no se lista', () => {
    const muchos: ParteParaAviso[] = Array.from({ length: MAX_PARTES_EN_EMAIL + 3 }, (_, i) => ({
      ...parte,
      id: `p${i}`,
      referencia: `REF-${i}`,
    }));
    const cuerpo = cuerpoAvisoPartes({ tenant: 'H', partes: muchos });
    expect(cuerpo).toContain(`REF-${MAX_PARTES_EN_EMAIL - 1}`);
    expect(cuerpo).not.toContain(`REF-${MAX_PARTES_EN_EMAIL + 2}`);
    expect(cuerpo).toContain('… y 3 más.');
  });

  it('el HTML sale del mismo texto y enlaza al panel del hotel', () => {
    const html = htmlAvisoPartes({
      tenant: 'Hotel Uno',
      partes: [parte],
      baseUrl: 'https://app.ejemplo.com/',
    });
    expect(html).toContain('<strong>');
    expect(html).toContain('https://app.ejemplo.com/dashboard/hospitality/registro-viajeros');
    expect(html).not.toContain('<pre>');
  });

  it('escapa el contenido del servicio en el HTML (una descripción con < no rompe nada)', () => {
    const html = htmlAvisoPartes({
      tenant: 'H',
      partes: [{ ...parte, descripcion: 'error <grave>' }],
    });
    expect(html).toContain('&lt;grave&gt;');
    expect(html).not.toContain('<grave>');
  });
});

describe('aviso del barrido: quién recibe el email y cuándo', () => {
  const claveParte = { tipoComunicacion: 'PV', tipoOperacion: 'A' };
  const ahora = new Date('2026-09-19T12:00:00Z');

  const fila = {
    id: 'p1',
    tenantId: 't1',
    referencia: 'BE-123',
    estado: 'error',
    descripcion: 'HTTP 503',
    intentos: MAX_INTENTOS_PARTE,
    fechaEdicion: new Date('2026-09-19T10:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    __mockPrisma.tenant.findMany.mockResolvedValue([{ id: 't1', nombre: 'Hotel Uno' }]);
    __mockPrisma.hospitalitySyncLog.findMany.mockResolvedValue([]);
    __mockPrisma.hospitalitySyncLog.create.mockResolvedValue({});
    __mockPrisma.user.findMany.mockResolvedValue([{ email: 'director@hoteluno.com' }]);
    __mockOperadores.mockResolvedValue([{ id: 'u1' }]);
    __mockSendEmail.mockResolvedValue({ success: true });
  });

  it('sin abandonados no envía nada', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([]);
    const res = await avisarPartesAbandonados({ tenants: ['t1'], claveParte, ahora });
    expect(res.enviados).toBe(0);
    expect(__mockSendEmail).not.toHaveBeenCalled();
  });

  it('un parte nuevo dispara un email a los operadores con el cuerpo del módulo puro', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([fila]);
    const res = await avisarPartesAbandonados({ tenants: ['t1'], claveParte, ahora });
    expect(res.enviados).toBe(1);
    expect(__mockSendEmail).toHaveBeenCalledTimes(1);
    const email = __mockSendEmail.mock.calls[0][0];
    expect(email.to).toEqual(['director@hoteluno.com']);
    expect(email.subject).toBe(asuntoAvisoPartes(1));
    expect(email.text).toContain('BE-123');
    expect(email.tenantId).toBe('t1');
  });

  it('deja la marca del envío con los ids de los partes (auditoría + deduplicación)', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([fila]);
    await avisarPartesAbandonados({ tenants: ['t1'], claveParte, ahora });
    expect(__mockPrisma.hospitalitySyncLog.create).toHaveBeenCalledTimes(1);
    const marca = __mockPrisma.hospitalitySyncLog.create.mock.calls[0][0].data;
    expect(marca.tipo).toBe(TIPO_AVISO_PARTES);
    expect(marca.estado).toBe('exito');
    expect(marca.requestPayload).toEqual({ partes: [{ id: 'p1', referencia: 'BE-123' }] });
  });

  it('no repite el email por un parte ya avisado (deduplicación con la marca)', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([fila]);
    __mockPrisma.hospitalitySyncLog.findMany.mockResolvedValue([
      { tenantId: 't1', requestPayload: { partes: [{ id: 'p1' }] } },
    ]);
    const res = await avisarPartesAbandonados({ tenants: ['t1'], claveParte, ahora });
    expect(res.enviados).toBe(0);
    expect(res.enEspera).toBe(1);
    expect(__mockSendEmail).not.toHaveBeenCalled();
    expect(__mockPrisma.hospitalitySyncLog.create).not.toHaveBeenCalled();
  });

  it('un parte nuevo junto a uno ya avisado: email solo con el nuevo', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
      fila,
      { ...fila, id: 'p2', referencia: 'BE-456' },
    ]);
    __mockPrisma.hospitalitySyncLog.findMany.mockResolvedValue([
      { tenantId: 't1', requestPayload: { partes: [{ id: 'p1' }] } },
    ]);
    const res = await avisarPartesAbandonados({ tenants: ['t1'], claveParte, ahora });
    expect(res.enviados).toBe(1);
    const email = __mockSendEmail.mock.calls[0][0];
    expect(email.text).toContain('BE-456');
    expect(email.text).not.toContain('BE-123');
    expect(email.subject).toBe(asuntoAvisoPartes(1));
  });

  it('un envío fallido no deduplica: la marca queda en error y se reintenta la próxima pasada', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([fila]);
    __mockSendEmail.mockResolvedValue({ success: false, error: 'RESEND caído' });
    const res = await avisarPartesAbandonados({ tenants: ['t1'], claveParte, ahora });
    expect(res.enviados).toBe(0);
    expect(res.fallidos).toBe(1);
    const marca = __mockPrisma.hospitalitySyncLog.create.mock.calls[0][0].data;
    expect(marca.estado).toBe('error');
    // La próxima pasada NO encuentra el parte en el último aviso exitoso.
    __mockSendEmail.mockResolvedValue({ success: true });
    __mockPrisma.hospitalitySyncLog.findMany.mockResolvedValue([]);
    const reintento = await avisarPartesAbandonados({ tenants: ['t1'], claveParte, ahora });
    expect(reintento.enviados).toBe(1);
  });

  it('sin operadores con email lo dice en la auditoría en vez de fingir un envío', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([fila]);
    __mockPrisma.user.findMany.mockResolvedValue([]);
    const res = await avisarPartesAbandonados({ tenants: ['t1'], claveParte, ahora });
    expect(res.enviados).toBe(0);
    const marca = __mockPrisma.hospitalitySyncLog.create.mock.calls[0][0].data;
    expect(marca.estado).toBe('error');
    expect(marca.errorMensaje).toContain('sin destinatarios');
  });

  it('una excepción del envío no rompe el aviso de los demás tenants', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
      fila,
      { ...fila, tenantId: 't2', id: 'p9', referencia: 'BE-999' },
    ]);
    __mockPrisma.tenant.findMany.mockResolvedValue([
      { id: 't1', nombre: 'Hotel Uno' },
      { id: 't2', nombre: 'Hotel Dos' },
    ]);
    __mockSendEmail.mockRejectedValueOnce(new Error('network down'));
    const res = await avisarPartesAbandonados({ tenants: ['t1', 't2'], claveParte, ahora });
    expect(res.enviados).toBe(1);
    expect(res.fallidos).toBe(1);
    expect(__mockPrisma.hospitalitySyncLog.create).toHaveBeenCalledTimes(2);
  });
});
