import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { generateContentAction } from '@/app/actions';
import { verifySessionCookie } from '@/lib/session';
import { getClientIp } from '@/lib/ip';
import { checkDistributedRateLimit } from '@/lib/distributed-rate-limiter';

const MAX_BODY_BYTES = 16_000;

const ContentSchema = z.object({
  topicId: z.string().min(1, 'topicId is required').max(64),
  topicName: z.string().min(1, 'topicName is required').max(200),
  classLevel: z.string().min(1, 'classLevel is required').max(50),
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
    const sessionUuid = verifySessionCookie(rawSession);
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

    const parseResult = ContentSchema.safeParse(parsedBody.data);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { topicId, topicName, classLevel } = parseResult.data;
    if (!topicId.trim() || !topicName.trim() || !classLevel.trim()) {
      return NextResponse.json(
        { error: 'Required content fields cannot be blank.' },
        { status: 400 }
      );
    }

    const result = await generateContentAction(topicId.trim(), topicName.trim(), classLevel.trim());
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
    console.error('Generate content error:', error);
    return NextResponse.json({ error: 'Failed to generate content. Please try again.' }, { status: 500 });
  }
}
