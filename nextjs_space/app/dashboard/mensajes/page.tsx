'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MessagingLayout } from '@/components/messaging/MessagingLayout'
import { SidebarFilters } from '@/components/messaging/SidebarFilters'
import { ConversationList } from '@/components/messaging/ConversationList'
import { ChatWindow } from '@/components/messaging/ChatWindow'
import { ContactDetailsSidebar } from '@/components/messaging/ContactDetailsSidebar'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { notifyIncomingMessage } from '@/hooks/use-incoming-messages'

import { ArrowLeft, ChevronLeft, MessageSquare, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function MensajesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentId = searchParams.get('id')
  
  const [conversaciones, setConversaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [selectedConversation, setSelectedConversation] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('todas')
  const [counts, setCounts] = useState<{ mias: number; sin_asignar: number; todas: number }>({ mias: 0, sin_asignar: 0, todas: 0 })
  // Referencia del último snapshot de conversaciones para detectar novedades
  const knownRef = useRef<Map<string, { noLeidos: number; ultimoMensaje: string }>>(new Map())
  const tabRef = useRef(activeTab)
  tabRef.current = activeTab

  const fetchConversaciones = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const response = await fetch(`/api/mensajes/conversaciones?tab=${tabRef.current}`)
      const data = await response.json()
      if (response.ok) {
        const lista = data.conversaciones || []
        setConversaciones(lista)
        if (data.counts) setCounts(data.counts)
        
        // Detectar novedades (solo en el polling, no en la carga inicial)
        if (silent && knownRef.current.size > 0) {
          const nuevos: any[] = []
          for (const conv of lista) {
            const prev = knownRef.current.get(conv.id)
            const noLeidos = conv.noLeidos || 0
            if (!prev) {
              if (noLeidos > 0) nuevos.push(conv)
              knownRef.current.set(conv.id, { noLeidos, ultimoMensaje: conv.ultimoMensaje || '' })
            } else if (noLeidos > prev.noLeidos) {
              nuevos.push(conv)
              knownRef.current.set(conv.id, { noLeidos, ultimoMensaje: conv.ultimoMensaje || '' })
            } else {
              knownRef.current.set(conv.id, { noLeidos, ultimoMensaje: conv.ultimoMensaje || '' })
            }
          }
          for (const conv of nuevos) {
            notifyIncomingMessage(
              '💬 Nuevo mensaje',
              `${conv.contactoNombre || 'Contacto'}: ${conv.ultimoMensaje || ''}`,
              `/dashboard/mensajes?id=${conv.id}`
            )
          }
          // Si la conversación seleccionada recibió un mensaje nuevo, refrescarla
          const seleccionadaActualizada = nuevos.find((c: any) => c.id === currentId)
          if (seleccionadaActualizada && currentId) {
            fetchMessages(currentId)
          }
        } else if (silent) {
          // Primera pasada del polling: poblar el estado sin notificar
          for (const conv of lista) {
            knownRef.current.set(conv.id, { noLeidos: conv.noLeidos || 0, ultimoMensaje: conv.ultimoMensaje || '' })
          }
        }
        
        // If there's an ID in the URL, select it
        if (currentId) {
          const found = lista.find((c: any) => c.id === currentId)
          if (found) setSelectedConversation(found)
        }
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar conversaciones')
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (id: string) => {
    try {
      setLoadingMessages(true)
      const response = await fetch(`/api/mensajes/conversaciones/${id}`)
      const data = await response.json()
      if (response.ok) {
        setMessages(data.mensajes || [])
        setSelectedConversation(data)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar mensajes')
    } finally {
      setLoadingMessages(false)
    }
  }

  useEffect(() => {
    fetchConversaciones()
    const interval = setInterval(() => fetchConversaciones(true), 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (currentId) {
      fetchMessages(currentId)
    }
  }, [currentId])

  const handleSelectConversation = (id: string) => {
    router.push(`/dashboard/mensajes?id=${id}`, { scroll: false })
  }

  const handleTabChange = (tab: string) => {
    if (tab === activeTab) return
    tabRef.current = tab
    setActiveTab(tab)
    setLoading(true)
    fetchConversaciones()
  }

  const handleSendMessage = async (text: string, isNote: boolean) => {
    if (!selectedConversation) return

    try {
      // Optimistic update
      const tempMsg = {
        id: Date.now().toString(),
        contenido: text,
        direccion: 'saliente',
        fechaCreacion: new Date().toISOString(),
        tipo: isNote ? 'note' : 'message',
        metadatos: { is_internal: isNote }
      }
      setMessages(prev => [...prev, tempMsg])

      const response = await fetch('/api/mensajes/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          contenido: text,
          canal: selectedConversation.canal,
          metadatos: { is_internal: isNote }
        }),
      })

      if (!response.ok) {
        toast.error('Error al enviar mensaje')
        // Rollback optimistic update if needed or refetch
        fetchMessages(selectedConversation.id)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al enviar mensaje')
    }
  }

  const handleResolve = async () => {
    if (!selectedConversation) return
    try {
      const response = await fetch(`/api/mensajes/conversaciones/${selectedConversation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'cerrada' }),
      })
      if (response.ok) {
        toast.success('Conversación cerrada')
        fetchConversaciones()
        setSelectedConversation(null)
        router.push('/dashboard/mensajes')
      }
    } catch (error) {
      toast.error('Error al cerrar conversación')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header Premium para modo Full Screen */}
      <header className="h-14 border-b bg-slate-900 text-white flex items-center justify-between px-4 shrink-0 shadow-lg z-50">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-slate-400 hover:text-white hover:bg-slate-800 gap-2 font-bold text-xs uppercase tracking-widest"
            onClick={() => router.push('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Volver al CRM</span>
          </Button>
          <div className="h-6 w-[1px] bg-slate-800 mx-2" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
              <MessageSquare className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-tighter">Hub de Comunicaciones</h1>
              <p className="text-[9px] text-slate-500 font-bold tracking-widest leading-none">OMNICHANNEL MANAGER</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-4 mr-4">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Estado del Sistema</span>
              <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-1 mt-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                CONECTADO
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 h-8 text-xs font-bold gap-2">
            <ExternalLink className="h-3 w-3" />
            Ayuda
          </Button>
        </div>
      </header>

      {/* Contenido Principal */}
      <div className="flex-1 min-h-0 relative">
        <MessagingLayout>
          <SidebarFilters 
            activeFilter={activeFilter} 
            onFilterChange={setActiveFilter} 
          />
          
          <ConversationList 
            conversations={conversaciones}
            selectedId={currentId}
            onSelect={handleSelectConversation}
            loading={loading}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            counts={counts}
          />

          <ChatWindow 
            conversation={selectedConversation}
            messages={messages}
            onSendMessage={handleSendMessage}
            onResolve={handleResolve}
            loading={loadingMessages}
          />

          {selectedConversation && (
            <ContactDetailsSidebar 
              contact={selectedConversation}
              loading={loadingMessages}
            />
          )}
        </MessagingLayout>
      </div>
    </div>
  )
}
