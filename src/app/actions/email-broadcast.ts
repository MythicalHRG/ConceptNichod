"use server";


import { isPlatformOwner } from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import EmailBroadcast from "@/models/EmailBroadcast";
import nodemailer from "nodemailer";
import { verifySessionCookie } from "@/lib/session";

const ADMIN_USERNAME = "mythicalhrg";

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function verifyOwner() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid }).lean();
  if (!isPlatformOwner(user)) {
    throw new Error("Forbidden: Admin access only");
  }
  return user;
}

export async function sendEmailBroadcastAction(formData: FormData) {
  await verifyOwner();

  const recipientType = formData.get("recipientType") as string; // 'all' | 'custom'
  const customTo = (formData.get("to") as string) || "";
  const ccStr = (formData.get("cc") as string) || "";
  const bccStr = (formData.get("bcc") as string) || "";
  const subject = formData.get("subject") as string;
  const body = formData.get("body") as string;
  const rawAttachmentUrl = formData.get("attachmentUrl") as string | null;
  const attachmentName = (formData.get("attachmentName") as string) || "attachment";

  let attachmentUrl: string | null = null;
  if (rawAttachmentUrl && rawAttachmentUrl.trim().length > 0) {
    const trimmed = rawAttachmentUrl.trim();
    try {
      const parsedUrl = new URL(trimmed);
      const allowedHosts = ["utfs.io", "uploadthing.com", "ufs.sh"];
      const isAllowedHost = allowedHosts.some(
        (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
      );
      if (parsedUrl.protocol !== "https:" || !isAllowedHost) {
        throw new Error(
          "Invalid attachment URL. Only secure HTTPS URLs from authorized storage (utfs.io, uploadthing.com) are permitted."
        );
      }
      attachmentUrl = trimmed;
    } catch (err: any) {
      throw new Error(err.message || "Invalid attachment URL provided.");
    }
  }

  if (!subject || !body) {
    throw new Error("Subject and Body are required.");
  }

  const senderUser =
    process.env.EMAIL_SERVER_USER ||
    process.env.GMAIL_USER ||
    "mythicalhrg@gmail.com";

  const senderPass =
    process.env.EMAIL_SERVER_PASSWORD ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.EMAIL_PASS;

  if (!senderPass) {
    throw new Error(
      "Gmail credentials not configured. Please add EMAIL_SERVER_PASSWORD or GMAIL_APP_PASSWORD to your environment variables (generate a 16-character App Password at myaccount.google.com/apppasswords)."
    );
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
        ${escapeHtml(body)}
      </div>
      ${
        attachmentUrl
          ? `<div style="margin-top: 24px; padding: 12px; background: #f4f4f5; border-radius: 6px;">
               <p style="margin: 0; font-size: 13px; font-weight: 600;">Attached File:</p>
               <a href="${attachmentUrl}" target="_blank" style="font-size: 13px; color: #4f46e5; text-decoration: underline;">${escapeHtml(attachmentName)}</a>
             </div>`
          : ""
      }
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f4f4f5; font-size: 12px; color: #a1a1aa; text-align: center;">
        ConceptNichod &bull; Empowering Concept Mastery Through AI & Speech
      </div>
    </div>
  `;

  // Privacy protection: If broadcasting to all users, put them in BCC so no one sees other recipients' email addresses
  const mailOptions: any = {
    from: `"ConceptNichod" <${senderUser}>`,
    subject,
    html: htmlContent,
  };

  if (recipientType === "all") {
    mailOptions.to = senderUser; // To: ConceptNichod <mythicalhrg@gmail.com>
    mailOptions.bcc = Array.from(new Set([...toRecipients, ...bccRecipients]));
  } else {
    mailOptions.to = toRecipients;
    if (ccRecipients.length > 0) mailOptions.cc = ccRecipients;
    if (bccRecipients.length > 0) mailOptions.bcc = bccRecipients;
  }

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
      to: recipientType === "all" ? [senderUser] : toRecipients,
      cc: ccRecipients,
      bcc: recipientType === "all" ? toRecipients : bccRecipients,
      subject,
      body,
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentUrl ? attachmentName : undefined,
      sentCount: toRecipients.length,
      status: "sent",
    });

    return {
      success: true,
      messageId: info.messageId,
      recipientCount: toRecipients.length,
      sentCount: toRecipients.length,
    };
  } catch (error: any) {
    console.error("Nodemailer broadcast error:", error);

    // Save failed attempt
    try {
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
        error: error.message,
      });
    } catch {}

    throw new Error(`Email sending failed: ${error.message}`);
  }
}

export async function getEmailBroadcastsAction() {
  await verifyOwner();
  const broadcasts = await EmailBroadcast.find({}).sort({ createdAt: -1 }).limit(20).lean();
  return JSON.parse(JSON.stringify(broadcasts));
}

export const getEmailBroadcastHistoryAction = getEmailBroadcastsAction;
