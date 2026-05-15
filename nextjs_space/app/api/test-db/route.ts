import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL || 'NOT SET';
  const maskedDbUrl = dbUrl.replace(/:[^@]+@/, ':***@');
  
  try {
    const log = await prisma.chatbotAuditLog.create({
      data: {
        tenantId: 'system_test',
        status: 'TEST_PROD',
        inputRaw: 'Manual test from /api/test-db',
        createdAt: new Date()
      }
    });
    
    return NextResponse.json({
      success: true,
      dbUrl: maskedDbUrl,
      logCreated: log.id,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      dbUrl: maskedDbUrl,
      error: error.message
    }, { status: 500 });
  }
}
