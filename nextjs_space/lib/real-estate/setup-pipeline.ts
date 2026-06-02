/**
 * Volkern Real Estate Module — Pipeline Setup
 *
 * Define las etapas del pipeline inmobiliario y las registra
 * al activar el módulo REAL_ESTATE para un tenant.
 */

import { prisma } from '@/lib/db';

// ─── Pipeline Stages ──────────────────────────────────────────────────────────

export const REAL_ESTATE_STAGES = [
  {
    nombre: 'Contacto inicial',
    orden: 0,
    probabilidad: 10,
    color: '#6B7280',
    categoria: 'real_estate',
    descripcion: 'El cliente ha mostrado interés inicial o ha llenado un formulario',
  },
  {
    nombre: 'Visita programada',
    orden: 1,
    probabilidad: 25,
    color: '#3B82F6',
    categoria: 'real_estate',
    descripcion: 'Se ha agendado una visita a la propiedad',
  },
  {
    nombre: 'Oferta recibida',
    orden: 2,
    probabilidad: 50,
    color: '#EAB308',
    categoria: 'real_estate',
    descripcion: 'El cliente ha presentado una oferta formal',
  },
  {
    nombre: 'Negociación',
    orden: 3,
    probabilidad: 70,
    color: '#F97316',
    categoria: 'real_estate',
    descripcion: 'En proceso de negociación de términos y condiciones',
  },
  {
    nombre: 'Escrituración',
    orden: 4,
    probabilidad: 90,
    color: '#A855F7',
    categoria: 'real_estate',
    descripcion: 'Trámites legales y firma de escrituras',
  },
  {
    nombre: 'Cerrado',
    orden: 5,
    probabilidad: 100,
    color: '#22C55E',
    categoria: 'real_estate',
    esEtapaFinal: true,
    tipoEtapaFinal: 'won',
    descripcion: 'Operación cerrada exitosamente',
  },
];

// ─── Setup Function ───────────────────────────────────────────────────────────

/**
 * Registra las etapas del pipeline inmobiliario para un tenant.
 * Es idempotente: si ya existen, no las duplica.
 */
export async function setupRealEstatePipeline(tenantId: string): Promise<number> {
  let created = 0;

  for (const stage of REAL_ESTATE_STAGES) {
    const existing = await prisma.pipelineStage.findFirst({
      where: {
        tenantId,
        nombre: stage.nombre,
        categoria: 'real_estate',
      },
    });

    if (!existing) {
      await prisma.pipelineStage.create({
        data: {
          tenantId,
          nombre: stage.nombre,
          descripcion: stage.descripcion,
          orden: stage.orden,
          probabilidad: stage.probabilidad,
          color: stage.color,
          categoria: stage.categoria,
          esEtapaFinal: stage.esEtapaFinal || false,
          tipoEtapaFinal: stage.tipoEtapaFinal || null,
          activo: true,
        },
      });
      created++;
    }
  }

  return created;
}

/**
 * Obtiene las etapas del pipeline inmobiliario para un tenant
 */
export async function getRealEstateStages(tenantId: string) {
  return prisma.pipelineStage.findMany({
    where: {
      tenantId,
      activo: true,
      categoria: 'real_estate',
    },
    orderBy: { orden: 'asc' },
  });
}
