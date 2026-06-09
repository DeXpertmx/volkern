import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ChatMessage, RichData } from '../types'

const COLORS = {
  userBubble: 'rgba(192, 193, 255, 0.15)', // Glass Indigo
  userText: '#dae2fd',
  gemmaBubble: '#131b2e',                  // Dark surface container
  gemmaText: '#dae2fd',
  systemBubble: 'rgba(255, 180, 171, 0.15)',
  systemText: '#ffb4ab',
  border: 'rgba(255, 255, 255, 0.08)',
  success: '#3cddc7',
  warning: '#ddb7ff',
}

// ─── Rich Card Renderers ─────────────────────────────────────────────────

function PhoneCard({ data }: { data: RichData }) {
  return (
    <View style={cardStyles.container}>
      <View style={cardStyles.iconRow}>
        <Ionicons name="call" size={20} color={COLORS.success} />
        <Text style={cardStyles.name}>{data.name || 'Contacto'}</Text>
      </View>
      <Text style={cardStyles.phone}>{data.phone}</Text>
      <View style={cardStyles.actions}>
        <TouchableOpacity style={cardStyles.actionBtn}>
          <Ionicons name="call-outline" size={16} color="#0b1326" />
          <Text style={cardStyles.actionText}>Llamar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cardStyles.actionBtn, { backgroundColor: '#25D366' }]}>
          <Ionicons name="logo-whatsapp" size={16} color="#0b1326" />
          <Text style={cardStyles.actionText}>WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function ListCard({ data }: { data: RichData }) {
  const items: any[] = data.items || []
  return (
    <View style={cardStyles.container}>
      {items.map((item, i) => (
        <View key={i} style={[cardStyles.listItem, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: COLORS.border }]}>
          <Text style={cardStyles.listTitle}>{item.nombre || item.titulo || item.name || `Item ${i + 1}`}</Text>
          {item.email && <Text style={cardStyles.listSub}>{item.email}</Text>}
          {item.telefono && <Text style={cardStyles.listSub}>{item.telefono}</Text>}
        </View>
      ))}
    </View>
  )
}

function BookingCard({ data }: { data: RichData }) {
  return (
    <View style={cardStyles.container}>
      <View style={cardStyles.iconRow}>
        <Ionicons name="calendar" size={20} color={COLORS.success} />
        <Text style={cardStyles.name}>{data.titulo || 'Cita'}</Text>
      </View>
      {data.fechaHora && (
        <Text style={cardStyles.phone}>{new Date(data.fechaHora).toLocaleString('es-ES')}</Text>
      )}
      {data.nombre && <Text style={cardStyles.listSub}>Cliente: {data.nombre}</Text>}
    </View>
  )
}

function renderRichCard(richData: RichData): React.ReactNode {
  switch (richData.type) {
    case 'phone': return <PhoneCard data={richData} />
    case 'list': return <ListCard data={richData} />
    case 'booking': return <BookingCard data={richData} />
    default: return null
  }
}

// ─── Chat Bubble ─────────────────────────────────────────────────────────

interface ChatBubbleProps {
  message: ChatMessage
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBubble}>
          <Ionicons name="information-circle" size={14} color={COLORS.systemText} />
          <Text style={styles.systemText}>{message.text}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, isUser ? styles.userAlign : styles.gemmaAlign]}>
      {/* Avatar */}
      {!isUser && (
        <View style={styles.avatar}>
          <Ionicons name="sparkles" size={14} color="#000" />
        </View>
      )}

      <View style={styles.bubbleWrap}>
        {/* Bubble */}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.gemmaBubble]}>
          {message.text ? (
            <Text style={[styles.text, isUser ? styles.userText : styles.gemmaText]}>
              {message.text}
            </Text>
          ) : null}

          {/* Attachments inside bubble */}
          {message.attachments && message.attachments.length > 0 && (
            <View style={[styles.attachmentsContainer, message.text ? { marginTop: 8 } : {}]}>
              {message.attachments.map((att, idx) => {
                if (att.type === 'image') {
                  return (
                    <View key={idx} style={styles.imageAttachmentWrap}>
                      <Image source={{ uri: att.uri }} style={styles.imageAttachment} resizeMode="cover" />
                    </View>
                  )
                } else {
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={styles.pdfAttachment}
                      onPress={() => Linking.openURL(att.uri).catch(() => {})}
                    >
                      <Ionicons name="document-text" size={24} color={COLORS.warning} />
                      <View style={styles.pdfInfo}>
                        <Text style={styles.pdfName} numberOfLines={1}>{att.name}</Text>
                        {att.size && (
                          <Text style={styles.pdfSize}>{(att.size / 1024).toFixed(1)} KB</Text>
                        )}
                      </View>
                      <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.userText} />
                    </TouchableOpacity>
                  )
                }
              })}
            </View>
          )}
        </View>

        {/* Rich Card */}
        {message.richData && renderRichCard(message.richData)}

        {/* Timestamp */}
        <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.gemmaTimestamp]}>
          {message.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          {message.status === 'sending' && ' · Enviando...'}
          {message.status === 'error' && ' · Error'}
        </Text>
      </View>

      {/* User avatar */}
      {isUser && (
        <View style={[styles.avatar, styles.userAvatar]}>
          <Ionicons name="person" size={14} color="#000" />
        </View>
      )}
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
  },
  userAlign: {
    justifyContent: 'flex-end',
  },
  gemmaAlign: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#c0c1ff', // Primary
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  userAvatar: {
    backgroundColor: '#ddb7ff', // Secondary (Violet)
  },
  bubbleWrap: {
    maxWidth: '80%',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderBottomRightRadius: 4,
  },
  gemmaBubble: {
    backgroundColor: COLORS.gemmaBubble,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: COLORS.userText,
  },
  gemmaText: {
    color: COLORS.gemmaText,
  },
  attachmentsContainer: {
    gap: 8,
    minWidth: 160,
  },
  imageAttachmentWrap: {
    width: 200,
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0b1326',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  imageAttachment: {
    width: '100%',
    height: '100%',
  },
  pdfAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    gap: 10,
    width: 200,
  },
  pdfInfo: {
    flex: 1,
  },
  pdfName: {
    color: COLORS.userText,
    fontSize: 12,
    fontWeight: '600',
  },
  pdfSize: {
    color: 'rgba(218, 226, 253, 0.5)',
    fontSize: 10,
    marginTop: 2,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    marginHorizontal: 4,
  },
  userTimestamp: {
    color: 'rgba(218, 226, 253, 0.4)',
    textAlign: 'right',
  },
  gemmaTimestamp: {
    color: 'rgba(218, 226, 253, 0.4)',
    textAlign: 'left',
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  systemBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.systemBubble,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  systemText: {
    fontSize: 12,
    color: COLORS.systemText,
    fontWeight: '500',
  },
})

// ─── Card Styles ──────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.gemmaBubble,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.userText,
  },
  phone: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.userText,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionText: {
    color: '#0b1326',
    fontSize: 12,
    fontWeight: '700',
  },
  listItem: {
    paddingVertical: 8,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.userText,
  },
  listSub: {
    fontSize: 12,
    color: 'rgba(218, 226, 253, 0.6)',
    marginTop: 2,
  },
})
