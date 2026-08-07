import type { TelemetryConsentChoice } from "./types";

export function normalizeTelemetryConsent(value: unknown): TelemetryConsentChoice | null {
    return value === "yes" || value === "no" ? value : null;
}

export function hasTelemetryConsent(value: unknown): boolean {
    return normalizeTelemetryConsent(value) === "yes";
}

export function shouldPromptForTelemetryConsent(value: unknown): boolean {
    return normalizeTelemetryConsent(value) === null;
}
