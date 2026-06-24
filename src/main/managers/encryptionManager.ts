import { safeStorage } from "electron";
import { logError, logWarn } from "../../common/logger";

/**
 * Manages encryption and decryption of sensitive data using Electron's safeStorage API
 * This uses the OS's secure storage mechanisms (Keychain on macOS, DPAPI on Windows, etc.)
 */
export class EncryptionManager {
    /**
     * Detect whether a value looks like canonical base64.
     * This prevents accidental decryption attempts on plaintext inputs.
     */
    private isCanonicalBase64(value: string): boolean {
        if (!value || value.length % 4 !== 0) {
            return false;
        }

        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
            return false;
        }

        try {
            return Buffer.from(value, "base64").toString("base64") === value;
        } catch {
            return false;
        }
    }

    /**
     * Check if encryption is available on this platform
     */
    isEncryptionAvailable(): boolean {
        return safeStorage.isEncryptionAvailable();
    }

    /**
     * Encrypt a string value
     * Returns base64-encoded encrypted data for storage
     */
    encrypt(plaintext: string): string {
        if (!plaintext) {
            return "";
        }

        if (!this.isEncryptionAvailable()) {
            logWarn("Encryption not available, returning data as-is");
            return plaintext;
        }

        const buffer = safeStorage.encryptString(plaintext);
        return buffer.toString("base64");
    }

    /**
     * Decrypt a base64-encoded encrypted string
     */
    decrypt(encrypted: string): string {
        if (!encrypted) {
            return "";
        }

        if (!this.isEncryptionAvailable()) {
            logWarn("Encryption not available, returning data as-is");
            return encrypted;
        }

        // Values can legitimately be plaintext during migration/import paths.
        if (!this.isCanonicalBase64(encrypted)) {
            return encrypted;
        }

        try {
            const buffer = Buffer.from(encrypted, "base64");
            return safeStorage.decryptString(buffer);
        } catch (error) {
            logError("Failed to decrypt data", error);
            // If decryption fails, it might be plain text from before encryption was added
            // Return as-is for backwards compatibility
            return encrypted;
        }
    }

    /**
     * Encrypt an object's sensitive fields
     * Returns a new object with sensitive fields encrypted.
     * Undefined and null values are preserved unchanged to allow clearing fields during updates.
     */
    encryptFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
        const result = { ...obj };

        for (const field of fields) {
            if (result[field] !== undefined && result[field] !== null && typeof result[field] === "string") {
                result[field] = this.encrypt(result[field] as string) as T[keyof T];
            }
            // Note: undefined and null values are passed through unchanged
        }

        return result;
    }

    /**
     * Decrypt an object's sensitive fields
     * Returns a new object with sensitive fields decrypted
     */
    decryptFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
        const result = { ...obj };

        for (const field of fields) {
            if (result[field] && typeof result[field] === "string") {
                result[field] = this.decrypt(result[field] as string) as T[keyof T];
            }
        }

        return result;
    }
}
