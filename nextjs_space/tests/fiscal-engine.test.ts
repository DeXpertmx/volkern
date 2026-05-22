import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de Prisma antes de importar
vi.mock('@/lib/db', () => {
  const mockPrisma = {
    configuracionFiscalEmisor: {
      findFirst: vi.fn(),
    },
    tasaImpuesto: {
      findMany: vi.fn(),
    },
    perfilFiscalCliente: {
      findUnique: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { 
  formatCurrency, 
  getFiscalConfigForWebhook, 
  getFiscalConfig,
  CURRENCY_BY_COUNTRY,
  TAX_NAME_BY_COUNTRY,
  FISCAL_ID_LABEL_BY_COUNTRY,
} from '@/lib/fiscal-engine';
import { prisma } from '@/lib/db';

describe('FiscalEngine — formatCurrency', () => {
  it('debe formatear números con símbolo $ y 2 decimales por defecto', () => {
    expect(formatCurrency(0)).toBe('$0,00');
    // El formato de miles depende del locale disponible en el entorno de test
    const result = formatCurrency(1000);
    expect(result).toMatch(/\$1[.,]?000[.,]00/);
    expect(formatCurrency(1000.5)).toMatch(/\$1[.,]?000[.,]50/);
  });

  it('debe usar el símbolo proporcionado', () => {
    expect(formatCurrency(100, '€')).toBe('€100,00');
    expect(formatCurrency(50, '£')).toBe('£50,00');
  });

  it('debe respetar el número de decimales', () => {
    expect(formatCurrency(100.123, '$', 0)).toBe('$100');
    expect(formatCurrency(100.123, '$', 3)).toBe('$100,123');
  });

  it('debe manejar números negativos', () => {
    const result = formatCurrency(-500, '$');
    // El signo negativo aparece después del símbolo: $ -500,00 → $-500,00
    expect(result).toMatch(/^\$-500[,.]00$/);
  });

  it('debe formatear correctamente usando locale es-ES', () => {
    expect(formatCurrency(1234567.89, '€')).toBe('€1.234.567,89');
  });
});

describe('FiscalEngine — getFiscalConfigForWebhook', () => {
  it('debe extraer campos correctos del config', () => {
    const config = {
      fiscalIdLabel: 'NIF/CIF',
      taxName: 'IVA',
      taxRate: 21,
      currencyCode: 'EUR',
      currencySymbol: '€',
      emisor: { idFiscal: 'B12345678' } as any,
      esOperacionExtranjera: false,
      aplicaReverseCharge: false,
    } as any;

    const result = getFiscalConfigForWebhook(config);
    expect(result).toEqual({
      label: 'NIF/CIF',
      tax_name: 'IVA',
      rate: 21,
      currency_code: 'EUR',
      currency_symbol: '€',
      emisor_id: 'B12345678',
      es_operacion_extranjera: false,
      aplica_reverse_charge: false,
    });
  });

  it('debe devolver null para emisor_id si no hay emisor', () => {
    const config = {
      fiscalIdLabel: 'RFC',
      taxName: 'IVA',
      taxRate: 16,
      currencyCode: 'MXN',
      currencySymbol: '$',
      emisor: null,
      esOperacionExtranjera: true,
      aplicaReverseCharge: false,
    } as any;

    const result = getFiscalConfigForWebhook(config);
    expect(result.emisor_id).toBeNull();
    expect(result.es_operacion_extranjera).toBe(true);
  });

  it('debe devolver null para emisor_id si emisor no tiene idFiscal', () => {
    const config = {
      fiscalIdLabel: 'NIF',
      taxName: 'IVA',
      taxRate: 23,
      currencyCode: 'EUR',
      currencySymbol: '€',
      emisor: {} as any,
      esOperacionExtranjera: false,
      aplicaReverseCharge: true,
    } as any;

    const result = getFiscalConfigForWebhook(config);
    expect(result.emisor_id).toBeNull();
    expect(result.aplica_reverse_charge).toBe(true);
  });
});

describe('FiscalEngine — constantes de país', () => {
  it('CURRENCY_BY_COUNTRY debe tener los países principales', () => {
    expect(CURRENCY_BY_COUNTRY['ES']).toEqual({ code: 'EUR', symbol: '€', name: 'Euro' });
    expect(CURRENCY_BY_COUNTRY['MX']).toEqual({ code: 'MXN', symbol: '$', name: 'Peso Mexicano' });
    expect(CURRENCY_BY_COUNTRY['US']).toEqual({ code: 'USD', symbol: '$', name: 'Dólar Estadounidense' });
  });

  it('TAX_NAME_BY_COUNTRY debe tener nombres correctos', () => {
    expect(TAX_NAME_BY_COUNTRY['ES']).toBe('IVA');
    expect(TAX_NAME_BY_COUNTRY['GB']).toBe('VAT');
    expect(TAX_NAME_BY_COUNTRY['US']).toBe('Tax');
    expect(TAX_NAME_BY_COUNTRY['PE']).toBe('IGV');
  });

  it('FISCAL_ID_LABEL_BY_COUNTRY debe tener los labels correctos', () => {
    expect(FISCAL_ID_LABEL_BY_COUNTRY['MX']).toBe('RFC');
    expect(FISCAL_ID_LABEL_BY_COUNTRY['ES']).toBe('NIF/CIF');
    expect(FISCAL_ID_LABEL_BY_COUNTRY['US']).toBe('EIN');
    expect(FISCAL_ID_LABEL_BY_COUNTRY['CL']).toBe('RUT');
  });
});

describe('FiscalEngine — getFiscalConfig (con Prisma mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver configuración por defecto cuando no hay emisor ni tasas', async () => {
    (prisma.configuracionFiscalEmisor.findFirst as any).mockResolvedValue(null);
    (prisma.tasaImpuesto.findMany as any).mockResolvedValue([]);

    const config = await getFiscalConfig('tenant-1');

    expect(config.taxRate).toBe(21);
    // Sin emisor ni tasas, usa default 'ES' → EUR
    expect(config.currencyCode).toBe('EUR');
    expect(config.currencySymbol).toBe('€');
    expect(config.esOperacionExtranjera).toBe(false);
    expect(config.aplicaReverseCharge).toBe(false);
    expect(config.emisor).toBeNull();
    expect(config.cliente).toBeNull();
    expect(config.tasasDisponibles).toEqual([]);
  });

  it('debe usar el país del emisor para la configuración', async () => {
    const emisorMock = {
      id: 'emisor-1',
      razonSocial: 'Empresa Test S.L.',
      nombreComercial: 'TestCo',
      pais: 'ES',
      email: 'test@testco.com',
      telefono: '+34900000000',
      esPrincipal: true,
      activo: true,
    };

    (prisma.configuracionFiscalEmisor.findFirst as any)
      .mockResolvedValueOnce(null) // primer intento por ID (sin emisorId)
      .mockResolvedValueOnce(emisorMock); // segundo intento por esPrincipal
    (prisma.tasaImpuesto.findMany as any).mockResolvedValue([
      { id: 't1', nombre: 'IVA General', codigo: 'IVA21', porcentaje: 21, tipo: 'iva', pais: 'ES', activo: true },
    ]);

    const config = await getFiscalConfig('tenant-1');

    expect(config.taxRate).toBe(21);
    expect(config.currencyCode).toBe('EUR');
    expect(config.currencySymbol).toBe('€');
    expect(config.fiscalIdLabel).toBe('NIF/CIF');
    expect(config.taxName).toBe('IVA');
    expect(config.emisor).not.toBeNull();
    expect(config.emisor!.razonSocial).toBe('Empresa Test S.L.');
  });

  it('debe usar emisorId cuando se proporciona', async () => {
    const emisorMock = {
      id: 'emisor-2',
      razonSocial: 'Emisor MX S.A.',
      nombreComercial: 'MXCo',
      pais: 'MX',
      email: 'mx@test.com',
      telefono: '+525500000000',
      monedaPredeterminada: 'MXN',
    };

    (prisma.configuracionFiscalEmisor.findFirst as any).mockResolvedValue(emisorMock);
    (prisma.tasaImpuesto.findMany as any).mockResolvedValue([
      { id: 't2', nombre: 'IVA 16%', codigo: 'IVA16', porcentaje: 16, tipo: 'iva', pais: 'MX', activo: true },
    ]);

    const config = await getFiscalConfig('tenant-1', { emisorId: 'emisor-2' });

    expect(config.currencyCode).toBe('MXN');
    expect(config.currencySymbol).toBe('$');
    expect(config.fiscalIdLabel).toBe('RFC');
    expect(config.taxName).toBe('IVA');
    expect(config.taxRate).toBe(16);
  });

  it('debe detectar operación extranjera cuando los países difieren', async () => {
    const emisorMock = {
      id: 'emisor-1',
      razonSocial: 'Empresa ES',
      pais: 'ES',
      email: 'es@test.com',
      telefono: '+34900000000',
    };

    (prisma.configuracionFiscalEmisor.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(emisorMock);
    (prisma.tasaImpuesto.findMany as any).mockResolvedValue([
      { id: 't1', nombre: 'IVA General', codigo: 'IVA21', porcentaje: 21, tipo: 'iva', pais: 'ES', activo: true },
    ]);

    const config = await getFiscalConfig('tenant-1', { clientePais: 'MX' });

    expect(config.esOperacionExtranjera).toBe(true);
    expect(config.aplicaReverseCharge).toBe(false);
    expect(config.taxRate).toBe(0); // operación extranjera → 0
  });

  it('debe detectar reverse charge entre países UE', async () => {
    const emisorMock = {
      id: 'emisor-1',
      razonSocial: 'Empresa ES',
      pais: 'ES',
      email: 'es@test.com',
      telefono: '+34900000000',
    };

    (prisma.configuracionFiscalEmisor.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(emisorMock);
    (prisma.tasaImpuesto.findMany as any).mockResolvedValue([
      { id: 't1', nombre: 'IVA General', codigo: 'IVA21', porcentaje: 21, tipo: 'iva', pais: 'ES', activo: true },
    ]);

    const config = await getFiscalConfig('tenant-1', { clientePais: 'DE' });

    expect(config.esOperacionExtranjera).toBe(true);
    expect(config.aplicaReverseCharge).toBe(true);
    expect(config.taxRate).toBe(0);
  });

  it('debe devolver configuración con cliente cuando se proporciona contactId', async () => {
    const emisorMock = {
      id: 'emisor-1',
      razonSocial: 'Empresa ES',
      pais: 'ES',
      email: 'es@test.com',
      telefono: '+34900000000',
    };

    (prisma.configuracionFiscalEmisor.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(emisorMock);
    (prisma.tasaImpuesto.findMany as any).mockResolvedValue([
      { id: 't1', nombre: 'IVA General', codigo: 'IVA21', porcentaje: 21, tipo: 'iva', pais: 'ES', activo: true },
    ]);
    (prisma.perfilFiscalCliente.findUnique as any).mockResolvedValue({
      nif: '12345678Z',
      tipo: 'persona_fisica',
      country: 'ES',
      defaultIva: 21,
      defaultIrpf: 15,
      isLocked: false,
      exentoImpuestos: false,
      razonSocial: 'Juan Pérez',
      contact: {
        id: 'contact-1',
        nombre: 'Juan Pérez',
        email: 'juan@test.com',
      },
    });

    const config = await getFiscalConfig('tenant-1', { contactId: 'contact-1' });

    expect(config.cliente).not.toBeNull();
    expect(config.cliente!.nif).toBe('12345678Z');
    expect(config.cliente!.defaultIva).toBe(21);
    expect(config.cliente!.esExento).toBe(false);
  });

  it('debe manejar cliente exento de impuestos', async () => {
    (prisma.configuracionFiscalEmisor.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (prisma.tasaImpuesto.findMany as any).mockResolvedValue([]);
    (prisma.perfilFiscalCliente.findUnique as any).mockResolvedValue({
      nif: 'X1234567L',
      tipo: 'persona_fisica',
      country: 'ES',
      defaultIva: 0,
      defaultIrpf: 0,
      isLocked: true,
      exentoImpuestos: true,
      razonSocial: 'Entidad Exenta',
      contact: {
        id: 'contact-2',
        nombre: 'Entidad Exenta',
        email: 'exenta@test.com',
      },
    });

    const config = await getFiscalConfig('tenant-1', { contactId: 'contact-2' });

    expect(config.esClienteExento).toBe(true);
  });

  it('debe manejar error de Prisma devolviendo config por defecto', async () => {
    (prisma.configuracionFiscalEmisor.findFirst as any).mockRejectedValue(new Error('DB error'));

    const config = await getFiscalConfig('tenant-1');

    // Debe devolver fallback sin lanzar error
    expect(config.taxRate).toBe(21);
    expect(config.fiscalIdLabel).toBe('NIF/CIF');
    expect(config.emisor).toBeNull();
    expect(config.esOperacionExtranjera).toBe(false);
  });

  it('debe usar default de la DB en vez del país cuando no es operación extranjera', async () => {
    (prisma.configuracionFiscalEmisor.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (prisma.tasaImpuesto.findMany as any).mockResolvedValue([]);
    (prisma.perfilFiscalCliente.findUnique as any).mockResolvedValue({
      nif: '12345678Z',
      tipo: 'persona_fisica',
      country: 'ES',
      defaultIva: 10,
      defaultIrpf: 7,
      isLocked: false,
      exentoImpuestos: false,
      razonSocial: 'Cliente Reducido',
      contact: {
        id: 'contact-3',
        nombre: 'Cliente Reducido',
        email: 'reducido@test.com',
      },
    });

    const config = await getFiscalConfig('tenant-1', { contactId: 'contact-3' });

    // Debe usar defaultIva del perfil fiscal (10) en vez del default del país (21)
    expect(config.taxRate).toBe(10);
  });
});
