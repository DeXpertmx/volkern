export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { QueueMonitorService } from '@/lib/marketing/queues/queue-monitor-service';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  const allowedRoles = ['ADMIN', 'OWNER', 'MARKETING_MANAGER'];
  if (!session?.user || !allowedRoles.includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { queueName, jobId } = await req.json();
    if (!queueName || !jobId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    const result = await QueueMonitorService.retryJob(queueName, jobId);
    
    // Registrar auditoría (placeholder para AuditEvent)
    console.log(`[Audit] Manual retry for job ${jobId} in queue ${queueName} by user ${session.user.email}`);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
