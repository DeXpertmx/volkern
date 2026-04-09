
'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import {
  Bot,
  MessageSquare,
  FileText,
  BarChart3,
  Plus,
  Edit,
  Trash2,
  Upload,
  Download,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileUp,
  Users,
  TrendingUp,
  Power
} from 'lucide-react'

interface PlaudernBot {
  id: string
  name: string
  personality?: string
  greetingMessage?: string
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
  activoLocal?: boolean // Estado local (activo/desactivado en el CRM)
}

interface PlaudernDocument {
  id: string
  filename: string
  size: number
  status: 'processing' | 'ready' | 'error'
  uploadedAt: string
}

interface PlaudernConversation {
  id: string
  customerName?: string
  customerPhone: string
  status: 'active' | 'closed' | 'archived'
  lastMessageAt: string
  unreadCount: number
}

interface PlaudernStats {
  totalConversations: number
  activeConversations: number
  totalMessages: number
  documentsCount: number
}

export default function PlaudernPage() {
  const { data: session } = useSession() || {}
  const [activeTab, setActiveTab] = useState('bots')
  const [loading, setLoading] = useState(true)
  const [integrationActive, setIntegrationActive] = useState(false)

  // Bots state
  const [bots, setBots] = useState<PlaudernBot[]>([])
  const [selectedBot, setSelectedBot] = useState<PlaudernBot | null>(null)
  const [showBotDialog, setShowBotDialog] = useState(false)
  const [savingBot, setSavingBot] = useState(false)
  const [botFormData, setBotFormData] = useState({
    name: '',
    personality: '',
    greetingMessage: ''
  })

  // Knowledge Base state
  const [documents, setDocuments] = useState<PlaudernDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedBotForKB, setSelectedBotForKB] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Conversations state
  const [conversations, setConversations] = useState<PlaudernConversation[]>([])
  const [stats, setStats] = useState<PlaudernStats | null>(null)

  // Delete confirmation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{ type: string; id: string } | null>(null)

  useEffect(() => {
    checkIntegration()
  }, [])

  useEffect(() => {
    if (integrationActive) {
      if (activeTab === 'bots') {
        fetchBots()
      } else if (activeTab === 'knowledge') {
        // Cargar bots primero si no están cargados
        if (bots.length === 0) {
          fetchBots().then(() => {
            // Seleccionar el primer bot por defecto
            if (bots.length > 0 && !selectedBotForKB) {
              setSelectedBotForKB(bots[0].id)
            }
          })
        } else if (!selectedBotForKB && bots.length > 0) {
          setSelectedBotForKB(bots[0].id)
        }
        fetchDocuments()
      } else if (activeTab === 'conversations') {
        fetchConversations()
      } else if (activeTab === 'metrics') {
        fetchConversations() // Para obtener las stats
      }
    }
  }, [activeTab, integrationActive])

  // Recargar documentos cuando cambie el bot seleccionado
  useEffect(() => {
    if (integrationActive && activeTab === 'knowledge' && selectedBotForKB) {
      fetchDocuments()
    }
  }, [selectedBotForKB])

  async function checkIntegration() {
    try {
      setLoading(true)
      const response = await fetch('/api/integraciones/plaudern')
      if (response.ok) {
        const data = await response.json()
        setIntegrationActive(data.activo && data.integration)
      } else {
        setIntegrationActive(false)
      }
    } catch (error) {
      console.error('Error al verificar integración:', error)
      setIntegrationActive(false)
    } finally {
      setLoading(false)
    }
  }

  async function fetchBots() {
    try {
      const response = await fetch('/api/plaudern/bots')
      if (response.ok) {
        const data = await response.json()
        setBots(data.bots || [])
      } else {
        const error = await response.json()
        toast.error(error.error || 'Error al cargar bots')
      }
    } catch (error) {
      console.error('Error al cargar bots:', error)
      toast.error('Error al cargar bots')
    }
  }

  async function fetchDocuments() {
    try {
      // Si hay un bot seleccionado, pasar su ID como parámetro
      const url = selectedBotForKB 
        ? `/api/plaudern/knowledge-base?botId=${selectedBotForKB}`
        : '/api/plaudern/knowledge-base'
      
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents || [])
      } else {
        const error = await response.json()
        toast.error(error.error || 'Error al cargar documentos')
      }
    } catch (error) {
      console.error('Error al cargar documentos:', error)
      toast.error('Error al cargar documentos')
    }
  }

  async function fetchConversations() {
    try {
      const response = await fetch('/api/plaudern/conversations')
      if (response.ok) {
        const data = await response.json()
        setConversations(data.conversations || [])
        setStats(data.stats || null)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Error al cargar conversaciones')
      }
    } catch (error) {
      console.error('Error al cargar conversaciones:', error)
      toast.error('Error al cargar conversaciones')
    }
  }

  async function handleSaveBot() {
    try {
      if (!botFormData.name || !botFormData.personality) {
        toast.error('Nombre y personalidad son requeridos')
        return
      }

      if (savingBot) return // Prevenir múltiples clics

      setSavingBot(true)
      const isEditing = selectedBot !== null
      const url = isEditing
        ? `/api/plaudern/bots/${selectedBot.id}`
        : '/api/plaudern/bots'
      const method = isEditing ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botFormData)
      })

      if (response.ok) {
        toast.success(isEditing ? 'Bot actualizado exitosamente' : 'Bot creado exitosamente')
        setShowBotDialog(false)
        setBotFormData({ name: '', personality: '', greetingMessage: '' })
        setSelectedBot(null)
        fetchBots()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Error al guardar bot')
      }
    } catch (error) {
      console.error('Error al guardar bot:', error)
      toast.error('Error al guardar bot')
    } finally {
      setSavingBot(false)
    }
  }

  async function handleUploadDocument() {
    try {
      if (!selectedFile) {
        toast.error('Selecciona un archivo')
        return
      }

      if (!selectedBotForKB) {
        toast.error('Debes seleccionar un bot primero')
        return
      }

      setUploading(true)
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('botId', selectedBotForKB)

      const response = await fetch('/api/plaudern/knowledge-base', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        toast.success('Documento subido exitosamente y asociado al bot seleccionado')
        setSelectedFile(null)
        // Limpiar el input de archivo
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        fetchDocuments()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Error al subir documento')
      }
    } catch (error) {
      console.error('Error al subir documento:', error)
      toast.error('Error al subir documento')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!itemToDelete) return

    try {
      let url = ''
      if (itemToDelete.type === 'bot') {
        url = `/api/plaudern/bots/${itemToDelete.id}`
      } else if (itemToDelete.type === 'document') {
        url = `/api/plaudern/knowledge-base/${itemToDelete.id}`
      }

      const response = await fetch(url, { method: 'DELETE' })

      if (response.ok) {
        toast.success('Eliminado exitosamente')
        if (itemToDelete.type === 'bot') {
          fetchBots()
        } else if (itemToDelete.type === 'document') {
          fetchDocuments()
        }
      } else {
        const error = await response.json()
        toast.error(error.error || 'Error al eliminar')
      }
    } catch (error) {
      console.error('Error al eliminar:', error)
      toast.error('Error al eliminar')
    } finally {
      setShowDeleteDialog(false)
      setItemToDelete(null)
    }
  }

  async function handleToggleBot(botId: string, currentStatus: boolean) {
    try {
      const response = await fetch(`/api/plaudern/bots/${botId}/toggle`, {
        method: 'POST'
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(data.message || `Bot ${data.status === 'activo' ? 'activado' : 'desactivado'} exitosamente`)
        fetchBots() // Recargar lista de bots
      } else {
        const error = await response.json()
        toast.error(error.error || 'Error al cambiar estado del bot')
      }
    } catch (error) {
      console.error('Error al cambiar estado del bot:', error)
      toast.error('Error al cambiar estado del bot')
    }
  }

  function openBotDialog(bot?: PlaudernBot) {
    if (bot) {
      setSelectedBot(bot)
      setBotFormData({
        name: bot.name,
        personality: bot.personality || '',
        greetingMessage: bot.greetingMessage || ''
      })
    } else {
      setSelectedBot(null)
      setBotFormData({ name: '', personality: '', greetingMessage: '' })
    }
    setShowBotDialog(true)
  }

  function confirmDelete(type: string, id: string) {
    setItemToDelete({ type, id })
    setShowDeleteDialog(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    )
  }

  if (!integrationActive) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Plaudern Chatbot</h1>
            <p className="text-muted-foreground mt-2">
              Gestiona tu chatbot inteligente con IA
            </p>
          </div>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Integración no configurada.</strong> Primero debes configurar la integración
            de Plaudern en el módulo de <a href="/dashboard/integraciones" className="underline font-medium">Integraciones</a>.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-8 w-8 text-purple-600" />
            Plaudern Chatbot
          </h1>
          <p className="text-muted-foreground mt-2">
            Gestiona bots, base de conocimiento y conversaciones
          </p>
        </div>
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Conectado
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="bots">
            <Bot className="h-4 w-4 mr-2" />
            Bots
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <FileText className="h-4 w-4 mr-2" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="conversations">
            <MessageSquare className="h-4 w-4 mr-2" />
            Conversaciones
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Métricas
          </TabsTrigger>
        </TabsList>

        {/* Tab: Bots */}
        <TabsContent value="bots" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tus Bots de Chat</CardTitle>
                  <CardDescription>
                    Crea y configura bots con diferentes personalidades
                  </CardDescription>
                </div>
                <Button onClick={() => openBotDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Bot
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {bots.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay bots configurados aún</p>
                  <Button variant="outline" className="mt-4" onClick={() => openBotDialog()}>
                    Crear tu primer bot
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {bots.map((bot) => (
                    <Card key={bot.id} className="relative">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-500/10 rounded-lg">
                              <Bot className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{bot.name}</CardTitle>
                              <div className="flex gap-2 mt-1">
                                <Badge
                                  variant="outline"
                                  className={
                                    bot.status === 'active'
                                      ? 'text-green-600 border-green-600'
                                      : 'text-gray-600'
                                  }
                                >
                                  {bot.status === 'active' ? 'Activo' : 'Inactivo'}
                                </Badge>
                                {bot.activoLocal === false && (
                                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                                    Desactivado
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                          {bot.personality || 'Sin personalidad configurada'}
                        </p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openBotDialog(bot)}>
                            <Edit className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleToggleBot(bot.id, bot.activoLocal !== false)}
                            className={bot.activoLocal === false ? 'text-gray-500 hover:text-green-600' : 'text-green-600 hover:text-gray-500'}
                          >
                            <Power className="h-3 w-3 mr-1" />
                            {bot.activoLocal === false ? 'Activar' : 'Desactivar'}
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => confirmDelete('bot', bot.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Eliminar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Knowledge Base */}
        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Base de Conocimiento (RAG)</CardTitle>
                  <CardDescription>
                    Sube documentos para que tu bot aprenda
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Bot Selector */}
              {bots.length > 0 && (
                <div className="mb-6">
                  <Label htmlFor="bot-select" className="mb-2 block">
                    Selecciona el bot para asociar documentos
                  </Label>
                  <Select value={selectedBotForKB} onValueChange={setSelectedBotForKB}>
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder="Selecciona un bot" />
                    </SelectTrigger>
                    <SelectContent>
                      {bots.map((bot) => (
                        <SelectItem key={bot.id} value={bot.id}>
                          {bot.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedBotForKB && (
                    <p className="text-sm text-yellow-600 mt-2">
                      ⚠️ Debes seleccionar un bot antes de subir documentos
                    </p>
                  )}
                </div>
              )}

              {bots.length === 0 && (
                <Alert className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Primero crea un bot.</strong> Necesitas al menos un bot antes de subir documentos.
                    <Button variant="link" className="p-0 h-auto ml-1" onClick={() => setActiveTab('bots')}>
                      Ir a Bots
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Upload Section */}
              <div className="border-2 border-dashed rounded-lg p-8 mb-6">
                <div className="flex flex-col items-center text-center">
                  <FileUp className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Subir Documento</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    PDF, TXT, MD o DOCX (máx. 10MB)
                  </p>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.docx"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="max-w-xs mb-4"
                  />
                  {selectedFile && (
                    <div className="text-sm text-muted-foreground mb-4">
                      Archivo seleccionado: <strong>{selectedFile.name}</strong>
                    </div>
                  )}
                  <Button
                    onClick={handleUploadDocument}
                    disabled={!selectedFile || uploading || !selectedBotForKB}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Subir Documento
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Documents List */}
              {documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>
                    {selectedBotForKB 
                      ? `No hay documentos subidos para el bot "${bots.find(b => b.id === selectedBotForKB)?.name || 'seleccionado'}"`
                      : 'Selecciona un bot para ver sus documentos'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{doc.filename}</p>
                          <p className="text-sm text-muted-foreground">
                            {(doc.size / 1024).toFixed(2)} KB •{' '}
                            {new Date(doc.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            doc.status === 'ready'
                              ? 'text-green-600 border-green-600'
                              : doc.status === 'processing'
                              ? 'text-blue-600 border-blue-600'
                              : 'text-red-600 border-red-600'
                          }
                        >
                          {doc.status === 'ready'
                            ? 'Listo'
                            : doc.status === 'processing'
                            ? 'Procesando'
                            : 'Error'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmDelete('document', doc.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Conversations */}
        <TabsContent value="conversations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conversaciones</CardTitle>
              <CardDescription>
                Historial de conversaciones con clientes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {conversations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay conversaciones aún</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {conv.customerName || conv.customerPhone}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(conv.lastMessageAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            conv.status === 'active'
                              ? 'text-green-600 border-green-600'
                              : 'text-gray-600'
                          }
                        >
                          {conv.status === 'active'
                            ? 'Activa'
                            : conv.status === 'closed'
                            ? 'Cerrada'
                            : 'Archivada'}
                        </Badge>
                        {conv.unreadCount > 0 && (
                          <Badge className="bg-blue-500">{conv.unreadCount}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Metrics */}
        <TabsContent value="metrics" className="space-y-4">
          {stats ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Conversaciones</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalConversations}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Conversaciones Activas</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.activeConversations}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Mensajes</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalMessages}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Documentos KB</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.documentsCount}</div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No hay métricas disponibles</AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog: Create/Edit Bot */}
      <Dialog open={showBotDialog} onOpenChange={setShowBotDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedBot ? 'Editar Bot' : 'Crear Nuevo Bot'}</DialogTitle>
            <DialogDescription>
              Configura la personalidad y el comportamiento de tu bot
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre del Bot *</Label>
              <Input
                id="name"
                value={botFormData.name}
                onChange={(e) => setBotFormData({ ...botFormData, name: e.target.value })}
                placeholder="Mi Bot de Ventas"
              />
            </div>
            <div>
              <Label htmlFor="personality">Personalidad (Prompt del Sistema) *</Label>
              <Textarea
                id="personality"
                value={botFormData.personality}
                onChange={(e) => setBotFormData({ ...botFormData, personality: e.target.value })}
                placeholder="Eres un asistente virtual amigable y profesional. Ayudas a los clientes con sus consultas de manera eficiente y cortés."
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="greeting">Mensaje de Bienvenida</Label>
              <Input
                id="greeting"
                value={botFormData.greetingMessage}
                onChange={(e) =>
                  setBotFormData({ ...botFormData, greetingMessage: e.target.value })
                }
                placeholder="¡Hola! ¿En qué puedo ayudarte hoy?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBotDialog(false)} disabled={savingBot}>
              Cancelar
            </Button>
            <Button onClick={handleSaveBot} disabled={savingBot}>
              {savingBot ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  {selectedBot ? 'Actualizar' : 'Crear'} Bot
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El elemento será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
