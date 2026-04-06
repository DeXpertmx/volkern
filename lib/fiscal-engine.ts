// Motor de Cálculo Fiscal Dinámico para Volkern CRM

import { prisma } from '@/lib/db';
import { TASAS_IVA_PREDETERMINADAS } from './fiscal-validation';

export interface FiscalConfig {
  fiscalIdLabel: string;
  taxName: string;
  taxRate: number;
  currencyCode: string;
  currencySymbol: string;
  emisor: any;
  cliente: any;
  esOperacionExtranjera: boolean;
  aplicaReverseCharge: boolean;
  esClienteExento: boolean;
  tasasDisponibles: any[];
}

export const CURRENCY_BY_COUNTRY: Record<string, { code: string; symbol: string; name: string }> = {
  MX: { code: 'MXN', symbol: '$', name: 'Peso Mexicano' },
  ES: { code: 'EUR', symbol: '€', name: 'Euro' },
  US: { code: 'USD', symbol: '$', name: 'Dólar Estadounidense' },
  CL: { code: 'CLP', symbol: '$', name: 'Peso Chileno' },
  AR: { code: 'ARS', symbol: '$', name: 'Peso Argentino' },
  CO: { code: 'COP', symbol: '$', name: 'Peso Colombiano' },
  PE: { code: 'PEN', symbol: 'S/', name: 'Sol Peruano' },
  BR: { code: 'BRL', symbol: 'R$', name: 'Real Brasileño' },
  GB: { code: 'GBP', symbol: '£', name: 'Libra Esterlina' },
  DE: { code: 'EUR', symbol: '€', name: 'Euro' },
  FR: { code: 'EUR', symbol: '€', name: 'Euro' },
  IT: { code: 'EUR', symbol: '€', name: 'Euro' },
  PT: { code: 'EUR', symbol: '€', name: 'Euro' },
};

export const TAX_NAME_BY_COUNTRY: Record<string, string> = {
  MX: 'IVA', ES: 'IVA', US: 'Tax', CL: 'IVA', AR: 'IVA', 
  CO: 'IVA', PE: 'IGV', BR: 'ICMS', GB: 'VAT', DE: 'MwSt', FR: 'TVA', IT: 'IVA', PT: 'IVA',
};

export const FISCAL_ID_LABEL_BY_COUNTRY: Record<string, string> = {
  MX: 'RFC', ES: 'NIF/CIF', US: 'EIN', CL: 'RUT', AR: 'CUIT',
  CO: 'NIT', PE: 'RUC', BR: 'CNPJ', GB: 'VAT Number', DE: 'USt-IdNr', FR: 'SIREN', IT: 'P.IVA', PT: 'NIF',
};

const EU_COUNTRIES = ['ES', 'DE', 'FR', 'IT', 'PT', 'NL', 'BE', 'AT', 'IE', 'FI', 'SE', 'DK', 'PL', 'CZ', 'HU', 'RO', 'BG', 'GR', 'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'CY', 'MT', 'LU'];

export async function getFiscalConfig(
  tenantId: string,
  options?: { leadId?: string; contactId?: string; emisorId?: string; clientePais?: string; }
): Promise<FiscalConfig> {
  try {
    // Buscar emisor: primero por ID específico, luego principal, luego cualquiera
    let emisor = null;
    if (options?.emisorId) {
      emisor = await prisma.configuracionFiscalEmisor.findFirst({
        where: { id: options.emisorId, tenantId }
      });
    }
    if (!emisor) {
      emisor = await prisma.configuracionFiscalEmisor.findFirst({
        where: { tenantId, esPrincipal: true }
      });
    }
    if (!emisor) {
      emisor = await prisma.configuracionFiscalEmisor.findFirst({
        where: { tenantId, activo: true },
        orderBy: { fechaCreacion: 'asc' }
      });
    }

    const tasas = await prisma.tasaImpuesto.findMany({
      where: { tenantId, activo: true },
      orderBy: [{ pais: 'asc' }, { porcentaje: 'desc' }]
    });

    // Determinar país del emisor - si no hay emisor, usar el país de las tasas activas
    let paisEmisor = emisor?.pais;
    if (!paisEmisor && tasas.length > 0) {
      // Usar el país de la primera tasa activa como referencia
      paisEmisor = tasas[0].pais;
    }
    paisEmisor = paisEmisor || 'ES'; // Default a España si no hay configuración
    
    const paisCliente = options?.clientePais || paisEmisor;
    const esOperacionExtranjera = paisEmisor !== paisCliente;
    const aplicaReverseCharge = esOperacionExtranjera && EU_COUNTRIES.includes(paisEmisor) && EU_COUNTRIES.includes(paisCliente);
    
    // Buscar tasa de IVA: primero la configurada, luego la predeterminada del país
    const tasaPais = tasas.find(t => t.pais === paisEmisor && t.tipo?.toLowerCase() === 'iva');
    let taxRate = tasaPais?.porcentaje ?? TASAS_IVA_PREDETERMINADAS[paisEmisor]?.general ?? 21;
    if (esOperacionExtranjera || aplicaReverseCharge) taxRate = 0;

    const currency = CURRENCY_BY_COUNTRY[paisEmisor] || { code: 'USD', symbol: '$', name: 'Dólar' };
    
    return {
      fiscalIdLabel: FISCAL_ID_LABEL_BY_COUNTRY[paisEmisor] || 'Tax ID',
      taxName: TAX_NAME_BY_COUNTRY[paisEmisor] || 'Tax',
      taxRate,
      currencyCode: emisor?.monedaPredeterminada || currency.code,
      currencySymbol: currency.symbol,
      emisor: emisor ? {
        id: emisor.id,
        razonSocial: emisor.razonSocial,
        nombreComercial: emisor.nombreComercial,
        idFiscal: (emisor as any).idFiscal || '',
        pais: emisor.pais,
        email: emisor.email,
        telefono: emisor.telefono,
      } : null,
      cliente: null,
      esOperacionExtranjera,
      aplicaReverseCharge,
      esClienteExento: false,
      tasasDisponibles: tasas.map(t => ({
        id: t.id, nombre: t.nombre, codigo: t.codigo, porcentaje: t.porcentaje, tipo: t.tipo,
      })),
    };
  } catch (error) {
    console.error('Error getting fiscal config:', error);
    return {
      fiscalIdLabel: 'NIF/CIF', taxName: 'IVA', taxRate: 21, currencyCode: 'EUR', currencySymbol: '€',
      emisor: null, cliente: null, esOperacionExtranjera: false, aplicaReverseCharge: false,
      esClienteExento: false, tasasDisponibles: [],
    };
  }
}

export function formatCurrency(amount: number, symbol: string = '$', decimals: number = 2): string {
  return `${symbol}${amount.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function getFiscalConfigForWebhook(config: FiscalConfig) {
  return {
    label: config.fiscalIdLabel,
    tax_name: config.taxName,
    rate: config.taxRate,
    currency_code: config.currencyCode,
    currency_symbol: config.currencySymbol,
    emisor_id: config.emisor?.idFiscal || null,
    es_operacion_extranjera: config.esOperacionExtranjera,
    aplica_reverse_charge: config.aplicaReverseCharge,
  };
}
