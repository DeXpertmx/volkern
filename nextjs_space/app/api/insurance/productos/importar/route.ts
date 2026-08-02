export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import {
  buildImportReport,
  capErrores,
  type ImportRowError,
  type ImportCreatedSummary,
} from '@/lib/insurance/import-report';
import {
  parseCSVSmart,
  suggestProductosMapping,
} from '@/lib/insurance/csv-wizard';

/** Lista canónica de Productos — debe estar sincronizada con
 *  PRODUCTOS_COLUMN_SYNONYMS en lib/insurance/csv-wizard.ts y con
 *  TEMPLATE_PRODUCTOS_COLUMNS en lib/insurance/csv-template.ts.
 *  Solo `nombre` y `aseguradoraNombre` son obligatorios. */
const PRODUCTOS_REQUIRED = ['nombre', 'aseguradoraNombre'] as const;

/** Set de valores válidos del enum Ramo (en minúsculas para matching). */
const RAMO_VALIDOS = new Set([
  'AUTO',
  'HOGAR',
  'VIDA',
  'SALUD',
  'GASTOS_MEDICOS',
  'EMPRESARIAL',
  'RESPONSABILIDAD_CIVIL',
  'INCENDIO',
  'TRANSPORTE',
  'AHORRO',
  'JUBILACION',
  'OTROS',
]);

/** Normaliza un ramo del CSV al enum de Prisma (case-insensitive + sin acentos). */
function normalizarRamo(valor: string): string {
  if (!valor) return 'OTROS';
  const limpio = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  if (RAMO_VALIDOS.has(limpio)) return limpio;
  const alias: Record<string, string> = {
    GASTOSMEDICOS: 'GASTOS_MEDICOS',
    RC: 'RESPONSABILIDAD_CIVIL',
    RESPONSABILIDADCIVIL: 'RESPONSABILIDAD_CIVIL',
    COCHE: 'AUTO',
    CAR: 'AUTO',
    CASA: 'HOGAR',
    HOME: 'HOGAR',
    VEHICULO: 'AUTO',
  };
  return alias[limpio] ?? 'OTROS';
}

/**
 * PUT - Analizar archivo (sin guardar)
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['insurance:write', 'config:write']);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
    }
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Por ahora solo CSV. Convierte tu Excel a CSV.' },
        { status: 400 }
      );
    }

    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB > 20 MB).` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = buffer.toString('utf-8');
    const parsed = parseCSVSmart(text);
    if (!parsed.headers.length || parsed.rows.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
    }

    const sugerencia = suggestProductosMapping(parsed.headers);
    const autoMapAvailable = PRODUCTOS_REQUIRED.every(c => sugerencia.mapping[c]);

    return NextResponse.json({
      fileName: file.name,
      delimiter: parsed.delimiter,
      delimiterLabel:
        parsed.delimiter === ','
          ? 'coma'
          : parsed.delimiter === ';'
            ? 'punto y coma'
            : 'tabulador',
      totalRows: parsed.rows.length,
      columns: parsed.headers,
      preview: parsed.rows.slice(0, 10),
      mapeoSugerido: sugerencia.mapping,
      matches: sugerencia.matches,
      autoMapAvailable,
    });
  } catch (error) {
    console.error('Error al analizar productos:', error);
    return NextResponse.json(
      { error: 'Error al analizar el archivo: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST - Importar productos
 *
 * Por cada fila: localiza/crea la aseguradora por nombre (case-insensitive),
 * luego crea el ProductoSeguro. Si ya existe el producto por la unique
 * (tenantId, aseguradoraId, nombre), completa campos faltantes sin pisar.
 */
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
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'Por ahora solo CSV' }, { status: 400 });
    }

    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB > 20 MB).` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = buffer.toString('utf-8');
    const parsed = parseCSVSmart(text);
    const fileType = 'csv';

    let mapping: Record<string, string> = {};
    let autoMapped = false;
    if (mappingStr && mappingStr !== 'null' && mappingStr !== '{}') {
      try {
        const parsedMapping = JSON.parse(mappingStr);
        if (
          parsedMapping &&
          typeof parsedMapping === 'object' &&
          !Array.isArray(parsedMapping)
        ) {
          mapping = Object.fromEntries(
            Object.entries(parsedMapping).filter(
              ([, v]) => typeof v === 'string' && v.length > 0
            )
          ) as Record<string, string>;
        }
      } catch {
        mapping = {};
      }
    }
    if (Object.keys(mapping).length === 0) {
      mapping = suggestProductosMapping(parsed.headers).mapping;
      autoMapped = true;
    }

    const missing = PRODUCTOS_REQUIRED.filter(f => !mapping[f]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Faltan columnas requeridas en el mapeo: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const tenantId = auth.tenant!.id;
    const rows = parsed.rows;
    const errores: ImportRowError[] = [];
    const creadas: ImportCreatedSummary = {
      clientes: [],
      aseguradoras: [],
      productos: [],
    };
    let importadas = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const fila = i + 2;

      const get = (key: string): string | undefined => {
        const header = mapping[key];
        if (!header) return undefined;
        const v = row[header];
        return typeof v === 'string' ? v.trim() : '';
      };

      const nombre = get('nombre') ?? '';
      const aseguradoraNombre = get('aseguradoraNombre') ?? '';
      const ramoTexto = get('ramo') ?? '';
      const subramo = get('subramo') ?? '';
      const descripcion = get('descripcion') ?? '';
      const primaReferenciaStr = get('primaReferencia') ?? '';
      const comisionPorDefectoStr = get('comisionPorDefecto') ?? get('comisionPct') ?? '';

      // Validación: nombre y aseguradora requeridos.
      if (!nombre || !aseguradoraNombre) {
        const campos: string[] = [];
        if (!nombre) campos.push('nombre');
        if (!aseguradoraNombre) campos.push('aseguradoraNombre');
        errores.push({
          fila,
          numeroPoliza: nombre || aseguradoraNombre || undefined,
          motivo: 'Faltan campos obligatorios',
          camposFaltantes: campos,
          datosCrudos: row,
        });
        continue;
      }

      try {
        // Buscar o crear la aseguradora (case-insensitive).
        let aseguradora = await prisma.aseguradora.findFirst({
          where: {
            tenantId,
            nombre: { equals: aseguradoraNombre, mode: 'insensitive' },
          },
        });
        let aseguradoraCreada = false;
        if (!aseguradora) {
          aseguradora = await prisma.aseguradora.create({
            data: {
              tenantId,
              nombre: aseguradoraNombre,
              email: `empresa-${aseguradoraNombre.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${Date.now()}@volkern.app`,
              notas: 'Aseguradora auto-creada al importar productos',
            },
          });
          aseguradoraCreada = true;
        }

        const ramoNormalizado = normalizarRamo(ramoTexto);
        const primaReferencia = primaReferenciaStr ? parseFloat(primaReferenciaStr) : null;
        const comisionPct = comisionPorDefectoStr ? parseFloat(comisionPorDefectoStr) : null;

        // Buscar o crear el producto (unique por tenantId+aseguradoraId+nombre).
        let producto = await prisma.productoSeguro.findFirst({
          where: {
            tenantId,
            aseguradoraId: aseguradora.id,
            nombre,
          },
        });
        let fueCreada = false;
        if (!producto) {
          producto = await prisma.productoSeguro.create({
            data: {
              tenantId,
              aseguradoraId: aseguradora.id,
              nombre,
              ramo: ramoNormalizado as any,
              subramo: subramo || null,
              descripcion: descripcion || null,
              primaReferencia: Number.isFinite(primaReferencia as number)
                ? (primaReferencia as number)
                : null,
              comisionPct: Number.isFinite(comisionPct as number)
                ? (comisionPct as number)
                : null,
              activo: true,
            },
          });
          fueCreada = true;
        } else if (descripcion || subramo || Number.isFinite(primaReferencia as number)) {
          await prisma.productoSeguro.update({
            where: { id: producto.id },
            data: {
              subramo: producto.subramo ?? (subramo || null),
              descripcion: producto.descripcion ?? (descripcion || null),
              primaReferencia:
                producto.primaReferencia ?? (Number.isFinite(primaReferencia as number) ? (primaReferencia as number) : null),
              comisionPct:
                producto.comisionPct ?? (Number.isFinite(comisionPct as number) ? (comisionPct as number) : null),
            },
          });
        }

        // De-duplicar en el reporte.
        const productEntry = {
          nombre: producto.nombre,
          ramo: producto.ramo,
          aseguradora: aseguradora.nombre,
          aseguradoraNombre: aseguradora.nombre,
          fueCreado: fueCreada,
        };
        if (
          !creadas.productos.some(
            p =>
              p.nombre === productEntry.nombre &&
              p.aseguradoraNombre === productEntry.aseguradoraNombre
          )
        ) {
          creadas.productos.push(productEntry);
        }
        if (aseguradoraCreada) {
          const asegEntry = {
            nombre: aseguradora.nombre,
            nif: aseguradora.nif ?? undefined,
            fueCreada: true,
          };
          if (
            !creadas.aseguradoras.some(a => a.nombre === asegEntry.nombre)
          ) {
            creadas.aseguradoras.push(asegEntry);
          }
        }
        importadas++;
      } catch (rowErr) {
        errores.push({
          fila,
          numeroPoliza: nombre || aseguradoraNombre || undefined,
          motivo: 'Error al guardar el producto',
          detalle: (rowErr as Error).message,
          datosCrudos: row,
        });
      }
    }

    const report = buildImportReport({
      fileName: file.name,
      totalRows: rows.length,
      importadas,
      errores: capErrores(errores, 200),
      creadas,
    });

    const reportSerialized = JSON.parse(JSON.stringify(report));
    const erroresSerialized = JSON.parse(JSON.stringify(report.errores));
    const log = await prisma.insuranceImportLog.create({
      data: {
        tenantId,
        fileName: file.name,
        fileType,
        totalRows: report.totalRows,
        rowsImported: report.importadas,
        rowsFailed: report.fallidas,
        errors: erroresSerialized,
        summary: reportSerialized,
        createdById: auth.user!.id,
      },
    });

    return NextResponse.json({
      success: true,
      report: { ...report, logId: log.id, autoMapped },
    });
  } catch (error) {
    console.error('Error al importar productos:', error);
    return NextResponse.json(
      { error: 'Error al importar productos: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
