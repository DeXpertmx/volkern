import React, { useEffect, useRef } from 'react'
import { Animated, Text, StyleSheet } from 'react-native'

interface ToastProps {
  message: string
  visible: boolean
  duration?: number
  type?: 'error' | 'info' | 'success'
  onHide: () => void
}

const COLORS = {
  error: '#EF4444',
  info: '#2563EB',
  success: '#10B981',
  text: '#FFFFFF',
}

export default function Toast({ message, visible, duration = 2500, type = 'error', onHide }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(duration),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => onHide())
    }
  }, [visible])

  if (!visible) return null

  return (
    <Animated.View style={[styles.container, { opacity, backgroundColor: COLORS[type] }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 999,
  },
  text: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
})
