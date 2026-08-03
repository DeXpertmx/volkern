/**
 * csv-bulk — Parser y serializador especializado para wizard multi-tenant
 * (`/admin/partner-onboarding/bulk`).
 *
 * Características:
 *   • Detecta automáticamente el delimitador (',' o ';') mirando cuál
 *     produce más columnas consistentes en las primeras 5 filas.
 *   • Tolera BOM UTF-8 (\uFEFF) al inicio del archivo.
 *   • Tolera CRLF y LF como separador de líneas.
 *   • Tolera comillas dobles RFC-4180 (e.g. valor con coma entre comillas).
 *   • Devuelve errores con rowNum para que el operador pueda señalar el
 *     problema exacto en el preview.
 *   • El serializador es escapeCsv-compatible con csv-template.ts.
 *
 * Headers que reconocemos (case-insensitive + tolerant whitespace):
 *   empresa | subdomain | email | password | moneda | vertical | telegramBotName | telegramBotToken
 */
import { escapeCsv as templateEscapeCsv } from './csv-template';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type CsvDelimiter = ',' | ';';

export interface BulkParsedRow {
  /** 1-indexed en el archivo original (sin contar header). */
  rowNum: number;
  empresa: string;
  subdomain: string;
  email: string;
  password?: string;
  moneda?: string;
  vertical?: string;
  telegramBotName?: string;
  telegramBotToken?: string;
}

export interface BulkParseError {
  rowNum: number | null; // null = header error
  message: string;
  raw?: string;
}

export interface BulkParseResult {
  delimiter: CsvDelimiter | null;
  headers: string[];
  rows: BulkParsedRow[];
  errors: BulkParseError[];
  /** Filas detectadas correctamente pero row completa con N campos vacíos. */
  emptyRows: number[];
}

// ─── Detection + parsing ─────────────────────────────────────────────────────

const RECOGNIZED_HEADERS: Record<string, keyof BulkParsedRow> = {
  empresa: 'empresa',
  company: 'empresa',
  nombre: 'empresa',
  subdomain: 'subdomain',
  subdominio: 'subdomain',
  slug: 'subdomain',
  email: 'email',
  correo: 'email',
  password: 'password',
  contrasena: 'password',
  contraseña: 'password',
  moneda: 'moneda',
  currency: 'moneda',
  vertical: 'vertical',
  telegram: 'telegramBotName', // alias al botName
  telegram_bot_name: 'telegramBotName',
  telegrambotname: 'telegramBotName',
  bot_name: 'telegramBotName',
  botname: 'telegramBotName',
  telegram_bot_token: 'telegramBotToken',
  telegrambottoken: 'telegramBotToken',
  bot_token: 'telegramBotToken',
  bottoken: 'telegramBotToken',
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_').replace(/^$/u, '');
}

function recognizeHeader(h: string): keyof BulkParsedRow | null {
  const norm = normalizeHeader(h);
  return RECOGNIZED_HEADERS[norm] ?? null;
}

/**
 * Cuenta cuántos delimitadores aparecen en una línea (sumando 1 al final).
 * Usado para detectar delimitador mirando la línea con más campos.
 */
function countFields(line: string, delim: string): number {
  // Manejo simple sin quotes aquí — sólo para detectar.
  // Si una línea tiene comillas, el conteo puede subestimar, pero para
  // detectar el delimitador entre ',' y ';' basta con mirar las primeras
  // filas que rara vez tienen comillas.
  return line.split(delim).length;
}

/**
 * Detecta el delimitador: el que produce el MÁXIMO número de columnas
 * consistentes (>50%) en las primeras 5 filas CON CONTENIDO (excluyendo
 * filas donde todos los fields son "" — e.g. ",,,", que contribuyen solo
 * inconsistencias).
 *
 * Esto arregla un bug donde un CSV con header válido + 1 fila válida + N filas
 * vacías (`,,,`) hacía imposible la detección porque las filas vacías tienen
 * +1 campo que las válidas y rompían el "consistent >= 50%".
 *
 * Si empate, prefiere ','.
 */
export function detectDelimiter(text: string): CsvDelimiter | null {
  // Strip BOM
  const clean = text.replace(/^\uFEFF/, '');
  const allLines = clean.split(/\r?\n/).filter(l => l.length > 0);
  if (allLines.length === 0) return null;

  // Para detección, descartar filas donde todos los campos son "" (filas vacías).
  const firstLines = allLines
    .filter(l => l.split(/[,;]/).some(part => part.trim().length > 0))
    .slice(0, 5);
  if (firstLines.length === 0) return null;

  for (const delim of [',', ';'] as CsvDelimiter[]) {
    const counts = firstLines.map(l => countFields(l, delim));
    const max = Math.max(...counts);
    const consistent = counts.filter(c => c === max).length;
    if (consistent >= Math.ceil(firstLines.length / 2) && max >= 2) {
      return delim;
    }
  }
  return null;
}

/**
 * Parser RFC-4180 simplificado: soporta comillas dobles, CRLF/LF, comillas
 * escapadas como "" dentro del valor.
 */
export function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === delim) {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parsea el CSV completo. Devuelve headers + rows + errors + el delimiter detectado.
 *
 * - rowNum empieza en 1 (después del header).
 * - Si una fila tiene 0 o 1 campos tras split, va a emptyRows (no es error).
 * - Si una fila tiene el número correcto de campos pero los requeridos
 *   (empresa/subdomain/email) están vacíos, va a errors.
 * - Si el archivo tiene 0 filas válidas, devuelve errors con rowNum=null.
 */
export function parseBulkCsv(text: string): BulkParseResult {
  const noBom = text.replace(/^\uFEFF/, '');
  const lines = noBom.split(/\r?\n/).filter(l => l.length > 0);

  if (lines.length === 0) {
    return { delimiter: null, headers: [], rows: [], errors: [
      { rowNum: null, message: 'El CSV está vacío.' },
    ], emptyRows: [] };
  }

  const delimiter = detectDelimiter(noBom);
  if (!delimiter) {
    return { delimiter: null, headers: [], rows: [], errors: [
      { rowNum: null, message: 'No se pudo detectar el delimitador (coma o punto y coma son los soportados).' },
    ], emptyRows: [] };
  }

  const rawHeader = parseCsvLine(lines[0], delimiter);
  const headers = rawHeader.map(h => h.trim());
  const headerMap = headers.map(h => recognizeHeader(h));
  const errors: BulkParseError[] = [];
  if (headerMap.every(h => h === null)) {
    errors.push({
      rowNum: null,
      message: `Ninguna columna reconocida. Headers recibidos: ${JSON.stringify(headers)}. Esperadas: empresa, subdomain, email, password, moneda, vertical, telegramBotName, telegramBotToken.`,
    });
  }

  const rows: BulkParsedRow[] = [];
  const emptyRows: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i; // 1-indexed (excluding header)
    const fields = parseCsvLine(lines[i], delimiter);
    // Si la fila tiene menos campos que headers, splitted con '' vacío.
    while (fields.length < headers.length) fields.push('');

    const row: BulkParsedRow = { rowNum, empresa: '', subdomain: '', email: '' };
    for (let col = 0; col < headers.length; col++) {
      const key = headerMap[col];
      const value = (fields[col] ?? '').trim();
      if (key) {
        // Cast a Record<string,string> via unknown (runtime: todos los campos son string;
        // tipado: evita narrowing raro de Partial<> con keys numéricos como rowNum).
        (row as unknown as Record<string, string>)[key] = value;
      }
    }

    // Fila completamente vacía (todos los campos reconocidos están '').
    const allEmpty = ['empresa', 'subdomain', 'email'].every(k => !row[k as keyof BulkParsedRow]);
    if (allEmpty) {
      emptyRows.push(rowNum);
      continue;
    }

    // Validación: los 3 requeridos deben estar presentes.
    const missing: string[] = [];
    if (!row.empresa) missing.push('empresa');
    if (!row.subdomain) missing.push('subdomain');
    if (!row.email) missing.push('email');
    if (missing.length > 0) {
      errors.push({
        rowNum,
        message: `Faltan campos requeridos: ${missing.join(', ')}.`,
        raw: lines[i],
      });
      continue;
    }

    // Validación email ligera
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) {
      errors.push({ rowNum, message: `Email inválido: ${row.email}`, raw: lines[i] });
      continue;
    }

    // Validación subdomain (lowercase + alphanumeric + dash)
    if (!/^[a-z0-9-]{3,40}$/.test(row.subdomain)) {
      errors.push({
        rowNum,
        message: `Subdominio inválido: "${row.subdomain}". Debe ser lowercase, alfanumérico/guión, 3-40 chars.`,
        raw: lines[i],
      });
      continue;
    }

    rows.push(row);
  }

  return { delimiter, headers, rows, errors, emptyRows };
}

// ─── Generación de reporte CSV final ─────────────────────────────────────────

export interface BulkResultRow {
  rowNum: number;
  empresa: string;
  subdomain: string;
  email: string;
  moneda: string;
  /** 'created' | 'duplicate' | 'invalid' | 'error' | 'pending'. */
  status: string;
  tenantId?: string;
  chatwootAccountId?: number;
  telegramInboxId?: number | null;
  /** 'skipped' | 'connected' | null si sin Telegram. */
  telegramStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Moneda segun el endpoint (puede ser inference: EXPLICIT | USER_PROMPT | FALLBACK). */
  monedaInferenciaSource?: string;
}

const REPORT_COLUMNS = [
  { key: 'rowNum',     header: 'row' },
  { key: 'empresa',    header: 'empresa' },
  { key: 'subdomain',  header: 'subdominio' },
  { key: 'email',      header: 'email' },
  { key: 'status',     header: 'status' },
  { key: 'tenantId',   header: 'tenantId' },
  { key: 'chatwootAccountId', header: 'chatwootAccountId' },
  { key: 'telegramStatus',    header: 'telegramStatus' },
  { key: 'telegramInboxId',   header: 'telegramInboxId' },
  { key: 'moneda',     header: 'moneda' },
  { key: 'monedaInferenciaSource', header: 'monedaInferenciaSource' },
  { key: 'errorCode',  header: 'errorCode' },
  { key: 'errorMessage', header: 'errorMessage' },
] as const;

/**
 * Serializa el resultado del bulk a CSV RFC-4180 (con BOM UTF-8 para Excel).
 */
export function buildBulkResultCsv(results: BulkResultRow[]): string {
  const BOM = '\uFEFF';
  const headerLine = REPORT_COLUMNS.map(c => templateEscapeCsv(c.header)).join(',');
  const dataLines = results.map(r => REPORT_COLUMNS.map(c => {
    const v = r[c.key as keyof BulkResultRow];
    if (v === undefined || v === null) return '';
    return templateEscapeCsv(String(v));
  }).join(','));
  return BOM + [headerLine, ...dataLines].join('\r\n') + '\r\n';
}

/**
 * Helper para disparar descarga inmediata en el browser.
 * Re-export desde csv-template.ts (helper consolidado).
 */
export { buildBulkResultCsv as _buildBulkResultCsv };
