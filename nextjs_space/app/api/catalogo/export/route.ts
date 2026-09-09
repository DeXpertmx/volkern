export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { stringify } from 'csv-stringify/sync';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

const EXPORT_HEADERS = [
  'Nombre',
  'Descripción',
  'SKU',
  'Tipo',
  'Precio base',
  'Moneda',
  'Categoría fiscal',
  'Tasa impuesto ID',
  'Duración minutos',
  'Modalidad',
  'Unidad',
  'Activo',
  'Destacado',
  'Visible en chatbot',
  'Categorías',
  'Etiquetas',
  'Costo de adquisición',
  'Propietario email',
  'Campos personalizados (JSON)',
  'Metadata (JSON)',
  'Media (JSON)',
  'Pricing (JSON)',
];

function jsonCell(value: unknown): string {
  return value == null ? '' : JSON.stringify(value);
}

function itemToRow(item: any): Record<string, string | number> {
  return {
    'Nombre': item.nombre,
    'Descripción': item.descripcion || '',
    'SKU': item.sku || '',
    'Tipo': item.tipo || 'servicio',
    'Precio base': item.precioBase,
    'Moneda': item.moneda || '',
    'Categoría fiscal': item.categoriaFiscal || 'general',
    'Tasa impuesto ID': item.tasaImpuestoId || '',
    'Duración minutos': item.duracionMinutos ?? '',
    'Modalidad': item.modalidad || '',
    'Unidad': item.unidad || 'unidad',
    'Activo': item.activo ? 'Sí' : 'No',
    'Destacado': item.destacado ? 'Sí' : 'No',
    'Visible en chatbot': item.visibleInChatbot ? 'Sí' : 'No',
    'Categorías': (item.categorias || []).join('; '),
    'Etiquetas': (item.etiquetas || []).join('; '),
    'Costo de adquisición': item.costOfAcquisition ?? 0,
    'Propietario email': item.ownerContact?.email || '',
    'Campos personalizados (JSON)': jsonCell(item.customFieldValues),
    'Metadata (JSON)': jsonCell(item.metadata),
    'Media (JSON)': jsonCell(item.media),
    'Pricing (JSON)': jsonCell(item.pricing),
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['config:read', 'catalogo:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const items = await prisma.catalogoItem.findMany({
      where: { tenantId: auth.tenant!.id },
      include: {
        ownerContact: { select: { email: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    const rows = items.map(itemToRow);
    const format = (new URL(req.url).searchParams.get('format') || 'csv').toLowerCase();
    const date = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx' || format === 'xls') {
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(rows, { header: EXPORT_HEADERS });
      worksheet['!cols'] = EXPORT_HEADERS.map((header) => ({
        wch: header.includes('JSON') ? 34 : header.length + 4,
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Catálogo');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="catalogo_${date}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format !== 'csv') {
      return NextResponse.json({ error: 'Formato no válido. Usa csv o xlsx.' }, { status: 400 });
    }

    const csv = stringify(rows, { header: true, bom: true, columns: EXPORT_HEADERS });
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="catalogo_${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[GET /api/catalogo/export] Error:', error);
    return NextResponse.json({ error: 'Error al exportar el catálogo' }, { status: 500 });
  }
}
