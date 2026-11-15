import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { generateContentAction } from '@/app/actions';
import { verifySessionCookie } from '@/lib/session';
import { getClientIp } from '@/lib/ip';
import { checkDistributedRateLimit } from '@/lib/distributed-rate-limiter';

const ContentSchema = z.object({
  topicId: z.string().min(1, 'topicId is required'),
  topicName: z.string().min(1, 'topicName is required'),
  classLevel: z.string().min(1, 'classLevel is required'),
});

export async function POST(req: Request) {
  try {
    // 1. Session authentication check
    const rawSession = (await cookies()).get('user_session')?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Rate limiting (10 requests per minute per IP/user)
    const ip = await getClientIp(req.headers);
    const rateLimitKey = `gen:${sessionUuid || ip}`;
    const rateStatus = await checkDistributedRateLimit(rateLimitKey, 10, 60 * 1000);
    if (!rateStatus.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a minute before generating more content.' },
        { status: 429 }
      );
    }

    // 3. Zod schema validation
    const body = await req.json();
    const parseResult = ContentSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { topicId, topicName, classLevel } = parseResult.data;
    const result = await generateContentAction(topicId, topicName, classLevel);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === 'Not authenticated' || error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Generate content error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
