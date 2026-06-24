export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { QueueMonitorService } from '@/lib/marketing/queues/queue-monitor-service';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  // Seguridad: Solo MARKETING_MANAGER o superior
  const allowedRoles = ['ADMIN', 'OWNER', 'MARKETING_MANAGER'];
  if (!session?.user || !allowedRoles.includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const status = await QueueMonitorService.getGlobalStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
