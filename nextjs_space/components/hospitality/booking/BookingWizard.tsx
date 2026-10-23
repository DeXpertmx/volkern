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
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatearImporte } from '@/lib/moneda';
// Sesión de la visita: permite que la consulta de un código y la reserva que
// sale de ella se puedan atar (conversión) sin contar varias veces el mismo
// intento.
import { generarSesionPromo } from '@/lib/hospitality/promos-consultas';
import { toIsoDate } from '@/lib/hospitality/calendar';
// Teléfono con país: prefijo por selector (evita números sin +34/+33…) en el
// paso de datos del huésped.
import { CampoTelefonoConPais } from '@/components/paises-municipios/selectores';
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

/**
 * Extra que el hotel vende en la web (desayuno, late check-out, traslados…).
 * El asistente solo lo enseña y manda la CANTIDAD: el precio que se cobra lo
 * resuelve el servidor contra el catálogo activo.
 */
export interface ExtraPublicoUI {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  moneda: string;
  precioPorNoche: boolean;
}

/**
 * Tarifa adicional de la propiedad (limpienza, gestión, mascota, resort…). Se
 * cobra UNA vez por estancia y el importe lo fija el servidor: aquí solo se
 * enseña y, si es opcional, se marca.
 */
export interface TarifaPublicaUI {
  id: string;
  nombre: string;
  descripcion: string | null;
  importe: number;
  moneda: string;
  obligatoria: boolean;
}

export interface PropiedadPublicaUI {
  id: string;
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  unidades: UnidadPublicaUI[];
  /** Catálogo activo de extras de la propiedad, en el idioma del huésped. */
  extras?: ExtraPublicoUI[];
  /** Tarifas adicionales activas; las obligatorias ya van en el precio. */
  tarifas?: TarifaPublicaUI[];
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
  desglose: {
    alojamiento: number;
    limpieza: number;
    /** Tarifas adicionales obligatorias, ya incluidas en `total`. */
    tarifas?: number;
    total: number;
    anticipo: number;
    saldo: number;
  };
}

interface ResultadoReservaUI {
  referencia: string;
  estado: string;
  total: number;
  noches: number;
  confirmacionUrl: string;
  /** Enlace de check-in (registro de viajeros); null si no se pudo preparar. */
  checkinUrl: string | null;
  avisoDePago: string | null;
}

/** Documento del titular que el huésped puede dejar ya al reservar. */
interface DocumentoUI {
  tipoDocumento: string;
  numeroDocumento: string;
  fechaNacimiento: string;
}

const DOCUMENTO_VACIO: DocumentoUI = {
  tipoDocumento: '',
  numeroDocumento: '',
  fechaNacimiento: '',
};

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
  // Una sola sesión por visita: aplica igual a la consulta del código y a la
  // reserva que la convierte.
  const [sesionPromo] = useState(() => generarSesionPromo());
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
  // País del teléfono (solo para el prefijo del selector; no se envía aparte).
  const [paisTelefono, setPaisTelefono] = useState('ESP');
  const [notas, setNotas] = useState('');
  const [resultado, setResultado] = useState<ResultadoReservaUI | null>(null);
  // Modal del paso 3: abierto desde «Elegir» y cerrado al éxito/cancelación.
  const [modalAbierto, setModalAbierto] = useState(false);
  // Extras elegidos (id → cantidad) y documento del titular: los dos bloques son
  // opcionales y los dos viajan al servidor, que es quien resuelve el precio y
  // valida el registro de viajeros.
  const [extrasSeleccion, setExtrasSeleccion] = useState<Record<string, number>>({});
  // Tarifas adicionales OPCIONALES marcadas (ids). Las obligatorias no se
  // eligen: ya vienen sumadas en el desglose de la unidad.
  const [tarifasSeleccion, setTarifasSeleccion] = useState<string[]>([]);
  // Código promocional: el texto se manda al servidor, que devuelve el
  // descuento calculado sobre el alojamiento. El importe no viaja nunca desde
  // aquí: en `promocion` solo se guarda lo que respondió el servidor.
  const [codigo, setCodigo] = useState('');
  const [promocion, setPromocion] = useState<{ codigo: string; descuento: number } | null>(null);
  const [errorPromo, setErrorPromo] = useState<string | null>(null);
  const [aplicandoPromo, setAplicandoPromo] = useState(false);
  const [documento, setDocumento] = useState<DocumentoUI>(DOCUMENTO_VACIO);

  const caja = embebido ? 'w-full' : 'mx-auto w-full max-w-3xl';

  // Extras de la propiedad elegida: el catálogo llegó con ella desde el servidor
  // (ya filtrado a activos y en el idioma del huésped).
  const extrasDisponibles = propiedades.find((p) => p.id === propertyId)?.extras ?? [];
  // Tarifas adicionales de la propiedad elegida: las obligatorias ya están en el
  // precio cotizado, así que solo se ofrecen las opcionales.
  const tarifasDeLaPropiedad = propiedades.find((p) => p.id === propertyId)?.tarifas ?? [];
  const tarifasOpcionalesDisponibles = tarifasDeLaPropiedad.filter((f) => !f.obligatoria);
  const totalTarifasEstimado =
    Math.round(
      tarifasOpcionalesDisponibles
        .filter((f) => tarifasSeleccion.includes(f.id))
        .reduce((acc, f) => acc + f.importe, 0) * 100
    ) / 100;
  const extrasElegidos = Object.entries(extrasSeleccion)
    .filter(([, cantidad]) => cantidad > 0)
    .map(([extraId, cantidad]) => ({ extraId, cantidad }));
  // Estimación a la vista: el precio es del catálogo y el importe definitivo lo
  // devuelve la reserva. El asistente no decide dinero, solo lo enseña.
  const totalExtrasEstimado =
    Math.round(
      extrasDisponibles.reduce((acc, e) => {
        const cantidad = extrasSeleccion[e.id] || 0;
        return acc + e.precio * cantidad * (e.precioPorNoche ? Math.max(noches, 1) : 1);
      }, 0) * 100
    ) / 100;
  const documentaLoAlgo = Boolean(
    documento.tipoDocumento || documento.numeroDocumento || documento.fechaNacimiento
  );

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

  /**
   * Comprueba el código contra el servidor para la unidad y fechas elegidas.
   * No consume usos ni reserva: es una consulta. Al reservar se vuelve a
   * evaluar, porque el código puede agotarse entre una cosa y otra.
   */
  async function aplicarCodigo() {
    if (!unidad || !codigo.trim() || aplicandoPromo) return;
    setAplicandoPromo(true);
    setErrorPromo(null);
    try {
      const res = await fetch(`/api/public/booking/${slug}/promocion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          unitId: unidad.unitId,
          checkIn,
          checkOut,
          adultos,
          ninos,
          codigo,
          sesionPromo,
        }),
      });
      const datos = await res.json();
      if (!datos.ok) {
        setPromocion(null);
        setErrorPromo(datos.error || t.promocionNoValida);
        return;
      }
      setPromocion({ codigo: datos.codigo as string, descuento: Number(datos.descuento) || 0 });
      setCodigo(datos.codigo as string);
    } catch {
      setErrorPromo(t.errorSinConexion);
    } finally {
      setAplicandoPromo(false);
    }
  }

  function quitarCodigo() {
    setPromocion(null);
    setCodigo('');
    setErrorPromo(null);
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
          // Extras: viaja la SELECCIÓN (id y cantidad); el precio lo pone el
          // catálogo activo del servidor.
          extras: extrasElegidos,
          // Tarifas adicionales opcionales: viajan como ids y el servidor pone
          // el importe del catálogo.
          tarifas: tarifasSeleccion,
          // Solo el texto del código: el descuento lo recalcula el servidor.
          codigo: promocion?.codigo ?? '',
          // La misma sesión con la que se consultó: marca esa consulta como
          // convertida cuando la reserva se crea.
          sesionPromo,
          // Documento del titular: si el huésped lo dejó, entra en el registro de
          // viajeros; si no, lo completa desde el enlace de check-in.
          documento: documentaLoAlgo ? documento : null,
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
        checkinUrl: datos.checkinUrl ?? null,
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
                  {/* Tarifas adicionales obligatorias: ya están dentro del
                      total, y se enseñan para que el huésped sepa qué paga. */}
                  {(u.desglose.tarifas ?? 0) > 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t.tarifasTotal}</span>
                      <span>{formatearImporte(u.desglose.tarifas ?? 0, moneda)}</span>
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
              paisTelefono={paisTelefono}
              setPaisTelefono={setPaisTelefono}
              notas={notas}
              setNotas={setNotas}
              extras={extrasDisponibles}
              extrasSeleccion={extrasSeleccion}
              setExtrasSeleccion={setExtrasSeleccion}
              tarifasOpcionales={tarifasOpcionalesDisponibles}
              tarifasSeleccion={tarifasSeleccion}
              setTarifasSeleccion={setTarifasSeleccion}
              codigo={codigo}
              setCodigo={setCodigo}
              promocion={promocion}
              errorPromo={errorPromo}
              aplicandoPromo={aplicandoPromo}
              aplicarCodigo={aplicarCodigo}
              quitarCodigo={quitarCodigo}
              documento={documento}
              setDocumento={setDocumento}
              totalExtrasEstimado={totalExtrasEstimado}
              totalTarifasEstimado={totalTarifasEstimado}
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
              paisTelefono={paisTelefono}
              setPaisTelefono={setPaisTelefono}
              notas={notas}
              setNotas={setNotas}
              extras={extrasDisponibles}
              extrasSeleccion={extrasSeleccion}
              setExtrasSeleccion={setExtrasSeleccion}
              tarifasOpcionales={tarifasOpcionalesDisponibles}
              tarifasSeleccion={tarifasSeleccion}
              setTarifasSeleccion={setTarifasSeleccion}
              codigo={codigo}
              setCodigo={setCodigo}
              promocion={promocion}
              errorPromo={errorPromo}
              aplicandoPromo={aplicandoPromo}
              aplicarCodigo={aplicarCodigo}
              quitarCodigo={quitarCodigo}
              documento={documento}
              setDocumento={setDocumento}
              totalExtrasEstimado={totalExtrasEstimado}
              totalTarifasEstimado={totalTarifasEstimado}
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
            {/* Check-in online: el registro de viajeros se completa desde aquí, así
                el parte sale sin que el hotel persiga a nadie. El enlace es del
                huésped (su token); sin token no se enseña nada. */}
            {resultado.checkinUrl ? (
              <Button variant="outline" asChild>
                <a href={resultado.checkinUrl}>{t.completarCheckin}</a>
              </Button>
            ) : null}
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
  paisTelefono,
  setPaisTelefono,
  notas,
  setNotas,
  extras,
  extrasSeleccion,
  setExtrasSeleccion,
  tarifasOpcionales,
  tarifasSeleccion,
  setTarifasSeleccion,
  codigo,
  setCodigo,
  promocion,
  errorPromo,
  aplicandoPromo,
  aplicarCodigo,
  quitarCodigo,
  documento,
  setDocumento,
  totalExtrasEstimado,
  totalTarifasEstimado,
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
  paisTelefono: string;
  setPaisTelefono: (v: string) => void;
  notas: string;
  setNotas: (v: string) => void;
  /** Catálogo activo de extras de la propiedad elegida. */
  extras: ExtraPublicoUI[];
  extrasSeleccion: Record<string, number>;
  setExtrasSeleccion: (v: Record<string, number>) => void;
  /** Tarifas adicionales OPCIONALES (las obligatorias ya están en el total). */
  tarifasOpcionales: TarifaPublicaUI[];
  tarifasSeleccion: string[];
  setTarifasSeleccion: (v: string[]) => void;
  codigo: string;
  setCodigo: (v: string) => void;
  /** Descuento confirmado por el servidor; null = sin código aplicado. */
  promocion: { codigo: string; descuento: number } | null;
  errorPromo: string | null;
  aplicandoPromo: boolean;
  aplicarCodigo: () => void;
  quitarCodigo: () => void;
  documento: DocumentoUI;
  setDocumento: (v: DocumentoUI) => void;
  totalExtrasEstimado: number;
  totalTarifasEstimado: number;
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
          <CampoTelefonoConPais
            telefono={telefono}
            pais={paisTelefono}
            onTelefono={setTelefono}
            onPais={setPaisTelefono}
            className="sm:min-w-[260px]"
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="notas">{t.peticiones}</Label>
          <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={t.peticionesPlaceholder} />
        </div>
      </div>
      {/* Extras: se ofrecen en el paso de datos, cuando el huésped ya sabe dónde y
          cuándo. La cantidad es la única decisión suya — el importe lo fija el
          catálogo activo del servidor, así que lo que se enseña aquí es una
          estimación y el total definitivo lo confirma la reserva. */}
      {extras.length > 0 ? (
        <div className="grid gap-3 rounded-md border p-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
              {t.extrasTitulo}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.extrasAyuda}</p>
          </div>
          {extras.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">
                  {e.nombre}{' '}
                  <span className="text-xs text-muted-foreground">
                    {formatearImporte(e.precio, moneda)}
                    {e.precioPorNoche ? ` ${t.extraPorNoche}` : ''}
                  </span>
                </p>
                {e.descripcion ? (
                  <p className="text-xs text-muted-foreground">{e.descripcion}</p>
                ) : null}
              </div>
              <select
                className="h-9 w-16 shrink-0 rounded-md border bg-background text-sm"
                aria-label={`${t.extrasCantidad} · ${e.nombre}`}
                value={String(extrasSeleccion[e.id] || 0)}
                onChange={(ev) =>
                  setExtrasSeleccion({ ...extrasSeleccion, [e.id]: Number(ev.target.value) })
                }
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {totalExtrasEstimado > 0 ? (
            <div className="flex justify-between border-t pt-2 text-sm">
              <span>{t.extrasTotal}</span>
              <span className="font-medium">{formatearImporte(totalExtrasEstimado, moneda)}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Tarifas adicionales opcionales (mascota, cama extra…): a diferencia de
          los extras no son productos, son cargos de la estancia. Las
          obligatorias no aparecen aquí: ya están sumadas en el precio. */}
      {tarifasOpcionales.length > 0 ? (
        <div className="grid gap-3 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">{t.tarifasTitulo}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.tarifasAyuda}</p>
          </div>
          {tarifasOpcionales.map((f) => (
            <label key={f.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 rounded border"
                  checked={tarifasSeleccion.includes(f.id)}
                  onChange={(ev) =>
                    setTarifasSeleccion(
                      ev.target.checked
                        ? [...tarifasSeleccion, f.id]
                        : tarifasSeleccion.filter((id) => id !== f.id)
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate">{f.nombre}</span>
                  {f.descripcion ? (
                    <span className="block text-xs text-muted-foreground">{f.descripcion}</span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-muted-foreground">
                {formatearImporte(f.importe, moneda)}{' '}
                <span className="text-xs">{t.tarifaPorEstancia}</span>
              </span>
            </label>
          ))}
          {totalTarifasEstimado > 0 ? (
            <div className="flex justify-between border-t pt-2 text-sm">
              <span>{t.tarifasTotal}</span>
              <span className="font-medium">{formatearImporte(totalTarifasEstimado, moneda)}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Código promocional: el descuento se aplica al alojamiento y lo calcula
          el servidor. Lo que se enseña aquí es su respuesta, no una cuenta del
          navegador; al reservar se vuelve a evaluar. */}
      <div className="grid gap-2 rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">{t.promocionTitulo}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.promocionAyuda}</p>
        </div>
        {promocion ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-emerald-600 dark:text-emerald-400">
              {interpolar(t.promocionAplicada, {
                importe: formatearImporte(promocion.descuento, moneda),
              })}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={quitarCodigo}>
              {t.promocionQuitar}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={codigo}
              onChange={(ev) => setCodigo(ev.target.value.toUpperCase())}
              placeholder={t.promocionPlaceholder}
              className="uppercase"
              aria-label={t.promocionTitulo}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={aplicarCodigo}
              disabled={aplicandoPromo || !codigo.trim()}
            >
              {t.promocionAplicar}
            </Button>
          </div>
        )}
        {errorPromo ? <p className="text-xs text-destructive">{errorPromo}</p> : null}
      </div>

      {/* Registro de viajeros (RD 933/2021): opcional y sin fricción — lo que no
          se deje aquí se completa desde el enlace de check-in que llega al
          confirmar. Solo se envía al servidor si el huésped escribió algo. */}
      <div className="grid gap-3 rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">{t.documentoTitulo}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.documentoAyuda}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="tipoDocumento">{t.documentoTipo}</Label>
            <select
              id="tipoDocumento"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={documento.tipoDocumento}
              onChange={(ev) => setDocumento({ ...documento, tipoDocumento: ev.target.value })}
            >
              <option value="">{t.documentoNinguno}</option>
              <option value="dni">{t.documentoDni}</option>
              <option value="nie">{t.documentoNie}</option>
              <option value="pasaporte">{t.documentoPasaporte}</option>
              <option value="otro">{t.documentoOtro}</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="numeroDocumento">{t.documentoNumero}</Label>
            <Input
              id="numeroDocumento"
              value={documento.numeroDocumento}
              onChange={(ev) => setDocumento({ ...documento, numeroDocumento: ev.target.value })}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="fechaNacimiento">{t.documentoNacimiento}</Label>
            <Input
              id="fechaNacimiento"
              type="date"
              value={documento.fechaNacimiento}
              onChange={(ev) => setDocumento({ ...documento, fechaNacimiento: ev.target.value })}
            />
          </div>
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
