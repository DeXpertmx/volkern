/**
 * Prisma en memoria para las pruebas de aislamiento multi-tenant.
 *
 * Imita lo único que importa aquí: **si la consulta trae filtro de alcance,
 * filtra; si no lo trae, devuelve filas de todos los tenants y anota una
 * violación**. Así un `where` olvidado se ve como datos del tenant B dentro de
 * la respuesta del tenant A, no como un test verde.
 *
 * Alcance mínimo a propósito: solo los modelos y operaciones que usan las rutas
 * del chat y las herramientas del agente. No sustituye a una prueba contra
 * Postgres; la complementa.
 */

export type Fila = Record<string, any>

/** Claves que acotan una consulta a un tenant o a un registro concreto. */
const CLAVES_DE_ALCANCE = ['tenantId', 'id', 'channelId', 'leadId', 'contactId', 'taskId', 'userId']

/** Modelos con columna `tenantId`; el resto se considera acotado por relación. */
const CON_TENANT = new Set([
  'chatChannel',
  'chatMessage',
  'lead',
  'contact',
  'task',
  'note',
  'user',
])

const MODELOS = [
  'tenant',
  'user',
  'chatChannel',
  'chatMessage',
  'lead',
  'contact',
  'task',
  'note',
  'interaction',
]

export interface Violacion {
  tabla: string
  metodo: string
  motivo: string
}

let contadorId = 0

function coincide(fila: Fila, where: Fila | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([clave, valor]) => {
    if (clave === 'messages') return true // lo resuelve `cumpleMensajes`
    if (valor === undefined) return true

    const actual = fila[clave]
    if (valor === null) return actual == null
    if (valor instanceof Date) return actual instanceof Date && actual.getTime() === valor.getTime()

    if (typeof valor === 'object') {
      const v = valor as any
      const texto = String(actual ?? '')
      const patron = String(v.equals ?? v.contains ?? v.startsWith ?? '')
      const insensible = v.mode === 'insensitive'
      if ('equals' in v) return insensible ? texto.toLowerCase() === patron.toLowerCase() : actual === v.equals
      if ('contains' in v) return insensible ? texto.toLowerCase().includes(patron.toLowerCase()) : texto.includes(patron)
      if ('startsWith' in v) return texto.startsWith(patron)
      return true
    }

    return actual === valor
  })
}

export interface PrismaEnMemoria {
  prisma: any
  violaciones: Violacion[]
  tablas: Record<string, Fila[]>
  /** Operaciones de lectura ejecutadas, para medir cuántas consultas cuesta algo. */
  llamadas: Array<{ tabla: string; metodo: string; args?: any }>
}

export function crearPrismaEnMemoria(datos: Record<string, Fila[]> = {}): PrismaEnMemoria {
  const tablas: Record<string, Fila[]> = {}
  for (const modelo of MODELOS) {
    tablas[modelo] = (datos[modelo] ?? []).map((fila) => ({
      createdAt: new Date(),
      updatedAt: new Date(),
      ...fila,
    }))
  }
  const violaciones: Violacion[] = []
  const llamadas: Array<{ tabla: string; metodo: string; args?: any }> = []

  const anotarAlcance = (tabla: string, metodo: string, where: Fila | undefined) => {
    if (!CON_TENANT.has(tabla)) return
    if (where && CLAVES_DE_ALCANCE.some((clave) => where[clave] !== undefined)) return
    violaciones.push({
      tabla,
      metodo,
      motivo: 'lectura sin filtro de alcance (tenantId/id/leadId/channelId…)',
    })
  }

  /** `messages: { some: … }` sobre un canal. */
  const cumpleMensajes = (canal: Fila, where: Fila | undefined): boolean => {
    const some = (where as any)?.messages?.some
    return some ? tablas.chatMessage.some((m) => m.channelId === canal.id && coincide(m, some)) : true
  }

  /** `include: { messages: … }` sobre un canal. */
  const conMensajes = (canal: Fila, args: any) => {
    const config = args?.include?.messages
    if (!config) return canal
    let mensajes = tablas.chatMessage.filter((m) => m.channelId === canal.id && coincide(m, config.where))
    if (config.orderBy) mensajes = ordenar(mensajes, config.orderBy)
    if (config.take) mensajes = mensajes.slice(0, config.take)
    return { ...canal, messages: mensajes }
  }

  const ordenar = (filas: Fila[], orderBy: any): Fila[] => {
    const [campo, sentido] = Object.entries(orderBy)[0] as [string, 'asc' | 'desc']
    const valor = (f: Fila) => (f[campo] instanceof Date ? f[campo].getTime() : f[campo])
    return [...filas].sort((a, b) => (valor(a) > valor(b) ? 1 : valor(a) < valor(b) ? -1 : 0) * (sentido === 'desc' ? -1 : 1))
  }

  const leer = (tabla: string, args: any = {}) => {
    let filas = tablas[tabla].filter((f) => coincide(f, args.where) && cumpleMensajes(f, args.where))
    if (args.orderBy) filas = ordenar(filas, args.orderBy)
    if (args.take) filas = filas.slice(0, args.take)
    return tabla === 'chatChannel' ? filas.map((f) => conMensajes(f, args)) : filas
  }

  const modelo = (tabla: string) => ({
    findMany: async (args: any = {}) => {
      anotarAlcance(tabla, 'findMany', args.where)
      llamadas.push({ tabla, metodo: 'findMany', args })
      return leer(tabla, args)
    },
    findFirst: async (args: any = {}) => {
      anotarAlcance(tabla, 'findFirst', args.where)
      llamadas.push({ tabla, metodo: 'findFirst', args })
      return leer(tabla, args)[0] ?? null
    },
    findUnique: async (args: any = {}) => {
      anotarAlcance(tabla, 'findUnique', args.where)
      llamadas.push({ tabla, metodo: 'findUnique', args })
      return leer(tabla, args)[0] ?? null
    },
    count: async (args: any = {}) => {
      anotarAlcance(tabla, 'count', args.where)
      llamadas.push({ tabla, metodo: 'count', args })
      return leer(tabla, args).length
    },
    create: async (args: any = {}) => {
      const fila = { id: `fake_${++contadorId}`, createdAt: new Date(), updatedAt: new Date(), ...(args.data ?? {}) }
      tablas[tabla].push(fila)
      return fila
    },
    update: async (args: any = {}) => {
      const fila = tablas[tabla].find((f) => coincide(f, args.where))
      if (!fila) throw new Error(`[fake] ${tabla}.update: registro no encontrado`)
      Object.assign(fila, args.data ?? {}, { updatedAt: new Date() })
      return fila
    },
  })

  const prisma = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (!MODELOS.includes(prop)) throw new Error(`[fake] modelo no soportado: ${prop}`)
        return modelo(prop)
      },
    }
  )

  return { prisma, violaciones, tablas, llamadas }
}

/** Instancia activa, para que los módulos importen siempre el mismo doble. */
let activo: PrismaEnMemoria = crearPrismaEnMemoria()

export const prismaActual = {
  get prisma() {
    return activo.prisma
  },
  get violaciones() {
    return activo.violaciones
  },
  get tablas() {
    return activo.tablas
  },
  get llamadas() {
    return activo.llamadas
  },
}

export function reiniciarPrisma(datos: Record<string, Fila[]> = {}): PrismaEnMemoria {
  activo = crearPrismaEnMemoria(datos)
  return activo
}
