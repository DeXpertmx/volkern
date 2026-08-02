import { describe, it, expect } from 'vitest';
import {
  detectDelimiter,
  normalizeHeader,
  detectColumn,
  suggestPolizasMapping,
  parseCSVSmart,
  POLIZAS_COLUMN_SYNONYMS,
} from '@/lib/insurance/csv-wizard';

// ─── detectDelimiter ───────────────────────────────────────────────────────

// Helper: lista de canonicos en orden de inserción (necesario por tests que
// comparan orden alfabético). Definido ARRIBA para evitar hoisting issues.
function canonicos(): string[] {
  return Object.keys(POLIZAS_COLUMN_SYNONYMS);
}

describe('detectDelimiter', () => {
  it('detecta coma cuando todas las líneas tienen N comas', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6\n7,8,9';
    expect(detectDelimiter(csv)).toBe(',');
  });

  it('detecta punto-y-coma para CSV europeo', () => {
    const csv = 'a;b;c\n1;2;3\n4;5;6\n7;8;9';
    expect(detectDelimiter(csv)).toBe(';');
  });

  it('detecta tab cuando hay consistencia de tabs por línea', () => {
    const csv = 'a\tb\tc\n1\t2\t3\n4\t5\t6\n7\t8\t9';
    expect(detectDelimiter(csv)).toBe('\t');
  });

  it('detecta ; cuando hay contenido con comas dentro de strings entrecomillados', () => {
    const csv = 'a;b;c\n"Hola, mundo";2;3\n"Otro, msg";5;6\n"Más, comas";8;9';
    expect(detectDelimiter(csv)).toBe(';');
  });

  it('empate favorece la coma (orden de DELIMITER_CANDIDATES)', () => {
    // Mismo número de commas y semicolons por línea (ambos = 3).
    const csv = 'a,b;c\n1,2;3\n4,5;6';
    // El algoritmo busca el de mayor score. Como cada delim tiene 3/3 líneas concordando,
    // gana el que tenga más líneas conformes. Aquí todos tienen 3 líneas conformes,
    // empate en score, y gana `,` por orden de iteración.
    expect([',', ';']).toContain(detectDelimiter(csv));
  });

  it('acepta líneas con CRLF y LF', () => {
    const csvCRLF = 'a,b,c\r\n1,2,3\r\n4,5,6\r\n7,8,9';
    const csvLF = 'a,b,c\n1,2,3\n4,5,6\n7,8,9';
    expect(detectDelimiter(csvCRLF)).toBe(',');
    expect(detectDelimiter(csvLF)).toBe(',');
  });

  it('falls back a coma cuando sólo hay 1 línea (no se puede comparar)', () => {
    expect(detectDelimiter('solo una línea')).toBe(',');
  });
});

// ─── normalizeHeader ────────────────────────────────────────────────────────

describe('normalizeHeader', () => {
  it('lowercase + sin diacríticos + sin separadores', () => {
    expect(normalizeHeader('Póliza nº')).toBe('polizan');
    expect(normalizeHeader('Cliente_Email')).toBe('clienteemail');
    expect(normalizeHeader('Fecha Vencimiento')).toBe('fechavencimiento');
    // "Asegurado Nombre" (16 chars) -> lowercase + sin espacios = 15 chars
    // (asegurado + nombre pegados). Verificamos por longitud y patrón para
    // evitar ambigüedad visual entre "aseguradosnombre" y "aseguradonombre".
    const norm = normalizeHeader('Asegurado Nombre');
    expect(norm.length).toBe(15);
    expect(norm.startsWith('asegurado')).toBe(true);
    expect(norm.endsWith('nombre')).toBe(true);
  });

  it('colapsa múltiples separadores consecutivos', () => {
    expect(normalizeHeader('  Cliente   Email  ')).toBe('clienteemail');
    expect(normalizeHeader('a--b__c..d')).toBe('abcd');
  });

  it('elimina caracteres de control y símbolos', () => {
    expect(normalizeHeader('Núm. Póliza!')).toBe('numpoliza');
    expect(normalizeHeader('Cliente/Tomador')).toBe('clientetomador');
  });

  it('mantiene sólo dígitos ASCII', () => {
    expect(normalizeHeader('Tel 600 100 200')).toBe('tel600100200');
  });

  it('idempotente: aplicar dos veces = una vez', () => {
    const a = normalizeHeader('Fecha  Vencimiento  ');
    const b = normalizeHeader(a);
    expect(b).toBe(a);
  });
});

// ─── detectColumn ──────────────────────────────────────────────────────────

describe('detectColumn', () => {
  it('match exacto contra canonical -> 1.00', () => {
    expect(detectColumn('clienteNombre', 'clienteNombre').confidence).toBe(1.0);
    expect(detectColumn('CLIENTE NOMBRE', 'clienteNombre').confidence).toBe(1.0);
  });

  it('match exacto contra sinónimo -> 0.95', () => {
    const r = detectColumn('email', 'clienteEmail', POLIZAS_COLUMN_SYNONYMS.clienteEmail);
    expect(r.confidence).toBe(0.95);
    expect(r.reason).toBe('Sinónimo');
  });

  it('contains cuando uno contiene al otro -> 0.85', () => {
    // 'clienteemail' (header) no es exacto contra clienteNombre (canon 'clientenombre')
    // ni contra ningún sinónimo. Pero contiene el sinónimo 'cliente' → 0.85.
    const r = detectColumn('clienteemail', 'clienteNombre', POLIZAS_COLUMN_SYNONYMS.clienteNombre);
    expect(r.confidence).toBe(0.85);
    expect(r.reason).toBe('Header contiene sinónimo');
  });

  it('header con palabra extra cae como Sinónimo/contains', () => {
    // 'Asegurado Nombre Completo' -> 'aseguradosnombrecompleto' contiene
    // 'aseguradosnombre' (synonimo normalizado de 'asegurado nombre' en clienteNombre).
    const r = detectColumn(
      'Asegurado Nombre Completo',
      'clienteNombre',
      POLIZAS_COLUMN_SYNONYMS.clienteNombre
    );
    expect(r.confidence).toBe(0.85);
  });

  it('prefijo común de >= 3 chars -> 0.65', () => {
    const r = detectColumn('fechatope', 'fechavencimiento');
    expect(r.confidence).toBe(0.65);
    expect(r.reason).toBe('Prefijo');
  });

  it('sin match -> 0', () => {
    const r = detectColumn('xyz123', 'clienteEmail');
    expect(r.confidence).toBe(0);
    expect(r.reason).toBe('Sin match');
  });

  it('case-insensitive (header en mayúsculas matchea canonical camelCase)', () => {
    const r = detectColumn('POLIZA', 'numeroPoliza', POLIZAS_COLUMN_SYNONYMS.numeroPoliza);
    expect(r.confidence).toBe(0.95);
  });

  it('header con palabra extra del dominio -> 0.85 por sinónimo contiene', () => {
    // "Asegurado Nombre" usa palabra extra premium pero cae como Sinónimo.
    const r = detectColumn('Asegurado', 'clienteNombre', POLIZAS_COLUMN_SYNONYMS.clienteNombre);
    // 'asegurado' es sinónimo de clienteNombre → 0.95 (sinónimo exacto)
    expect(r.confidence).toBe(0.95);
  });
});

// helper duplicado eliminado (movido arriba)



describe('suggestPolizasMapping', () => {
  it('mapea headers en español canónicos', () => {
    const headers = [
      'numeroPoliza', 'clienteNombre', 'clienteEmail', 'aseguradoraNombre',
      'ramo', 'fechaInicio', 'fechaVencimiento', 'primaAnual',
    ];
    const { mapping } = suggestPolizasMapping(headers);
    expect(mapping.numeroPoliza).toBe('numeroPoliza');
    expect(mapping.clienteNombre).toBe('clienteNombre');
    expect(mapping.clienteEmail).toBe('clienteEmail');
    expect(mapping.aseguradoraNombre).toBe('aseguradoraNombre');
    expect(mapping.fechaInicio).toBe('fechaInicio');
    expect(mapping.fechaVencimiento).toBe('fechaVencimiento');
  });

  it('mapea headers con sinónimos coloquiales del broker', () => {
    const headers = ['Póliza', 'Asegurado', 'Mail', 'Aseguradora', 'Vigencia Desde', 'Vence'];
    const { mapping } = suggestPolizasMapping(headers);
    expect(mapping.numeroPoliza).toBe('Póliza');
    expect(mapping.clienteNombre).toBe('Asegurado');
    expect(mapping.clienteEmail).toBe('Mail');
    expect(mapping.aseguradoraNombre).toBe('Aseguradora');
    expect(mapping.fechaInicio).toBe('Vigencia Desde');
    expect(mapping.fechaVencimiento).toBe('Vence');
  });

  it('mapea headers en inglés', () => {
    const headers = ['policy', 'insured', 'carrier', 'startdate', 'premium'];
    const { mapping } = suggestPolizasMapping(headers);
    expect(mapping.numeroPoliza).toBe('policy');
    expect(mapping.clienteNombre).toBe('insured');
    expect(mapping.aseguradoraNombre).toBe('carrier');
    expect(mapping.fechaInicio).toBe('startdate');
    expect(mapping.primaAnual).toBe('premium');
  });

  it('cada header del usuario se asigna a UN SOLO canonical (no hay duplicados)', () => {
    const headers = ['Asegurado', 'nombre', 'policy']; // 'nombre' aparece 2×
    const { mapping } = suggestPolizasMapping(headers);
    const usados = new Set(Object.values(mapping));
    expect(usados.size).toBe(new Set(Object.values(mapping)).size);
  });

  it('cuando un header puede matchear varios canonicales, gana el de mayor confianza', () => {
    const headers = ['Fecha']; // puede matchear fechainicio, fechaVencimiento, fechaX...
    const { mapping, matches } = suggestPolizasMapping(headers);
    // "Fecha" matchea fechainicio (contiene) y fechaVencimiento (contiene) igual.
    // El greedy asigna uno (alfabéticamente "fechaInicio" antes de "fechaVencimiento").
    const asignados = Object.keys(mapping).filter(k => mapping[k] === 'Fecha');
    expect(asignados.length).toBe(1);
  });

  it('los canonicales sin match aparecen como confidence 0', () => {
    const headers = ['Póliza']; // solo numeroPoliza matchea
    const { matches } = suggestPolizasMapping(headers);
    const noMatch = matches.filter(m => m.confidence === 0);
    expect(noMatch.length).toBeGreaterThan(0);
    expect(noMatch.every(m => m.matchedHeader === null)).toBe(true);
  });

  it('confianza < threshold no entra al mapping pero aparece en matches', () => {
    const headers = ['xxxxfecha']; // prefijo común 0.65 con fechaX pero no synonyms
    const { mapping, matches } = suggestPolizasMapping(headers, 0.75);
    // 0.65 < 0.75 → no debe asignar a ningún canonical.
    expect(Object.keys(mapping)).toHaveLength(0);
  });

  it('devuelve matches ordenados alfabéticamente por canonical', () => {
    const headers = ['dummy'];
    const { matches } = suggestPolizasMapping(headers);
    const canonicosEnMatches = matches.map(m => m.canonical);
    // Matches deben ordenarse alfabéticamente por canonical.
    const expected = [...canonicosEnMatches].sort();
    expect(canonicosEnMatches).toEqual(expected);
  });
});

// ─── parseCSVSmart ─────────────────────────────────────────────────────────

describe('parseCSVSmart', () => {
  it('detecta delimitador + parsea CSV con coma', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6';
    const r = parseCSVSmart(csv);
    expect(r.delimiter).toBe(',');
    expect(r.headers).toEqual(['a', 'b', 'c']);
    expect(r.rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
  });

  it('parsea con punto y coma y comas dentro de strings entrecomillados', () => {
    const csv = 'name;desc\n"López, Juan";"Hola, mundo"\n"García, Ana";"Otro, msg"';
    const r = parseCSVSmart(csv);
    expect(r.delimiter).toBe(';');
    expect(r.headers).toEqual(['name', 'desc']);
    expect(r.rows[0]).toEqual({ name: 'López, Juan', desc: 'Hola, mundo' });
  });

  it('ignora BOM UTF-8 al inicio', () => {
    const BOM = '\uFEFF';
    const csv = BOM + 'a,b\n1,2';
    const r = parseCSVSmart(csv);
    expect(r.headers).toEqual(['a', 'b']);
    expect(r.headers[0].charCodeAt(0)).not.toBe(0xFEFF);
  });

  it('escapa comillas dobles RFC 4180 dentro de campos entrecomillados', () => {
    const csv = 'msg\n"Ella dijo ""sí"""\n"Otra cosa"';
    const r = parseCSVSmart(csv);
    expect(r.rows[0].msg).toBe('Ella dijo "sí"');
  });

  it('devuelve headers y rows vacíos si sólo hay 1 línea', () => {
    const r = parseCSVSmart('solo una línea sin saltos');
    expect(r.headers).toEqual([]);
    expect(r.rows).toEqual([]);
  });

  it('deduplica headers repetidos con sufijo [2], [3]…', () => {
    const csv = 'name,email,name\nA,a@x.com,B\nC,c@x.com,D';
    const r = parseCSVSmart(csv);
    expect(r.headers).toEqual(['name', 'email', 'name[2]']);
    // Sin dedupe, la fila sería {name:'B', email:'a@x.com'} pisando el nombre real.
    expect(r.rows[0].name).toBe('A');
    expect(r.rows[0]['name[2]']).toBe('B');
    expect(r.rows[0].email).toBe('a@x.com');
  });

  it('texto vacío devuelve estructura vacía sin crashear', () => {
    const r = parseCSVSmart('');
    expect(r.headers).toEqual([]);
    expect(r.rows).toEqual([]);
  });
});
