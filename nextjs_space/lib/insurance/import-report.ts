/**
 * Reporte estructurado de una importación de pólizas.
 *
 * El importer guarda en BD y devuelve al cliente un `ImportReport` con:
 *   - Conteos globales (total, importadas, fallidas).
 *   - Detalle por fila fallida: número de fila (1-indexado), motivo legible,
 *     lista de campos faltantes, snapshot de los datos crudos enviados por
 *     el usuario.
 *   - Resumen de entidades creadas: clientes (nombre + email), aseguradoras
 *     y productos con su ramo.
 *
 * Adicionalmente `renderReportAsCsv` produce un CSV multi-sección apto
 * para descargar desde la UI (compatible RFC 4180, BOM UTF-8, CRLF).
 */

import { escapeCsv, buildCsv } from './csv-template';

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export interface ImportRowError {
  /**
   * Número de fila 1-indexado incluyendo el header (la fila 2 es el primer
   * registro). Es el mismo valor que muestra Excel al usuario, así puede
   * cruzar la referencia directo con su archivo.
   */
  fila: number;
  /** Número de póliza crudo (útil para que el usuario ubique el error rápido). */
  numeroPoliza?: string;
  cliente?: string;
  aseguradora?: string;
  /** Motivo legible (ej: "Datos incompletos", "Póliza duplicada", "Fecha inválida"). */
  motivo: string;
  /** Detalle adicional cuando aplica (mensaje del throw). */
  detalle?: string;
  /** Campos que faltaron o eran inválidos (clave del header esperado). */
  camposFaltantes?: string[];
  /** Snapshot de la fila completa del CSV (útil cuando el error viene de la fila entera). */
  datosCrudos: Record<string, string>;
}

export interface CrearCliente {
  nombre: string;
  email: string | null;
  telefono: string | null;
  fueCreado: boolean;
}

export interface CrearAseguradora {
  nombre: string;
  fueCreada: boolean;
}

export interface CrearProducto {
  nombre: string;
  ramo: string;
  aseguradora: string;
  /** Nombre de la aseguradora asociada al producto (cuando se reporta desde import). */
  aseguradoraNombre?: string;
  fueCreado: boolean;
}

export interface ImportCreatedSummary {
  clientes: CrearCliente[];
  aseguradoras: CrearAseguradora[];
  productos: CrearProducto[];
}

export interface ImportReport {
  fileName: string;
  fecha: string;
  totalRows: number;
  importadas: number;
  fallidas: number;
  errores: ImportRowError[];
  creadas: ImportCreatedSummary;
  /**
   * ID del insuranceImportLog persistido (para auditoría o descarga async).
   * Opcional: si el importador no lo creó (ej: error antes de llegar al
   * ciclo), el campo queda undefined.
   */
  logId?: string;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export interface BuildImportReportInput {
  fileName: string;
  totalRows: number;
  errores: ImportRowError[];
  creadas: ImportCreatedSummary;
  importadas: number;
  fecha?: string;
  logId?: string;
}

/**
 * Construye el `ImportReport` validando conteos. `fallidas` se calcula
 * como `totalRows - importadas` para que la UI no tenga que hacer la resta.
 */
export function buildImportReport(input: BuildImportReportInput): ImportReport {
  const importadas = Math.max(0, Math.min(input.totalRows, Math.floor(input.importadas)));
  const fallidas = Math.max(0, input.totalRows - importadas);
  return {
    fileName: input.fileName,
    fecha: input.fecha ?? new Date().toISOString(),
    totalRows: Math.max(0, Math.floor(input.totalRows)),
    importadas,
    fallidas,
    errores: input.errores,
    creadas: input.creadas,
    logId: input.logId,
  };
}

/**
 * Acota el array de errores a `maxErrores` para no inflar el JSON ni el CSV
 * cuando un CSV tiene miles de filas inválidas. Los conteos siguen siendo
 * exactos; sólo se descarta el detalle de los sobrantes.
 */
export function capErrores(errores: ImportRowError[], maxErrores = 200): ImportRowError[] {
  if (errores.length <= maxErrores) return errores;
  return errores.slice(0, maxErrores);
}

// ─── Render CSV multi-sección ────────────────────────────────────────────────

/**
 * Emite el reporte como un CSV multi-sección. Usa líneas en blanco y
 * secciones con cabecera propia para que el Excel lo lea claro:
 *
 *   # REPORTE DE IMPORTACIÓN
 *   archivo,fecha,total,importadas,fallidas
 *   carteracol.csv,2026-…,150,142,8
 *
 *   # ERRORES POR FILA
 *   fila,numeroPoliza,cliente,aseguradora,motivo,detalle,camposFaltantes
 *   …una fila por error…
 *
 *   # CLIENTES CREADOS
 *   nombre,email,telefono,fueCreado
 *   …una fila por cliente…
 *
 *   # ASEGURADORAS CREADAS
 *   nombre,fueCreada
 *   …una fila por aseguradora…
 *
 *   # PRODUCTOS CREADOS
 *   nombre,ramo,aseguradora,fueCreado
 *   …una fila por producto…
 *
 * Las secciones se omiten cuando no tienen contenido. Compatible con el
 * parser CSV genérico (RFC 4180).
 */
export function renderReportAsCsv(report: ImportReport): string {
  const secciones: string[] = [];

  // Resumen
  secciones.push(buildCsv(
    ['archivo', 'fecha', 'total', 'importadas', 'fallidas'],
    [[report.fileName, report.fecha, String(report.totalRows), String(report.importadas), String(report.fallidas)]],
  ));

  // Errores
  if (report.errores.length > 0) {
    secciones.push(''); // separador de sección
    secciones.push(buildCsv(
      [
        'fila',
        'numeroPoliza',
        'cliente',
        'aseguradora',
        'motivo',
        'detalle',
        'camposFaltantes',
        'datosCrudos',
      ],
      report.errores.map(e => [
        String(e.fila),
        e.numeroPoliza ?? '',
        e.cliente ?? '',
        e.aseguradora ?? '',
        e.motivo,
        e.detalle ?? '',
        e.camposFaltantes?.join('|') ?? '',
        JSON.stringify(e.datosCrudos),
      ]),
    ));
  }

  // Clientes creados
  if (report.creadas.clientes.length > 0) {
    secciones.push('');
    secciones.push(buildCsv(
      ['nombre', 'email', 'telefono', 'fueCreado'],
      report.creadas.clientes.map(c => [c.nombre, c.email ?? '', c.telefono ?? '', c.fueCreado ? 'sí' : 'no']),
    ));
  }

  // Aseguradoras creadas
  if (report.creadas.aseguradoras.length > 0) {
    secciones.push('');
    secciones.push(buildCsv(
      ['nombre', 'fueCreada'],
      report.creadas.aseguradoras.map(a => [a.nombre, a.fueCreada ? 'sí' : 'no']),
    ));
  }

  // Productos creados
  if (report.creadas.productos.length > 0) {
    secciones.push('');
    secciones.push(buildCsv(
      ['nombre', 'ramo', 'aseguradora', 'fueCreado'],
      report.creadas.productos.map(p => [p.nombre, p.ramo, p.aseguradora, p.fueCreado ? 'sí' : 'no']),
    ));
  }

  // Join con CRLF y dejar una última línea completa sin EOL extra (RFC 4180).
  return secciones.join('\r\n');
}

/**
 * Nombre estable para el archivo descargado. Incluye la fecha en formato
 * yyyy-mm-dd para que el broker pueda ordenar varios uploads.
 *
 * Sanitización estricta: colapsa secuencias de dots (`..` -> `_`) y slashs
 * antes que nada para neutralizar traversal, luego reemplaza el resto de
 * caracteres inseguros. Si tras limpieza el nombre queda vacío (caso
 * patológico: archivo con sólo símbolos), cae al fallback `polizas`.
 */
export function buildReportFilename(fileName: string, fecha = new Date()): string {
  const fechaStr = fecha.toISOString().slice(0, 10);
  const safe = fileName
    // 1) colapsar runs de 2+ puntos (path traversal) ANTES del resto
    .replace(/\.\.+/g, '_')
    // 2) cualquier run de separadores de ruta
    .replace(/[/\\]+/g, '_')
    // 3) cualquier otro carácter no-ASCII-seguro
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 60)
    // 4) eliminar extensión origen
    .replace(/\.(csv|xlsx|xls)$/i, '');
  // 5) si quedó vacío o todo underscores, fallback al nombre genérico
  const trimmed = safe.replace(/_+$/, '');
  return `reporte-importacion-${trimmed.length === 0 ? 'polizas' : trimmed}-${fechaStr}.csv`;
}

// Re-exportamos `escapeCsv` para compatibilidad con tests externos.
export { escapeCsv };
