/**
 * Datos que consume la página pública de reserva.
 *
 * Existe para que la página y el widget embebible no armen el mismo objeto por su
 * cuenta: los dos enseñan lo mismo y tienen que enseñarlo igual. Aquí se decide
 * qué se publica y, sobre todo, qué **no** se publica (huéspedes, pagos de otras
 * reservas, identificadores de los canales y cualquier dato interno).
 */

import { resolverPaginaPublica, type PropiedadPublica } from './booking-engine';
import { estadoDeCobroDelTenant } from './booking-payments';
import {
  plantillaDeValor,
  personalizacionDeValor,
  logoDeValor,
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

export interface DatosPaginaPublica {
  slug: string;
  alojamiento: string;
  moneda: string;
  config: ConfigPaginaPublica;
  propiedades: PropiedadPublica[];
  /** Plantilla visual elegida por el tenant (desconocido = clásica). */
  plantilla: PlantillaBooking;
  /** Colores/radios normalizados para inyectar como CSS custom properties. */
  personalizacion: PersonalizacionBooking;
  /** Logo del hotel para la cabecera (normalizado; null = sin logo). */
  logo: string | null;
}

export type ResultadoDatosPagina =
  | { ok: true; datos: DatosPaginaPublica }
  | { ok: false; motivo: 'no_existe' | 'inactiva'; mensaje: string };

export async function datosPaginaPublica(slug: string): Promise<ResultadoDatosPagina> {
  const pagina = await resolverPaginaPublica(slug);
  if (!pagina.ok) return { ok: false, motivo: pagina.motivo, mensaje: pagina.mensaje };

  const cobro = await estadoDeCobroDelTenant(pagina.config.tenantId);

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
      propiedades: pagina.propiedades,
      plantilla: plantillaDeValor(pagina.config.plantilla),
      personalizacion: personalizacionDeValor(pagina.config.personalizacion),
      logo: logoDeValor(pagina.config.logo),
    },
  };
}
