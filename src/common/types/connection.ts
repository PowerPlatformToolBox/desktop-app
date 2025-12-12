/**
 * Connection-related type definitions
 */

/**
 * Authentication type for Dataverse connection
 */
export type AuthenticationType = "interactive" | "clientSecret" | "usernamePassword";

/**
 * Dataverse connection configuration
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
        (conn.authenticationType === "interactive" || conn.authenticationType === "clientSecret" || conn.authenticationType === "usernamePassword")
    );
}
