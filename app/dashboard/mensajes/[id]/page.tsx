
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowLeft,
  Send,
  Phone,
  Mail,
  MoreVertical,
  RefreshCw,
  FileText,
  User,
  MessageSquare,
  Facebook,
  Instagram,
  ImageIcon,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'

interface Mensaje {
  id: string
  contenido: string
  direccion: string
  canal: string
  estado: string
  fechaCreacion: string
  metadatos?: {
    mediaUrl?: string
    mediaType?: string
    [key: string]: any
  }
}

interface Conversacion {
  id: string
  contactoNombre: string
  contactoEmail?: string
  contactoTelefono?: string
  canal: string
  estado: string
  lead?: any
  estudiante?: any
  mensajes: Mensaje[]
}

interface Template {
  id: string
  nombre: string
  contenido: string
  canal: string
  variables?: any
}

export default function ConversacionPage() {
  const params = useParams()
  const router = useRouter()
  const conversacionId = params.id as string
  const [conversacion, setConversacion] = useState<Conversacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [showAIImageDialog, setShowAIImageDialog] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [generatingImage, setGeneratingImage] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedImageType, setSelectedImageType] = useState<'upload' | 'ai' | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [showSummaryDialog, setShowSummaryDialog] = useState(false)
  const [summary, setSummary] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchConversacion = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/mensajes/conversaciones/${conversacionId}`)
      const data = await response.json()

      if (response.ok) {
        setConversacion(data)
      } else {
        toast.error(data.error || 'Error al cargar conversación')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar conversación')
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/mensajes/templates?activo=true')
      const data = await response.json()

      if (response.ok && conversacion) {
        // Filtrar templates por canal
        const filtered = data.templates.filter(
          (t: Template) => t.canal === conversacion.canal || t.canal === 'ambos'
        )
        setTemplates(filtered)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  useEffect(() => {
    if (conversacionId) {
      fetchConversacion()
    }
  }, [conversacionId])

  useEffect(() => {
    if (conversacion) {
      fetchTemplates()
      scrollToBottom()
    }
  }, [conversacion])

  // Auto-refresh: actualizar mensajes cada 10 segundos
  useEffect(() => {
    if (!conversacionId) return

    const interval = setInterval(() => {
      fetchConversacion()
    }, 10000) // 10 segundos

    return () => clearInterval(interval)
  }, [conversacionId])

  const handleEnviarMensaje = async (contenidoPersonalizado?: string) => {
    const contenidoFinal = contenidoPersonalizado || mensaje

    if (!contenidoFinal.trim() && !selectedImage) {
      toast.error('Debes escribir un mensaje o seleccionar una imagen')
      return
    }

    if (!conversacion) return

    try {
      setEnviando(true)

      const body: any = {
        conversationId: conversacion.id,
        contenido: contenidoFinal || '📷 Imagen',
        canal: conversacion.canal,
      }

      // Si hay imagen seleccionada, incluirla
      if (selectedImage) {
        body.mediaUrl = selectedImage
        body.mediaType = 'image'
      }

      const response = await fetch('/api/mensajes/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Mensaje enviado correctamente')
        setMensaje('')
        handleRemoveImage()
        fetchConversacion() // Recargar conversación
      } else {
        toast.error(data.error || 'Error al enviar mensaje')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al enviar mensaje')
    } finally {
      setEnviando(false)
      setShowTemplateDialog(false)
      setSelectedTemplate(null)
    }
  }

  const handleUsarTemplate = (template: Template) => {
    let contenido = template.contenido

    // Reemplazar variables avanzadas
    if (conversacion) {
      const now = new Date();
      const fechaHoy = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

      contenido = contenido.replace(/{nombre}/g, conversacion.contactoNombre);
      contenido = contenido.replace(/{empresa}/g, conversacion.lead?.empresa || '');
      contenido = contenido.replace(/{id_fiscal}/g, conversacion.lead?.perfilFiscal?.idFiscal || '');
      contenido = contenido.replace(/{fecha_hoy}/g, fechaHoy);
    }

    setMensaje(contenido)
    setShowTemplateDialog(false)
  }

  const handleUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validar tipo de archivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Tipo de archivo no válido. Solo se permiten imágenes JPG, PNG, GIF y WEBP')
      return
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo es demasiado grande. Tamaño máximo: 5MB')
      return
    }

    try {
      setUploadingImage(true)
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/mensajes/upload-image', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (response.ok) {
        setSelectedImage(data.cloud_storage_path)
        setSelectedImageType('upload')
        toast.success('Imagen subida exitosamente')
      } else {
        toast.error(data.error || 'Error al subir la imagen')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al subir la imagen')
    } finally {
      setUploadingImage(false)
    }
  }

  const handleGenerateAIImage = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Por favor ingresa una descripción para la imagen')
      return
    }

    try {
      setGeneratingImage(true)
      const response = await fetch('/api/mensajes/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          aspectRatio: '1:1',
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSelectedImage(data.imageUrl)
        setSelectedImageType('ai')
        setShowAIImageDialog(false)
        setAiPrompt('')
        toast.success('Imagen generada exitosamente')
      } else {
        toast.error(data.error || 'Error al generar la imagen')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al generar la imagen')
    } finally {
      setGeneratingImage(false)
    }
  }

  const handleRemoveImage = () => {
    setSelectedImage(null)
    setSelectedImageType(null)
  }

  const handleSummarize = async () => {
    if (!conversacion) return

    try {
      setSummarizing(true)
      const response = await fetch('/api/mensajes/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversacion.id }),
      })

      const data = await response.json()

      if (response.ok) {
        setSummary(data.summary)
        setShowSummaryDialog(true)
        toast.success('Resumen generado exitosamente')
      } else {
        toast.error(data.error || 'Error al generar resumen')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al generar resumen')
    } finally {
      setSummarizing(false)
    }
  }

  const handleSuggestReply = async () => {
    if (!conversacion) return

    try {
      setSuggesting(true)
      const response = await fetch('/api/mensajes/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversacion.id }),
      })

      const data = await response.json()

      if (response.ok) {
        setMensaje(data.suggestion)
        toast.success('Sugerencia generada')
      } else {
        toast.error(data.error || 'Error al generar sugerencia')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al generar sugerencia')
    } finally {
      setSuggesting(false)
    }
  }

  const handleCambiarEstado = async (nuevoEstado: string) => {
    try {
      const response = await fetch(`/api/mensajes/conversaciones/${conversacionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })

      if (response.ok) {
        toast.success('Estado actualizado')
        fetchConversacion()
      } else {
        toast.error('Error al actualizar estado')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al actualizar estado')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!conversacion) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-muted-foreground">Conversación no encontrada</p>
        <Button onClick={() => router.push('/dashboard/mensajes')}>
          Volver a Mensajes
        </Button>
      </div>
    )
  }

  const getCanalIcon = () => {
    switch (conversacion.canal) {
      case 'whatsapp':
        return <Phone className="h-5 w-5 text-green-600" />
      case 'email':
        return <Mail className="h-5 w-5 text-blue-600" />
      case 'sms':
        return <MessageSquare className="h-5 w-5 text-orange-600" />
      case 'telegram':
        return <Send className="h-5 w-5 text-sky-600" />
      case 'facebook':
        return <Facebook className="h-5 w-5 text-blue-600" />
      case 'instagram':
        return <Instagram className="h-5 w-5 text-pink-600" />
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/mensajes')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            {getCanalIcon()}
            <div>
              <h2 className="font-semibold">{conversacion.contactoNombre}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {conversacion.contactoEmail && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {conversacion.contactoEmail}
                  </span>
                )}
                {conversacion.contactoTelefono && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {conversacion.contactoTelefono}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {conversacion.lead && (
            <Badge variant="outline">
              <User className="h-3 w-3 mr-1" />
              Lead: {conversacion.lead.nombre}
            </Badge>
          )}
          {conversacion.estudiante && (
            <Badge variant="outline">
              <User className="h-3 w-3 mr-1" />
              Estudiante: {conversacion.estudiante.nombre}
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            className="hidden md:flex items-center gap-2 text-primary border-primary/20 hover:bg-primary/5"
            onClick={handleSummarize}
            disabled={summarizing || conversacion.mensajes.length === 0}
          >
            {summarizing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Resumir IA
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleCambiarEstado('abierta')}>
                Marcar como abierta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCambiarEstado('cerrada')}>
                Marcar como cerrada
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCambiarEstado('archivada')}>
                Archivar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={fetchConversacion}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
        {conversacion.mensajes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              No hay mensajes en esta conversación
            </p>
          </div>
        ) : (
          conversacion.mensajes.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.direccion === 'saliente' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[70%] rounded-lg p-3',
                  msg.direccion === 'saliente'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background border'
                )}
              >
                {/* Mostrar imagen si existe */}
                {msg.metadatos?.mediaUrl && msg.metadatos?.mediaType === 'image' && (
                  <div className="relative w-full aspect-video mb-2 rounded-md overflow-hidden bg-muted">
                    <Image
                      src={msg.metadatos.mediaUrl}
                      alt="Imagen del mensaje"
                      fill
                      className="object-cover"
                      unoptimized={msg.metadatos.mediaUrl.startsWith('http')}
                    />
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">
                  {msg.contenido}
                </p>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <span
                    className={cn(
                      'text-xs',
                      msg.direccion === 'saliente'
                        ? 'text-primary-foreground/70'
                        : 'text-muted-foreground'
                    )}
                  >
                    {format(new Date(msg.fechaCreacion), 'HH:mm', { locale: es })}
                  </span>
                  {msg.estado === 'error' && (
                    <Badge variant="destructive" className="text-xs">
                      Error
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de mensaje */}
      <div className="p-4 border-t bg-background">
        {/* Preview de imagen seleccionada */}
        {selectedImage && (
          <div className="mb-3 relative inline-block">
            <div className="relative w-32 h-32 rounded-lg overflow-hidden border-2 border-primary">
              <Image
                src={selectedImage}
                alt="Preview"
                fill
                className="object-cover"
                unoptimized={selectedImage.startsWith('http')}
              />
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
              onClick={handleRemoveImage}
            >
              <X className="h-4 w-4" />
            </Button>
            <Badge className="absolute -bottom-2 left-1/2 -translate-x-1/2" variant="secondary">
              {selectedImageType === 'ai' ? (
                <><Sparkles className="h-3 w-3 mr-1" /> IA</>
              ) : (
                <><Upload className="h-3 w-3 mr-1" /> Subida</>
              )}
            </Badge>
          </div>
        )}

        <div className="flex gap-2">
          {/* Botón de Templates */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTemplateDialog(true)}
            disabled={templates.length === 0}
            title="Usar template"
          >
            <FileText className="h-4 w-4" />
          </Button>

          {/* Botón de Subir Imagen */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUploadImage}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage || !!selectedImage}
            title="Subir imagen"
          >
            {uploadingImage ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
          </Button>

          {/* Botón de Sugerir con IA */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSuggestReply}
            disabled={suggesting || conversacion.mensajes.length === 0}
            title="Sugerir respuesta con IA"
            className="text-primary border-primary/20"
          >
            {suggesting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>

          {/* Botón de Generar Imagen con IA */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAIImageDialog(true)}
            disabled={generatingImage || !!selectedImage}
            title="Generar imagen con IA"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>

          <Textarea
            placeholder={`Escribe un mensaje vía ${conversacion.canal}...`}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleEnviarMensaje()
              }
            }}
            className="min-h-[60px] resize-none"
          />
          <Button
            onClick={() => handleEnviarMensaje()}
            disabled={(!mensaje.trim() && !selectedImage) || enviando}
            size="sm"
          >
            {enviando ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Dialog de Resumen con IA */}
      <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Resumen Ejecutivo (IA)
            </DialogTitle>
            <DialogDescription>
              Este resumen fue generado analizando los últimos mensajes de la conversación.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-50 border rounded-lg p-4 max-h-[400px] overflow-y-auto">
            <div className="prose prose-sm dark:prose-invert">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {summary}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSummaryDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seleccionar Template</DialogTitle>
            <DialogDescription>
              Elige un template para usar como base de tu mensaje
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {templates.map((template) => (
              <Card
                key={template.id}
                className="p-4 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleUsarTemplate(template)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold">{template.nombre}</h4>
                  <Badge variant="outline">{template.canal}</Badge>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {template.contenido}
                </p>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Generar Imagen con IA */}
      <Dialog open={showAIImageDialog} onOpenChange={setShowAIImageDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generar Imagen con IA
            </DialogTitle>
            <DialogDescription>
              Describe la imagen que quieres generar y la IA la creará por ti
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Descripción de la imagen
              </label>
              <Textarea
                placeholder="Ej: Un atardecer en la playa con palmeras y un cielo naranja..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="min-h-[100px]"
                disabled={generatingImage}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAIImageDialog(false)
                setAiPrompt('')
              }}
              disabled={generatingImage}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerateAIImage}
              disabled={!aiPrompt.trim() || generatingImage}
            >
              {generatingImage ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generar Imagen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
