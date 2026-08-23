import { CspConsentRecord, CspExceptions, normalizeCspExceptionSource } from "../types";

export interface NormalizedCspDomains {
    required: string[];
    optional: string[];
}

export interface CspConsentDelta {
    currentRequired: string[];
    currentOptional: string[];
    previousRequired: string[];
    previousOptional: string[];
    previousSeenOptional: string[];
    approvedOptional: string[];
    retainedSeenOptional: string[];
    newRequired: string[];
    newOptional: string[];
    removedRequired: string[];
    removedOptional: string[];
}

/**
 * Normalize tool CSP exceptions into unique required/optional domain lists.
 * If a domain appears as both required and optional across directives, required wins.
 */
export function getNormalizedCspDomains(cspExceptions?: CspExceptions | null): NormalizedCspDomains {
    const domains = new Map<string, { optional: boolean }>();

    if (!cspExceptions) {
        return { required: [], optional: [] };
    }

    for (const sources of Object.values(cspExceptions)) {
        if (!Array.isArray(sources)) {
            continue;
        }

        for (const source of sources) {
            const entry = normalizeCspExceptionSource(source);
            const existing = domains.get(entry.domain);

            if (!existing) {
                domains.set(entry.domain, { optional: entry.optional === true });
                continue;
            }

            if (existing.optional && entry.optional !== true) {
                domains.set(entry.domain, { optional: false });
            }
        }
    }

    const required: string[] = [];
    const optional: string[] = [];

    domains.forEach((metadata, domain) => {
        if (metadata.optional) {
            optional.push(domain);
        } else {
            required.push(domain);
        }
    });

    return {
        required: required.sort(),
        optional: optional.sort(),
    };
}

/**
 * Compare the current tool CSP exceptions to a stored consent record.
 * This is used for re-consent detection and for pruning stale permissions when a tool update removes exceptions.
 */
export function getCspConsentDelta(cspExceptions?: CspExceptions | null, existingConsent?: CspConsentRecord | null): CspConsentDelta {
    const normalized = getNormalizedCspDomains(cspExceptions);

    const previousRequired = [...(existingConsent?.required ?? [])].sort();
    const previousOptional = [...(existingConsent?.optional ?? [])].sort();
    const previousSeenOptional = [...(existingConsent?.seenOptional ?? previousOptional)].sort();

    const approvedOptional = previousOptional.filter((domain) => normalized.optional.includes(domain)).sort();
    const retainedSeenOptional = previousSeenOptional.filter((domain) => normalized.optional.includes(domain)).sort();

    return {
        currentRequired: normalized.required,
        currentOptional: normalized.optional,
        previousRequired,
        previousOptional,
        previousSeenOptional,
        approvedOptional,
        retainedSeenOptional,
        newRequired: normalized.required.filter((domain) => !previousRequired.includes(domain)).sort(),
        newOptional: normalized.optional.filter((domain) => !previousSeenOptional.includes(domain)).sort(),
        removedRequired: previousRequired.filter((domain) => !normalized.required.includes(domain)).sort(),
        removedOptional: previousSeenOptional.filter((domain) => !normalized.optional.includes(domain)).sort(),
    };
}
