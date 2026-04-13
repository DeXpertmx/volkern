import { NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (req, auth) => {
  try {
    if (auth.user?.role?.nombre !== 'Superadmin' && auth.user?.role?.nombre !== 'Admin' && auth.user?.role?.nombre !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

    // 1. Get MRR and active tenants
    const tenants = await globalPrisma.tenant.findMany({
      where: { estado: 'activo' },
      select: { mrr: true, id: true }
    });

    const totalMrr = tenants.reduce((acc, t) => acc + (t.mrr || 0), 0);

    // 2. Get Security Alerts (erp_security_incidents)
    const activeAlertsCount = await globalPrisma.securityIncident.count({
      where: { resolved: false }
    });

    // 3. MCP Load (Simulated calculation based on executions)
    // In a real scenario, this might come from a monitoring service.
    // Here we use automation executions as a proxy.
    const recentExecutions = await globalPrisma.automationExecution.count({
      where: { fechaInicio: { gte: lastHour } }
    });
    
    // Normalize load between 15% and 95%
    const mcpLoad = Math.min(95, Math.max(15, (recentExecutions / 100) * 80 + 15));

    // 4. Health Score
    // Formula: (Total Tenants - Critical Alerts) / Total Tenants
    const criticalIncidents = await globalPrisma.securityIncident.count({
      where: { resolved: false, severity: 'CRITICAL' }
    });
    
    const totalTenants = await globalPrisma.tenant.count();
    const healthScore = totalTenants > 0 
      ? Math.round(((totalTenants - criticalIncidents) / totalTenants) * 100) 
      : 100;

    // 5. Generate history (Simulated for Demo/Pulse)
    const history = Array.from({ length: 7 }).map((_, i) => ({
      date: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
      value: totalMrr - (6 - i) * (totalMrr * 0.05) + (Math.random() * totalMrr * 0.02)
    }));

    return NextResponse.json({
      totalMrr: Math.round(totalMrr),
      activeAlerts: activeAlertsCount,
      mcpLoad: Math.round(mcpLoad),
      healthScore,
      history
    });
  } catch (error) {
    console.error('Error in Global Pulse API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}, ['admin:read']);
