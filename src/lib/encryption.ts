import crypto, { scrypt, randomBytes, timingSafeEqual } from 'crypto';

class PRNG {
    state: number;
    constructor(seedStr: string) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < seedStr.length; i++) {
            h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
        }
        this.state = h >>> 0;
        this.next(); this.next();
    }
    next() {
        this.state = (Math.imul(this.state, 1664525) + 1013904223) | 0;
        return (this.state >>> 16) & 0xFF;
    }
}

function matrixTranspose(arr: Uint8Array, width: number): Uint8Array {
    const L = arr.length;
    let rows = Math.ceil(L / width);
    let result = new Uint8Array(L);
    let index = 0;
    for (let c = 0; c < width; c++) {
        for (let r = 0; r < rows; r++) {
            let i = r * width + c;
            if (i < L) result[index++] = arr[i];
        }
    }
    return result;
}

function matrixUntranspose(arr: Uint8Array, width: number): Uint8Array {
    const L = arr.length;
    let rows = Math.ceil(L / width);
    let result = new Uint8Array(L);
    let index = 0;
    for (let c = 0; c < width; c++) {
        for (let r = 0; r < rows; r++) {
            let i = r * width + c;
            if (i < L) result[i] = arr[index++];
        }
    }
    return result;
}

function reverseString(str: string) {
    return str.split('').reverse().join('');
}

function textToHex(text: string) {
    return Array.from(text).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

function hexToText(hex: string) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
    }
    return str;
}

function obfuscateBytes(plainBytes: Uint8Array, password: string, salt: Uint8Array): Uint8Array {
    let prng = new PRNG(password + Array.from(salt).join('-'));
    let result = [];
    for (let i = 0; i < plainBytes.length; i++) {
        let streamA = prng.next();
        let streamB = prng.next();
        let encByte = ((plainBytes[i] + streamA) % 256) ^ streamB;
        result.push(encByte);

        let noiseCount = (prng.next() % 4) + 1;
        for (let n = 0; n < noiseCount; n++) {
            result.push(prng.next());
        }
    }
    return new Uint8Array(result);
}

function deobfuscateBytes(obfBytes: Uint8Array, password: string, salt: Uint8Array): Uint8Array {
    let prng = new PRNG(password + Array.from(salt).join('-'));
    let result = [];
    let i = 0;
    while (i < obfBytes.length) {
        let streamA = prng.next();
        let streamB = prng.next();

        let encByte = obfBytes[i++];
        let plainByte = ((encByte ^ streamB) - streamA + 256) % 256;
        result.push(plainByte);

        let noiseCount = (prng.next() % 4) + 1;
        for (let n = 0; n < noiseCount; n++) {
            prng.next();
            i++;
        }
    }
    return new Uint8Array(result);
}

function getDerivedKey(password: string, salt: Uint8Array, iterations: number = 10000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, derivedKey) => {
            if (err) return reject(err);
            return resolve(derivedKey);
        });
    });
}

async function encryptAesGcm(key: Buffer, plaintext: Buffer, iv: Buffer): Promise<Buffer> {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([encrypted, authTag]);
}

async function decryptAesGcm(key: Buffer, ciphertextWithTag: Buffer, iv: Buffer): Promise<Buffer> {
    if (ciphertextWithTag.length < 16 || iv.length !== 12) {
        throw new Error('Malformed ciphertext or IV');
    }
    const ciphertext = ciphertextWithTag.subarray(0, -16);
    const authTag = ciphertextWithTag.subarray(-16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted;
}

const MIN_ENCRYPTED_PAYLOAD_BYTES = 16 + 600 + 50 * 16;

export async function encryptData(plaintext: string, password: string): Promise<string> {
    if (typeof plaintext !== 'string' || typeof password !== 'string' || !password) {
        throw new Error('Plaintext and password are required for encryption');
    }
    let expStr = "0000000000000";
    plaintext = expStr + "|" + plaintext;

    const salt = crypto.randomBytes(16);
    const key = await getDerivedKey(password, salt);

    let processedText = reverseString(plaintext);
    processedText = Buffer.from(encodeURIComponent(processedText)).toString('base64');

    const plainBytes = new Uint8Array(Buffer.from(processedText));
    const obfBytes = obfuscateBytes(plainBytes, password, salt);

    let currentBytes: Buffer = Buffer.from(obfBytes);
    const ivStack = new Uint8Array(600);
    for (let i = 0; i < 50; i++) {
        let curIv = crypto.randomBytes(12);
        ivStack.set(curIv, i * 12);
        currentBytes = await encryptAesGcm(key, currentBytes, curIv);
    }

    const rawCiphertext = new Uint8Array(currentBytes);
    const payload = new Uint8Array(salt.length + ivStack.length + rawCiphertext.byteLength);
    payload.set(salt, 0);
    payload.set(ivStack, salt.length);
    payload.set(rawCiphertext, salt.length + ivStack.length);

    const transposeWidth = (password.length % 11) + 5;
    const transposedPayload = matrixTranspose(payload, transposeWidth);

    const base64Payload = Buffer.from(transposedPayload).toString('base64');
    const hexResult = textToHex(base64Payload).toUpperCase();

    const marker = "---STEGO---";
    // Using a simple dummy base64 cover image
    const coverBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const combined = Buffer.from(coverBase64, 'base64').toString('utf8') + marker + hexResult;

    return `data:image/png;base64,` + Buffer.from(combined).toString('base64');
}

export async function decryptData(inputPayload: string, password: string): Promise<string> {
    if (typeof inputPayload !== 'string' || typeof password !== 'string' || !password) {
        throw new Error('Payload and password are required for decryption');
    }
    let hexPayload = inputPayload.trim();
    if (hexPayload.startsWith("data:") && hexPayload.includes(";base64,")) {
        const b64 = hexPayload.split(',')[1];
        if (!b64) throw new Error("Malformed data payload");
        const decodedStr = Buffer.from(b64, 'base64').toString('utf8');
        const markerIdx = decodedStr.lastIndexOf("---STEGO---");
        if (markerIdx !== -1) {
            hexPayload = decodedStr.substring(markerIdx + 11);
        }
    }
    hexPayload = hexPayload.replace(/\s+/g, '');
    if (hexPayload.length === 0 || hexPayload.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hexPayload)) {
        throw new Error("Malformed hex payload");
    }

    const base64Payload = hexToText(hexPayload);
    const payloadBuffer = Buffer.from(base64Payload, 'base64');
    const transposedPayload = new Uint8Array(payloadBuffer);

    if (transposedPayload.length < MIN_ENCRYPTED_PAYLOAD_BYTES) {
        throw new Error("Payload too short");
    }

    const transposeWidth = (password.length % 11) + 5;
    const payload = matrixUntranspose(transposedPayload, transposeWidth);

    const salt = payload.slice(0, 16);
    const ivStack = payload.slice(16, 616);
    const rawCiphertext = Buffer.from(payload.slice(616));

    let key = await getDerivedKey(password, salt, 10000);

    // Helper to attempt decryption with a given key
    const attemptDecryption = async (decKey: Buffer) => {
        let currentBytes = rawCiphertext;
        for (let i = 49; i >= 0; i--) {
            let curIv = Buffer.from(ivStack.slice(i * 12, (i + 1) * 12));
            currentBytes = await decryptAesGcm(decKey, currentBytes, curIv);
        }
        const obfBytes = new Uint8Array(currentBytes);
        const plainBytes = deobfuscateBytes(obfBytes, password, salt);
        let decryptedText = Buffer.from(plainBytes).toString('utf8');
        decryptedText = decodeURIComponent(Buffer.from(decryptedText, 'base64').toString('utf8'));
        decryptedText = reverseString(decryptedText);
        return decryptedText;
    };

    let decryptedText;
    try {
        decryptedText = await attemptDecryption(key);
    } catch {
        // Fallback to 100000 iterations for old passwords
        key = await getDerivedKey(password, salt, 100000);
        decryptedText = await attemptDecryption(key);
    }

    if (decryptedText.length < 14) {
        throw new Error("Decrypted payload format invalid");
    }

    return decryptedText.substring(14);
}

// --------------------------------------------------------------------------------
// STANDARD SECURE PASSWORD HASHING (Replaces the custom encryption above for passwords)
// --------------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
    if (typeof password !== 'string' || password.length === 0) {
        throw new Error('Password must be a non-empty string');
    }
    return new Promise((resolve, reject) => {
        const salt = randomBytes(16).toString('hex');
        scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) return reject(err);
            return resolve(salt + ":" + derivedKey.toString('hex'));
        });
    });
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
    if (typeof password !== 'string' || typeof hash !== 'string') {
        return false;
    }
    const parts = hash.split(":");
    if (parts.length !== 2) {
        return false;
    }
    const [salt, key] = parts;
    if (!salt || !key || key.length !== 128 || !/^[0-9a-f]+$/i.test(key)) {
        // It might be an old encrypted password or malformed hash, which will fail safely here.
        return false;
    }

    const keyBuffer = Buffer.from(key, 'hex');
    return new Promise((resolve, reject) => {
        scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) return reject(err);

            // Protect against timing attacks
            const isEqual = keyBuffer.length === derivedKey.length && timingSafeEqual(keyBuffer, derivedKey);
            return resolve(isEqual);
        });
    });
}
