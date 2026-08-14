import { describe, it, expect } from 'vitest';
import { applySupplierRetention } from '@/lib/skills/finance-skills';

describe('applySupplierRetention', () => {
  it('aplica IRPF 15% del proveedor profesional sobre la base imponible', () => {
    const r = applySupplierRetention({
      supplierIrpfRetention: 15,
      supplierIvaRetention: 0,
      baseImponible: 1000,
    });
    expect(r.irpfRate).toBe(15);
    expect(r.irpfAmount).toBe(150);
  });

  it('aplica IRPF 7% (primer año) y redondea a 2 decimales', () => {
    const r = applySupplierRetention({
      supplierIrpfRetention: 7,
      supplierIvaRetention: 0,
      baseImponible: 333.33,
    });
    expect(r.irpfRate).toBe(7);
    expect(r.irpfAmount).toBe(23.33);
  });

  it('aplica IRPF 19% del arrendador', () => {
    const r = applySupplierRetention({
      supplierIrpfRetention: 19,
      supplierIvaRetention: 0,
      baseImponible: 500,
    });
    expect(r.irpfAmount).toBe(95);
  });

  it('aplica retención de IVA (1%) cuando el proveedor la tiene', () => {
    const r = applySupplierRetention({
      supplierIrpfRetention: 0,
      supplierIvaRetention: 1,
      baseImponible: 1000,
    });
    expect(r.ivaRetentionRate).toBe(1);
    expect(r.ivaRetentionAmount).toBe(10);
  });

  it('aplica IRPF e IVA retenido a la vez', () => {
    const r = applySupplierRetention({
      supplierIrpfRetention: 15,
      supplierIvaRetention: 1,
      baseImponible: 2000,
    });
    expect(r.irpfAmount).toBe(300);
    expect(r.ivaRetentionAmount).toBe(20);
  });

  it('no aplica nada si el proveedor no tiene retención (EMPRESA)', () => {
    const r = applySupplierRetention({
      supplierIrpfRetention: 0,
      supplierIvaRetention: 0,
      baseImponible: 1000,
    });
    expect(r.irpfRate).toBeUndefined();
    expect(r.irpfAmount).toBeUndefined();
    expect(r.ivaRetentionRate).toBeUndefined();
    expect(r.ivaRetentionAmount).toBeUndefined();
  });

  it('respeta la retención explícita del formulario/OCR', () => {
    const r = applySupplierRetention({
      supplierIrpfRetention: 19,
      supplierIvaRetention: 0,
      irpfRate: 15,
      irpfAmount: 150,
      baseImponible: 1000,
    });
    expect(r.irpfRate).toBe(15);
    expect(r.irpfAmount).toBe(150);
  });

  it('usa el importe total como base si no hay base imponible desglosada', () => {
    const r = applySupplierRetention({
      supplierIrpfRetention: 15,
      supplierIvaRetention: 0,
      baseImponible: 250,
    });
    expect(r.irpfAmount).toBe(37.5);
  });
});
