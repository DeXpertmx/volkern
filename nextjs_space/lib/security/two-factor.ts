import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/ses-email';

export class TwoFactorService {
  /**
   * Genera un código de 6 dígitos y lo guarda en el usuario
   */
  static async generateCode(userId: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Usamos SQL directo para evitar errores de desincronización de Prisma
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "twoFactorCode" = $1, "twoFactorExpires" = $2 WHERE id = $3`,
      code,
      expires,
      userId
    );

    return code;
  }

  /**
   * Envía el código de verificación por email
   */
  static async sendVerificationEmail(email: string, code: string) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #4F46E5; text-align: center;">Código de Seguridad Volkern</h2>
        <p style="font-size: 16px; color: #374151;">Para completar tu inicio de sesión, introduce el siguiente código de verificación:</p>
        <div style="background-color: #F3F4F6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #111827;">${code}</span>
        </div>
        <p style="font-size: 14px; color: #6B7280; text-align: center;">Este código caducará en 10 minutos. Si no has intentado iniciar sesión, puedes ignorar este correo.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9CA3AF; text-align: center;">Volkern CRM - Potenciando tu negocio con IA</p>
      </div>
    `;

    return await sendEmail({
      to: email,
      subject: `Tu código de verificación: ${code}`,
      html,
    });
  }

  /**
   * Verifica si el código es válido
   */
  static async verifyCode(userId: string, code: string) {
    // Usamos SQL directo para leer los campos de seguridad
    const rawData: any[] = await prisma.$queryRawUnsafe(
      `SELECT "twoFactorCode", "twoFactorExpires" FROM "User" WHERE id = $1`,
      userId
    );

    const firstRow = rawData[0] || {};
    const dbCode = firstRow.twoFactorCode || firstRow.twofactorcode;
    const dbExpires = firstRow.twoFactorExpires || firstRow.twofactorexpires;

    if (!dbCode || !dbExpires) {
      return false;
    }

    const now = new Date();
    if (now > new Date(dbExpires)) {
      return false;
    }

    if (dbCode !== code) {
      return false;
    }

    // Limpiar código tras verificación exitosa con SQL directo
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "twoFactorCode" = NULL, "twoFactorExpires" = NULL WHERE id = $1`,
      userId
    );

    return true;
  }
}
