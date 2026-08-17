export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { withTenantAuth } from '@/lib/api-key-auth';

const HEADERS = [
  'NOMBRE',
  'C.I.F.',
  'FECHA',
  'Nº FRA.',
  'BASE 21%',
  'BASE 10%',
  'BASE 7,5%',
  'BASE 5%',
  'BASE 4%',
  'BASE 2%',
  'BASE 0%',
  'IVA',
  'TOTAL',
];

// Columnas que representan importes (BASE x% + IVA + TOTAL) para darles
// formato de moneda en la plantilla (índice 0-based dentro de HEADERS).
const MONEY_COLUMNS = [4, 5, 6, 7, 8, 9, 10, 11, 12];

// Convertir fecha a serial de Excel (días desde 1899-12-30)
function excelSerial(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);
}

/**
 * GET /api/erp/expenses/import/template
 * Descarga una plantilla XLSX con las columnas esperadas por la importación
 * y filas de ejemplo. Incluye una segunda hoja con instrucciones.
 */
export const GET = withTenantAuth(async () => {
  const ejemploRows = [
    [
      'SUMINISTROS GENERALES DEL SUR S.L.',
      'B91234567',
      excelSerial(2026, 8, 12),
      'FRA-2026-0001',
      1000, '', '', '', '', '', '',
      210,
      1210,
    ],
    [
      'ASESORÍA FISCAL LÓPEZ S.L.',
      'B87654321',
      excelSerial(2026, 8, 5),
      'FRA-2026-0018',
      '', 500, '', '', 100, '', '',
      54,
      654,
    ],
    [
      'LIBRERÍA SANTANDER S.L.',
      'B12345678',
      excelSerial(2026, 7, 28),
      'FRA-2026-0042',
      '', '', '', '', '', '', 200,
      0,
      200,
    ],
  ];

  const aoa = [HEADERS, ...ejemploRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: false });

  // Formato de fecha dd/mm/yyyy para la columna FECHA (índice 2)
  for (let r = 1; r < aoa.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    if (cell) {
      cell.t = 'n';
      cell.z = 'dd/mm/yyyy';
    }
  }
  // Formato de moneda para columnas de importes
  for (let r = 1; r < aoa.length; r++) {
    for (const c of MONEY_COLUMNS) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = '#,##0.00';
    }
  }
  // Ancho de columnas
  ws['!cols'] = HEADERS.map((h, i) => ({
    wch: i === 0 ? 34 : i === 1 ? 12 : i === 2 ? 12 : i === 3 ? 14 : 10,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos');

  const instrucciones = [
    ['PLANTILLA DE IMPORTACIÓN DE GASTOS'],
    [''],
    ['1. Rellena una fila por factura. Borra o deja en blanco las filas de ejemplo.'],
    ['2. Columnas:'],
    ['   • NOMBRE — razón social del proveedor (obligatorio).'],
    ['   • C.I.F. — NIF/CIF del proveedor. Si no existe, se crea en el sistema.'],
    ['   • FECHA — fecha de la factura (dd/mm/aaaa).'],
    ['   • Nº FRA. — número de factura (se evitan duplicados).'],
    ['   • BASE 21% / 10% / 7,5% / 5% / 4% / 2% / 0% — base imponible en cada tipo de IVA.'],
    ['     Puedes usar varias columnas en la misma fila si la factura mezcla tipos.'],
    ['   • IVA — cuota total de IVA de la factura (suma de todas las bases × su tipo).'],
    ['   • TOTAL — importe total de la factura (base imponible + IVA).'],
    ['3. Usa el punto como separador de decimales (ej. 1234.56).'],
    ['4. Guarda el archivo y súbelo en "Importar Excel" del módulo de Gastos.'],
    [''],
    ['Ejemplos:'],
    ['   · Factura a 21%:  BASE 21% = 1000, IVA = 210, TOTAL = 1210'],
    ['   · Factura mixta a 10% y 4%: BASE 10% = 500, BASE 4% = 100, IVA = 54, TOTAL = 654'],
    ['   · Factura exenta a 0%: BASE 0% = 200, IVA = 0, TOTAL = 200'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrucciones);
  wsInstr['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-gastos.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}, ['erp:read']);