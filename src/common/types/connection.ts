/**
 * Connection-related type definitions
 */

/**
 * Authentication type for Dataverse connection
 */
export type AuthenticationType = "interactive" | "clientSecret" | "usernamePassword" | "connectionString";

/**
 * Dataverse connection configuration
 * 
 * Note: This interface represents the persisted connection data.
 * UI-level properties like 'isActive' are NOT part of this type and should be
 * added transiently when needed for rendering (e.g., in modals or lists).
 */
export interface DataverseConnection {
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
}

/**
 * Type guard to check if an object is a valid DataverseConnection
 */
export function isDataverseConnection(obj: unknown): obj is DataverseConnection {
    if (!obj || typeof obj !== "object") return false;
    const conn = obj as Record<string, unknown>;
    return (
        typeof conn.id === "string" &&
        typeof conn.name === "string" &&
        typeof conn.url === "string" &&
        (conn.environment === "Dev" || conn.environment === "Test" || conn.environment === "UAT" || conn.environment === "Production") &&
        (conn.authenticationType === "interactive" || conn.authenticationType === "clientSecret" || conn.authenticationType === "usernamePassword" || conn.authenticationType === "connectionString")
    );
}

/**
 * UI-level connection data that extends DataverseConnection with display properties
 * Use this type when rendering connections in lists, modals, or other UI components
 */
export interface UIConnectionData {
    id: string;
    name: string;
    url: string;
    environment: DataverseConnection["environment"];
    authenticationType: AuthenticationType;
    isActive: boolean;
}

/**
 * Parse a Dataverse connection string into connection properties
 * Supports various connection string formats including:
 * - AuthType=OAuth;Username=user@domain.com;Password=password;Url=https://org.crm.dynamics.com;
 * - AuthType=ClientSecret;ClientId=xxx;ClientSecret=yyy;Url=https://org.crm.dynamics.com;TenantId=zzz;
 * 
 * @param connectionString The connection string to parse
 * @returns Parsed connection properties or null if invalid
 */
export function parseConnectionString(connectionString: string): Partial<DataverseConnection> | null {
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

    // URL is required
    if (!parts.url) {
        return null;
    }

    const result: Partial<DataverseConnection> = {
        url: parts.url,
    };

    // Determine authentication type based on AuthType or available credentials
    const authType = parts.authtype?.toLowerCase();
    
    if (authType === "oauth" || (parts.username && parts.password)) {
        result.authenticationType = "usernamePassword";
        result.username = parts.username;
        result.password = parts.password;
    } else if (authType === "clientsecret" || (parts.clientid && parts.clientsecret)) {
        result.authenticationType = "clientSecret";
        result.clientId = parts.clientid;
        result.clientSecret = parts.clientsecret;
        result.tenantId = parts.tenantid;
    } else {
        // Default to interactive if no specific auth type is determined
        result.authenticationType = "interactive";
    }

    return result;
}
