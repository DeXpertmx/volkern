/**
 * Volkern Insurance Module — Pipeline Setup
 *
 * Define dos pipelines independientes:
 *   1. Pipeline de Nuevas Pólizas (venta nueva)
 *   2. Pipeline de Renovaciones
 *
 * Siguiendo el patrón de lib/real-estate/setup-pipeline.ts
 */

import { prisma } from '@/lib/db';

// ─── Pipeline 1: Nuevas Pólizas ───────────────────────────────────────────────

export const INSURANCE_NEW_POLICY_STAGES = [
  {
    nombre: 'Lead',
    orden: 0,
    probabilidad: 10,
    color: '#6B7280',
    categoria: 'insurance_new_policy',
    descripcion: 'Prospecto nuevo u oportunidad detectada por IA',
  },
  {
    nombre: 'Necesidades detectadas',
    orden: 1,
    probabilidad: 25,
    color: '#3B82F6',
    categoria: 'insurance_new_policy',
    descripcion: 'Análisis de necesidades del cliente',
  },
  {
    nombre: 'Cotización',
    orden: 2,
    probabilidad: 45,
    color: '#EAB308',
    categoria: 'insurance_new_policy',
    descripcion: 'Cotización enviada al cliente',
  },
  {
    nombre: 'Presentación',
    orden: 3,
    probabilidad: 65,
    color: '#F97316',
    categoria: 'insurance_new_policy',
    descripcion: 'Presentación de la propuesta',
  },
  {
    nombre: 'Negociación',
    orden: 4,
    probabilidad: 80,
    color: '#A855F7',
    categoria: 'insurance_new_policy',
    descripcion: 'Ajustes y negociación final',
  },
  {
    nombre: 'Emitida',
    orden: 5,
    probabilidad: 100,
    color: '#22C55E',
    categoria: 'insurance_new_policy',
    esEtapaFinal: true,
    tipoEtapaFinal: 'won',
    descripcion: 'Póliza emitida exitosamente',
  },
];

// ─── Pipeline 2: Renovaciones ─────────────────────────────────────────────────

export const INSURANCE_RENEWAL_STAGES = [
  {
    nombre: 'Próxima renovación',
    orden: 0,
    probabilidad: 10,
    color: '#6B7280',
    categoria: 'insurance_renewal',
    descripcion: 'Detectada por el motor de renovaciones',
  },
  {
    nombre: 'Contacto inicial',
    orden: 1,
    probabilidad: 30,
    color: '#3B82F6',
    categoria: 'insurance_renewal',
    descripcion: 'Primer contacto con el cliente',
  },
  {
    nombre: 'Revisión',
    orden: 2,
    probabilidad: 55,
    color: '#EAB308',
    categoria: 'insurance_renewal',
    descripcion: 'Revisión de condiciones actuales vs nuevas',
  },
  {
    nombre: 'Oferta enviada',
    orden: 3,
    probabilidad: 75,
    color: '#F97316',
    categoria: 'insurance_renewal',
    descripcion: 'Nueva oferta enviada al cliente',
  },
  {
    nombre: 'Renovada',
    orden: 4,
    probabilidad: 100,
    color: '#22C55E',
    categoria: 'insurance_renewal',
    esEtapaFinal: true,
    tipoEtapaFinal: 'won',
    descripcion: 'Renovación exitosa',
  },
  {
    nombre: 'Perdida',
    orden: 5,
    probabilidad: 0,
    color: '#EF4444',
    categoria: 'insurance_renewal',
    esEtapaFinal: true,
    tipoEtapaFinal: 'lost',
    descripcion: 'Cliente no renueva (con motivo registrado)',
  },
];

// ─── Setup Function ───────────────────────────────────────────────────────────

/**
 * Registra las etapas de ambos pipelines de seguros para un tenant.
 * Es idempotente: si ya existen, no las duplica.
 */
export async function setupInsurancePipelines(tenantId: string): Promise<{
  newPolicyCreated: number;
  renewalCreated: number;
}> {
  let newPolicyCreated = 0;
  let renewalCreated = 0;

  // Pipeline 1: Nuevas Pólizas
  for (const stage of INSURANCE_NEW_POLICY_STAGES) {
    const existing = await prisma.pipelineStage.findFirst({
      where: {
        tenantId,
        nombre: stage.nombre,
        categoria: stage.categoria,
      },
    });

    if (!existing) {
      await prisma.pipelineStage.create({
        data: {
          tenantId,
          ...stage,
        },
      });
      newPolicyCreated++;
    }
  }

  // Pipeline 2: Renovaciones
  for (const stage of INSURANCE_RENEWAL_STAGES) {
    const existing = await prisma.pipelineStage.findFirst({
      where: {
        tenantId,
        nombre: stage.nombre,
        categoria: stage.categoria,
      },
    });

    if (!existing) {
      await prisma.pipelineStage.create({
        data: {
          tenantId,
          ...stage,
        },
      });
      renewalCreated++;
    }
  }

  return { newPolicyCreated, renewalCreated };
}

/**
 * Obtiene las etapas del pipeline de nuevas pólizas para un tenant
 */
export async function getInsuranceNewPolicyStages(tenantId: string) {
  return prisma.pipelineStage.findMany({
    where: {
      tenantId,
      activo: true,
      categoria: 'insurance_new_policy',
    },
    orderBy: { orden: 'asc' },
  });
}

/**
 * Obtiene las etapas del pipeline de renovaciones para un tenant
 */
export async function getInsuranceRenewalStages(tenantId: string) {
  return prisma.pipelineStage.findMany({
    where: {
      tenantId,
      activo: true,
      categoria: 'insurance_renewal',
    },
    orderBy: { orden: 'asc' },
  });
}
