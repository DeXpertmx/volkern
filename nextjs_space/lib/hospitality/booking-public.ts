/**
 * Datos que consume la página pública de reserva.
 *
 * Existe para que la página y el widget embebible no armen el mismo objeto por su
 * cuenta: los dos enseñan lo mismo y tienen que enseñarlo igual. Aquí se decide
 * qué se publica y, sobre todo, qué **no** se publica (huéspedes, pagos de otras
 * reservas, identificadores de los canales y cualquier dato interno).
 */

import { prisma } from '@/lib/db';
import { resolverPaginaPublica, type PropiedadPublica } from './booking-engine';
import { estadoDeCobroDelTenant } from './booking-payments';
import { logoCorporativoTenant } from './booking-config';
import { catalogoPublico, type ExtraPublico, type ExtraCatalogo } from './booking-extras';
import {
  catalogoPublicoDeTarifas,
  type TarifaPublica,
  type TarifaCatalogo,
} from './booking-fees';
import { resumenPublicoResenas, type ResenaPublica } from './resenas';
import { IDIOMA_POR_DEFECTO, type Idioma } from './booking-i18n';
import {
  plantillaDeValor,
  personalizacionDeValor,
  type PlantillaBooking,
  type PersonalizacionBooking,
} from './booking-plantillas';

export interface ConfigPaginaPublica {
  titulo: string | null;
  descripcion: string | null;
  emailContacto: string | null;
  telefonoContacto: string | null;
  politicaCancelacion: string | null;
  anticipoPorcentaje: number;
  tarifaLimpieza: number | null;
  requierePagoOnline: boolean;
  /** Si hoy se puede cobrar online. La página no enseña un pago que no funciona. */
  pagoOnlineDisponible: boolean;
}

export interface ResumenResenasPublico {
  media: number | null;
  total: number;
  reseñas: ResenaPublica[];
}

/**
 * Propiedad publicada tal como la consumen la página y el asistente: la ficha
 * del motor más lo que se ofrece ALREDEDOR de la reserva —los extras que el
 * hotel vende (con su catálogo en el idioma del huésped) y la prueba social de
 * sus reseñas moderadas—.
 *
 * Los dos huecos vivían solo en la página antigua; al quedarse una única página
 * pública, viajan con la propiedad para que no se pierda nada al unificarlas.
 */
export interface PropiedadPublicaPagina extends PropiedadPublica {
  extras: ExtraPublico[];
  /**
   * Tarifas adicionales activas de la propiedad, en el idioma del huésped. Las
   * obligatorias ya van sumadas en el precio cotizado; las opcionales se
   * ofrecen en el asistente y solo se cobran si se marcan.
   */
  tarifas: TarifaPublica[];
  resenas: ResumenResenasPublico | null;
}

export interface DatosPaginaPublica {
  slug: string;
  alojamiento: string;
  moneda: string;
  config: ConfigPaginaPublica;
  propiedades: PropiedadPublicaPagina[];
  /** Plantilla visual elegida por el tenant (desconocido = clásica). */
  plantilla: PlantillaBooking;
  /** Colores/radios normalizados para inyectar como CSS custom properties. */
  personalizacion: PersonalizacionBooking;
  /** Logo corporativo del tenant (Configuración → Empresa); null = sin logo. */
  logo: string | null;
}

export type ResultadoDatosPagina =
  | { ok: true; datos: DatosPaginaPublica }
  | { ok: false; motivo: 'no_existe' | 'inactiva'; mensaje: string };

/**
 * Catálogo activo de extras de una propiedad, en el idioma del huésped.
 * Auxiliar: si falla, la página vende igual sin extras.
 */
async function extrasDePropiedad(propertyId: string, idioma: Idioma): Promise<ExtraPublico[]> {
  try {
    const extras = (await prisma.hospitalityExtra.findMany({
      where: { propertyId, activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    })) as unknown as ExtraCatalogo[];
    return catalogoPublico(extras, idioma);
  } catch (e) {
    console.error('[BookingEngine] No se pudo leer el catálogo de extras:', e);
    return [];
  }
}

/**
 * Catálogo activo de tarifas adicionales de una propiedad, en el idioma del
 * huésped. Auxiliar: si falla, la página vende sin tarifas opcionales (las
 * obligatorias viajan en la cotización, que las lee del mismo catálogo).
 */
async function tarifasDePropiedad(propertyId: string, idioma: Idioma): Promise<TarifaPublica[]> {
  try {
    const tarifas = (await prisma.hospitalityFee.findMany({
      where: { propertyId, activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    })) as unknown as TarifaCatalogo[];
    return catalogoPublicoDeTarifas(tarifas, idioma);
  } catch (e) {
    console.error('[BookingEngine] No se pudo leer el catálogo de tarifas:', e);
    return [];
  }
}

/**
 * Reseñas PUBLICADAS de una propiedad (solo lo moderado sale a la web), con su
 * media. Auxiliar: sin reseñas la página vende igual.
 */
async function resenasDePropiedad(propertyId: string): Promise<ResumenResenasPublico | null> {
  try {
    const publicadas = await prisma.hospitalityReview.findMany({
      where: { propertyId, estado: 'publicada' },
      select: {
        puntuacion: true,
        comentario: true,
        nombreHuesped: true,
        respuestaHotel: true,
        reservation: { select: { checkIn: true } },
      },
      take: 50,
    });
    return resumenPublicoResenas(publicadas);
  } catch (e) {
    console.error('[BookingEngine] No se pudieron leer las reseñas publicadas:', e);
    return null;
  }
}

export async function datosPaginaPublica(
  slug: string,
  idioma: Idioma = IDIOMA_POR_DEFECTO
): Promise<ResultadoDatosPagina> {
  const pagina = await resolverPaginaPublica(slug);
  if (!pagina.ok) return { ok: false, motivo: pagina.motivo, mensaje: pagina.mensaje };

  // Extras y reseñas viajan con cada propiedad publicada: el asistente ofrece
  // los unos y la página enseña las otras. Ninguna de las dos lecturas puede
  // tumbar la página (cada auxiliar cae a su vacío).
  const propiedades = await Promise.all(
    pagina.propiedades.map(async (propiedad) => ({
      ...propiedad,
      extras: await extrasDePropiedad(propiedad.id, idioma),
      tarifas: await tarifasDePropiedad(propiedad.id, idioma),
      resenas: await resenasDePropiedad(propiedad.id),
    }))
  );

  const cobro = await estadoDeCobroDelTenant(pagina.config.tenantId);
  // La marca de la cabecera es la del ERP: el logo corporativo del tenant.
  // Sin logo configurado, la página no enseña ninguno.
  const logo = await logoCorporativoTenant(pagina.config.tenantId);

  return {
    ok: true,
    datos: {
      slug,
      alojamiento: pagina.tenant.nombre,
      moneda: pagina.moneda,
      config: {
        titulo: pagina.config.titulo,
        descripcion: pagina.config.descripcion,
        emailContacto: pagina.config.emailContacto,
        telefonoContacto: pagina.config.telefonoContacto,
        politicaCancelacion: pagina.config.politicaCancelacion,
        anticipoPorcentaje: pagina.config.anticipoPorcentaje,
        tarifaLimpieza: pagina.config.tarifaLimpieza,
        requierePagoOnline: pagina.config.requierePagoOnline,
        pagoOnlineDisponible: cobro.disponible,
      },
      propiedades,
      plantilla: plantillaDeValor(pagina.config.plantilla),
      personalizacion: personalizacionDeValor(pagina.config.personalizacion),
      logo,
    },
  };
}
