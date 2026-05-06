export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { skills } from '@/lib/skills';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { description, category = 'General' } = await req.json();
    
    const block = await skills.generate_web_creator_block({
      description,
      category,
      tenantId: session.user.tenantId
    });

    return NextResponse.json(block);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
