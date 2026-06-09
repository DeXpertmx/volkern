import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, KeyboardAvoidingView,
  Platform, TouchableOpacity, Image, Dimensions
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import ChatBubble from '../../src/components/ChatBubble'
import ChatInput from '../../src/components/ChatInput'
import TypingIndicator from '../../src/components/TypingIndicator'
import QuickReplies from '../../src/components/QuickReplies'
import { useVoiceNotification } from '../../src/hooks/useVoiceNotification'
import { sendMessage, getSession, clearSession } from '../../src/services/api-client'
import { useVoiceLanguage } from '../../src/hooks/useVoiceLanguage'
import type { ChatMessage, ChatResponse, Attachment } from '../../src/types'
import SafeBlurView from '../../src/components/SafeBlurView'

const { width } = Dimensions.get('window')

const COLORS = {
  primary: '#c0c1ff',        // Deep Space Indigo
  secondary: '#ddb7ff',      // Vibrant Violet
  tertiary: '#3cddc7',       // Soft Mint
  background: '#0b1326',     // Deep space base background
  surface: '#131b2e',
  surfaceContainerLow: '#0e1524',
  textPrimary: '#dae2fd',
  textSecondary: '#c7c4d7',
  textTertiary: '#908fa0',
  border: 'rgba(255, 255, 255, 0.08)',
}

export default function ChatScreen() {
  const router = useRouter()
  const flatListRef = useRef<FlatList>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'gemma',
      text: '¡Hola! Soy Gemma, tu asistente inteligente de Volkern. Estoy conectada a los skills de tu sistema ERP. ¿En qué te puedo asistir hoy?',
      timestamp: new Date(),
    },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [chatId, setChatId] = useState<string | undefined>()
  const [userName, setUserName] = useState('')
  const [voiceInterim, setVoiceInterim] = useState('')
  const [isVoiceListening, setIsVoiceListening] = useState(false)
  const [continuousDictation, setContinuousDictation] = useState(false)
  const { language: voiceLanguage } = useVoiceLanguage()

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

  const handleSend = useCallback(async (text: string, attachments?: Attachment[]) => {
    // Add user message to state
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
      status: 'sending',
      attachments: attachments && attachments.length > 0 ? attachments : undefined
    }
    addMessage(userMsg)
    setIsLoading(true)

    try {
      // Send text and files payload to API
      const response: ChatResponse = await sendMessage(text, chatId, attachments)
      if (response.chatId) setChatId(response.chatId)

      // Add Gemma response to state
      const gemmaMsg: ChatMessage = {
        id: `gemma_${Date.now()}`,
        role: 'gemma',
        text: response.reply,
        richData: response.richData,
        quickReplies: response.quickReplies,
        timestamp: new Date(),
      }

      // Update the user message status to 'sent'
      setMessages(prev =>
        prev.map(m => m.id === userMsg.id ? { ...m, status: 'sent' } : m)
      )

      addMessage(gemmaMsg)
    } catch (err: any) {
      // Update the user message status to 'error'
      setMessages(prev =>
        prev.map(m => m.id === userMsg.id ? { ...m, status: 'error' } : m)
      )

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

  const blurIntensity = Platform.OS === 'ios' ? 15 : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Mesh */}
      <View style={styles.glowContainer} pointerEvents="none">
        <View style={styles.topGlow} />
        <View style={styles.bottomGlow} />
      </View>

      {/* Glassmorphic Header */}
      <SafeBlurView intensity={blurIntensity} tint="dark" style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.gemmaAvatarContainer}>
            <Image
              style={styles.gemmaAvatar}
              source={{ uri: 'https://lh3.googleusercontent.com/aida/AP1WRLs4y7EvGZtud-Jp_pwtOJO8YSxJC17pNWmmJd_cAYs3MASBg1BUlihjZCGErkwpYM2d0f28tu4Et8K5AEmWimKlv15QIXzUvKii6OLnZLt8UaogOMxZJGIOSmzHdztwVXuEG-KY3ao3uvpPEsBgApDFG9pE1lX-J8jdPi3xZde-NiFXNyVwACkziSqOQ8LGUxBcRurLWljK_u8q-T1FjPD05M5LgaDxgh2geBu19bvp0JaQc9mBTrKipu5O' }}
            />
            <View style={styles.statusBadge} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Gemma AI</Text>
            <Text style={styles.headerSub}>En línea · Inteligencia de Volkern</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.secondary} />
          </TouchableOpacity>
        </View>
      </SafeBlurView>

      {/* Messages & Input Area */}
      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
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

        {/* Quick Replies */}
        {messages.length > 0 && messages[messages.length - 1]?.quickReplies && (
          <QuickReplies
            replies={messages[messages.length - 1].quickReplies!}
            onSelect={handleQuickReply}
            disabled={isLoading}
          />
        )}

        {/* Input Bar */}
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          continuousDictation={continuousDictation}
          onDictationToggle={() => setContinuousDictation(prev => !prev)}
          onVoiceStatus={(interim, listening) => {
            setVoiceInterim(interim)
            setIsVoiceListening(listening)
          }}
          voiceLang={voiceLanguage}
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
  glowContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 0,
  },
  topGlow: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.primary,
    opacity: 0.06,
  },
  bottomGlow: {
    position: 'absolute',
    bottom: -100,
    left: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.secondary,
    opacity: 0.05,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: 'rgba(23, 31, 51, 0.8)',
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gemmaAvatarContainer: {
    position: 'relative',
    width: 38,
    height: 38,
  },
  gemmaAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(192, 193, 255, 0.3)',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.tertiary,
    borderWidth: 1.5,
    borderColor: COLORS.background,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chatArea: {
    flex: 1,
    zIndex: 1,
  },
  messagesList: {
    paddingVertical: 12,
    paddingBottom: 24,
  },
})
