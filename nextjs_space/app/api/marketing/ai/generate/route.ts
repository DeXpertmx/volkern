import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { skills } from '@/lib/skills';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { prompt, platform } = await req.json();
    
    // Llamada al skill de marketing
    const result = await skills.generate_marketing_copy({
      topic: prompt,
      platform: platform as any,
      tenantId: session.user.tenantId,
      tone: 'professional'
    });

    // Registrar en auditoría (simulado)
    console.log(`[Audit] AI Generation by ${session.user.email} for ${platform}`);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
