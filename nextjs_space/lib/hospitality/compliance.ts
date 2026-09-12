/**
 * Registro de viajeros ante SES.HOSPEDAJES: el dominio, sin base de datos.
 *
 * Por qué existe. El alojamiento en España obliga a comunicar al Ministerio del
 * Interior (a) la reserva de hospedaje (RH) y (b) las personas que efectivamente
 * se alojan (parte de viajeros, PV). Son **dos comunicaciones distintas** y por eso
 * el registro de una reserva lleva dos estados, no uno.
 *
 * Qué se decide aquí y por qué no en la pantalla. El estado del registro, quién
 * puede reenviar, qué le falta a un viajero para poder comunicarse y qué se puede
 * enseñar de un documento son reglas del dominio del cumplimiento, no de la vista
 * que las pinta: la vista no puede decidir que un número de documento se ve
 * entero, y el estado no puede depender de qué pantalla lo mire.
 *
 * Regla de datos personales, en una línea: **un documento nunca se enseña completo
 * sin privilegio**. `enmascararDocumento` es la única forma de escribirlo en la
 * interfaz, y la bitácora guarda el enmascarado, no el original.
 *
 * Límite del módulo: el catálogo exacto de tipos de documento y el juego de campos
 * obligatorios los fija el Ministerio en el manual de alta. Aquí solo se declara
 * lo que la documentación ya nombra, y las constantes que dependen del manual van
 * marcadas como pendientes de confirmar, no inventadas.
 */

/** Los estados del registro, tal como los ve el propietario. */
export const ESTADOS_REGISTRO = [
  'datos_pendientes',
  'pendiente_envio',
  'enviado',
  'procesando',
  'completo',
  'error',
  'anulado',
] as const;

export type EstadoRegistro = (typeof ESTADOS_REGISTRO)[number];

export interface FichaEstado {
  /** Lo que se lee en la interfaz. */
  etiqueta: string;
  /** Emoji de la leyenda, para que la bandeja se lea de un vistazo. */
  icono: string;
  /** Clase de color del sistema de diseño, no un color suelto. */
  tono: 'verde' | 'amarillo' | 'naranja' | 'azul' | 'morado' | 'rojo' | 'gris';
  /** Qué significa, para el estado vacío y la ayuda. */
  descripcion: string;
}

export const FICHAS_ESTADO: Record<EstadoRegistro, FichaEstado> = {
  datos_pendientes: {
    etiqueta: 'Datos pendientes',
    icono: '🟡',
    tono: 'amarillo',
    descripcion: 'Faltan datos de algún viajero para poder comunicar',
  },
  pendiente_envio: {
    etiqueta: 'Pendiente de envío',
    icono: '🟠',
    tono: 'naranja',
    descripcion: 'Datos completos, aún sin comunicar al Ministerio',
  },
  enviado: {
    etiqueta: 'Enviado',
    icono: '🔵',
    tono: 'azul',
    descripcion: 'Comunicado, pendiente de respuesta',
  },
  procesando: {
    etiqueta: 'Procesando',
    icono: '🟣',
    tono: 'morado',
    descripcion: 'El Ministerio está procesando la comunicación',
  },
  completo: {
    etiqueta: 'Completo',
    icono: '🟢',
    tono: 'verde',
    descripcion: 'Aceptado por el Ministerio',
  },
  error: {
    etiqueta: 'Error',
    icono: '🔴',
    tono: 'rojo',
    descripcion: 'El Ministerio rechazó la comunicación',
  },
  anulado: {
    etiqueta: 'Anulado',
    icono: '⚫',
    tono: 'gris',
    descripcion: 'La reserva o el registro se anuló',
  },
};

/**
 * Cuánto ha avanzado cada estado, de menos a más.
 *
 * `error` y `anulado` no son «avance» sino interrupción, así que no compiten por
 * rango: mandan sobre cualquier progreso (ver `estadoAgregado`).
 */
const AVANCE: Record<EstadoRegistro, number> = {
  datos_pendientes: 0,
  pendiente_envio: 1,
  enviado: 2,
  procesando: 3,
  completo: 4,
  error: -1,
  anulado: -2,
};

/**
 * El estado del registro de una reserva a partir de sus comunicaciones.
 *
 * La regla: la interrupción manda (anulado sobre error) y, si no la hay, manda la
 * comunicación **menos avanzada** — el registro no está completo mientras una de
 * las dos no lo esté, y decir «Completo» con el parte de viajeros a medias sería
 * justo el error que este módulo existe para no cometer.
 */
export function estadoAgregado(...estados: EstadoRegistro[]): EstadoRegistro {
  const utiles = estados.filter((e): e is EstadoRegistro => ESTADOS_REGISTRO.includes(e));
  if (utiles.length === 0) return 'datos_pendientes';
  if (utiles.includes('anulado')) return 'anulado';
  if (utiles.includes('error')) return 'error';

  return utiles.reduce((peor, actual) => (AVANCE[actual] < AVANCE[peor] ? actual : peor));
}

/** ¿Este estado permite volver a enviar la comunicación? */
export function permiteReenvio(estado: EstadoRegistro): boolean {
  return estado === 'error' || estado === 'pendiente_envio' || estado === 'enviado';
}

/**
 * Campos que el Ministerio exige para comunicar a una persona.
 *
 * `nombre`, primer apellido y fecha de nacimiento son obligatorios siempre; el
 * documento también, porque identifica al viajero.
 */
export const CAMPOS_OBLIGATORIOS = [
  'nombre',
  'apellido1',
  'fechaNacimiento',
  'tipoDocumento',
  'numeroDocumento',
] as const;

/**
 * Tipos de documento que además exigen número de soporte.
 *
 * PENDIENTE DE CONFIRMAR contra el manual oficial: aquí solo están los dos que la
 * documentación nombra (DNI y NIE). El catálogo completo de tipos lo fija el
 * Ministerio y, cuando llegue, esta lista es lo único que cambia.
 */
export const TIPOS_DOCUMENTO_CON_SOPORTE: readonly string[] = ['DNI', 'NIE'];

/** Lo mínimo que hay que saber de un viajero para decidir su estado. */
export interface ViajeroMinimo {
  nombre?: string | null;
  apellido1?: string | null;
  apellido2?: string | null;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  soporteDocumento?: string | null;
  fechaNacimiento?: Date | string | null;
  nacionalidad?: string | null;
}

const tieneValor = (valor: unknown): boolean =>
  valor instanceof Date ? true : typeof valor === 'string' ? valor.trim().length > 0 : valor != null;

/** Qué le falta a este viajero para poder comunicarse. Vacío = está completo. */
export function camposFaltantes(viajero: ViajeroMinimo): string[] {
  const faltantes: string[] = CAMPOS_OBLIGATORIOS.filter((campo) => !tieneValor(viajero[campo]));

  const tipo = (viajero.tipoDocumento || '').trim().toUpperCase();
  if (tipo && TIPOS_DOCUMENTO_CON_SOPORTE.includes(tipo) && !tieneValor(viajero.soporteDocumento)) {
    faltantes.push('soporteDocumento');
  }

  return faltantes;
}

/** Estado de un viajero: sin los datos completos no puede comunicarse. */
export function estadoDeViajero(viajero: ViajeroMinimo): EstadoRegistro {
  return camposFaltantes(viajero).length === 0 ? 'pendiente_envio' : 'datos_pendientes';
}

/** El registro de una reserva, tal como lo devuelve la base de datos. */
export interface RegistroReserva {
  estadoReserva?: string | null;
  estadoViajeros?: string | null;
  enviadoEn?: Date | string | null;
  procesadoEn?: Date | string | null;
}

export interface ResumenRegistro {
  /** Cuántas personas hay declaradas en la reserva. */
  total: number;
  /** Cuántas tienen todos los datos que el Ministerio exige. */
  registrados: number;
  /** Cuántas siguen incompletas. */
  pendientes: number;
  /** Estado agregado del registro completo (las dos comunicaciones). */
  estado: EstadoRegistro;
  /** Texto listo para la interfaz: «4 viajeros · 3 registrados · 1 pendiente». */
  etiqueta: string;
  /** ¿Se puede enviar ahora mismo? Falso si falta algún dato. */
  listoParaEnviar: boolean;
}

/**
 * El resumen que ve el propietario: cuántos viajeros, cuántos registrados y en qué
 * punto está el registro. Es el cálculo que la bandeja y la ficha de la reserva
 * comparten, para que no puedan discrepar.
 *
 * Los dos estados tienen respaldos distintos y no por capricho:
 *
 *   • **Reserva (RH)** — una reserva que existe ya tiene todo lo que el Ministerio
 *     necesita de ella, así que sin comunicación nace en `pendiente_envio`, no en
 *     `datos_pendientes`; ahí no falta ningún dato que recoger.
 *   • **Viajeros (PV)** — aquí sí hay datos que recoger: sin viajeros declarados, o
 *     con alguno incompleto, el estado es `datos_pendientes`.
 *
 * Y el estado guardado manda sobre el derivado: si el Ministerio ya aceptó el parte
 * de viajeros, la pantalla no puede decir que falta gente porque después se haya
 * editado un nombre. Quien reconcilia eso es la capa de datos, al escribir.
 */
export function resumenDeReserva(
  viajeros: ViajeroMinimo[],
  registro: RegistroReserva | null | undefined
): ResumenRegistro {
  const total = viajeros.length;
  const pendientes = viajeros.filter((v) => camposFaltantes(v).length > 0).length;
  const registrados = total - pendientes;

  const derivadoViajeros: EstadoRegistro =
    total > 0 && pendientes === 0 ? 'pendiente_envio' : 'datos_pendientes';

  const estado = estadoAgregado(
    normalizarEstado(registro?.estadoReserva, 'pendiente_envio'),
    normalizarEstado(registro?.estadoViajeros, derivadoViajeros)
  );

  const partes = [`${total} ${total === 1 ? 'viajero' : 'viajeros'}`];
  partes.push(`${registrados} ${registrados === 1 ? 'registrado' : 'registrados'}`);
  if (pendientes > 0) partes.push(`${pendientes} pendiente${pendientes === 1 ? '' : 's'}`);

  return {
    total,
    registrados,
    pendientes,
    estado,
    etiqueta: partes.join(' · '),
    listoParaEnviar: total > 0 && pendientes === 0 && permiteReenvio(estado),
  };
}

/** Convierte lo que venga de la base de datos en un estado conocido. */
export function normalizarEstado(valor: string | null | undefined, respaldo: EstadoRegistro): EstadoRegistro {
  const limpio = (valor || '').trim() as EstadoRegistro;
  return ESTADOS_REGISTRO.includes(limpio) ? limpio : respaldo;
}

/**
 * Enmascara un número de documento dejando solo sus tres últimos caracteres.
 *
 * Es la ÚNICA forma en que un documento debe llegar a la interfaz: «12345678Z» se
 * enseña como «•••••••8Z», suficiente para que una persona reconozca el suyo y
 * para que nadie coseche documentos ajenos desde una pantalla compartida.
 */
export function enmascararDocumento(numero: string | null | undefined): string {
  const limpio = (numero || '').trim();
  if (!limpio) return '—';
  if (limpio.length <= 3) return '•'.repeat(limpio.length);
  return `${'•'.repeat(limpio.length - 3)}${limpio.slice(-3)}`;
}

/**
 * Roles que pueden ver un documento completo.
 *
 * La regla del plan maestro es que los datos personales no se enseñen de más, así
 * que el privilegio es explícito y corto: solo la administración de la cuenta. El
 * resto ve el documento enmascarado, también en la ficha de la reserva.
 */
export const ROLES_CON_DOCUMENTO_COMPLETO: readonly string[] = ['Superadmin', 'Admin'];

export function puedeVerDocumentoCompleto(rol: string | null | undefined): boolean {
  return ROLES_CON_DOCUMENTO_COMPLETO.includes((rol || '').trim());
}

/**
 * Un viajero listo para salir por la API: el documento sale enmascarado salvo que
 * quien pregunta tenga privilegio.
 *
 * Vive aquí y no en la ruta para que ninguna ruta pueda saltárselo: si el
 * enmascarado fuera una decisión de cada endpoint, el primero que se olvide abre el
 * agujero.
 */
export function viajeroPublico<T extends ViajeroMinimo & { id: string }>(
  viajero: T,
  opciones: { rol?: string | null } = {}
): Omit<T, 'numeroDocumento' | 'soporteDocumento'> & {
  numeroDocumento: string;
  soporteDocumento: string | null;
  documentoCompleto: boolean;
} {
  const completo = puedeVerDocumentoCompleto(opciones.rol);
  return {
    ...viajero,
    numeroDocumento: completo ? viajero.numeroDocumento || '—' : enmascararDocumento(viajero.numeroDocumento),
    soporteDocumento: completo ? viajero.soporteDocumento ?? null : viajero.soporteDocumento ? enmascararDocumento(viajero.soporteDocumento) : null,
    documentoCompleto: completo,
  };
}
