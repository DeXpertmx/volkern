'use client';

import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, Phone, AlertCircle, CheckCircle2 } from 'lucide-react';
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
}

/**
 * Detecta si un teléfono es móvil usando una heurística sencilla:
 * formato internacional con al menos 7 dígitos y sin ser claramente fijo.
 * No usa librería externa para mantener el bundle ligero.
 */
function esMovil(telefono: string | null | undefined): boolean {
  if (!telefono) return false;
  const digitos = telefono.replace(/[^0-9]/g, '');
  // Móvil: entre 7 y 15 dígitos
  return digitos.length >= 7 && digitos.length <= 15;
}

export function SendWhatsAppButton({
  phone,
  entityType,
  entityId,
  nombre,
  size = 'sm',
  iconOnly = false,
}: SendWhatsAppButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const apiBase = entityType === 'lead' ? `/api/leads/${entityId}` : `/api/contacts/${entityId}`;
  const nombreVisible = nombre ?? entityType === 'lead' ? 'este lead' : 'este contacto';

  const limpiarTelefono = (tel: string) => tel.replace(/[^0-9+]/g, '');

  const handleEnviar = async () => {
    if (!mensaje.trim()) {
      toast.error('Escribe un mensaje antes de enviar');
      return;
    }
    if (!phone) return;

    setSending(true);
    try {
      // 1. Enviar por WhatsApp
      const res = await fetch('/api/mensajes/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canal: 'whatsapp',
          destinatario: {
            nombre: nombreVisible,
            telefono: limpiarTelefono(phone),
          },
          contenido: mensaje.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error enviando WhatsApp');
      }

      const data = await res.json();

      // 2. Registrar interacción en el timeline
      const interRes = await fetch(`${apiBase}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'whatsapp',
          contenido: mensaje.trim(),
          resultado: 'positivo',
          metadatos: {
            canal: 'whatsapp',
            messageId: data.mensaje?.id,
            telefono: limpiarTelefono(phone),
          },
        }),
      });

      if (!interRes.ok) {
        // El WhatsApp se envió pero no se pudo registrar la interacción.
        // Avisamos pero no bloqueamos.
        console.warn('WhatsApp enviado pero interacción no registrada', await interRes.text());
        toast.success('Mensaje enviado por WhatsApp');
      } else {
        toast.success('WhatsApp enviado y registrado en el timeline');
      }

      setIsOpen(false);
      setMensaje('');
    } catch (error: any) {
      console.error('Error enviando WhatsApp:', error);
      toast.error(error.message || 'No se pudo enviar el WhatsApp');
    } finally {
      setSending(false);
    }
  };

  if (!esMovil(phone)) return null;

  const label = iconOnly ? undefined : 'Enviar WhatsApp';

  return (
    <>
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
