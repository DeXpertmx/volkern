/**
 * Configuración del Booking Engine de Hospitality (FASE 3.D).
 *
 * Una fila por tenant (`hospitality_booking_config`). Aquí vive **solo la
 * política del canal directo**: qué propiedades se publican, la política de
 * cancelación, el anticipo, la tarifa de limpieza y con qué divisa se publican
 * los precios.
 *
 * Lo que deliberadamente NO vive aquí:
 * - **Disponibilidad.** Sale del Availability Engine, como para cualquier canal.
 * - **Reservas.** Se crean por el Reservation Engine (`booking-engine.ts`), no
 *   por un camino propio.
 * - **Divisa por defecto.** La configuración la guarda nula cuando nadie la ha
 *   elegido, y quien lee resuelve con `monedaEfectiva` (datos primero, moneda del
 *   tenant después). El valor por defecto del esquema no participa.
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  esPlantillaValida,
  normalizarPersonalizacion,
  normalizarDominio,
} from './booking-plantillas';
import { monedaEfectiva, monedaEscritura } from '@/lib/moneda';
import { TOP_LEVEL } from '@/lib/legacy-redirects';

export const SLUG_LARGO_MIN = 3;
export const SLUG_LARGO_MAX = 60;
export const ANTICIPO_MAX = 100;

export interface ConfigBooking {
  id: string;
  tenantId: string;
  slug: string;
  titulo: string | null;
  descripcion: string | null;
  emailContacto: string | null;
  telefonoContacto: string | null;
  /** Divisa publicada; nula = la del tenant. */
  moneda: string | null;
  politicaCancelacion: string | null;
  anticipoPorcentaje: number;
  tarifaLimpieza: number | null;
  requierePagoOnline: boolean;
  propiedadesPublicadas: string[];
  activo: boolean;
  /** Plantilla visual (módulo puro `booking-plantillas`); null = clásica. */
  plantilla?: string | null;
  /** Personalización (colores/radios); null = defaults del módulo puro. */
  personalizacion?: unknown;
  /** Dominio propio del tenant; null = sin dominio (solo volkern.app). */
  dominio?: string | null;
}

/**
 * Normaliza un texto a segmento de URL: minúsculas, sin acentos, sin signos y
 * con guiones simples.
 *
 * Se hace con `normalize('NFD')` en lugar de con una tabla de reemplazos para que
 * un nombre con acentos (`Alojamiento Sol y Playa`) dé un slug legible
 * (`alojamiento-sol-y-playa`) y no uno mutilado.
 */
export function normalizarSlug(valor: string): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_LARGO_MAX);
}

/** Slugs que no se pueden usar porque ya son una ruta de la aplicación. */
export function slugReservado(slug: string): boolean {
  return TOP_LEVEL.has(slug);
}

export type ValidacionSlug = { ok: true; slug: string } | { ok: false; error: string };

/**
 * Valida y normaliza el segmento público.
 *
 * Rechaza las palabras que ya son ruta top-level de la aplicación: un slug
 * `dashboard` no daría error hasta que el tenant publicara el enlace, y entonces
 * la página no estaría donde él cree.
 */
export function validarSlug(valor: string): ValidacionSlug {
  const slug = normalizarSlug(valor);
  if (slug.length < SLUG_LARGO_MIN) {
    return { ok: false, error: `La dirección tiene que tener al menos ${SLUG_LARGO_MIN} caracteres.` };
  }
  if (slugReservado(slug)) {
    return { ok: false, error: `«${slug}» está reservado por la aplicación: elige otra dirección.` };
  }
  return { ok: true, slug };
}

/** Anticipo como entero 0-100. Un valor fuera de rango se recorta, no se ignora. */
export function normalizarAnticipo(valor: unknown): number {
  const numero = Math.round(Number(valor));
  if (!Number.isFinite(numero) || numero <= 0) return 0;
  return Math.min(ANTICIPO_MAX, numero);
}

/** Tarifa de limpieza: nula o 0 significan lo mismo (no se cobra), y se guarda nula. */
export function normalizarTarifaLimpieza(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Math.round(numero * 100) / 100;
}

/**
 * Deja solo las propiedades que existen y son del tenant.
 *
 * La lista de publicadas es una decisión del tenant sobre sus propias
 * propiedades; un id ajeno o ya borrado no puede sobrevivir en ella, porque la
 * página pública las leería y publicaría datos de otra cuenta.
 */
export function propiedadesPublicables(
  idsSolicitados: string[],
  propiedadesDelTenant: Array<{ id: string }>
): string[] {
  const propias = new Set(propiedadesDelTenant.map((p) => p.id));
  return Array.from(new Set(idsSolicitados.filter((id) => propias.has(id))));
}

/** URL pública de la página de reserva del tenant. */
export function urlPublicaBooking(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, '')}/reservar/${slug}`;
}

/** URL del widget embebible (para la web del tenant). */
export function urlEmbedBooking(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, '')}/embed/reservar/${slug}`;
}

/** Fragmento de iframe que el tenant pega en su web. */
export function codigoEmbedBooking(appUrl: string, slug: string, titulo?: string | null): string {
  const etiqueta = (titulo || 'Reserva').replace(/"/g, '');
  return `<iframe src="${urlEmbedBooking(appUrl, slug)}" title="${etiqueta}" style="width:100%;min-height:720px;border:0" loading="lazy"></iframe>`;
}

/**
 * Lee la configuración del tenant, o null si nunca la abrió.
 */
export async function leerConfigBooking(tenantId: string): Promise<ConfigBooking | null> {
  const fila = await prisma.hospitalityBookingConfig.findUnique({ where: { tenantId } });
  return fila ? (fila as ConfigBooking) : null;
}

/** Configuración pública resuelta por slug (la usa la página de reserva). */
export async function leerConfigPorSlug(slug: string) {
  return prisma.hospitalityBookingConfig.findUnique({
    where: { slug: normalizarSlug(slug) },
    include: {
      tenant: { select: { id: true, nombre: true, moneda: true, subdomain: true } },
    },
  });
}

export interface EntradaConfigBooking {
  slug: string;
  titulo?: string | null;
  descripcion?: string | null;
  emailContacto?: string | null;
  telefonoContacto?: string | null;
  moneda?: string | null;
  politicaCancelacion?: string | null;
  anticipoPorcentaje?: unknown;
  tarifaLimpieza?: unknown;
  requierePagoOnline?: boolean;
  propiedadesPublicadas?: string[];
  activo?: boolean;
  /** Plantilla visual: valor del módulo puro o vacío = clásica. */
  plantilla?: unknown;
  /** Personalización (colores/radios): se normaliza al guardar. */
  personalizacion?: unknown;
  /** Dominio propio del tenant: vacío = quitar; se normaliza/valida. */
  dominio?: unknown;
  /** Dominio guardado actualmente (para saber si cambió y hay que reverificar). */
  dominioActual?: string | null;
}

/**
 * Guarda la configuración validando contra las propiedades reales del tenant.
 *
 * Devuelve el error en vez de lanzarlo: la ruta que la llama tiene que poder
 * responder con la causa exacta (slug reservado, propiedad ajena) en lugar de un
 * 500 genérico.
 */
export async function guardarConfigBooking(
  tenantId: string,
  monedaTenant: string | null | undefined,
  entrada: EntradaConfigBooking
): Promise<{ ok: true; config: ConfigBooking } | { ok: false; error: string }> {
  const slug = validarSlug(entrada.slug);
  if (!slug.ok) return { ok: false, error: slug.error };

  const propiedades = await prisma.hospitalityProperty.findMany({
    where: { tenantId },
    select: { id: true },
  });

  const publicadas = propiedadesPublicables(entrada.propiedadesPublicadas || [], propiedades);

  // La divisa publicada es una decisión del tenant; si no la elige, se guarda nula
  // y la página publica en la moneda del tenant. La del esquema no entra aquí.
  const moneda = entrada.moneda ? monedaEscritura(entrada.moneda, monedaTenant) : null;

  // Dominio propio: vacío = quitar (null); valor inválido = error legible.
  const dominioResultado = normalizarDominio(entrada.dominio);
  if (!dominioResultado.ok) return { ok: false, error: dominioResultado.error! };
  const dominioNormalizado = dominioResultado.dominio ?? null;

  // Convención del repo para los tres campos nuevos: AUSENTE en el body = sin
  // cambio (los PUT del onboarding no los mandan y no deben borrar lo guardado);
  // presente e inválido = neutro (clásica/defaults); dominio vacío = quitar.
  const plantillaValor =
    entrada.plantilla === undefined
      ? undefined
      : esPlantillaValida(entrada.plantilla)
        ? (entrada.plantilla as string)
        : null;
  const personalizacionValor =
    entrada.personalizacion === undefined ? undefined : normalizarPersonalizacion(entrada.personalizacion);
  const dominioValor = entrada.dominio === undefined ? undefined : dominioNormalizado;

  const datos = {
    slug: slug.slug,
    titulo: entrada.titulo?.trim() || null,
    descripcion: entrada.descripcion?.trim() || null,
    emailContacto: entrada.emailContacto?.trim() || null,
    telefonoContacto: entrada.telefonoContacto?.trim() || null,
    moneda,
    politicaCancelacion: entrada.politicaCancelacion?.trim() || null,
    anticipoPorcentaje: normalizarAnticipo(entrada.anticipoPorcentaje),
    tarifaLimpieza: normalizarTarifaLimpieza(entrada.tarifaLimpieza),
    requierePagoOnline: entrada.requierePagoOnline === true,
    propiedadesPublicadas: publicadas,
    activo: entrada.activo !== false,
  };

  try {
    const fila = await prisma.hospitalityBookingConfig.upsert({
      where: { tenantId },
      // Alta: los tres campos nuevos nacen en su neutro (clásica, sin
      // personalización —la página aplica defaults—, sin dominio propio).
      create: {
        tenantId,
        ...datos,
        plantilla: plantillaValor ?? null,
        personalizacion: personalizacionValor ?? Prisma.DbNull,
        dominio: dominioValor ?? null,
      },
      // Edición: undefined = no tocar; dominio cambiado ⇒ reverificar DNS.
      update: {
        ...datos,
        plantilla: plantillaValor,
        personalizacion: personalizacionValor === undefined ? undefined : personalizacionValor,
        ...(dominioValor !== undefined ? { dominio: dominioValor } : {}),
        ...(dominioValor !== undefined &&
        !(dominioValor !== null && dominioValor === (entrada.dominioActual ?? null))
          ? { dominioVerificado: false }
          : {}),
      },
    });
    return { ok: true, config: fila as ConfigBooking };
  } catch (e: unknown) {
    // La dirección pública es única en toda la plataforma: dos tenants no pueden
    // publicar el mismo enlace, y el choque tiene que leerse como tal.
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') {
      return { ok: false, error: 'Esa dirección ya está en uso: elige otra.' };
    }
    throw e;
  }
}

/**
 * Divisa con la que publica un tenant: la que eligió en su configuración y, si no
 * eligió ninguna, la de su cuenta. Nunca la del esquema.
 */
export function monedaPublicada(config: { moneda?: string | null }, monedaTenant?: string | null): string {
  return monedaEfectiva([config?.moneda], monedaTenant);
}
