import React from 'react'
import { View, StyleSheet, ViewProps } from 'react-native'

interface SafeBlurViewProps extends ViewProps {
  intensity?: number
  tint?: 'light' | 'dark' | 'default'
  children?: React.ReactNode
}

/**
 * SafeBlurView — Un reemplazo 100% seguro de BlurView libre de dependencias nativas.
 * Evita la excepción 'Can't find ViewManager ExpoBlurView' en dispositivos sin enlace nativo.
 */
export default function SafeBlurView({ intensity = 50, tint = 'dark', style, children, ...props }: SafeBlurViewProps) {
  // Fondos semitransparentes elegantes y acordes a la paleta espacial
  const bgColors = {
    dark: 'rgba(19, 27, 46, 0.82)',
    light: 'rgba(255, 255, 255, 0.85)',
    default: 'rgba(30, 41, 59, 0.80)',
  }

  const selectedBg = bgColors[tint] || bgColors.dark

  return (
    <View style={[styles.container, { backgroundColor: selectedBg }, style]} {...props}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    // Bordes premium sutiles para dar sensación de cristal (glassmorphism)
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  }
})
