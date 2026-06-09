import React, { useState, useEffect, useRef } from 'react'
import {
  View, TextInput, TouchableOpacity, StyleSheet, Keyboard,
  Platform, Text, Vibration, Image, ScrollView
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { useAudioLevel } from '../hooks/useAudioLevel'
import VoiceWaveform from './VoiceWaveform'
import Toast from './Toast'
import type { Attachment } from '../types'

const COLORS = {
  primary: '#c0c1ff',        // Deep Space Indigo
  secondary: '#ddb7ff',      // Vibrant Violet
  tertiary: '#3cddc7',       // Soft Mint
  background: '#0b1326',     // Deep space base background
  surface: '#131b2e',        // Dark Surface
  surfaceContainerLow: '#0e1524',
  textPrimary: '#dae2fd',
  textSecondary: '#c7c4d7',
  textTertiary: '#908fa0',
  border: 'rgba(255, 255, 255, 0.08)',
  danger: '#ffb4ab',
  success: '#3cddc7',
}

interface ChatInputProps {
  onSend: (text: string, attachments?: Attachment[]) => void
  disabled?: boolean
  placeholder?: string
  onVoiceStatus?: (interim: string, isListening: boolean) => void
  continuousDictation?: boolean
  onDictationToggle?: () => void
  voiceLang?: string
}

export default function ChatInput({
  onSend, disabled, placeholder, onVoiceStatus,
  continuousDictation, onDictationToggle, voiceLang
}: ChatInputProps) {
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showOptions, setShowOptions] = useState(false)
  const [toastMsg, setToastMsg] = useState<string>('')
  const [toastVisible, setToastVisible] = useState(false)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastVisible(true)
  }

  const {
    state: voiceState,
    isSupported: voiceSupported,
    interimText,
    toggleListening,
    startListening,
    stopListening,
  } = useSpeechToText({
    lang: voiceLang || 'es-ES',
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
  const audioBands = useAudioLevel(isListening)

  // Reportar estado de voz al padre para notificaciones
  useEffect(() => {
    onVoiceStatus?.(interimText, isListening)
  }, [interimText, isListening])

  // Silencio timer para dictado continuo
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textRef = useRef('')

  // Sincronizar textRef con text
  useEffect(() => {
    textRef.current = text
  }, [text])

  // Auto-enviar por silencio en modo dictado continuo
  useEffect(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    if (!continuousDictation || !isListening || disabled) return

    // Cuando hay texto parcial y el usuario deja de hablar por 1.5s, enviar
    if (interimText.trim().length > 0) {
      silenceTimerRef.current = setTimeout(() => {
        const currentText = textRef.current.trim()
        const pendingInterim = interimText.trim()
        const fullText = currentText
          ? `${currentText} ${pendingInterim}`
          : pendingInterim

        if (fullText.length > 0 || attachments.length > 0) {
          setText('')
          onSend(fullText, attachments)
          setAttachments([])
          // Reiniciar escucha para la siguiente frase
          stopListening()
          setTimeout(() => startListening(), 300)
        }
      }, 1500)
    }

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
    }
  }, [interimText, isListening, continuousDictation, disabled, attachments])

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0]
        const newAttachment: Attachment = {
          name: asset.fileName || `Imagen_${Date.now()}.jpg`,
          uri: asset.uri,
          type: 'image',
          size: asset.fileSize,
        }
        setAttachments(prev => [...prev, newAttachment])
      }
    } catch (err) {
      showToast('Error al seleccionar imagen')
    }
  }

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0]
        const newAttachment: Attachment = {
          name: asset.name,
          uri: asset.uri,
          type: 'pdf',
          size: asset.size,
        }
        setAttachments(prev => [...prev, newAttachment])
      }
    } catch (err) {
      showToast('Error al seleccionar PDF')
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleSend = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) {
      showToast('Escribe un mensaje o añade un archivo')
      return
    }
    if (disabled) return
    onSend(trimmed, attachments)
    setText('')
    setAttachments([])
    Keyboard.dismiss()
  }

  const triggerHaptic = (type: 'start' | 'stop' | 'cancel') => {
    if (Platform.OS === 'web') {
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          if (type === 'start') navigator.vibrate(10)
          else if (type === 'stop') navigator.vibrate(15)
          else navigator.vibrate([10, 30, 10])
        }
      } catch {}
    } else {
      try {
        if (type === 'start') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        } else if (type === 'stop') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        }
      } catch {
        if (type === 'start') Vibration.vibrate(10)
        else if (type === 'stop') Vibration.vibrate(15)
        else Vibration.vibrate([0, 10, 30, 10])
      }
    }
  }

  const handleVoicePress = () => {
    if (!voiceSupported) {
      showToast('El micrófono nativo requiere una compilación APK/iOS y no funciona en Expo Go.')
      triggerHaptic('error')
      return
    }

    if (isListening) {
      triggerHaptic('stop')
      if (interimText) {
        setText(prev => {
          const trimmed = prev.trim()
          return trimmed ? `${trimmed} ${interimText}` : interimText
        })
      }
      stopListening()
    } else {
      triggerHaptic('start')
      toggleListening()
    }
  }

  return (
    <View style={[styles.outerContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Options Panel (floating inline) */}
      {showOptions && (
        <View style={styles.optionsPanel}>
          <TouchableOpacity style={styles.optionItem} onPress={() => { pickImage(); setShowOptions(false); }}>
            <Ionicons name="image-outline" size={18} color={COLORS.primary} />
            <Text style={styles.optionText}>Imagen</Text>
          </TouchableOpacity>
          <View style={styles.optionSeparator} />
          <TouchableOpacity style={styles.optionItem} onPress={() => { pickDocument(); setShowOptions(false); }}>
            <Ionicons name="document-text-outline" size={18} color={COLORS.secondary} />
            <Text style={styles.optionText}>Documento PDF</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Attachment Preview Bar */}
      {attachments.length > 0 && (
        <View style={styles.previewContainer}>
          <ScrollView horizontal contentContainerStyle={styles.attachmentList} showsHorizontalScrollIndicator={false}>
            {attachments.map((att, index) => (
              <View key={index} style={styles.attachmentThumb}>
                {att.type === 'image' ? (
                  <Image source={{ uri: att.uri }} style={styles.thumbImage} />
                ) : (
                  <View style={styles.thumbPdf}>
                    <Ionicons name="document-text" size={24} color={COLORS.secondary} />
                    <Text style={styles.pdfText} numberOfLines={1}>{att.name}</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.removeAttBtn} onPress={() => removeAttachment(index)}>
                  <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main input row */}
      <View style={styles.container}>
        {/* Attachment menu toggle button */}
        <TouchableOpacity
          style={[styles.actionBtn, showOptions && styles.actionBtnActive]}
          onPress={() => setShowOptions(!showOptions)}
          disabled={disabled}
        >
          <Ionicons
            name="add-circle-outline"
            size={24}
            color={showOptions ? COLORS.primary : COLORS.textTertiary}
          />
        </TouchableOpacity>

        {/* Dictation toggle */}
        {voiceSupported && (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              continuousDictation && styles.actionBtnActive,
            ]}
            onPress={onDictationToggle}
            disabled={disabled}
          >
            <Ionicons
              name={continuousDictation ? 'infinite' : 'infinite-outline'}
              size={20}
              color={continuousDictation ? COLORS.tertiary : COLORS.textTertiary}
            />
          </TouchableOpacity>
        )}

        {/* Voice button */}
        <TouchableOpacity
          style={[
            styles.voiceBtn,
            isListening && styles.voiceBtnActive,
          ]}
          onPress={handleVoicePress}
          disabled={disabled}
        >
          <Ionicons
            name={isListening ? 'mic' : 'mic-outline'}
            size={22}
            color={isListening ? '#1000a9' : COLORS.textTertiary}
          />
        </TouchableOpacity>

        {/* Voice waveform + interim text */}
        {isListening && (
          <View style={styles.voiceIndicator}>
            <VoiceWaveform isListening={true} audioBands={audioBands} />
            <Text style={styles.voiceIndicatorText} numberOfLines={1}>
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
          placeholderTextColor="rgba(144, 143, 160, 0.4)"
          multiline
          maxLength={2000}
          onSubmitEditing={handleSend}
          blurOnSubmit
        />

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() && attachments.length === 0 || disabled) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() && attachments.length === 0 || disabled}
        >
          <Ionicons
            name="send"
            size={18}
            color={!text.trim() && attachments.length === 0 || disabled ? COLORS.textTertiary : '#1000a9'}
          />
        </TouchableOpacity>
      </View>

      {/* Toast de validación */}
      <Toast
        message={toastMsg}
        visible={toastVisible}
        type="error"
        onHide={() => setToastVisible(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    position: 'relative',
  },
  optionsPanel: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 6,
    width: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 200,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  optionText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  optionSeparator: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  previewContainer: {
    backgroundColor: COLORS.surfaceContainerLow,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  attachmentList: {
    paddingHorizontal: 12,
    gap: 12,
  },
  attachmentThumb: {
    width: 76,
    height: 76,
    borderRadius: 8,
    overflow: 'visible',
    position: 'relative',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  thumbPdf: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
  },
  pdfText: {
    color: COLORS.textSecondary,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
    width: '100%',
  },
  removeAttBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    zIndex: 10,
    backgroundColor: COLORS.background,
    borderRadius: 9,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    position: 'relative',
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionBtnActive: {
    backgroundColor: 'rgba(192, 193, 255, 0.1)',
  },
  voiceBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  voiceBtnActive: {
    backgroundColor: COLORS.danger,
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 100,
  },
  voiceIndicatorText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
})
