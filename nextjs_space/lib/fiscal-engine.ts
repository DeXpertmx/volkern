// Motor de Cálculo Fiscal Dinámico para Volkern CRM

import { prisma } from '@/lib/db';
import {
  infoMoneda,
  monedaDePais,
  primeraMoneda,
  simboloMoneda,
  MONEDA_POR_PAIS,
  MONEDA_MINIMA_ESQUEMA,
} from './moneda';
import { TASAS_IVA_PREDETERMINADAS } from './fiscal-validation';

export interface FiscalConfig {
  fiscalIdLabel: string;
  taxName: string;
  taxRate: number;
  currencyCode: string;
  currencySymbol: string;
  emisor: any;
  cliente: {
    id: string;
    nombre: string;
    email: string;
    nif: string | null;
    tipo: string | null;
    pais: string;
    defaultIva: number;
    defaultIrpf: number;
    isLocked: boolean;
    esExento: boolean;
  } | null;
  esOperacionExtranjera: boolean;
  aplicaReverseCharge: boolean;
  esClienteExento: boolean;
  tasasDisponibles: any[];
}

/**
 * Divisa de cada país, con la forma `{ code, symbol, name }` que consumen la API
 * fiscal y los formularios.
 *
 * La tabla país → divisa la declara `lib/moneda.ts`, que es el único módulo que
 * conoce nombres y símbolos; aquí solo se le da la forma que esperaban los
 * consumidores. Antes esta constante repetía los trece nombres y símbolos, y eran
 * los mismos trece que repetían la validación fiscal y la pestaña de emisores.
 */
export const CURRENCY_BY_COUNTRY: Record<string, { code: string; symbol: string; name: string }> =
  Object.fromEntries(
    Object.entries(MONEDA_POR_PAIS).flatMap(([pais, codigo]) => {
      const info = infoMoneda(codigo);
      return info ? [[pais, { code: info.codigo, symbol: info.simbolo, name: info.nombre }]] : [];
    })
  );

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
    
    // Buscar PerfilFiscalCliente para obtener defaults
    let perfilFiscal = null;
    let clienteData = null;

    if (options?.contactId) {
      perfilFiscal = await prisma.perfilFiscalCliente.findUnique({
        where: { contactId: options.contactId },
        include: { contact: true }
      });
      if (perfilFiscal?.contact) {
        clienteData = {
          id: perfilFiscal.contact.id,
          nombre: perfilFiscal.contact.nombre,
          email: perfilFiscal.contact.email,
        };
      }
    } else if (options?.leadId) {
      perfilFiscal = await prisma.perfilFiscalCliente.findUnique({
        where: { leadId: options.leadId },
        include: { lead: true }
      });
      if (perfilFiscal?.lead) {
        clienteData = {
          id: perfilFiscal.lead.id,
          nombre: perfilFiscal.lead.nombre,
          email: perfilFiscal.lead.email,
        };
      }
    }

    // Buscar tasa de IVA: primero la configurada en el perfil, luego la predeterminada del país
    const tasaPais = tasas.find(t => t.pais === paisEmisor && t.tipo?.toLowerCase() === 'iva');
    let taxRate = tasaPais?.porcentaje ?? TASAS_IVA_PREDETERMINADAS[paisEmisor]?.general ?? 21;
    
    // PRIORIDAD: Si el cliente tiene un IVA predeterminado, lo usamos (siempre que no sea extranjero exento)
    if (perfilFiscal && !esOperacionExtranjera) {
      taxRate = Number(perfilFiscal.defaultIva);
    }

    if (esOperacionExtranjera || aplicaReverseCharge) taxRate = 0;

    // Sin país reconocido no se inventa una divisa: manda la del emisor y, si
    // tampoco la hay, el mínimo que el esquema acepta.
    const infoDelPais = monedaDePais(paisEmisor);

    return {
      fiscalIdLabel: FISCAL_ID_LABEL_BY_COUNTRY[paisEmisor] || 'Tax ID',
      taxName: TAX_NAME_BY_COUNTRY[paisEmisor] || 'Tax',
      taxRate,
      currencyCode:
        primeraMoneda(emisor?.monedaPredeterminada, infoDelPais?.codigo) || MONEDA_MINIMA_ESQUEMA,
      currencySymbol: simboloMoneda(emisor?.monedaPredeterminada || infoDelPais?.codigo),
      emisor: emisor ? {
        id: emisor.id,
        razonSocial: emisor.razonSocial,
        nombreComercial: emisor.nombreComercial,
        idFiscal: (emisor as any).idFiscal || (emisor as any).nif || '',
        pais: emisor.pais,
        email: emisor.email,
        telefono: emisor.telefono,
      } : null,
      cliente: perfilFiscal ? {
        id: clienteData?.id || '',
        nombre: clienteData?.nombre || perfilFiscal.razonSocial || '',
        email: clienteData?.email || '',
        nif: perfilFiscal.nif,
        tipo: perfilFiscal.tipo,
        pais: perfilFiscal.country || 'ES',
        defaultIva: Number(perfilFiscal.defaultIva),
        defaultIrpf: Number(perfilFiscal.defaultIrpf),
        isLocked: perfilFiscal.isLocked,
        esExento: perfilFiscal.exentoImpuestos,
      } : null,
      esOperacionExtranjera,
      aplicaReverseCharge,
      esClienteExento: perfilFiscal?.exentoImpuestos || false,
      tasasDisponibles: tasas.map(t => ({
        id: t.id, nombre: t.nombre, codigo: t.codigo, porcentaje: t.porcentaje, tipo: t.tipo,
      })),
    };
  } catch (error) {
    console.error('Error getting fiscal config:', error);
    return {
      fiscalIdLabel: 'NIF/CIF', taxName: 'IVA', taxRate: 21,
      currencyCode: MONEDA_MINIMA_ESQUEMA,
      currencySymbol: simboloMoneda(MONEDA_MINIMA_ESQUEMA),
      emisor: null, cliente: null, esOperacionExtranjera: false, aplicaReverseCharge: false,
      esClienteExento: false, tasasDisponibles: [],
    };
  }
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
