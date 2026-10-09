/**
 * Estado real del onboarding guiado de propiedad (§31).
 *
 * El wizard no guarda su propio progreso: cada paso se deriva de la realidad
 * del tenant (propiedad, unidades, mappings, conectividad de plataforma y los
 * últimos resultados de las pruebas registrados en HospitalitySyncLog). Así el
 * wizard nunca puede mostrar "completado" algo que no lo está, y activar una
 * propiedad exige revalidar en el servidor, no solo en la UI.
 */

import { prisma } from '@/lib/db';
import { getConnectivityProvider, getTenantPartnerId } from './connectivity';
import {
  computeOnboardingSteps,
  puedeActivar,
  SYNC_TIPOS_ONBOARDING,
  type OnboardingEstado,
  type PasoOnboarding,
  type ResultadoPrueba,
} from './onboarding';

export interface UnidadOnboarding {
  id: string;
  nombre: string;
  codigo: string | null;
  tipo: string;
  capacidad: number;
  tarifaBase: number | null;
  moneda: string;
  estado: string;
  /** Planes de tarifa activos con precio. */
  planesActivos: number;
  /** Tiene mapping activo con el proveedor. */
  vinculada: boolean;
  roomCode: string | null;
  rateplanCode: string | null;
  /** El vínculo lo creó el sistema (webhook) y conviene que alguien lo revise. */
  vinculoAutomatico: boolean;
  /** Motivo con el que el sistema eligió la unidad (si fue automático). */
  vinculoMotivo: string | null;
}

export interface OnboardingSnapshot {
  propiedad: {
    id: string;
    nombre: string;
    codigo: string | null;
    ciudad: string | null;
    pais: string | null;
    estado: string;
    timezone: string;
  };
  hotelCode: string | null;
  unidades: UnidadOnboarding[];
  /** Unidades con mapping activo con el proveedor. */
  unidadesVinculadas: number;
  conectividad: { configurada: boolean; estado: string };
  pruebas: OnboardingEstado['pruebas'];
  pasos: PasoOnboarding[];
  puedeActivar: { ok: boolean; faltantes: string[] };
}

export type SnapshotResult =
  | { ok: true; snapshot: OnboardingSnapshot }
  | { ok: false; status: 404; error: string };

/**
 * Carga y deriva el estado del onboarding de una propiedad del tenant.
 * Siempre filtra por tenantId (aislamiento multi-tenant).
 */
export async function loadOnboardingSnapshot(
  tenantId: string,
  propertyId: string
): Promise<SnapshotResult> {
  const propiedad = await prisma.hospitalityProperty.findFirst({
    where: { id: propertyId, tenantId },
    select: {
      id: true,
      nombre: true,
      codigo: true,
      ciudad: true,
      pais: true,
      estado: true,
      timezone: true,
    },
  });

  if (!propiedad) {
    return { ok: false, status: 404, error: 'Propiedad no encontrada en este tenant' };
  }

  const [units, provider, partnerIdPropio, logs, mappingPropiedad] = await Promise.all([
    prisma.hospitalityUnit.findMany({
      where: { tenantId, propertyId },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        codigo: true,
        tipo: true,
        capacidad: true,
        tarifaBase: true,
        moneda: true,
        estado: true,
        mappings: {
          where: { provider: 'channel_connectivity', estado: 'activo' },
          select: {
            externalPropertyId: true,
            externalUnitCode: true,
            externalRatePlanCode: true,
            metadata: true,
          },
        },
        ratePlans: {
          where: { activo: true },
          select: { id: true, codigo: true, tarifa: true },
        },
      },
    }),
    getConnectivityProvider(),
    // El ID de socio de ESTE hotel: el paso 4 del wizard se da por hecho con el
    // suyo o, si no lo ha registrado, con el de plataforma.
    getTenantPartnerId(tenantId),
    prisma.hospitalitySyncLog.findMany({
      where: {
        tenantId,
        propertyId,
        operacion: 'onboarding',
        tipo: { in: Object.values(SYNC_TIPOS_ONBOARDING) },
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 60,
      select: { tipo: true, estado: true, errorMensaje: true },
    }),
    // El hotelCode vive en el mapping: solo existe una vez vinculada una unidad.
    prisma.connectivityMapping.findFirst({
      where: { tenantId, propertyId, provider: 'channel_connectivity', estado: 'activo' },
      orderBy: { fechaCreacion: 'asc' },
      select: { externalPropertyId: true },
    }),
  ]);

  const unidades: UnidadOnboarding[] = units.map((u: any) => {
    const mapping = u.mappings?.[0] ?? null;
    const metadata = (mapping?.metadata ?? null) as Record<string, unknown> | null;
    const planesConPrecio = (u.ratePlans || []).filter((rp: any) => rp.tarifa != null && rp.tarifa > 0);
    return {
      id: u.id,
      nombre: u.nombre,
      codigo: u.codigo,
      tipo: u.tipo,
      capacidad: u.capacidad,
      tarifaBase: u.tarifaBase,
      moneda: u.moneda,
      estado: u.estado,
      planesActivos: planesConPrecio.length,
      vinculada: !!mapping,
      roomCode: mapping?.externalUnitCode ?? null,
      rateplanCode: mapping?.externalRatePlanCode ?? null,
      vinculoAutomatico: metadata?.origen === 'vinculacion_automatica_webhook',
      vinculoMotivo: typeof metadata?.motivo === 'string' ? metadata.motivo : null,
    };
  });

  // «Configurada» para ESTE hotel = par Basic de plataforma + algún ID de
  // socio (el suyo si lo registró; si no, el de plataforma). Exigir el ID de
  // plataforma dejaba el paso bloqueado a un hotel que ya había registrado el
  // suyo, que es justo el caso que este cambio abre.
  const conectividadConfigurada = !!(
    provider &&
    provider.usernameEnc &&
    provider.passwordEnc &&
    (partnerIdPropio || provider.partnerIdEnc)
  );

  // hotelCode: código externo ya vinculado (si hay mapping activo).
  const hotelCode = mappingPropiedad?.externalPropertyId ?? null;

  // Último resultado por tipo de prueba (el primero de la lista es el más reciente).
  const resultados: OnboardingEstado['pruebas'] = {
    disponibilidad: null,
    tarifas: null,
    reserva: null,
  };
  const claves: Array<keyof OnboardingEstado['pruebas']> = [
    'disponibilidad',
    'tarifas',
    'reserva',
  ];
  for (const clave of claves) {
    const tipo = SYNC_TIPOS_ONBOARDING[clave];
    const log = logs.find((l) => l.tipo === tipo);
    if (log) resultados[clave] = (log.estado === 'exito' ? 'exito' : 'error') as ResultadoPrueba;
  }

  const unidadesConDatosOperativos = unidades.filter(
    (u) => u.capacidad > 0 && (u.planesActivos > 0 || u.tarifaBase != null)
  ).length;

  const estado: OnboardingEstado = {
    estadoPropiedad: propiedad.estado,
    tienePropiedad: true,
    unidades: unidades.length,
    unidadesConDatosOperativos,
    unidadesVinculadas: unidades.filter((u) => u.vinculada).length,
    hotelCode,
    conectividadConfigurada,
    pruebas: resultados,
  };

  return {
    ok: true,
    snapshot: {
      propiedad,
      hotelCode,
      unidades,
      unidadesVinculadas: estado.unidadesVinculadas,
      conectividad: {
        configurada: conectividadConfigurada,
        estado: provider?.estado ?? 'sin_configurar',
      },
      pruebas: resultados,
      pasos: computeOnboardingSteps(estado),
      puedeActivar: puedeActivar(estado),
    },
  };
}
