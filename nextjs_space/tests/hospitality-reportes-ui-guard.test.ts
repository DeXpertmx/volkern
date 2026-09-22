// @vitest-environment node
//
// Guardia de la sección Reportes (FASE 3.E): las pestañas del plan, los KPIs
// que salen del módulo puro (nada recalculado en la página), la exportación
// CSV compartida y la entrada de menú. Mismo técnica de fuente que las demás
// guardias del módulo (la página es 'use client' sin exportaciones).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

describe('Página Reportes de hospitality', () => {
  const fuente = leer('app/dashboard/hospitality/reportes/page.tsx');

  it('tiene las dos pestañas del plan: Operación y Ventas', () => {
    expect(fuente).toContain('value="operacion"');
    expect(fuente).toContain('value="ventas"');
    expect(fuente).toContain('>Operación<');
    expect(fuente).toContain('>Ventas<');
  });

  it('consume los KPIs del módulo puro vía la API del dashboard (no calcula nada)', () => {
    expect(fuente).toContain('/api/hospitality/dashboard');
    expect(fuente).toContain('reportesKpis');
    // Si la página empezara a recalcular KPIs, esto lo detecta.
    expect(fuente).not.toMatch(/const adr\s*=/);
    expect(fuente).not.toMatch(/const revpar\s*=/);
  });

  it('muestra los KPIs de operación del plan', () => {
    for (const titulo of ['ADR', 'RevPAR', 'Estancia media', 'No-shows', 'Cancelaciones', 'Llegadas']) {
      expect(fuente).toContain(titulo);
    }
  });

  it('muestra los KPIs de ventas: canal directa, ingresos por canal y antelación', () => {
    expect(fuente).toContain('Reservas directas');
    expect(fuente).toContain('Antelación media');
    expect(fuente).toContain('Antelación mediana');
    expect(fuente).toContain('por canal');
  });

  it('muestra los holds abandonados y delega el juicio al módulo puro', () => {
    expect(fuente).toContain('Holds abandonados');
    expect(fuente).toContain('holds');
    expect(fuente).toContain('caducados');
    expect(fuente).toContain('confirmados');
    // Cuándo un abandono es anómalo (umbral y volumen mínimo) NO se decide en la
    // página: sale del módulo puro, o el hotel leería avisos distintos en cada
    // superficie.
    expect(fuente).toContain("from '@/lib/hospitality/holds-metrics'");
    expect(fuente).toContain('alertaHoldsAbandonados(');
    expect(fuente).not.toMatch(/tasaAbandono\s*[<>]=?\s*0\./);
  });

  it('muestra los partes de viajeros sin reintentar y delega el juicio al módulo puro', () => {
    // El abandono de partes que antes solo veía el operador de plataforma: son
    // estancias sin comunicar al Ministerio y el hotel tiene que verlas.
    expect(fuente).toContain('Partes sin reintentar');
    expect(fuente).toContain('partes.aceptadas');
    expect(fuente).toContain('partes.cerradas');
    expect(fuente).toContain("from '@/lib/hospitality/partes-metrics'");
    expect(fuente).toContain('alertaPartesSinReintentar(');
    expect(fuente).toContain('lecturaPartesSinReintentar(');
    expect(fuente).not.toMatch(/tasaSinReintentar\s*[<>]=?\s*0\./);
  });

  it('exporta el abandono de partes en el CSV de operación', () => {
    for (const columna of [
      'partes_sin_reintentar',
      'partes_aceptados',
      'partes_cerrados',
      'partes_sin_reintentar_pct',
    ]) {
      expect(fuente).toContain(columna);
    }
  });

  it('muestra la comparación de reservas directas por idioma (ES vs EN) sin interpretar', () => {
    // La cifra y su lectura vienen del módulo puro vía la API; la página solo
    // pinta. Un umbral o un idioma decidido en la página rompería la guardia.
    expect(fuente).toContain('Reservas directas en inglés (EN)');
    expect(fuente).toContain('idiomas.lectura');
    expect(fuente).toContain("from 'lucide-react'");
    expect(fuente).toContain('Languages');
    expect(fuente).not.toMatch(/idiomas\.cuotaEn\s*[<>]=?\s*0\./);
    expect(fuente).not.toMatch(/idioma\s*===\s*['"]en['"]/);
  });

  it('exporta ambos reportes a CSV con el helper compartido', () => {
    expect(fuente).toContain('Exportar CSV');
    expect(fuente).toContain("from '@/lib/hospitality/csv'");
    expect(fuente).toContain('construirCsv(');
    expect(fuente).toContain('descargarCsv(');
    expect(fuente).toContain("nombreArchivoReporte('operacion')");
    expect(fuente).toContain("nombreArchivoReporte('ventas')");
  });

  it('ofrece ventanas de 30/90/180 días', () => {
    expect(fuente).toContain('30 días');
    expect(fuente).toContain('90 días');
    expect(fuente).toContain('180 días');
  });
});

describe('Sección Reportes en la navegación (14 secciones del plan)', () => {
  const fuente = leer('lib/navigation-config.ts');

  it('Reportes es una sección del menú de hospitality', () => {
    expect(fuente).toMatch(/\{ name: 'Reportes', href: '\/dashboard\/hospitality\/reportes'/);
    expect(fuente).toContain("'/dashboard/hospitality/reportes'");
  });

  it('queda al final del menú (área Inteligencia, según la estructura aprobada)', () => {
    const iReportes = fuente.indexOf("{ name: 'Reportes', href: '/dashboard/hospitality/reportes'");
    const iAutomatizaciones = fuente.indexOf("{ name: 'Automatizaciones'");
    expect(iReportes).toBeGreaterThan(iAutomatizaciones);
  });
});

describe('Plan de hospitality — FASE 3.E marcada', () => {
  it('las casillas de la FASE 3.E están completadas en el plan', () => {
    const plan = leer('docs/hospitality-booking-payments-plan.md');
    const fase = plan.split('### FASE 3.E')[1]?.split('## 5.')[0] || '';
    expect(fase).toContain('- [x] Operación:');
    expect(fase).toContain('- [x] Ventas:');
    expect(fase).toContain('- [x] Finanzas:');
    expect(fase).toContain('- [x] Por propiedad, con exportación.');
  });
});
