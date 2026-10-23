import { BUNDLED_CAPABILITY_CATALOG, parseCapabilityCatalog, type CapabilityCatalog } from "./capabilities";

/** Editor guidance; the shared validator remains authoritative for cross-field checks. */
export function createPPTBConfigSchema(catalog: CapabilityCatalog = BUNDLED_CAPABILITY_CATALOG): Record<string, unknown> {
    const approved = parseCapabilityCatalog(catalog);
    const version = { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+(-[0-9a-zA-Z-]+(\\.[0-9a-zA-Z-]+)*)?(\\+[0-9a-zA-Z-]+(\\.[0-9a-zA-Z-]+)*)?$" };
    const modes = { type: "string", enum: ["one-way", "two-way"] };
    const executionModes = { type: "string", enum: ["windowed", "headless"] };
    const contract = { type: "object", properties: { properties: { type: "object", additionalProperties: { $ref: "#/definitions/property" } } } };
    return {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "Power Platform ToolBox tool configuration",
        $comment: `Capability catalog ${approved.revision}, published ${approved.publishedAt}. Cross-field rules are checked by pptb-validate.`,
        type: "object",
        properties: {
            $schema: { type: "string", description: "Location of this configuration's JSON Schema." },
            invocation: {
                type: "object",
                required: ["version"],
                properties: {
                    version,
                    capabilities: {
                        type: "array",
                        uniqueItems: true,
                        description: "Approved discovery tags only. New tags require registry approval; these are not API permissions.",
                        items: approved.capabilities.length ? { oneOf: approved.capabilities.map((entry) => ({ const: entry.tag, description: entry.description })) } : false,
                    },
                    prefill: contract,
                    returnTopic: contract,
                },
            },
            agents: {
                type: "object",
                required: ["version", "headless"],
                properties: {
                    version,
                    headless: { type: "boolean" },
                    invokable: { type: "boolean" },
                    modes: { type: "array", items: modes },
                    defaultMode: modes,
                    timeoutMS: { type: "number", exclusiveMinimum: 0 },
                    executionModes: { type: "array", items: executionModes },
                    defaultExecutionMode: executionModes,
                    headlessEntry: { type: "string" },
                },
            },
            workers: {
                type: "object",
                minProperties: 1,
                propertyNames: { pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$", not: { enum: ["__proto__", "constructor", "prototype"] } },
                additionalProperties: {
                    type: "object",
                    additionalProperties: false,
                    required: ["kind", "packageId", "packageVersion", "command", "dotnet", "platforms"],
                    properties: {
                        kind: { const: "dotnet-tool" },
                        packageId: { type: "string", maxLength: 100, pattern: "^[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*$" },
                        packageVersion: { type: "string", pattern: "^\\d+(?:\\.\\d+){0,3}(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$" },
                        command: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$" },
                        dotnet: {
                            type: "object",
                            additionalProperties: false,
                            required: ["targetFramework", "minimumRuntimeVersion"],
                            properties: {
                                targetFramework: { enum: ["net8.0", "net9.0", "net10.0"] },
                                minimumRuntimeVersion: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
                                rollForward: { enum: ["Disable", "Latest", "Minor", "Major"] },
                            },
                        },
                        platforms: {
                            type: "array",
                            minItems: 1,
                            uniqueItems: true,
                            items: { enum: ["all", "windows-x64", "windows-arm64", "macos-x64", "macos-arm64", "linux-x64", "linux-arm64"] },
                        },
                    },
                },
            },
        },
        definitions: {
            property: {
                type: "object",
                properties: {
                    type: { type: "string" },
                    enum: { type: "array", minItems: 1 },
                    items: { $ref: "#/definitions/property" },
                    title: { type: "string" },
                    description: { type: "string" },
                    required: { type: "boolean" },
                },
            },
        },
    };
}
