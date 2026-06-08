import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ═══════════════════════════════════════════════════════════════
// Test setup — isolated temp directory per test suite
// ═══════════════════════════════════════════════════════════════

const TMP_DIR = path.join(os.tmpdir(), `volkern-gps-mapping-test-${Date.now()}`)
const MAPPING_FILE = path.join(TMP_DIR, 'traccar-device-mapping.json')

function setTestMappingPath() {
  process.env.GPS_MAPPING_PATH = MAPPING_FILE
}

function resetMappingFile() {
  if (fs.existsSync(MAPPING_FILE)) {
    fs.unlinkSync(MAPPING_FILE)
  }
  // Also clean up any stale .lock file
  const lockFile = MAPPING_FILE + '.lock'
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile)
  }
}

function writeMappingFileRaw(content: string) {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true })
  }
  fs.writeFileSync(MAPPING_FILE, content, 'utf-8')
}

beforeEach(() => {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true })
  }
  resetMappingFile()
  setTestMappingPath()
})

afterEach(() => {
  resetMappingFile()
})

afterAll(() => {
  resetMappingFile()
  try {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true })
    }
  } catch {
    // Ignore cleanup errors
  }
})

// Dynamic import so GPS_MAPPING_PATH is set before module loads getMappingPath()
async function loadService() {
  // Clear vitest module cache so the module re-evaluates with fresh env vars
  vi.resetModules()
  return await import('@/lib/erp/gps-mapping-service')
}

// ═══════════════════════════════════════════════════════════════
// Tests: listMappings
// ═══════════════════════════════════════════════════════════════

describe('listMappings', () => {
  it('devuelve array vacío si no existe el archivo', async () => {
    const { listMappings } = await loadService()
    const result = await listMappings()
    expect(result).toEqual([])
  })

  it('devuelve array vacío si el archivo está vacío', async () => {
    writeMappingFileRaw('')
    const { listMappings } = await loadService()
    const result = await listMappings()
    expect(result).toEqual([])
  })

  it('devuelve array vacío si el archivo es un objeto JSON vacío', async () => {
    writeMappingFileRaw('{}')
    const { listMappings } = await loadService()
    const result = await listMappings()
    expect(result).toEqual([])
  })

  it('devuelve un mapeo simple', async () => {
    writeMappingFileRaw(JSON.stringify({ 'IMEI-001': 'VK-GPS-ABC123-X7K2' }))
    const { listMappings } = await loadService()
    const result = await listMappings()
    expect(result).toEqual([
      { imei: 'IMEI-001', gpsDeviceId: 'VK-GPS-ABC123-X7K2' },
    ])
  })

  it('devuelve múltiples mapeos', async () => {
    writeMappingFileRaw(JSON.stringify({
      'IMEI-A': 'VK-GPS-1111A-AAAA',
      'IMEI-B': 'VK-GPS-2222B-BBBB',
      'IMEI-C': 'VK-GPS-3333C-CCCC',
    }))
    const { listMappings } = await loadService()
    const result = await listMappings()
    expect(result).toHaveLength(3)
    expect(result.map(r => r.imei).sort()).toEqual(['IMEI-A', 'IMEI-B', 'IMEI-C'])
  })

  it('lanza error si el archivo contiene un array en vez de objeto', async () => {
    writeMappingFileRaw('["not", "an", "object"]')
    const { listMappings } = await loadService()
    await expect(listMappings()).rejects.toThrow('Mapping file must be a JSON object')
  })

  it('lanza error si el archivo contiene valores no-string', async () => {
    writeMappingFileRaw(JSON.stringify({ 'IMEI-001': 12345 }))
    const { listMappings } = await loadService()
    await expect(listMappings()).rejects.toThrow('Invalid mapping entry')
  })

  it('lanza error si el JSON está malformado', async () => {
    writeMappingFileRaw('{ broken json ')
    const { listMappings } = await loadService()
    await expect(listMappings()).rejects.toThrow('Failed to parse mapping file')
  })
})

// ═══════════════════════════════════════════════════════════════
// Tests: getMapping
// ═══════════════════════════════════════════════════════════════

describe('getMapping', () => {
  it('devuelve null si el IMEI no existe', async () => {
    writeMappingFileRaw(JSON.stringify({ 'OTHER': 'VK-GPS-XXX00-YYYY' }))
    const { getMapping } = await loadService()
    const result = await getMapping('NONEXISTENT')
    expect(result).toBeNull()
  })

  it('devuelve null si el archivo no existe', async () => {
    const { getMapping } = await loadService()
    const result = await getMapping('ANYTHING')
    expect(result).toBeNull()
  })

  it('devuelve el entry correcto para un IMEI existente', async () => {
    writeMappingFileRaw(JSON.stringify({ 'IMEI-007': 'VK-GPS-BOND7-JB00' }))
    const { getMapping } = await loadService()
    const result = await getMapping('IMEI-007')
    expect(result).toEqual({ imei: 'IMEI-007', gpsDeviceId: 'VK-GPS-BOND7-JB00' })
  })
})

// ═══════════════════════════════════════════════════════════════
// Tests: upsertMapping
// ═══════════════════════════════════════════════════════════════

describe('upsertMapping', () => {
  it('crea un nuevo mapeo y devuelve created=true', async () => {
    const { upsertMapping } = await loadService()
    const result = await upsertMapping({
      imei: 'IMEI-NEW',
      gpsDeviceId: 'VK-GPS-NEW01-XXXX',
    })
    expect(result.imei).toBe('IMEI-NEW')
    expect(result.gpsDeviceId).toBe('VK-GPS-NEW01-XXXX')
    expect(result.created).toBe(true)

    // Verificar que se persistió en disco
    const raw = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
    expect(raw['IMEI-NEW']).toBe('VK-GPS-NEW01-XXXX')
  })

  it('actualiza un mapeo existente y devuelve created=false', async () => {
    writeMappingFileRaw(JSON.stringify({ 'IMEI-EXISTING': 'VK-GPS-OLD00-YYYY' }))
    const { upsertMapping } = await loadService()

    const result = await upsertMapping({
      imei: 'IMEI-EXISTING',
      gpsDeviceId: 'VK-GPS-NEW11-ZZZZ',
    })
    expect(result.created).toBe(false)
    expect(result.gpsDeviceId).toBe('VK-GPS-NEW11-ZZZZ')

    const raw = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
    expect(raw['IMEI-EXISTING']).toBe('VK-GPS-NEW11-ZZZZ')
  })

  it('lanza error si IMEI es vacío', async () => {
    const { upsertMapping } = await loadService()
    await expect(upsertMapping({ imei: '', gpsDeviceId: 'VK-GPS-XXX00-YYYY' }))
      .rejects.toThrow('IMEI is required')
  })

  it('lanza error si IMEI son solo espacios', async () => {
    const { upsertMapping } = await loadService()
    await expect(upsertMapping({ imei: '   ', gpsDeviceId: 'VK-GPS-XXX00-YYYY' }))
      .rejects.toThrow('IMEI is required')
  })

  it('lanza error si gpsDeviceId es vacío', async () => {
    const { upsertMapping } = await loadService()
    await expect(upsertMapping({ imei: 'IMEI-001', gpsDeviceId: '' }))
      .rejects.toThrow('gpsDeviceId is required')
  })

  it('lanza error si gpsDeviceId no cumple el formato VK-GPS-...', async () => {
    const { upsertMapping } = await loadService()
    await expect(upsertMapping({ imei: 'IMEI-001', gpsDeviceId: 'INVALID-FORMAT' }))
      .rejects.toThrow('gpsDeviceId must match format VK-GPS-XXXXX-XXXX')
  })

  it('lanza error si gpsDeviceId le falta un segmento', async () => {
    const { upsertMapping } = await loadService()
    await expect(upsertMapping({ imei: 'IMEI-001', gpsDeviceId: 'VK-GPS-SINGLESEGMENT' }))
      .rejects.toThrow('gpsDeviceId must match format VK-GPS-XXXXX-XXXX')
  })

  it('lanza error si gpsDeviceId tiene minúsculas (la validación es case-sensitive con regex)', async () => {
    const { upsertMapping } = await loadService()
    await expect(upsertMapping({ imei: 'IMEI-001', gpsDeviceId: 'vk-gps-lower-case' }))
      .rejects.toThrow('gpsDeviceId must match format VK-GPS-XXXXX-XXXX')
  })

  it('permite gpsDeviceId con segmentos de una sola letra', async () => {
    const { upsertMapping } = await loadService()
    const result = await upsertMapping({ imei: 'IMEI-001', gpsDeviceId: 'VK-GPS-A-B' })
    expect(result.created).toBe(true)
  })

  it('permite gpsDeviceId con números en los segmentos', async () => {
    const { upsertMapping } = await loadService()
    const result = await upsertMapping({ imei: 'IMEI-001', gpsDeviceId: 'VK-GPS-12345-67890' })
    expect(result.created).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// Tests: deleteMapping
// ═══════════════════════════════════════════════════════════════

describe('deleteMapping', () => {
  it('elimina un mapeo existente y devuelve el entry eliminado', async () => {
    writeMappingFileRaw(JSON.stringify({
      'IMEI-A': 'VK-GPS-AAAAA-BBBB',
      'IMEI-B': 'VK-GPS-CCCCC-DDDD',
    }))
    const { deleteMapping } = await loadService()

    const result = await deleteMapping('IMEI-A')
    expect(result).toEqual({ imei: 'IMEI-A', gpsDeviceId: 'VK-GPS-AAAAA-BBBB' })

    // Verificar disco: IMEI-A ya no existe, IMEI-B sigue
    const raw = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
    expect(raw['IMEI-A']).toBeUndefined()
    expect(raw['IMEI-B']).toBe('VK-GPS-CCCCC-DDDD')
  })

  it('devuelve null si el IMEI no existe', async () => {
    writeMappingFileRaw(JSON.stringify({ 'ONLY': 'VK-GPS-11111-2222' }))
    const { deleteMapping } = await loadService()

    const result = await deleteMapping('NONEXISTENT')
    expect(result).toBeNull()

    // Archivo intacto
    const raw = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
    expect(raw['ONLY']).toBe('VK-GPS-11111-2222')
  })

  it('devuelve null si el archivo no existe', async () => {
    const { deleteMapping } = await loadService()
    const result = await deleteMapping('ANYTHING')
    expect(result).toBeNull()
  })

  it('lanza error si IMEI es vacío', async () => {
    const { deleteMapping } = await loadService()
    await expect(deleteMapping('')).rejects.toThrow('IMEI is required')
  })

  it('elimina el último mapeo y deja el archivo como objeto vacío', async () => {
    writeMappingFileRaw(JSON.stringify({ 'LAST': 'VK-GPS-LAST0-LAST' }))
    const { deleteMapping } = await loadService()

    await deleteMapping('LAST')
    const raw = fs.readFileSync(MAPPING_FILE, 'utf-8')
    expect(JSON.parse(raw)).toEqual({})
  })
})

// ═══════════════════════════════════════════════════════════════
// Tests: replaceAllMappings
// ═══════════════════════════════════════════════════════════════

describe('replaceAllMappings', () => {
  it('reemplaza todos los mapeos (bulk)', async () => {
    writeMappingFileRaw(JSON.stringify({
      'OLD-1': 'VK-GPS-OLDA1-XXXX',
      'OLD-2': 'VK-GPS-OLDB2-YYYY',
    }))
    const { replaceAllMappings } = await loadService()

    const result = await replaceAllMappings([
      { imei: 'NEW-1', gpsDeviceId: 'VK-GPS-NEWA1-ZZZZ' },
      { imei: 'NEW-2', gpsDeviceId: 'VK-GPS-NEWB2-WWWW' },
      { imei: 'NEW-3', gpsDeviceId: 'VK-GPS-NEWC3-VVVV' },
    ])
    expect(result.count).toBe(3)

    const raw = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
    expect(Object.keys(raw)).toHaveLength(3)
    expect(raw['OLD-1']).toBeUndefined()
    expect(raw['NEW-1']).toBe('VK-GPS-NEWA1-ZZZZ')
  })

  it('acepta array vacío (borra todos los mapeos)', async () => {
    writeMappingFileRaw(JSON.stringify({ 'REMOVE-ME': 'VK-GPS-RM001-XXXX' }))
    const { replaceAllMappings } = await loadService()

    const result = await replaceAllMappings([])
    expect(result.count).toBe(0)

    const raw = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
    expect(raw).toEqual({})
  })

  it('lanza error si una entrada no tiene imei', async () => {
    const { replaceAllMappings } = await loadService()
    await expect(replaceAllMappings([
      { imei: 'VALID', gpsDeviceId: 'VK-GPS-VAL00-ID00' },
      { imei: '', gpsDeviceId: 'VK-GPS-EMPT1-YYYY' },
    ])).rejects.toThrow('Invalid entry: both imei and gpsDeviceId are required')
  })

  it('lanza error si una entrada tiene formato inválido', async () => {
    const { replaceAllMappings } = await loadService()
    await expect(replaceAllMappings([
      { imei: 'VALID', gpsDeviceId: 'VK-GPS-VAL00-ID00' },
      { imei: 'BAD', gpsDeviceId: 'NOT-VALID' },
    ])).rejects.toThrow('Invalid gpsDeviceId format')
  })

  it('es atómico: si falla una entrada, no se escribe nada', async () => {
    writeMappingFileRaw(JSON.stringify({ 'EXISTING': 'VK-GPS-EXIS1-XXXX' }))
    const { replaceAllMappings } = await loadService()

    await expect(replaceAllMappings([
      { imei: 'GOOD', gpsDeviceId: 'VK-GPS-GOOD1-YYYY' },
      { imei: 'BAD', gpsDeviceId: 'INVALID' },
    ])).rejects.toThrow('Invalid gpsDeviceId format')

    // Archivo original intacto
    const raw = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
    expect(raw['EXISTING']).toBe('VK-GPS-EXIS1-XXXX')
    expect(raw['GOOD']).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════
// Tests: getMappingCount
// ═══════════════════════════════════════════════════════════════

describe('getMappingCount', () => {
  it('devuelve 0 si no hay archivo', async () => {
    const { getMappingCount } = await loadService()
    const count = await getMappingCount()
    expect(count).toBe(0)
  })

  it('devuelve 0 si el archivo está vacío', async () => {
    writeMappingFileRaw('{}')
    const { getMappingCount } = await loadService()
    const count = await getMappingCount()
    expect(count).toBe(0)
  })

  it('devuelve el número correcto de mapeos', async () => {
    writeMappingFileRaw(JSON.stringify({
      'A': 'VK-GPS-AAAA1-AAAA',
      'B': 'VK-GPS-BBBB2-BBBB',
      'C': 'VK-GPS-CCCC3-CCCC',
      'D': 'VK-GPS-DDDD4-DDDD',
    }))
    const { getMappingCount } = await loadService()
    const count = await getMappingCount()
    expect(count).toBe(4)
  })
})

// ═══════════════════════════════════════════════════════════════
// Tests: Round-trip persistence
// ═══════════════════════════════════════════════════════════════

describe('persistencia', () => {
  it('crear → listar → eliminar → listar: ciclo completo', async () => {
    const { upsertMapping, listMappings, deleteMapping, getMappingCount } = await loadService()

    // Crear 2 mapeos
    await upsertMapping({ imei: 'DEV-1', gpsDeviceId: 'VK-GPS-DEV01-AAAA' })
    await upsertMapping({ imei: 'DEV-2', gpsDeviceId: 'VK-GPS-DEV02-BBBB' })

    expect(await getMappingCount()).toBe(2)

    // Listar
    const list1 = await listMappings()
    expect(list1).toHaveLength(2)

    // Eliminar uno
    await deleteMapping('DEV-1')
    expect(await getMappingCount()).toBe(1)

    // Listar de nuevo
    const list2 = await listMappings()
    expect(list2).toHaveLength(1)
    expect(list2[0].imei).toBe('DEV-2')
  })

  it('los datos persisten tras reimportar el módulo', async () => {
    const m1 = await loadService()
    await m1.upsertMapping({ imei: 'PERSIST', gpsDeviceId: 'VK-GPS-PERS1-ST00' })

    // Reimportar (simula reinicio del proceso)
    const m2 = await loadService()
    const result = await m2.getMapping('PERSIST')
    expect(result).toEqual({ imei: 'PERSIST', gpsDeviceId: 'VK-GPS-PERS1-ST00' })
  })
})

// ═══════════════════════════════════════════════════════════════
// Tests: File locking
// ═══════════════════════════════════════════════════════════════

describe('file locking', () => {
  it('crea y libera el lock file durante upsert', async () => {
    const { upsertMapping } = await loadService()
    const lockFile = MAPPING_FILE + '.lock'

    expect(fs.existsSync(lockFile)).toBe(false)

    await upsertMapping({ imei: 'LOCK-TEST', gpsDeviceId: 'VK-GPS-LOCK0-TEST' })

    // Lock file debe haberse liberado
    expect(fs.existsSync(lockFile)).toBe(false)
  })

  it('recupera de un lock stale (>30s)', { timeout: 15000 }, async () => {
    // Simular un lock stale manualmente
    const lockFile = MAPPING_FILE + '.lock'
    fs.writeFileSync(lockFile, String(process.pid), 'utf-8')

    // Forzar mtime a hace 60s
    const staleTime = new Date(Date.now() - 60000)
    fs.utimesSync(lockFile, staleTime, staleTime)

    const { upsertMapping } = await loadService()

    // Debe funcionar — el lock stale se limpia automáticamente
    const result = await upsertMapping({ imei: 'STALE-RECOVER', gpsDeviceId: 'VK-GPS-STAL1-RECV' })
    expect(result.created).toBe(true)
    expect(fs.existsSync(lockFile)).toBe(false)
  })

  it('lanza error si el lock está activo y no es stale', { timeout: 15000 }, async () => {
    // Simular un lock activo (fresco)
    const lockFile = MAPPING_FILE + '.lock'
    fs.writeFileSync(lockFile, String(process.pid), 'utf-8')

    const { upsertMapping } = await loadService()

    // Debe fallar: el lock existe y no es stale (<30s)
    await expect(upsertMapping({ imei: 'BLOCKED', gpsDeviceId: 'VK-GPS-BLCK1-XXXX' }))
      .rejects.toThrow('Could not acquire mapping file lock')
  })
})

// ═══════════════════════════════════════════════════════════════
// Tests: Edge cases — whitespace, special chars, unicode
// ═══════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('maneja IMEI con caracteres especiales', async () => {
    const { upsertMapping, getMapping } = await loadService()
    const specialImei = 'IMEI-αβγ-测试'
    await upsertMapping({ imei: specialImei, gpsDeviceId: 'VK-GPS-SPEC1-XXXX' })
    const result = await getMapping(specialImei)
    expect(result).toEqual({ imei: specialImei, gpsDeviceId: 'VK-GPS-SPEC1-XXXX' })
  })

  it('archivo con solo whitespace es tratado como vacío', async () => {
    writeMappingFileRaw('   \n  \t  ')
    const { listMappings } = await loadService()
    const result = await listMappings()
    expect(result).toEqual([])
  })

  it('formatea el JSON de salida con indentación', async () => {
    const { upsertMapping } = await loadService()
    await upsertMapping({ imei: 'FMT', gpsDeviceId: 'VK-GPS-FMT01-TEST' })

    const raw = fs.readFileSync(MAPPING_FILE, 'utf-8')
    // Debe tener indentación (2 espacios) y newline final
    expect(raw).toContain('\n  ')
    expect(raw.endsWith('\n')).toBe(true)
  })
})
