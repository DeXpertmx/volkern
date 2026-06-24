export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { validateFiscalId, aplicaInversionSujetoPasivo, PAISES_UE } from '@/lib/fiscal-validation'

// GET - Listar perfiles fiscales de clientes
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get('leadId')
    const contactId = searchParams.get('contactId')
    const pais = searchParams.get('pais')
    const exento = searchParams.get('exento')

    const where: any = { tenantId: tenantId }
    
    if (leadId) where.leadId = leadId
    if (contactId) where.contactId = contactId
    if (pais) where.pais = pais
    if (exento !== null) where.exentoImpuestos = exento === 'true'

    // El proxy de prisma redirige automáticamente a la base de datos física del tenant
    const perfiles = await prisma.perfilFiscalCliente.findMany({
      where,
      include: {
        lead: {
          select: { id: true, nombre: true, email: true, empresa: true }
        },
        contact: {
          select: { id: true, nombre: true, email: true, tipo: true }
        }
      },
      orderBy: { fechaCreacion: 'desc' }
    })

    return NextResponse.json({
      perfiles,
      total: perfiles.length
    })
  } catch (error) {
    console.error('Error al obtener perfiles fiscales:', error)
    return NextResponse.json(
      { error: 'Error al obtener perfiles fiscales' },
      { status: 500 }
    )
  }
}, ['config:read', 'leads:read', 'contacts:read'])

// POST - Crear perfil fiscal de cliente
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json()
    const {
      leadId,
      contactId,
      razonSocial,
      pais,
      tipoIdFiscal,
      idFiscal,
      regimenFiscal,
      idIntracomunitario,
      direccionFiscal,
      ciudadFiscal,
      estadoFiscal,
      codigoPostalFiscal,
      exentoImpuestos = false,
      motivoExencion,
      aplicaRetencion = false,
    } = body

    // Validaciones
    if (!leadId && !contactId) {
      return NextResponse.json({ error: 'Se requiere leadId o contactId' }, { status: 400 })
    }

    if (leadId && contactId) {
      return NextResponse.json({ error: 'Solo se puede especificar leadId o contactId, no ambos' }, { status: 400 })
    }

    if (!pais || !tipoIdFiscal || !idFiscal) {
      return NextResponse.json({ error: 'País, tipo de ID fiscal y número de ID fiscal son requeridos' }, { status: 400 })
    }

    // Validar que el lead/contact exista y pertenezca al tenant (Base de Datos aislada)
    if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, tenantId: tenantId }
      })
      if (!lead) {
        return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
      }
      
      const perfilExistente = await prisma.perfilFiscalCliente.findFirst({
        where: { leadId, tenantId }
      })
      if (perfilExistente) {
        return NextResponse.json(
          { error: 'Este lead ya tiene un perfil fiscal configurado', perfilId: perfilExistente.id },
          { status: 409 }
        )
      }
    }

    if (contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, tenantId: tenantId }
      })
      if (!contact) {
        return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })
      }
      
      const perfilExistente = await prisma.perfilFiscalCliente.findFirst({
        where: { contactId, tenantId }
      })
      if (perfilExistente) {
        return NextResponse.json(
          { error: 'Este contacto ya tiene un perfil fiscal configurado', perfilId: perfilExistente.id },
          { status: 409 }
        )
      }
    }

    // Validar ID fiscal (Lógica de negocio independiente de la DB)
    const validacion = validateFiscalId(pais, tipoIdFiscal, idFiscal)
    if (!validacion.valid) {
      return NextResponse.json({ error: `ID Fiscal inválido: ${validacion.error}` }, { status: 400 })
    }

    // Crear perfil fiscal en la BD del Tenant
    const perfil = await prisma.perfilFiscalCliente.create({
      data: {
        tenantId: tenantId,
        leadId: leadId || null,
        contactId: contactId || null,
        razonSocial,
        pais,
        tipoIdFiscal,
        idFiscal: validacion.formatted || idFiscal,
        regimenFiscal,
        idIntracomunitario: idIntracomunitario?.toUpperCase() || null,
        direccionFiscal,
        ciudadFiscal,
        estadoFiscal,
        codigoPostalFiscal,
        exentoImpuestos,
        motivoExencion: exentoImpuestos ? motivoExencion : null,
        aplicaRetencion,
        idFiscalValidado: validacion.valid
      } as any,
      include: {
        lead: { select: { id: true, nombre: true, email: true } },
        contact: { select: { id: true, nombre: true, email: true } }
      }
    })

    return NextResponse.json(perfil, { status: 201 })
  } catch (error) {
    console.error('Error al crear perfil fiscal:', error)
    return NextResponse.json(
      { error: 'Error al crear perfil fiscal' },
      { status: 500 }
    )
  }
}, ['config:write', 'leads:write', 'contacts:write'])
