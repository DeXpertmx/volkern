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
  color?: string
}

/**
 * VoiceWaveform — 5 barras animadas que simulan un indicador de nivel de audio.
 * Cuando isListening=true, las barras oscilan suavemente con amplitudes e intervalos aleatorios.
 * Cuando isListening=false, las barras quedan estáticas en altura mínima.
 */
export default function VoiceWaveform({ isListening, color }: VoiceWaveformProps) {
  const activeColor = color || '#EF4444'

  // Crear valores animados para cada barra
  const animations = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(MIN_HEIGHT))
  ).current

  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([])

  useEffect(() => {
    // Limpiar intervalos anteriores
    intervalsRef.current.forEach(clearInterval)
    intervalsRef.current = []

    if (isListening) {
      // Iniciar animación: cada barra oscila con amplitud y velocidad aleatoria
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
      // No listening: llevar todas las barras a altura mínima (suavemente)
      animations.forEach((anim) => {
        Animated.timing(anim, {
          toValue: MIN_HEIGHT,
          duration: 200,
          useNativeDriver: false,
        }).start()
      })
    }

    return () => {
      intervalsRef.current.forEach(clearInterval)
      intervalsRef.current = []
    }
  }, [isListening])

  return (
    <View style={styles.container}>
      {animations.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            BAR_STYLE,
            {
              height: anim,
              backgroundColor: isListening ? activeColor : '#94A3B8',
              opacity: isListening ? 0.6 + (i / BAR_COUNT) * 0.4 : 0.5,
            },
          ]}
        />
      ))}
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
