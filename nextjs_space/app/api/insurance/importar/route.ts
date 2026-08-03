export const dynamic = 'force-dynamic';
// Cache de import por usuario: cada POST procesa un archivo distinto y
// nunca debe servirse desde cache (forzamos siempre SSR fresco).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import {
  buildImportReport,
  capErrores,
  type CrearAseguradora,
  type CrearCliente,
  type CrearProducto,
  type ImportRowError,
  type ImportCreatedSummary,
} from '@/lib/insurance/import-report';
import {
  parseCSVSmart,
  suggestPolizasMapping,
} from '@/lib/insurance/csv-wizard';
import { maybeAutoFixTenantCurrencyAfterImport } from '@/lib/insurance/post-import-moneda-autofix';

// Required fields by key (the importer prefixes these with the mapped header name).
const REQUIRED_FIELDS = ['numeroPoliza', 'clienteNombre', 'aseguradoraNombre', 'fechaInicio', 'fechaVencimiento'] as const;

const RAMOS_VALIDOS = [
  'AUTO', 'HOGAR', 'VIDA', 'SALUD', 'GASTOS_MEDICOS',
  'EMPRESARIAL', 'RESPONSABILIDAD_CIVIL', 'INCENDIO', 'TRANSPORTE',
  'AHORRO', 'JUBILACION', 'OTROS',
] as const;
type RamoValido = typeof RAMOS_VALIDOS[number];

/**
 * POST - Importar pólizas desde CSV.
 *
 * Devuelve un reporte estructurado (`ImportReport`) con:
 *   - Conteos globales (total, importadas, fallidas)
 *   - Lista de errores por fila: motivo + campos faltantes + datos crudos
 *   - Resumen de entidades creadas (clientes, aseguradoras, productos)
 *
 * El reporte también se persiste en `insuranceImportLog.summary` (Json) para
 * que el broker pueda descargarlo después o compartirlo con soporte.
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
    // ── Límite de tamaño: 20MB para CSV. Evita OOM en archivos grandes.
    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB > 20 MB). Divide tu cartera.` },
        { status: 413 }
      );
    }
    // ── Auto-mapping si el cliente no envía mapping (compatibilidad +0 friccion)
    const fileType = file.name.endsWith('.csv') ? 'csv' : 'xlsx';

    // ── Parsear el archivo (siempre, para obtener headers incluso si vamos
    //    a auto-mapear) ───────────────────────────────────────────────────
    let rows: Record<string, string>[];
    let userHeaders: string[];
    let detectedDelimiter: string;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = buffer.toString('utf-8');

      if (fileType !== 'csv') {
        return NextResponse.json(
          { error: 'Formato XLSX requiere librería xlsx. Por ahora solo se soporta CSV. Convierte tu Excel a CSV.' },
          { status: 400 }
        );
      }
      const parsed = parseCSVSmart(text);
      rows = parsed.rows;
      userHeaders = parsed.headers;
      detectedDelimiter = parsed.delimiter;
    } catch (parseErr) {
      return NextResponse.json({ error: 'Error al parsear el archivo: ' + (parseErr as Error).message }, { status: 400 });
    }

    // ── Resolver mapping: explícito > sugerido ────────────────────────────
    let mapping: Record<string, string> = {};
    let autoMapped = false;
    if (mappingStr && mappingStr !== 'null' && mappingStr !== '{}') {
      try {
        const parsed = JSON.parse(mappingStr);
        // Defensive: rechazar arrays y quedarse solo con strings en los values
        // (un cliente malicioso podría mandar objects → bugs silenciosos).
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          mapping = Object.fromEntries(
            Object.entries(parsed).filter(([, v]) => typeof v === 'string' && v.length > 0)
          ) as Record<string, string>;
        }
      } catch {
        mapping = {};
      }
    }
    if (Object.keys(mapping).length === 0) {
      const sugerido = suggestPolizasMapping(userHeaders);
      mapping = sugerido.mapping;
      autoMapped = true;
    }

    // ── Validar columnas requeridas ──────────────────────────────────────
    const missingFields = REQUIRED_FIELDS.filter(f => !mapping[f]);
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Faltan columnas requeridas en el mapeo: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
    }

    const tenantId = auth.tenant!.id;

    // Capturamos timestamp antes del loop para, al final, identificar las
    // pólizas recién insertadas (se las pasamos al auto-fix de tenant.moneda).
    const batchStartTime = new Date();

    // ── Estado del proceso de import ─────────────────────────────────────
    const errores: ImportRowError[] = [];
    const creadas: ImportCreatedSummary = {
      clientes: [],
      aseguradoras: [],
      productos: [],
    };
    let importadas = 0;

    // ── Loop por fila ────────────────────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Fila +2 porque la fila 1 es la cabecera, y el primer dato es la fila 2.
      const fila = i + 2;

      const numeroPoliza = (row[mapping.numeroPoliza] ?? '').trim();
      const clienteNombre = (row[mapping.clienteNombre] ?? '').trim();
      const aseguradoraNombre = (row[mapping.aseguradoraNombre] ?? '').trim();
      const productoSeguroNombre = mapping.productoSeguroNombre ? (row[mapping.productoSeguroNombre] ?? '').trim() : '';
      const ramoStr = mapping.ramo ? (row[mapping.ramo] ?? '').trim() : 'OTROS';
      const primaAnual = mapping.primaAnual ? parseFloat(row[mapping.primaAnual]) : null;
      const fechaInicioRaw = (row[mapping.fechaInicio] ?? '').trim();
      const fechaVencimientoRaw = (row[mapping.fechaVencimiento] ?? '').trim();
      const fechaInicio = new Date(fechaInicioRaw);
      const fechaVencimiento = new Date(fechaVencimientoRaw);
      const clienteEmail = mapping.clienteEmail ? (row[mapping.clienteEmail] ?? '').trim() : '';
      const clienteTelefono = mapping.clienteTelefono ? (row[mapping.clienteTelefono] ?? '').trim() : '';

      // ── Validación de campos obligatorios ─────────────────────────────
      const faltantes: string[] = [];
      if (!numeroPoliza) faltantes.push('numeroPoliza');
      if (!clienteNombre) faltantes.push('clienteNombre');
      if (!aseguradoraNombre) faltantes.push('aseguradoraNombre');
      if (!fechaInicioRaw) faltantes.push('fechaInicio');
      else if (isNaN(fechaInicio.getTime())) faltantes.push('fechaInicio (formato inválido)');
      if (!fechaVencimientoRaw) faltantes.push('fechaVencimiento');
      else if (isNaN(fechaVencimiento.getTime())) faltantes.push('fechaVencimiento (formato inválido)');

      if (faltantes.length > 0) {
        errores.push({
          fila,
          numeroPoliza: numeroPoliza || undefined,
          cliente: clienteNombre || undefined,
          aseguradora: aseguradoraNombre || undefined,
          motivo: 'Datos incompletos o fecha inválida',
          camposFaltantes: faltantes,
          datosCrudos: row,
        });
        continue;
      }

      try {
        // ── 1. Póliza duplicada ────────────────────────────────────────
        const polizaExistente = await prisma.poliza.findFirst({
          where: { tenantId, numeroPoliza },
        });
        if (polizaExistente) {
          errores.push({
            fila,
            numeroPoliza,
            cliente: clienteNombre,
            aseguradora: aseguradoraNombre,
            motivo: `Póliza "${numeroPoliza}" ya existe en tu cartera`,
            detalle: 'Si quieres reemplazarla, elimínala primero desde la ficha de la póliza.',
            datosCrudos: row,
          });
          continue;
        }

        // ── 2. Cliente (buscar o crear) ─────────────────────────────────
        let cliente = await prisma.contact.findFirst({
          where: { tenantId, nombre: clienteNombre },
        });
        let clienteFueCreado = false;
        if (!cliente) {
          const fallbackEmail = clienteEmail
            || `${clienteNombre.toLowerCase().replace(/\s+/g, '.')}@importado.local`;
          cliente = await prisma.contact.create({
            data: {
              tenantId,
              nombre: clienteNombre,
              email: fallbackEmail,
              telefono: clienteTelefono || null,
              tipo: 'person',
            },
          });
          clienteFueCreado = true;
        }
        const clienteEntry: CrearCliente = {
          nombre: cliente.nombre,
          email: cliente.email,
          telefono: cliente.telefono,
          fueCreado: clienteFueCreado,
        };
        // De-duplicar por email/nombre para que el reporte sea limpio.
        if (!creadas.clientes.some(c => c.nombre === clienteEntry.nombre && c.email === clienteEntry.email)) {
          creadas.clientes.push(clienteEntry);
        }

        // ── 3. Aseguradora (buscar o crear) ─────────────────────────────
        let aseguradora = await prisma.aseguradora.findFirst({
          where: { tenantId, nombre: aseguradoraNombre },
        });
        let aseguradoraFueCreada = false;
        if (!aseguradora) {
          aseguradora = await prisma.aseguradora.create({
            data: { tenantId, nombre: aseguradoraNombre },
          });
          aseguradoraFueCreada = true;
        }
        const asegEntry: CrearAseguradora = {
          nombre: aseguradora.nombre,
          fueCreada: aseguradoraFueCreada,
        };
        if (!creadas.aseguradoras.some(a => a.nombre === asegEntry.nombre)) {
          creadas.aseguradoras.push(asegEntry);
        }

        // ── 4. Producto (buscar o crear) ─────────────────────────────────
        const productoNombre = productoSeguroNombre || `Seguro ${ramoStr || 'OTROS'} ${aseguradoraNombre}`;
        const ramoFinal: RamoValido = (RAMOS_VALIDOS as readonly string[]).includes((ramoStr || '').toUpperCase())
          ? ((ramoStr || 'OTROS').toUpperCase() as RamoValido)
          : 'OTROS';

        let producto = await prisma.productoSeguro.findFirst({
          where: { tenantId, aseguradoraId: aseguradora.id, nombre: productoNombre },
        });
        let productoFueCreado = false;
        if (!producto) {
          producto = await prisma.productoSeguro.create({
            data: {
              tenantId,
              aseguradoraId: aseguradora.id,
              nombre: productoNombre,
              ramo: ramoFinal,
              primaReferencia: primaAnual || null,
            },
          });
          productoFueCreado = true;
        }
        const prodEntry: CrearProducto = {
          nombre: producto.nombre,
          ramo: producto.ramo,
          aseguradora: aseguradora.nombre,
          fueCreado: productoFueCreado,
        };
        if (!creadas.productos.some(p => p.nombre === prodEntry.nombre && p.aseguradora === prodEntry.aseguradora)) {
          creadas.productos.push(prodEntry);
        }

        // ── 5. Crear la póliza ──────────────────────────────────────────
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

        importadas++;
      } catch (rowErr) {
        errores.push({
          fila,
          numeroPoliza: numeroPoliza || undefined,
          cliente: clienteNombre || undefined,
          aseguradora: aseguradoraNombre || undefined,
          motivo: 'Error al guardar la fila',
          detalle: (rowErr as Error).message,
          datosCrudos: row,
        });
      }
    }

    // ── Armar reporte final (cortamos errores a 200 para no inflar el JSON) ─────
    const report = buildImportReport({
      fileName: file.name,
      totalRows: rows.length,
      importadas,
      errores: capErrores(errores, 200),
      creadas,
    });

    // ── Persistir en insuranceImportLog (summary ahora recibe el reporte entero) ──
    // ImportReport es JSON-seguro (no Dates ni Maps), pero Prisma.Json tiene un
    // input whitelist estricto que choca con TS. Serializamos vía JSON para
    // satisfacer al compilador — el contenido queda idéntico en BD.
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
        // Mantenemos `errors` con el subset reducido para la tabla de UI;
        // el JSON completo está en `summary` (el reporte entero).
        errors: erroresSerialized,
        summary: reportSerialized,
        createdById: auth.user!.id,
      },
    });

    // ── AUTO-FIX tenant.moneda tras el import (NUEVO 2026-08-03) ──────
    // Cierra el loop del path `--allow-auto` del seed script: si el broker
    // aceptó el default MXN y este es su primer batch import 100% en otra
    // moneda, ajustamos tenant.moneda automáticamente (saltando el cooldown
    // de 24h del endpoint /api/tenant/moneda normal). Audit log con source
    // 'auto-import' que distingue del cambio manual.
    let autoFixMoneda: Awaited<ReturnType<typeof maybeAutoFixTenantCurrencyAfterImport>> | null = null;
    if (importadas > 0) {
      try {
        // Recolectamos las monedas reales de las pólizas recién insertadas
        // (no de las filas crudas: el CSV no tiene columna moneda hoy, así
        // que las polizas heredan el default del schema, 'EUR').
        const polizasRecienImportadas = await prisma.poliza.findMany({
          where: { tenantId, createdAt: { gte: batchStartTime } },
          select: { moneda: true },
        });
        autoFixMoneda = await maybeAutoFixTenantCurrencyAfterImport(
          tenantId,
          polizasRecienImportadas.map(p => ({ moneda: p.moneda })),
          {
            dryRun: false,
            minBatchSize: 1,
            source: 'system:auto-import-bulk-csv',
          },
        );
        if (autoFixMoneda.changed) {
          console.warn(
            `[importar] Auto-fix aplicado: ${autoFixMoneda.previousMoneda} → ${autoFixMoneda.appliedMoneda} ` +
              `(${autoFixMoneda.distribution[autoFixMoneda.appliedMoneda!]} pólizas importadas).`,
          );
        }
      } catch (autoFixErr: any) {
        // El auto-fix es defensivo: nunca rompe la import si falla.
        console.error('[importar] Auto-fix de moneda falló (no es fatal):', autoFixErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      report: { ...report, logId: log.id, autoMapped },
      // Devolvemos también el resultado del auto-fix para que la UI pueda
      // mostrar un toast tipo "Tu moneda de reporte se actualizó a EUR".
      autoFixMoneda: autoFixMoneda ?? undefined,
    });
  } catch (error) {
    console.error('Error al importar pólizas:', error);
    return NextResponse.json({ error: 'Error al importar pólizas: ' + (error as Error).message }, { status: 500 });
  }
}

// ─── PUT - Analizar archivo (sin guardar) ─────────────────────────────────
//
// Devuelve todo lo necesario para que la UI arme el paso 2 del wizard:
//   - delimiter: ',' | ';' | '\t' detectado y su label legible
//   - columns: lista cruda de headers del CSV
//   - mapeoSugerido: best-effort canónico -> header (sólo confianza >= 0.6)
//   - matches: detalle por canónico (incluso los NO matcheados, confidence 0)
//   - preview: 10 primeras filas para mostrar al usuario
//
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
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Por ahora solo CSV. Convierte tu Excel a CSV.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = buffer.toString('utf-8');
    const parsed = parseCSVSmart(text);
    if (!parsed.headers.length || parsed.rows.length === 0) {
      return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 });
    }

    const sugerencia = suggestPolizasMapping(parsed.headers);
    const REQUERIDOS = ['numeroPoliza', 'clienteNombre', 'aseguradoraNombre', 'fechaInicio', 'fechaVencimiento'];

    return NextResponse.json({
      fileName: file.name,
      delimiter: parsed.delimiter,
      delimiterLabel: parsed.delimiter === ',' ? 'coma' : parsed.delimiter === ';' ? 'punto y coma' : 'tabulador',
      totalRows: parsed.rows.length,
      columns: parsed.headers,
      preview: parsed.rows.slice(0, 10),
      mapeoSugerido: sugerencia.mapping,
      matches: sugerencia.matches,
      autoMapAvailable: REQUERIDOS.every(c => sugerencia.mapping[c]),
    });
  } catch (error) {
    console.error('Error al analizar el archivo:', error);
    return NextResponse.json({ error: 'Error al analizar el archivo: ' + (error as Error).message }, { status: 500 });
  }
}
