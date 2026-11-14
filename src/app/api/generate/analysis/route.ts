import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { runFinalAnalysisAction } from '@/app/actions';
import { verifySessionCookie } from '@/lib/session';
import { getClientIp } from '@/lib/ip';
import { checkDistributedRateLimit } from '@/lib/rate-limiter';

const AnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const AnalysisSchema = z.object({
  topicName: z.string().min(1, 'topicName is required'),
  classLevel: z.string().min(1, 'classLevel is required'),
  summary: z.string().min(1, 'summary is required'),
  topicId: z.string().min(1, 'topicId is required'),
  writtenAnswers: z.array(AnswerSchema).optional().default([]),
  spokenAnswers: z.array(AnswerSchema).optional().default([]),
});

export async function POST(req: Request) {
  try {
    // 1. Session authentication check
    const rawSession = cookies().get('user_session')?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Rate limiting (10 requests per minute per IP/user)
    const ip = getClientIp(req.headers);
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
    const parseResult = AnalysisSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      topicName,
      classLevel,
      summary,
      writtenAnswers,
      spokenAnswers,
      topicId,
    } = parseResult.data;

    const result = await runFinalAnalysisAction(
      topicName,
      classLevel,
      summary,
      writtenAnswers,
      spokenAnswers,
      topicId
    );
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.message === 'Not authenticated' || error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Generate analysis error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
