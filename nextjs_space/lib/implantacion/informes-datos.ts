/**
 * Los ocho informes que el cliente puede fijar en su panel, con datos reales.
 *
 * Dos decisiones que evitan el «panel vacío» que este corte viene a resolver:
 *
 *   1. **Un informe sin datos no se esconde ni se rellena con ceros falsos:**
 *      se dice qué falta y cuál es el primer paso para que se llene. Un 0 con
 *      aspecto de dato es peor que un estado vacío honesto.
 *   2. Todo sale de tablas que ya existen (`deals`, `deal_activities`,
 *      `invoices`, `catalogo`), sin tablas de métricas que se queden viejas.
 *
 * `calcularInformes` es puro (recibe los datos ya leídos) para poder cubrirlo
 * con casos concretos; `cargarInformes` es la única parte que toca Prisma.
 */

import { prisma } from '@/lib/db'
import { formatearImporte, formatearMedida, primeraMoneda } from '@/lib/moneda'
import { INFORMES_ENTREGABLES_POR_ID } from './entregables'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface DealInforme {
  valor: number
  valorReal: number | null
  probabilidad: number
  etapa: string
  estado: string
  fechaCreacion: Date
  fechaCierre: Date | null
  fechaEstimadaCierre: Date | null
  fechaUltimaActividad: Date | null
  origen: string | null
  catalogoItemId: string | null
}

export interface ActividadInforme {
  usuarioNombre: string | null
}

export interface FacturaInforme {
  monto: number
  fechaVencimiento: Date | null
}

export interface CatalogoInforme {
  id: string
  nombre: string
  costOfAcquisition: number
}

export interface DatosInformes {
  moneda: string
  deals: DealInforme[]
  /** Actividades de los últimos 30 días. */
  actividades: ActividadInforme[]
  /** Facturas pendientes de cobro. */
  facturas: FacturaInforme[]
  catalogo: CatalogoInforme[]
  hoy?: Date
}

export interface InformeCalculado {
  id: string
  etiqueta: string
  /** Cifra principal ya formateada. `—` cuando aún no hay datos. */
  valor: string
  detalle: string
  vacio: boolean
  primerPaso: string
  enlace: string
  demuestra: string
}

const DIAS_SIN_ACCION = 14
const DIAS_ACTIVIDAD = 30

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Importe de un informe, sin céntimos.
 *
 * La divisa la pone quien llama —la del tenant— y el formato `lib/moneda`: si no
 * hay divisa se escribe el número solo, en vez de enseñar pesos o euros que el
 * cliente no eligió.
 */
function dinero(valor: number, moneda: string): string {
  return formatearImporte(valor, moneda, 0)
}

function diasEntre(desde: Date, hasta: Date): number {
  return (hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24)
}

function finDeTrimestre(hoy: Date): Date {
  const trimestre = Math.floor(hoy.getMonth() / 3)
  return new Date(hoy.getFullYear(), trimestre * 3 + 3, 0, 23, 59, 59, 999)
}

function redondear(valor: number, decimales = 0): string {
  // Un 15,0 se lee peor que un 15: el decimal solo cuando aporta algo.
  return formatearMedida(valor, decimales)
}

interface Base {
  id: string
  etiqueta: string
  demuestra: string
  enlace: string
  primerPaso: string
}

function vacio(base: Base, detalle: string): InformeCalculado {
  return {
    ...base,
    valor: '—',
    detalle,
    vacio: true,
    primerPaso: base.primerPaso,
  }
}

function lleno(base: Base, valor: string, detalle: string): InformeCalculado {
  return { ...base, valor, detalle, vacio: false, primerPaso: base.primerPaso }
}

// ─── Cálculo ─────────────────────────────────────────────────────────────────

export function calcularInformes(ids: string[], datos: DatosInformes): InformeCalculado[] {
  const hoy = datos.hoy ?? new Date()
  const abiertos = datos.deals.filter((d) => d.estado === 'activo')
  const ganados = datos.deals.filter((d) => d.estado === 'ganado')

  const resultado: InformeCalculado[] = []

  for (const id of ids) {
    const base = INFORMES_ENTREGABLES_POR_ID[id]
    if (!base) continue // un id que ya no está en el catálogo no se pinta

    switch (id) {
      case 'embudo_etapas': {
        if (abiertos.length === 0) {
          resultado.push(vacio(base, 'Todavía no hay oportunidades abiertas.'))
          break
        }
        const porEtapa = new Map<string, { cantidad: number; valor: number }>()
        for (const deal of abiertos) {
          const acumulado = porEtapa.get(deal.etapa) ?? { cantidad: 0, valor: 0 }
          acumulado.cantidad += 1
          acumulado.valor += deal.valor
          porEtapa.set(deal.etapa, acumulado)
        }
        const [etapaTop, datosTop] = [...porEtapa.entries()].sort((a, b) => b[1].cantidad - a[1].cantidad)[0]
        const valorTotal = abiertos.reduce((suma, d) => suma + d.valor, 0)
        resultado.push(
          lleno(
            base,
            `${abiertos.length} abiertas`,
            `${dinero(valorTotal, datos.moneda)} en juego · más volumen en ${etapaTop} (${datosTop.cantidad})`,
          ),
        )
        break
      }

      case 'prevision_trimestral': {
        const fin = finDeTrimestre(hoy)
        const enTrimestre = abiertos.filter(
          (d) => d.fechaEstimadaCierre && d.fechaEstimadaCierre >= hoy && d.fechaEstimadaCierre <= fin,
        )
        if (enTrimestre.length === 0) {
          resultado.push(
            vacio(base, 'Ninguna oportunidad abierta tiene fecha de cierre dentro de este trimestre.'),
          )
          break
        }
        const ponderado = enTrimestre.reduce((suma, d) => suma + (d.valor * d.probabilidad) / 100, 0)
        resultado.push(
          lleno(
            base,
            dinero(ponderado, datos.moneda),
            `Previsión ponderada por probabilidad · ${enTrimestre.length} oportunidad(es) con cierre en el trimestre`,
          ),
        )
        break
      }

      case 'actividad_por_comercial': {
        if (datos.actividades.length === 0) {
          resultado.push(vacio(base, `Sin actividades registradas en los últimos ${DIAS_ACTIVIDAD} días.`))
          break
        }
        const porPersona = new Map<string, number>()
        for (const actividad of datos.actividades) {
          const nombre = actividad.usuarioNombre?.trim() || 'Sin asignar'
          porPersona.set(nombre, (porPersona.get(nombre) ?? 0) + 1)
        }
        const [personaTop, cantidadTop] = [...porPersona.entries()].sort((a, b) => b[1] - a[1])[0]
        resultado.push(
          lleno(
            base,
            `${datos.actividades.length} actividades`,
            `Últimos ${DIAS_ACTIVIDAD} días · más activo: ${personaTop} (${cantidadTop})`,
          ),
        )
        break
      }

      case 'conversion_por_origen': {
        const porOrigen = new Map<string, { total: number; ganados: number }>()
        for (const deal of datos.deals) {
          const origen = deal.origen?.trim()
          if (!origen) continue
          const acumulado = porOrigen.get(origen) ?? { total: 0, ganados: 0 }
          acumulado.total += 1
          if (deal.estado === 'ganado') acumulado.ganados += 1
          porOrigen.set(origen, acumulado)
        }
        if (porOrigen.size === 0) {
          resultado.push(vacio(base, 'Ninguna oportunidad tiene origen informado.'))
          break
        }
        const [origenTop, datosOrigen] = [...porOrigen.entries()].sort(
          (a, b) => b[1].ganados - a[1].ganados || b[1].total - a[1].total,
        )[0]
        const tasa = datosOrigen.total > 0 ? (datosOrigen.ganados / datosOrigen.total) * 100 : 0
        resultado.push(
          lleno(
            base,
            `${redondear(tasa)}%`,
            `Mejor origen: ${origenTop} · ${datosOrigen.ganados} de ${datosOrigen.total} cerradas ganadas · ${porOrigen.size} origen(es)`,
          ),
        )
        break
      }

      case 'tiempo_de_cierre': {
        const cerradas = ganados.filter((d) => d.fechaCierre)
        if (cerradas.length === 0) {
          resultado.push(vacio(base, 'Aún no hay ventas ganadas con fecha de cierre.'))
          break
        }
        const media =
          cerradas.reduce((suma, d) => suma + diasEntre(d.fechaCreacion, d.fechaCierre!), 0) / cerradas.length
        resultado.push(
          lleno(base, `${redondear(media, 1)} días`, `Media de ${cerradas.length} venta(s) ganada(s)`),
        )
        break
      }

      case 'margen_por_linea': {
        const costes = new Map(datos.catalogo.map((item) => [item.id, item.costOfAcquisition]))
        const conCoste = ganados.filter((d) => {
          if (!d.catalogoItemId) return false
          const coste = costes.get(d.catalogoItemId)
          return typeof coste === 'number' && coste > 0
        })
        const sinCoste = datos.catalogo.filter((item) => !(item.costOfAcquisition > 0)).length

        if (conCoste.length === 0) {
          resultado.push(
            vacio(
              base,
              sinCoste > 0
                ? `Falta el coste en ${sinCoste} de tus ${datos.catalogo.length} productos o servicios.`
                : 'Aún no hay ventas ganadas ligadas a una línea del catálogo.',
            ),
          )
          break
        }

        const margenes = conCoste.map((d) => {
          const importe = d.valorReal ?? d.valor
          const coste = costes.get(d.catalogoItemId!) ?? 0
          return importe > 0 ? ((importe - coste) / importe) * 100 : 0
        })
        const media = margenes.reduce((suma, m) => suma + m, 0) / margenes.length
        resultado.push(
          lleno(
            base,
            `${redondear(media)}%`,
            `Media de ${conCoste.length} venta(s) con coste registrado${
              sinCoste > 0 ? ` · ${sinCoste} línea(s) del catálogo aún sin coste` : ''
            }`,
          ),
        )
        break
      }

      case 'cobros_pendientes': {
        if (datos.facturas.length === 0) {
          resultado.push(vacio(base, 'No hay facturas pendientes de cobro.'))
          break
        }
        const total = datos.facturas.reduce((suma, f) => suma + f.monto, 0)
        const vencidas = datos.facturas.filter((f) => f.fechaVencimiento && f.fechaVencimiento < hoy).length
        resultado.push(
          lleno(
            base,
            dinero(total, datos.moneda),
            `${datos.facturas.length} factura(s) pendiente(s)${vencidas > 0 ? ` · ${vencidas} vencida(s)` : ''}`,
          ),
        )
        break
      }

      case 'oportunidades_sin_accion': {
        if (abiertos.length === 0) {
          resultado.push(vacio(base, 'No hay oportunidades abiertas que vigilar.'))
          break
        }
        const paradas = abiertos.filter((d) => {
          if (!d.fechaUltimaActividad) return true
          return diasEntre(d.fechaUltimaActividad, hoy) > DIAS_SIN_ACCION
        })
        if (paradas.length === 0) {
          resultado.push(lleno(base, 'Ninguna parada', `Las ${abiertos.length} abiertas tienen actividad reciente.`))
          break
        }
        resultado.push(
          lleno(
            base,
            `${paradas.length} paradas`,
            `De ${abiertos.length} abiertas · más de ${DIAS_SIN_ACCION} días sin actividad`,
          ),
        )
        break
      }

      default:
        resultado.push(vacio(base, 'Este informe aún no tiene datos que mostrar.'))
    }
  }

  return resultado
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function cargarInformes(tenantId: string, ids: string[]): Promise<InformeCalculado[]> {
  if (ids.length === 0) return []

  const desde = new Date()
  desde.setDate(desde.getDate() - DIAS_ACTIVIDAD)

  const [tenant, deals, actividades, facturas, catalogo] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { moneda: true } }),
    prisma.deal.findMany({
      where: { tenantId },
      select: {
        valor: true,
        valorReal: true,
        probabilidad: true,
        etapa: true,
        estado: true,
        fechaCreacion: true,
        fechaCierre: true,
        fechaEstimadaCierre: true,
        fechaUltimaActividad: true,
        origen: true,
        catalogoItemId: true,
      },
    }),
    prisma.dealActivity.findMany({
      where: { tenantId, fechaCreacion: { gte: desde } },
      select: { usuario: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { tenantId, estado: { in: ['pendiente', 'PENDIENTE', 'pending'] } },
      select: { monto: true, fechaVencimiento: true },
    }),
    prisma.catalogoItem.findMany({
      where: { tenantId },
      select: { id: true, nombre: true, costOfAcquisition: true },
    }),
  ])

  return calcularInformes(ids, {
    // Sin moneda declarada se escribe el número sin símbolo: inventar una divisa
    // aquí fue justo lo que enseñó pesos a un tenant español.
    moneda: primeraMoneda(tenant?.moneda),
    deals,
    actividades: actividades.map((a) => ({ usuarioNombre: a.usuario?.name ?? null })),
    facturas,
    catalogo,
  })
}
