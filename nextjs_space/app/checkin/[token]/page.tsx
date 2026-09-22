'use client';

/**
 * Check-in online del huésped (registro de viajeros, RD 933/2021).
 *
 * Es la superficie donde el huésped —no el hotel— completa los documentos de su
 * grupo, que es lo que hace que el parte de viajeros salga sin intervención del
 * operador. Se llega por el enlace del email de pre-llegada (`/checkin/<token>`),
 * que es la credencial: no hay sesión.
 *
 * Es móvil primero (el huésped lo abre desde el teléfono) y bilingüe con el
 * MISMO patrón que el motor de reservas: servidor y primer render pintan
 * español y un efecto isomórfico aplica `?lang=` antes del primer paint, sin
 * destello ni mismatch de hidratación. Los textos y las etiquetas de cada campo
 * viven en `lib/hospitality/booking-i18n.ts` (`CHECKIN_TEXTOS`), indexadas por
 * `CampoViajero`: un campo nuevo no compila hasta que sabe decirse en los dos
 * idiomas.
 *
 * Nada se inventa ni se deduce: lo que falta se muestra como «revisa estos
 * datos», y el botón guarda lo que haya (el huésped puede volver al enlace).
 */

import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, HelpCircle, Languages, Loader2, Plus, ShieldCheck, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CHECKIN_TEXTOS,
  IDIOMAS,
  IDIOMA_POR_DEFECTO,
  etiquetasDeCampos,
  idiomaDesdeUrl,
  interpolar,
  type Idioma,
} from '@/lib/hospitality/booking-i18n';
import type { CampoViajero, DocumentacionReserva, ViajeroCheckin } from '@/lib/hospitality/guest-checkin';
import type { PreguntaCheckin } from '@/lib/hospitality/checkin-preguntas';

/** Ficha editable del formulario (la dirección se edita por partes). */
interface Borrador {
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
    direccionComplementaria: string;
    codigoPostal: string;
    pais: string;
    codigoMunicipio: string;
    nombreMunicipio: string;
  };
  telefono: string;
  correo: string;
  parentesco: string;
}

interface Estado {
  referencia: string;
  estado: string;
  checkIn: string;
  checkOut: string;
  propiedad: string | null;
  ciudad: string | null;
  unidad: string | null;
  viajeros: ViajeroCheckin[];
  documentacion: DocumentacionReserva;
  /** Preguntas personalizadas del hotel (ausente si no definió ninguna). */
  preguntas?: PreguntaCheckin[];
  /** Respuestas ya guardadas del huésped (para no reescribirlas). */
  respuestas?: Record<string, string> | null;
}

function borradorVacio(): Borrador {
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
    direccion: {
      direccion: '',
      direccionComplementaria: '',
      codigoPostal: '',
      pais: '',
      codigoMunicipio: '',
      nombreMunicipio: '',
    },
    telefono: '',
    correo: '',
    parentesco: '',
  };
}

/** Lo que ya hay guardado → borrador editable (sin perder ningún campo). */
function aBorrador(v: Partial<ViajeroCheckin>): Borrador {
  return {
    ...borradorVacio(),
    nombre: v.nombre ?? '',
    apellido1: v.apellido1 ?? '',
    apellido2: v.apellido2 ?? '',
    tipoDocumento: v.tipoDocumento ?? '',
    numeroDocumento: v.numeroDocumento ?? '',
    soporteDocumento: v.soporteDocumento ?? '',
    fechaNacimiento: v.fechaNacimiento ?? '',
    nacionalidad: v.nacionalidad ?? '',
    sexo: v.sexo ?? '',
    telefono: v.telefono ?? '',
    correo: v.correo ?? '',
    parentesco: v.parentesco ?? '',
    direccion: {
      direccion: v.direccion?.direccion ?? '',
      direccionComplementaria: v.direccion?.direccionComplementaria ?? '',
      codigoPostal: v.direccion?.codigoPostal ?? '',
      pais: v.direccion?.pais ?? '',
      codigoMunicipio: v.direccion?.codigoMunicipio ?? '',
      nombreMunicipio: v.direccion?.nombreMunicipio ?? '',
    },
  };
}

export default function CheckinPublico() {
  const [idioma, setIdioma] = useState<Idioma>(IDIOMA_POR_DEFECTO);
  const [montado, setMontado] = useState(false);
  const useEfectoIsomorfico = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
  useEfectoIsomorfico(() => {
    setIdioma(idiomaDesdeUrl(window.location.search));
    setMontado(true);
  }, []);
  const t = CHECKIN_TEXTOS[idioma];

  const [token, setToken] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cerrada, setCerrada] = useState(false);
  const [noDisponible, setNoDisponible] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [borradores, setBorradores] = useState<Borrador[]>([borradorVacio()]);
  const [mismaDireccion, setMismaDireccion] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<{ completa: boolean; enviado: boolean } | null>(null);
  const [faltan, setFaltan] = useState<CampoViajero[]>([]);
  // Preguntas personalizadas del hotel: el GET trae la config y las respuestas
  // ya guardadas; el huésped las edita aquí y viajan en el mismo POST.
  const [preguntas, setPreguntas] = useState<PreguntaCheckin[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [faltanPreguntas, setFaltanPreguntas] = useState<string[]>([]);

  useEffect(() => {
    const partes = window.location.pathname.split('/').filter(Boolean);
    const i = partes.indexOf('checkin');
    setToken(i >= 0 && partes[i + 1] ? partes[i + 1] : null);
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/public/checkin/${token}`);
        if (res.status === 404) {
          setNoDisponible(true);
          return;
        }
        if (res.status === 410) {
          setCerrada(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t.errorGuardar);
        setEstado(data);
        setFaltan(data.documentacion?.faltan ?? []);
        setPreguntas(Array.isArray(data.preguntas) ? data.preguntas : []);
        setRespuestas(data.respuestas && typeof data.respuestas === 'object' ? data.respuestas : {});
        const guardados: Borrador[] = Array.isArray(data.viajeros) && data.viajeros.length > 0
          ? data.viajeros.map((v: Partial<ViajeroCheckin>) => aBorrador(v))
          : [borradorVacio()];
        setBorradores(guardados);
      } catch {
        setNoDisponible(true);
      } finally {
        setCargando(false);
      }
    })();
  }, [token, t.errorGuardar]);

  const actualizar = useCallback((indice: number, cambios: Partial<Borrador>) => {
    setBorradores((previos) => previos.map((b, i) => (i === indice ? { ...b, ...cambios } : b)));
  }, []);

  const actualizarDireccion = useCallback((indice: number, cambios: Partial<Borrador['direccion']>) => {
    setBorradores((previos) =>
      previos.map((b, i) => (i === indice ? { ...b, direccion: { ...b.direccion, ...cambios } } : b))
    );
  }, []);

  const guardar = async () => {
    if (!token) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/public/checkin/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viajeros: borradores,
          heredarDireccion: mismaDireccion,
          respuestas,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFaltan(data.faltan ?? []);
        throw new Error(data.error || t.errorGuardar);
      }
      const faltanAhora: CampoViajero[] = data.documentacion?.faltan ?? [];
      setFaltan(faltanAhora);
      setFaltanPreguntas(Array.isArray(data.faltanPreguntas) ? data.faltanPreguntas : []);
      setGuardado({
        completa: Boolean(data.documentacion?.completa),
        enviado: Boolean(data.envio?.enviado),
      });
      toast.success(
        data.documentacion?.completa
          ? t.guardadoCompleto
          : interpolar(t.guardadoParcial, { campos: etiquetasDeCampos(faltanAhora, idioma) })
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.errorGuardar);
    } finally {
      setGuardando(false);
    }
  };

  if (noDisponible || cerrada) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-muted/40">
        <Card className="max-w-sm w-full">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {cerrada ? t.caducada : t.noDisponible}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 bg-muted/40">
      <div className="max-w-2xl mx-auto space-y-4 pb-12">
        <header className="pt-4 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Badge variant="outline" className="mb-2 gap-1">
                <ShieldCheck className="h-3 w-3" /> {t.titulo}
              </Badge>
              <h1 className="text-xl font-bold">{estado?.propiedad || '…'}</h1>
            </div>
            {montado && <ConmutadorIdioma actual={idioma} />}
          </div>
          <p className="text-sm text-muted-foreground">{t.intro}</p>
          {estado && (
            <p className="text-xs text-muted-foreground">
              {interpolar('{referencia} · {llegada} — {salida}', {
                referencia: estado.referencia,
                llegada: fecha(estado.checkIn, idioma),
                salida: fecha(estado.checkOut, idioma),
              })}
              {estado.unidad ? ` · ${estado.unidad}` : ''}
            </p>
          )}
        </header>

        {cargando ? (
          <Card>
            <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t.guardando}
            </CardContent>
          </Card>
        ) : (
          <>
            <EstadoDocumentacion
              idioma={idioma}
              completa={guardado ? guardado.completa : estado?.documentacion?.completa ?? false}
              faltan={faltan}
            />

            {borradores.map((borrador, indice) => (
              <FichaViajero
                key={indice}
                idioma={idioma}
                indice={indice}
                borrador={borrador}
                onCambio={(cambios) => actualizar(indice, cambios)}
                onCambioDireccion={(cambios) => actualizarDireccion(indice, cambios)}
                onQuitar={
                  indice === 0
                    ? undefined
                    : () => setBorradores((previos) => previos.filter((_, i) => i !== indice))
                }
              />
            ))}

            {borradores.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={mismaDireccion} onCheckedChange={(v) => setMismaDireccion(v === true)} />
                {t.mismaDireccion}
              </label>
            )}

            {preguntas.length > 0 && (
              <PreguntasHotel
                idioma={idioma}
                preguntas={preguntas}
                respuestas={respuestas}
                onCambio={(id, valor) => setRespuestas((previos) => ({ ...previos, [id]: valor }))}
                faltanPreguntas={faltanPreguntas}
              />
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setBorradores((previos) => [...previos, borradorVacio()])}
                disabled={borradores.length >= 30}
              >
                <Plus className="mr-1 h-4 w-4" /> {t.agregar}
              </Button>
              <Button onClick={guardar} disabled={guardando}>
                {guardando ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                )}
                {guardando ? t.guardando : t.guardar}
              </Button>
            </div>

            {guardado && (
              <Card className="border-emerald-200 bg-emerald-50">
                <CardContent className="p-4 text-sm text-emerald-900 space-y-1">
                  <p className="font-medium">
                    {guardado.completa ? t.guardadoCompleto : interpolar(t.guardadoParcial, { campos: etiquetasDeCampos(faltan, idioma) })}
                  </p>
                  {guardado.enviado && <p>{t.enviado}</p>}
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground">{t.privacidad}</p>
            <Catalogos />
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Preguntas personalizadas del hotel (asunto del hotel; NUNCA viajan al parte
 * del Ministerio — el XSD es cerrado y un elemento extra lo rechazaría).
 */
function PreguntasHotel({
  idioma,
  preguntas,
  respuestas,
  onCambio,
  faltanPreguntas,
}: {
  idioma: Idioma;
  preguntas: PreguntaCheckin[];
  respuestas: Record<string, string>;
  onCambio: (id: string, valor: string) => void;
  faltanPreguntas: string[];
}) {
  const t = CHECKIN_TEXTOS[idioma];
  const preguntasFaltan = preguntas.filter((p) => faltanPreguntas.includes(p.id));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-1">
          <HelpCircle className="h-3.5 w-3.5" /> {t.preguntasTitulo}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {preguntas.map((p) => {
            const etiqueta = t === CHECKIN_TEXTOS.es ? p.es : p.en;
            const valor = respuestas[p.id] ?? '';
            const opcional = !p.requerida ? ` ${t.preguntaOpcional}` : '';
            return (
              <Campo key={p.id} etiqueta={etiqueta + opcional}>
                {p.tipo === 'opcion' ? (
                  <Select value={valor || undefined} onValueChange={(v) => onCambio(p.id, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t.preguntaElige} />
                    </SelectTrigger>
                    <SelectContent>
                      {(idioma === 'en' ? p.opciones?.en : p.opciones?.es)?.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={p.tipo === 'numero' ? 'number' : p.tipo === 'fecha' ? 'date' : 'text'}
                    value={valor}
                    onChange={(e) => onCambio(p.id, e.target.value)}
                  />
                )}
              </Campo>
            );
          })}
        </div>
        {preguntasFaltan.length > 0 && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
            {interpolar(t.preguntasFaltan, {
              preguntas: preguntasFaltan.map((p) => (t === CHECKIN_TEXTOS.es ? p.es : p.en)).join(', '),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Estado de la documentación: completa o con la lista de lo que hay que revisar. */
function EstadoDocumentacion({
  idioma,
  completa,
  faltan,
}: {
  idioma: Idioma;
  completa: boolean;
  faltan: CampoViajero[];
}) {
  const t = CHECKIN_TEXTOS[idioma];
  return (
    <Card className={completa ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}>
      <CardContent className="p-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Badge variant="outline">{completa ? t.completa : t.incompleta}</Badge>
        </div>
        {!completa && faltan.length > 0 && (
          <p className="mt-2 text-amber-900">{interpolar(t.pendiente, { campos: etiquetasDeCampos(faltan, idioma) })}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Ficha de un viajero: titular (índice 0) o acompañante. */
function FichaViajero({
  idioma,
  indice,
  borrador,
  onCambio,
  onCambioDireccion,
  onQuitar,
}: {
  idioma: Idioma;
  indice: number;
  borrador: Borrador;
  onCambio: (cambios: Partial<Borrador>) => void;
  onCambioDireccion: (cambios: Partial<Borrador['direccion']>) => void;
  onQuitar?: () => void;
}) {
  const t = CHECKIN_TEXTOS[idioma];
  const c = t.campos;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {indice === 0 ? t.titular : interpolar(t.acompanante, { n: indice })}
          </h2>
          {onQuitar && (
            <Button variant="ghost" size="sm" onClick={onQuitar}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> {t.quitar}
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta={c.nombre}>
            <Input value={borrador.nombre} onChange={(e) => onCambio({ nombre: e.target.value })} autoComplete="given-name" />
          </Campo>
          <Campo etiqueta={c.apellido1}>
            <Input value={borrador.apellido1} onChange={(e) => onCambio({ apellido1: e.target.value })} autoComplete="family-name" />
          </Campo>
          <Campo etiqueta={c.apellido2}>
            <Input value={borrador.apellido2} onChange={(e) => onCambio({ apellido2: e.target.value })} />
          </Campo>
          <Campo etiqueta={c.fechaNacimiento}>
            <Input type="date" value={borrador.fechaNacimiento} onChange={(e) => onCambio({ fechaNacimiento: e.target.value })} />
          </Campo>
          <Campo etiqueta={c.tipoDocumento} ayuda={t.ayudaDocumento}>
            <Input
              list="tipos-documento"
              value={borrador.tipoDocumento}
              onChange={(e) => onCambio({ tipoDocumento: e.target.value })}
            />
          </Campo>
          <Campo etiqueta={c.numeroDocumento}>
            <Input value={borrador.numeroDocumento} onChange={(e) => onCambio({ numeroDocumento: e.target.value })} />
          </Campo>
          <Campo etiqueta={c.soporteDocumento} ayuda={t.ayudaSoporte}>
            <Input value={borrador.soporteDocumento} onChange={(e) => onCambio({ soporteDocumento: e.target.value })} />
          </Campo>
          <Campo etiqueta={c.nacionalidad}>
            <Input
              list="paises"
              maxLength={3}
              value={borrador.nacionalidad}
              onChange={(e) => onCambio({ nacionalidad: e.target.value })}
            />
          </Campo>
          <Campo etiqueta={c.sexo}>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={borrador.sexo}
              onChange={(e) => onCambio({ sexo: e.target.value })}
            >
              <option value="" />
              <option value="H">H</option>
              <option value="M">M</option>
            </select>
          </Campo>
          {/* Los dos campos juntos cubren el `contacto` que exige el servicio:
              con teléfono o email basta, no hacen falta los dos. */}
          <Campo etiqueta={t.campoTelefono}>
            <Input value={borrador.telefono} onChange={(e) => onCambio({ telefono: e.target.value })} autoComplete="tel" />
          </Campo>
          <Campo etiqueta={t.campoEmail}>
            <Input
              type="email"
              value={borrador.correo}
              onChange={(e) => onCambio({ correo: e.target.value })}
              autoComplete="email"
            />
          </Campo>
          <Campo etiqueta={c.parentesco}>
            <Input value={borrador.parentesco} onChange={(e) => onCambio({ parentesco: e.target.value })} />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t">
          <Campo etiqueta={c['direccion.calle']}>
            <Input
              value={borrador.direccion.direccion}
              onChange={(e) => onCambioDireccion({ direccion: e.target.value })}
              autoComplete="street-address"
            />
          </Campo>
          <Campo etiqueta={c['direccion.codigoPostal']}>
            <Input
              value={borrador.direccion.codigoPostal}
              onChange={(e) => onCambioDireccion({ codigoPostal: e.target.value })}
              autoComplete="postal-code"
            />
          </Campo>
          <Campo etiqueta={c['direccion.pais']} ayuda={t.ayudaPais}>
            <Input
              list="paises"
              maxLength={3}
              value={borrador.direccion.pais}
              onChange={(e) => onCambioDireccion({ pais: e.target.value })}
              autoComplete="country"
            />
          </Campo>
          <Campo etiqueta={c['direccion.municipio']} ayuda={t.ayudaMunicipio}>
            <Input
              value={borrador.direccion.codigoMunicipio}
              onChange={(e) => onCambioDireccion({ codigoMunicipio: e.target.value })}
            />
          </Campo>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Sugerencias de los catálogos (una sola vez para toda la página: el `id` de un
 * `<datalist>` es único en el documento). Los catálogos los publica el propio
 * servicio del Ministerio y aquí solo se ofrecen los códigos del ejemplo
 * oficial: son sugerencias, el campo acepta cualquier código del catálogo.
 */
function Catalogos() {
  return (
    <>
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
    </>
  );
}

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
}) {
  // La etiqueta envuelve al campo a propósito: en un móvil, tocar el texto
  // enfoca el input, y el campo queda asociado (lectores de pantalla y tests).
  return (
    <label className="block text-sm">
      <Label className="font-medium">{etiqueta}</Label>
      {children}
      {ayuda && <p className="mt-1 text-xs text-muted-foreground">{ayuda}</p>}
    </label>
  );
}

/** Fecha corta localizada (la del resumen de la estancia). */
function fecha(valor: string | null | undefined, idioma: Idioma): string {
  if (!valor) return '';
  return new Date(valor).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-MX', {
    day: 'numeric',
    month: 'short',
  });
}

/** Conmutador ES/EN: recarga la misma página cambiando solo `lang`. */
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
          <span key={idioma} className="font-semibold text-foreground uppercase">
            {idioma}
          </span>
        ) : (
          <a key={idioma} href={href} className="uppercase hover:text-foreground hover:underline">
            {idioma}
          </a>
        );
      })}
    </div>
  );
}
