import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import OtpVerification from '@/models/OtpVerification';
import User from '@/models/User';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
});

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

    if (action === 'send') {
      if (isPasswordReset) {
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
      }

      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 1 * 60 * 1000); // 1 min

      // Find or create OTP record
      let otpRecord = await OtpVerification.findOne({ email });
      if (!otpRecord) {
        otpRecord = new OtpVerification({ email });
      }
      
      otpRecord.otp = generatedOtp;
      otpRecord.expiresAt = expiry;
      otpRecord.isVerified = false;
      await otpRecord.save();

      // Send Email
      if (!process.env.EMAIL_SERVER_USER || !process.env.EMAIL_SERVER_PASSWORD) {
        return NextResponse.json({ error: 'Email server credentials missing in .env file.' }, { status: 500 });
      }

      await transporter.sendMail({
        from: process.env.EMAIL_SERVER_USER,
        to: email,
        subject: 'Your ConceptNichod OTP Code',
        html: `<h2>Your OTP Code is: <strong>${generatedOtp}</strong></h2><p>This code will expire in 1 minute.</p>`,
      });

      return NextResponse.json({ success: true, message: 'OTP sent successfully' });
    } 
    
    if (action === 'verify') {
      if (!otp) return NextResponse.json({ error: 'OTP is required' }, { status: 400 });

      const otpRecord = await OtpVerification.findOne({ email });
      if (!otpRecord) return NextResponse.json({ error: 'No OTP requested for this email' }, { status: 404 });

      if (otpRecord.otp !== otp) {
        return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
      }

      if (new Date() > otpRecord.expiresAt) {
        return NextResponse.json({ error: 'OTP expired' }, { status: 400 });
      }

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
