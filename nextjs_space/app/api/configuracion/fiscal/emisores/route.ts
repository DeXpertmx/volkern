export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { monedaDePais, monedaEscritura } from '@/lib/moneda'
import { withTenantAuth } from '@/lib/api-key-auth'
import { validateFiscalId } from '@/lib/fiscal-validation'

// GET - Listar configuraciones fiscales del emisor para el tenant
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url)
    const activo = searchParams.get('activo')
    const principal = searchParams.get('principal')

    const where: any = { tenantId: tenantId }
    
    if (activo !== null) where.activo = activo === 'true'
    if (principal !== null) where.esPrincipal = principal === 'true'

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const emisores = await prisma.configuracionFiscalEmisor.findMany({
      where,
      orderBy: [
        { esPrincipal: 'desc' },
        { razonSocial: 'asc' }
      ]
    })

    return NextResponse.json({
      emisores,
      total: emisores.length
    })
  } catch (error) {
    console.error('Error al obtener emisores:', error)
    return NextResponse.json(
      { error: 'Error al obtener configuraciones de emisor' },
      { status: 500 }
    )
  }
}, ['config:read'])

// POST - Crear nueva configuración de emisor en la DB del Tenant
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json()
    const {
      razonSocial,
      nombreComercial,
      pais,
      tipoIdFiscal,
      idFiscal,
      regimenFiscal,
      direccion,
      ciudad,
      estadoProvincia,
      codigoPostal,
      telefono,
      email,
      sitioWeb,
      monedaPredeterminada,
      serieFactura = 'F',
      logoUrl,
      colorPrimario,
      esPrincipal = false,
      verifactuEnabled = false,
    } = body

    // 1. Validaciones requeridas
    if (!razonSocial || !pais || !tipoIdFiscal || !idFiscal || !direccion || !ciudad || !codigoPostal || !email) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: razonSocial, pais, tipoIdFiscal, idFiscal, direccion, ciudad, codigoPostal, email' },
        { status: 400 }
      )
    }

    // 2. Validar ID fiscal (Lógica de negocio pura)
    const validacion = validateFiscalId(pais, tipoIdFiscal, idFiscal)
    if (!validacion.valid) {
      return NextResponse.json({ error: `ID Fiscal inválido: ${validacion.error}` }, { status: 400 })
    }

    // 3. Verificar duplicados dentro del tenant (Base de Datos aislada)
    const existente = await prisma.configuracionFiscalEmisor.findFirst({
      where: {
        tenantId: tenantId,
        idFiscal: validacion.formatted || idFiscal
      }
    })

    if (existente) {
      return NextResponse.json(
        { error: `Ya existe un emisor con el ID fiscal ${idFiscal}` },
        { status: 409 }
      )
    }

    // 4. Si es principal, desmarcar los demás en la DB del Tenant
    if (esPrincipal) {
      await prisma.configuracionFiscalEmisor.updateMany({
        where: { tenantId: tenantId, esPrincipal: true },
        data: { esPrincipal: false }
      })
    }

    // 5. Crear emisor en la BD física aislada
    const emisor = await prisma.configuracionFiscalEmisor.create({
      data: {
        tenantId: tenantId,
        razonSocial,
        nombreComercial,
        pais,
        tipoIdFiscal,
        idFiscal: validacion.formatted || idFiscal,
        regimenFiscal,
        direccion,
        ciudad,
        estadoProvincia,
        codigoPostal,
        telefono,
        email,
        sitioWeb,
        // La divisa la elige el usuario; si no, la del país del emisor y, en
        // último término, la del tenant que lo da de alta.
        monedaPredeterminada: monedaEscritura(
          monedaPredeterminada,
          monedaDePais(pais)?.codigo,
          auth.tenant?.moneda
        ),
        serieFactura,
        logoUrl,
        colorPrimario,
        esPrincipal,
        verifactuEnabled,
        activo: true
      }
    })

    return NextResponse.json(emisor, { status: 201 })
  } catch (error) {
    console.error('Error al crear emisor:', error)
    return NextResponse.json(
      { error: 'Error al crear configuración de emisor' },
      { status: 500 }
    )
  }
}, ['config:write'])
