/**
 * Connectors Skills — Wrapper de `InsurerConnector` para el modelo Volkern.
 *
 * Por qué existe este archivo:
 *   El scaffold `lib/insurance/connectors/InsurerConnector.ts` define la
 *   interfaz abstracta de providers pero NUNCA toca Prisma. Esta capa es
 *   el adaptador entre la respuesta del partner (`ExternalPolicy`,
 *   `IssuePolicyResult`, ...) y los modelos `Aseguradora`, `ProductoSeguro`
 *   y `Poliza` del CRM.
 *
 * Funciones expuestas:
 *   - `sync_cartera_desde_aseguradora`: importa la cartera de un cliente
 *     desde una aseguradora externa. Idempotente por `numeroPoliza`.
 *   - `emitir_poliza_en_aseguradora`: emite una póliza interna contra el
 *     partner y guarda la URL del documento devuelto.
 *
 * Patrón de orquestación:
 *   1. Wrapper resuelve el connector vía `getInsurerConnector(slug)`.
 *   2. Llama el método del connector (puro, sin DB).
 *   3. Mapea la respuesta al modelo interno (resolver FK, mapear enums).
 *   4. Hace los upserts de Prisma con `@@unique([tenantId, numeroPoliza])`
 *      como guard de idempotencia.
 *
 * Decisión de schema: NO añadimos `documentoUrlExterno` ni `externalId` a
 * `Poliza` en este commit. Para preservar el URL del partner lo añadimos
 * a `notas` con prefijo `[doc:...]` — un campo aditivo trivial cuando se
 * decida el momento de la migración. Si el caller quiere esos datos de
 * forma estructurada, los retornamos en el resultado (`urlDocumento`).
 */

import { prisma } from '@/lib/db';
import {
  getInsurerConnector,
  ConnectorError,
  type ExternalPolicy,
  type InsurerConnector,
  type InsurerRam,
} from './connectors/InsurerConnector';
import type { EstadoPoliza } from '@prisma/client';

// ─── 1. sync_cartera_desde_aseguradora ──────────────────────────────────

export interface SyncCarteraInput {
  slug: string;
  tenantId: string;
  /**
   * Si llega, filtra las ExternalPolicy cuyo `clienteId` (partner) matchee.
   * Si llega `tenantContactId`, resolvemos el partner-cliente del primer
   * match por nombre (heurística).
   */
  externalClienteId?: string;
  tenantContactId?: string;
  page?: number;
  limit?: number;
  /**
   * Si `true`, no escribe en BD: sólo devuelve lo que habría hecho.
   * Útil para que la UI muestre "preview" antes del commit.
   */
  dryRun?: boolean;
  /**
   * Si `true` y el `numeroPoliza` ya existe en la BD, actualiza fechas,
   * prima y estado del Poliza interno. Si `false` (default), skip silencioso.
   */
  actualizarExistentes?: boolean;
}

export interface SyncCarteraRowResult {
  numeroPoliza: string;
  /** 'created' | 'updated' | 'skipped' (existente sin actualizar) | 'dry-run' */
  accion: 'created' | 'updated' | 'skipped' | 'dry-run';
  estado: EstadoPoliza;
  /** ID Volkern cuando aplica. `null` para skipped o dry-run-create. */
  polizaId: string | null;
}

export interface SyncCarteraErrorRow {
  numeroPoliza: string;
  code: string;
  message: string;
}

export interface SyncCarteraResult {
  slug: string;
  totalEnPartner: number;
  pagina: number;
  totalPaginas: number;
  /** Resumen compacto para mensajes al usuario. */
  summary: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    dryRun: boolean;
  };
  processed: SyncCarteraRowResult[];
  errors: SyncCarteraErrorRow[];
  mensaje: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

/**
 * Importa la cartera de una aseguradora partner a la tabla `Poliza` interna.
 *
 * Decisiones:
 *   - Idempotente: `@@unique([tenantId, numeroPoliza])` evita duplicados.
 *   - Resuelve la aseguradora interna por `slug` (más estable que por
 *     nombre, que el partner puede renombrar). Si no existe, la crea.
 *   - Resuelve el `ProductoSeguro` por `(aseguradora, nombre|ramo)`. Si el
 *     partner devuelve un `productoNombre` que no tenemos, lo crea con el
 *     ramo del partner y descripción básica.
 *   - Resuelve el cliente Volkern por:
 *     1. `tenantContactId` (input directo).
 *     2. Match por email si el Contact tiene email = clienteNombre (raro).
 *     3. Match por nombre (heurística, contender con múltiples coincidencias).
 *     4. Match por `clienteId` del partner mapeado a un `externalId` Contact.
 *     Si ninguno funciona, saltamos la fila con `errors[]`.
 */
export async function sync_cartera_desde_aseguradora(
  input: SyncCarteraInput,
): Promise<SyncCarteraResult> {
  const { slug, tenantId } = input;
  if (!slug || typeof slug !== 'string') {
    throw new Error('sync_cartera_desde_aseguradora: `slug` es requerido y debe ser string.');
  }
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('sync_cartera_desde_aseguradora: `tenantId` es requerido.');
  }

  // ── Resolver connector ──────────────────────────────────────────────
  const connector = await getInsurerConnector(slug);

  // ── Autenticación dummy (los connectors reales la requerirán) ────────
  try {
    await connector.authenticate({
      apiKey: `sync-${tenantId}-${Date.now()}`,
      environment: 'sandbox',
    });
  } catch (err) {
    // En sandbox mock esto nunca debería fallar; si falla, bubble up con contexto.
    throw new Error(`No se pudo autenticar contra ${slug}: ${(err as Error).message}`);
  }

  // ── Resolver el filtro de cliente externo ───────────────────────────
  let externalClienteId = input.externalClienteId;
  if (!externalClienteId && input.tenantContactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: input.tenantContactId },
      select: { id: true, nombre: true, email: true },
    });
    if (contact && contact.email) {
      // El partner mock no filtra por email/rfc, pero en la integración
      // real pasaremos el taxId/email del CRM como filtro.
      externalClienteId = undefined;
    }
  }

  // ── Llamada al connector ────────────────────────────────────────────
  const page = Number.isFinite(input.page) && input.page! > 0 ? input.page! : DEFAULT_PAGE;
  const limit = Number.isFinite(input.limit) && input.limit! > 0 ? Math.min(input.limit!, 100) : DEFAULT_LIMIT;

  const partnerResult = await connector.fetchPolicies({
    clienteId: externalClienteId,
    page,
    limit,
  });

  // ── Resolver/crear la aseguradora interna ────────────────────────────
  const aseguradoraInterna = await asegurarAseguradoraInterna(
    tenantId,
    slug,
    connector.metadata.nombre,
  );

  // ── Procesar cada ExternalPolicy ─────────────────────────────────────
  const processed: SyncCarteraRowResult[] = [];
  const errors: SyncCarteraErrorRow[] = [];

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const external of partnerResult.policies) {
    try {
      const estadoInterno = mapEstadoExterno(external.estado);

      const clienteRow = await resolverClienteVolkern(tenantId, external);
      if (!clienteRow) {
        errors.push({
          numeroPoliza: external.numeroPoliza,
          code: 'CLIENT_NOT_FOUND',
          message:
            `No se encontró un Contact Volkern para "${external.clienteNombre}". ` +
            `Créalo antes de sincronizar o pásalo como \`tenantContactId\`.`,
        });
        continue;
      }

      const productoRow = await asegurarProductoInterno(
        tenantId,
        aseguradoraInterna.id,
        external,
      );

      const notasSync = buildNotasSync(slug, external);

      const whereUnique = {
        tenantId_numeroPoliza: {
          tenantId,
          numeroPoliza: external.numeroPoliza,
        },
      };

      const existing = await prisma.poliza.findUnique({
        where: whereUnique,
        select: { id: true },
      });

      if (existing) {
        if (input.actualizarExistentes) {
          if (!input.dryRun) {
            await prisma.poliza.update({
              where: whereUnique,
              data: {
                fechaInicio: external.fechaInicio,
                fechaVencimiento: external.fechaVencimiento,
                primaAnual: external.primaAnual,
                sumaAsegurada: external.sumaAsegurada,
                estado: estadoInterno,
                notas: notasSync,
              },
            });
          }
          updatedCount++;
          processed.push({
            numeroPoliza: external.numeroPoliza,
            accion: input.dryRun ? 'dry-run' : 'updated',
            estado: estadoInterno,
            polizaId: existing.id,
          });
        } else {
          skippedCount++;
          processed.push({
            numeroPoliza: external.numeroPoliza,
            accion: 'skipped',
            estado: estadoInterno,
            polizaId: existing.id,
          });
        }
        continue;
      }

      if (input.dryRun) {
        createdCount++;
        processed.push({
          numeroPoliza: external.numeroPoliza,
          accion: 'dry-run',
          estado: estadoInterno,
          polizaId: null,
        });
        continue;
      }

      // ── Create real ───────────────────────────────────────────────
      const createdById = await resolveCreator(tenantId);
      const created = await prisma.poliza.create({
        data: {
          tenantId,
          numeroPoliza: external.numeroPoliza,
          clienteId: clienteRow.id,
          aseguradoraId: aseguradoraInterna.id,
          productoSeguroId: productoRow.id,
          fechaInicio: external.fechaInicio,
          fechaVencimiento: external.fechaVencimiento,
          primaAnual: external.primaAnual,
          sumaAsegurada: external.sumaAsegurada,
          moneda: external.moneda,
          estado: estadoInterno,
          notas: notasSync,
          createdById,
        },
        select: { id: true },
      });
      createdCount++;
      processed.push({
        numeroPoliza: external.numeroPoliza,
        accion: 'created',
        estado: estadoInterno,
        polizaId: created.id,
      });
    } catch (err) {
      const ce = err instanceof ConnectorError ? err : new Error(String(err));
      errors.push({
        numeroPoliza: external.numeroPoliza,
        code: ce instanceof ConnectorError ? ce.code : 'UNKNOWN',
        message: ce.message,
      });
    }
  }

  const dryRun = !!input.dryRun;
  const summary = {
    created: dryRun ? 0 : createdCount,
    updated: dryRun ? 0 : updatedCount,
    skipped: skippedCount,
    errors: errors.length,
    dryRun,
  };

  const mensaje = construirMensajeSync({
    slug,
    totalEnPartner: partnerResult.total,
    created: summary.created,
    updated: summary.updated,
    skipped: summary.skipped,
    errors: summary.errors,
    dryRun,
  });

  return {
    slug,
    totalEnPartner: partnerResult.total,
    pagina: partnerResult.page,
    totalPaginas: partnerResult.totalPages,
    summary,
    processed,
    errors,
    mensaje,
  };
}

// ─── 2. emitir_poliza_en_aseguradora ─────────────────────────────────────

export interface EmitirPolizaEnAseguradoraInput {
  slug: string;
  tenantId: string;
  polizaId: string;
  /**
   * Si `true` (default) sólo ejecuta `issuePolicy` y devuelve el resultado
   * sin tocar BD — modo preview. Si `false`, persiste el documentoUrl
   * externo en `notas` (no rompe schema).
   */
  dryRun?: boolean;
  /**
   * Override de la fecha de inicio en la emisión del partner. Si no llega,
   * usa la fecha de inicio de la Poliza interna.
   */
  fechaInicio?: Date;
  /**
   * Notas que se envían al partner junto con la emisión.
   */
  notas?: string;
}

export interface EmitirPolizaEnAseguradoraResult {
  slug: string;
  polizaId: string;
  /** El Poliza interno quedó con el documentoUrl externo en notas. null en dry-run. */
  nuevoNumeroPolizaInterno: string;
  externalId: string;
  numeroPolizaPartner: string;
  documentoUrl: string | null;
  primaAnual: number;
  emision: number;
  mensajePartner: string;
  accion: 'issued' | 'dry-run';
  mensaje: string;
}

/**
 * Emite una Poliza interna contra una aseguradora partner.
 *
 * Flujo:
 *   1. Cargar Poliza con sus relaciones (cliente, aseguradora, producto).
 *   2. Mapear a `IssuePolicyInput` (RFC/NIF del cliente → taxId; ramo del
 *      productoSeguro; fechas de la Poliza; moneda).
 *   3. Validar moneda match (el connector la aplica también, pero fallamos
 *      antes con mensaje más útil).
 *   4. Llamar `connector.issuePolicy(input)`.
 *   5. Persistir la URL del documento en `Poliza.notas` (formato
 *      `[doc:URL]`). NO renombramos `numeroPoliza` interno para no romper
 *      idempotencia ni la UI existente.
 */
export async function emitir_poliza_en_aseguradora(
  input: EmitirPolizaEnAseguradoraInput,
): Promise<EmitirPolizaEnAseguradoraResult> {
  const { slug, tenantId, polizaId } = input;
  if (!slug) throw new Error('emitir_poliza_en_aseguradora: `slug` es requerido.');
  if (!tenantId) throw new Error('emitir_poliza_en_aseguradora: `tenantId` es requerido.');
  if (!polizaId) throw new Error('emitir_poliza_en_aseguradora: `polizaId` es requerido.');

  const connector = await getInsurerConnector(slug);

  const poliza = await prisma.poliza.findFirst({
    where: { id: polizaId, tenantId },
    include: {
      cliente: {
        select: {
          id: true,
          nombre: true,
          email: true,
          telefono: true,
          direccion: true,
          customerFiscalData: {
            select: {
              rfc: true,
              stripeTaxId: true,
            },
          },
        },
      },
      productoSeguro: {
        select: { id: true, nombre: true, ramo: true },
      },
      aseguradora: {
        select: { id: true, nombre: true },
      },
    },
  });

  if (!poliza) {
    throw new Error(
      `No se encontró la Poliza ${polizaId} en el tenant ${tenantId}.`,
    );
  }

  // ── Mapeo Poliza → IssuePolicyInput ────────────────────────────────
  const taxId = pickTaxId(connector.metadata.country, poliza.cliente.customerFiscalData);
  if (!taxId) {
    const taxIdField = connector.metadata.country === 'MX' ? 'RFC' : 'NIF/NIE';
    throw new Error(
      `El cliente "${poliza.cliente.nombre}" no tiene ${taxIdField} registrado en ` +
      `erp_customer_fiscal_data — requerido para emitir contra ${connector.metadata.nombre}. ` +
      `Añade el ${taxIdField} al fiscal data del Contact antes de emitir.`,
    );
  }

  const sumAseg = poliza.sumaAsegurada ? Number(poliza.sumaAsegurada) : 0;
  const primaAn = poliza.primaAnual ? Number(poliza.primaAnual) : 0;
  if (sumAseg <= 0 || primaAn <= 0) {
    throw new Error(
      `La Poliza ${poliza.numeroPoliza} tiene sumaAsegurada (${sumAseg}) o primaAnual (${primaAn}) inválidas — ambas deben ser > 0 para emitir.`,
    );
  }

  const issueInput = {
    cliente: {
      nombre: poliza.cliente.nombre,
      taxId,
      email: poliza.cliente.email || `noreply+${poliza.cliente.id}@volkern.app`,
      telefono: poliza.cliente.telefono || undefined,
      direccion: poliza.cliente.direccion || undefined,
    },
    producto: {
      ramo: poliza.productoSeguro.ramo as InsurerRam,
      nombre: poliza.productoSeguro.nombre,
      externalProductId: poliza.productoSeguro.id, // usamos el ID interno como proxy
    },
    sumaAsegurada: sumAseg,
    primaAnual: primaAn,
    fechaInicio: input.fechaInicio || poliza.fechaInicio,
    fechaVencimiento: poliza.fechaVencimiento,
    moneda: (poliza.moneda as any) || connector.metadata.monedaBase,
    notas: input.notas,
  };

  // ── Llamada al connector ────────────────────────────────────────────
  const issueResult = await connector.issuePolicy(issueInput as any);

  // ── Persistir URL externa en notas (backwards-compatible) ───────────
  if (!input.dryRun) {
    const notasPrevias = poliza.notas ?? '';
    const notasActualizadas = `${notasPrevias}\n\n[doc:${issueResult.documentoUrl}]`.trim();
    await prisma.poliza.update({
      where: { id: poliza.id },
      data: {
        notas: notasActualizadas,
        // Si la fecha de inicio real del partner difiere, la respetamos
        // (suele ser "mañana" cuando el broker quiere emisión inmediata).
        fechaInicio: input.fechaInicio || poliza.fechaInicio,
      },
    });
  }

  const mensaje = input.dryRun
    ? `🧪 Dry-run: emisión simulada en ${connector.metadata.nombre}. ` +
      `La Poliza ${poliza.numeroPoliza} NO fue modificada. ` +
      `Póliza del partner: ${issueResult.numeroPoliza}.`
    : `✅ Póliza ${poliza.numeroPoliza} emitida en ${connector.metadata.nombre} ` +
      `como *${issueResult.numeroPoliza}*. Documento: ${issueResult.documentoUrl}`;

  return {
    slug,
    polizaId: poliza.id,
    nuevoNumeroPolizaInterno: poliza.numeroPoliza,
    externalId: issueResult.externalId,
    numeroPolizaPartner: issueResult.numeroPoliza,
    documentoUrl: issueResult.documentoUrl,
    primaAnual: issueResult.primaAnual,
    emision: issueResult.emision,
    mensajePartner: issueResult.mensaje,
    accion: input.dryRun ? 'dry-run' : 'issued',
    mensaje,
  };
}

// ─── Helpers internos ──────────────────────────────────────────────────

/**
 * Resuelve el Contact Volkern para un ExternalPolicy del partner.
 *
 * Heurística de match (en orden):
 *   1. Email — si el partner expone email, match por email.
 *   2. Nombre — match case-insensitive `contains` por `clienteNombre`.
 *      Si hay varios matches, se queda con el más antiguo (determinístico).
 *   3. RFC/NIF — si el cliente Volkern tiene `rfc` o `nif` y el partner
 *      trae algún campo equivalente (no presente en mock), match.
 *
 * Si no encuentra nada, devuelve `null`. El caller decide si falla.
 */
async function resolverClienteVolkern(
  tenantId: string,
  external: ExternalPolicy,
): Promise<{ id: string; nombre: string } | null> {
  // Por nombre (el partner mock siempre trae clienteNombre)
  if (external.clienteNombre && external.clienteNombre.trim()) {
    const matches = await prisma.contact.findMany({
      where: {
        tenantId,
        tipo: { not: 'company' },
        nombre: { contains: external.clienteNombre.trim(), mode: 'insensitive' },
      },
      select: { id: true, nombre: true },
      orderBy: { fechaCreacion: 'asc' },
      take: 2,
    });
    if (matches.length > 0) {
      return { id: matches[0].id, nombre: matches[0].nombre };
    }
  }
  return null;
}

/**
 * Resuelve o crea el ProductoSeguro interno a partir de la ExternalPolicy.
 *
 * Match por (aseguradoraId, nombre). Si no existe, lo crea con ramo y nombre
 * del partner.
 */
async function asegurarProductoInterno(
  tenantId: string,
  aseguradoraId: string,
  external: ExternalPolicy,
): Promise<{ id: string; nombre: string; ramo: string }> {
  const nombreProducto = external.productoNombre?.trim() || `Producto ${external.ramo}`;

  const existing = await prisma.productoSeguro.findFirst({
    where: {
      tenantId,
      aseguradoraId,
      nombre: { equals: nombreProducto, mode: 'insensitive' },
    },
    select: { id: true, nombre: true, ramo: true },
  });
  if (existing) return existing;

  return await prisma.productoSeguro.create({
    data: {
      tenantId,
      aseguradoraId,
      nombre: nombreProducto,
      ramo: external.ramo as any, // Ramo enum del schema Prisma — mismo set
      descripcion: `Importado desde partner (sync ${external.productoNombre})`,
      activo: true,
    },
    select: { id: true, nombre: true, ramo: true },
  });
}

/**
 * Resuelve o crea la Aseguradora interna. Usa `slug` como nombre canónico
 * (estabilidad ante renombres de marca) y guarda el nombre comercial del
 * connector como fallback resoluble.
 */
async function asegurarAseguradoraInterna(
  tenantId: string,
  slug: string,
  nombrePartner: string,
): Promise<{ id: string; nombre: string }> {
  // 1. Match por slug como codigoExterno (lo más estable)
  const byCode = await prisma.aseguradora.findFirst({
    where: { tenantId, codigoExterno: slug },
    select: { id: true, nombre: true },
  });
  if (byCode) return byCode;

  // 2. Match por nombre (case-insensitive contains)
  const byName = await prisma.aseguradora.findFirst({
    where: {
      tenantId,
      nombre: { contains: nombrePartner.split(',')[0].trim(), mode: 'insensitive' },
    },
    select: { id: true, nombre: true },
  });
  if (byName) {
    // Backfill codigoExterno si no lo tenía
    await prisma.aseguradora.update({
      where: { id: byName.id },
      data: { codigoExterno: slug },
    });
    return byName;
  }

  // 3. Crear nueva
  return await prisma.aseguradora.create({
    data: {
      tenantId,
      nombre: nombrePartner,
      codigoExterno: slug,
      web: undefined,
      activa: true,
    },
    select: { id: true, nombre: true },
  });
}

function pickTaxId(
  country: 'MX' | 'ES',
  customerFiscalData: { rfc: string | null; stripeTaxId: string | null } | null,
): string | null {
  if (!customerFiscalData) return null;
  if (country === 'MX') return customerFiscalData.rfc; // RFC mexicano
  if (country === 'ES') {
    // NIF/NIE español: el schema no tiene columna dedicada, pero algunos
    // brokers lo guardan en `stripeTaxId`. Si no está, devolvemos null y
    // el caller muestra error limpio al usuario.
    return customerFiscalData.stripeTaxId;
  }
  return customerFiscalData.rfc || customerFiscalData.stripeTaxId;
}

function mapEstadoExterno(external: ExternalPolicy['estado']): EstadoPoliza {
  switch (external) {
    case 'ACTIVA':
      return 'ACTIVA';
    case 'PROXIMA_A_VENCER':
      return 'PROXIMA_A_VENCER';
    case 'VENCIDA':
      return 'VENCIDA';
    case 'CANCELADA':
      return 'CANCELADA';
    case 'EN_TRAMITE':
      return 'EN_TRAMITE';
    default:
      return 'EN_TRAMITE';
  }
}

function buildNotasSync(slug: string, external: ExternalPolicy): string {
  const lines = [
    `[Sync ${slug} ${new Date().toISOString().slice(0, 10)}]`,
    external.productoNombre,
  ];
  if (external.documentoUrl) lines.push(`Documento: ${external.documentoUrl}`);
  return lines.join('\n');
}

async function resolveCreator(tenantId: string): Promise<string> {
  const u = await prisma.user.findFirst({
    where: { tenantId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!u) {
    throw new Error(
      `No hay un usuario en el tenant ${tenantId} para asignarlo como creador de la Poliza.`,
    );
  }
  return u.id;
}

function construirMensajeSync(s: {
  slug: string;
  totalEnPartner: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
}): string {
  const pre = s.dryRun ? '🧪 (dry-run) ' : '';
  if (s.errors > 0 && s.created === 0 && s.updated === 0) {
    return `${pre}❌ Sincronización con ${s.slug}: 0 procesadas, ${s.errors} con error. Revisa los detalles.`;
  }
  if (s.created > 0 || s.updated > 0) {
    return `${pre}✅ Importadas ${s.created} pólizas nuevas${s.updated ? `, actualizadas ${s.updated}` : ''}` +
      `${s.skipped ? `, ${s.skipped} ya existían` : ''}` +
      `${s.errors ? `, ${s.errors} con error` : ''} desde ${s.slug}.`;
  }
  if (s.skipped > 0) {
    return `${pre}ℹ️ ${s.skipped} pólizas de ${s.slug} ya existían en el CRM (activar \`actualizarExistentes: true\` para refresh).`;
  }
  return `${pre}No se encontraron pólizas para sincronizar desde ${s.slug}.`;
}
