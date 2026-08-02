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
  suggestAseguradorasMapping,
} from '@/lib/insurance/csv-wizard';

/** Lista canónica de Aseguradoras — debe estar sincronizada con
 *  ASEGURADORAS_COLUMN_SYNONYMS en lib/insurance/csv-wizard.ts y con
 *  TEMPLATE_ASEGURADORAS_COLUMNS en lib/insurance/csv-template.ts.
 *  Sólo el campo `nombre` es obligatorio para crear una aseguradora. */
const ASEGURADORAS_REQUIRED = ['nombre'] as const;

/**
 * PUT - Analizar archivo (sin guardar)
 *
 * Devuelve todo lo necesario para que la UI arme el paso 2 del wizard:
 *   - delimiter + delimiterLabel
 *   - columns detectadas
 *   - mapeoSugerido con confianza >= 0.6
 *   - matches por canónico (también los no matcheados con confidence 0)
 *   - autoMapAvailable si todas las requiredFields se sugirieron
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

    // Limite defensivo de tamaño (20MB)
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

    const sugerencia = suggestAseguradorasMapping(parsed.headers);
    const autoMapAvailable = ASEGURADORAS_REQUIRED.every(c => sugerencia.mapping[c]);

    return NextResponse.json({
      fileName: file.name,
      delimiter: parsed.delimiter,
      delimiterLabel: parsed.delimiter === ',' ? 'coma' : parsed.delimiter === ';' ? 'punto y coma' : 'tabulador',
      totalRows: parsed.rows.length,
      columns: parsed.headers,
      preview: parsed.rows.slice(0, 10),
      mapeoSugerido: sugerencia.mapping,
      matches: sugerencia.matches,
      autoMapAvailable,
    });
  } catch (error) {
    console.error('Error al analizar aseguradoras:', error);
    return NextResponse.json({ error: 'Error al analizar el archivo: ' + (error as Error).message }, { status: 500 });
  }
}

/**
 * POST - Importar aseguradoras
 *
 * Crea nuevas aseguradoras por nombre. Si ya existe (por tenantId + nombre),
 * la reusa. Persiste log completo en insuranceImportLog y devuelve
 * ImportReport con conteos + reporte descargable.
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
        if (parsedMapping && typeof parsedMapping === 'object' && !Array.isArray(parsedMapping)) {
          mapping = Object.fromEntries(
            Object.entries(parsedMapping).filter(([, v]) => typeof v === 'string' && v.length > 0)
          ) as Record<string, string>;
        }
      } catch {
        mapping = {};
      }
    }
    if (Object.keys(mapping).length === 0) {
      mapping = suggestAseguradorasMapping(parsed.headers).mapping;
      autoMapped = true;
    }

    const missing = ASEGURADORAS_REQUIRED.filter(f => !mapping[f]);
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

      // Mapeo de columnas a campos del Aseguradora.
      const get = (key: string): string | undefined => {
        const header = mapping[key];
        if (!header) return undefined;
        const v = row[header];
        return typeof v === 'string' ? v.trim() : '';
      };
      const nombre = get('nombre') ?? '';
      const razonSocial = get('razonSocial') ?? '';
      const nombreComercial = get('nombreComercial') ?? '';
      const nif = get('nif') ?? get('identificacionFiscal') ?? '';
      const regimenFiscal = get('regimenFiscal') ?? '';
      const direccion = get('direccion') ?? get('domicilioFiscal') ?? '';
      const codigoPostal = get('codigoPostal') ?? '';
      const provincia = get('provincia') ?? '';
      const pais = get('pais') ?? '';
      const telefono = get('telefono') ?? '';
      const email = get('email') ?? '';
      const web = get('web') ?? get('sitioWeb') ?? '';
      const numeroRegistro = get('numeroRegistro') ?? '';
      const fechaInicio = get('fechaVigenciaLicenciaInicio') ?? '';
      const fechaFin = get('fechaVigenciaLicenciaFin') ?? '';
      const notas = get('notas') ?? '';

      // Validación: nombre obligatorio.
      if (!nombre) {
        errores.push({
          fila,
          numeroPoliza: nombre || undefined,
          motivo: 'Falta el nombre de la aseguradora',
          camposFaltantes: ['nombre'],
          datosCrudos: row,
        });
        continue;
      }

      try {
        // Buscar o crear por tenantId + nombre (case-insensitive).
        let aseguradora = await prisma.aseguradora.findFirst({
          where: {
            tenantId,
            nombre: { equals: nombre, mode: 'insensitive' },
          },
        });

        let fueCreada = false;
        if (!aseguradora) {
          aseguradora = await prisma.aseguradora.create({
            data: {
              tenantId,
              nombre,
              nif: nif || null,
              regimenFiscal: regimenFiscal || null,
              direccion: direccion || null,
              codigoPostal: codigoPostal || null,
              provincia: provincia || null,
              pais: pais || null,
              telefono: telefono || null,
              email: email || null,
              web: web || null,
              numeroRegistro: numeroRegistro || null,
              fechaVigenciaLicenciaInicio: fechaInicio ? new Date(fechaInicio) : null,
              fechaVigenciaLicenciaFin: fechaFin ? new Date(fechaFin) : null,
              razonSocial: razonSocial || null,
              nombreComercial: nombreComercial || null,
              notas: notas || null,
            },
          });
          fueCreada = true;
        } else if (
          nif || razonSocial || direccion || telefono || email || numeroRegistro
        ) {
          // Aseguradora ya existe: completar campos faltantes (no destructivo).
          await prisma.aseguradora.update({
            where: { id: aseguradora.id },
            data: {
              nif: aseguradora.nif ?? (nif || null),
              regimenFiscal: aseguradora.regimenFiscal ?? (regimenFiscal || null),
              direccion: aseguradora.direccion ?? (direccion || null),
              codigoPostal: aseguradora.codigoPostal ?? (codigoPostal || null),
              provincia: aseguradora.provincia ?? (provincia || null),
              pais: aseguradora.pais ?? (pais || null),
              telefono: aseguradora.telefono ?? (telefono || null),
              email: aseguradora.email ?? (email || null),
              web: aseguradora.web ?? (web || null),
              numeroRegistro: aseguradora.numeroRegistro ?? (numeroRegistro || null),
              razonSocial: aseguradora.razonSocial ?? (razonSocial || null),
              nombreComercial: aseguradora.nombreComercial ?? (nombreComercial || null),
              notas: aseguradora.notas ?? (notas || null),
            },
          });
        }

        // De-duplicar reporte de creadas.
        const entry = {
          nombre: aseguradora.nombre,
          nif: aseguradora.nif ?? (nif || undefined),
          fueCreada,
        };
        if (!creadas.aseguradoras.some(a => a.nombre === entry.nombre)) {
          creadas.aseguradoras.push(entry);
        }
        importadas++;
      } catch (rowErr) {
        errores.push({
          fila,
          numeroPoliza: nombre || undefined,
          motivo: 'Error al guardar la aseguradora',
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
    console.error('Error al importar aseguradoras:', error);
    return NextResponse.json({ error: 'Error al importar aseguradoras: ' + (error as Error).message }, { status: 500 });
  }
}
