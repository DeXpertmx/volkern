import { PrismaClient } from '@prisma/client';
import { sendAppointmentConfirmation } from '../lib/email';

const prisma = new PrismaClient();

async function run() {
  try {
    const user = await prisma.user.findFirst({
      include: { tenant: true }
    });

    if (!user) {
      console.log('No users found in database');
      return;
    }

    console.log('User found:', user.email);

    let lead = await prisma.lead.findFirst({
      where: { tenantId: user.tenantId }
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          nombre: 'Test Lead',
          email: 'testlead@example.com',
          tenantId: user.tenantId,
          estado: 'nuevo'
        }
      });
    }

    let servicio = await prisma.servicio.findFirst({
      where: { tenantId: user.tenantId }
    });

    if (!servicio) {
      servicio = await prisma.servicio.create({
        data: {
          nombre: 'Test Service',
          duracionMinutos: 60,
          precio: 50.0,
          tenantId: user.tenantId
        }
      });
    }

    console.log('Calling sendAppointmentConfirmation...');
    const result = await sendAppointmentConfirmation({
      id: 'test-cita-id-123456789012',
      lead: { nombre: lead.nombre, email: lead.email },
      servicio: {
        nombre: servicio.nombre,
        descripcion: servicio.descripcion,
        precio: servicio.precio,
        moneda: servicio.moneda
      },
      fechaHora: new Date(),
      duracion: 60,
      tenantNombre: user.tenant?.nombre || 'Test Tenant',
      linkReunion: 'https://meet.google.com/abc-def',
      tenantId: user.tenantId!
    });

    console.log('Result of sendAppointmentConfirmation:', result);

  } catch (error) {
    console.error('CRITICAL ERROR in sendAppointmentConfirmation:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
