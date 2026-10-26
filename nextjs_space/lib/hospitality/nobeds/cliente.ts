/**
 * Cliente HTTP de NOBEDS: lectura de estado, catálogo, disponibilidad y
 * reservas. Token **por propiedad** en la ruta (`/api/{Recurso}/{token}`), que
 * es como funciona su API; no hay Basic Auth ni OAuth.
 *
 * Lo que este cliente hace y lo que no:
 *
 * - Hace **solo GET**. La escritura (reservas, cierres, bulk) queda para F2: no
 *   se puede probar contra el token de demostración —toda escritura devuelve
 *   **500 con HTML de ASP.NET**— y su atomicidad está sin confirmar. Programar
 *   una escritura a ciegas es justo lo que produjo el overbooking que se quiere
 *   dejar atrás.
 * - **Nunca** registra el token: los errores llevan la URL saneada. El token
 *   viaja en la ruta, así que también aparece en logs de terceros; tratarlo como
 *   secreto es responsabilidad del llamador (cifrado en reposo y rotación).
 * - Un **404 al leer significa token**, no «no existe» (medido). Por eso se
 *   clasifica como error de credencial y no como catálogo vacío.
 * - Un **500 con HTML** se clasifica como error del servidor con la marca de que
 *   la respuesta no era JSON, en vez de intentar leerla.
 *
 * Contrato y preguntas abiertas: `docs/hospitality-nobeds-conectividad.md` §4.
 */

import { canalDeReferral, normalizarEstadoReserva } from './mapa';
import type {
  EstadoHotelNobeds,
  NocheNobeds,
  OpcionesClienteNobeds,
  RangoFechasNobeds,
  RentalEstadoNobeds,
  RentalNobeds,
  ReservaNobeds,
} from './tipos';

/** Clave del proveedor en `ConnectivityMapping.provider`. */
export const NOBEDS_PROVIDER_KEY = 'nobeds';

export const NOBEDS_BASE_URL_POR_DEFECTO = 'https://api.nobeds.com';

const TIMEOUT_POR_DEFECTO_MS = 15_000;

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export type TipoErrorNobeds =
  /** 404 al leer: credencial de la propiedad, no «no existe». */
  | 'token'
  /** 4xx de validación (400 con `errors`). */
  | 'peticion'
  /** 5xx, incluido el 500 HTML que devuelven sus escrituras. */
  | 'servidor'
  /** Se agotó el tiempo de espera. */
  | 'tiempo'
  /** Fallo de red/DNS/TLS. */
  | 'red'
  /** 2xx que no es el JSON esperado. */
  | 'respuesta';

export class ErrorNobeds extends Error {
  readonly tipo: TipoErrorNobeds;
  readonly httpStatus?: number;
  /** URL con el token sustituido; segura para logs y para mostrar. */
  readonly urlSaneada?: string;

  constructor(
    tipo: TipoErrorNobeds,
    mensaje: string,
    extra: { httpStatus?: number; urlSaneada?: string } = {}
  ) {
    super(mensaje);
    this.name = 'ErrorNobeds';
    this.tipo = tipo;
    this.httpStatus = extra.httpStatus;
    this.urlSaneada = extra.urlSaneada;
  }
}

// ─── Ayudas de lectura del cable ──────────────────────────────────────────

function comoRegistro(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function comoArray(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

/** Texto limpio, o `null`. Los ids numéricos se convierten a texto. */
function texto(valor: unknown): string | null {
  if (typeof valor === 'string') {
    const limpio = valor.trim();
    return limpio === '' ? null : limpio;
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  return null;
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** `2026-10-26T00:00:00` y `...Z` → `2026-10-26`. Sin fecha válida, `null`. */
function soloFecha(valor: unknown): string | null {
  const crudo = texto(valor);
  if (!crudo) return null;
  const diez = crudo.slice(0, 10);
  return FORMATO_FECHA.test(diez) ? diez : null;
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function validarRango(rango: RangoFechasNobeds): void {
  if (!FORMATO_FECHA.test(rango.desde) || !FORMATO_FECHA.test(rango.hasta)) {
    throw new ErrorNobeds('peticion', 'Las fechas deben tener el formato YYYY-MM-DD');
  }
  if (rango.desde > rango.hasta) {
    throw new ErrorNobeds(
      'peticion',
      `Rango de fechas invertido: ${rango.desde} > ${rango.hasta}`
    );
  }
}

// ─── Normalización de cada recurso ────────────────────────────────────────

function normalizarRentalEstado(fila: unknown): RentalEstadoNobeds {
  const r = comoRegistro(fila);
  const integraciones = comoRegistro(r.integrations);
  const normalizadas: Record<string, string> = {};
  for (const [canal, estado] of Object.entries(integraciones)) {
    const valor = texto(estado);
    if (valor) normalizadas[canal] = valor;
  }
  return {
    roomId: numero(r.roomId) ?? numero(r.room_id) ?? 0,
    titulo: texto(r.title) ?? '',
    activo: r.active === true || r.active === 1,
    integraciones: normalizadas,
  };
}

function normalizarRental(fila: unknown): RentalNobeds {
  const r = comoRegistro(fila);
  const imagenes = (texto(r.images) ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  const idsCanal: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(r)) {
    if (!/_(room|rate|listing|hotel)_id$/.test(clave)) continue;
    const v = texto(valor);
    if (v) idsCanal[clave] = v;
  }

  return {
    roomId: numero(r.room_id) ?? numero(r.roomId) ?? 0,
    titulo: texto(r.title) ?? '',
    activo: r.active === true || r.active === 1,
    tipo: texto(r.type),
    subtipo: texto(r.subtype),
    estrellas: numero(r.stars),
    adultos: numero(r.guests) ?? 0,
    ninos: numero(r.children) ?? 0,
    moneda: texto(r.currencycode),
    horaCheckIn: numero(r.checkin_time),
    horaCheckOut: numero(r.checkout_time),
    imagenes,
    idsCanal,
  };
}

/**
 * `closed` llega como `null` cuando la noche está abierta. Se trata como
 * booleano solo con `true`/`1`/`"true"`: un `0` de cantidad ya significa cerrado
 * por su cuenta (`quantity: 0` = cerrado).
 */
function bandera(valor: unknown): boolean {
  return valor === true || valor === 1 || valor === 'true' || valor === '1';
}

function normalizarNoche(fila: unknown): NocheNobeds {
  const r = comoRegistro(fila);
  return {
    rid: numero(r.rid) ?? 0,
    roomId: numero(r.room_id) ?? 0,
    fecha: soloFecha(r.date) ?? '',
    precio: numero(r.price),
    cantidad: numero(r.quantity),
    cerrado: bandera(r.closed) || numero(r.quantity) === 0,
    coa: bandera(r.coa),
    cod: bandera(r.cod),
    minStay: numero(r.min_stay),
    maxStay: numero(r.max_stay),
    antelacionMinima: numero(r.mah),
    actualizado: texto(r.updated),
    comentario: texto(r.comment),
  };
}

function normalizarReserva(fila: unknown): ReservaNobeds {
  const r = comoRegistro(fila);
  const estadoCrudo = texto(r.status) ?? '';
  const estado = normalizarEstadoReserva(estadoCrudo);
  const canal = canalDeReferral(texto(r.referral));
  const checkIn = soloFecha(r.checkin) ?? '';
  const checkOut = soloFecha(r.checkout) ?? '';
  const noches = numero(r.nights) ?? diasEntre(checkIn, checkOut);

  return {
    orderId: texto(r.order_id) ?? '',
    roomId: numero(r.room_id),
    canal: canal.canal,
    canalCrudo: canal.crudo,
    referenciaCanal: texto(r.referral_order_id),
    checkIn,
    checkOut,
    noches,
    nombre: texto(r.name) ?? '',
    email: texto(r.email),
    telefono: texto(r.phone),
    pais: texto(r.country),
    adultos: numero(r.guests) ?? 0,
    ninos: numero(r.childrens) ?? 0,
    bebes: numero(r.infants) ?? 0,
    precioNoche: numero(r.price),
    total: numero(r.total),
    estadoCrudo,
    estado: estado.estado,
    familiaEstado: estado.familia,
    requiereRevision: estado.requiereRevision,
    descripcionEstado: describirEstado(estado),
    canceladaEn: texto(r.canceled),
    creadaEn: texto(r.created),
    actualizadaEn: texto(r.updated),
    comentario: texto(r.comment),
  };
}

function describirEstado(estado: ReturnType<typeof normalizarEstadoReserva>): string {
  if (!estado.conocido) return 'Estado no reconocido';
  if (estado.familia === 'cobro') return 'Estado de cobro (no cambia la reserva)';
  if (estado.familia === 'operacion') return 'Estado de operación (no afecta disponibilidad)';
  if (estado.estado === null) return 'Estado sin efecto sobre la reserva';
  return estado.estado;
}

// ─── Cliente ──────────────────────────────────────────────────────────────

export interface ClienteNobeds {
  /** `GET /api/Status` — salud, suscripción y estado por canal. */
  estado: () => Promise<EstadoHotelNobeds>;
  /** `GET /api/Rentals` — catálogo rico (capacidad, subtipo, ids por canal). */
  rentals: () => Promise<RentalNobeds[]>;
  /** `GET /api/Availability` — noches y restricciones. */
  disponibilidad: (entrada: { roomId?: number } & RangoFechasNobeds) => Promise<NocheNobeds[]>;
  /** `GET /api/Bookings` — filtra por fecha de **check-in**. */
  reservas: (rango: RangoFechasNobeds) => Promise<ReservaNobeds[]>;
}

export function crearClienteNobeds(opciones: OpcionesClienteNobeds): ClienteNobeds {
  const token = (opciones.token ?? '').trim();
  if (!token) {
    throw new ErrorNobeds('token', 'Falta el token de la propiedad');
  }

  const base = (opciones.baseUrl ?? NOBEDS_BASE_URL_POR_DEFECTO).replace(/\/+$/, '');
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS;
  const hacerFetch: typeof fetch = opciones.fetchImpl ?? fetch;

  /** Quita el token de cualquier texto que vaya a un log o a un mensaje. */
  function sanear(cadena: string): string {
    return cadena
      .split(token)
      .join('•••')
      .split(encodeURIComponent(token))
      .join('•••');
  }

  function construirUrl(recurso: string, params?: Record<string, string | number>): string {
    const url = new URL(`${base}/api/${recurso}/${encodeURIComponent(token)}`);
    for (const [clave, valor] of Object.entries(params ?? {})) {
      if (valor === undefined || valor === null || valor === '') continue;
      url.searchParams.set(clave, String(valor));
    }
    return url.toString();
  }

  function descripcionDeError(cuerpo: string): { detalle: string; html: boolean } {
    const html = /^\s*<(!doctype|html)/i.test(cuerpo);
    if (!cuerpo.trim()) return { detalle: 'respuesta vacía', html };
    if (html) return { detalle: 'respuesta HTML en vez de JSON', html };

    try {
      const json = JSON.parse(cuerpo) as unknown;
      const r = comoRegistro(json);
      const partes = [texto(r.title), texto(r.message), texto(r.detail)].filter(Boolean);
      const errores = comoRegistro(r.errors);
      for (const [campo, lista] of Object.entries(errores)) {
        const valores = comoArray(lista)
          .map((v) => texto(v))
          .filter((v): v is string => Boolean(v));
        if (valores.length) partes.push(`${campo}: ${valores.join(', ')}`);
      }
      return { detalle: partes.length ? partes.join(' — ') : 'sin detalle', html };
    } catch {
      return { detalle: cuerpo.slice(0, 200), html };
    }
  }

  async function pedir(
    recurso: string,
    params?: Record<string, string | number>
  ): Promise<unknown> {
    const url = construirUrl(recurso, params);
    const urlSaneada = sanear(url);

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutMs);

    let res: Response;
    try {
      res = await hacerFetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: control.signal,
        cache: 'no-store',
      });
    } catch (e: unknown) {
      const mensaje = e instanceof Error ? e.message : 'error desconocido';
      const abortado =
        e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
      throw new ErrorNobeds(
        abortado ? 'tiempo' : 'red',
        sanear(
          abortado
            ? `Sin respuesta de la conectividad en ${timeoutMs} ms`
            : `Error de red: ${mensaje}`
        ),
        { urlSaneada }
      );
    } finally {
      clearTimeout(temporizador);
    }

    let cuerpo = '';
    try {
      cuerpo = await res.text();
    } catch {
      cuerpo = '';
    }

    if (!res.ok) {
      const { detalle, html } = descripcionDeError(cuerpo);
      const httpStatus = res.status;

      if (httpStatus === 404) {
        // Medido: un 404 al leer es token inválido, no un recurso inexistente.
        throw new ErrorNobeds(
          'token',
          sanear(
            'La conectividad respondió 404: el token de la propiedad no es válido o fue rotado'
          ),
          { httpStatus, urlSaneada }
        );
      }

      if (httpStatus >= 500) {
        throw new ErrorNobeds(
          'servidor',
          sanear(
            `La conectividad respondió ${httpStatus}${html ? ' con HTML' : ''}: ${detalle}`
          ),
          { httpStatus, urlSaneada }
        );
      }

      throw new ErrorNobeds('peticion', sanear(`Petición rechazada (${httpStatus}): ${detalle}`), {
        httpStatus,
        urlSaneada,
      });
    }

    if (!cuerpo.trim()) return null;

    try {
      return JSON.parse(cuerpo) as unknown;
    } catch {
      const { detalle } = descripcionDeError(cuerpo);
      throw new ErrorNobeds(
        'respuesta',
        sanear(`La respuesta no es JSON (${detalle})`),
        { httpStatus: res.status, urlSaneada }
      );
    }
  }

  return {
    async estado() {
      const bruto = comoRegistro(await pedir('Status'));
      return {
        hotel: texto(bruto.hotelName),
        suscripcionHasta: texto(bruto.subscriptionTill),
        activo: bruto.isActive === true,
        horaServidor: texto(bruto.serverTime),
        rentalsCount: numero(bruto.rentalsCount),
        rentals: comoArray(bruto.rentals).map(normalizarRentalEstado),
      };
    },

    async rentals() {
      const bruto = await pedir('Rentals');
      return comoArray(bruto).map(normalizarRental);
    },

    async disponibilidad(entrada) {
      validarRango(entrada);
      const bruto = await pedir('Availability', {
        room_id: entrada.roomId ?? '',
        fromdate: entrada.desde,
        todate: entrada.hasta,
      });
      return comoArray(bruto)
        .map(normalizarNoche)
        .filter((noche) => noche.fecha !== '');
    },

    async reservas(rango) {
      validarRango(rango);
      const bruto = await pedir('Bookings', {
        fromdate: rango.desde,
        todate: rango.hasta,
      });
      return comoArray(bruto)
        .map(normalizarReserva)
        .filter((reserva) => reserva.orderId !== '');
    },
  };
}
