import { NextResponse } from 'next/server';
import { WebFormService } from '@/lib/marketing/web-form-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { formId, payload } = body;

    if (!formId || !payload) {
      return NextResponse.json({ error: 'Missing formId or payload' }, { status: 400 });
    }

    const result = await WebFormService.processSubmission({
      formId,
      payload,
      ipAddress: req.headers.get('x-forwarded-for') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('[WebForm API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
