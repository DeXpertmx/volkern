'use client';

/**
 * Booking Engine — configuración de la reserva directa del alojamiento.
 *
 * Lo que se decide aquí es la política del canal directo: qué se publica, con qué
 * divisa, qué anticipo se pide y qué se cuenta al huésped. La disponibilidad y el
 * precio no se configuran aquí: los calcula el servidor con el mismo motor que
 * atiende a los canales, y por eso lo que el huésped ve reservando por la web es
 * exactamente lo que los canales tienen bloqueado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Globe,
  Loader2,
  Save,
  Copy,
  ExternalLink,
  CreditCard,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Link2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatearImporte, MONEDAS_SELECCIONABLES, nombreMoneda } from '@/lib/moneda';

interface PropiedadConfig {
  id: string;
  nombre: string;
  ciudad: string | null;
  estado: string;
  unidades: number;
  publicada: boolean;
}

interface RespuestaConfig {
  config: {
    slug: string;
    titulo: string | null;
    descripcion: string | null;
    emailContacto: string | null;
    telefonoContacto: string | null;
    moneda: string | null;
    politicaCancelacion: string | null;
    anticipoPorcentaje: number;
    tarifaLimpieza: number | null;
    requierePagoOnline: boolean;
    propiedadesPublicadas: string[];
    activo: boolean;
  } | null;
  moneda: string;
  monedaTenant: string | null;
  cobro: { disponible: boolean; estado: string; motivo?: string; stripeAccountId: string | null };
  enlaces: { publica: string; embed: string; codigo: string } | null;
  propiedades: PropiedadConfig[];
}

export default function BookingEnginePage() {
  const [datos, setDatos] = useState<RespuestaConfig | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slug, setSlug] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [emailContacto, setEmailContacto] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [moneda, setMoneda] = useState('');
  const [politicaCancelacion, setPoliticaCancelacion] = useState('');
  const [anticipo, setAnticipo] = useState('0');
  const [limpieza, setLimpieza] = useState('');
  const [requierePagoOnline, setRequierePagoOnline] = useState(false);
  const [activo, setActivo] = useState(true);
  const [publicadas, setPublicadas] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/hospitality/booking');
      const json = (await res.json()) as RespuestaConfig & { error?: string };
      if (!res.ok) {
        setError(json.error || 'No se pudo cargar la configuración.');
        return;
      }
      setDatos(json);
      const c = json.config;
      setSlug(c?.slug || '');
      setTitulo(c?.titulo || '');
      setDescripcion(c?.descripcion || '');
      setEmailContacto(c?.emailContacto || '');
      setTelefonoContacto(c?.telefonoContacto || '');
      // La divisa publicada es la del tenant mientras el tenant no elija otra.
      setMoneda(c?.moneda || json.monedaTenant || '');
      setPoliticaCancelacion(c?.politicaCancelacion || '');
      setAnticipo(String(c?.anticipoPorcentaje ?? 0));
      setLimpieza(c?.tarifaLimpieza != null ? String(c.tarifaLimpieza) : '');
      setRequierePagoOnline(c?.requierePagoOnline ?? false);
      setActivo(c?.activo ?? true);
      setPublicadas(c?.propiedadesPublicadas || []);
    } catch {
      setError('No se pudo cargar la configuración.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch('/api/hospitality/booking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          titulo,
          descripcion,
          emailContacto,
          telefonoContacto,
          moneda,
          politicaCancelacion,
          anticipoPorcentaje: Number(anticipo) || 0,
          tarifaLimpieza: limpieza === '' ? null : Number(limpieza),
          requierePagoOnline,
          propiedadesPublicadas: publicadas,
          activo,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'No se pudo guardar');
        return;
      }
      toast.success('Configuración guardada');
      await cargar();
    } catch {
      toast.error('No se pudo guardar la configuración');
    } finally {
      setGuardando(false);
    }
  };

  const copiar = async (texto: string, etiqueta: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${etiqueta} copiado`);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const alternarPropiedad = (id: string) => {
    setPublicadas((actual) =>
      actual.includes(id) ? actual.filter((p) => p !== id) : [...actual, id]
    );
  };

  const vistaPrevia = useMemo(() => (slug ? `/reservar/${slug}` : null), [slug]);
  const cobro = datos?.cobro;

  if (cargando) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Globe className="h-6 w-6" aria-hidden />
            Booking Engine
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Página pública para que el huésped reserve directo, sin comisión de canal. La reserva entra
            en el mismo motor que las de los canales: afecta al planning, a la disponibilidad y a las finanzas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => true} asChild disabled={!vistaPrevia}>
            <a href={vistaPrevia || '#'} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Ver página pública
            </a>
          </Button>
          <Button onClick={guardar} disabled={guardando || !slug}>
            {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Página pública</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="slug">Dirección</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/reservar/</span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="mi-alojamiento"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Es la dirección que compartes con tus huéspedes. Se normaliza a minúsculas y guiones.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="email">Email de contacto</Label>
                <Input
                  id="email"
                  type="email"
                  value={emailContacto}
                  onChange={(e) => setEmailContacto(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="telefono">Teléfono de contacto</Label>
                <Input id="telefono" value={telefonoContacto} onChange={(e) => setTelefonoContacto(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="h-4 w-4"
              />
              Publicar la página
            </label>
            <p className="text-xs text-muted-foreground">
              Desmarcado, el enlace deja de servir aunque siga circulando: es la forma de retirar la
              página sin borrarla.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" aria-hidden />
              Propiedades publicadas
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {datos?.propiedades.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no tienes propiedades. Créalas en la sección Propiedades para poder publicarlas.
              </p>
            ) : null}
            {datos?.propiedades.map((p) => (
              <label
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <span className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={publicadas.includes(p.id)}
                    onChange={() => alternarPropiedad(p.id)}
                  />
                  <span>
                    <span className="font-medium">{p.nombre}</span>
                    {p.ciudad ? <span className="text-muted-foreground"> · {p.ciudad}</span> : null}
                    <span className="block text-xs text-muted-foreground">
                      {p.unidades} {p.unidades === 1 ? 'unidad' : 'unidades'}
                    </span>
                  </span>
                </span>
                {p.unidades === 0 ? <Badge variant="outline">Sin unidades</Badge> : null}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Solo se publican las unidades vendibles y con precio: las que están en mantenimiento o sin
              tarifa no aparecen, y reservar por la web bloquea las mismas noches que los canales.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reserva y política</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Divisa publicada</Label>
                <Select value={moneda} onValueChange={setMoneda}>
                  <SelectTrigger>
                    <SelectValue placeholder="Divisa" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONEDAS_SELECCIONABLES.map((codigo) => (
                      <SelectItem key={codigo} value={codigo}>
                        {nombreMoneda(codigo)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="anticipo">Anticipo (%)</Label>
                <Input
                  id="anticipo"
                  type="number"
                  min={0}
                  max={100}
                  value={anticipo}
                  onChange={(e) => setAnticipo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">0 = no se pide anticipo.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="limpieza">Limpieza por estancia</Label>
                <Input
                  id="limpieza"
                  type="number"
                  min={0}
                  step="0.01"
                  value={limpieza}
                  onChange={(e) => setLimpieza(e.target.value)}
                  placeholder="Sin cargo"
                />
                <p className="text-xs text-muted-foreground">
                  Se cobra como línea de la reserva; en blanco no se cobra.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="politica">Política de cancelación</Label>
              <Textarea
                id="politica"
                value={politicaCancelacion}
                onChange={(e) => setPoliticaCancelacion(e.target.value)}
                rows={3}
                placeholder="Se cuenta al huésped antes de reservar."
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={requierePagoOnline}
                onChange={(e) => setRequierePagoOnline(e.target.checked)}
              />
              <span>
                Exigir pago online para confirmar
                <span className="block text-xs text-muted-foreground">
                  Sin esta opción, la reserva entra confirmada y el cobro se gestiona por tu cuenta.
                </span>
              </span>
            </label>

            {requierePagoOnline && !cobro?.disponible ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No se puede exigir pago online todavía: {cobro?.motivo || 'la cuenta de cobro no está habilitada.'}{' '}
                  Hasta que lo esté, la página no aceptará reservas (es preferible a dejar una reserva
                  pendiente que nadie puede pagar).
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" aria-hidden />
              Cobro
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {cobro?.disponible ? (
              <span className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Cuenta de cobro conectada y habilitada
              </span>
            ) : (
              <span className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {cobro?.motivo || 'Cuenta de cobro sin conectar'}
              </span>
            )}
            <p className="text-xs text-muted-foreground">
              El importe de una reserva directa se cobra en la cuenta del alojamiento, no en la de
              Volkern: Volkern no retiene el dinero de nadie. Mientras la cuenta no esté habilitada, las
              reservas directas funcionan sin pago online y las cobras tú.
            </p>
            {datos?.moneda ? (
              <p className="text-xs text-muted-foreground">
                Los precios se publican en {nombreMoneda(moneda || datos.moneda)}.
                {limpieza ? ` Limpieza por estancia: ${formatearImporte(Number(limpieza), moneda || datos.moneda)}.` : ''}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {datos?.enlaces ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" aria-hidden />
              Enlaces y widget
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <div className="grid gap-2">
              <Label>Página pública</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={datos.enlaces.publica} />
                <Button variant="outline" size="sm" onClick={() => copiar(datos.enlaces!.publica, 'Enlace')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Widget para tu web</Label>
              <div className="flex items-start gap-2">
                <Textarea readOnly value={datos.enlaces.codigo} rows={3} className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => copiar(datos.enlaces!.codigo, 'Código')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pega ese fragmento en tu web y la reserva ocurre dentro de Volkern.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {datos?.enlaces ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" aria-hidden />
              Previsualización
            </CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              src={datos.enlaces.publica}
              title="Previsualización del Booking Engine"
              className="h-[640px] w-full rounded-md border"
              loading="lazy"
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
