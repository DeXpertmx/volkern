'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MessagingLayout } from '@/components/messaging/MessagingLayout'
import { SidebarFilters } from '@/components/messaging/SidebarFilters'
import { ConversationList } from '@/components/messaging/ConversationList'
import { ChatWindow } from '@/components/messaging/ChatWindow'
import { ContactDetailsSidebar } from '@/components/messaging/ContactDetailsSidebar'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

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

  const fetchConversaciones = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/mensajes/conversaciones')
      const data = await response.json()
      if (response.ok) {
        setConversaciones(data.conversaciones || [])
        
        // If there's an ID in the URL, select it
        if (currentId) {
          const found = data.conversaciones.find((c: any) => c.id === currentId)
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
  }, [])

  useEffect(() => {
    if (currentId) {
      fetchMessages(currentId)
    }
  }, [currentId])

  const handleSelectConversation = (id: string) => {
    router.push(`/dashboard/mensajes?id=${id}`, { scroll: false })
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
