/**
 * Tipos de bloqueo de unidad (Calendar Blocks).
 *
 * Módulo PURO y compartido: la API valida contra esta lista y la UI la pinta.
 * No debe existir una segunda copia de los tipos en ninguna pantalla: si se
 * duplica, la UI puede ofrecer un tipo que el servidor rechaza.
 *
 * No todo lo que ocupa una unidad es una reserva:
 *  - `propietario`     → uso propio del propietario (fuera de venta)
 *  - `mantenimiento`   → unidad fuera de servicio por incidencia
 *  - `administrativo`  → cierre comercial / bloqueo administrativo
 *
 * Las reservas (OTA, manual o Booking Engine) NO son bloqueos: son entidades
 * propias del Reservation Engine. Los cuatro restan disponibilidad por el
 * mismo motor.
 */

export const TIPOS_BLOQUEO = ['propietario', 'mantenimiento', 'administrativo'] as const;

export type TipoBloqueo = (typeof TIPOS_BLOQUEO)[number];

export const TIPO_BLOQUEO_POR_DEFECTO: TipoBloqueo = 'propietario';

/** Presentación de cada tipo para la UI (etiqueta y color del bloque). */
export const PRESENTACION_BLOQUEO: Record<TipoBloqueo, { etiqueta: string; color: string }> = {
  propietario: { etiqueta: 'Propietario', color: '#b45309' },
  mantenimiento: { etiqueta: 'Mantenimiento', color: '#b91c1c' },
  administrativo: { etiqueta: 'Administrativo', color: '#475569' },
};

export function esTipoBloqueoValido(valor: unknown): valor is TipoBloqueo {
  return typeof valor === 'string' && (TIPOS_BLOQUEO as readonly string[]).includes(valor);
}

/* ─── El motivo: la razón documentada del cierre ──────────────────────────── */

/** Longitud máxima del motivo (la misma en la API y en el formulario). */
export const LONGITUD_MAXIMA_MOTIVO = 500;

/**
 * Un motivo listo para guardar: texto recortado y acotado. Cualquier otra cosa
 * (número, objeto, ausente) es cadena vacía, que es lo que la API rechaza: un
 * bloqueo sin razón no se crea.
 */
export function limpiarMotivo(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().slice(0, LONGITUD_MAXIMA_MOTIVO) : '';
}

/**
 * Razones frecuentes por tipo. NO es una lista cerrada —el campo es libre— pero
 * es lo que hace que la razón se escriba siempre y se escriba igual cada vez:
 * «Visita de un familiar» y «Noches vendidas a una empresa» dicen lo mismo hoy
 * que dentro de dos años, cuando el operador que las escribió ya no está.
 *
 * El motivo es obligatorio precisamente por esto: quien mire el calendario en
 * marzo tiene que saber por qué esas noches estaban cerradas, y un bloqueo sin
 * razón no deja rastro de nada.
 */
export const RAZONES_BLOQUEO: Record<TipoBloqueo, string[]> = {
  propietario: [
    'Visita de un familiar',
    'Uso propio del propietario',
    'Cortesía a un conocido',
    'Noches reservadas para el propietario',
  ],
  mantenimiento: [
    'Avería',
    'Obra programada',
    'Limpieza a fondo',
    'Revisión técnica',
  ],
  administrativo: [
    'Noches vendidas a una empresa (fuera de canal)',
    'Noches cedidas a una empresa',
    'Traslado de huéspedes',
    'Cierre por temporada',
  ],
};

/** Normaliza un tipo desconocido al valor por defecto (nunca falla). */
export function normalizarTipoBloqueo(valor: unknown): TipoBloqueo {
  return esTipoBloqueoValido(valor) ? valor : TIPO_BLOQUEO_POR_DEFECTO;
}

export function etiquetaTipoBloqueo(valor: unknown): string {
  return PRESENTACION_BLOQUEO[normalizarTipoBloqueo(valor)].etiqueta;
}

export function colorTipoBloqueo(valor: unknown): string {
  return PRESENTACION_BLOQUEO[normalizarTipoBloqueo(valor)].color;
}

/* ─── Estado del bloqueo: cerrar fechas y volver a abrirlas ─────────────────── */

/**
 * Los dos estados de un bloqueo. `activo` cierra las fechas; `cancelado` las
 * libera. Cancelar NO es borrar: la fila se conserva —con su motivo y su tipo—
 * justo para poder reactivarla sin volver a escribirla, y para que el histórico
 * de por qué una unidad estuvo cerrada no se pierda.
 */
export const ESTADOS_BLOQUEO = ['activo', 'cancelado'] as const;

export type EstadoBloqueo = (typeof ESTADOS_BLOQUEO)[number];

/**
 * Un estado ausente o desconocido cuenta como `activo`: es el valor por defecto
 * de la columna y el único lado seguro — dar por libre unas fechas que están
 * cerradas es peor que ofrecer liberar unas que ya lo estaban.
 */
export function normalizarEstadoBloqueo(valor: unknown): EstadoBloqueo {
  return valor === 'cancelado' ? 'cancelado' : 'activo';
}

/** ¿El bloqueo cierra las fechas ahora mismo? */
export function esBloqueoActivo(valor: unknown): boolean {
  return normalizarEstadoBloqueo(valor) === 'activo';
}

/**
 * La acción que se ofrece para un bloqueo, según su estado. Es el MISMO botón en
 * los dos casos —lo que cambia es el estado de destino— y vive aquí para que
 * ninguna pantalla tenga que adivinar qué toca: la UI no decide, lee.
 */
export function accionBloqueo(valor: unknown): {
  destino: EstadoBloqueo;
  etiqueta: string;
  ayuda: string;
} {
  return esBloqueoActivo(valor)
    ? {
        destino: 'cancelado',
        etiqueta: 'Liberar fechas',
        ayuda: 'Las fechas volverán a estar disponibles en tu web y en los canales.',
      }
    : {
        destino: 'activo',
        etiqueta: 'Reactivar bloqueo',
        ayuda: 'Las fechas se cerrarán otra vez en tu web y en los canales.',
      };
}
