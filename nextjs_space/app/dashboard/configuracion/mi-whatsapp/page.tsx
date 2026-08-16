
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Smartphone, 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  MessageCircle,
  RefreshCw,
  Trash2,
  User,
  Phone,
  Calendar,
  AlertCircle,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

interface WhatsAppInstance {
  id: string;
  instanceName: string;
  phoneNumber?: string;
  status: string;
  profileName?: string;
  profilePicUrl?: string;
  totalMensajes: number;
  ultimoMensaje?: string;
  fechaConexion?: string;
  fechaCreacion: string;
  qrCode?: string;
  qrCodeExpiry?: string;
  qrExpired?: boolean;
}

export default function MiWhatsAppPage() {
  const [instance, setInstance] = useState<WhatsAppInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [instanceName, setInstanceName] = useState<string>(''); // Nuevo estado para el nombre de instancia

  // Entregas no entregables (Evolution 400 por número inexistente)
  interface DeliveryFailure {
    id: string;
    chatwootAccountId: number;
    chatwootConversationId: number;
    contactoNombre: string | null;
    telefono: string | null;
    mensajeFallido: string | null;
    notaAgente: string | null;
    estado: string;
    resueltoPor: string | null;
    fechaResolucion: string | null;
    fechaCreacion: string;
    hubUrl: string | null;
  }
  const [failures, setFailures] = useState<DeliveryFailure[]>([]);
  const [loadingFailures, setLoadingFailures] = useState(true);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  // Cargar instancia y entregas no entregables al montar
  useEffect(() => {
    fetchInstance();
    fetchFailures();
  }, []);

  // Limpiar polling al desmontar
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Fetch instancia del usuario
  const fetchInstance = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/integraciones/my-whatsapp');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();

      if (data.connected && data.instance) {
        setInstance(data.instance);
        setShowQR(false);
        setQrCode(null);

        // Si está en estado "connecting", iniciar polling de estado
        if (data.instance.status === 'connecting') {
          startStatusPolling();
        }
      } else {
        setInstance(null);
      }
    } catch (error) {
      console.error('Error al cargar instancia:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al cargar información de WhatsApp';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Cargar entregas no entregables del tenant
  const fetchFailures = async () => {
    try {
      const response = await fetch('/api/integraciones/my-whatsapp/no-entregables');
      if (!response.ok) return;
      const data = await response.json();
      setFailures(data.failures || []);
    } catch (error) {
      console.error('Error al cargar entregas no entregables:', error);
    } finally {
      setLoadingFailures(false);
    }
  };

  // Marcar una entrega fallida como resuelta
  const markResolved = async (id: string) => {
    if (resolvingIds.has(id)) return;
    setResolvingIds((prev) => new Set(prev).add(id));
    try {
      const response = await fetch('/api/integraciones/my-whatsapp/no-entregables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || `Error ${response.status}`);
      }
      toast.success('Entrega marcada como resuelta');
      setFailures((prev) => prev.map((f) => (f.id === id
        ? { ...f, estado: 'resuelto', resueltoPor: 'Yo', fechaResolucion: new Date().toISOString() }
        : f)));
    } catch (error) {
      console.error('Error al marcar como resuelta:', error);
      const msg = error instanceof Error ? error.message : 'Error al marcar como resuelta';
      toast.error(msg);
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Crear una instancia automáticamente o conectar una existente si se indicó nombre
  const connectInstance = async () => {
    try {
      setConnecting(true);
      const response = await fetch('/api/integraciones/my-whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instanceName: instanceName.trim() || undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        toast.success('Conectado exitosamente a la instancia');
        setInstanceName(''); // Limpiar el input
        await fetchInstance();
        // Automáticamente obtener QR
        await fetchQRCode();
      } else {
        // Mostrar error largo en modo multilínea
        const errorMsg = data.error || 'Error al conectar a instancia';
        if (errorMsg.includes('Permisos Insuficientes')) {
          toast.error(errorMsg, { duration: 10000 });
        } else {
          toast.error(errorMsg);
        }
      }
    } catch (error) {
      console.error('Error al crear instancia:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al crear instancia de WhatsApp';
      toast.error(errorMessage);
    } finally {
      setConnecting(false);
    }
  };

  // Obtener QR Code
  const fetchQRCode = async () => {
    try {
      const response = await fetch('/api/integraciones/my-whatsapp/qr');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        if (data.connected) {
          toast.success('WhatsApp ya está conectado');
          await fetchInstance();
        } else if (data.qrCode) {
          setQrCode(data.qrCode.base64);
          setShowQR(true);
          startStatusPolling();
        }
      } else {
        toast.error(data.error || 'Error al obtener QR Code');
      }
    } catch (error) {
      console.error('Error al obtener QR:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al obtener QR Code';
      toast.error(errorMessage);
    }
  };

  // Verificar estado de conexión
  const checkStatus = async () => {
    try {
      const response = await fetch('/api/integraciones/my-whatsapp/status');
      
      if (!response.ok) {
        // No mostrar error en polling, solo registrar en consola
        console.warn('Error al verificar estado:', response.status);
        return;
      }

      const data = await response.json();

      if (data.success) {
        if (data.status === 'connected') {
          toast.success('¡WhatsApp conectado exitosamente!');
          setShowQR(false);
          setQrCode(null);
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
          // Mostrar el perfil al instante (número/name/foto) sin esperar recarga
          if (data.profile && data.instance) {
            const profile = data.profile;
            setInstance({
              ...data.instance,
              phoneNumber: data.instance.phoneNumber || String(profile.id || '').replace('@s.whatsapp.net', '') || undefined,
              profileName: data.instance.profileName || profile.name || profile.notify || undefined,
              profilePicUrl: data.instance.profilePicUrl || profile.profilePicUrl || undefined,
            });
          } else {
            await fetchInstance();
          }
        } else if (data.instance) {
          setInstance(data.instance);
        }
      }
    } catch (error) {
      // No mostrar error en polling, solo registrar en consola
      console.warn('Error al verificar estado:', error);
    }
  };

  // Iniciar polling de estado
  const startStatusPolling = () => {
    // Limpiar interval anterior si existe
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    // Verificar estado cada 3 segundos
    const interval = setInterval(() => {
      checkStatus();
    }, 3000);

    setPollingInterval(interval);
  };

  // Desconectar WhatsApp
  const disconnectWhatsApp = async () => {
    if (!confirm('¿Estás seguro de que deseas desconectar tu WhatsApp?\n\nSe eliminará la instancia de WhatsApp y el enlace con el centro de comunicaciones.')) {
      return;
    }

    try {
      setDisconnecting(true);
      const response = await fetch('/api/integraciones/my-whatsapp', {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        toast.success('WhatsApp desconectado exitosamente');
        setInstance(null);
        setQrCode(null);
        setShowQR(false);
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      } else {
        toast.error(data.error || 'Error al desconectar WhatsApp');
      }
    } catch (error) {
      console.error('Error al desconectar:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al desconectar WhatsApp';
      toast.error(errorMessage);
    } finally {
      setDisconnecting(false);
    }
  };

  // Formatear número para mostrarlo legible (+34 600 12 34 56)
  const formatPhone = (phone?: string) => {
    if (!phone) return 'Número no disponible';
    if (phone.startsWith('34') && phone.length === 11) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)} ${phone.slice(9)}`;
    }
    return `+${phone}`;
  };

  // Renderizar estado de conexión
  const renderConnectionStatus = () => {
    if (!instance) return null;

    const statusConfig = {
      connected: {
        icon: CheckCircle2,
        label: 'Conectado',
        color: 'text-green-600 bg-green-50 border-green-200'
      },
      connecting: {
        icon: Loader2,
        label: 'Conectando...',
        color: 'text-yellow-600 bg-yellow-50 border-yellow-200'
      },
      disconnected: {
        icon: XCircle,
        label: 'Desconectado',
        color: 'text-gray-600 bg-gray-50 border-gray-200'
      },
      error: {
        icon: AlertCircle,
        label: 'Error',
        color: 'text-red-600 bg-red-50 border-red-200'
      }
    };

    const config = statusConfig[instance.status as keyof typeof statusConfig] || statusConfig.disconnected;
    const Icon = config.icon;

    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.color}`}>
        <Icon className={`h-5 w-5 ${instance.status === 'connecting' ? 'animate-spin' : ''}`} />
        <span className="font-medium">{config.label}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Smartphone className="h-8 w-8 text-green-600" />
          Mi WhatsApp Personal
        </h1>
        <p className="text-gray-600 mt-2">
          Conecta tu número de WhatsApp para gestionar conversaciones desde Volkern CRM
        </p>
      </div>

      {/* Advertencia importante */}
      <Alert className="mb-4 bg-green-50 border-green-200">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <strong>Conexión automática:</strong> Volkern creará la instancia de WhatsApp,
          la dejará lista y mostrará aquí el QR para vincular tu teléfono.
        </AlertDescription>
      </Alert>

      {/* Información importante */}
      <Alert className="mb-6 bg-blue-50 border-blue-200">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          Al conectar tu WhatsApp, podrás enviar y recibir mensajes directamente desde el CRM,
          manteniendo un historial completo de tus conversaciones con los clientes.
        </AlertDescription>
      </Alert>

      {/* Estado de conexión */}
      {instance ? (
        <div className="space-y-6">
          {/* Card principal de info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {instance.profilePicUrl ? (
                    <div className="relative h-16 w-16 rounded-full overflow-hidden">
                      <Image
                        src={instance.profilePicUrl}
                        alt="Perfil"
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                      <User className="h-8 w-8 text-green-600" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-xl">
                      {instance.profileName || 'WhatsApp Personal'}
                    </CardTitle>
                    <CardDescription>
                      {formatPhone(instance.phoneNumber)}
                    </CardDescription>
                  </div>
                </div>
                {renderConnectionStatus()}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Estadísticas */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <MessageCircle className="h-4 w-4" />
                    <span className="text-sm">Mensajes</span>
                  </div>
                  <p className="text-2xl font-bold">{instance.totalMensajes}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Phone className="h-4 w-4" />
                    <span className="text-sm">Estado</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {instance.status === 'connected' ? 'Activo' : 'Inactivo'}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">Conectado desde</span>
                  </div>
                  <p className="text-sm font-medium">
                    {instance.fechaConexion
                      ? new Date(instance.fechaConexion).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Aviso si se perdió la conexión del teléfono */}
              {instance.status === 'disconnected' && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    Tu WhatsApp está <strong>desconectado</strong>. Pulsa{' '}
                    <strong>Mostrar QR Code</strong> para volver a vincular el teléfono.
                  </AlertDescription>
                </Alert>
              )}

              {/* Acciones */}
              <div className="flex gap-2 pt-4">
                {instance.status !== 'connected' && (
                  <Button
                    onClick={fetchQRCode}
                    variant="default"
                    className="flex items-center gap-2"
                  >
                    <QrCode className="h-4 w-4" />
                    Mostrar QR Code
                  </Button>
                )}
                <Button
                  onClick={checkStatus}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Actualizar Estado
                </Button>
                <Button
                  onClick={disconnectWhatsApp}
                  variant="destructive"
                  disabled={disconnecting}
                  className="flex items-center gap-2"
                >
                  {disconnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Desconectando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Desconectar
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* QR Code */}
          {showQR && qrCode && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Escanea el código QR con WhatsApp
                </CardTitle>
                <CardDescription>
                  Abre WhatsApp en tu teléfono, ve a Dispositivos vinculados y escanea este código
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg shadow-lg">
                  <Image
                    src={qrCode}
                    alt="QR Code"
                    width={300}
                    height={300}
                    className="rounded"
                  />
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Esperando conexión...
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* Sin instancia - Mostrar botón de conexión */
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
                <Smartphone className="h-10 w-10 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl">Conecta tu WhatsApp Personal</CardTitle>
            <CardDescription className="text-base mt-2">
              Gestiona todas tus conversaciones de WhatsApp directamente desde Volkern CRM
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 p-6 rounded-lg space-y-3">
              <h3 className="font-semibold text-lg">¿Cómo funciona?</h3>
              <ol className="list-decimal list-inside space-y-2 text-gray-600">
                <li>Pulsa "Crear y conectar WhatsApp"</li>
                <li>Volkern crea la instancia y configura el webhook</li>
                <li>Escanea el código QR con tu WhatsApp</li>
                <li>Espera a que el estado cambie a conectado</li>
                <li>¡Listo! Empieza a gestionar tus conversaciones</li>
              </ol>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-2">📋 Requisitos previos:</h4>
              <ul className="space-y-1 text-sm text-blue-700">
                <li>• El servicio de WhatsApp debe estar disponible para Volkern</li>
                <li>• Un teléfono con WhatsApp para escanear el QR</li>
                <li>• No tener otra instancia activa en este usuario</li>
              </ul>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h4 className="font-medium text-green-800 mb-2">✨ Beneficios:</h4>
              <ul className="space-y-1 text-sm text-green-700">
                <li>✓ Control total de tus conversaciones</li>
                <li>✓ Historial completo centralizado</li>
                <li>✓ Estadísticas y métricas</li>
                <li>✓ Sin perder acceso a WhatsApp Web</li>
              </ul>
            </div>

            {/* Campo para ingresar nombre de instancia */}
            <div className="space-y-2">
              <label htmlFor="instanceName" className="block text-sm font-medium text-gray-700">
                Nombre de instancia (opcional)
              </label>
              <input
                id="instanceName"
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="Déjalo vacío para generarlo automáticamente"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                disabled={connecting}
              />
              <p className="text-xs text-gray-500">
                Puedes dejarlo vacío; Volkern generará un nombre único y creará la instancia por ti.
              </p>
            </div>

            <Button
              onClick={connectInstance}
              disabled={connecting}
              className="w-full h-12 text-lg"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Conectando a instancia...
                </>
              ) : (
                <>
                  <Smartphone className="h-5 w-5 mr-2" />
                  Crear y conectar WhatsApp
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Mensajes no entregables por WhatsApp */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-lg">Mensajes no entregables</CardTitle>
          </div>
          <CardDescription>
            Conversaciones donde WhatsApp rechazó el envío (número inexistente o no disponible).
            El agente fue notificado en el centro de comunicaciones; márcalas como resueltas cuando contactes por otro canal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingFailures ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : failures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
              <p className="text-gray-500">No hay entregas fallidas. ¡Todo enviando correctamente!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {failures.map((f) => {
                const resolved = f.estado === 'resuelto';
                return (
                  <div
                    key={f.id}
                    className={`border rounded-lg p-4 ${resolved ? 'bg-gray-50 border-gray-200' : 'bg-red-50/50 border-red-200'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {f.contactoNombre || 'Contacto desconocido'}
                          </span>
                          {f.telefono && (
                            <span className="text-sm text-gray-600 flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              {f.telefono}
                            </span>
                          )}
                          <Badge
                            variant={resolved ? 'secondary' : 'destructive'}
                            className={resolved ? '' : 'bg-red-500'}
                          >
                            {resolved ? 'Resuelto' : 'Pendiente'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(f.fechaCreacion).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {f.hubUrl && (
                          <a
                            href={f.hubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Ver conversación
                          </a>
                        )}
                        {!resolved && (
                          <Button
                            onClick={() => markResolved(f.id)}
                            variant="outline"
                            size="sm"
                            disabled={resolvingIds.has(f.id)}
                            className="flex items-center gap-1"
                          >
                            {resolvingIds.has(f.id) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Marcar resuelto
                          </Button>
                        )}
                      </div>
                    </div>
                    {f.mensajeFallido && (
                      <div className="mt-3 bg-white rounded-md border border-gray-200 p-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Mensaje fallido
                        </p>
                        <p className="text-sm text-gray-800 break-words">{f.mensajeFallido}</p>
                      </div>
                    )}
                    {f.notaAgente && (
                      <div className="mt-2 bg-amber-50 rounded-md border border-amber-200 p-3">
                        <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                          Nota enviada al agente
                        </p>
                        <p className="text-sm text-amber-900 break-words">{f.notaAgente}</p>
                      </div>
                    )}
                    {resolved && f.resueltoPor && (
                      <p className="text-xs text-gray-500 mt-2">
                        Resuelto por {f.resueltoPor}
                        {f.fechaResolucion ? ` el ${new Date(f.fechaResolucion).toLocaleString()}` : ''}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
