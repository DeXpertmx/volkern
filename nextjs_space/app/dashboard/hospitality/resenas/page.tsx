'use client';

/**
 * Moderación de reseñas (hueco nº 1 frente a Lodgify).
 *
 * La reseña nace `pendiente` cuando el huésped envía el formulario por token.
 * Desde aquí el hotel decide SI se publica en la web del motor y RESPONDE si
 * quiere — nunca reescribe: ni la puntuación ni el comentario se editan, la
 * palabra del huésped es intocable (regla del módulo puro `resenas.ts`).
 *
 * La media de lo publicado es la misma cifra que verá el visitante: moderar
 * es el único modo de moverla.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Star, Undo2, Upload, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ReviewLista {
  id: string;
  estado: 'pendiente' | 'publicada' | 'rechazada';
  origen: 'nativa' | 'importada';
  puntuacion: number;
  comentario: string | null;
  nombreHuesped: string;
  respuestaHotel: string | null;
  fechaCreacion: string;
  fechaEstancia: string | null;
  propiedad: string | null;
  unidad: string | null;
  checkIn: string | null;
  checkOut: string | null;
  referencia: string | null;
}

interface PropiedadLista {
  id: string;
  nombre: string;
}

interface ResultadoImport {
  creadas: number;
  duplicadas: number;
  total: number;
  errores: Array<{ fila: number; error: string }>;
}

const ETIQUETA_ESTADO: Record<ReviewLista['estado'], string> = {
  pendiente: 'Pendiente',
  publicada: 'Publicada',
  rechazada: 'Rechazada',
};

const TONO_ESTADO: Record<ReviewLista['estado'], string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  publicada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-slate-200 text-slate-700',
};

function Estrellas({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
      ))}
    </div>
  );
}

export default function ResenasPage() {
  const [reviews, setReviews] = useState<ReviewLista[]>([]);
  const [media, setMedia] = useState<number | null>(null);
  const [totalPublicadas, setTotalPublicadas] = useState(0);
  const [estado, setEstado] = useState<string>('pendiente');
  const [cargando, setCargando] = useState(true);
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [textoRespuesta, setTextoRespuesta] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  // Importación de reseñas históricas de OTAs.
  const [importAbierto, setImportAbierto] = useState(false);
  const [propiedades, setPropiedades] = useState<PropiedadLista[]>([]);
  const [propiedadId, setPropiedadId] = useState<string>('');
  const [csv, setCsv] = useState('');
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<ResultadoImport | null>(null);
  const inputCsv = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const url = estado ? `/api/hospitality/reviews?estado=${encodeURIComponent(estado)}` : '/api/hospitality/reviews';
      const res = await fetch(url);
      if (!res.ok) throw new Error('no ok');
      const data = await res.json();
      setReviews(data.reviews || []);
      setMedia(data.media ?? null);
      setTotalPublicadas(data.totalPublicadas ?? 0);
    } catch {
      toast.error('No se pudieron cargar las reseñas');
    } finally {
      setCargando(false);
    }
  }, [estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Propiedades del tenant para el selector de la importación (una vez).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/hospitality/properties');
        if (!res.ok) return;
        const data = await res.json();
        const crudas: unknown[] = data.properties || [];
        const lista: PropiedadLista[] = crudas
          .map((p) => (p && typeof p === 'object' ? (p as Record<string, unknown>) : null))
          .filter((p): p is Record<string, unknown> => Boolean(p?.id && p?.nombre))
          .map((p) => ({ id: String(p.id), nombre: String(p.nombre) }));
        setPropiedades(lista);
        if (lista.length === 1) setPropiedadId(lista[0].id);
      } catch {
        // El diálogo se abre igual; sin lista, el selector avisa.
      }
    })();
  }, []);

  const abrirImport = () => {
    setResultadoImport(null);
    setCsv('');
    setImportAbierto(true);
  };

  const leerArchivo = async (file: File) => {
    const texto = await file.text();
    setCsv(texto);
  };

  const importar = async () => {
    if (!propiedadId || !csv.trim() || importando) return;
    setImportando(true);
    try {
      const res = await fetch('/api/hospitality/reviews/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: propiedadId, csv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || 'No se pudo importar el CSV');
        return;
      }
      setResultadoImport(data.import);
      await cargar();
    } catch {
      toast.error('No se pudo importar el CSV');
    } finally {
      setImportando(false);
    }
  };

  const moderar = async (reviewId: string, accion: 'publicar' | 'rechazar' | 'reponer', respuesta?: string) => {
    setTrabajando(true);
    try {
      const res = await fetch('/api/hospitality/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, accion, respuesta }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || 'No se pudo moderar la reseña');
        return;
      }
      toast.success(accion === 'publicar' ? 'Reseña publicada' : accion === 'rechazar' ? 'Reseña rechazada' : 'Reseña de vuelta a pendiente');
      setRespondiendo(null);
      setTextoRespuesta('');
      await cargar();
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reseñas de huéspedes</h1>
          <p className="text-sm text-muted-foreground">
            Modera lo que se publica en tu web y responde a tus huéspedes. La puntuación y el comentario del huésped no se editan.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-2">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          <div>
            <p className="text-lg font-semibold leading-none">{media !== null ? media.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground">{totalPublicadas} publicadas</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="publicada">Publicadas</SelectItem>
            <SelectItem value="rechazada">Rechazadas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={abrirImport}>
          <Upload className="mr-1 h-4 w-4" /> Importar CSV de canal
        </Button>
      </div>

      {cargando ? (
        <div className="flex items-center gap-2 py-12 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No hay reseñas en este estado. Las reseñas llegan cuando el huésped responde al email de solicitud (24 h tras el check-out).
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Estrellas n={r.puntuacion} />
                      <Badge className={TONO_ESTADO[r.estado]} variant="secondary">
                        {ETIQUETA_ESTADO[r.estado]}
                      </Badge>
                      {r.origen === 'importada' && (
                        <Badge variant="outline">Histórica</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[r.unidad, r.propiedad].filter(Boolean).join(' · ')}
                      {r.checkIn ? ` · ${new Date(r.checkIn).toLocaleDateString('es-ES')}` : ''}
                      {r.referencia ? ` · ${r.referencia}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-medium">{r.nombreHuesped}</p>
                </div>

                {r.comentario && <p className="text-sm text-slate-700">“{r.comentario}”</p>}

                {r.respuestaHotel && (
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-xs font-medium text-muted-foreground">Tu respuesta</p>
                    <p className="mt-1 text-sm text-slate-700">{r.respuestaHotel}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {r.estado === 'pendiente' && (
                    <>
                      <AccionHospitality capacidad="comunicaciones.gestionar">
                        <Button size="sm" onClick={() => moderar(r.id, 'publicar')} disabled={trabajando}>
                          <Check className="mr-1 h-4 w-4" /> Publicar
                        </Button>
                      </AccionHospitality>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRespondiendo(respondiendo === r.id ? null : r.id);
                          setTextoRespuesta(r.respuestaHotel || '');
                        }}
                        disabled={trabajando}
                      >
                        Responder y publicar
                      </Button>
                      <AccionHospitality capacidad="comunicaciones.gestionar">
                        <Button size="sm" variant="ghost" onClick={() => moderar(r.id, 'rechazar')} disabled={trabajando}>
                          <X className="mr-1 h-4 w-4" /> Rechazar
                        </Button>
                      </AccionHospitality>
                    </>
                  )}
                  {r.estado !== 'pendiente' && (
                    <AccionHospitality capacidad="comunicaciones.gestionar">
                      <Button size="sm" variant="ghost" onClick={() => moderar(r.id, 'reponer')} disabled={trabajando}>
                        <Undo2 className="mr-1 h-4 w-4" /> Volver a pendiente
                      </Button>
                    </AccionHospitality>
                  )}
                </div>

                {respondiendo === r.id && (
                  <div className="space-y-2 rounded-md border p-3">
                    <Textarea
                      value={textoRespuesta}
                      onChange={(e) => setTextoRespuesta(e.target.value)}
                      placeholder="Respuesta pública del hotel (opcional, máx. 1000 caracteres)…"
                      rows={3}
                      maxLength={1000}
                    />
                    <div className="flex gap-2">
                      <AccionHospitality capacidad="comunicaciones.gestionar">
                        <Button size="sm" onClick={() => moderar(r.id, 'publicar', textoRespuesta)} disabled={trabajando}>
                          Publicar con respuesta
                        </Button>
                      </AccionHospitality>
                      <Button size="sm" variant="ghost" onClick={() => setRespondiendo(null)} disabled={trabajando}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={importAbierto} onOpenChange={setImportAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar reseñas históricas de un canal</DialogTitle>
            <DialogDescription>
              Sube el CSV de reseñas de tu canal (Booking.com, Airbnb…). Llegan publicadas en tu web — ya las mostró el canal. Importar el mismo archivo dos veces no duplica nada.
            </DialogDescription>
          </DialogHeader>

          {resultadoImport ? (
            <div className="space-y-3">
              <p className="text-sm">
                Importadas <span className="font-semibold">{resultadoImport.creadas}</span> de {resultadoImport.total} reseñas
                {resultadoImport.duplicadas > 0 && <> · {resultadoImport.duplicadas} ya estaban</>}
                {resultadoImport.errores.length > 0 && <> · {resultadoImport.errores.length} con error</>}.
              </p>
              {resultadoImport.errores.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-muted p-2">
                  {resultadoImport.errores.map((e) => (
                    <p key={e.fila} className="text-xs text-muted-foreground">
                      Fila {e.fila}: {e.error}
                    </p>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => setImportAbierto(false)}>Cerrar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Propiedad</Label>
                <Select value={propiedadId} onValueChange={setPropiedadId}>
                  <SelectTrigger>
                    <SelectValue placeholder={propiedades.length ? 'Elige la propiedad' : 'Cargando propiedades…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {propiedades.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Archivo CSV</Label>
                <input
                  ref={inputCsv}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) leerArchivo(f);
                  }}
                />
                <Button variant="outline" className="w-full" onClick={() => inputCsv.current?.click()}>
                  {csv ? `Archivo cargado (${csv.length} caracteres)` : 'Elegir archivo CSV…'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Columnas: canal (opcional), fecha de estancia, nombre, puntuación (1–5), comentario y respuesta del hotel (opcionales). Fechas AAAA-MM-DD o DD/MM/YYYY.
                </p>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setImportAbierto(false)} disabled={importando}>
                  Cancelar
                </Button>
                <AccionHospitality capacidad="comunicaciones.gestionar">
                  <Button onClick={importar} disabled={importando || !propiedadId || !csv.trim()}>
                    {importando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Importar reseñas
                  </Button>
                </AccionHospitality>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
