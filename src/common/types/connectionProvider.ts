/**
 * Connection provider types
 *
 * Extensions can contribute connection providers in addition to tools. A connection provider
 * lists connections and acquires access tokens for them. Providers run in an isolated Electron
 * utility process and talk to the host through a small RPC bridge.
 *
 * An extension declares its providers in package.json:
 *
 * ```json
 * "pptbConnectionProviders": [
 *     { "id": "data8", "displayName": "Data8", "main": "dist/provider.js" }
 * ]
 * ```
 */

import type { Connection } from "./connection";

/**
 * Declaration of a connection provider in an extension's package.json (`pptbConnectionProviders`)
 */
export interface ConnectionProviderDeclaration {
    /** Identifier unique to the extension. Letters, digits, '.', '_' and '-' only. */
    id: string;
    /** Name shown to the user alongside the provider's connections */
    displayName: string;
    /** Path of the CommonJS provider module, relative to the extension root */
    main: string;
}

/**
 * A connection returned by a provider
 */
export interface ProviderConnectionInfo {
    /** Identifier unique within the provider */
    id: string;
    name: string;
    /** Dataverse environment URL */
    url: string;
    environment?: Connection["environment"];
    category?: string;
    username?: string;
    description?: string;
}

/**
 * Identifies the tool instance a connection is being used from, so a provider can log or restrict
 * access per tool. Only non-sensitive identity is included (no filesystem paths).
 */
export interface ProviderAuthenticateToolContext {
    toolId: string;
    toolName: string;
    toolVersion: string;
    /** Unique to this open tool window; stable for the lifetime of that window */
    instanceId: string;
}

/**
 * Context passed to a provider when a token is requested
 */
export interface ProviderAuthenticateContext {
    /** "connect" when the user opens the connection, "refresh" when an existing token has expired */
    reason: "connect" | "refresh";
    /**
     * The tool currently using this connection, when known. Undefined when the connection is being
     * activated or refreshed directly from the main app window rather than from within a tool, or
     * when several tools share the connection and none can be identified unambiguously.
     */
    tool?: ProviderAuthenticateToolContext;
}

/**
 * Token returned by a provider for a connection
 */
export interface ProviderAuthenticationResult {
    accessToken: string;
    /** Expiry as an ISO 8601 string or a millisecond timestamp */
    expiresOn: string | number;
}

/**
 * Request for the host to acquire a Microsoft Entra ID token on the provider's behalf.
 * The host tries silent acquisition first and falls back to an interactive browser login.
 */
export interface ProviderEntraTokenRequest {
    clientId: string;
    /** Tenant ID or domain, e.g. "contoso.onmicrosoft.com". Defaults to "organizations". */
    tenantId?: string;
    scopes: string[];
    loginHint?: string;
    /** Skip the silent attempt and always show the interactive login */
    forceInteractive?: boolean;
}

export interface ProviderEntraTokenResult {
    accessToken: string;
    expiresOn: string;
    username?: string;
}

/**
 * Kind of input control rendered for a {@link ProviderPromptField}.
 */
export type ProviderPromptFieldType = "text" | "multiline" | "password" | "select" | "checkbox";

/**
 * One selectable option of a "select" field. The host validates that the submitted value is one
 * of the options it was given, so a provider cannot smuggle an arbitrary value through the field.
 */
export interface ProviderPromptFieldOption {
    value: string;
    label: string;
}

/**
 * Declarative description of a single input in a {@link ProviderPromptRequest}. The host renders
 * the field itself from this description; providers cannot supply markup or script for it.
 */
export interface ProviderPromptField {
    /** Key this field's value is returned under in the result object. Must be unique within the request. */
    id: string;
    type: ProviderPromptFieldType;
    label?: string;
    /** Ignored for "checkbox" */
    placeholder?: string;
    /** boolean for "checkbox", string for every other field type */
    defaultValue?: string | boolean;
    required?: boolean;
    /** Options shown for a "select" field. Required (and only used) when type is "select". */
    options?: ProviderPromptFieldOption[];
}

/**
 * Request for the host to ask the user for one or more values via a small, host-rendered form.
 */
export interface ProviderPromptRequest {
    title: string;
    message?: string;
    fields: ProviderPromptField[];
    /** Label of the primary action button. Defaults to "OK". */
    confirmLabel?: string;
    /** Label of the dismiss action button. Defaults to "Cancel". */
    cancelLabel?: string;
}

/** Value of a single field in a {@link ProviderPromptResult}: a string for every type except "checkbox", which is a boolean. */
export type ProviderPromptValue = string | boolean;

/** Result of a prompt, keyed by {@link ProviderPromptField.id}. */
export type ProviderPromptResult = Record<string, ProviderPromptValue>;

/**
 * Summary of a registered provider, used for diagnostics and the UI
 */
export interface ConnectionProviderInfo {
    /** Fully qualified provider key (`<extensionId>/<declarationId>`, with ':' in the extension ID replaced by '_') */
    id: string;
    displayName: string;
    extensionId: string;
    status: "starting" | "ready" | "error" | "stopped";
    connectionCount: number;
    error?: string;
}

/**
 * Services the host offers to provider code running in the utility process
 */
export interface ConnectionProviderHost {
    readonly providerId: string;
    acquireEntraToken(request: ProviderEntraTokenRequest): Promise<ProviderEntraTokenResult>;
    prompt(request: ProviderPromptRequest): Promise<ProviderPromptResult | null>;
    log: {
        info(message: string): void;
        warn(message: string): void;
        error(message: string): void;
    };
}

/**
 * Contract implemented by provider modules. The module exports the class (as `module.exports`,
 * `default` or `ConnectionProvider`), which is constructed with a {@link ConnectionProviderHost}.
 */
export interface ConnectionProvider {
    getConnections(): Promise<ProviderConnectionInfo[]>;
    authenticate(connectionId: string, context: ProviderAuthenticateContext): Promise<ProviderAuthenticationResult>;
    getConnectionById?(connectionId: string): Promise<ProviderConnectionInfo | null>;
    signOut?(connectionId?: string): Promise<void>;
    dispose?(): Promise<void>;
}

/**
 * Methods the host can call on a provider through the RPC bridge
 */
export type ConnectionProviderMethod = "getConnections" | "authenticate" | "getConnectionById" | "signOut" | "dispose";

/**
 * Methods the provider can call on the host through the RPC bridge
 */
export type ConnectionProviderHostMethod = "acquireEntraToken" | "prompt";

/**
 * Messages sent from the main process to the provider utility process
 */
export type ConnectionProviderParentMessage =
    | { type: "init"; providerId: string; modulePath: string }
    | { type: "call"; id: number; method: ConnectionProviderMethod; args: unknown[] }
    | { type: "host-result"; id: number; result: unknown }
    | { type: "host-error"; id: number; error: string };

/**
 * Messages sent from the provider utility process to the main process
 */
export type ConnectionProviderChildMessage =
    | { type: "ready"; methods: ConnectionProviderMethod[] }
    | { type: "init-error"; error: string }
    | { type: "result"; id: number; result: unknown }
    | { type: "error"; id: number; error: string }
    | { type: "host-call"; id: number; method: ConnectionProviderHostMethod; args: unknown[] }
    | { type: "log"; level: "info" | "warn" | "error"; message: string };
