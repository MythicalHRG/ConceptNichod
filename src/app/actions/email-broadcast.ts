"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import EmailBroadcast from "@/models/EmailBroadcast";
import nodemailer from "nodemailer";

const ADMIN_USERNAME = "mythicalhrg";

async function verifyAdmin() {
  await dbConnect();
  const sessionUuid = cookies().get("user_session")?.value;
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid }).lean();
  if (!user || user.username !== ADMIN_USERNAME) {
    throw new Error("Forbidden: Admin access only");
  }
  return user;
}

export async function sendEmailBroadcastAction(formData: FormData) {
  await verifyAdmin();

  const recipientType = formData.get("recipientType") as string; // 'all' | 'custom'
  const customTo = (formData.get("to") as string) || "";
  const ccStr = (formData.get("cc") as string) || "";
  const bccStr = (formData.get("bcc") as string) || "";
  const subject = formData.get("subject") as string;
  const body = formData.get("body") as string;
  const attachmentUrl = formData.get("attachmentUrl") as string | null;
  const attachmentName = (formData.get("attachmentName") as string) || "attachment";

  if (!subject || !body) {
    throw new Error("Subject and Body are required.");
  }

  const senderUser = process.env.EMAIL_SERVER_USER || "mythicalhrg@gmail.com";
  const senderPass = process.env.EMAIL_SERVER_PASSWORD;

  if (!senderUser || !senderPass) {
    throw new Error("Missing EMAIL_SERVER_USER or EMAIL_SERVER_PASSWORD environment variables.");
  }

  // Determine recipients
  let toRecipients: string[] = [];
  if (recipientType === "all") {
    const allUsers = await User.find({}).select("email").lean();
    toRecipients = allUsers.map((u) => u.email.toLowerCase().trim()).filter(Boolean);
  } else {
    toRecipients = customTo
      .split(",")
      .map((e) => e.toLowerCase().trim())
      .filter((e) => e.length > 0 && e.includes("@"));
  }

  if (toRecipients.length === 0) {
    throw new Error("No valid recipient email addresses found.");
  }

  const ccRecipients = ccStr
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter((e) => e.length > 0 && e.includes("@"));

  const bccRecipients = bccStr
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter((e) => e.length > 0 && e.includes("@"));

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: senderUser,
      pass: senderPass,
    },
  });

  // Prepare HTML content
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; border: 1px solid #e4e4e7; border-radius: 10px; color: #18181b;">
      <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #4f46e5; font-size: 20px;">ConceptNichod Official Broadcast</h2>
        <p style="margin: 4px 0 0; color: #71717a; font-size: 13px;">Sent from ${senderUser}</p>
      </div>
      <div style="font-size: 15px; line-height: 1.6; color: #27272a; white-space: pre-wrap;">
        ${body}
      </div>
      ${
        attachmentUrl
          ? `<div style="margin-top: 24px; padding: 12px; background: #f4f4f5; border-radius: 6px;">
               <p style="margin: 0; font-size: 13px; font-weight: 600;">Attached File:</p>
               <a href="${attachmentUrl}" target="_blank" style="font-size: 13px; color: #4f46e5; text-decoration: underline;">${attachmentName}</a>
             </div>`
          : ""
      }
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f4f4f5; font-size: 12px; color: #a1a1aa; text-align: center;">
        ConceptNichod &bull; Empowering Concept Mastery Through AI & Speech
      </div>
    </div>
  `;

  const mailOptions: any = {
    from: `"Concept Nichod" <${senderUser}>`,
    to: toRecipients,
    subject,
    html: htmlContent,
  };

  if (ccRecipients.length > 0) mailOptions.cc = ccRecipients;
  if (bccRecipients.length > 0) mailOptions.bcc = bccRecipients;

  if (attachmentUrl) {
    mailOptions.attachments = [
      {
        path: attachmentUrl,
        filename: attachmentName,
      },
    ];
  }

  try {
    const info = await transporter.sendMail(mailOptions);

    await EmailBroadcast.create({
      sender: senderUser,
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      body,
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentUrl ? attachmentName : undefined,
      sentCount: toRecipients.length,
      status: "sent",
    });

    return {
      success: true,
      sentCount: toRecipients.length,
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error("Email broadcast error:", err);
    await EmailBroadcast.create({
      sender: senderUser,
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      body,
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentUrl ? attachmentName : undefined,
      sentCount: 0,
      status: "failed",
      error: err.message,
    });
    throw new Error(`Failed to send email broadcast: ${err.message}`);
  }
}

export async function getEmailBroadcastHistoryAction() {
  await verifyAdmin();
  const history = await EmailBroadcast.find().sort({ sentAt: -1, createdAt: -1 }).limit(50).lean();
  return {
    success: true,
    broadcasts: JSON.parse(JSON.stringify(history)),
  };
}
