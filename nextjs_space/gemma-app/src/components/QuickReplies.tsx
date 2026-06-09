import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

const COLORS = {
  primary: '#c0c1ff', // Indigo
  border: 'rgba(255, 255, 255, 0.08)',
  surface: 'rgba(192, 193, 255, 0.1)',
  textPrimary: '#dae2fd',
  textSecondary: '#c7c4d7',
}

interface QuickRepliesProps {
  replies: string[]
  onSelect: (text: string) => void
  disabled?: boolean
}

export default function QuickReplies({ replies, onSelect, disabled }: QuickRepliesProps) {
  if (!replies || replies.length === 0) return null

  return (
    <View style={styles.container}>
      {replies.map((reply, i) => (
        <TouchableOpacity
          key={i}
          style={styles.chip}
          onPress={() => onSelect(reply)}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <Text style={styles.chipText}>{reply}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chip: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(192, 193, 255, 0.25)',
  },
  chipText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
})
