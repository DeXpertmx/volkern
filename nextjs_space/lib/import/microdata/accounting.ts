import { SourceTemplate } from '../import-types'

export const microdataAccountingTemplate: SourceTemplate = {
  name: 'Microdata Contabilidad (Asientos)',
  source: 'microdata',
  type: 'accounting',
  columns: [
    { key: 'fecha', label: 'Fecha', required: true, aliases: ['date', 'fecha_contable', 'fecemis', 'fecha_emision'] },
    { key: 'cuenta', label: 'Cuenta', required: true, aliases: ['codigo_cuenta', 'account', 'ccontable', 'cta_contable', 'cuenta_contable'] },
    { key: 'concepto', label: 'Concepto', required: true, aliases: ['concept', 'description', 'descripcion', 'texto'] },
    { key: 'debe', label: 'Debe', required: false, aliases: ['debit', 'cargo', 'importe_debe', 'debe_euros'] },
    { key: 'haber', label: 'Haber', required: false, aliases: ['credit', 'abono', 'importe_haber', 'haber_euros'] },
    { key: 'importe', label: 'Importe', required: false, aliases: ['amount', 'importe_total', 'total_euros'] },
    { key: 'nombre_cuenta', label: 'Nombre Cuenta', required: false, aliases: ['nombre', 'name', 'desc_cuenta'] },
    { key: 'documento', label: 'Documento', required: false, aliases: ['doc', 'reference', 'num_asiento', 'asiento'] },
  ],
  detect: (headers: string[]) => {
    const norm = headers.map(h => h.toLowerCase())
    return norm.some(h => h.includes('cuenta') || h.includes('ccontable')) &&
           (norm.some(h => h.includes('debe') || h.includes('haber')))
  },
}

export const microdataBalancesTemplate: SourceTemplate = {
  name: 'Microdata Balances Iniciales',
  source: 'microdata',
  type: 'accounting',
  columns: [
    { key: 'cuenta', label: 'Cuenta', required: true, aliases: ['codigo_cuenta', 'account', 'ccontable', 'cta_contable'] },
    { key: 'nombre_cuenta', label: 'Nombre Cuenta', required: false, aliases: ['nombre', 'name', 'desc_cuenta'] },
    { key: 'saldo', label: 'Saldo', required: true, aliases: ['saldo_inicial', 'balance', 'saldo_periodo'] },
    { key: 'tipo', label: 'Tipo', required: false, aliases: ['deudor_acreedor', 'signo', 'naturaleza'] },
  ],
  detect: (headers: string[]) => {
    const norm = headers.map(h => h.toLowerCase())
    return norm.some(h => h.includes('cuenta')) &&
           norm.some(h => h.includes('saldo'))
  },
}
