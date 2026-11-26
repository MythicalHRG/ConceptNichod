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
import { createSignedSessionCookie } from "@/lib/session";
import { getVerifiedSessionUuid } from "@/lib/session-auth";
import {
  checkDistributedRateLimit,
  resetDistributedRateLimit,
} from "@/lib/distributed-rate-limiter";
import { normalizeEmail, validateEmail } from "@/lib/email-utils";
import {
  ensurePlatformOwnerRole,
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

function getSafeRegistrationError(error: unknown): string {
    const message = error instanceof Error ? error.message : "";
    const safePrefixes = [
        "Invalid registration payload.",
        "Missing required fields",
        "One or more registration fields exceed",
        "Invalid email",
        "Email address",
        "Username must be",
        "Usernames can only",
        "This username",
        "Password must be",
        "Password cannot",
        "Too many registration attempts",
        "Access denied:",
        "Email verification",
        "A user with this username",
        "Email is already registered.",
        "Username availability could not be verified",
    ];
    return safePrefixes.some((prefix) => message.startsWith(prefix))
        ? message.slice(0, 240)
        : "Registration failed. Please check your details and try again.";
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
        console.error("[registerAction] Registration failed (details withheld).", { errorType: e instanceof Error ? e.name : "UnknownError" });
        return { success: false, error: getSafeRegistrationError(e) };
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

        await ensurePlatformOwnerRole(user);

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

        (await cookies()).set("user_session", createSignedSessionCookie(user.uuid, user.sessionVersion ?? 0), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7
        });
        return { success: true, user: serializeSafeUser(user) };
    } catch (e: any) {
        console.error("[loginAction] Login failed (details withheld).", { errorType: e instanceof Error ? e.name : "UnknownError" });
        return { success: false, error: "Login failed. Check your credentials and try again." };
    }
}

export async function logoutAction() {
    try {
        const rawSession = (await cookies()).get("user_session")?.value;
        const sessionUuid = await getVerifiedSessionUuid(rawSession);
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
        const sessionUuid = await getVerifiedSessionUuid(rawSession);
        if (!sessionUuid) return { user: null };

        await dbConnect();
        let fetchedUser = await User.findOne({ uuid: sessionUuid }).select(SAFE_USER_PROJECTION).lean();

        // Resilience: if the connection was still initializing, retry lookup once
        if (!fetchedUser && mongoose.connection.readyState !== 1) {
            await dbConnect();
            fetchedUser = await User.findOne({ uuid: sessionUuid }).select(SAFE_USER_PROJECTION).lean();
        }

        if (!fetchedUser) return { user: null };
        const user = await ensurePlatformOwnerRole(fetchedUser);

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
    const sessionUuid = await getVerifiedSessionUuid(rawSession);
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
    const sessionUuid = await getVerifiedSessionUuid(rawSession);
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
    const sessionUuid = await getVerifiedSessionUuid(rawSession);
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
    const sessionId = await getVerifiedSessionUuid(rawSession);
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
    const nextSessionVersion = (Number.isSafeInteger(user.sessionVersion) ? user.sessionVersion : 0) + 1;
    (await cookies()).set("user_session", createSignedSessionCookie(user.uuid, nextSessionVersion), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    });

    return { success: true };
}

export async function requestDeleteAccountOtpAction(currentPassword: string) {
    await dbConnect();
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionUuid = await getVerifiedSessionUuid(rawSession);
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
    const sessionId = await getVerifiedSessionUuid(rawSession);
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
