import assert from "node:assert";
import test from "node:test";

// Simulating the mail options compiler from src/app/actions/email-broadcast.ts
function prepareMailOptions({
  recipientType,
  allUserEmails,
  customTo,
  ccStr,
  bccStr,
  senderUser,
  subject,
  body,
}) {
  let toRecipients = [];
  if (recipientType === "all") {
    toRecipients = allUserEmails.map((e) => e.toLowerCase().trim()).filter(Boolean);
  } else {
    toRecipients = (customTo || "")
      .split(",")
      .map((e) => e.toLowerCase().trim())
      .filter((e) => e.length > 0 && e.includes("@"));
  }

  if (toRecipients.length === 0) {
    throw new Error("No valid recipient email addresses found.");
  }

  const ccRecipients = (ccStr || "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter((e) => e.length > 0 && e.includes("@"));

  const bccRecipients = (bccStr || "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter((e) => e.length > 0 && e.includes("@"));

  const mailOptions = {
    from: `"ConceptNichod" <${senderUser}>`,
    subject,
    text: body,
  };

  if (recipientType === "all") {
    mailOptions.to = senderUser;
    mailOptions.bcc = Array.from(new Set([...toRecipients, ...bccRecipients]));
  } else {
    mailOptions.to = toRecipients;
    if (ccRecipients.length > 0) mailOptions.cc = ccRecipients;
    if (bccRecipients.length > 0) mailOptions.bcc = bccRecipients;
  }

  return mailOptions;
}

test("Tareeka 4: Mass broadcast to 'all' routes recipients to BCC and protects user privacy", () => {
  const allUsers = [
    "student1@gmail.com",
    "student2@outlook.com",
    "anurag@gmail.com",
    "rohit@gmail.com"
  ];
  const senderUser = "mythicalhrg@gmail.com";

  const options = prepareMailOptions({
    recipientType: "all",
    allUserEmails: allUsers,
    senderUser,
    subject: "Exam Revision Live Session",
    body: "Join us tomorrow at 5 PM for live revision.",
  });

  // Critical privacy check: to MUST NOT be the array of all users
  assert.strictEqual(options.to, senderUser, "The 'to' field must be the sender, not the user list!");
  assert.deepStrictEqual(
    options.bcc.sort(),
    allUsers.sort(),
    "All users must be protected inside the 'bcc' field!"
  );
});

test("Tareeka 4: Custom recipient broadcast accurately populates TO, CC, and BCC", () => {
  const options = prepareMailOptions({
    recipientType: "custom",
    allUserEmails: [],
    customTo: "student@gmail.com, friend@outlook.com",
    ccStr: "mentor@gmail.com",
    bccStr: "audit@gmail.com",
    senderUser: "mythicalhrg@gmail.com",
    subject: "Direct Notice",
    body: "Please review your test results.",
  });

  assert.deepStrictEqual(options.to, ["student@gmail.com", "friend@outlook.com"]);
  assert.deepStrictEqual(options.cc, ["mentor@gmail.com"]);
  assert.deepStrictEqual(options.bcc, ["audit@gmail.com"]);
});

test("Tareeka 4: Throws descriptive error when no valid recipients exist", () => {
  assert.throws(
    () => {
      prepareMailOptions({
        recipientType: "custom",
        allUserEmails: [],
        customTo: "invalid-email, not-an-email",
        senderUser: "mythicalhrg@gmail.com",
        subject: "Test",
        body: "Hello",
      });
    },
    /No valid recipient email addresses found/
  );
});
