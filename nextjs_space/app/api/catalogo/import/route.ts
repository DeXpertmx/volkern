export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { ItemIntegrityService } from '@/lib/security/item-integrity';
import { checkFeatureLimit } from '@/lib/subscription';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ALIASES: Record<string, string[]> = {
  nombre: ['nombre', 'name', 'producto', 'producto o servicio'],
  descripcion: ['descripcion', 'descripción', 'description'],
  sku: ['sku', 'codigo', 'código', 'codigo interno', 'código interno'],
  tipo: ['tipo', 'type'],
  precioBase: ['precio base', 'precio', 'price', 'precio venta'],
  moneda: ['moneda', 'currency'],
  categoriaFiscal: ['categoria fiscal', 'categoría fiscal', 'fiscal category'],
  tasaImpuestoId: ['tasa impuesto id', 'tasa impuesto', 'tax rate id'],
  duracionMinutos: ['duracion minutos', 'duración minutos', 'duracion', 'duration'],
  modalidad: ['modalidad', 'modality'],
  unidad: ['unidad', 'unit'],
  activo: ['activo', 'active', 'estado'],
  destacado: ['destacado', 'featured'],
  visibleInChatbot: ['visible en chatbot', 'visible chatbot', 'visibleinchatbot'],
  categorias: ['categorias', 'categorías', 'categories'],
  etiquetas: ['etiquetas', 'tags', 'labels'],
  costOfAcquisition: ['costo de adquisicion', 'costo de adquisición', 'costo', 'cost'],
  propietarioEmail: ['propietario email', 'owner email', 'email propietario'],
  customFieldValues: ['campos personalizados (json)', 'custom fields (json)', 'customfieldvalues'],
  metadata: ['metadata (json)', 'metadata'],
  media: ['media (json)', 'media'],
  pricing: ['pricing (json)', 'precios (json)', 'pricing'],
};

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ['si', 'sí', 'true', '1', 'activo', 'yes'].includes(normalize(value));
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseJson(value: string | undefined, field: string, row: number): unknown {
  if (!value?.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${field} no contiene un JSON válido`);
  }
}

function getValue(row: Record<string, string>, field: string): string | undefined {
  const aliases = new Set((ALIASES[field] || [field]).map(normalize));
  const entry = Object.entries(row).find(([key]) => aliases.has(normalize(key)));
  return entry?.[1]?.trim() || undefined;
}

function splitList(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  return value.split(/[;,]/).map(part => part.trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['config:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'El archivo no puede superar 20 MB' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return NextResponse.json({ error: 'El archivo no contiene hojas' }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }).map(row =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '')]))
    );
    if (rows.length === 0) return NextResponse.json({ error: 'El archivo no contiene filas de datos' }, { status: 400 });

    const tenantId = auth.tenant!.id;
    const existingItems = await prisma.catalogoItem.findMany({
      where: { tenantId },
      select: { id: true, sku: true, nombre: true },
    });
    const existingBySku = new Map(existingItems.filter(item => item.sku).map(item => [item.sku!.toLowerCase(), item]));
    const existingByName = new Map(existingItems.map(item => [item.nombre.toLowerCase(), item]));
    const newRows = rows.filter(row => {
      const sku = getValue(row, 'sku')?.toLowerCase();
      const nombre = getValue(row, 'nombre')?.toLowerCase();
      return !(sku && existingBySku.has(sku)) && !(nombre && existingByName.has(nombre));
    }).length;
    const maxAllowed = await checkFeatureLimit(tenantId, 'catalogo_items', newRows);
    if (!maxAllowed.allowed && maxAllowed.limit !== -1) {
      return NextResponse.json({ error: `El archivo supera el límite de productos de tu plan (${maxAllowed.limit}).` }, { status: 403 });
    }

    const imported: Array<{ row: number; id: string; action: 'created' | 'updated' }> = [];
    const errors: Array<{ row: number; field: string; message: string }> = [];

    for (let index = 0; index < rows.length; index++) {
      const rowNumber = index + 2;
      const row = rows[index];
      try {
        const nombre = getValue(row, 'nombre');
        if (!nombre) throw new Error('Nombre requerido');
        const precioBase = parseNumber(getValue(row, 'precioBase'));
        if (precioBase === undefined || precioBase < 0) throw new Error('Precio base inválido o requerido');

        const sku = getValue(row, 'sku') || null;
        const ownerEmail = getValue(row, 'propietarioEmail');
        let contactId: string | null | undefined;
        if (ownerEmail) {
          const owner = await prisma.contact.findFirst({
            where: { tenantId, email: { equals: ownerEmail, mode: 'insensitive' } },
            select: { id: true },
          });
          if (!owner) throw new Error(`No existe un contacto con email de propietario: ${ownerEmail}`);
          contactId = owner.id;
        }

        const existing = sku
          ? existingBySku.get(sku.toLowerCase())
          : existingByName.get(nombre.toLowerCase());

        const rawData = {
          nombre,
          descripcion: getValue(row, 'descripcion'),
          sku,
          tipo: getValue(row, 'tipo') || 'servicio',
          precioBase,
          moneda: getValue(row, 'moneda') || 'EUR',
          categoriaFiscal: getValue(row, 'categoriaFiscal') || 'general',
          tasaImpuestoId: getValue(row, 'tasaImpuestoId') || null,
          duracionMinutos: parseNumber(getValue(row, 'duracionMinutos')),
          modalidad: getValue(row, 'modalidad') || null,
          unidad: getValue(row, 'unidad') || 'unidad',
          activo: parseBoolean(getValue(row, 'activo'), true),
          destacado: parseBoolean(getValue(row, 'destacado'), false),
          visibleInChatbot: parseBoolean(getValue(row, 'visibleInChatbot'), false),
          categorias: splitList(getValue(row, 'categorias')) || [],
          etiquetas: splitList(getValue(row, 'etiquetas')) || [],
          costOfAcquisition: parseNumber(getValue(row, 'costOfAcquisition')) || 0,
          contactId: contactId === undefined ? undefined : contactId,
          customFieldValues: parseJson(getValue(row, 'customFieldValues'), 'Campos personalizados', rowNumber),
          metadata: parseJson(getValue(row, 'metadata'), 'Metadata', rowNumber),
          media: parseJson(getValue(row, 'media'), 'Media', rowNumber),
          pricing: parseJson(getValue(row, 'pricing'), 'Pricing', rowNumber),
        };

        const data: any = { ...rawData };
        const taxRateId = data.tasaImpuestoId;
        if (taxRateId) {
          const taxRate = await prisma.tasaImpuesto.findFirst({
            where: { id: taxRateId, tenantId },
            select: { id: true },
          });
          if (!taxRate) throw new Error(`La tasa de impuesto no pertenece a este tenant: ${taxRateId}`);
        }

        if (data.contactId === undefined) delete data.contactId;
        if (data.customFieldValues === undefined) delete data.customFieldValues;
        if (data.metadata === undefined) delete data.metadata;
        if (data.media === undefined) delete data.media;
        if (data.pricing === undefined) delete data.pricing;
        data.integrityHash = ItemIntegrityService.calculateHash({
          tenantId,
          nombre: data.nombre,
          sku: data.sku,
          precioBase: data.precioBase,
          costOfAcquisition: data.costOfAcquisition,
        });

        const item = existing
          ? await prisma.catalogoItem.update({ where: { id: existing.id }, data })
          : await prisma.catalogoItem.create({ data: { tenantId, ...data } });
        imported.push({ row: rowNumber, id: item.id, action: existing ? 'updated' : 'created' });
      } catch (error) {
        errors.push({ row: rowNumber, field: 'general', message: error instanceof Error ? error.message : 'Error al procesar la fila' });
      }
    }

    const status = errors.length === 0 ? 'completed' : imported.length > 0 ? 'partial' : 'failed';
    const log = await prisma.importLog.create({
      data: {
        tenantId,
        type: 'catalog',
        source: file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls') ? 'generic_xlsx' : 'generic_csv',
        fileName: file.name,
        fileSize: file.size,
        recordsTotal: rows.length,
        recordsImported: imported.length,
        recordsFailed: errors.length,
        errors: errors.length ? errors : undefined,
        columnMapping: Object.keys(rows[0]).map(sourceField => ({ sourceField, targetField: Object.keys(ALIASES).find(field => ALIASES[field].some(alias => normalize(alias) === normalize(sourceField))) || '__skip__' })),
        status,
        createdBy: auth.user?.id,
      },
    });

    return NextResponse.json({ success: errors.length === 0, imported: imported.length, failed: errors.length, total: rows.length, errors, results: imported, logId: log.id });
  } catch (error) {
    console.error('[POST /api/catalogo/import] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error al importar el catálogo' }, { status: 500 });
  }
}
