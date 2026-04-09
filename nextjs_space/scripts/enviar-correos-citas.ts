import { PrismaClient } from '@prisma/client';
import { sendAppointmentConfirmation } from '@/lib/email';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// No necesitamos inicializar resend directamente aquí ya que usamos lib/email.ts
// const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app';

async function enviarCorreosCitas() {
  console.log('🔍 Buscando citas pendientes...\n');

  try {
    const citas = await prisma.cita.findMany({
      where: {
        estado: { in: ['pendiente', 'programada'] },
        fechaHora: { gte: new Date() },
      },
      include: {
        lead: { select: { id: true, nombre: true, email: true } },
        servicio: { select: { id: true, nombre: true, precio: true, moneda: true, descripcion: true } },
        tenant: { select: { nombre: true } },
      },
      orderBy: { fechaHora: 'asc' },
    });

    const citasElegibles = citas.filter(c => c.lead?.email && c.servicio);
    
    console.log(`📅 Citas futuras encontradas: ${citas.length}`);
    console.log(`✉️ Elegibles para correo (con email y servicio): ${citasElegibles.length}\n`);

    if (citasElegibles.length === 0) {
      console.log('No hay citas elegibles para enviar correos.');
      await prisma.$disconnect();
      return;
    }

    let enviados = 0;
    let errores = 0;

    for (const cita of citasElegibles) {
      const lead = cita.lead!;
      const servicio = cita.servicio!;
      
      console.log(`📧 Enviando a: ${lead.nombre} <${lead.email}>`);
      console.log(`   Cita: ${servicio.nombre} - ${cita.fechaHora.toLocaleString('es-MX')}`);

      try {
        const finalResult = await sendAppointmentConfirmation({
          id: cita.id,
          lead: { nombre: lead.nombre, email: lead.email },
          servicio: {
            nombre: servicio.nombre,
            descripcion: servicio.descripcion,
            precio: servicio.precio,
            moneda: servicio.moneda
          },
          fechaHora: cita.fechaHora,
          tenantNombre: cita.tenant?.nombre || undefined,
          tenantId: cita.tenantId || '',
        });

        if (!finalResult.success) {
          console.log(`   ❌ Error: ${finalResult.error}`);
          errores++;
        } else {
          console.log(`   ✅ Enviado correctamente`);
          enviados++;
        }
      } catch (err: any) {
        console.log(`   ❌ Error: ${err.message}`);
        errores++;
      }

      console.log('');
    }

    console.log('─────────────────────────────');
    console.log(`✅ Enviados: ${enviados}`);
    console.log(`❌ Errores: ${errores}`);
    console.log('─────────────────────────────');
  } catch (globalError: any) {
    console.error('❌ Error global en el script:', globalError.message);
  } finally {
    await prisma.$disconnect();
  }
}

enviarCorreosCitas();
