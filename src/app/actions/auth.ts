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

function validatePassword(password: string) {
    if (password.length < 8) return "Password must be at least 8 characters long.";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
    if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special symbol.";
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

    if (!email || !username || !password || !fullName || !gender || !dob || !classLevel || !city) {
        throw new Error("Missing required fields");
    }
    if (!validateEmailDomain(email)) throw new Error("Only @gmail.com, @outlook.com, and @outlook.in emails are allowed.");

    const passwordError = validatePassword(password);
    if (passwordError) throw new Error(passwordError);

    const ip = headers().get("x-forwarded-for") || "unknown";
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
        examFocus,
        city,
        futureCollege,
        snapchat,
        instagram,
        lastKnownIp: ip
    });

    // Delete OTP record after successful registration to prevent reuse (Account Takeover)
    await OtpVerification.deleteOne({ email });

    cookies().set("user_session", newUser.uuid, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7 });
    return { success: true, user: { 
        uuid, username, email, fullName, gender, dob, classLevel, examFocus, city, futureCollege, snapchat, instagram 
    } };
}

export async function loginAction(formData: FormData) {
    await dbConnect();
    const email = (formData.get("email") as string).toLowerCase().trim();
    const password = formData.get("password") as string;

    if (!email || !password) throw new Error("Missing email or password");

    const ip = headers().get("x-forwarded-for") || "unknown";
    const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip });
    if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

    const isEmailBanned = await Blacklist.findOne({ type: "email", value: email });
    if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

    const user = await User.findOne({ email });
    if (!user) throw new Error("Invalid credentials");

    const isUsernameBanned = await Blacklist.findOne({ type: "username", value: user.username });
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

    const email = formData.get("email") as string;
    const username = formData.get("username") as string;
    const bio = formData.get("bio") as string;
    const classLevel = formData.get("classLevel") as string;
    const examFocus = formData.get("examFocus") as string;
    const city = formData.get("city") as string;
    const futureCollege = formData.get("futureCollege") as string;
    const snapchat = formData.get("snapchat") as string;
    const instagram = formData.get("instagram") as string;

    if (email && !validateEmailDomain(email)) throw new Error("Only @gmail.com, @outlook.com, and @outlook.in emails are allowed.");

    const updateData: any = {};
    if (email) updateData.email = email.toLowerCase().trim();
    if (username) updateData.username = username.toLowerCase().trim();
    if (bio !== null) updateData.bio = bio;
    if (classLevel !== null) updateData.classLevel = classLevel;
    if (examFocus !== null) updateData.examFocus = examFocus;
    if (city !== null) updateData.city = city;
    if (futureCollege !== null) updateData.futureCollege = futureCollege;
    if (snapchat !== null) updateData.snapchat = snapchat;
    if (instagram !== null) updateData.instagram = instagram;

    try {
        const updatedUser = await User.findOneAndUpdate({ uuid: sessionUuid }, updateData, { new: true });
        const { password, ...userWithoutPassword } = updatedUser.toObject();
        return { success: true, user: userWithoutPassword };
    } catch (e) {
        throw new Error("Username or email might already be taken");
    }
}

export async function resetPasswordAction(formData: FormData) {
    await dbConnect();
    const email = (formData.get("email") as string).toLowerCase().trim();
    const newPassword = formData.get("newPassword") as string;

    if (!email || !newPassword) throw new Error("Missing required fields");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new Error(passwordError);

    const ip = headers().get("x-forwarded-for") || "unknown";
    const isIpBanned = await Blacklist.findOne({ type: "ip", value: ip });
    if (isIpBanned) throw new Error("Access denied: Your IP address is banned.");

    const isEmailBanned = await Blacklist.findOne({ type: "email", value: email });
    if (isEmailBanned) throw new Error("Access denied: This email address is banned.");

    // Check OTP verification

    const otpRecord = await OtpVerification.findOne({ email });
    if (!otpRecord || !otpRecord.isVerified) {
        throw new Error("Email address has not been verified via OTP.");
    }

    const user = await User.findOne({ email });
    if (!user) throw new Error("User not found");

    const encryptedPassword = await hashPassword(newPassword);
    user.password = encryptedPassword;
    await user.save();

    // Clean up OTP record so they can't reuse it
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
    const otp = formData.get("otp") as string;

    if (!email || !otp) throw new Error("Missing email or OTP");

    const user = await User.findOne({ uuid: sessionId });
    if (!user || user.email !== email) throw new Error("User mismatch");

    // Check OTP verification (Wait, we can verify directly using the OTP logic. Wait, no. The OTP verification API already verified it, OR we verify it here).
    // Let's verify OTP directly from OtpVerification collection
    const otpRecord = await OtpVerification.findOne({ email });
    if (!otpRecord) throw new Error("No OTP requested for this email");
    
    // We can just rely on the existing OTP flow where /api/auth/otp sets `isVerified = true`.
    // BUT if we want to consume it here, we should check it. 
    // Wait, the client will verify the OTP with /api/auth/otp first, which sets `isVerified = true`. Then it submits this form.
    if (!otpRecord.isVerified) {
        throw new Error("OTP not verified");
    }

    // Delete user and topics
    await User.deleteOne({ uuid: sessionId });
    const Topic = (await import("@/models/Topic")).default;
    await Topic.deleteMany({ userId: sessionId });
    await OtpVerification.deleteOne({ email });

    cookies().delete("user_session");

    return { success: true };
}
