// @vitest-environment node
//
// Guardia del botón «Exportar CSV» de la pantalla de reservas.
// La exportación pasa por la API (/api/hospitality/reservations/export), que
// autentica, aplica los mismos filtros que la lista y acota por tenant. Si la
// página construyera el CSV en el cliente (construirReservasCsv o
// descargarCsv), los datos de TODAS las reservas ya cargadas viajarían al
// archivo sin pasar por la puerta de autenticación — y la regla de
// «exporta exactamente lo que se ve» viviría duplicada en dos sitios.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function leer(relativo: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

describe('Pantalla de reservas — exportación CSV', () => {
  const fuente = leer('app/dashboard/hospitality/reservas/page.tsx');

  it('exporta vía la API autenticada, con los filtros activos en la URL', () => {
    expect(fuente).toContain('/api/hospitality/reservations/export');
    expect(fuente).toContain('filtrosCsv');
  });

  it('NO construye ni descarga el CSV en el cliente (el archivo nace en el servidor)', () => {
    expect(fuente).not.toContain('construirReservasCsv');
    expect(fuente).not.toContain('descargarCsv');
    expect(fuente).not.toContain('new Blob');
  });
});
