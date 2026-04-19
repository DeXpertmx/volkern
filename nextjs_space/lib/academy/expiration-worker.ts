import { prisma } from '@/lib/db';

/**
 * ExpirationWorker
 * Escanea certificados próximos a vencer y dispara alertas.
 */
export class ExpirationWorker {
  /**
   * Ejecuta el escaneo de expiraciones para un tenant o globalmente.
   */
  static async scanExpirations(tenantId?: string) {
    console.log(`[ExpirationWorker] Iniciando escaneo de certificados...`);
    
    // Buscar certificados que venzan en los próximos 30 días
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 30);

    const expiringCerts = await prisma.certificado.findMany({
      where: {
        tenantId: tenantId || undefined,
        fechaExpiracion: {
          lte: targetDate,
          gt: new Date() 
        }
      },
      include: {
        estudiante: {
          include: {
            tenant: {
              include: { users: { where: { estado: 'activo' } } }
            }
          }
        },
        curso: true
      }
    });

    // Filtro manual para evitar duplicados si la consulta JSON de Prisma falla
    const certsToProcess = expiringCerts.filter(c => {
      const meta = c.metadata as any;
      return !meta?.expirationAlertSent;
    });

    console.log(`[ExpirationWorker] Encontrados ${certsToProcess.length} certificados próximos a vencer.`);

    for (const cert of certsToProcess) {
      // 1. Notificar al estudiante (vía Telegram si está vinculado)
      // En este sistema, el Estudiante se vincula al Staff por email.
      const staffUser = cert.estudiante.tenant?.users.find(u => u.email === cert.estudiante.email);
      
      if (staffUser) {
        await this.notifyExpiration(staffUser, cert);
      }

      // 2. Marcar como alertado para no repetir
      await prisma.certificado.update({
        where: { id: cert.id },
        data: {
          metadata: {
            ...(cert.metadata as object || {}),
            expirationAlertSent: new Date().toISOString(),
            alertLevel: '30_DAYS'
          }
        }
      });
    }

    return { processed: expiringCerts.length };
  }

  /**
   * Envía la notificación (Placeholder para integración real con Telegram/Email)
   */
  private static async notifyExpiration(user: any, cert: any) {
    const daysRemaining = Math.ceil((new Date(cert.fechaExpiracion!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`[ALERT] Notificando a ${user.email}: Su certificado en "${cert.curso.titulo}" vence en ${daysRemaining} días.`);

    // 🏗️ INTEGRACIÓN CON TELEGRAM (Simulada)
    // if (user.telegramChatId) {
    //   await TelegramService.sendMessage(user.telegramChatId, `⚠️ *ALERTA DE ACADEMIA*\nTu certificación en *${cert.curso.titulo}* vence en ${daysRemaining} días. Debes renovarla para evitar bloqueos en planta.`);
    // }
  }
}
