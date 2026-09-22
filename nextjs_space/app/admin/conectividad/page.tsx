'use client';

import { useEffect, useState } from 'react';
import {
  Plug,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  ShieldCheck,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  TestTube2,
  Server,
  DoorOpen,
  Tags,
  RefreshCcw,
  Scale,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
// Regla compartida: una reserva viva es la que puede cancelarse; el criterio
// no se copia en la UI (docs/hospitality-estados-auditoria.md).
import { esReservaViva } from '@/lib/hospitality/estados';
// Misma regla que la API: el diagnóstico se deriva del último fallo, no se
// almacena — la MISMA función produce la causa del badge y la de la tabla.
import { causaDeFalloConectividad, type CausaConectividad } from '@/lib/hospitality/conectividad-causa';
import { sanitizarRespuestaExterna } from '@/lib/hospitality/conectividad-secreto';

interface EstadoConectividad {
  configurado: boolean;
  estado: string;
  nombre: string;
  partnerId: string;
  username: string;
  tieneCredenciales: boolean;
  ultimaSincronizacion: string | null;
  ultimoEvento: string | null;
  /** Última verificación activa (health-check diario o botón «Probar»). */
  ultimaVerificacion?: string | null;
  contadorErrores: number;
  /** Último fallo de la capa en crudo (sin secretos): alimenta el diagnóstico del badge. */
  ultimoFallo?: {
    httpStatus: number | null;
    errorMensaje: string | null;
    fechaCreacion: string;
  } | null;
}

/** Estado de sincronización por propiedad (plan maestro §29). */
interface EventoSync {
  fecha: string;
  tipo: string;
  estado: string;
  detalle?: string | null;
}

/** Reserva interna activa que el proveedor ya no reporta (divergencia). */
interface Divergencia {
  reservationId: string;
  syncLogId: string;
  syncLogFecha: string;
  tenantNombre: string | null;
  propertyNombre: string | null;
  externalBookingId: string;
  channel: string;
  checkIn: string | null;
  checkOut: string | null;
  unidad: string | null;
  huespedes: number | null;
  veces: number;
  estadoActual: string | null;
  reservaExiste: boolean;
}

interface EstadoPropiedad {
  propertyId: string;
  property: string;
  tenant: string;
  hotelCode: string | null;
  mappingEstado: string;
  ultimoWebhook: {
    fecha: string;
    action: string;
    channel: string | null;
    estado: string;
    error: string | null;
  } | null;
  ultimoPush: EventoSync | null;
  ultimoFetch: EventoSync | null;
  ultimoError: EventoSync | null;
  /** Causa en palabras del último fallo (credenciales rechazadas ≠ sin respuesta). */
  causaUltimoError?: CausaConectividad | null;
  contadorErrores: number;
  webhooksTotales: number;
  webhooksFallidos: number;
}

/** "hace 2 min" a partir de una fecha ISO; "—" si no hay dato. */
function hace(fecha?: string | null): string {
  if (!fecha) return '—';
  try {
    return formatDistanceToNow(new Date(fecha), { addSuffix: true, locale: es });
  } catch {
    return '—';
  }
}

const ESTADO_LABEL: Record<string, { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  sin_configurar: { text: 'Sin configurar', variant: 'secondary' },
  configurado: { text: 'Configurado', variant: 'outline' },
  conectado: { text: 'Conectado', variant: 'default' },
  error: { text: 'Error', variant: 'destructive' },
};

export default function AdminConectividad() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [estado, setEstado] = useState<EstadoConectividad | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testHotel, setTestHotel] = useState('');
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    property?: any;
    hotelCode?: string;
    respuestaExterna?: unknown;
  } | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [propiedades, setPropiedades] = useState<EstadoPropiedad[]>([]);
  const [loadingPropiedades, setLoadingPropiedades] = useState(true);
  const [reconciliando, setReconciliando] = useState(false);
  const [reconciliacionResult, setReconciliacionResult] = useState<{
    ok: boolean;
    message?: string;
    totalCreadas?: number;
    totalActualizadas?: number;
    totalCanceladas?: number;
    totalDivergencias?: number;
    errores?: string[];
  } | null>(null);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [loadingDivergencias, setLoadingDivergencias] = useState(true);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [confirmarCancel, setConfirmarCancel] = useState<Divergencia | null>(null);

  useEffect(() => {
    loadEstado();
    loadPropiedades();
    loadDivergencias();
  }, []);

  const loadDivergencias = async () => {
    try {
      setLoadingDivergencias(true);
      const res = await fetch('/api/admin/conectividad/divergencias');
      if (!res.ok) return;
      const data = await res.json();
      setDivergencias(data.divergencias || []);
    } catch {
      // Informativa: un fallo aquí no rompe la pantalla.
    } finally {
      setLoadingDivergencias(false);
    }
  };

  const handleCancelarDivergencia = async (d: Divergencia) => {
    setCancelando(d.reservationId);
    try {
      const res = await fetch('/api/admin/conectividad/divergencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: d.reservationId, syncLogId: d.syncLogId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success(`Reserva ${d.externalBookingId} cancelada`);
        setConfirmarCancel(null);
        await loadDivergencias();
      } else if (data.reaparece) {
        toast.warning(
          'El proveedor vuelve a reportar la reserva: era ruido transitorio. No se canceló nada; re-ejecuta la reconciliación.'
        );
        setConfirmarCancel(null);
        await loadDivergencias();
      } else {
        toast.error(data.error || 'No se pudo cancelar la reserva');
      }
    } catch {
      toast.error('Error de red al cancelar la reserva');
    } finally {
      setCancelando(null);
    }
  };

  const loadPropiedades = async () => {
    try {
      setLoadingPropiedades(true);
      const res = await fetch('/api/admin/conectividad/propiedades');
      if (!res.ok) return;
      const data = await res.json();
      setPropiedades(data.propiedades || []);
    } catch {
      // La tabla es informativa: un fallo aquí no debe romper la pantalla.
    } finally {
      setLoadingPropiedades(false);
    }
  };

  const loadEstado = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/conectividad');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al cargar configuración');
        return;
      }
      const data = await res.json();
      setEstado(data);
    } catch (error) {
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/admin/conectividad', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId,
          username,
          password,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPartnerId('');
        setUsername('');
        setPassword('');
        await loadEstado();
        // Aviso claro de qué falta para poder conectar (los 3 campos son
        // necesarios; sin ID de socio el proveedor rechaza la llamada).
        if (data.configurado) {
          toast.success('Credenciales guardadas. Ya puedes probar la conexión.');
        } else {
          toast.warning(
            'Guardado, pero falta completar: ' +
              [
                !estado?.partnerId && !partnerId ? 'ID de socio' : null,
                !username ? 'Usuario API' : null,
                !password ? 'Contraseña API' : null,
              ].filter(Boolean).join(', ') +
              '. Los tres campos los emite el proveedor en el onboarding.'
          );
        }
      } else {
        toast.error(data.error || 'Error al guardar credenciales');
      }
    } catch (error) {
      toast.error('Error al guardar credenciales');
    } finally {
      setSaving(false);
    }
  };

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/hospitality/webhook/reservations`
      : '';

  const handleTest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/conectividad/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotelCode: testHotel }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        toast.success('Conexión exitosa');
      } else {
        toast.error(data.error || 'Error de conexión');
      }
    } catch (error) {
      toast.error('Error al probar la conexión');
      setTestResult({ ok: false, error: 'Error de red al probar la conexión' });
    } finally {
      setTesting(false);
    }
  };

  const copyWebhook = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL copiada al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReconciliar = async () => {
    setReconciliando(true);
    setReconciliacionResult(null);
    try {
      const res = await fetch('/api/admin/conectividad/reconciliar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias: 30, cancelarAusentes: false }),
      });
      const data = await res.json();
      setReconciliacionResult(data);
      if (data.ok) {
        toast.success('Reconciliación completada');
      } else {
        toast.error(data.error || 'Error en la reconciliación');
      }
    } catch (error) {
      toast.error('Error al ejecutar la reconciliación');
      setReconciliacionResult({ ok: false, message: 'Error de red al ejecutar la reconciliación' });
    } finally {
      setReconciliando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const estadoInfo = estado ? ESTADO_LABEL[estado.estado] || ESTADO_LABEL.sin_configurar : ESTADO_LABEL.sin_configurar;
  // El badge rojo nombra la causa: 401/403 → credenciales rechazadas;
  // 5xx/timeout → sin respuesta del servicio. Derivado del último fallo de la
  // capa (push/fetch), con la MISMA regla que la tabla por propiedad.
  const causaUltimoFallo = causaDeFalloConectividad(estado?.ultimoFallo ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Conectividad de Canales</h1>
        <p className="text-gray-500 mt-1">
          Credenciales de la capa de conectividad para sincronizar inventario, tarifas y reservas con los canales de distribución
        </p>
      </div>

      {/* Estado actual */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Plug className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>{estado?.nombre || 'Conectividad de Canales'}</CardTitle>
                <CardDescription>Estado de la conexión con la capa de distribución</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={estadoInfo.variant} className="gap-1">
                {estado?.estado === 'conectado' || estado?.estado === 'configurado' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : estado?.estado === 'error' ? (
                  <XCircle className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {estadoInfo.text}
              </Badge>
              {estado?.estado === 'error' && estado.ultimoFallo && (
                <Badge variant="destructive" className="gap-1 max-w-[420px]">
                  <span className="truncate" title={`${causaUltimoFallo.texto} · ${causaUltimoFallo.consejo} (último fallo: ${hace(estado.ultimoFallo.fechaCreacion)})`}>
                    {causaUltimoFallo.texto}
                  </span>
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={!estado?.tieneCredenciales || testing}
                onClick={() => setTestDialogOpen(true)}
                title={estado?.tieneCredenciales ? 'Probar la conexión llamando al detalle de propiedad' : 'Guarda primero las credenciales'}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <TestTube2 className="h-4 w-4 mr-1" />
                )}
                Probar conexión
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 border rounded-lg">
              <p className="font-medium">ID de socio</p>
              <p className="text-muted-foreground mt-1">{estado?.partnerId || '—'}</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="font-medium">Usuario API</p>
              <p className="text-muted-foreground mt-1">{estado?.username || '—'}</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="font-medium">Errores registrados</p>
              <p className="text-muted-foreground mt-1">{estado?.contadorErrores || 0}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Última verificación: {hace(estado?.ultimaVerificacion)} — sondea la capa a propósito (health-check
            diario o botón «Probar»), sin esperar tráfico real.
          </p>
          {estado?.estado === 'error' && estado.ultimoFallo && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-3 text-sm" role="alert">
              <p className="font-medium text-red-700 dark:text-red-300">
                {causaUltimoFallo.texto} · último fallo {hace(estado.ultimoFallo.fechaCreacion)}
              </p>
              <p className="text-red-700/80 dark:text-red-300/80 mt-1">{causaUltimoFallo.consejo}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulario de credenciales */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Credenciales de Conectividad
          </CardTitle>
          <CardDescription>
            Las credenciales se almacenan cifradas. Solo se muestran marcadores de presencia, nunca los valores completos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="partnerId">ID de socio (partner id) — requerido</Label>
              <Input
                id="partnerId"
                placeholder={estado?.partnerId ? '•••••• (dejar vacío para mantener)' : 'Identificador que asigna el proveedor al registrarte (no es tu email)'}
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Los TRES campos son obligatorios para conectar. Sin el ID de socio, el servicio rechaza las llamadas.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Usuario API</Label>
              <Input
                id="username"
                placeholder={estado?.username ? '•••••• (dejar vacío para mantener)' : 'Usuario de autenticación'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña API</Label>
              <Input
                id="password"
                type="password"
                placeholder={estado?.tieneCredenciales ? '•••••• (dejar vacío para mantener)' : 'Contraseña de autenticación'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Dejar vacío un campo conserva el valor actual. Para cambiar solo un campo, escribe únicamente el nuevo valor.
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saving ? 'Guardando...' : 'Guardar credenciales'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Webhook de reservas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Webhook de Reservas
          </CardTitle>
          <CardDescription>
            El proveedor de conectividad llama a esta URL para notificar reservas nuevas, modificaciones y cancelaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted p-3 rounded-lg text-xs overflow-x-auto">
              {webhookUrl}
            </code>
            <Button variant="outline" size="sm" onClick={copyWebhook}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reconciliación de reservas (plan maestro §14) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCcw className="h-5 w-5 text-primary" />
            Reconciliación de Reservas
          </CardTitle>
          <CardDescription>
            Consulta las reservas reales del proveedor de conectividad (últimos 30 días) y detecta reservas faltantes, modificaciones y cancelaciones no aplicadas. Los cambios se registran en el historial de sincronización.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleReconciliar} disabled={reconciliando || !estado?.tieneCredenciales}>
            {reconciliando ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-2" />
            )}
            {reconciliando ? 'Reconciliando...' : 'Ejecutar reconciliación'}
          </Button>

          {reconciliacionResult && (
            <div className={`rounded-lg border p-4 text-sm ${reconciliacionResult.ok ? 'border-green-200 bg-green-50 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:bg-red-950'}`}>
              <p className={`font-medium ${reconciliacionResult.ok ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                {reconciliacionResult.message || (reconciliacionResult.ok ? 'Reconciliación completada' : 'Error')}
              </p>
              {(reconciliacionResult.totalCreadas !== undefined || reconciliacionResult.totalActualizadas !== undefined) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">Creadas: {reconciliacionResult.totalCreadas}</Badge>
                  <Badge variant="secondary">Actualizadas: {reconciliacionResult.totalActualizadas}</Badge>
                  <Badge variant="secondary">Canceladas: {reconciliacionResult.totalCanceladas}</Badge>
                  <Badge variant={reconciliacionResult.totalDivergencias ? 'destructive' : 'outline'}>
                    Divergencias: {reconciliacionResult.totalDivergencias}
                  </Badge>
                </div>
              )}
              {reconciliacionResult.errores && reconciliacionResult.errores.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground space-y-1">
                  {reconciliacionResult.errores.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Divergencias de reconciliación: reservas que el proveedor ya no reporta */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-950">
                <Scale className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Divergencias de Reconciliación
                  {divergencias.length > 0 && (
                    <Badge variant="destructive">{divergencias.length}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Reservas activas aquí que el proveedor ya no reporta — el caso típico es un
                  cancel que el webhook perdió y la unidad queda vendida dos veces. Revisa fechas e
                  importes y cancela manualmente: nada se cancela solo.
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadDivergencias} disabled={loadingDivergencias}>
              {loadingDivergencias ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingDivergencias && divergencias.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Cargando divergencias...
            </div>
          ) : divergencias.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Sin divergencias pendientes. Si el proveedor cancela fuera del webhook, aparecerá aquí
              tras la siguiente reconciliación.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reserva</TableHead>
                    <TableHead>Propiedad / unidad</TableHead>
                    <TableHead>Fechas</TableHead>
                    <TableHead>Detectada</TableHead>
                    <TableHead>Estado actual</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {divergencias.map((d) => (
                    <TableRow key={d.reservationId}>
                      <TableCell>
                        <div className="font-medium">{d.externalBookingId}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.channel}
                          {d.tenantNombre ? ` · ${d.tenantNombre}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{d.propertyNombre || '—'}</div>
                        <div className="text-xs text-muted-foreground">{d.unidad || 'sin unidad'}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.checkIn || '—'} → {d.checkOut || '—'}
                        {d.huespedes !== null && d.huespedes > 0 && (
                          <div className="text-xs text-muted-foreground">{d.huespedes} huésped(es)</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{hace(d.syncLogFecha)}</div>
                        {d.veces > 1 && (
                          <div className="text-xs text-muted-foreground">en {d.veces} barridos</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.reservaExiste ? (
                          <Badge
                            variant={
                              d.estadoActual === 'pending' || d.estadoActual === 'checked_in'
                                ? 'outline'
                                : 'destructive'
                            }
                          >
                            {d.estadoActual || 'desconocido'}
                          </Badge>
                        ) : (
                          <Badge variant="outline">eliminada</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {d.reservaExiste &&
                        d.estadoActual &&
                        esReservaViva(d.estadoActual) ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setConfirmarCancel(d)}
                            disabled={cancelando === d.reservationId}
                          >
                            Cancelar reserva
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Nada que hacer</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmación de cancelación de una divergencia */}
      {confirmarCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-950 rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Cancelar reserva {confirmarCancel.externalBookingId}
              </h2>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <p>
                Vas a cancelar la reserva <strong>{confirmarCancel.externalBookingId}</strong> ({confirmarCancel.channel})
                de <strong>{confirmarCancel.propertyNombre || '—'}</strong>
                {confirmarCancel.unidad ? `, unidad ${confirmarCancel.unidad}` : ''}, del{' '}
                <strong>{confirmarCancel.checkIn || '—'}</strong> al <strong>{confirmarCancel.checkOut || '—'}</strong>.
              </p>
              <p className="text-muted-foreground">
                Antes de cancelar se consulta al proveedor: si la reserva vuelve a aparecer reportada, la
                divergencia era transitoria y no se cancelará nada. Si no aparece (cancel perdida), la
                reserva se marca <code>cancelled</code> y la unidad queda libre.
              </p>
            </div>
            <div className="p-6 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarCancel(null)} disabled={cancelando !== null}>
                Volver
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleCancelarDivergencia(confirmarCancel)}
                disabled={cancelando !== null}
              >
                {cancelando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                {cancelando ? 'Cancelando...' : 'Confirmar cancelación'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Estado de sincronización por propiedad (plan maestro §29) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Estado por Propiedad
          </CardTitle>
          <CardDescription>
            Último webhook recibido, último push de inventario/tarifas, última reconciliación y errores de cada
            propiedad. Permite ver qué propiedad concreta está fallando, en lugar de un estado global.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={loadPropiedades} disabled={loadingPropiedades}>
              {loadingPropiedades ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Actualizar
            </Button>
          </div>

          {loadingPropiedades && propiedades.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Cargando estado por propiedad...
            </div>
          ) : propiedades.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aún no hay propiedades de Hospitality con conectividad configurada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Código externo</TableHead>
                    <TableHead>Último webhook</TableHead>
                    <TableHead>Último push</TableHead>
                    <TableHead>Última reconciliación</TableHead>
                    <TableHead>Errores</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propiedades.map((p) => (
                    <TableRow key={p.propertyId}>
                      <TableCell>
                        <div className="font-medium">{p.property}</div>
                        <div className="text-xs text-muted-foreground">{p.tenant}</div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{p.hotelCode || '—'}</code>
                        <Badge
                          variant={p.mappingEstado === 'activo' ? 'default' : 'secondary'}
                          className="ml-2 align-middle"
                        >
                          {p.mappingEstado === 'activo' ? 'Mapeada' : p.mappingEstado.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.ultimoWebhook ? (
                          <>
                            <div>{hace(p.ultimoWebhook.fecha)}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.ultimoWebhook.action}
                              {p.ultimoWebhook.channel ? ` · ${p.ultimoWebhook.channel}` : ''}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sin webhooks</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.ultimoPush ? (
                          <>
                            <div>{hace(p.ultimoPush.fecha)}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.ultimoPush.tipo}
                              {p.ultimoPush.detalle ? ` · ${p.ultimoPush.detalle}` : ''}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sin push</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.ultimoFetch ? (
                          <>
                            <div>{hace(p.ultimoFetch.fecha)}</div>
                            <Badge variant={p.ultimoFetch.estado === 'error' ? 'destructive' : 'secondary'}>
                              {p.ultimoFetch.estado}
                            </Badge>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Nunca</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(p.contadorErrores > 0 || p.webhooksFallidos > 0) ? (
                          <>
                            <Badge variant="destructive">{p.contadorErrores + p.webhooksFallidos}</Badge>
                            {p.causaUltimoError && (
                              <div
                                className="text-xs font-medium text-red-700 dark:text-red-300 mt-1"
                                title={p.causaUltimoError.consejo}
                              >
                                {p.causaUltimoError.texto}
                              </div>
                            )}
                            {p.ultimoError && (
                              <div className="text-xs text-muted-foreground mt-1 max-w-[220px] truncate" title={p.ultimoError.detalle || undefined}>
                                {hace(p.ultimoError.fecha)} · {p.ultimoError.detalle || p.ultimoError.tipo}
                              </div>
                            )}
                          </>
                        ) : (
                          <Badge variant="outline">0</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de prueba de conexión */}
      {testDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-950 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <TestTube2 className="h-5 w-5 text-primary" />
                Probar Conexión
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Llama al detalle de propiedad del servicio de conectividad para validar credenciales, ID de socio y configuración.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <form onSubmit={handleTest} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="test-hotel">Código de propiedad (hotelCode)</Label>
                  <Input
                    id="test-hotel"
                    placeholder="sandbox-pms (prueba) o el código asignado a tu propiedad"
                    value={testHotel}
                    onChange={(e) => setTestHotel(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Si se deja vacío se usa el hotel de prueba del entorno (sandbox-pms).
                  </p>
                </div>
                <Button type="submit" disabled={testing}>
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Server className="h-4 w-4 mr-2" />
                  )}
                  {testing ? 'Probando...' : 'Ejecutar prueba'}
                </Button>
              </form>

              {testResult && (
                <div className={`rounded-lg border p-4 ${testResult.ok ? 'border-green-200 bg-green-50 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:bg-red-950'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {testResult.ok ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <p className={`font-semibold ${testResult.ok ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                      {testResult.ok ? 'Conexión exitosa' : 'Error de conexión'}
                    </p>
                  </div>

                  {testResult.error && (
                    <p className="text-sm text-red-700 dark:text-red-300 mb-2">{testResult.error}</p>
                  )}

                  {testResult.ok && testResult.property && (
                    <div className="mt-3 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div className="p-2 bg-white/60 dark:bg-slate-900/40 rounded">
                          <p className="text-xs text-muted-foreground">Hotel</p>
                          <p className="font-medium">{testResult.property.hotel_name || testResult.property.hotel_id}</p>
                        </div>
                        <div className="p-2 bg-white/60 dark:bg-slate-900/40 rounded">
                          <p className="text-xs text-muted-foreground">Código</p>
                          <p className="font-medium">{testResult.property.hotel_id}</p>
                        </div>
                        <div className="p-2 bg-white/60 dark:bg-slate-900/40 rounded">
                          <p className="text-xs text-muted-foreground">Moneda</p>
                          <p className="font-medium">{testResult.property.currency || '—'}</p>
                        </div>
                        <div className="p-2 bg-white/60 dark:bg-slate-900/40 rounded">
                          <p className="text-xs text-muted-foreground">Zona horaria</p>
                          <p className="font-medium">{testResult.property.timezone || '—'}</p>
                        </div>
                        <div className="p-2 bg-white/60 dark:bg-slate-900/40 rounded">
                          <p className="text-xs text-muted-foreground">Categoría</p>
                          <p className="font-medium">{testResult.property.property_category || '—'}</p>
                        </div>
                      </div>

                      {(testResult.property.rooms || []).length > 0 && (
                        <div>
                          <p className="font-medium flex items-center gap-2 mb-2">
                            <DoorOpen className="h-4 w-4 text-primary" />
                            Habitaciones ({testResult.property.rooms.length})
                          </p>
                          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                            {testResult.property.rooms.map((room: any) => (
                              <div key={room.room_id} className="border rounded-lg p-3 text-sm">
                                <div className="flex items-center justify-between">
                                  <p className="font-medium">{room.room_name || room.room_id}</p>
                                  <span className="text-xs text-muted-foreground">{room.room_id}</span>
                                </div>
                                {(room.rateplans || []).length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {room.rateplans.map((rp: any) => (
                                      <span key={rp.rateplan_id} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                                        <Tags className="h-3 w-3" />
                                        {rp.rateplan_name || rp.rateplan_id}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!testResult.ok && testResult.respuestaExterna !== undefined && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Respuesta del servicio:</p>
                      {/* Segunda capa de saneo al renderizar: la fuente ya sanea
                          (connectivity.ts), esto protege ante cuerpos viejos
                          persistidos sin redactar o cambios futuros. */}
                      <pre className="bg-slate-900 text-green-400 text-xs p-3 rounded-lg overflow-x-auto max-h-40">
                        {JSON.stringify(sanitizarRespuestaExterna(testResult.respuestaExterna), null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t flex justify-end">
              <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}