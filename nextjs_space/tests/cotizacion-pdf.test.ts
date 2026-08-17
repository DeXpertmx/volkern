import { describe, expect, it } from 'vitest'
import { generateCotizacionHTML } from '@/lib/cotizaciones/cotizacion-pdf'

describe('PDF de cotizaciones', () => {
  it('muestra descuentos fijos por línea y evita arrastrar un total negativo antiguo', () => {
    const html = generateCotizacionHTML(
      {
        numero: 'COT-2026-0001',
        estado: 'borrador',
        moneda: 'EUR',
        fechaCreacion: '2026-08-15T10:00:00Z',
        fechaVencimiento: '2026-09-14T10:00:00Z',
        clienteNombre: 'José Acevedo',
        clienteEmail: 'jose@example.com',
        descuentoPorcentaje: 0,
        descuentoMonto: 0,
        impuestos: 0,
        total: 388,
        items: [
          {
            concepto: 'Plan Professional',
            cantidad: 12,
            precioUnitario: 199,
            descuento: 0,
            subtotal: 2388,
            porcentajeImpuesto: 0,
            montoImpuesto: 0,
            total: 2388,
          },
          {
            concepto: 'Implementación',
            cantidad: 1,
            precioUnitario: 500,
            descuento: 500,
            subtotal: -2000,
            porcentajeImpuesto: 0,
            montoImpuesto: 0,
            total: -2000,
          },
        ],
      },
      { nombre: 'Volkern Insurance' },
    )

    expect(html).toContain('Descuentos por línea')
    expect(html).toContain('-€500.00')
    expect(html).toContain('Implementación')
    expect(html).toContain('Subtotal bruto')
    expect(html).toContain('Base imponible')
    expect(html).not.toContain('-€2,000.00')
  })

  it('muestra las cláusulas con placeholders resueltos', () => {
    const html = generateCotizacionHTML(
      {
        numero: 'COT-2026-0003',
        estado: 'borrador',
        moneda: 'EUR',
        fechaCreacion: '2026-08-15T10:00:00Z',
        fechaVencimiento: '2026-09-14T10:00:00Z',
        clienteNombre: 'José Acevedo',
        clienteEmpresa: 'Acevedo SL',
        clienteEmail: 'jose@example.com',
        clienteTelefono: '+34600000000',
        subtotal: 100,
        descuentoMonto: 10,
        impuestos: 18.9,
        total: 108.9,
        clausulas:
          'El cliente {{cliente.nombre}} ({{cliente.empresa}}) acepta el servicio. Importe: {{totales.total}}. Emisor: {{empresa.nombre}}.',
        items: [],
      },
      { nombre: 'Volkern Insurance', razonSocial: 'Volkern Insurance SL', nifCif: 'B12345678', direccionFiscal: 'Calle 1' },
    )

    expect(html).toContain('Cláusulas')
    expect(html).toContain('José Acevedo')
    expect(html).toContain('Acevedo SL')
    expect(html).toContain('€108.90')
    expect(html).toContain('Volkern Insurance SL')
    expect(html).not.toContain('{{cliente.nombre}}')
  })

  it('no muestra la sección de cláusulas si la cotización no tiene clausulado', () => {
    const html = generateCotizacionHTML(
      {
        numero: 'COT-2026-0004',
        estado: 'borrador',
        moneda: 'EUR',
        fechaCreacion: '2026-08-15T10:00:00Z',
        clausulas: null,
        items: [],
      },
      { nombre: 'Volkern Insurance' },
    )

    expect(html).not.toContain('Cláusulas')
  })

  it('muestra el descuento global, la tasa de IVA por línea y el total recalculado', () => {
    const html = generateCotizacionHTML(
      {
        numero: 'COT-2026-0002',
        estado: 'borrador',
        moneda: 'EUR',
        fechaCreacion: '2026-08-15T10:00:00Z',
        fechaVencimiento: '2026-09-14T10:00:00Z',
        descuentoPorcentaje: 10,
        descuentoMonto: 10,
        items: [
          {
            concepto: 'Servicio general',
            cantidad: 1,
            precioUnitario: 100,
            descuento: 0,
            subtotal: 100,
            porcentajeImpuesto: 21,
            montoImpuesto: 21,
            total: 121,
          },
        ],
      },
      { nombre: 'Empresa de prueba' },
    )

    expect(html).toContain('Descuento global (10%)')
    expect(html).toContain('21%')
    expect(html).toContain('€10.00')
    expect(html).toContain('€90.00')
    expect(html).toContain('IVA / impuestos')
  })
})
