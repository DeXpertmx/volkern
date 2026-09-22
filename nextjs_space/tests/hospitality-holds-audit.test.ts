// @vitest-environment node
//
// Guardia de la TRAZA de holds confirmados (lib/hospitality/holds-audit.ts).
//
// La tasa de abandono de holds sale de contar dos eventos de auditoría: el
// caducado que escribe el barrido y el confirmado que escribe este módulo
// (cuando un `pending` pasa a `confirmed`, por el operador o por el canal). Si
// esta traza no se escribe —o se escribe con otra acción—, el denominador de la
// métrica se queda corto y Reportes miente hacia abajo.
//
// Por eso la acción es una CONSTANTE COMPARTIDA con el módulo puro de métricas:
// escritor y lector no pueden desincronizarse sin que falle un test.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const mocks = vi.hoisted(() => ({
  auditLog: { create: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: { auditLog: mocks.auditLog } }));

import { registrarHoldConfirmado } from '../lib/hospitality/holds-audit';
import { ACCION_AUDIT_HOLD_CONFIRMADO, ACCION_AUDIT_HOLD_CADUCADO } from '../lib/hospitality/holds';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditLog.create.mockResolvedValue({ id: 'audit_1' });
});

describe('registrarHoldConfirmado', () => {
  it('escribe la traza con la acción compartida y el tenant de la reserva', async () => {
    const ok = await registrarHoldConfirmado({
      tenantId: 'tenant_a',
      reservationId: 'res_1',
      propertyId: 'prop_1',
      channel: 'airbnb',
      origen: 'operador',
    });

    expect(ok).toBe(true);
    const { data } = mocks.auditLog.create.mock.calls[0][0];
    expect(data.tenantId).toBe('tenant_a');
    expect(data.accion).toBe(ACCION_AUDIT_HOLD_CONFIRMADO);
    expect(data.entidad).toBe('reservation');
    expect(data.entidadId).toBe('res_1');
    expect(data.metadata).toMatchObject({
      reservationId: 'res_1',
      propertyId: 'prop_1',
      channel: 'airbnb',
      origen: 'operador',
    });
  });

  it('la confirmación es el OTRO desenlace del hold: acción distinta a la caducidad', () => {
    // Si las dos acciones coincidieran, la tasa se volvería 100% o 0%.
    expect(ACCION_AUDIT_HOLD_CONFIRMADO).not.toBe(ACCION_AUDIT_HOLD_CADUCADO);
  });

  it('distingue quién confirmó (operador o canal) para poder separarlos después', async () => {
    await registrarHoldConfirmado({
      tenantId: 'tenant_a',
      reservationId: 'res_2',
      channel: 'booking',
      origen: 'canal',
    });
    const { data } = mocks.auditLog.create.mock.calls[0][0];
    expect(data.metadata.origen).toBe('canal');
    // Sin propiedad declarada no se inventa una.
    expect(data.metadata.propertyId).toBeNull();
  });

  it('un fallo de la BD no lanza: devuelve false y la confirmación sigue en pie', async () => {
    // La reserva YA se confirmó; no poder auditar no puede revertir eso ni
    // tumbar el webhook que la confirmó.
    mocks.auditLog.create.mockRejectedValue(new Error('BD caída'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      registrarHoldConfirmado({ tenantId: 't', reservationId: 'r', origen: 'canal' })
    ).resolves.toBe(false);

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('Invariante: la acción de auditoría vive en un solo sitio', () => {
  it('los dos escritores (barrido y confirmación) usan la constante compartida', () => {
    // Escritor y lector tienen que decir exactamente lo mismo: si cada uno
    // llevara su literal, la tasa de abandono se desviaría en silencio.
    const barrido = leer('lib/cron/hospitality-holds.ts');
    expect(barrido).toContain('ACCION_AUDIT_HOLD_CADUCADO');
    expect(barrido).not.toContain("'hospitality_hold_expirado'");

    expect(leer('lib/hospitality/holds-audit.ts')).toContain('ACCION_AUDIT_HOLD_CONFIRMADO');

    const metricas = leer('app/api/admin/hospitality/holds/route.ts');
    expect(metricas).toContain('ACCION_AUDIT_HOLD_CADUCADO');
    expect(metricas).not.toContain("'hospitality_hold_expirado'");

    // Y las dos constantes se declaran una sola vez.
    const modulo = leer('lib/hospitality/holds.ts');
    expect(modulo.match(/hospitality_hold_expirado/g)).toHaveLength(1);
    expect(modulo.match(/hospitality_hold_confirmado/g)).toHaveLength(1);
  });
});
