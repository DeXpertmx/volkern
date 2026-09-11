/**
 * Onboarding guiado de propiedad (plan maestro §31).
 *
 * El wizard recorre 10 pasos: crear propiedad, crear unidades, configurar datos
 * operativos, comprobar conectividad, obtener el mapping externo, relacionar
 * unidad ↔ room/rateplan y probar disponibilidad, tarifas y reserva antes de
 * activar la propiedad.
 *
 * Regla dura del plan: una propiedad NO se marca como conectada hasta que los
 * requisitos reales de conexión se cumplen y las tres pruebas pasan. Por eso la
 * lógica de pasos vive aquí como módulo puro y testeable: la UI no decide si
 * una propiedad está lista, lo decide esta función (y el backend la revalida).
 */

import type { WebhookReservationPayload } from './reservations';

export type PasoClave =
  | 'propiedad'
  | 'unidades'
  | 'datos_operativos'
  | 'conectividad'
  | 'mapping_externo'
  | 'vincular'
  | 'probar_disponibilidad'
  | 'probar_tarifas'
  | 'probar_reserva'
  | 'activar';

export type PasoEstado = 'completado' | 'pendiente' | 'error' | 'bloqueado';

export interface PasoOnboarding {
  clave: PasoClave;
  orden: number;
  titulo: string;
  descripcion: string;
  estado: PasoEstado;
  /** Detalle legible del motivo (por qué está pendiente/error/bloqueado). */
  detalle?: string;
}

/** Resultado de una prueba del paso 7-9. `null` = todavía no se ejecutó. */
export type ResultadoPrueba = 'exito' | 'error' | null;

export interface OnboardingEstado {
  /** Estado actual de la propiedad (`activa` | `conectada` | ...). */
  estadoPropiedad: string;
  tienePropiedad: boolean;
  unidades: number;
  /** Unidades con capacidad y (plan de tarifa activo o tarifa base). */
  unidadesConDatosOperativos: number;
  /** Unidades con mapping activo (unidad ↔ room/rateplan). */
  unidadesVinculadas: number;
  /** hotelCode externo ya vinculado, si existe. */
  hotelCode: string | null;
  /** La plataforma tiene credenciales de conectividad cargadas. */
  conectividadConfigurada: boolean;
  pruebas: {
    disponibilidad: ResultadoPrueba;
    tarifas: ResultadoPrueba;
    reserva: ResultadoPrueba;
  };
}

export const PASO_TITULOS: Record<PasoClave, { titulo: string; descripcion: string }> = {
  propiedad: {
    titulo: 'Crear la propiedad',
    descripcion: 'Datos de la propiedad que se va a distribuir en los canales.',
  },
  unidades: {
    titulo: 'Crear o importar unidades',
    descripcion: 'Cada unidad reservable (apartamento, habitación, casa...).',
  },
  datos_operativos: {
    titulo: 'Capacidad y datos operativos',
    descripcion: 'Capacidad por unidad y al menos un plan de tarifa con precio.',
  },
  conectividad: {
    titulo: 'Comprobar la conectividad de la plataforma',
    descripcion: 'Credenciales del servicio de conectividad cargadas por el administrador.',
  },
  mapping_externo: {
    titulo: 'Obtener el mapping externo',
    descripcion: 'Código de propiedad (hotelCode) y catálogo de habitaciones y tarifas.',
  },
  vincular: {
    titulo: 'Relacionar unidad ↔ habitación y tarifa',
    descripcion: 'Cada unidad apunta a su roomCode y rateplanCode del proveedor.',
  },
  probar_disponibilidad: {
    titulo: 'Probar disponibilidad',
    descripcion: 'Empuja el inventario de la propiedad y comprueba que el proveedor lo acepta.',
  },
  probar_tarifas: {
    titulo: 'Probar tarifas',
    descripcion: 'Empuja precios y restricciones y comprueba que el proveedor los acepta.',
  },
  probar_reserva: {
    titulo: 'Probar reserva',
    descripcion: 'Recibe una reserva de prueba por el webhook y verifica que se registra.',
  },
  activar: {
    titulo: 'Activar producción',
    descripcion: 'Marca la propiedad como conectada. Requiere todos los pasos anteriores.',
  },
};

const ORDEN: PasoClave[] = [
  'propiedad',
  'unidades',
  'datos_operativos',
  'conectividad',
  'mapping_externo',
  'vincular',
  'probar_disponibilidad',
  'probar_tarifas',
  'probar_reserva',
  'activar',
];

function paso(clave: PasoClave, estado: PasoEstado, detalle?: string): PasoOnboarding {
  return {
    clave,
    orden: ORDEN.indexOf(clave) + 1,
    ...PASO_TITULOS[clave],
    estado,
    ...(detalle ? { detalle } : {}),
  };
}

/** ¿La propiedad ya está marcada como conectada? */
export function estaConectada(estadoPropiedad: string): boolean {
  return estadoPropiedad === 'conectada';
}

/**
 * Deriva el estado de los 10 pasos a partir de los datos reales del tenant.
 * No hay estado guardado del wizard: cada paso se calcula de la realidad
 * (propiedad, unidades, mappings, conexión y resultados de pruebas), de modo
 * que el wizard nunca puede mostrar "completado" algo que no lo está.
 */
export function computeOnboardingSteps(e: OnboardingEstado): PasoOnboarding[] {
  const pasos: PasoOnboarding[] = [];

  // 1. Propiedad
  pasos.push(
    e.tienePropiedad
      ? paso('propiedad', 'completado')
      : paso('propiedad', 'pendiente', 'Todavía no hay propiedad creada.')
  );

  // 2. Unidades
  pasos.push(
    e.unidades > 0
      ? paso('unidades', 'completado', `${e.unidades} unidad(es) registradas.`)
      : paso('unidades', 'pendiente', 'Añade al menos una unidad.')
  );

  // 3. Datos operativos
  if (e.unidades === 0) {
    pasos.push(paso('datos_operativos', 'bloqueado', 'Primero crea unidades.'));
  } else if (e.unidadesConDatosOperativos >= e.unidades) {
    pasos.push(paso('datos_operativos', 'completado'));
  } else {
    pasos.push(
      paso(
        'datos_operativos',
        'pendiente',
        `${e.unidades - e.unidadesConDatosOperativos} unidad(es) sin tarifa base ni plan de tarifa activo.`
      )
    );
  }

  // 4. Conectividad (configuración de plataforma)
  pasos.push(
    e.conectividadConfigurada
      ? paso('conectividad', 'completado')
      : paso(
          'conectividad',
          'bloqueado',
          'La plataforma aún no tiene credenciales de conectividad configuradas.'
        )
  );

  // 5. Mapping externo
  if (!e.conectividadConfigurada) {
    pasos.push(paso('mapping_externo', 'bloqueado', 'Requiere conectividad configurada.'));
  } else if (e.hotelCode) {
    pasos.push(paso('mapping_externo', 'completado', `hotelCode: ${e.hotelCode}`));
  } else {
    pasos.push(
      paso('mapping_externo', 'pendiente', 'Obtén el código de propiedad y su catálogo.')
    );
  }

  // 6. Vincular unidad ↔ room/rateplan
  if (!e.hotelCode) {
    pasos.push(paso('vincular', 'bloqueado', 'Requiere el mapping externo.'));
  } else if (e.unidades > 0 && e.unidadesVinculadas >= e.unidades) {
    pasos.push(paso('vincular', 'completado', `${e.unidadesVinculadas} unidad(es) vinculadas.`));
  } else {
    pasos.push(
      paso(
        'vincular',
        'pendiente',
        `${e.unidadesVinculadas} de ${e.unidades} unidad(es) con habitación y tarifa asignadas.`
      )
    );
  }

  const prerequisitoVinculo = e.unidadesVinculadas > 0;

  // 7-9. Pruebas
  const pruebas: Array<{ clave: PasoClave; valor: ResultadoPrueba }> = [
    { clave: 'probar_disponibilidad', valor: e.pruebas.disponibilidad },
    { clave: 'probar_tarifas', valor: e.pruebas.tarifas },
    { clave: 'probar_reserva', valor: e.pruebas.reserva },
  ];
  for (const { clave, valor } of pruebas) {
    if (!prerequisitoVinculo) {
      pasos.push(paso(clave, 'bloqueado', 'Requiere unidades vinculadas al proveedor.'));
    } else if (valor === 'exito') {
      pasos.push(paso(clave, 'completado'));
    } else if (valor === 'error') {
      pasos.push(paso(clave, 'error', 'La última ejecución falló. Revisa el detalle y reintenta.'));
    } else {
      pasos.push(paso(clave, 'pendiente', 'Todavía no se ha ejecutado.'));
    }
  }

  // 10. Activar
  if (estaConectada(e.estadoPropiedad)) {
    pasos.push(paso('activar', 'completado'));
  } else {
    const { ok, faltantes } = puedeActivar(e);
    pasos.push(
      ok
        ? paso('activar', 'pendiente', 'Todo listo: activa la propiedad para producción.')
        : paso('activar', 'bloqueado', `Faltan: ${faltantes.join(', ')}.`)
    );
  }

  return pasos;
}

/**
 * Requisitos reales para marcar la propiedad como conectada (§31 + §0.5).
 * Devuelve los pasos que faltan, con su título legible.
 */
export function puedeActivar(e: OnboardingEstado): { ok: boolean; faltantes: string[] } {
  const faltantes: string[] = [];

  if (!e.tienePropiedad) faltantes.push(PASO_TITULOS.propiedad.titulo);
  if (e.unidades <= 0) faltantes.push(PASO_TITULOS.unidades.titulo);
  else if (e.unidadesConDatosOperativos < e.unidades) {
    faltantes.push(PASO_TITULOS.datos_operativos.titulo);
  }
  if (!e.conectividadConfigurada) faltantes.push(PASO_TITULOS.conectividad.titulo);
  if (!e.hotelCode) faltantes.push(PASO_TITULOS.mapping_externo.titulo);
  if (e.unidades > 0 && e.unidadesVinculadas < e.unidades) {
    faltantes.push(PASO_TITULOS.vincular.titulo);
  }
  if (e.pruebas.disponibilidad !== 'exito') faltantes.push(PASO_TITULOS.probar_disponibilidad.titulo);
  if (e.pruebas.tarifas !== 'exito') faltantes.push(PASO_TITULOS.probar_tarifas.titulo);
  if (e.pruebas.reserva !== 'exito') faltantes.push(PASO_TITULOS.probar_reserva.titulo);

  return { ok: faltantes.length === 0, faltantes };
}

// ─── Reserva de prueba (paso 9) ───────────────────────────────────────────

/** Prefijo del bookingId de las reservas de prueba del onboarding. */
export const ONBOARDING_TEST_BOOKING_PREFIX = 'onboarding-test-';
/** Prefijo del email del huésped de prueba (permite limpiar el contacto creado). */
export const ONBOARDING_TEST_EMAIL_PREFIX = 'prueba-onboarding+';

/**
 * Tipos de registro en HospitalitySyncLog que sustentan cada prueba del
 * onboarding. El wizard lee el ÚLTIMO registro de cada tipo para saber si la
 * prueba pasó, así que las pruebas quedan auditadas sin estado aparte.
 */
export const SYNC_TIPOS_ONBOARDING = {
  disponibilidad: 'inventory',
  tarifas: 'rates',
  reserva: 'reservacion_prueba',
} as const;

export type PruebaOnboarding = keyof typeof SYNC_TIPOS_ONBOARDING;

export function esReservaDePrueba(bookingId: string | null | undefined): boolean {
  return typeof bookingId === 'string' && bookingId.startsWith(ONBOARDING_TEST_BOOKING_PREFIX);
}

export function esEmailDePrueba(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.startsWith(ONBOARDING_TEST_EMAIL_PREFIX);
}

function toIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normaliza a medianoche UTC conservando el día calendario indicado.
 * Mezclar `setHours` (local) con `getUTC*` desplazaba la fecha un día en
 * zonas al oeste de UTC, así que el día se toma explícitamente.
 */
function diaCalendario(d: Date, origen: 'utc' | 'local'): Date {
  return origen === 'utc'
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Construye el payload `book` de prueba con la forma exacta del contrato.
 * No inventa campos: usa los documentados y rellena los opcionales como null.
 */
export function buildTestReservationPayload(input: {
  hotelCode: string;
  roomCode: string;
  rateplanCode?: string | null;
  /** Fecha de llegada (por defecto: mañana). */
  checkin?: Date;
  noches?: number;
  channel?: string;
  /** Sufijo único para el bookingId (por defecto: timestamp). */
  sufijo?: string;
}): WebhookReservationPayload {
  const noches = input.noches && input.noches > 0 ? input.noches : 2;
  // Sin fecha explícita: mañana (día calendario local del operador).
  const checkin = input.checkin
    ? diaCalendario(new Date(input.checkin), 'utc')
    : diaCalendario(new Date(Date.now() + 86_400_000), 'local');
  const checkout = new Date(checkin.getTime() + noches * 86_400_000);
  const sufijo = input.sufijo || String(Date.now());

  const precioNoche = 1000;

  return {
    action: 'book',
    hotelCode: input.hotelCode,
    channel: input.channel || 'Volkern',
    bookingId: `${ONBOARDING_TEST_BOOKING_PREFIX}${sufijo}`,
    cmBookingId: null,
    bookedOn: new Date().toISOString().slice(0, 19).replace('T', ' '),
    checkin: toIso(checkin),
    checkout: toIso(checkout),
    segment: 'prueba',
    specialRequests: 'Reserva de prueba del onboarding guiado de propiedad.',
    pah: false,
    amount: {
      amountAfterTax: precioNoche * noches,
      amountBeforeTax: precioNoche * noches,
      tax: 0,
      currency: 'MXN',
      commission: null,
      tcs: null,
      tds: null,
    },
    guest: {
      firstName: 'Prueba',
      lastName: 'Onboarding',
      email: `${ONBOARDING_TEST_EMAIL_PREFIX}${sufijo}@onboarding.test`,
      phone: null,
      address: null,
    },
    rooms: [
      {
        roomCode: input.roomCode,
        rateplanCode: input.rateplanCode ?? null,
        guestName: null,
        occupancy: { adults: 2, children: 0 },
        prices: Array.from({ length: noches }, (_, i) => ({
          date: toIso(new Date(checkin.getTime() + i * 86_400_000)),
          sellRate: precioNoche,
        })),
      },
    ],
  };
}

/** Etiqueta legible del estado de la propiedad. */
export function etiquetaEstadoPropiedad(estado: string): string {
  const mapa: Record<string, string> = {
    activa: 'Activa',
    inactiva: 'Inactiva',
    conectada: 'Conectada',
    borrador: 'En configuración',
  };
  return mapa[estado] || estado;
}
