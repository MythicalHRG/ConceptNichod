import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { runFinalAnalysisAction } from '@/app/actions';
import { getVerifiedSessionUuid } from "@/lib/session-auth";
import { getClientIp } from '@/lib/ip';
import { checkDistributedRateLimit } from '@/lib/distributed-rate-limiter';

const MAX_BODY_BYTES = 150_000;

const AnswerSchema = z.object({
  question: z.string().max(500),
  answer: z.string().max(5000),
});

const AnalysisSchema = z.object({
  topicName: z.string().min(1, 'topicName is required').max(200),
  classLevel: z.string().min(1, 'classLevel is required').max(50),
  summary: z.string().min(1, 'summary is required').max(8000),
  topicId: z.string().min(1, 'topicId is required').max(64),
  writtenAnswers: z.array(AnswerSchema).max(10).optional().default([]),
  spokenAnswers: z.array(AnswerSchema).max(11).optional().default([]),
});

async function readBoundedJson(req: Request, maxBytes: number): Promise<
  { ok: true; data: unknown } | { ok: false; status: 400 | 413; error: string }
> {
  let rawText = '';
  if (req.body) {
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          return { ok: false, status: 413, error: 'Request body is too large.' };
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    rawText = new TextDecoder().decode(merged);
  } else {
    rawText = await req.text();
    if (new TextEncoder().encode(rawText).byteLength > maxBytes) {
      return { ok: false, status: 413, error: 'Request body is too large.' };
    }
  }

  try {
    return { ok: true, data: JSON.parse(rawText) };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON request body.' };
  }
}

export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    }

    // 1. Session authentication check
    const rawSession = (await cookies()).get('user_session')?.value;
    const sessionUuid = await getVerifiedSessionUuid(rawSession);
    if (!sessionUuid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Rate limiting (10 requests/min per user + 25 requests/min per IP)
    const ip = getClientIp(req.headers);
    const rateStatus = await checkDistributedRateLimit(`gen:${sessionUuid}`, 10, 60 * 1000);
    if (!rateStatus.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a minute before generating more content.' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(rateStatus.resetMs / 1000))) } }
      );
    }
    const ipRateStatus = await checkDistributedRateLimit(`gen-ip:${ip}`, 25, 60 * 1000);
    if (!ipRateStatus.success) {
      return NextResponse.json(
        { error: 'Too many requests from this network. Please wait a minute before trying again.' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(ipRateStatus.resetMs / 1000))) } }
      );
    }

    // 3. Bounded body read + Zod schema validation
    const parsedBody = await readBoundedJson(req, MAX_BODY_BYTES);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }

    const parseResult = AnalysisSchema.safeParse(parsedBody.data);
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

    if (!topicName.trim() || !classLevel.trim() || !summary.trim() || !topicId.trim()) {
      return NextResponse.json(
        { error: 'Required analysis fields cannot be blank.' },
        { status: 400 }
      );
    }

    const result = await runFinalAnalysisAction(
      topicName.trim(),
      classLevel.trim(),
      summary.trim(),
      writtenAnswers,
      spokenAnswers,
      topicId.trim()
    );
    return NextResponse.json(result);
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (message === 'Not authenticated' || message === 'Unauthorized' || message.includes('log in')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (message.includes('Access denied') || message.includes('suspended') || message.includes('Topic not found')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (message.includes('Too many') || message.includes('Rate limit')) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
    }
    console.error('Generate analysis error:', error);
    return NextResponse.json({ error: 'Failed to generate analysis. Please try again.' }, { status: 500 });
  }
}
