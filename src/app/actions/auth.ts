"use server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import OtpVerification from "@/models/OtpVerification";
import Blacklist from "@/models/Blacklist";
import { hashPassword, comparePassword } from "@/lib/encryption";
import crypto from "crypto";
import { headers } from "next/headers";

const SECRET_KEY = process.env.ENCRYPTION_SECRET_KEY || "super_secret_default_key_for_encodec_12345!";

function validateEmailDomain(email: string) {
    return email.endsWith("@gmail.com") || email.endsWith("@outlook.com") || email.endsWith("@outlook.in");
}

function getIpAddress() {
    const forwardedFor = headers().get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return headers().get("x-real-ip") || "127.0.0.1";
}

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
        if (!validateEmailDomain(email)) throw new Error("Only @gmail.com, @outlook.com, and @outlook.in emails are allowed.");

        const usernameError = await validateUsername(username);
        if (usernameError) throw new Error(usernameError);

        const passwordError = validatePassword(password);
        if (passwordError) throw new Error(passwordError);

        const ip = getIpAddress();
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

        const existingUserByEmail = await User.findOne({ email: new RegExp(`^${safeEmail}$`, 'i') });
        if (existingUserByEmail) throw new Error("Email is already registered.");
        
        const existingUserByUsername = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') });
        if (existingUserByUsername) throw new Error("A user with this username already exists.");

        const encryptedPassword = await hashPassword(password);
        const uuid = crypto.randomUUID();

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
            lastKnownIp: ip
        });

        // Delete OTP record after successful registration to prevent reuse (Account Takeover)
        await OtpVerification.deleteOne({ email });

        cookies().set("user_session", uuid, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7 });
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

        const ip = getIpAddress();
        const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip });
        if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

        const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const safeInput = escapeRegex(rawInput);

        // Find user by either email or username (case-insensitive)
        const user = await User.findOne({
            $or: [
                { email: new RegExp(`^${safeInput}$`, 'i') },
                { username: new RegExp(`^${safeInput}$`, 'i') }
            ]
        });

        if (!user) throw new Error("Invalid credentials");

        const isEmailBanned = await Blacklist.findOne({ type: "email", value: user.email.toLowerCase() });
        if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

        const isUsernameBanned = await Blacklist.findOne({ type: "username", value: user.username.toLowerCase() });
        if (isUsernameBanned) throw new Error("Access denied: This username is banned.");

        try {
            const isValid = await comparePassword(password, user.password);
            if (!isValid) throw new Error("Invalid credentials");

            // Update last known IP
            user.lastKnownIp = ip;
            await user.save();
        } catch (e) {
            throw new Error("Invalid credentials");
        }

        cookies().set("user_session", user.uuid, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7 });
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
    await dbConnect();
    const sessionUuid = cookies().get("user_session")?.value;
    if (!sessionUuid) return { user: null };

    const user = await User.findOne({ uuid: sessionUuid });
    if (!user) return { user: null };

    return { user: { 
        uuid: user.uuid, username: user.username, email: user.email, bio: user.bio,
        fullName: user.fullName, gender: user.gender, dob: user.dob, classLevel: user.classLevel,
        examFocus: user.examFocus, city: user.city, futureCollege: user.futureCollege,
        snapchat: user.snapchat, instagram: user.instagram 
    } };
}

export async function updateProfileAction(formData: FormData) {
    await dbConnect();
    const sessionUuid = cookies().get("user_session")?.value;
    if (!sessionUuid) throw new Error("Not authenticated");

    const username = formData.get("username") as string;
    const bio = formData.get("bio") as string;
    const classLevel = formData.get("classLevel") as string;
    const examFocus = formData.get("examFocus") as string;
    const city = formData.get("city") as string;
    const futureCollege = formData.get("futureCollege") as string;
    const snapchat = formData.get("snapchat") as string;
    const instagram = formData.get("instagram") as string;

    const updateData: any = {};
    if (username) {
        const usernameError = await validateUsername(username);
        if (usernameError) throw new Error(usernameError);
        updateData.username = username.toLowerCase().trim();
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

export async function requestEmailChangeOtpAction(newEmail: string) {
    await dbConnect();
    const sessionUuid = cookies().get("user_session")?.value;
    if (!sessionUuid) throw new Error("Not authenticated");

    const currentUser = await User.findOne({ uuid: sessionUuid });
    if (!currentUser) throw new Error("User not found");

    const email = newEmail.toLowerCase().trim();
    if (!email) throw new Error("Email address is required.");
    if (email === currentUser.email.toLowerCase()) {
        throw new Error("This is already your current email address.");
    }
    if (!validateEmailDomain(email)) {
        throw new Error("Only @gmail.com, @outlook.com, and @outlook.in emails are allowed.");
    }

    const isEmailBanned = await Blacklist.findOne({ type: "email", value: email });
    if (isEmailBanned) throw new Error("This email address is banned.");

    const existingUser = await User.findOne({ email });
    if (existingUser) throw new Error("This email is already registered to another account.");

    // Generate 6 digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    let otpRecord = await OtpVerification.findOne({ email });
    if (!otpRecord) {
        otpRecord = new OtpVerification({ email });
    }
    otpRecord.otp = generatedOtp;
    otpRecord.expiresAt = expiry;
    otpRecord.isVerified = false;
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
    const sessionUuid = cookies().get("user_session")?.value;
    if (!sessionUuid) throw new Error("Not authenticated");

    const email = newEmail.toLowerCase().trim();
    const sanitizedOtp = (otp || "").trim();
    if (!email || !sanitizedOtp) throw new Error("Missing email or verification code.");

    const otpRecord = await OtpVerification.findOne({ email });
    if (!otpRecord) throw new Error("No verification code was requested for this email.");

    if (otpRecord.otp !== sanitizedOtp) {
        throw new Error("Invalid verification code. Please check and try again.");
    }

    if (new Date() > otpRecord.expiresAt) {
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

    const ip = getIpAddress();
    const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip });
    if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

    const isEmailBanned = await Blacklist.findOne({ type: "email", value: email });
    if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

    const otpRecord = await OtpVerification.findOne({ email });
    if (!otpRecord || !otpRecord.isVerified) {
        throw new Error("Email address has not been verified via OTP.");
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
    const sessionId = cookies().get("user_session")?.value;
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

export async function deleteAccountAction(formData: FormData) {
    await dbConnect();
    const sessionId = cookies().get("user_session")?.value;
    if (!sessionId) throw new Error("Not authenticated");

    const email = (formData.get("email") as string).toLowerCase().trim();
    const otp = (formData.get("otp") as string || "").trim();

    if (!email || !otp) throw new Error("Missing email or OTP");

    const user = await User.findOne({ uuid: sessionId });
    if (!user || user.email !== email) throw new Error("User mismatch");

    const otpRecord = await OtpVerification.findOne({ email });
    if (!otpRecord) throw new Error("No OTP requested for this email");
    
    if (!otpRecord.isVerified) {
        throw new Error("OTP not verified");
    }

    await User.deleteOne({ uuid: sessionId });
    const Topic = (await import("@/models/Topic")).default;
    await Topic.deleteMany({ userId: sessionId });
    await OtpVerification.deleteOne({ email });

    cookies().delete("user_session");

    return { success: true };
}
