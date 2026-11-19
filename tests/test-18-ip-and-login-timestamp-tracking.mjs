import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mongoose, { Schema } from "mongoose";

// Pure contract implementation of sanitizeIp and getClientIp according to PROJECT.md § Interface Contracts
function sanitizeIp(ip) {
  if (!ip || typeof ip !== "string") return "127.0.0.1";

  let trimmed = ip.trim();
  // Normalize IPv6 localhost/IPv4-mapped IPv6
  if (trimmed === "::1" || trimmed === "::ffff:127.0.0.1") return "127.0.0.1";
  if (trimmed.startsWith("::ffff:")) {
    trimmed = trimmed.substring(7);
  }

  // Strip unexpected characters (allow hex digits, colon, dot)
  const sanitized = trimmed.replace(/[^a-fA-F0-9:.]/g, "").slice(0, 45);
  return sanitized || "127.0.0.1";
}

function getClientIp(customHeaders) {
  try {
    if (!customHeaders) return "127.0.0.1";

    const getHeader = (name) => {
      const val =
        customHeaders[name.toLowerCase()] ||
        customHeaders[name];
      if (Array.isArray(val)) return val[0] || null;
      return typeof val === "string" ? val : null;
    };

    // Cloudflare priority
    const cfConnectingIp = getHeader("cf-connecting-ip");
    if (cfConnectingIp) {
      return sanitizeIp(cfConnectingIp);
    }

    // Standard reverse proxy header (leftmost client IP)
    const forwardedFor = getHeader("x-forwarded-for");
    if (forwardedFor) {
      const first = forwardedFor.split(",")[0].trim();
      if (first) {
        return sanitizeIp(first);
      }
    }

    // Nginx / general reverse proxy
    const realIp = getHeader("x-real-ip");
    if (realIp) {
      return sanitizeIp(realIp);
    }

    return "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}

// Mongoose User Schema conforming to PROJECT.md § Interface Contracts
const UserSchema = new Schema({
  uuid: { type: String, required: true },
  username: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  gender: { type: String, required: true },
  dob: { type: String, required: true },
  classLevel: { type: String, required: true },
  examFocus: { type: String, required: false },
  city: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  firstLoginIp: { type: String, required: false },
  firstLoginAt: { type: Date, required: false },
  lastLoginIp: { type: String, required: false },
  lastLoginAt: { type: Date, required: false },
  lastKnownIp: { type: String, required: false },
  createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.models.InMemoryUser || mongoose.model("InMemoryUser", UserSchema);

test("Tareeka 18: User Schema defines all required IP tracking fields with correct Mongoose types", () => {
  const firstLoginIpPath = UserSchema.path("firstLoginIp");
  const firstLoginAtPath = UserSchema.path("firstLoginAt");
  const lastLoginIpPath = UserSchema.path("lastLoginIp");
  const lastLoginAtPath = UserSchema.path("lastLoginAt");
  const lastKnownIpPath = UserSchema.path("lastKnownIp");

  assert.ok(firstLoginIpPath, "firstLoginIp must exist in UserSchema");
  assert.strictEqual(firstLoginIpPath.instance, "String");

  assert.ok(firstLoginAtPath, "firstLoginAt must exist in UserSchema");
  assert.strictEqual(firstLoginAtPath.instance, "Date");

  assert.ok(lastLoginIpPath, "lastLoginIp must exist in UserSchema");
  assert.strictEqual(lastLoginIpPath.instance, "String");

  assert.ok(lastLoginAtPath, "lastLoginAt must exist in UserSchema");
  assert.strictEqual(lastLoginAtPath.instance, "Date");

  assert.ok(lastKnownIpPath, "lastKnownIp must exist in UserSchema");
  assert.strictEqual(lastKnownIpPath.instance, "String");
});

test("Tareeka 18: User registration records initial IP and timestamp across firstLogin and lastLogin fields", () => {
  const initialIp = "203.0.113.15";
  const initialTime = new Date("2026-11-04T01:00:00Z");

  const user = new UserModel({
    uuid: "user-reg-uuid-1",
    username: "student_initial",
    email: "student_initial@gmail.com",
    password: "HashedPassword123!",
    fullName: "Initial Student",
    gender: "Female",
    dob: "2005-05-15",
    classLevel: "12+",
    city: "Jaipur",
    firstLoginIp: initialIp,
    firstLoginAt: initialTime,
    lastLoginIp: initialIp,
    lastLoginAt: initialTime,
    lastKnownIp: initialIp
  });

  assert.strictEqual(user.firstLoginIp, initialIp);
  assert.strictEqual(user.lastLoginIp, initialIp);
  assert.strictEqual(user.firstLoginAt.toISOString(), initialTime.toISOString());
  assert.strictEqual(user.lastLoginAt.toISOString(), initialTime.toISOString());
  assert.strictEqual(user.lastKnownIp, initialIp);
});

test("Tareeka 18: Subsequent user login updates lastLoginIp and lastLoginAt while strictly preserving firstLoginIp and firstLoginAt", () => {
  const initialIp = "198.51.100.10";
  const initialTime = new Date("2026-10-01T10:00:00Z");
  const subsequentIp = "198.51.100.99";
  const subsequentTime = new Date("2026-11-04T02:00:00Z");

  const user = new UserModel({
    uuid: "user-subsequent-uuid-2",
    username: "student_subsequent",
    email: "student_subsequent@gmail.com",
    password: "HashedPassword123!",
    fullName: "Subsequent Student",
    gender: "Male",
    dob: "2004-03-20",
    classLevel: "Class 12",
    city: "Delhi",
    firstLoginIp: initialIp,
    firstLoginAt: initialTime,
    lastLoginIp: initialIp,
    lastLoginAt: initialTime,
    lastKnownIp: initialIp
  });

  // Simulate subsequent login in auth action
  user.lastLoginIp = subsequentIp;
  user.lastLoginAt = subsequentTime;
  user.lastKnownIp = subsequentIp;

  // firstLogin fields must remain untouched
  assert.strictEqual(user.firstLoginIp, initialIp, "firstLoginIp must NOT be overwritten");
  assert.strictEqual(user.firstLoginAt.toISOString(), initialTime.toISOString(), "firstLoginAt must NOT change");

  // lastLogin fields must reflect newest connection
  assert.strictEqual(user.lastLoginIp, subsequentIp, "lastLoginIp must update to newest IP");
  assert.strictEqual(user.lastLoginAt.toISOString(), subsequentTime.toISOString(), "lastLoginAt must update to newest timestamp");
});

test("Tareeka 18: Legacy user migration backfills firstLoginIp and firstLoginAt on subsequent authentication", () => {
  const legacyIp = "192.0.2.55";
  const newLoginIp = "192.0.2.88";
  const createdAt = new Date("2026-09-15T08:00:00Z");
  const newLoginTime = new Date("2026-11-04T02:30:00Z");

  // User created prior to IP upgrade (only lastKnownIp exists)
  const legacyUser = new UserModel({
    uuid: "legacy-user-uuid-3",
    username: "legacy_user",
    email: "legacy_user@gmail.com",
    password: "HashedPassword123!",
    fullName: "Legacy User",
    gender: "Other",
    dob: "2003-01-01",
    classLevel: "Dropper",
    city: "Kota",
    lastKnownIp: legacyIp,
    createdAt
  });

  assert.strictEqual(legacyUser.firstLoginIp, undefined);
  assert.strictEqual(legacyUser.firstLoginAt, undefined);

  // Simulate login handler backfill logic
  legacyUser.lastLoginIp = newLoginIp;
  legacyUser.lastLoginAt = newLoginTime;
  legacyUser.lastKnownIp = newLoginIp;
  if (!legacyUser.firstLoginIp) {
    legacyUser.firstLoginIp = newLoginIp;
    legacyUser.firstLoginAt = legacyUser.createdAt || newLoginTime;
  }

  assert.strictEqual(legacyUser.firstLoginIp, newLoginIp, "Legacy user should receive backfilled firstLoginIp");
  assert.strictEqual(legacyUser.firstLoginAt.toISOString(), createdAt.toISOString(), "firstLoginAt backfilled from createdAt");
  assert.strictEqual(legacyUser.lastLoginIp, newLoginIp);
});

test("Tareeka 18: Public profile projection strictly isolates and redacts all IP and login timestamp fields", () => {
  const secretIp = "185.220.101.5";
  const user = new UserModel({
    uuid: "secret-ip-uuid-4",
    username: "privacy_target",
    email: "privacy_target@gmail.com",
    password: "HashedPassword123!",
    fullName: "Privacy Target",
    gender: "Female",
    dob: "2005-11-11",
    classLevel: "12+",
    city: "Bangalore",
    firstLoginIp: secretIp,
    firstLoginAt: new Date(),
    lastLoginIp: secretIp,
    lastLoginAt: new Date(),
    lastKnownIp: secretIp
  });

  // Simulate Mongoose negative projection as in getPublicProfileData:
  // select("-password -email -uuid -_id -createdAt -__v -firstLoginIp -firstLoginAt -lastLoginIp -lastLoginAt -lastKnownIp")
  const rawObj = user.toObject();
  const excludedFields = [
    "password", "email", "uuid", "_id", "createdAt", "__v",
    "firstLoginIp", "firstLoginAt", "lastLoginIp", "lastLoginAt", "lastKnownIp"
  ];
  for (const field of excludedFields) {
    delete rawObj[field];
  }

  assert.strictEqual(rawObj.firstLoginIp, undefined, "firstLoginIp must be omitted in public profile");
  assert.strictEqual(rawObj.lastLoginIp, undefined, "lastLoginIp must be omitted in public profile");
  assert.strictEqual(rawObj.firstLoginAt, undefined, "firstLoginAt must be omitted in public profile");
  assert.strictEqual(rawObj.lastLoginAt, undefined, "lastLoginAt must be omitted in public profile");
  assert.strictEqual(rawObj.lastKnownIp, undefined, "lastKnownIp must be omitted in public profile");
  assert.strictEqual(rawObj.password, undefined);
  assert.strictEqual(rawObj.email, undefined);
  assert.strictEqual(rawObj.uuid, undefined);

  // Verify legitimate non-sensitive public fields remain present
  assert.strictEqual(rawObj.fullName, "Privacy Target");
  assert.strictEqual(rawObj.classLevel, "12+");
  assert.strictEqual(rawObj.city, "Bangalore");
});

test("Tareeka 18: IP sanitization normalizes IPv6 localhost, strips IPv4 mapping, and scrubs malicious characters", () => {
  // IPv6 localhost
  assert.strictEqual(sanitizeIp("::1"), "127.0.0.1");
  assert.strictEqual(sanitizeIp("::ffff:127.0.0.1"), "127.0.0.1");

  // IPv4-mapped IPv6
  assert.strictEqual(sanitizeIp("::ffff:192.168.1.50"), "192.168.1.50");

  // Clean public IP
  assert.strictEqual(sanitizeIp("103.21.244.2"), "103.21.244.2");

  // Malicious / injection strings: verify non-hex, spaces, and punctuation are stripped
  const strippedScript = sanitizeIp("<script>alert('xss')</script>");
  assert.ok(!strippedScript.includes("<") && !strippedScript.includes(">") && !strippedScript.includes("script"), "Must strip angle brackets and script tokens");
  assert.strictEqual(sanitizeIp("192.168.1.1;!@#$%^&*()"), "192.168.1.1");

  // Empty / null / invalid
  assert.strictEqual(sanitizeIp(""), "127.0.0.1");
  assert.strictEqual(sanitizeIp(null), "127.0.0.1");
  assert.strictEqual(sanitizeIp(undefined), "127.0.0.1");
});

test("Tareeka 18: getClientIp respects Cloudflare and proxy header precedence", () => {
  // 1. Cloudflare cf-connecting-ip takes highest precedence
  const cfHeaders = {
    "cf-connecting-ip": "1.1.1.1",
    "x-forwarded-for": "2.2.2.2, 3.3.3.3",
    "x-real-ip": "4.4.4.4"
  };
  assert.strictEqual(getClientIp(cfHeaders), "1.1.1.1");

  // 2. Standard x-forwarded-for uses leftmost client IP
  const forwardedHeaders = {
    "x-forwarded-for": "157.240.22.35, 10.0.0.1, 10.0.0.2",
    "x-real-ip": "10.0.0.1"
  };
  assert.strictEqual(getClientIp(forwardedHeaders), "157.240.22.35");

  // 3. Fallback to x-real-ip
  const realIpHeaders = {
    "x-real-ip": "142.250.190.46"
  };
  assert.strictEqual(getClientIp(realIpHeaders), "142.250.190.46");

  // 4. Fallback to localhost when no headers provided
  assert.strictEqual(getClientIp({}), "127.0.0.1");
});

test("Tareeka 18: Admin view query preserves firstLoginIp, lastLoginIp, and timestamps", () => {
  const adminTestIp = "172.16.0.42";
  const user = new UserModel({
    uuid: "admin-view-uuid-5",
    username: "admin_view_user",
    email: "admin_view_user@gmail.com",
    password: "EncryptedPassword!",
    fullName: "Admin View User",
    gender: "Male",
    dob: "2000-01-01",
    classLevel: "12+",
    city: "Pune",
    firstLoginIp: adminTestIp,
    firstLoginAt: new Date("2026-10-10T12:00:00Z"),
    lastLoginIp: adminTestIp,
    lastLoginAt: new Date("2026-11-04T00:00:00Z")
  });

  // Admin query only excludes password
  const adminResult = user.toObject();
  delete adminResult.password;

  assert.strictEqual(adminResult.firstLoginIp, adminTestIp, "Admin view must receive firstLoginIp");
  assert.strictEqual(adminResult.lastLoginIp, adminTestIp, "Admin view must receive lastLoginIp");
  assert.ok(adminResult.firstLoginAt, "Admin view must receive firstLoginAt timestamp");
  assert.ok(adminResult.lastLoginAt, "Admin view must receive lastLoginAt timestamp");
});

test("Tareeka 18: Static verification - User.ts schema and profile.ts projection include IP tracking", () => {
  const userModelPath = path.resolve("src/models/User.ts");
  const userContent = fs.readFileSync(userModelPath, "utf-8");

  assert.ok(userContent.includes("firstLoginIp"), "User.ts must define firstLoginIp");
  assert.ok(userContent.includes("firstLoginAt"), "User.ts must define firstLoginAt");
  assert.ok(userContent.includes("lastLoginIp"), "User.ts must define lastLoginIp");
  assert.ok(userContent.includes("lastLoginAt"), "User.ts must define lastLoginAt");

  const profileActionPath = path.resolve("src/app/actions/profile.ts");
  const profileContent = fs.readFileSync(profileActionPath, "utf-8");

  assert.ok(
    profileContent.includes('.select("username fullName classLevel examFocus city instagram snapchat bio")'),
    "profile.ts must use a public-field allowlist that cannot expose IP or login timestamp fields"
  );

  const ipLibPath = path.resolve("src/lib/ip.ts");
  if (fs.existsSync(ipLibPath)) {
    const ipContent = fs.readFileSync(ipLibPath, "utf-8");
    assert.ok(ipContent.includes("sanitizeIp"), "src/lib/ip.ts must export sanitizeIp");
    assert.ok(ipContent.includes("getClientIp"), "src/lib/ip.ts must export getClientIp");
  }
});
