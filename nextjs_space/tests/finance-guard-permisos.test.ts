import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El cockpit financiero consolidado no se concede por el nombre del rol.
 *
 * Antes el guard comparaba `Role.nombre` contra una lista ('SUPERADMIN',
 * 'ADMIN', 'OWNER', 'FINANCE_ADMIN'): el propietario de la cuenta lo perdía en
 * cuanto su rol se llamaba distinto, y cualquier rol bautizado «Admin» lo
 * ganaba sin que nadie se lo hubiera concedido. Lo que estas pruebas fijan es
 * que la llave que lo concede es `configuracion.gestionar`, y que el nombre —en
 * cualquiera de sus dos formas— no basta.
 */

const reportSecurityIncident = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const verifyFinancialIntegrity = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('@/lib/db', () => ({ prisma: {} }));

vi.mock('@/lib/security/integrity-service', () => ({
  reportSecurityIncident,
  verifyFinancialIntegrity,
}));

import { validateFinancialSecurity } from '@/lib/security/finance-guard';

const USUARIO = { id: 'u1', email: 'admin@cuenta.test' };

function rol(nombre: string, permisos: unknown) {
  return { id: `rol-${nombre}`, nombre, permisos };
}

describe('validateFinancialSecurity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyFinancialIntegrity.mockResolvedValue(true);
  });

  it('deja pasar a quien administra la cuenta', async () => {
    const resultado = await validateFinancialSecurity('t1', {
      ...USUARIO,
      role: rol('Anfitrión', { configuracion: { gestionar: true } }),
    });

    expect(resultado.authorized).toBe(true);
    expect(reportSecurityIncident).not.toHaveBeenCalled();
  });

  it('deja pasar con el wildcard de los administradores existentes', async () => {
    const resultado = await validateFinancialSecurity('t1', {
      ...USUARIO,
      role: rol('Admin', { all: true }),
    });

    expect(resultado.authorized).toBe(true);
  });

  it('deja pasar al propietario de la plataforma por su bypass', async () => {
    const resultado = await validateFinancialSecurity('t1', {
      ...USUARIO,
      role: rol('Superadmin', {}),
    });

    expect(resultado.authorized).toBe(true);
  });

  it('rechaza 403 a un rol que solo se llama «Admin»', async () => {
    const resultado = await validateFinancialSecurity('t1', {
      ...USUARIO,
      role: rol('Admin', { configuracion: { ver: true } }),
    });

    expect(resultado.authorized).toBe(false);
    expect(resultado.status).toBe(403);
    expect(reportSecurityIncident).toHaveBeenCalledTimes(1);
    expect(reportSecurityIncident.mock.calls[0][0]).toMatchObject({
      tenantId: 't1',
      type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      severity: 'HIGH',
    });
    expect(String(reportSecurityIncident.mock.calls[0][0].details)).toContain('Admin');
  });

  it('rechaza al rol que ve analítica pero no administra la cuenta', async () => {
    const resultado = await validateFinancialSecurity('t1', {
      ...USUARIO,
      role: rol('Sales Agent', { analytics: { ver: true }, configuracion: { ver: true } }),
    });

    expect(resultado.authorized).toBe(false);
    expect(resultado.status).toBe(403);
  });

  it('rechaza cuando el rol llega como cadena (sin permisos que leer)', async () => {
    const resultado = await validateFinancialSecurity('t1', { ...USUARIO, role: 'Admin' });

    expect(resultado.authorized).toBe(false);
    expect(resultado.status).toBe(403);
    // El aviso nombra el rol que intentó entrar, aunque viniera como cadena.
    expect(String(reportSecurityIncident.mock.calls[0][0].details)).toContain('Admin');
  });

  it('rechaza sin rol', async () => {
    const resultado = await validateFinancialSecurity('t1', { ...USUARIO, role: null });

    expect(resultado.authorized).toBe(false);
    expect(resultado.status).toBe(403);
  });

  it('un fallo de integridad bloquea incluso a quien administra', async () => {
    verifyFinancialIntegrity.mockResolvedValue(false);

    const resultado = await validateFinancialSecurity('t1', {
      ...USUARIO,
      role: rol('Anfitrión', { configuracion: { gestionar: true } }),
    });

    expect(resultado.authorized).toBe(false);
    expect(resultado.status).toBe(403);
    expect(reportSecurityIncident).toHaveBeenCalledTimes(1);
    expect(reportSecurityIncident.mock.calls[0][0].type).toBe('FINANCIAL_INTEGRITY_FAILURE');
  });
});
