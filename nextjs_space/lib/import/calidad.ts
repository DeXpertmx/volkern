/**
 * Análisis de calidad de una importación, antes de escribir nada.
 *
 * Es la pieza que separa «subir un Excel» de «meter basura en el CRM». Todo lo
 * que decide aquí es **determinista**: comparación de cadenas, dígito de
 * control del NIF, formato de email, números y duplicados. No hay modelo de
 * lenguaje en esta ruta: un falso duplicado borra una venta real y el cliente
 * tiene derecho a que la decisión sea auditable y repetible.
 *
 * Lo que este módulo NO hace a propósito:
 *   - Fusionar registros por parecido. Los marca `posible_duplicado` y decide
 *     el cliente; por defecto esos no se escriben.
 *   - Consultar la base de datos. Recibe los existentes ya resueltos
 *     (`ExistentesImportacion`), así se puede probar sin Prisma.
 */

import type { ColumnMap, ImportRow, ImportType } from './import-types'
import { normalize } from './column-mapper'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type CodigoCalidad =
  | 'CAMPO_OBLIGATORIO'
  | 'EMAIL_INVALIDO'
  | 'NIF_INVALIDO'
  | 'PRECIO_INVALIDO'
  | 'SALDO_INVALIDO'
  | 'DUPLICADO_FICHERO'
  | 'POSIBLE_DUPLICADO'
  | 'CUENTA_DESCONOCIDA'

export type AccionFila = 'nueva' | 'actualizar' | 'rechazada' | 'posible_duplicado' | 'omitida'

export interface FilaCalidad {
  fila: number
  accion: AccionFila
  codigo: CodigoCalidad | null
  motivo: string | null
  /** Campos destino ya normalizados: es lo que se escribiría. */
  datos: Record<string, string>
  /** Fila original, para la cuarentena en CSV. */
  original: Record<string, string>
  /** Registro existente que se actualizaría. */
  existenteId?: string
  /** Nombre del registro al que se parece, si es posible duplicado. */
  sePareceA?: string
  /** Avisos que no bloquean la fila. */
  avisos: string[]
}

export interface InformeCalidad {
  tipo: ImportType
  total: number
  nuevas: number
  actualizadas: number
  rechazadas: number
  posiblesDuplicados: number
  omitidas: number
  /** Filas que se escribirían al confirmar (posibles duplicados solo si se piden). */
  aEscribir: number
  filas: FilaCalidad[]
  avisosGenerales: string[]
}

export interface ExistenteResumen {
  id: string
  nombre: string
}

export interface ExistentesImportacion {
  /** Clave: email normalizado. */
  porEmail?: Map<string, ExistenteResumen>
  /** Clave: NIF normalizado. */
  porNif?: Map<string, ExistenteResumen>
  /** Clave: nombre normalizado (catálogo). */
  porNombre?: Map<string, ExistenteResumen>
  /** Códigos de cuenta contable existentes. */
  cuentas?: Set<string>
}

export interface OpcionesAnalisis {
  tipo: ImportType
  filas: ImportRow[]
  mapping: ColumnMap[]
  existentes: ExistentesImportacion
  incluirPosiblesDuplicados?: boolean
  monedaTenant?: string
}

// ─── Normalización y validaciones ────────────────────────────────────────────

export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase()
}

export function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(normalizarEmail(valor))
}

export function normalizarNif(valor: string): string {
  return valor.toUpperCase().replace(/[\s.\-/]/g, '')
}

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'
const LETRAS_CIF = 'JABCDEFGHI'

/**
 * NIF/CIF español con dígito de control. Acepta DNI, NIE y CIF; cualquier otra
 * cosa (pasaporte, NIF extranjero) no se valida aquí: eso lo decide el país.
 */
export function esNifValido(valor: string): boolean {
  const nif = normalizarNif(valor)
  if (!/^[0-9A-Z]{9}$/.test(nif)) return false

  if (/^\d{8}[A-Z]$/.test(nif)) {
    return LETRAS_DNI[parseInt(nif.slice(0, 8), 10) % 23] === nif[8]
  }

  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) {
    const numero = nif.replace('X', '0').replace('Y', '1').replace('Z', '2').slice(0, 8)
    return LETRAS_DNI[parseInt(numero, 10) % 23] === nif[8]
  }

  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) {
    const cuerpo = nif.slice(1, 8)
    let suma = 0
    for (let i = 0; i < 7; i++) {
      const digito = parseInt(cuerpo[i], 10)
      if (i % 2 === 0) {
        const doble = digito * 2
        suma += Math.floor(doble / 10) + (doble % 10)
      } else {
        suma += digito
      }
    }
    const control = (10 - (suma % 10)) % 10
    const ultimo = nif[8]
    if ('ABEH'.includes(nif[0])) return ultimo === String(control)
    if ('KPQS'.includes(nif[0])) return ultimo === LETRAS_CIF[control]
    return ultimo === String(control) || ultimo === LETRAS_CIF[control]
  }

  return false
}

const PAISES_ES = new Set(['es', 'esp', 'espana', 'españa'])

export function esPaisEspanol(valor?: string): boolean {
  if (!valor) return true
  return PAISES_ES.has(valor.trim().toLowerCase())
}

const SUFIJOS_SOCIETARIOS = new Set([
  's', 'l', 'a', 'sl', 'sa', 'slu', 'sau', 'sll', 'sc', 'scoop', 'sociedad',
  'limitada', 'anonima', 'unipersonal', 'limited', 'ltd', 'gmbh', 'inc', 'llc',
  'corp', 'co', 'slne', 'cb', 'sat',
])

/** Nombre sin forma jurídica ni ruido, para comparar duplicados. */
export function normalizarNombre(valor: string): string {
  const tokens = normalize(valor).split('_').filter(Boolean)
  const significativos = tokens.filter((t) => !SUFIJOS_SOCIETARIOS.has(t))
  return (significativos.length > 0 ? significativos : tokens).join(' ')
}

/** Jaccard por palabras: 1 significa «mismas palabras», 0 ninguna en común. */
export function similitudNombres(a: string, b: string): number {
  const ka = new Set(normalizarNombre(a).split(' ').filter(Boolean))
  const kb = new Set(normalizarNombre(b).split(' ').filter(Boolean))
  if (ka.size === 0 || kb.size === 0) return 0
  let comunes = 0
  for (const token of ka) if (kb.has(token)) comunes++
  return comunes / (ka.size + kb.size - comunes)
}

function parseNumero(valor: string): number {
  return Number.parseFloat(valor.replace(/\s/g, '').replace(',', '.'))
}

/** Campos destino de la fila, ya recortados y sin las columnas ignoradas. */
function camposDeFila(row: ImportRow['data'], map: Map<string, string>): Record<string, string> {
  const campos: Record<string, string> = {}
  for (const [destino, origen] of map.entries()) {
    if (destino === '__skip__' || !origen) continue
    const valor = row[origen]
    if (typeof valor === 'string' && valor.trim()) campos[destino] = valor.trim()
  }
  return campos
}

interface Parcial {
  accion: AccionFila
  codigo?: CodigoCalidad
  motivo?: string
  existenteId?: string
  sePareceA?: string
  avisos?: string[]
}

// ─── Clientes ────────────────────────────────────────────────────────────────

function analizarClientes(
  filas: ImportRow[],
  map: Map<string, string>,
  existentes: ExistentesImportacion,
): FilaCalidad[] {
  const vistos = new Map<string, number>()
  const salida: FilaCalidad[] = []

  for (const fila of filas) {
    const datos = camposDeFila(fila.data, map)
    const avisos: string[] = []
    const resultado: Parcial = { accion: 'nueva' }

    const nombre = datos.nombre
    const email = datos.email ? normalizarEmail(datos.email) : undefined
    const nif = datos.nif ? normalizarNif(datos.nif) : undefined

    if (!nombre) {
      Object.assign(resultado, { accion: 'rechazada', codigo: 'CAMPO_OBLIGATORIO', motivo: 'Falta el nombre o la razón social.' })
    } else if (!email && !nif) {
      Object.assign(resultado, {
        accion: 'rechazada',
        codigo: 'CAMPO_OBLIGATORIO',
        motivo: 'Sin email ni NIF no hay forma de identificar al cliente: se rechaza en vez de duplicarlo.',
      })
    } else if (email && !emailValido(email)) {
      Object.assign(resultado, {
        accion: 'rechazada',
        codigo: 'EMAIL_INVALIDO',
        motivo: `«${datos.email}» no es un email válido.`,
      })
    } else if (nif && esPaisEspanol(datos.pais) && !esNifValido(nif)) {
      Object.assign(resultado, {
        accion: 'rechazada',
        codigo: 'NIF_INVALIDO',
        motivo: `«${datos.nif}» no supera el dígito de control del NIF/CIF español.`,
      })
    } else if (nif && !esPaisEspanol(datos.pais)) {
      avisos.push(`NIF extranjero (${datos.pais}): se importa sin validar el dígito de control.`)
    }

    if (datos.telefono && datos.telefono.replace(/[^0-9]/g, '').length < 7) {
      avisos.push('El teléfono no parece completo: se importa el contacto sin teléfono.')
    }

    if (resultado.accion === 'nueva') {
      const clave = email ? `email:${email}` : `nif:${nif}`
      const primera = vistos.get(clave)
      if (primera !== undefined) {
        Object.assign(resultado, {
          accion: 'rechazada',
          codigo: 'DUPLICADO_FICHERO',
          motivo: `Repite la fila ${primera}: se queda la primera y esta se descarta.`,
        })
      } else {
        vistos.set(clave, fila.rowNumber)

        const existente = (email && existentes.porEmail?.get(email)) || (nif && existentes.porNif?.get(nif))
        if (existente) {
          Object.assign(resultado, { accion: 'actualizar', existenteId: existente.id })
        } else {
          // Sin coincidencia por email ni por NIF: se busca el mismo nombre. No
          // se fusiona nada; se deja en cuarentena para que decida el cliente.
          const nombreNormalizado = normalizarNombre(nombre!)
          const candidatos = new Map<string, ExistenteResumen>()
          for (const c of existentes.porEmail?.values() ?? []) candidatos.set(c.id, c)
          for (const c of existentes.porNif?.values() ?? []) candidatos.set(c.id, c)

          let parecido: ExistenteResumen | undefined
          for (const candidato of candidatos.values()) {
            if (normalizarNombre(candidato.nombre) === nombreNormalizado) {
              parecido = candidato
              break
            }
          }
          if (parecido) {
            Object.assign(resultado, {
              accion: 'posible_duplicado',
              codigo: 'POSIBLE_DUPLICADO',
              sePareceA: parecido.nombre,
              motivo: `Ya existe «${parecido.nombre}» con el mismo nombre pero otro email/NIF.`,
            })
          }
        }
      }
    }

    salida.push({
      fila: fila.rowNumber,
      accion: resultado.accion,
      codigo: resultado.codigo ?? null,
      motivo: resultado.motivo ?? null,
      datos: { ...datos, ...(email ? { email } : {}), ...(nif ? { nif } : {}) },
      original: fila.data,
      existenteId: resultado.existenteId,
      sePareceA: resultado.sePareceA,
      avisos: [...avisos, ...(resultado.avisos ?? [])],
    })
  }

  return salida
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

function analizarCatalogo(
  filas: ImportRow[],
  map: Map<string, string>,
  existentes: ExistentesImportacion,
): FilaCalidad[] {
  const vistos = new Map<string, number>()
  const salida: FilaCalidad[] = []

  for (const fila of filas) {
    const datos = camposDeFila(fila.data, map)
    const avisos: string[] = []
    const resultado: Parcial = { accion: 'nueva' }
    const nombre = datos.nombre

    if (!nombre) {
      Object.assign(resultado, {
        accion: 'rechazada',
        codigo: 'CAMPO_OBLIGATORIO',
        motivo: 'Falta el nombre del producto o servicio.',
      })
    } else {
      const precio = datos.precio === undefined ? 0 : parseNumero(datos.precio)
      if (datos.precio !== undefined && (!Number.isFinite(precio) || precio < 0)) {
        Object.assign(resultado, {
          accion: 'rechazada',
          codigo: 'PRECIO_INVALIDO',
          motivo: `«${datos.precio}» no es un precio válido (número mayor o igual que cero).`,
        })
      } else if (datos.precio === undefined) {
        avisos.push('Sin precio: entra a 0 y hay que ponerle tarifa antes de cotizar.')
      }

      if (datos.duracion !== undefined && !(parseNumero(datos.duracion) > 0)) {
        avisos.push('La duración no es válida: se usa la de por defecto (60 minutos).')
      }
    }

    if (resultado.accion === 'nueva') {
      const clave = normalizarNombre(nombre!)
      const primera = vistos.get(clave)
      if (primera !== undefined) {
        Object.assign(resultado, {
          accion: 'rechazada',
          codigo: 'DUPLICADO_FICHERO',
          motivo: `Repite el nombre de la fila ${primera}: se queda la primera.`,
        })
      } else {
        vistos.set(clave, fila.rowNumber)
        const existente = existentes.porNombre?.get(clave)
        if (existente) {
          Object.assign(resultado, { accion: 'actualizar', existenteId: existente.id })
        } else {
          // Umbral 0,75: «Gestión de redes» y «Gestión de redes sociales» son
          // el mismo servicio con otro nombre. Solo marca, no fusiona.
          let parecido: ExistenteResumen | undefined
          for (const candidato of existentes.porNombre?.values() ?? []) {
            if (similitudNombres(nombre!, candidato.nombre) >= 0.75) {
              parecido = candidato
              break
            }
          }
          if (parecido) {
            Object.assign(resultado, {
              accion: 'posible_duplicado',
              codigo: 'POSIBLE_DUPLICADO',
              sePareceA: parecido.nombre,
              motivo: `Se parece mucho a «${parecido.nombre}», que ya existe.`,
            })
          }
        }
      }
    }

    salida.push({
      fila: fila.rowNumber,
      accion: resultado.accion,
      codigo: resultado.codigo ?? null,
      motivo: resultado.motivo ?? null,
      datos,
      original: fila.data,
      existenteId: resultado.existenteId,
      sePareceA: resultado.sePareceA,
      avisos,
    })
  }

  return salida
}

// ─── Contabilidad ────────────────────────────────────────────────────────────

function analizarContabilidad(
  filas: ImportRow[],
  map: Map<string, string>,
  existentes: ExistentesImportacion,
): { filas: FilaCalidad[]; cuentasDesconocidas: number } {
  const vistos = new Map<string, number>()
  const salida: FilaCalidad[] = []
  let cuentasDesconocidas = 0

  for (const fila of filas) {
    const datos = camposDeFila(fila.data, map)
    const avisos: string[] = []
    const resultado: Parcial = { accion: 'nueva' }
    const cuenta = datos.cuenta?.replace(/[^0-9]/g, '')
    const saldo = datos.saldo === undefined ? 0 : parseNumero(datos.saldo)

    if (!cuenta) {
      Object.assign(resultado, {
        accion: 'rechazada',
        codigo: 'CAMPO_OBLIGATORIO',
        motivo: 'Falta el código de cuenta.',
      })
    } else if (!Number.isFinite(saldo)) {
      Object.assign(resultado, {
        accion: 'rechazada',
        codigo: 'SALDO_INVALIDO',
        motivo: `«${datos.saldo}» no es un saldo válido.`,
      })
    } else if (saldo === 0) {
      Object.assign(resultado, {
        accion: 'omitida',
        codigo: null,
        motivo: 'Saldo cero: no genera línea en el asiento de apertura.',
      })
    } else if (vistos.has(cuenta)) {
      Object.assign(resultado, {
        accion: 'rechazada',
        codigo: 'DUPLICADO_FICHERO',
        motivo: `La cuenta ${cuenta} aparece otra vez (fila ${vistos.get(cuenta)}). Dos saldos para la misma cuenta descuadran el asiento.`,
      })
    } else {
      vistos.set(cuenta, fila.rowNumber)
      if (existentes.cuentas && !existentes.cuentas.has(cuenta)) {
        cuentasDesconocidas++
        avisos.push('Cuenta nueva: al confirmar se crea como subcuenta del grupo correspondiente.')
      }
    }

    salida.push({
      fila: fila.rowNumber,
      accion: resultado.accion,
      codigo: resultado.codigo ?? null,
      motivo: resultado.motivo ?? null,
      datos,
      original: fila.data,
      avisos,
    })
  }

  return { filas: salida, cuentasDesconocidas }
}

// ─── Entrada principal ───────────────────────────────────────────────────────

export function analizarImportacion(opciones: OpcionesAnalisis): InformeCalidad {
  const map = new Map(opciones.mapping.map((m) => [m.targetField, m.sourceField]))

  const contabilidad =
    opciones.tipo === 'accounting'
      ? analizarContabilidad(opciones.filas, map, opciones.existentes)
      : null

  const filas =
    opciones.tipo === 'clients'
      ? analizarClientes(opciones.filas, map, opciones.existentes)
      : opciones.tipo === 'catalog'
        ? analizarCatalogo(opciones.filas, map, opciones.existentes)
        : contabilidad!.filas

  const datos = filas
  const nuevas = datos.filter((f) => f.accion === 'nueva').length
  const actualizadas = datos.filter((f) => f.accion === 'actualizar').length
  const rechazadas = datos.filter((f) => f.accion === 'rechazada').length
  const posiblesDuplicados = datos.filter((f) => f.accion === 'posible_duplicado').length
  const omitidas = datos.filter((f) => f.accion === 'omitida').length

  const aEscribir =
    nuevas + actualizadas + (opciones.incluirPosiblesDuplicados ? posiblesDuplicados : 0)

  const avisosGenerales: string[] = []
  if (contabilidad && contabilidad.cuentasDesconocidas > 0) {
    avisosGenerales.push(
      `${contabilidad.cuentasDesconocidas} cuenta(s) no existen en tu plan contable: al confirmar se crean como subcuenta del grupo correspondiente.`,
    )
  }
  if (rechazadas > 0) {
    avisosGenerales.push(
      `${rechazadas} fila(s) se quedan fuera. Descarga la cuarentena, corrige el fichero y vuelve a subirlo: lo bueno ya se habrá guardado.`,
    )
  }
  if (posiblesDuplicados > 0 && !opciones.incluirPosiblesDuplicados) {
    avisosGenerales.push(
      `${posiblesDuplicados} fila(s) podrían ser el mismo cliente con otro email. No se escriben salvo que lo marques: fusionar por parecido borra ventas reales.`,
    )
  }
  if (aEscribir === 0) {
    avisosGenerales.push('No hay ninguna fila que importar con los criterios actuales.')
  }

  return {
    tipo: opciones.tipo,
    total: datos.length,
    nuevas,
    actualizadas,
    rechazadas,
    posiblesDuplicados,
    omitidas,
    aEscribir,
    filas,
    avisosGenerales,
  }
}

// ─── Cuarentena ──────────────────────────────────────────────────────────────

function escaparCsv(valor: string): string {
  const limpio = valor.replace(/\r?\n/g, ' ')
  return `"${limpio.replace(/"/g, '""')}"`
}

/**
 * CSV de las filas rechazadas, con el motivo en las primeras columnas y los
 * valores originales detrás: se corrige en Excel y se vuelve a subir.
 */
export function construirCsvCuarentena(informe: InformeCalidad): string {
  const rechazadas = informe.filas.filter((f) => f.accion === 'rechazada')
  if (rechazadas.length === 0) return ''

  const columnas = new Set<string>()
  for (const fila of rechazadas) for (const clave of Object.keys(fila.original)) columnas.add(clave)
  const cabecera = ['fila', 'codigo', 'motivo', ...columnas]

  const lineas = [cabecera.map(escaparCsv).join(',')]
  for (const fila of rechazadas) {
    lineas.push(
      [
        String(fila.fila),
        fila.codigo ?? '',
        fila.motivo ?? '',
        ...[...columnas].map((c) => fila.original[c] ?? ''),
      ]
        .map((v) => escaparCsv(String(v)))
        .join(','),
    )
  }

  return lineas.join('\n')
}

/** Recorte de muestras para la respuesta HTTP: los totales van aparte. */
export function muestrasDeInforme(informe: InformeCalidad, limite = 15) {
  const porAccion = (accion: AccionFila) =>
    informe.filas.filter((f) => f.accion === accion).slice(0, limite)
  return {
    nuevas: porAccion('nueva'),
    actualizadas: porAccion('actualizar'),
    rechazadas: porAccion('rechazada'),
    posiblesDuplicados: porAccion('posible_duplicado'),
    omitidas: porAccion('omitida'),
  }
}
