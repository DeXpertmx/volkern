'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Send, Phone, AlertTriangle, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

interface SendWhatsAppButtonProps {
  /** Teléfono del lead/contacto (puede incluir +, espacios, guiones) */
  phone: string | null | undefined;
  /** 'lead' o 'contact' */
  entityType: 'lead' | 'contact';
  /** ID del lead o contacto */
  entityId: string;
  /** Nombre para mostrar en el diálogo (opcional) */
  nombre?: string;
  /** Tamaño del botón */
  size?: 'sm' | 'default';
  /** Si el botón debe ir sin etiqueta (solo icono) */
  iconOnly?: boolean;
  /** Se invoca tras un envío correcto (refrescar timeline, etc.) */
  onSent?: () => void;
}

type EstadoInstancia = 'conectada' | 'desconectada' | 'sin_instancia' | 'error';

interface EstadoWhatsApp {
  estado: EstadoInstancia;
  detalle?: string;
  estadoEvolution?: string | null;
}

/**
 * Detecta si un teléfono es móvil usando una heurística sencilla:
 * formato internacional con al menos 7 dígitos y sin ser claramente fijo.
 * No usa librería externa para mantener el bundle ligero.
 */
function esMovil(telefono: string | null | undefined): boolean {
  if (!telefono) return false;
  const digitos = telefono.replace(/[^0-9]/g, '');
  return digitos.length >= 7 && digitos.length <= 15;
}

export function SendWhatsAppButton({
  phone,
  entityType,
  entityId,
  nombre,
  size = 'sm',
  iconOnly = false,
  onSent,
}: SendWhatsAppButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [estado, setEstado] = useState<EstadoWhatsApp | null>(null);

  const nombreVisible = nombre ?? (entityType === 'lead' ? 'este lead' : 'este contacto');

  // Estado de la instancia del negocio: se muestra antes de enviar para que el
  // agente sepa por qué fallaría en vez de descubrirlo con el error del envío.
  useEffect(() => {
    let cancelado = false;
    fetch('/api/integraciones/whatsapp-negocio/estado', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelado && data?.estado) setEstado(data as EstadoWhatsApp);
      })
      .catch(() => {
        /* sin estado: el botón funciona igual */
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const handleEnviar = async () => {
    if (!mensaje.trim()) {
      toast.error('Escribe un mensaje antes de enviar');
      return;
    }
    if (!phone) return;

    setSending(true);
    try {
      const res = await fetch('/api/mensajes/enviar-ficha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: entityType,
          entityId,
          mensaje: mensaje.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        const detalle: string = data.error || 'No se pudo enviar el WhatsApp';
        const pista = /connection closed|not connected|no está conectado|desconectad/i.test(detalle)
          ? ' El WhatsApp del negocio está desconectado: reconéctalo en Configuración → WhatsApp del Negocio.'
          : '';
        // El mensaje fallido queda registrado en la conversación del Hub.
        toast.error(`No se envió: ${detalle}.${pista}`, { duration: 8000 });
        setIsOpen(false);
        return;
      }

      toast.success('WhatsApp enviado y registrado en el timeline');
      setIsOpen(false);
      setMensaje('');
      onSent?.();
    } catch (error: any) {
      console.error('Error enviando WhatsApp:', error);
      toast.error(error?.message || 'No se pudo enviar el WhatsApp');
    } finally {
      setSending(false);
    }
  };

  if (!esMovil(phone)) return null;

  const label = iconOnly ? undefined : 'Enviar WhatsApp';

  const desconectada = estado && estado.estado !== 'conectada';

  const etiquetaEstado: Record<EstadoInstancia, string> = {
    conectada: 'WhatsApp del negocio: conectado',
    desconectada: 'WhatsApp del negocio: desconectado',
    sin_instancia: 'WhatsApp del negocio: sin configurar',
    error: 'WhatsApp del negocio: estado sin verificar',
  };

  const motivo = estado?.detalle;

  return (
    <>
      {desconectada && (
        <Badge
          variant="outline"
          title={motivo}
          className="gap-1 border-amber-300 bg-amber-50 text-amber-800 text-xs font-normal"
        >
          <WifiOff className="h-3 w-3" />
          {estado.estado === 'sin_instancia' ? 'WhatsApp sin configurar' : 'WhatsApp desconectado'}
        </Badge>
      )}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            size={size}
            variant="outline"
            className="h-9 text-green-600 border-green-200 hover:bg-green-50 gap-2"
            disabled={sending}
          >
            {sending ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-green-600/30 border-t-green-600" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {label}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Phone className="h-5 w-5" />
              Enviar WhatsApp a {nombreVisible}
            </DialogTitle>
            <DialogDescription>
              Escribe el mensaje que se enviará por WhatsApp.
            </DialogDescription>
          </DialogHeader>

          {estado && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`h-2 w-2 rounded-full ${
                  estado.estado === 'conectada'
                    ? 'bg-green-500'
                    : estado.estado === 'desconectada'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                }`}
              />
              {etiquetaEstado[estado.estado]}
            </div>
          )}

          {desconectada && (
            <Alert className="mt-3 bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-xs">
                {motivo} Si el envío falla, reconecta el número escaneando el QR.{' '}
                <Link
                  href="/dashboard/configuracion/whatsapp-negocio"
                  className="font-medium underline"
                >
                  Ir a Configuración → WhatsApp
                </Link>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3 mt-4">
            <Label htmlFor="whatsapp-mensaje">Mensaje</Label>
            <Textarea
              id="whatsapp-mensaje"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Hola, te escribo desde Volkern CRM…"
              rows={4}
              className="max-h-48"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button onClick={handleEnviar} disabled={sending || !mensaje.trim()}>
              {sending ? 'Enviando…' : 'Enviar WhatsApp'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
