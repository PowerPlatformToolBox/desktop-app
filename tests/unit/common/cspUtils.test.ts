import { normalizeCspExceptionSource } from "../../../src/common/types/common";
import type { CspExceptionEntry, CspExceptionSource } from "../../../src/common/types/common";

describe("normalizeCspExceptionSource", () => {
    it("wraps a plain string into a CspExceptionEntry", () => {
        const result: CspExceptionEntry = normalizeCspExceptionSource("api.example.com");
        expect(result).toEqual({ domain: "api.example.com" });
    });

    it("passes through a CspExceptionEntry unchanged", () => {
        const entry: CspExceptionSource = {
            domain: "cdn.example.com",
            exceptionReason: "CDN for assets",
            optional: true,
        };
        const result = normalizeCspExceptionSource(entry);
        expect(result).toEqual(entry);
    });

    it("preserves optional flag when present", () => {
        const result = normalizeCspExceptionSource({ domain: "x.com", optional: true });
        expect(result.optional).toBe(true);
    });

    it("preserves exceptionReason when present", () => {
        const result = normalizeCspExceptionSource({ domain: "x.com", exceptionReason: "needed for auth" });
        expect(result.exceptionReason).toBe("needed for auth");
    });
});
