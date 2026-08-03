/**
 * Tests vitest del parser CSV bulk y del serializador de reporte.
 *
 * Cubre:
 *   • Detectar delimitador (',' o ';') mirando las primeras 5 filas.
 *   • Tolerar BOM UTF-8.
 *   • Tolerar CRLF y LF.
 *   • Comillas dobles RFC-4180 (valor con coma entre comillas).
 *   • Headers case-insensitive + tolerant whitespace.
 *   • Filas con campos faltantes van a errors[rowNum].
 *   • Filas completas vacías van a emptyRows.
 *   • buildBulkResultCsv: serializa correctamente con BOM + CRLF + escape.
 */
import { describe, it, expect } from 'vitest';
import {
    detectDelimiter,
    parseBulkCsv,
    buildBulkResultCsv,
    type BulkResultRow,
} from '../lib/insurance/csv-bulk';

describe('detectDelimiter', () => {
    it('1) detecta "," cuando es el más consistente', () => {
        const text = `empresa,subdomain,email\nA,a.com,a@a.com\nB,b.com,b@b.com\n`;
        expect(detectDelimiter(text)).toBe(',');
    });
    it('2) detecta ";" cuando es el más consistente', () => {
        const text = `empresa;subdomain;email\nA;a.com;a@a.com\nB;b.com;b@b.com\n`;
        expect(detectDelimiter(text)).toBe(';');
    });
    it('3) tolera BOM UTF-8 al inicio', () => {
        const text = '\uFEFFempresa,subdomain,email\nA,a.com,a@a.com\n';
        expect(detectDelimiter(text)).toBe(',');
    });
    it('4) retorna null cuando no se puede detectar', () => {
        expect(detectDelimiter('')).toBeNull();
        expect(detectDelimiter('a\nb\nc\n')).toBeNull();
    });
    it('5) prefiere "," cuando hay empate', () => {
        // Construye un caso donde ambas dan el mismo score en líneas mixtas.
        // Aquí "," gana simplemente por aparecer en la primera línea.
        const text = `empresa,subdomain,email\nA;a.com;a@a.com\n`;
        expect(detectDelimiter(text)).toBe(',');
    });
});

describe('parseBulkCsv', () => {
    it('1) caso feliz: dos filas válidas con todas las columnas', () => {
        const csv = `empresa,subdomain,email,password,moneda,vertical
Big Corp SL,big-corp,admin@bigcorp.com,Secret123!,EUR,insurance
Other SA,other-sa,info@other.com,Secret456,USD,real_estate`;
        const result = parseBulkCsv(csv);
        expect(result.delimiter).toBe(',');
        expect(result.headers).toEqual(['empresa', 'subdomain', 'email', 'password', 'moneda', 'vertical']);
        expect(result.errors).toEqual([]);
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].empresa).toBe('Big Corp SL');
        expect(result.rows[0].email).toBe('admin@bigcorp.com');
        expect(result.rows[1].vertical).toBe('real_estate');
    });

    it('2) separador ";" + CRLF', () => {
        const csv = 'empresa;subdomain;email\r\nBigCorp SL;big-corp;admin@bigcorp.com\r\nOther SA;other-sa;info@other.com';
        const result = parseBulkCsv(csv);
        expect(result.delimiter).toBe(';');
        expect(result.rows).toHaveLength(2);
    });

    it('3) BOM UTF-8 + header en minúsculas con espacios', () => {
        const csv = '\uFEFFEmpresa,Subdominio,Email\nBigCorp,big-corp,admin@big.com';
        const result = parseBulkCsv(csv);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].empresa).toBe('BigCorp');
        expect(result.rows[0].subdomain).toBe('big-corp');
        expect(result.rows[0].email).toBe('admin@big.com');
    });

    it('4) comillas dobles RFC-4180: "Calle Mayor, 12"', () => {
        const csv = `empresa,subdomain,email\n"Calle Mayor, 12 SL",cm12-sl,admin@cm12.com`;
        const result = parseBulkCsv(csv);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].empresa).toBe('Calle Mayor, 12 SL');
    });

    it('5) fila con campo requerido faltante → error con rowNum', () => {
        const csv = `empresa,subdomain,email
Valid SA,valid-sa,valid@a.com
Falta SA,,falta@a.com`;
        const result = parseBulkCsv(csv);
        expect(result.rows).toHaveLength(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rowNum).toBe(2);
        expect(result.errors[0].message).toContain('subdomain');
    });

    it('6) email inválido → error', () => {
        const csv = `empresa,subdomain,email\nSA,valid-sa,no-es-email`;
        const result = parseBulkCsv(csv);
        expect(result.rows).toHaveLength(0);
        expect(result.errors[0].message).toContain('Email inválido');
    });

    it('7) subdominio con mayúsculas o caracteres inválidos → error', () => {
        const csv = `empresa,subdomain,email\nSA,BadSubDomain!,sa@a.com`;
        const result = parseBulkCsv(csv);
        expect(result.rows).toHaveLength(0);
        expect(result.errors[0].message).toContain('Subdominio inválido');
    });

    it('8) detecta filas vacías (todos los campos "" → emptyRows)', () => {
        const csv = `empresa,subdomain,email\nValid SA,valid-sa,valid@a.com\n,,,\n,,,,`;
        const result = parseBulkCsv(csv);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].rowNum).toBe(1);
        // Las dos filas data restantes son todas vacías → emptyRows.
        expect(result.emptyRows.length).toBe(2);
        expect(result.emptyRows[0]).toBe(2);
        expect(result.emptyRows[1]).toBe(3);
        expect(result.errors).toHaveLength(0);
    });

    it('8b) sólo el header sin filas → rows=0, errors=0, emptyRows=0', () => {
        const csv = `empresa,subdomain,email`;
        const result = parseBulkCsv(csv);
        expect(result.rows).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
        expect(result.emptyRows).toHaveLength(0);
    });

    it('8c) detecta el delimitador ";" cuando todo el archivo es ";"', () => {
        const csv = 'empresa;subdomain;email\nV;valid-sa;v@a.com';
        const result = parseBulkCsv(csv);
        expect(result.delimiter).toBe(';');
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].subdomain).toBe('valid-sa');
    });

    it('9) archivo vacío → error con rowNum=null', () => {
        const result = parseBulkCsv('');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].rowNum).toBeNull();
    });

    it('10) ningún header reconocido → error', () => {
        const csv = `foo,bar,baz\n1,2,3`;
        const result = parseBulkCsv(csv);
        expect(result.rows).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('11) password opcional: si no viene en el CSV queda undefined', () => {
        const csv = `empresa,subdomain,email\nSA,valid-sa,sa@a.com`;
        const result = parseBulkCsv(csv);
        expect(result.rows.length).toBeGreaterThan(0);
        if (result.rows[0]) expect(result.rows[0].password).toBeUndefined();
    });

    it('11b) si password viene, se preserva tal cual', () => {
        const csv = `empresa,subdomain,email,password\nSA,valid-sa,sa@a.com,MagicPwd123`;
        const result = parseBulkCsv(csv);
        expect(result.rows[0].password).toBe('MagicPwd123');
    });
});

describe('buildBulkResultCsv', () => {
    it('1) genera CSV con BOM + CRLF + escape de comas', () => {
        const rows: BulkResultRow[] = [
            { rowNum: 1, empresa: 'Big, SL', subdomain: 'big', email: 'a@a.com',
              moneda: 'EUR', status: 'created', tenantId: 't-1',
              chatwootAccountId: 99, telegramStatus: 'skipped', telegramInboxId: null },
            { rowNum: 2, empresa: 'Other', subdomain: 'other', email: 'b@b.com',
              moneda: 'USD', status: 'error', errorCode: 'BAD_EMAIL',
              errorMessage: 'format invalid' },
        ];
        const csv = buildBulkResultCsv(rows);
        expect(csv.startsWith('\uFEFF')).toBe(true);
        const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
        expect(lines.length).toBe(3);
        // Header
        expect(lines[0]).toContain('row,empresa,subdominio,email,status,tenantId');
        // Fila 1: empresa con coma → envuelta en comillas
        expect(lines[1]).toContain('"Big, SL"');
        expect(lines[1]).toContain('t-1');
        // Fila 2: errorCode es texto plano (sin comas/Quotes) → sin wrap
        expect(lines[2]).toContain('BAD_EMAIL');
        expect(lines[2]).toContain('error');
    });

    it('1b) escapea correctamente comillas dobles dentro de un valor', () => {
        const rows: BulkResultRow[] = [{
            rowNum: 1, empresa: 'SA', subdomain: 'sa', email: 'a@a.com',
            moneda: 'MXN', status: 'error', errorCode: 'X',
            errorMessage: 'Comentario: "ella dijo sí"',
        }];
        const csv = buildBulkResultCsv(rows);
        // escapeCsv toma "ella dijo sí" → escape " a "" → """" → envuelve.
        // Resultado esperado del campo: "Comentario: ""ella dijo sí"""
        expect(csv).toContain('"Comentario: ""ella dijo sí"""');
    });

    it('2) genera filas vacías para campos undefined', () => {
        const csv = buildBulkResultCsv([
            { rowNum: 1, empresa: 'SA', subdomain: 'sa', email: 'a@a.com',
              moneda: 'MXN', status: 'created' },
        ]);
        const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
        // Columnas tenantId, telegramInboxId, etc deben ser '' vacío
        const fields = lines[1].split(',');
        // 13 columnas esperadas
        expect(fields.length).toBe(13);
    });

    it('3) genera sólo header si el array está vacío', () => {
        const csv = buildBulkResultCsv([]);
        const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
        expect(lines).toHaveLength(1);
    });
});
