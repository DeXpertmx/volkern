import React, { useEffect, useRef } from 'react'
import { Animated, Text, StyleSheet } from 'react-native'

interface ToastProps {
  message: string
  visible: boolean
  duration?: number
  type?: 'error' | 'info' | 'success'
  onHide: () => void
}

const BG_COLORS = {
  error:   'rgba(255, 180, 171, 0.18)',
  info:    'rgba(192, 193, 255, 0.18)',
  success: 'rgba(60, 221, 199, 0.18)',
}

const BORDER_COLORS = {
  error:   'rgba(255, 180, 171, 0.45)',
  info:    'rgba(192, 193, 255, 0.45)',
  success: 'rgba(60, 221, 199, 0.45)',
}

const TEXT_COLORS = {
  error:   '#ffb4ab',
  info:    '#c0c1ff',
  success: '#3cddc7',
}

export default function Toast({ message, visible, duration = 2500, type = 'error', onHide }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(8)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 0,
              duration: 280,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: 8,
              duration: 280,
              useNativeDriver: true,
            }),
          ]).start(() => onHide())
        }, duration)
      })
    }
  }, [visible])

  if (!visible) return null

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
          backgroundColor: BG_COLORS[type],
          borderColor: BORDER_COLORS[type],
        },
      ]}
    >
      <Text style={[styles.text, { color: TEXT_COLORS[type] }]}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 999,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
})
