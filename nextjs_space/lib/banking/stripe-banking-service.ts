import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { skillsLogger } from '@/lib/skills/observability';

export class StripeBankingService {
  /**
   * Crea una sesión de Financial Connections para que el usuario vincule su banco
   */
  static async createConnectSession(tenantId: string) {
    try {
      // 1. Obtener o crear cliente de Stripe para el tenant
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { stripeCustomerId: true, nombre: true }
      });

      let stripeCustomerId = tenant?.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          name: tenant?.nombre || 'Tenant Volkern',
          address: { country: 'ES' }, // Forzamos España para que Stripe muestre bancos locales
          metadata: { tenantId }
        });
        stripeCustomerId = customer.id;
        
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { stripeCustomerId }
        });
      }

      // 2. Crear sesión vinculada al cliente
      const session = await stripe.financialConnections.sessions.create({
        account_holder: { type: 'customer', customer: stripeCustomerId },
        permissions: ['balances', 'ownership', 'transactions'],
        filters: { countries: ['ES'] }, // Intentamos forzar ES de nuevo ahora que ya hay registro
      });

      return session;
    } catch (error) {
      skillsLogger.error('Error creando sesión de Stripe Financial Connections', { error, tenantId });
      throw error;
    }
  }

  /**
   * Recupera las cuentas vinculadas de una sesión y las guarda en la DB
   */
  static async handleSessionCallback(tenantId: string, sessionId: string) {
    try {
      const session = await stripe.financialConnections.sessions.retrieve(sessionId, {
        expand: ['accounts'],
      });

      const connections = [];

      for (const account of session.accounts.data) {
        const connection = await prisma.bankConnection.upsert({
          where: { id: account.id }, // Usamos el ID de Stripe como nuestro ID o guardamos en providerId
          update: {
            status: 'ACTIVE',
            lastSync: new Date(),
          },
          create: {
            tenantId,
            provider: 'Stripe',
            providerId: account.id,
            bankName: account.institution_name,
            status: 'ACTIVE',
          },
        });
        connections.push(connection);
      }

      return connections;
    } catch (error) {
      skillsLogger.error('Error procesando callback de Stripe', { error, sessionId });
      throw error;
    }
  }

  /**
   * Sincroniza transacciones de una cuenta de Stripe
   */
  static async syncTransactions(bankConnectionId: string) {
    try {
      const connection = await prisma.bankConnection.findUnique({
        where: { id: bankConnectionId },
      });

      if (!connection || connection.provider !== 'Stripe') {
        throw new Error('Conexión no válida para Stripe');
      }

      // 1. Solicitar refresh de transacciones (es asíncrono en Stripe)
      // Nota: En una app real, esperaríamos al webhook 'financial_connections.account.refreshed_transactions'
      // Para esta implementación, intentamos listar directamente o iniciamos el refresh.
      await stripe.financialConnections.accounts.refresh(connection.providerId, {
        features: ['transactions'],
      });

      // 2. Listar transacciones
      const transactions = await stripe.financialConnections.transactions.list({
        account: connection.providerId,
        limit: 100,
      });

      const savedCount = 0;
      const newTransactions = [];

      for (const stxn of transactions.data) {
        // Evitar duplicados usando la referencia de Stripe
        const exists = await prisma.bankTransaction.findUnique({
          where: {
            bankConnectionId_reference: {
              bankConnectionId: connection.id,
              reference: stxn.id,
            },
          },
        });

        if (!exists) {
          const txn = await prisma.bankTransaction.create({
            data: {
              bankConnectionId: connection.id,
              date: new Date(stxn.transacted_at * 1000),
              description: stxn.description || 'Transacción bancaria',
              amount: stxn.amount / 100, // Stripe devuelve en centavos? No, Financial Connections suele devolver en la unidad de la moneda
              // Nota: Revisar si FinancialConnectionsTransaction.amount es entero o float.
              // Según docs, amount es un integer en la unidad más pequeña (centavos).
              reference: stxn.id,
              isReconciled: false,
            },
          });
          newTransactions.push(txn);
        }
      }

      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: { lastSync: new Date() },
      });

      return newTransactions;
    } catch (error) {
      skillsLogger.error('Error sincronizando transacciones de Stripe', { error, bankConnectionId });
      throw error;
    }
  }
}
