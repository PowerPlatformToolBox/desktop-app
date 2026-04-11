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
 *   }
 * }
 * ```
 */

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
}

/**
 * The shape of a tool's `pptb.config.json` file.
 *
 * This file lives alongside `package.json` in the tool's package root.
 * All sections are optional; the file itself is optional.  When present it
 * is validated by `pptb-validate` in addition to `package.json`.
 */
export interface PptbConfig {
    /** Invocation contract – how this tool can be called by other tools. */
    invocation?: InvocationConfig;
}
