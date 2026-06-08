import * as fs from 'fs'
import * as path from 'path'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface GpsDeviceEntry {
  /** IMEI or device identifier from Traccar */
  imei: string
  /** Volkern gpsDeviceId (VK-GPS-MATRICULA-XXXX) */
  gpsDeviceId: string
}

export interface DeviceMapping {
  [imei: string]: string
}

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

const DEFAULT_MAPPING_PATH = path.resolve(process.cwd(), 'traccar-device-mapping.json')

function getMappingPath(): string {
  // Allow override via env var for Docker/non-standard setups
  return process.env.GPS_MAPPING_PATH || DEFAULT_MAPPING_PATH
}

// ═══════════════════════════════════════════════════════════════
// File I/O with advisory file locking (JSON-based)
// ═══════════════════════════════════════════════════════════════

const LOCK_FILE_SUFFIX = '.lock'
const MAX_LOCK_WAIT_MS = 10000 // 10s max wait
const LOCK_RETRY_MS = 100       // poll every 100ms

/**
 * Acquire an advisory lock by creating a .lock file.
 * This is NOT atomic on all filesystems but is sufficient for low-concurrency scenarios.
 */
async function acquireLock(filePath: string): Promise<() => void> {
  const lockPath = filePath + LOCK_FILE_SUFFIX
  const startedAt = Date.now()

  while (Date.now() - startedAt < MAX_LOCK_WAIT_MS) {
    try {
      // O_CREAT | O_EXCL — fails if file already exists (atomic on POSIX)
      const fd = fs.openSync(lockPath, 'wx')
      fs.writeSync(fd, String(process.pid))
      fs.closeSync(fd)
      return () => {
        try {
          fs.unlinkSync(lockPath)
        } catch {
          // Ignore — lock may have been removed already
        }
      }
    } catch {
      // File exists — wait and retry
      await sleep(LOCK_RETRY_MS)
    }
  }

  // Timeout — force-clean stale lock and retry once
  if (fs.existsSync(lockPath)) {
    try {
      const lockAge = Date.now() - fs.statSync(lockPath).mtimeMs
      if (lockAge > 30000) {
        // Lock is older than 30s, assume stale
        fs.unlinkSync(lockPath)
        const fd = fs.openSync(lockPath, 'wx')
        fs.writeSync(fd, String(process.pid))
        fs.closeSync(fd)
        return () => {
          try { fs.unlinkSync(lockPath) } catch {}
        }
      }
    } catch {}
  }

  throw new Error('Could not acquire mapping file lock — another operation is in progress')
}

/**
 * Read the raw mapping file.
 */
function readMappingFile(filePath: string): DeviceMapping {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim()
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Mapping file must be a JSON object')
    }
    // Validate all values are strings
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        throw new Error(`Invalid mapping entry: key "${key}" has non-string value`)
      }
    }
    return parsed as DeviceMapping
  } catch (err: any) {
    if (err.message?.includes('Mapping file') || err.message?.includes('Invalid mapping')) {
      throw err
    }
    throw new Error(`Failed to parse mapping file: ${err.message}`)
  }
}

/**
 * Write the mapping file (inside a lock).
 */
function writeMappingFile(filePath: string, mapping: DeviceMapping): void {
  // Ensure directory exists
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Atomic write: write to temp file then rename
  const tmpPath = filePath + '.tmp.' + Date.now()
  fs.writeFileSync(tmpPath, JSON.stringify(mapping, null, 2) + '\n', 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * List all device mappings as an array of GpsDeviceEntry.
 */
export async function listMappings(): Promise<GpsDeviceEntry[]> {
  const filePath = getMappingPath()
  const mapping = readMappingFile(filePath)

  return Object.entries(mapping).map(([imei, gpsDeviceId]) => ({
    imei,
    gpsDeviceId,
  }))
}

/**
 * Get a single mapping by IMEI.
 */
export async function getMapping(imei: string): Promise<GpsDeviceEntry | null> {
  const filePath = getMappingPath()
  const mapping = readMappingFile(filePath)

  const gpsDeviceId = mapping[imei]
  if (!gpsDeviceId) return null

  return { imei, gpsDeviceId }
}

/**
 * Add or update a device mapping.
 * - `imei`: The Traccar device IMEI/identifier
 * - `gpsDeviceId`: The Volkern gpsDeviceId (VK-GPS-XXXXX-XXXX)
 * - `label`: Optional display label
 * - `plate`: Optional vehicle plate
 */
export async function upsertMapping(entry: {
  imei: string
  gpsDeviceId: string
}): Promise<GpsDeviceEntry & { created: boolean }> {
  const { imei, gpsDeviceId } = entry

  // Validate format
  if (!imei || typeof imei !== 'string' || imei.trim().length === 0) {
    throw new Error('IMEI is required and must be a non-empty string')
  }
  if (!gpsDeviceId || typeof gpsDeviceId !== 'string' || gpsDeviceId.trim().length === 0) {
    throw new Error('gpsDeviceId is required and must be a non-empty string')
  }
  if (!gpsDeviceId.match(/^VK-GPS-[A-Z0-9]+-[A-Z0-9]+$/)) {
    throw new Error('gpsDeviceId must match format VK-GPS-XXXXX-XXXX')
  }

  const filePath = getMappingPath()
  const release = await acquireLock(filePath)

  try {
    const mapping = readMappingFile(filePath)
    const isUpdate = mapping[imei] !== undefined

    mapping[imei] = gpsDeviceId
    writeMappingFile(filePath, mapping)

    return {
      imei,
      gpsDeviceId,
      created: !isUpdate,
    }
  } finally {
    release()
  }
}

/**
 * Remove a device mapping by IMEI.
 * Returns the removed entry or null if it didn't exist.
 */
export async function deleteMapping(imei: string): Promise<GpsDeviceEntry | null> {
  if (!imei || typeof imei !== 'string' || imei.trim().length === 0) {
    throw new Error('IMEI is required and must be a non-empty string')
  }

  const filePath = getMappingPath()
  const release = await acquireLock(filePath)

  try {
    const mapping = readMappingFile(filePath)
    const previousValue = mapping[imei]

    if (!previousValue) return null

    delete mapping[imei]
    writeMappingFile(filePath, mapping)

    return { imei, gpsDeviceId: previousValue }
  } finally {
    release()
  }
}

/**
 * Replace the entire mapping file (bulk update).
 */
export async function replaceAllMappings(
  entries: Array<{ imei: string; gpsDeviceId: string }>,
): Promise<{ count: number }> {
  const filePath = getMappingPath()
  const release = await acquireLock(filePath)

  try {
    const newMapping: DeviceMapping = {}
    for (const entry of entries) {
      if (!entry.imei || !entry.gpsDeviceId) {
        throw new Error(`Invalid entry: both imei and gpsDeviceId are required`)
      }
      if (!entry.gpsDeviceId.match(/^VK-GPS-[A-Z0-9]+-[A-Z0-9]+$/)) {
        throw new Error(`Invalid gpsDeviceId format for IMEI ${entry.imei}: ${entry.gpsDeviceId}`)
      }
      newMapping[entry.imei] = entry.gpsDeviceId
    }

    writeMappingFile(filePath, newMapping)
    return { count: Object.keys(newMapping).length }
  } finally {
    release()
  }
}

/**
 * Get the total count of mapped devices.
 */
export async function getMappingCount(): Promise<number> {
  const filePath = getMappingPath()
  const mapping = readMappingFile(filePath)
  return Object.keys(mapping).length
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
