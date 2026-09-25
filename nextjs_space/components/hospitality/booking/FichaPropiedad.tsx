'use client';

/**
 * Ficha pública de la propiedad (Booking Engine): la galería de fotos y los datos
 * que el huésped compara antes de reservar —ubicación, capacidad, servicios y
 * descripción—, con el patrón de las webs de alojamiento (portada grande, mosaico
 * y visor a pantalla completa).
 *
 * Es un módulo de presentación: recibe lo que ya decidió el servidor (las fotos
 * publicadas, las amenidades que el hotel catalogó en sus unidades, la ubicación)
 * y no calcula importes ni disponibilidad. Sin fotos publicadas enseña un marco de
 * relleno en lugar de una imagen rota: una propiedad se puede publicar y vender
 * antes de tener fotos, y la página no puede parecer averiada por eso.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Home, ImageOff, MapPin, Star, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { interpolar, TEXTOS, type Idioma } from '@/lib/hospitality/booking-i18n';

/** Número de servicios que se listan antes de resumir el resto en «+N». */
const SERVICIOS_VISIBLES = 8;

/**
 * Galería de la propiedad: portada, hasta dos fotos de apoyo en mosaico y visor a
 * pantalla completa (con teclado: Esc cierra, ←/→ cambian de foto).
 */
export function GaleriaPropiedad({
  nombre,
  fotos,
  idioma,
}: {
  nombre: string;
  fotos: string[];
  idioma: Idioma;
}) {
  const t = TEXTOS[idioma];
  const total = fotos.length;
  const [visor, setVisor] = useState<number | null>(null);

  const mover = useCallback(
    (paso: number) => {
      setVisor((actual) => (actual === null ? actual : (actual + paso + total) % total));
    },
    [total]
  );

  useEffect(() => {
    if (visor === null) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setVisor(null);
      else if (evento.key === 'ArrowRight') mover(1);
      else if (evento.key === 'ArrowLeft') mover(-1);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [visor, mover]);

  // Sin fotos: marco de relleno, nunca un `img` roto.
  if (total === 0) {
    return (
      <div
        role="img"
        aria-label={t.sinFotos}
        className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted text-muted-foreground"
      >
        <ImageOff className="h-8 w-8" aria-hidden />
        <p className="px-4 text-center text-xs">{t.sinFotos}</p>
      </div>
    );
  }

  const portada = fotos[0];
  const apoyo = fotos.slice(1, 3);

  return (
    <div className="relative">
      <section aria-label={t.galeria}>
      <div className="grid gap-2 overflow-hidden rounded-xl sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setVisor(0)}
          aria-label={interpolar(t.verFotos, { n: total })}
          className={`relative block aspect-[16/10] h-full w-full overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            apoyo.length > 0 ? 'sm:col-span-2 sm:aspect-[16/9]' : 'sm:col-span-3 sm:aspect-[16/9]'
          }`}
        >
          <img
            src={portada}
            alt={nombre}
            className="h-full w-full cursor-pointer object-cover transition duration-300 hover:scale-[1.03]"
          />
        </button>

        {apoyo.length > 0 && (
          <div className="hidden gap-2 sm:grid">
            {apoyo.map((foto, indice) => (
              <button
                key={`${foto}-${indice}`}
                type="button"
                onClick={() => setVisor(indice + 1)}
                aria-label={interpolar(t.verFotos, { n: total })}
                className="relative block h-full w-full overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img
                  src={foto}
                  alt={`${nombre} · ${indice + 2}`}
                  className="h-full w-full cursor-pointer object-cover transition duration-300 hover:scale-[1.03]"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {total > 1 && (
        <button
          type="button"
          onClick={() => setVisor(0)}
          className="absolute bottom-3 right-3 rounded-md bg-background/90 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur transition hover:bg-background"
        >
          {interpolar(t.verFotos, { n: total })}
        </button>
      )}
      </section>

      {visor !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.galeria}
          className="fixed inset-0 z-50 flex flex-col gap-3 bg-black/90 p-4"
        >
          <div className="flex items-center justify-between text-white">
            <span className="text-xs tabular-nums">
              {visor + 1} / {total}
            </span>
            <button
              type="button"
              onClick={() => setVisor(null)}
              aria-label={t.cerrar}
              className="rounded-full p-2 transition hover:bg-white/10"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="relative flex flex-1 items-center justify-center">
            {total > 1 && (
              <button
                type="button"
                onClick={() => mover(-1)}
                aria-label={t.fotoAnterior}
                className="absolute left-0 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
            )}
            <img
              src={fotos[visor]}
              alt={`${nombre} · ${visor + 1}`}
              className="max-h-full max-w-full object-contain"
            />
            {total > 1 && (
              <button
                type="button"
                onClick={() => mover(1)}
                aria-label={t.fotoSiguiente}
                className="absolute right-0 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60"
              >
                <ChevronRight className="h-6 w-6" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Datos públicos de la propiedad, en una línea de hechos y bloques de texto:
 * ubicación, capacidad, unidades publicadas, valoración, descripción y servicios.
 *
 * Todo lo que no está publicado no se inventa: un dato ausente desaparece de la
 * ficha en lugar de salir en blanco.
 */
export function FichaPropiedad({
  descripcion,
  ubicacion,
  capacidad,
  unidades,
  amenidades,
  valoracion,
  enlaceMapa,
  idioma,
}: {
  descripcion: string | null;
  /** «Playa del Carmen, Quintana Roo, México»: ya formateada por la página. */
  ubicacion: string | null;
  /** Capacidad de la unidad más amplia (la de la propiedad). */
  capacidad: number | null;
  unidades: number;
  amenidades: string[];
  valoracion: { media: number; total: number } | null;
  enlaceMapa: string | null;
  idioma: Idioma;
}) {
  const t = TEXTOS[idioma];
  const visibles = amenidades.slice(0, SERVICIOS_VISIBLES);
  const restantes = amenidades.length - visibles.length;

  const hechos: Array<{ clave: string; icono: React.ReactNode; texto: string }> = [];
  if (ubicacion) {
    hechos.push({ clave: 'ubicacion', icono: <MapPin className="h-4 w-4" aria-hidden />, texto: ubicacion });
  }
  if (capacidad) {
    hechos.push({
      clave: 'capacidad',
      icono: <Users className="h-4 w-4" aria-hidden />,
      texto: interpolar(t.capacidadMaxima, { n: capacidad }),
    });
  }
  if (unidades > 0) {
    hechos.push({
      clave: 'unidades',
      icono: <Home className="h-4 w-4" aria-hidden />,
      texto: `${unidades} ${unidades === 1 ? t.unidad : t.unidades}`,
    });
  }
  if (valoracion && valoracion.total > 0) {
    hechos.push({
      clave: 'valoracion',
      icono: <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />,
      texto: `${valoracion.media} · ${valoracion.total}`,
    });
  }

  return (
    <section className="space-y-4">
      {hechos.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {hechos.map((hecho) => (
            <li key={hecho.clave} className="flex items-center gap-1.5">
              {hecho.icono}
              <span>{hecho.texto}</span>
            </li>
          ))}
        </ul>
      )}

      {descripcion && <p className="text-sm leading-relaxed text-muted-foreground">{descripcion}</p>}

      {amenidades.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">{t.servicios}</h2>
          <ul className="flex flex-wrap gap-1.5">
            {visibles.map((amenidad) => (
              <li key={amenidad}>
                <Badge variant="secondary">{amenidad}</Badge>
              </li>
            ))}
            {restantes > 0 && (
              <li>
                <Badge variant="outline">+{restantes}</Badge>
              </li>
            )}
          </ul>
        </div>
      )}

      {enlaceMapa && (
        <a
          href={enlaceMapa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <MapPin className="h-4 w-4" aria-hidden />
          {t.verMapa}
        </a>
      )}
    </section>
  );
}
