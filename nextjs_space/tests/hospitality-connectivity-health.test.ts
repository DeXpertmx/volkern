// @vitest-environment node
//
// Health-check diario de la capa de conectividad
// (lib/cron/hospitality-connectivity-health.ts): refresca el estado del panel
// sin esperar tráfico real, con la MISMA sonda que el botón «Probar»
// (property_details + hotel sandbox) y las MISMAS reglas de estado.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  providerFindUnique: vi.fn(),
  providerUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  testConnection: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    connectivityProvider: {
      findUnique: mocks.providerFindUnique,
      update: mocks.providerUpdate,
    },
    auditLog: { create: mocks.auditLogCreate },
  },
}));

vi.mock('@/lib/hospitality/connectivity', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/hospitality/connectivity')>();
  return {
    ...original,
    testConnectivityConnection: mocks.testConnection,
    updateConnectivityStatus: mocks.updateStatus,
  };
});

import {
  runConnectivityHealthCheck,
  mensajeDelHealthCheck,
  avisosDelHealthCheck,
  JOB_ID_HEALTH_CHECK,
  JOB_LABEL_HEALTH_CHECK,
  JOB_SCHEDULE_HEALTH_CHECK,
} from '@/lib/cron/hospitality-connectivity-health';
import { CONNECTIVITY_SANDBOX_HOTEL } from '@/lib/hospitality/connectivity';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

function filaConfigurada() {
  return {
    id: 'prov_1',
    providerKey: 'channel_connectivity',
    nombreVisible: 'Conectividad de Canales',
    baseUrl: 'https://live.example.internal',
    partnerIdEnc: 'x',
    usernameEnc: 'x',
    passwordEnc: 'x',
    estado: 'conectado',
    ultimaSincronizacion: null,
    ultimoEvento: null,
    ultimaVerificacion: null,
    contadorErrores: 0,
    configuracion: null,
    fechaCreacion: new Date(),
    fechaEdicion: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.providerUpdate.mockResolvedValue({});
  mocks.auditLogCreate.mockResolvedValue({});
  mocks.updateStatus.mockResolvedValue({});
});

describe('runConnectivityHealthCheck', () => {
  it('usa la MISMA sonda que el botón «Probar»: property_details con el hotel sandbox', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaConfigurada());
    mocks.testConnection.mockResolvedValue({ ok: true, hotelCode: CONNECTIVITY_SANDBOX_HOTEL });

    const r = await runConnectivityHealthCheck();

    expect(mocks.testConnection).toHaveBeenCalledTimes(1);
    expect(mocks.testConnection).toHaveBeenCalledWith(CONNECTIVITY_SANDBOX_HOTEL);
    expect(r.ok).toBe(true);
    expect(r.ejecutado).toBe(true);
    expect(r.hotelCode).toBe(CONNECTIVITY_SANDBOX_HOTEL);
  });

  it('sondeo OK → estado conectado, errores a cero y marca de última verificación', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaConfigurada());
    mocks.testConnection.mockResolvedValue({ ok: true });

    const r = await runConnectivityHealthCheck();

    expect(r.estado).toBe('conectado');
    expect(r.detalle).toBeNull();
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      estado: 'conectado',
      resetErrores: true,
      ultimaVerificacion: expect.any(Date),
    });
  });

  it('sondeo 401 → estado error, contador de errores y detalle en el resultado', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaConfigurada());
    mocks.testConnection.mockResolvedValue({ ok: false, error: 'La conexión respondió con estado 401' });

    const r = await runConnectivityHealthCheck();

    expect(r.ok).toBe(false);
    expect(r.estado).toBe('error');
    expect(r.detalle).toContain('401');
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      estado: 'error',
      error: true,
      ultimaVerificacion: expect.any(Date),
    });
  });

  it('audita el sondeo con tenantId null (fila global) y NUNCA escribe en HospitalitySyncLog', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaConfigurada());
    mocks.testConnection.mockResolvedValue({ ok: false, error: 'timeout' });

    await runConnectivityHealthCheck();

    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1);
    const data = mocks.auditLogCreate.mock.calls[0][0].data;
    expect(data.tenantId).toBeNull();
    expect(data.accion).toBe('conectividad_health_check');
    expect(data.entidad).toBe('connectivity_provider');
    expect(data.metadata.ok).toBe(false);

    // El módulo no importa prisma.hospitalitySyncLog: el fallo del propio
    // sondeo no puede contaminar el diagnóstico del badge.
    expect(mocks.providerUpdate).not.toHaveBeenCalled();
  });

  it('sin configuración → no-op razonado: ni sonda ni escrituras de estado', async () => {
    mocks.providerFindUnique.mockResolvedValue(null);

    const r = await runConnectivityHealthCheck();

    expect(r.ejecutado).toBe(false);
    expect(r.ok).toBeNull();
    expect(r.motivo).toBeTruthy();
    expect(mocks.testConnection).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it('estado sin_configurar → mismo no-op (no hay credenciales que verificar)', async () => {
    mocks.providerFindUnique.mockResolvedValue({ ...filaConfigurada(), estado: 'sin_configurar' });

    const r = await runConnectivityHealthCheck();

    expect(r.ejecutado).toBe(false);
    expect(mocks.testConnection).not.toHaveBeenCalled();
  });

  it('si la auditoría falla, el health-check reporta igual (la auditoría no manda)', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaConfigurada());
    mocks.testConnection.mockResolvedValue({ ok: true });
    mocks.auditLogCreate.mockRejectedValue(new Error('BD caída'));

    const r = await runConnectivityHealthCheck();

    expect(r.ok).toBe(true);
    expect(r.ejecutado).toBe(true);
  });

  it('si mover el estado falla, el error sube al job (no se disimula)', async () => {
    mocks.providerFindUnique.mockResolvedValue(filaConfigurada());
    mocks.testConnection.mockResolvedValue({ ok: true });
    mocks.updateStatus.mockRejectedValue(new Error('update roto'));

    await expect(runConnectivityHealthCheck()).rejects.toThrow('update roto');
  });
});

describe('mensajes del health-check para el panel de estado', () => {
  it('no-op → el motivo, no un OK engañoso', () => {
    expect(
      mensajeDelHealthCheck({
        ok: null,
        ejecutado: false,
        motivo: 'Conectividad sin configurar: nada que verificar todavía.',
        hotelCode: null,
        estado: null,
        detalle: null,
        durationMs: 2,
      }),
    ).toContain('sin configurar');
  });

  it('OK → dice que la capa responde', () => {
    expect(
      mensajeDelHealthCheck({
        ok: true,
        ejecutado: true,
        motivo: null,
        hotelCode: CONNECTIVITY_SANDBOX_HOTEL,
        estado: 'conectado',
        detalle: null,
        durationMs: 120,
      }),
    ).toMatch(/verificada/i);
  });

  it('fallo de la capa → aviso ámbar en el panel de crons (no es un error del job)', () => {
    const r = {
      ok: false,
      ejecutado: true,
      motivo: null,
      hotelCode: CONNECTIVITY_SANDBOX_HOTEL,
      estado: 'error',
      detalle: 'La conexión respondió con estado 401',
      durationMs: 90,
    };
    expect(mensajeDelHealthCheck(r)).toContain('401');
    const avisos = avisosDelHealthCheck(r);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/panel de Conectividad/i);
  });

  it('sin avisos cuando todo va bien', () => {
    expect(
      avisosDelHealthCheck({
        ok: true,
        ejecutado: true,
        motivo: null,
        hotelCode: CONNECTIVITY_SANDBOX_HOTEL,
        estado: 'conectado',
        detalle: null,
        durationMs: 50,
      }),
    ).toEqual([]);
  });
});

describe('constantes del job (el panel de estado cruza scheduler y módulo)', () => {
  it('id, etiqueta y cadencia estables', () => {
    expect(JOB_ID_HEALTH_CHECK).toBe('hospitality-connectivity-health');
    expect(JOB_LABEL_HEALTH_CHECK).toBe('Hospitality Conectividad Health Check');
    expect(JOB_SCHEDULE_HEALTH_CHECK).toBe('0 5 * * *');
  });

  it('el scheduler registra el MISMO job importando las constantes del módulo', () => {
    // Si alguien renombra el job en un sitio y no en el otro, el panel de
    // estado dejaría de verlo: este test lo reprocha. El scheduler no repite
    // literales: importa las constantes (una sola fuente de verdad).
    const fuente = fs.readFileSync(path.join(RAIZ, 'lib/cron/scheduler.ts'), 'utf8');
    expect(fuente).toContain("from './hospitality-connectivity-health'");
    expect(fuente).toContain('JOB_ID_HEALTH_CHECK');
    expect(fuente).toContain('JOB_LABEL_HEALTH_CHECK');
    expect(fuente).toContain('JOB_SCHEDULE_HEALTH_CHECK');
    // Y ejecuta el barrido del módulo, no una reimplementación.
    expect(fuente).toContain('runConnectivityHealthCheck');
    expect(fuente).toContain('mensajeDelHealthCheck');
    expect(fuente).toContain('avisosDelHealthCheck');
  });

  it('la columna ultimaVerificacion existe en schema y migración', () => {
    const schema = fs.readFileSync(path.join(RAIZ, 'prisma/schema.prisma'), 'utf8');
    const modelo = schema.split('model ConnectivityProvider')[1]?.split('}')[0] || '';
    expect(modelo).toContain('ultimaVerificacion');

    const dir = 'prisma/migrations/20260920120000_connectivity_ultima_verificacion';
    const sql = fs.readFileSync(path.join(RAIZ, dir, 'migration.sql'), 'utf8');
    expect(sql).toContain('ALTER TABLE "connectivity_providers"');
    expect(sql).toContain('"ultimaVerificacion"');
  });
});
