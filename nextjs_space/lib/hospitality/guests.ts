/**
 * Huéspedes de Hospitality (plan maestro §20: CRM de huéspedes reutilizando el
 * CRM existente) — módulo puro, sin BD.
 *
 * La lista de huéspedes se construye agrupando las reservas por identidad:
 *   1. `contactId` cuando la reserva está vinculada a un Contact del CRM;
 *   2. email / teléfono / nombre de `guestData` cuando no hay contacto;
 *   3. una entrada por reserva cuando el huésped no dejó ningún dato.
 *
 * Reglas (las mismas que Finanzas y las analíticas, no una variante propia):
 *  - **Estancias, noches y gasto cuentan solo las reservas que produjeron**
 *    (`aportaProduccion`): una cancelada queda en el historial pero no suma ni
 *    estancia ni gasto — antes inflaba el total del huésped.
 *  - `ultimaEstancia` es la última llegada CONTADA: una cancelación futura no
 *    convierte al huésped en reciente.
 *  - El gasto es `amountAfterTax` de esas estancias, tal cual lo reporta el
 *    canal (la rentabilidad con comisiones y margen es cosa de Finanzas).
 */

import { nightsBetween } from './calendar';
import { aportaProduccion } from './estados';

export interface HuespedContacto {
  id: string;
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
}

export interface HuespedReservaInput {
  id: string;
  externalBookingId: string;
  channel: string;
  estado: string;
  checkIn: Date;
  checkOut: Date;
  amountAfterTax: number | null;
  currency: string;
  specialRequests?: string | null;
  contactId?: string | null;
  guestData?: unknown;
  contact?: HuespedContacto | null;
  property?: { id?: string; nombre: string | null } | null;
  unit?: { id?: string; nombre: string; codigo?: string | null } | null;
}

export interface HuespedReserva {
  id: string;
  externalBookingId: string;
  channel: string;
  estado: string;
  checkIn: Date;
  checkOut: Date;
  /** Noches de la reserva (informativas: también en las canceladas). */
  noches: number;
  /** Importe que reportó el canal; solo suma en los totales si produjo. */
  amountAfterTax: number | null;
  /** ¿Cuenta para los totales del huésped? (no cancelada, no no-show). */
  produjo: boolean;
  currency: string;
  specialRequests: string | null;
  propertyNombre: string | null;
  unitNombre: string | null;
}

export interface Huesped {
  /** Identidad usada para agrupar: `contact:<id>`, `email:<…>`, `phone:<…>`… */
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  contactId: string | null;
  /** Estancias que produjeron (sin canceladas ni no-shows). */
  totalEstancias: number;
  /** Noches de esas estancias. */
  totalNoches: number;
  /** Gasto de esas estancias. */
  totalGasto: number;
  /** Última llegada contada; null si el huésped solo tiene cancelaciones. */
  ultimaEstancia: Date | null;
  reservas: HuespedReserva[];
}

/** Identidad de un huésped: los datos de contacto mandan sobre guestData. */
function identidadDe(r: HuespedReservaInput): {
  key: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
} {
  const gd = (r.guestData || {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

  const gdNombre = [texto(gd.firstName), texto(gd.lastName)].filter(Boolean).join(' ') || texto(gd.nombre) || texto(gd.name);
  const gdEmail = texto(gd.email).toLowerCase();
  const gdPhone = texto(gd.phone) || texto(gd.telefono);

  const nombre = r.contact?.nombre || gdNombre || null;
  const email = (r.contact?.email || gdEmail || '').toLowerCase() || null;
  const telefono = r.contact?.telefono || gdPhone || null;

  let key: string;
  if (r.contactId) key = `contact:${r.contactId}`;
  else if (email) key = `email:${email}`;
  else if (telefono) key = `phone:${telefono}`;
  else if (nombre) key = `name:${nombre.toLowerCase()}`;
  else key = `anon:${r.id}`; // huésped sin datos: una entrada por reserva

  return { key, nombre, email, telefono };
}

/**
 * Agrupa reservas en huéspedes con su historial y sus totales.
 *
 * `q` filtra por nombre/email/teléfono; `order` ordena por nombre o por última
 * estancia (recientes primero); `limit` recorta la respuesta.
 */
export function agruparHuespedes(
  reservations: HuespedReservaInput[],
  opts: { q?: string; order?: 'nombre' | 'ultima'; limit?: number } = {}
): { guests: Huesped[]; total: number } {
  const q = (opts.q || '').trim().toLowerCase();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const order = opts.order === 'nombre' ? 'nombre' : 'ultima';

  const map = new Map<string, Huesped>();

  for (const r of reservations) {
    const { key, nombre, email, telefono } = identidadDe(r);

    if (q) {
      const haystack = [nombre, email, telefono].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) continue;
    }

    let guest = map.get(key);
    if (!guest) {
      guest = {
        id: key,
        nombre: nombre || 'Huésped sin datos',
        email: email || '',
        telefono: telefono || '',
        contactId: r.contactId || null,
        totalEstancias: 0,
        totalNoches: 0,
        totalGasto: 0,
        ultimaEstancia: null,
        reservas: [],
      };
      map.set(key, guest);
    }

    const noches = nightsBetween(r.checkIn, r.checkOut);
    const produjo = aportaProduccion(r.estado);
    if (produjo) {
      guest.totalEstancias += 1;
      guest.totalNoches += noches;
      guest.totalGasto += r.amountAfterTax || 0;
      if (!guest.ultimaEstancia || r.checkIn > guest.ultimaEstancia) {
        guest.ultimaEstancia = r.checkIn;
      }
    }

    guest.reservas.push({
      id: r.id,
      externalBookingId: r.externalBookingId,
      channel: r.channel,
      estado: r.estado,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      noches,
      amountAfterTax: r.amountAfterTax,
      produjo,
      currency: r.currency,
      specialRequests: r.specialRequests || null,
      propertyNombre: r.property?.nombre || null,
      unitNombre: r.unit?.nombre || null,
    });
  }

  const guests = Array.from(map.values());
  if (order === 'nombre') {
    guests.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  } else {
    guests.sort(
      (a, b) =>
        (b.ultimaEstancia ? b.ultimaEstancia.getTime() : 0) -
        (a.ultimaEstancia ? a.ultimaEstancia.getTime() : 0)
    );
  }

  const recortados = guests.slice(0, limit);
  return { guests: recortados, total: recortados.length };
}
