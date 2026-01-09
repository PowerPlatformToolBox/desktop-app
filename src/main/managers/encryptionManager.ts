import { safeStorage } from "electron";
import { captureMessage } from "../../common/sentryHelper";

/**
 * Manages encryption and decryption of sensitive data using Electron's safeStorage API
 * This uses the OS's secure storage mechanisms (Keychain on macOS, DPAPI on Windows, etc.)
 */
export class EncryptionManager {
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
            captureMessage("Encryption not available, storing data in plain text", "warning");
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
            captureMessage("Encryption not available, returning data as-is", "warning");
            return encrypted;
        }

        try {
            const buffer = Buffer.from(encrypted, "base64");
            return safeStorage.decryptString(buffer);
        } catch (error) {
            console.error("Failed to decrypt data:", error);
            // If decryption fails, it might be plain text from before encryption was added
            // Return as-is for backwards compatibility
            return encrypted;
        }
    }

    /**
     * Encrypt an object's sensitive fields
     * Returns a new object with sensitive fields encrypted
     */
    encryptFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
        const result = { ...obj };

        for (const field of fields) {
            if (result[field] !== undefined && result[field] !== null && typeof result[field] === "string") {
                result[field] = this.encrypt(result[field] as string) as T[keyof T];
            }
            // Preserve undefined and null values explicitly to allow clearing fields during updates
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
