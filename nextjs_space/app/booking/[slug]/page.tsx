'use client';

/**
 * Booking Engine público (FASE 3.D) — página de reserva de una propiedad.
 *
 * Flujo del plan: fechas → disponibilidad (Availability Engine, con precio por
 * unidad) → datos del huésped → confirmación. Si el hotel tiene Stripe
 * Connect activo, el último paso redirige al pago; si no, queda confirmada.
 *
 * Es pública: no usa sesión. La propiedad se identifica por su id (slug) y
 * solo responde si está "conectada" (publicada vía Puesta en marcha).
 *
 * Idioma (ES/EN): los textos viven en `lib/hospitality/booking-i18n.ts`. El
 * idioma se resuelve en el cliente con el patrón «locale por query»: servidor y
 * primer render del cliente pintan SIEMPRE español (hydratación idéntica, sin
 * mismatch) y un efecto isomórfico (useLayoutEffect en cliente, useEffect en
 * servidor) cambia al idioma de `?lang=` ANTES del primer paint — sin destello
 * visible para el huésped internacional. La moneda se formatea con el locale
 * del idioma elegido.
 */

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  CheckCircle2,
  Languages,
  Loader2,
  Mail,
  Moon,
  Phone,
  Sparkles,
  Star,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CHECKIN_TEXTOS,
  TEXTOS,
  interpolar,
  idiomaDesdeUrl,
  IDIOMAS,
  IDIOMA_POR_DEFECTO,
  type Idioma,
} from '@/lib/hospitality/booking-i18n';
import { formatearImporte } from '@/lib/moneda';
import { textosResena } from '@/lib/hospitality/resenas-i18n';
import type { ResenaPublica } from '@/lib/hospitality/resenas';
import type { ExtraPublico } from '@/lib/hospitality/booking-extras';

/** Selección de extras del huésped: ids y cantidades — nunca precios. */
interface SeleccionExtraUI {
  extraId: string;
  cantidad: number;
}

/** Resumen público de reseñas tal como lo devuelve la API del motor. */
interface ResumenResenas {
  media: number | null;
  total: number;
  reseñas: ResenaPublica[];
}

interface UnidadCatalogo {
  id: string;
  nombre: string;
  tipo: string;
  capacidad: number;
  descripcion: string | null;
  fotos: string[];
  amenidades: string[];
  tarifaNoche: number | null;
  moneda: string;
}

interface UnidadCotizada extends UnidadCatalogo {
  disponible: boolean;
  motivo?: string;
  noches: number;
  precioTotal: number | null;
}

/**
 * Datos del documento del titular (opcionales en la reserva).
 *
 * Se piden aquí porque es el momento en que el huésped está delante: si los
 * deja, el parte de viajeros nace casi completo y el hotel no tiene que
 * perseguir a nadie. Si no los deja, el enlace de check-in que recibe en la
 * confirmación le pide lo mismo (y lo de sus acompañantes).
 */
interface DocumentoTitular {
  nombre: string;
  apellido1: string;
  apellido2: string;
  tipoDocumento: string;
  numeroDocumento: string;
  soporteDocumento: string;
  fechaNacimiento: string;
  nacionalidad: string;
  sexo: string;
  direccion: {
    direccion: string;
    codigoPostal: string;
    pais: string;
    codigoMunicipio: string;
  };
}

function documentoVacio(): DocumentoTitular {
  return {
    nombre: '',
    apellido1: '',
    apellido2: '',
    tipoDocumento: '',
    numeroDocumento: '',
    soporteDocumento: '',
    fechaNacimiento: '',
    nacionalidad: '',
    sexo: '',
    direccion: { direccion: '', codigoPostal: '', pais: '', codigoMunicipio: '' },
  };
}

function hoyMas(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default function BookingPublico() {
  return <BookingCliente />;
}

function BookingCliente() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { slug } = useSlug();
  // Servidor y primer render del cliente: SIEMPRE español (hydratación sin
  // mismatch). El efecto isomórfico aplica `?lang=` antes del primer paint.
  const [idioma, setIdioma] = useState<Idioma>(IDIOMA_POR_DEFECTO);
  const [montado, setMontado] = useState(false);
  const useEfectoIsomorfico = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
  useEfectoIsomorfico(() => {
    setIdioma(idiomaDesdeUrl(window.location.search));
    setMontado(true);
  }, []);
  const t = TEXTOS[idioma];
  // Etiquetas de los campos del registro de viajeros: las mismas que usa el
  // check-in online (una sola lista de textos en los dos idiomas).
  const cd = CHECKIN_TEXTOS[idioma].campos;
  // El importe se escribe con la divisa del dato (`lib/moneda`): el formato del
  // dinero acompaña a la moneda, no al idioma del visitante —un precio de 1.200
  // EUR se lee igual en las dos versiones de la página, y no en dos formatos
  // distintos según por dónde entró el huésped—.
  const moneda = (valor: number, currency: string) => formatearImporte(valor, currency);

  const [cargando, setCargando] = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);
  const [propiedad, setPropiedad] = useState<{ nombre: string; descripcion: string | null; ciudad: string | null; moneda: string } | null>(null);
  const [unidades, setUnidades] = useState<UnidadCatalogo[]>([]);
  const [resenas, setResenas] = useState<ResumenResenas | null>(null);
  const [extrasDisponibles, setExtrasDisponibles] = useState<ExtraPublico[]>([]);
  const [seleccionExtras, setSeleccionExtras] = useState<SeleccionExtraUI[]>([]);
  const [checkIn, setCheckIn] = useState(hoyMas(7));
  const [checkOut, setCheckOut] = useState(hoyMas(9));
  const [cotizando, setCotizando] = useState(false);
  const [cotizadas, setCotizadas] = useState<UnidadCotizada[] | null>(null);
  const [noches, setNoches] = useState(0);
  const [elegida, setElegida] = useState<UnidadCotizada | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [documento, setDocumento] = useState<DocumentoTitular>(documentoVacio());
  const [mostrarDocumento, setMostrarDocumento] = useState(false);
  const [creando, setCreando] = useState(false);
  const [confirmada, setConfirmada] = useState<{
    referencia: string;
    total: number;
    moneda: string;
    paymentUrl: string | null;
    checkinUrl: string | null;
  } | null>(null);

  // Carga del catálogo público.
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const res = await fetch(`/api/public/booking/${slug}`);
        if (res.status === 404) {
          setNoDisponible(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t.errorCargarPropiedad);
        setPropiedad(data.propiedad);
        setUnidades(data.unidades || []);
        setResenas(data.resenas || null);
        setExtrasDisponibles(data.extras || []);
      } catch {
        toast.error(t.errorCargarPropiedad);
      } finally {
        setCargando(false);
      }
    })();
  }, [slug, t]);

  const cotizar = useCallback(async () => {
    if (!slug) return;
    if (new Date(checkOut) <= new Date(checkIn)) {
      toast.error(t.errorSalidaAntesLlegada);
      return;
    }
    setCotizando(true);
    setElegida(null);
    try {
      const res = await fetch(`/api/public/booking/${slug}?checkIn=${checkIn}&checkOut=${checkOut}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.errorDisponibilidad);
      setNoches(data.cotizacion.noches);
      // El catálogo identifica la unidad con `id` y la cotización con `unitId`
      // (el mismo campo que acepta el POST). Se normaliza en este único punto,
      // donde entra la cotización: el resto de la página trabaja con `id`, como
      // el catálogo. Sin esto la unidad se selecciona por un id indefinido y la
      // reserva se envía sin unidad (incidencia detectada en el ensayo E2E).
      setCotizadas(
        ((data.cotizacion.unidades || []) as Array<UnidadCotizada & { unitId: string }>).map((u) => ({
          ...u,
          id: u.unitId,
        }))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.errorDisponibilidad);
    } finally {
      setCotizando(false);
    }
  }, [slug, checkIn, checkOut, t]);

  const reservar = async () => {
    if (!slug || !elegida) return;
    if (!nombre.trim() || !email.trim()) {
      toast.error(t.errorDatosHuuesped);
      return;
    }
    setCreando(true);
    try {
      // Idempotencia: si el navegador reintenta, no se duplica la reserva.
      const key = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).slice(0, 40);
      const res = await fetch(`/api/public/booking/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: elegida.id,
          checkIn,
          checkOut,
          huespedNombre: nombre,
          huespedEmail: email,
          huespedTelefono: telefono,
          notas,
          idempotencyKey: key,
          lang: idioma,
          // Extras elegidos (ids y cantidades; el precio lo pone el servidor).
          extras: seleccionExtras.filter((s) => s.cantidad > 0),
          // Opcional: solo viaja si el huésped lo rellenó, y el servidor decide
          // si hay documentación suficiente para guardarla.
          documento,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.errorReserva);
      setConfirmada({
        referencia: data.referencia,
        total: data.total,
        moneda: data.moneda,
        paymentUrl: data.paymentUrl || null,
        checkinUrl: data.checkinUrl || null,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.errorReserva);
    } finally {
      setCreando(false);
    }
  };

  if (noDisponible) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-muted/40">
        <Card className="max-w-sm w-full">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t.noDisponible}
          </CardContent>
        </Card>
      </main>
    );
  }

  if (confirmada) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-muted/40">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-bold">{t.reservaConfirmada}</h1>
            <p className="text-sm text-muted-foreground">
              {t.referencia} <span className="font-mono font-semibold">{confirmada.referencia}</span> ·{' '}
              {confirmada.total > 0 && (
                <>
                  {t.total} {moneda(confirmada.total, confirmada.moneda)}
                </>
              )}
            </p>
            {confirmada.paymentUrl ? (
              <Button className="w-full" onClick={() => (window.location.href = confirmada.paymentUrl!)}>
                {t.irAlPago}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t.teContactaremos}</p>
            )}

            {confirmada.checkinUrl && (
              <div className="rounded-md border p-3 text-left space-y-1">
                <p className="text-sm font-medium">{t.enlaceCheckinTitulo}</p>
                <p className="text-xs text-muted-foreground">{t.enlaceCheckinAyuda}</p>
                <a
                  className="break-all text-xs font-medium text-primary hover:underline"
                  href={confirmada.checkinUrl}
                >
                  {confirmada.checkinUrl}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 bg-muted/40">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="pt-4 flex items-start justify-between gap-2">
          <div>
            <Badge variant="outline" className="mb-2 gap-1">
              <Sparkles className="h-3 w-3" /> {t.reservaDirecta}
            </Badge>
            <h1 className="text-2xl font-bold">{propiedad?.nombre || '…'}</h1>
            {propiedad?.descripcion && <p className="text-sm text-muted-foreground mt-1">{propiedad.descripcion}</p>}
            {propiedad?.ciudad && <p className="text-xs text-muted-foreground">{propiedad.ciudad}</p>}
          </div>
          {montado && <ConmutadorIdioma actual={idioma} />}
        </header>

        {/* Reseñas publicadas (moderadas por el hotel): la prueba social del
            motor — media, total y las recientes, con la respuesta del hotel. */}
        {resenas && resenas.total > 0 && <SeccionResenas resumen={resenas} idioma={idioma} />}

        {/* Paso 1: fechas */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="font-medium flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {t.llegada}</span>
              <Input type="date" value={checkIn} min={hoyMas(0)} onChange={(e) => setCheckIn(e.target.value)} className="mt-1" />
            </label>
            <label className="text-sm">
              <span className="font-medium flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {t.salida}</span>
              <Input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} className="mt-1" />
            </label>
            <Button onClick={cotizar} disabled={cotizando || cargando}>
              {cotizando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Moon className="mr-1 h-4 w-4" />}
              {t.verDisponibilidad}
            </Button>
          </CardContent>
        </Card>

        {/* Paso 2: elegir unidad (con precio) */}
        {cotizadas && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {interpolar(t.resumenDisponibilidad, {
                noches: `${noches} ${noches === 1 ? t.noche : t.noches}`,
                libres: cotizadas.filter((u) => u.disponible).length,
                total: cotizadas.length,
              })}
            </h2>
            {cotizadas.map((u) => (
              <Card key={u.id} className={elegida?.id === u.id ? 'ring-2 ring-primary' : u.disponible ? '' : 'opacity-60'}>
                <CardContent className="p-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{u.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.tipo} · {interpolar(t.hastaPersonas, { n: u.capacidad })}{u.amenidades.length ? ` · ${u.amenidades.slice(0, 4).join(', ')}` : ''}
                    </div>
                  </div>
                  {u.disponible ? (
                    <div className="text-right">
                      <div className="font-bold">
                        {moneda(u.precioTotal || 0, u.moneda)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {moneda(u.tarifaNoche || 0, u.moneda)}/{t.porNoche}
                      </div>
                    </div>
                  ) : (
                    <Badge variant="outline">{t.motivos[u.motivo || 'ocupada'] ?? u.motivo}</Badge>
                  )}
                  {u.disponible && (
                    <Button size="sm" variant={elegida?.id === u.id ? 'default' : 'outline'} onClick={() => setElegida(u)}>
                      {elegida?.id === u.id ? t.elegida : t.elegir}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Paso 3: datos del huésped */}
        {elegida && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-semibold">{interpolar(t.tusDatos, { unidad: elegida.nombre })}</h2>

              {/* Extras del hotel: la selección viaja como ids y cantidades;
                  el precio lo pone el servidor (guardia del módulo). */}
              {extrasDisponibles.length > 0 && <SelectorExtras extras={extrasDisponibles} idioma={idioma} seleccion={seleccionExtras} onChange={setSeleccionExtras} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="font-medium flex items-center gap-1"><User className="h-3.5 w-3.5" /> {t.nombreCompleto}</span>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="mt-1" autoComplete="name" />
                </label>
                <label className="text-sm">
                  <span className="font-medium flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {t.email}</span>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" autoComplete="email" />
                </label>
                <label className="text-sm">
                  <span className="font-medium flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {t.telefono}</span>
                  <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="mt-1" autoComplete="tel" />
                </label>
                <label className="text-sm">
                  <span className="font-medium">{t.peticiones}</span>
                  <Input value={notas} onChange={(e) => setNotas(e.target.value)} className="mt-1" placeholder={t.peticionesPlaceholder} />
                </label>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="text-sm text-muted-foreground">
                  {t.total}: <span className="font-bold text-foreground">
                    {moneda(elegida.precioTotal || 0, elegida.moneda)}
                  </span>
                </div>
                <Button onClick={reservar} disabled={creando}>
                  {creando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                  {t.confirmarReserva}
                </Button>
              </div>

              {/* Registro de viajeros: opcional aquí, imprescindible antes de
                  entrar. Los textos de los campos son los del check-in para no
                  mantener dos listas de etiquetas. */}
              <div className="rounded-md border p-3 space-y-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setMostrarDocumento((v) => !v)}
                >
                  <span className="text-sm font-semibold">{t.documentoTitulo}</span>
                  <span className="text-xs text-muted-foreground">{mostrarDocumento ? '−' : '+'}</span>
                </button>
                <p className="text-xs text-muted-foreground">{t.documentoAyuda}</p>
                {mostrarDocumento && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CampoDocumento etiqueta={cd.nombre}>
                      <Input value={documento.nombre} onChange={(e) => setDocumento({ ...documento, nombre: e.target.value })} autoComplete="given-name" />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd.apellido1}>
                      <Input value={documento.apellido1} onChange={(e) => setDocumento({ ...documento, apellido1: e.target.value })} autoComplete="family-name" />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd.apellido2}>
                      <Input value={documento.apellido2} onChange={(e) => setDocumento({ ...documento, apellido2: e.target.value })} />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd.fechaNacimiento}>
                      <Input type="date" value={documento.fechaNacimiento} onChange={(e) => setDocumento({ ...documento, fechaNacimiento: e.target.value })} />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd.tipoDocumento}>
                      <Input list="tipos-documento" value={documento.tipoDocumento} onChange={(e) => setDocumento({ ...documento, tipoDocumento: e.target.value })} />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd.numeroDocumento}>
                      <Input value={documento.numeroDocumento} onChange={(e) => setDocumento({ ...documento, numeroDocumento: e.target.value })} />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd.soporteDocumento}>
                      <Input value={documento.soporteDocumento} onChange={(e) => setDocumento({ ...documento, soporteDocumento: e.target.value })} />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd.nacionalidad}>
                      <Input list="paises" maxLength={3} value={documento.nacionalidad} onChange={(e) => setDocumento({ ...documento, nacionalidad: e.target.value })} />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd['direccion.calle']}>
                      <Input value={documento.direccion.direccion} onChange={(e) => setDocumento({ ...documento, direccion: { ...documento.direccion, direccion: e.target.value } })} autoComplete="street-address" />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd['direccion.codigoPostal']}>
                      <Input value={documento.direccion.codigoPostal} onChange={(e) => setDocumento({ ...documento, direccion: { ...documento.direccion, codigoPostal: e.target.value } })} autoComplete="postal-code" />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd['direccion.pais']}>
                      <Input list="paises" maxLength={3} value={documento.direccion.pais} onChange={(e) => setDocumento({ ...documento, direccion: { ...documento.direccion, pais: e.target.value } })} autoComplete="country" />
                    </CampoDocumento>
                    <CampoDocumento etiqueta={cd['direccion.municipio']}>
                      <Input value={documento.direccion.codigoMunicipio} onChange={(e) => setDocumento({ ...documento, direccion: { ...documento.direccion, codigoMunicipio: e.target.value } })} />
                    </CampoDocumento>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{t.documentoOpcional}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Catálogos sugeridos: los publica el servicio del Ministerio, aquí solo
            se ofrecen los códigos del ejemplo oficial (un `id` por documento). */}
        <datalist id="tipos-documento">
          <option value="NIF" />
          <option value="NIE" />
          <option value="PAS" />
        </datalist>
        <datalist id="paises">
          <option value="ESP" />
          <option value="FRA" />
          <option value="DEU" />
          <option value="ITA" />
          <option value="PRT" />
          <option value="GBR" />
          <option value="USA" />
          <option value="MEX" />
          <option value="ARG" />
          <option value="BRA" />
          <option value="COL" />
          <option value="CHL" />
        </datalist>
      </div>
    </main>
  );
}

/** Etiqueta de un campo del bloque de documento (mismo texto que el check-in). */
function CampoDocumento({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="font-medium">{etiqueta}</span>
      {children}
    </label>
  );
}

/**
 * Selector de extras del hotel: cantidad por extra (0 = no se quiere).
 * La selección viaja como {extraId, cantidad} — el precio lo pone el servidor
 * validando contra su catálogo, así que aquí no se muestra un total "comprometido":
 * el total real llega en la confirmación.
 */
function SelectorExtras({
  extras,
  idioma,
  seleccion,
  onChange,
}: {
  extras: ExtraPublico[];
  idioma: Idioma;
  seleccion: SeleccionExtraUI[];
  onChange: (s: SeleccionExtraUI[]) => void;
}) {
  const t = TEXTOS[idioma];
  const cantidadDe = (id: string) => seleccion.find((s) => s.extraId === id)?.cantidad ?? 0;
  const fijar = (id: string, cantidad: number) => {
    const resto = seleccion.filter((s) => s.extraId !== id);
    onChange(cantidad > 0 ? [...resto, { extraId: id, cantidad }] : resto);
  };
  const precioDe = (e: ExtraPublico) => formatearImporte(e.precio, e.moneda, 0);

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold">{t.extrasTitulo}</p>
        <p className="text-xs text-muted-foreground">{t.extrasAyuda}</p>
      </div>
      {extras.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {e.nombre}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {e.precioPorNoche ? interpolar(t.extraPorNoche, { precio: precioDe(e) }) : precioDe(e)}
              </span>
            </p>
            {e.descripcion && <p className="text-xs text-muted-foreground">{e.descripcion}</p>}
          </div>
          <select
            className="h-9 w-20 shrink-0 rounded-md border bg-background text-sm"
            aria-label={`${t.extraCantidad} · ${e.nombre}`}
            value={String(cantidadDe(e.id))}
            onChange={(ev) => fijar(e.id, Number(ev.target.value))}
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
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

/**
 * Sección pública de reseñas del motor: media de lo publicado, total y las
 * últimas reseñas con su respuesta del hotel. Solo enseña lo que el hotel
 * moderó — la reseña es la palabra del huésped y la web la cita tal cual.
 */
function SeccionResenas({ resumen, idioma }: { resumen: ResumenResenas; idioma: Idioma }) {
  const t = textosResena(idioma);
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{t.resenasTitulo}</h2>
        <span className="text-xs text-muted-foreground">
          {t.resenasResumen.replace('{media}', String(resumen.media ?? '—')).replace('{total}', String(resumen.total))}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {resumen.reseñas.map((r, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <EstrellasPublicas n={r.puntuacion} />
                <span className="text-xs text-muted-foreground">
                  {[r.canal, r.mesEstancia].filter(Boolean).join(' · ')}
                </span>
              </div>
              {r.comentario && <p className="text-sm text-slate-700">“{r.comentario}”</p>}
              <p className="text-xs font-medium text-slate-600">{r.nombreHuesped}</p>
              {r.respuestaHotel && (
                <div className="rounded-md bg-muted p-2">
                  <p className="text-xs font-medium text-muted-foreground">{t.respuestaHotel}</p>
                  <p className="mt-1 text-xs text-slate-700">{r.respuestaHotel}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * Conmutador ES/EN: recarga la misma página conservando todos los parámetros
 * (embed, etc.) y cambiando solo `lang`. Un `<a>` real, no JS de por medio,
 * para que funcione también en el iframe del embed.
 */
function ConmutadorIdioma({ actual }: { actual: Idioma }) {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Language">
      <Languages className="h-3.5 w-3.5" />
      {IDIOMAS.map((idioma) => {
        params.set('lang', idioma);
        const href = `${window.location.pathname}?${params.toString()}`;
        return idioma === actual ? (
          <span key={idioma} className="font-semibold text-foreground uppercase">{idioma}</span>
        ) : (
          <a key={idioma} href={href} className="uppercase hover:text-foreground hover:underline">
            {idioma}
          </a>
        );
      })}
    </div>
  );
}

/** Extrae el [slug] de la ruta sin depender de useParams del servidor. */
function useSlug(): { slug: string | null } {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    const partes = window.location.pathname.split('/').filter(Boolean);
    const i = partes.indexOf('booking');
    setSlug(i >= 0 && partes[i + 1] ? partes[i + 1] : null);
  }, []);
  return { slug };
}
