export function normalizeEmail(email: string): string {
    if (!email) return "";
    const trimmed = email.toLowerCase().trim();
    const atIndex = trimmed.lastIndexOf("@");
    if (atIndex === -1) return trimmed;

    let localPart = trimmed.slice(0, atIndex);
    const domainPart = trimmed.slice(atIndex + 1);

    // Strip plus-aliasing / subaddressing (+tag)
    const plusIndex = localPart.indexOf("+");
    if (plusIndex !== -1) {
        localPart = localPart.slice(0, plusIndex);
    }

    // Gmail ignores dots in the local part: "a.b.c@gmail.com" == "abc@gmail.com"
    if (domainPart === "gmail.com" || domainPart === "googlemail.com") {
        localPart = localPart.replace(/\./g, "");
    }

    return `${localPart}@${domainPart}`;
}

export function validateEmailDomain(email: string): boolean {
    if (!email) return false;
    const lower = email.toLowerCase().trim();
    return lower.endsWith("@gmail.com") || lower.endsWith("@outlook.com") || lower.endsWith("@outlook.in");
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email) return { valid: false, error: "Email address is required." };
    const trimmed = email.toLowerCase().trim();
    if (!validateEmailDomain(trimmed)) {
        return {
            valid: false,
            error: "Registration is restricted to @gmail.com, @outlook.com, and @outlook.in domains."
        };
    }
    // Strictly disallow plus-aliasing / subaddressing
    const atIndex = trimmed.lastIndexOf("@");
    const localPart = atIndex !== -1 ? trimmed.slice(0, atIndex) : trimmed;
    if (localPart.includes("+")) {
        return {
            valid: false,
            error: "Email aliases and subaddressing (+tag) are not permitted. Please use your primary email address."
        };
    }
    return { valid: true };
}
