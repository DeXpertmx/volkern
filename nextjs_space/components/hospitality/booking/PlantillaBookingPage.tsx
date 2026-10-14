'use client';

/**
 * Las 4 plantillas visuales del Booking Engine (elegidas en el panel y guardadas
 * en `hospitality_booking_config.plantilla`). Las cuatro montan el MISMO
 * BookingWizard —el motor de reserva es uno—: cambia el marco, no el motor.
 *
 * La personalización viaja como CSS custom properties (`--booking-*`) que el
 * wizard ya consume para botón, tarjeta y texto; lo inválido ya cayó a defaults
 * en el servidor.
 *
 * Las fotos publicadas del alojamiento también cambian con la plantilla, igual
 * que el marco: la clásica las enseña en la galería de arriba (lo que promete su
 * descripción), la moderna en su cabecera y la minimal no las pinta —es su
 * promesa—. Sin fotos publicadas no se pinta galería: el hueco lo cubre el marco
 * de relleno de `GaleriaPropiedad`, nunca una imagen rota.
 */

import type { ReactNode } from 'react';
import { GaleriaPropiedad } from './FichaPropiedad';
import type { Idioma } from '@/lib/hospitality/booking-i18n';
import type { PlantillaBooking, PersonalizacionBooking } from '@/lib/hospitality/booking-plantillas';

export interface DatosPlantilla {
  plantilla: PlantillaBooking;
  personalizacion: PersonalizacionBooking;
  /** Idioma de la página: lo usa la galería (avisos, visor, textos). */
  idioma: Idioma;
  /** Logo del hotel (URL pública normalizada); null = cabecera sin logo. */
  logo: string | null;
  /** Título de la página (config.titulo) o el nombre del alojamiento. */
  titulo: string;
  descripcion: string | null;
  ciudad: string | null;
  /**
   * Fotos publicadas, con la portada delante. La galería las enseña arriba
   * (clásica) y la moderna usa la primera como cabecera.
   */
  fotos: string[];
  /** Foto destacada (la portada publicada; null = sin fotos). */
  fotoPortada: string | null;
  tarifaDesde: number | null;
  /** Moneda ya formateada en el servidor: la página no calcula dinero. */
  tarifaDesdeTexto: string | null;
  capacidadMaxima: number | null;
}

/**
 * Marca personalizada: colores y radios como variables CSS sobre el contenedor.
 * Los componentes de shadcn usan `--primary`/`--background`; mapearlas aquí
 * pinta botones y tarjetas sin tocar el tema global del resto de la app.
 */
export function EnvolturaPlantilla({
  personalizacion,
  children,
}: {
  personalizacion: PersonalizacionBooking;
  children: ReactNode;
}) {
  return (
    <div
      style={
        {
          '--booking-primario': personalizacion.colorPrimario,
          '--booking-fondo': personalizacion.colorFondo,
          '--booking-texto': personalizacion.colorTexto,
          '--booking-radio': personalizacion.radioTarjeta,
          // Puente al tema de los componentes (botón/tarjeta heredan el color).
          '--primary': personalizacion.colorPrimario,
          '--primary-foreground': '#ffffff',
          '--radius': personalizacion.radioTarjeta,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

/**
 * Logo del hotel para la cabecera de la página pública. Solo con URL válida:
 * la imagen rota se queda en el panel, nunca delante del huésped (el módulo puro
 * ya normalizó el valor; aquí la nulidad se traduce en "no pintar nada").
 */
function LogoHotel({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="mx-auto mb-3 max-h-20 w-auto max-w-[220px] object-contain"
      loading="eager"
    />
  );
}

/** Cabecera compartida: título, ciudad, capacidad y «desde» si hay tarifa. */
function Cabecera({ d }: { d: DatosPlantilla }) {
  return (
    <header className="text-center">
      {d.logo ? <LogoHotel src={d.logo} alt={d.titulo} /> : null}
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: 'var(--booking-texto)' }}>
        {d.titulo}
      </h1>
      {d.descripcion ? (
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{d.descripcion}</p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {d.ciudad ? <span>{d.ciudad}</span> : null}
        {d.ciudad && d.capacidadMaxima ? <span> · </span> : null}
        {d.capacidadMaxima ? <span>Hasta {d.capacidadMaxima} huéspedes</span> : null}
        {d.tarifaDesdeTexto ? (
          <>
            {(d.ciudad || d.capacidadMaxima) && <span> · </span>}
            <span className="font-medium text-foreground">Desde {d.tarifaDesdeTexto} / noche</span>
          </>
        ) : null}
      </p>
    </header>
  );
}

/**
 * Selector de plantilla: devuelve el marco completo de la página. `wizard` es el
 * asistente ya montado por el padre; cada plantilla decide dónde colocarlo.
 */
export function PlantillaBookingPage({ plantilla, datos, wizard }: { plantilla: PlantillaBooking; datos: DatosPlantilla; wizard: ReactNode }) {
  if (plantilla === 'moderna' && datos.fotoPortada) {
    // Moderna: portada grande arriba, wizard sobre tarjeta flotante.
    return (
      <div>
        <div className="relative h-56 w-full overflow-hidden sm:h-72">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={datos.fotoPortada} alt={datos.titulo} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          {datos.logo ? (
            <div className="absolute top-4 left-4 right-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={datos.logo}
                alt={datos.titulo}
                className="h-12 w-auto max-w-[200px] rounded-md bg-white/95 object-contain p-1.5 shadow-sm"
                loading="eager"
              />
            </div>
          ) : null}
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <h1 className="text-2xl font-semibold drop-shadow sm:text-3xl">{datos.titulo}</h1>
            <p className="text-sm opacity-90">
              {datos.ciudad ? <span>{datos.ciudad} · </span> : null}
              {datos.tarifaDesdeTexto ? <span className="font-medium">Desde {datos.tarifaDesdeTexto} / noche</span> : null}
            </p>
          </div>
        </div>
        <div className="mx-auto -mt-10 max-w-3xl rounded-2xl border bg-background p-5 shadow-lg" style={{ borderRadius: 'var(--booking-radio)' }}>
          {datos.descripcion ? <p className="mb-4 text-sm text-muted-foreground">{datos.descripcion}</p> : null}
          {wizard}
        </div>
      </div>
    );
  }

  if (plantilla === 'minimal') {
    // Minimal: sin imágenes (es su promesa), todo texto centrado y apretado.
    return (
      <div className="mx-auto max-w-md py-10">
        <Cabecera d={datos} />
        <div className="mt-6">{wizard}</div>
      </div>
    );
  }

  if (plantilla === 'compacta') {
    // Compacta: cabecera arriba y wizard en ancho completo para convertir rápido.
    return (
      <div className="mx-auto max-w-3xl">
        <Cabecera d={datos} />
        <div className="mt-6">{wizard}</div>
      </div>
    );
  }

  // Clásica (y desconocido): la experiencia de siempre —la galería del
  // alojamiento arriba, la cabecera con la marca y el wizard centrado—, que es
  // justo lo que promete su descripción en el catálogo. Sin fotos publicadas no
  // se pinta galería (no hay nada que enseñar) y la página vende igual.
  return (
    <div className="mx-auto max-w-3xl">
      {datos.fotos.length > 0 ? (
        <div className="mb-6">
          <GaleriaPropiedad nombre={datos.titulo} fotos={datos.fotos} idioma={datos.idioma} />
        </div>
      ) : null}
      <Cabecera d={datos} />
      <div className="mt-6">{wizard}</div>
    </div>
  );
}
