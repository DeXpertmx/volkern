import { SourceTemplate } from '../import-types'

export const sageAccountingTemplate: SourceTemplate = {
  name: 'Sage Contabilidad (Asientos)',
  source: 'sage',
  type: 'accounting',
  columns: [
    { key: 'fecha', label: 'Fecha', required: true, aliases: ['date', 'fecha_contable', 'fechacontable', 'fecha_op'] },
    { key: 'cuenta', label: 'Cuenta', required: true, aliases: ['codigo_cuenta', 'account', 'code', 'cta', 'numero_cuenta'] },
    { key: 'concepto', label: 'Concepto', required: true, aliases: ['concept', 'description', 'descripcion', 'texto'] },
    { key: 'debe', label: 'Debe', required: false, aliases: ['debit', 'cargo', 'debe_euros', 'importe_debe'] },
    { key: 'haber', label: 'Haber', required: false, aliases: ['credit', 'abono', 'haber_euros', 'importe_haber'] },
    { key: 'importe', label: 'Importe', required: false, aliases: ['amount', 'importe_total', 'total', 'euros'] },
    { key: 'nombre_cuenta', label: 'Nombre Cuenta', required: false, aliases: ['nombre', 'name', 'cuenta_nombre', 'desc_cuenta'] },
    { key: 'documento', label: 'Documento', required: false, aliases: ['doc', 'reference', 'numero_doc', 'num_documento'] },
  ],
  detect: (headers: string[]) => {
    const norm = headers.map(h => h.toLowerCase())
    return (norm.some(h => h.includes('cuenta') || h.includes('cta'))) &&
           (norm.some(h => h.includes('debe') || h.includes('cargo'))) &&
           (norm.some(h => h.includes('haber') || h.includes('abono')))
  },
}

export const sageBalancesTemplate: SourceTemplate = {
  name: 'Sage Balances Iniciales',
  source: 'sage',
  type: 'accounting',
  columns: [
    { key: 'cuenta', label: 'Cuenta', required: true, aliases: ['codigo_cuenta', 'account', 'code', 'cta', 'numero_cuenta'] },
    { key: 'nombre_cuenta', label: 'Nombre Cuenta', required: false, aliases: ['nombre', 'name', 'cuenta_nombre', 'desc_cuenta'] },
    { key: 'saldo', label: 'Saldo', required: true, aliases: ['saldo_inicial', 'balance', 'debe_haber', 'importe_saldo'] },
    { key: 'tipo', label: 'Tipo', required: false, aliases: ['deudor_acreedor', 'd_a', 'signo', 'naturaleza'] },
  ],
  detect: (headers: string[]) => {
    const norm = headers.map(h => h.toLowerCase())
    return norm.some(h => h.includes('cuenta') || h.includes('cta')) &&
           norm.some(h => h.includes('saldo') || h.includes('balance'))
  },
}
