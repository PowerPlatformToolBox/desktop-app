import { BUNDLED_CAPABILITY_CATALOG, parseCapabilityCatalog, type CapabilityCatalog } from "../../../packages/validation/src/capabilities";
import { createPPTBConfigSchema } from "../../../packages/validation/src/schema";
import { validatePPTBConfig, type PPTBConfig } from "../../../packages/validation/src/validate";
import type { CapabilityTag } from "../../../packages/types/pptbConfig";

describe("registry-controlled capabilities", () => {
    const config = (capabilities: unknown): PPTBConfig => ({ invocation: { version: "1.0.0", capabilities } }) as PPTBConfig;
    const liveCatalog: CapabilityCatalog = {
        schemaVersion: 1,
        revision: "test-revision",
        publishedAt: "2026-10-21T12:00:00.000Z",
        capabilities: [{ tag: "new-approved-tag", description: "Newly approved functionality" }],
    };

    it("allows omitted and empty declarations", () => {
        expect(validatePPTBConfig({ invocation: { version: "1.0.0" } }).valid).toBe(true);
        expect(validatePPTBConfig(config([])).valid).toBe(true);
    });

    it("accepts every bundled tag and rejects arbitrary strings in the declaration type", () => {
        const tag: CapabilityTag = "fetchxml";
        // @ts-expect-error Unapproved capability strings are not part of the declaration contract.
        const unknown: CapabilityTag = "custom-private-tag";
        expect(tag).not.toBe(unknown);
        expect(validatePPTBConfig(config(BUNDLED_CAPABILITY_CATALOG.capabilities.map((entry) => entry.tag))).valid).toBe(true);
    });

    it.each([null, "fetchxml", [""], [" "], [12], ["custom-private-tag"], ["fetchxml", "fetchxml"], ["FetchXML"], ["fetchxml "], [" fetchxml"]].map((value) => [value]))(
        "rejects invalid declarations: %p",
        (value) => {
            expect(validatePPTBConfig(config(value))).toMatchObject({ valid: false, warnings: [], errors: expect.any(Array) });
            expect(validatePPTBConfig(config(value)).errors.length).toBeGreaterThan(0);
        },
    );

    it("suggests canonical spelling without rewriting the input", () => {
        const input = config([" FetchXML "]);
        expect(validatePPTBConfig(input).errors[0]).toContain('"fetchxml"');
        expect(input.invocation?.capabilities).toEqual([" FetchXML "]);
    });

    it("uses the supplied catalog instead of merging the bundled list", () => {
        expect(validatePPTBConfig(config(["new-approved-tag"]), undefined, { capabilityCatalog: liveCatalog }).valid).toBe(true);
        expect(validatePPTBConfig(config(["fetchxml"]), undefined, { capabilityCatalog: liveCatalog }).valid).toBe(false);
    });

    it("treats an empty active registry as authoritative", () => {
        expect(validatePPTBConfig(config(["fetchxml"]), undefined, { capabilityCatalog: { ...liveCatalog, capabilities: [] } }).valid).toBe(false);
    });

    it("supports explicit warning-only desktop migration, without weakening other checks", () => {
        const input = config(["custom-private-tag"]);
        expect(validatePPTBConfig(input, undefined, { capabilityValidation: "warning" })).toMatchObject({ valid: true, errors: [], warnings: [expect.stringContaining("registry approval")] });
        expect(validatePPTBConfig({ invocation: { version: "invalid", capabilities: ["custom-private-tag"] } }, undefined, { capabilityValidation: "warning" }).valid).toBe(false);
    });

    it("recognizes schema metadata", () => {
        expect(validatePPTBConfig({ $schema: "./schema.json" })).toMatchObject({ valid: true, warnings: [] });
        expect(validatePPTBConfig({ $schema: 42 } as unknown as PPTBConfig).valid).toBe(false);
    });

    it("generates schema capabilities and descriptions from the exact supplied revision", () => {
        const schema = createPPTBConfigSchema(liveCatalog);
        expect(schema).toMatchObject({
            $comment: expect.stringContaining(liveCatalog.revision),
            properties: {
                invocation: {
                    properties: {
                        capabilities: { type: "array", uniqueItems: true, items: { oneOf: [{ const: "new-approved-tag", description: "Newly approved functionality" }] } },
                    },
                },
                agents: { properties: { headlessEntry: { type: "string" } } },
                workers: { type: "object" },
            },
        });
        expect(createPPTBConfigSchema({ ...liveCatalog, capabilities: [] })).toMatchObject({ properties: { invocation: { properties: { capabilities: { items: false } } } } });
    });

    it.each([
        null,
        { ...liveCatalog, schemaVersion: 2 },
        { ...liveCatalog, revision: "" },
        { ...liveCatalog, publishedAt: "yesterday" },
        { ...liveCatalog, capabilities: [{ tag: "Bad-Tag", description: "Description" }] },
        { ...liveCatalog, capabilities: [{ tag: "valid-tag\n", description: "Description" }] },
        { ...liveCatalog, capabilities: [{ tag: "valid-tag", description: "" }] },
        { ...liveCatalog, capabilities: [liveCatalog.capabilities[0], liveCatalog.capabilities[0]] },
    ])("rejects malformed catalog data: %p", (value) => {
        expect(() => parseCapabilityCatalog(value)).toThrow();
    });
});
