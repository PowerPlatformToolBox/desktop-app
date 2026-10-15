/**
 * Connection-related type definitions
 */

/**
 * Authentication type for Dataverse connection
 */
export type AuthenticationType = "interactive" | "clientSecret" | "usernamePassword" | "connectionString";

export type ConnectionType = "dataverse" | "financeOperations";

/** Legacy connections without a discriminator are Dataverse connections. */
export function resolveConnectionType(value: unknown): ConnectionType {
    if (value === undefined) return "dataverse";
    if (value === "dataverse" || value === "financeOperations") return value;
    throw new Error(`Invalid connection type: ${String(value)}`);
}

export function assertDataverseConnection(connection: Pick<Connection, "connectionType">): void {
    if (resolveConnectionType(connection.connectionType) !== "dataverse") {
        throw new Error("This operation requires a Dataverse connection. Finance & Operations support is not available for this API.");
    }
}

/** Normalize hosted F&O environment roots, including pasted service roots. */
export function normalizeFinanceOperationsUrl(value: string): string {
    const trimmed = value.trim();
    // Check before URL parsing can remove dot segments or backslashes.
    if (!/^https:\/\/[^/?#\\]+(?:\/data\/?)?\/?$/.test(trimmed)) {
        throw new Error("Finance & Operations URL must be an HTTPS environment root or /data service root.");
    }
    const url = new URL(trimmed);
    if (url.username || url.password || url.search || url.hash || !["/", "/data", "/data/"].includes(url.pathname)) {
        throw new Error("Finance & Operations URL must be an HTTPS environment root or /data service root.");
    }
    return url.origin;
}

/** Shared validation for persistence and imports, including incomplete exports. */
export function normalizeConnection(connection: Connection): NormalizedConnection {
    const connectionType = resolveConnectionType(connection.connectionType);
    if (!["interactive", "clientSecret", "usernamePassword", "connectionString"].includes(connection.authenticationType)) {
        throw new Error(`Invalid authentication type: ${String(connection.authenticationType)}`);
    }
    if (connectionType === "dataverse") return { ...connection, connectionType };
    if (connection.authenticationType !== "interactive" && connection.authenticationType !== "clientSecret") {
        throw new Error("Finance & Operations supports interactive and client-secret authentication only.");
    }
    if (!connection.clientId?.trim() || !connection.tenantId?.trim()) {
        throw new Error("Finance & Operations requires a client ID and tenant ID.");
    }
    if (connection.enabledForPowerPlatformAPI || connection.powerPlatformAccessToken !== undefined || connection.powerPlatformTokenExpiry !== undefined || connection.scopesForPowerPlatformAPI !== undefined) {
        throw new Error("Finance & Operations connections cannot enable Power Platform API access.");
    }
    return {
        ...connection,
        connectionType,
        authenticationType: connection.authenticationType,
        clientId: connection.clientId,
        tenantId: connection.tenantId,
        enabledForPowerPlatformAPI: false,
        powerPlatformAccessToken: undefined,
        powerPlatformTokenExpiry: undefined,
        scopesForPowerPlatformAPI: undefined,
        url: normalizeFinanceOperationsUrl(connection.url),
    };
}

/**
 * Browser type for interactive authentication
 *
 * Note: Firefox and Brave may be added here in the future when BrowserManager supports them.
 */
export type BrowserType = "default" | "chrome" | "edge";

/**
 * Power Platform ToolBox connection configuration
 *
 * Note: This interface represents the persisted connection data.
 * UI-level properties like 'isActive' are NOT part of this type and should be
 * added transiently when needed for rendering (e.g., in modals or lists).
 */
export interface Connection {
    /** Omitted for legacy Dataverse records; normalized when persisted. */
    connectionType?: ConnectionType;
    id: string;
    name: string;
    url: string;
    environment: "Dev" | "Test" | "UAT" | "Production";
    authenticationType: AuthenticationType;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    username?: string;
    password?: string;
    createdAt: string;
    lastUsedAt?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: string;
    // MSAL account identifier for silent token acquisition (used with interactive auth)
    msalAccountId?: string;
    // Browser profile settings for interactive authentication
    browserType?: BrowserType;
    browserProfile?: string;
    browserProfileName?: string;
    // Grouping and visual customization
    category?: string;
    environmentColor?: string;
    categoryColor?: string;
    // Import state: true when the connection was imported but is missing required secrets/credentials
    hasIncompleteCredentials?: boolean;
    // Whether this connection can be used for Power Platform API operations
    enabledForPowerPlatformAPI?: boolean;
    // Granted scopes for Power Platform API authentication
    scopesForPowerPlatformAPI?: string[];
    // Separate access token for Power Platform API (https://api.powerplatform.com scope)
    powerPlatformAccessToken?: string;
    // Expiry for the Power Platform access token
    powerPlatformTokenExpiry?: string;
}

/**
 * Type guard to check if an object is a valid Connection
 */
export function isConnection(obj: unknown): obj is Connection {
    if (!obj || typeof obj !== "object") return false;
    const conn = obj as Record<string, unknown>;
    return (
        typeof conn.id === "string" &&
        typeof conn.name === "string" &&
        typeof conn.url === "string" &&
        (conn.environment === "Dev" || conn.environment === "Test" || conn.environment === "UAT" || conn.environment === "Production") &&
        (conn.authenticationType === "interactive" || conn.authenticationType === "clientSecret" || conn.authenticationType === "usernamePassword" || conn.authenticationType === "connectionString") &&
        isSupportedConnectionConfiguration(conn)
    );
}

/** Validated records narrow authentication and configuration by product. */
export type NormalizedConnection =
    | (Connection & { connectionType: "dataverse" })
    | (Connection & {
          connectionType: "financeOperations";
          authenticationType: "interactive" | "clientSecret";
          clientId: string;
          tenantId: string;
          enabledForPowerPlatformAPI: false;
          powerPlatformAccessToken?: never;
          powerPlatformTokenExpiry?: never;
          scopesForPowerPlatformAPI?: never;
      });

function isSupportedConnectionConfiguration(connection: Record<string, unknown>): boolean {
    try {
        normalizeConnection(connection as unknown as Connection);
        return true;
    } catch {
        return false;
    }
}

/**
 * UI-level connection data that extends Connection with display properties
 * Use this type when rendering connections in lists, modals, or other UI components
 */
export interface UIConnectionData {
    connectionType?: ConnectionType;
    id: string;
    name: string;
    url: string;
    environment: Connection["environment"];
    authenticationType: AuthenticationType;
    isActive: boolean;
    lastUsedAt?: string;
    createdAt?: string;
    browserType?: BrowserType;
    browserProfile?: string;
    browserProfileName?: string;
    category?: string;
    environmentColor?: string;
    categoryColor?: string;
    hasIncompleteCredentials?: boolean;
    enabledForPowerPlatformAPI?: boolean;
}

/**
 * Parse a Dataverse connection string into connection properties
 * Reference: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/xrm-tooling/use-connection-strings-xrm-tooling-connect
 *
 * Supported formats:
 * - Office365 (Username/Password): AuthType=Office365;Username=user@domain.com;Password=pass;Url=https://org.crm.dynamics.com
 * - OAuth (Interactive): AuthType=OAuth;Username=user@domain.com;Url=https://org.crm.dynamics.com;AppId=xxx;RedirectUri=yyy
 * - ClientSecret: AuthType=ClientSecret;ClientId=xxx;ClientSecret=yyy;Url=https://org.crm.dynamics.com
 *
 * @param connectionString The connection string to parse
 * @returns Parsed connection properties or null if invalid
 */
export function parseConnectionString(connectionString: string): Partial<Connection> | null {
    if (!connectionString || typeof connectionString !== "string") {
        return null;
    }

    const parts: { [key: string]: string } = {};

    // Split by semicolon and parse key=value pairs
    const segments = connectionString.split(";").filter((s) => s.trim());

    for (const segment of segments) {
        const [key, ...valueParts] = segment.split("=");
        if (key && valueParts.length > 0) {
            const value = valueParts.join("=").trim(); // Rejoin in case value contains '='
            parts[key.trim().toLowerCase()] = value;
        }
    }

    // URL is required (can be Url or ServiceUri per Microsoft docs)
    const url = parts.url || parts.serviceuri;
    if (!url) {
        return null;
    }

    const result: Partial<Connection> = {
        url: url,
    };

    // Parse authentication type based on Microsoft standard
    const authType = parts.authtype?.toLowerCase();

    // Office365 = Username/Password authentication
    if (authType === "office365") {
        result.authenticationType = "usernamePassword";
        result.username = parts.username;
        result.password = parts.password;
    }
    // OAuth = Interactive authentication (browser-based)
    else if (authType === "oauth") {
        result.authenticationType = "interactive";
        result.username = parts.username; // Optional login hint
        result.clientId = parts.appid; // Optional AppId
        result.tenantId = parts.tenantid; // Optional TenantId
    }
    // ClientSecret = Service Principal authentication
    else if (authType === "clientsecret") {
        result.authenticationType = "clientSecret";
        result.clientId = parts.clientid;
        result.clientSecret = parts.clientsecret;
        result.tenantId = parts.tenantid;
    }
    // No AuthType specified - infer from available credentials
    else if (parts.username && parts.password) {
        // If username and password provided without AuthType, assume Office365
        result.authenticationType = "usernamePassword";
        result.username = parts.username;
        result.password = parts.password;
    } else if (parts.clientid && parts.clientsecret) {
        // If client credentials provided without AuthType, assume ClientSecret
        result.authenticationType = "clientSecret";
        result.clientId = parts.clientid;
        result.clientSecret = parts.clientsecret;
        result.tenantId = parts.tenantid;
    } else {
        // Default to interactive if no credentials provided
        result.authenticationType = "interactive";
    }

    return result;
}
