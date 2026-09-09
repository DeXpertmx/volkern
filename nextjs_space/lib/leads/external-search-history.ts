/**
 * Historial de búsquedas de leads externos.
 *
 * Antes, el GET /api/leads/external/search (fuente hunter) persistía el
 * historial inline dentro del handler de lectura. La escritura vive ahora en
 * este helper para que el handler solo orqueste: buscar → registrar → devolver.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export interface RecordExternalSearchInput {
  tenantId: string;
  userId: string;
  criterios: Prisma.InputJsonValue;
  fuente: string;
  totalResultados: number;
  resultados: Prisma.InputJsonValue;
}

export async function recordExternalSearch(input: RecordExternalSearchInput): Promise<{ id: string }> {
  const searchRecord = await prisma.externalLeadSearch.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      criterios: input.criterios,
      fuente: input.fuente,
      totalResultados: input.totalResultados,
      resultados: input.resultados,
    },
  });
  return { id: searchRecord.id };
}