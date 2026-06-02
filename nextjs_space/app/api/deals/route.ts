export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma, getTenantDb, dbContext } from '@/lib/db'
import { createSystemContext } from '@/lib/skills/context';
import { withTenantAuth } from '@/lib/api-key-auth'
import { hasPermission, canOnlySeeOwnLeads } from '@/lib/permissions'
import { AdoptionTelemetry } from '@/lib/telemetry/adoption-kpis';
import { validateBody } from '@/lib/validation';
import { DealCreateSchema } from '@/lib/validation/schemas';

// GET /api/deals - Listar deals con filtros (Base de Datos aislada del Tenant)
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const currentUser = auth.user!;

    // Telemetry: Track Hub View
    AdoptionTelemetry.trackHubView(tenantId, currentUser.id, 'SALES').catch(() => {});

    // Verificar permiso de ver deals (pipeline)
    if (!hasPermission(currentUser, 'leads', 'ver')) {
      return NextResponse.json({ error: 'Sin permiso para ver el pipeline' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const etapa = searchParams.get('etapa')
    const estado = searchParams.get('estado')
    const usuarioAsignadoId = searchParams.get('usuarioAsignadoId')
    const leadId = searchParams.get('leadId')
    const contactId = searchParams.get('contactId')
    const catalogoItemId = searchParams.get('catalogoItemId')
    const search = searchParams.get('search')

    const where: any = {
      tenantId: tenantId,
    }

    // Aislamiento de propiedad: Agentes solo ven sus propios deals
    if (canOnlySeeOwnLeads(currentUser)) {
      where.usuarioAsignadoId = currentUser.id
    } else if (usuarioAsignadoId) {
      where.usuarioAsignadoId = usuarioAsignadoId
    }

    if (etapa) where.etapa = etapa
    if (estado) where.estado = estado
    if (leadId) where.leadId = leadId
    if (contactId) where.contactId = contactId
    if (catalogoItemId) where.catalogoItemId = catalogoItemId
    
    if (search) {
      where.OR = [
        { titulo: { contains: search, mode: 'insensitive' } },
        { descripcion: { contains: search, mode: 'insensitive' } },
      ]
    }

    // El proxy redirige a la base de datos física del tenant
    const deals = await prisma.deal.findMany({
      where,
      include: {
        lead: {
          select: { id: true, nombre: true, email: true, telefono: true, empresa: true },
        },
        contact: {
          select: { id: true, nombre: true, email: true, telefono: true, tipo: true, cargo: true, ubicacion: true },
        },
        company: {
          select: { id: true, nombre: true, email: true, telefono: true },
        },
        propiedad: {
          select: { id: true, nombre: true, tipo: true, precioBase: true, moneda: true },
        },
        usuarioAsignado: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { cotizaciones: true, actividades: true },
        },
      },
      orderBy: { fechaActualizacion: 'desc' },
    })

    // Calcular métricas locales al tenant
    const totalValor = deals.reduce((sum, deal) => sum + deal.valor, 0)
    const valorPonderado = deals.reduce((sum, deal) => {
      if (deal.estado === 'activo') {
        return sum + (deal.valor * deal.probabilidad / 100)
      }
      return sum
    }, 0)

    const metrics = {
      totalDeals: deals.length,
      totalValor,
      valorPonderado,
      gapAnalysis: 100000 - valorPonderado, // Meta estática temporal
      porEtapa: deals.reduce((acc: any, deal) => {
        acc[deal.etapa] = (acc[deal.etapa] || 0) + 1
        return acc
      }, {}),
      porEstado: deals.reduce((acc: any, deal) => {
        acc[deal.estado] = (acc[deal.estado] || 0) + 1
        return acc
      }, {}),
    }

    return NextResponse.json({ deals, metrics })
  } catch (error: any) {
    console.error('Error al obtener deals:', error)
    return NextResponse.json({ 
      deals: [], 
      metrics: { totalDeals: 0, totalValor: 0, valorPonderado: 0 },
      fallback: true,
      error: error.message 
    })
  }
}, ['deals:read', 'leads:read'])

// POST /api/deals - Crear nuevo deal en la BD del Tenant
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const currentUser = auth.user!;

    // Verificar permiso de crear deals (pipeline)
    if (!hasPermission(currentUser, 'leads', 'crear')) {
      return NextResponse.json({ error: 'Sin permiso para crear deals' }, { status: 403 })
    }

    const body = await req.json()
    const data = validateBody(DealCreateSchema, body);
    if (data instanceof NextResponse) return data;

    const {
      leadId,
      contactId,
      newContact,
      titulo,
      descripcion,
      valor,
      moneda = 'EUR',
      etapa = 'calificacion',
      probabilidad = 25,
      prioridad = 'media',
      fechaEstimadaCierre,
      origen,
      tags,
      usuarioAsignadoId,
      catalogoItemId,
    } = data;

    let finalContactId = contactId
    let companyId = null

    // Manejar el contacto en la DB aislada
    if (newContact) {
      const { nombre, email, telefono, tipo, cargo, ubicacion, linkedin, notas, tags: contactTags, companyId: newCompanyId } = newContact
      
      if (!nombre || !email) {
        return NextResponse.json({ error: 'Nombre y email del contacto son requeridos' }, { status: 400 })
      }

      const existingContact = await prisma.contact.findFirst({
        where: { tenantId: tenantId, email },
      })

      if (existingContact) {
        return NextResponse.json({ error: 'El email ya está registrado para otro contacto en este tenant.' }, { status: 400 })
      }

      const newContactData = await prisma.contact.create({
        data: {
          tenantId: tenantId,
          nombre,
          email,
          telefono,
          tipo: tipo || 'person',
          cargo,
          ubicacion,
          linkedin,
          notas,
          tags: contactTags,
          companyId: newCompanyId,
        },
      })

      finalContactId = newContactData.id
      companyId = newCompanyId
    } else if (contactId) {
      const existingContact = await prisma.contact.findFirst({
        where: { id: contactId, tenantId: tenantId },
      })
      if (!existingContact) {
        return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })
      }
      finalContactId = existingContact.id
      companyId = existingContact.tipo === 'person' ? existingContact.companyId : null
    } else if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, tenantId: tenantId },
      })
      if (!lead) {
        return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
      }
      if (lead.convertedToContactId) {
        finalContactId = lead.convertedToContactId
      } else {
        return NextResponse.json({ error: 'El lead debe convertirse primero.' }, { status: 400 })
      }
    }

    // Crear el deal en la BD aislada
    const deal = await prisma.deal.create({
      data: {
        tenantId: tenantId,
        leadId,
        contactId: finalContactId,
        companyId,
        usuarioAsignadoId: usuarioAsignadoId || currentUser.id,
        titulo,
        descripcion,
        valor: parseFloat(valor),
        moneda,
        etapa,
        probabilidad: parseInt(probabilidad),
        prioridad,
        fechaEstimadaCierre: fechaEstimadaCierre ? new Date(fechaEstimadaCierre) : null,
        origen,
        tags,
        catalogoItemId: catalogoItemId || null,
        fechaUltimaActividad: new Date(),
      },
      include: {
        lead: true,
        contact: true,
        company: true,
        propiedad: { select: { id: true, nombre: true, tipo: true, precioBase: true } },
        usuarioAsignado: { select: { id: true, name: true, email: true } },
      },
    })

    // Registrar actividad en la DB aislada
    await prisma.dealActivity.create({
      data: {
        dealId: deal.id,
        tenantId: tenantId,
        userId: currentUser.id,
        tipo: 'creacion',
        titulo: 'Deal creado',
        descripcion: `Deal "${titulo}" creado con valor ${valor} ${moneda}`,
      },
    })

    // Audit log
    const { AuditService } = await import('@/lib/audit-service');
    const requestIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;
    await AuditService.log({
      tenantId: tenantId,
      userId: currentUser.id,
      action: 'crear',
      entity: 'deal',
      entityId: deal.id,
      description: `Usuario ${currentUser.name} creó el deal "${titulo}"`,
      changesAfter: deal,
      ipAddress: requestIp,
      userAgent
    });

    // Notificación por Telegram al admin
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    notifyByTelegram(
      `🤝 *Nuevo Deal*\n\n📝 *Nombre:* ${titulo}\n💰 *Valor:* ${valor} ${moneda}\n👤 *Cliente:* ${deal.lead?.nombre || 'Sin cliente'}\n📊 *Etapa:* ${etapa}`,
      createSystemContext(tenantId)
    ).catch(err => console.error('Error en Notificación Telegram:', err))

    return NextResponse.json({ deal }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear deal:', error)
    return NextResponse.json({ error: 'Error al crear deal' }, { status: 500 })
  }
}, ['deals:write', 'leads:write'])
