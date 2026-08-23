/// <reference types="jest" />

import { hasTelemetryConsent, normalizeTelemetryConsent, shouldPromptForTelemetryConsent } from "../../../src/common/telemetryConsent";

describe("telemetryConsent", () => {
    it("normalizes yes and no values", () => {
        expect(normalizeTelemetryConsent("yes")).toBe("yes");
        expect(normalizeTelemetryConsent("no")).toBe("no");
    });

    it("normalizes unknown values to null", () => {
        expect(normalizeTelemetryConsent(undefined)).toBeNull();
        expect(normalizeTelemetryConsent("later")).toBeNull();
    });

    it("reports whether telemetry is allowed", () => {
        expect(hasTelemetryConsent("yes")).toBe(true);
        expect(hasTelemetryConsent("no")).toBe(false);
        expect(hasTelemetryConsent(null)).toBe(false);
    });

    it("prompts only when consent is unset", () => {
        expect(shouldPromptForTelemetryConsent(undefined)).toBe(true);
        expect(shouldPromptForTelemetryConsent("yes")).toBe(false);
        expect(shouldPromptForTelemetryConsent("no")).toBe(false);
    });
});
