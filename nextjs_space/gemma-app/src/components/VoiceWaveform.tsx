import React, { useRef, useEffect } from 'react'
import { View, Animated, StyleSheet } from 'react-native'

const BAR_COUNT = 5
const BAR_WIDTH = 3
const BAR_GAP = 3
const MIN_HEIGHT = 4
const MAX_HEIGHT = 28
const BAR_STYLE = { width: BAR_WIDTH, borderRadius: BAR_WIDTH / 2 }

interface VoiceWaveformProps {
  isListening: boolean
  isPaused?: boolean
  /** Array de 5 valores (0-1) del analizador de audio real */
  audioBands?: number[]
  color?: string
}

/**
 * VoiceWaveform — 5 barras que reflejan el nivel de audio.
 * Cuando audioBands está presente, anima suavemente hacia los valores reales.
 * Cuando no, usa animación simulada (fallback).
 * Cuando pausado, barras estáticas en gris.
 */
export default function VoiceWaveform({ isListening, isPaused, audioBands, color }: VoiceWaveformProps) {
  const activeColor = color || '#c0c1ff' // Indigo primario del tema oscuro
  const hasRealAudio = isListening && !isPaused && audioBands && audioBands.length === BAR_COUNT

  // Valores animados — siempre se usan para transiciones suaves
  const animations = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(MIN_HEIGHT))
  ).current

  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([])

  // Efecto para audio real: se dispara en cada cambio de audioBands (~30fps)
  useEffect(() => {
    if (!hasRealAudio || !audioBands) return
    for (let i = 0; i < BAR_COUNT; i++) {
      const target = MIN_HEIGHT + (audioBands[i] || 0) * (MAX_HEIGHT - MIN_HEIGHT)
      Animated.timing(animations[i], {
        toValue: target,
        duration: 80,
        useNativeDriver: false,
      }).start()
    }
  }, [audioBands, hasRealAudio])

  // Efecto para simulación / estado (solo cuando NO hay audio real)
  useEffect(() => {
    // Limpiar intervalos anteriores
    intervalsRef.current.forEach(clearInterval)
    intervalsRef.current = []

    if (isListening && !isPaused && !hasRealAudio) {
      // Sin audio real: animación simulada con intervalos
      animations.forEach((anim, i) => {
        const updateBar = () => {
          const targetHeight = MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT)
          Animated.timing(anim, {
            toValue: targetHeight,
            duration: 120 + Math.random() * 100,
            useNativeDriver: false,
          }).start()
        }
        updateBar()
        const interval = setInterval(updateBar, 150 + i * 30 + Math.random() * 80)
        intervalsRef.current.push(interval)
      })
    } else {
      // Pausado o idle: altura mínima (transición suave)
      animations.forEach((anim) => {
        Animated.timing(anim, {
          toValue: isPaused ? 8 : MIN_HEIGHT,
          duration: 200,
          useNativeDriver: false,
        }).start()
      })
    }

    return () => {
      intervalsRef.current.forEach(clearInterval)
      intervalsRef.current = []
    }
  }, [isListening, isPaused, hasRealAudio])

  const getOpacity = (index: number): number => {
    if (isPaused) return 0.5
    if (hasRealAudio) return 0.6 + (audioBands![index] || 0) * 0.4
    return 0.6 + (index / BAR_COUNT) * 0.4
  }

  return (
    <View style={styles.container}>
      {animations.map((anim, i) => {
        const intensity = hasRealAudio ? (audioBands![i] || 0) : 0
        // Intensidad: 0.6 (baja) → 1.0 (alta) para el color
        const colorIntensity = hasRealAudio ? 0.6 + intensity * 0.4 : 1.0

        return (
          <Animated.View
            key={i}
            style={[
              BAR_STYLE,
              {
                height: anim,
                backgroundColor: isPaused ? '#464554' : activeColor,
                opacity: getOpacity(i),
              },
            ]}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: BAR_GAP,
    height: MAX_HEIGHT + 4,
    paddingHorizontal: 2,
  },
})
