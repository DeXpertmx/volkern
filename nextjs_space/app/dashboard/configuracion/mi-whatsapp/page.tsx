
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
  AlertCircle
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
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [instanceName, setInstanceName] = useState<string>(''); // Nuevo estado para el nombre de instancia

  // Cargar instancia al montar
  useEffect(() => {
    fetchInstance();
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
          await fetchInstance();
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
    if (!confirm('¿Estás seguro de que deseas desconectar tu WhatsApp?')) {
      return;
    }

    try {
      setLoading(true);
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
      setLoading(false);
    }
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
          <strong>Conexión automática:</strong> Volkern creará la instancia en Evolution API,
          configurará el webhook y mostrará aquí el QR para vincular tu teléfono.
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
                      {instance.phoneNumber || 'Número no disponible'}
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
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Desconectar
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
                <li>• Evolution API debe estar disponible para Volkern</li>
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
    </div>
  );
}
