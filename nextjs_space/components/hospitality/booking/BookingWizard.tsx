'use client';

/**
 * Asistente de reserva directa del alojamiento.
 *
 * Cuatro pasos, en el orden en que el huésped decide: cuándo, en qué unidad, quién
 * y cómo paga. No tiene motor propio: la disponibilidad y el precio los responde
 * la API pública, que a su vez los pide al Availability Engine y al módulo de
 * tarificación del servidor. Aquí no se calcula ni una noche ni un importe.
 *
 * El precio lo escribe `formatearImporte` con la divisa que llega en los datos: la
 * página no decide con qué moneda se escribe el dinero.
 */

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Loader2,
  MapPin,
  Users,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatearImporte } from '@/lib/moneda';
import { toIsoDate } from '@/lib/hospitality/calendar';

export interface UnidadPublicaUI {
  id: string;
  propertyId: string;
  nombre: string;
  tipo: string;
  capacidad: number;
  descripcion: string | null;
  tarifaPorNoche: number;
}

export interface PropiedadPublicaUI {
  id: string;
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  unidades: UnidadPublicaUI[];
}

export interface ConfigPublicaUI {
  titulo: string | null;
  descripcion: string | null;
  emailContacto: string | null;
  telefonoContacto: string | null;
  politicaCancelacion: string | null;
  anticipoPorcentaje: number;
  tarifaLimpieza: number | null;
  requierePagoOnline: boolean;
  pagoOnlineDisponible: boolean;
}

interface UnidadCotizadaUI {
  unitId: string;
  propertyId: string;
  nombre: string;
  tipo: string;
  capacidad: number;
  tarifaPorNoche: number;
  desglose: { alojamiento: number; limpieza: number; total: number; anticipo: number; saldo: number };
}

interface ResultadoReservaUI {
  referencia: string;
  estado: string;
  total: number;
  noches: number;
  confirmacionUrl: string;
  avisoDePago: string | null;
}

/** Identificador de la solicitud: hace que reintentar el formulario no duplique. */
function nuevoSolicitudId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sol-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function BookingWizard({
  slug,
  alojamiento,
  moneda,
  config,
  propiedades,
  embebido = false,
}: {
  slug: string;
  alojamiento: string;
  moneda: string;
  config: ConfigPublicaUI;
  propiedades: PropiedadPublicaUI[];
  embebido?: boolean;
}) {
  const hoy = useMemo(() => toIsoDate(new Date()), []);
  const manana = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toIsoDate(d);
  }, []);
  const enTresDias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return toIsoDate(d);
  }, []);

  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [solicitudId, setSolicitudId] = useState(() => nuevoSolicitudId());
  const [checkIn, setCheckIn] = useState(manana);
  const [checkOut, setCheckOut] = useState(enTresDias);
  const [adultos, setAdultos] = useState(2);
  const [ninos, setNinos] = useState(0);
  const [propertyId, setPropertyId] = useState(propiedades[0]?.id ?? '');
  const [unidades, setUnidades] = useState<UnidadCotizadaUI[] | null>(null);
  const [unidad, setUnidad] = useState<UnidadCotizadaUI | null>(null);
  const [noches, setNoches] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [resultado, setResultado] = useState<ResultadoReservaUI | null>(null);

  const caja = embebido ? 'w-full' : 'mx-auto w-full max-w-3xl';

  async function cotizar() {
    setCargando(true);
    setError(null);
    setUnidades(null);
    try {
      const res = await fetch(`/api/public/booking/${slug}/cotizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, checkIn, checkOut, adultos, ninos }),
      });
      const datos = await res.json();
      if (!datos.ok) {
        setError(datos.error || 'No se pudo comprobar la disponibilidad.');
        setUnidades([]);
        return;
      }
      setUnidades(datos.unidades as UnidadCotizadaUI[]);
      setNoches(datos.noches as number);
      setPaso(2);
    } catch {
      setError('No hay conexión con el servidor. Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  async function reservar() {
    if (!unidad) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/booking/${slug}/reservar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          unitId: unidad.unitId,
          checkIn,
          checkOut,
          adultos,
          ninos,
          solicitudId,
          nombre,
          email,
          telefono,
          notas,
        }),
      });
      const datos = await res.json();
      if (!datos.ok) {
        setError(datos.error || 'No se pudo completar la reserva.');
        return;
      }
      if (datos.pagoUrl) {
        // El cobro ocurre en la pasarela del alojamiento; al volver, el enlace de
        // confirmación enseña la reserva con su pago aplicado.
        window.location.href = datos.pagoUrl as string;
        return;
      }
      setResultado({
        referencia: datos.referencia,
        estado: datos.estado,
        total: datos.total,
        noches: datos.noches,
        confirmacionUrl: datos.confirmacionUrl,
        avisoDePago: datos.avisoDePago ?? null,
      });
      setPaso(4);
    } catch {
      setError('No hay conexión con el servidor. Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  if (propiedades.length === 0) {
    return (
      <div className={caja}>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="font-medium">Este alojamiento todavía no tiene unidades publicadas</p>
            <p className="text-sm text-muted-foreground">
              {config.emailContacto
                ? `Escríbenos a ${config.emailContacto} y te ayudamos.`
                : 'Vuelve a intentarlo en un rato.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={caja}>
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">{config.titulo || alojamiento}</h1>
        {config.descripcion ? (
          <p className="mt-2 text-sm text-muted-foreground">{config.descripcion}</p>
        ) : null}
      </header>

      <ol className="mb-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        {['Fechas', 'Unidad', 'Tus datos', 'Confirmación'].map((etiqueta, indice) => (
          <li key={etiqueta} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${
                paso === indice + 1
                  ? 'border-primary bg-primary text-primary-foreground'
                  : paso > indice + 1
                    ? 'border-emerald-500 text-emerald-600'
                    : ''
              }`}
            >
              {indice + 1}
            </span>
            <span className={paso === indice + 1 ? 'font-medium text-foreground' : ''}>{etiqueta}</span>
          </li>
        ))}
      </ol>

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {paso === 1 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">¿Cuándo vienes?</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {propiedades.length > 1 ? (
              <div className="grid gap-2">
                <Label htmlFor="propiedad">Alojamiento</Label>
                <select
                  id="propiedad"
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                >
                  {propiedades.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                      {p.ciudad ? ` · ${p.ciudad}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="entrada">Entrada</Label>
                <Input
                  id="entrada"
                  type="date"
                  min={hoy}
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="salida">Salida</Label>
                <Input
                  id="salida"
                  type="date"
                  min={checkIn || hoy}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adultos">Adultos</Label>
                <Input
                  id="adultos"
                  type="number"
                  min={1}
                  max={30}
                  value={adultos}
                  onChange={(e) => setAdultos(Number(e.target.value) || 1)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ninos">Niños</Label>
                <Input
                  id="ninos"
                  type="number"
                  min={0}
                  max={30}
                  value={ninos}
                  onChange={(e) => setNinos(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <Button onClick={cotizar} disabled={cargando}>
              {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Ver disponibilidad
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {paso === 2 ? (
        <div className="grid gap-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" aria-hidden />
              {checkIn} → {checkOut} · {noches} {noches === 1 ? 'noche' : 'noches'}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPaso(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cambiar fechas
            </Button>
          </div>

          {unidades && unidades.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No hay unidades libres para esas fechas. Prueba otras fechas.
              </CardContent>
            </Card>
          ) : null}

          {unidades?.map((u) => (
            <Card key={u.unitId}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {u.nombre}
                  </span>
                  <Badge variant="secondary">{u.tipo}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" aria-hidden />
                  Hasta {u.capacidad} huéspedes
                </span>
                <div className="grid gap-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      {noches} × {formatearImporte(u.tarifaPorNoche, moneda)}
                    </span>
                    <span>{formatearImporte(u.desglose.alojamiento, moneda)}</span>
                  </div>
                  {u.desglose.limpieza > 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Limpieza</span>
                      <span>{formatearImporte(u.desglose.limpieza, moneda)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t pt-1 font-medium">
                    <span>Total</span>
                    <span>{formatearImporte(u.desglose.total, moneda)}</span>
                  </div>
                  {u.desglose.anticipo > 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Anticipo ahora ({config.anticipoPorcentaje}%)</span>
                      <span>{formatearImporte(u.desglose.anticipo, moneda)}</span>
                    </div>
                  ) : null}
                </div>
                <Button
                  onClick={() => {
                    setUnidad(u);
                    setPaso(3);
                  }}
                >
                  Reservar esta unidad
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {paso === 3 && unidad ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tus datos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">{unidad.nombre}</p>
              <p className="text-muted-foreground">
                {checkIn} → {checkOut} · {noches} {noches === 1 ? 'noche' : 'noches'} ·{' '}
                {formatearImporte(unidad.desglose.total, moneda)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="nombre">Nombre y apellidos</Label>
                <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="notas">¿Algo que debamos saber?</Label>
                <Textarea
                  id="notas"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Hora de llegada, cuna, mascotas…"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Deja un email o un teléfono: es por donde te llega la confirmación.
            </p>

            {config.politicaCancelacion ? (
              <p className="rounded-md border p-3 text-xs text-muted-foreground">
                {config.politicaCancelacion}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => setPaso(2)} disabled={cargando}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Button>
              <Button onClick={reservar} disabled={cargando || !nombre || (!email && !telefono)}>
                {cargando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                {config.requierePagoOnline ? 'Pagar y reservar' : 'Confirmar reserva'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {paso === 4 && resultado ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
            <p className="text-lg font-medium">
              {resultado.estado === 'pending' ? 'Reserva recibida' : 'Reserva confirmada'}
            </p>
            <p className="text-sm text-muted-foreground">
              Referencia <span className="font-medium">{resultado.referencia}</span> ·{' '}
              {resultado.noches} {resultado.noches === 1 ? 'noche' : 'noches'} ·{' '}
              {formatearImporte(resultado.total, moneda)}
            </p>
            {resultado.avisoDePago ? (
              <p className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm">
                {resultado.avisoDePago}
              </p>
            ) : null}
            <Button asChild>
              <a href={resultado.confirmacionUrl}>Ver el detalle de mi reserva</a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Guarda ese enlace: es tu comprobante.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {config.emailContacto || config.telefonoContacto ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {config.emailContacto ? <span>{config.emailContacto}</span> : null}
          {config.emailContacto && config.telefonoContacto ? ' · ' : null}
          {config.telefonoContacto ? <span>{config.telefonoContacto}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
