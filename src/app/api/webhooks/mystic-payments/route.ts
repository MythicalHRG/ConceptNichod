import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Legacy Webhook Endpoint (Deprecated).
 * ConceptNichod has transitioned to 100% direct native in-app UPI UTR verification.
 */
export async function POST(req: NextRequest) {
  try {
    return NextResponse.json({
      received: true,
      deprecated: true,
      message: "ConceptNichod now uses native in-app UPI UTR verification with direct bank settlement.",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal error" }, { status: 500 });
  }
}
