import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const tenantId = session.user.tenantId;

    // Fetch all entries with lines and accounts
    const entries = await prisma.accountingEntry.findMany({
      where: { tenantId },
      orderBy: { date: 'asc' },
      include: {
        lines: {
          include: {
            account: true
          }
        }
      }
    });

    // Generate CSV
    const headers = ['Fecha', 'Asiento ID', 'Descripción', 'Cuenta Código', 'Cuenta Nombre', 'Debe', 'Haber', 'Referencia', 'Hash Asiento', 'Hash Anterior'];
    const rows = entries.flatMap(entry => 
      entry.lines.map(line => [
        entry.date.toISOString().split('T')[0],
        entry.id,
        entry.description,
        line.account.code,
        line.account.name,
        line.debit.toString(),
        line.credit.toString(),
        entry.reference || '',
        entry.entryHash,
        entry.previousHash || ''
      ])
    );

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const fileName = `LibroDiario_${tenantId}_${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    });
  } catch (error: any) {
    console.error('Error exporting ledger:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
