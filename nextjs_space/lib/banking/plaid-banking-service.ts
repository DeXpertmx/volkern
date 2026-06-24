import { 
  Configuration, 
  PlaidApi, 
  PlaidEnvironments, 
  Products, 
  CountryCode,
  LinkTokenCreateRequest,
  ItemPublicTokenExchangeRequest,
  TransactionsGetRequest
} from 'plaid';
import { prisma } from '@/lib/db';
import { skillsLogger } from '@/lib/skills/observability';

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const client = new PlaidApi(configuration);

export class PlaidBankingService {
  /**
   * Genera un Link Token para iniciar el flujo de Plaid Link
   */
  static async createLinkToken(userId: string, tenantId: string) {
    try {
      const request: LinkTokenCreateRequest = {
        user: { client_user_id: userId },
        client_name: 'Volkern Accounting',
        products: (process.env.PLAID_PRODUCTS || 'transactions').split(',') as Products[],
        country_codes: (process.env.PLAID_COUNTRY_CODES || 'ES').split(',') as CountryCode[],
        language: 'es',
        redirect_uri: process.env.PLAID_REDIRECT_URI, // Opcional para web
      };

      const response = await client.linkTokenCreate(request);
      return response.data.link_token;
    } catch (error: any) {
      skillsLogger.error('Error creating Plaid link token', { error: error.response?.data || error.message } as any);
      throw error;
    }
  }

  /**
   * Intercambia el public_token por un access_token permanente
   */
  static async exchangePublicToken(publicToken: string, tenantId: string, metadata: any) {
    try {
      const request: ItemPublicTokenExchangeRequest = {
        public_token: publicToken,
      };

      const response = await client.itemPublicTokenExchange(request);
      const { access_token, item_id } = response.data;

      // Guardar la conexión en la DB
      const connection = await prisma.bankConnection.create({
        data: {
          tenantId,
          provider: 'PLAID',
          providerId: item_id,
          accessToken: access_token,
          institutionId: metadata.institution?.institution_id || 'unknown',
          bankName: metadata.institution?.name || 'Banco Plaid',
          status: 'ACTIVE',
          metadata: metadata
        }
      });

      return connection;
    } catch (error: any) {
      skillsLogger.error('Error exchanging Plaid public token', { error: error.response?.data || error.message } as any);
      throw error;
    }
  }

  /**
   * Sincroniza transacciones de una conexión específica
   */
  static async syncTransactions(connectionId: string) {
    try {
      const connection = await prisma.bankConnection.findUnique({
        where: { id: connectionId }
      });

      if (!connection || !connection.accessToken) {
        throw new Error('Conexión no encontrada o sin token de acceso');
      }

      const now = new Date();
      const start = new Date();
      start.setDate(now.getDate() - 30); // Sincronizar últimos 30 días

      const request: TransactionsGetRequest = {
        access_token: connection.accessToken,
        start_date: start.toISOString().split('T')[0],
        end_date: now.toISOString().split('T')[0],
      };

      const response = await client.transactionsGet(request);
      const transactions = response.data.transactions;

      const createdCount = 0;
      for (const tx of transactions) {
        // Evitar duplicados usando el transaction_id de Plaid como referencia
        await prisma.bankTransaction.upsert({
          where: {
            bankConnectionId_reference: {
              bankConnectionId: connection.id,
              reference: tx.transaction_id
            }
          },
          update: {},
          create: {
            bankConnectionId: connection.id,
            date: new Date(tx.date),
            description: tx.name || 'Transacción Plaid',
            amount: tx.amount * -1, // Plaid devuelve positivo para débitos, invertimos para contabilidad
            reference: tx.transaction_id,
            isReconciled: false
          }
        });
      }

      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: { lastSync: new Date() }
      });

      return transactions.length;
    } catch (error: any) {
      skillsLogger.error('Error syncing Plaid transactions', { error: error.response?.data || error.message } as any);
      throw error;
    }
  }
}
