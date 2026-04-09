export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { 
  validateFiscalId, 
  getFiscalIdConfigsByCountry, 
  getSupportedCountries,
  getRegimenesFiscales,
  MONEDAS_POR_PAIS,
  aplicaInversionSujetoPasivo
} from '@/lib/fiscal-validation'

// POST - Validar ID fiscal
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pais, tipoIdFiscal, idFiscal } = body

    if (!pais || !tipoIdFiscal || !idFiscal) {
      return NextResponse.json(
        { error: 'País, tipo de ID fiscal y valor son requeridos' },
        { status: 400 }
      )
    }

    const resultado = validateFiscalId(pais, tipoIdFiscal, idFiscal)

    return NextResponse.json(resultado)
  } catch (error) {
    console.error('Error al validar ID fiscal:', error)
    return NextResponse.json(
      { error: 'Error al validar ID fiscal' },
      { status: 500 }
    )
  }
}

// GET - Obtener configuraciones disponibles
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const pais = searchParams.get('pais')
    const tipo = searchParams.get('tipo') // 'paises', 'tiposId', 'regimenes', 'monedas', 'reverseCharge'

    // Si piden verificar inversión de sujeto pasivo
    if (tipo === 'reverseCharge') {
      const paisEmisor = searchParams.get('paisEmisor')
      const paisCliente = searchParams.get('paisCliente')
      const tieneIdIntra = searchParams.get('tieneIdIntra') === 'true'

      if (!paisEmisor || !paisCliente) {
        return NextResponse.json(
          { error: 'Se requiere paisEmisor y paisCliente' },
          { status: 400 }
        )
      }

      return NextResponse.json({
        aplica: aplicaInversionSujetoPasivo(paisEmisor, paisCliente, tieneIdIntra),
        descripcion: aplicaInversionSujetoPasivo(paisEmisor, paisCliente, tieneIdIntra)
          ? 'Aplica inversión del sujeto pasivo - IVA 0%'
          : 'No aplica inversión del sujeto pasivo'
      })
    }

    // Obtener lista de países soportados
    if (tipo === 'paises' || !tipo) {
      const paises = getSupportedCountries()
      return NextResponse.json({ paises })
    }

    // Obtener tipos de ID fiscal por país
    if (tipo === 'tiposId') {
      if (!pais) {
        return NextResponse.json(
          { error: 'Se requiere el parámetro pais' },
          { status: 400 }
        )
      }
      const configs = getFiscalIdConfigsByCountry(pais)
      return NextResponse.json({
        tiposId: configs.map(c => ({
          tipoId: c.tipoId,
          nombre: c.tipoIdNombre,
          mascara: c.mascara,
          ejemplo: c.ejemplo,
          descripcion: c.descripcion
        }))
      })
    }

    // Obtener regímenes fiscales por país
    if (tipo === 'regimenes') {
      if (!pais) {
        return NextResponse.json(
          { error: 'Se requiere el parámetro pais' },
          { status: 400 }
        )
      }
      const regimenes = getRegimenesFiscales(pais)
      return NextResponse.json({ regimenes })
    }

    // Obtener moneda por país
    if (tipo === 'monedas') {
      if (pais) {
        const moneda = MONEDAS_POR_PAIS[pais]
        return NextResponse.json({ moneda: moneda || null })
      }
      return NextResponse.json({ monedas: MONEDAS_POR_PAIS })
    }

    // Respuesta por defecto: todas las configuraciones para un país
    if (pais) {
      return NextResponse.json({
        pais,
        tiposId: getFiscalIdConfigsByCountry(pais).map(c => ({
          tipoId: c.tipoId,
          nombre: c.tipoIdNombre,
          mascara: c.mascara,
          ejemplo: c.ejemplo
        })),
        regimenes: getRegimenesFiscales(pais),
        moneda: MONEDAS_POR_PAIS[pais] || null
      })
    }

    return NextResponse.json({ paises: getSupportedCountries() })
  } catch (error) {
    console.error('Error al obtener configuraciones fiscales:', error)
    return NextResponse.json(
      { error: 'Error al obtener configuraciones fiscales' },
      { status: 500 }
    )
  }
}
