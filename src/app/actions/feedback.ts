"use server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import { sendEmail } from "@/services/email";
import { getVerifiedSessionUuid } from "@/lib/session-auth";
import { getClientIp } from "@/lib/ip";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import { normalizeEmail } from "@/lib/email-utils";
import { PLATFORM_OWNER_EMAIL } from "@/lib/owner-access";

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function submitFeedbackAction(formData: FormData) {
  if (!(formData instanceof FormData)) {
    throw new Error("Missing required fields");
  }

  const rawType = formData.get("type");
  const rawMessage = formData.get("message");
  const type = typeof rawType === "string" ? rawType.trim() : "";
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";

  if (!type || !message) {
    throw new Error("Missing required fields");
  }
  if (type.length > 40) {
    throw new Error("Invalid feedback category.");
  }
  if (message.length > 5000) {
    throw new Error("Feedback message cannot exceed 5,000 characters.");
  }

  // Rate limiting: 3 submissions per 15 minutes per user/IP + IP-level cap
  const ip = await getClientIp();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = await getVerifiedSessionUuid(rawSession);
  const rateLimitKey = `feedback:${sessionUuid || ip}`;
  const rateCheck = await checkDistributedRateLimit(rateLimitKey, 3, 15 * 60 * 1000);
  const ipRateCheck = sessionUuid
    ? await checkDistributedRateLimit(`feedback:ip:${ip}`, 5, 15 * 60 * 1000)
    : rateCheck;
  if (!rateCheck.success || !ipRateCheck.success) {
    throw new Error("Too many feedback submissions. Please wait a few minutes before submitting again.");
  }

  await dbConnect();

  const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip }).select("_id").lean();
  if (isIpBanned) {
    throw new Error("Access denied: Your IP address is banned.");
  }

  let userInfo = "Anonymous User";
  if (sessionUuid) {
    const user = await User.findOne({ uuid: sessionUuid })
      .select("username email fullName")
      .lean();
    if (user) {
      const emailVals = Array.from(
        new Set([String(user.email || "").toLowerCase(), normalizeEmail(String(user.email || ""))].filter(Boolean))
      );
      const userBanClauses: Array<{ type: "email" | "username"; value: string | { $in: string[] } }> = [];
      if (emailVals.length > 0) userBanClauses.push({ type: "email", value: { $in: emailVals } });
      if (user.username) userBanClauses.push({ type: "username", value: String(user.username).toLowerCase() });
      const isUserBanned =
        userBanClauses.length > 0
          ? await Blacklist.findOne({ $or: userBanClauses }).select("_id").lean()
          : null;
      if (isUserBanned) {
        throw new Error("Access denied: Your account has been suspended.");
      }
      userInfo = `@${user.username} (${user.email}) - ${user.fullName}`;
    }
  }

  const safeType = escapeHtml(type);
  const safeMessage = escapeHtml(message);
  const safeUserInfo = escapeHtml(userInfo);

  const cleanType = type.replace(/[\r\n\0]/g, " ");
  const cleanHeaderSender = userInfo.split(" ")[0].replace(/[\r\n\0]/g, "").slice(0, 60);
  const subject = `[ConceptNichod] New ${cleanType === "error" ? "Bug Report" : "Suggestion"} from ${cleanHeaderSender}`.slice(0, 160);
  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>New Feedback Submitted</h2>
      <p><strong>Type:</strong> ${safeType}</p>
      <p><strong>From:</strong> ${safeUserInfo}</p>
      <hr />
      <h3>Message:</h3>
      <p style="white-space: pre-wrap;">${safeMessage}</p>
    </div>
  `;

  await sendEmail({
    to: PLATFORM_OWNER_EMAIL,
    subject,
    html,
  });

  return { success: true };
}
