import { NextResponse } from 'next/server';
import { cleanupExpiredReservations } from '@/lib/cleanup';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // In production, authorize the cron request using a secret header/param
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const releasedCount = await cleanupExpiredReservations();
    return NextResponse.json({ 
      success: true, 
      releasedCount, 
      message: `Released ${releasedCount} expired reservations.`,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('[API Cleanup] Error:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
