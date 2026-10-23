/**
 * Tarifas adicionales por estancia (módulo puro `booking-fees`).
 *
 * Lo que se protege con estos casos:
 * 1. La obligatoria entra SIEMPRE, sin que el huésped la elija.
 * 2. La opcional solo se cobra si se marca: una tarifa de mascota no puede
 *    aparecer en la reserva de quien no lleva mascota.
 * 3. El importe sale del catálogo del servidor; la selección solo nombra ids.
 * 4. Un id desconocido no rompe la venta ni inventa un cargo.
 * 5. La cotización suma las obligatorias al total (y el anticipo las tiene en
 *    cuenta), que es lo que ve y paga el huésped.
 */
import { describe, it, expect } from 'vitest';
import {
  catalogoPublicoDeTarifas,
  filasDeItemsTarifas,
  resolverTarifas,
  tarifasOpcionales,
  totalObligatorias,
  type TarifaCatalogo,
} from '@/lib/hospitality/booking-fees';
import { cotizarEstancia } from '@/lib/hospitality/pricing';

const LIMPIEZA: TarifaCatalogo = {
  id: 'f_limpieza',
  nombre: 'Limpieza final',
  descripcionEs: 'Limpieza al salir',
  descripcionEn: 'Final cleaning',
  importe: 20,
  moneda: 'EUR',
  obligatoria: true,
};

const GESTION: TarifaCatalogo = {
  id: 'f_gestion',
  nombre: 'Tarifa de gestión',
  descripcionEs: null,
  descripcionEn: null,
  importe: 15.5,
  moneda: 'EUR',
  obligatoria: true,
};

const MASCOTA: TarifaCatalogo = {
  id: 'f_mascota',
  nombre: 'Tarifa por mascota',
  descripcionEs: 'Por mascota y estancia',
  descripcionEn: 'Per pet, per stay',
  importe: 30,
  moneda: 'EUR',
  obligatoria: false,
};

const CATALOGO = [LIMPIEZA, GESTION, MASCOTA];

describe('resolverTarifas — quién decide cada cargo', () => {
  it('cobra las obligatorias aunque el huésped no marque nada', () => {
    const resultado = resolverTarifas(CATALOGO, []);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.lineas.map((l) => l.tarifaId)).toEqual(['f_limpieza', 'f_gestion']);
    expect(resultado.total).toBe(35.5);
  });

  it('la opcional solo se cobra si el huésped la marca', () => {
    const sinMascota = resolverTarifas(CATALOGO, []);
    const conMascota = resolverTarifas(CATALOGO, ['f_mascota']);
    expect(sinMascota.ok && conMascota.ok).toBe(true);
    if (!sinMascota.ok || !conMascota.ok) return;
    expect(sinMascota.total).toBe(35.5);
    expect(conMascota.total).toBe(65.5);
    expect(conMascota.lineas.find((l) => l.tarifaId === 'f_mascota')).toEqual({
      tarifaId: 'f_mascota',
      concepto: 'Tarifa por mascota',
      importe: 30,
      moneda: 'EUR',
      obligatoria: false,
    });
  });

  it('el importe es del catálogo: la selección solo nombra ids', () => {
    // Un envío manipulado con "importe" no cambia nada: no se lee.
    const resultado = resolverTarifas(CATALOGO, [{ id: 'f_mascota', importe: 0 }]);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.lineas.map((l) => l.tarifaId)).toEqual(['f_limpieza', 'f_gestion']);
    expect(resultado.total).toBe(35.5);
  });

  it('un id que ya no está en el catálogo se ignora y se dice', () => {
    const resultado = resolverTarifas(CATALOGO, ['f_retirada', 'f_mascota']);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.ignorados).toEqual(['La tarifa f_retirada ya no está disponible']);
    expect(resultado.total).toBe(65.5);
  });

  it('los ids repetidos no cobran dos veces la misma tarifa', () => {
    const resultado = resolverTarifas(CATALOGO, ['f_mascota', 'f_mascota', ' f_mascota ']);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.lineas.filter((l) => l.tarifaId === 'f_mascota')).toHaveLength(1);
    expect(resultado.total).toBe(65.5);
  });

  it('una tarifa a cero no ensucia el desglose', () => {
    const resultado = resolverTarifas([...CATALOGO, { ...GESTION, id: 'f_cero', importe: 0 }], []);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.lineas.map((l) => l.tarifaId)).not.toContain('f_cero');
    expect(resultado.total).toBe(35.5);
  });

  it('devuelve el total redondeado a céntimo', () => {
    const resultado = resolverTarifas(
      [{ ...GESTION, importe: 10.005 }, { ...MASCOTA, importe: 0.1 }],
      ['f_mascota']
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.total).toBe(10.11);
  });
});

describe('totalObligatorias / tarifasOpcionales', () => {
  it('separa lo que se cobra siempre de lo que elige el huésped', () => {
    expect(totalObligatorias(CATALOGO)).toBe(35.5);
    expect(tarifasOpcionales(CATALOGO).map((t) => t.id)).toEqual(['f_mascota']);
  });

  it('sin catálogo no hay cargo (null/undefined no rompen)', () => {
    expect(totalObligatorias([])).toBe(0);
    expect(totalObligatorias(null as unknown as TarifaCatalogo[])).toBe(0);
    expect(tarifasOpcionales(null as unknown as TarifaCatalogo[])).toEqual([]);
  });
});

describe('cotizarEstancia — las tarifas obligatorias entran en el total', () => {
  const base = {
    checkIn: new Date(2027, 2, 1),
    checkOut: new Date(2027, 2, 4),
    tarifaPorNoche: 120,
    limpieza: 20,
    moneda: 'EUR',
  };

  it('suma alojamiento + limpieza + tarifas, y el anticipo las incluye', () => {
    const cotizacion = cotizarEstancia({ ...base, tarifas: 35.5, anticipoPorcentaje: 20 });
    expect(cotizacion.tarifas).toBe(35.5);
    expect(cotizacion.total).toBe(415.5); // 360 + 20 + 35.5
    expect(cotizacion.anticipo).toBe(83.1);
    expect(cotizacion.saldo).toBe(332.4);
  });

  it('sin tarifas el total es el de siempre: el cálculo clásico no cambia', () => {
    const cotizacion = cotizarEstancia(base);
    expect(cotizacion.tarifas).toBe(0);
    expect(cotizacion.total).toBe(380);
  });

  it('un valor negativo no resta dinero', () => {
    const cotizacion = cotizarEstancia({ ...base, tarifas: -50 });
    expect(cotizacion.tarifas).toBe(0);
    expect(cotizacion.total).toBe(380);
  });
});

describe('catálogo público y líneas de reserva', () => {
  it('publica la descripción del idioma pedido y ordena por nombre', () => {
    const es = catalogoPublicoDeTarifas(CATALOGO, 'es');
    expect(es.map((t) => t.nombre)).toEqual([
      'Limpieza final',
      'Tarifa de gestión',
      'Tarifa por mascota',
    ]);
    expect(es[0].descripcion).toBe('Limpieza al salir');
    expect(catalogoPublicoDeTarifas(CATALOGO, 'en')[0].descripcion).toBe('Final cleaning');
    expect(es[2].obligatoria).toBe(false);
  });

  it('cada tarifa es una línea del desglose, cobrada una vez', () => {
    const resultado = resolverTarifas(CATALOGO, ['f_mascota']);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const filas = filasDeItemsTarifas(resultado.lineas, {
      tenantId: 't',
      reservationId: 'r',
      propertyId: 'p',
      unitId: 'u',
    });
    expect(filas).toHaveLength(3);
    expect(filas[0]).toMatchObject({
      tipo: 'extra',
      concepto: 'Limpieza final',
      cantidad: 1,
      importeUnitario: 20,
      importeTotal: 20,
      moneda: 'EUR',
    });
  });
});
