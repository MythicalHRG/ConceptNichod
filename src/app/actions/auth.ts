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
  checkRateLimit,
  peekRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from "@/lib/rate-limiter";
import { normalizeEmail, validateEmailDomain, validateEmail } from "@/lib/email-utils";

const SECRET_KEY = process.env.ENCRYPTION_SECRET_KEY || "super_secret_default_key_for_encodec_12345!";

function validatePassword(password: string) {
    if (password.length < 8) return "Password must be at least 8 characters long.";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
    if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special symbol.";
    return null;
}

export async function validateUsername(username: string): Promise<string | null> {
    if (!username || username.length < 3 || username.length > 30) {
        return "Username must be between 3 and 30 characters long.";
    }
    // Only alphanumeric characters, underscores (_), and periods (.)
    // No spaces, and no @, /, (, ), +, -, &, ", *, ', :, ;, !, ?, #, or ₹
    const validUsernameRegex = /^[a-zA-Z0-9_.]+$/;
    if (!validUsernameRegex.test(username)) {
        return "Usernames can only include letters, numbers, underscores (_), and periods (.). Spaces and other symbols are not allowed.";
    }

    const clean = username.toLowerCase().trim();
    if (clean === "mythicalhrg") {
        return "This username is reserved for system administration.";
    }

    try {
        await dbConnect();
        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existing = await User.findOne({ username: new RegExp(`^${escapeRegex(clean)}$`, 'i') });
        if (existing) {
            return "A user with this username already exists. Please choose a different username.";
        }
    } catch (err) {
        console.error("Error validating username against database:", err);
    }

    return null;
}

export async function registerAction(formData: FormData) {
    await dbConnect();
    const email = (formData.get("email") as string).toLowerCase().trim();
    const username = (formData.get("username") as string).toLowerCase().trim();
    const password = formData.get("password") as string;
    const fullName = formData.get("fullName") as string;
    const gender = formData.get("gender") as string;
    const dob = formData.get("dob") as string;
    const classLevel = formData.get("classLevel") as string;
    const examFocus = formData.get("examFocus") as string | null;
    const city = formData.get("city") as string;
    const futureCollege = formData.get("futureCollege") as string | null;
    const snapchat = formData.get("snapchat") as string | null;
    const instagram = formData.get("instagram") as string | null;

    try {
        if (!email || !username || !password || !fullName || !gender || !dob || !classLevel || !city) {
            throw new Error("Missing required fields");
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

        const ip = getClientIp();
        const regRate = checkRateLimit(`register:${ip}`, 3, 60 * 60 * 1000);
        if (!regRate.success) {
            throw new Error("Too many registration attempts from this IP. Please try again later.");
        }

        const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip });
        if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

        const isEmailBanned = await Blacklist.findOne({ type: "email", value: email });
        if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

        const isUsernameBanned = await Blacklist.findOne({ type: "username", value: username });
        if (isUsernameBanned) throw new Error("Access denied: This username is banned.");

        // Check OTP verification
        const otpRecord = await OtpVerification.findOne({ email });
        if (!otpRecord || !otpRecord.isVerified) {
            throw new Error("Email address has not been verified via OTP.");
        }

        const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const safeEmail = escapeRegex(email);
        const safeUsername = escapeRegex(username);

        const existingUserByEmail = await User.findOne({
            $or: [
                { email: new RegExp(`^${safeEmail}$`, 'i') },
                { email: normalizedEmail }
            ]
        });
        if (existingUserByEmail) throw new Error("Email is already registered.");
        
        const existingUserByUsername = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') });
        if (existingUserByUsername) throw new Error("A user with this username already exists. Please choose a different username.");

        const encryptedPassword = await hashPassword(password);
        const uuid = crypto.randomUUID();
        const now = new Date();

        const newUser = await User.create({
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

        // Delete OTP record after successful registration to prevent reuse (Account Takeover)
        await OtpVerification.deleteOne({ email });

        cookies().set("user_session", createSignedSessionCookie(uuid), { 
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
        return { success: false, error: e.message };
    }
}

export async function loginAction(formData: FormData) {
    await dbConnect();
    const rawInput = ((formData.get("email") as string) || "").trim();
    const password = formData.get("password") as string;

    try {
        if (!rawInput || !password) throw new Error("Missing email or password");

        const ip = getClientIp();
        const loginRateKey = `login:${ip}:${rawInput.toLowerCase()}`;
        const loginRateStatus = peekRateLimit(loginRateKey, 5, 15 * 60 * 1000);
        if (!loginRateStatus.success) {
            throw new Error("Too many failed login attempts. Please try again after 15 minutes.");
        }

        const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip });
        if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

        const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const safeInput = escapeRegex(rawInput);

        // Block subaddressing / alias logins (e.g. abc+1@gmail.com)
        if (rawInput.includes("@") && rawInput.includes("+")) {
            throw new Error("Email aliases and subaddressing (+tag) are not permitted. Please log in with your primary email address.");
        }

        // Find user by either email or username (case-insensitive)
        const user = await User.findOne({
            $or: [
                { email: new RegExp(`^${safeInput}$`, 'i') },
                { username: new RegExp(`^${safeInput}$`, 'i') }
            ]
        });

        if (!user) {
            recordFailedAttempt(loginRateKey, 5, 15 * 60 * 1000);
            throw new Error("Invalid credentials");
        }

        const isEmailBanned = await Blacklist.findOne({ type: "email", value: user.email.toLowerCase() });
        if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

        const isUsernameBanned = await Blacklist.findOne({ type: "username", value: user.username.toLowerCase() });
        if (isUsernameBanned) throw new Error("Access denied: This username is banned.");

        try {
            const isValid = await comparePassword(password, user.password);
            if (!isValid) {
                recordFailedAttempt(loginRateKey, 5, 15 * 60 * 1000);
                throw new Error("Invalid credentials");
            }

            // Reset failed login count on successful authentication
            resetRateLimit(loginRateKey);

            // Update login IP and timestamps
            const now = new Date();
            user.lastLoginIp = ip;
            user.lastLoginAt = now;
            user.lastKnownIp = ip;
            if (!user.firstLoginIp) {
                user.firstLoginIp = ip;
                user.firstLoginAt = user.createdAt || now;
            }
            await user.save();
        } catch (e: any) {
            recordFailedAttempt(loginRateKey, 5, 15 * 60 * 1000);
            throw new Error("Invalid credentials");
        }

        cookies().set("user_session", createSignedSessionCookie(user.uuid), { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === "production", 
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7 
        });
        return { success: true, user: { 
            uuid: user.uuid, username: user.username, email: user.email, bio: user.bio,
            fullName: user.fullName, gender: user.gender, dob: user.dob, classLevel: user.classLevel,
            examFocus: user.examFocus, city: user.city, futureCollege: user.futureCollege,
            snapchat: user.snapchat, instagram: user.instagram 
        } };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function logoutAction() {
    cookies().delete("user_session");
    return { success: true };
}

export async function meAction() {
    try {
        const rawSession = cookies().get("user_session")?.value;
        const sessionUuid = verifySessionCookie(rawSession);
        if (!sessionUuid) return { user: null };

        await dbConnect();
        let user = await User.findOne({ uuid: sessionUuid }).lean();

        // Resilience: if the connection was still initializing, retry lookup once
        if (!user && mongoose.connection.readyState !== 1) {
            await dbConnect();
            user = await User.findOne({ uuid: sessionUuid }).lean();
        }

        if (!user) return { user: null };

        return { user: { 
            uuid: user.uuid, username: user.username, email: user.email, bio: user.bio,
            fullName: user.fullName, gender: user.gender, dob: user.dob, classLevel: user.classLevel,
            examFocus: user.examFocus, city: user.city, futureCollege: user.futureCollege,
            snapchat: user.snapchat, instagram: user.instagram 
        } };
    } catch (error) {
        console.error("meAction session restoration error:", error);
        return { user: null, error: "Session restoration temporarily unavailable" };
    }
}

export async function updateProfileAction(formData: FormData) {
    await dbConnect();
    const rawSession = cookies().get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) throw new Error("Not authenticated");

    const username = formData.get("username") as string;
    const bio = formData.get("bio") as string;
    const classLevel = formData.get("classLevel") as string;
    const examFocus = formData.get("examFocus") as string;
    const city = formData.get("city") as string;
    const futureCollege = formData.get("futureCollege") as string;
    const snapchat = formData.get("snapchat") as string;
    const instagram = formData.get("instagram") as string;

    const currentUser = await User.findOne({ uuid: sessionUuid });
    if (!currentUser) throw new Error("User not found");

    const updateData: any = {};
    if (username) {
        const targetUsername = username.toLowerCase().trim();
        const usernameError = await validateUsername(targetUsername);
        if (usernameError) throw new Error(usernameError);

        if (targetUsername === "mythicalhrg" && currentUser.username !== "mythicalhrg") {
            throw new Error("This username is reserved for system administration.");
        }

        const existing = await User.findOne({ username: targetUsername, uuid: { $ne: sessionUuid } });
        if (existing) {
            throw new Error("A user with this username already exists.");
        }

        updateData.username = targetUsername;
    }
    if (bio !== null) updateData.bio = bio;
    if (classLevel !== null) updateData.classLevel = classLevel;
    if (examFocus !== null) updateData.examFocus = examFocus;
    if (city !== null) updateData.city = city;
    if (futureCollege !== null) updateData.futureCollege = futureCollege;
    if (snapchat !== null) updateData.snapchat = snapchat;
    if (instagram !== null) updateData.instagram = instagram;

    try {
        const updatedUser = await User.findOneAndUpdate({ uuid: sessionUuid }, updateData, { new: true });
        if (!updatedUser) throw new Error("User update failed");
        const { password, ...userWithoutPassword } = updatedUser.toObject();
        return { success: true, user: userWithoutPassword };
    } catch (e) {
        throw new Error("Username might already be taken");
    }
}

export async function requestEmailChangeOtpAction(newEmail: string, currentPassword?: string) {
    await dbConnect();
    const rawSession = cookies().get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) throw new Error("Not authenticated");

    const currentUser = await User.findOne({ uuid: sessionUuid });
    if (!currentUser) throw new Error("User not found");

    if (currentPassword) {
        const isPasswordValid = await comparePassword(currentPassword, currentUser.password);
        if (!isPasswordValid) {
            throw new Error("Incorrect current password.");
        }
    }

    const email = newEmail.toLowerCase().trim();
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        throw new Error(emailValidation.error);
    }
    if (email === currentUser.email.toLowerCase()) {
        throw new Error("This is already your current email address.");
    }

    const isEmailBanned = await Blacklist.findOne({ type: "email", value: email });
    if (isEmailBanned) throw new Error("This email address is banned.");

    const existingUser = await User.findOne({ email });
    if (existingUser) throw new Error("This email is already registered to another account.");

    // Check resend cooldown (60 seconds)
    const existingOtp = await OtpVerification.findOne({ email });
    if (existingOtp && existingOtp.lastSentAt) {
        const elapsed = Date.now() - new Date(existingOtp.lastSentAt).getTime();
        if (elapsed < 60000) {
            const waitSecs = Math.ceil((60000 - elapsed) / 1000);
            throw new Error(`Please wait ${waitSecs} seconds before requesting another code.`);
        }
    }

    // Generate 6 digit OTP
    const generatedOtp = crypto.randomInt(100000, 1000000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    let otpRecord = existingOtp || new OtpVerification({ email });
    otpRecord.otp = generatedOtp;
    otpRecord.expiresAt = expiry;
    otpRecord.isVerified = false;
    otpRecord.attempts = 0;
    otpRecord.lastSentAt = new Date();
    await otpRecord.save();

    const { sendEmail } = await import("@/services/email");
    await sendEmail({
        to: email,
        subject: "ConceptNichod - Verify Your New Email Address",
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 8px;">
                <h2 style="color: #6366f1;">ConceptNichod Email Verification</h2>
                <p>Hello <strong>${currentUser.fullName || currentUser.username}</strong>,</p>
                <p>You requested to change your account email to <strong>${email}</strong>. Use the verification code below to confirm this change:</p>
                <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; font-size: 26px; font-weight: bold; letter-spacing: 5px; text-align: center; margin: 20px 0; color: #18181b;">
                    ${generatedOtp}
                </div>
                <p style="color: #71717a; font-size: 13px;">This verification code will expire in 5 minutes. If you did not request this change, please ignore this email.</p>
            </div>
        `
    });

    return { success: true, message: "Verification code sent to your new email." };
}

export async function confirmEmailChangeAction(newEmail: string, otp: string) {
    await dbConnect();
    const rawSession = cookies().get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) throw new Error("Not authenticated");

    const email = newEmail.toLowerCase().trim();
    const sanitizedOtp = (otp || "").trim();
    if (!email || !sanitizedOtp) throw new Error("Missing email or verification code.");

    const otpRecord = await OtpVerification.findOne({ email });
    if (!otpRecord) throw new Error("No verification code was requested for this email.");

    if (otpRecord.otp !== sanitizedOtp) {
        otpRecord.attempts = (otpRecord.attempts || 0) + 1;
        await otpRecord.save();
        if (otpRecord.attempts > 5) {
            await OtpVerification.deleteOne({ email });
            throw new Error("Too many incorrect attempts. This code has been invalidated for security.");
        }
        const remaining = 5 - otpRecord.attempts;
        throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    }

    if (new Date() > otpRecord.expiresAt) {
        await OtpVerification.deleteOne({ email });
        throw new Error("Verification code has expired. Please request a new code.");
    }

    const existing = await User.findOne({ email });
    if (existing && existing.uuid !== sessionUuid) {
        throw new Error("This email is already in use by another account.");
    }

    const updatedUser = await User.findOneAndUpdate(
        { uuid: sessionUuid },
        { email },
        { new: true }
    );
    if (!updatedUser) throw new Error("Email update failed");

    await OtpVerification.deleteOne({ email });

    const { password, ...userWithoutPassword } = updatedUser.toObject();
    return { success: true, user: userWithoutPassword };
}

export async function resetPasswordAction(formData: FormData) {
    await dbConnect();
    const email = (formData.get("email") as string).toLowerCase().trim();
    const newPassword = formData.get("newPassword") as string;

    if (!email || !newPassword) throw new Error("Missing required fields");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new Error(passwordError);

    const ip = getClientIp();
    const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip });
    if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

    const isEmailBanned = await Blacklist.findOne({ type: "email", value: email });
    if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

    const otpRecord = await OtpVerification.findOne({ email });
    if (!otpRecord || !otpRecord.isVerified || new Date() > otpRecord.expiresAt) {
        throw new Error("Verification code has expired or is invalid. Please request a new code.");
    }

    const user = await User.findOne({ email });
    if (!user) throw new Error("User not found");

    const encryptedPassword = await hashPassword(newPassword);
    user.password = encryptedPassword;
    await user.save();

    await OtpVerification.deleteOne({ email });

    return { success: true };
}

export async function changePasswordAction(formData: FormData) {
    await dbConnect();
    const rawSession = cookies().get("user_session")?.value;
    const sessionId = verifySessionCookie(rawSession);
    if (!sessionId) throw new Error("Not authenticated");

    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;

    if (!currentPassword || !newPassword) throw new Error("Missing required fields");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new Error(passwordError);

    const user = await User.findOne({ uuid: sessionId });
    if (!user) throw new Error("User not found");

    try {
        const isValid = await comparePassword(currentPassword, user.password);
        if (!isValid) throw new Error("Incorrect current password");
    } catch (e) {
        throw new Error("Incorrect current password");
    }

    const hashedNewPassword = await hashPassword(newPassword);
    user.password = hashedNewPassword;
    await user.save();

    return { success: true };
}

export async function requestDeleteAccountOtpAction(currentPassword: string) {
    await dbConnect();
    const rawSession = cookies().get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) throw new Error("Authentication required.");

    const user = await User.findOne({ uuid: sessionUuid });
    if (!user) throw new Error("User account not found.");

    if (user.username.toLowerCase() === "mythicalhrg" || user.email.toLowerCase() === "mythicalhrg@gmail.com") {
        throw new Error("The root platform administrator account @mythicalhrg cannot be deleted.");
    }

    if (!currentPassword) {
        throw new Error("Please enter your current password to authorize this deletion request.");
    }

    const isValid = await comparePassword(currentPassword, user.password);
    if (!isValid) {
        throw new Error("Incorrect current password.");
    }

    const email = user.email.toLowerCase().trim();

    // Check resend cooldown (60 seconds)
    const existingOtp = await OtpVerification.findOne({ email });
    if (existingOtp && existingOtp.lastSentAt) {
        const elapsed = Date.now() - new Date(existingOtp.lastSentAt).getTime();
        if (elapsed < 60000) {
            const waitSecs = Math.ceil((60000 - elapsed) / 1000);
            throw new Error(`Please wait ${waitSecs} seconds before requesting another deletion code.`);
        }
    }

    // Generate cryptographically secure 6-digit OTP
    const generatedOtp = crypto.randomInt(100000, 1000000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    let otpRecord = existingOtp || new OtpVerification({ email });
    otpRecord.otp = generatedOtp;
    otpRecord.expiresAt = expiry;
    otpRecord.isVerified = false;
    otpRecord.attempts = 0;
    otpRecord.lastSentAt = new Date();
    await otpRecord.save();

    const { sendEmail } = await import("@/services/email");
    await sendEmail({
        to: email,
        subject: "ConceptNichod - Account Deletion Verification Code",
        html: `
            <div style="font-family: sans-serif; padding: 24px; color: #18181b; max-width: 520px; margin: 0 auto; border: 2px solid #ef4444; border-radius: 12px; background: #ffffff;">
                <h2 style="color: #dc2626; margin: 0 0 10px;">⚠️ Account Deletion Authorization</h2>
                <p style="font-size: 14px; line-height: 1.5; color: #374151;">
                    Hello <strong>@${user.username}</strong>,
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

    return {
        success: true,
        message: `Deletion authorization code sent to ${email}.`,
    };
}

export async function deleteAccountAction(formData: FormData) {
    await dbConnect();
    const rawSession = cookies().get("user_session")?.value;
    const sessionId = verifySessionCookie(rawSession);
    if (!sessionId) throw new Error("Not authenticated");

    const email = (formData.get("email") as string || "").toLowerCase().trim();
    const otp = (formData.get("otp") as string || "").trim();
    const password = (formData.get("password") as string || "").trim();
    const confirmation = (formData.get("confirmation") as string || "").trim();

    if (!otp) throw new Error("6-digit verification code is required.");

    const user = await User.findOne({ uuid: sessionId });
    if (!user) throw new Error("User account not found.");
    if (email && user.email.toLowerCase() !== email) {
        throw new Error("User email mismatch.");
    }
    if (user.username.toLowerCase() === "mythicalhrg" || user.email.toLowerCase() === "mythicalhrg@gmail.com") {
        throw new Error("The root admin account cannot be deleted.");
    }

    // If confirmation phrase is provided, enforce DELETE or username
    if (confirmation && confirmation.toUpperCase() !== "DELETE" && confirmation !== user.username) {
        throw new Error('Please type "DELETE" to confirm permanent account deletion.');
    }

    // If password is provided, verify it
    if (password) {
        const isPasswordValid = await comparePassword(password, user.password);
        if (!isPasswordValid) throw new Error("Incorrect current password.");
    }

    const userEmail = user.email.toLowerCase().trim();
    const otpRecord = await OtpVerification.findOne({ email: userEmail });
    if (!otpRecord) throw new Error("No deletion code requested for this email.");

    // Check if OTP matches directly or was pre-verified
    if (!otpRecord.isVerified && otpRecord.otp !== otp) {
        otpRecord.attempts = (otpRecord.attempts || 0) + 1;
        await otpRecord.save();
        if (otpRecord.attempts >= 5) {
            await OtpVerification.deleteOne({ email: userEmail });
            throw new Error("Too many incorrect attempts. This deletion code has been invalidated.");
        }
        const remaining = 5 - otpRecord.attempts;
        throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    }

    if (new Date() > otpRecord.expiresAt) {
        await OtpVerification.deleteOne({ email: userEmail });
        throw new Error("Verification code has expired. Please request a new code.");
    }

    // Cascading DB cleanup
    const Topic = (await import("@/models/Topic")).default;
    const StudyGroup = (await import("@/models/StudyGroup")).default;
    const GroupMessage = (await import("@/models/GroupMessage")).default;
    const DirectMessage = (await import("@/models/DirectMessage")).default;

    await Promise.allSettled([
        User.deleteOne({ uuid: sessionId }),
        Topic.deleteMany({ userId: sessionId }),
        StudyGroup.deleteMany({ ownerId: sessionId }),
        StudyGroup.updateMany({ memberIds: sessionId }, { $pull: { memberIds: sessionId } }),
        GroupMessage.deleteMany({ senderId: sessionId }),
        DirectMessage.deleteMany({ participantIds: sessionId }),
        OtpVerification.deleteOne({ email: userEmail }),
    ]);

    cookies().delete("user_session");

    return { success: true };
}
