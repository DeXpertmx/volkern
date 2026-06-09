#!/usr/bin/env npx tsx
/**
 * ─── Simulador de Dispositivo IoT GPS ────────────────────────────────────
 *
 * Uso:
 *   # Usar un deviceKey existente (ej: desde el panel de configuración GPS)
 *   npx tsx scripts/simulate-gps-device.ts --deviceKey=VK-GPS-TEST123-X7K2
 *
 *   # Buscar automáticamente el primer vehículo con GPS en la BD local
 *   npx tsx scripts/simulate-gps-device.ts --auto
 *
 *   # Ruta personalizada (Málaga → Madrid)
 *   npx tsx scripts/simulate-gps-device.ts \
 *     --deviceKey=VK-GPS-TEST123-X7K2 \
 *     --originLat=36.7213 --originLng=-4.4214 \
 *     --destLat=40.4168 --destLng=-3.7038 \
 *     --steps=20 --interval=2 --speed=65
 *
 *   # Simular con temperatura de carga (refrigerada)
 *   npx tsx scripts/simulate-gps-device.ts --deviceKey=... --cargoTemp --tempRange=2,8
 *
 *   # URL personalizada (para desarrollo local)
 *   npx tsx scripts/simulate-gps-device.ts --deviceKey=... --baseUrl=http://localhost:3000
 *
 * Atajos de ruta predefinidos:
 *   --route=malaga-madrid     (default, ~414 km, A-4)
 *   --route=malaga-barcelona  (~820 km, A-7 / A-92)
 *   --route=madrid-valencia   (~360 km, A-3)
 *   --route=malaga-sevilla    (~200 km, A-92)
 * ──────────────────────────────────────────────────────────────────────────
 */

const ROUTES: Record<string, { originLat: number; originLng: number; destLat: number; destLng: number; label: string }> = {
  'malaga-madrid':    { originLat: 36.7213, originLng: -4.4214, destLat: 40.4168, destLng: -3.7038, label: 'Málaga → Madrid (A-4, ~414 km)' },
  'malaga-barcelona': { originLat: 36.7213, originLng: -4.4214, destLat: 41.3874, destLng:  2.1686,  label: 'Málaga → Barcelona (A-7/A-92, ~820 km)' },
  'madrid-valencia':  { originLat: 40.4168, originLng: -3.7038, destLat: 39.4699, destLng: -0.3763,  label: 'Madrid → Valencia (A-3, ~360 km)' },
  'malaga-sevilla':   { originLat: 36.7213, originLng: -4.4214, destLat: 37.3891, destLng: -5.9845,  label: 'Málaga → Sevilla (A-92, ~200 km)' },
}

// ─── Parse args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce((acc: Record<string, string>, arg: string) => {
  if (arg.startsWith('--')) {
    const eqIdx = arg.indexOf('=')
    if (eqIdx !== -1) {
      acc[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1)
    } else {
      acc[arg.slice(2)] = 'true'
    }
  }
  return acc
}, {})

// ─── Config ─────────────────────────────────────────────────────────────────

const DEVICE_KEY = args.deviceKey || process.env.DEVICE_KEY || ''
const AUTO_MODE = args.auto === 'true'
const BASE_URL = args.baseUrl || process.env.BASE_URL || 'https://volkern.app'
const INTERVAL_SEC = Math.max(1, parseInt(args.interval || '3', 10))
const STEPS = Math.max(1, parseInt(args.steps || '15', 10))
const SPEED_BASE = Math.max(10, parseInt(args.speed || '60', 10))
const APIRoute = `${BASE_URL}/api/erp/logistics/gps/vehicle-poll`

// Ruta
let routeKey = args.route || 'malaga-madrid'
if (!ROUTES[routeKey]) {
  console.warn(`⚠️  Ruta "${routeKey}" no encontrada. Usando malaga-madrid.`)
  routeKey = 'malaga-madrid'
}
const route = ROUTES[routeKey]
const originLat = parseFloat(args.originLat || String(route.originLat))
const originLng = parseFloat(args.originLng || String(route.originLng))
const destLat = parseFloat(args.destLat || String(route.destLat))
const destLng = parseFloat(args.destLng || String(route.destLng))

// Temperatura de carga
const CARGO_TEMP = args.cargoTemp === 'true'
const TEMP_RANGE = (args.tempRange || '4,10').split(',').map(Number) as [number, number]

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Interpola linealmente entre dos puntos */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Calcula el rumbo (heading) entre dos puntos en grados */
function calculateHeading(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180)
  const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180)
    - Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Añade un pequeño ruido aleatorio a la posición para simular imprecisión GPS */
function addNoise(value: number, maxError = 0.0005): number {
  return value + (Math.random() - 0.5) * maxError
}

/** Genera temperatura con variación suave */
function generateTemp(step: number, total: number, range: [number, number]): number {
  const mid = (range[0] + range[1]) / 2
  const amp = (range[1] - range[0]) / 2
  return mid + amp * Math.sin((step / total) * Math.PI * 3) + (Math.random() - 0.5) * 1.5
}

/** Pausa por ms */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Envía una posición al endpoint */
async function sendPosition(payload: Record<string, unknown>) {
  try {
    const res = await fetch(APIRoute, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    return { ok: res.ok, status: res.status, data }
  } catch (err: any) {
    return { ok: false, status: 0, data: { error: err.message } }
  }
}

// ─── Auto-detect deviceKey ─────────────────────────────────────────────────

async function autoDetectDeviceKey(): Promise<string | null> {
  try {
    const { PrismaClient } = require('@prisma/client') as any
    const prisma = new PrismaClient()

    const vehicle = await (prisma as any).erp_fleet_vehicles.findFirst({
      where: { gpsDeviceId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { plate: true, gpsDeviceId: true },
    })

    await prisma.$disconnect()

    if (vehicle?.gpsDeviceId) {
      console.log(`🔍 Auto-detect: ${vehicle.plate} → ${vehicle.gpsDeviceId}`)
      return vehicle.gpsDeviceId
    }
    return null
  } catch {
    return null
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║       🛰️  Simulador de Dispositivo IoT GPS               ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log('')

  // Resolver deviceKey
  let deviceKey = DEVICE_KEY
  if (!deviceKey && AUTO_MODE) {
    const detected = await autoDetectDeviceKey()
    if (detected) deviceKey = detected
  }
  if (!deviceKey) {
    console.error('❌ No se especificó deviceKey.')
    console.error('   Usa --deviceKey=VK-GPS-XXXX o --auto para detectar automáticamente.')
    console.error('')
    process.exit(1)
  }

  // ── Mostrar configuración ──
  console.log(`📍  Ruta:       ${route.label}`)
  console.log(`🔑  DeviceKey:  ${deviceKey}`)
  console.log(`🌐  Endpoint:   POST ${APIRoute}`)
  console.log(`🚦  Steps:      ${STEPS} (cada ${INTERVAL_SEC}s)`)
  console.log(`📏  Velocidad:  ~${SPEED_BASE} km/h`)
  if (CARGO_TEMP) console.log(`🌡️   Carga:      refrigerada (${TEMP_RANGE[0]}°C–${TEMP_RANGE[1]}°C)`)
  console.log('')

  // ── Simular envíos ──
  let consecErrors = 0
  const maxErrors = 5

  for (let step = 0; step <= STEPS; step++) {
    const t = step / STEPS
    const lat = addNoise(lerp(originLat, destLat, t))
    const lng = addNoise(lerp(originLng, destLng, t))
    const speed = SPEED_BASE + Math.sin(t * Math.PI * 2) * 15 + (Math.random() - 0.5) * 10
    const prevLat = lerp(originLat, destLat, Math.max(0, t - 1 / STEPS))
    const prevLng = lerp(originLng, destLng, Math.max(0, t - 1 / STEPS))
    const heading = step > 0
      ? calculateHeading(prevLat, prevLng, lat, lng)
      : 0

    const payload: Record<string, unknown> = {
      deviceKey,
      latitude: Math.round(lat * 10000) / 10000,
      longitude: Math.round(lng * 10000) / 10000,
      speed: Math.round(Math.max(0, speed) * 10) / 10,
      heading: Math.round(heading * 10) / 10,
    }

    if (CARGO_TEMP) {
      payload.cargoTemp = Math.round(generateTemp(step, STEPS, TEMP_RANGE) * 10) / 10
    }

    const progress = Math.round(t * 100)
    const { ok, status, data } = await sendPosition(payload)

    if (ok) {
      consecErrors = 0
      const posStr = `${payload.latitude}, ${payload.longitude}`
      const speedStr = `${payload.speed} km/h`
      const headingStr = `${payload.heading}°`

      if (data.previousPosition) {
        const [prevLat, prevLng] = data.previousPosition as [number, number]
        console.log(
          `  ✅ [${progress.toString().padStart(3)}%] ` +
          `${posStr}  🏎️  ${speedStr.padStart(8)}  🧭 ${headingStr.padStart(6)}` +
          (payload.cargoTemp != null ? `  🌡️  ${payload.cargoTemp}°C` : '') +
          `  (← [${prevLat.toFixed(4)}, ${prevLng.toFixed(4)}])`
        )
      } else {
        console.log(
          `  ✅ [${progress.toString().padStart(3)}%] ` +
          `${posStr}  🏎️  ${speedStr.padStart(8)}  🧭 ${headingStr.padStart(6)}` +
          (payload.cargoTemp != null ? `  🌡️  ${payload.cargoTemp}°C` : '') +
          `  (primera posición)`
        )
      }
    } else {
      consecErrors++
      console.error(`  ❌ [${progress.toString().padStart(3)}%] Error ${status}: ${data?.error || 'desconocido'}`)
      if (consecErrors >= maxErrors) {
        console.error(`\n⚠️  Demasiados errores consecutivos (${maxErrors}). Abortando.`)
        break
      }
    }

    if (step < STEPS) {
      await sleep(INTERVAL_SEC * 1000)
    }
  }

  // ── Resumen ──
  console.log('')
  if (consecErrors < maxErrors) {
    console.log('✅  Simulación completada. Todas las posiciones enviadas.')
  }
  console.log('')
  console.log('📋  Para ver el vehículo en el mapa, abre:')
  console.log(`    ${BASE_URL}/dashboard/logistica/flota`)
  console.log('')
}

main().catch((err) => {
  console.error('💥 Error fatal:', err.message)
  process.exit(1)
})
