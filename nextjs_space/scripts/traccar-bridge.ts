#!/usr/bin/env npx tsx
/**
 * Traccar Bridge → Volkern GPS
 * =============================
 * Polls the Traccar API for latest vehicle positions and forwards them
 * to Volkern's /api/erp/logistics/gps/vehicle-poll endpoint.
 *
 * ## Quickstart
 *   cp traccar-device-mapping.example.json traccar-device-mapping.json
 *   # Edit the mapping file with your device IMEI → gpsDeviceId pairs
 *   npx tsx scripts/traccar-bridge.ts --once
 *
 * ## Modes
 *   --once               Poll once and exit (ideal for cron every 30s)
 *   --daemon             Run continuously (uses --interval)
 *   --interval <secs>    Poll interval in seconds (default: 30)
 *   --mapping <path>     Device mapping JSON file (default: ./traccar-device-mapping.json)
 *
 * ## Env vars (or .env.local)
 *   TRACCAR_URL          Traccar server URL (default: http://localhost:8082)
 *   TRACCAR_EMAIL        Traccar login email (default: admin@volkern.app)
 *   TRACCAR_PASS         Traccar login password (default: admin)
 *   VOLKERN_URL          Volkern app URL (default: http://localhost:3000)
 *
 * ## cron example (every 30 seconds)
 *   * * * * * sleep 0;  npx tsx /app/scripts/traccar-bridge.ts --once >> /var/log/traccar-bridge.log 2>&1
 *   * * * * * sleep 15; npx tsx /app/scripts/traccar-bridge.ts --once >> /var/log/traccar-bridge.log 2>&1
 *   * * * * * sleep 30; npx tsx /app/scripts/traccar-bridge.ts --once >> /var/log/traccar-bridge.log 2>&1
 *   * * * * * sleep 45; npx tsx /app/scripts/traccar-bridge.ts --once >> /var/log/traccar-bridge.log 2>&1
 */

import * as fs from 'fs'
import * as path from 'path'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface TraccarPosition {
  id: number
  deviceId: number
  latitude: number
  longitude: number
  speed: number       // knots — converted to km/h below
  course: number       // degrees 0-360
  altitude: number
  accuracy: number
  deviceTime: string
  fixTime: string
  attributes?: Record<string, any>
}

interface TraccarDevice {
  id: number
  name: string
  uniqueId: string   // IMEI or device identifier
  status: string
  lastUpdate: string | null
  positionId: number | null
}

interface DeviceMapping {
  [imei: string]: string  // IMEI → Volkern gpsDeviceId (VK-GPS-XXXXX-XXXX)
}

interface BridgeStats {
  started: string
  totalPolls: number
  successfulForwards: number
  failedForwards: number
  lastPoll: string | null
  lastError: string | null
}

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

const TRACCAR_URL = process.env.TRACCAR_URL || 'http://localhost:8082'
const TRACCAR_EMAIL = process.env.TRACCAR_EMAIL || 'admin@volkern.app'
const TRACCAR_PASS = process.env.TRACCAR_PASS || 'admin'
const VOLKERN_URL = process.env.VOLKERN_URL || 'http://localhost:3000'
const VEHICLE_POLL_ENDPOINT = `${VOLKERN_URL}/api/erp/logistics/gps/vehicle-poll`
// Session expires after ~30 min of inactivity in Traccar — refresh every 5 min
const SESSION_REFRESH_MS = 5 * 60 * 1000

// ═══════════════════════════════════════════════════════════════
// CLI argument parsing
// ═══════════════════════════════════════════════════════════════

function parseArgs(): { mode: 'once' | 'daemon'; interval: number; mappingPath: string } {
  const args = process.argv.slice(2)
  let mode: 'once' | 'daemon' = 'once'
  let interval = 30
  let mappingPath = path.resolve(process.cwd(), 'traccar-device-mapping.json')

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--once':
        mode = 'once'
        break
      case '--daemon':
        mode = 'daemon'
        break
      case '--interval':
        interval = parseInt(args[++i], 10) || 30
        break
      case '--mapping':
        mappingPath = path.resolve(args[++i])
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }

  return { mode, interval, mappingPath }
}

function printHelp() {
  console.log(`
Traccar Bridge → Volkern GPS

Usage: npx tsx scripts/traccar-bridge.ts [options]

Options:
  --once               Poll once and exit (default)
  --daemon             Run continuously
  --interval <secs>     Poll interval in seconds (default: 30)
  --mapping <path>      Device mapping file (default: ./traccar-device-mapping.json)
  --help, -h           Show this help

Environment:
  TRACCAR_URL          Traccar server URL (default: http://localhost:8082)
  TRACCAR_EMAIL        Traccar login email (default: admin@volkern.app)
  TRACCAR_PASS         Traccar login password (default: admin)
  VOLKERN_URL          Volkern app URL (default: http://localhost:3000)
`)
}

// ═══════════════════════════════════════════════════════════════
// Device mapping
// ═══════════════════════════════════════════════════════════════

function loadMapping(filePath: string): DeviceMapping {
  if (!fs.existsSync(filePath)) {
    console.error(`[bridge] ERROR: Mapping file not found: ${filePath}`)
    console.error('[bridge] Create one with: cp traccar-device-mapping.example.json traccar-device-mapping.json')
    console.error('[bridge] Then edit it with your IMEI → gpsDeviceId pairs.')
    process.exit(1)
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const mapping = JSON.parse(raw)
    if (typeof mapping !== 'object' || Array.isArray(mapping)) {
      throw new Error('Mapping file must be a JSON object')
    }
    console.log(`[bridge] Loaded ${Object.keys(mapping).length} device mapping(s)`)
    return mapping
  } catch (err: any) {
    console.error(`[bridge] ERROR parsing mapping file: ${err.message}`)
    process.exit(1)
  }
}

// ═══════════════════════════════════════════════════════════════
// Traccar API client (session-based auth — Traccar 6.x)
// ═══════════════════════════════════════════════════════════════

let sessionCookie: string | null = null
let sessionExpiresAt = 0

/** Login to Traccar via /api/session and store the JSESSIONID cookie */
async function traccarLogin(): Promise<string> {
  const res = await fetch(`${TRACCAR_URL}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: TRACCAR_EMAIL, password: TRACCAR_PASS }).toString(),
  })

  if (!res.ok) {
    throw new Error(`Traccar login failed: ${res.status} ${res.statusText}`)
  }

  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('Traccar login succeeded but no session cookie returned')
  }

  // Extract JSESSIONID from the cookie header
  const match = setCookie.match(/JSESSIONID=([^;]+)/)
  if (!match) {
    throw new Error('Traccar login succeeded but JSESSIONID not found in cookie')
  }

  sessionCookie = `JSESSIONID=${match[1]}`
  sessionExpiresAt = Date.now() + SESSION_REFRESH_MS
  return sessionCookie
}

/** Get (or refresh) the session cookie */
async function getSessionCookie(): Promise<string> {
  if (sessionCookie && Date.now() < sessionExpiresAt) {
    return sessionCookie
  }
  return await traccarLogin()
}

async function traccarFetch<T>(endpoint: string): Promise<T> {
  const cookie = await getSessionCookie()
  const url = `${TRACCAR_URL}/api/${endpoint}`
  const res = await fetch(url, {
    headers: {
      'Cookie': cookie,
      'Accept': 'application/json',
    },
  })

  // If session expired, re-login and retry once
  if (res.status === 401) {
    sessionCookie = null
    const newCookie = await traccarLogin()
    const retryRes = await fetch(url, {
      headers: {
        'Cookie': newCookie,
        'Accept': 'application/json',
      },
    })
    if (!retryRes.ok) {
      throw new Error(`Traccar API error ${retryRes.status}: ${retryRes.statusText} at ${url}`)
    }
    return retryRes.json() as Promise<T>
  }

  if (!res.ok) {
    throw new Error(`Traccar API error ${res.status}: ${res.statusText} at ${url}`)
  }

  return res.json() as Promise<T>
}

// Track consecutive Traccar API failures to avoid log spam
let traccarConsecutiveFailures = 0

/**
 * Fetch all latest positions from Traccar.
 * Traccar's /api/positions returns the most recent position for each device.
 */
async function fetchLatestPositions(): Promise<TraccarPosition[]> {
  try {
    const positions = await traccarFetch<TraccarPosition[]>('positions')
    if (traccarConsecutiveFailures >= 4) {
      console.log(`[bridge] ✅ Traccar API is reachable again after ${traccarConsecutiveFailures} failures`)
    }
    traccarConsecutiveFailures = 0
    return positions
  } catch (err: any) {
    traccarConsecutiveFailures++
    if (traccarConsecutiveFailures <= 3) {
      console.error(`[bridge] Failed to fetch positions from Traccar: ${err.message}`)
    } else if (traccarConsecutiveFailures === 4) {
      console.error(`[bridge] Traccar API unreachable for ${traccarConsecutiveFailures} consecutive polls — suppressing further errors`)
    }
    return []
  }
}

/**
 * Fetch all devices from Traccar to build an IMEI → Traccar deviceId cache.
 */
async function fetchDevices(): Promise<TraccarDevice[]> {
  try {
    return await traccarFetch<TraccarDevice[]>('devices?all=true')
  } catch (err: any) {
    console.error(`[bridge] Failed to fetch devices from Traccar: ${err.message}`)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════
// Forwarder: Traccar position → Volkern vehicle-poll
// ═══════════════════════════════════════════════════════════════

/**
 * Forward a single position to Volkern.
 * Maps Traccar deviceId → Volkern gpsDeviceId via the device mapping and device cache.
 */
async function forwardPosition(
  position: TraccarPosition,
  mapping: DeviceMapping,
  deviceCache: Map<number, TraccarDevice>,
): Promise<{ success: boolean; deviceKey?: string; error?: string }> {
  // Look up the Traccar device to get its uniqueId (IMEI)
  const device = deviceCache.get(position.deviceId)
  if (!device) {
    return { success: false, error: `Traccar device ${position.deviceId} not found in device cache` }
  }

  // Map IMEI → Volkern gpsDeviceId
  const deviceKey = mapping[device.uniqueId]
  if (!deviceKey) {
    return { success: false, error: `IMEI ${device.uniqueId} not found in mapping file (device: ${device.name})` }
  }

  // Build the payload for Volkern's vehicle-poll endpoint
  const payload = {
    deviceKey,
    latitude: position.latitude,
    longitude: position.longitude,
    timestamp: position.fixTime || position.deviceTime || new Date().toISOString(),
    speed: position.speed ? Math.round(position.speed * 1.852) : undefined, // knots → km/h
    heading: position.course || undefined,
    altitude: position.altitude || undefined,
    accuracy: position.accuracy || undefined,
    // Extract cargoTemp from Traccar attributes if available
    cargoTemp: position.attributes?.['cargoTemp']
      ?? position.attributes?.['temperature']
      ?? position.attributes?.['temp']
      ?? undefined,
  }

  try {
    const res = await fetch(VEHICLE_POLL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.text()
      return { success: false, deviceKey, error: `Volkern responded ${res.status}: ${body}` }
    }

    const data = await res.json()
    return { success: true, deviceKey }
  } catch (err: any) {
    return { success: false, deviceKey, error: err.message }
  }
}

// ═══════════════════════════════════════════════════════════════
// Main poll cycle
// ═══════════════════════════════════════════════════════════════

async function pollOnce(mapping: DeviceMapping, deviceCache: Map<number, TraccarDevice>, stats: BridgeStats) {
  const startTime = Date.now()
  stats.totalPolls++

  // Fetch latest positions
  const positions = await fetchLatestPositions()

  if (positions.length === 0) {
    console.log(`[bridge] No positions returned from Traccar (or connection failed)`)
    stats.lastPoll = new Date().toISOString()
    return
  }

  console.log(`[bridge] Fetched ${positions.length} position(s) from Traccar`)

  // Forward each position
  let successCount = 0
  for (const pos of positions) {
    const result = await forwardPosition(pos, mapping, deviceCache)
    if (result.success) {
      successCount++
      stats.successfulForwards++
      console.log(`[bridge]   ✅ ${result.deviceKey}: forwarded (lat=${pos.latitude.toFixed(5)}, lng=${pos.longitude.toFixed(5)}, speed=${pos.speed ? Math.round(pos.speed * 1.852) : '?'} km/h)`)
    } else {
      stats.failedForwards++
      console.log(`[bridge]   ⚠️  ${result.deviceKey || `deviceId=${pos.deviceId}`}: ${result.error}`)
    }
  }

  stats.lastPoll = new Date().toISOString()
  const elapsed = Date.now() - startTime
  console.log(`[bridge] Poll complete: ${successCount}/${positions.length} forwarded in ${elapsed}ms`)
}

/**
 * Build a cache of Traccar deviceId → device info for IMEI lookups.
 */
async function buildDeviceCache(): Promise<Map<number, TraccarDevice>> {
  const devices = await fetchDevices()
  const cache = new Map<number, TraccarDevice>()
  for (const d of devices) {
    cache.set(d.id, d)
  }
  if (cache.size === 0) {
    console.warn(`[bridge] ⚠️  WARNING: 0 devices found in Traccar — is Traccar configured correctly? Do GPS devices have connectivity?`)
  } else {
    console.log(`[bridge] Device cache built: ${cache.size} device(s) from Traccar`)
  }
  return cache
}

// ═══════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════

async function main() {
  const { mode, interval, mappingPath } = parseArgs()

  console.log(`[bridge] Traccar Bridge → Volkern GPS`)
  console.log(`[bridge] Traccar: ${TRACCAR_URL} (user: ${TRACCAR_EMAIL})  |  Volkern: ${VOLKERN_URL}`)
  console.log(`[bridge] Mode: ${mode}  |  Interval: ${interval}s  |  Mapping: ${mappingPath}`)
  console.log(`[bridge] ─────────────────────────────────────────────`)

  // Load device IMEI → gpsDeviceId mapping
  const mapping = loadMapping(mappingPath)

  // Build Traccar device cache (id → IMEI)
  const deviceCache = await buildDeviceCache()

  const stats: BridgeStats = {
    started: new Date().toISOString(),
    totalPolls: 0,
    successfulForwards: 0,
    failedForwards: 0,
    lastPoll: null,
    lastError: null,
  }

  // Poll loop
  while (true) {
    try {
      await pollOnce(mapping, deviceCache, stats)
    } catch (err: any) {
      stats.lastError = err.message
      console.error(`[bridge] Poll error: ${err.message}`)
    }

    if (mode === 'once') break

    // Refresh device cache every 5 minutes (300s / interval)
    if (stats.totalPolls % Math.ceil(300 / interval) === 0) {
      const freshCache = await buildDeviceCache()
      deviceCache.clear()
      freshCache.forEach((device, id) => deviceCache.set(id, device))
    }

    await sleep(interval * 1000)
  }

  console.log(`[bridge] ─────────────────────────────────────────────`)
  console.log(`[bridge] Summary: ${stats.successfulForwards} forwarded, ${stats.failedForwards} failed (${stats.totalPolls} polls)`)
  console.log(`[bridge] Done.`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch((err) => {
  console.error(`[bridge] Fatal error: ${err.message}`)
  process.exit(1)
})
