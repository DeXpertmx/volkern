/**
 * Marca "primer mensaje visto" en el progreso de onboarding de un tenant.
 *
 * Extraído del GET /api/onboarding/check-first-message: antes, el endpoint de
 * consulta escribía en BD como efecto secundario (upsert) cada vez que se
 * detectaba el primer mensaje. Ahora la escritura vive en este helper
 * idempotente y se invoca desde un POST explícito, dejando el GET como
 * lectura pura.
 *
 * Idempotente: si el progreso ya tiene `primerMensaje: true`, el upsert no
 * cambia nada observable (solo refresca la fecha).
 */

import { prisma } from '@/lib/db';

export async function markFirstMessageSeen(tenantId: string): Promise<void> {
  await prisma.onboardingProgress.upsert({
    where: { tenantId },
    update: {
      primerMensaje: true,
      fechaPrimerMensaje: new Date(),
    },
    create: {
      tenantId,
      primerMensaje: true,
      fechaPrimerMensaje: new Date(),
    },
  });
}