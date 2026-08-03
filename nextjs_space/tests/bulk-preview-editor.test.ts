import { describe, it, expect } from 'vitest';

import {
  validateCell,
  validateRow,
  allRowsValid,
  rowsValidationSummary,
  editCell,
  resetRow,
  applyCellReplacement,
  applyCellTransform,
  EDITABLE_COLUMNS,
  type EditableColumn,
} from '@/lib/insurance/csv-bulk-editor';
import type { BulkParsedRow } from '@/lib/insurance/csv-bulk';

function makeRow(overrides: Partial<BulkParsedRow> = {}): BulkParsedRow {
  return {
    rowNum: 1,
    empresa: 'Test SA',
    subdomain: 'test-sa',
    email: 'admin@test-sa.com',
    password: 'Pwd12345',
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// validateCell — requerido
// ──────────────────────────────────────────────────────────────────────────

describe('validateCell — campos requeridos', () => {
  it('1) empresa vacía → error', () => {
    expect(validateCell('empresa', '').ok).toBe(false);
    expect(validateCell('empresa', null).ok).toBe(false);
    expect(validateCell('empresa', '   ').ok).toBe(false);
  });

  it('2) empresa > 200 chars → error', () => {
    expect(validateCell('empresa', 'x'.repeat(201)).ok).toBe(false);
  });

  it('3) empresa válida → ok', () => {
    expect(validateCell('empresa', 'Brokers SL').ok).toBe(true);
  });

  it('4) subdomain inválido (uppercase/empty) → error', () => {
    expect(validateCell('subdomain', 'BROKERS').ok).toBe(false);
    expect(validateCell('subdomain', '-leading-dash').ok).toBe(false);
    expect(validateCell('subdomain', '').ok).toBe(false);
    expect(validateCell('subdomain', 'a').ok).toBe(false); // <3
    expect(validateCell('subdomain', 'a'.repeat(41)).ok).toBe(false); // >40
  });

  it('5) subdomain válido (lowercase + alfanum + guión) → ok', () => {
    expect(validateCell('subdomain', 'brokers').ok).toBe(true);
    expect(validateCell('subdomain', 'broker-1').ok).toBe(true);
    expect(validateCell('subdomain', 'a'.repeat(40)).ok).toBe(true);
  });

  it('6) email sin @ ni . → error', () => {
    expect(validateCell('email', 'admin').ok).toBe(false);
    expect(validateCell('email', 'admin@').ok).toBe(false);
    expect(validateCell('email', 'admin@b').ok).toBe(false);
    expect(validateCell('email', '@b.com').ok).toBe(false);
  });

  it('7) email vacío → error', () => {
    expect(validateCell('email', '').ok).toBe(false);
  });

  it('8) email completo válido → ok', () => {
    expect(validateCell('email', 'admin@brokers.com').ok).toBe(true);
    expect(validateCell('email', 'a.b+c@x.y.z').ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// validateCell — opcionales
// ──────────────────────────────────────────────────────────────────────────

describe('validateCell — campos opcionales', () => {
  it('9) password vacío → ok (auto-gen)', () => {
    expect(validateCell('password', '').ok).toBe(true);
    expect(validateCell('password', undefined).ok).toBe(true);
  });

  it('10) password corto (<6) → error', () => {
    expect(validateCell('password', 'abc').ok).toBe(false);
  });

  it('11) password largo → ok', () => {
    expect(validateCell('password', 'MySecretPwd123').ok).toBe(true);
  });

  it('12) moneda vacía → ok (default)', () => {
    expect(validateCell('moneda', '').ok).toBe(true);
    expect(validateCell('moneda', undefined).ok).toBe(true);
  });

  it('13) moneda no catalogada → error con lista de válidas en mensaje', () => {
    const r = validateCell('moneda', 'XYZ');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/USD|EUR|MXN/);
  });

  it('14) monedas válidas (case-insensitive) → ok', () => {
    expect(validateCell('moneda', 'EUR').ok).toBe(true);
    expect(validateCell('moneda', 'eur').ok).toBe(true);
  });

  it('15) vertical vacía → ok (no vertical)', () => {
    expect(validateCell('vertical', '').ok).toBe(true);
  });

  it('16) vertical no soportada → error', () => {
    const r = validateCell('vertical', 'unknown-vertical');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/insurance|real_estate/);
  });

  it('17) verticales válidas → ok', () => {
    expect(validateCell('vertical', 'insurance').ok).toBe(true);
    expect(validateCell('vertical', 'INSURANCE').ok).toBe(true);
    expect(validateCell('vertical', 'accounting').ok).toBe(true);
    expect(validateCell('vertical', 'real_estate').ok).toBe(true);
    expect(validateCell('vertical', 'general').ok).toBe(true);
  });

  it('18) telegramBotName/Token siempre ok (coherencia cruzada se valida aparte)', () => {
    expect(validateCell('telegramBotName', '').ok).toBe(true);
    expect(validateCell('telegramBotName', '@bot').ok).toBe(true);
    expect(validateCell('telegramBotToken', '').ok).toBe(true);
    expect(validateCell('telegramBotToken', '123:abc').ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// validateRow + allRowsValid + rowsValidationSummary
// ──────────────────────────────────────────────────────────────────────────

describe('validateRow', () => {
  it('19) fila completa válida → ok=true, errors=[]', () => {
    const r = validateRow(makeRow());
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('20) fila con email inválido → ok=false, errors[email]', () => {
    const r = validateRow(makeRow({ email: 'invalid' }));
    expect(r.ok).toBe(false);
    expect(r.errors.find(e => e.column === 'email')).toBeTruthy();
  });

  it('21) reporta TODOS los errores (no se detiene en el primero)', () => {
    const r = validateRow(makeRow({
      email: 'x', subdomain: 'BAD', empresa: '',
    }));
    expect(r.ok).toBe(false);
    const cols = r.errors.map(e => e.column);
    expect(cols).toEqual(expect.arrayContaining(['empresa', 'subdomain', 'email']));
  });
});

describe('allRowsValid + rowsValidationSummary', () => {
  it('22) allRowsValid=true cuando todas válidas', () => {
    expect(allRowsValid([makeRow(), makeRow({ rowNum: 2 })])).toBe(true);
  });

  it('23) allRowsValid=false cuando una fila falla', () => {
    expect(allRowsValid([
      makeRow(),
      makeRow({ rowNum: 2, email: 'broken' }),
    ])).toBe(false);
  });

  it('24) rowsValidationSummary contadores correctos', () => {
    const summary = rowsValidationSummary([
      makeRow(),
      makeRow({ rowNum: 2, email: 'broken' }),
      makeRow({ rowNum: 3, subdomain: 'BAD' }),
      makeRow({ rowNum: 4 }),
    ]);
    expect(summary.total).toBe(4);
    expect(summary.valid).toBe(2);
    expect(summary.invalid).toBe(2);
  });

  it('25) rowsValidationSummary con array vacío → all zeros', () => {
    expect(rowsValidationSummary([])).toEqual({ total: 0, valid: 0, invalid: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// editCell + resetRow
// ──────────────────────────────────────────────────────────────────────────

describe('editCell', () => {
  it('26) devuelve nueva fila con la celda editada (inmutable)', () => {
    const row = makeRow();
    const edited = editCell(row, 'email', 'nuevo@brokers.com');
    expect(edited.email).toBe('nuevo@brokers.com');
    expect(row.email).toBe('admin@test-sa.com'); // original sin tocar
  });

  it('27) acepta todas las columnas editables', () => {
    const row = makeRow();
    for (const col of EDITABLE_COLUMNS) {
      const edited = editCell(row, col, `test-${col}`);
      expect((edited as unknown as Record<string, string>)[col]).toBe(`test-${col}`);
    }
  });

  it('28) rechaza columna inválida con excepción', () => {
    expect(() => editCell(makeRow(), 'rowNum' as EditableColumn, '99')).toThrow();
  });
});

describe('resetRow', () => {
  it('29) revierte a valores originales', () => {
    const original = makeRow();
    const edited = editCell(original, 'email', 'broken@broken');
    const reverted = resetRow(original, edited);
    expect(reverted.email).toBe('admin@test-sa.com');
    expect(reverted.subdomain).toBe('test-sa');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// applyCellReplacement — caso de uso típico
// ──────────────────────────────────────────────────────────────────────────

describe('applyCellReplacement', () => {
  it('30) reemplaza `;` → `@` en todos los emails (caso típico de typo sistemático)', () => {
    const rows = [
      makeRow({ rowNum: 1, email: 'admin;brokers.com' }),
      makeRow({ rowNum: 2, email: 'info;other.com' }),
      makeRow({ rowNum: 3, email: 'sales;acme.com' }),
    ];
    const fixed = applyCellReplacement(rows, 'email', ';', '@');
    expect(fixed[0].email).toBe('admin@brokers.com');
    expect(fixed[1].email).toBe('info@other.com');
    expect(fixed[2].email).toBe('sales@acme.com');
  });

  it('31) noOp cuando find=""', () => {
    const rows = [makeRow({ email: 'a@b.com' })];
    const out = applyCellReplacement(rows, 'email', '', 'X');
    expect(out[0].email).toBe('a@b.com');
  });

  it('32) deja intactas las filas que NO contienen `find`', () => {
    const rows = [
      makeRow({ rowNum: 1, email: 'a;b.com' }),     // matchea → reemplaza
      makeRow({ rowNum: 2, email: 'c@d.com' }),     // NO matchea → intacta
    ];
    const out = applyCellReplacement(rows, 'email', ';', '@');
    expect(out[0].email).toBe('a@b.com');
    expect(out[1].email).toBe('c@d.com'); // sin tocar
  });

  it('33) replace vacío elimina el `find` en todas las filas', () => {
    const rows = [
      makeRow({ rowNum: 1, email: 'admin;brokers.com' }),
      makeRow({ rowNum: 2, email: 'info;other.com' }),
    ];
    const out = applyCellReplacement(rows, 'email', ';', '');
    expect(out[0].email).toBe('adminbrokers.com');
    expect(out[1].email).toBe('infoother.com');
  });

  it('34) bajo a lowercase + trim de subdominios', () => {
    const rows = [
      makeRow({ rowNum: 1, subdomain: 'BROKERS-1 ' }),
      makeRow({ rowNum: 2, subdomain: '  Brokers-2' }),
    ];
    const out = applyCellReplacement(rows, 'subdomain', ' ', '');
    expect(out[0].subdomain).toBe('BROKERS-1');     // sin espacio pero seguimos UPPERCASE
    expect(out[1].subdomain).toBe('Brokers-2');
  });

  it('35) aplicable a moneda (e.g. lowercase "eur" → uppercase via transform)', () => {
    // Aquí find/replace simple no uppercasifica; usamos transform más abajo.
    const rows = [makeRow({ rowNum: 1, moneda: 'eur' })];
    const out = applyCellReplacement(rows, 'moneda', 'eur', 'EUR');
    expect(out[0].moneda).toBe('EUR');
  });

  it('36) NO muta el array original', () => {
    const rows = [makeRow({ email: 'x;y.com' })];
    const snapshotEmail = rows[0].email;
    applyCellReplacement(rows, 'email', ';', '@');
    expect(rows[0].email).toBe(snapshotEmail); // intacto
  });
});

// ──────────────────────────────────────────────────────────────────────────
// applyCellTransform
// ──────────────────────────────────────────────────────────────────────────

describe('applyCellTransform', () => {
  it('37) lowercase de emails', () => {
    const rows = [
      makeRow({ rowNum: 1, email: 'ADMIN@BROKERS.COM' }),
      makeRow({ rowNum: 2, email: 'Info@Other.COM' }),
    ];
    const out = applyCellTransform(rows, 'email', v => v.toLowerCase().trim());
    expect(out[0].email).toBe('admin@brokers.com');
    expect(out[1].email).toBe('info@other.com');
  });

  it('38) uppercase de moneda via transform', () => {
    const rows = [makeRow({ rowNum: 1, moneda: 'eur' })];
    const out = applyCellTransform(rows, 'moneda', v => v.toUpperCase());
    expect(out[0].moneda).toBe('EUR');
  });

  it('39) ignora celdas vacías', () => {
    const rows = [makeRow({ rowNum: 1, moneda: '' })];
    const out = applyCellTransform(rows, 'moneda', v => v.toUpperCase());
    expect(out[0].moneda).toBe(''); // sin tocar
  });

  it('40) trim + lowercase de subdomain arregla ` BROKERS-1 ` → `brokers-1`', () => {
    const rows = [makeRow({ rowNum: 1, subdomain: ' BROKERS-1 ' })];
    const out = applyCellTransform(rows, 'subdomain', v => v.trim().toLowerCase());
    expect(out[0].subdomain).toBe('brokers-1');
  });

  it('41) transform que devuelve el mismo valor → no cambia la fila', () => {
    const rows = [makeRow({ rowNum: 1, email: 'admin@b.com' })];
    const out = applyCellTransform(rows, 'email', v => v); // identity
    expect(out[0]).toBe(rows[0]);
  });

  it('42) NO muta el array original', () => {
    const rows = [makeRow({ email: 'A@BROKERS.COM' })];
    const snapshotEmail = rows[0].email;
    applyCellTransform(rows, 'email', v => v.toLowerCase());
    expect(rows[0].email).toBe(snapshotEmail);
  });
});
