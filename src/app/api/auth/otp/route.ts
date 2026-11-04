import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import OtpVerification from '@/models/OtpVerification';
import User from '@/models/User';
import Blacklist from '@/models/Blacklist';
import nodemailer from 'nodemailer';
import { getClientIp } from '@/lib/ip';
import { checkRateLimit } from '@/lib/rate-limiter';

const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown

function validateEmailDomain(email: string) {
  return email.endsWith("@gmail.com") || email.endsWith("@outlook.com") || email.endsWith("@outlook.in");
}

export async function POST(req: Request) {
  try {
    let { email, action, otp, isPasswordReset } = await req.json();

    if (email) {
      email = email.toLowerCase().trim();
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    await dbConnect();

    const ip = getClientIp(req.headers);

    // Blacklist enforcement
    const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip });
    if (isIpBanned) {
      return NextResponse.json({ error: 'Access denied: Your IP address is banned.' }, { status: 403 });
    }

    const isEmailBanned = await Blacklist.findOne({ type: "email", value: email });
    if (isEmailBanned) {
      return NextResponse.json({ error: 'Access denied: This email address is banned.' }, { status: 403 });
    }

    const senderUser = process.env.EMAIL_SERVER_USER || process.env.GMAIL_USER || 'mythicalhrg@gmail.com';
    const senderPass = process.env.EMAIL_SERVER_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

    if (action === 'send') {
      // IP Rate limiting: 5 requests per 15 minutes
      const rateLimit = checkRateLimit(`otp:${ip}`, 5, 15 * 60 * 1000);
      if (!rateLimit.success) {
        return NextResponse.json(
          { error: 'Too many OTP requests from this IP. Please try again later.' },
          { status: 429 }
        );
      }

      // Enforce email domain restriction
      if (!validateEmailDomain(email)) {
        return NextResponse.json(
          { error: 'Only @gmail.com, @outlook.com, and @outlook.in emails are allowed.' },
          { status: 400 }
        );
      }
      if (isPasswordReset) {
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
          return NextResponse.json({ error: 'No account registered with this email address.' }, { status: 404 });
        }
      }

      // Check resend cooldown to prevent email spamming
      const existingOtp = await OtpVerification.findOne({ email });
      if (existingOtp && existingOtp.lastSentAt) {
        const elapsed = Date.now() - new Date(existingOtp.lastSentAt).getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
          const waitSecs = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
          return NextResponse.json(
            { error: `Please wait ${waitSecs} seconds before requesting another code.` },
            { status: 429 }
          );
        }
      }

      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

      // Upsert OTP record
      let otpRecord = existingOtp;
      if (!otpRecord) {
        otpRecord = new OtpVerification({ email });
      }

      otpRecord.otp = generatedOtp;
      otpRecord.expiresAt = expiry;
      otpRecord.isVerified = false;
      otpRecord.attempts = 0;
      otpRecord.lastSentAt = new Date();
      await otpRecord.save();

      if (!senderPass) {
        return NextResponse.json(
          { error: 'Email server credentials missing in environment variables.' },
          { status: 500 }
        );
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: senderUser,
          pass: senderPass,
        },
      });

      await transporter.sendMail({
        from: `"Concept Nichod Security" <${senderUser}>`,
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

      return NextResponse.json({ success: true, message: 'OTP sent successfully' });
    }

    if (action === 'verify') {
      const sanitizedOtp = (otp || '').trim();
      if (!sanitizedOtp) return NextResponse.json({ error: 'OTP is required' }, { status: 400 });

      const otpRecord = await OtpVerification.findOne({ email });
      if (!otpRecord) return NextResponse.json({ error: 'No verification code requested for this email' }, { status: 404 });

      // Check max attempts to prevent brute-force cracking
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;

      if (otpRecord.attempts > MAX_VERIFY_ATTEMPTS) {
        await OtpVerification.deleteOne({ email });
        return NextResponse.json(
          { error: 'Too many incorrect attempts. This code has been invalidated for security. Please request a new one.' },
          { status: 429 }
        );
      }

      if (new Date() > otpRecord.expiresAt) {
        await OtpVerification.deleteOne({ email });
        return NextResponse.json({ error: 'Verification code has expired. Please request a new code.' }, { status: 400 });
      }

      if (otpRecord.otp !== sanitizedOtp) {
        await otpRecord.save();
        const remaining = MAX_VERIFY_ATTEMPTS - otpRecord.attempts;
        return NextResponse.json(
          { error: `Invalid code. ${remaining} attempt(s) remaining before invalidation.` },
          { status: 400 }
        );
      }

      // Verification successful
      otpRecord.isVerified = true;
      await otpRecord.save();

      return NextResponse.json({ success: true, message: 'Email verified successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('OTP error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
