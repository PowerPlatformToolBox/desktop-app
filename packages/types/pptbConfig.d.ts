/**
 * Type definitions for pptb.config.json – the optional configuration file that
 * tools can place alongside their package.json to declare invocation contracts
 * and other Power Platform ToolBox-specific metadata.
 *
 * Tool developers should place this file in the root of their tool package so
 * that `pptb-validate` can automatically discover and validate it.
 *
 * Example pptb.config.json:
 * ```json
 * {
 *   "invocation": {
 *     "version": "1.0.0",
 *     "capabilities": ["fetchxml"],
 *     "prefill": {
 *       "properties": {
 *         "entityName": { "type": "string" },
 *         "attributes": { "type": "array", "items": { "type": "string" } }
 *       }
 *     },
 *     "returnTopic": {
 *       "properties": {
 *         "result": { "type": "object" },
 *         "status": { "type": "string", "enum": ["success", "cancelled", "error"] },
 *         "error": { "type": "string" }
 *       }
 *     }
 *   },
 *   "agents": {
 *     "version": "1.0.0",
 *     "headless": false,
 *     "invokable": true,
 *     "modes": ["one-way", "two-way"],
 *     "defaultMode": "two-way",
 *     "timeoutMS": 12000,
 *     "executionModes": ["windowed", "headless"],
 *     "defaultExecutionMode": "headless",
 *     "headlessEntry": "dist/headless.js"
 *   }
 * }
 * ```
 */

/**
 * Well-known capability tags defined in the Power Platform ToolBox capability registry.
 *
 * Using one of these values provides IDE auto-complete and ensures compatibility with the
 * official capability discovery system (`toolboxAPI.invocation.findToolsByCapability`).
 * The authoritative list is maintained in the Supabase `capability_tags` table so new
 * tags can be added without an app update. Fetch the current list at runtime via
 * `toolboxAPI.invocation.getKnownCapabilityTags()`.
 *
 * | Tag                  | Description                                           |
 * | -------------------- | ----------------------------------------------------- |
 * | `fetchxml`           | Accept or process FetchXML queries                    |
 * | `entity-picker`      | Browse and select a Dataverse entity (table)          |
 * | `record-selector`    | Browse and select a Dataverse record                  |
 * | `solution-selector`  | Pick a Power Platform solution                        |
 * | `webresource-editor` | Edit or manage web resources                          |
 * | `plugin-inspector`   | Inspect or manage plugins and assemblies              |
 * | `pcf-control-builder`| Build or scaffold PCF controls                        |
 */
export type KnownCapabilityTag = "fetchxml" | "entity-picker" | "record-selector" | "solution-selector" | "webresource-editor" | "plugin-inspector" | "pcf-control-builder";

/**
 * A capability tag string accepted by `invocation.capabilities` and
 * `toolboxAPI.invocation.findToolsByCapability()`.
 *
 * `KnownCapabilityTag` values offer IDE auto-complete and are validated by
 * `pptb-validate`. Custom strings are permitted for organisation-internal tags,
 * but will produce a validation warning unless the tag appears in the official
 * capability registry.
 *
 * @example
 * ```json
 * { "invocation": { "version": "1.0.0", "capabilities": ["fetchxml", "entity-picker"] } }
 * ```
 */
export type CapabilityTag = KnownCapabilityTag | string;

/** A JSON-schema-style property descriptor used inside invocation definitions. */
export interface JsonSchemaProperty {
    /** The JSON type of the value (e.g. "string", "number", "boolean", "object", "array"). */
    type?: string;
    /** Restricts the value to one of the listed literals. */
    enum?: string[];
    /** Describes the items of an array property. */
    items?: JsonSchemaProperty;
}

/** A JSON-schema-style object definition: a map of named property descriptors. */
export interface JsonSchemaObject {
    properties?: Record<string, JsonSchemaProperty>;
}

/**
 * The invocation contract for a tool.
 *
 * - `version` controls which revision of this contract is in effect.  It must
 *   follow **semantic versioning** (`MAJOR.MINOR.PATCH[-prerelease][+build]`).
 *   Tool developers own this version and should bump it whenever the shape of
 *   `prefill` or `returnTopic` changes in a meaningful way.
 * - `prefill` describes the data that callers can pre-populate when opening
 *   this tool programmatically.
 * - `returnTopic` describes the data this tool will resolve back to its caller
 *   when it finishes.
 */
export type AgentInvocationMode = "one-way" | "two-way";
export type AgentExecutionMode = "windowed" | "headless";

/**
 * Agent-specific launch contract for external automation callers.
 *
 * - `version`: semantic version for the agent-facing contract.
 * - `headless`: whether the tool supports headless execution (required when agents is present).
 * - `invokable`: opt-in flag that exposes the tool to the MCP server.
 * - `modes`: supported MCP invocation modes for this tool.
 * - `defaultMode`: fallback mode when the caller does not specify one.
 * - `timeoutMS`: optional timeout hint, in milliseconds, for two-way calls.
 * - `executionModes`: supported execution modes for this tool.
 * - `defaultExecutionMode`: fallback execution mode when the caller does not specify one.
 * - `headlessEntry`: path to the compiled automated runtime entry point.
 */
export interface AgentsConfig {
    /** Semantic version of this agent contract. */
    version: string;
    /** Whether the tool supports headless execution. */
    headless: boolean;
    /** Whether the tool may be invoked by an external agent. */
    invokable?: boolean;
    /** Invocation modes supported by the tool when called by an agent. */
    modes?: AgentInvocationMode[];
    /** Default mode used when an agent does not request a mode explicitly. */
    defaultMode?: AgentInvocationMode;
    /** Optional timeout hint, in milliseconds, for agent-driven two-way calls. */
    timeoutMS?: number;
    /** Execution modes supported by the tool. */
    executionModes?: AgentExecutionMode[];
    /** Default execution mode when an agent does not request one explicitly. */
    defaultExecutionMode?: AgentExecutionMode;
    /** Path to the compiled automated runtime entry point. */
    headlessEntry?: string;
}

export interface InvocationConfig {
    /**
     * Semantic version of this invocation contract (e.g. "1.0.0").
     * Tool developers control this version so they can evolve the prefill or
     * return shape independently of the tool's npm package version.
     */
    version: string;
    /** Schema of the data the caller can pass in when invoking this tool. */
    prefill?: JsonSchemaObject;
    /** Schema of the data this tool returns to its caller on completion. */
    returnTopic?: JsonSchemaObject;
    /**
     * Capability tags declared by this tool.
     *
     * Callers use `toolboxAPI.invocation.findToolsByCapability(tag)` to discover tools
     * that advertise a given capability. Prefer `KnownCapabilityTag` values for IDE
     * auto-complete; custom strings are accepted but will produce a `pptb-validate`
     * warning unless the tag is present in the official capability registry.
     *
     * Use `toolboxAPI.invocation.getKnownCapabilityTags()` at runtime to retrieve the
     * full list from the registry (backed by a configurable Supabase table so new tags
     * can be added without an app update).
     *
     * @example
     * ```json
     * { "invocation": { "version": "1.0.0", "capabilities": ["entity-picker", "fetchxml"] } }
     * ```
     */
    capabilities?: CapabilityTag[];
}

/**
 * Author-facing runtime policy. Latest maps to native LatestMajor in later runtime work.
 */
export type WorkerRollForward = "Disable" | "Latest" | "Minor" | "Major";
export type WorkerTargetFramework = "net8.0" | "net9.0" | "net10.0";
export type WorkerPlatform = "all" | "windows-x64" | "windows-arm64" | "macos-x64" | "macos-arm64" | "linux-x64" | "linux-arm64";

/** Declarative metadata only; no worker execution API is available yet. */
export interface WorkerDeclaration {
    kind: "dotnet-tool";
    packageId: string;
    /** Exact NuGet version; ranges, floating versions and tags are forbidden. */
    packageVersion: string;
    command: string;
    dotnet: {
        targetFramework: WorkerTargetFramework;
        /** Stable major.minor.patch matching the executable target framework. */
        minimumRuntimeVersion: string;
        /** Defaults to Major when omitted. Explicit null/empty/unknown values are invalid. */
        rollForward?: WorkerRollForward;
    };
    /** Required unique aliases; all must appear alone and names the versioned officially supported PPTB platform matrix. */
    platforms: WorkerPlatform[];
}

export interface NormalizedWorkerDeclaration extends WorkerDeclaration {
    dotnet: WorkerDeclaration["dotnet"] & { rollForward: WorkerRollForward };
}

/** Optional package-root config, validated alongside package.json by pptb-validate. */
export interface PPTBConfig {
    /** Invocation contract – how this tool can be called by other tools. */
    invocation?: InvocationConfig;
    /** Agent contract – how this tool can be called by external automation. */
    agents?: AgentsConfig;
    /** Native worker declarations keyed by stable ID. Requires package.json features.minAPI. */
    workers?: Record<string, WorkerDeclaration>;
}
