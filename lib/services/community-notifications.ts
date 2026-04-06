import { sendEmail } from '@/lib/resend-email';
import { sendPushNotification, notifyAdminsPush } from '@/lib/services/push-notification';
import prisma from '@/lib/prisma';

interface NewThreadParams {
  instructorEmail: string;
  studentName: string;
  courseTitle: string;
  commentContent: string;
  courseUrl: string;
}

interface ReplyParams {
  recipientEmail: string;
  responderName: string;
  courseTitle: string;
  replyContent: string;
  threadUrl: string;
}

/**
 * Notifica al instructor que se ha iniciado una nueva discusión en el curso.
 */
export async function notifyNewCommunityThread({
  instructorEmail,
  studentName,
  courseTitle,
  commentContent,
  courseUrl,
}: NewThreadParams) {
  const subject = `🚀 Nueva discusión en: ${courseTitle}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #333;">¡Hola! Tienes una nueva consulta en tu curso.</h2>
      <p style="font-size: 16px; color: #555;">
        <strong>${studentName}</strong> ha iniciado un nuevo hilo de discusión en <strong>${courseTitle}</strong>:
      </p>
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; font-style: italic; color: #444; border-left: 4px solid #4f46e5; margin: 20px 0;">
        "${commentContent}"
      </div>
      <a href="${courseUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">
        Responder en la Academia
      </a>
      <p style="font-size: 12px; color: #999; margin-top: 30px;">
        Este es un mensaje automático de Volkern Academy.
      </p>
    </div>
  `;

  await sendEmail({
    to: instructorEmail,
    subject,
    html,
  });

  // Enviar Notificación Push al Instructor
  const instructor = await prisma.user.findUnique({
    where: { email: instructorEmail },
    select: { id: true }
  });
  
  if (instructor) {
    await sendPushNotification(instructor.id, {
      title: '🎓 Nueva consulta en tu curso',
      body: `${studentName} preguntó: "${commentContent.substring(0, 50)}..."`,
      data: { url: courseUrl }
    });
  }
  
  return { success: true };
}

/**
 * Notifica a un participante que alguien ha respondido a su comentario o en su hilo.
 */
export async function notifyCommunityReply({
  recipientEmail,
  responderName,
  courseTitle,
  replyContent,
  threadUrl,
}: ReplyParams) {
  const subject = `💬 Nueva respuesta en ${courseTitle}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #333;">Alguien ha respondido a tu comentario.</h2>
      <p style="font-size: 16px; color: #555;">
        <strong>${responderName}</strong> comentó en la discusión de <strong>${courseTitle}</strong>:
      </p>
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; color: #444; border-left: 4px solid #10b981; margin: 20px 0;">
        "${replyContent}"
      </div>
      <a href="${threadUrl}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">
        Ver la conversación
      </a>
      <p style="font-size: 12px; color: #999; margin-top: 30px;">
        Recibes este correo porque estás participando en esta discusión.
      </p>
    </div>
  `;

  await sendEmail({
    to: recipientEmail,
    subject,
    html,
  });

  // Enviar Notificación Push al recipiente de la respuesta
  const recipient = await prisma.user.findUnique({
    where: { email: recipientEmail },
    select: { id: true }
  });

  if (recipient) {
    await sendPushNotification(recipient.id, {
      title: '💬 Nueva respuesta en la comunidad',
      body: `${responderName}: "${replyContent.substring(0, 50)}..."`,
      data: { url: threadUrl }
    });
  }

  return { success: true };
}
