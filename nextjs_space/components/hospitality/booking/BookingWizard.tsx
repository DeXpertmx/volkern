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
 *
 * Idioma (ES/EN): lo resuelve el SERVIDOR —el padre lee `?lang`— y baja como prop.
 * El primer render ya sale en el idioma pedido: nada de parpadeo ni de hidratación
 * distinta a la del HTML del servidor. El conmutador son dos enlaces reales, así
 * que funciona igual en la página suelta y dentro del iframe del embed. El defecto
 * es español (`IDIOMA_POR_DEFECTO`), también si alguien no pasa nada.
 */

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Languages,
  Loader2,
  MapPin,
  Users,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatearImporte } from '@/lib/moneda';
import { toIsoDate } from '@/lib/hospitality/calendar';
import { porcentajeTotalDeAjustes, type AjusteAplicado } from '@/lib/hospitality/ajustes';
import {
  IDIOMAS,
  IDIOMA_POR_DEFECTO,
  WIZARD_TEXTOS,
  fechaDeNoche,
  fechaLarga,
  interpolar,
  nocheONoches,
  type Idioma,
} from '@/lib/hospitality/booking-i18n';

export interface UnidadPublicaUI {
  id: string;
  propertyId: string;
  nombre: string;
  tipo: string;
  capacidad: number;
  descripcion: string | null;
  tarifaPorNoche: number;
  /** Fotos de la unidad (o de su propiedad): la que enseña el resumen del modal. */
  fotos: string[];
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
  /**
   * Precio por noche con su fecha cuando la estancia no cuesta la tarifa plana:
   * temporadas y/o ajustes (null = tarifa plana). El asistente no calcula nada:
   * solo elige entre enseñar esta lista y enseñar la línea «N noches × tarifa».
   */
  desgloseNoches?: Array<{
    fecha: string;
    tarifa: number;
    base?: number;
    ajustes?: AjusteAplicado[];
  }> | null;
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
  idioma = IDIOMA_POR_DEFECTO,
  rutaBase,
}: {
  slug: string;
  alojamiento: string;
  moneda: string;
  config: ConfigPublicaUI;
  propiedades: PropiedadPublicaUI[];
  embebido?: boolean;
  /** Idioma del huésped, resuelto por el padre a partir de `?lang`. */
  idioma?: Idioma;
  /** Ruta de esta misma página (sin query) para los enlaces del conmutador. */
  rutaBase?: string;
}) {
  const t = WIZARD_TEXTOS[idioma];
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
  // Modal del paso 3: abierto desde «Elegir» y cerrado al éxito/cancelación.
  const [modalAbierto, setModalAbierto] = useState(false);

  const caja = embebido ? 'w-full' : 'mx-auto w-full max-w-3xl';

  async function cotizar() {
    setCargando(true);
    setError(null);
    setUnidades(null);
    try {
      const res = await fetch(`/api/public/booking/${slug}/cotizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El idioma viaja también al servidor: los textos que él compone
        // (mensajes de indisponibilidad, plantillas) salen en el idioma del
        // huésped, no en el de la interfaz del hotel.
        body: JSON.stringify({ propertyId, checkIn, checkOut, adultos, ninos, lang: idioma }),
      });
      const datos = await res.json();
      if (!datos.ok) {
        setError(datos.error || t.errorDisponibilidad);
        setUnidades([]);
        return;
      }
      setUnidades(datos.unidades as UnidadCotizadaUI[]);
      setNoches(datos.noches as number);
      setPaso(2);
    } catch {
      setError(t.errorSinConexion);
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
          // El idioma en que reservó queda en la reserva: las comunicaciones
          // automáticas (confirmación, pre-llegada, reseña) salen en él.
          lang: idioma,
        }),
      });
      const datos = await res.json();
      if (!datos.ok) {
        setError(datos.error || t.errorReserva);
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
      setModalAbierto(false);
    } catch {
      setError(t.errorSinConexion);
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
            <p className="font-medium">{t.sinUnidadesTitulo}</p>
            <p className="text-sm text-muted-foreground">
              {config.emailContacto
                ? interpolar(t.sinUnidadesEmail, { email: config.emailContacto })
                : t.sinUnidadesAyuda}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={caja}>
      <header className="mb-6 text-center">
        {rutaBase ? <ConmutadorIdiomaWizard actual={idioma} rutaBase={rutaBase} /> : null}
        <h1 className="mt-3 text-2xl font-semibold" style={{ color: 'var(--booking-texto)' }}>
          {config.titulo || alojamiento}
        </h1>
        {config.descripcion ? (
          <p className="mt-2 text-sm text-muted-foreground">{config.descripcion}</p>
        ) : null}
      </header>

      <ol className="mb-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        {[t.pasoFechas, t.pasoUnidad, t.pasoDatos, t.pasoConfirmacion].map((etiqueta, indice) => (
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
            <CardTitle className="text-base">{t.cuandoVienes}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {propiedades.length > 1 ? (
              <div className="grid gap-2">
                <Label htmlFor="propiedad">{t.alojamiento}</Label>
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
                <Label htmlFor="entrada">{t.entrada}</Label>
                <Input
                  id="entrada"
                  type="date"
                  min={hoy}
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="salida">{t.salida}</Label>
                <Input
                  id="salida"
                  type="date"
                  min={checkIn || hoy}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="adultos">{t.adultos}</Label>
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
                <Label htmlFor="ninos">{t.ninos}</Label>
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
              {t.verDisponibilidad}
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
              {checkIn} → {checkOut} · {noches} {nocheONoches(idioma, noches)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPaso(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t.cambiarFechas}
            </Button>
          </div>

          {unidades && unidades.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {t.sinDisponibilidad}
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
                  {interpolar(t.hastaHuespedes, { n: u.capacidad })}
                </span>
                <div className="grid gap-1">
                  {/* Estancia en temporada: la noche cuesta la tarifa de SU
                      fecha, así que se listan una a una. La media del rango no
                      es ningún precio que el huésped pueda pagar. */}
                  {u.desgloseNoches && u.desgloseNoches.length > 0 ? (
                    <>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t.desglosePorNoche}
                      </div>
                      {u.desgloseNoches.map((noche) => (
                        <div key={noche.fecha} className="flex justify-between gap-2 text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            {fechaLarga(fechaDeNoche(noche.fecha), idioma) || noche.fecha}
                            {/* Noche movida por las reglas del plan: el huésped
                                ve cuánto, y el detalle por regla en el title. */}
                            {noche.ajustes && noche.ajustes.length > 0 ? (
                              <span
                                className="rounded bg-muted px-1 text-[10px] font-medium text-foreground"
                                title={tituloAjustes(noche.ajustes)}
                              >
                                {etiquetaAjustes(noche.ajustes)}
                              </span>
                            ) : null}
                          </span>
                          <span>{formatearImporte(noche.tarifa, moneda)}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        {noches} × {formatearImporte(u.tarifaPorNoche, moneda)}
                      </span>
                      <span>{formatearImporte(u.desglose.alojamiento, moneda)}</span>
                    </div>
                  )}
                  {u.desglose.limpieza > 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t.limpieza}</span>
                      <span>{formatearImporte(u.desglose.limpieza, moneda)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t pt-1 font-medium">
                    <span>{t.total}</span>
                    <span>{formatearImporte(u.desglose.total, moneda)}</span>
                  </div>
                  {u.desglose.anticipo > 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        {interpolar(t.anticipoAhora, { porcentaje: config.anticipoPorcentaje })}
                      </span>
                      <span>{formatearImporte(u.desglose.anticipo, moneda)}</span>
                    </div>
                  ) : null}
                </div>
                <Button
                  onClick={() => {
                    setUnidad(u);
                    setPaso(3);
                    setModalAbierto(true);
                  }}
                >
                  {t.reservarEstaUnidad}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Paso 3 (datos del huésped) dentro de un MODAL: al pulsar «Elegir», el
          formulario se abre sobre la página en vez de aparecer al pie — antes se
          perdía por debajo del pliegue y muchos huéspedes no lo encontraban. El
          respaldo en flujo (el bloque de siempre) se mantiene si el modal no
          puede abrirse o si el huésped lo cierra: nada se rompe sin JS. */}
      <Dialog open={modalAbierto && paso === 3 && !!unidad} onOpenChange={(open) => { if (!open) setModalAbierto(false); }}>
        {/* content-start: sin él, la rejilla del diálogo reparte el alto
            sobrante entre las filas y el encabezado «flota» sobre un hueco
            vacío (275px medidos en producción). */}
        <DialogContent className="max-h-[90vh] content-start overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.tusDatos}</DialogTitle>
            <DialogDescription>
              {unidad
                ? `${fechaLarga(fechaDeNoche(checkIn), idioma) || checkIn} → ${
                    fechaLarga(fechaDeNoche(checkOut), idioma) || checkOut
                  } · ${formatearImporte(unidad.desglose.total, moneda)}`
                : null}
            </DialogDescription>
          </DialogHeader>
          {/* Lo elegido, a la vista: la foto de la unidad y las fechas en claro.
              Antes el modal solo decía «2026-09-19 → 2026-09-21»: una fecha ISO
              se puede leer al revés (mes/día) y sin foto no se sabía qué cama se
              estaba reservando. El huésped confirma lo que ve. */}
          {paso === 3 && unidad ? (
            <ResumenElegido
              unidad={unidad}
              foto={fotoDePropiedades(propiedades, unidad.unitId)}
              checkIn={checkIn}
              checkOut={checkOut}
              noches={noches}
              idioma={idioma}
              moneda={moneda}
              total={unidad.desglose.total}
            />
          ) : null}
          {paso === 3 && unidad ? (
            <FormularioHuesped
              t={t}
              unidad={unidad}
              moneda={moneda}
              config={config}
              nombre={nombre}
              setNombre={setNombre}
              email={email}
              setEmail={setEmail}
              telefono={telefono}
              setTelefono={setTelefono}
              notas={notas}
              setNotas={setNotas}
              cargando={cargando}
              reservar={reservar}
              cerrar={() => setModalAbierto(false)}
            />)
          : null}
        </DialogContent>
      </Dialog>

      {paso === 3 && unidad ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.tusDatos}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ResumenElegido
              unidad={unidad}
              foto={fotoDePropiedades(propiedades, unidad.unitId)}
              checkIn={checkIn}
              checkOut={checkOut}
              noches={noches}
              idioma={idioma}
              moneda={moneda}
              total={unidad.desglose.total}
            />

            <FormularioHuesped
              t={t}
              unidad={unidad}
              moneda={moneda}
              config={config}
              nombre={nombre}
              setNombre={setNombre}
              email={email}
              setEmail={setEmail}
              telefono={telefono}
              setTelefono={setTelefono}
              notas={notas}
              setNotas={setNotas}
              cargando={cargando}
              reservar={reservar}
              cerrar={() => setPaso(2)}
            />
          </CardContent>
        </Card>
      ) : null}

      {paso === 4 && resultado ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
            <p className="text-lg font-medium">
              {resultado.estado === 'pending' ? t.reservaRecibida : t.reservaConfirmada}
            </p>
            <p className="text-sm text-muted-foreground">
              {t.referencia} <span className="font-medium">{resultado.referencia}</span> ·{' '}
              {resultado.noches} {nocheONoches(idioma, resultado.noches)} ·{' '}
              {formatearImporte(resultado.total, moneda)}
            </p>
            {resultado.avisoDePago ? (
              <p className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm">
                {resultado.avisoDePago}
              </p>
            ) : null}
            <Button asChild>
              <a href={resultado.confirmacionUrl}>{t.verDetalle}</a>
            </Button>
            <p className="text-xs text-muted-foreground">{t.guardaEnlace}</p>
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

/**
 * Formulario de datos del huésped (paso 3), compartido por el MODAL y el flujo
 * de la página. Recibe estado y callbacks: no tiene vida propia.
 */
function FormularioHuesped({
  t,
  unidad,
  moneda,
  config,
  nombre,
  setNombre,
  email,
  setEmail,
  telefono,
  setTelefono,
  notas,
  setNotas,
  cargando,
  reservar,
  cerrar,
}: {
  t: (typeof WIZARD_TEXTOS)[Idioma];
  unidad: UnidadCotizadaUI;
  moneda: string;
  config: ConfigPublicaUI;
  nombre: string;
  setNombre: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  telefono: string;
  setTelefono: (v: string) => void;
  notas: string;
  setNotas: (v: string) => void;
  cargando: boolean;
  reservar: () => void;
  cerrar: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="nombre">{t.nombreApellidos}</Label>
          <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">{t.email}</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="telefono">{t.telefono}</Label>
          <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} autoComplete="tel" />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="notas">{t.peticiones}</Label>
          <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={t.peticionesPlaceholder} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t.dejaContacto}</p>
      {config.politicaCancelacion ? (
        <p className="rounded-md border p-3 text-xs text-muted-foreground">{config.politicaCancelacion}</p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={cerrar} disabled={cargando}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t.volver}
        </Button>
        <Button onClick={reservar} disabled={cargando || !nombre || (!email && !telefono)}>
          {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
          {config.requierePagoOnline ? t.pagarYReservar : t.confirmarReserva}
        </Button>
      </div>
    </div>
  );
}

/** Efecto total de los ajustes de una noche, con su signo («−15 %»). */
function etiquetaAjustes(ajustes: AjusteAplicado[]): string {
  const total = porcentajeTotalDeAjustes(ajustes);
  return `${total > 0 ? '+' : ''}${total} %`;
}

/** Detalle por regla del ajuste de una noche (el `title` de la etiqueta). */
function tituloAjustes(ajustes: AjusteAplicado[]): string {
  return ajustes
    .map((a) => `${a.nombre || a.tipo}: ${a.porcentaje > 0 ? '+' : ''}${a.porcentaje} %`)
    .join(' · ');
}

/**
 * Conmutador ES/EN del asistente: dos enlaces reales a la MISMA ruta con otro
 * `lang`. Sin JS de por medio para que funcione también dentro del iframe del
 * embed, donde recargar el enlace equivale a recargar el widget.
 */
function ConmutadorIdiomaWizard({ actual, rutaBase }: { actual: Idioma; rutaBase: string }) {
  return (
    <div
      className="flex items-center justify-center gap-1 text-xs text-muted-foreground"
      aria-label="Language"
    >
      <Languages className="h-3.5 w-3.5" aria-hidden />
      {IDIOMAS.map((idioma) =>
        idioma === actual ? (
          <span key={idioma} className="font-semibold uppercase text-foreground">
            {idioma}
          </span>
        ) : (
          <a
            key={idioma}
            href={`${rutaBase}?lang=${idioma}`}
            className="uppercase hover:text-foreground hover:underline"
          >
            {idioma}
          </a>
        )
      )}
    </div>
  );
}

/** Primera foto publicada de la unidad elegida (caí a las fotos de su propiedad). */
function fotoDePropiedades(propiedades: PropiedadPublicaUI[], unitId: string): string | null {
  for (const p of propiedades) {
    const unidad = p.unidades.find((u) => u.id === unitId);
    if (unidad?.fotos?.length) return unidad.fotos[0];
  }
  return null;
}

/**
 * Lo elegido, a la vista: foto de la unidad, fechas en claro (formato largo del
 * idioma, nunca ISO que se lee al revés) y el total. Vive dentro del modal del
 * registro y en el respaldo en flujo: el huésped confirma lo que ve, no lo que
 * intuye — sin foto no se sabía qué cama reservaba y una fecha ISO «2026-09-19»
 * se confunde con 9 de julio.
 */
function ResumenElegido({
  unidad,
  foto,
  checkIn,
  checkOut,
  noches,
  idioma,
  moneda,
  total,
}: {
  unidad: { nombre: string; tipo: string };
  foto: string | null;
  checkIn: string;
  checkOut: string;
  noches: number;
  idioma: Idioma;
  moneda: string;
  total: number;
}) {
  const llegada = fechaLarga(fechaDeNoche(checkIn), idioma) || checkIn;
  const salida = fechaLarga(fechaDeNoche(checkOut), idioma) || checkOut;
  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/50 p-3">
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt={unidad.nombre}
          className="h-16 w-20 shrink-0 rounded-md border object-cover"
          loading="eager"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{unidad.nombre}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
          {llegada} → {salida}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {noches} {nocheONoches(idioma, noches)} · {formatearImporte(total, moneda)}
        </p>
      </div>
    </div>
  );
}
