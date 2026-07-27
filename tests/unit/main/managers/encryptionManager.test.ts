/// <reference types="jest" />

import { safeStorage } from "electron";
import { EncryptionManager } from "../../../../src/main/managers/encryptionManager";

// The electron mock at tests/__mocks__/electron.ts implements safeStorage with
// Buffer.from(plaintext, "utf8") as "encrypt" and buffer.toString("utf8") as "decrypt",
// so round-trip tests work without a real OS keychain.

describe("EncryptionManager", () => {
    let manager: EncryptionManager;

    beforeEach(() => {
        // resetAllMocks clears implementations (including mockReturnValue) so tests
        // don't bleed into each other. Re-apply the default "available" return value.
        jest.resetAllMocks();
        (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(true);
        (safeStorage.encryptString as jest.Mock).mockImplementation((plaintext: string) => Buffer.from(plaintext, "utf8"));
        (safeStorage.decryptString as jest.Mock).mockImplementation((buffer: Buffer) => buffer.toString("utf8"));
        manager = new EncryptionManager();
    });

    // -----------------------------------------------------------------------
    // isEncryptionAvailable
    // -----------------------------------------------------------------------
    describe("isEncryptionAvailable", () => {
        it("returns true when safeStorage is available", () => {
            (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(true);
            expect(manager.isEncryptionAvailable()).toBe(true);
        });

        it("returns false when safeStorage is unavailable", () => {
            (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(false);
            expect(manager.isEncryptionAvailable()).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // encrypt / decrypt round-trip
    // -----------------------------------------------------------------------
    describe("encrypt", () => {
        it("returns a non-empty base64 string for non-empty input", () => {
            const encrypted = manager.encrypt("my-secret");
            expect(encrypted).toBeTruthy();
            // Base64 charset
            expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
        });

        it("returns empty string for empty input", () => {
            expect(manager.encrypt("")).toBe("");
        });

        it("returns plaintext when encryption is unavailable", () => {
            (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(false);
            expect(manager.encrypt("plain")).toBe("plain");
        });
    });

    describe("decrypt", () => {
        it("round-trips a value through encrypt→decrypt", () => {
            const plaintext = "super-secret-value";
            const encrypted = manager.encrypt(plaintext);
            const decrypted = manager.decrypt(encrypted);
            expect(decrypted).toBe(plaintext);
        });

        it("returns empty string for empty input", () => {
            expect(manager.decrypt("")).toBe("");
        });

        it("returns the input value when encryption is unavailable", () => {
            (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(false);
            expect(manager.decrypt("already-plain")).toBe("already-plain");
        });

        it("returns input as-is when decryption throws (backward compat)", () => {
            (safeStorage.decryptString as jest.Mock).mockImplementation(() => {
                throw new Error("decrypt failed");
            });
            // Should not throw, returns the input
            const result = manager.decrypt("bad-data");
            expect(result).toBe("bad-data");
        });
    });

    // -----------------------------------------------------------------------
    // encryptFields / decryptFields
    // -----------------------------------------------------------------------
    describe("encryptFields", () => {
        it("encrypts specified fields and leaves others untouched", () => {
            const obj = { name: "My Connection", clientSecret: "top-secret", url: "https://example.com" } as Record<string, string>;
            const encrypted = manager.encryptFields(obj, ["clientSecret"] as never[]);
            expect(encrypted.name).toBe("My Connection");
            expect(encrypted.url).toBe("https://example.com");
            // clientSecret must be different from original (encrypted)
            expect(encrypted.clientSecret).not.toBe("top-secret");
        });

        it("skips falsy field values", () => {
            const obj = { name: "conn", clientSecret: "" } as Record<string, string>;
            const encrypted = manager.encryptFields(obj, ["clientSecret"] as never[]);
            expect(encrypted.clientSecret).toBe("");
        });
    });

    describe("decryptFields", () => {
        it("decryptFields reverses encryptFields", () => {
            const original = { name: "conn", clientSecret: "my-password" } as Record<string, string>;
            const encrypted = manager.encryptFields(original, ["clientSecret"] as never[]);
            const decrypted = manager.decryptFields(encrypted, ["clientSecret"] as never[]);
            expect(decrypted.clientSecret).toBe("my-password");
            expect(decrypted.name).toBe("conn");
        });
    });
});
