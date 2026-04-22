import NordigenClient from 'nordigen-node';
import { prisma } from '@/lib/db';
import { skillsLogger } from '@/lib/skills/observability';

const client = new NordigenClient({
  secretId: process.env.NORDIGEN_SECRET_ID!,
  secretKey: process.env.NORDIGEN_SECRET_KEY!,
});

export class NordigenService {
  /**
   * Sincroniza movimientos bancarios de una conexión Nordigen
   */
  static async syncTransactions(bankConnectionId: string) {
    try {
      const connection = await prisma.bankConnection.findUnique({
        where: { id: bankConnectionId }
      });

      if (!connection || !connection.providerId) {
        throw new Error(`No se encontró providerId para la conexión ${bankConnectionId}`);
      }

      // 1. Obtener Token de Acceso
      // nordigen-node maneja el token internamente si se pasan las credenciales al constructor, 
      // pero a veces requiere una llamada inicial.
      await client.generateToken();

      // 2. Obtener transacciones
      const account = client.account(connection.providerId);
      const data = await account.getTransactions();
      
      const bookedTransactions = data.transactions?.booked || [];
      const newTransactions = [];

      skillsLogger.info(`[NordigenSync] Procesando ${bookedTransactions.length} transacciones para ${connection.bankName}`);

      for (const txn of bookedTransactions) {
        // Usar upsert para evitar duplicados si la restricción única existe, 
        // o verificar existencia manualmente para seguridad.
        const reference = txn.transactionId || txn.entryReference || `REF-${Date.now()}-${Math.random()}`;
        
        const exists = await prisma.bankTransaction.findFirst({
          where: {
            bankConnectionId,
            reference
          }
        });

        if (!exists) {
          const amount = parseFloat(txn.transactionAmount?.amount || '0');
          const description = txn.remittanceInformationUnstructured || 
                              txn.remittanceInformationUnstructuredArray?.join(' ') || 
                              'Sin descripción';

          newTransactions.push(
            prisma.bankTransaction.create({
              data: {
                bankConnectionId,
                date: new Date(txn.bookingDate || txn.valueDate),
                description,
                amount,
                reference,
                isReconciled: false,
              }
            })
          );
        }
      }

      if (newTransactions.length > 0) {
        await Promise.all(newTransactions);
      }

      // 3. Actualizar última sincronización
      await prisma.bankConnection.update({
        where: { id: bankConnectionId },
        data: { lastSync: new Date() }
      });

      skillsLogger.info(`[NordigenSync] Sincronización exitosa: ${newTransactions.length} nuevas.`);
      return { success: true, count: newTransactions.length };

    } catch (error: any) {
      skillsLogger.error(`[NordigenSync] Error sincronizando ${bankConnectionId}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sincroniza todas las conexiones activas
   */
  static async syncAllConnections() {
    const connections = await prisma.bankConnection.findMany({
      where: { providerId: { not: null } }
    });

    const results = [];
    for (const conn of connections) {
      results.push(await this.syncTransactions(conn.id));
    }

    return results;
  }
}
