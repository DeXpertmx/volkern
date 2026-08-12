/**
 * Tax Skills — consultas fiscales para el chatbot (web, WhatsApp y Telegram)
 *
 * Décimo octavo entrenamiento: permiten controlar el módulo de impuestos desde
 * Telegram sin depender del LLM (misma garantía que crear_lead / agendar_cita).
 *
 * 1. consultaImpuestosPendientes → FiscalCalendarService.getCalendarSummary
 *    (declaraciones que vencen pronto o ya vencidas, con importe estimado).
 * 2. resumenModeloImpuesto → TaxService según el modelo (303, 111, 115, 130,
 *    180, 390, 347, 349) con trimestre/año configurables.
 */

import { FiscalCalendarService } from '@/lib/accounting/fiscal-calendar-service';
import { TaxService } from '@/lib/accounting/tax-service';

// Nombre legible de cada modelo para las respuestas
const MODELO_LABELS: Record<string, string> = {
  '303': 'IVA Trimestral',
  '111': 'Retenciones IRPF',
  '115': 'Retenciones Arrendamientos',
  '130': 'IRPF Estimación Directa',
  '349': 'IVA Intracomunitario',
  '180': 'Resumen Retenciones Arrendamientos',
  '347': 'Operaciones con Terceros',
  '390': 'IVA Anual',
};

function normalizeModelo(modelo?: string): string {
  const model = String(modelo || '').replace(/[^\d]/g, '');
  return MODELO_LABELS[model] ? model : '';
}

export interface ResumenModeloImpuestoInput {
  tenantId: string;
  modelo?: string;
  trimestre?: number | string;
  anio?: number | string;
  año?: number | string;
}

/**
 * Declaraciones fiscales pendientes o próximas a vencer (calendario fiscal).
 */
export async function consultaImpuestosPendientes(input: { tenantId: string }) {
  const { tenantId } = input;
  const summary = await FiscalCalendarService.getCalendarSummary(tenantId);
  return {
    success: true,
    upcoming: summary.upcomingDeadlines,
    overdue: summary.overdueDeadlines,
    nextDeadline: summary.nextDeadline,
    totalPending: summary.totalPending,
    totalOverdue: summary.totalOverdue,
  };
}

/**
 * Resumen de un modelo fiscal concreto del periodo.
 * Soporta: 303 (IVA), 111 (retenciones IRPF), 115 (arrendamientos),
 * 130 (IRPF estimación directa), 349 (intracomunitario), 180 (resumen anual
 * arrendamientos), 347 (operaciones terceros) y 390 (IVA anual).
 */
export async function resumenModeloImpuesto(input: ResumenModeloImpuestoInput) {
  const { tenantId, modelo } = input;
  if (!tenantId) throw new Error('tenantId es requerido');

  // Normalizar: "modelo 303", "303", "el 303" → "303"
  const model = normalizeModelo(modelo);
  if (!model) {
    throw new Error('Indica qué impuesto consultar: 303 (IVA), 111 (retenciones IRPF), 115 (arrendamientos), 130 (IRPF), 180, 390, 347 o 349.');
  }

  const year = Number(input.anio ?? input.año) || new Date().getFullYear();
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const quarter = Number(input.trimestre) || currentQuarter;

  switch (model) {
    case '303': {
      const report = await TaxService.getQuarterlyVatReport(tenantId, year, quarter);
      return { success: true, modelo: '303', nombre: 'IVA Trimestral', trimestre: quarter, año: year, report };
    }
    case '111': {
      const report = await TaxService.getQuarterlyIrpfReport(tenantId, year, quarter);
      return { success: true, modelo: '111', nombre: 'Retenciones IRPF', trimestre: quarter, año: year, report };
    }
    case '115': {
      const report = await TaxService.getQuarterlyModelo115Report(tenantId, year, quarter);
      return { success: true, modelo: '115', nombre: 'Retenciones Arrendamientos', trimestre: quarter, año: year, report };
    }
    case '130': {
      const report = await TaxService.getQuarterlyModelo130Report(tenantId, year, quarter);
      return { success: true, modelo: '130', nombre: 'IRPF Estimación Directa', trimestre: quarter, año: year, report };
    }
    case '349': {
      const report = await TaxService.getQuarterlyModelo349Report(tenantId, year, quarter);
      return { success: true, modelo: '349', nombre: 'IVA Intracomunitario', trimestre: quarter, año: year, report };
    }
    case '180': {
      const report = await TaxService.getAnnualModelo180Report(tenantId, year);
      return { success: true, modelo: '180', nombre: 'Resumen Retenciones Arrendamientos', año: year, report };
    }
    case '347': {
      const report = await TaxService.getAnnualModelo347Report(tenantId, year);
      return { success: true, modelo: '347', nombre: 'Operaciones con Terceros', año: year, report };
    }
    case '390': {
      const report = await TaxService.getAnnualModelo390Report(tenantId, year);
      return { success: true, modelo: '390', nombre: 'IVA Anual', año: year, report };
    }
    default:
      throw new Error('Modelo no reconocido. Usa: 303 (IVA), 111 (retenciones IRPF), 115 (arrendamientos), 130 (IRPF), 180, 390, 347 o 349.');
  }
}

/**
 * Marca una declaración fiscal como presentada (cierra los TaxRecord del periodo).
 * Complementa a resumenModeloImpuesto: lectura + escritura del mismo módulo.
 */
export async function marcarImpuestoPresentado(input: ResumenModeloImpuestoInput & { userId?: string }) {
  const { tenantId, userId } = input;
  if (!tenantId) throw new Error('tenantId es requerido');

  const model = normalizeModelo(input.modelo);
  if (!model) {
    throw new Error('Indica qué modelo marcar como presentado: 303 (IVA), 111 (retenciones IRPF), 115 (arrendamientos), 130 (IRPF), 180, 390, 347 o 349.');
  }

  const year = Number(input.anio ?? input.año) || new Date().getFullYear();
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const quarter = Number(input.trimestre) || currentQuarter;

  // fileVatReturn/fileIrpfReturn devuelven { count } (updateMany); los modelos
  // con userId crean un auditLog y devuelven el registro (1 presentación).
  let result: { count?: number } | { id: string };
  switch (model) {
    case '303': result = await TaxService.fileVatReturn(tenantId, year, quarter); break;
    case '111': result = await TaxService.fileIrpfReturn(tenantId, year, quarter); break;
    case '115': result = await TaxService.fileModelo115Return(tenantId, year, quarter, userId); break;
    case '130': result = await TaxService.fileModelo130Return(tenantId, year, quarter, userId); break;
    case '349': result = await TaxService.fileModelo349Return(tenantId, year, quarter, userId); break;
    case '180': result = await TaxService.fileModelo180Return(tenantId, year, userId); break;
    case '347': result = await TaxService.fileModelo347Return(tenantId, year, userId); break;
    case '390': result = await TaxService.fileModelo390Return(tenantId, year, userId); break;
    default: throw new Error('Modelo no reconocido.');
  }

  const actualizados =
    result && typeof result === 'object' && 'count' in result
      ? Number((result as { count?: number }).count ?? 0)
      : 1;

  return {
    success: true,
    modelo: model,
    nombre: MODELO_LABELS[model],
    trimestre: ['180', '347', '390'].includes(model) ? undefined : quarter,
    año: year,
    actualizados,
  };
}
