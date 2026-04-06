
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const EMAIL_TEMPLATES = [
  {
    nombre: 'Bienvenida Simple',
    categoria: 'onboarding',
    asuntoPorDefecto: '¡Bienvenido a {empresa}!',
    contenidoHTML: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenida</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px;">¡Bienvenido!</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hola <strong>{nombre}</strong>,
              </p>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Nos complace darte la bienvenida. Estamos emocionados de tenerte con nosotros y queremos asegurarnos de que tengas la mejor experiencia posible.
              </p>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 30px;">
                Si tienes alguna pregunta, no dudes en contactarnos. Estamos aquí para ayudarte.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="{link_agendamiento}" style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                      Agendar una Llamada
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; font-size: 12px; margin: 0 0 10px;">
                Este correo fue enviado desde {empresa}
              </p>
              <p style="color: #999999; font-size: 12px; margin: 0;">
                {email} | {telefono}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    descripcion: 'Plantilla de bienvenida moderna y limpia para nuevos usuarios'
  },
  {
    nombre: 'Newsletter Mensual',
    categoria: 'newsletter',
    asuntoPorDefecto: 'Novedades de {empresa} - Este Mes',
    contenidoHTML: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Newsletter</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color: #1a202c; padding: 30px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Newsletter Mensual</h1>
              <p style="color: #a0aec0; margin: 10px 0 0; font-size: 14px;">Lo mejor del mes para ti</p>
            </td>
          </tr>
          
          <!-- Greeting -->
          <tr>
            <td style="padding: 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hola <strong>{nombre}</strong>,
              </p>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Aquí está tu resumen mensual con las actualizaciones más importantes y recursos que hemos preparado para ti.
              </p>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #f7fafc; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                    <h3 style="color: #2d3748; margin: 0 0 10px; font-size: 18px;">🚀 Novedades del Mes</h3>
                    <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0;">
                      [Inserta aquí tus novedades y actualizaciones más importantes]
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- CTA -->
          <tr>
            <td style="padding: 0 30px 30px;" align="center">
              <a href="{link_agendamiento}" style="display: inline-block; background-color: #4299e1; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                Agendar Consulta
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; font-size: 12px; margin: 0 0 10px;">
                {empresa} | {email}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    descripcion: 'Plantilla para newsletters y comunicaciones mensuales'
  },
  {
    nombre: 'Promoción Especial',
    categoria: 'promocion',
    asuntoPorDefecto: '🎉 Oferta Especial Solo para Ti',
    contenidoHTML: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Promoción</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 50px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 36px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                ¡OFERTA ESPECIAL!
              </h1>
              <p style="color: #ffffff; margin: 15px 0 0; font-size: 18px;">Solo por tiempo limitado</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hola <strong>{nombre}</strong>,
              </p>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Tenemos una oferta exclusiva especialmente para ti. No queremos que te lo pierdas.
              </p>
              
              <!-- Promo Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background-color: #fff5f5; border-left: 4px solid #f5576c; padding: 20px; border-radius: 6px;">
                    <h2 style="color: #c53030; margin: 0 0 10px; font-size: 24px;">
                      ¡Descuento Especial!
                    </h2>
                    <p style="color: #742a2a; font-size: 14px; line-height: 1.6; margin: 0;">
                      [Describe aquí tu oferta o promoción]
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 30px;">
                Esta oferta expira pronto. ¡No esperes más!
              </p>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 30px 40px;" align="center">
              <a href="{link_agendamiento}" style="display: inline-block; background-color: #f5576c; color: #ffffff; text-decoration: none; padding: 16px 50px; border-radius: 50px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(245,87,108,0.4);">
                Aprovechar Oferta
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                {empresa} | {email} | {telefono}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    descripcion: 'Plantilla llamativa para promociones y ofertas especiales'
  },
  {
    nombre: 'Seguimiento Post-Reunión',
    categoria: 'seguimiento',
    asuntoPorDefecto: 'Seguimiento de Nuestra Reunión',
    contenidoHTML: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seguimiento</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #48bb78; padding: 30px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Gracias por Tu Tiempo</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hola <strong>{nombre}</strong>,
              </p>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Fue un placer conversar contigo. Como seguimiento a nuestra reunión, quiero resumir los puntos clave que discutimos:
              </p>
              
              <!-- Key Points Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background-color: #f0fff4; border-left: 4px solid #48bb78; padding: 20px; border-radius: 6px;">
                    <h3 style="color: #22543d; margin: 0 0 15px; font-size: 18px;">Puntos Clave:</h3>
                    <ul style="color: #2f855a; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                      <li>Punto 1: [Añade aquí]</li>
                      <li>Punto 2: [Añade aquí]</li>
                      <li>Punto 3: [Añade aquí]</li>
                    </ul>
                  </td>
                </tr>
              </table>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 30px;">
                Si tienes alguna pregunta o necesitas aclarar algo, no dudes en contactarme.
              </p>
            </td>
          </tr>
          
          <!-- CTA -->
          <tr>
            <td style="padding: 0 30px 40px;" align="center">
              <a href="{link_agendamiento}" style="display: inline-block; background-color: #48bb78; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                Agendar Nueva Reunión
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; font-size: 12px; margin: 0 0 5px;">
                Saludos cordiales,
              </p>
              <p style="color: #666666; font-size: 14px; margin: 0 0 10px; font-weight: bold;">
                {empresa}
              </p>
              <p style="color: #999999; font-size: 12px; margin: 0;">
                {email} | {telefono}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    descripcion: 'Plantilla profesional para seguimiento después de reuniones'
  },
  {
    nombre: 'Recordatorio de Cita',
    categoria: 'recordatorio',
    asuntoPorDefecto: 'Recordatorio: Tu Cita con {empresa}',
    contenidoHTML: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recordatorio</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #ed8936; padding: 30px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">⏰ Recordatorio de Cita</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Hola <strong>{nombre}</strong>,
              </p>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 30px;">
                Este es un recordatorio amigable sobre tu próxima cita con nosotros:
              </p>
              
              <!-- Appointment Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td style="background-color: #fffaf0; border: 2px solid #ed8936; padding: 25px; border-radius: 8px; text-align: center;">
                    <p style="color: #7c2d12; font-size: 14px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 1px;">
                      Tu Cita
                    </p>
                    <p style="color: #9c4221; font-size: 24px; font-weight: bold; margin: 0 0 5px;">
                      [Fecha y Hora]
                    </p>
                    <p style="color: #c05621; font-size: 14px; margin: 0;">
                      Duración: [30/60 minutos]
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Si necesitas reagendar o tienes alguna pregunta, no dudes en contactarnos.
              </p>
            </td>
          </tr>
          
          <!-- CTA -->
          <tr>
            <td style="padding: 0 30px 40px;" align="center">
              <a href="{link_agendamiento}" style="display: inline-block; background-color: #ed8936; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                Gestionar Cita
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 30px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                {empresa} | {email} | {telefono}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    descripcion: 'Plantilla para recordatorios de citas y reuniones agendadas'
  }
];

async function seedEmailTemplates() {
  console.log('🌱 Iniciando seed de plantillas de email marketing...\n');

  try {
    // Obtener todos los tenants
    const tenants = await prisma.tenant.findMany();

    if (tenants.length === 0) {
      console.log('⚠️  No hay tenants en la base de datos.');
      return;
    }

    let totalCreated = 0;
    let totalUpdated = 0;

    for (const tenant of tenants) {
      console.log(`📧 Procesando tenant: ${tenant.nombre}`);

      for (const template of EMAIL_TEMPLATES) {
        // Verificar si ya existe
        const existing = await prisma.emailTemplate.findFirst({
          where: {
            tenantId: tenant.id,
            nombre: template.nombre
          }
        });

        if (existing) {
          // Actualizar
          await prisma.emailTemplate.update({
            where: { id: existing.id },
            data: {
              categoria: template.categoria,
              asuntoPorDefecto: template.asuntoPorDefecto,
              contenidoHTML: template.contenidoHTML,
              descripcion: template.descripcion,
              fechaActualizacion: new Date()
            }
          });
          totalUpdated++;
          console.log(`   ✓ ${template.nombre} actualizada`);
        } else {
          // Crear
          await prisma.emailTemplate.create({
            data: {
              tenantId: tenant.id,
              nombre: template.nombre,
              categoria: template.categoria,
              asuntoPorDefecto: template.asuntoPorDefecto,
              contenidoHTML: template.contenidoHTML,
              descripcion: template.descripcion
            }
          });
          totalCreated++;
          console.log(`   ✓ ${template.nombre} creada`);
        }
      }

      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Seed completado exitosamente');
    console.log(`   • Plantillas creadas: ${totalCreated}`);
    console.log(`   • Plantillas actualizadas: ${totalUpdated}`);
    console.log(`   • Tenants procesados: ${tenants.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('❌ Error en el seed de plantillas:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
seedEmailTemplates()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
