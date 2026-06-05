import React, { useState } from 'react'
import { View, TextInput, TouchableOpacity, StyleSheet, Keyboard, Platform, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSpeechToText } from '../hooks/useSpeechToText'

const COLORS = {
  primary: '#2563EB',
  border: '#E2E8F0',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  danger: '#EF4444',
  success: '#10B981',
}

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

export default function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [text, setText] = useState('')

  const {
    state: voiceState,
    isSupported: voiceSupported,
    interimText,
    toggleListening,
    stopListening,
  } = useSpeechToText({
    lang: 'es-ES',
    onResult: (finalText) => {
      setText(prev => {
        const trimmed = prev.trim()
        return trimmed ? `${trimmed} ${finalText}` : finalText
      })
    },
    onError: (error) => {
      console.warn('[Voice] Error:', error)
    },
  })

  const isListening = voiceState === 'listening'

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    Keyboard.dismiss()
  }

  const handleVoicePress = () => {
    if (isListening) {
      // Stop listening and commit the interim text
      if (interimText) {
        setText(prev => {
          const trimmed = prev.trim()
          return trimmed ? `${trimmed} ${interimText}` : interimText
        })
      }
      stopListening()
    } else {
      toggleListening()
    }
  }

  return (
    <View style={styles.container}>
      {/* Voice button */}
      <TouchableOpacity
        style={[
          styles.voiceBtn,
          isListening && styles.voiceBtnActive,
        ]}
        onPress={handleVoicePress}
        disabled={disabled || !voiceSupported}
      >
        <Ionicons
          name={isListening ? 'mic' : 'mic-outline'}
          size={22}
          color={isListening ? '#fff' : COLORS.textTertiary}
        />
      </TouchableOpacity>

      {/* Voice indicator on web */}
      {isListening && Platform.OS === 'web' && (
        <View style={styles.voiceIndicator}>
          <Text style={styles.voiceIndicatorDot}>●</Text>
          <Text style={styles.voiceIndicatorText}>
            {interimText || 'Escuchando...'}
          </Text>
        </View>
      )}

      {/* Text input */}
      <TextInput
        style={[styles.input, isListening && styles.inputActive]}
        value={text}
        onChangeText={setText}
        placeholder={isListening ? 'Habla ahora...' : (placeholder || 'Escribe un mensaje...')}
        placeholderTextColor={COLORS.textTertiary}
        multiline
        maxLength={2000}
        onSubmitEditing={handleSend}
        blurOnSubmit
      />

      {/* Send button */}
      <TouchableOpacity
        style={[styles.sendBtn, (!text.trim() || disabled) && styles.sendBtnDisabled]}
        onPress={handleSend}
        disabled={!text.trim() || disabled}
      >
        <Ionicons
          name="send"
          size={18}
          color={!text.trim() || disabled ? COLORS.textTertiary : '#fff'}
        />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
    position: 'relative',
  },
  voiceBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  voiceBtnActive: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  voiceIndicator: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    right: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
  },
  voiceIndicatorDot: {
    color: COLORS.danger,
    fontSize: 10,
  },
  voiceIndicatorText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputActive: {
    borderColor: COLORS.danger,
    borderWidth: 1.5,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.background,
  },
})
