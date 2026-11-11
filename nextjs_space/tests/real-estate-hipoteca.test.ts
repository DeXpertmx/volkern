import { describe, it, expect } from 'vitest';
import { calcularHipoteca } from '../lib/real-estate/hipoteca';
import { interesHipotecarioOrientativo } from '../lib/moneda';

/**
 * La cuota que enseña la calculadora tiene que ser la del sistema francés: si
 * se rompe, el portal anuncia una mensualidad falsa a un comprador.
 */
describe('calcularHipoteca', () => {
  it('calcula la cuota de un préstamo a tipo fijo', () => {
    // 257.600 con 77.280 de entrada, 30 años al 1,8 % → 648,70 al mes.
    const cuota = calcularHipoteca({
      precio: 257600,
      aportacion: 77280,
      anios: 30,
      interesAnual: 1.8,
    });

    expect(cuota.principal).toBe(180320);
    expect(cuota.meses).toBe(360);
    expect(cuota.cuotaCapital).toBeCloseTo(648.7, 0);
    expect(cuota.totalMensual).toBeCloseTo(cuota.cuotaCapital, 2);
  });

  it('a tipo cero reparte el capital en cuotas iguales y no cobra intereses', () => {
    const cuota = calcularHipoteca({
      precio: 120000,
      aportacion: 0,
      anios: 10,
      interesAnual: 0,
    });

    expect(cuota.cuotaCapital).toBe(1000);
    expect(cuota.interesesTotales).toBe(0);
  });

  it('suma vinculaciones y seguros al total pero no a la cuota de capital', () => {
    const cuota = calcularHipoteca({
      precio: 200000,
      aportacion: 40000,
      anios: 25,
      interesAnual: 3,
      vinculaciones: 100,
      seguros: 35,
    });

    expect(cuota.cuotaCapital).toBeGreaterThan(0);
    expect(cuota.totalMensual).toBeCloseTo(cuota.cuotaCapital + 135, 2);
  });

  it('una entrada mayor que el precio deja el préstamo en cero', () => {
    const cuota = calcularHipoteca({
      precio: 100000,
      aportacion: 150000,
      anios: 20,
      interesAnual: 3,
      seguros: 20,
    });

    expect(cuota.principal).toBe(0);
    expect(cuota.cuotaCapital).toBe(0);
    expect(cuota.totalMensual).toBe(20);
  });

  it('el tipo de partida depende de la divisa y cae a un valor sensato sin ella', () => {
    // Un tipo único para todos los mercados anunciaría mensualidades falsas: en
    // pesos o en reales el dinero no cuesta lo que en euros.
    expect(interesHipotecarioOrientativo('eur')).toBe(3);
    expect(interesHipotecarioOrientativo('MXN')).toBeGreaterThan(interesHipotecarioOrientativo('EUR'));
    expect(interesHipotecarioOrientativo('')).toBe(3);
    expect(interesHipotecarioOrientativo('ZZZ')).toBe(3);
  });

  it('una entrada absurda devuelve ceros y nunca NaN', () => {
    const cuota = calcularHipoteca({
      precio: Number.NaN,
      aportacion: -50,
      anios: 0,
      interesAnual: -3,
    });

    expect(cuota.totalMensual).toBe(0);
    expect(Number.isFinite(cuota.interesesTotales)).toBe(true);
  });
});
