/// <reference types="jest" />

import type { CspConsentRecord, CspExceptions } from "../../../src/common/types";
import { getCspConsentDelta, getNormalizedCspDomains } from "../../../src/common/utils/cspConsent";

describe("cspConsent utils", () => {
    describe("getNormalizedCspDomains", () => {
        it("treats a duplicate domain as required when any directive marks it required", () => {
            const cspExceptions: CspExceptions = {
                "connect-src": [{ domain: "api.example.com" }],
                "script-src": [{ domain: "api.example.com", optional: true }],
                "img-src": [{ domain: "cdn.example.com", optional: true }],
            };

            expect(getNormalizedCspDomains(cspExceptions)).toEqual({
                required: ["api.example.com"],
                optional: ["cdn.example.com"],
            });
        });
    });

    describe("getCspConsentDelta", () => {
        it("detects newly added required and optional exceptions after a tool update", () => {
            const cspExceptions: CspExceptions = {
                "connect-src": [{ domain: "api.example.com" }, { domain: "new-required.example.com" }],
                "img-src": [
                    { domain: "cdn.example.com", optional: true },
                    { domain: "analytics.example.com", optional: true },
                ],
            };
            const existingConsent: CspConsentRecord = {
                allowed: true,
                required: ["api.example.com"],
                optional: ["cdn.example.com"],
                seenOptional: ["cdn.example.com"],
            };

            expect(getCspConsentDelta(cspExceptions, existingConsent)).toMatchObject({
                currentRequired: ["api.example.com", "new-required.example.com"],
                currentOptional: ["analytics.example.com", "cdn.example.com"],
                newRequired: ["new-required.example.com"],
                newOptional: ["analytics.example.com"],
                removedRequired: [],
                removedOptional: [],
            });
        });

        it("prunes removed optional exceptions from approved and seen state", () => {
            const cspExceptions: CspExceptions = {
                "img-src": [{ domain: "cdn.example.com", optional: true }],
            };
            const existingConsent: CspConsentRecord = {
                allowed: true,
                required: [],
                optional: ["analytics.example.com", "cdn.example.com"],
                seenOptional: ["analytics.example.com", "cdn.example.com"],
            };

            expect(getCspConsentDelta(cspExceptions, existingConsent)).toMatchObject({
                currentOptional: ["cdn.example.com"],
                approvedOptional: ["cdn.example.com"],
                retainedSeenOptional: ["cdn.example.com"],
                removedOptional: ["analytics.example.com"],
                newOptional: [],
            });
        });

        it("detects when a previously required exception was removed by a tool update", () => {
            const cspExceptions: CspExceptions = {
                "connect-src": [{ domain: "api.example.com" }],
            };
            const existingConsent: CspConsentRecord = {
                allowed: true,
                required: ["api.example.com", "legacy-required.example.com"],
                optional: [],
                seenOptional: [],
            };

            expect(getCspConsentDelta(cspExceptions, existingConsent)).toMatchObject({
                currentRequired: ["api.example.com"],
                removedRequired: ["legacy-required.example.com"],
                newRequired: [],
            });
        });

        it("handles an update that removes old optional domains and adds new required and optional domains together", () => {
            const cspExceptions: CspExceptions = {
                "connect-src": [{ domain: "api.example.com" }, { domain: "new-required.example.com" }],
                "img-src": [{ domain: "analytics.example.com", optional: true }],
            };
            const existingConsent: CspConsentRecord = {
                allowed: true,
                required: ["api.example.com"],
                optional: ["cdn.example.com"],
                seenOptional: ["cdn.example.com"],
            };

            expect(getCspConsentDelta(cspExceptions, existingConsent)).toMatchObject({
                currentRequired: ["api.example.com", "new-required.example.com"],
                currentOptional: ["analytics.example.com"],
                approvedOptional: [],
                retainedSeenOptional: [],
                newRequired: ["new-required.example.com"],
                newOptional: ["analytics.example.com"],
                removedOptional: ["cdn.example.com"],
            });
        });
    });
});
