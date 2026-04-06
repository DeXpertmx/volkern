export const dynamic = 'force-dynamic';

/**
 * Anytimebot Appointment Sync Webhook
 * Receives booking/appointment data from Anytimebot
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { transformAnytimebotBooking, validateAnytimebotWebhook, type AnytimebotBooking } from '@/lib/anytimebot';
import { triggerAutomation } from '@/lib/automation-engine';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('\n========== ANYTIMEBOT CITAS WEBHOOK RECEIVED ==========');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', {
      signature: request.headers.get('x-anytimebot-signature'),
      contentType: request.headers.get('content-type'),
      userAgent: request.headers.get('user-agent'),
    });
    
    const payload: any = await request.json();
    console.log('Payload received:', JSON.stringify(payload, null, 2));
    
    // Validate webhook signature (placeholder for future implementation)
    const signature = request.headers.get('x-anytimebot-signature') || '';
    if (!validateAnytimebotWebhook(signature, payload)) {
      console.error('❌ Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    // Determine event type (BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_RESCHEDULED)
    const eventType = payload.eventType || payload.event || 'BOOKING_CREATED';
    console.log(`✓ Event type: ${eventType}`);

    // Validate required fields
    console.log('🔍 Validating required fields...');
    if (!payload.clientEmail && !payload.clientPhone) {
      console.error('❌ Missing client contact info');
      return NextResponse.json(
        { error: 'Email o teléfono del cliente requerido' },
        { status: 400 }
      );
    }

    if (!payload.date || !payload.time) {
      console.error('❌ Missing date/time');
      return NextResponse.json(
        { error: 'Fecha y hora de la cita requeridas' },
        { status: 400 }
      );
    }
    console.log('✓ Required fields validated');

    // Find tenant by Anytimebot integration
    console.log('🔍 Looking for active Anytimebot integration...');
    const integration = await prisma.anytimebotIntegration.findFirst({
      where: {
        activo: true,
        sincronizarCitas: true,
      },
      include: {
        tenant: true,
      },
    });

    if (!integration) {
      console.error('❌ No active integration found');
      return NextResponse.json(
        { error: 'No se encontró integración activa de Anytimebot' },
        { status: 404 }
      );
    }

    const tenantId = integration.tenantId;
    console.log(`✓ Integration found - TenantID: ${tenantId}`);

    // Find or create lead for the booking
    let lead = await prisma.lead.findFirst({
      where: {
        tenantId,
        OR: [
          payload.clientEmail ? { email: payload.clientEmail } : {},
          payload.clientPhone ? { telefono: payload.clientPhone } : {},
        ].filter(condition => Object.keys(condition).length > 0),
      },
    });

    if (!lead) {
      // Create new lead for this booking
      lead = await prisma.lead.create({
        data: {
          tenantId,
          nombre: payload.clientName,
          email: payload.clientEmail || '',
          telefono: payload.clientPhone || null,
          fuente: 'Anytimebot - Booking',
          estado: 'interesado',
          scoreValue: 50, // Higher score for booking
          notas: `Lead creado automáticamente desde reserva en Anytimebot\nReserva ID: ${payload.id}`,
          tags: 'anytimebot,cita-agendada',
          fechaUltimaActividad: new Date(),
        },
      });

      // Log lead creation
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: 'system',
          accion: 'lead_creado',
          entidad: 'Lead',
          entidadId: lead.id,
          descripcion: `Lead creado desde reserva de Anytimebot - Booking ID: ${payload.id}`,
        },
      });
    } else {
      // Update existing lead with booking reference
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          fechaUltimaActividad: new Date(),
          estado: 'interesado', // Upgrade status if they booked
          notas: `${lead.notas || ''}\n\nNueva reserva desde Anytimebot (${new Date().toLocaleString()})\nReserva ID: ${payload.id}`,
        },
      });
    }

    // Find or create a default service for Anytimebot bookings
    let servicio = await prisma.servicio.findFirst({
      where: {
        tenantId,
        nombre: 'Consulta desde Anytimebot',
      },
    });

    if (!servicio) {
      servicio = await prisma.servicio.create({
        data: {
          tenantId,
          nombre: 'Consulta desde Anytimebot',
          descripcion: 'Servicio genérico para citas agendadas vía Anytimebot',
          duracionMinutos: payload.duration || 60,
          precio: 0,
          moneda: 'EUR',
          activo: true,
        },
      });
    }

    // Transform booking data
    const citaData = transformAnytimebotBooking(payload);

    // Handle different event types
    if (eventType === 'BOOKING_CANCELLED' || eventType === 'booking_cancelled') {
      // Find existing appointment by booking ID or date/time
      const existingCita = await prisma.cita.findFirst({
        where: {
          tenantId,
          leadId: lead.id,
          OR: [
            { fechaHora: citaData.fechaHora },
            payload.id ? { descripcion: { contains: `Booking ID: ${payload.id}` } } : {},
          ].filter(condition => Object.keys(condition).length > 0),
        },
      });

      if (existingCita) {
        // Update appointment to cancelled status
        await prisma.cita.update({
          where: { id: existingCita.id },
          data: {
            estado: 'cancelada',
            descripcion: `${existingCita.descripcion || ''}\n\n[CANCELADA] - ${new Date().toLocaleString()}\nMotivo: Cancelada desde Anytimebot`,
          },
        });

        // Update lead notes
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            notas: `${lead.notas || ''}\n\nCita cancelada desde Anytimebot (${new Date().toLocaleString()})`,
            fechaUltimaActividad: new Date(),
          },
        });

        // Log audit event
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: 'system',
            accion: 'cita_cancelada',
            entidad: 'Cita',
            entidadId: existingCita.id,
            descripcion: `Cita cancelada desde Anytimebot - ${payload.clientName} - Booking ID: ${payload.id}`,
          },
        });

        // Trigger automation for appointment cancelled
        try {
          await triggerAutomation('cita_cancelada', {
            citaId: existingCita.id,
            leadId: lead.id,
            tenantId,
          });
        } catch (error) {
          console.error('Error triggering automation:', error);
        }

        // Update integration statistics
        await prisma.anytimebotIntegration.update({
          where: { id: integration.id },
          data: {
            ultimaSincronizacion: new Date(),
          },
        });

        return NextResponse.json({
          success: true,
          citaId: existingCita.id,
          leadId: lead.id,
          action: 'cancelled',
          message: 'Cita cancelada exitosamente',
        });
      }
    }

    if (eventType === 'BOOKING_RESCHEDULED' || eventType === 'booking_rescheduled') {
      // Find existing appointment
      const existingCita = await prisma.cita.findFirst({
        where: {
          tenantId,
          leadId: lead.id,
          OR: [
            payload.oldDate ? { fechaHora: new Date(`${payload.oldDate}T${payload.oldTime || '00:00'}`) } : {},
            payload.id ? { descripcion: { contains: `Booking ID: ${payload.id}` } } : {},
          ].filter(condition => Object.keys(condition).length > 0),
        },
      });

      if (existingCita) {
        // Update appointment with new date/time
        await prisma.cita.update({
          where: { id: existingCita.id },
          data: {
            ...citaData,
            descripcion: `${existingCita.descripcion || ''}\n\n[REPROGRAMADA] - ${new Date().toLocaleString()}\nFecha anterior: ${existingCita.fechaHora.toLocaleString()}\nNueva fecha: ${citaData.fechaHora.toLocaleString()}`,
          },
        });

        // Update lead notes
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            notas: `${lead.notas || ''}\n\nCita reprogramada desde Anytimebot (${new Date().toLocaleString()})\nAnterior: ${existingCita.fechaHora.toLocaleString()}\nNueva: ${citaData.fechaHora.toLocaleString()}`,
            fechaUltimaActividad: new Date(),
          },
        });

        // Log audit event
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: 'system',
            accion: 'cita_reprogramada',
            entidad: 'Cita',
            entidadId: existingCita.id,
            descripcion: `Cita reprogramada desde Anytimebot - ${payload.clientName} - Booking ID: ${payload.id}`,
          },
        });

        // Trigger automation for appointment rescheduled
        try {
          await triggerAutomation('cita_reprogramada', {
            citaId: existingCita.id,
            leadId: lead.id,
            tenantId,
          });
        } catch (error) {
          console.error('Error triggering automation:', error);
        }

        // Update integration statistics
        await prisma.anytimebotIntegration.update({
          where: { id: integration.id },
          data: {
            ultimaSincronizacion: new Date(),
          },
        });

        return NextResponse.json({
          success: true,
          citaId: existingCita.id,
          leadId: lead.id,
          action: 'rescheduled',
          message: 'Cita reprogramada exitosamente',
        });
      }
    }

    // Check if appointment already exists (for BOOKING_CREATED or update)
    const existingCita = await prisma.cita.findFirst({
      where: {
        tenantId,
        leadId: lead.id,
        fechaHora: citaData.fechaHora,
      },
    });

    if (existingCita) {
      // Update existing appointment
      await prisma.cita.update({
        where: { id: existingCita.id },
        data: {
          ...citaData,
        },
      });

      // Update integration statistics
      await prisma.anytimebotIntegration.update({
        where: { id: integration.id },
        data: {
          ultimaSincronizacion: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        citaId: existingCita.id,
        leadId: lead.id,
        action: 'updated',
        message: 'Cita actualizada exitosamente',
      });
    }

    // Create new appointment
    const newCita = await prisma.cita.create({
      data: {
        ...citaData,
        tenantId,
        leadId: lead.id,
        servicioId: servicio.id,
      },
    });

    // Update lead score (booking = +20 points)
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        scoreValue: Math.min((lead.scoreValue || 0) + 20, 100),
      },
    });

    // Update integration statistics
    await prisma.anytimebotIntegration.update({
      where: { id: integration.id },
      data: {
        totalCitasSincronizadas: { increment: 1 },
        ultimaSincronizacion: new Date(),
      },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: 'system',
        accion: 'cita_creada',
        entidad: 'Cita',
        entidadId: newCita.id,
        descripcion: `Cita sincronizada desde Anytimebot - ${payload.clientName} - Booking ID: ${payload.id}`,
      },
    });

    // Trigger automation for appointment booked
    try {
      await triggerAutomation(
        'cita_creada',
        {
          citaId: newCita.id,
          leadId: lead.id,
          tenantId,
        }
      );
    } catch (error) {
      console.error('Error triggering automation:', error);
      // Don't fail the webhook if automation fails
    }

    const processingTime = Date.now() - startTime;
    console.log(`\n✅ Cita creada exitosamente`);
    console.log(`   Cita ID: ${newCita.id}`);
    console.log(`   Lead ID: ${lead.id}`);
    console.log(`   Processing time: ${processingTime}ms`);
    console.log('========== WEBHOOK COMPLETED ==========\n');

    return NextResponse.json({
      success: true,
      citaId: newCita.id,
      leadId: lead.id,
      action: 'created',
      message: 'Cita creada exitosamente',
      processingTime: `${processingTime}ms`,
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('\n========== WEBHOOK ERROR ==========');
    console.error('Error processing Anytimebot booking webhook:', error);
    console.error('Processing time:', `${processingTime}ms`);
    console.error('========== ERROR END ==========\n');
    
    return NextResponse.json(
      {
        error: 'Error al procesar webhook de citas de Anytimebot',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
