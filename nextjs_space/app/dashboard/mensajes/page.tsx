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
    <div className="h-full">
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
  )
}
