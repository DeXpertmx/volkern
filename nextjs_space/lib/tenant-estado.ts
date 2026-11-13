/**
 * Estado comercial de una cuenta y su fecha de baja.
 *
 * El churn se mide sobre la cuenta (`Tenant`), y su fecha no puede salir de
 * `fechaActualizacion`: ese campo cambia con cualquier edición (plan, dominio,
 * MRR…) y movería una baja de periodo. `fechaBaja` se escribe solo al entrar en
 * un estado de baja y se limpia al reactivar.
 *
 * Regla de la primera baja: si la cuenta ya tenía `fechaBaja`, se conserva. Un
 * reintento de cobro que la vuelve a suspender no debe re-fechar la baja.
 */
export const ESTADOS_DE_BAJA = ['cancelado', 'suspendido', 'inactivo', 'archived'] as const;

export type EstadoDeBaja = (typeof ESTADOS_DE_BAJA)[number];

export function esEstadoDeBaja(estado: string | null | undefined): boolean {
  return ESTADOS_DE_BAJA.includes(String(estado ?? '').toLowerCase() as EstadoDeBaja);
}

export interface CambioDeEstado {
  estado: string;
  fechaBaja: Date | null;
}

/**
 * Datos de escritura para cambiar el estado de una cuenta.
 *
 * - Entrar en baja: sella `fechaBaja` (si no había una anterior).
 * - Volver a un estado vivo: limpia `fechaBaja`.
 */
export function datosCambioEstado(
  nuevoEstado: string,
  fechaBajaActual?: Date | null,
): CambioDeEstado {
  if (!esEstadoDeBaja(nuevoEstado)) {
    return { estado: nuevoEstado, fechaBaja: null };
  }

  return { estado: nuevoEstado, fechaBaja: fechaBajaActual ?? new Date() };
}

/** Cliente mínimo que necesita `aplicarEstadoTenant` (Prisma o proxy de tenant). */
interface ClienteConTenant {
  tenant: {
    findUnique: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
}

/**
 * Aplica un estado de cuenta respetando la primera baja. Se usa en los puntos
 * que cambian `Tenant.estado` (admin, Stripe) para que `fechaBaja` quede
 * siempre coherente con el estado.
 */
export async function aplicarEstadoTenant(
  cliente: ClienteConTenant,
  tenantId: string,
  nuevoEstado: string,
  datosExtra: Record<string, unknown> = {},
): Promise<void> {
  const actual = await cliente.tenant.findUnique({
    where: { id: tenantId },
    select: { fechaBaja: true },
  });

  await cliente.tenant.update({
    where: { id: tenantId },
    data: { ...datosExtra, ...datosCambioEstado(nuevoEstado, actual?.fechaBaja ?? null) },
  });
}
