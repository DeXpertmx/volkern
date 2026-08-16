'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Building2,
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
  Bot
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

interface TenantInstance {
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

export default function WhatsAppNegocioPage() {
  const [instance, setInstance] = useState<TenantInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  // useRef: el intervalo debe ser estable entre renders. Con useState, el
  // closure de checkStatus ve el valor viejo (siempre null) y clearInterval no
  // detiene el polling: el toast de "conectado" se repetía cada 3s en bucle.
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchInstance();
  }, []);

  // Limpiar polling al desmontar
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Fetch instancia del negocio
  const fetchInstance = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/integraciones/whatsapp-negocio');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();

      if (data.connected && data.instance) {
        setInstance(data.instance);
        setShowQR(false);
        setQrCode(null);

        if (data.instance.status === 'connecting') {
          startStatusPolling();
        }
      } else {
        setInstance(null);
      }
    } catch (error) {
      console.error('Error al cargar WhatsApp del negocio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al cargar la información';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Crear la instancia del negocio
  const connectInstance = async () => {
    try {
      setConnecting(true);
      const response = await fetch('/api/integraciones/whatsapp-negocio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        toast.success('WhatsApp del negocio creado. Escanea el QR para conectarlo.');
        await fetchInstance();
        await fetchQRCode();
      } else {
        toast.error(data.error || 'Error al conectar el WhatsApp del negocio');
      }
    } catch (error) {
      console.error('Error al crear WhatsApp del negocio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al crear WhatsApp del negocio';
      toast.error(errorMessage);
    } finally {
      setConnecting(false);
    }
  };

  // Obtener QR Code
  const fetchQRCode = async () => {
    try {
      const response = await fetch('/api/integraciones/whatsapp-negocio/qr');

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
      const response = await fetch('/api/integraciones/whatsapp-negocio/status');

      if (!response.ok) {
        console.warn('Error al verificar estado:', response.status);
        return;
      }

      const data = await response.json();

      if (data.success) {
        if (data.status === 'connected') {
          // Solo notificar en la transición a conectado, no en cada poll.
          const yaConectado = instance?.status === 'connected';
          if (!yaConectado) {
            toast.success('¡WhatsApp del negocio conectado exitosamente!');
          }
          setShowQR(false);
          setQrCode(null);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
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
      console.warn('Error al verificar estado:', error);
    }
  };

  // Iniciar polling de estado
  const startStatusPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    const interval = setInterval(() => {
      checkStatus();
    }, 3000);

    pollingRef.current = interval;
  };

  // Desconectar WhatsApp del negocio
  const disconnectWhatsApp = async () => {
    if (!confirm('¿Estás seguro de que deseas desconectar el WhatsApp del negocio?\n\nSe eliminará la instancia y el canal del centro de comunicaciones. El chatbot dejará de responder desde este número.')) {
      return;
    }

    try {
      setDisconnecting(true);
      const response = await fetch('/api/integraciones/whatsapp-negocio', {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        toast.success('WhatsApp del negocio desconectado exitosamente');
        setInstance(null);
        setQrCode(null);
        setShowQR(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } else {
        toast.error(data.error || 'Error al desconectar WhatsApp del negocio');
      }
    } catch (error) {
      console.error('Error al desconectar:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al desconectar WhatsApp del negocio';
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

    const statusConfig: Record<string, { icon: any; label: string; color: string }> = {
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
          <Building2 className="h-8 w-8 text-primary" />
          WhatsApp del Negocio
        </h1>
        <p className="text-gray-600 mt-2">
          Número dedicado del negocio para el chatbot y el equipo. Separado de los WhatsApp personales de los usuarios.
        </p>
      </div>

      {/* Advertencia importante */}
      <Alert className="mb-4 bg-green-50 border-green-200">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <strong>Conexión automática:</strong> Volkern creará la instancia del negocio y mostrará aquí el QR
          para vincular el número. Solo puede existir un WhatsApp del negocio por tenant.
        </AlertDescription>
      </Alert>

      {/* Información importante */}
      <Alert className="mb-6 bg-blue-50 border-blue-200">
        <Bot className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          El chatbot responde desde este número. Cuando una conversación se escala a un agente, este la atiende
          desde el centro de comunicaciones usando el mismo número del negocio: el cliente nunca ve números
          personales y todas las conversaciones quedan registradas.
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
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-xl">
                      {instance.profileName || 'WhatsApp del Negocio'}
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
                    El WhatsApp del negocio está <strong>desconectado</strong>. Pulsa{' '}
                    <strong>Mostrar QR Code</strong> para volver a vincular el número.
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
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="h-10 w-10 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Conecta el WhatsApp del Negocio</CardTitle>
            <CardDescription className="text-base mt-2">
              Un número dedicado del negocio para el chatbot y las conversaciones de trabajo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 p-6 rounded-lg space-y-3">
              <h3 className="font-semibold text-lg">¿Cómo funciona?</h3>
              <ol className="list-decimal list-inside space-y-2 text-gray-600">
                <li>Pulsa "Crear y conectar WhatsApp del Negocio"</li>
                <li>Volkern crea la instancia del negocio y configura el webhook</li>
                <li>Escanea el código QR con el teléfono del negocio</li>
                <li>Espera a que el estado cambie a conectado</li>
                <li>¡Listo! El chatbot empieza a responder desde este número</li>
              </ol>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-2">📋 Requisitos previos:</h4>
              <ul className="space-y-1 text-sm text-blue-700">
                <li>• El servicio de WhatsApp debe estar disponible para Volkern</li>
                <li>• Un teléfono con WhatsApp para escanear el QR</li>
                <li>• No tener otro WhatsApp del negocio activo en este tenant</li>
              </ul>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h4 className="font-medium text-green-800 mb-2">✨ Beneficios:</h4>
              <ul className="space-y-1 text-sm text-green-700">
                <li>✓ El chatbot tiene una identidad propia (la del negocio)</li>
                <li>✓ El cliente nunca ve números personales de los agentes</li>
                <li>✓ Escalaciones atendidas en el hub con el mismo número</li>
                <li>✓ Todas las conversaciones de trabajo quedan registradas</li>
              </ul>
            </div>

            <Button
              onClick={connectInstance}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Creando instancia...
                </>
              ) : (
                <>
                  <Building2 className="h-5 w-5 mr-2" />
                  Crear y conectar WhatsApp del Negocio
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
