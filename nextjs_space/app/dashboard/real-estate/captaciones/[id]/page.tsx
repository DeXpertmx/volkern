'use client';

/**
 * Volkern Real Estate — Detalle de una captación.
 *
 * La vista que faltaba: el contrato con el propietario y el inmueble que
 * sostiene. Todo lo demás del modelo —exclusividad, comisión, plazos— se ordena
 * alrededor de esos dos vínculos.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { formatearImporte, formatearNumero } from '@/lib/moneda';
import {
  CAPTACION_ESTADOS,
  calcularComisionCaptacion,
  etiquetaEstadoCaptacion,
  etiquetaTipoCaptacion,
  primeraImagenInmueble,
  type CaptacionEstado,
  type CaptacionWire,
} from '@/lib/real-estate/captacion-shared';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Building2,
  FileSignature,
  ShieldCheck,
  ShieldOff,
  Percent,
  CalendarDays,
  Loader2,
  Trash2,
  ExternalLink,
  RefreshCw,
  FileText,
  UserCircle2,
  PenLine,
} from 'lucide-react';
import { RealEstateModuleNav } from '@/components/real-estate/RealEstateModuleNav';
import { OwnerCard } from '@/components/real-estate/OwnerCard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatearFecha = (valor: string | null | undefined, largo = false) =>
  valor
    ? new Date(valor).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: largo ? 'long' : 'short',
        year: 'numeric',
      })
    : '—';

const formatearFechaHora = (valor: string | null | undefined) =>
  valor ? new Date(valor).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

/** Estado de vigencia con el que se resume el contrato de un vistazo. */
function resumenVigencia(captacion: CaptacionWire) {
  const fin = new Date(captacion.fechaFin).getTime();
  const dias = Math.round((fin - Date.now()) / 86_400_000);

  if (captacion.estado === 'borrador') {
    return { texto: 'Pendiente de firma', clase: 'text-muted-foreground', activo: false };
  }
  if (captacion.estado === 'cancelada') {
    return { texto: 'Contrato rescindido', clase: 'text-rose-600', activo: false };
  }
  if (captacion.estado === 'cerrada') {
    return { texto: 'Operación cerrada durante la vigencia', clase: 'text-blue-600', activo: false };
  }
  if (dias < 0) {
    return { texto: `Venció hace ${formatearNumero(Math.abs(dias))} días`, clase: 'text-amber-600', activo: false };
  }
  return {
    texto: dias === 0 ? 'Vence hoy' : `Vigente · quedan ${formatearNumero(dias)} días`,
    clase: 'text-emerald-600',
    activo: true,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CaptacionDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [captacion, setCaptacion] = useState<CaptacionWire | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [guardandoEstado, setGuardandoEstado] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const fetchCaptacion = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    try {
      const res = await apiFetch(`/api/real-estate/captaciones/${id}`);
      if (res.ok) {
        setCaptacion(await res.json());
        setNoEncontrada(false);
      } else if (res.status === 404) {
        setNoEncontrada(true);
      } else {
        toast.error('No se pudo cargar la captación');
      }
    } catch (error) {
      console.error('[CaptacionDetalle] Error:', error);
      toast.error('Error de conexión al cargar la captación');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCaptacion();
  }, [fetchCaptacion]);

  const comisionEstimada = useMemo(() => {
    if (!captacion) return 0;
    return calcularComisionCaptacion(
      captacion.precioOferta || 0,
      captacion.comisionPorcentaje,
      captacion.comisionFija
    );
  }, [captacion]);

  const cambiarEstado = async (estado: CaptacionEstado) => {
    if (!captacion || estado === captacion.estado) return;
    setGuardandoEstado(true);
    try {
      const res = await apiFetch(`/api/real-estate/captaciones/${captacion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      if (res.ok) {
        setCaptacion(await res.json());
        toast.success(`Estado actualizado a ${etiquetaEstadoCaptacion(estado).toLowerCase()}`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'No se pudo cambiar el estado');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setGuardandoEstado(false);
    }
  };

  const eliminar = async () => {
    if (!captacion) return;
    if (!confirm('¿Eliminar esta captación? Esta acción no se puede deshacer.')) return;
    setEliminando(true);
    try {
      const res = await apiFetch(`/api/real-estate/captaciones/${captacion.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Captación eliminada');
        router.push('/dashboard/real-estate/captaciones');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'No se pudo eliminar');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setEliminando(false);
    }
  };

  // ─── Estados de carga ───────────────────────────────────────────────────────

  if (cargando) {
    return (
      <div className="space-y-6 p-4 md:p-8 pt-6">
        <RealEstateModuleNav />
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-56" />
            <Skeleton className="h-72" />
          </div>
        </div>
      </div>
    );
  }

  if (noEncontrada || !captacion) {
    return (
      <div className="space-y-6 p-4 md:p-8 pt-6">
        <RealEstateModuleNav />
        <div className="text-center py-20">
          <FileSignature className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <h3 className="text-lg font-medium mb-2">Captación no encontrada</h3>
          <p className="text-muted-foreground mb-6">
            El contrato pudo eliminarse o pertenece a otra cuenta.
          </p>
          <Button asChild>
            <Link href="/dashboard/real-estate/captaciones">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a captaciones
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const vigencia = resumenVigencia(captacion);
  const moneda = captacion.comisionMoneda || captacion.propiedad?.moneda || '';
  const inmueble = captacion.propiedad;
  const imagen = primeraImagenInmueble(inmueble?.media);
  const estadoInfo = CAPTACION_ESTADOS.find((e) => e.value === captacion.estado);

  return (
    <div className="space-y-6 p-4 md:p-8 pt-6">
      <RealEstateModuleNav />

      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
            <Link href="/dashboard/real-estate/captaciones">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Captaciones
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
            <FileSignature className="h-8 w-8 text-primary" />
            {inmueble?.nombre || 'Captación'}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{etiquetaTipoCaptacion(captacion.tipoCaptacion)}</Badge>
            {estadoInfo && (
              <Badge variant="outline" className={`${estadoInfo.badge} border`}>
                {estadoInfo.label}
              </Badge>
            )}
            {captacion.esExclusiva ? (
              <Badge variant="outline" className="gap-1 border-indigo-200 bg-indigo-50 text-indigo-700">
                <ShieldCheck className="h-3 w-3" />
                Exclusiva
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <ShieldOff className="h-3 w-3" />
                Sin exclusividad
              </Badge>
            )}
            <span className={`text-sm font-medium ${vigencia.clase}`}>{vigencia.texto}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchCaptacion}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Select
            value={captacion.estado}
            onValueChange={(v) => cambiarEstado(v as CaptacionEstado)}
            disabled={guardandoEstado}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAPTACION_ESTADOS.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="text-destructive" onClick={eliminar} disabled={eliminando}>
            {eliminando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Columna principal */}
        <div className="md:col-span-2 space-y-6">
          {/* Contrato */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-primary" />
                Contrato
              </CardTitle>
              <CardDescription>
                {estadoInfo?.descripcion || 'Acuerdo de comercialización con el propietario'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <Dato etiqueta="Tipo">{etiquetaTipoCaptacion(captacion.tipoCaptacion)}</Dato>
                <Dato etiqueta="Estado">{etiquetaEstadoCaptacion(captacion.estado)}</Dato>
                <Dato etiqueta="Inicio">{formatearFecha(captacion.fechaInicio)}</Dato>
                <Dato etiqueta="Fin">{formatearFecha(captacion.fechaFin)}</Dato>
              </div>

              <Separator />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <Dato etiqueta="Firmado">
                  {captacion.fechaFirma ? formatearFecha(captacion.fechaFirma, true) : 'Sin firmar'}
                </Dato>
                <Dato etiqueta="Vencimiento previsto">
                  {captacion.fechaVencimiento ? formatearFecha(captacion.fechaVencimiento, true) : '—'}
                </Dato>
                <Dato etiqueta="Agente">
                  {captacion.creador?.name || captacion.creador?.email || '—'}
                </Dato>
                <Dato etiqueta="Creada">{formatearFechaHora(captacion.fechaCreacion)}</Dato>
              </div>

              <Separator />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <Dato etiqueta="Precio de oferta">
                  {formatearImporte(captacion.precioOferta, moneda, 0)}
                </Dato>
                <Dato etiqueta="Precio mínimo">
                  {formatearImporte(captacion.precioMinimo, moneda, 0)}
                </Dato>
                <Dato etiqueta="Última actualización">{formatearFechaHora(captacion.fechaActualizacion)}</Dato>
                <Dato etiqueta="Documento">
                  {captacion.documentoUrl ? (
                    <a
                      href={captacion.documentoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver contrato
                    </a>
                  ) : (
                    <span className="text-muted-foreground font-normal">Sin adjuntar</span>
                  )}
                </Dato>
              </div>
            </CardContent>
          </Card>

          {/* Exclusividad */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {captacion.esExclusiva ? (
                  <ShieldCheck className="h-5 w-5 text-indigo-500" />
                ) : (
                  <ShieldOff className="h-5 w-5 text-muted-foreground" />
                )}
                Exclusividad
              </CardTitle>
              <CardDescription>
                {captacion.esExclusiva
                  ? 'La agencia comercializa en solitario durante la vigencia del contrato'
                  : 'La comercialización no está reservada a la agencia'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {captacion.clausulasExclusividad ? (
                <div className="rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                  {captacion.clausulasExclusividad}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No se registraron cláusulas específicas de exclusividad.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Comisión */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Percent className="h-5 w-5 text-purple-500" />
                Comisión
              </CardTitle>
              <CardDescription>Retribución pactada por la comercialización</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                <Dato etiqueta="Porcentaje">
                  {captacion.comisionPorcentaje
                    ? `${formatearNumero(captacion.comisionPorcentaje, 2)}%`
                    : 'No pactado'}
                </Dato>
                <Dato etiqueta="Importe fijo">
                  {captacion.comisionFija ? formatearImporte(captacion.comisionFija, moneda, 0) : 'No pactado'}
                </Dato>
                <Dato etiqueta="Divisa">
                  {moneda ? moneda : <span className="text-muted-foreground font-normal">Sin definir</span>}
                </Dato>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Comisión sobre el precio ofertado</span>
                <span className="text-lg font-semibold text-primary">
                  {captacion.precioOferta ? formatearImporte(comisionEstimada, moneda, 0) : 'Sin precio ofertado'}
                </span>
              </div>

              {(captacion.comisionCondiciones || captacion.comisionNotas) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {captacion.comisionCondiciones && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                        Condiciones
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{captacion.comisionCondiciones}</p>
                    </div>
                  )}
                  {captacion.comisionNotas && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notas</p>
                      <p className="text-sm whitespace-pre-wrap">{captacion.comisionNotas}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Condiciones de pago y notas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <PenLine className="h-5 w-5 text-amber-500" />
                Condiciones y notas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Condiciones de pago
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {captacion.condicionesPago || <span className="text-muted-foreground">Sin especificar</span>}
                </p>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Notas para el cliente
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {captacion.notasCliente || <span className="text-muted-foreground">Sin notas</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notas internas</p>
                  <p className="text-sm whitespace-pre-wrap">
                    {captacion.notasInternas || <span className="text-muted-foreground">Sin notas</span>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          {/* Inmueble vinculado */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                Inmueble captado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {inmueble ? (
                <>
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
                    {imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagen} alt={inmueble.nombre} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Building2 className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{inmueble.nombre}</p>
                    <p className="text-sm text-primary font-semibold">
                      {formatearImporte(inmueble.precioBase, inmueble.moneda || moneda, 0)}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={`/dashboard/catalogo?edit=${inmueble.id}`}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Abrir en el catálogo
                    </Link>
                  </Button>
                </>
              ) : (
                <div className="text-center py-6">
                  <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Esta captación no tiene un inmueble vinculado.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Propietario */}
          {captacion.contactoPropietario ? (
            <OwnerCard
              owner={{
                name: captacion.contactoPropietario.nombre,
                phone: captacion.contactoPropietario.telefono,
                email: captacion.contactoPropietario.email,
                contactId: captacion.contactoPropietario.id,
              }}
              propertyName={inmueble?.nombre}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserCircle2 className="h-5 w-5 text-primary" />
                  Propietario
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center py-6">
                <UserCircle2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-4">
                  Esta captación no tiene un contacto propietario vinculado.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard/contactos">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Ir a contactos
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
