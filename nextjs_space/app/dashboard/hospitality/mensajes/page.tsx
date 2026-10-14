'use client';

/**
 * Bandeja de mensajería de las plataformas (OTAs) con el huésped.
 *
 * Lo que el huésped escribió en Booking, Expedia o donde reservó llega aquí (por
 * el webhook del canal) y se responde desde aquí (por su API de respuesta): el
 * hotel no necesita saltar a la extranet de cada OTA para contestar.
 *
 * Tres cosas que la pantalla NO hace, a propósito:
 *  - **no edita** lo que escribió el huésped ni lo que ya salió;
 *  - **no da por enviada** una respuesta que el canal rechazó: se queda en el
 *    hilo marcada como error con su motivo (y la API devuelve 502);
 *  - **no marca leído por abrir**: mirar un hilo no lo da por visto. Marcar
 *    leído es un botón explícito (con su permiso), así que el contador de la
 *    bandeja significa siempre «hay algo que nadie ha dado por leído».
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Mail, MessageSquare, Phone, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { etiquetaCanal, MAX_MENSAJE } from '@/lib/hospitality/mensajes-canal';

interface ConversacionLista {
  id: string;
  canal: string;
  huespedNombre: string | null;
  huespedEmail: string | null;
  huespedTelefono: string | null;
  propiedad: string | null;
  reservationId: string | null;
  bookingExterno: string | null;
  ultimoMensajeEn: string;
  sinLeer: number;
  ultimo: string | null;
  ultimoDireccion: string | null;
}

interface MensajeHilo {
  id: string;
  direccion: 'entrante' | 'saliente' | string;
  emisor: string;
  contenido: string;
  tipo: string;
  adjuntos: Array<{ nombre: string; ruta: string; mime: string | null }>;
  estado: string;
  error: string | null;
  enviadoEn: string | null;
  fechaCreacion: string;
}

interface HiloAbierto {
  conversacion: {
    id: string;
    canal: string;
    huespedNombre: string | null;
    huespedEmail: string | null;
    huespedTelefono: string | null;
    bookingExterno: string | null;
    sinLeer: number;
    propiedad: string | null;
    reserva: { externalBookingId: string; checkIn: string; checkOut: string; estado: string } | null;
  };
  mensajes: MensajeHilo[];
}

function cuando(iso: string | null): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  // Fecha, no dinero: `Intl.DateTimeFormat` (la guardia de moneda solo cuenta
  // los formateos de importes, no los de fechas).
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(fecha);
}

export default function MensajesCanalPage() {
  const [conversaciones, setConversaciones] = useState<ConversacionLista[]>([]);
  const [soloSinLeer, setSoloSinLeer] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [hilo, setHilo] = useState<HiloAbierto | null>(null);
  const [cargandoHilo, setCargandoHilo] = useState(false);
  const [respuesta, setRespuesta] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const url = soloSinLeer ? '/api/hospitality/mensajes?sinLeer=1' : '/api/hospitality/mensajes';
      const res = await fetch(url);
      if (!res.ok) throw new Error('no ok');
      const data = await res.json();
      setConversaciones(data.conversaciones || []);
    } catch {
      toast.error('No se pudieron cargar los mensajes del canal');
    } finally {
      setCargando(false);
    }
  }, [soloSinLeer]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Abrir es SOLO leer: el contador no se mueve por mirar (ver el encabezado). */
  const abrir = useCallback(
    async (id: string) => {
      setCargandoHilo(true);
      try {
        const res = await fetch(`/api/hospitality/mensajes?conversacionId=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error('no ok');
        const data: HiloAbierto = await res.json();
        setHilo(data);
      } catch {
        toast.error('No se pudo abrir la conversación');
      } finally {
        setCargandoHilo(false);
      }
    },
    []
  );

  /** Dar por leído es una acción del operador, no un efecto de abrir el hilo. */
  const marcarLeido = async (id: string) => {
    try {
      const res = await fetch('/api/hospitality/mensajes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacionId: id }),
      });
      if (!res.ok) throw new Error('no ok');
      setHilo((prev) => (prev ? { ...prev, conversacion: { ...prev.conversacion, sinLeer: 0 } } : prev));
      setConversaciones((prev) => prev.map((c) => (c.id === id ? { ...c, sinLeer: 0 } : c)));
    } catch {
      toast.error('No se pudo marcar como leído');
    }
  };

  const enviar = async () => {
    if (!hilo) return;
    setEnviando(true);
    try {
      const res = await fetch('/api/hospitality/mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacionId: hilo.conversacion.id, contenido: respuesta }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 502 = el canal la rechazó: se recarga el hilo para que el operador vea
        // el mensaje marcado como error con su motivo.
        toast.error(data?.error || 'El canal no aceptó la respuesta');
      } else {
        toast.success('Respuesta enviada al huésped');
        setRespuesta('');
      }
      await abrir(hilo.conversacion.id);
      await cargar();
    } catch {
      toast.error('No se pudo enviar la respuesta');
    } finally {
      setEnviando(false);
    }
  };

  const totalSinLeer = conversaciones.reduce((n, c) => n + c.sinLeer, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mensajes de las plataformas</h1>
          <p className="text-sm text-muted-foreground">
            Las conversaciones con tus huéspedes en Booking, Expedia y el resto de canales, en un
            solo sitio: llegan solas y se contestan desde aquí.
          </p>
        </div>
        {totalSinLeer > 0 && (
          <Badge className="bg-primary text-primary-foreground">{totalSinLeer} sin leer</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> Conversaciones
          </CardTitle>
          <Button
            variant={soloSinLeer ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSoloSinLeer((v) => !v)}
          >
            Sin leer
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {cargando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </p>
          ) : conversaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay mensajes de las plataformas. Cuando un huésped escriba por el canal
              (Booking, Expedia…), su conversación aparece aquí.
            </p>
          ) : (
            conversaciones.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => abrir(c.id)}
                className={`w-full rounded-md border p-3 text-left transition hover:bg-slate-50 ${
                  hilo?.conversacion.id === c.id ? 'border-primary bg-slate-50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {c.huespedNombre || 'Huésped sin nombre'}
                    {c.sinLeer > 0 && (
                      <Badge className="bg-primary text-primary-foreground">{c.sinLeer}</Badge>
                    )}
                  </span>
                  <Badge variant="outline">{etiquetaCanal(c.canal)}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                  {c.ultimoDireccion === 'saliente' ? 'Tú: ' : ''}
                  {c.ultimo}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {c.propiedad ? `${c.propiedad} · ` : ''}
                  {cuando(c.ultimoMensajeEn)}
                </p>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        {!hilo ? (
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {cargandoHilo ? 'Abriendo la conversación…' : 'Elige una conversación para verla y responder.'}
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {hilo.conversacion.huespedNombre || 'Huésped sin nombre'}
                <Badge variant="outline">{etiquetaCanal(hilo.conversacion.canal)}</Badge>
                {hilo.conversacion.propiedad && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {hilo.conversacion.propiedad}
                  </span>
                )}
              </CardTitle>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {hilo.conversacion.huespedEmail && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {hilo.conversacion.huespedEmail}
                  </span>
                )}
                {hilo.conversacion.huespedTelefono && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {hilo.conversacion.huespedTelefono}
                  </span>
                )}
                {hilo.conversacion.reserva && (
                  <span>
                    Reserva {hilo.conversacion.reserva.externalBookingId} ·{' '}
                    {hilo.conversacion.reserva.estado}
                  </span>
                )}
              </div>
              {hilo.conversacion.sinLeer > 0 && (
                <AccionHospitality capacidad="comunicaciones.ver">
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-fit"
                    onClick={() => marcarLeido(hilo.conversacion.id)}
                  >
                    Marcar como leído
                  </Button>
                </AccionHospitality>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {hilo.mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.direccion === 'saliente'
                        ? 'ml-auto bg-primary/10 text-slate-900'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    {m.contenido && <p className="whitespace-pre-wrap">{m.contenido}</p>}
                    {m.adjuntos.length > 0 && (
                      <p className="mt-1 text-xs text-slate-600">
                        Adjuntos en el canal:{' '}
                        {m.adjuntos.map((a) => a.nombre).join(', ')}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {m.direccion === 'saliente' ? 'Hotel' : 'Huésped'} · {cuando(m.enviadoEn || m.fechaCreacion)}
                    </p>
                    {m.estado === 'error' && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        No salió: {m.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <AccionHospitality capacidad="comunicaciones.enviar">
                <div className="space-y-2 border-t pt-3">
                  <Textarea
                    value={respuesta}
                    onChange={(e) => setRespuesta(e.target.value.slice(0, MAX_MENSAJE))}
                    placeholder="Escribe la respuesta al huésped…"
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {respuesta.length}/{MAX_MENSAJE}
                    </span>
                    <Button onClick={enviar} disabled={enviando || respuesta.trim().length === 0}>
                      {enviando ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Responder
                    </Button>
                  </div>
                </div>
              </AccionHospitality>
            </CardContent>
          </>
        )}
        </Card>
      </div>
    </div>
  );
}
