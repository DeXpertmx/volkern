import { describe, it, expect } from 'vitest';
import {
  buildImportReport,
  capErrores,
  renderReportAsCsv,
  buildReportFilename,
  type ImportReport,
  type ImportRowError,
  type ImportCreatedSummary,
} from '@/lib/insurance/import-report';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const hechas: ImportCreatedSummary = {
  clientes: [
    { nombre: 'Juan Pérez', email: 'juan.perez@example.com', telefono: '+34 600 000 001', fueCreado: true },
    { nombre: 'María García', email: 'maria@example.com', telefono: null, fueCreado: false },
  ],
  aseguradoras: [
    { nombre: 'AXA Seguros', fueCreada: true },
    { nombre: 'MAPFRE', fueCreada: false },
  ],
  productos: [
    { nombre: 'Auto Premium', ramo: 'AUTO', aseguradora: 'AXA Seguros', fueCreado: true },
    { nombre: 'Hogar Esencial', ramo: 'HOGAR', aseguradora: 'MAPFRE', fueCreado: true },
  ],
};

const errores: ImportRowError[] = [
  {
    fila: 3,
    numeroPoliza: 'P-001',
    motivo: 'Datos incompletos o fecha inválida',
    camposFaltantes: ['aseguradoraNombre', 'fechaVencimiento'],
    datosCrudos: { numeroPoliza: 'P-001', clienteNombre: 'Ana', aseguradoraNombre: '' },
  },
  {
    fila: 7,
    numeroPoliza: 'P-002',
    cliente: 'Carlos',
    aseguradora: 'AXA',
    motivo: 'Póliza "P-002" ya existe en tu cartera',
    detalle: 'Si quieres reemplazarla, elimínala primero desde la ficha de la póliza.',
    datosCrudos: { numeroPoliza: 'P-002', clienteNombre: 'Carlos' },
  },
  {
    fila: 12,
    numeroPoliza: 'P-003',
    motivo: 'Error al guardar la fila',
    detalle: 'Foreign key violation: cliente.id',
    datosCrudos: { numeroPoliza: 'P-003', clienteNombre: 'Lola' },
  },
];

// ─── buildImportReport ──────────────────────────────────────────────────────

describe('buildImportReport', () => {
  it('calcula importadas y fallidas como total - importadas', () => {
    const report = buildImportReport({
      fileName: 'cartera.csv',
      totalRows: 150,
      importadas: 142,
      errores: [],
      creadas: { clientes: [], aseguradoras: [], productos: [] },
    });
    expect(report.importadas).toBe(142);
    expect(report.fallidas).toBe(8);
    expect(report.totalRows).toBe(150);
  });

  it('clampa importadas a [0, totalRows] aunque lleguen negativos o exagerados', () => {
    const r1 = buildImportReport({
      fileName: 'x.csv', totalRows: 10, importadas: -5,
      errores: [], creadas: { clientes: [], aseguradoras: [], productos: [] },
    });
    expect(r1.importadas).toBe(0);

    const r2 = buildImportReport({
      fileName: 'x.csv', totalRows: 10, importadas: 999,
      errores: [], creadas: { clientes: [], aseguradoras: [], productos: [] },
    });
    expect(r2.importadas).toBe(10);
    expect(r2.fallidas).toBe(0);
  });

  it('incluye la fecha ISO del reporte', () => {
    const report = buildImportReport({
      fileName: 'x.csv', totalRows: 0, importadas: 0,
      errores: [], creadas: { clientes: [], aseguradoras: [], productos: [] },
    });
    expect(report.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('preserva el logId cuando se pasa explícitamente', () => {
    const report = buildImportReport({
      fileName: 'x.csv', totalRows: 0, importadas: 0,
      errores: [], creadas: { clientes: [], aseguradoras: [], productos: [] },
      logId: 'log-abc-123',
    });
    expect(report.logId).toBe('log-abc-123');
  });
});

// ─── capErrores ──────────────────────────────────────────────────────────────

describe('capErrores', () => {
  it('no trunca si el array es menor o igual al máximo', () => {
    const pocos = errores.slice(0, 3);
    expect(capErrores(pocos, 200)).toEqual(pocos);
  });

  it('trunca al máximo preservando el orden', () => {
    const muchos: ImportRowError[] = Array.from({ length: 250 }, (_, i) => ({
      fila: i + 2,
      motivo: 'm',
      datosCrudos: {},
    }));
    const capped = capErrores(muchos, 50);
    expect(capped).toHaveLength(50);
    expect(capped[0].fila).toBe(2);
    expect(capped[49].fila).toBe(51);
  });

  it('default = 200 si no se pasa máximo', () => {
    const muchos: ImportRowError[] = Array.from({ length: 300 }, () => ({
      fila: 1, motivo: 'm', datosCrudos: {},
    }));
    expect(capErrores(muchos)).toHaveLength(200);
  });
});

// ─── renderReportAsCsv ──────────────────────────────────────────────────────

describe('renderReportAsCsv', () => {
  const report: ImportReport = buildImportReport({
    fileName: 'Cartera Q1 2026.csv',
    totalRows: 5,
    importadas: 2,
    errores,
    creadas: hechas,
  });

  it('empieza con BOM UTF-8', () => {
    const csv = renderReportAsCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('incluye la sección de resumen como primera tabla', () => {
    const csv = renderReportAsCsv(report).replace(/^\uFEFF/, '');
    const primeraLinea = csv.split('\r\n')[0];
    expect(primeraLinea).toBe('archivo,fecha,total,importadas,fallidas');
    const segundaLinea = csv.split('\r\n')[1];
    expect(segundaLinea.startsWith('Cartera Q1 2026.csv,')).toBe(true);
    expect(segundaLinea).toContain('5,2,3');
  });

  it('incluye la sección de errores con sus campos', () => {
    const csv = renderReportAsCsv(report);
    // Las secciones van separadas por línea en blanco (CRLF doble).
    const secciones = csv.split('\r\n\r\n');
    expect(secciones.length).toBeGreaterThanOrEqual(4);

    const erroresCsv = secciones[1];
    expect(erroresCsv).toContain('fila,numeroPoliza,cliente,aseguradora,motivo,detalle,camposFaltantes,datosCrudos');
    // Fila 3 → camposFaltantes debe contener "aseguradoraNombre|fechaVencimiento"
    expect(erroresCsv).toContain('3,P-001');
    expect(erroresCsv).toContain('aseguradoraNombre|fechaVencimiento');
    // Fila 7 → motivo con comillas → debe estar entrecomillada
    expect(erroresCsv).toContain('"Póliza ""P-002"" ya existe en tu cartera"');
    // Snapshot JSON de la fila (con llaves escapadas por estar en JSON entrecomillado)
    expect(erroresCsv).toContain('""numeroPoliza"":""P-001""');
  });

  it('incluye la sección de clientes separados por pipe en fueCreado (sí/no)', () => {
    const csv = renderReportAsCsv(report);
    expect(csv).toContain('nombre,email,telefono,fueCreado');
    expect(csv).toContain('Juan Pérez,juan.perez@example.com,+34 600 000 001,sí');
    expect(csv).toContain('María García,maria@example.com,,no');
  });

  it('incluye la sección de aseguradoras creadas', () => {
    const csv = renderReportAsCsv(report);
    expect(csv).toContain('nombre,fueCreada');
    expect(csv).toContain('AXA Seguros,sí');
    expect(csv).toContain('MAPFRE,no');
  });

  it('incluye la sección de productos creados con ramo', () => {
    const csv = renderReportAsCsv(report);
    expect(csv).toContain('nombre,ramo,aseguradora,fueCreado');
    expect(csv).toContain('Auto Premium,AUTO,AXA Seguros,sí');
    expect(csv).toContain('Hogar Esencial,HOGAR,MAPFRE,sí');
  });

  it('omite secciones vacías (sin aseguradoras creadas → sin esa tabla)', () => {
    const reportVacio: ImportReport = buildImportReport({
      fileName: 'x.csv',
      totalRows: 10,
      importadas: 10,
      errores: [],
      creadas: { clientes: [], aseguradoras: [], productos: [] },
    });
    const csv = renderReportAsCsv(reportVacio).replace(/^\uFEFF/, '');
    // Solo debe haber header + fila de resumen (sin líneas en blanco entre tablas).
    expect(csv).toMatch(/^archivo,fecha,total,importadas,fallidas\r\nx\.csv,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,10,10,0$/);
    expect(csv.split('\r\n\r\n')).toHaveLength(1);
  });

  it('escapa RFC 4180: comas, comillas, CR y LF dentro de los datos crudos', () => {
    const reportConChars: ImportReport = buildImportReport({
      fileName: 'x.csv',
      totalRows: 1,
      importadas: 0,
      errores: [
        {
          fila: 2,
          motivo: 'Mixto',
          detalle: 'Detalle con\nsalto + "comilla" y, coma',
          datosCrudos: { nota: 'valor con\nsalto', otra: 'otra,cosa' },
        },
      ],
      creadas: { clientes: [], aseguradoras: [], productos: [] },
    });
    const csv = renderReportAsCsv(reportConChars);
    // El detalle con salto y comillas internas sobrevive al escape RFC 4180:
    // 'Detalle con\nsalto + "comilla" y, coma'
    // -> "Detalle con\nsalto + ""comilla"" y, coma"
    expect(csv).toContain('"Detalle con\nsalto + ""comilla"" y, coma"');
    expect(csv).toContain('"otra,cosa"');
    // El LF interno de los datosCrudos termina codificado como secuencia JSON
    // ('\\n', 2 chars) por JSON.stringify — esa es la forma correcta para
    // roundtrip con JSON.parse. Aqui lo verificamos posteriormente a través
    // del substring suelto.
    expect(csv).toContain('valor con\\nsalto');
    expect(csv).toContain('otra,cosa');
  });
});

// ─── buildReportFilename ────────────────────────────────────────────────────

describe('buildReportFilename', () => {
  it('incluye la fecha en formato yyyy-mm-dd', () => {
    const name = buildReportFilename('cartera.csv', new Date('2026-02-15T12:00:00Z'));
    expect(name).toMatch(/^reporte-importacion-cartera-2026-02-15\.csv$/);
    expect(name.startsWith('reporte-importacion-')).toBe(true);
  });

  it('sanitiza caracteres peligrosos del nombre original', () => {
    const name = buildReportFilename('../../etc/passwd', new Date('2026-01-01Z'));
    expect(name).not.toContain('/');
    expect(name).not.toContain('..\\');
    expect(name).not.toContain('..');
    expect(name.startsWith('reporte-importacion-')).toBe(true);
  });

  it('elimina la extensión del archivo origen', () => {
    const name = buildReportFilename('Cartera Q1.xlsx', new Date('2026-01-01Z'));
    expect(name).not.toContain('.xlsx');
    expect(name).not.toContain('Q1.xlsx');
  });

  it('usa fallback "polizas" si el nombre queda vacío tras sanitizar', () => {
    const name = buildReportFilename('/////////', new Date('2026-01-01Z'));
    expect(name).toMatch(/^reporte-importacion-polizas-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('usa la fecha actual si no se le pasa', () => {
    const name = buildReportFilename('cartera.csv');
    expect(name).toMatch(/^reporte-importacion-cartera-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
