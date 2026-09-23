export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';
import { parseNum } from '@/lib/import/parse-num';
import { monedaEscritura } from '@/lib/moneda';

// ─── Utilidades de parseo ─────────────────────────────────────────────────

/** Normaliza un encabezado de columna para detectarlo sin importar mayúsculas/acentos. */
function normalizeHeader(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convierte una fecha de Excel (serial) o string a Date. */
function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;

  // Serial de Excel (días desde 1899-12-30)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(value).trim();
  // dd/mm/yyyy o dd-mm-yyyy
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }
  // yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Columnas de tipo de IVA que se esperan en el fichero (en orden)
const RATE_COLUMNS = [21, 10, 7.5, 5, 4, 2, 0];

interface ParsedRow {
  row: number;
  supplierName: string;
  supplierTaxId: string | null;
  date: Date | null;
  invoiceNumber: string | null;
  bases: { rate: number; base: number }[];
  vatAmount: number | null;
  total: number | null;
  raw: any[];
}

/** Devuelve la clave canónica de una tasa (p. ej. 7.5 → 'BASE 7,5%'). */
function rateKey(rate: number): string {
  return `BASE ${String(rate).replace('.', ',')}%`;
}

/**
 * Analiza el contenido del fichero y devuelve las filas normalizadas además
 * de los errores de estructura (encabezados).
 *
 * Si se pasa un `mapping` (campo canónico → índice de columna 0-based) se usa
 * ese mapeo en lugar de la detección automática por encabezado. Con
 * `noHeader=true` los datos empiezan en la fila 0 (sin fila de encabezado).
 */
async function parseWorkbook(
  buffer: Buffer,
  opts: { mapping?: Record<string, number | null>; noHeader?: boolean; currency?: string | null } = {},
): Promise<{
  rows: ParsedRow[];
  headerErrors: string[];
  detectedColumns: string[];
  autoMapping: Record<string, number>;
}> {
  // Import diferido: xlsx pesa ~7M y solo se necesita al importar un fichero.
  const XLSX = await import('xlsx');
  const empty = (headerErrors: string[] = []) => ({
    rows: [],
    headerErrors,
    detectedColumns: [],
    autoMapping: {} as Record<string, number>,
  });

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return empty(['El fichero no contiene hojas']);

  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false }) as any[][];
  if (!aoa.length) return empty(['El fichero está vacío']);

  const { mapping, noHeader } = opts;
  const colIndex: Record<string, number> = {};
  const rateCols: { index: number; rate: number }[] = [];
  const mappedIndexes = new Set<number>();

  if (mapping && Object.keys(mapping).length > 0) {
    for (const [field, idx] of Object.entries(mapping)) {
      if (idx == null || !Number.isFinite(idx) || idx < 0) continue;
      mappedIndexes.add(idx);
      if (field.startsWith('BASE ')) {
        const m = field.match(/(\d+(?:[.,]\d+)?)/);
        if (m) rateCols.push({ index: idx, rate: parseFloat(m[1].replace(',', '.')) });
        continue;
      }
      colIndex[field] = idx;
    }
  } else {
    const headerRow = aoa[0];
    headerRow.forEach((h, i) => {
      const key = normalizeHeader(String(h ?? ''));
      if (!key) return;
      if (/^BASE/.test(key)) {
        const rateMatch = key.match(/(\d+(?:[.,]\d+)?)/);
        if (rateMatch) {
          const rate = parseFloat(rateMatch[1].replace(',', '.'));
          if (RATE_COLUMNS.includes(rate)) rateCols.push({ index: i, rate });
        }
        return;
      }
      if (!colIndex[key]) colIndex[key] = i;
    });
  }

  const headerErrors: string[] = [];
  const has = (k: string) => colIndex[k] !== undefined;
  if (!has('NOMBRE')) headerErrors.push('Falta la columna NOMBRE (proveedor).');
  if (!has('FECHA')) headerErrors.push('Falta la columna FECHA.');
  if (rateCols.length === 0) headerErrors.push('No se detectaron columnas BASE x% (21, 10, 7,5, 5, 4, 2, 0).');

  // Etiquetas disponibles del fichero (para mostrar y mapear en la UI)
  const maxCols = Math.max(0, ...aoa.map((r) => r?.length ?? 0));
  const headerLabels = noHeader ? [] : aoa[0] || [];
  const detectedColumns: string[] = [];
  for (let i = 0; i < maxCols; i++) {
    detectedColumns.push(String(headerLabels[i] ?? '').trim() || `Columna ${i + 1}`);
  }

  // Mapeo efectivamente usado (para prellenar el editor de la UI)
  const autoMapping: Record<string, number> = {};
  for (const [k, v] of Object.entries(colIndex)) autoMapping[k] = v;
  for (const rc of rateCols) autoMapping[rateKey(rc.rate)] = rc.index;

  const rows: ParsedRow[] = [];
  const startRow = mapping && noHeader ? 0 : 1;
  for (let r = startRow; r < aoa.length; r++) {
    const rawRow = aoa[r];
    if (!rawRow || rawRow.every((c) => c == null || String(c).trim() === '')) continue;

    const supplierName = String(rawRow[colIndex['NOMBRE'] ?? colIndex['PROVEEDOR']] ?? '').trim();
    const taxIdRaw = rawRow[colIndex['C.I.F.'] ?? colIndex['NIF']] ?? null;
    const invoiceRaw = rawRow[colIndex['Nº FRA.'] ?? colIndex['FACTURA']] ?? null;

    const bases = rateCols
      .map(({ index, rate }) => ({ rate, base: parseNum(rawRow[index], opts.currency) ?? 0 }))
      .filter((b) => b.base > 0);

    const vatAmount = parseNum(rawRow[colIndex['IVA']], opts.currency);
    const total = parseNum(rawRow[colIndex['TOTAL'] ?? colIndex['IMPORTE']], opts.currency);

    rows.push({
      row: r + 1,
      supplierName,
      supplierTaxId: taxIdRaw != null && String(taxIdRaw).trim() ? String(taxIdRaw).trim() : null,
      date: parseDate(rawRow[colIndex['FECHA']]),
      invoiceNumber: invoiceRaw != null && String(invoiceRaw).trim() ? String(invoiceRaw).trim() : null,
      bases,
      vatAmount,
      total,
      raw: rawRow,
    });
  }

  return { rows, headerErrors, detectedColumns, autoMapping };
}

/**
 * Resuelve (o crea) el proveedor por NIF/CIF o nombre.
 */
async function resolveSupplier(tenantId: string, name: string, taxId: string | null) {
  const taxIdNormalized = taxId ? taxId.toUpperCase().replace(/\s/g, '') : null;

  let supplier = null;
  if (taxIdNormalized) {
    supplier = await prisma.supplier.findFirst({
      where: { tenantId, taxId: taxIdNormalized },
    });
  }
  if (!supplier) {
    supplier = await prisma.supplier.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    });
  }
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        tenantId,
        name,
        taxId: taxIdNormalized,
        category: 'Varios',
        vatRates: [],
      },
    });
    return { supplier, created: true };
  }
  return { supplier, created: false };
}

/**
 * GET no soportado.
 */
export const GET = withTenantAuth(async () => {
  return NextResponse.json({ error: 'Método no soportado' }, { status: 405 });
}, ['erp:read']);

/**
 * POST /api/erp/expenses/import?mode=preview|commit
 * Importa gastos desde un fichero XLS/XLSX con las columnas del resumen anual
 * de proveedores (NOMBRE, C.I.F., FECHA, Nº FRA., BASE 21%..0%, IVA, TOTAL).
 * - mode=preview: analiza y valida sin crear nada.
 * - mode=commit: crea los gastos válidos (omite duplicados por nº de factura).
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const mode = new URL(request.url).searchParams.get('mode') || 'preview';
    if (!['preview', 'commit'].includes(mode)) {
      return NextResponse.json({ error: 'Modo inválido (preview|commit)' }, { status: 400 });
    }

    // Moneda del tenant para interpretar de forma determinista el formato numérico
    // del fichero (EUR -> punto de miles y coma decimal; resto -> coma de miles).
    // Tolerante a fallos: si el cliente Prisma no expone `tenant` (p. ej. en test
    // con mocks parciales) se cae al valor por defecto null (auto-detección).
    let currency: string | null = null;
    try {
      const tenantInfo = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { moneda: true },
      });
      currency = tenantInfo?.moneda || null;
    } catch (e) {
      currency = null;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    const allowed = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowed.includes(file.type) && !['xls', 'xlsx'].includes(ext)) {
      return NextResponse.json(
        { error: 'Formato no válido. Sube un archivo .xls o .xlsx' },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo supera el tamaño máximo (10 MB)' }, { status: 400 });
    }

    // Mapeo manual de columnas (campo canónico → índice 0-based)
    const mappingRaw = formData.get('mapping');
    let mapping: Record<string, number | null> | undefined;
    if (typeof mappingRaw === 'string' && mappingRaw.trim()) {
      try {
        mapping = JSON.parse(mappingRaw);
        if (typeof mapping !== 'object' || mapping === null || Array.isArray(mapping)) {
          return NextResponse.json({ error: 'El mapeo de columnas no es válido' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'El mapeo de columnas no es válido' }, { status: 400 });
      }
    }
    const noHeader = formData.get('noHeader') === 'true';

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, headerErrors, detectedColumns, autoMapping } = await parseWorkbook(buffer, {
      mapping,
      noHeader,
      currency,
    });

    if (headerErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'El fichero no tiene el formato esperado',
          headerErrors,
          rows: [],
          detectedColumns,
          autoMapping,
        },
        { status: 422 },
      );
    }
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron filas con datos', detectedColumns, autoMapping },
        { status: 422 },
      );
    }

    // Resolver el usuario creador dentro del tenant (misma lógica que POST /expenses)
    const tenantDb = auth.db as any;
    let createdById = auth.user?.id;
    if (tenantDb?.user && createdById) {
      const creatorInTenant = await tenantDb.user.findFirst({
        where: { id: createdById, tenantId },
        select: { id: true },
      });
      if (!creatorInTenant) {
        const fallbackCreator = await tenantDb.user.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        createdById = fallbackCreator?.id;
      }
    }
    if (!createdById) {
      return NextResponse.json(
        { error: 'No hay un usuario válido para registrar los gastos.' },
        { status: 422 },
      );
    }

    // Pre-resolver proveedores y duplicados para el preview y el commit
    const results: any[] = [];
    let imported = 0;
    let duplicates = 0;

    for (const row of rows) {
      const entry: any = {
        row: row.row,
        supplierName: row.supplierName,
        supplierTaxId: row.supplierTaxId,
        invoiceNumber: row.invoiceNumber,
        date: row.date ? row.date.toISOString() : null,
        ok: false,
      };

      if (!row.supplierName) {
        entry.error = 'Falta el nombre del proveedor';
        results.push(entry);
        continue;
      }

      const taxableBase = round2(row.bases.reduce((sum, b) => sum + b.base, 0));
      const computedVat = round2(row.bases.reduce((sum, b) => sum + round2(b.base * (b.rate / 100)), 0));
      const vatAmount = row.vatAmount != null ? round2(row.vatAmount) : computedVat;
      const total = row.total != null ? round2(row.total) : round2(taxableBase + vatAmount);

      if (taxableBase <= 0 && total <= 0) {
        entry.error = 'Sin importes (base o total vacíos)';
        results.push(entry);
        continue;
      }

      // Proveedor
      let supplierRes;
      try {
        supplierRes = await resolveSupplier(tenantId, row.supplierName, row.supplierTaxId);
      } catch (e: any) {
        entry.error = `No se pudo resolver el proveedor: ${e.message}`;
        results.push(entry);
        continue;
      }
      const supplier = supplierRes.supplier;
      entry.supplierId = supplier.id;
      entry.supplierCreated = supplierRes.created;

      // Duplicado por nº de factura + proveedor
      if (row.invoiceNumber) {
        const dup = await prisma.expense.findFirst({
          where: { tenantId, supplierId: supplier.id, invoiceNumber: row.invoiceNumber },
          select: { id: true },
        });
        if (dup) {
          entry.ok = false;
          entry.error = 'Duplicado (factura ya registrada)';
          entry.duplicate = true;
          duplicates++;
          results.push(entry);
          continue;
        }
      }

      if (mode === 'preview') {
        entry.ok = true;
        entry.preview = {
          taxableBase,
          vatAmount,
          total,
          tramos: row.bases.map((b) => ({ rate: b.rate, base: b.base, amount: round2(b.base * (b.rate / 100)) })),
        };
        results.push(entry);
        continue;
      }

      // commit: crear el gasto
      const vatBreakdown = row.bases.map((b) => ({
        rate: b.rate,
        base: b.base,
        amount: round2(b.base * (b.rate / 100)),
      }));

      try {
        const expense = await (skills as any).create_expense({
          tenantId,
          createdById,
          supplierId: supplier.id,
          description: `Factura ${row.invoiceNumber || 'sin número'} - ${supplier.name}`,
          amount: total,
          // El fichero no trae divisa: la del gasto es la del tenant con el que
          // se leyó el formato numérico. Estaba fijada a 'EUR'.
          currency: monedaEscritura(currency, auth.tenant?.moneda),
          date: row.date || new Date(),
          category: 'General',
          status: 'PAID',
          invoiceNumber: row.invoiceNumber,
          taxableBase,
          vatRate: vatBreakdown.length === 1 ? vatBreakdown[0].rate : null,
          vatAmount,
          operationDate: row.date || undefined,
          issuerName: supplier.name,
          issuerTaxId: supplier.taxId,
          vatBreakdown,
        });
        entry.ok = true;
        entry.expenseId = expense.id;
        imported++;
      } catch (e: any) {
        entry.error = `Error al registrar: ${e.message}`;
      }
      results.push(entry);
    }

    return NextResponse.json({
      mode,
      total: rows.length,
      imported,
      duplicates,
      errors: results.filter((r) => !r.ok).length,
      rows: results,
      detectedColumns,
      autoMapping,
    });
  } catch (error: any) {
    console.error('Error importando gastos:', error);
    return NextResponse.json(
      { error: 'Error al importar gastos', details: error.message },
      { status: 500 },
    );
  }
}, ['erp:write']);
