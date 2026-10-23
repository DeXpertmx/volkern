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
import { getPublicUrl } from '@/lib/s3-public-url';
import {
  esPlantillaValida,
  normalizarPersonalizacion,
  normalizarDominio,
  logoDeValor,
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
  /**
   * Unidades que no salen en la página pública aunque su propiedad esté
   * publicada. Vacío = salen todas. Solo afecta al motor directo: no cambia la
   * disponibilidad ni lo que se empuja a los canales.
   */
  unidadesExcluidas?: string[];
  activo: boolean;
  /** Plantilla visual (módulo puro `booking-plantillas`); null = clásica. */
  plantilla?: string | null;
  /** Personalización (colores/radios); null = defaults del módulo puro. */
  personalizacion?: unknown;
  /** Dominio propio del tenant; null = sin dominio (solo volkern.app). */
  dominio?: string | null;
}

/**
 * El logo de la cabecera de la página pública es el **logo corporativo** del
 * tenant —el MISMO que Configuración → Empresa enseña en todo el ERP—, no un
 * campo propio del Booking Engine: una sola marca que se gestiona una sola vez.
 *
 * El valor vive en `Configuracion` (`clave = 'logo_corporativo'`) y puede ser
 * una URL pública o una clave de S3/R2 (el formato con que lo guarda la
 * pantalla de Empresa); una URL firmada caducaría delante del huésped, así que
 * la clave se convierte a URL pública con `getPublicUrl`.
 *
 * **Sin logo configurado (o con un valor que no sirve) devuelve null: la página
 * no enseña ninguno** — nunca la marca de Volkern por su cuenta. Auxiliar: si
 * la consulta falla, la página pública se sirve sin logo.
 */
export async function logoCorporativoTenant(tenantId: string): Promise<string | null> {
  try {
    const fila = await prisma.configuracion.findFirst({
      where: { tenantId, clave: 'logo_corporativo' },
      select: { valor: true },
    });
    if (!fila || typeof fila.valor !== 'string') return null;
    let valor = fila.valor.trim();
    // Alguna pantalla guarda el valor JSON-codificado: '"https://…"'. Lo
    // desenvuelvo antes de juzgar su forma.
    if (valor.startsWith('"') && valor.endsWith('"')) {
      try {
        valor = JSON.parse(valor);
      } catch {
        /* queda el crudo */
      }
    }
    valor = String(valor).trim();
    if (!valor) return null;
    // URL pública o ruta de la app pasan tal cual; lo demás solo es una clave
    // de S3/R2 si parece la ruta de una IMAGEN — tratar cualquier texto como
    // clave inventaría URLs a objetos que no existen (imagen rota delante del
    // huésped). Se convierte a URL pública directa, sin firma que caduque.
    const esRutaImagen = /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(valor);
    const url =
      /^https?:\/\//i.test(valor) || valor.startsWith('/') || !esRutaImagen
        ? valor
        : getPublicUrl(valor);
    return logoDeValor(url);
  } catch {
    return null;
  }
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

/**
 * Deja solo las unidades que existen y son del tenant.
 *
 * La exclusión es una decisión sobre las unidades propias: un id ajeno o ya
 * borrado no puede sobrevivir en la lista, porque la página pública la lee para
 * decidir qué enseña.
 */
export function unidadesExcluibles(
  idsSolicitados: string[],
  unidadesDelTenant: Array<{ id: string }>
): string[] {
  const propias = new Set(unidadesDelTenant.map((u) => u.id));
  return Array.from(new Set(idsSolicitados.filter((id) => propias.has(id))));
}

/**
 * Las URLs públicas del motor viven en un módulo puro (`booking-urls`) porque
 * las usa también el panel del hotel, que es de cliente: se reexportan para que
 * el resto del producto siga importándolas desde aquí, sin dos verdades.
 */
export { urlPublicaBooking, urlEmbedBooking, codigoEmbedBooking } from './booking-urls';

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
  /**
   * Unidades ocultas de la página pública: AUSENTE = sin cambio; presente = se
   * sanea contra las unidades reales del tenant (una lista vacía vuelve a
   * enseñarlas todas).
   */
  unidadesExcluidas?: string[];
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

  // Propiedades con sus unidades: la lista de publicadas se sanea contra las
  // primeras y la de excluidas contra las segundas, en una sola consulta.
  const propiedades = await prisma.hospitalityProperty.findMany({
    where: { tenantId },
    select: { id: true, units: { select: { id: true } } },
  });

  // AUSENTE en el body = sin cambio, igual que plantilla/personalización/dominio.
  // El panel guarda el aspecto sin mandar la lista: tomarla por vacía dejaba la
  // página pública sin una sola propiedad —y el motor, sin nada que enseñar—
  // cada vez que el hotel tocaba sus colores.
  const publicadas =
    entrada.propiedadesPublicadas === undefined
      ? undefined
      : propiedadesPublicables(entrada.propiedadesPublicadas, propiedades);

  // Unidades fuera de la web: mismo criterio que las propiedades — ausente =
  // sin cambio; presente se sanea contra las unidades reales del tenant.
  const excluidas =
    entrada.unidadesExcluidas === undefined
      ? undefined
      : unidadesExcluibles(
          entrada.unidadesExcluidas,
          propiedades.flatMap((p) => p.units ?? [])
        );

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

  // Cada campo entra SOLO si venía en el body: escribir el valor por defecto de
  // lo que nadie mandó convertía cada guardado en un borrado —título, políticas
  // y propiedades publicadas desaparecían al guardar los colores—. En el alta
  // los omitidos los pone el esquema (sus defaults), que es lo que deben ser.
  const datos = {
    slug: slug.slug,
    ...(entrada.titulo !== undefined ? { titulo: entrada.titulo?.trim() || null } : {}),
    ...(entrada.descripcion !== undefined ? { descripcion: entrada.descripcion?.trim() || null } : {}),
    ...(entrada.emailContacto !== undefined ? { emailContacto: entrada.emailContacto?.trim() || null } : {}),
    ...(entrada.telefonoContacto !== undefined
      ? { telefonoContacto: entrada.telefonoContacto?.trim() || null }
      : {}),
    ...(entrada.moneda !== undefined ? { moneda } : {}),
    ...(entrada.politicaCancelacion !== undefined
      ? { politicaCancelacion: entrada.politicaCancelacion?.trim() || null }
      : {}),
    ...(entrada.anticipoPorcentaje !== undefined
      ? { anticipoPorcentaje: normalizarAnticipo(entrada.anticipoPorcentaje) }
      : {}),
    ...(entrada.tarifaLimpieza !== undefined
      ? { tarifaLimpieza: normalizarTarifaLimpieza(entrada.tarifaLimpieza) }
      : {}),
    ...(entrada.requierePagoOnline !== undefined
      ? { requierePagoOnline: entrada.requierePagoOnline === true }
      : {}),
    ...(publicadas !== undefined ? { propiedadesPublicadas: publicadas } : {}),
    ...(excluidas !== undefined ? { unidadesExcluidas: excluidas } : {}),
    ...(entrada.activo !== undefined ? { activo: entrada.activo !== false } : {}),
  };

  try {
    const fila = await prisma.hospitalityBookingConfig.upsert({
      where: { tenantId },
      // Alta: los campos nuevos nacen en su neutro (clásica, sin
      // personalización —la página aplica defaults— y sin dominio propio).
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
