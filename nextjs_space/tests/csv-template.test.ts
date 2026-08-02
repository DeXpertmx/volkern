import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeCsv,
  buildCsv,
  buildTemplatePolizas,
  descargarCsv,
  TEMPLATE_POLIZAS_COLUMNS,
  TEMPLATE_POLIZAS_EJEMPLOS,
  TEMPLATE_POLIZAS_FILENAME,
} from '@/lib/insurance/csv-template';

// ─── escapeCsv ───────────────────────────────────────────────────────────────

describe('escapeCsv', () => {
  it('devuelve el valor tal cual cuando no tiene caracteres sensibles', () => {
    expect(escapeCsv('P-001')).toBe('P-001');
    expect(escapeCsv('AXA Seguros')).toBe('AXA Seguros');
    expect(escapeCsv('2026-01-15')).toBe('2026-01-15');
  });

  it('envuelve en comillas cuando hay una coma', () => {
    expect(escapeCsv('Hola, mundo')).toBe('"Hola, mundo"');
  });

  it('duplica las comillas internas (RFC 4180)', () => {
    expect(escapeCsv('Ella dijo "sí"')).toBe('"Ella dijo ""sí"""');
    expect(escapeCsv('"')).toBe('""""');
  });

  it('envuelve en comillas cuando hay CR (\r)', () => {
    expect(escapeCsv('línea\rcon CR')).toBe('"línea\rcon CR"');
  });

  it('envuelve en comillas cuando hay LF (\n)', () => {
    expect(escapeCsv('línea\nnueva')).toBe('"línea\nnueva"');
  });

  it('convierte null/undefined a string vacío sin lanzar', () => {
    expect(escapeCsv(null as unknown as string)).toBe('');
    expect(escapeCsv(undefined as unknown as string)).toBe('');
  });

  it('acepta números y booleanos vía coerción a string', () => {
    expect(escapeCsv(String(450))).toBe('450');
    expect(escapeCsv(String(true))).toBe('true');
    expect(escapeCsv(String(false))).toBe('false');
  });

  it('NO sobre-escapea el punto y coma (delimitador regional no estándar)', () => {
    // El parser de Volkern usa coma como delimitador; forzar quoting en `;`
    // solo rompería campos legítimos que contengan un `;`.
    expect(escapeCsv('nota; con punto y coma')).toBe('nota; con punto y coma');
  });
});

// ─── buildCsv (genérico) ─────────────────────────────────────────────────────

describe('buildCsv', () => {
  it('produce header + filas separados por CRLF con BOM por defecto', () => {
    const out = buildCsv(['a', 'b'], [['1', '2'], ['3', '4']]);
    expect(out.startsWith('\uFEFF')).toBe(true);
    // No añade EOL tras la última fila (RFC 4180 no lo requiere y ahorra bytes)
    expect(out.endsWith('\r\n')).toBe(false);
    expect(out).toBe('\uFEFFa,b\r\n1,2\r\n3,4');
  });

  it('omite el BOM cuando bom=false', () => {
    const out = buildCsv(['a'], [['1']], { bom: false });
    expect(out.startsWith('\uFEFF')).toBe(false);
    expect(out).toBe('a\r\n1');
  });

  it('usa LF en vez de CRLF cuando crlf=false', () => {
    const out = buildCsv(['a'], [['1'], ['2']], { bom: false, crlf: false });
    expect(out).toBe('a\n1\n2');
    expect(out.includes('\r')).toBe(false);
  });

  it('escapa celdas con coma/quote/CR/LF automáticamente', () => {
    const out = buildCsv(
      ['col1', 'col2'],
      [
        ['normal', 'con, coma'],
        ['con "comillas"', 'línea\nnueva'],
      ],
      { bom: false },
    );
    expect(out).toBe('col1,col2\r\nnormal,"con, coma"\r\n"con ""comillas""","línea\nnueva"');
  });

  it('soporta una sola fila vacía', () => {
    const out = buildCsv(['a', 'b'], [['x', '']], { bom: false });
    // Los strings vacíos no se entrecomillan (no tienen caracteres sensibles).
    expect(out).toBe('a,b\r\nx,');
  });

  it('devuelve solo la cabecera si no hay filas', () => {
    const out = buildCsv(['a', 'b'], [], { bom: false });
    expect(out).toBe('a,b');
  });

  it('los headers también se escapan si contienen caracteres sensibles', () => {
    const out = buildCsv(['nombre, largo', 'otra'], [['x', 'y']], { bom: false });
    expect(out).toBe('"nombre, largo",otra\r\nx,y');
  });
});

// ─── buildTemplatePolizas (preset) ───────────────────────────────────────────

describe('buildTemplatePolizas', () => {
  it('empieza con BOM UTF-8', () => {
    const out = buildTemplatePolizas();
    expect(out.charCodeAt(0)).toBe(0xFEFF);
  });

  it('la primera línea contiene exactamente las columnas esperadas', () => {
    const out = buildTemplatePolizas();
    const sinBom = out.replace(/^\uFEFF/, '');
    const primeraLinea = sinBom.split('\r\n')[0];
    const columnasReales = primeraLinea.split(',');
    expect(columnasReales).toEqual([...TEMPLATE_POLIZAS_COLUMNS]);
  });

  it('incluye 2 filas de ejemplo por defecto', () => {
    const out = buildTemplatePolizas({ bom: false });
    const lineas = out.split('\r\n');
    // header + 2 filas de ejemplo + posible línea final vacía
    expect(lineas.length).toBeGreaterThanOrEqual(3);
    expect(lineas.length).toBeLessThanOrEqual(4);
  });

  it('cada fila de ejemplo tiene 14 columnas alineadas con el header', () => {
    const out = buildTemplatePolizas({ bom: false });
    const lineas = out.split('\r\n');
    const numCols = TEMPLATE_POLIZAS_COLUMNS.length;
    for (const fila of TEMPLATE_POLIZAS_EJEMPLOS) {
      expect(fila.length).toBe(numCols);
    }
    // Al menos una de las filas esperadas aparece literalmente
    expect(lineas.some(l => l.startsWith('P-2026-00001'))).toBe(true);
    expect(lineas.some(l => l.startsWith('P-2026-00002'))).toBe(true);
  });

  it('la constante TEMPLATE_POLIZAS_FILENAME es estable (no romper downloads)', () => {
    expect(TEMPLATE_POLIZAS_FILENAME).toBe('template-importacion-polizas.csv');
  });

  it('respeta opciones bom=false y crlf=false', () => {
    const out = buildTemplatePolizas({ bom: false, crlf: false });
    expect(out.startsWith('\uFEFF')).toBe(false);
    expect(out.includes('\r')).toBe(false);
    expect(out.includes('\n')).toBe(true);
  });
});

// ─── descargarCsv (DOM) ──────────────────────────────────────────────────────

describe('descargarCsv', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalURL = globalThis.URL;
  const originalBlob = globalThis.Blob;

  beforeEach(() => {
    // Restaurar entre tests en caso de fallo parcial.
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Limpia los mocks para no contaminar otros archivos de test.
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
    (globalThis as any).URL = originalURL;
    (globalThis as any).Blob = originalBlob;
  });

  it('devuelve false en SSR (sin window/document)', () => {
    // Simular entorno node sin DOM
    (globalThis as any).window = undefined;
    (globalThis as any).document = undefined;
    expect(descargarCsv('foo.csv', 'a,b\r\n1,2')).toBe(false);
  });

  it('dispara la descarga en navegador mockeando Blob/URL/document', () => {
    const blobSpy = vi.fn();
    const revokeSpy = vi.fn();
    const clickSpy = vi.fn();
    const appendSpy = vi.fn();
    const removeSpy = vi.fn();

    (globalThis as any).window = {} as typeof window;
    (globalThis as any).document = {
      createElement: vi.fn(() => ({
        href: '',
        download: '',
        click: clickSpy,
      })),
      body: {
        appendChild: appendSpy,
        removeChild: removeSpy,
      },
    };
    (globalThis as any).URL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: revokeSpy,
    };
    (globalThis as any).Blob = class {
      constructor(parts: any[], opts?: any) {
        blobSpy(parts, opts);
      }
    };

    const contenido = buildTemplatePolizas();
    const ok = descargarCsv(TEMPLATE_POLIZAS_FILENAME, contenido);

    expect(ok).toBe(true);
    // El Blob se construye con el CSV y el mimetype correcto
    expect(blobSpy).toHaveBeenCalledTimes(1);
    expect(blobSpy.mock.calls[0][0]).toEqual([contenido]);
    expect(blobSpy.mock.calls[0][1]).toEqual({ type: 'text/csv;charset=utf-8;' });
    // El anchor se monta, se hace click y se desmonta
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    // Y se libera el object URL
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');
  });
});
