export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { validateFiscalId, aplicaInversionSujetoPasivo, PAISES_UE, normalizarPais } from '@/lib/fiscal-validation'

// La tabla real (y el schema.prisma) usan nif/country/address/city/province/
// zipCode; la API y el componente trabajan con idFiscal/pais/direccionFiscal/
// ciudadFiscal/estadoFiscal/codigoPostalFiscal. Mapeamos en ambas direcciones
// para que el frontend funcione sin tocar la BD (las migraciones nuevas nunca
// se aplicaron a Neon; la columna real es la vieja). Además normalizamos el
// país a su código (la BD guardó nombres como 'España' en perfiles viejos).
function mapearPerfil(p: any) {
  return {
    ...p,
    idFiscal: p.nif ?? null,
    pais: normalizarPais(p.country),
    direccionFiscal: p.address ?? null,
    ciudadFiscal: p.city ?? null,
    estadoFiscal: p.province ?? null,
    codigoPostalFiscal: p.zipCode ?? null,
  };
}

// Mapeo nombre API (nuevo) -> columna real (vieja)
const CAMPO_BD: Record<string, string> = {
  idFiscal: 'nif',
  pais: 'country',
  direccionFiscal: 'address',
  ciudadFiscal: 'city',
  estadoFiscal: 'province',
  codigoPostalFiscal: 'zipCode',
}

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
      perfiles: perfiles.map(mapearPerfil),
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

    // Normalizar nombre de país -> código (p. ej. 'España' -> 'ES')
    const paisNormalizado = normalizarPais(pais) || pais;

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
    const validacion = validateFiscalId(paisNormalizado, tipoIdFiscal, idFiscal)
    if (!validacion.valid) {
      return NextResponse.json({ error: `ID Fiscal inválido: ${validacion.error}` }, { status: 400 })
    }

    // Crear perfil fiscal en la BD del Tenant (columnas reales: nif/country/...)
    const perfil = await prisma.perfilFiscalCliente.create({
      data: {
        tenantId: tenantId,
        leadId: leadId || null,
        contactId: contactId || null,
        razonSocial,
        nif: validacion.formatted || idFiscal,
        country: paisNormalizado,
        tipoIdFiscal,
        regimenFiscal,
        idIntracomunitario: idIntracomunitario?.toUpperCase() || null,
        address: direccionFiscal,
        city: ciudadFiscal,
        province: estadoFiscal,
        zipCode: codigoPostalFiscal,
        exentoImpuestos,
        motivoExencion: exentoImpuestos ? motivoExencion : null,
        aplicaRetencion,
        idFiscalValidado: validacion.valid
      },
      include: {
        lead: { select: { id: true, nombre: true, email: true } },
        contact: { select: { id: true, nombre: true, email: true } }
      }
    })

    return NextResponse.json(mapearPerfil(perfil), { status: 201 })
  } catch (error) {
    console.error('Error al crear perfil fiscal:', error)
    return NextResponse.json(
      { error: 'Error al crear perfil fiscal' },
      { status: 500 }
    )
  }
}, ['config:write', 'leads:write', 'contacts:write'])
