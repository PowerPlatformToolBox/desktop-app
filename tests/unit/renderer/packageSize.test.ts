/// <reference types="jest" />

import { formatPackageSize } from "../../../src/renderer/utils/packageSize";

describe("formatPackageSize", () => {
    it("returns empty string for missing or invalid values", () => {
        expect(formatPackageSize(undefined)).toBe("");
        expect(formatPackageSize(0)).toBe("");
        expect(formatPackageSize(-1)).toBe("");
    });

    it("formats bytes and larger units", () => {
        expect(formatPackageSize(512)).toBe("512 B");
        expect(formatPackageSize(1024)).toBe("1 KB");
        expect(formatPackageSize(5 * 1024 * 1024)).toBe("5 MB");
        expect(formatPackageSize(250 * 1024 * 1024)).toBe("250 MB");
        expect(formatPackageSize(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
    });
});
