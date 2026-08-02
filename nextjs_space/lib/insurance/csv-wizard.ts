/**
 * Wizard de import de CSV para el módulo de seguros.
 *
 * Acepta archivos CSV crudos del usuario y:
 *   1. Detecta automáticamente el delimitador (coma, punto y coma o tab).
 *   2. Parsea respetando comillas dobles RFC 4180 y maneja BOM UTF-8.
 *   3. Mapea los headers del usuario (idioma libre, mayúsculas, snake_case,
 *      camelCase, tildes) contra un set canónico de columnas del sistema
 *      usando fuzzy match + sinónimos ES/EN + un score de confianza 0-1.
 *
 * La UI debería mostrar al usuario el mapeo auto-sugerido y dejarle
 * corregir sólo las columnas de baja confianza. Esto elimina la fricción
 * de pedirle "usa exactamente este template" — puede subir el archivo
 * que ya tiene de su sistema legacy sin renombrar columnas.
 */

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type Delimiter = ',' | ';' | '\t';

export interface ParseResult {
  delimiter: Delimiter;
  headers: string[];
  rows: Record<string, string>[];
}

export interface ColumnMatch {
  canonical: string;
  matchedHeader: string | null;
  confidence: number;
  /** Por qué se asignó esa confianza (útil para mostrar al usuario). */
  reason: string;
}

export interface SuggestionResult {
  /** Map canónico -> header del usuario (solo entradas con confidence >= threshold). */
  mapping: Record<string, string>;
  /** Detalle por columna canónica (también incluye las NO matcheadas con confidence 0). */
  matches: ColumnMatch[];
}

// ─── Detección de delimitador ────────────────────────────────────────────────

const DELIMITER_CANDIDATES: readonly Delimiter[] = [',', ';', '\t'];

/**
 * Detecta cuál de los candidatos es el delimitador del CSV. Estrategia:
 * para cada candidato, contar las ocurrencias en las primeras `maxLines`
 * líneas no vacías (saltando la primera cabecera) y elegir el que tenga la
 * mayoría de líneas con el mismo conteo — los buenos delimitadores producen
 * el mismo número por línea en CSV bien formado.
 *
 * Si hay empate, prioridad: `,` > `;` > `\t` (orden de DELIMITER_CANDIDATES).
 * Si ninguno encaja, fallback a `,`.
 */
export function detectDelimiter(text: string, maxLines = 10): Delimiter {
  const lineas = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lineas.length < 2) return ',';

  const muestras = lineas.slice(1, 1 + maxLines);
  if (muestras.length === 0) return ',';

  let mejor: { delim: Delimiter; score: number } | null = null;
  for (const delim of DELIMITER_CANDIDATES) {
    const conteos = muestras.map(l => contarDelims(l, delim));
    if (conteos.some(c => c === 0)) continue; // muy pocas separadas → probablemente no
    const conteoFrecuente = mode(conteos);
    if (conteoFrecuente === 0) continue;
    const score = conteos.filter(c => c === conteoFrecuente).length;
    const rec = { delim, score };
    if (!mejor || score > mejor.score) mejor = rec;
  }

  return mejor ? mejor.delim : ',';
}

function contarDelims(linea: string, delim: Delimiter): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (inQuotes && linea[i + 1] === '"') {
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delim) count++;
  }
  return count;
}

function mode(conteos: number[]): number {
  const counts = new Map<number, number>();
  for (const c of conteos) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bestVal = 0;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      bestVal = v;
      bestCount = c;
    }
  }
  return bestVal;
}

// ─── Normalización de headers ────────────────────────────────────────────────

/**
 * Normaliza un header para matching fuzzy: lowercase, sin diacríticos
 * (NFD + remove combining marks), y todo carácter no-alphanumeric pasa a
 * nada (espacios, `_`, `-`, `.`, `/`, `·`, `º`…).
 *
 * Ejemplos:
 *   `Póliza nº`  -> `polizan`
 *   `Cliente_Email` -> `clienteemail`
 *   `Fecha Vencimiento` -> `fechavencimiento`
 *   `Asegurado Nombre` -> `aseguradosnombre` (concatena, sin espacios)
 */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ─── Sinónimos por campo canónico (polizas) ─────────────────────────────────

/**
 * Sinónimos comunes en ES/EN para cada campo canónico de Pólizas. Las claves
 * y valores son los headers pre-cargados por el broker — al matchear se
 * normalizan ambos lados, así espacios y mayúsculas no importan.
 */
export const POLIZAS_COLUMN_SYNONYMS: Record<string, readonly string[]> = {
  numeroPoliza: [
    'poliza', 'policy', 'numeropoliza', 'numero de poliza', 'nro poliza',
    'nro', 'pol number', 'policynumber', 'referencia', 'ref',
  ],
  clienteNombre: [
    'cliente', 'nombre', 'nombre cliente', 'cliente nombre', 'client name',
    'name', 'tomador', 'asegurado', 'customer', 'insured', 'asegurado nombre',
  ],
  clienteEmail: [
    'email', 'mail', 'correo', 'correo electronico', 'email cliente',
    'cliente email', 'customer email', 'contactemail',
  ],
  clienteTelefono: [
    'telefono', 'tel', 'phone', 'movil', 'celular', 'cliente telefono',
    'customer phone', 'phonenumber', 'contactphone',
  ],
  aseguradoraNombre: [
    'aseguradora', 'compania', 'cia', 'aseguradora nombre',
    'insurance', 'insurance company', 'insurer', 'carrier',
    'insurancecarrier', 'asegurador',
  ],
  productoSeguroNombre: [
    'producto', 'product', 'plan', 'cobertura', 'coverage', 'product name',
    'producto seguro', 'tipopoliza', 'tipopoliza',
  ],
  ramo: [
    'ramo', 'line', 'type', 'modality', 'ramo de seguro', 'business line',
    'ramodelseguro', 'tiporamo', 'insurance line',
  ],
  primaAnual: [
    'prima', 'prima anual', 'anual', 'premium', 'annual premium',
    'premiumamount', 'price', 'cost', 'costopremium',
  ],
  sumaAsegurada: [
    'suma', 'suma asegurada', 'sum', 'sum insured', 'insured amount',
    'capital sum', 'cobertura total', 'valor asegurado',
  ],
  moneda: ['moneda', 'currency', 'curr', 'divisa'],
  formaPago: ['pago', 'forma pago', 'payment', 'billing', 'metodo pago'],
  fechaInicio: [
    'fecha inicio', 'inicio', 'startdate', 'start',
    'vigencia desde', 'fecha efectiva', 'fechaalta',
    'fecha de inicio', 'effective date',
  ],
  fechaVencimiento: [
    'fecha vencimiento', 'vencimiento', 'venc', 'vence', 'expiry', 'enddate',
    'vigencia hasta', 'fecha fin', 'expiry date', 'fecha de vencimiento',
    'expiration', 'fechavto',
  ],
  comisionPct: [
    'comision', 'comision pct', 'commission', 'fee', 'pct',
    'porcentaje', 'commission rate', 'commissionpct', 'comm %',
  ],
  descripcion: ['descripcion', 'description', 'desc', 'detalle', 'detail'],
  notas: ['notas', 'notes', 'comments', 'comentarios', 'observaciones', 'remarks'],
};

// ─── Sinónimos (aseguradoras) — Bloques 1-2 del plan 6-bloques ───────────────

/**
 * Sinónimos ES/EN para los campos canónicos de Aseguradoras. Cubre los
 * Bloques 1 (Identificación Legal/Fiscal) y 2 (Regulación/Licencias) del
 * plan de los 6 bloques. Los Bloques 3-6 se cubrirán cuando el schema
 * crezca y agreguemos más canónicos.
 */
export const ASEGURADORAS_COLUMN_SYNONYMS: Record<string, readonly string[]> = {
  nombre: [
    'aseguradora', 'compania', 'cia', 'nombre', 'name', 'insurance company',
    'razon social', 'insurer', 'carrier', 'asegurador', 'company',
  ],
  razonSocial: [
    'razon social', 'razonsocial', 'legal name', 'registered name',
    'nombre legal', 'social denomination', 'business name',
  ],
  nombreComercial: [
    'nombre comercial', 'nombrecomercial', 'trade name', 'brand', 'marca',
    'commercial name', 'doing business as', 'dba',
  ],
  identificacionFiscal: [
    'ruc', 'nit', 'rfc', 'cif', 'nif', 'ein', 'tax id', 'taxid',
    'identificacion fiscal', 'identificacionfiscal', 'tax identification',
  ],
  domicilioFiscal: [
    'domicilio', 'domicilio fiscal', 'direccion fiscal', 'address',
    'fiscal address', 'tax address', 'registered address',
  ],
  codigoPostal: [
    'cp', 'zip', 'zipcode', 'zip code', 'postal code', 'postalcode',
    'codigo postal', 'codigopostal', 'postcode',
  ],
  provincia: [
    'provincia', 'state', 'region', 'estado', 'municipio',
  ],
  pais: [
    'pais', 'country', 'nacion', 'nation',
  ],
  regimenFiscal: [
    'regimen', 'regimen fiscal', 'tax regime', 'tax regime type',
    'tax status', 'fiscal status', 'tax classification',
  ],
  numeroRegistro: [
    'registro', 'numero registro', 'licencia', 'numero licencia',
    'registration', 'registration number', 'license number',
    'license', 'regulatory license', 'regulatory number',
  ],
  licenciaInicio: [
    'fecha inicio licencia', 'licencia inicio', 'vigencia licencia inicio',
    'license start', 'license startdate', 'licensefrom',
  ],
  licenciaVencimiento: [
    'fecha vencimiento licencia', 'licencia vencimiento',
    'vigencia licencia fin', 'license expiry', 'license enddate',
    'licenseto', 'licencia vence',
  ],
  ramosAutorizados: [
    'ramos', 'ramos autorizados', 'authorized lines', 'business lines',
    'productos autorizados', 'authorized products', 'authorized ramos',
    'lines of business', 'lob',
  ],
  telefono: [
    'telefono', 'tel', 'phone', 'telefono contacto', 'contact phone',
    'contactphone', 'phonenumber', 'oficina',
  ],
  email: [
    'email', 'mail', 'correo', 'correo electronico', 'contactemail',
    'contact email', 'corporate email',
  ],
  sitioWeb: [
    'sitio web', 'website', 'web', 'url', 'pagina', 'homepage',
  ],
  representanteLegal: [
    'representante legal', 'representantelegal', 'legal representative',
    'rep legal', 'signatory', 'authorized representative',
  ],
  notas: ['notas', 'notes', 'comments', 'comentarios', 'observaciones', 'remarks'],
};

// ─── Sinónimos (productos) ─────────────────────────────────────────────────

/**
 * Sinónimos ES/EN para los campos canónicos de Productos de seguros. Cada
 * producto pertenece a una aseguradora (referenciada por nombre en el CSV).
 */
export const PRODUCTOS_COLUMN_SYNONYMS: Record<string, readonly string[]> = {
  nombre: [
    'producto', 'producto seguro', 'plan', 'cobertura', 'coverage',
    'product', 'product name', 'nombre producto', 'nombre',
  ],
  aseguradoraNombre: [
    'aseguradora', 'compania', 'cia', 'aseguradora nombre',
    'insurance', 'insurance company', 'insurer', 'carrier',
    'asegurador', 'company',
  ],
  ramo: [
    'ramo', 'line', 'type', 'modality', 'ramo de seguro', 'business line',
    'ramodelseguro', 'tiporamo', 'insurance line', 'categoria',
  ],
  primaReferencia: [
    'prima', 'prima referencia', 'referencia', 'premium', 'reference premium',
    'premiumreference', 'starting premium', 'base premium',
  ],
  comisionPorDefecto: [
    'comision', 'comision defecto', 'comision por defecto', 'commission',
    'default commission', 'commissiondefault', 'commission pct',
  ],
  moneda: ['moneda', 'currency', 'curr', 'divisa'],
  descripcion: ['descripcion', 'description', 'desc', 'detalle', 'detail'],
  activo: ['activo', 'active', 'habilitado', 'enabled', 'disponible'],
  notas: ['notas', 'notes', 'comments', 'comentarios', 'observaciones', 'remarks'],
};

// ─── Matching fuzzy con confianza ───────────────────────────────────────────

/**
 * Devuelve la mejor coincidencia entre un header del usuario y un campo
 * canónico (considerando también sus sinónimos).
 *
 * Score:
 *   - 1.00: match exacto (normalizado) contra el canonical mismo
 *   - 0.95: match exacto contra un sinónimo
 *   - 0.85: uno contiene al otro O un sinónimo contiene al header
 *   - 0.65: prefijo común de ≥ 3 chars
 *   - 0.00: sin coincidencia
 */
export function detectColumn(
  userHeader: string,
  canonical: string,
  synonyms: readonly string[] = []
): { confidence: number; reason: string } {
  const norm = normalizeHeader(userHeader);
  const canonNorm = normalizeHeader(canonical);
  const synsNorm = synonyms.map(normalizeHeader);

  // 1. Exact match
  if (norm === canonNorm) return { confidence: 1.0, reason: 'Exacto' };
  if (synsNorm.includes(norm)) return { confidence: 0.95, reason: 'Sinónimo' };

  // 2. Contains bidireccional (entre header y canonical)
  if (norm.length >= 3 && canonNorm.length >= 3) {
    if (canonNorm.includes(norm)) return { confidence: 0.85, reason: 'Contiene' };
    if (norm.includes(canonNorm)) return { confidence: 0.85, reason: 'Sub-cadena' };
  }

  // 3. Contains entre header y algún sinónimo (cualquier dirección, ambas ≥ 3 chars).
  //    Ej.: header "Asegurado Nombre Completo" contiene el sinónimo normalizado
  //    "aseguradosnombre"; o header corto "clienteemail" contiene el sinónimo
  //    "cliente".
  for (const synNorm of synsNorm) {
    if (synNorm.length >= 3 && norm.length >= 3) {
      if (synNorm.includes(norm)) return { confidence: 0.85, reason: 'Sinónimo contiene' };
      if (norm.includes(synNorm)) return { confidence: 0.85, reason: 'Header contiene sinónimo' };
    }
  }

  // 4. Prefijo común
  const prefComun = longestCommonPrefix(norm, canonNorm);
  if (prefComun.length >= 3) return { confidence: 0.65, reason: 'Prefijo' };

  return { confidence: 0, reason: 'Sin match' };
}

function longestCommonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/**
 * Mapea los headers del usuario contra un diccionario de sinónimos (cualquier
 * entidad: pólizas, aseguradoras, productos…) usando una asignación GREEDY por
 * header único:
 *
 *   1. Calcula todas las parejas (header, canonical, confianza).
 *   2. Ordena por confianza descendente.
 *   3. Itera: si tanto el header como el canonical están libres, asigna.
 *
 * Así un mismo header no se asigna a dos canonicales distintos (evita la
 * ambigüedad de `nombre` -> `clienteNombre` AND `numeroPolizaNombre`).
 */
export function suggestEntityMapping(
  userHeaders: string[],
  synonyms: Record<string, readonly string[]>,
  threshold = 0.6
): SuggestionResult {
  const canonicos = Object.keys(synonyms);
  const candidatas: Array<{ header: string; canonical: string; confidence: number; reason: string }> = [];

  for (const canon of canonicos) {
    const syns = synonyms[canon];
    for (const h of userHeaders) {
      const { confidence, reason } = detectColumn(h, canon, syns);
      if (confidence >= threshold) {
        candidatas.push({ header: h, canonical: canon, confidence, reason });
      }
    }
  }
  candidatas.sort((a, b) => b.confidence - a.confidence);

  const usedHeaders = new Set<string>();
  const usedCanonicals = new Set<string>();
  const mapping: Record<string, string> = {};
  const matchesByCanonical = new Map<string, ColumnMatch>();

  for (const c of candidatas) {
    if (usedHeaders.has(c.header) || usedCanonicals.has(c.canonical)) continue;
    usedHeaders.add(c.header);
    usedCanonicals.add(c.canonical);
    mapping[c.canonical] = c.header;
    matchesByCanonical.set(c.canonical, {
      canonical: c.canonical,
      matchedHeader: c.header,
      confidence: c.confidence,
      reason: c.reason,
    });
  }

  const matches: ColumnMatch[] = [];
  for (const canon of canonicos.sort()) {
    matches.push(
      matchesByCanonical.get(canon) ?? {
        canonical: canon,
        matchedHeader: null,
        confidence: 0,
        reason: 'Sin match',
      }
    );
  }

  return { mapping, matches };
}

/**
 * Wrapper específico para Pólizas. Mantenido por compatibilidad con código
 * existente que ya lo consumía — toda la lógica real vive en
 * `suggestEntityMapping`.
 */
export function suggestPolizasMapping(
  userHeaders: string[],
  threshold = 0.6
): SuggestionResult {
  return suggestEntityMapping(userHeaders, POLIZAS_COLUMN_SYNONYMS, threshold);
}

/** Wrapper específico para Aseguradoras (Bloques 1-2 del plan). */
export function suggestAseguradorasMapping(
  userHeaders: string[],
  threshold = 0.6
): SuggestionResult {
  return suggestEntityMapping(userHeaders, ASEGURADORAS_COLUMN_SYNONYMS, threshold);
}

/** Wrapper específico para Productos. */
export function suggestProductosMapping(
  userHeaders: string[],
  threshold = 0.6
): SuggestionResult {
  return suggestEntityMapping(userHeaders, PRODUCTOS_COLUMN_SYNONYMS, threshold);
}

// ─── Parser que respeta BOM + delimitador detectado ──────────────────────────

/**
 * Parsea el texto completo del CSV aplicando:
 *   1. Quita BOM UTF-8 si está presente.
 *   2. Detecta el delimitador con `detectDelimiter`.
 *   3. Separa líneas respetando comillas dobles RFC 4180.
 *   4. Empareja por posición (líneas más cortas dejan huecos como `''`).
 */
export function parseCSVSmart(text: string): ParseResult {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const delimiter = detectDelimiter(text);
  const lineas = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lineas.length < 2) return { delimiter, headers: [], rows: [] };

  const rawHeaders = parseCSVLine(lineas[0], delimiter);
  // Dedupe de headers duplicados: si dos columnas comparten nombre, las
  // siguientes reciben sufijo [2], [3], … para que no se pisen en el
  // Record<string,string> (era un bug silencioso que hacía perder datos).
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (const h of rawHeaders) {
    const trimmed = h.trim();
    const n = (seen.get(trimmed) ?? 0) + 1;
    seen.set(trimmed, n);
    headers.push(n === 1 ? trimmed : `${trimmed}[${n}]`);
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const valores = parseCSVLine(lineas[i], delimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (valores[j] ?? '').trim();
    }
    rows.push(row);
  }
  return { delimiter, headers, rows };
}

function parseCSVLine(linea: string, delim: Delimiter): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (inQuotes && linea[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delim) {
      result.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}
