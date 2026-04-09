
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageCircle,
  Mail,
  Phone,
  RefreshCw,
  Send,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

interface HistorialComunicacionesProps {
  leadId?: string
  estudianteId?: string
  contactoNombre: string
  contactoEmail?: string
  contactoTelefono?: string
}

interface Conversacion {
  id: string
  canal: string
  estado: string
  fechaCreacion: string
  mensajes: Mensaje[]
}

interface Mensaje {
  id: string
  contenido: string
  direccion: string
  canal: string
  estado: string
  fechaCreacion: string
}

export function HistorialComunicaciones({
  leadId,
  estudianteId,
  contactoNombre,
  contactoEmail,
  contactoTelefono,
}: HistorialComunicacionesProps) {
  const router = useRouter()
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
  const [loading, setLoading] = useState(true)
  const [showEnviarDialog, setShowEnviarDialog] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [canal, setCanal] = useState<string>('whatsapp')
  const [enviando, setEnviando] = useState(false)

  const fetchHistorial = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (leadId) params.append('leadId', leadId)
      if (estudianteId) params.append('estudianteId', estudianteId)

      const response = await fetch(`/api/mensajes/historial?${params}`)
      const data = await response.json()

      if (response.ok) {
        setConversaciones(data.conversaciones || [])
      } else {
        toast.error(data.error || 'Error al cargar historial')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar historial')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (leadId || estudianteId) {
      fetchHistorial()
    }
  }, [leadId, estudianteId])

  const handleEnviarMensaje = async () => {
    if (!mensaje.trim()) {
      toast.error('Por favor escribe un mensaje')
      return
    }

    if (canal === 'email' && !contactoEmail) {
      toast.error('No hay email disponible')
      return
    }

    if (canal === 'whatsapp' && !contactoTelefono) {
      toast.error('No hay teléfono disponible')
      return
    }

    try {
      setEnviando(true)

      const response = await fetch('/api/mensajes/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinatario: {
            nombre: contactoNombre,
            email: contactoEmail,
            telefono: contactoTelefono,
          },
          contenido: mensaje,
          canal,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Mensaje enviado correctamente')
        setMensaje('')
        setShowEnviarDialog(false)
        fetchHistorial()
      } else {
        toast.error(data.error || 'Error al enviar mensaje')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al enviar mensaje')
    } finally {
      setEnviando(false)
    }
  }

  const getCanalIcon = (canal: string) => {
    switch (canal) {
      case 'whatsapp':
        return <Phone className="h-4 w-4 text-green-600" />
      case 'email':
        return <Mail className="h-4 w-4 text-blue-600" />
      default:
        return <MessageCircle className="h-4 w-4" />
    }
  }

  const totalMensajes = conversaciones.reduce(
    (acc, conv) => acc + conv.mensajes.length,
    0
  )

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">
            Historial de Comunicaciones
          </h3>
          <p className="text-sm text-muted-foreground">
            {totalMensajes} mensajes en {conversaciones.length} conversaciones
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchHistorial} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={showEnviarDialog} onOpenChange={setShowEnviarDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Send className="mr-2 h-4 w-4" />
                Enviar Mensaje
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enviar Mensaje</DialogTitle>
                <DialogDescription>
                  Envía un mensaje a {contactoNombre}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Canal</Label>
                  <Select value={canal} onValueChange={setCanal}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {contactoTelefono && (
                        <SelectItem value="whatsapp">
                          WhatsApp - {contactoTelefono}
                        </SelectItem>
                      )}
                      {contactoEmail && (
                        <SelectItem value="email">
                          Email - {contactoEmail}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mensaje</Label>
                  <Textarea
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    placeholder="Escribe tu mensaje..."
                    className="min-h-[120px]"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowEnviarDialog(false)}
                >
                  Cancelar
                </Button>
                <Button onClick={handleEnviarMensaje} disabled={enviando}>
                  {enviando ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Enviar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : conversaciones.length === 0 ? (
        <div className="text-center py-8">
          <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            No hay mensajes en el historial
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {conversaciones.map((conv) => (
            <div
              key={conv.id}
              className="border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => router.push(`/dashboard/mensajes/${conv.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {getCanalIcon(conv.canal)}
                  <span className="font-medium capitalize">{conv.canal}</span>
                  <Badge variant="outline" className="text-xs">
                    {conv.mensajes.length} mensajes
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(conv.fechaCreacion), 'dd MMM yyyy', {
                      locale: es,
                    })}
                  </span>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                {conv.mensajes.slice(-3).map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex gap-2 text-sm',
                      msg.direccion === 'saliente'
                        ? 'text-muted-foreground'
                        : ''
                    )}
                  >
                    <Badge
                      variant={
                        msg.direccion === 'saliente' ? 'default' : 'secondary'
                      }
                      className="shrink-0 h-5"
                    >
                      {msg.direccion === 'saliente' ? '→' : '←'}
                    </Badge>
                    <p className="truncate flex-1">{msg.contenido}</p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(msg.fechaCreacion), 'HH:mm', {
                        locale: es,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
