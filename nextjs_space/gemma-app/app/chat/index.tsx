import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, TouchableOpacity, AppState,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import ChatBubble from '../../src/components/ChatBubble'
import ChatInput from '../../src/components/ChatInput'
import TypingIndicator from '../../src/components/TypingIndicator'
import QuickReplies from '../../src/components/QuickReplies'
import { useVoiceNotification } from '../../src/hooks/useVoiceNotification'
import { sendMessage, getSession, clearSession } from '../../src/services/api-client'
import type { ChatMessage, ChatResponse } from '../../src/types'

const COLORS = {
  primary: '#2563EB',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
}

export default function ChatScreen() {
  const router = useRouter()
  const flatListRef = useRef<FlatList>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'gemma',
      text: '¡Hola! Soy Gemma, tu asistente de Volkern. ¿En qué puedo ayudarte hoy? Puedes pedirme crear contactos, agendar citas, consultar información y más.',
      timestamp: new Date(),
    },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [chatId, setChatId] = useState<string | undefined>()
  const [userName, setUserName] = useState('')
  const [voiceInterim, setVoiceInterim] = useState('')
  const [isVoiceListening, setIsVoiceListening] = useState(false)

  // Notificaciones de voz: se activan cuando el input reporta voz detectada
  useVoiceNotification(voiceInterim, isVoiceListening)

  useEffect(() => {
    loadSession()
  }, [])

  const loadSession = async () => {
    const session = await getSession()
    if (!session) {
      router.replace('/')
      return
    }
    setUserName(session.name)
  }

  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true })
    }, 100)
  }

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
    scrollToBottom()
  }, [])

  const handleSend = useCallback(async (text: string) => {
    // Add user message
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
      status: 'sending',
    }
    addMessage(userMsg)
    setIsLoading(true)

    try {
      const response: ChatResponse = await sendMessage(text, chatId)
      if (response.chatId) setChatId(response.chatId)

      // Add Gemma response
      const gemmaMsg: ChatMessage = {
        id: `gemma_${Date.now()}`,
        role: 'gemma',
        text: response.reply,
        richData: response.richData,
        quickReplies: response.quickReplies,
        timestamp: new Date(),
      }
      addMessage(gemmaMsg)
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'system',
        text: err.message || 'Error de conexión. Intenta de nuevo.',
        timestamp: new Date(),
      }
      addMessage(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }, [chatId, addMessage])

  const handleQuickReply = (text: string) => {
    handleSend(text)
  }

  const handleLogout = async () => {
    await clearSession()
    router.replace('/')
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.gemmaAvatar}>
            <Ionicons name="sparkles" size={18} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Gemma</Text>
            <Text style={styles.headerSub}>En línea</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        />

        {/* Typing indicator */}
        {isLoading && <TypingIndicator />}

          {/* Quick Replies — arriba del input, abajo de los mensajes */}
        {messages.length > 0 && messages[messages.length - 1]?.quickReplies && (
          <QuickReplies
            replies={messages[messages.length - 1].quickReplies!}
            onSelect={handleQuickReply}
            disabled={isLoading}
          />
        )}

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          onVoiceStatus={(interim, listening) => {
            setVoiceInterim(interim)
            setIsVoiceListening(listening)
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gemmaAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatArea: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 8,
    paddingBottom: 16,
  },
})
