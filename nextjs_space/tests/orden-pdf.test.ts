import { describe, it, expect } from 'vitest';
import { generateOrdenVentaHTML, formatOrdenCurrency } from '@/lib/ordenes-venta/orden-pdf';

const ordenBase: any = {
  numero: 'OV-2026-0001',
  estado: 'confirmada',
  fechaOrden: new Date('2026-09-08T10:00:00Z'),
  subtotal: 2380,
  descuentoGlobal: 0,
  totalImpuestos: 0,
  totalRetenciones: 0,
  total: 2380,
  moneda: 'EUR',
  condicionesVenta: 'Pago a 30 días',
  notas: 'Gracias por su compra.',
  emisor: null,
  tenant: { nombre: 'Dimension eXpert' },
  lead: { nombre: 'Manuel Martín Ruiz', email: 'manuel@cliente.com', telefono: null, empresa: null },
  contact: null,
  items: [
    { concepto: 'Implementación (migración + formación)', descripcion: null, cantidad: 1, precioUnitario: 1600, descuento: 0, subtotal: 1600, total: 1600, orden: 1 },
    { concepto: 'Volkern Hospitality — Plan Professional', descripcion: 'Integración Volkern Hospitality', cantidad: 12, precioUnitario: 65, descuento: 0, subtotal: 780, total: 780, orden: 2 },
  ],
};

describe('generateOrdenVentaHTML', () => {
  it('no produce NaN ni líneas vacías de concepto', () => {
    const html = generateOrdenVentaHTML(ordenBase, {
      companyName: 'Dimension eXpert',
      logoUrl: 'https://s3.volkern.app/prod/public/configuracion/logo.png',
    });
    expect(html).not.toContain('NaN');
    expect(html).toContain('Implementación (migración + formación)');
    expect(html).toContain('Volkern Hospitality — Plan Professional');
    expect(html).toContain('Integración Volkern Hospitality');
    expect(html).toContain('1.600,00 €');
    expect(html).toContain('780,00 €');
    expect(html).toContain('2.380,00 €');
    expect(html).toContain('Trabajo aceptado y confirmado');
    expect(html).toContain('Pago a 30 días');
    expect(html).toContain('https://s3.volkern.app/prod/public/configuracion/logo.png');
  });

  it('escapa HTML de los textos del documento', () => {
    const html = generateOrdenVentaHTML({
      ...ordenBase,
      notas: '<script>alert(1)</script>',
      condicionesVenta: '<b>bold</b> & más',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('formatea monedas de forma legible', () => {
    expect(formatOrdenCurrency(2380, 'EUR')).toBe('2.380,00 €');
    expect(formatOrdenCurrency(65, 'USD')).toBe('$65.00');
  });
});
