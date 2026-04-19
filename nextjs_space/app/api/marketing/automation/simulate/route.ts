import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AutomationRuleEngine } from '@/lib/marketing/automation/rule-engine';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { rule, entityData } = await req.json();
    
    // Simulación: No guardamos en DB ni encolamos nada real
    // Solo evaluamos las condiciones
    const engine = new AutomationRuleEngine();
    const isMatch = engine['evaluateConditions'](rule.conditions, entityData);

    return NextResponse.json({
      isMatch,
      actionCount: rule.actions.length,
      simulatedActions: rule.actions.map((a: any) => ({
        ...a,
        status: isMatch ? 'TRIGGERED' : 'SKIPPED'
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
