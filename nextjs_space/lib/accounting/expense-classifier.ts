import { prisma } from '@/lib/db';
import { callGemma } from '@/lib/ai/gemma-client';

export interface ExpenseClassification {
  accountCode: string
  accountName: string
  confidence: number
  reasoning: string
}

export class ExpenseClassifier {
  static async classify(expenseId: string): Promise<ExpenseClassification> {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { supplier: true },
    });

    if (!expense) throw new Error('Gasto no encontrado');

    const tenantId = expense.tenantId;

    const [tenant, expenseAccounts] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { accountingPlanType: true, sector: true },
      }),
      prisma.accountingAccount.findMany({
        where: { tenantId, code: { startsWith: '6' } },
        select: { code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    if (!tenant) throw new Error('Tenant no encontrado');

    const planType = tenant.accountingPlanType ?? 'NORMAL';
    const sector = tenant.sector ?? 'NINGUNO';

    const systemPrompt = `Eres un contable experto en el Plan General de Contabilidad español.
Tu tarea es clasificar un gasto en la cuenta contable correcta del Grupo 6 (Compras y Gastos).

Plan contable del tenant: ${planType}
Sector: ${sector}

Cuentas disponibles del Grupo 6 para este tenant:
${expenseAccounts.map(a => `  ${a.code} - ${a.name}`).join('\n')}

Responde ÚNICAMENTE en JSON con esta estructura exacta:
{
  "accountCode": "codigo de la cuenta",
  "accountName": "nombre de la cuenta",
  "confidence": 0.0-1.0,
  "reasoning": "explicación breve de por qué esta cuenta es la correcta"
}`;

    const userPrompt = `Clasifica este gasto:

Descripción: ${expense.description}
Categoría: ${expense.category}
Importe: ${expense.amount} ${expense.currency}
Proveedor: ${expense.supplier?.name ?? 'No especificado'}`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const raw = await callGemma(messages, { responseMimeType: 'application/json' });
    const parsed: ExpenseClassification = JSON.parse(String(raw));

    const validCodes = new Set(expenseAccounts.map(a => a.code));
    if (!validCodes.has(parsed.accountCode)) {
      parsed.accountCode = '629';
      parsed.accountName = 'Otros servicios';
      parsed.confidence = Math.min(parsed.confidence, 0.3);
      parsed.reasoning = 'La cuenta sugerida no está disponible en el plan del tenant. Se usó la cuenta por defecto (629).';
    }

    await prisma.expense.update({
      where: { id: expenseId },
      data: { metadata: { aiClassification: parsed, classifiedAt: new Date().toISOString() } as any },
    });

    return parsed;
  }

  static async confirmAccount(expenseId: string, accountCode: string) {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new Error('Gasto no encontrado');

    const account = await prisma.accountingAccount.findUnique({
      where: { tenantId_code: { tenantId: expense.tenantId, code: accountCode } },
    });
    if (!account) throw new Error(`Cuenta ${accountCode} no encontrada para este tenant`);

    await prisma.expense.update({
      where: { id: expenseId },
      data: { metadata: { confirmedAccountCode: accountCode, confirmedAccountName: account.name, confirmedAt: new Date().toISOString(), confirmedByUser: true } as any },
    });

    return { accountCode: account.code, accountName: account.name };
  }
}
