'use client';

/**
 * Formulario público de reseña del huésped (`/review/<token>`).
 *
 * Se llega por el enlace del email de solicitud (cron §21), que es la
 * credencial: no hay sesión — el mismo patrón del check-in online. El huésped
 * puntúa y comenta SU estancia y la reseña nace `pendiente`: la publica el
 * hotel desde su panel, y solo lo moderado sale en la web del motor.
 *
 * Es móvil primero y bilingüe con el MISMO patrón del motor: servidor y
 * primer render pintan español y un efecto isomórfico aplica `?lang=` antes
 * del primer paint, sin destello ni mismatch de hidratación.
 *
 * Nada se inventa: si el enlace no existe, la página lo dice; si la reseña
 * ya pasó por moderación, se muestra y no se puede editar; si está pendiente,
 * el huésped puede corregirla (nadie escribe perfecto a la primera).
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  idiomaDesdeUrl,
  IDIOMA_POR_DEFECTO,
  type Idioma,
} from '@/lib/hospitality/booking-i18n';
import { textosResena } from '@/lib/hospitality/resenas-i18n';

interface EstadoResena {
  estado: 'pendiente' | 'publicada' | 'rechazada';
  puntuacion: number;
  comentario: string | null;
  nombreHuesped: string;
}

export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>('');
  const [idioma, setIdioma] = useState<Idioma>(IDIOMA_POR_DEFECTO);
  const [cargando, setCargando] = useState(true);
  const [unidad, setUnidad] = useState<string>('');
  const [existente, setExistente] = useState<EstadoResena | null>(null);

  // Formulario (arranca vacío o con lo que ya escribió).
  const [puntuacion, setPuntuacion] = useState(0);
  const [comentario, setComentario] = useState('');
  const [nombreHuesped, setNombreHuesped] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [noEncontrado, setNoEncontrado] = useState(false);

  useEffect(() => {
    const apply = async () => {
      const { token: t } = await params;
      setToken(t);
      setIdioma(idiomaDesdeUrl(window.location.search));
      try {
        const res = await fetch(`/api/public/reviews/${encodeURIComponent(t)}`);
        if (res.status === 404) {
          setNoEncontrado(true);
        } else if (res.ok) {
          const data = await res.json();
          setUnidad(data?.unidad?.nombre || '');
          setNombreHuesped(data?.huesped?.nombre || '');
          if (data?.review) {
            setExistente(data.review);
            setPuntuacion(data.review.puntuacion || 0);
            setComentario(data.review.comentario || '');
            setNombreHuesped(data.review.nombreHuesped || data?.huesped?.nombre || '');
          }
        }
      } catch {
        // La página muestra el estado vacío; reintentar es recargar.
      } finally {
        setCargando(false);
      }
    };
    apply();
  }, [params]);

  const t = textosResena(idioma);

  const enviar = async () => {
    if (!token || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/public/reviews/${encodeURIComponent(token)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puntuacion, comentario, nombreHuesped }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setEnviado(true);
        setExistente((prev) => prev ?? { estado: 'pendiente', puntuacion, comentario, nombreHuesped });
      } else {
        toast.error(data?.error || t.error);
      }
    } catch {
      toast.error(t.error);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t.cargando}</span>
        </div>
      </main>
    );
  }

  if (noEncontrado || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center text-sm text-slate-600">{t.noEncontrado}</CardContent>
        </Card>
      </main>
    );
  }

  // Ya moderada: se enseña lo que dijo el huésped y no hay formulario.
  const cerrada = existente && existente.estado !== 'pendiente';
  const pendienteGuardada = existente && existente.estado === 'pendiente';

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto w-full max-w-md space-y-4 py-6">
        {enviado || pendienteGuardada || cerrada ? (
          <Card>
            <CardContent className="space-y-3 pt-6 text-center">
              <div className="text-3xl">🙏</div>
              <h1 className="text-lg font-semibold">
                {cerrada ? t.cerrada : enviado ? t.gracias : t.editando}
              </h1>
              {!cerrada && <p className="text-sm text-slate-600">{t.graciasDetalle}</p>}
              {cerrada && (
                <div className="text-left">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${i < (existente?.puntuacion || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                      />
                    ))}
                  </div>
                  {existente?.comentario && (
                    <p className="mt-2 text-sm text-slate-700">{existente.comentario}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">{existente?.nombreHuesped}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="space-y-1">
                <h1 className="text-lg font-semibold">{t.titulo}</h1>
                <p className="text-sm text-slate-600">
                  {t.intro.replace('{unidad}', unidad || '')}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t.puntuacion}</Label>
                <div className="flex gap-1" role="radiogroup" aria-label={t.estrellasAria.replace('{n}', String(puntuacion))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={puntuacion === n}
                      onClick={() => setPuntuacion(n)}
                      className="rounded p-1 transition hover:bg-slate-100"
                    >
                      <Star
                        className={`h-7 w-7 ${n <= puntuacion ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comentario">{t.comentario}</Label>
                <Textarea
                  id="comentario"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder={t.comentarioPlaceholder}
                  rows={4}
                  maxLength={2000}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nombre">{t.nombre}</Label>
                <Input
                  id="nombre"
                  value={nombreHuesped}
                  onChange={(e) => setNombreHuesped(e.target.value)}
                  placeholder={t.nombrePlaceholder}
                  maxLength={80}
                />
                <p className="text-xs text-slate-500">{t.nombreAviso}</p>
              </div>

              <Button className="w-full" onClick={enviar} disabled={enviando || puntuacion < 1}>
                {enviando ? t.enviando : t.enviar}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
