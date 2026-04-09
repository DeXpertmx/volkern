export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { TASAS_IVA_PREDETERMINADAS } from '@/lib/fiscal-validation'

// GET - Listar tasas de impuesto para el tenant
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url)
    const pais = searchParams.get('pais')
    const activo = searchParams.get('activo')
    const soloVigentes = searchParams.get('soloVigentes') === 'true'

    const where: any = { tenantId: tenantId }
    
    if (pais) where.pais = pais
    if (activo !== null) where.activo = activo === 'true'
    
    if (soloVigentes) {
      where.OR = [
        { fechaFinVigencia: null },
        { fechaFinVigencia: { gte: new Date() } }
      ]
    }

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const tasas = await prisma.tasaImpuesto.findMany({
      where,
      orderBy: [
        { pais: 'asc' },
        { porcentaje: 'desc' },
        { fechaInicioVigencia: 'desc' }
      ]
    })

    return NextResponse.json({
      tasas,
      total: tasas.length
    })
  } catch (error) {
    console.error('Error al obtener tasas de impuesto:', error)
    return NextResponse.json(
      { error: 'Error al obtener tasas de impuesto' },
      { status: 500 }
    )
  }
}, ['config:read'])

// POST - Crear nueva tasa de impuesto en la DB del Tenant
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json()
    const {
      pais,
      estado,
      nombre,
      codigo,
      porcentaje,
      tipo = 'iva',
      aplicaRetencion = false,
      porcentajeRetencion,
      inversionSujetoPasivo = false,
      descripcionRegla,
      fechaInicioVigencia,
      fechaFinVigencia,
    } = body

    if (!pais || !nombre || !codigo || porcentaje === undefined) {
      return NextResponse.json(
        { error: 'País, nombre, código y porcentaje son requeridos' },
        { status: 400 }
      )
    }

    // Verificar duplicados en la base de datos aislada
    const existente = await prisma.tasaImpuesto.findFirst({
      where: {
        tenantId,
        codigo,
        fechaInicioVigencia: fechaInicioVigencia ? new Date(fechaInicioVigencia) : { gte: new Date(0) }
      }
    })

    if (existente) {
      return NextResponse.json(
        { error: `Ya existe una tasa con código ${codigo} para esa fecha de vigencia` },
        { status: 409 }
      )
    }

    const tasa = await prisma.tasaImpuesto.create({
      data: {
        tenantId,
        pais,
        estado,
        nombre,
        codigo,
        porcentaje: parseFloat(porcentaje),
        tipo,
        aplicaRetencion,
        porcentajeRetencion: porcentajeRetencion ? parseFloat(porcentajeRetencion) : null,
        inversionSujetoPasivo,
        descripcionRegla,
        fechaInicioVigencia: fechaInicioVigencia ? new Date(fechaInicioVigencia) : new Date(),
        fechaFinVigencia: fechaFinVigencia ? new Date(fechaFinVigencia) : null,
        activo: true
      }
    })

    return NextResponse.json(tasa, { status: 201 })
  } catch (error) {
    console.error('Error al crear tasa de impuesto:', error)
    return NextResponse.json(
      { error: 'Error al crear tasa de impuesto' },
      { status: 500 }
    )
  }
}, ['config:write'])

// PUT - Inicializar tasas predeterminadas para un país en la DB del Tenant
export const PUT = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json()
    const { pais } = body

    if (!pais) {
      return NextResponse.json({ error: 'País es requerido' }, { status: 400 })
    }

    const tasasPredeterminadas = TASAS_IVA_PREDETERMINADAS[pais]
    if (!tasasPredeterminadas) {
      return NextResponse.json(
        { error: `No hay tasas predeterminadas configuradas para ${pais}` },
        { status: 404 }
      )
    }

    const creadas: any[] = []
    const now = new Date();

    // Función auxiliar para upsert de tasas
    const upsertTasa = async (codigo: string, nombre: string, porcentaje: number, descripcion?: string) => {
      return await prisma.tasaImpuesto.upsert({
        where: {
          tenantId_codigo_fechaInicioVigencia: {
            tenantId,
            codigo,
            fechaInicioVigencia: now
          }
        },
        update: { porcentaje },
        create: {
          tenantId,
          pais,
          nombre,
          codigo,
          porcentaje,
          tipo: 'iva',
          descripcionRegla: descripcion,
          activo: true,
          fechaInicioVigencia: now
        }
      })
    }

    creadas.push(await upsertTasa(`IVA_${pais}_GENERAL`, `IVA General ${pais}`, tasasPredeterminadas.general));

    if (tasasPredeterminadas.reducida !== undefined) {
      creadas.push(await upsertTasa(`IVA_${pais}_REDUCIDO`, `IVA Reducido ${pais}`, tasasPredeterminadas.reducida));
    }

    if (tasasPredeterminadas.superReducida !== undefined) {
      creadas.push(await upsertTasa(`IVA_${pais}_SUPER_REDUCIDO`, `IVA Super Reducido ${pais}`, tasasPredeterminadas.superReducida));
    }

    creadas.push(await upsertTasa(`IVA_${pais}_EXENTO`, `Exento de IVA ${pais}`, 0, 'Operaciones exentas de IVA'));

    return NextResponse.json({
      message: `Tasas predeterminadas inicializadas para ${pais}`,
      tasas: creadas
    })
  } catch (error) {
    console.error('Error al inicializar tasas:', error)
    return NextResponse.json(
      { error: 'Error al inicializar tasas predeterminadas' },
      { status: 500 }
    )
  }
}, ['config:write'])
