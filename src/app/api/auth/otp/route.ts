import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongoose';
import OtpVerification from '@/models/OtpVerification';
import User from '@/models/User';
import Blacklist from '@/models/Blacklist';
import nodemailer from 'nodemailer';
import { getClientIp } from '@/lib/ip';
import { checkDistributedRateLimit } from '@/lib/distributed-rate-limiter';
import { normalizeEmail, validateEmail } from '@/lib/email-utils';
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
    const isIpBanned = await Blacklist.findOne({ type: 'ip', value: ip }).select('_id').lean();
    if (isIpBanned) {
      return NextResponse.json({ error: 'Access denied: Your IP address is banned.' }, { status: 403 });
    }

    const isEmailBanned = await Blacklist.findOne({
      type: 'email',
      value: { $in: emailCandidates },
    }).select('_id').lean();
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

      // Enforce strict email format, domain restriction, and no +tag subaddressing
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
        if (email === PLATFORM_OWNER_EMAIL || normalizedEmail === normalizeEmail(PLATFORM_OWNER_EMAIL)) {
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
      const ipUnavailable = ip === '127.0.0.1' || ip === 'unknown';
      const verifyRateLimit = ipUnavailable
        ? await checkDistributedRateLimit(`otp:verify:ip:${ip}:${normalizedEmail}`, 15, 15 * 60 * 1000)
        : await checkDistributedRateLimit(`otp:verify:${ip}`, 15, 15 * 60 * 1000);
      const verifyEmailRateLimit = await checkDistributedRateLimit(`otp:verify:email:${normalizedEmail}`, 15, 15 * 60 * 1000);
      if (!verifyRateLimit.success || !verifyEmailRateLimit.success) {
        const retryMs = Math.max(verifyRateLimit.resetMs, verifyEmailRateLimit.resetMs);
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
