/**
 * Helpers compartidos para generar y descargar plantillas CSV usadas por los
 * importadores del módulo de seguros (Pólizas, Aseguradoras, Productos…).
 *
 * El output sigue RFC 4180:
 *   - Cabecera separada por coma.
 *   - Saltos de línea CRLF (Windows Excel lo respeta sin warnings).
 *   - Campos que contengan `"`, `,`, `\r` o `\n` se entrecomillan y duplican
 *     las comillas internas (\" → \"\"). El resto se emite tal cual.
 *   - Se antepone un BOM UTF-8 (\uFEFF) para que Excel respete tildes y ñ.
 *
 * `descargarCsv` depende del DOM (URL.createObjectURL, document.body…) y por
 * tanto no es segura para ejecutar en SSR o en tests de Node; el resto de las
 * funciones son puras y 100 % testables.
 */

const CRLF = '\r\n';
const UTF8_BOM = '\uFEFF';
/** RFC 4180: requiere comillas si el campo contiene `"`, `,`, CR o LF. */
const CSV_QUOTE_TRIGGER = /["\r\n,]/;

/**
 * Escapa un valor según RFC 4180.
 *
 * - Si el campo no contiene caracteres sensibles lo devuelve tal cual.
 * - Si contiene `"`, `,`, `\r` o `\n`, lo envuelve en comillas y duplica
 *   las comillas internas (estilo Excel).
 *
 * Acepta strings; números/fechas/bool deben convertirse a string antes de
 * pasar (ej. `String(value)`).
 *
 * @example
 *   escapeCsv('P-001');           // → 'P-001'
 *   escapeCsv('Hola, mundo');     // → '"Hola, mundo"'
 *   escapeCsv('Ella dijo "sí"');  // → '"Ella dijo ""sí"""'
 *   escapeCsv('Línea\nnueva');    // → '"Línea\nnueva"'
 */
export function escapeCsv(value: string): string {
  const safe = String(value ?? '').replace(/"/g, '""');
  return CSV_QUOTE_TRIGGER.test(safe) ? `"${safe}"` : safe;
}

export interface BuildCsvOptions {
  /**
   * Si es `true` (default) antepone BOM UTF-8 para que Excel auto-detecte
   * la codificación y respete tildes/ñ. Ponlo en `false` solo cuando el
   * consumer no sea Excel (p. ej. un parser de Node que ya conoce la
   * codificación).
   */
  bom?: boolean;
  /**
   * Si es `true` (default) usa CRLF como separador de filas (RFC 4180,
   * recomendado para Excel en Windows). Ponlo en `false` sólo si tu consumer
   * requiere LF explícitamente.
   */
  crlf?: boolean;
}

/**
 * Construye el contenido CSV a partir de columnas y filas.
 *
 * Por defecto produce un CSV *Excel-friendly* (BOM UTF-8 + CRLF). Cuando
 * se exporte a un consumer que NO sea Excel (p. ej. un parser de Node,
 * BigQuery, etc.) pasar `{ bom: false, crlf: false }`.
 *
 * @example
 *   buildCsv(['a', 'b'], [['1', '2'], ['3', '4,5']]);
 *   // → '\uFEFFa,b\r\n1,2\r\n3,"4,5"'
 */
export function buildCsv(
  columns: string[],
  rows: ReadonlyArray<ReadonlyArray<string>>,
  options: BuildCsvOptions = {},
): string {
  const { bom = true, crlf = true } = options;
  const eol = crlf ? CRLF : '\n';
  const lines = [
    columns.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(',')),
  ];
  return (bom ? UTF8_BOM : '') + lines.join(eol);
}

/**
 * Dispara la descarga de un CSV en el navegador. Depende del DOM, así que:
 *   - En SSR lanza un warning y se vuelve no-op.
 *   - En tests hay que mockear `URL.createObjectURL`, `Blob` y `document`.
 *
 * Devuelve `true` si la descarga se disparó, `false` si era no-op.
 */
export function descargarCsv(filename: string, csvContent: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // SSR / Node: no hay browser, nada que descargar.
    return false;
  }
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

// ─── Plantillas predefinidas ────────────────────────────────────────────────

/**
 * Columnas que acepta el importador de Pólizas. Mantener en sincronía con
 * `app/api/insurance/importar/route.ts` (cabecera esperada).
 */
export const TEMPLATE_POLIZAS_COLUMNS: readonly string[] = [
  'numeroPoliza',
  'clienteEmail',
  'aseguradoraNombre',
  'ramo',
  'producto',
  'primaAnual',
  'sumaAsegurada',
  'moneda',
  'formaPago',
  'fechaInicio',
  'fechaVencimiento',
  'comisionPct',
  'descripcion',
  'notas',
] as const;

/**
 * Dos filas de ejemplo realistas (AXA + MAPFRE) que el usuario puede usar
 * de base sin adivinar nombres de columnas ni formatos.
 */
export const TEMPLATE_POLIZAS_EJEMPLOS: ReadonlyArray<ReadonlyArray<string>> = [
  [
    'P-2026-00001',
    'juan.perez@example.com',
    'AXA Seguros',
    'AUTO',
    'Auto Premium',
    '450.00',
    '20000',
    'EUR',
    'ANUAL',
    '2026-01-15',
    '2027-01-15',
    '15',
    'Póliza de auto particular',
    'Renovación automática',
  ],
  [
    'P-2026-00002',
    'maria.garcia@example.com',
    'MAPFRE',
    'HOGAR',
    'Hogar Esencial',
    '320.50',
    '150000',
    'EUR',
    'ANUAL',
    '2026-02-01',
    '2027-02-01',
    '12',
    'Vivienda habitual en Madrid',
    'Cliente premium',
  ],
] as const;

/**
 * Genera el CSV completo de la plantilla de Pólizas. Útil cuando se
 * necesite sólo el string (p. ej. para servirlo desde una ruta API).
 */
export function buildTemplatePolizas(options?: BuildCsvOptions): string {
  return buildCsv(
    [...TEMPLATE_POLIZAS_COLUMNS],
    TEMPLATE_POLIZAS_EJEMPLOS.map(row => [...row]),
    options,
  );
}

export const TEMPLATE_POLIZAS_FILENAME = 'template-importacion-polizas.csv';

/**
 * Columnas esperadas por el importador de Aseguradoras (Fase 2, Bloques 1 y 2).
 * Definidas al modo de TEMPLATE_POLIZAS_COLUMNS para que el importador futuro
 * sólo tenga que añadir ejemplos y un filename. Sin filas de ejemplo aún
 * (pendiente de nomenclatura canónica del broker; ver
 * docs/plans/aseguradora-6-bloques-plan.md).
 */
export const TEMPLATE_ASEGURADORAS_COLUMNS: readonly string[] = [
  'nombre',
  'razonSocial',
  'nombreComercial',
  'nif',
  'regimenFiscal',
  'direccion',
  'codigoPostal',
  'provincia',
  'pais',
  'telefono',
  'email',
  'web',
  'numeroRegistro',
  'ramosAutorizados',
  'fechaVigenciaLicenciaInicio',
  'fechaVigenciaLicenciaFin',
  'notas',
] as const;

export const TEMPLATE_ASEGURADORAS_FILENAME = 'template-importacion-aseguradoras.csv';

/**
 * Columnas esperadas por el importador de Productos de seguros.
 * Sin filas de ejemplo aún (pendiente de primera cartera de prueba).
 */
export const TEMPLATE_PRODUCTOS_COLUMNS: readonly string[] = [
  'aseguradoraNombre',
  'nombre',
  'ramo',
  'tipoProducto',
  'descripcion',
  'primaMinima',
  'primaMaxima',
  'sumaAseguradaDefault',
  'comisionPctDefault',
  'moneda',
  'activo',
] as const;

export const TEMPLATE_PRODUCTOS_FILENAME = 'template-importacion-productos.csv';
