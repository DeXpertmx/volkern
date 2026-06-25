/**
 * PII Filter — Sanitizador de Datos Personales
 * 
 * Reemplaza información personal (nombres, emails, teléfonos, direcciones)
 * por placeholders antes de enviar a APIs externas (DeepSeek/OpenRouter).
 * 
 * Uso:
 *   const filter = new PiiFilter()
 *   const sanitized = filter.sanitize("Registra a Juan López, email juan@email.com")
 *   // → "Registra a [NOMBRE_1], email [EMAIL_1]"
 *   const mapped = filter.restoreParams({ nombre: "[NOMBRE_1]", email: "[EMAIL_1]" })
 *   // → { nombre: "Juan López", email: "juan@email.com" }
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PiiType = 'EMAIL' | 'PHONE' | 'NAME' | 'URL' | 'ADDRESS' | 'CIF' | 'DNI'

export interface PiiMatch {
  type: PiiType
  original: string
  placeholder: string
}

// ─── Patrones de detección ───────────────────────────────────────────────────

// Patrones ordenados por especificidad (los más específicos primero)
const PII_PATTERNS: { type: PiiType; pattern: RegExp }[] = [
  // Emails
  { type: 'EMAIL', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  
  // Teléfonos: +34 612345678, 612345678, +52 55 1234 5678
  { type: 'PHONE', pattern: /(?:\+\d{1,3}[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}(?:[\s-]?\d{2,4})?/g },
  
  // URLs
  { type: 'URL', pattern: /https?:\/\/[^\s,;)]+/g },
  
  // CIF/NIF español (solo si tiene formato válido)
  { type: 'CIF', pattern: /\b[ABCDEFGHJKLMNPQRSUVW]\d{7}[A-Z0-9]\b/g },
  
  // DNI español
  { type: 'DNI', pattern: /\b\d{8}[A-Z]\b/g },
]

// Palabras clave que indican que lo que sigue es un nombre propio
const NAME_TRIGGERS = [
  'registra', 'crea', 'nuevo', 'nueva', 'contacto', 'lead', 'cliente',
  'llama', 'llamar', 'busca', 'buscar', 'agenda', 'agendar', 'actualiza',
  'actualizar', 'modifica', 'modificar', 'llamado', 'llamada',
  'nombre', 'llamase', 'llamado',
  // Verbos y contextos de agendamiento
  'cita', 'reuni.n', 'reunion', 'meeting',
  // Preposiciones que introducen nombres
  'con', 'para', 'de', 'del',
]

// Palabras que suelen preceder direcciones
const ADDRESS_TRIGGERS = [
  'calle', 'av', 'avenida', 'bulevar', 'blvd', 'plaza', 'paseo',
  'carretera', 'camino', 'colonia', 'fraccionamiento', 'urbanizacion',
  'edificio', 'domicilio', 'direccion', 'vive en', 'reside en',
]

// ─── Servicio ─────────────────────────────────────────────────────────────────

export class PiiFilter {
  private matches: PiiMatch[] = []
  private counters: Record<PiiType, number> = {
    EMAIL: 0, PHONE: 0, NAME: 0, URL: 0, ADDRESS: 0, CIF: 0, DNI: 0,
  }

  /**
   * Sanitiza un texto reemplazando PII por placeholders.
   * Almacena internamente el mapeo para poder restaurarlo después.
   */
  sanitize(text: string): string {
    this.matches = []
    this.counters = { EMAIL: 0, PHONE: 0, NAME: 0, URL: 0, ADDRESS: 0, CIF: 0, DNI: 0 }

    let result = text

    // 1. Detectar y reemplazar patrones estructurados (emails, teléfonos, URLs, CIF, DNI)
    for (const { type, pattern } of PII_PATTERNS) {
      result = result.replace(pattern, (match) => {
        this.counters[type]++
        const placeholder = `[${type}_${this.counters[type]}]`
        this.matches.push({ type, original: match, placeholder })
        return placeholder
      })
    }

    // 2. Detectar nombres después de palabras clave
    const nameAfterTrigger = new RegExp(
      `(?:${NAME_TRIGGERS.join('|')})\\s+(?:a\\s+|al\\s+|el\\s+|la\\s+|un\\s+|una\\s+|nuev[oa]\\s+)?` +
      `([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})`,
      'gi'
    )
    
    // Aplicar varias pasadas porque después del primer reemplazo cambia el texto
    for (let i = 0; i < 3; i++) {
      result = result.replace(nameAfterTrigger, (match, name) => {
        if (/^\[/.test(name) || /^\[/.test(match)) return match
        this.counters.NAME++
        const placeholder = `[NOMBRE_${this.counters.NAME}]`
        this.matches.push({ type: 'NAME', original: name, placeholder })
        return match.replace(name, placeholder)
      })
    }

    // 3. Detectar direcciones
    for (const trigger of ADDRESS_TRIGGERS) {
      const addrPattern = new RegExp(
        `(${trigger}\\s+[^,;]+(?:,?\\s*\\d+)?(?:\\s*,\\s*\\d{5})?)`,
        'gi'
      )
      result = result.replace(addrPattern, (match) => {
        if (/^\[/.test(match)) return match
        this.counters.ADDRESS++
        const placeholder = `[DIRECCION_${this.counters.ADDRESS}]`
        this.matches.push({ type: 'ADDRESS', original: match, placeholder })
        return placeholder
      })
    }

    return result
  }

  /**
   * Restaura los placeholders en un texto.
   */
  restore(text: string): string {
    let result = text
    const sorted = [...this.matches].sort(
      (a, b) => b.placeholder.length - a.placeholder.length
    )
    for (const match of sorted) {
      result = result.split(match.placeholder).join(match.original)
    }
    return result
  }

  /**
   * Restaura placeholders en un objeto de parámetros (recursivo).
   * Soporta objetos anidados.
   */
  restoreParams<T extends Record<string, any>>(params: T): T {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        result[key] = this.restore(value)
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.restoreParams(value as Record<string, any>)
      } else if (Array.isArray(value)) {
        result[key] = value.map((item: any) =>
          typeof item === 'string' ? this.restore(item) : item
        )
      } else {
        result[key] = value
      }
    }
    return result as T
  }

  /**
   * Obtiene todos los matches encontrados en la última sanitización.
   */
  getMatches(): PiiMatch[] {
    return [...this.matches]
  }

  /**
   * Obtiene un resumen de los tipos de datos sanitizados.
   */
  getSummary(): string {
    const types = Object.entries(this.counters)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => `${count} ${type}`)
    return types.length > 0 ? types.join(', ') : 'Ninguno'
  }
}

// ─── Helper: sanitizar, ejecutar y restaurar en un solo paso ──────────────

export async function withPiiFilter<T>(
  message: string,
  fn: (sanitized: string, filter: PiiFilter) => Promise<T>
): Promise<{ result: T; filter: PiiFilter; sanitizedMessage: string }> {
  const filter = new PiiFilter()
  const sanitizedMessage = filter.sanitize(message)
  const result = await fn(sanitizedMessage, filter)
  return { result, filter, sanitizedMessage }
}
