import { NextResponse } from 'next/server';
import { runFinalAnalysisAction } from '@/app/actions';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topicName, classLevel, summary, writtenAnswers, spokenAnswers, topicId } = body;

    if (!topicName || !classLevel || !summary || !topicId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

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
    console.error("Generate analysis error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
