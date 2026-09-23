/**
 * Registro de viajeros — envío al servicio oficial del Ministerio del Interior.
 *
 * Este módulo pone en marcha lo que `lib/hospitality/registro-viajeros.ts`
 * define: construye el parte desde la reserva, lo envía al web service del
 * Ministerio (SES Hospedajes, interfaz v3.1.2) y deja traza en la base de
 * datos. No hay ninguna pasarela de terceros en medio.
 *
 * CÓMO FUNCIONA (y por qué así)
 *  - El alta es **asíncrona**: el servicio responde `0 - Ok` acompañado de un
 *    número de lote. Ese `0` NO significa que el parte esté registrado, solo
 *    que se recibió. Por eso cada comunicación se guarda primero y se consulta
 *    después: `enviarComunicacion()` deja el lote y `consultarLotesPendientes()`
 *    lo resuelve (código de comunicación asignado o el error real).
 *  - **Un parte por reserva y petición.** El servicio admite hasta 100 por
 *    envío, pero con uno por reserva la traza es por reserva (el lote y el
 *    error apuntan a una fila concreta) y un parte mal formado no arrastra a
 *    los demás.
 *  - **Nunca se envía un parte inválido.** Si faltan datos que el canal no
 *    manda (documento, fecha de nacimiento, dirección…), la comunicación queda
 *    en `datos_incompletos` con el detalle de lo que falta: el operador lo
 *    completa y se reintenta. El RD 933/2021 obliga a comunicar, no a inventar.
 *  - Los códigos de catálogo (tipo de pago) se configuran, no se adivinan.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/core/crypto';
import {
  ESTADOS_ACTIVOS_REGISTRO,
  HOSTS_MIR_OFICIALES,
  ROL_PERSONA,
  TIPO_COMUNICACION,
  TIPO_OPERACION,
  construirSobreSoap,
  construirXmlAltaReservaHospedaje,
  construirXmlAnulacion,
  construirXmlConsultaLotes,
  construirXmlParteViajeros,
  reservasHospedajeHabilitadas,
  namespaceAltaReservaHospedaje,
  describirCodigoMIR,
  empaquetarSolicitud,
  endpointMIR,
  esCodigoCorrectoMIR,
  esRespuestaMIR,
  formatearFechaHoraMIR,
  formatearFechaMIR,
  leerRespuestaMIR,
  validarCabeceraMIR,
  validarParteViajeros,
  validarReservaHospedaje,
  type CabeceraMIR,
  type EntornoMIR,
  type ErrorValidacionMIR,
  type PersonaMIR,
  type ParteViajerosMIR,
  type ReservaHospedajeMIR,
  type RespuestaMIR,
} from './registro-viajeros';
import {
  resumenDocumentacion,
  viajerosDeGuestData,
  type CampoViajero,
} from './guest-checkin';
import {
  ESTADOS_ABANDONABLES,
  MAX_INTENTOS_PARTE,
  diagnosticoDeComunicacion,
  falloDeComunicacion,
  parteAbandonado,
  rechazoDeComunicacion,
  type DiagnosticoDeParte,
  type FalloDeParte,
  type RechazoDelParte,
} from './parte-rechazo';
import { resumirPartes, type MetricasPartesViajeros } from './partes-metrics';

/** Estados de una comunicación en la traza local. */
export const ESTADO_REGISTRO = {
  pendiente: 'pendiente',
  enviada: 'enviada',
  aceptada: 'aceptada',
  rechazada: 'rechazada',
  anulada: 'anulada',
  error: 'error',
  datosIncompletos: 'datos_incompletos',
  /** El tipo de comunicación todavía no se puede emitir (falta el XSD oficial). */
  pendienteXsd: 'pendiente_xsd',
} as const;

/**
 * Motivo por el que la reserva de hospedaje (`RH`) aún no se emite.
 * Es literal a propósito: la pantalla y los logs deben decir lo mismo, y nadie
 * debe interpretar que es un fallo de red.
 */
/**
 * Estados del inmueble que el registro de viajeros considera.
 *
 * «conectada» es la propiedad PUBLICADA: la que tiene reservas que comunicar. Un
 * filtro por «activa» dejaba fuera precisamente esa, así que su código de
 * establecimiento no se podía informar ni contaba en el aviso de «sin código»
 * (un parte de viajeros sin ese código no se puede emitir).
 */
export const ESTADOS_PROPIEDAD_REGISTRO = ['activa', 'conectada'] as const;

export const MOTIVO_RH_SIN_NAMESPACE =
  'Reserva de hospedaje (RH) pendiente del XSD oficial: el documento v3.1.2 publica el esquema como imagen y el namespace no se deduce. Se copiará del fichero XSD del Ministerio (ver docs/hospitality-registro-viajeros-mir.md).';

/** Timeout de la llamada al servicio (el Ministerio responde rápido; sin esto un cuelgue bloquea el cron). */
const TIMEOUT_MS = 20_000;

/**
 * Cuánto se espera la resolución de un lote ya enviado antes de darlo por
 * perdido y volver a enviar el alta.
 *
 * El alta es ASÍNCRONA: entre el `0 - Ok` y el código de comunicación pasa un
 * tiempo. Ese intervalo no es un hueco para reenviar —reenviar duplica la
 * comunicación en el Ministerio— sino para consultar el lote
 * (`consultarLotesPendientes`). El plazo que se concede es el mismo que el RD
 * 933/2021 da para comunicar (24 h): pasado ese tiempo sin resolución, el lote
 * se considera perdido y el parte vuelve a entrar en los candidatos del cron.
 */
export const VENTANA_LOTE_MS = 24 * 60 * 60 * 1000;

/**
 * ¿Esta comunicación ya salió y sigue pendiente de resolución?
 *
 * El cron aplica esta MISMA regla en su filtro de candidatas (una consulta
 * Prisma no puede llamar a una función): por eso el cálculo de la ventana vive
 * en `VENTANA_LOTE_MS` y hay una guardia que comprueba que el cron la usa.
 */
export function enVuelo(
  fila: { estado: string; lote: string | null; fechaEnvio: Date | null },
  ahora: number
): boolean {
  if (fila.estado !== ESTADO_REGISTRO.enviada || !fila.lote) return false;
  if (!fila.fechaEnvio) return false;
  return ahora - fila.fechaEnvio.getTime() < VENTANA_LOTE_MS;
}

// ────────────────────────────────────────────────────────────────────────────
// Configuración por tenant (credenciales del arrendador)
// ────────────────────────────────────────────────────────────────────────────

export interface MirConfigEntrada {
  codigoArrendador?: string;
  aplicacion?: string;
  entorno?: EntornoMIR;
  usuario?: string;
  password?: string;
  tipoPagoDefecto?: string;
  mapaTiposPago?: Record<string, string>;
  activo?: boolean;
}

/** Devuelve la fila de configuración o null si el tenant no la ha creado. */
export async function getMirConfig(tenantId: string) {
  return prisma.hospitalityMirConfig.findUnique({ where: { tenantId } });
}

/**
 * Versión pública (sin secretos) para la API y la UI. Solo marcadores de
 * presencia, nunca los valores cifrados.
 */
export async function getMirConfigPublica(tenantId: string) {
  const config = await getMirConfig(tenantId);
  if (!config) {
    return {
      configurado: false,
      activo: false,
      codigoArrendador: '',
      aplicacion: '',
      entorno: 'pre' as EntornoMIR,
      tieneCredenciales: false,
      tipoPagoDefecto: null as string | null,
      tiposPagoConfigurados: 0,
      ultimoEnvio: null as Date | null,
      ultimoError: null as string | null,
      listoParaEnviar: false,
    };
  }
  const tieneCredenciales = !!(config.codigoArrendador && config.usuarioEnc && config.passwordEnc);
  const tiposPago = (config.mapaTiposPago as Record<string, string> | null) ?? {};
  return {
    // «Configurado» es tener código de arrendador, no tener la fila: una
    // configuración vaciada (la de la traza de partida) no está configurada.
    configurado: !!config.codigoArrendador,
    activo: config.activo,
    codigoArrendador: config.codigoArrendador,
    aplicacion: config.aplicacion,
    entorno: (config.entorno as EntornoMIR) || 'pre',
    tieneCredenciales,
    tipoPagoDefecto: config.tipoPagoDefecto,
    tiposPagoConfigurados: Object.keys(tiposPago).length,
    ultimoEnvio: config.ultimoEnvio,
    ultimoError: config.ultimoError,
    // Para poder enviar hacen falta las credenciales y un código de tipo de pago.
    listoParaEnviar: tieneCredenciales && !!(config.tipoPagoDefecto || Object.keys(tiposPago).length > 0),
  };
}

/**
 * Guarda (o actualiza) la configuración del arrendador. Cifra usuario y
 * contraseña antes de persistir.
 *
 * Convención de la entrada, la misma en toda la casa: **ausente = sin cambio,
 * vacío = se borra**.
 *
 * Antes, una cadena vacía se ignoraba en silencio: el hotel borraba su
 * contraseña en la pantalla, guardaba, y la credencial seguía ahí (y
 * `listoParaEnviar` seguía diciendo que sí). Un hotel que cambia de proveedor,
 * corrige una credencial equivocada o quiere dejar la cuenta sin activar tiene
 * que poder vaciarla. Un código de arrendador vacío se guarda vacío —nunca se
 * inventa uno—, y así el estado se lee como «sin configurar».
 */
export async function saveMirConfig(tenantId: string, entrada: MirConfigEntrada) {
  const data: Record<string, unknown> = {};
  if (entrada.codigoArrendador !== undefined) {
    data.codigoArrendador = entrada.codigoArrendador.trim();
  }
  if (entrada.aplicacion !== undefined) {
    // La aplicación que viaja en la cabecera tiene un valor por defecto: quien
    // vacía el campo vuelve a él, no a una cabecera en blanco.
    data.aplicacion = entrada.aplicacion.trim() || 'Volkern';
  }
  if (entrada.entorno !== undefined) data.entorno = entrada.entorno;
  if (entrada.usuario !== undefined) {
    const usuario = entrada.usuario.trim();
    data.usuarioEnc = usuario ? encrypt(usuario) : null;
  }
  if (entrada.password !== undefined) {
    const password = entrada.password.trim();
    data.passwordEnc = password ? encrypt(password) : null;
  }
  if (entrada.tipoPagoDefecto !== undefined) {
    data.tipoPagoDefecto = entrada.tipoPagoDefecto ? entrada.tipoPagoDefecto.trim() : null;
  }
  if (entrada.mapaTiposPago !== undefined) data.mapaTiposPago = entrada.mapaTiposPago;
  if (entrada.activo !== undefined) data.activo = entrada.activo;

  const config = await prisma.hospitalityMirConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      codigoArrendador: (entrada.codigoArrendador ?? '').trim(),
      aplicacion: (entrada.aplicacion ?? '').trim() || 'Volkern',
      entorno: entrada.entorno ?? 'pre',
      usuarioEnc: entrada.usuario ? encrypt(entrada.usuario.trim()) : null,
      passwordEnc: entrada.password ? encrypt(entrada.password.trim()) : null,
      tipoPagoDefecto: entrada.tipoPagoDefecto?.trim() || null,
      mapaTiposPago: entrada.mapaTiposPago ?? undefined,
      activo: entrada.activo ?? true,
    },
    update: data,
  });

  return config;
}

// ────────────────────────────────────────────────────────────────────────────
// Destino del envío
// ────────────────────────────────────────────────────────────────────────────

/**
 * Variable que apunta el envío a un mock local **solo** en el ensayo E2E.
 *
 * Existe porque el ensayo de punta a punta tiene que ejercer este camino real
 * (cabecera, ZIP+Base64, asincronía del lote) sin llamar al Ministerio. Es una
 * puerta con tres cerrojos, no un atajo:
 *
 *  1. **En producción se ignora.** Aunque esté puesta, el envío sale al
 *     servicio del Ministerio (y se avisa una vez por consola).
 *  2. **Solo loopback.** Un valor que no sea `127.0.0.1`, `localhost` o `[::1]`
 *     lanza: nunca puede desviar el envío a un tercero.
 *  3. **La guardia del host la vuelve a comprobar** (`esMockDeEnsayo`): el único
 *     host no oficial que se admite es un mock en loopback y fuera de producción.
 */
export const VAR_ENDPOINT_ENSALLO = 'MIR_E2E_ENDPOINT';

/** ¿Es un host de loopback? (el mock del ensayo corre en la misma máquina). */
function esLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}

/** Host de un endpoint (sin puerto ni ruta). Cadena vacía si no es una URL. */
export function hostDeEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return '';
  }
}

/** ¿Es uno de los dos hosts publicados por el Ministerio? */
export function esHostOficialMIR(host: string): boolean {
  return HOSTS_MIR_OFICIALES.includes(host as (typeof HOSTS_MIR_OFICIALES)[number]);
}

/**
 * ¿Este host es el mock del ensayo? Solo en loopback y fuera de producción.
 * Es la única excepción a «solo se habla con el Ministerio» que existe.
 */
export function esMockDeEnsayo(host: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && esLoopback(host);
}

/** Aviso (una sola vez por proceso) de que el override del ensayo se ignora. */
let avisadoOverrideIgnorado = false;

/**
 * Endpoint al que se envía: el del Ministerio, o el mock del ensayo si la
 * variable `MIR_E2E_ENDPOINT` apunta a loopback y no estamos en producción.
 */
export function endpointParaEnvio(
  entorno: EntornoMIR,
  env: NodeJS.ProcessEnv = process.env
): string {
  const override = (env[VAR_ENDPOINT_ENSALLO] ?? '').trim();
  if (!override) return endpointMIR(entorno);

  if (env.NODE_ENV === 'production') {
    if (!avisadoOverrideIgnorado) {
      avisadoOverrideIgnorado = true;
      console.warn(
        `[Registro de viajeros] ${VAR_ENDPOINT_ENSALLO} está definida pero se IGNORA en producción: ` +
          'las comunicaciones salen al servicio del Ministerio.'
      );
    }
    return endpointMIR(entorno);
  }

  const host = hostDeEndpoint(override);
  if (!esLoopback(host)) {
    throw new Error(
      `[Registro de viajeros] ${VAR_ENDPOINT_ENSALLO} solo puede apuntar al mock local del ensayo ` +
        `(127.0.0.1, localhost o [::1]); llegó «${host || override}».`
    );
  }
  return override.replace(/\/+$/, '');
}

/** Credenciales descifradas + endpoint. Null si no está configurado. */
async function credencialesMIR(tenantId: string) {
  const config = await getMirConfig(tenantId);
  if (!config || !config.activo) return null;
  if (!config.usuarioEnc || !config.passwordEnc) return null;

  const entorno = (config.entorno as EntornoMIR) || 'pre';
  const endpoint = endpointParaEnvio(entorno);

  // Guardia: el módulo solo puede hablar con el servicio del Ministerio. La
  // única excepción es el mock del ensayo E2E (loopback y fuera de producción),
  // y se vuelve a comprobar AQUÍ: ni un fallo en la resolución del endpoint
  // puede colar un tercero.
  const host = hostDeEndpoint(endpoint);
  if (!esHostOficialMIR(host) && !esMockDeEnsayo(host)) {
    throw new Error(`[Registro de viajeros] Endpoint no oficial: ${host || endpoint}`);
  }

  // El banco de homologación solo observa, pero exige por su cuenta el entorno
  // de pruebas: con MIR_HOMOLOGACION=1, un tenant en 'prod' no envía nada (la
  // homologación no puede colarse en producción por un error de entorno).
  if (process.env.MIR_HOMOLOGACION === '1' && entorno !== 'pre') {
    throw new Error(
      `[Registro de viajeros] MIR_HOMOLOGACION=1 exige entorno 'pre' y el tenant está en '${entorno}': no se envía nada.`
    );
  }

  return {
    config,
    endpoint,
    entorno,
    codigoArrendador: config.codigoArrendador,
    aplicacion: config.aplicacion,
    usuario: decrypt(config.usuarioEnc),
    password: decrypt(config.passwordEnc),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Cliente del servicio (HTTP Basic + SOAP)
// ────────────────────────────────────────────────────────────────────────────

export interface ResultadoEnvio {
  ok: boolean;
  httpStatus: number | null;
  respuesta: RespuestaMIR | null;
  error?: string;
}

/**
 * Envía una petición al servicio de comunicación.
 *
 * Autenticación: HTTP Basic con `usuario:contraseña` en Base64, tal como
 * describe el apartado 2.2 de la interfaz. El `SOAPAction` va vacío: la
 * especificación no define una acción concreta y SOAP 1.1 exige la cabecera.
 */
async function postComunicacion(
  cfg: { endpoint: string; usuario: string; password: string },
  cabecera: CabeceraMIR,
  xmlSolicitud: string
): Promise<ResultadoEnvio> {
  const sobre = construirSobreSoap(cabecera, empaquetarSolicitud(xmlSolicitud));
  const auth = Buffer.from(`${cfg.usuario}:${cfg.password}`, 'utf8').toString('base64');

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '""',
        Authorization: `Basic ${auth}`,
      },
      body: sobre,
      signal: controlador.signal,
    });

    const texto = await respuesta.text();
    return {
      ok: respuesta.ok,
      httpStatus: respuesta.status,
      respuesta: leerRespuestaMIR(texto),
    };
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : String(err);
    return { ok: false, httpStatus: null, respuesta: null, error: mensaje };
  } finally {
    clearTimeout(temporizador);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// De reserva a parte de viajeros (mapeo puro, testeable sin BD)
// ────────────────────────────────────────────────────────────────────────────

const textoDe = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
};

const primero = (fuente: Record<string, unknown>, claves: string[]): string => {
  for (const clave of claves) {
    const valor = textoDe(fuente[clave]);
    if (valor) return valor;
  }
  return '';
};

/**
 * Convierte un objeto de huésped en una persona del parte.
 *
 * Se acepta el formato estructurado que el módulo documenta
 * (`guestData.viajeros[i]`) y, como respaldo, los campos sueltos que ya
 * escriben el booking engine y los canales (`firstName`, `lastName`, `email`…).
 * Lo que no venga, se queda vacío y lo detecta la validación: no se rellena
 * con datos inventados.
 */
export function mapearPersonaMIR(crudo: Record<string, unknown>, rol = ROL_PERSONA.viajero): PersonaMIR {
  const direccionCruda = (crudo.direccion ?? crudo.address ?? null) as
    | Record<string, unknown>
    | string
    | null;

  let direccion: PersonaMIR['direccion'];
  if (direccionCruda && typeof direccionCruda === 'object') {
    direccion = {
      direccion: primero(direccionCruda, ['direccion', 'calle', 'linea', 'street']),
      direccionComplementaria:
        primero(direccionCruda, ['direccionComplementaria', 'complementaria', 'piso']) || null,
      codigoMunicipio: primero(direccionCruda, ['codigoMunicipio', 'codigoINE', 'municipioCodigo']) || null,
      nombreMunicipio: primero(direccionCruda, ['nombreMunicipio', 'municipio', 'ciudad', 'city']) || null,
      codigoPostal: primero(direccionCruda, ['codigoPostal', 'cp', 'postalCode', 'zip']),
      pais: primero(direccionCruda, ['pais', 'country']),
    };
  } else {
    direccion = {
      direccion: textoDe(direccionCruda) || primero(crudo, ['direccion', 'address']),
      codigoMunicipio: primero(crudo, ['codigoMunicipio', 'codigoINE']) || null,
      nombreMunicipio: primero(crudo, ['ciudad', 'municipio', 'city']) || null,
      codigoPostal: primero(crudo, ['codigoPostal', 'cp', 'zip']),
      pais: primero(crudo, ['pais', 'country']),
    };
  }

  return {
    rol,
    nombre: primero(crudo, ['nombre', 'nombres', 'firstName', 'name']),
    apellido1: primero(crudo, ['apellido1', 'primerApellido', 'lastName', 'apellidos']),
    apellido2: primero(crudo, ['apellido2', 'segundoApellido']) || null,
    tipoDocumento: primero(crudo, ['tipoDocumento', 'documentoTipo']) || null,
    numeroDocumento: primero(crudo, ['numeroDocumento', 'documento', 'nif', 'nie', 'dni']) || null,
    soporteDocumento: primero(crudo, ['soporteDocumento', 'soporte']) || null,
    fechaNacimiento: primero(crudo, ['fechaNacimiento', 'birthdate', 'birthDate', 'nacimiento']),
    nacionalidad: primero(crudo, ['nacionalidad', 'nationality']) || null,
    sexo: primero(crudo, ['sexo', 'genero', 'gender']) || null,
    direccion,
    telefono: primero(crudo, ['telefono', 'phone', 'telefono1']) || null,
    telefono2: primero(crudo, ['telefono2', 'phone2']) || null,
    correo: primero(crudo, ['correo', 'email', 'e-mail']) || null,
    parentesco: primero(crudo, ['parentesco', 'relacion']) || null,
  };
}

/**
 * Extrae las personas del parte a partir de `guestData`.
 *
 * `guestData.viajeros` (array) es el formato estructurado: lo escriben el
 * check-in online y el motor de reservas cuando recogen los documentos. Si no
 * está, se arma el titular con los datos de contacto que sí llegan del canal,
 * que casi siempre deja el parte incompleto — y eso es exactamente lo que hay
 * que mostrarle al operador para que lo complete.
 */
export function personasDesdeGuestData(guestData: unknown): PersonaMIR[] {
  if (!guestData || typeof guestData !== 'object') return [];
  const gd = guestData as Record<string, unknown>;

  const viajeros = gd.viajeros ?? gd.guests ?? gd.huespedes;
  if (Array.isArray(viajeros) && viajeros.length > 0) {
    return viajeros
      .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
      .map((v) => mapearPersonaMIR(v));
  }

  // Reservas antiguas o de canal: solo hay datos de contacto del titular.
  const titular: Record<string, unknown> = {
    nombre: gd.firstName ?? gd.nombre ?? gd.name,
    apellido1: gd.lastName ?? gd.apellidos ?? gd.apellido,
    apellido2: gd.apellido2,
    tipoDocumento: gd.tipoDocumento,
    numeroDocumento: gd.numeroDocumento ?? gd.documento,
    soporteDocumento: gd.soporteDocumento,
    fechaNacimiento: gd.fechaNacimiento,
    nacionalidad: gd.nacionalidad,
    sexo: gd.sexo,
    direccion: gd.direccion ?? gd.address,
    telefono: gd.phone ?? gd.telefono,
    correo: gd.email ?? gd.correo,
  };
  const tieneAlgo = Object.values(titular).some((v) => textoDe(v));
  return tieneAlgo ? [mapearPersonaMIR(titular)] : [];
}

export interface ReservaParaRegistro {
  id: string;
  externalBookingId: string;
  checkIn: Date;
  checkOut: Date;
  bookedOn: Date | null;
  fechaCreacion: Date;
  occupancyAdults: number;
  occupancyChildren: number;
  guestData: unknown;
  unitNombre?: string | null;
}

/**
 * Construye el parte de viajeros de una reserva (función pura).
 *
 * El `tipoPago` llega resuelto desde la configuración del tenant: es un código
 * del catálogo del Ministerio y no se deduce del método interno.
 */
export function construirParteDesdeReserva(input: {
  reserva: ReservaParaRegistro;
  personas: PersonaMIR[];
  timeZone: string;
  tipoPago: string | null;
  referencia?: string | null;
  fechaPago?: Date | null;
}): ParteViajerosMIR {
  const { reserva, personas, timeZone } = input;
  const personasFinales = personas.length > 0 ? personas : [];
  const internet: boolean | null = null;

  return {
    contrato: {
      referencia: (input.referencia || reserva.externalBookingId || reserva.id).slice(0, 50),
      fechaContrato: formatearFechaMIR(reserva.bookedOn ?? reserva.fechaCreacion, timeZone),
      fechaEntrada: formatearFechaHoraMIR(reserva.checkIn, timeZone),
      fechaSalida: formatearFechaHoraMIR(reserva.checkOut, timeZone),
      numPersonas: Math.max(
        1,
        personasFinales.length ||
          (reserva.occupancyAdults || 0) + (reserva.occupancyChildren || 0)
      ),
      // Si la reserva ocupa una unidad concreta, es una habitación/alojamiento.
      numHabitaciones: reserva.unitNombre ? 1 : null,
      internet,
      pago: {
        tipoPago: input.tipoPago ?? '',
        fechaPago: input.fechaPago ? formatearFechaMIR(input.fechaPago, timeZone) : null,
      },
    },
    personas: personasFinales,
  };
}

/** Resuelve el código de tipo de pago del catálogo para un método interno. */
export function resolverTipoPago(
  metodoInterno: string | null | undefined,
  config: { tipoPagoDefecto?: string | null; mapaTiposPago?: unknown } | null
): string | null {
  const mapa = (config?.mapaTiposPago as Record<string, string> | undefined) ?? {};
  const clave = textoDe(metodoInterno).toLowerCase();
  if (clave && mapa[clave]) return mapa[clave];
  return config?.tipoPagoDefecto || null;
}

/** Nombre del fichero XML que se envía como `xmlSolicitud` en la traza. */
function referenciaDeReserva(reserva: { externalBookingId: string; id: string }): string {
  return (reserva.externalBookingId || reserva.id).slice(0, 50);
}

// ────────────────────────────────────────────────────────────────────────────
// Alta: preparar, enviar y consultar
// ────────────────────────────────────────────────────────────────────────────

interface ContextoEnvio {
  tenantId: string;
  comunicacionId: string;
  codigoEstablecimiento: string | null;
  endpoint: string;
  codigoArrendador: string;
  aplicacion: string;
  xml: string;
  errores: ErrorValidacionMIR[];
  avisos: string[];
}

/**
 * Prepara (sin enviar) el parte de una reserva y construye su XML.
 * Devuelve los errores de validación para poder persistirlos tal cual.
 */
export async function prepararComunicacionDeReserva(
  tenantId: string,
  reservaId: string
): Promise<{ contexto: ContextoEnvio | null; motivo?: string }> {
  const cfg = await credencialesMIR(tenantId);
  if (!cfg) return { contexto: null, motivo: 'Tenant sin configuración activa del registro de viajeros' };

  const reserva = await prisma.hospitalityReservation.findFirst({
    where: { id: reservaId, tenantId },
    include: {
      property: { select: { id: true, nombre: true, timezone: true, codigoEstablecimientoMIR: true } },
      unit: { select: { nombre: true } },
      payments: { orderBy: { fechaCreacion: 'desc' }, take: 1 },
    },
  });
  if (!reserva) return { contexto: null, motivo: 'Reserva no encontrada' };

  return {
    contexto: construirContexto(cfg, reserva),
  };
}

/** Credenciales ya resueltas (endpoint + usuario + contraseña + arrendador). */
type CredencialesMIR = NonNullable<Awaited<ReturnType<typeof credencialesMIR>>>;

/** Reserva con lo que necesita el parte (propiedad, unidad y último pago). */
interface ReservaConRelaciones {
  id: string;
  tenantId: string;
  externalBookingId: string;
  checkIn: Date;
  checkOut: Date;
  bookedOn: Date | null;
  fechaCreacion: Date;
  occupancyAdults: number;
  occupancyChildren: number;
  guestData: unknown;
  property: { id: string; nombre: string; timezone: string; codigoEstablecimientoMIR: string | null } | null;
  unit: { nombre: string } | null;
  payments: Array<{ metodo: string; fechaPago: Date | null }>;
}

function construirContexto(cfg: CredencialesMIR, reserva: ReservaConRelaciones): ContextoEnvio {
  const timeZone = reserva.property?.timezone || 'UTC';
  const personas = personasDesdeGuestData(reserva.guestData);
  const metodoPago = reserva.payments?.[0]?.metodo ?? null;
  const tipoPago = resolverTipoPago(metodoPago, cfg.config);

  const parte = construirParteDesdeReserva({
    reserva: {
      id: reserva.id,
      externalBookingId: reserva.externalBookingId,
      checkIn: reserva.checkIn,
      checkOut: reserva.checkOut,
      bookedOn: reserva.bookedOn,
      fechaCreacion: reserva.fechaCreacion,
      occupancyAdults: reserva.occupancyAdults,
      occupancyChildren: reserva.occupancyChildren,
      guestData: reserva.guestData,
      unitNombre: reserva.unit?.nombre ?? null,
    },
    personas,
    timeZone,
    tipoPago,
    fechaPago: reserva.payments?.[0]?.fechaPago ?? null,
  });

  const codigoEstablecimiento = reserva.property?.codigoEstablecimientoMIR ?? null;
  const xml = construirXmlParteViajeros({
    codigoEstablecimiento: codigoEstablecimiento ?? '',
    partes: [parte],
  });

  const validacion = validarParteViajeros(parte);
  const errores = [...validacion.errores];

  // El código de establecimiento lo asigna el Ministerio al registrar el
  // inmueble: sin él el XSD no valida.
  if (!codigoEstablecimiento) {
    errores.unshift({
      campo: 'codigoEstablecimiento',
      mensaje:
        'La propiedad no tiene configurado su código de establecimiento del Ministerio',
      codigo: '10131',
    });
  }
  if (!tipoPago) {
    errores.push({
      campo: 'contrato.pago.tipoPago',
      mensaje:
        'No hay código de tipo de pago (catálogo TIPO_PAGO): configúralo en el registro de viajeros',
      codigo: '10131',
    });
  }

  return {
    tenantId: reserva.tenantId,
    comunicacionId: '',
    codigoEstablecimiento,
    endpoint: cfg.endpoint,
    codigoArrendador: cfg.codigoArrendador,
    aplicacion: cfg.aplicacion,
    xml,
    errores,
    avisos: validacion.avisos,
  };
}

/** Clave única de una comunicación: una por reserva, tipo y operación. */
type ClaveComunicacion = {
  tenantId: string;
  reservationId: string;
  tipoComunicacion: string;
  tipoOperacion: string;
};

/** Resultado de un envío, tal como lo devuelven los puntos de entrada. */
export interface ResultadoComunicacion {
  estado: string;
  codigo?: string | null;
  descripcion?: string | null;
  lote?: string | null;
  errores: ErrorValidacionMIR[];
  comunicacionId?: string;
}

/**
 * Guarda la traza de una comunicación que NO se envía porque le faltan datos.
 * Es el camino que evita inventar: la pantalla muestra exactamente qué falta.
 */
async function registrarDatosIncompletos(input: {
  clave: ClaveComunicacion;
  referencia: string;
  codigoEstablecimiento: string | null;
  xml: string;
  errores: ErrorValidacionMIR[];
  motivo: string;
}): Promise<string> {
  const fila = await prisma.hospitalityGuestRegistryCommunication.upsert({
    where: { tenantId_reservationId_tipoComunicacion_tipoOperacion: input.clave },
    create: {
      ...input.clave,
      estado: ESTADO_REGISTRO.datosIncompletos,
      referencia: input.referencia,
      codigoEstablecimiento: input.codigoEstablecimiento,
      errores: input.errores as unknown as Prisma.InputJsonValue,
      xmlSolicitud: input.xml,
      descripcion: input.motivo,
    },
    update: {
      estado: ESTADO_REGISTRO.datosIncompletos,
      errores: input.errores as unknown as Prisma.InputJsonValue,
      xmlSolicitud: input.xml,
      descripcion: input.motivo,
      codigoEstablecimiento: input.codigoEstablecimiento,
    },
  });
  return fila.id;
}

/**
 * Envía el XML al servicio oficial, guarda la traza del resultado y deja al día
 * el estado de la configuración. Es el núcleo común del parte de viajeros (PV)
 * y de la reserva de hospedaje (RH): lo único que cambia es el XML y el tipo.
 */
/**
 * Qué se guarda cuando el servicio no llegó a recibir la comunicación: el error
 * de red tal cual (para poder diagnosticarlo) o el estado HTTP con el que
 * contestó. Es lo que el panel del hotel enseña como motivo, así que tiene que
 * ser legible sin ser inventado.
 */
function motivoDeNoEntrega(resultado: ResultadoEnvio): string {
  const error = (resultado.error ?? '').trim();
  if (error) return `No se pudo entregar la comunicación: ${error}`;
  return `El servicio de Hospedajes no respondió (HTTP ${resultado.httpStatus ?? 'sin respuesta'})`;
}

async function enviarYRegistrar(input: {
  clave: ClaveComunicacion;
  cabecera: CabeceraMIR;
  endpoint: string;
  usuario: string;
  password: string;
  xml: string;
  referencia: string;
  codigoEstablecimiento: string | null;
  errores: ErrorValidacionMIR[];
}): Promise<ResultadoComunicacion> {
  const resultado = await postComunicacion(
    { endpoint: input.endpoint, usuario: input.usuario, password: input.password },
    input.cabecera,
    input.xml
  );

  const codigo = resultado.respuesta?.codigo ?? null;
  const correcto = esCodigoCorrectoMIR(codigo) && resultado.ok;
  // Sin respuesta legible NO hubo comunicación: el servicio no contestó (red,
  // timeout, o un HTTP de error sin cuerpo SOAP). Guardarlo como «rechazada»
  // sería poner en boca del Ministerio una decisión que nunca tomó: el hotel
  // leería «el Ministerio rechazó este parte» con los datos perfectos, y el
  // aviso le mandaría a revisar un formulario donde no hay nada que arreglar.
  // Un rechazo es que el servicio lo LEYÓ y no lo aceptó; esto es que no llegó.
  //
  // «Sin respuesta» no es solo que falte el objeto: un 503 en texto plano
  // también devuelve un objeto (con todos los campos vacíos), y por ahí se
  // colaba la caída del servicio como rechazo.
  const sinRespuesta = !correcto && !esRespuestaMIR(resultado.respuesta);
  const estado = correcto
    ? ESTADO_REGISTRO.enviada
    : sinRespuesta
      ? ESTADO_REGISTRO.error
      : ESTADO_REGISTRO.rechazada;
  const detalle = correcto
    ? resultado.respuesta?.descripcion ?? 'Ok'
    : sinRespuesta
      ? motivoDeNoEntrega(resultado)
      : resultado.respuesta?.descripcion ?? resultado.error ?? describirCodigoMIR(codigo);

  const fila = await prisma.hospitalityGuestRegistryCommunication.upsert({
    where: { tenantId_reservationId_tipoComunicacion_tipoOperacion: input.clave },
    create: {
      ...input.clave,
      estado,
      referencia: input.referencia,
      codigoEstablecimiento: input.codigoEstablecimiento,
      lote: resultado.respuesta?.lote ?? null,
      codigoRetorno: codigo,
      descripcion: String(detalle).slice(0, 500),
      intentos: 1,
      errores: correcto ? undefined : (input.errores as unknown as Prisma.InputJsonValue),
      xmlSolicitud: input.xml,
      fechaEnvio: new Date(),
      fechaRespuesta: new Date(),
    },
    update: {
      estado,
      lote: resultado.respuesta?.lote ?? null,
      codigoRetorno: codigo,
      descripcion: String(detalle).slice(0, 500),
      intentos: { increment: 1 },
      errores: correcto ? undefined : (input.errores as unknown as Prisma.InputJsonValue),
      xmlSolicitud: input.xml,
      fechaEnvio: new Date(),
      fechaRespuesta: new Date(),
      codigoEstablecimiento: input.codigoEstablecimiento,
    },
  });

  await prisma.hospitalityMirConfig
    .update({
      where: { tenantId: input.clave.tenantId },
      data: {
        ultimoEnvio: new Date(),
        ultimoError: correcto ? null : String(detalle).slice(0, 400),
      },
    })
    .catch(() => null);

  return {
    estado,
    codigo,
    descripcion: resultado.respuesta?.descripcion ?? null,
    lote: resultado.respuesta?.lote ?? null,
    errores: input.errores,
    comunicacionId: fila.id,
  };
}

/**
 * Envía (o reintenta) el parte de viajeros de una reserva.
 *
 * Idempotente a nivel de negocio:
 *  - Si ya hay una comunicación **aceptada**, no se reenvía (devuelve el estado
 *    actual).
 *  - Si hay una **en vuelo** (`enviada` con lote y dentro de la ventana),
 *    tampoco: lo que toca es consultar ese lote (paso 2 del cron), no emitir
 *    una segunda comunicación del mismo parte.
 *    Un `enviada` SIN lote (o con la ventana vencida) sí se reintenta: sin lote
 *    no hay nada que consultar y el plazo legal no admite esperas.
 *  - Un `datos_incompletos` o un `rechazada` se reintentan cuando los datos se
 *    corrigen.
 */
export async function enviarRegistroDeReserva(
  tenantId: string,
  reservaId: string
): Promise<{
  estado: string;
  codigo?: string | null;
  descripcion?: string | null;
  lote?: string | null;
  errores: ErrorValidacionMIR[];
  comunicacionId?: string;
}> {
  const preparado = await prepararComunicacionDeReserva(tenantId, reservaId);
  if (!preparado.contexto) {
    return { estado: ESTADO_REGISTRO.error, errores: [], descripcion: preparado.motivo ?? null };
  }
  const ctx = preparado.contexto;

  const reserva = await prisma.hospitalityReservation.findUnique({
    where: { id: reservaId },
    select: { id: true, externalBookingId: true, tenantId: true, propertyId: true },
  });
  if (!reserva) {
    return { estado: ESTADO_REGISTRO.error, errores: [], descripcion: 'Reserva no encontrada' };
  }

  const clave = {
    tenantId,
    reservationId: reserva.id,
    tipoComunicacion: TIPO_COMUNICACION.parteViajeros,
    tipoOperacion: TIPO_OPERACION.alta,
  };

  const existente = await prisma.hospitalityGuestRegistryCommunication.findUnique({
    where: { tenantId_reservationId_tipoComunicacion_tipoOperacion: clave },
  });
  if (existente?.estado === ESTADO_REGISTRO.aceptada) {
    return {
      estado: existente.estado,
      codigo: existente.codigoRetorno,
      descripcion: existente.descripcion,
      lote: existente.lote,
      errores: [],
      comunicacionId: existente.id,
    };
  }

  // En vuelo: ya se entregó al servicio y solo falta que el lote se resuelva.
  // Reenviar aquí crearía una SEGUNDA comunicación del mismo parte en el
  // Ministerio (dos registros del mismo huésped), así que se devuelve el estado
  // actual y lo que resuelve es la consulta del lote.
  if (existente?.estado === ESTADO_REGISTRO.enviada && enVuelo(existente, Date.now())) {
    return {
      estado: existente.estado,
      codigo: existente.codigoRetorno,
      descripcion: existente.descripcion,
      lote: existente.lote,
      errores: [],
      comunicacionId: existente.id,
    };
  }

  // Datos incompletos o inválidos: se guarda la traza y NO se llama al servicio.
  if (ctx.errores.length > 0) {
    const motivo = 'Faltan datos para cumplimentar el parte de viajeros';
    const comunicacionId = await registrarDatosIncompletos({
      clave,
      referencia: referenciaDeReserva(reserva),
      codigoEstablecimiento: ctx.codigoEstablecimiento,
      xml: ctx.xml,
      errores: ctx.errores,
      motivo,
    });
    return {
      estado: ESTADO_REGISTRO.datosIncompletos,
      errores: ctx.errores,
      descripcion: motivo,
      comunicacionId,
    };
  }

  const cabecera: CabeceraMIR = {
    codigoArrendador: ctx.codigoArrendador,
    aplicacion: ctx.aplicacion,
    tipoOperacion: TIPO_OPERACION.alta,
    tipoComunicacion: TIPO_COMUNICACION.parteViajeros,
  };
  const problemasCabecera = validarCabeceraMIR(cabecera);
  if (problemasCabecera.errores.length > 0) {
    return {
      estado: ESTADO_REGISTRO.error,
      errores: problemasCabecera.errores,
      descripcion: 'Cabecera incompleta',
      comunicacionId: existente?.id,
    };
  }

  const cfgCred = await credencialesMIR(tenantId);
  if (!cfgCred) {
    return { estado: ESTADO_REGISTRO.error, errores: [], descripcion: 'Sin credenciales' };
  }

  return enviarYRegistrar({
    clave,
    cabecera,
    endpoint: ctx.endpoint,
    usuario: cfgCred.usuario,
    password: cfgCred.password,
    xml: ctx.xml,
    referencia: referenciaDeReserva(reserva),
    codigoEstablecimiento: ctx.codigoEstablecimiento,
    errores: ctx.errores,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Reserva de hospedaje (RH) — al formalizar la reserva (RD 933/2021, art. 6.a)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Construye la reserva de hospedaje (RH) a partir de la reserva interna.
 *
 * El **titular del contrato** es la primera persona de la reserva (`TI`) y el
 * resto son viajeros (`VI`), que es como se comporta una reserva real. En una
 * reserva el documento NO es obligatorio (el huésped todavía no lo ha dado):
 * lo será en el parte de viajeros, al entrar al establecimiento.
 */
export function construirReservaDesdeReserva(input: {
  reserva: ReservaParaRegistro;
  personas: PersonaMIR[];
  timeZone: string;
  tipoPago: string | null;
  fechaPago?: Date | null;
  codigoEstablecimiento: string | null;
}): ReservaHospedajeMIR {
  const personasConRol = input.personas.map((persona, indice) => ({
    ...persona,
    rol: indice === 0 ? ROL_PERSONA.titular : ROL_PERSONA.viajero,
  }));

  const { contrato } = construirParteDesdeReserva({
    reserva: input.reserva,
    personas: personasConRol,
    timeZone: input.timeZone,
    tipoPago: input.tipoPago,
    fechaPago: input.fechaPago,
  });

  return {
    establecimiento: { codigo: input.codigoEstablecimiento },
    contrato,
    personas: personasConRol,
  };
}

/**
 * Envía (o reintenta) la comunicación de reserva de hospedaje de una reserva.
 *
 * **Compuerta del namespace**: mientras el namespace del XSD oficial de `RH` no
 * esté informado (ver `NS_ALTA_RESERVA`), esta función NO construye el XML ni
 * llama al servicio: devuelve `pendiente_xsd` con el motivo, y no deja fila en
 * la traza para no llenarla de ruido cada hora. En cuanto se copie el dato del
 * XSD, el mismo camino empieza a funcionar sin tocar nada más.
 */
export async function enviarReservaHospedaje(
  tenantId: string,
  reservaId: string
): Promise<ResultadoComunicacion> {
  if (!reservasHospedajeHabilitadas()) {
    return { estado: ESTADO_REGISTRO.pendienteXsd, errores: [], descripcion: MOTIVO_RH_SIN_NAMESPACE };
  }

  const cfg = await credencialesMIR(tenantId);
  if (!cfg) {
    return {
      estado: ESTADO_REGISTRO.error,
      errores: [],
      descripcion: 'Tenant sin configuración activa del registro de viajeros',
    };
  }

  const reserva = await prisma.hospitalityReservation.findFirst({
    where: { id: reservaId, tenantId },
    include: {
      property: { select: { id: true, nombre: true, timezone: true, codigoEstablecimientoMIR: true } },
      unit: { select: { nombre: true } },
      payments: { orderBy: { fechaCreacion: 'desc' }, take: 1 },
    },
  });
  if (!reserva) {
    return { estado: ESTADO_REGISTRO.error, errores: [], descripcion: 'Reserva no encontrada' };
  }

  const clave: ClaveComunicacion = {
    tenantId,
    reservationId: reserva.id,
    tipoComunicacion: TIPO_COMUNICACION.reservaHospedaje,
    tipoOperacion: TIPO_OPERACION.alta,
  };

  const existente = await prisma.hospitalityGuestRegistryCommunication.findUnique({
    where: { tenantId_reservationId_tipoComunicacion_tipoOperacion: clave },
  });
  if (existente?.estado === ESTADO_REGISTRO.aceptada || (existente && enVuelo(existente, Date.now()))) {
    return {
      estado: existente.estado,
      codigo: existente.codigoRetorno,
      descripcion: existente.descripcion,
      lote: existente.lote,
      errores: [],
      comunicacionId: existente.id,
    };
  }

  const timeZone = reserva.property?.timezone || 'UTC';
  const personas = personasDesdeGuestData(reserva.guestData);
  const metodoPago = reserva.payments?.[0]?.metodo ?? null;

  const reservaMIR = construirReservaDesdeReserva({
    reserva: {
      id: reserva.id,
      externalBookingId: reserva.externalBookingId,
      checkIn: reserva.checkIn,
      checkOut: reserva.checkOut,
      bookedOn: reserva.bookedOn,
      fechaCreacion: reserva.fechaCreacion,
      occupancyAdults: reserva.occupancyAdults,
      occupancyChildren: reserva.occupancyChildren,
      guestData: reserva.guestData,
      unitNombre: reserva.unit?.nombre ?? null,
    },
    personas,
    timeZone,
    tipoPago: resolverTipoPago(metodoPago, cfg.config),
    fechaPago: reserva.payments?.[0]?.fechaPago ?? null,
    codigoEstablecimiento: reserva.property?.codigoEstablecimientoMIR ?? null,
  });

  const validacion = validarReservaHospedaje(reservaMIR);
  const xml = construirXmlAltaReservaHospedaje({
    namespace: namespaceAltaReservaHospedaje(),
    reservas: [reservaMIR],
  });

  if (validacion.errores.length > 0) {
    const motivo = 'Faltan datos para comunicar la reserva de hospedaje';
    const comunicacionId = await registrarDatosIncompletos({
      clave,
      referencia: referenciaDeReserva(reserva),
      codigoEstablecimiento: reserva.property?.codigoEstablecimientoMIR ?? null,
      xml,
      errores: validacion.errores,
      motivo,
    });
    return {
      estado: ESTADO_REGISTRO.datosIncompletos,
      errores: validacion.errores,
      descripcion: motivo,
      comunicacionId,
    };
  }

  const cabecera: CabeceraMIR = {
    codigoArrendador: cfg.codigoArrendador,
    aplicacion: cfg.aplicacion,
    tipoOperacion: TIPO_OPERACION.alta,
    tipoComunicacion: TIPO_COMUNICACION.reservaHospedaje,
  };
  const problemasCabecera = validarCabeceraMIR(cabecera);
  if (problemasCabecera.errores.length > 0) {
    return {
      estado: ESTADO_REGISTRO.error,
      errores: problemasCabecera.errores,
      descripcion: 'Cabecera incompleta',
      comunicacionId: existente?.id,
    };
  }

  return enviarYRegistrar({
    clave,
    cabecera,
    endpoint: cfg.endpoint,
    usuario: cfg.usuario,
    password: cfg.password,
    xml,
    referencia: referenciaDeReserva(reserva),
    codigoEstablecimiento: reserva.property?.codigoEstablecimientoMIR ?? null,
    errores: validacion.errores,
  });
}

/**
 * Consulta los lotes enviados y resuelve su resultado real.
 *
 * Es la pieza que cierra el ciclo asíncrono: traduce el estado del lote
 * (1..6) al estado local y guarda el código de comunicación asignado, o el
 * error de validación que devolvió el Ministerio para ese parte.
 */
export async function consultarLotesPendientes(
  tenantId: string
): Promise<{ consultados: number; aceptadas: number; rechazadas: number; enProceso: number }> {
  const resultado = { consultados: 0, aceptadas: 0, rechazadas: 0, enProceso: 0 };
  const cfg = await credencialesMIR(tenantId);
  if (!cfg) return resultado;

  const pendientes = await prisma.hospitalityGuestRegistryCommunication.findMany({
    where: { tenantId, estado: ESTADO_REGISTRO.enviada, lote: { not: null } },
    orderBy: { fechaEnvio: 'asc' },
    take: 50,
  });
  if (pendientes.length === 0) return resultado;

  const cabecera: CabeceraMIR = {
    codigoArrendador: cfg.codigoArrendador,
    aplicacion: cfg.aplicacion,
    tipoOperacion: TIPO_OPERACION.consulta,
  };

  // La consulta admite varios lotes en una sola petición (Anexo II).
  const lotes = [...new Set(pendientes.map((p) => p.lote!).filter(Boolean))];
  const envio = await postComunicacion(
    { endpoint: cfg.endpoint, usuario: cfg.usuario, password: cfg.password },
    cabecera,
    construirXmlConsultaLotes(lotes)
  );
  resultado.consultados = lotes.length;

  if (!envio.respuesta || !esCodigoCorrectoMIR(envio.respuesta.codigo)) return resultado;

  for (const fila of pendientes) {
    const detalle = envio.respuesta.resultados.find((r) => r.lote === fila.lote);
    if (!detalle) continue;

    const estadoLote = detalle.codigoEstado;
    if (estadoLote === '1' || estadoLote === '6') {
      const creada = detalle.comunicaciones.find((c) => c.codigoComunicacion);
      const conError = detalle.comunicaciones.find((c) => c.error);
      const aceptada = estadoLote === '1' || (!conError && !!creada);
      await prisma.hospitalityGuestRegistryCommunication.update({
        where: { id: fila.id },
        data: {
          estado: aceptada ? ESTADO_REGISTRO.aceptada : ESTADO_REGISTRO.rechazada,
          codigoComunicacion: creada?.codigoComunicacion ?? fila.codigoComunicacion,
          descripcion: (conError?.error ?? detalle.descEstado ?? fila.descripcion)?.slice(0, 500) ?? null,
          errores: conError ? { tipoError: conError.tipoError, error: conError.error } : undefined,
          fechaRespuesta: new Date(),
        },
      });
      if (aceptada) resultado.aceptadas++;
      else resultado.rechazadas++;
    } else if (estadoLote === '2' || estadoLote === '3') {
      await prisma.hospitalityGuestRegistryCommunication.update({
        where: { id: fila.id },
        data: {
          estado: ESTADO_REGISTRO.rechazada,
          descripcion: detalle.descEstado?.slice(0, 500) ?? 'Lote rechazado',
          fechaRespuesta: new Date(),
        },
      });
      resultado.rechazadas++;
    } else {
      // 4 (en proceso) y 5 (pendiente): sigue esperando, sin tocar la fila.
      resultado.enProceso++;
    }
  }

  return resultado;
}

/**
 * Anula una comunicación ya registrada (cancelación de la reserva).
 * Se envía el código de comunicación en la operación `B`.
 */
export async function anularComunicacion(
  tenantId: string,
  comunicacionId: string
): Promise<{ ok: boolean; estado: string; descripcion?: string | null }> {
  const cfg = await credencialesMIR(tenantId);
  if (!cfg) return { ok: false, estado: ESTADO_REGISTRO.error, descripcion: 'Sin credenciales' };

  const fila = await prisma.hospitalityGuestRegistryCommunication.findFirst({
    where: { id: comunicacionId, tenantId },
  });
  if (!fila) return { ok: false, estado: ESTADO_REGISTRO.error, descripcion: 'Comunicación no encontrada' };
  if (!fila.codigoComunicacion) {
    return {
      ok: false,
      estado: fila.estado,
      descripcion: 'La comunicación todavía no tiene código asignado por el Ministerio',
    };
  }

  const cabecera: CabeceraMIR = {
    codigoArrendador: cfg.codigoArrendador,
    aplicacion: cfg.aplicacion,
    tipoOperacion: TIPO_OPERACION.anulacion,
  };
  const envio = await postComunicacion(
    { endpoint: cfg.endpoint, usuario: cfg.usuario, password: cfg.password },
    cabecera,
    construirXmlAnulacion([fila.codigoComunicacion])
  );

  const correcto = esCodigoCorrectoMIR(envio.respuesta?.codigo) && envio.ok;
  await prisma.hospitalityGuestRegistryCommunication.update({
    where: { id: fila.id },
    data: {
      estado: correcto ? ESTADO_REGISTRO.anulada : fila.estado,
      descripcion: correcto
        ? 'Anulada ante el Ministerio del Interior'
        : (envio.respuesta?.descripcion ?? envio.error ?? fila.descripcion)?.slice(0, 500) ?? null,
      fechaRespuesta: new Date(),
    },
  });

  return {
    ok: correcto,
    estado: correcto ? ESTADO_REGISTRO.anulada : fila.estado,
    descripcion: envio.respuesta?.descripcion ?? envio.error ?? null,
  };
}

/**
 * Partes que el barrido ya no reintenta, tal como los necesita el panel del
 * hotel: la referencia para reconocer la estancia, el intento en que se quedó y
 * —sobre todo— **qué corregir** (`rechazo`), porque el motivo del rechazo decide
 * si la salida es el formulario del huésped o la configuración del arrendador.
 */
export interface ParteSinReintentar {
  id: string;
  reservationId: string | null;
  referencia: string | null;
  /**
   * `rechazada` (el Ministerio lo leyó y no lo aceptó) o `error` (no llegó a
   * recibirlo). El panel lo enseña para no confundir las dos causas.
   */
  estado: string;
  /**
   * Por qué no se comunicó y qué hacer: rechazo del Ministerio (corregir el
   * dato) o no-entrega (reintentar). Módulo puro, para que la pantalla no
   * tenga que elegir entre los dos caminos por su cuenta.
   */
  diagnostico: DiagnosticoDeParte | null;
  intentos: number;
  /** Última edición de la traza: es cuando el barrido gastó el último intento. */
  fechaEdicion: Date;
}

/** Cuántos partes sin reintentar se enseñan en el panel (los más recientes). */
export const PARTES_SIN_REINTENTAR_EN_PANEL = 20;

/**
 * Estado agregado del registro de viajeros para la API y la UI: cuántas
 * comunicaciones hay en cada estado y qué propiedades no pueden enviar todavía.
 *
 * Incluye, además del conteo por estado, los partes que el producto ha dejado
 * de reintentar (`sinReintentar` + `partesSinReintentar`): son los que **no**
 * aparecen en ningún otro contador —«enviadas» no los cuenta y «rechazadas» los
 * mezcla con los que el barrido todavía insiste— y sin ellos el hotel no puede
 * saber que tiene estancias sin comunicar más que entrando reserva a reserva.
 */
export async function estadoRegistroViajeros(tenantId: string) {
  const [
    config,
    porEstado,
    propiedadesSinCodigo,
    ultimas,
    sinReintentarPorEstado,
    partesSinReintentar,
  ] = await Promise.all([
      getMirConfigPublica(tenantId),
      prisma.hospitalityGuestRegistryCommunication.groupBy({
        by: ['estado'],
        where: { tenantId },
        _count: true,
      }),
      prisma.hospitalityProperty.count({
        where: {
          tenantId,
          estado: { in: [...ESTADOS_PROPIEDAD_REGISTRO] },
          codigoEstablecimientoMIR: null,
        },
      }),
      prisma.hospitalityGuestRegistryCommunication.findMany({
        where: { tenantId },
        orderBy: { fechaEdicion: 'desc' },
        take: 25,
        select: {
          id: true,
          estado: true,
          referencia: true,
          lote: true,
          codigoComunicacion: true,
          codigoRetorno: true,
          descripcion: true,
          intentos: true,
          errores: true,
          fechaEnvio: true,
          reservationId: true,
        },
      }),
      // Los abandonados son un subconjunto de los estados que el barrido
      // intentó —rechazada y error— y no se pueden deducir del conteo por
      // estado: hace falta la consulta, con el mismo tope que usa el cron, para
      // que el panel y el barrido no discrepen. Se agrupa por estado para poder
      // decir las dos causas por separado (corregir el dato ≠ reintentar).
      prisma.hospitalityGuestRegistryCommunication.groupBy({
        by: ['estado'],
        where: {
          tenantId,
          estado: { in: [...ESTADOS_ABANDONABLES] },
          intentos: { gte: MAX_INTENTOS_PARTE },
        },
        _count: true,
      }),
      prisma.hospitalityGuestRegistryCommunication.findMany({
        where: {
          tenantId,
          estado: { in: [...ESTADOS_ABANDONABLES] },
          intentos: { gte: MAX_INTENTOS_PARTE },
        },
        orderBy: { fechaEdicion: 'desc' },
        take: PARTES_SIN_REINTENTAR_EN_PANEL,
        select: {
          id: true,
          reservationId: true,
          referencia: true,
          // El estado decide el diagnóstico (rechazo o no-entrega): no se le
          // pasa a mano al módulo puro, que lo interpretaría por su cuenta.
          estado: true,
          descripcion: true,
          codigoRetorno: true,
          errores: true,
          intentos: true,
          fechaEdicion: true,
        },
      }),
    ]);

  const conteo: Record<string, number> = {};
  for (const fila of porEstado) conteo[fila.estado] = fila._count;
  const total = Object.values(conteo).reduce((a, b) => a + b, 0);

  // Las métricas del panel salen del módulo puro (el mismo que usa Reportes con
  // su ventana): el hotel no puede leer dos tasas distintas de abandono según en
  // qué pantalla mire.
  const abandonadosDe = (estado: string) =>
    sinReintentarPorEstado.find((fila) => fila.estado === estado)?._count ?? 0;
  const abandonadosRechazados = abandonadosDe(ESTADO_REGISTRO.rechazada);
  const abandonadosSinEntregar = abandonadosDe(ESTADO_REGISTRO.error);
  const rechazadas = conteo[ESTADO_REGISTRO.rechazada] ?? 0;
  const sinEntregar = conteo[ESTADO_REGISTRO.error] ?? 0;
  const esperandoAlHuesped = conteo[ESTADO_REGISTRO.datosIncompletos] ?? 0;
  const aceptadas = conteo[ESTADO_REGISTRO.aceptada] ?? 0;
  const partes: MetricasPartesViajeros = resumirPartes({
    aceptadas,
    sinReintentarRechazados: abandonadosRechazados,
    sinReintentarSinEntregar: abandonadosSinEntregar,
    rechazadasEnCurso: rechazadas - abandonadosRechazados,
    sinEntregarEnCurso: sinEntregar - abandonadosSinEntregar,
    esperandoAlHuesped,
    otras: total - aceptadas - rechazadas - sinEntregar - esperandoAlHuesped,
  });

  const rhHabilitada = reservasHospedajeHabilitadas();
  return {
    config,
    conteo,
    total,
    propiedadesSinCodigo,
    ultimas,
    /** Nº de partes que el barrido ya no reintenta (rechazados + sin entregar). */
    sinReintentar: partes.sinReintentar,
    /** Los mismos, con su motivo, para que el panel los enseñe y los arregle. */
    partesSinReintentar: partesSinReintentar.map((fila) => ({
      id: fila.id,
      reservationId: fila.reservationId,
      referencia: fila.referencia,
      estado: fila.estado,
      diagnostico: diagnosticoDeComunicacion(fila),
      intentos: fila.intentos,
      fechaEdicion: fila.fechaEdicion,
    })),
    /** Resumen del ciclo del parte (módulo puro): aceptados frente a sin reintentar. */
    partes,
    // Estado del tipo que aún no se puede emitir: la pantalla lo explica en vez
    // de dejar creer que el producto ya cumple los dos momentos del RD.
    reservas: {
      habilitadas: rhHabilitada,
      motivo: rhHabilitada ? null : MOTIVO_RH_SIN_NAMESPACE,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// El parte de viajeros de una reserva, para las pantallas que la enseñan
// ────────────────────────────────────────────────────────────────────────────

/**
 * Estado del parte de viajeros de una reserva, como lo necesita la pantalla de
 * reservas para avisar de que al huésped le faltan datos.
 *
 * El «faltan» NO se deduce del estado de la traza: la traza solo existe cuando
 * el barrido ya miró la reserva (y el barrido no mira hasta que la estancia
 * empieza). Se calcula con las MISMAS reglas que el check-in del huésped y que
 * el validador del Ministerio (`resumenDocumentacion`), de modo que el aviso
 * sale desde el minuto en que entra la reserva — que es cuando el hotel todavía
 * puede pedirle los documentos al huésped, en vez de descubrirlo el día de la
 * llegada. Los nombres de campo son los del formulario del check-in, para que
 * las tres pantallas hablen de lo mismo.
 */
export interface ParteDeViajerosDeReserva {
  /** El parte corresponde a esta reserva: la estancia no se canceló ni fue un no-show. */
  aplica: boolean;
  /** Los datos del huésped alcanzan para emitir el parte. */
  completo: boolean;
  /**
   * Fichas de viajero guardadas (`guestData.viajeros`). Cero es un caso propio:
   * una reserva de canal o una del motor en la que el huésped no llegó a dejar
   * el documento. Entonces no hay campos que listar — falta la documentación
   * entera — y decirlo así es más útil que una lista de campos vacía.
   */
  viajeros: number;
  /** Campos que impiden emitirlo (ausentes o con formato que el Ministerio rechaza). */
  faltan: CampoViajero[];
  /** Campos que el Ministerio no exige pero pide en la práctica. */
  recomendados: CampoViajero[];
  /** Última comunicación conocida de la reserva (`null` si aún no hay ninguna). */
  estado: string | null;
  /** ¿Ya está aceptada por el Ministerio? Entonces no hay nada que completar. */
  comunicada: boolean;
  /** ¿La última comunicación fue un rechazo del servicio? */
  rechazado: boolean;
  /** Por qué se rechazó y qué hay que corregir (`null` si no hubo rechazo). */
  rechazo: RechazoDelParte | null;
  /**
   * ¿La última comunicación NO llegó al servicio? Es lo contrario de un
   * rechazo: el Ministerio no ha visto ese parte, así que no hay dato del
   * huésped que corregir — se reintenta. Va aparte de `rechazado` para que la
   * pantalla no diga «el Ministerio lo rechazó» de un envío que nunca llegó.
   */
  sinEntregar: boolean;
  /** Por qué no llegó y qué hacer (`null` si no hubo no-entrega). */
  fallo: FalloDeParte | null;
  /** Envíos intentados de esta comunicación. */
  intentos: number;
  /**
   * El barrido agotó sus intentos y ya no lo reintenta solo: sin nadie que lo
   * pulse o corrija el dato, ese parte se queda sin comunicar.
   */
  abandonado: boolean;
}

/**
 * Estado del parte de viajeros de varias reservas, en una sola consulta.
 *
 * Se hace en lote a propósito: la pantalla de reservas pinta una lista y
 * consultar la traza reserva por reserva sería una consulta por fila.
 */
export async function partesDeViajerosPorReserva(
  tenantId: string,
  reservas: Array<{ id: string; estado: string; checkIn: Date; guestData: unknown }>
): Promise<Map<string, ParteDeViajerosDeReserva>> {
  const estadoPorReserva = new Map<string, ParteDeViajerosDeReserva>();
  if (reservas.length === 0) return estadoPorReserva;

  // La última comunicación de cada reserva (por fecha de edición): es la que
  // manda, porque una reserva puede tener un alta rechazada y otra aceptada.
  const trazas = await prisma.hospitalityGuestRegistryCommunication.findMany({
    where: { tenantId, reservationId: { in: reservas.map((r) => r.id) } },
    orderBy: { fechaEdicion: 'desc' },
    select: {
      reservationId: true,
      estado: true,
      descripcion: true,
      codigoRetorno: true,
      errores: true,
      intentos: true,
    },
  });
  const ultimaDeLaReserva = new Map<string, (typeof trazas)[number]>();
  for (const traza of trazas) {
    if (traza.reservationId && !ultimaDeLaReserva.has(traza.reservationId)) {
      ultimaDeLaReserva.set(traza.reservationId, traza);
    }
  }

  for (const reserva of reservas) {
    const documentacion = resumenDocumentacion(
      viajerosDeGuestData(reserva.guestData),
      reserva.checkIn
    );
    const ultima = ultimaDeLaReserva.get(reserva.id) ?? null;
    const rechazo = rechazoDeComunicacion(ultima);
    const fallo = falloDeComunicacion(ultima);
    estadoPorReserva.set(reserva.id, {
      // Misma lista que el cron y el check-in online: un no-show o una cancelada
      // nunca entraron al establecimiento, así que no hay parte que emitir.
      aplica: (ESTADOS_ACTIVOS_REGISTRO as readonly string[]).includes(reserva.estado),
      completo: documentacion.completa,
      viajeros: documentacion.total,
      faltan: documentacion.faltan,
      recomendados: documentacion.recomendados,
      estado: ultima?.estado ?? null,
      comunicada: ultima?.estado === ESTADO_REGISTRO.aceptada,
      rechazado: rechazo !== null,
      rechazo,
      sinEntregar: fallo !== null,
      fallo,
      intentos: ultima?.intentos ?? 0,
      // El abandono cubre los dos desenlaces fallidos (rechazado y no entregado):
      // los dos agotan el tope y los dos dejan la estancia sin comunicar.
      abandonado: parteAbandonado(ultima),
    });
  }

  return estadoPorReserva;
}
