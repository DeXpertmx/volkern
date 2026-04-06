
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageCircle,
  Mail,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Archive,
  Phone,
  MessageSquare,
  Send,
  Facebook,
  Instagram,
  Bot,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Conversacion {
  id: string
  contactoNombre: string
  contactoEmail?: string
  contactoTelefono?: string
  canal: string
  estado: string
  ultimoMensaje?: string
  fechaUltimoMensaje?: string
  noLeidos: number
  lead?: any
  estudiante?: any
  mensajes?: any[]
}

export default function MensajesPage() {
  const router = useRouter()
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [canalFilter, setCanalFilter] = useState('todos')
  const [estadoFilter, setEstadoFilter] = useState('todos')

  const fetchConversaciones = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (canalFilter !== 'todos') params.append('canal', canalFilter)
      if (estadoFilter !== 'todos') params.append('estado', estadoFilter)

      const response = await fetch(`/api/mensajes/conversaciones?${params}`)
      const data = await response.json()

      if (response.ok) {
        setConversaciones(data.conversaciones || [])
      } else {
        toast.error(data.error || 'Error al cargar conversaciones')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar conversaciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConversaciones()
  }, [canalFilter, estadoFilter])

  const filteredConversaciones = conversaciones.filter((conv) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      conv.contactoNombre.toLowerCase().includes(searchLower) ||
      (conv.contactoEmail && conv.contactoEmail.toLowerCase().includes(searchLower)) ||
      (conv.ultimoMensaje && conv.ultimoMensaje.toLowerCase().includes(searchLower))
    )
  })

  const getCanalIcon = (canal: string) => {
    switch (canal) {
      case 'whatsapp':
        return <Phone className="h-4 w-4" />
      case 'email':
        return <Mail className="h-4 w-4" />
      case 'sms':
        return <MessageSquare className="h-4 w-4" />
      case 'telegram':
        return <Send className="h-4 w-4" />
      case 'facebook':
        return <Facebook className="h-4 w-4" />
      case 'instagram':
        return <Instagram className="h-4 w-4" />
      case 'web':
      case 'webchat':
      case 'chatbot':
        return <Bot className="h-4 w-4" />
      default:
        return <MessageCircle className="h-4 w-4" />
    }
  }

  const getCanalBadgeColor = (canal: string) => {
    switch (canal) {
      case 'whatsapp':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
      case 'email':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      case 'sms':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
      case 'telegram':
        return 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300'
      case 'facebook':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      case 'instagram':
        return 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300'
      case 'web':
      case 'webchat':
      case 'chatbot':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    }
  }

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'abierta':
        return <Badge variant="default">Abierta</Badge>
      case 'cerrada':
        return <Badge variant="secondary">Cerrada</Badge>
      case 'archivada':
        return <Badge variant="outline">Archivada</Badge>
      default:
        return <Badge>{estado}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mensajes</h1>
          <p className="text-muted-foreground">
            Panel unificado de conversaciones multicanal
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchConversaciones} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
          <Button onClick={() => router.push('/dashboard/mensajes/templates')} variant="outline" size="sm">
            <MessageCircle className="mr-2 h-4 w-4" />
            Templates
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email o mensaje..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={canalFilter} onValueChange={setCanalFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los canales</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="web">Web/Chatbot</SelectItem>
            </SelectContent>
          </Select>
          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="abierta">Abiertas</SelectItem>
              <SelectItem value="cerrada">Cerradas</SelectItem>
              <SelectItem value="archivada">Archivadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Lista de conversaciones */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredConversaciones.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              No hay conversaciones
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm
                ? 'No se encontraron conversaciones con ese criterio'
                : 'Las conversaciones aparecerán aquí cuando recibas mensajes'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredConversaciones.map((conv) => (
            <Card
              key={conv.id}
              className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/dashboard/mensajes/${conv.id}`)}
            >
              <div className="flex items-start gap-4">
                {/* Avatar/Icon */}
                <div className={`p-3 rounded-full ${getCanalBadgeColor(conv.canal)}`}>
                  {getCanalIcon(conv.canal)}
                </div>

                {/* Contenido */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">
                        {conv.contactoNombre}
                      </h3>
                      {conv.noLeidos > 0 && (
                        <Badge variant="destructive" className="rounded-full px-2">
                          {conv.noLeidos}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getEstadoBadge(conv.estado)}
                      {conv.fechaUltimoMensaje && (
                        <span className="text-xs text-muted-foreground">
                          {format(
                            new Date(conv.fechaUltimoMensaje),
                            'dd MMM, HH:mm',
                            { locale: es }
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    {conv.contactoEmail && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {conv.contactoEmail}
                      </span>
                    )}
                    {conv.contactoTelefono && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {conv.contactoTelefono}
                      </span>
                    )}
                  </div>

                  {conv.ultimoMensaje && (
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.ultimoMensaje}
                    </p>
                  )}

                  {/* Tags de relación */}
                  <div className="flex gap-2 mt-2">
                    {conv.lead && (
                      <Badge variant="outline" className="text-xs">
                        Lead: {conv.lead.nombre}
                      </Badge>
                    )}
                    {conv.estudiante && (
                      <Badge variant="outline" className="text-xs">
                        Estudiante: {conv.estudiante.nombre}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Resumen */}
      {!loading && conversaciones.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Mostrando {filteredConversaciones.length} de {conversaciones.length}{' '}
              conversaciones
            </span>
            <div className="flex gap-4">
              <span>
                WhatsApp:{' '}
                {conversaciones.filter((c) => c.canal === 'whatsapp').length}
              </span>
              <span>
                Email: {conversaciones.filter((c) => c.canal === 'email').length}
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
