'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import {
  MessageCircle,
  QrCode,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Phone,
  Calendar,
  AlertCircle,
  Send,
  ShieldCheck,
  BellRing,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PlatformInstance {
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

export default function AdminWhatsAppPage() {
  const [instance, setInstance] = useState<PlatformInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshingQR, setRefreshingQR] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [qrTtl, setQrTtl] = useState<number | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const qrTimerRef = useRef<NodeJS.Timeout | null>(null);
  const qrTickRef = useRef<NodeJS.Timeout | null>(null);
  const showQRRef = useRef(false);
  const refreshQRRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    showQRRef.current = showQR;
    refreshQRRef.current = refreshQR;
  });

  useEffect(() => {
    fetchInstance();
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (qrTimerRef.current) {
        clearTimeout(qrTimerRef.current);
        qrTimerRef.current = null;
      }
      if (qrTickRef.current) {
        clearInterval(qrTickRef.current);
        qrTickRef.current = null;
      }
    };
  }, []);

  // Auto-refresh del QR: Evolution expira el código a los 60s. Mientras el QR
  // esté visible y la instancia en 'connecting', mostramos una cuenta regresiva
  // y pedimos un código nuevo automáticamente al expirar (sin clicks manuales).
  useEffect(() => {
    if (qrTimerRef.current) {
      clearTimeout(qrTimerRef.current);
      qrTimerRef.current = null;
    }
    if (qrTickRef.current) {
      clearInterval(qrTickRef.current);
      qrTickRef.current = null;
    }

    const active = showQR && !!qrCode && instance?.status === 'connecting';
    if (!active) {
      setQrTtl(null);
      return;
    }

    const expiry = instance?.qrCodeExpiry ? new Date(instance.qrCodeExpiry).getTime() : Date.now() + 60000;
    const msLeft = Math.max(0, expiry - Date.now());

    setQrTtl(Math.ceil(msLeft / 1000));
    qrTickRef.current = setInterval(() => {
      const left = Math.max(0, expiry - Date.now());
      setQrTtl(Math.ceil(left / 1000));
    }, 1000);
    qrTimerRef.current = setTimeout(() => {
      if (showQRRef.current) refreshQRRef.current();
    }, msLeft);

    return () => {
      if (qrTimerRef.current) {
        clearTimeout(qrTimerRef.current);
        qrTimerRef.current = null;
      }
      if (qrTickRef.current) {
        clearInterval(qrTickRef.current);
        qrTickRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQR, qrCode, instance?.status, instance?.qrCodeExpiry]);

  const fetchInstance = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/whatsapp-plataforma');
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      const data = await res.json();
      if (data.instance) {
        setInstance(data.instance);
        if (data.connected) {
          setQrCode(null);
          setShowQR(false);
          stopPolling();
        } else {
          if (data.instance.status === 'connecting') startStatusPolling();
          // Si el QR guardado ya caducó, pide uno nuevo automáticamente.
          if (data.instance.qrExpired) {
            refreshQR();
          } else if (data.instance.qrCode) {
            setQrCode(data.instance.qrCode);
            setShowQR(true);
          }
        }
      } else {
        setInstance(null);
      }
    } catch (err) {
      console.error('Error al cargar WhatsApp de la plataforma:', err);
      toast.error('No tienes permisos o hubo un error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const startStatusPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => {
      checkStatus();
    }, 4000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/admin/whatsapp-plataforma/status');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      const yaConectado = instance?.status === 'connected';
      if (data.status === 'connected') {
        if (!yaConectado) toast.success('WhatsApp de la plataforma conectado exitosamente');
        setShowQR(false);
        setQrCode(null);
        stopPolling();
      }
      if (data.instance) setInstance(data.instance);
    } catch {
      /* poll best-effort */
    }
  };

  const createInstance = async () => {
    try {
      setCreating(true);
      const res = await fetch('/api/admin/whatsapp-plataforma', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al conectar el WhatsApp de la plataforma');
        return;
      }
      toast.success('WhatsApp de la plataforma creado. Escanea el QR para conectarlo.');
      await fetchInstance();
      if (data.instance?.qrCode) {
        setQrCode(data.instance.qrCode);
        setShowQR(true);
        startStatusPolling();
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al crear el WhatsApp de la plataforma');
    } finally {
      setCreating(false);
    }
  };

  const refreshQR = async () => {
    try {
      setRefreshingQR(true);
      const res = await fetch('/api/admin/whatsapp-plataforma/qr');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al obtener QR Code');
        return;
      }
      if (data.connected) {
        toast.success('WhatsApp ya está conectado');
        await fetchInstance();
        return;
      }
      if (data.qrCode) {
        setQrCode(data.qrCode.base64);
        setShowQR(true);
        startStatusPolling();
      }
    } catch {
      toast.error('Error al obtener QR Code');
    } finally {
      setRefreshingQR(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('¿Desconectar el WhatsApp oficial de la plataforma?\n\nSe eliminará la instancia. Las notificaciones a tenants sin WhatsApp propio dejarán de enviarse por este canal.')) {
      return;
    }
    try {
      setDisconnecting(true);
      const res = await fetch('/api/admin/whatsapp-plataforma', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('WhatsApp de la plataforma desconectado');
        setInstance(null);
        setQrCode(null);
        setShowQR(false);
        stopPolling();
      } else {
        toast.error(data.error || 'Error al desconectar');
      }
    } catch {
      toast.error('Error al desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  const formatPhone = (phone?: string) => {
    if (!phone) return 'Número no disponible';
    return `+${phone}`;
  };

  const statusBadge = () => {
    if (!instance) return null;
    const map: Record<string, { label: string; cls: string; Icon: any }> = {
      connected: { label: 'Conectado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
      connecting: { label: 'Conectando…', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Loader2 },
      disconnected: { label: 'Desconectado', cls: 'bg-slate-100 text-slate-600 border-slate-200', Icon: XCircle },
    };
    const cfg = map[instance.status] || map.disconnected;
    const Icon = cfg.Icon;
    return (
      <Badge variant="outline" className={`gap-1.5 px-3 py-1.5 border ${cfg.cls}`}>
        <Icon className={`h-3.5 w-3.5 ${instance.status === 'connecting' ? 'animate-spin' : ''}`} />
        {cfg.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-[#1A365D]/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-black text-[#1A365D] uppercase tracking-tighter italic flex items-center gap-3">
          <MessageCircle className="h-8 w-8" />
          WhatsApp de la Plataforma
        </h1>
        <p className="text-[#4A5568] font-semibold text-sm mt-1">
          Número oficial de Volkern para enviar notificaciones cuando un tenant aún no conecta su propio WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#1A365D] text-xs font-black uppercase tracking-widest">
            <Send className="h-4 w-4" /> Notificaciones a usuarios y agentes
          </div>
          <p className="text-sm text-slate-500 leading-relaxed">
            Avisos de leads, citas y tareas asignadas llegan al móvil del agente cuando el tenant no tiene número conectado.
          </p>
        </div>
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#1A365D] text-xs font-black uppercase tracking-widest">
            <BellRing className="h-4 w-4" /> Avisos de cuenta y plataforma
          </div>
          <p className="text-sm text-slate-500 leading-relaxed">
            Alertas de renovación, trial y límites hacia los administradores de cada tenant.
          </p>
        </div>
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#1A365D] text-xs font-black uppercase tracking-widest">
            <ShieldCheck className="h-4 w-4" /> Códigos de firma electrónica
          </div>
          <p className="text-sm text-slate-500 leading-relaxed">
            Los códigos de seguridad de firma/aceptación de contratos salen por este número si el tenant no tiene el suyo.
          </p>
        </div>
      </div>

      {instance ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 rounded-2xl bg-[#1A365D]/5 flex items-center justify-center overflow-hidden">
                    {instance.profilePicUrl ? (
                      <Image src={instance.profilePicUrl} alt="Perfil" fill className="object-cover" />
                    ) : (
                      <MessageCircle className="h-8 w-8 text-[#1A365D]" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      {instance.profileName || 'WhatsApp oficial Volkern'}
                    </CardTitle>
                    <CardDescription>{formatPhone(instance.phoneNumber)}</CardDescription>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                      Instancia: {instance.instanceName}
                    </p>
                  </div>
                </div>
                {statusBadge()}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Send className="h-4 w-4" />
                    <span className="text-xs font-bold">Mensajes enviados</span>
                  </div>
                  <p className="text-2xl font-black text-[#1A365D]">{instance.totalMensajes}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Phone className="h-4 w-4" />
                    <span className="text-xs font-bold">Número oficial</span>
                  </div>
                  <p className="text-2xl font-black text-[#1A365D]">{instance.status === 'connected' ? 'Activo' : 'Inactivo'}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs font-bold">Conectado desde</span>
                  </div>
                  <p className="text-sm font-bold text-[#1A365D]">
                    {instance.fechaConexion ? new Date(instance.fechaConexion).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>

              {instance.status === 'disconnected' && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    El WhatsApp de la plataforma está <strong>desconectado</strong>. Pulsa{' '}
                    <strong>Mostrar QR Code</strong> para volver a vincular el número.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                {instance.status !== 'connected' && (
                  <Button onClick={refreshQR} disabled={refreshingQR} className="flex items-center gap-2">
                    {refreshingQR ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    {showQR ? 'Refrescar QR' : 'Mostrar QR Code'}
                  </Button>
                )}
                <Button onClick={checkStatus} variant="outline" className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Actualizar Estado
                </Button>
                <Button
                  onClick={disconnect}
                  variant="destructive"
                  disabled={disconnecting}
                  className="flex items-center gap-2"
                >
                  {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Desconectar
                </Button>
              </div>
            </CardContent>
          </Card>

          {showQR && qrCode && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Escanea el código QR con el WhatsApp oficial
                </CardTitle>
                <CardDescription>
                  Abre WhatsApp en el teléfono, ve a Dispositivos vinculados y escanea este código
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100">
                  <Image src={qrCode} alt="QR Code" width={300} height={300} className="rounded" unoptimized />
                </div>
                <div className="mt-4 flex flex-col items-center gap-1 text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Esperando conexión…
                  </div>
                  {qrTtl !== null && qrTtl > 0 && (
                    <p className="text-xs text-slate-400">
                      El código expira en <strong>{qrTtl}s</strong> y se refrescará automáticamente
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-20 w-20 rounded-3xl bg-[#1A365D]/5 flex items-center justify-center">
                <MessageCircle className="h-10 w-10 text-[#1A365D]" />
              </div>
            </div>
            <CardTitle className="text-2xl">Conecta el WhatsApp oficial de la plataforma</CardTitle>
            <CardDescription className="text-base mt-2">
              Volkern creará una instancia en Evolution API y te mostrará el QR para vincular el número
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-50 p-6 rounded-2xl space-y-3">
              <h3 className="font-bold text-lg text-[#1A365D]">¿Cómo funciona?</h3>
              <ol className="list-decimal list-inside space-y-2 text-slate-600 text-sm">
                <li>Pulsa "Crear y conectar WhatsApp de la Plataforma"</li>
                <li>Volkern crea la instancia oficial y configura su webhook</li>
                <li>Escanea el código QR con el teléfono que será el número oficial</li>
                <li>Cuando el estado cambie a conectado, las notificaciones de tenants sin WhatsApp propio saldrán por este número</li>
              </ol>
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                Los tenants con su propio WhatsApp conectado seguirán enviando desde su número. Este canal es el{' '}
                <strong>fallback de la plataforma</strong> para que ningún aviso se pierda.
              </AlertDescription>
            </Alert>

            <Button
              onClick={createInstance}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 h-12"
            >
              {creating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <MessageCircle className="h-5 w-5" />
              )}
              {creating ? 'Creando instancia…' : 'Crear y conectar WhatsApp de la Plataforma'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
