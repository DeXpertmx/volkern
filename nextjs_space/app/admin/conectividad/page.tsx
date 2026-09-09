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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface EstadoConectividad {
  configurado: boolean;
  estado: string;
  nombre: string;
  partnerId: string;
  username: string;
  tieneCredenciales: boolean;
  ultimaSincronizacion: string | null;
  ultimoEvento: string | null;
  contadorErrores: number;
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

  useEffect(() => {
    loadEstado();
  }, []);

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
        toast.success('Credenciales guardadas correctamente');
        setPartnerId('');
        setUsername('');
        setPassword('');
        await loadEstado();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const estadoInfo = estado ? ESTADO_LABEL[estado.estado] || ESTADO_LABEL.sin_configurar : ESTADO_LABEL.sin_configurar;

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
              <Label htmlFor="partnerId">ID de socio (partner id)</Label>
              <Input
                id="partnerId"
                placeholder={estado?.partnerId ? '•••••• (dejar vacío para mantener)' : 'Identificador asignado en el onboarding'}
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                autoComplete="off"
              />
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
                      <pre className="bg-slate-900 text-green-400 text-xs p-3 rounded-lg overflow-x-auto max-h-40">
                        {JSON.stringify(testResult.respuestaExterna, null, 2)}
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