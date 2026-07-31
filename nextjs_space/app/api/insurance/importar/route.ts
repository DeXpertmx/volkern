export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// POST - Importar pólizas desde Excel/CSV
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mappingStr = formData.get('mapping') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
    }
    if (!mappingStr) {
      return NextResponse.json({ error: 'Mapeo de columnas requerido' }, { status: 400 });
    }

    const mapping: Record<string, string> = JSON.parse(mappingStr);
    const fileType = file.name.endsWith('.csv') ? 'csv' : 'xlsx';

    // Parsear el archivo según el tipo
    let rows: Record<string, string>[];
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = buffer.toString('utf-8');

      if (fileType === 'csv') {
        rows = parseCSV(text);
      } else {
        return NextResponse.json(
          { error: 'Formato XLSX requiere librería xlsx. Por ahora solo se soporta CSV. Convierte tu Excel a CSV.' },
          { status: 400 }
        );
      }
    } catch (parseErr) {
      return NextResponse.json({ error: 'Error al parsear el archivo: ' + (parseErr as Error).message }, { status: 400 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
    }

    // Validar columnas requeridas en el mapping
    const requiredFields = ['numeroPoliza', 'clienteNombre', 'aseguradoraNombre', 'fechaInicio', 'fechaVencimiento'];
    const missingFields = requiredFields.filter(f => !mapping[f]);
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Faltan columnas requeridas en el mapeo: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    const tenantId = auth.tenant!.id;
    const results = {
      totalRows: rows.length,
      rowsImported: 0,
      rowsFailed: 0,
      errors: [] as { row: number; error: string }[],
      nuevasAseguradoras: 0,
      nuevosProductos: 0,
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const numeroPoliza = row[mapping.numeroPoliza]?.trim();
        const clienteNombre = row[mapping.clienteNombre]?.trim();
        const aseguradoraNombre = row[mapping.aseguradoraNombre]?.trim();
        const productoSeguroNombre = mapping.productoSeguroNombre ? row[mapping.productoSeguroNombre]?.trim() : null;
        const ramoStr = mapping.ramo ? row[mapping.ramo]?.trim() : 'OTROS';
        const primaAnual = mapping.primaAnual ? parseFloat(row[mapping.primaAnual]) : null;
        const fechaInicio = new Date(row[mapping.fechaInicio]);
        const fechaVencimiento = new Date(row[mapping.fechaVencimiento]);
        const clienteEmail = mapping.clienteEmail ? row[mapping.clienteEmail]?.trim() : null;
        const clienteTelefono = mapping.clienteTelefono ? row[mapping.clienteTelefono]?.trim() : null;

        if (!numeroPoliza || !clienteNombre || !aseguradoraNombre || isNaN(fechaInicio.getTime()) || isNaN(fechaVencimiento.getTime())) {
          results.rowsFailed++;
          results.errors.push({ row: i + 2, error: 'Datos incompletos o fecha inválida' });
          continue;
        }

        // Verificar duplicado de póliza
        const polizaExistente = await prisma.poliza.findFirst({
          where: { tenantId, numeroPoliza },
        });
        if (polizaExistente) {
          results.rowsFailed++;
          results.errors.push({ row: i + 2, error: `Póliza ${numeroPoliza} ya existe` });
          continue;
        }

        // Buscar o crear cliente (contact)
        let cliente = await prisma.contact.findFirst({
          where: { tenantId, nombre: clienteNombre },
        });
        if (!cliente) {
          cliente = await prisma.contact.create({
            data: {
              tenantId,
              nombre: clienteNombre,
              email: clienteEmail || `${clienteNombre.toLowerCase().replace(/\s+/g, '.')}@importado.local`,
              telefono: clienteTelefono || null,
              tipo: 'person',
            },
          });
        }

        // Buscar o crear aseguradora
        let aseguradora = await prisma.aseguradora.findFirst({
          where: { tenantId, nombre: aseguradoraNombre },
        });
        if (!aseguradora) {
          aseguradora = await prisma.aseguradora.create({
            data: { tenantId, nombre: aseguradoraNombre },
          });
          results.nuevasAseguradoras++;
        }

        // Buscar o crear producto
        let productoNombre = productoSeguroNombre || `Seguro ${ramoStr} ${aseguradoraNombre}`;
        let producto = await prisma.productoSeguro.findFirst({
          where: { tenantId, aseguradoraId: aseguradora.id, nombre: productoNombre },
        });
        if (!producto) {
          // Verificar ramo válido
          const ramosValidos = ['AUTO', 'HOGAR', 'VIDA', 'SALUD', 'GASTOS_MEDICOS', 'EMPRESARIAL', 'RESPONSABILIDAD_CIVIL', 'INCENDIO', 'TRANSPORTE', 'AHORRO', 'JUBILACION', 'OTROS'];
          const ramoFinal = ramosValidos.includes(ramoStr?.toUpperCase() || '') ? ramoStr!.toUpperCase() : 'OTROS';

          producto = await prisma.productoSeguro.create({
            data: {
              tenantId,
              aseguradoraId: aseguradora.id,
              nombre: productoNombre,
              ramo: ramoFinal as any,
              primaReferencia: primaAnual || null,
            },
          });
          results.nuevosProductos++;
        }

        // Crear póliza
        await prisma.poliza.create({
          data: {
            tenantId,
            clienteId: cliente.id,
            aseguradoraId: aseguradora.id,
            productoSeguroId: producto.id,
            numeroPoliza,
            primaAnual: primaAnual || null,
            fechaInicio,
            fechaVencimiento,
            createdById: auth.user!.id,
          },
        });

        results.rowsImported++;
      } catch (rowErr) {
        results.rowsFailed++;
        results.errors.push({ row: i + 2, error: (rowErr as Error).message });
      }
    }

    // Registrar log de importación
    await prisma.insuranceImportLog.create({
      data: {
        tenantId,
        fileName: file.name,
        fileType,
        totalRows: results.totalRows,
        rowsImported: results.rowsImported,
        rowsFailed: results.rowsFailed,
        errors: results.errors,
        summary: {
          nuevasAseguradoras: results.nuevasAseguradoras,
          nuevosProductos: results.nuevosProductos,
        },
        createdById: auth.user!.id,
      },
    });

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Error al importar pólizas:', error);
    return NextResponse.json({ error: 'Error al importar pólizas: ' + (error as Error).message }, { status: 500 });
  }
}

// POST - Previsualizar archivo (sin guardar)
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:read', 'catalogo:read']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = buffer.toString('utf-8');
    const rows = parseCSV(text);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
    }

    // Devolver primeras 10 filas + nombres de columnas
    const columns = Object.keys(rows[0]);
    const preview = rows.slice(0, 10);

    return NextResponse.json({
      fileName: file.name,
      totalRows: rows.length,
      columns,
      preview,
    });
  } catch (error) {
    console.error('Error al previsualizar archivo:', error);
    return NextResponse.json({ error: 'Error al previsualizar archivo' }, { status: 500 });
  }
}

// ─── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() || '';
    }
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else if (char === ';' && !inQuotes) {
      // Soporte para separador punto y coma (formato español)
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}
