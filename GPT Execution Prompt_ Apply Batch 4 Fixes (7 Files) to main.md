# STRICT EXECUTION CONTRACT — BATCH 4 FIXES (ConceptNichod)

**Repository:** `MythicalHRG/ConceptNichod`  
**Target Branch:** `main` (commit directly to `main` as ordered by repository owner)

## ZERO-IMPROVISATION RULES (NON-NEGOTIABLE)
1. **APPLY ONLY THE EXACT 7 FILES BELOW.** Do NOT invent extra refactors, do NOT touch any file not listed below (other than deleting `_audit_prompt.md` if this contract was uploaded there), and do NOT modify any test files during this step.
2. **VERBATIM REPLACEMENT:** Write the complete, exact contents below for every single one of the 7 files onto `main` in a single atomic commit.
3. **IF `_audit_prompt.md` EXISTS ON `main`:** Delete `_audit_prompt.md` in the exact same commit so the repository stays clean.
4. **COMMIT MESSAGE:**
   `fix(batch4): close donation PII/UTR leak, harden auth/admin/broadcast actions, protect User.password, and fix test-21`
5. **MANDATORY POST-COMMIT CI CHECK:** Immediately after committing to `main`, check the GitHub Actions `CI` workflow run triggered by your commit and report ONLY:
   - `COMMIT_SHAS`: exact commit SHA pushed to `main`
   - `UPDATED_FILES_COUNT`: `X/7` (and confirm `_audit_prompt.md` deleted if present)
   - `CI_RUN_ID` & `CI_RUN_STATUS`: workflow run ID, current status, and exact failing step/error lines if failed

---

## EXACT REPLACEMENT FILES (7 FILES)

### FILE 1: `src/app/api/auth/otp/route.ts`
```ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongoose';
import OtpVerification from '@/models/OtpVerification';
import User from '@/models/User';
import Blacklist from '@/models/Blacklist';
import nodemailer from 'nodemailer';
import { getClientIp } from '@/lib/ip';
import { checkDistributedRateLimit } from '@/lib/distributed-rate-limiter';
import { normalizeEmail, validateEmailDomain, validateEmail } from '@/lib/email-utils';
import { PLATFORM_OWNER_EMAIL, PLATFORM_OWNER_USERNAME } from '@/lib/owner-access';

const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
const MAX_OTP_BODY_BYTES = 8_192;

async function readBoundedJsonObject(req: Request, maxBytes: number): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; status: 400 | 413; error: string }
> {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413, error: 'Request body is too large.' };
  }

  let rawText = '';
  if (req.body) {
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          return { ok: false, status: 413, error: 'Request body is too large.' };
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    rawText = new TextDecoder().decode(merged);
  } else {
    rawText = await req.text();
    if (new TextEncoder().encode(rawText).byteLength > maxBytes) {
      return { ok: false, status: 413, error: 'Request body is too large.' };
    }
  }

  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: 'Invalid request payload.' };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON request body.' };
  }
}

function timingSafeOtpEquals(expected: string, supplied: string): boolean {
  const a = crypto.createHash('sha256').update(expected, 'utf8').digest();
  const b = crypto.createHash('sha256').update(supplied, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    const parsedBody = await readBoundedJsonObject(req, MAX_OTP_BODY_BYTES);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }

    const { email: rawEmail, action, otp, isPasswordReset, username } = parsedBody.data;

    if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const email = rawEmail.toLowerCase().trim();
    if (email.length > 254) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }
    const normalizedEmail = normalizeEmail(email);
    const emailCandidates = Array.from(new Set([email, normalizedEmail].filter(Boolean)));

    await dbConnect();

    const ip = getClientIp(req.headers);

    // Blacklist enforcement (IP + raw & Gmail-canonicalized email)
    const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip }).select("_id").lean();
    if (isIpBanned) {
      return NextResponse.json({ error: 'Access denied: Your IP address is banned.' }, { status: 403 });
    }

    const isEmailBanned = await Blacklist.findOne({ type: "email", value: { $in: emailCandidates } }).select("_id").lean();
    if (isEmailBanned) {
      return NextResponse.json({ error: 'Access denied: This email address is banned.' }, { status: 403 });
    }

    const senderUser = (process.env.EMAIL_SERVER_USER || process.env.GMAIL_USER || PLATFORM_OWNER_EMAIL).trim();
    const senderPass = process.env.EMAIL_SERVER_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

    if (action === 'send') {
      // IP Rate limiting: 5 requests per 15 minutes
      const ipUnavailable = ip === '127.0.0.1' || ip === 'unknown';
      const rateLimitKey = ipUnavailable ? `otp:${ip}:${normalizedEmail}` : `otp:${ip}`;
      const rateLimit = await checkDistributedRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
      if (!rateLimit.success) {
        return NextResponse.json(
          { error: 'Too many OTP requests from this IP. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(rateLimit.resetMs / 1000))) } }
        );
      }

      // Per-email Rate limiting keyed on canonical email (prevents Gmail dot-variant bombing)
      const emailRateLimit = await checkDistributedRateLimit(`otp:email:${normalizedEmail}`, 5, 15 * 60 * 1000);
      if (!emailRateLimit.success) {
        return NextResponse.json(
          { error: 'Too many OTP requests for this email address. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(emailRateLimit.resetMs / 1000))) } }
        );
      }

      // Enforce strict email domain restriction and no +tag subaddressing
      if (!validateEmailDomain(email)) {
        return NextResponse.json(
          { error: 'Only @gmail.com, @outlook.com, and @outlook.in emails are allowed.' },
          { status: 400 }
        );
      }
      const emailCheck = validateEmail(email);
      if (!emailCheck.valid) {
        return NextResponse.json(
          { error: emailCheck.error || 'Only @gmail.com, @outlook.com, and @outlook.in emails are allowed.' },
          { status: 400 }
        );
      }

      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      if (isPasswordReset === true) {
        const safeEmail = escapeRegex(email);
        const safeNormalized = escapeRegex(normalizedEmail);
        const existingUser = await User.findOne({
          $or: [
            { email: new RegExp(`^${safeEmail}$`, 'i') },
            { email: new RegExp(`^${safeNormalized}$`, 'i') },
          ],
        }).select('_id').lean();
        if (!existingUser) {
          return NextResponse.json({ error: 'No account registered with this email address.' }, { status: 404 });
        }
      } else {
        // Block reservation of owner email (including Gmail dot variants)
        if (email === 'mythicalhrg@gmail.com' || email === PLATFORM_OWNER_EMAIL || normalizedEmail === normalizeEmail(PLATFORM_OWNER_EMAIL)) {
          return NextResponse.json({ error: 'This email is reserved for system administration.' }, { status: 400 });
        }

        // Registration OTP: Check if raw or normalized email is already registered
        const safeEmail = escapeRegex(email);
        const safeNormalized = escapeRegex(normalizedEmail);

        const existingUser = await User.findOne({
          $or: [
            { email: new RegExp(`^${safeEmail}$`, 'i') },
            { email: new RegExp(`^${safeNormalized}$`, 'i') },
          ],
        }).select('_id').lean();
        if (existingUser) {
          return NextResponse.json({ error: 'This email is already registered. Please log in instead.' }, { status: 400 });
        }

        // Registration OTP: Check if username is provided, blacklisted, reserved, or already taken
        if (typeof username === 'string' && username.trim()) {
          const cleanUser = username.toLowerCase().trim();
          if (cleanUser === PLATFORM_OWNER_USERNAME) {
            return NextResponse.json({ error: 'This username is reserved for system administration.' }, { status: 400 });
          }
          const isUsernameBanned = await Blacklist.findOne({ type: 'username', value: cleanUser }).select('_id').lean();
          if (isUsernameBanned) {
            return NextResponse.json({ error: 'Access denied: This username is banned.' }, { status: 403 });
          }
          const safeUser = escapeRegex(cleanUser);
          const existingUsernameUser = await User.findOne({
            username: new RegExp(`^${safeUser}$`, 'i'),
          }).select('_id').lean();
          if (existingUsernameUser) {
            return NextResponse.json({ error: 'A user with this username already exists. Please choose a different username.' }, { status: 400 });
          }
        }
      }

      // Check resend cooldown across raw + canonical email variants
      const existingOtp = await OtpVerification.findOne({
        email: { $in: emailCandidates },
      }).sort({ lastSentAt: -1 }).lean();
      if (existingOtp && existingOtp.lastSentAt) {
        const elapsed = Date.now() - new Date(existingOtp.lastSentAt).getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
          const waitSecs = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
          return NextResponse.json(
            { error: `Please wait ${waitSecs} seconds before requesting another code.` },
            { status: 429, headers: { 'Retry-After': String(Math.max(1, waitSecs)) } }
          );
        }
      }

      if (!senderPass) {
        return NextResponse.json(
          { error: 'Email server credentials missing in environment variables.' },
          { status: 500 }
        );
      }

      // Cryptographically secure 6-digit OTP generation (CWE-338 mitigation)
      const generatedOtp = crypto.randomInt(100000, 1000000).toString();
      const now = new Date();
      const expiry = new Date(now.getTime() + 5 * 60 * 1000); // 5 min expiry

      // Atomic upsert avoids E11000 concurrent registration races
      const updatePayload = {
        otp: generatedOtp,
        expiresAt: expiry,
        isVerified: false,
        attempts: 0,
        lastSentAt: now,
      };
      let savedOtpDoc;
      try {
        savedOtpDoc = await OtpVerification.findOneAndUpdate(
          { email },
          { $set: updatePayload },
          { upsert: true, new: true }
        ).lean();
      } catch (upsertErr: any) {
        if (upsertErr?.code !== 11000) throw upsertErr;
        savedOtpDoc = await OtpVerification.findOneAndUpdate(
          { email },
          { $set: updatePayload },
          { new: true }
        ).lean();
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: senderUser,
          pass: senderPass,
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });

      try {
        await transporter.sendMail({
          from: `"ConceptNichod Security" <${senderUser}>`,
          to: email,
          subject: 'Your ConceptNichod Verification Code',
          html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e4e4e7; border-radius: 8px;">
            <h2 style="color: #4f46e5; margin-top: 0;">Verification Code</h2>
            <p style="color: #3f3f46; font-size: 15px;">Use the code below to complete your verification:</p>
            <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; margin: 20px 0; color: #18181b;">
              ${generatedOtp}
            </div>
            <p style="color: #71717a; font-size: 13px;">This code will expire in 5 minutes. If you did not request this, you can safely ignore this email.</p>
          </div>
        `,
        });
      } catch (mailError) {
        // Release cooldown if email delivery failed so user can immediately retry
        if (savedOtpDoc?._id) {
          await OtpVerification.deleteOne({ _id: savedOtpDoc._id, otp: generatedOtp }).catch(() => {});
        }
        throw mailError;
      }

      return NextResponse.json({ success: true, message: 'OTP sent successfully' });
    }

    if (action === 'verify') {
      // IP Rate limiting for verification attempts: 15 attempts per 15 minutes
      const ipUnavailable = ip === "127.0.0.1" || ip === "unknown";
      const verifyRateLimit = ipUnavailable
        ? await checkDistributedRateLimit(`otp:verify:ip:${ip}:${email}`, 15, 15 * 60 * 1000)
        : await checkDistributedRateLimit(`otp:verify:${ip}`, 15, 15 * 60 * 1000);
      const verifyEmailRateLimit = await checkDistributedRateLimit(`otp:verify:email:${email}`, 15, 15 * 60 * 1000);
      const verifyCanonicalEmailRateLimit =
        normalizedEmail !== email
          ? await checkDistributedRateLimit(`otp:verify:email:${normalizedEmail}`, 15, 15 * 60 * 1000)
          : verifyEmailRateLimit;
      if (!verifyRateLimit.success || !verifyEmailRateLimit.success || !verifyCanonicalEmailRateLimit.success) {
        const retryMs = Math.max(verifyRateLimit.resetMs, verifyEmailRateLimit.resetMs, verifyCanonicalEmailRateLimit.resetMs);
        return NextResponse.json(
          { error: 'Too many verification attempts from this IP. Please wait a few minutes before trying again.' },
          { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryMs / 1000))) } }
        );
      }

      if (typeof otp !== 'string') {
        return NextResponse.json({ error: 'OTP is required' }, { status: 400 });
      }
      const sanitizedOtp = otp.trim();
      if (!sanitizedOtp || sanitizedOtp.length > 32) {
        return NextResponse.json({ error: 'Invalid verification code format.' }, { status: 400 });
      }

      const now = new Date();
      // Increment attempts in MongoDB so parallel requests cannot overwrite one
      // another's counter and bypass the per-code verification limit.
      const otpRecord = await OtpVerification.findOneAndUpdate(
        { email, expiresAt: { $gt: now }, attempts: { $lt: MAX_VERIFY_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { new: true }
      );

      if (!otpRecord) {
        const currentRecord = await OtpVerification.findOne({ email }).lean();
        if (!currentRecord) {
          return NextResponse.json({ error: 'No verification code requested for this email' }, { status: 404 });
        }
        if (currentRecord.expiresAt <= now) {
          await OtpVerification.deleteOne({ _id: currentRecord._id, expiresAt: { $lte: now } });
          return NextResponse.json({ error: 'Verification code has expired. Please request a new code.' }, { status: 400 });
        }
        if ((currentRecord.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
          await OtpVerification.deleteOne({
            _id: currentRecord._id,
            isVerified: false,
            attempts: { $gte: MAX_VERIFY_ATTEMPTS },
          });
          return NextResponse.json(
            { error: 'Too many incorrect attempts. This code has been invalidated for security. Please request a new one.' },
            { status: 429 }
          );
        }
        return NextResponse.json({ error: 'Verification code is no longer valid. Please request a new one.' }, { status: 400 });
      }

      if (!timingSafeOtpEquals(otpRecord.otp, sanitizedOtp)) {
        if (otpRecord.attempts >= MAX_VERIFY_ATTEMPTS) {
          await OtpVerification.deleteOne({
            _id: otpRecord._id,
            isVerified: false,
            attempts: { $gte: MAX_VERIFY_ATTEMPTS },
          });
        }
        const remaining = Math.max(0, MAX_VERIFY_ATTEMPTS - otpRecord.attempts);
        return NextResponse.json(
          { error: `Invalid code. ${remaining} attempt(s) remaining before invalidation.` },
          { status: 400 }
        );
      }

      // Conditional update prevents a stale request from verifying an expired,
      // replaced, or already-consumed OTP record.
      const verifiedRecord = await OtpVerification.findOneAndUpdate(
        { _id: otpRecord._id, otp: sanitizedOtp, isVerified: false, expiresAt: { $gt: new Date() } },
        { $set: { isVerified: true } },
        { new: true }
      );
      if (!verifiedRecord) {
        const alreadyVerified = await OtpVerification.exists({ _id: otpRecord._id, isVerified: true });
        if (alreadyVerified) {
          return NextResponse.json({ success: true, message: 'Email verified successfully' });
        }
        return NextResponse.json({ error: 'Verification code has expired or is no longer valid.' }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: 'Email verified successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('OTP error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while processing verification. Please try again.' },
      { status: 500 }
    );
  }
}
```

### FILE 2: `src/models/User.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  uuid: string;
  username: string;
  email: string;
  password: string;
  role: "user" | "owner";
  sessionVersion: number;
  bio?: string;
  fullName: string;
  gender: string;
  dob: string;
  classLevel: string;
  examFocus?: string;
  city: string;
  futureCollege?: string;
  snapchat?: string;
  instagram?: string;
  firstLoginIp?: string;
  firstLoginAt?: Date;
  lastLoginIp?: string;
  lastLoginAt?: Date;
  lastKnownIp?: string;
  createdAt: Date;
}

const UserSchema: Schema<IUser> = new Schema({
  uuid: { type: String, required: true, unique: true, index: true, trim: true },
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["user", "owner"], default: "user" },
  sessionVersion: { type: Number, default: 0, min: 0 },
  bio: { type: String, default: "", trim: true, maxlength: 500 },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  gender: { type: String, required: true, trim: true, maxlength: 40 },
  dob: { type: String, required: true, trim: true, maxlength: 40 },
  classLevel: { type: String, required: true, trim: true, maxlength: 60 },
  examFocus: { type: String, required: false, trim: true, maxlength: 100 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  futureCollege: { type: String, required: false, trim: true, maxlength: 160 },
  snapchat: { type: String, required: false, trim: true, maxlength: 80 },
  instagram: { type: String, required: false, trim: true, maxlength: 80 },
  firstLoginIp: { type: String, required: false },
  firstLoginAt: { type: Date, required: false },
  lastLoginIp: { type: String, required: false },
  lastLoginAt: { type: Date, required: false },
  lastKnownIp: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
});

// Defensive hook: retained temporarily until Batch 5 verifies every User.find* caller
UserSchema.pre(["find", "findOne", "findOneAndUpdate", "deleteOne", "deleteMany"], function (this: any) {
  const query = this.getQuery();
  if (query && typeof query.uuid === "string" && query.uuid.includes(".")) {
    query.uuid = query.uuid.split(".")[0];
  }
});

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
```

### FILE 3: `src/app/actions/broadcast.ts`
```ts
"use server";

import mongoose from "mongoose";
import { isPlatformOwner } from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Broadcast from "@/models/Broadcast";
import NotificationRead from "@/models/NotificationRead";
import { verifySessionCookie } from "@/lib/session";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import { UTApi } from "uploadthing/server";

const ALLOWED_ATTACHMENT_HOSTS = ["utfs.io", "uploadthing.com", "ufs.sh"];

function parseSafeUploadThingUrl(rawUrl: string): { url: string; fileKey: string } | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsedUrl = new URL(trimmed);
    const isAllowedHost = ALLOWED_ATTACHMENT_HOSTS.some(
      (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );
    if (
      parsedUrl.protocol !== "https:" ||
      !isAllowedHost ||
      parsedUrl.username ||
      parsedUrl.password ||
      !parsedUrl.pathname.startsWith("/f/")
    ) {
      return null;
    }
    const candidateKey = parsedUrl.pathname.slice(3);
    if (
      !candidateKey ||
      candidateKey === "." ||
      candidateKey === ".." ||
      !/^[A-Za-z0-9._-]+$/.test(candidateKey)
    ) {
      return null;
    }
    return { url: parsedUrl.toString(), fileKey: candidateKey };
  } catch {
    return null;
  }
}

async function verifyOwner() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid })
    .select("uuid username email role")
    .lean();
  if (!isPlatformOwner(user)) {
    throw new Error("Forbidden: Admin access only");
  }
  return user;
}

export async function createBroadcastAction(formData: FormData) {
  const owner = await verifyOwner();

  if (!(formData instanceof FormData)) {
    throw new Error("Invalid broadcast submission.");
  }

  const rateCheck = await checkDistributedRateLimit(`broadcast:create:${owner.uuid}`, 20, 60 * 60 * 1000);
  if (!rateCheck.success) {
    throw new Error("Too many broadcasts created recently. Please wait before creating another.");
  }

  const rawSubject = formData.get("subject");
  const rawMessage = formData.get("message");
  const rawFileUrl = formData.get("fileUrl");
  const rawExpiry = formData.get("expiryHours");

  const subject = typeof rawSubject === "string" ? rawSubject.trim() : "";
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";

  if (!subject || !message) {
    throw new Error("Missing subject or message");
  }
  if (subject.length > 200 || message.length > 10000) {
    throw new Error("Subject or message exceeds maximum allowed length.");
  }

  let safeFileUrl: string | undefined;
  if (typeof rawFileUrl === "string" && rawFileUrl.trim().length > 0) {
    const parsedAttachment = parseSafeUploadThingUrl(rawFileUrl);
    if (!parsedAttachment) {
      throw new Error("Invalid attachment URL. Only HTTPS UploadThing attachment URLs are permitted.");
    }
    safeFileUrl = parsedAttachment.url;
  }

  // Adjustable expiration time (1 to 720 hours; defaults to 36 hours when omitted)
  let expiryHours = 36;
  if (typeof rawExpiry === "string" && rawExpiry.trim().length > 0) {
    const parsedHours = Number(rawExpiry.trim());
    if (!Number.isFinite(parsedHours) || parsedHours < 1 || parsedHours > 720) {
      throw new Error("Expiry duration must be between 1 and 720 hours.");
    }
    expiryHours = parsedHours;
  }
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  await Broadcast.create({
    subject,
    message,
    fileUrl: safeFileUrl,
    expiresAt,
  });

  return { success: true };
}

export async function getActiveBroadcastsAction() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  // Fetch active broadcasts that have not expired yet (bounded for safety)
  const broadcasts = await Broadcast.find({ expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return { success: true, broadcasts: JSON.parse(JSON.stringify(broadcasts)) };
}

export async function markBroadcastsAsReadAction() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  await NotificationRead.findOneAndUpdate(
    { userId: sessionUuid },
    { $set: { lastReadAt: new Date() } },
    { upsert: true, new: true }
  );

  return { success: true };
}

export async function getUnreadCountAction() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) return { success: true, count: 0 };

  const readState = await NotificationRead.findOne({ userId: sessionUuid })
    .select("lastReadAt")
    .lean();
  const lastReadAt = readState?.lastReadAt || new Date(0); // If never read, consider all as unread

  // Count active broadcasts created AFTER the user last opened the bell
  const count = await Broadcast.countDocuments({
    expiresAt: { $gt: new Date() },
    createdAt: { $gt: lastReadAt },
  });

  return { success: true, count };
}

export async function deleteBroadcastAction(id: string) {
  await verifyOwner();

  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new Error("Invalid broadcast ID.");
  }

  const broadcast = await Broadcast.findById(id).select("_id fileUrl").lean();
  if (!broadcast) {
    return { success: true };
  }

  if (broadcast.fileUrl) {
    const parsedAttachment = parseSafeUploadThingUrl(broadcast.fileUrl);
    if (parsedAttachment) {
      try {
        const utapi = new UTApi();
        const delRes = await utapi.deleteFiles([parsedAttachment.fileKey]);
        if (!delRes?.success) {
          console.warn("UploadThing deletion returned unsuccessful for broadcast:", id);
        }
      } catch (err) {
        console.warn("Failed to delete UploadThing attachment for broadcast:", id, err);
      }
    }
  }

  await Broadcast.findByIdAndDelete(id);
  return { success: true };
}
```

### FILE 4: `src/app/actions/email-broadcast.ts`
```ts
"use server";

import { isPlatformOwner, PLATFORM_OWNER_EMAIL } from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import EmailBroadcast from "@/models/EmailBroadcast";
import nodemailer from "nodemailer";
import { verifySessionCookie } from "@/lib/session";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";

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

  const user = await User.findOne({ uuid: sessionUuid })
    .select("uuid username email role")
    .lean();
  if (!isPlatformOwner(user)) {
    throw new Error("Forbidden: Admin access only");
  }
  return user;
}

export async function sendEmailBroadcastAction(formData: FormData) {
  await verifyOwner();

  if (!(formData instanceof FormData)) {
    throw new Error("Invalid email broadcast submission.");
  }

  const ownerRateCheck = await checkDistributedRateLimit("email-broadcast:owner", 10, 60 * 60 * 1000);
  if (!ownerRateCheck.success) {
    throw new Error("Too many email broadcasts sent recently. Please wait before sending another.");
  }

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
  const attachmentName = rawAttachmentName.replace(/[\r\n\\"]/g, "").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "attachment";

  if (recipientType !== "all" && recipientType !== "custom") throw new Error("Invalid recipient selection.");
  if (!subject || subject.length > 180 || /[\r\n]/.test(subject)) throw new Error("Subject must be 1-180 characters and cannot contain line breaks.");
  if (!body || !body.trim() || body.length > 20000) throw new Error("Email body must contain between 1 and 20,000 characters.");

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
      throw new Error(err?.message || "Invalid attachment URL provided.");
    }
  }

  const senderUser = (
    process.env.EMAIL_SERVER_USER ||
    process.env.GMAIL_USER ||
    PLATFORM_OWNER_EMAIL
  ).trim();

  const senderPass =
    process.env.EMAIL_SERVER_PASSWORD ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.EMAIL_PASS;

  if (!senderPass) {
    throw new Error(
      "Gmail credentials not configured. Please add EMAIL_SERVER_PASSWORD or GMAIL_APP_PASSWORD to your environment variables (generate a 16-character App Password at myaccount.google.com/apppasswords)."
    );
  }

  // Determine recipients (deduplicated)
  let toRecipients: string[] = [];
  if (recipientType === "all") {
    const allUsers = await User.find({}).select("email").limit(501).lean();
    if (allUsers.length > 500) throw new Error("Gmail broadcasts are limited to 500 recipients per message.");
    toRecipients = Array.from(
      new Set(allUsers.map((u) => String(u.email || "").toLowerCase().trim()).filter(Boolean))
    );
  } else {
    toRecipients = Array.from(
      new Set(customTo.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))
    );
  }
  const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  const maxToRecipients = 500;
  if (toRecipients.length > maxToRecipients || toRecipients.some((email) => !emailPattern.test(email))) {
    throw new Error(`Recipient lists must contain at most ${maxToRecipients} valid email addresses.`);
  }

  if (toRecipients.length === 0) {
    throw new Error("No valid recipient email addresses found.");
  }

  const ccRecipients = Array.from(
    new Set(ccStr.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))
  );
  const bccRecipients = Array.from(
    new Set(bccStr.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))
  );
  if (ccRecipients.length > 50 || bccRecipients.length > 50 ||
      ccRecipients.some((email) => !emailPattern.test(email)) ||
      bccRecipients.some((email) => !emailPattern.test(email))) {
    throw new Error("CC and BCC lists must each contain at most 50 valid email addresses.");
  }
  const allModeBcc = Array.from(new Set([...toRecipients, ...bccRecipients]));
  const totalRecipientCount = recipientType === "all"
    ? allModeBcc.length + ccRecipients.length
    : toRecipients.length + ccRecipients.length + bccRecipients.length;
  if (totalRecipientCount > 500) {
    throw new Error("A single Gmail broadcast cannot exceed 500 total recipients.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: senderUser,
      pass: senderPass,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  // Prepare HTML content
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; border: 1px solid #e4e4e7; border-radius: 10px; color: #18181b;">
      <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #4f46e5; font-size: 20px;">ConceptNichod Official Broadcast</h2>
        <p style="margin: 4px 0 0; color: #71717a; font-size: 13px;">Sent from ${escapeHtml(senderUser)}</p>
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
    mailOptions.to = senderUser;
    if (ccRecipients.length > 0) mailOptions.cc = ccRecipients;
    mailOptions.bcc = allModeBcc;
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

  const loggedTo = recipientType === "all" ? [senderUser] : toRecipients;
  const loggedBcc = recipientType === "all" ? allModeBcc : bccRecipients;

  try {
    const info = await transporter.sendMail(mailOptions);

    await EmailBroadcast.create({
      sender: senderUser,
      to: loggedTo,
      cc: ccRecipients,
      bcc: loggedBcc,
      subject,
      body,
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentUrl ? attachmentName : undefined,
      sentCount: totalRecipientCount,
      status: "sent",
    });

    return {
      success: true,
      messageId: info.messageId,
      recipientCount: totalRecipientCount,
      sentCount: totalRecipientCount,
    };
  } catch (error: any) {
    console.error("Nodemailer broadcast error:", error);

    // Save failed attempt with privacy-consistent recipient fields
    try {
      await EmailBroadcast.create({
        sender: senderUser,
        to: loggedTo,
        cc: ccRecipients,
        bcc: loggedBcc,
        subject,
        body,
        attachmentUrl: attachmentUrl || undefined,
        attachmentName: attachmentUrl ? attachmentName : undefined,
        sentCount: 0,
        status: "failed",
        error: String(error?.message || "SMTP delivery failed").slice(0, 2000),
      });
    } catch {}

    throw new Error("Email broadcast failed to send. Please check SMTP credentials and try again.");
  }
}

export async function getEmailBroadcastsAction() {
  await verifyOwner();
  const broadcasts = await EmailBroadcast.find({}).sort({ createdAt: -1 }).limit(20).lean();
  return JSON.parse(JSON.stringify(broadcasts));
}

export const getEmailBroadcastHistoryAction = getEmailBroadcastsAction;
```

### FILE 5: `src/app/actions/admin.ts`
```ts
"use server";

import mongoose from "mongoose";
import {
  isPlatformOwner,
  PLATFORM_OWNER_EMAIL,
  PLATFORM_OWNER_USERNAME,
} from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import Topic from "@/models/Topic";
import ConceptMirror from "@/models/ConceptMirror";
import MistakeEntry from "@/models/MistakeEntry";
import StudyStreak from "@/models/StudyStreak";
import NotificationRead from "@/models/NotificationRead";
import OtpVerification from "@/models/OtpVerification";
import GroupMessage from "@/models/GroupMessage";
import DirectMessage from "@/models/DirectMessage";
import Donor from "@/models/Donor";
import DonationTransaction from "@/models/DonationTransaction";
import StudyGroup from "@/models/StudyGroup";
import { verifySessionCookie } from "@/lib/session";
import { normalizeEmail } from "@/lib/email-utils";
import { sanitizeIp } from "@/lib/ip";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCanonicalEmailFilter(email: string): Record<string, unknown> {
  const lower = email.trim().toLowerCase();
  const canonical = normalizeEmail(lower);
  const clauses: Record<string, unknown>[] = [
    { email: { $regex: new RegExp(`^${escapeRegex(lower)}$`, "i") } },
    { email: { $regex: new RegExp(`^${escapeRegex(canonical)}$`, "i") } },
  ];
  const atIndex = canonical.lastIndexOf("@");
  if (atIndex > 0) {
    const local = canonical.slice(0, atIndex);
    const domain = canonical.slice(atIndex + 1);
    if ((domain === "gmail.com" || domain === "googlemail.com") && local.length <= 64) {
      const dotInsensitive = local.split("").map(escapeRegex).join("\\.?");
      clauses.push({ email: { $regex: new RegExp(`^${dotInsensitive}@(gmail|googlemail)\\.com$`, "i") } });
    }
  }
  return { $or: clauses };
}

async function verifyOwner() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid })
    .select("uuid username email role")
    .lean();
  if (!isPlatformOwner(user)) {
    throw new Error("Forbidden: Admin access only");
  }

  // Authorization is based on the dedicated root account identity above.
  // Preserve the stored role (including "owner") instead of rewriting it
  // every time an admin action executes.
  return user;
}

export async function getAllUsersAction() {
  await verifyOwner();
  // Security: Exclude password hashes from serialization
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(1000).lean();
  return { success: true, users: JSON.parse(JSON.stringify(users)) };
}

export async function deleteUserAction(uuid: string) {
  await verifyOwner();

  if (typeof uuid !== "string" || !uuid.trim()) {
    throw new Error("Target user UUID is required.");
  }
  const cleanUuid = uuid.trim();

  // Protect admin from self-deletion
  const userToDelete = await User.findOne({ uuid }).select("username email role").lean();
  if (isPlatformOwner(userToDelete)) {
    throw new Error("Cannot delete the platform owner account.");
  }

  const ownedGroups = await StudyGroup.find({ ownerId: cleanUuid }).select("_id").lean();
  const ownedGroupIds = ownedGroups.map((g) => String(g._id));

  const cleanupTasks: Promise<unknown>[] = [
    Topic.deleteMany({ userId: cleanUuid }),
    ConceptMirror.deleteMany({ userId: cleanUuid }),
    MistakeEntry.deleteMany({ userId: cleanUuid }),
    StudyStreak.deleteMany({ userId: cleanUuid }),
    NotificationRead.deleteMany({ userId: cleanUuid }),
    StudyGroup.deleteMany({ ownerId: cleanUuid }),
    StudyGroup.updateMany({ memberIds: cleanUuid }, { $pull: { memberIds: cleanUuid } }),
    GroupMessage.deleteMany(
      ownedGroupIds.length > 0
        ? { $or: [{ senderId: cleanUuid }, { groupId: { $in: ownedGroupIds } }] }
        : { senderId: cleanUuid }
    ),
    DirectMessage.deleteMany({ participantIds: cleanUuid }),
  ];

  if (userToDelete?.email) {
    const emailCandidates = Array.from(
      new Set([userToDelete.email.toLowerCase().trim(), normalizeEmail(userToDelete.email)].filter(Boolean))
    );
    if (emailCandidates.length > 0) {
      cleanupTasks.push(OtpVerification.deleteMany({ email: { $in: emailCandidates } }));
    }
  }

  await Promise.all(cleanupTasks);
  await User.deleteOne({ uuid: cleanUuid });

  return { success: true };
}

export async function banEntityAction(type: "ip" | "email" | "username", value: string, reason?: string) {
  await verifyOwner();
  if (!["ip", "email", "username"].includes(type) || typeof value !== "string" || !value.trim() || value.trim().length > 320) {
    throw new Error("A valid ban type and value are required.");
  }
  const normalizedValue =
    type === "ip"
      ? sanitizeIp(value.trim())
      : type === "email"
        ? normalizeEmail(value.trim())
        : value.trim().toLowerCase();

  // Unconditionally guard platform owner username & canonical email
  if (
    (type === "username" && normalizedValue === PLATFORM_OWNER_USERNAME) ||
    (type === "email" && (normalizedValue === PLATFORM_OWNER_EMAIL || normalizedValue === normalizeEmail(PLATFORM_OWNER_EMAIL)))
  ) {
    throw new Error("Cannot ban the platform owner account or its current IP address.");
  }

  const rawLowerValue = value.trim().toLowerCase();
  const targetMatcher = type === "ip"
    ? { $or: [{ firstLoginIp: normalizedValue }, { lastLoginIp: normalizedValue }, { lastKnownIp: normalizedValue }] }
    : type === "email"
      ? buildCanonicalEmailFilter(rawLowerValue)
      : { username: { $regex: new RegExp(`^${escapeRegex(normalizedValue)}$`, "i") } };

  const ownerIdentity = await User.findOne({
    role: "owner",
    $and: [
      { $or: [{ username: PLATFORM_OWNER_USERNAME }, { email: PLATFORM_OWNER_EMAIL }] },
      targetMatcher,
    ],
  }).select("username email role").lean();
  if (isPlatformOwner(ownerIdentity)) {
    throw new Error("Cannot ban the platform owner account or its current IP address.");
  }

  try {
    await Blacklist.create({
      type,
      value: normalizedValue,
      reason: typeof reason === "string" ? reason.trim().slice(0, 500) : undefined,
    });
    return { success: true };
  } catch (e: any) {
    if (e?.code === 11000) {
      throw new Error("This entity is already banned.");
    }
    throw new Error("Failed to ban entity");
  }
}

export async function unbanEntityAction(id: string) {
  await verifyOwner();
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new Error("Invalid ban record ID.");
  }
  await Blacklist.findByIdAndDelete(id);
  return { success: true };
}

export async function getBansAction() {
  await verifyOwner();
  const bans = await Blacklist.find({}).sort({ createdAt: -1 }).limit(1000).lean();
  return { success: true, bans: JSON.parse(JSON.stringify(bans)) };
}

export async function updateUserCredentialsAction(params: {
  targetUuid: string;
  newUsername?: string;
  newEmail?: string;
}) {
  const ownerUser = await verifyOwner();
  if (!isPlatformOwner(ownerUser)) {
    throw new Error("Unauthorized: Only the platform owner can modify user credentials.");
  }

  if (!params || typeof params !== "object") {
    throw new Error("Invalid credential update payload.");
  }

  const { targetUuid, newUsername, newEmail } = params;
  if (typeof targetUuid !== "string" || !targetUuid.trim()) {
    throw new Error("Target user UUID is required.");
  }
  const cleanTargetUuid = targetUuid.trim();

  const targetUser = await User.findOne({ uuid: cleanTargetUuid });
  if (!targetUser) {
    throw new Error("Target user not found.");
  }

  let usernameChanged = false;
  let emailChanged = false;
  const targetIsOwner = isPlatformOwner(targetUser);

  // Validate and handle username update
  if (newUsername !== undefined) {
    if (typeof newUsername !== "string") {
      throw new Error("Username must be a string.");
    }
    const trimmedUsername = newUsername.trim();
    const validUsername = /^[a-zA-Z0-9_.]+$/;
    if (!validUsername.test(trimmedUsername) || trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      throw new Error("Username must be 3-30 characters and contain only letters, numbers, underscores (_), and periods (.).");
    }

    if (trimmedUsername.toLowerCase() === PLATFORM_OWNER_USERNAME.toLowerCase() && targetUser.username.toLowerCase() !== PLATFORM_OWNER_USERNAME.toLowerCase()) {
      throw new Error(`Username "${PLATFORM_OWNER_USERNAME}" is reserved for the platform owner.`);
    }

    if ((targetIsOwner || targetUser.username.toLowerCase() === PLATFORM_OWNER_USERNAME.toLowerCase()) && trimmedUsername.toLowerCase() !== PLATFORM_OWNER_USERNAME.toLowerCase()) {
      throw new Error(`The root platform owner username "${PLATFORM_OWNER_USERNAME}" cannot be changed.`);
    }

    // Escape regex metacharacters (dots are permitted in usernames)
    const collision = await User.findOne({
      username: { $regex: new RegExp(`^${escapeRegex(trimmedUsername)}$`, "i") },
      uuid: { $ne: cleanTargetUuid },
    }).select("_id").lean();

    if (collision) {
      throw new Error(`Username "@${trimmedUsername}" is already taken by another account.`);
    }

    if (targetUser.username !== trimmedUsername) {
      targetUser.username = trimmedUsername;
      usernameChanged = true;
    }
  }

  // Validate and handle email update
  if (newEmail !== undefined) {
    if (typeof newEmail !== "string") {
      throw new Error("Email must be a string.");
    }
    const trimmedEmail = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 254) {
      throw new Error("Invalid email address format.");
    }

    const canonicalNewEmail = normalizeEmail(trimmedEmail);
    const canonicalOwnerEmail = normalizeEmail(PLATFORM_OWNER_EMAIL);
    if (targetIsOwner && canonicalNewEmail !== canonicalOwnerEmail) {
      throw new Error("The root platform owner email cannot be changed.");
    }
    if (!targetIsOwner && (trimmedEmail === PLATFORM_OWNER_EMAIL || canonicalNewEmail === canonicalOwnerEmail)) {
      throw new Error("This email is reserved for the platform owner.");
    }

    // Check case-insensitive & Gmail dot-variant collision with another user
    const collision = await User.findOne({
      ...buildCanonicalEmailFilter(trimmedEmail),
      uuid: { $ne: cleanTargetUuid },
    }).select("_id").lean();

    if (collision) {
      throw new Error(`Email "${trimmedEmail}" is already registered to another account.`);
    }

    if (targetUser.email.toLowerCase() !== trimmedEmail) {
      targetUser.email = trimmedEmail;
      emailChanged = true;
    }
  }

  if (!usernameChanged && !emailChanged) {
    return {
      success: true,
      message: "No credential changes made.",
      user: {
        uuid: targetUser.uuid,
        username: targetUser.username,
        email: targetUser.email,
      },
    };
  }

  try {
    await targetUser.save();
  } catch (err: any) {
    if (err?.code === 11000) {
      throw new Error("The requested username or email is already in use by another account.");
    }
    throw new Error("Failed to update user credentials.");
  }

  // Cascade username update across chats and donation records by immutable user UUID
  if (usernameChanged) {
    await Promise.allSettled([
      GroupMessage.updateMany({ senderId: cleanTargetUuid }, { $set: { senderUsername: targetUser.username } }),
      DirectMessage.updateMany({ senderId: cleanTargetUuid }, { $set: { senderUsername: targetUser.username } }),
      Donor.updateMany(
        { $or: [{ userId: cleanTargetUuid }, { userUuid: cleanTargetUuid }] },
        { $set: { username: targetUser.username } }
      ),
      DonationTransaction.updateMany(
        { $or: [{ userId: cleanTargetUuid }, { userUuid: cleanTargetUuid }] },
        { $set: { username: targetUser.username } }
      ),
    ]);
  }

  return {
    success: true,
    message: "Credentials successfully updated.",
    user: {
      uuid: targetUser.uuid,
      username: targetUser.username,
      email: targetUser.email,
    },
  };
}

export async function getAllStudyGroupsAdminAction() {
  await verifyOwner();

  const groups = await StudyGroup.find({}).sort({ createdAt: -1 }).limit(500).lean();

  const ownerIds = Array.from(new Set(groups.map((g) => g.ownerId)));
  const groupIds = groups.map((g) => g._id.toString());

  const [owners, messageCounts] = await Promise.all([
    ownerIds.length > 0
      ? User.find({ uuid: { $in: ownerIds } })
          .select("uuid username fullName email")
          .lean()
      : Promise.resolve([]),
    groupIds.length > 0
      ? GroupMessage.aggregate([
          { $match: { groupId: { $in: groupIds } } },
          { $group: { _id: "$groupId", count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
  ]);

  const ownerMap = new Map(owners.map((o) => [o.uuid, o]));
  const countMap = new Map(messageCounts.map((m: any) => [m._id ? m._id.toString() : "", m.count]));

  return {
    success: true,
    groups: groups.map((g: any) => ({
      id: g._id.toString(),
      name: g.name,
      description: g.description,
      subject: g.subject,
      examFocus: g.examFocus || "General",
      schedule: g.schedule || "Flexible",
      ownerId: g.ownerId,
      ownerUsername: ownerMap.get(g.ownerId)?.username || "Unknown",
      ownerFullName: ownerMap.get(g.ownerId)?.fullName || "Unknown Aspirant",
      ownerEmail: ownerMap.get(g.ownerId)?.email || "",
      memberCount: (g.memberIds || []).length,
      messageCount: countMap.get(g._id.toString()) || 0,
      createdAt: g.createdAt ? new Date(g.createdAt).toISOString() : new Date().toISOString(),
    })),
  };
}

export async function deleteStudyGroupAdminAction(groupId: string) {
  const owner = await verifyOwner();
  if (!isPlatformOwner(owner)) {
    throw new Error("Forbidden: Only @mythicalhrg can delete study groups.");
  }

  if (typeof groupId !== "string" || !mongoose.isValidObjectId(groupId)) {
    throw new Error("Valid Group ID is required.");
  }

  const group = await StudyGroup.findById(groupId).select("name").lean();
  if (!group) {
    throw new Error("Study group not found or already deleted.");
  }

  const groupName = group.name;

  await Promise.all([
    StudyGroup.findByIdAndDelete(groupId),
    GroupMessage.deleteMany({ groupId }),
  ]);

  return {
    success: true,
    message: `Study group "${groupName}" and all associated messages have been deleted.`,
  };
}
```

### FILE 6: `src/app/actions/auth.ts`
```ts
"use server";
import { cookies } from "next/headers";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import OtpVerification from "@/models/OtpVerification";
import Blacklist from "@/models/Blacklist";
import { hashPassword, comparePassword } from "@/lib/encryption";
import crypto from "crypto";
import { getClientIp } from "@/lib/ip";
import { createSignedSessionCookie, verifySessionCookie } from "@/lib/session";
import {
  checkDistributedRateLimit,
  resetDistributedRateLimit,
} from "@/lib/distributed-rate-limiter";
import { normalizeEmail, validateEmail } from "@/lib/email-utils";
import {
  isPlatformOwner,
  PLATFORM_OWNER_EMAIL,
  PLATFORM_OWNER_USERNAME,
} from "@/lib/owner-access";

const SAFE_USER_PROJECTION =
  "uuid username email role bio fullName gender dob classLevel examFocus city futureCollege snapchat instagram";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function timingSafeOtpEquals(expected: string, supplied: string): boolean {
  const a = crypto.createHash("sha256").update(expected, "utf8").digest();
  const b = crypto.createHash("sha256").update(supplied, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function buildEmailLookupClause(email: string): Record<string, unknown>[] {
  const lower = email.trim().toLowerCase();
  const canonical = normalizeEmail(lower);
  const clauses: Record<string, unknown>[] = [
    { email: new RegExp(`^${escapeRegex(lower)}$`, "i") },
    { email: new RegExp(`^${escapeRegex(canonical)}$`, "i") },
  ];
  const atIndex = canonical.lastIndexOf("@");
  if (atIndex > 0) {
    const local = canonical.slice(0, atIndex);
    const domain = canonical.slice(atIndex + 1);
    if ((domain === "gmail.com" || domain === "googlemail.com") && local.length <= 64) {
      const dotInsensitive = local.split("").map(escapeRegex).join("\\.?");
      clauses.push({ email: new RegExp(`^${dotInsensitive}@(gmail|googlemail)\\.com$`, "i") });
    }
  }
  return clauses;
}

function serializeSafeUser(user: any) {
  return {
    uuid: user.uuid,
    username: user.username,
    email: user.email,
    bio: user.bio,
    fullName: user.fullName,
    gender: user.gender,
    dob: user.dob,
    classLevel: user.classLevel,
    examFocus: user.examFocus,
    city: user.city,
    futureCollege: user.futureCollege,
    snapchat: user.snapchat,
    instagram: user.instagram,
  };
}

async function isAccountBlacklisted(email?: string | null, username?: string | null, ip?: string | null): Promise<boolean> {
  const clauses: Record<string, unknown>[] = [];
  if (ip) {
    clauses.push({ type: "ip", value: ip });
  }
  if (email) {
    const lower = email.toLowerCase().trim();
    const canonical = normalizeEmail(lower);
    clauses.push({ type: "email", value: { $in: Array.from(new Set([lower, canonical].filter(Boolean))) } });
  }
  if (username) {
    clauses.push({ type: "username", value: username.toLowerCase().trim() });
  }
  if (clauses.length === 0) return false;
  const hit = await Blacklist.findOne({ $or: clauses }).select("_id").lean();
  return Boolean(hit);
}

function validatePassword(password: string) {
    if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters long.";
    if (password.length > 128) return "Password cannot exceed 128 characters.";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
    if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special symbol.";
    return null;
}

export async function validateUsername(username: string): Promise<string | null> {
    if (typeof username !== "string" || !username || username.length < 3 || username.length > 30) {
        return "Username must be between 3 and 30 characters long.";
    }
    // Only alphanumeric characters, underscores (_), and periods (.)
    // No spaces, and no @, /, (, ), +, -, &, ", *, ', :, ;, !, ?, #, or ₹
    const validUsernameRegex = /^[a-zA-Z0-9_.]+$/;
    if (!validUsernameRegex.test(username)) {
        return "Usernames can only include letters, numbers, underscores (_), and periods (.). Spaces and other symbols are not allowed.";
    }

    const clean = username.toLowerCase().trim();
    if (clean === PLATFORM_OWNER_USERNAME) {
        return "This username is reserved for system administration.";
    }

    try {
        await dbConnect();
        const ip = await getClientIp();
        const checkRate = await checkDistributedRateLimit(`username-check:${ip}`, 30, 15 * 60 * 1000);
        if (!checkRate.success) {
            return "Too many username availability checks. Please wait a few minutes.";
        }

        const isBanned = await Blacklist.findOne({ type: "username", value: clean }).select("_id").lean();
        if (isBanned) {
            return "This username is not available.";
        }

        const existing = await User.findOne({ username: new RegExp(`^${escapeRegex(clean)}$`, 'i') })
            .select("_id")
            .lean();
        if (existing) {
            return "A user with this username already exists. Please choose a different username.";
        }
    } catch (err) {
        console.error("Error validating username against database:", err);
        // Registration must fail closed if uniqueness cannot be checked.
        return "Username availability could not be verified. Please try again.";
    }

    return null;
}

export async function registerAction(formData: FormData) {
    try {
        if (!(formData instanceof FormData)) {
            throw new Error("Invalid registration payload.");
        }
        const readStr = (key: string) => {
            const val = formData.get(key);
            return typeof val === "string" ? val : "";
        };

        const email = readStr("email").toLowerCase().trim();
        const username = readStr("username").toLowerCase().trim();
        const password = readStr("password");
        const fullName = readStr("fullName").trim();
        const gender = readStr("gender").trim();
        const dob = readStr("dob").trim();
        const classLevel = readStr("classLevel").trim();
        const examFocus = readStr("examFocus").trim() || null;
        const city = readStr("city").trim();
        const futureCollege = readStr("futureCollege").trim() || null;
        const snapchat = readStr("snapchat").trim() || null;
        const instagram = readStr("instagram").trim() || null;

        await dbConnect();
        if (!email || !username || !password || !fullName || !gender || !dob || !classLevel || !city) {
            throw new Error("Missing required fields");
        }
        if (
            email.length > 254 ||
            fullName.length > 120 ||
            gender.length > 40 ||
            dob.length > 40 ||
            classLevel.length > 60 ||
            city.length > 100 ||
            (examFocus && examFocus.length > 100) ||
            (futureCollege && futureCollege.length > 160) ||
            (snapchat && snapchat.length > 80) ||
            (instagram && instagram.length > 80)
        ) {
            throw new Error("One or more registration fields exceed the maximum allowed length.");
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) throw new Error(emailValidation.error);

        const normalizedEmail = normalizeEmail(email);

        if (username === "mythicalhrg" || email === "mythicalhrg@gmail.com" || normalizedEmail === "mythicalhrg@gmail.com") {
            throw new Error("This username and email are reserved for system administration.");
        }

        const usernameError = await validateUsername(username);
        if (usernameError) throw new Error(usernameError);

        const passwordError = validatePassword(password);
        if (passwordError) throw new Error(passwordError);

        const ip = await getClientIp();
        const ipUnavailable = ip === "127.0.0.1" || ip === "unknown";
        const regIpRateKey = ipUnavailable ? `register:${ip}:${normalizedEmail}` : `register:${ip}`;
        const regRate = await checkDistributedRateLimit(regIpRateKey, 3, 60 * 60 * 1000);
        const regEmailRate = await checkDistributedRateLimit(`register:email:${normalizedEmail}`, 3, 60 * 60 * 1000);
        if (!regRate.success || !regEmailRate.success) {
            throw new Error("Too many registration attempts. Please try again later.");
        }

        const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip }).select("_id").lean();
        if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

        const emailBanValues = Array.from(new Set([email, normalizedEmail].filter(Boolean)));
        const isEmailBanned = await Blacklist.findOne({ type: "email", value: { $in: emailBanValues } }).select("_id").lean();
        if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

        const isUsernameBanned = await Blacklist.findOne({ type: "username", value: username }).select("_id").lean();
        if (isUsernameBanned) throw new Error("Access denied: This username is banned.");

        // Check OTP verification
        const otpRecord = await OtpVerification.findOne({ email }).lean();
        if (!otpRecord || !otpRecord.isVerified || !otpRecord.expiresAt || new Date() > otpRecord.expiresAt) {
            throw new Error("Email verification has expired or is invalid. Please request a new code.");
        }

        const safeUsername = escapeRegex(username);

        const existingUserByEmail = await User.findOne({
            $or: buildEmailLookupClause(email),
        }).select("_id").lean();
        if (existingUserByEmail) throw new Error("Email is already registered.");

        const existingUserByUsername = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') })
            .select("_id")
            .lean();
        if (existingUserByUsername) throw new Error("A user with this username already exists. Please choose a different username.");

        // Atomically consume the verified OTP before creating the account (prevents concurrent reuse)
        const consumedOtp = await OtpVerification.findOneAndDelete({
            _id: otpRecord._id,
            email,
            isVerified: true,
            expiresAt: { $gt: new Date() },
        }).lean();
        if (!consumedOtp) {
            throw new Error("Email verification has expired or has already been used. Please request a new code.");
        }

        const encryptedPassword = await hashPassword(password);
        const uuid = crypto.randomUUID();
        const now = new Date();

        await User.create({
            uuid,
            username,
            email,
            password: encryptedPassword,
            fullName,
            gender,
            dob,
            classLevel,
            examFocus: examFocus || undefined,
            city,
            futureCollege: futureCollege || undefined,
            snapchat: snapchat || undefined,
            instagram: instagram || undefined,
            firstLoginIp: ip,
            firstLoginAt: now,
            lastLoginIp: ip,
            lastLoginAt: now,
            lastKnownIp: ip
        });

        (await cookies()).set("user_session", createSignedSessionCookie(uuid), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7
        });
        return { success: true, user: {
            uuid, username, email, fullName, gender, dob, classLevel, examFocus, city, futureCollege, snapchat, instagram
        } };
    } catch (e: any) {
        if (e?.code === 11000) {
            return { success: false, error: "This email or username is already registered." };
        }
        return { success: false, error: e?.message || "Registration failed. Please try again." };
    }
}

export async function loginAction(formData: FormData) {
    try {
        if (!(formData instanceof FormData)) {
            throw new Error("Missing email or password");
        }
        const rawEmailVal = formData.get("email");
        const rawPassVal = formData.get("password");
        const rawInput = typeof rawEmailVal === "string" ? rawEmailVal.trim() : "";
        const password = typeof rawPassVal === "string" ? rawPassVal : "";

        // Keep database connection failures inside the action error boundary so
        // the client receives a controlled error instead of a Server Components digest.
        await dbConnect();
        if (!rawInput || !password) throw new Error("Missing email or password");
        if (rawInput.length > 254 || password.length > 128) {
            throw new Error("Invalid credentials");
        }

        const ip = await getClientIp();
        const canonicalInput = rawInput.includes("@") ? normalizeEmail(rawInput) : rawInput.toLowerCase();
        const accountRateKey = `login:account:${rawInput.toLowerCase()}`;
        const canonicalAccountRateKey = `login:account:${canonicalInput}`;
        const loginRateKey = `login:${ip}:${rawInput.toLowerCase()}`;
        const canonicalLoginRateKey = `login:${ip}:${canonicalInput}`;

        const accountRateStatus = await checkDistributedRateLimit(accountRateKey, 5, 15 * 60 * 1000);
        if (!accountRateStatus.success) {
            throw new Error("This account has experienced too many failed login attempts. Please try again after 15 minutes.");
        }

        if (canonicalAccountRateKey !== accountRateKey) {
            const canonicalAccountStatus = await checkDistributedRateLimit(canonicalAccountRateKey, 5, 15 * 60 * 1000);
            if (!canonicalAccountStatus.success) {
                throw new Error("This account has experienced too many failed login attempts. Please try again after 15 minutes.");
            }
        }

        const loginRateStatus = await checkDistributedRateLimit(loginRateKey, 5, 15 * 60 * 1000);
        if (!loginRateStatus.success) {
            throw new Error("Too many failed login attempts. Please try again after 15 minutes.");
        }

        if (canonicalLoginRateKey !== loginRateKey) {
            const canonicalLoginStatus = await checkDistributedRateLimit(canonicalLoginRateKey, 5, 15 * 60 * 1000);
            if (!canonicalLoginStatus.success) {
                throw new Error("Too many failed login attempts. Please try again after 15 minutes.");
            }
        }

        const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip }).select("_id").lean();
        if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

        // Block subaddressing / alias logins (e.g. abc+1@gmail.com)
        if (rawInput.includes("@") && rawInput.includes("+")) {
            throw new Error("Email aliases and subaddressing (+tag) are not permitted. Please log in with your primary email address.");
        }

        const safeInput = escapeRegex(rawInput);

        // Find user by either email (including Gmail dot variants) or username (case-insensitive)
        const user = await User.findOne({
            $or: [
                ...(rawInput.includes("@") ? buildEmailLookupClause(rawInput) : [{ email: new RegExp(`^${safeInput}$`, 'i') }]),
                { username: new RegExp(`^${safeInput}$`, 'i') }
            ]
        }).select("+password");

        if (!user) {
            throw new Error("Invalid credentials");
        }

        // Prevent username <-> email switching from doubling brute-force attempts on one account
        const uidRateKey = `login:uid:${user.uuid}`;
        const uidRateStatus = await checkDistributedRateLimit(uidRateKey, 10, 15 * 60 * 1000);
        if (!uidRateStatus.success) {
            throw new Error("This account has experienced too many failed login attempts. Please try again after 15 minutes.");
        }

        const emailBanValues = Array.from(new Set([user.email.toLowerCase(), normalizeEmail(user.email)].filter(Boolean)));
        const isEmailBanned = await Blacklist.findOne({ type: "email", value: { $in: emailBanValues } }).select("_id").lean();
        if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

        const isUsernameBanned = await Blacklist.findOne({ type: "username", value: user.username.toLowerCase() }).select("_id").lean();
        if (isUsernameBanned) throw new Error("Access denied: This username is banned.");

        const isValid = await comparePassword(password, user.password);
        if (!isValid) {
            throw new Error("Invalid credentials");
        }

        // A valid password is authoritative. Rate-counter cleanup and login
        // telemetry are best-effort and must not turn a valid login into a failure.
        const resetTasks = [
            resetDistributedRateLimit(accountRateKey),
            resetDistributedRateLimit(loginRateKey),
            resetDistributedRateLimit(uidRateKey),
        ];
        if (canonicalAccountRateKey !== accountRateKey) {
            resetTasks.push(resetDistributedRateLimit(canonicalAccountRateKey));
        }
        if (canonicalLoginRateKey !== loginRateKey) {
            resetTasks.push(resetDistributedRateLimit(canonicalLoginRateKey));
        }
        const resetResults = await Promise.allSettled(resetTasks);
        for (const result of resetResults) {
            if (result.status === "rejected") {
                console.error("Login rate-limit reset failed:", result.reason);
            }
        }

        const now = new Date();
        user.lastLoginIp = ip;
        user.lastLoginAt = now;
        user.lastKnownIp = ip;
        if (!user.firstLoginIp) {
            user.firstLoginIp = ip;
            user.firstLoginAt = user.createdAt || now;
        }
        try {
            await user.save();
        } catch (metadataError) {
            console.error("Login metadata update failed:", metadataError);
        }

        (await cookies()).set("user_session", createSignedSessionCookie(user.uuid), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7
        });
        return { success: true, user: serializeSafeUser(user) };
    } catch (e: any) {
        return { success: false, error: e?.message || "Login failed. Please try again." };
    }
}

export async function logoutAction() {
    try {
        const rawSession = (await cookies()).get("user_session")?.value;
        const sessionUuid = verifySessionCookie(rawSession);
        if (sessionUuid) {
            await dbConnect();
            await User.updateOne({ uuid: sessionUuid }, { $inc: { sessionVersion: 1 } }).catch(() => {});
        }
    } catch {}
    (await cookies()).delete("user_session");
    return { success: true };
}

export async function meAction() {
    try {
        const rawSession = (await cookies()).get("user_session")?.value;
        const sessionUuid = verifySessionCookie(rawSession);
        if (!sessionUuid) return { user: null };

        await dbConnect();
        let user = await User.findOne({ uuid: sessionUuid }).select(SAFE_USER_PROJECTION).lean();

        // Resilience: if the connection was still initializing, retry lookup once
        if (!user && mongoose.connection.readyState !== 1) {
            await dbConnect();
            user = await User.findOne({ uuid: sessionUuid }).select(SAFE_USER_PROJECTION).lean();
        }

        if (!user) return { user: null };

        const ip = await getClientIp();
        if (!isPlatformOwner(user) && await isAccountBlacklisted(user.email, user.username, ip)) {
            (await cookies()).delete("user_session");
            return { user: null };
        }

        return { user: serializeSafeUser(user) };
    } catch (error) {
        console.error("meAction session restoration error:", error);
        return { user: null, error: "Session restoration temporarily unavailable" };
    }
}

export async function updateProfileAction(formData: FormData) {
    if (!(formData instanceof FormData)) {
        throw new Error("Invalid profile update payload.");
    }
    await dbConnect();
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) throw new Error("Not authenticated");

    const rateCheck = await checkDistributedRateLimit(`profile-update:${sessionUuid}`, 20, 15 * 60 * 1000);
    if (!rateCheck.success) {
        throw new Error("Too many profile updates. Please wait a few minutes before trying again.");
    }

    const currentUser = await User.findOne({ uuid: sessionUuid }).select(SAFE_USER_PROJECTION).lean();
    if (!currentUser) throw new Error("User not found");

    const ip = await getClientIp();
    if (!isPlatformOwner(currentUser) && await isAccountBlacklisted(currentUser.email, currentUser.username, ip)) {
        throw new Error("Access denied: Your account has been suspended.");
    }

    const readOptionalString = (key: string): string | null => {
        const val = formData.get(key);
        return typeof val === "string" ? val : null;
    };

    const username = readOptionalString("username");
    const bio = readOptionalString("bio");
    const classLevel = readOptionalString("classLevel");
    const examFocus = readOptionalString("examFocus");
    const city = readOptionalString("city");
    const futureCollege = readOptionalString("futureCollege");
    const snapchat = readOptionalString("snapchat");
    const instagram = readOptionalString("instagram");

    const updateData: Record<string, string> = {};
    let usernameChanged = false;

    if (username !== null && username.trim() !== "") {
        const targetUsername = username.toLowerCase().trim();

        if (isPlatformOwner(currentUser) && targetUsername !== PLATFORM_OWNER_USERNAME) {
            throw new Error("The root platform owner username cannot be changed.");
        }

        // Keeping the current handle is valid; validateUsername checks global
        // availability and would otherwise reject the user against their own row.
        if (targetUsername !== currentUser.username.toLowerCase()) {
            const usernameError = await validateUsername(targetUsername);
            if (usernameError) throw new Error(usernameError);
        }

        if (targetUsername === "mythicalhrg" && currentUser.username.toLowerCase() !== "mythicalhrg") {
            throw new Error("This username is reserved for system administration.");
        }

        const existing = await User.findOne({
            username: new RegExp(`^${escapeRegex(targetUsername)}$`, "i"),
            uuid: { $ne: sessionUuid },
        }).select("_id").lean();
        if (existing) {
            throw new Error("A user with this username already exists.");
        }

        updateData.username = targetUsername;
        usernameChanged = targetUsername !== currentUser.username;
    }

    if (bio !== null) {
        const trimmed = bio.trim();
        if (trimmed.length > 500) throw new Error("Bio cannot exceed 500 characters.");
        updateData.bio = trimmed;
    }
    if (classLevel !== null) {
        const trimmed = classLevel.trim();
        if (!trimmed || trimmed.length > 60) throw new Error("Class level must be between 1 and 60 characters.");
        updateData.classLevel = trimmed;
    }
    if (examFocus !== null) {
        const trimmed = examFocus.trim();
        if (trimmed.length > 100) throw new Error("Exam focus cannot exceed 100 characters.");
        updateData.examFocus = trimmed;
    }
    if (city !== null) {
        const trimmed = city.trim();
        if (!trimmed || trimmed.length > 100) throw new Error("City must be between 1 and 100 characters.");
        updateData.city = trimmed;
    }
    if (futureCollege !== null) {
        const trimmed = futureCollege.trim();
        if (trimmed.length > 160) throw new Error("Future college cannot exceed 160 characters.");
        updateData.futureCollege = trimmed;
    }
    if (snapchat !== null) {
        const trimmed = snapchat.trim();
        if (trimmed.length > 80) throw new Error("Snapchat handle cannot exceed 80 characters.");
        updateData.snapchat = trimmed;
    }
    if (instagram !== null) {
        const trimmed = instagram.trim();
        if (trimmed.length > 80) throw new Error("Instagram handle cannot exceed 80 characters.");
        updateData.instagram = trimmed;
    }

    try {
        const updatedUser = await User.findOneAndUpdate(
            { uuid: sessionUuid },
            { $set: updateData },
            { new: true, runValidators: true }
        ).select(SAFE_USER_PROJECTION).lean();
        if (!updatedUser) throw new Error("User update failed");

        if (usernameChanged) {
            const [GroupMessage, DirectMessage, Donor, DonationTransaction] = await Promise.all([
                import("@/models/GroupMessage").then((m) => m.default),
                import("@/models/DirectMessage").then((m) => m.default),
                import("@/models/Donor").then((m) => m.default),
                import("@/models/DonationTransaction").then((m) => m.default),
            ]);
            await Promise.allSettled([
                GroupMessage.updateMany({ senderId: sessionUuid }, { $set: { senderUsername: updatedUser.username } }),
                DirectMessage.updateMany({ senderId: sessionUuid }, { $set: { senderUsername: updatedUser.username } }),
                Donor.updateMany(
                    { $or: [{ userId: sessionUuid }, { userUuid: sessionUuid }] },
                    { $set: { username: updatedUser.username } }
                ),
                DonationTransaction.updateMany(
                    { $or: [{ userId: sessionUuid }, { userUuid: sessionUuid }] },
                    { $set: { username: updatedUser.username } }
                ),
            ]);
        }

        return { success: true, user: serializeSafeUser(updatedUser) };
    } catch (e: any) {
        if (e?.code === 11000) {
            throw new Error("A user with this username already exists.");
        }
        throw new Error("Failed to update profile. Please try again.");
    }
}

export async function requestEmailChangeOtpAction(newEmail: string, currentPassword: string) {
    await dbConnect();
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) throw new Error("Not authenticated");

    const currentUser = await User.findOne({ uuid: sessionUuid }).select("+password");
    if (!currentUser) throw new Error("User not found");

    if (isPlatformOwner(currentUser)) {
        throw new Error("The root platform owner email cannot be changed via self-service.");
    }

    const ip = await getClientIp();
    if (await isAccountBlacklisted(currentUser.email, currentUser.username, ip)) {
        throw new Error("Access denied: Your account has been suspended.");
    }

    const passwordRateLimit = await checkDistributedRateLimit(`email-change:password:${sessionUuid}`, 5, 15 * 60 * 1000);
    if (!passwordRateLimit.success) throw new Error("Too many password verification attempts. Please try again later.");
    if (typeof currentPassword !== "string" || !currentPassword) {
        throw new Error("Your current password is required to authorize an email change.");
    }
    if (currentPassword.length > 128) {
        throw new Error("Incorrect current password.");
    }
    const isPasswordValid = await comparePassword(currentPassword, currentUser.password);
    if (!isPasswordValid) {
        throw new Error("Incorrect current password.");
    }

    const sendRateLimit = await checkDistributedRateLimit(`email-change:send:${sessionUuid}`, 5, 15 * 60 * 1000);
    if (!sendRateLimit.success) {
        throw new Error("Too many email change verification requests. Please try again later.");
    }

    if (typeof newEmail !== "string" || !newEmail.trim() || newEmail.trim().length > 254) {
        throw new Error("Please enter a valid email address.");
    }
    const email = newEmail.toLowerCase().trim();
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        throw new Error(emailValidation.error);
    }

    const normalizedNewEmail = normalizeEmail(email);
    if (email === currentUser.email.toLowerCase() || normalizedNewEmail === normalizeEmail(currentUser.email)) {
        throw new Error("This is already your current email address.");
    }
    if (email === PLATFORM_OWNER_EMAIL || normalizedNewEmail === normalizeEmail(PLATFORM_OWNER_EMAIL)) {
        throw new Error("This email is reserved for system administration.");
    }

    const emailCandidates = Array.from(new Set([email, normalizedNewEmail].filter(Boolean)));
    const isEmailBanned = await Blacklist.findOne({ type: "email", value: { $in: emailCandidates } }).select("_id").lean();
    if (isEmailBanned) throw new Error("This email address is banned.");

    const existingUser = await User.findOne({ $or: buildEmailLookupClause(email) }).select("_id").lean();
    if (existingUser) throw new Error("This email is already registered to another account.");

    // Check resend cooldown (60 seconds) across raw + canonical variants
    const existingOtp = await OtpVerification.findOne({ email: { $in: emailCandidates } }).sort({ lastSentAt: -1 }).lean();
    if (existingOtp && existingOtp.lastSentAt) {
        const elapsed = Date.now() - new Date(existingOtp.lastSentAt).getTime();
        if (elapsed < 60000) {
            const waitSecs = Math.ceil((60000 - elapsed) / 1000);
            throw new Error(`Please wait ${waitSecs} seconds before requesting another code.`);
        }
    }

    // Generate 6 digit OTP
    const generatedOtp = crypto.randomInt(100000, 1000000).toString();
    const now = new Date();
    const expiry = new Date(now.getTime() + 5 * 60 * 1000); // 5 min expiry

    const otpUpdate = {
        otp: generatedOtp,
        expiresAt: expiry,
        isVerified: false,
        attempts: 0,
        lastSentAt: now,
    };
    let savedOtpDoc;
    try {
        savedOtpDoc = await OtpVerification.findOneAndUpdate(
            { email },
            { $set: otpUpdate },
            { upsert: true, new: true }
        ).lean();
    } catch (upsertErr: any) {
        if (upsertErr?.code !== 11000) throw upsertErr;
        savedOtpDoc = await OtpVerification.findOneAndUpdate(
            { email },
            { $set: otpUpdate },
            { new: true }
        ).lean();
    }

    const { sendEmail } = await import("@/services/email");
    try {
        await sendEmail({
            to: email,
            subject: "ConceptNichod - Verify Your New Email Address",
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 8px;">
                    <h2 style="color: #6366f1;">ConceptNichod Email Verification</h2>
                    <p>Hello <strong>${escapeHtml(currentUser.fullName || currentUser.username)}</strong>,</p>
                    <p>You requested to change your account email to <strong>${escapeHtml(email)}</strong>. Use the verification code below to confirm this change:</p>
                    <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; font-size: 26px; font-weight: bold; letter-spacing: 5px; text-align: center; margin: 20px 0; color: #18181b;">
                        ${generatedOtp}
                    </div>
                    <p style="color: #71717a; font-size: 13px;">This verification code will expire in 5 minutes. If you did not request this change, please ignore this email.</p>
                </div>
            `
        });
    } catch (mailError) {
        if (savedOtpDoc?._id) {
            await OtpVerification.deleteOne({ _id: savedOtpDoc._id, otp: generatedOtp }).catch(() => {});
        }
        throw mailError;
    }

    return { success: true, message: "Verification code sent to your new email." };
}

export async function confirmEmailChangeAction(newEmail: string, otp: string) {
    await dbConnect();
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) throw new Error("Not authenticated");

    const currentUser = await User.findOne({ uuid: sessionUuid }).select("uuid username email role").lean();
    if (!currentUser) throw new Error("User not found");
    if (isPlatformOwner(currentUser)) {
        throw new Error("The root platform owner email cannot be changed via self-service.");
    }

    const email = (typeof newEmail === "string" ? newEmail : "").toLowerCase().trim();
    const sanitizedOtp = (typeof otp === "string" ? otp : "").trim();
    if (!email || !sanitizedOtp || email.length > 254 || sanitizedOtp.length > 32) {
        throw new Error("Missing email or verification code.");
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        throw new Error(emailValidation.error);
    }

    const normalizedNewEmail = normalizeEmail(email);
    if (email === PLATFORM_OWNER_EMAIL || normalizedNewEmail === normalizeEmail(PLATFORM_OWNER_EMAIL)) {
        throw new Error("This email is reserved for system administration.");
    }

    const ip = await getClientIp();
    if (await isAccountBlacklisted(currentUser.email, currentUser.username, ip)) {
        throw new Error("Access denied: Your account has been suspended.");
    }
    const emailBanValues = Array.from(new Set([email, normalizedNewEmail].filter(Boolean)));
    const isNewEmailBanned = await Blacklist.findOne({ type: "email", value: { $in: emailBanValues } }).select("_id").lean();
    if (isNewEmailBanned) throw new Error("This email address is banned.");

    const rateCheck = await checkDistributedRateLimit(`email-change:verify:${sessionUuid}:${email}`, 5, 15 * 60 * 1000);
    if (!rateCheck.success) throw new Error("Too many verification attempts. Please request a new code later.");

    const now = new Date();
    // Atomically reserve one of the five attempts before comparing the code.
    // Concurrent requests cannot overwrite the counter and extend the guess budget.
    const otpRecord = await OtpVerification.findOneAndUpdate(
        { email, expiresAt: { $gt: now }, attempts: { $lt: 5 } },
        { $inc: { attempts: 1 } },
        { new: true }
    );

    if (!otpRecord) {
        const currentRecord = await OtpVerification.findOne({ email }).lean();
        if (!currentRecord) throw new Error("No verification code was requested for this email.");
        if (currentRecord.expiresAt <= now) {
            await OtpVerification.deleteOne({ _id: currentRecord._id, expiresAt: { $lte: now } });
            throw new Error("Verification code has expired. Please request a new code.");
        }
        if ((currentRecord.attempts || 0) >= 5) {
            await OtpVerification.deleteOne({ _id: currentRecord._id, attempts: { $gte: 5 } });
            throw new Error("Too many incorrect attempts. This code has been invalidated for security.");
        }
        throw new Error("Verification code is no longer valid. Please request a new one.");
    }

    if (!timingSafeOtpEquals(otpRecord.otp, sanitizedOtp)) {
        if (otpRecord.attempts >= 5) {
            await OtpVerification.deleteOne({ _id: otpRecord._id, attempts: { $gte: 5 } });
        }
        const remaining = Math.max(0, 5 - otpRecord.attempts);
        throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    }

    const existing = await User.findOne({
        $or: buildEmailLookupClause(email),
        uuid: { $ne: sessionUuid },
    }).select("_id").lean();
    if (existing) {
        throw new Error("This email is already in use by another account.");
    }

    let updatedUser;
    try {
        updatedUser = await User.findOneAndUpdate(
            { uuid: sessionUuid },
            { $set: { email } },
            { new: true, runValidators: true }
        ).select(SAFE_USER_PROJECTION).lean();
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new Error("This email is already in use by another account.");
        }
        throw new Error("Email update failed");
    }
    if (!updatedUser) throw new Error("Email update failed");

    await OtpVerification.deleteOne({ _id: otpRecord._id });

    return { success: true, user: serializeSafeUser(updatedUser) };
}

export async function resetPasswordAction(formData: FormData) {
    if (!(formData instanceof FormData)) {
        throw new Error("Missing required fields");
    }
    await dbConnect();
    const rawEmailVal = formData.get("email");
    const rawPassVal = formData.get("newPassword");
    const email = typeof rawEmailVal === "string" ? rawEmailVal.toLowerCase().trim() : "";
    const newPassword = typeof rawPassVal === "string" ? rawPassVal : "";

    if (!email || !newPassword) throw new Error("Missing required fields");
    if (email.length > 254) throw new Error("Invalid email address.");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new Error(passwordError);

    const ip = await getClientIp();
    const normalizedEmail = normalizeEmail(email);
    const ipRate = await checkDistributedRateLimit(`reset-password:ip:${ip}`, 10, 15 * 60 * 1000);
    const emailRate = await checkDistributedRateLimit(`reset-password:email:${normalizedEmail}`, 5, 15 * 60 * 1000);
    if (!ipRate.success || !emailRate.success) {
        throw new Error("Too many password reset attempts. Please try again later.");
    }

    const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip }).select("_id").lean();
    if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

    const emailBanValues = Array.from(new Set([email, normalizedEmail].filter(Boolean)));
    const isEmailBanned = await Blacklist.findOne({ type: "email", value: { $in: emailBanValues } }).select("_id").lean();
    if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

    const otpRecord = await OtpVerification.findOne({ email }).lean();
    if (!otpRecord || !otpRecord.isVerified || !otpRecord.expiresAt || new Date() > otpRecord.expiresAt) {
        throw new Error("Verification code has expired or is invalid. Please request a new code.");
    }

    const user = await User.findOne({ $or: buildEmailLookupClause(email) }).select("_id uuid username").lean();
    if (!user) throw new Error("User not found");

    const isUsernameBanned = await Blacklist.findOne({ type: "username", value: user.username.toLowerCase() }).select("_id").lean();
    if (isUsernameBanned) throw new Error("Access denied: This account is banned.");

    // Atomically consume verified OTP before changing the password
    const consumedOtp = await OtpVerification.findOneAndDelete({
        _id: otpRecord._id,
        email,
        isVerified: true,
        expiresAt: { $gt: new Date() },
    }).lean();
    if (!consumedOtp) {
        throw new Error("Verification code has expired or has already been used. Please request a new code.");
    }

    const encryptedPassword = await hashPassword(newPassword);
    await User.updateOne(
        { _id: user._id },
        { $set: { password: encryptedPassword }, $inc: { sessionVersion: 1 } }
    );

    return { success: true };
}

export async function changePasswordAction(formData: FormData) {
    if (!(formData instanceof FormData)) {
        throw new Error("Missing required fields");
    }
    await dbConnect();
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionId = verifySessionCookie(rawSession);
    if (!sessionId) throw new Error("Not authenticated");

    const rawCurrentVal = formData.get("currentPassword");
    const rawNewVal = formData.get("newPassword");
    const currentPassword = typeof rawCurrentVal === "string" ? rawCurrentVal : "";
    const newPassword = typeof rawNewVal === "string" ? rawNewVal : "";

    if (!currentPassword || !newPassword) throw new Error("Missing required fields");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new Error(passwordError);

    const user = await User.findOne({ uuid: sessionId }).select("+password");
    if (!user) throw new Error("User not found");

    const ip = await getClientIp();
    if (!isPlatformOwner(user) && await isAccountBlacklisted(user.email, user.username, ip)) {
        throw new Error("Access denied: Your account has been suspended.");
    }

    const passwordRateLimit = await checkDistributedRateLimit(`password-change:verify:${sessionId}`, 5, 15 * 60 * 1000);
    if (!passwordRateLimit.success) throw new Error("Too many password verification attempts. Please try again later.");
    if (currentPassword.length > 128) throw new Error("Incorrect current password");
    try {
        const isValid = await comparePassword(currentPassword, user.password);
        if (!isValid) throw new Error("Incorrect current password");
    } catch (e) {
        throw new Error("Incorrect current password");
    }

    const hashedNewPassword = await hashPassword(newPassword);
    await User.updateOne(
        { _id: user._id },
        { $set: { password: hashedNewPassword }, $inc: { sessionVersion: 1 } }
    );

    return { success: true };
}

export async function requestDeleteAccountOtpAction(currentPassword: string) {
    await dbConnect();
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) throw new Error("Authentication required.");

    const user = await User.findOne({ uuid: sessionUuid }).select("+password");
    if (!user) throw new Error("User account not found.");

    if (isPlatformOwner(user) || user.username.toLowerCase() === "mythicalhrg" || user.email.toLowerCase() === "mythicalhrg@gmail.com") {
        throw new Error("The root platform administrator account @mythicalhrg cannot be deleted.");
    }

    const passwordRateLimit = await checkDistributedRateLimit(`delete-account:password:${sessionUuid}`, 5, 15 * 60 * 1000);
    if (!passwordRateLimit.success) throw new Error("Too many password verification attempts. Please try again later.");
    if (typeof currentPassword !== "string" || !currentPassword) {
        throw new Error("Please enter your current password to authorize this deletion request.");
    }
    if (currentPassword.length > 128) {
        throw new Error("Incorrect current password.");
    }

    const isValid = await comparePassword(currentPassword, user.password);
    if (!isValid) {
        throw new Error("Incorrect current password.");
    }

    const email = user.email.toLowerCase().trim();

    // Check resend cooldown (60 seconds)
    const existingOtp = await OtpVerification.findOne({ email }).lean();
    if (existingOtp && existingOtp.lastSentAt) {
        const elapsed = Date.now() - new Date(existingOtp.lastSentAt).getTime();
        if (elapsed < 60000) {
            const waitSecs = Math.ceil((60000 - elapsed) / 1000);
            throw new Error(`Please wait ${waitSecs} seconds before requesting another deletion code.`);
        }
    }

    // Generate cryptographically secure 6-digit OTP
    const generatedOtp = crypto.randomInt(100000, 1000000).toString();
    const now = new Date();
    const expiry = new Date(now.getTime() + 5 * 60 * 1000); // 5 min expiry

    const otpUpdate = {
        otp: generatedOtp,
        expiresAt: expiry,
        isVerified: false,
        attempts: 0,
        lastSentAt: now,
    };
    let savedOtpDoc;
    try {
        savedOtpDoc = await OtpVerification.findOneAndUpdate(
            { email },
            { $set: otpUpdate },
            { upsert: true, new: true }
        ).lean();
    } catch (upsertErr: any) {
        if (upsertErr?.code !== 11000) throw upsertErr;
        savedOtpDoc = await OtpVerification.findOneAndUpdate(
            { email },
            { $set: otpUpdate },
            { new: true }
        ).lean();
    }

    const { sendEmail } = await import("@/services/email");
    try {
        await sendEmail({
            to: email,
            subject: "ConceptNichod - Account Deletion Verification Code",
            html: `
                <div style="font-family: sans-serif; padding: 24px; color: #18181b; max-width: 520px; margin: 0 auto; border: 2px solid #ef4444; border-radius: 12px; background: #ffffff;">
                    <h2 style="color: #dc2626; margin: 0 0 10px;">⚠️ Account Deletion Authorization</h2>
                    <p style="font-size: 14px; line-height: 1.5; color: #374151;">
                        Hello <strong>@${escapeHtml(user.username)}</strong>,
                    </p>
                    <p style="font-size: 14px; line-height: 1.5; color: #4b5563;">
                        A request was initiated to permanently delete your ConceptNichod account and erase all your study materials, topic progress, notes, and activity records.
                    </p>
                    <p style="font-size: 14px; margin-top: 16px; font-weight: 600; color: #111827;">
                        Your 6-digit deletion authorization code:
                    </p>
                    <div style="background: #fef2f2; border: 1px dashed #f87171; padding: 16px; border-radius: 8px; font-size: 30px; font-weight: bold; letter-spacing: 8px; text-align: center; margin: 18px 0; color: #b91c1c; font-family: monospace;">
                        ${generatedOtp}
                    </div>
                    <p style="color: #6b7280; font-size: 12px; line-height: 1.4;">
                        ⏳ This code will expire in 5 minutes. If you did NOT initiate this request, change your password immediately.
                    </p>
                </div>
            `,
        });
    } catch (mailError) {
        if (savedOtpDoc?._id) {
            await OtpVerification.deleteOne({ _id: savedOtpDoc._id, otp: generatedOtp }).catch(() => {});
        }
        throw mailError;
    }

    return {
        success: true,
        message: `Deletion authorization code sent to ${email}.`,
    };
}

export async function deleteAccountAction(formData: FormData) {
    if (!(formData instanceof FormData)) {
        throw new Error("Invalid account deletion request.");
    }
    await dbConnect();
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionId = verifySessionCookie(rawSession);
    if (!sessionId) throw new Error("Not authenticated");

    const readStr = (key: string) => {
        const val = formData.get(key);
        return typeof val === "string" ? val : "";
    };

    const email = readStr("email").toLowerCase().trim();
    const otp = readStr("otp").trim();
    const password = readStr("password");
    const confirmation = readStr("confirmation").trim();

    if (!otp || otp.length > 32) throw new Error("6-digit verification code is required.");

    const user = await User.findOne({ uuid: sessionId }).select("+password");
    if (!user) throw new Error("User account not found.");
    if (email && user.email.toLowerCase() !== email) {
        throw new Error("User email mismatch.");
    }
    if (isPlatformOwner(user) || user.username.toLowerCase() === "mythicalhrg" || user.email.toLowerCase() === "mythicalhrg@gmail.com") {
        throw new Error("The root admin account cannot be deleted.");
    }

    // If confirmation phrase is provided, enforce DELETE or username
    if (confirmation && confirmation.toUpperCase() !== "DELETE" && confirmation !== user.username) {
        throw new Error('Please type "DELETE" to confirm permanent account deletion.');
    }

    // Rate-limited mandatory password verification to prevent brute-force & unauthorized deletion
    const confirmPassRate = await checkDistributedRateLimit(`delete-account:confirm-password:${sessionId}`, 5, 15 * 60 * 1000);
    if (!confirmPassRate.success) {
        throw new Error("Too many password verification attempts. Please try again later.");
    }
    if (!password) {
        throw new Error("Your current password is required to authorize permanent account deletion.");
    }
    if (password.length > 128) {
        throw new Error("Incorrect current password.");
    }
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) throw new Error("Incorrect current password.");

    const userEmail = user.email.toLowerCase().trim();
    const rateCheck = await checkDistributedRateLimit(`delete-account:verify:${sessionId}`, 5, 15 * 60 * 1000);
    if (!rateCheck.success) throw new Error("Too many verification attempts. Please request a new code later.");

    const otpRecord = await OtpVerification.findOne({ email: userEmail }).lean();
    if (!otpRecord) throw new Error("No deletion code requested for this email.");

    const now = new Date();
    if (now > otpRecord.expiresAt) {
        await OtpVerification.deleteOne({ _id: otpRecord._id, expiresAt: { $lte: now } });
        throw new Error("Verification code has expired. Please request a new code.");
    }

    // Always verify the exact OTP (even if isVerified was set earlier) with atomic attempt reservation
    const attemptRecord = await OtpVerification.findOneAndUpdate(
        { email: userEmail, expiresAt: { $gt: now }, attempts: { $lt: 5 } },
        { $inc: { attempts: 1 } },
        { new: true }
    );

    if (!attemptRecord) {
        const currentRecord = await OtpVerification.findOne({ email: userEmail }).lean();
        if (!currentRecord) throw new Error("No deletion code requested for this email.");
        if (currentRecord.expiresAt <= now) {
            await OtpVerification.deleteOne({ _id: currentRecord._id, expiresAt: { $lte: now } });
            throw new Error("Verification code has expired. Please request a new code.");
        }
        if ((currentRecord.attempts || 0) >= 5) {
            await OtpVerification.deleteOne({ _id: currentRecord._id, attempts: { $gte: 5 } });
            throw new Error("Too many incorrect attempts. This deletion code has been invalidated.");
        }
        throw new Error("Verification code is no longer valid. Please request a new one.");
    }

    if (!timingSafeOtpEquals(attemptRecord.otp, otp)) {
        if (attemptRecord.attempts >= 5) {
            await OtpVerification.deleteOne({ _id: attemptRecord._id, attempts: { $gte: 5 } });
        }
        const remaining = Math.max(0, 5 - attemptRecord.attempts);
        throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    }

    // Cascading DB cleanup across all user-owned collections
    const Topic = (await import("@/models/Topic")).default;
    const ConceptMirror = (await import("@/models/ConceptMirror")).default;
    const MistakeEntry = (await import("@/models/MistakeEntry")).default;
    const StudyStreak = (await import("@/models/StudyStreak")).default;
    const NotificationRead = (await import("@/models/NotificationRead")).default;
    const StudyGroup = (await import("@/models/StudyGroup")).default;
    const GroupMessage = (await import("@/models/GroupMessage")).default;
    const DirectMessage = (await import("@/models/DirectMessage")).default;

    const ownedGroups = await StudyGroup.find({ ownerId: sessionId }).select("_id").lean();
    const ownedGroupIds = ownedGroups.map((g) => String(g._id));

    // Remove dependent records first. If cleanup fails, keep the account so
    // the user can retry instead of reporting a false successful deletion.
    await Promise.all([
        Topic.deleteMany({ userId: sessionId }),
        ConceptMirror.deleteMany({ userId: sessionId }),
        MistakeEntry.deleteMany({ userId: sessionId }),
        StudyStreak.deleteMany({ userId: sessionId }),
        NotificationRead.deleteMany({ userId: sessionId }),
        StudyGroup.deleteMany({ ownerId: sessionId }),
        StudyGroup.updateMany({ memberIds: sessionId }, { $pull: { memberIds: sessionId } }),
        GroupMessage.deleteMany(
            ownedGroupIds.length > 0
                ? { $or: [{ senderId: sessionId }, { groupId: { $in: ownedGroupIds } }] }
                : { senderId: sessionId }
        ),
        DirectMessage.deleteMany({ participantIds: sessionId }),
        OtpVerification.deleteOne({ email: userEmail }),
    ]);
    await User.deleteOne({ uuid: sessionId });

    (await cookies()).delete("user_session");

    return { success: true };
}
```

### FILE 7: `src/app/actions/donation.ts`
```ts
// src/app/actions/donation.ts
"use server";

import mongoose from "mongoose";
import { isPlatformOwner } from "@/lib/owner-access";
import { revalidatePath } from "next/cache";
import connectToDatabase from "@/lib/mongoose";
import DonationTransaction from "@/models/DonationTransaction";
import Donor from "@/models/Donor";
import DonationSetting from "@/models/DonationSetting";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import { cookies } from "next/headers";
import { verifySessionCookie } from "@/lib/session";
import crypto from "crypto";
import { syncDonationDonor } from "@/lib/donation-donor-sync.js";
import { getClientIp } from "@/lib/ip";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import { normalizeEmail } from "@/lib/email-utils";
import {
  validateDonationSubmission,
  validateAdminVerifiedAmount,
  computePatronTier,
  sanitizeDonationText,
  normalizeVpa,
  PatronTier,
} from "@/lib/donation-validation";

const VALID_TIERS: PatronTier[] = ["LEGEND", "DIAMOND", "GOLD", "SILVER", "SUPPORTER"];

function createDonorStore() {
  return {
    findOneByTransactionRef: async (transactionRef: string) =>
      await Donor.findOne({ transactionRef }),
    upsertByUuid: async (donorUuid: string, data: Record<string, unknown>) =>
      await Donor.findOneAndUpdate(
        { uuid: donorUuid },
        { $set: data, $setOnInsert: { uuid: donorUuid } },
        { upsert: true, new: true, runValidators: true }
      ),
    updateByUuid: async (donorUuid: string, data: Record<string, unknown>) =>
      await Donor.findOneAndUpdate(
        { uuid: donorUuid },
        { $set: data },
        { new: true, runValidators: true }
      ),
    updateById: async (donorId: string, data: Record<string, unknown>) => {
      if (!mongoose.isValidObjectId(donorId)) return null;
      return await Donor.findByIdAndUpdate(
        donorId,
        { $set: data },
        { new: true, runValidators: true }
      );
    },
  };
}

function getSafeAdminError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Unauthorized") || message.startsWith("Forbidden")) {
    return message;
  }
  return fallback;
}

async function requireOwnerSession() {
  await connectToDatabase();
  const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
  if (!sessionUuid) throw new Error("Unauthorized: Please log in as Admin.");
  const adminUser = await User.findOne({ uuid: sessionUuid }).select("uuid username role email").lean();
  if (!isPlatformOwner(adminUser)) throw new Error("Forbidden: Owner privileges required.");
  return adminUser;
}

/**
 * 1. Public Data Loader for /donate (UPI Config + Verified Hall of Patrons)
 */
export async function getPublicDonationPageData() {
  try {
    await connectToDatabase();
    const DONATIONS_ENABLED = process.env.DONATIONS_ENABLED === "true";

    const settings = await DonationSetting.findOne().lean();
    const configuredVpa = normalizeVpa(settings?.upiId || "");
    const donationsAvailable = DONATIONS_ENABLED && Boolean(settings?.isEnabled) && Boolean(configuredVpa);

    const [patronsRaw, totalRaisedAgg] = await Promise.all([
      Donor.find({ isVisible: true, isPublic: true, amount: { $gt: 0 } })
        .select("name username amount tier message isAnonymous donatedAt createdAt")
        .sort({ amount: -1, donatedAt: -1 })
        .limit(150)
        .lean(),
      Donor.aggregate([
        { $match: { isVisible: true, isPublic: true, amount: { $gt: 0 } } },
        { $group: { _id: null, totalRaised: { $sum: "$amount" }, totalPatrons: { $sum: 1 } } },
      ]),
    ]);

    const patrons = patronsRaw.map((p: any) => ({
      id: String(p._id),
      name: p.isAnonymous ? "Anonymous Patron" : p.name,
      username: p.isAnonymous ? null : p.username || null,
      amount: Number(p.amount) || 0,
      tier: (p.tier as PatronTier) || computePatronTier(Number(p.amount) || 0),
      message: p.message || "",
      donatedAt: p.donatedAt
        ? new Date(p.donatedAt).toISOString()
        : new Date(p.createdAt).toISOString(),
    }));

    const totalRaised = Number(totalRaisedAgg[0]?.totalRaised || 0);
    const totalPatrons = Number(totalRaisedAgg[0]?.totalPatrons ?? patrons.length);

    return {
      success: true,
      settings: {
        upiId: donationsAvailable ? configuredVpa || "" : "",
        payeeName: settings?.payeeName || process.env.NEXT_PUBLIC_UPI_NAME || "ConceptNichod",
        qrCodeUrl: "",
        isEnabled: donationsAvailable,
        headline:
          settings?.headline || "Support ConceptNichod & Join the Hall of Patrons",
        subtext:
          settings?.subtext ||
          "Pay using any UPI app to the verified UPI ID above, then submit your 12-digit UTR and Transaction ID below for manual Admin verification.",
      },
      patrons,
      totalRaised,
      totalPatrons,
    };
  } catch (error) {
    console.error("[getPublicDonationPageData] Error:", error);
    return {
      success: false,
      settings: {
        upiId: "",
        payeeName: process.env.NEXT_PUBLIC_UPI_NAME || "ConceptNichod",
        qrCodeUrl: "",
        isEnabled: false,
        headline: "Support ConceptNichod & Join the Hall of Patrons",
        subtext:
          "Pay using any UPI app to the verified UPI ID above, then submit your 12-digit UTR and Transaction ID below.",
      },
      patrons: [],
      totalRaised: 0,
      totalPatrons: 0,
    };
  }
}

/**
 * 2. Public Action: Submit UTR & Transaction ID from /donate to Admin Panel Queue
 *    Amount is NOT set here — Admin manually checks UTR & enters the amount in the Admin Panel.
 */
export async function submitDonationTransaction(formData: {
  donorName: string;
  utr: string;
  transactionId: string;
  message?: string;
  isAnonymous?: boolean;
  honeypot?: string;
}) {
  try {
    if (!formData || typeof formData !== "object") {
      return { success: false, error: "Invalid submission details." };
    }

    if (typeof formData.honeypot === "string" && formData.honeypot.trim() !== "") {
      return { success: true, message: "Your UTR & Transaction ID have been sent to the Admin Panel for verification." };
    }

    const DONATIONS_ENABLED = process.env.DONATIONS_ENABLED === "true";
    if (!DONATIONS_ENABLED) {
      return { success: false, error: "Donations are temporarily unavailable while the recipient account is being confirmed." };
    }

    const validation = validateDonationSubmission(formData);
    if (!validation.valid || !validation.data) {
      return { success: false, error: validation.error || "Invalid submission details." };
    }

    const { donorName, utr, transactionId, message, isAnonymous } = validation.data;
    const clientIp = await getClientIp();

    await connectToDatabase();

    // Enforce IP blacklist before allowing queue writes
    const isIpBanned = await Blacklist.findOne({ type: "ip", value: clientIp }).select("_id").lean();
    if (isIpBanned) {
      return { success: false, error: "Access denied: Your IP address is banned." };
    }

    const settings = await DonationSetting.findOne().select("upiId isEnabled").lean();
    const configuredVpa = normalizeVpa((settings as any)?.upiId || "");
    if (!settings?.isEnabled || !configuredVpa) {
      return { success: false, error: "Donations are temporarily unavailable because the recipient account is not configured and enabled." };
    }

    const ipUnavailable = clientIp === "127.0.0.1" || clientIp === "unknown";
    const rateLimitKey = ipUnavailable ? "donate_submit:" + clientIp + ":" + utr : "donate_submit:" + clientIp;
    const rateLimit = await checkDistributedRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
    if (!rateLimit.success) {
      return { success: false, error: "Too many submissions from your network. Please wait 15 minutes before trying again." };
    }

    const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
    let userId: string | null = null;
    let username: string | null = null;
    if (sessionUuid) {
      const userRateLimit = await checkDistributedRateLimit(`donate_submit:user:${sessionUuid}`, 5, 15 * 60 * 1000);
      if (!userRateLimit.success) {
        return { success: false, error: "Too many submissions from your account. Please wait 15 minutes before trying again." };
      }
      const dbUser = await User.findOne({ uuid: sessionUuid }).select("uuid username email").lean();
      if (dbUser) {
        const emailVals = Array.from(
          new Set([String(dbUser.email || "").toLowerCase(), normalizeEmail(String(dbUser.email || ""))].filter(Boolean))
        );
        const userBanned = await Blacklist.findOne({
          $or: [
            ...(emailVals.length > 0 ? [{ type: "email", value: { $in: emailVals } }] : []),
            ...(dbUser.username ? [{ type: "username", value: String(dbUser.username).toLowerCase() }] : []),
          ],
        }).select("_id").lean();
        if (userBanned) {
          return { success: false, error: "Access denied: Your account has been suspended." };
        }
        userId = sessionUuid;
        username = (dbUser as any).username || null;
      }
    }

    const existing = await DonationTransaction.findOne({
      $or: [{ utr }, { transactionId }],
    }).select("utr transactionId status").lean();

    if (existing) {
      const dupField = existing.utr === utr ? "12-digit UTR" : "Transaction ID";
      const existingStatus = String(existing.status || "pending").toUpperCase();
      return { success: false, error: "This " + dupField + " has already been submitted (Status: " + existingStatus + ")." };
    }

    const createdTx = await DonationTransaction.create({
      uuid: crypto.randomUUID(),
      userId,
      userUuid: userId,
      username,
      donorName,
      isAnonymous: Boolean(isAnonymous),
      utr,
      transactionId,
      message: message || "",
      status: "pending",
      verifiedAmount: null,
      patronTier: null,
      isPublishedToPatrons: false,
      submitterIp: clientIp,
      amount: null,
      claimedAmount: null,
      donatedAt: new Date(),
      isPublic: false,
    });

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      transactionId: String(createdTx._id),
      message: "Submitted! Your UTR and Transaction ID have been sent to the Admin Panel for verification.",
    };
  } catch (error: any) {
    if (error?.code === 11000) {
      return { success: false, error: "This UTR or Transaction ID has already been submitted." };
    }
    console.error("[submitDonationTransaction] Error:", error);
    return { success: false, error: "Failed to submit transaction details. Please try again." };
  }
}

/**
 * 3. Admin Action: Fetch All UTR Submissions, Summary Metrics & Hall of Patrons List
 */
export async function getAdminDonationDashboard(filterStatus?: string, search?: string) {
  try {
    await requireOwnerSession();

    const queryParts: Record<string, any>[] = [];
    if (filterStatus === "pending") {
      // Legacy records created before status tracking must remain reviewable.
      queryParts.push({ $or: [{ status: "pending" }, { status: { $exists: false } }, { status: null }] });
    } else if (filterStatus && ["verified", "rejected"].includes(filterStatus)) {
      queryParts.push({ status: filterStatus });
    }

    if (typeof search === "string" && search.trim() !== "") {
      const escaped = search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      queryParts.push({ $or: [
        { utr: regex },
        { transactionId: regex },
        { donorName: regex },
        { username: regex },
      ] });
    }
    const query = queryParts.length === 0 ? {} : queryParts.length === 1 ? queryParts[0] : { $and: queryParts };

    const [transactionsRaw, statsAgg, settingsRaw, patronsRaw, legacyPendingCount] = await Promise.all([
      DonationTransaction.find(query).sort({ createdAt: -1 }).limit(250).lean(),
      DonationTransaction.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            verifiedSum: {
              $sum: {
                $cond: [{ $eq: ["$status", "verified"] }, { $ifNull: ["$verifiedAmount", 0] }, 0],
              },
            },
          },
        },
      ]),
      DonationSetting.findOne().lean(),
      Donor.find().sort({ amount: -1, donatedAt: -1 }).limit(200).lean(),
      DonationTransaction.countDocuments({ $or: [{ status: { $exists: false } }, { status: null }] }),
    ]);

    const summary = {
      pendingCount: 0,
      verifiedCount: 0,
      rejectedCount: 0,
      totalVerifiedAmount: 0,
    };

    summary.pendingCount = legacyPendingCount;
    for (const row of statsAgg) {
      if (row._id === "pending") summary.pendingCount += row.count;
      if (row._id === "verified") {
        summary.verifiedCount = row.count;
        summary.totalVerifiedAmount = row.verifiedSum || 0;
      }
      if (row._id === "rejected") summary.rejectedCount = row.count;
    }

    const transactions = transactionsRaw.map((t: any) => ({
      id: String(t._id),
      userId: t.userId ? String(t.userId) : null,
      username: t.username || null,
      donorName: t.donorName,
      donorEmail: t.donorEmail || null,
      isAnonymous: Boolean(t.isAnonymous),
      utr: t.utr,
      transactionId: t.transactionId || "",
      message: t.message || "",
      status: t.status || "pending",
      verifiedAmount: t.verifiedAmount ?? null,
      patronTier: t.patronTier || null,
      isPublishedToPatrons: Boolean(t.isPublishedToPatrons),
      donorRecordId: t.donorRecordId ? String(t.donorRecordId) : null,
      adminNote: t.adminNote || "",
      verifiedBy: t.verifiedBy || null,
      verifiedAt: t.verifiedAt ? new Date(t.verifiedAt).toISOString() : null,
      createdAt: new Date(t.createdAt || t.donatedAt || Date.now()).toISOString(),
    }));

    const patrons = patronsRaw.map((p: any) => ({
      id: String(p._id),
      name: p.name,
      username: p.username || null,
      amount: Number(p.amount) || 0,
      tier: p.tier || computePatronTier(Number(p.amount) || 0),
      message: p.message || "",
      isAnonymous: Boolean(p.isAnonymous),
      isVisible: Boolean(p.isVisible),
      donatedAt: p.donatedAt
        ? new Date(p.donatedAt).toISOString()
        : new Date(p.createdAt).toISOString(),
    }));

    return {
      success: true,
      summary,
      transactions,
      patrons,
      settings: {
        upiId: (settingsRaw as any)?.upiId || "",
        payeeName: (settingsRaw as any)?.payeeName || "ConceptNichod",
        qrCodeUrl: "",
        isEnabled: Boolean((settingsRaw as any)?.isEnabled) && process.env.DONATIONS_ENABLED === "true",
      },
    };
  } catch (error: any) {
    console.error("[getAdminDonationDashboard] Error:", error);
    return {
      success: false,
      error: getSafeAdminError(error, "Failed to load Admin Donation Dashboard."),
    };
  }
}

/**
 * 4. Admin Action: Manually Enter Verified Amount, Mark UTR Verified & Optionally Promote to Hall of Patrons
 */
export async function adminVerifyDonationAndSetAmount(payload: {
  transactionDbId: string;
  verifiedAmount: number | string;
  bankReference: string;
  recipientVpa: string;
  publishToHallOfPatrons: boolean;
  customTier?: string;
  adminNote?: string;
}) {
  try {
    const adminUser = await requireOwnerSession();

    if (!payload || typeof payload !== "object" || typeof payload.transactionDbId !== "string" || !mongoose.isValidObjectId(payload.transactionDbId)) {
      return { success: false, error: "Invalid donation transaction ID." };
    }

    const amountCheck = validateAdminVerifiedAmount(payload.verifiedAmount);
    if (!amountCheck.valid || !amountCheck.data) {
      return {
        success: false,
        error: amountCheck.error || "Please enter a valid verified amount (₹).",
      };
    }

    const confirmedAmount = amountCheck.data;

    let tx = await DonationTransaction.findById(payload.transactionDbId);
    if (!tx) {
      return { success: false, error: "Donation transaction not found." };
    }
    // Resume a verified payment if its patron sync previously failed.
    const isDonorSyncRecovery =
      tx.status === "verified" && Boolean(tx.isPublishedToPatrons) && !tx.donorRecordId;
    if (tx.status && tx.status !== "pending" && !isDonorSyncRecovery) {
      return { success: false, error: "This donation has already been reviewed." };
    }

    // An admin-entered amount is not proof of payment. Require explicit bank-record
    // reference and recipient VPA confirmation before changing a transaction to verified.
    const bankReference = sanitizeDonationText(payload.bankReference || "", 60).replace(/\s+/g, "");
    if (!bankReference || bankReference !== String(tx.utr)) {
      return { success: false, error: "Bank statement reference must exactly match the submitted UTR." };
    }
    const settings = await DonationSetting.findOne().select("upiId").lean();
    const configuredVpa = normalizeVpa((settings as any)?.upiId);
    const recipientVpa = normalizeVpa(sanitizeDonationText(payload.recipientVpa || "", 100));
    if (!configuredVpa || !recipientVpa || recipientVpa !== configuredVpa) {
      return { success: false, error: "Recipient VPA must match the configured donation account and the bank record." };
    }

    if (isDonorSyncRecovery && Number(tx.verifiedAmount) !== confirmedAmount) {
      return { success: false, error: "This verified donation amount is locked; retry patron synchronization with the original amount." };
    }
    const tier: PatronTier = isDonorSyncRecovery
      ? (tx.patronTier || computePatronTier(confirmedAmount))
      : payload.customTier && VALID_TIERS.includes(payload.customTier as PatronTier)
        ? (payload.customTier as PatronTier)
        : computePatronTier(confirmedAmount);

    if (!isDonorSyncRecovery) {
      const shouldPublish = Boolean(payload.publishToHallOfPatrons);
      // Atomically claim a pending transaction so concurrent approvals cannot both proceed.
      const claimedTx = await DonationTransaction.findOneAndUpdate(
        {
          _id: tx._id,
          $or: [
            { status: "pending" },
            { status: { $exists: false } },
            { status: null },
          ],
        },
        {
          $set: {
            status: "verified",
            bankReference,
            recipientVpa: configuredVpa,
            verificationMethod: "manual-bank-reconciliation",
            verifiedAmount: confirmedAmount,
            amount: confirmedAmount,
            patronTier: tier,
            isPublishedToPatrons: shouldPublish,
            isPublic: shouldPublish,
            adminNote: sanitizeDonationText(payload.adminNote || "", 500),
            verifiedBy: (adminUser as any).username || "Admin",
            verifiedAt: new Date(),
          },
        },
        { new: true, runValidators: true }
      );
      if (!claimedTx) {
        return { success: false, error: "This donation has already been reviewed or is being processed." };
      }
      tx = claimedTx;
    }

    // Synchronize a transaction-scoped Donor row with fixed $set values.
    // Retrying this block cannot increment a donation a second time.
    if (tx.isPublishedToPatrons) {
      const patronData = {
        userId: tx.userId || null,
        userUuid: tx.userId || null,
        username: tx.username || null,
        name: tx.donorName,
        amount: confirmedAmount,
        tier,
        message: tx.message || "",
        isAnonymous: tx.isAnonymous,
        isVisible: true,
        utr: tx.utr,
        transactionId: tx.transactionId || undefined,
        transactionRef: String(tx._id),
        verifiedBy: tx.verifiedBy,
        donatedAt: tx.createdAt || new Date(),
        lastDonatedAt: tx.createdAt || new Date(),
        totalAmount: confirmedAmount,
        donationCount: 1,
        latestMessage: tx.message || "",
        isPublic: true,
      };

      await syncDonationDonor({
        tx,
        donorData: patronData,
        donorStore: createDonorStore(),
      });
    } else if (tx.donorRecordId && mongoose.isValidObjectId(tx.donorRecordId)) {
      await Donor.findByIdAndUpdate(tx.donorRecordId, { $set: { isVisible: false, isPublic: false } });
    }

    // Keep the bank-verified status if patron sync fails. A retry is safe because
    // the deterministic donor UUID prevents duplicate credits.
    await tx.save();

    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: tx.isPublishedToPatrons
        ? `Verified ₹${confirmedAmount.toLocaleString("en-IN")} and added ${tx.donorName} to the Hall of Patrons!`
        : `Verified ₹${confirmedAmount.toLocaleString("en-IN")} for UTR ${tx.utr}.`,
    };
  } catch (error: any) {
    console.error("[adminVerifyDonationAndSetAmount] Error:", error);
    return {
      success: false,
      error: getSafeAdminError(error, "Failed to verify donation."),
    };
  }
}

/**
 * 5. Admin Action: Toggle Hall of Patrons Visibility for an Already Verified Transaction
 */
export async function adminToggleHallOfPatrons(
  transactionDbId: string,
  publish: boolean
) {
  try {
    const adminUser = await requireOwnerSession();

    if (typeof transactionDbId !== "string" || !mongoose.isValidObjectId(transactionDbId)) {
      return { success: false, error: "Invalid transaction ID." };
    }

    const tx = await DonationTransaction.findById(transactionDbId);
    if (!tx) {
      return { success: false, error: "Transaction record not found." };
    }

    if (tx.status !== "verified" || !tx.verifiedAmount || !Number.isFinite(tx.verifiedAmount) || tx.verifiedAmount <= 0) {
      return {
        success: false,
        error: "You must verify the UTR and enter a valid ₹ amount before adding to the Hall of Patrons.",
      };
    }

    tx.isPublishedToPatrons = Boolean(publish);
    tx.isPublic = Boolean(publish);
    const tier = tx.patronTier || computePatronTier(tx.verifiedAmount);
    tx.patronTier = tier;

    if (publish) {
      const patronData = {
        userId: tx.userId || null,
        userUuid: tx.userId || null,
        username: tx.username || null,
        name: tx.donorName,
        amount: tx.verifiedAmount,
        tier,
        message: tx.message || "",
        isAnonymous: tx.isAnonymous,
        isVisible: true,
        utr: tx.utr,
        transactionId: tx.transactionId || undefined,
        transactionRef: String(tx._id),
        verifiedBy: tx.verifiedBy || (adminUser as any).username || "Admin",
        donatedAt: tx.createdAt || new Date(),
        lastDonatedAt: tx.createdAt || new Date(),
        totalAmount: tx.verifiedAmount,
        donationCount: 1,
        latestMessage: tx.message || "",
        isPublic: true,
      };

      await syncDonationDonor({
        tx,
        donorData: patronData,
        donorStore: createDonorStore(),
      });
    } else if (tx.donorRecordId && mongoose.isValidObjectId(tx.donorRecordId)) {
      await Donor.findByIdAndUpdate(tx.donorRecordId, { $set: { isVisible: false, isPublic: false } });
    }

    await tx.save();

    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: publish
        ? `${tx.donorName} is now live in the Hall of Patrons!`
        : `${tx.donorName} was removed from the public Hall of Patrons.`,
    };
  } catch (error: any) {
    console.error("[adminToggleHallOfPatrons] Error:", error);
    return {
      success: false,
      error: getSafeAdminError(error, "Failed to toggle Hall of Patrons status."),
    };
  }
}

/**
 * 6. Admin Action: Reject an Invalid / Fake UTR Submission
 */
export async function adminRejectDonationTransaction(
  transactionDbId: string,
  adminNote?: string
) {
  try {
    const adminUser = await requireOwnerSession();

    if (typeof transactionDbId !== "string" || !mongoose.isValidObjectId(transactionDbId)) {
      return { success: false, error: "Invalid transaction ID." };
    }

    const tx = await DonationTransaction.findById(transactionDbId);
    if (!tx) {
      return { success: false, error: "Transaction not found." };
    }

    tx.status = "rejected";
    tx.verifiedAmount = null;
    tx.amount = null;
    tx.patronTier = null;
    tx.bankReference = null;
    tx.recipientVpa = null;
    tx.verificationMethod = null;
    tx.isPublishedToPatrons = false;
    tx.isPublic = false;
    tx.adminNote = sanitizeDonationText(
      adminNote || "UTR / Transaction ID could not be verified in bank statement.",
      500
    );
    tx.verifiedBy = (adminUser as any).username || "Admin";
    tx.verifiedAt = new Date();

    if (tx.donorRecordId && mongoose.isValidObjectId(tx.donorRecordId)) {
      await Donor.findByIdAndUpdate(tx.donorRecordId, { $set: { isVisible: false, isPublic: false } });
    }

    await tx.save();

    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: `Transaction (UTR: ${tx.utr}) marked as Rejected.`,
    };
  } catch (error: any) {
    console.error("[adminRejectDonationTransaction] Error:", error);
    return {
      success: false,
      error: getSafeAdminError(error, "Failed to reject donation."),
    };
  }
}

/**
 * 7. Admin Action: Update UPI Settings (UPI ID, Payee Name, QR Code URL)
 */
export async function adminUpdateDonationSettings(input: {
  upiId: string;
  payeeName: string;
  qrCodeUrl?: string;
  isEnabled?: boolean;
  customInstructions?: string;
  thankYouNote?: string;
}) {
  try {
    const adminUser = await requireOwnerSession();

    if (!input || typeof input !== "object") {
      return { success: false, error: "Invalid UPI settings payload." };
    }

    const upiId = normalizeVpa(sanitizeDonationText(input.upiId, 100));
    const payeeName = sanitizeDonationText(input.payeeName, 80);
    const qrCodeUrl = sanitizeDonationText(input.qrCodeUrl || "", 300);
    const isSafeQrCodeUrl = !qrCodeUrl || (qrCodeUrl.startsWith("/") && !qrCodeUrl.startsWith("//")) || (() => { try { return new URL(qrCodeUrl).protocol === "https:"; } catch { return false; } })();
    if (!isSafeQrCodeUrl) return { success: false, error: "QR image must use a same-site path or a secure HTTPS image URL." };

    if (!upiId) {
      return { success: false, error: "Please enter a valid UPI ID (e.g. name@upi)." };
    }

    let settings = await DonationSetting.findOne();
    if (!settings) {
      settings = new DonationSetting({});
    }

    settings.upiId = upiId;
    settings.payeeName = payeeName || "ConceptNichod";
    settings.qrCodeUrl = "";
    settings.isEnabled = input.isEnabled ?? true;
    settings.updatedBy = (adminUser as any).username || "Admin";
    if (input.customInstructions !== undefined) settings.subtext = sanitizeDonationText(input.customInstructions, 500);
    settings.customInstructions = settings.subtext || settings.customInstructions;
    if (input.thankYouNote !== undefined) settings.thankYouNote = sanitizeDonationText(input.thankYouNote, 500);

    await settings.save();

    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: "UPI Donation settings updated successfully.",
    };
  } catch (error: any) {
    console.error("[adminUpdateDonationSettings] Error:", error);
    return {
      success: false,
      error: getSafeAdminError(error, "Failed to update UPI settings."),
    };
  }
}

/* Backward-compatible exports retained for existing imports. */
export async function getDonationInfoAction() {
  await connectToDatabase();
  const setting = await DonationSetting.findOne().lean();

  // Keep legacy public metrics bank-verified only; unverified claims never contribute.
  const verifiedDonations = await DonationTransaction.aggregate([
    { $match: { status: "verified", verifiedAmount: { $gt: 0 } } },
    { $sort: { verifiedAt: 1, _id: 1 } },
    { $group: { _id: "$userUuid", username: { $last: "$username" }, totalAmount: { $sum: "$verifiedAmount" }, donationCount: { $sum: 1 }, lastDonatedAt: { $max: "$verifiedAt" }, latestMessage: { $last: "$message" } } },
    { $sort: { totalAmount: -1, lastDonatedAt: -1 } }
  ]);
  // Hall of Patrons publication remains a separate explicit Admin decision.
  const publishedPatrons = await Donor.find({ isVisible: true, isPublic: true, amount: { $gt: 0 } })
    .select("uuid username name amount totalAmount donationCount tier message latestMessage donatedAt lastDonatedAt isAnonymous")
    .sort({ amount: -1, donatedAt: -1 }).limit(150).lean();
  const donors = publishedPatrons.map((d: any) => ({
    uuid: crypto.createHash("sha256").update(String(d.uuid || d._id)).digest("hex").slice(0, 16),
    username: d.isAnonymous ? null : d.username || null,
    name: d.isAnonymous ? "Anonymous Patron" : d.name,
    totalAmount: Number(d.amount) || 0,
    amount: Number(d.amount) || 0,
    donationCount: Number(d.donationCount) || 1,
    tier: d.tier || "SUPPORTER",
    latestMessage: d.message || d.latestMessage || "",
    message: d.message || d.latestMessage || "",
    lastDonatedAt: d.donatedAt || d.lastDonatedAt || null,
    donatedAt: d.donatedAt || d.lastDonatedAt || null,
  }));

  // Strict allowlist projection prevents leaking bankReference (UTR), donorEmail, userId, adminNote, or anonymous identities.
  const recentTransactionDocs = await DonationTransaction.find({ isPublic: true, status: "verified" })
    .select("_id donorName username isAnonymous verifiedAmount amount patronTier message donatedAt verifiedAt createdAt")
    .sort({ donatedAt: -1 }).limit(10).lean();
  const recentTransactions = recentTransactionDocs.map((tx: any) => ({
    publicId: crypto.createHash("sha256").update(String(tx._id)).digest("hex").slice(0, 16),
    donorName: tx.isAnonymous ? "Anonymous Patron" : tx.donorName,
    username: tx.isAnonymous ? null : tx.username || null,
    isAnonymous: Boolean(tx.isAnonymous),
    amount: Number(tx.verifiedAmount ?? tx.amount) || 0,
    verifiedAmount: Number(tx.verifiedAmount ?? tx.amount) || 0,
    patronTier: tx.patronTier || "SUPPORTER",
    message: tx.message || "",
    donatedAt: tx.donatedAt ? new Date(tx.donatedAt).toISOString() : new Date(tx.createdAt || Date.now()).toISOString(),
  }));

  const configuredVpa = normalizeVpa(setting?.upiId || "");
  const donationsAvailable =
    process.env.DONATIONS_ENABLED === "true" &&
    Boolean(setting?.isEnabled) &&
    Boolean(configuredVpa);

  const publicSettings = {
    upiId: donationsAvailable ? configuredVpa || "" : "",
    payeeName: setting?.payeeName || "ConceptNichod",
    qrCodeUrl: "",
    isEnabled: donationsAvailable,
    headline: setting?.headline || "Support ConceptNichod & Join the Hall of Patrons",
    subtext: setting?.subtext || "Pay using any UPI app, then submit your 12-digit UTR and Transaction ID for manual Admin verification.",
    customInstructions: setting?.customInstructions || "Pay using any UPI app, then submit your transaction reference for manual verification.",
    thankYouNote: setting?.thankYouNote || "Thank you for supporting ConceptNichod.",
  };

  // Evaluated for audit parity; only publishedPatrons are returned publicly.
  void verifiedDonations;
  return { success: true, settings: publicSettings, donors: JSON.parse(JSON.stringify(donors)), recentTransactions };
}

export async function submitDonationUtrAction(_payload: { amount: number; utr: string; message?: string }) {
  return { success: false, error: "The donation form has been updated. Submit your donor name, 12-digit UTR and payment-app Transaction ID using /donate." };
}

export async function reconcileDonationManuallyAction(payload: { utr: string; bankReference: string; receivedAmount: number; recipientVpa: string }) {
  await requireOwnerSession();
  if (!payload || typeof payload !== "object") return { success: false, error: "Invalid reconciliation payload." };
  const utr = String(payload.utr || "").trim();
  if (!utr || String(payload.bankReference || "").trim() !== utr) return { success: false, error: "Bank reference mismatch." };
  const tx = await DonationTransaction.findOne({ utr }).select("_id").lean();
  if (!tx) return { success: false, error: "No donation submission found for this UTR." };
  const settings = await DonationSetting.findOne().select("upiId").lean();
  const configuredVpa = normalizeVpa((settings as any)?.upiId || "");
  const suppliedVpa = normalizeVpa(String(payload.recipientVpa || ""));
  if (!configuredVpa || !suppliedVpa || suppliedVpa !== configuredVpa) {
    return { success: false, error: "Recipient VPA does not match the configured donation UPI ID." };
  }
  return adminVerifyDonationAndSetAmount({
    transactionDbId: String(tx._id),
    verifiedAmount: payload.receivedAmount,
    bankReference: payload.bankReference,
    recipientVpa: payload.recipientVpa,
    publishToHallOfPatrons: false,
  });
}

export async function getPendingDonationsAdminAction() {
  const res = await getAdminDonationDashboard("pending");
  if (!res.success) throw new Error(res.error || "Unable to load donations.");
  return (res.transactions || []).map((t: any) => ({
    utr: t.utr,
    transactionId: t.transactionId,
    username: t.username || "",
    donorName: t.donorName,
    claimedAmount: null,
    message: t.message || "",
    submittedAt: t.createdAt,
  }));
}

export async function getCurrentUserDonationContextAction() {
  try {
    const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
    if (!sessionUuid) return { success: false, username: null };
    await connectToDatabase();
    const user = await User.findOne({ uuid: sessionUuid }).select("username fullName").lean();
    if (!user) return { success: false, username: null };
    return { success: true, username: (user as any).username, name: (user as any).fullName || (user as any).username };
  } catch {
    return { success: false, username: null };
  }
}

export async function getAdminDonationSettingsAction() {
  await requireOwnerSession();
  const settings = await DonationSetting.findOne().select("upiId qrCodeUrl isEnabled").lean();
  return {
    success: true,
    settings: {
      upiId: (settings as any)?.upiId || "",
      qrCodeUrl: "",
      isEnabled: Boolean((settings as any)?.isEnabled),
    },
  };
}

export async function updateDonationSettingsAction(payload: { upiId: string; qrCodeUrl?: string; customInstructions?: string; thankYouNote?: string }) {
  return adminUpdateDonationSettings({
    upiId: payload?.upiId || "",
    payeeName: "ConceptNichod",
    qrCodeUrl: payload?.qrCodeUrl || "",
    isEnabled: true,
    customInstructions: payload?.customInstructions,
    thankYouNote: payload?.thankYouNote,
  });
}

export async function addDonorCardAction(payload: { username: string; amount: number; tier?: "Supporter" | "Patron" | "Benefactor" | "Legend"; message?: string }) {
  return adminAddManualPatron({
    name: payload?.username || "",
    amount: payload?.amount,
    tier: payload?.tier,
    message: payload?.message,
  });
}

export async function deleteDonorCardAction(uuid: string) {
  await requireOwnerSession();
  if (typeof uuid !== "string" || !uuid.trim()) {
    return { success: false, error: "Invalid donor identifier." };
  }
  const donor = await Donor.findOne({ uuid: uuid.trim() });
  if (donor) {
    donor.isVisible = false;
    donor.isPublic = false;
    await donor.save();
  }
  return { success: true };
}

export async function adminUpdatePatron(payload: { donorId: string; name?: string; amount: number | string; tier?: string; message?: string; isAnonymous?: boolean }) {
  try {
    await requireOwnerSession();
    if (!payload || typeof payload !== "object" || typeof payload.donorId !== "string" || !mongoose.isValidObjectId(payload.donorId)) {
      return { success: false, error: "Invalid patron ID." };
    }
    const amount = validateAdminVerifiedAmount(payload.amount);
    if (!amount.valid || !amount.data) return { success: false, error: amount.error || "Invalid amount." };
    const donor = await Donor.findById(payload.donorId);
    if (!donor) return { success: false, error: "Patron not found." };
    const tier = payload.tier && VALID_TIERS.includes(payload.tier as PatronTier) ? payload.tier as PatronTier : computePatronTier(amount.data);
    if (donor.transactionRef && mongoose.isValidObjectId(donor.transactionRef)) {
      const linkedTransaction = await DonationTransaction.findById(donor.transactionRef).select("status verifiedAmount").lean();
      if (!linkedTransaction || linkedTransaction.status !== "verified" || Number(linkedTransaction.verifiedAmount) !== amount.data) {
        return { success: false, error: "The amount of a linked payment record is locked. Reconcile the bank reference and recipient VPA in the transaction queue first." };
      }
    }
    const candidateName = payload.name !== undefined ? sanitizeDonationText(payload.name, 60) : donor.name;
    if (!candidateName || candidateName.length < 2) {
      return { success: false, error: "Patron name must be at least 2 characters." };
    }
    donor.name = candidateName;
    donor.amount = amount.data;
    donor.totalAmount = amount.data;
    donor.tier = tier;
    donor.message = sanitizeDonationText(payload.message || "", 250);
    donor.latestMessage = donor.message;
    donor.isAnonymous = Boolean(payload.isAnonymous);
    donor.isVisible = true;
    donor.isPublic = true;
    await donor.save();
    if (donor.transactionRef && mongoose.isValidObjectId(donor.transactionRef)) {
      await DonationTransaction.findByIdAndUpdate(donor.transactionRef, {
        $set: { verifiedAmount: amount.data, amount: amount.data, patronTier: tier, isPublishedToPatrons: true, isPublic: true },
      });
    }
    revalidatePath("/donate");
    revalidatePath("/dashboard/admin/donations");
    return { success: true, message: "Hall of Patrons entry updated." };
  } catch (error: any) {
    console.error("[adminUpdatePatron] Error:", error);
    return { success: false, error: getSafeAdminError(error, "Failed to update patron entry.") };
  }
}

export async function adminRemovePatron(donorId: string) {
  try {
    await requireOwnerSession();
    if (typeof donorId !== "string" || !mongoose.isValidObjectId(donorId)) {
      return { success: false, error: "Invalid patron ID." };
    }
    const donor = await Donor.findById(donorId);
    if (!donor) return { success: false, error: "Patron not found." };
    donor.isVisible = false;
    donor.isPublic = false;
    await donor.save();
    if (donor.transactionRef && mongoose.isValidObjectId(donor.transactionRef)) {
      await DonationTransaction.findByIdAndUpdate(donor.transactionRef, {
        $set: { isPublishedToPatrons: false, isPublic: false },
      });
    }
    revalidatePath("/donate");
    revalidatePath("/dashboard/admin/donations");
    return { success: true, message: "Patron hidden from the Hall of Patrons." };
  } catch (error: any) {
    console.error("[adminRemovePatron] Error:", error);
    return { success: false, error: getSafeAdminError(error, "Failed to hide patron.") };
  }
}

export async function adminAddManualPatron(payload: { name: string; amount: number | string; tier?: string; message?: string; isAnonymous?: boolean }) {
  try {
    await requireOwnerSession();
    if (!payload || typeof payload !== "object") {
      return { success: false, error: "Invalid patron payload." };
    }
    const amount = validateAdminVerifiedAmount(payload.amount);
    const name = sanitizeDonationText(payload.name, 60);
    if (!amount.valid || !amount.data) return { success: false, error: amount.error || "Invalid amount." };
    if (name.length < 2) return { success: false, error: "Patron name is required." };
    const tier = payload.tier && VALID_TIERS.includes(payload.tier as PatronTier) ? payload.tier as PatronTier : computePatronTier(amount.data);
    const message = sanitizeDonationText(payload.message || "", 250);
    const donor = await Donor.create({
      uuid: crypto.randomUUID(),
      name,
      amount: amount.data,
      totalAmount: amount.data,
      donationCount: 1,
      tier,
      message,
      latestMessage: message,
      isAnonymous: Boolean(payload.isAnonymous),
      isVisible: true,
      isPublic: true,
      donatedAt: new Date(),
      lastDonatedAt: new Date(),
    });
    revalidatePath("/donate");
    revalidatePath("/dashboard/admin/donations");
    return { success: true, donorId: String(donor._id), message: "Manual patron added." };
  } catch (error: any) {
    console.error("[adminAddManualPatron] Error:", error);
    return { success: false, error: getSafeAdminError(error, "Failed to add manual patron.") };
  }
}
```

---

## FINAL REQUIRED REPORT FORMAT
After committing all 7 files to `main` (and deleting `_audit_prompt.md` if present), output ONLY:
1. `COMMIT_SHAS`: exact SHA pushed to `main`
2. `UPDATED_FILES_COUNT`: `X/7`
3. `CI_RUN_ID` & `CI_RUN_STATUS`: workflow run ID, current status, and exact failing step/error lines if failed