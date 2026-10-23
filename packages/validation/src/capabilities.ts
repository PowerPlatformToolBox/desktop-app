import bundledCapabilities from "./bundled-capabilities.json";

export interface CapabilityEntry {
    tag: string;
    description: string;
}

export interface CapabilityCatalog {
    schemaVersion: 1;
    revision: string;
    publishedAt: string;
    capabilities: CapabilityEntry[];
}

export const CAPABILITY_TAG_PATTERN = "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$";
const tagPattern = new RegExp(CAPABILITY_TAG_PATTERN);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseCapabilityCatalog(value: unknown): CapabilityCatalog {
    if (
        !isRecord(value) ||
        value.schemaVersion !== 1 ||
        typeof value.revision !== "string" ||
        value.revision.trim().length === 0 ||
        typeof value.publishedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T/.test(value.publishedAt) ||
        !Number.isFinite(Date.parse(value.publishedAt)) ||
        !Array.isArray(value.capabilities)
    ) {
        throw new Error("Invalid capability catalog: expected schemaVersion 1, revision, ISO publishedAt, and capabilities array");
    }
    const tags = new Set<string>();
    const capabilities = value.capabilities.map((entry: unknown) => {
        if (
            !isRecord(entry) ||
            typeof entry.tag !== "string" ||
            !tagPattern.test(entry.tag) ||
            entry.tag.trim() !== entry.tag ||
            typeof entry.description !== "string" ||
            entry.description.trim().length === 0
        ) {
            throw new Error("Invalid capability catalog entry: expected a lowercase kebab-case tag and non-empty description");
        }
        if (tags.has(entry.tag)) throw new Error(`Duplicate capability catalog tag: ${entry.tag}`);
        tags.add(entry.tag);
        return { tag: entry.tag, description: entry.description };
    });
    capabilities.sort((left, right) => (left.tag < right.tag ? -1 : left.tag > right.tag ? 1 : 0));
    return { schemaVersion: 1, revision: value.revision, publishedAt: value.publishedAt, capabilities };
}

export function validateCapabilityDeclarations(value: unknown, catalog: CapabilityCatalog): string[] {
    const entries = parseCapabilityCatalog(catalog).capabilities;
    if (!Array.isArray(value)) return ["invocation.capabilities must be an array"];
    const known = new Set(entries.map((entry) => entry.tag));
    const seen = new Set<string>();
    const errors: string[] = [];
    value.forEach((tag: unknown, index) => {
        const field = `invocation.capabilities[${index}]`;
        if (typeof tag !== "string" || tag.trim().length === 0) {
            errors.push(`${field} must be a non-empty string`);
            return;
        }

        if (seen.has(tag)) errors.push(`${field} duplicates capability tag "${tag}"`);
        seen.add(tag);
        const canonical = tag.trim().toLowerCase();
        if (tag !== canonical) {
            errors.push(`${field} "${tag}" must use canonical lowercase spelling without whitespace${known.has(canonical) ? `: "${canonical}"` : ""}`);
        } else if (!known.has(tag)) {
            errors.push(`${field} "${tag}" is not an approved active capability tag. Use pptb-validate capabilities to list approved tags; new tags require registry approval.`);
        }
    });
    return errors;
}

/** Release-time snapshot, not a claim that the live registry has been checked. */
export const BUNDLED_CAPABILITY_CATALOG: CapabilityCatalog = parseCapabilityCatalog(bundledCapabilities);
