// @vitest-environment node
//
// Guardia de la sección Finanzas (FASE 3.B) en la UI y el menú.
// La página es 'use client' sin exportaciones: la guardia lee su fuente,
// igual que hospitality-block-ui-guard.test.ts y la guardia del motor único.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');
const PAGINA = path.join(RAIZ, 'app/dashboard/hospitality/finanzas/page.tsx');
const NAV = path.join(RAIZ, 'lib/navigation-config.ts');

function leer(archivo: string): string {
  const contenido = fs.readFileSync(archivo, 'utf8');
  expect(contenido.length, `El archivo ${archivo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

describe('Página Finanzas de hospitality', () => {
  const fuente = leer(PAGINA);

  it('existe y consume la API de finanzas del servidor', () => {
    expect(fuente).toContain("fetch('/api/hospitality/finanzas");
  });

  it('muestra el desglose del plan: bruto, comisión OTA, neto y margen', () => {
    expect(fuente).toContain('Ingreso bruto');
    expect(fuente).toContain('Comisión OTA');
    expect(fuente).toContain('Ingreso neto');
    expect(fuente).toContain('Margen');
    // Nomenclatura del plan: NO se usa "ingreso bruto después de gastos".
    expect(fuente).not.toContain('después de gastos');
  });

  it('muestra el estado de cobro derivado y el pendiente por reserva', () => {
    expect(fuente).toContain('estadoCobro');
    expect(fuente).toContain('Pendiente');
    expect(fuente).toContain('Parcial');
    expect(fuente).toContain('Pagado');
  });

  it('permite registrar pagos (vista de cobros)', () => {
    expect(fuente).toContain('Registrar pago');
    expect(fuente).toMatch(/metodo/);
    expect(fuente).toMatch(/estado/);
  });

  it('resume por canal y por moneda', () => {
    expect(fuente).toContain('Por canal');
    expect(fuente).toContain('porMoneda');
    expect(fuente).toContain('porCanal');
  });
});

describe('Sección Finanzas en la navegación (menú de 14 secciones del plan)', () => {
  const fuente = leer(NAV);

  it('Finanzas es una sección del menú de hospitality apuntando a su página', () => {
    expect(fuente).toMatch(/\{ name: 'Finanzas', href: '\/dashboard\/hospitality\/finanzas'/);
  });

  it('la ruta está registrada en basePaths (acceso directo sin pasar por Inicio)', () => {
    expect(fuente).toContain("'/dashboard/hospitality/finanzas'");
  });

  it('sigue la estructura del plan: Venta (Tarifas) y luego Finanzas en Dinero', () => {
    const iTarifas = fuente.indexOf("{ name: 'Tarifas'");
    const iFinanzas = fuente.indexOf("{ name: 'Finanzas'");
    expect(iTarifas).toBeGreaterThan(-1);
    expect(iFinanzas).toBeGreaterThan(iTarifas);
  });
});
