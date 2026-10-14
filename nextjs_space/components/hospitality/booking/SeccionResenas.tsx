/**
 * Sección pública de reseñas del motor de reservas.
 *
 * Enseña la media de lo PUBLICADO, el total y las últimas reseñas con su
 * respuesta del hotel. Solo lo que el hotel moderó sale aquí: la reseña es la
 * palabra del huésped y la web la cita tal cual, sin reescribirla.
 *
 * Vive en su propio componente (y no dentro de una página) porque desde la
 * unificación de las dos páginas públicas la monta la misma página de reserva
 * —`/reservar/<slug>`— y también, si algún día hace falta, el widget embebible.
 * Sin hooks ni `'use client'`: se pinta en el servidor con el HTML de la página,
 * así el buscador lee las reseñas en el primer byte.
 */

import { Star } from 'lucide-react';
import { textosResena } from '@/lib/hospitality/resenas-i18n';
import type { ResenaPublica } from '@/lib/hospitality/resenas';
import type { Idioma } from '@/lib/hospitality/booking-i18n';

export interface ResumenResenas {
  media: number | null;
  total: number;
  reseñas: ResenaPublica[];
}

/** Estrellas de una reseña publicada (solo lectura). */
function EstrellasPublicas({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
      ))}
    </div>
  );
}

export function SeccionResenas({
  resumen,
  idioma,
}: {
  resumen: ResumenResenas;
  idioma: Idioma;
}) {
  const t = textosResena(idioma);
  return (
    <section className="space-y-3" aria-label={t.resenasTitulo}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold" style={{ color: 'var(--booking-texto)' }}>
          {t.resenasTitulo}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t.resenasResumen.replace('{media}', String(resumen.media ?? '—')).replace('{total}', String(resumen.total))}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {resumen.reseñas.map((r, i) => (
          <div key={i} className="space-y-2 rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <EstrellasPublicas n={r.puntuacion} />
              <span className="text-xs text-muted-foreground">
                {[r.canal, r.mesEstancia].filter(Boolean).join(' · ')}
              </span>
            </div>
            {r.comentario ? <p className="text-sm text-slate-700">“{r.comentario}”</p> : null}
            <p className="text-xs font-medium text-slate-600">{r.nombreHuesped}</p>
            {r.respuestaHotel ? (
              <div className="rounded-md bg-muted p-2">
                <p className="text-xs font-medium text-muted-foreground">{t.respuestaHotel}</p>
                <p className="mt-1 text-xs text-slate-700">{r.respuestaHotel}</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
