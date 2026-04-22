import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { skills } from '@/lib/skills';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { pageTitle, contentSnippet } = await req.json();
    
    const seo = await skills.generate_seo_metadata({
      pageTitle,
      contentSnippet,
      tenantId: session.user.tenantId
    });

    return NextResponse.json(seo);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
