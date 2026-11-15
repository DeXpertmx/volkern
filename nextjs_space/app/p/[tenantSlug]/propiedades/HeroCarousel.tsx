'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import type { InmuebleParsed } from '@/lib/real-estate/property-helpers';
import { formatOperationLabel, formatearPrecioInmueble } from '@/lib/real-estate/operation-labels';
import { fondoConTextoBlanco } from '@/lib/real-estate/contraste';

interface Props {
  properties: InmuebleParsed[];
  tenantSlug: string;
  brandingColor: string;
  logoUrl?: string;
  companyName: string;
  /** La portada ya lleva el logo en su cabecera; ahí no hace falta repetirlo. */
  showLogo?: boolean;
}

export default function HeroCarousel({
  properties,
  tenantSlug,
  brandingColor,
  logoUrl,
  companyName,
  showLogo = true,
}: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'start', skipSnaps: false },
    [Autoplay({ delay: 5000, stopOnInteraction: true })]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setScrollSnaps(emblaApi.scrollSnapList());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi]
  );

  if (properties.length === 0) return null;

  return (
    <section className="relative w-full overflow-hidden bg-slate-900 group">
      {/* Carousel */}
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">              {properties.map((property, index) => {
            const imagen = Array.isArray(property.media) && property.media.length > 0
              ? (property.media[0] as any)?.url || ''
              : '';

            // El badge y el CTA llevan etiqueta blanca: con una marca clara se
            // usa su versión oscurecida para que el texto no desaparezca.
            const gradientFrom = fondoConTextoBlanco(brandingColor || '#3b82f6');

            return (
              <div
                key={property.id}
                className="relative min-w-0 shrink-0 grow-0 basis-full h-[420px] md:h-[520px] flex items-center"
              >
                {/* Background Image */}
                {imagen ? (
                  <img
                    src={imagen}
                    alt={property.nombre}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                )}

                {/* Overlay Gradient */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.3) 100%)`,
                  }}
                />

                {/* Top bar with logo */}
                {showLogo && (
                <div className="absolute top-0 left-0 right-0 z-20 px-6 md:px-12 py-5">
                  {/* El logo vuelve a la portada del portal: el catálogo es una
                      sección de esa portada, no la página de inicio. */}
                  <div className="max-w-7xl mx-auto flex items-center gap-3">
                    <a href={`/p/${tenantSlug}`} className="flex items-center gap-3">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={companyName}
                          className="h-8 md:h-10 w-auto object-contain brightness-0 invert"
                        />
                      ) : (
                        <span className="text-white font-bold text-lg tracking-tight">
                          {companyName}
                        </span>
                      )}
                    </a>
                  </div>
                </div>
                )}

                {/* Content */}
                <div className="relative z-10 w-full px-6 md:px-12">
                  <div className="max-w-7xl mx-auto">
                    <div className="max-w-xl">
                      {/* Badge */}
                      <span
                        className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4 text-white"
                        style={{ backgroundColor: gradientFrom }}
                      >
                        {formatOperationLabel(property.operationType)}
                      </span>

                      {/* Title */}
                      <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-3">
                        {property.nombre}
                      </h2>

                      {/* Location */}
                      {property.city && (
                        <p className="text-white/70 text-base md:text-lg flex items-center gap-1.5 mb-3">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {property.address ? `${property.address}, ` : ''}
                          {property.city}
                        </p>
                      )}

                      {/* Description */}
                      {property.descripcion && (
                        <p className="text-white/60 text-sm md:text-base line-clamp-2 mb-4">
                          {property.descripcion}
                        </p>
                      )}

                      {/* Price */}
                      <div className="flex items-baseline gap-1 mb-6">
                        <span className="text-3xl md:text-4xl font-bold text-white">
                          {formatearPrecioInmueble(property.precioBase, property.moneda)}
                        </span>
                        {property.operationType === 'alquiler' && (
                          <span className="text-white/50 text-base">/mes</span>
                        )}
                        {property.operationType === 'alquiler_temporada' && (
                          <span className="text-white/50 text-base">/noche</span>
                        )}
                      </div>

                      {/* Features row */}
                      <div className="flex flex-wrap gap-4 mb-6">
                        {property.areaM2 && (
                          <span className="flex items-center gap-1.5 text-white/80 text-sm">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                              />
                            </svg>
                            {property.areaM2} m²
                          </span>
                        )}
                        {property.bedrooms && (
                          <span className="flex items-center gap-1.5 text-white/80 text-sm">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                              />
                            </svg>
                            {property.bedrooms} {property.bedrooms === 1 ? 'hab' : 'habs'}
                          </span>
                        )}
                        {property.bathrooms && (
                          <span className="flex items-center gap-1.5 text-white/80 text-sm">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
                              />
                            </svg>
                            {property.bathrooms} {property.bathrooms === 1 ? 'baño' : 'baños'}
                          </span>
                        )}
                        {property.parking && (
                          <span className="flex items-center gap-1.5 text-white/80 text-sm">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                              />
                            </svg>
                            {property.parking} {property.parking === 1 ? 'plaza' : 'plazas'}
                          </span>
                        )}
                      </div>

                      {/* CTA */}
                      <a
                        href={`/p/${tenantSlug}/propiedades/${property.id}`}
                        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl text-white hover:opacity-90 transition-all hover:scale-105 active:scale-95 shadow-lg"
                        style={{ backgroundColor: gradientFrom }}
                      >
                        Ver Detalles
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>

                {/* Property count badge */}
                <div className="absolute bottom-4 right-6 z-10 text-white/40 text-xs font-mono">
                  {index + 1} / {properties.length}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={() => emblaApi?.scrollPrev()}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100"
        aria-label="Anterior"
        style={{ opacity: scrollSnaps.length > 1 ? undefined : 0 }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={() => emblaApi?.scrollNext()}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all"
        aria-label="Siguiente"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Dots */}
      {scrollSnaps.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {scrollSnaps.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollTo(index)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                index === selectedIndex
                  ? 'bg-white scale-125'
                  : 'bg-white/40 hover:bg-white/60'
              }`}
              aria-label={`Ir a slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
