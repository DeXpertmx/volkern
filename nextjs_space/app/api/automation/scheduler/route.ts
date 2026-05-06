export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AutomationScheduler } from '@/lib/event-engine/automation/scheduler'
import { LeadRecoveryService } from '@/lib/event-engine/automation/lead-recovery'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'jobs') {
      const jobs = AutomationScheduler.listJobs(session.user.tenantId)
      return NextResponse.json({ jobs })
    }

    if (action === 'inactive') {
      const hours = parseInt(searchParams.get('hours') || '48')
      const leads = await LeadRecoveryService.getInactiveLeads(session.user.tenantId, hours)
      return NextResponse.json({ leads })
    }

    return NextResponse.json({ 
      jobs: AutomationScheduler.listJobs(session.user.tenantId),
      api: 'automation scheduler' 
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...data } = body

    if (action === 'create_job') {
      const job = await AutomationScheduler.createJob({
        tenantId: session.user.tenantId,
        name: data.name,
        schedule: data.schedule,
        event: data.event,
        data: data.data || {},
        activo: data.activo ?? true
      })
      return NextResponse.json({ job })
    }

    if (action === 'delete_job') {
      AutomationScheduler.deleteJob(data.jobId)
      return NextResponse.json({ success: true })
    }

    if (action === 'scan_recovery') {
      const result = await LeadRecoveryService.scanAndRecover(session.user.tenantId, {
        inactivaThresholdHours: data.hours || 48,
        stagesCalientes: data.stages || ['calificado', 'propuesta', 'negociacion']
      })
      return NextResponse.json(result)
    }

    if (action === 'recover_lead') {
      const result = await LeadRecoveryService.recoverSingleLead(data.leadId, session.user.tenantId)
      return NextResponse.json({ success: result })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}