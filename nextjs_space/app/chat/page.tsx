'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Building2,
  CalendarDays,
  Camera,
  CheckSquare,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'agent'
  content: string
  createdAt: Date
  quickReplies?: string[]
  estructura?: EstructuraAgente
}

interface CampoTarjeta {
  etiqueta: string
  valor: string
}

interface TarjetaEntidad {
  tipo: string
  titulo: string
  subtitulo?: string
  estado?: string
  campos: CampoTarjeta[]
}

interface AccionAgente {
  tool: string
  etiqueta: string
  estado: 'ok' | 'error' | 'denegado'
  entidad?: string
  id?: string
  detalle?: string
  error?: string
  idempotente?: boolean
  tarjeta?: TarjetaEntidad
}

interface ColumnaDatos {
  clave: string
  titulo: string
}

interface DatosAgente {
  tipo: string
  titulo: string
  columnas: ColumnaDatos[]
  filas: Array<Record<string, any>>
  total: number
}

interface EstructuraAgente {
  resumen: string
  acciones: AccionAgente[]
  datos: DatosAgente[]
}

interface Conversation {
  id: string
  titulo: string
  preview: string
  actualizado: string
}

interface Perfil {
  nombre: string
  email: string
  avatar: string | null
  rol: string | null
  tenant: string
  plan: string
  logo: string | null
}

const SUGERENCIAS = [
  { icon: Building2, texto: 'Casas en venta en Madrid con 3 habitaciones' },
  { icon: CheckSquare, texto: '¿Qué tareas tengo vencidas?' },
  { icon: Users, texto: 'Muéstrame los leads' },
  { icon: CalendarDays, texto: '¿Qué citas tengo hoy?' },
]

const GEMMA_AVATAR = '/Gemma-perfil.jpg?v=2'

/** Celda de tabla: números, fechas o texto, sin inyectar HTML. */
function formatearCelda(valor: any): string {
  if (valor === undefined || valor === null || valor === '') return '—'
  if (typeof valor === 'number') return new Intl.NumberFormat('es-ES').format(valor)
  const texto = String(valor)
  const fecha = new Date(texto)
  if (/^\d{4}-\d{2}-\d{2}/.test(texto) && !Number.isNaN(fecha.getTime())) {
    return texto.length > 10
      ? fecha.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  }
  return texto
}

function IconoEstado({ estado }: { estado: AccionAgente['estado'] }) {
  if (estado === 'error') return <span className="text-destructive">✕</span>
  if (estado === 'denegado') return <span className="text-amber-500">🔒</span>
  return <span className="text-emerald-500">✓</span>
}

function TarjetaEntidad({ tarjeta }: { tarjeta: TarjetaEntidad }) {
  return (
    <div className="mt-2 rounded-lg border border-border bg-card p-2.5">
      <p className="text-sm font-semibold">{tarjeta.titulo}</p>
      {tarjeta.subtitulo && <p className="text-xs text-muted-foreground">{tarjeta.subtitulo}</p>}
      {tarjeta.campos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {tarjeta.campos.map((c, i) => (
            <span key={i} className="text-xs">
              <span className="text-muted-foreground">{c.etiqueta}: </span>
              {c.valor}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function IndicadorAccion({ accion }: { accion: AccionAgente }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5"><IconoEstado estado={accion.estado} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">
            {accion.etiqueta}
            {accion.idempotente && (
              <span className="ml-1.5 font-normal text-muted-foreground">(ya estaba guardada)</span>
            )}
          </p>
          {accion.detalle && <p className="text-xs text-muted-foreground">{accion.detalle}</p>}
        </div>
      </div>
      {accion.tarjeta && <TarjetaEntidad tarjeta={accion.tarjeta} />}
    </div>
  )
}

function TablaDatos({ datos }: { datos: DatosAgente }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background/60">
      <p className="border-b border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        {datos.titulo} · {datos.total}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {datos.columnas.map((c) => (
                <th key={c.clave} className="px-3 py-1.5 text-left font-semibold text-muted-foreground">
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((f, i) => (
              <tr key={f.id ?? i} className={i % 2 ? 'bg-background/40' : ''}>
                {datos.columnas.map((c) => (
                  <td key={c.clave} className="px-3 py-1.5">
                    {formatearCelda(f[c.clave])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Salida estructurada del agente (P6): resumen + indicadores + tablas. */
function EstructuraAgente({ estructura }: { estructura: EstructuraAgente }) {
  return (
    <div className="flex flex-col gap-2">
      {estructura.resumen && <p className="text-sm leading-relaxed">{estructura.resumen}</p>}
      {estructura.acciones.map((a, i) => (
        <IndicadorAccion key={`${a.tool}-${i}`} accion={a} />
      ))}
      {estructura.datos.map((d, i) => (
        <TablaDatos key={`${d.tipo}-${i}`} datos={d} />
      ))}
    </div>
  )
}

/** Renderizado ligero: saltos de línea y **negritas**, sin inyectar HTML. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((linea, i) => (
        <span key={i} className="block min-h-[0.35rem]">
          {linea.split(/(\*\*[^*]+\*\*)/g).map((parte, j) =>
            parte.startsWith('**') && parte.endsWith('**') ? (
              <strong key={j} className="font-semibold">
                {parte.slice(2, -2)}
              </strong>
            ) : (
              <span key={j}>{parte}</span>
            )
          )}
        </span>
      ))}
    </>
  )
}

function iniciales(nombre?: string | null): string {
  return (
    (nombre || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'U'
  )
}

function etiquetaFecha(valor: string | Date): string {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (mismoDia(fecha, hoy)) {
    return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }
  if (mismoDia(fecha, ayer)) return 'Ayer'
  return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function tituloDesde(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (!limpio) return 'Nueva conversación'
  return limpio.length > 60 ? `${limpio.slice(0, 57)}…` : limpio
}

function Sidebar({
  conversations,
  activeId,
  perfil,
  onNew,
  onSelect,
  onAvatar,
  uploadingAvatar,
  avatarError,
  avatarOk,
}: {
  conversations: Conversation[]
  activeId: string | null
  perfil: Perfil | null
  onNew: () => void
  onSelect: (id: string) => void
  onAvatar: (file: File) => void
  uploadingAvatar: boolean
  avatarError: string | null
  avatarOk: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const foto = perfil?.avatar || perfil?.logo || undefined

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Avatar className="h-9 w-9 border border-border bg-card">
          <AvatarImage src={GEMMA_AVATAR} alt="Gemma" />
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">G</AvatarFallback>
        </Avatar>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold">Gemma</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {perfil?.tenant || 'Volkern CRM'}
          </p>
        </div>
      </div>

      <div className="px-3">
        <Button
          type="button"
          size="sm"
          onClick={onNew}
          className="w-full justify-start gap-2 rounded-xl"
        >
          <Plus className="h-4 w-4" />
          Nuevo chat
        </Button>
      </div>

      <div className="mt-5 flex-1 overflow-y-auto px-2 pb-3">
        <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Historial
        </p>
        {conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Aún no hay conversaciones. Empieza con “Nuevo chat”.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                title={c.titulo}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent',
                  activeId === c.id && 'bg-primary/10'
                )}
              >
                <MessageSquare
                  className={cn(
                    'mt-0.5 h-3.5 w-3.5 shrink-0',
                    activeId === c.id ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-xs',
                      activeId === c.id ? 'font-semibold text-primary' : 'font-medium'
                    )}
                  >
                    {c.titulo}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {etiquetaFecha(c.actualizado)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="rounded-xl border border-border bg-background p-2.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              title={perfil?.avatar ? 'Cambiar foto de perfil' : 'Añadir foto de perfil'}
              className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="h-9 w-9 border border-border">
                {foto ? <AvatarImage src={foto} alt={perfil?.nombre || 'Perfil'} /> : null}
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {iniciales(perfil?.nombre)}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-primary p-0.5 text-primary-foreground shadow">
                {uploadingAvatar ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <Camera className="h-2.5 w-2.5" />
                )}
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{perfil?.nombre || 'Usuario'}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {perfil?.tenant || 'Volkern'}
                {perfil?.plan ? ` · ${perfil.plan}` : ''}
              </p>
            </div>
          </div>

          {!perfil?.avatar && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 block text-left text-[10px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Sin foto de perfil · toca el avatar para añadirla
            </button>
          )}
          {avatarError && <p className="mt-1.5 text-[10px] text-destructive">{avatarError}</p>}
          {avatarOk && <p className="mt-1.5 text-[10px] text-emerald-600">Foto actualizada</p>}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onAvatar(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarOk, setAvatarOk] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cargarConversacion = useCallback(async (id: string) => {
    setActiveId(id)
    setCargandoHistorial(true)
    try {
      const res = await fetch(`/api/chat?conversationId=${encodeURIComponent(id)}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('No se pudo cargar la conversación')
      const data = await res.json()
      setMessages(
        (data.messages || []).map((m: Message) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: new Date(m.createdAt),
          estructura: m.estructura ?? undefined,
        }))
      )
      if (data.conversationId) setActiveId(data.conversationId)
    } catch {
      setMessages([])
    } finally {
      setCargandoHistorial(false)
    }
  }, [])

  // Historial + perfil al montar.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/chat/conversations', { credentials: 'include' })
        if (!res.ok) throw new Error('No autorizado')
        const data = await res.json()
        if (cancelled) return
        const convs: Conversation[] = Array.isArray(data.conversations) ? data.conversations : []
        setConversations(convs)
        setPerfil(data.perfil || null)
        if (convs.length > 0) await cargarConversacion(convs[0].id)
      } catch {
        /* sin historial: se arranca en limpio */
      } finally {
        if (!cancelled) setInitialized(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cargarConversacion])

  // Auto-scroll.
  useEffect(() => {
    if (initialized) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, initialized, loading])

  // El input está deshabilitado mientras `loading`; el foco vuelve al terminar.
  useEffect(() => {
    if (initialized && !loading) inputRef.current?.focus()
  }, [initialized, loading, activeId])

  const enviar = useCallback(
    async (texto: string) => {
      const limpio = texto.trim()
      if (!limpio || loading) return

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: limpio, createdAt: new Date() },
      ])
      setInput('')
      setLoading(true)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message: limpio, conversationId: activeId }),
        })
        if (!res.ok) throw new Error('Error al enviar mensaje')
        const data = await res.json()
        const convId: string | null = data.conversationId || activeId
        if (convId && convId !== activeId) setActiveId(convId)

        if (convId) {
          setConversations((prev) => {
            const ahora = new Date().toISOString()
            const existente = prev.find((c) => c.id === convId)
            const preview = (data.agentMessage?.content || limpio).replace(/\s+/g, ' ').slice(0, 90)
            const actualizada: Conversation = existente
              ? {
                  ...existente,
                  titulo:
                    existente.titulo === 'Nueva conversación' || !existente.titulo
                      ? tituloDesde(limpio)
                      : existente.titulo,
                  preview,
                  actualizado: ahora,
                }
              : { id: convId, titulo: tituloDesde(limpio), preview, actualizado: ahora }
            return [actualizada, ...prev.filter((c) => c.id !== convId)]
          })
        }

        setMessages((prev) => [
          ...prev,
          {
            id: data.agentMessage.id,
            role: 'agent',
            content: data.agentMessage.content,
            createdAt: new Date(data.agentMessage.createdAt),
            quickReplies: Array.isArray(data.metadata?.quickReplies)
              ? data.metadata.quickReplies
              : undefined,
            estructura: data.agentMessage.estructura ?? undefined,
          },
        ])
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'agent',
            content: 'No pude procesar tu mensaje. Intenta de nuevo en unos segundos.',
            createdAt: new Date(),
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [activeId, loading]
  )

  const nuevoChat = useCallback(async () => {
    setSidebarOpen(false)
    setInput('')
    setMessages([])
    try {
      const res = await fetch('/api/chat/conversations', { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error('No se pudo crear la conversación')
      const data = await res.json()
      setActiveId(data.id)
    } catch {
      setActiveId(null)
    } finally {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [])

  const seleccionar = useCallback(
    (id: string) => {
      setSidebarOpen(false)
      if (id === activeId) return
      void cargarConversacion(id)
    },
    [activeId, cargarConversacion]
  )

  const subirAvatar = useCallback(async (file: File) => {
    setAvatarError(null)
    setAvatarOk(false)
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/users/avatar', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No se pudo subir la imagen')
      const url = data.url || data.publicUrl || data.downloadUrl
      if (url) setPerfil((prev) => (prev ? { ...prev, avatar: url } : prev))
      setAvatarOk(true)
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : 'Error al subir la imagen')
    } finally {
      setUploadingAvatar(false)
    }
  }, [])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void enviar(input)
  }

  if (!initialized) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <aside className="hidden h-full w-64 shrink-0 border-r border-border bg-card/50 lg:block">
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          perfil={perfil}
          onNew={() => void nuevoChat()}
          onSelect={seleccionar}
          onAvatar={(f) => void subirAvatar(f)}
          uploadingAvatar={uploadingAvatar}
          avatarError={avatarError}
          avatarOk={avatarOk}
        />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-border bg-card shadow-xl">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute right-2 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-accent"
              aria-label="Cerrar historial"
            >
              <X className="h-4 w-4" />
            </button>
            <Sidebar
              conversations={conversations}
              activeId={activeId}
              perfil={perfil}
              onNew={() => void nuevoChat()}
              onSelect={seleccionar}
              onAvatar={(f) => void subirAvatar(f)}
              uploadingAvatar={uploadingAvatar}
              avatarError={avatarError}
              avatarOk={avatarOk}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir historial"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <Avatar className="hidden h-10 w-10 border border-border bg-card sm:block">
              <AvatarImage src={GEMMA_AVATAR} alt="Gemma" />
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">G</AvatarFallback>
            </Avatar>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-sm font-semibold">Gemma</h1>
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                Asistente inteligente · Volkern CRM
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="hidden items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
              <Sparkles className="h-3 w-3 text-primary" />
              Proactiva
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden"
              onClick={() => void nuevoChat()}
              aria-label="Nuevo chat"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
            {cargandoHistorial ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {messages.length === 0 && (
                  <div className="flex flex-col gap-6 pt-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9 border border-border bg-card">
                        <AvatarImage src={GEMMA_AVATAR} alt="Gemma" />
                        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                          G
                        </AvatarFallback>
                      </Avatar>
                      <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm shadow-sm">
                        <p className="font-medium">Hola{perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''} 👋</p>
                        <p className="mt-1 text-muted-foreground">
                          Puedo buscar propiedades, revisar tareas y citas, mover el CRM y consultar tus
                          módulos. Dime qué necesitas con tus palabras.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {SUGERENCIAS.map(({ icon: Icon, texto }) => (
                        <button
                          key={texto}
                          type="button"
                          onClick={() => void enviar(texto)}
                          className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-primary" />
                          <span>{texto}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex max-w-[92%] items-start gap-2.5 sm:max-w-[85%]',
                      msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                    )}
                  >
                    {msg.role === 'user' ? (
                      <Avatar className="h-8 w-8 shrink-0 bg-primary">
                        <AvatarFallback className="text-xs font-semibold text-primary-foreground">
                          {iniciales(perfil?.nombre)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <Avatar className="h-8 w-8 shrink-0 border border-border bg-card">
                        <AvatarImage src={GEMMA_AVATAR} alt="Gemma" />
                        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                          G
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
                          msg.role === 'user'
                            ? 'rounded-tr-sm bg-primary text-primary-foreground'
                            : 'rounded-tl-sm border border-border bg-card'
                        )}
                      >
                        {msg.role === 'agent' && msg.estructura ? (
                          <EstructuraAgente estructura={msg.estructura} />
                        ) : (
                          <RichText text={msg.content} />
                        )}
                      </div>

                      <span
                        className={cn(
                          'text-[10px] text-muted-foreground',
                          msg.role === 'user' ? 'text-right' : 'text-left'
                        )}
                      >
                        {msg.createdAt.toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      {msg.role === 'agent' && msg.quickReplies && msg.quickReplies.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {msg.quickReplies.map((qr) => (
                            <button
                              key={qr}
                              type="button"
                              onClick={() => void enviar(qr)}
                              className="rounded-full border border-border bg-background px-3 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                            >
                              {qr}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="mr-auto flex items-start gap-2.5">
                    <Avatar className="h-8 w-8 shrink-0 border border-border bg-card">
                      <AvatarImage src={GEMMA_AVATAR} alt="Gemma" />
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        G
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Gemma está escribiendo…
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </main>

        <form onSubmit={onSubmit} className="border-t border-border bg-card px-4 py-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu consulta… (ej: 'casas en venta en Madrid con 3 habitaciones')"
              disabled={loading}
              autoComplete="off"
              className="h-11 flex-1 rounded-full border-border bg-background px-4"
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !input.trim()}
              className="h-11 w-11 shrink-0 rounded-full"
              aria-label="Enviar mensaje"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mx-auto mt-1.5 hidden max-w-3xl text-[11px] text-muted-foreground sm:block">
            Enter para enviar · Gemma entiende lenguaje natural
          </p>
        </form>
      </div>
    </div>
  )
}
