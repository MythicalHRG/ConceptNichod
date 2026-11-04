"use server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import { sendEmail } from "@/services/email";
import { verifySessionCookie } from "@/lib/session";

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function submitFeedbackAction(formData: FormData) {
  await dbConnect();
  
  const type = formData.get("type") as string;
  const message = formData.get("message") as string;
  
  if (!type || !message) {
    throw new Error("Missing required fields");
  }

  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  let userInfo = "Anonymous User";
  
  if (sessionUuid) {
    const user = await User.findOne({ uuid: sessionUuid }).lean();
    if (user) {
      userInfo = `@${user.username} (${user.email}) - ${user.fullName}`;
    }
  }

  const safeType = escapeHtml(type);
  const safeMessage = escapeHtml(message);
  const safeUserInfo = escapeHtml(userInfo);

  const subject = `[ConceptsNichod] New ${type === "error" ? "Bug Report" : "Suggestion"} from ${userInfo.split(' ')[0]}`;
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
    to: "mythicalhrg@gmail.com",
    subject,
    html
  });

  return { success: true };
}
