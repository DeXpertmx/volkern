/**
 * csv-bulk-editor — Helpers puros para el editor inline del paso
 * `Preview` del wizard `/admin/partner-onboarding/bulk`.
 *
 * Permite al operator corregir emails / subdominios antes de avanzar a
 * `Create`, en lugar de volver a editar el CSV en Excel y re-subir.
 *
 * Casos típicos cubiertos:
 *   • Typo sistemático en la columna email (ej. `;` en lugar de `@`)
 *     → bulk-find/replace desde un toolbar.
 *   • Un subdominio con mayúsculas que el operador quiere lowercase
 *     → bulk lower-case de la columna `subdomain`.
 *   • Una fila específica con email mal copiado → edición inline +
 *     reset al valor original del CSV.
 *
 * Las funciones son PURAS (sin React, sin fetch) para que la UI pueda
 * usarlas en useMemo y ser estables en tests vitest aislados.
 */

import type { BulkParsedRow } from './csv-bulk';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

/**
 * Columnas editables. Las keys coinciden 1:1 con los campos de
 * `BulkParsedRow` (salvo `rowNum` y los derivados de Telegram).
 */
export const EDITABLE_COLUMNS = [
    'empresa',
    'subdomain',
    'email',
    'password',
    'moneda',
    'vertical',
    'telegramBotName',
    'telegramBotToken',
] as const;
export type EditableColumn = (typeof EDITABLE_COLUMNS)[number];

export interface CellValidation {
    ok: boolean;
    error?: string;
}

export interface RowValidation {
    ok: boolean;
    errors: { column: EditableColumn; message: string }[];
}

// ─── Validadores individuales ─────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Strict subdomain: alphanumeric blocks separated by single dashes; no
// leading/trailing dashes, no consecutive dashes, length 3-40.
const SUBDOMAIN_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_MONEDAS = new Set(['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CNY', 'CAD', 'BRL', 'CLP', 'ARS', 'COP', 'PEN']);
const VALID_VERTICALS = new Set(['insurance', 'real_estate', 'accounting', 'general']);

/**
 * Valida el valor de una celda según su columna. `null`/`undefined` o
 * string vacío NO es válido para columnas requeridas (empresa,
 * subdomain, email). Para columnas opcionales (password, moneda,
 * vertical, telegram) el vacío es válido.
 */
export function validateCell(column: EditableColumn, value: string | undefined | null): CellValidation {
    const v = (value ?? '').trim();

    switch (column) {
        case 'empresa':
            if (!v) return { ok: false, error: 'Empresa es requerida' };
            if (v.length > 200) return { ok: false, error: 'Empresa demasiado larga (max 200)' };
            return { ok: true };

        case 'subdomain':
            if (!v) return { ok: false, error: 'Subdominio es requerido' };
            if (v.length < 3 || v.length > 40) {
                return { ok: false, error: 'Subdominio debe tener entre 3 y 40 caracteres' };
            }
            if (!SUBDOMAIN_RE.test(v)) {
                return {
                    ok: false,
                    error: 'Subdominio inválido (lowercase + alfanumérico, sin dashes al inicio/fin ni consecutivos)',
                };
            }
            return { ok: true };

        case 'email':
            if (!v) return { ok: false, error: 'Email es requerido' };
            if (!EMAIL_RE.test(v)) {
                return { ok: false, error: 'Email inválido (esperado: user@dominio.ext)' };
            }
            return { ok: true };

        case 'moneda':
            // Columna opcional — vacío es válido (default MXN).
            if (!v) return { ok: true };
            if (!VALID_MONEDAS.has(v.toUpperCase())) {
                return {
                    ok: false,
                    error: `Moneda inválida. Esperada una de: ${Array.from(VALID_MONEDAS).join(', ')}`,
                };
            }
            return { ok: true };

        case 'vertical':
            // Columna opcional — vacío es válido (no vertical).
            if (!v) return { ok: true };
            if (!VALID_VERTICALS.has(v.toLowerCase())) {
                return {
                    ok: false,
                    error: `Vertical inválida. Esperada una de: ${Array.from(VALID_VERTICALS).join(', ')}`,
                };
            }
            return { ok: true };

        case 'password':
            // Columna opcional — vacío significa auto-generar.
            if (v && v.length < 6) {
                return { ok: false, error: 'Password mínimo 6 chars (o dejar vacío para auto)' };
            }
            return { ok: true };

        case 'telegramBotName':
        case 'telegramBotToken':
            // Opcionales; coherencia cruzada se chequea fuera de esta fn.
            return { ok: true };

        default: {
            // Exhaustiveness check.
            const _never: never = column;
            void _never;
            return { ok: true };
        }
    }
}

/**
 * Valida una fila entera (todos sus campos editables). Devuelve lista de
 * errores por columna para que la UI pueda resaltar celdas específicas.
 */
export function validateRow(row: BulkParsedRow): RowValidation {
    const errors: { column: EditableColumn; message: string }[] = [];
    for (const col of EDITABLE_COLUMNS) {
        const cellValue = (row as unknown as Record<string, string | undefined>)[col];
        const r = validateCell(col, cellValue);
        if (!r.ok && r.error) errors.push({ column: col, message: r.error });
    }
    return { ok: errors.length === 0, errors };
}

/**
 * True si todas las filas son válidas (sin errores). El operador puede
 * usar este predicado para habilitar/deshabilitar el botón "Crear N
 * tenants".
 */
export function allRowsValid(rows: readonly BulkParsedRow[]): boolean {
    for (const row of rows) {
        if (!validateRow(row).ok) return false;
    }
    return true;
}

/**
 * Resumen agregado de validación: totales + filas con error. Útil para
 * mostrar un chip "3/10 válidas" en la cabecera del Preview.
 */
export interface RowsValidationSummary {
    total: number;
    valid: number;
    invalid: number;
}
export function rowsValidationSummary(rows: readonly BulkParsedRow[]): RowsValidationSummary {
    let valid = 0;
    for (const row of rows) if (validateRow(row).ok) valid++;
    return { total: rows.length, valid, invalid: rows.length - valid };
}

// ─── Editor de filas ──────────────────────────────────────────────────────────

/**
 * Aplica el valor editado de una columna a una fila. Devuelve una NUEVA
 * fila (inmutable). Lanza excepción si la columna es inválida (defensa
 * contra typos en el código del caller).
 */
export function editCell(
    row: BulkParsedRow,
    column: EditableColumn,
    value: string,
): BulkParsedRow {
    if (!EDITABLE_COLUMNS.includes(column)) {
        throw new Error(`csv-bulk-editor: columna "${column}" no es editable`);
    }
    return { ...row, [column]: value } as BulkParsedRow;
}

/**
 * Revierte una fila editada a su snapshot original. El caller debe
 * mantener el array `originalRows` para tener acceso a las versiones
 * pre-edit (la UI los guarda en estado aparte).
 */
export function resetRow(_original: BulkParsedRow, _current: BulkParsedRow): BulkParsedRow {
    return { ..._original };
}

// ─── Bulk find/replace ─────────────────────────────────────────────────────────

/**
 * Aplica una regla de find/replace a la `column` de TODAS las filas.
 * String-only, case-sensitive (la UI puede ofrecer `flags: 'i'` como
 * opción avanzada en un follow-up).
 *
 * Útil para el caso del operator: detecta que todos los emails
 * tienen `;` en lugar de `@`, pone `find=";"` + `replace="@"` y
 * arregla N filas con 1 acción.
 *
 * Devuelve NUEVO array de filas (no muta el input).
 */
export function applyCellReplacement(
    rows: readonly BulkParsedRow[],
    column: EditableColumn,
    find: string,
    replace: string,
): BulkParsedRow[] {
    if (!find) return [...rows]; // No-op defensivo.
    return rows.map(r => {
        const current = (r[column] ?? '') as string;
        if (!current.includes(find)) return r;
        const next = current.split(find).join(replace);
        return editCell(r, column, next);
    });
}

/**
 * Aplica una transformación (función pura `value → newValue`) a la
 * `column` de TODAS las filas. Útil para transformaciones más
 * elaboradas que find/replace:
 *   • Lowercase: column='email' transform=v=>v.toLowerCase().trim()
 *   • Trim al valor: column='subdomain' transform=v=>v.trim().toLowerCase()
 *   • Quitar prefijo común: column='email' transform=v=>v.replace(/^mailto:/, '')
 *
 * Filtra `rows` para sólo aplicar a las filas que tienen valor en
 * `column` (no aplica a vacíos).
 */
export function applyCellTransform(
    rows: readonly BulkParsedRow[],
    column: EditableColumn,
    transform: (value: string) => string,
): BulkParsedRow[] {
    return rows.map(r => {
        const current = ((r[column] ?? '') as string).trim();
        if (!current) return r;
        const next = transform(current);
        if (next === current) return r;
        return editCell(r, column, next);
    });
}
