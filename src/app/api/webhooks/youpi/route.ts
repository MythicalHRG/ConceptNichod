import { POST as mysticPost } from "../mystic-payments/route";

export const dynamic = "force-dynamic";

/**
 * Backward-compatibility endpoint for legacy YOUPI-Pg webhook subscriptions.
 */
export async function POST(req: any) {
  return mysticPost(req);
}
