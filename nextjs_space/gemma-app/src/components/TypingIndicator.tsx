import React from 'react'
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native'

const COLORS = {
  gemmaBubble: '#131b2e',
  gemmaText: '#dae2fd',
  border: 'rgba(255, 255, 255, 0.08)',
  primary: '#c0c1ff',
  dot: 'rgba(218, 226, 253, 0.5)',
}

export default function TypingIndicator() {
  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <ActivityIndicator size="small" color="#0b1326" />
      </View>
      <View style={styles.bubble}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
        <Text style={styles.label}>Gemma está pensando...</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    paddingHorizontal: 12,
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  bubble: {
    backgroundColor: COLORS.gemmaBubble,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.dot,
  },
  label: {
    fontSize: 12,
    color: COLORS.dot,
    fontWeight: '500',
  },
})
