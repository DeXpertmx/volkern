/**
 * Accounting Skills — informes contables para el chatbot (web, WhatsApp y Telegram)
 *
 * Décimo noveno entrenamiento: permiten consultar los reportes contables desde
 * Telegram sin depender del LLM (misma garantía que el resto de entrenamientos).
 *
 * - informeBalance → getBalanceSheet (activo/pasivo/patrimonio neto)
 * - informeCuentaResultados → getPyG (ingresos, gastos, resultado del ejercicio)
 * - informeBalanceComprobacion → getTrialBalance (sumas y saldos)
 */

import { getBalanceSheet } from '@/lib/accounting/reports/balance-sheet';
import { getPyG } from '@/lib/accounting/reports/pyg';
import { getTrialBalance } from '@/lib/accounting/reports/trial-balance';

export async function informeBalance(input: { tenantId: string }) {
  const report = await getBalanceSheet(input.tenantId);
  return { success: true, tipo: 'balance', report };
}

export async function informeCuentaResultados(input: { tenantId: string }) {
  const report = await getPyG(input.tenantId);
  return { success: true, tipo: 'pyg', report };
}

export async function informeBalanceComprobacion(input: { tenantId: string }) {
  const report = await getTrialBalance(input.tenantId);
  return { success: true, tipo: 'comprobacion', report };
}
