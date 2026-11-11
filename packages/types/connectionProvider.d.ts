/**
 * Power Platform ToolBox - Connection Provider Type Definitions
 *
 * Extensions can contribute connection providers in addition to tools. A provider lists Dataverse
 * connections and acquires access tokens for them. Its connections are shown alongside the user's
 * own connections, and the provider is asked for a token whenever one of them is opened.
 *
 * Declare providers in the extension's package.json:
 *
 * ```json
 * "pptbConnectionProviders": [
 *     { "id": "contoso", "displayName": "Contoso", "main": "dist/provider.js" }
 * ]
 * ```
 *
 * The `main` module must be CommonJS and export the provider class as `module.exports`, `default`
 * or `ConnectionProvider`. It runs in an isolated Node.js utility process, not in the tool's web view.
 *
 * @example
 * ```js
 * /// <reference types="@pptb/types/connectionProvider" />
 * class ContosoProvider {
 *     constructor(host) { this.host = host; }
 *     async getConnections() { return [{ id: "prod", name: "Production", url: "https://contoso.crm.dynamics.com" }]; }
 *     async authenticate(id, context) { return { accessToken: "...", expiresOn: new Date(Date.now() + 3600000).toISOString() }; }
 * }
 * module.exports = ContosoProvider;
 * ```
 */

/** Entry in the `pptbConnectionProviders` array of an extension's package.json */
export interface ConnectionProviderDeclaration {
    /** Identifier unique to the extension. Letters, digits, '.', '_' and '-' only (max 64 characters). */
    id: string;
    /** Name shown to the user alongside the provider's connections. Defaults to `id`. */
    displayName?: string;
    /** Path of the CommonJS provider module, relative to the extension root. Must stay inside the extension folder. */
    main: string;
}

/** A connection returned by {@link ConnectionProvider.getConnections} */
export interface ProviderConnectionInfo {
    /** Identifier unique within the provider (max 512 characters, no control characters) */
    id: string;
    /** Display name */
    name: string;
    /** Dataverse environment URL. Must use HTTPS; only the origin is kept. */
    url: string;
    /** Defaults to "Production" */
    environment?: "Dev" | "Test" | "UAT" | "Production";
    /** Group shown in the connections list. Defaults to the provider's display name. */
    category?: string;
    /**
     * Colour applied to the category badge/group for this connection, as a 6-digit hex string
     * (e.g. "#6b2fb3"). Ignored if not a valid hex colour.
     */
    categoryColor?: string;
    username?: string;
    description?: string;
}

/** Identifies the tool instance using a connection. Only non-sensitive identity is included. */
export interface ProviderAuthenticateToolContext {
    toolId: string;
    toolName: string;
    toolVersion: string;
    /** Unique to this open tool window; stable for the lifetime of that window */
    instanceId: string;
}

/** Context passed to {@link ConnectionProvider.authenticate} */
export interface ProviderAuthenticateContext {
    /**
     * - `connect`: the user is opening the connection
     * - `refresh`: a previously issued token has expired or is about to; avoid prompting the user if possible
     */
    reason: "connect" | "refresh";
    /**
     * The tool currently using this connection, when known. Undefined when the connection is being
     * activated or refreshed directly from the main app window rather than from within a tool, or
     * when several tools share the connection and none can be identified unambiguously.
     */
    tool?: ProviderAuthenticateToolContext;
}

/** Token returned by {@link ConnectionProvider.authenticate} */
export interface ProviderAuthenticationResult {
    /** Bearer token for the Dataverse environment */
    accessToken: string;
    /** Expiry as an ISO 8601 string or a millisecond timestamp */
    expiresOn: string | number;
}

/**
 * Request for the host to acquire a Microsoft Entra ID token on the provider's behalf (public client, loopback redirect).
 * The host tries silent acquisition first and falls back to an interactive browser sign-in.
 */
export interface ProviderEntraTokenRequest {
    /** Application (client) ID of a public client app registration */
    clientId: string;
    /** Tenant ID or domain, e.g. "contoso.onmicrosoft.com". Defaults to "organizations". */
    tenantId?: string;
    scopes: string[];
    loginHint?: string;
    /** Skip the silent attempt and always show the interactive sign-in */
    forceInteractive?: boolean;
}

export interface ProviderEntraTokenResult {
    accessToken: string;
    /** ISO 8601 expiry */
    expiresOn: string;
    username?: string;
}

/** Kind of input control rendered for a {@link ProviderPromptField} */
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
    /** Prevent submitting without a value ("checkbox" must be checked) */
    required?: boolean;
    /** Options shown for a "select" field. Required (and only used) when type is "select". */
    options?: ProviderPromptFieldOption[];
}

/** Request for the host to ask the user for one or more values via a small, host-rendered form */
export interface ProviderPromptRequest {
    title: string;
    message?: string;
    /** At least one field is required */
    fields: ProviderPromptField[];
    /** Label of the primary action button. Defaults to "OK". */
    confirmLabel?: string;
    /** Label of the dismiss action button. Defaults to "Cancel". */
    cancelLabel?: string;
}

/** Value of a single field in a {@link ProviderPromptResult}: a string for every type except "checkbox", which is a boolean */
export type ProviderPromptValue = string | boolean;

/** Result of a prompt, keyed by {@link ProviderPromptField.id} */
export type ProviderPromptResult = Record<string, ProviderPromptValue>;

/** Services the host passes to the provider's constructor */
export interface ConnectionProviderHost {
    /** Fully qualified provider key */
    readonly providerId: string;
    acquireEntraToken(request: ProviderEntraTokenRequest): Promise<ProviderEntraTokenResult>;
    /** Resolves to the field values keyed by field ID, or null if the user cancelled */
    prompt(request: ProviderPromptRequest): Promise<ProviderPromptResult | null>;
    log: {
        info(message: string): void;
        warn(message: string): void;
        error(message: string): void;
    };
}

/** Contract implemented by the class exported from a provider module */
export interface ConnectionProvider {
    /** List the connections available to the user. May sign the user in interactively. */
    getConnections(): Promise<ProviderConnectionInfo[]>;
    /** Get an access token for one of the provider's connections. Throw an Error to fail with a user-visible message. */
    authenticate(connectionId: string, context: ProviderAuthenticateContext): Promise<ProviderAuthenticationResult>;
    getConnectionById?(connectionId: string): Promise<ProviderConnectionInfo | null>;
    /** Discard cached credentials for one connection, or all when no ID is given */
    signOut?(connectionId?: string): Promise<void>;
    /** Called before the provider process is stopped */
    dispose?(): Promise<void>;
}

/** Constructor signature of a provider class */
export type ConnectionProviderConstructor = new (host: ConnectionProviderHost) => ConnectionProvider;
