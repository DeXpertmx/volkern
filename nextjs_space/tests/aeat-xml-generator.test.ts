import { describe, it, expect } from 'vitest';
import { AEATXmlGenerator } from '@/lib/fiscal/aeat/xml-generator';

const baseData = {
  emisor: { nif: 'B12345678', nombre: 'Empresa Test SL' },
  receptor: { nif: '12345678Z', nombre: 'Juan García' },
  factura: {
    numero: 'FACT-2026-001',
    fecha: '2026-05-21T10:30:00Z',
    monto: 1500.50,
    moneda: 'EUR'
  },
  encadenamiento: {
    fingerprintAnterior: 'abc123def456'
  }
};

// ─── generateAltaFactura ─────────────────────────────────────────────
describe('AEATXmlGenerator.generateAltaFactura', () => {
  it('debe generar XML con namespace vfact', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('xmlns:vfact=');
    expect(xml).toContain('vfact:RegistroFactura');
  });

  it('debe incluir IDEmisorFactura del emisor', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('<vfact:IDEmisorFactura>B12345678</vfact:IDEmisorFactura>');
  });

  it('debe incluir NumSerieFactura', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('<vfact:NumSerieFactura>FACT-2026-001</vfact:NumSerieFactura>');
  });

  it('debe usar solo la fecha (YYYY-MM-DD) de FechaExpedicionFactura', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('<vfact:FechaExpedicionFactura>2026-05-21</vfact:FechaExpedicionFactura>');
  });

  it('debe incluir datos del emisor (NIF + NombreRazon)', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('<vfact:NIF>B12345678</vfact:NIF>');
    expect(xml).toContain('<vfact:NombreRazon>Empresa Test SL</vfact:NombreRazon>');
  });

  it('debe incluir datos del receptor (NIF + NombreRazon)', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('<vfact:NIF>12345678Z</vfact:NIF>');
    expect(xml).toContain('<vfact:NombreRazon>Juan García</vfact:NombreRazon>');
  });

  it('debe incluir ImporteTotal con 2 decimales', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('<vfact:ImporteTotal>1500.50</vfact:ImporteTotal>');
  });

  it('debe incluir moneda', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('<vfact:Moneda>EUR</vfact:Moneda>');
  });

  it('debe incluir el fingerprint de encadenamiento', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('<vfact:FingerprintAnterior>abc123def456</vfact:FingerprintAnterior>');
  });

  it('debe usar GENESIS_VERIFACTU_2026 si no hay fingerprint anterior', () => {
    const xml = AEATXmlGenerator.generateAltaFactura({
      ...baseData,
      encadenamiento: {}
    });
    expect(xml).toContain('<vfact:FingerprintAnterior>GENESIS_VERIFACTU_2026</vfact:FingerprintAnterior>');
  });

  it('debe incluir SistemaInformatico con nombre y versión', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml).toContain('<vfact:NombreSistema>Volkern OS</vfact:NombreSistema>');
    expect(xml).toContain('<vfact:Version>1.0.0</vfact:Version>');
  });

  it('debe generar XML determinista', () => {
    const a = AEATXmlGenerator.generateAltaFactura(baseData);
    const b = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(a).toBe(b);
  });

  it('debe manejar montos enteros (sin decimales)', () => {
    const xml = AEATXmlGenerator.generateAltaFactura({
      ...baseData,
      factura: { ...baseData.factura, monto: 2000 }
    });
    expect(xml).toContain('<vfact:ImporteTotal>2000.00</vfact:ImporteTotal>');
  });

  it('debe manejar montos con 3 decimales (redondeo)', () => {
    const xml = AEATXmlGenerator.generateAltaFactura({
      ...baseData,
      factura: { ...baseData.factura, monto: 99.999 }
    });
    expect(xml).toContain('<vfact:ImporteTotal>100.00</vfact:ImporteTotal>');
  });

  it('debe manejar caracteres especiales en nombres', () => {
    const xml = AEATXmlGenerator.generateAltaFactura({
      ...baseData,
      emisor: { nif: 'B12345678', nombre: 'Empresa & Asociados "Plus"' },
      receptor: { nif: '12345678Z', nombre: "O'Reilly & Sons" }
    });
    expect(xml).toContain('Empresa & Asociados "Plus"');
    expect(xml).toContain("O'Reilly & Sons");
  });

  it('debe manejar factura con número de serie largo', () => {
    const xml = AEATXmlGenerator.generateAltaFactura({
      ...baseData,
      factura: { ...baseData.factura, numero: 'FACT/2026/ESP/000001-REV2' }
    });
    expect(xml).toContain('<vfact:NumSerieFactura>FACT/2026/ESP/000001-REV2</vfact:NumSerieFactura>');
  });

  it('debe manejar moneda diferente (USD)', () => {
    const xml = AEATXmlGenerator.generateAltaFactura({
      ...baseData,
      factura: { ...baseData.factura, moneda: 'USD' }
    });
    expect(xml).toContain('<vfact:Moneda>USD</vfact:Moneda>');
  });

  it('debe generar XML que empieza y termina correctamente', () => {
    const xml = AEATXmlGenerator.generateAltaFactura(baseData);
    expect(xml.startsWith('<vfact:RegistroFactura')).toBe(true);
    expect(xml.endsWith('</vfact:RegistroFactura>')).toBe(true);
  });
});
