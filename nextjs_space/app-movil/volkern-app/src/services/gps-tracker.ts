import * as Location from 'expo-location'
import { saveData, getData } from './secure-storage'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface GpsTrackerConfig {
  /** deviceKey del vehículo en Volkern */
  deviceKey: string
  /** Placa del vehículo (solo para display) */
  plate?: string
  /** URL base del servidor Volkern */
  apiUrl: string
}

export interface GpsTrackerState {
  /** Si el tracker está corriendo */
  isTracking: boolean
  /** Última posición enviada */
  lastSent: { latitude: number; longitude: number; timestamp: string } | null
  /** Errores consecutivos */
  consecutiveErrors: number
  /** Último error */
  lastError: string | null
  /** Posiciones enviadas */
  totalSent: number
}

export interface PollResponse {
  acknowledged: boolean
  vehicleId: string
  plate: string
  newPosition: [number, number]
  timestamp: string
  speed: number | null
  heading: number | null
  cargoTemp: number | null
}

// ─── Storage keys ─────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  DEVICE_KEY: 'volkern_gps_device_key',
  PLATE: 'volkern_gps_plate',
  API_URL: 'volkern_gps_api_url',
} as const

// ─── Default interval ─────────────────────────────────────────────────────────
const DEFAULT_INTERVAL_MS = 15000 // 15 segundos

// ─── Events ───────────────────────────────────────────────────────────────────
type GpsTrackerListener = (state: GpsTrackerState) => void

// ─── Service ──────────────────────────────────────────────────────────────────
class GpsTrackerService {
  private config: GpsTrackerConfig | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private state: GpsTrackerState = {
    isTracking: false,
    lastSent: null,
    consecutiveErrors: 0,
    lastError: null,
    totalSent: 0,
  }
  private listeners: Set<GpsTrackerListener> = new Set()
  private intervalMs: number = DEFAULT_INTERVAL_MS

  // ── Config ──────────────────────────────────────────────────────────
  async loadConfig(): Promise<GpsTrackerConfig | null> {
    const deviceKey = await getData<string>(STORAGE_KEYS.DEVICE_KEY)
    const plate = await getData<string>(STORAGE_KEYS.PLATE)
    const apiUrl = await getData<string>(STORAGE_KEYS.API_URL)
    if (deviceKey) {
      this.config = { deviceKey, plate: plate || undefined, apiUrl: apiUrl || 'http://localhost:3000' }
      return this.config
    }
    return null
  }

  async saveConfig(config: GpsTrackerConfig): Promise<void> {
    this.config = config
    await saveData(STORAGE_KEYS.DEVICE_KEY, config.deviceKey)
    await saveData(STORAGE_KEYS.PLATE, config.plate || '')
    await saveData(STORAGE_KEYS.API_URL, config.apiUrl)
  }

  getConfig(): GpsTrackerConfig | null {
    return this.config
  }

  setInterval(ms: number): void {
    this.intervalMs = Math.max(3000, Math.min(60000, ms)) // entre 3s y 60s
    // Si está corriendo, reiniciar con nuevo intervalo
    if (this.state.isTracking) {
      this.stop()
      this.start()
    }
  }

  getInterval(): number {
    return this.intervalMs
  }

  // ── Location permission ─────────────────────────────────────────────
  async requestPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync()
    return status === 'granted'
  }

  // ── Tracking ────────────────────────────────────────────────────────
  async start(): Promise<{ success: boolean; error?: string }> {
    if (!this.config?.deviceKey) {
      return { success: false, error: 'No hay deviceKey configurado' }
    }

    const hasPermission = await this.requestPermission()
    if (!hasPermission) {
      return { success: false, error: 'Permiso de ubicación denegado' }
    }

    if (this.state.isTracking) {
      return { success: true }
    }

    this.state.isTracking = true
    this.state.consecutiveErrors = 0
    this.state.lastError = null
    this.notify()

    // Envío inmediato al arrancar
    await this.sendPosition()

    // Intervalo periódico
    this.intervalId = setInterval(() => {
      this.sendPosition()
    }, this.intervalMs)

    return { success: true }
  }

  stop(): void {
    this.state.isTracking = false
    this.notify()

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  // ── Send position ───────────────────────────────────────────────────
  private async sendPosition(): Promise<void> {
    if (!this.config?.deviceKey) return

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      const { latitude, longitude } = location.coords

      const response = await fetch(
        `${this.config.apiUrl}/api/erp/logistics/gps/vehicle-poll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceKey: this.config.deviceKey,
            latitude,
            longitude,
            speed: location.coords.speed != null
              ? Math.round(location.coords.speed * 3.6) // m/s → km/h
              : undefined,
            heading: location.coords.heading != null
              ? Math.round(location.coords.heading)
              : undefined,
            accuracy: location.coords.accuracy != null
              ? Math.round(location.coords.accuracy)
              : undefined,
            timestamp: new Date().toISOString(),
          }),
        },
      )

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || response.statusText || `HTTP ${response.status}`)
      }

      const data: PollResponse = await response.json()

      this.state.lastSent = {
        latitude,
        longitude,
        timestamp: data.timestamp,
      }
      this.state.consecutiveErrors = 0
      this.state.lastError = null
      this.state.totalSent++
      this.notify()
    } catch (err: any) {
      this.state.consecutiveErrors++
      this.state.lastError = err.message || 'Error desconocido'
      this.notify()

      // Si hay más de 10 errores consecutivos, detener auto
      if (this.state.consecutiveErrors >= 10) {
        this.stop()
        this.state.lastError = 'Demasiados errores consecutivos. Tracking detenido.'
        this.notify()
      }
    }
  }

  // ── Force send now ──────────────────────────────────────────────────
  async sendNow(): Promise<{ success: boolean; error?: string }> {
    if (!this.config?.deviceKey) {
      return { success: false, error: 'No hay deviceKey configurado' }
    }
    await this.sendPosition()
    return {
      success: this.state.consecutiveErrors === 0,
      error: this.state.lastError || undefined,
    }
  }

  // ── State / Subscriptions ───────────────────────────────────────────
  getState(): GpsTrackerState {
    return { ...this.state }
  }

  subscribe(listener: GpsTrackerListener): () => void {
    this.listeners.add(listener)
    // Llamar inmediatamente con estado actual
    listener({ ...this.state })
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    const state = { ...this.state }
    this.listeners.forEach((fn) => {
      try {
        fn(state)
      } catch {
        // ignore listener errors
      }
    })
  }
}

export const gpsTrackerService = new GpsTrackerService()
