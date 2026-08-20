import { NextRequest, NextResponse } from 'next/server'
export const dynamic = "force-dynamic";
import { prisma } from '@/lib/db'
import { createSystemContext } from '@/lib/skills/context'
import { sendNewLeadNotification } from '@/lib/email'
import { triggerAutomation } from '@/lib/automation-engine'
import { ScoringEngine } from '@/lib/scoring-engine'
import { validateLimit } from '@/lib/limits'
import { withTenantAuth } from '@/lib/api-key-auth'
import { assignLeadAutomatically } from '@/lib/leads/assignment'
import { AdoptionTelemetry } from '@/lib/telemetry/adoption-kpis';
import { checkFeatureLimit, incrementUsage } from '@/lib/subscription';
import { validateBody } from '@/lib/validation';
import { LeadCreateSchema } from '@/lib/validation/schemas';
import * as crypto from 'crypto'

/**
 * Handle GET leads - Ahora usando withTenantAuth para aislamiento mágico
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    // Telemetry
    AdoptionTelemetry.trackHubView(tenantId, auth.user!.id, 'LEADS').catch(() => {});

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('search') || searchParams.get('q')
    const estado = searchParams.get('estado') || searchParams.get('etapa')
    const empresa = searchParams.get('empresa')
    const assignedToMe = searchParams.get('assignedToMe')
    const unassigned = searchParams.get('unassigned')
    const fechaDesde = searchParams.get('fechaDesde')
    const fechaHasta = searchParams.get('fechaHasta')

    const whereClause: any = {
      tenantId: auth.tenant!.id,
    }

    if (estado && estado !== 'all' && estado !== 'todos') {
      whereClause.estado = estado
    }

    if (empresa) {
      whereClause.empresa = { contains: empresa, mode: 'insensitive' }
    }

    if (assignedToMe === 'true') {
      whereClause.asignadoUsuarioId = auth.user!.id
    } else if (unassigned === 'true') {
      whereClause.asignadoUsuarioId = null
    }

    // Filtro por rango de fechas (fechaCreacion)
    if (fechaDesde || fechaHasta) {
      const fechaFilter: any = {}
      if (fechaDesde) {
        fechaFilter.gte = new Date(fechaDesde + 'T00:00:00.000Z')
      }
      if (fechaHasta) {
        fechaFilter.lte = new Date(fechaHasta + 'T23:59:59.999Z')
      }
      whereClause.fechaCreacion = fechaFilter
    }

    if (query) {
      whereClause.OR = [
        { nombre: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { telefono: { contains: query, mode: 'insensitive' } },
        { empresa: { contains: query, mode: 'insensitive' } },
      ]
    }

    // Aquí usamos 'prisma' DIRECTAMENTE. 
    // Gracias al wrapper 'withTenantAuth', este 'prisma' ya apunta a la DB del tenant.
    const leads = await prisma.lead.findMany({
      where: whereClause,
      include: {
        citas: {
          include: {
            servicio: true
          }
        },
        asignadoUsuario: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        score: true
      },
      orderBy: {
        fechaCreacion: 'desc'
      }
    })

    return NextResponse.json(leads)
  } catch (error: any) {
    console.error('[GET /api/leads] Error:', error)
    return NextResponse.json({ 
      data: [], 
      fallback: true, 
      error: 'Error al obtener leads' 
    })
  }
}, ['leads:read'])

/**
 * Handle POST leads - Aislamiento mágico también aquí
 */
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json()
    const data = validateBody(LeadCreateSchema, body);
    if (data instanceof NextResponse) return data;

    const {
      nombre,
      email,
      telefono,
      notas,
      empresa,
      contextoProyecto,
      cargo,
      ubicacion,
      direccion,
      ciudad,
      codigoPostal,
      pais,
      linkedin,
      scoreValue,
      fuente,
      canal,
      etapa,
      metadataExterna,
      tags
    } = data;

    // 1. Verificar límites de recursos (Usa globalPrisma internamente cuando es necesario)
    const limitCheck = await validateLimit(auth.tenant!.id, 'leads')
    if (!limitCheck.allowed) {
      return NextResponse.json(limitCheck.error, { status: limitCheck.error.status });
    }

    // 2. Buscar lead existente
    let existingLead = null
    if (email) {
      existingLead = await prisma.lead.findFirst({
        where: { email: email }
      })
    }

    if (!existingLead && telefono) {
      existingLead = await prisma.lead.findFirst({
        where: { telefono: telefono }
      })
    }

    let lead

    if (existingLead) {
      // Actualizar existente
      const updateData: any = {
        fechaUltimaActividad: new Date()
      }
      
      if (nombre) updateData.nombre = nombre
      if (telefono) updateData.telefono = telefono
      if (empresa) updateData.empresa = empresa
      if (contextoProyecto) updateData.contextoProyecto = contextoProyecto
      if (cargo) updateData.cargo = cargo
      if (ubicacion) updateData.ubicacion = ubicacion
      if (direccion) updateData.direccion = direccion
      if (ciudad) updateData.ciudad = ciudad
      if (codigoPostal) updateData.codigoPostal = codigoPostal
      if (pais) updateData.pais = pais
      if (linkedin) updateData.linkedin = linkedin
      if (scoreValue !== undefined) updateData.scoreValue = scoreValue
      if (fuente) updateData.fuente = fuente
      if (canal) updateData.canal = canal
      if (etapa) updateData.estado = etapa
      if (metadataExterna) updateData.metadataExterna = metadataExterna
      if (tags) updateData.tags = tags
      if (notas) {
        updateData.notas = notas
      }

      lead = await prisma.lead.update({
        where: { id: existingLead.id },
        data: updateData
      })

      // Notas correlacionadas
      if (notas?.trim()) {
        try {
          await prisma.note.create({
            data: {
              leadId: existingLead.id,
              contenido: notas,
              creadoPor: auth.user!.id,
              fechaCreacion: new Date()
            }
          })
        } catch (noteError) {
          console.error('[POST /api/leads] Error al crear Note:', noteError)
        }
      }
    } else {
      // Crear nuevo lead
      lead = await prisma.lead.create({
        data: {
          nombre: nombre || 'Sin nombre',
          email: email || '',
          telefono: telefono || null,
          notas: notas || null,
          empresa: empresa || null,
          contextoProyecto: contextoProyecto || null,
          cargo: cargo || null,
          ubicacion: ubicacion || null,
          direccion: direccion || null,
          ciudad: ciudad || null,
          codigoPostal: codigoPostal || null,
          pais: pais || null,
          linkedin: linkedin || null,
          scoreValue: scoreValue || 0,
          fuente: fuente || null,
          canal: canal || null,
          estado: etapa || 'nuevo',
          tags: tags || null,
          tenantId: auth.tenant!.id,
          metadataExterna: metadataExterna || {},
          tokenPublico: crypto.randomUUID(),
          fechaCreacion: new Date(),
          fechaUltimaActividad: new Date(),
        }
      })

      if (notas?.trim()) {
        try {
          await prisma.note.create({
            data: {
              leadId: lead.id,
              contenido: notas,
              creadoPor: auth.user!.id,
              fechaCreacion: new Date()
            }
          })
        } catch (noteError) {
          console.error('[POST /api/leads] Error al crear Note inicial:', noteError)
        }
      }
    }

    // Track usage after successful lead creation
    if (!existingLead && lead) {
      try {
        await incrementUsage(auth.tenant!.id, 'leads', 1);
      } catch (usageError) {
        console.error('[POST /leads] Error tracking usage:', usageError);
      }
    }

    // 2.5 Asignación automática inteligente
    if (!existingLead && lead) {
      try {
        await assignLeadAutomatically(lead.id, auth.tenant!.id)
        // Recargar el lead si fue asignado para que las notificaciones tengan el dato correcto
        const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } })
        if (updatedLead) lead = updatedLead
      } catch (assignError) {
        console.error('Error in auto-assignment:', assignError)
      }
    }

    // 3. Acciones Post-Lead (Automaciones, Notificaciones, Scoring)
    try {
      ScoringEngine.recalculateLeadScore(lead.id).catch(err => console.error('Error en Scoring:', err))

      // Usar el nombre canónico del trigger ('nuevo_lead') y pasar el contexto
      // con leadId + lead. Antes se disparaba 'lead.created' (que no coincide
      // con ningún trigger del builder, por lo que las automatizaciones de
      // "Nuevo Lead Creado" nunca se ejecutaban desde el dashboard) y el
      // payload no incluía leadId, dejando a las acciones sin lead objetivo.
      triggerAutomation('nuevo_lead', {
        leadId: lead.id,
        tenantId: auth.tenant!.id,
        lead: lead as any,
      } as any).catch(err => console.error('Error en Automación:', err))

      if (!existingLead) {
        sendNewLeadNotification({
          nombre: lead.nombre,
          email: lead.email,
          telefono: lead.telefono,
          notas: lead.notas,
          tenantId: auth.tenant!.id
        }).catch(err => console.error('Error en Notificación Email:', err))

        // Notificación por Telegram al admin
        const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
        notifyByTelegram(
          `🎯 *Nuevo Lead*\n\n👤 *Nombre:* ${lead.nombre}\n📧 *Email:* ${lead.email || 'No disponible'}\n📱 *Teléfono:* ${lead.telefono || 'No disponible'}\n🏢 *Empresa:* ${lead.empresa || 'No disponible'}`,
          createSystemContext(auth.tenant!.id)
        ).catch(err => console.error('Error en Notificación Telegram:', err))
      }
    } catch (apiError) {
      console.error('Error en servicios post-lead:', apiError)
    }

    return NextResponse.json(lead)
  } catch (error: any) {
    console.error('[POST /api/leads] Error:', error)
    return NextResponse.json({ error: 'Error al procesar lead' }, { status: 500 })
  }
}, ['leads:write'])
