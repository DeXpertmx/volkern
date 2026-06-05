import { useState, useRef, useEffect } from 'react'
import { Platform } from 'react-native'
import { Audio } from 'expo-av'

const BAR_COUNT = 5
const FFT_SIZE = 256

/**
 * Hook que analiza el nivel de audio del micrófono en tiempo real.
 * - Web: AnalyserNode via Web Audio API (getUserMedia)
 * - Native: expo-av Audio.Recording con isMeteringEnabled
 *   Si falla (conflicto con @react-native-voice/voice), fallback a simulación suave.
 *
 * Retorna un array de 5 valores (0-1) representando bandas de frecuencia.
 * Solo se activa cuando `active` es true.
 */
export function useAudioLevel(active: boolean): number[] {
  const [bands, setBands] = useState<number[]>(new Array(BAR_COUNT).fill(0))

  const animFrameRef = useRef<number>(0)
  const recordingRef = useRef<Audio.Recording | null>(null)
  const cancelledRef = useRef(false)
  const prevBandsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0.1))
  const targetBandsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0.5))

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0

      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {})
        recordingRef.current = null
      }

      setBands(new Array(BAR_COUNT).fill(0))
      return
    }

    cancelledRef.current = false

    if (Platform.OS === 'web') {
      // ── Web: Web Audio API (AnalyserNode) ──────────────────────────────
      let stream: MediaStream | null = null
      let ctx: AudioContext | null = null
      let source: MediaStreamAudioSourceNode | null = null
      let analyser: AnalyserNode | null = null

      async function setupWeb() {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          if (cancelledRef.current) {
            stream.getTracks().forEach(t => t.stop())
            return
          }

          ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          source = ctx.createMediaStreamSource(stream)
          analyser = ctx.createAnalyser()
          analyser.fftSize = FFT_SIZE

          source.connect(analyser)

          const bufferLength = analyser.frequencyBinCount // 128
          const dataArray = new Uint8Array(bufferLength)
          const bucketSize = Math.floor(bufferLength / BAR_COUNT)
          let frameCount = 0
          const THROTTLE_FRAME = 2

          function read() {
            if (cancelledRef.current) return

            analyser!.getByteFrequencyData(dataArray)

            frameCount++
            if (frameCount % THROTTLE_FRAME === 0) {
              const newBands = new Array(BAR_COUNT)
              for (let b = 0; b < BAR_COUNT; b++) {
                const start = b * bucketSize
                const end = b === BAR_COUNT - 1 ? bufferLength : start + bucketSize
                let sum = 0
                for (let i = start; i < end; i++) sum += dataArray[i]
                const avg = sum / (end - start)
                newBands[b] = avg < 10 ? 0 : Math.min(avg / 180, 1)
              }
              setBands(newBands)
            }

            animFrameRef.current = requestAnimationFrame(read)
          }

          read()
        } catch {
          // Mic not available
        }
      }

      setupWeb()

      return () => {
        cancelledRef.current = true
        cancelAnimationFrame(animFrameRef.current)
        stream?.getTracks().forEach(t => t.stop())
        source?.disconnect()
        analyser?.disconnect()
        ctx?.close()
        setBands(new Array(BAR_COUNT).fill(0))
      }
    } else {
      // ── Native: expo-av Recording con metering ─────────────────────────
      // Inicializar targets para simulación
      for (let b = 0; b < BAR_COUNT; b++) {
        targetBandsRef.current[b] = Math.random() * 0.9 + 0.1
      }
      prevBandsRef.current = new Array(BAR_COUNT).fill(0.1)

      async function setupNative() {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
          })

          const recording = new Audio.Recording()
          recordingRef.current = recording

          recording.setOnRecordingStatusUpdate((status) => {
            if (cancelledRef.current) return

            if (status.metering !== undefined) {
              // metering: -160 (silencio) a 0 (pico)
              const normalized = Math.max(0, Math.min(1, (status.metering + 80) / 80))
              // Simular 5 bandas basadas en el nivel general
              const newBands = new Array(BAR_COUNT)
              for (let b = 0; b < BAR_COUNT; b++) {
                const variation = 0.7 + Math.random() * 0.6
                newBands[b] = Math.min(1, normalized * variation * (1 - b * 0.08))
              }
              setBands(newBands)
            }
          })

          await recording.prepareToRecordAsync({
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
            isMeteringEnabled: true,
          })

          await recording.startAsync()
        } catch {
          // Mic conflict with Voice library → fallback a simulación
          startSimulation()
        }
      }

      function startSimulation() {
        const velocities = new Array(BAR_COUNT).fill(0)
        const SPEED = 0.15

        function simulate() {
          if (cancelledRef.current) return

          const prev = prevBandsRef.current
          const targets = targetBandsRef.current
          const newBands = [...prev]

          for (let b = 0; b < BAR_COUNT; b++) {
            // Ocasionalmente cambiar target
            if (Math.random() < 0.04) {
              targets[b] = Math.random() * 0.9 + 0.1
            }
            // Acelerar hacia target desde el valor previo
            velocities[b] += (targets[b] - prev[b]) * SPEED
            velocities[b] *= 0.85 // Damping
            newBands[b] = Math.max(0.05, Math.min(1, prev[b] + velocities[b]))
          }

          prevBandsRef.current = newBands
          setBands(newBands)
          animFrameRef.current = requestAnimationFrame(simulate)
        }

        simulate()
      }

      setupNative()

      return () => {
        cancelledRef.current = true
        cancelAnimationFrame(animFrameRef.current)
        if (recordingRef.current) {
          recordingRef.current.stopAndUnloadAsync().catch(() => {})
          recordingRef.current = null
        }
        setBands(new Array(BAR_COUNT).fill(0))
      }
    }
  }, [active])

  return bands
}
