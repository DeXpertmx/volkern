/**
 * Por qué el Ministerio rechazó un parte de viajeros, y qué hay que corregir.
 *
 * Módulo puro (sin BD y sin cliente del Ministerio) a propósito: lo usan los dos
 * lados. El servicio lo aplica a la traza de la última comunicación, y la
 * pantalla de reservas —que es un componente de cliente y no puede importar
 * código de servidor— lo usa para decirle al hotel **qué** tocar.
 *
 * La regla que sostiene todo lo demás: un rechazo NO se deduce del estado de la
 * reserva (una reserva confirmada y con documentos al día puede tener el parte
 * rechazado), sino de la última comunicación con el servicio. Y no todos los
 * rechazos son del huésped: decirle «revisa los datos» a quien tiene el código
 * de arrendador mal configurado le hace perder la mañana en un formulario donde
 * no hay nada que arreglar.
 *
 * El módulo cubre los DOS desenlaces en los que un parte no se comunica, y no
 * son lo mismo: **rechazado** (el servicio lo leyó y no lo aceptó → se corrige
 * un dato) y **sin entregar** (`error`: el servicio no respondió → se reintenta,
 * y los datos del huésped no tienen nada que ver). El segundo existe desde que
 * se dejó de guardar como rechazo una caída del servicio: antes, un timeout
 * aparecía ante el hotel como «el Ministerio rechazó este parte».
 */

import { describirCodigoMIR } from './registro-viajeros';
import { etiquetasDeCampos } from './booking-i18n';
import type { CampoViajero } from './guest-checkin';

/**
 * Mismo valor que `ESTADO_REGISTRO.rechazada` (módulo del servicio).
 * Está aquí repetido porque el cliente no puede importar el módulo del servicio
 * —arrastra la base de datos— y el aviso tiene que reconocer un rechazo sin
 * traerse medio servidor: `tests/hospitality-registro-viajeros-service.test.ts`
 * fija que los dos valores no se separen.
 */
export const ESTADO_RECHAZADO = 'rechazada';

/**
 * Mismo valor que `ESTADO_REGISTRO.aceptada`. Está aquí por lo mismo que el
 * rechazado: las superficies del hotel que cuentan partes (su panel y Reportes)
 * no pueden importar el módulo del servicio, y «aceptada» es la mitad del par
 * con el que se lee el abandono. El mismo test fija que no se separen.
 */
export const ESTADO_ACEPTADO = 'aceptada';

/**
 * Mismo valor que `ESTADO_REGISTRO.error`: **el parte no llegó al Ministerio**.
 *
 * Es un desenlace distinto del rechazo y confundirlos cuesta dinero: un rechazo
 * es una decisión del servicio sobre unos datos (se corrige el dato), mientras
 * que un `error` es que no se pudo entregar —el servicio no respondió, la red
 * falló, el timeout venció— y el Ministerio **ni siquiera ha visto** el parte.
 * Decirle «el Ministerio rechazó este parte» a quien tiene el servicio caído le
 * manda a revisar datos que están perfectos.
 */
export const ESTADO_SIN_ENTREGAR = 'error';

/**
 * A quién hay que corregir cuando el servicio rechaza un parte:
 *
 * - `datos` — un campo del huésped que el Ministerio no acepta. Se arregla en el
 *   formulario del parte (y el parte se reenvía al guardar).
 * - `configuracion` — el arrendador, la aplicación o el usuario. No se arregla
 *   pidiéndole nada al huésped.
 * - `envio` — el formato de la petición o el propio servicio. Se reintenta.
 */
export type AmbitoRechazo = 'datos' | 'configuracion' | 'envio';

/** Por qué se rechazó el parte, y qué hay que corregir. */
export interface RechazoDelParte {
  /** Código de retorno del servicio (10130, 10103…). `null` si vino en el lote. */
  codigo: string | null;
  /** Lo que dijo el servicio, tal cual (o la descripción de su código). */
  motivo: string;
  /** Campos del formulario del huésped que hay que revisar (si el rechazo los nombra). */
  campos: CampoViajero[];
  /** Dónde está el problema. */
  ambito: AmbitoRechazo;
}

/**
 * Intentos de envío por parte antes de que el barrido deje de reintentarlo.
 *
 * Es la misma cifra que usa el cron (que la importa de aquí): un parte imposible
 * no puede generar una tormenta de peticiones contra el servicio del Ministerio.
 * Y es también lo que la pantalla necesita saber para decir la verdad —«el
 * barrido ya no lo reintenta»— en vez de dejar creer que el producto sigue
 * intentándolo por su cuenta.
 */
export const MAX_INTENTOS_PARTE = 5;

/**
 * La espera entre reintentos crece con cada intento gastado: 1 h, 2 h, 4 h, 8 h,
 * 16 h. El objetivo no es solo no martillear el servicio con un parte imposible
 * — para eso está el tope —, sino no machacarlo cuando está CAÍDO: con la
 * ventana fija de una hora, una caída de una mañana recibía cada parte cinco
 * veces en cinco horas; con el backoff, la primera hora es igual y las demás se
 * van espaciando hasta que el servicio vuelve.
 *
 * La base y el tope viven AQUÍ y no en el cron porque la pantalla de reservas
 * (componente de cliente, sin base de datos) y el propio cron importan del
 * módulo puro: una sola definición de «cuándo vuelve a intentar el producto un
 * parte», igual que el tope de intentos.
 *
 * Indice 0 → 1 h (antes del primer intento), 1 → 2 h (tras el primero)… El
 * último peldaño se aplica a partir del índice que corresponde, para que un
 * tope más alto no vuelva a esperar una hora.
 */
export const ESPERA_BASE_REINTENTO_MS = 60 * 60 * 1000;
export const FACTOR_BACKOFF_REINTENTO = 2;
export const ESPERA_REINTENTO_MAXIMA_MS = 16 * 60 * 60 * 1000;

/**
 * Cuánto espera el barrido antes del reintento número `numeroReintento`
 * (1 = el reintento tras el primer intento fallido).
 */
export function esperaReintentoMs(numeroReintento: number): number {
  const n = Math.max(1, Math.floor(numeroReintento));
  const bruto = ESPERA_BASE_REINTENTO_MS * Math.pow(FACTOR_BACKOFF_REINTENTO, n - 1);
  return Math.min(bruto, ESPERA_REINTENTO_MAXIMA_MS);
}

/**
 * ¿El parte con `intentos` gastados y editado hace `msDesdeEdicion` está
 * disponible para el próximo reintento?
 *
 * Regla del barrido en una función pura, para que el cron no la recopie: la
 * disponibilidad exige haber respetado la ESPERA DEL PELDAÑO que toca según los
 * intentos ya gastados.
 */
export function reintentoDisponible(
  intentos: number | null | undefined,
  msDesdeEdicion: number
): boolean {
  const gastados = Math.max(0, intentos ?? 0);
  if (gastados >= MAX_INTENTOS_PARTE) return false;
  return msDesdeEdicion >= esperaReintentoMs(gastados + 1);
}

/**
 * ¿El barrido ya ha dejado de reintentar este parte?
 *
 * Le pasa a los dos desenlaces en los que el producto SÍ lo intentó y no lo
 * consiguió: el RECHAZADO por el Ministerio y el que **no se pudo entregar**
 * (`error`: servicio caído, red, timeout). Los dos agotan el mismo tope y los dos
 * son estancias sin comunicar, así que los dos tienen que parar y avisarse.
 *
 * Un `datos_incompletos` no gasta intentos (no se llama al servicio con un parte
 * incompleto), así que se sigue revisando en cada barrido —lo que puede cambiar
 * es que el hotel complete los datos—. Un parte aceptado tampoco se reintenta
 * nunca, y eso no es un abandono: es estar resuelto.
 */
/**
 * Estados de una comunicación que el producto intentó enviar y no consiguió
 * entregar: rechazada por el Ministerio o sin respuesta del servicio. Son los
 * únicos que el barrido puede abandonar, y por eso el listado vive aquí y no
 * copiado en cada consulta (servicio, cron y métricas lo comparten).
 */
export const ESTADOS_ABANDONABLES = [ESTADO_RECHAZADO, ESTADO_SIN_ENTREGAR] as const;

export function parteAbandonado(
  fila: { estado: string; intentos?: number | null } | null
): boolean {
  if (!fila) return false;
  const intentado = (ESTADOS_ABANDONABLES as readonly string[]).includes(fila.estado);
  if (!intentado) return false;
  return (fila.intentos ?? 0) >= MAX_INTENTOS_PARTE;
}

/**
 * ¿El barrido sigue insistiendo con este parte?
 *
 * El complemento del anterior: el producto lo intentó, no lo consiguió y todavía
 * le quedan intentos. Sirve para el desglose de la métrica y para el texto —un
 * rechazo en curso y una entrega en curso no se leen igual— sin repetir la
 * regla del tope en cada sitio.
 */
export function parteEnReintento(
  fila: { estado: string; intentos?: number | null } | null
): boolean {
  if (!fila) return false;
  const intentado = (ESTADOS_ABANDONABLES as readonly string[]).includes(fila.estado);
  return intentado && !parteAbandonado(fila);
}

/** Códigos cuyo problema es la configuración del hotel (arrendador, aplicación, usuario). */
const CODIGOS_RECHAZO_CONFIGURACION = new Set([
  '10100',
  '10101',
  '10103',
  '10107',
  '10119',
  '10120',
  '10128',
  '10150',
]);

/** Códigos de validación de campos: el dato que mandamos no le vale al servicio. */
const CODIGOS_RECHAZO_DATOS = new Set(['10121', '10130', '10131']);

/**
 * Ruta de un campo dentro del mensaje MIR → campo del formulario del huésped.
 *
 * El servicio (y nuestro propio validador) nombran los campos con su ruta XML
 * (`persona[0].direccion.codigoMunicipio`): lo que identifica el campo es la
 * **cola** de la ruta, porque el prefijo cambia según el mensaje del que hable
 * (parte, reserva de hospedaje o establecimiento).
 */
const CAMPOS_POR_COLA_MIR: Record<string, CampoViajero> = {
  nombre: 'nombre',
  apellido1: 'apellido1',
  apellido2: 'apellido2',
  tipodocumento: 'tipoDocumento',
  numerodocumento: 'numeroDocumento',
  soportedocumento: 'soporteDocumento',
  fechanacimiento: 'fechaNacimiento',
  nacionalidad: 'nacionalidad',
  sexo: 'sexo',
  'direccion.direccion': 'direccion.calle',
  'direccion.direccioncomplementaria': 'direccion.calle',
  'direccion.codigopostal': 'direccion.codigoPostal',
  'direccion.pais': 'direccion.pais',
  'direccion.codigomunicipio': 'direccion.municipio',
  telefono: 'contacto',
  telefono2: 'contacto',
  correo: 'contacto',
  parentesco: 'parentesco',
};

/**
 * Nodos que identifican a una persona dentro del mensaje. Solo se traduce una
 * ruta larga si pasa por uno de ellos: `establecimiento.datosEstablecimiento`
 * también tiene un `nombre` y un `direccion.codigoPostal`, y confundirlos con
 * los del huésped mandaría al operador a corregir el documento del viajero por
 * un error del inmueble.
 */
const NODOS_DE_PERSONA = /^(persona|personas|viajero|viajeros|huesped|huésped|titular|acompañante|acompanante)$/i;

/** Campo del formulario del huésped al que se refiere una ruta del mensaje MIR. */
export function campoDeRutaMIR(ruta: string | null | undefined): CampoViajero | null {
  const limpia = String(ruta ?? '')
    .trim()
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, '');
  if (!limpia) return null;

  const partes = limpia.split('.').filter(Boolean);
  // Una ruta con prefijo (`contrato.fechaEntrada`, `establecimiento…`) solo se
  // traduce si habla de una persona; el nombre suelto (`numeroDocumento`) sí se
  // acepta: es como el servicio lo cita muchas veces dentro de una frase.
  if (partes.length > 1 && !partes.some((parte) => NODOS_DE_PERSONA.test(parte))) return null;

  for (let i = 0; i < partes.length; i += 1) {
    const campo = CAMPOS_POR_COLA_MIR[partes.slice(i).join('.').toLowerCase()];
    if (campo) return campo;
  }
  return null;
}

/**
 * Los campos del huésped que nombra un texto de error.
 *
 * El servicio no siempre devuelve el campo en un campo aparte: muchas veces lo
 * cita dentro de la frase («El campo persona[0].correo no es válido»). Se leen
 * las rutas del texto en vez de inventar un catálogo de mensajes ajenos, que
 * quedaría obsoleto en cuanto el servicio cambie una redacción.
 */
export function camposEnTextoDeError(texto: string | null | undefined): CampoViajero[] {
  const encontrados: CampoViajero[] = [];
  const rutas =
    String(texto ?? '').match(/(?:[A-Za-z_][\w-]*)(?:\[\d+\])?(?:\.[A-Za-z_][\w-]*)+/g) ?? [];
  for (const ruta of rutas) {
    const campo = campoDeRutaMIR(ruta);
    if (campo && !encontrados.includes(campo)) encontrados.push(campo);
  }
  return encontrados;
}

/**
 * ¿Este código de retorno explica el rechazo?
 *
 * El `0 - Ok` NO: cuando el alta se recibe bien y el rechazo llega después en el
 * resultado del lote, la traza guarda el `0` del alta —que solo dice que se
 * recibió— y el motivo de verdad viene en la descripción y en el error del lote.
 * Clasificar el problema con un código de éxito es lo que mandaba a «reintenta,
 * es el envío» un rechazo que era un documento del huésped (el ensayo E2E lo
 * destapó: bloque 4d).
 */
export function codigoExplicaElRechazo(codigo: string | null | undefined): boolean {
  const clave = (codigo ?? '').trim();
  return Boolean(clave) && clave !== '0';
}

/** Dónde está el problema de un rechazo: en los datos, en la configuración o en el envío. */
export function ambitoDeRechazo(codigo: string | null, campos: readonly CampoViajero[]): AmbitoRechazo {
  const clave = codigoExplicaElRechazo(codigo) ? String(codigo).trim() : '';
  if (CODIGOS_RECHAZO_DATOS.has(clave)) return 'datos';
  if (CODIGOS_RECHAZO_CONFIGURACION.has(clave)) return 'configuracion';
  if (clave) return 'envio';
  // Sin código que explique nada (el rechazo vino en el resultado del lote, o la
  // traza solo tiene el `0` del alta): decide el propio texto del servicio. Si
  // nombra campos del huésped, son sus datos; si no nombra ninguno, es el envío,
  // y mandar al hotel a un formulario vacío sería peor que decirle que reintente.
  return campos.length > 0 ? 'datos' : 'envio';
}

/**
 * El rechazo de una comunicación, si lo fue. Función pura: se prueba sin BD.
 *
 * Acepta las dos formas en que llega un rechazo —la lista del validador local
 * (`{campo, mensaje, codigo}`) y el error suelto del resultado del lote
 * (`{tipoError, error}`)— porque el aviso no puede depender de por qué camino se
 * enteró el producto.
 */
export function rechazoDeComunicacion(
  fila: {
    estado: string;
    descripcion?: string | null;
    codigoRetorno?: string | null;
    errores?: unknown;
  } | null
): RechazoDelParte | null {
  if (!fila || fila.estado !== ESTADO_RECHAZADO) return null;

  // El código solo se enseña si explica el rechazo: un `0` es el del alta (el
  // servicio la recibió bien) y ponerlo en el aviso como «código 0» sería ruido
  // que además haría pensar que el problema es del envío.
  const codigo = codigoExplicaElRechazo(fila.codigoRetorno) ? String(fila.codigoRetorno).trim() : null;
  const motivo =
    (fila.descripcion ?? '').trim() ||
    (codigo ? describirCodigoMIR(codigo) : 'El servicio rechazó la comunicación');

  const campos: CampoViajero[] = [];
  const marcar = (campo: CampoViajero | null) => {
    if (campo && !campos.includes(campo)) campos.push(campo);
  };
  const leerTexto = (texto: unknown) => {
    for (const campo of camposEnTextoDeError(String(texto ?? ''))) marcar(campo);
  };

  if (Array.isArray(fila.errores)) {
    for (const bruto of fila.errores) {
      const detalle = (bruto ?? {}) as { campo?: unknown; mensaje?: unknown };
      marcar(campoDeRutaMIR(String(detalle.campo ?? '')));
      leerTexto(detalle.campo);
      leerTexto(detalle.mensaje);
    }
  } else if (fila.errores && typeof fila.errores === 'object') {
    leerTexto((fila.errores as { error?: unknown }).error);
  }
  // La descripción del servicio suele citar el campo dentro de la frase: si lo
  // nombra, se enseña; y si no nombra ninguno, es lo que decide el ámbito.
  leerTexto(motivo);

  return { codigo, motivo, campos, ambito: ambitoDeRechazo(codigo, campos) };
}

// ────────────────────────────────────────────────────────────────────────────
// El otro desenlace: el parte que no llegó
// ────────────────────────────────────────────────────────────────────────────

/**
 * Un parte que **no se pudo entregar** al servicio (red, timeout o una respuesta
 * que no se puede leer).
 *
 * Tiene la misma forma que un rechazo —motivo, campos, ámbito— porque la
 * pantalla necesita lo mismo: el motivo para enseñarlo y el ámbito para decidir
 * la salida. Lo que cambia es el significado: aquí el Ministerio no ha dicho
 * nada del parte, así que el ámbito es SIEMPRE el envío y nunca los datos del
 * huésped; mandar al formulario del check-in con el servicio caído sería perder
 * la mañana en un dato que no está mal.
 */
export interface FalloDeParte {
  /**
   * Marca del desenlace. `RechazoDelParte` NO la lleva (añadírsela obligaría a
   * tocar cada consumidor para decir algo que ya dice el estado de la traza), así
   * que su presencia —`'desenlace' in diagnostico`— es lo que distingue los dos
   * casos en la pantalla.
   */
  desenlace: 'sin_entregar';
  /** Siempre `null`: el servicio no devolvió ningún código. */
  codigo: null;
  /** Lo que dijo el cliente HTTP (error de red, timeout, estado HTTP…). */
  motivo: string;
  /** Siempre vacío: la no-entrega no acusa a ningún campo del huésped. */
  campos: [];
  /** Siempre `envio`: es una incidencia de la entrega, no de los datos. */
  ambito: 'envio';
}

/**
 * El diagnóstico de un parte que no llegó, si lo fue. Función pura.
 *
 * Solo mira el estado: un `error` es, por definición del módulo, una
 * comunicación que el producto intentó enviar y el servicio no recibió.
 */
export function falloDeComunicacion(
  fila: { estado: string; descripcion?: string | null } | null
): FalloDeParte | null {
  if (!fila || fila.estado !== ESTADO_SIN_ENTREGAR) return null;
  return {
    desenlace: 'sin_entregar',
    codigo: null,
    motivo:
      (fila.descripcion ?? '').trim() || 'El servicio del Ministerio no respondió a la petición',
    campos: [],
    ambito: 'envio',
  };
}

/**
 * Diagnóstico de la última comunicación de un parte, sea cual sea su desenlace
 * fallido: rechazado por el Ministerio (`RechazoDelParte`) o no entregado
 * (`FalloDeParte`). `null` si no hay nada que diagnosticar (aceptada, en vuelo,
 * incompleta…).
 *
 * Es el punto de entrada que deben usar las pantallas: elegir a mano entre los
 * dos caminos en cada superficie es como se acaba diciendo «el Ministerio lo
 * rechazó» de un parte que nunca le llegó.
 */
export type DiagnosticoDeParte = RechazoDelParte | FalloDeParte;

export function diagnosticoDeComunicacion(fila: {
  estado: string;
  descripcion?: string | null;
  codigoRetorno?: string | null;
  errores?: unknown;
} | null): DiagnosticoDeParte | null {
  if (!fila) return null;
  if (fila.estado === ESTADO_SIN_ENTREGAR) return falloDeComunicacion(fila);
  return rechazoDeComunicacion(fila);
}

/**
 * Qué tiene que hacer el hotel con un parte rechazado, según dónde esté el
 * problema. Es texto de producto: vive aquí para que la pantalla y los tests
 * digan lo mismo.
 */
export function queCorregirElParte(rechazo: RechazoDelParte | FalloDeParte): string {
  const campos = etiquetasDeCampos(rechazo.campos, 'es');
  if (rechazo.ambito === 'datos') {
    return campos
      ? `Corrige estos datos y vuelve a guardar: ${campos}. El parte se reenvía en cuanto el dato esté bien.`
      : 'El servicio no acepta algún dato del viajero: revísalos en el formulario del parte y vuelve a guardar.';
  }
  if (rechazo.ambito === 'configuracion') {
    return 'No es un problema del huésped: el rechazo es de la configuración del registro de viajeros (código de arrendador, aplicación o usuario). Revísala en Registro de viajeros antes de reintentar.';
  }
  if ('desenlace' in rechazo && rechazo.desenlace === 'sin_entregar') {
    return 'No es un problema de los datos del huésped: el servicio no llegó a recibir la petición (caída del servicio, red o timeout). Vuelve a enviarla; si se repite, es una incidencia del servicio, no del parte.';
  }
  return 'No es un problema de los datos del huésped: el servicio no aceptó la petición. Vuelve a enviarla; si se repite, es una incidencia del servicio.';
}
