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

  const readText = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const recipientType = readText("recipientType");
  const customTo = readText("to");
  const ccStr = readText("cc");
  const bccStr = readText("bcc");
  const subject = readText("subject").trim();
  const body = readText("body");
  const rawAttachmentUrl = readText("attachmentUrl");
  const rawAttachmentName = readText("attachmentName") || "attachment";
  const attachmentName = rawAttachmentName.replace(/[\r\n\"]/g, "").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "attachment";

  if (recipientType !== "all" && recipientType !== "custom") throw new Error("Invalid recipient selection.");
  if (!subject || subject.length > 180 || /[\r\n]/.test(subject)) throw new Error("Subject must be 1-180 characters and cannot contain line breaks.");
  if (!body || body.length > 20000) throw new Error("Email body must contain between 1 and 20,000 characters.");

  let attachmentUrl: string | null = null;
  if (rawAttachmentUrl && rawAttachmentUrl.trim().length > 0) {
    const trimmed = rawAttachmentUrl.trim();
    try {
      const parsedUrl = new URL(trimmed);
      const allowedHosts = ["utfs.io", "uploadthing.com", "ufs.sh"];
      const isAllowedHost = allowedHosts.some(
        (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
      );
      if (parsedUrl.protocol !== "https:" || !isAllowedHost || parsedUrl.username || parsedUrl.password || !parsedUrl.pathname.startsWith("/f/")) {
        throw new Error(
          "Invalid attachment URL. Only secure HTTPS URLs from authorized storage (utfs.io, uploadthing.com) are permitted."
        );
      }
      attachmentUrl = parsedUrl.toString();
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
    const allUsers = await User.find({}).select("email").limit(5001).lean();
    if (allUsers.length > 5000) throw new Error("All-user broadcasts are limited to 5,000 recipients.");
    toRecipients = allUsers.map((u) => String(u.email || "").toLowerCase().trim()).filter(Boolean);
  } else {
    toRecipients = customTo.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  }
  const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  if (toRecipients.length > 500 || toRecipients.some((email) => !emailPattern.test(email))) {
    throw new Error("Custom recipient lists must contain at most 500 valid email addresses.");
  }

  if (toRecipients.length === 0) {
    throw new Error("No valid recipient email addresses found.");
  }

  const ccRecipients = ccStr.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const bccRecipients = bccStr.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (ccRecipients.length > 50 || bccRecipients.length > 50 ||
      ccRecipients.some((email) => !emailPattern.test(email)) ||
      bccRecipients.some((email) => !emailPattern.test(email))) {
    throw new Error("CC and BCC lists must each contain at most 50 valid email addresses.");
  }

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
               <a href="${escapeHtml(attachmentUrl)}" target="_blank" style="font-size: 13px; color: #4f46e5; text-decoration: underline;">${escapeHtml(attachmentName)}</a>
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
