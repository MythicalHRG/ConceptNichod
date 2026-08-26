import { NextResponse } from 'next/server';
import { generateContentAction } from '@/app/actions';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topicId, topicName, classLevel } = body;

    if (!topicId || !topicName || !classLevel) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const result = await generateContentAction(topicId, topicName, classLevel);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Generate content error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
