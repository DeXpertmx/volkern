import { describe, it, expect } from 'vitest'
import {
  resolvePlaceholders,
  hasPlaceholders,
  formatCurrency,
  formatFecha,
} from '@/lib/contratos/placeholders'

const contrato = {
  clienteNombre: 'Juan Antonio Moreno',
  clienteEmpresa: 'ACME S.L.',
  clienteEmail: 'juan@acme.com',
  clienteTelefono: '+34 600 000 000',
  clienteRfc: 'B12345678',
  clienteDireccion: 'Calle Mayor 1, Madrid',
  numero: 'CONT-2026-0001',
  titulo: 'Contrato de servicios',
  fechaInicio: new Date('2026-09-01'),
  fechaFin: new Date('2027-08-31'),
  moneda: 'EUR',
  subtotal: 1000,
  descuentoMonto: 100,
  impuestos: 210,
  total: 1110,
}

const tenant = {
  nombre: 'Volkern',
  razonSocial: 'Volkern Consulting S.L.',
  nifCif: 'A12345678',
  direccionFiscal: 'Av. Principal 100, Ciudad',
}

describe('resolvePlaceholders', () => {
  it('resuelve placeholders del cliente', () => {
    const out = resolvePlaceholders(
      '{{cliente.nombre}} · {{cliente.empresa}} · {{cliente.email}} · {{cliente.telefono}}',
      contrato,
      tenant
    )
    expect(out).toBe('Juan Antonio Moreno · ACME S.L. · juan@acme.com · +34 600 000 000')
  })

  it('resuelve placeholders de la empresa (tenant)', () => {
    const out = resolvePlaceholders('{{empresa.nombre}} · {{empresa.rfc}} · {{empresa.direccion}}', contrato, tenant)
    expect(out).toBe('Volkern Consulting S.L. · A12345678 · Av. Principal 100, Ciudad')
  })

  it('resuelve placeholders del contrato y fechas', () => {
    const out = resolvePlaceholders(
      '{{contrato.numero}} · {{contrato.titulo}} · {{fecha.inicio}} al {{fecha.fin}}',
      contrato,
      tenant
    )
    expect(out).toContain('CONT-2026-0001')
    expect(out).toContain('Contrato de servicios')
    expect(out).toContain('1 de septiembre de 2026')
    expect(out).toContain('31 de agosto de 2027')
  })

  it('resuelve totales con formato de moneda', () => {
    const out = resolvePlaceholders(
      'Subtotal {{totales.subtotal}} · Desc {{totales.descuento}} · IVA {{totales.impuestos}} · Total {{totales.total}}',
      contrato,
      tenant
    )
    expect(out).toBe('Subtotal €1,000.00 · Desc €100.00 · IVA €210.00 · Total €1,110.00')
  })

  it('soporta alias legacy {{lead.*}} para compatibilidad con templates GrapesJS', () => {
    const out = resolvePlaceholders('{{lead.nombre}} / {{lead.empresa}} / {{lead.email}}', contrato, tenant)
    expect(out).toBe('Juan Antonio Moreno / ACME S.L. / juan@acme.com')
  })

  it('deja vacíos los placeholders sin datos', () => {
    const out = resolvePlaceholders('Cliente: {{cliente.nombre}}', {}, {})
    expect(out).toBe('Cliente: ')
  })

  it('deja intactos los tokens desconocidos', () => {
    const out = resolvePlaceholders('{{token.desconocido}} y {{cliente.nombre}}', contrato, tenant)
    expect(out).toBe('{{token.desconocido}} y Juan Antonio Moreno')
  })

  it('maneja texto null/undefined', () => {
    expect(resolvePlaceholders(null, contrato, tenant)).toBe('')
    expect(resolvePlaceholders(undefined, contrato, tenant)).toBe('')
    expect(resolvePlaceholders('', contrato, tenant)).toBe('')
  })
})

describe('hasPlaceholders', () => {
  it('detecta placeholders conocidos o no', () => {
    expect(hasPlaceholders('Hola {{cliente.nombre}}')).toBe(true)
    expect(hasPlaceholders('Hola {{lo.que.sea}}')).toBe(true)
    expect(hasPlaceholders('Texto sin placeholders')).toBe(false)
    expect(hasPlaceholders(null)).toBe(false)
  })
})

describe('helpers de formato', () => {
  it('formatea moneda con símbolo', () => {
    expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50')
    expect(formatCurrency(50, 'MXN')).toBe('$50.00')
    expect(formatCurrency(7, null)).toBe('$7.00')
  })

  it('formatea fechas y tolera inválidas', () => {
    expect(formatFecha(new Date('2026-09-01'))).toBe('1 de septiembre de 2026')
    expect(formatFecha(null)).toBe('')
    expect(formatFecha('no-una-fecha')).toBe('')
  })
})
