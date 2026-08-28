export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendNewLeadNotification } from '@/lib/email';
import { triggerAutomation } from '@/lib/automation-engine';
import { findDigitalCardByUrlUnica } from '@/lib/public-slug-lookup';

/**
 * POST /api/tarjetas-digitales/connect
 * Crea un lead desde una tarjeta digital pública
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { cardId, nombre, email, telefono, empresa, nota } = body;

        // 1. Validar la tarjeta digital pública (scoping por tenant + fallback global)
        const card = await findDigitalCardByUrlUnica(cardId, request.headers.get('x-tenant-subdomain'), {
            select: {
                id: true,
                tenantId: true,
                userId: true,
                nombre: true, // Nombre del dueño de la tarjeta
            },
        });

        if (!card) {
            return NextResponse.json(
                { error: 'La tarjeta especificada no es válida o no existe' },
                { status: 404 }
            );
        }

        if (!email && !telefono) {
            return NextResponse.json(
                { error: 'Email o teléfono son obligatorios para conectar' },
                { status: 400 }
            );
        }

        // 2. Buscar si ya existe un lead con ese email o teléfono en ese Tenant
        let existingLead = null;
        if (email) {
            existingLead = await prisma.lead.findFirst({
                where: {
                    tenantId: card.tenantId,
                    email: email,
                },
            });
        }

        if (!existingLead && telefono) {
            existingLead = await prisma.lead.findFirst({
                where: {
                    tenantId: card.tenantId,
                    telefono: telefono,
                },
            });
        }

        let lead;
        const dateStr = new Date().toLocaleDateString('es-MX');

        if (existingLead) {
            // ACTUALIZAR lead existente (Interacción registrada)
            lead = await prisma.lead.update({
                where: { id: existingLead.id },
                data: {
                    nombre: nombre || existingLead.nombre,
                    empresa: empresa || existingLead.empresa,
                    cargo: existingLead.cargo, // Preservamos si ya existe
                    telefono: telefono || existingLead.telefono,
                    email: email || existingLead.email,
                    notas: `${existingLead.notas || ''}\n\n[Conexión vía Tarjeta Digital (${card.nombre}) - ${dateStr}]: ${nota || 'Sin mensaje adicional'}`,
                    fechaUltimaActividad: new Date(),
                    scoreValue: (existingLead.scoreValue || 0) + 15,
                },
            });

            // Agregar nota estructurada
            await prisma.note.create({
                data: {
                    leadId: lead.id,
                    contenido: `Conectó pulsando "Intercambiar Contacto" en la tarjeta digital de ${card.nombre}. Mensaje: ${nota || 'Sin mensaje.'}`,
                    creadoPor: card.userId, // Atribuido al dueño de la tarjeta
                },
            });
        } else {
            // CREAR nuevo lead
            lead = await prisma.lead.create({
                data: {
                    tenantId: card.tenantId,
                    asignadoA: card.userId, // Auto-asignado al dueño de la tarjeta
                    nombre: nombre || 'Prospecto Web (Tarjeta)',
                    email: email || `prospecto-${Date.now()}@tarjeta.volkern.com`,
                    telefono: telefono || null,
                    empresa: empresa || null,
                    fuente: 'tarjeta-digital-publica',
                    estado: 'nuevo',
                    scoreValue: 40,
                    notas: `Lead creado desde la Tarjeta Digital de ${card.nombre} el ${dateStr}. Mensaje: ${nota || 'Sin mensaje.'}`,
                    tags: JSON.stringify(['tarjeta-digital', 'público']),
                },
            });

            // Agregar nota inicial
            await prisma.note.create({
                data: {
                    leadId: lead.id,
                    contenido: `Nuevo contacto recibido desde Tarjeta Digital. Mensaje: ${nota || 'Sin mensaje.'}`,
                    creadoPor: card.userId,
                },
            });
        }

        // 3. Notificar al dueño de la tarjeta (si hay sistema de notificaciones listo)
        try {
            await sendNewLeadNotification({
                nombre: lead.nombre,
                email: lead.email,
                telefono: lead.telefono,
                notas: `[VIA TARJETA DIGITAL] ${nota || 'Interesado en conectar'}`,
                tenantId: card.tenantId,
            });
        } catch (notifErr) {
            console.error('Error enviando notificación de lead desde tarjeta:', notifErr);
        }

        // 4. Disparar automatizaciones
        await triggerAutomation('nuevo_lead', {
            leadId: lead.id,
            lead: lead,
            source: 'digital_card'
        });

        return NextResponse.json({
            success: true,
            message: 'Contacto compartido exitosamente',
        });
    } catch (error) {
        console.error('Error in /api/tarjetas-digitales/connect:', error);
        return NextResponse.json(
            { error: 'Error interno al procesar el contacto' },
            { status: 500 }
        );
    }
}
