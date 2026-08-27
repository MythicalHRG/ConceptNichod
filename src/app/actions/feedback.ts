"use server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import { sendEmail } from "@/services/email";

export async function submitFeedbackAction(formData: FormData) {
  await dbConnect();
  
  const type = formData.get("type") as string;
  const message = formData.get("message") as string;
  
  if (!type || !message) {
    throw new Error("Missing required fields");
  }

  const sessionUuid = cookies().get("user_session")?.value;
  let userInfo = "Anonymous User";
  
  if (sessionUuid) {
    const user = await User.findOne({ uuid: sessionUuid }).lean();
    if (user) {
      userInfo = `@${user.username} (${user.email}) - ${user.fullName}`;
    }
  }

  const subject = `[ConceptsNichod] New ${type === "error" ? "Bug Report" : "Suggestion"} from ${userInfo.split(' ')[0]}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>New Feedback Submitted</h2>
      <p><strong>Type:</strong> ${type}</p>
      <p><strong>From:</strong> ${userInfo}</p>
      <hr />
      <h3>Message:</h3>
      <p style="white-space: pre-wrap;">${message}</p>
    </div>
  `;

  await sendEmail({
    to: "mythicalhrg@gmail.com",
    subject,
    html
  });

  return { success: true };
}
