'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export interface FiscalConfig {
  fiscalIdLabel: string;
  taxName: string;
  taxRate: number;
  currencyCode: string;
  currencySymbol: string;
  emisor: {
    id: string;
    razonSocial: string;
    nombreComercial: string | null;
    idFiscal: string;
    tipoIdFiscal: string;
    regimenFiscal: string | null;
    pais: string;
    direccion: string | null;
    codigoPostal: string | null;
    ciudad: string | null;
    estado: string | null;
    telefono: string | null;
    email: string | null;
    logo: string | null;
  } | null;
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
  tasasDisponibles: {
    id: string;
    nombre: string;
    codigo: string;
    porcentaje: number;
    tipo: string;
    esRetencion: boolean;
  }[];
}

export interface LineItem {
  concepto: string;
  cantidad: number;
  precioUnitario: number;
  descuento?: number;
  tasaImpuesto?: number;
  tasaRetencion?: number;
}

export interface CalculatedTotals {
  subtotal: number;
  descuentoTotal: number;
  baseImponible: number;
  impuesto: number;
  retencion: number;
  total: number;
  items: {
    concepto: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    subtotalLinea: number;
    impuestoLinea: number;
    retencionLinea: number;
    totalLinea: number;
  }[];
}

interface UseFiscalConfigOptions {
  leadId?: string;
  contactId?: string;
  emisorId?: string;
  clientePais?: string;
}

const DEFAULT_CONFIG: FiscalConfig = {
  fiscalIdLabel: 'NIF/CIF',
  taxName: 'IVA',
  taxRate: 21,
  currencyCode: 'EUR',
  currencySymbol: '€',
  emisor: null,
  cliente: null,
  esOperacionExtranjera: false,
  aplicaReverseCharge: false,
  esClienteExento: false,
  tasasDisponibles: [],
};

export function useFiscalConfig(options?: UseFiscalConfigOptions) {
  const [config, setConfig] = useState<FiscalConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (options?.leadId) params.set('leadId', options.leadId);
      if (options?.contactId) params.set('contactId', options.contactId);
      if (options?.emisorId) params.set('emisorId', options.emisorId);
      if (options?.clientePais) params.set('clientePais', options.clientePais);

      const res = await fetch(`/api/fiscal/config?${params.toString()}`);
      
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      } else {
        // Usar configuración por defecto si falla
        setConfig(DEFAULT_CONFIG);
      }
    } catch (err) {
      console.error('Error fetching fiscal config:', err);
      setError('Error al cargar configuración fiscal');
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  }, [options?.leadId, options?.contactId, options?.emisorId, options?.clientePais]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Función para calcular totales localmente
  const calculateTotals = useCallback((items: LineItem[], descuentoGlobal: number = 0): CalculatedTotals => {
    const defaultTaxRate = config.taxRate;
    let subtotal = 0;
    let descuentoTotal = 0;
    let impuestoTotal = 0;
    let retencionTotal = 0;

    const calculatedItems = items.map(item => {
      const subtotalLinea = item.cantidad * item.precioUnitario;
      const descuentoLinea = subtotalLinea * ((item.descuento || 0) / 100);
      const baseLinea = subtotalLinea - descuentoLinea;
      
      const tasaImp = item.tasaImpuesto !== undefined ? item.tasaImpuesto : defaultTaxRate;
      const tasaRet = item.tasaRetencion || 0;
      
      const impuestoLinea = Math.round(baseLinea * (tasaImp / 100) * 100) / 100;
      const retencionLinea = Math.round(baseLinea * (tasaRet / 100) * 100) / 100;
      const totalLinea = baseLinea + impuestoLinea - retencionLinea;
      
      subtotal += subtotalLinea;
      descuentoTotal += descuentoLinea;
      impuestoTotal += impuestoLinea;
      retencionTotal += retencionLinea;
      
      return {
        concepto: item.concepto,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        descuento: Math.round(descuentoLinea * 100) / 100,
        subtotalLinea: Math.round(baseLinea * 100) / 100,
        impuestoLinea,
        retencionLinea,
        totalLinea: Math.round(totalLinea * 100) / 100,
      };
    });

    const descuentoGlobalAmount = subtotal * (descuentoGlobal / 100);
    descuentoTotal += descuentoGlobalAmount;
    const baseImponible = subtotal - descuentoTotal;
    const total = baseImponible + impuestoTotal - retencionTotal;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      descuentoTotal: Math.round(descuentoTotal * 100) / 100,
      baseImponible: Math.round(baseImponible * 100) / 100,
      impuesto: Math.round(impuestoTotal * 100) / 100,
      retencion: Math.round(retencionTotal * 100) / 100,
      total: Math.round(total * 100) / 100,
      items: calculatedItems,
    };
  }, [config.taxRate]);

  // Función para formatear moneda
  const formatCurrency = useCallback((amount: number): string => {
    return `${config.currencySymbol}${amount.toLocaleString('es-ES', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  }, [config.currencySymbol]);

  return {
    config,
    loading,
    error,
    refetch: fetchConfig,
    calculateTotals,
    formatCurrency,
  };
}

export default useFiscalConfig;
