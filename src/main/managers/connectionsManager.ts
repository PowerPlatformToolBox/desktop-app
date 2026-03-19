import { randomUUID } from "crypto";
import Store from "electron-store";
import { DataverseConnection } from "../../common/types";
import { EncryptionManager } from "./encryptionManager";
import { logInfo } from "../../common/logger";

/**
 * Sensitive fields that should be encrypted in DataverseConnection objects
 */
const SENSITIVE_CONNECTION_FIELDS: (keyof DataverseConnection)[] = ["clientId", "clientSecret", "accessToken", "refreshToken", "password"];

/**
 * Fields that must NOT be included in connection exports (secrets/tokens)
 */
const EXPORT_EXCLUDED_FIELDS: (keyof DataverseConnection)[] = ["clientSecret", "password", "accessToken", "refreshToken", "tokenExpiry", "msalAccountId"];

/**
 * Fields required for a valid importable connection
 */
const REQUIRED_IMPORT_FIELDS: (keyof DataverseConnection)[] = ["name", "url", "environment", "authenticationType"];

const VALID_ENVIRONMENTS = new Set(["Dev", "Test", "UAT", "Production"]);
const VALID_AUTH_TYPES = new Set(["interactive", "clientSecret", "usernamePassword", "connectionString"]);

/**
 * Manages Dataverse connections with encryption for sensitive data
 */
export class ConnectionsManager {
    private store: Store<{ connections: DataverseConnection[] }>;
    private encryptionManager: EncryptionManager;

    constructor() {
        this.encryptionManager = new EncryptionManager();

        this.store = new Store<{ connections: DataverseConnection[] }>({
            name: "connections",
            defaults: {
                connections: [],
            },
        });

        // Migrate existing connections to encrypted storage if needed
        this.migrateConnectionsToEncrypted();
    }

    /**
     * Migrate existing plain-text connections to encrypted storage
     * This is safe to call multiple times - it will only encrypt unencrypted data
     */
    private migrateConnectionsToEncrypted(): void {
        const connections = this.store.get("connections");
        let needsMigration = false;

        // Check if any connection has unencrypted sensitive data
        // We can detect this by checking if encryption is available and the data looks like plain text
        if (this.encryptionManager.isEncryptionAvailable()) {
            for (const conn of connections) {
                // If clientSecret exists and looks like plain text (not base64), it needs migration
                if (conn.clientSecret && !this.isLikelyEncrypted(conn.clientSecret)) {
                    needsMigration = true;
                    break;
                }
                if (conn.accessToken && !this.isLikelyEncrypted(conn.accessToken)) {
                    needsMigration = true;
                    break;
                }
            }
        }

        if (needsMigration) {
            logInfo("Migrating connections to encrypted storage...");
            const encryptedConnections = connections.map((conn) => this.encryptionManager.encryptFields(conn, SENSITIVE_CONNECTION_FIELDS));
            this.store.set("connections", encryptedConnections);
            logInfo("Connection migration complete");
        }
    }

    /**
     * Check if a string is likely to be encrypted (base64 encoded)
     */
    private isLikelyEncrypted(value: string): boolean {
        // Base64 strings are typically much longer and contain only certain characters
        // This is a heuristic, not perfect, but good enough for migration detection
        return /^[A-Za-z0-9+/]+=*$/.test(value) && value.length > 100;
    }

    /**
     * Add a Dataverse connection with encrypted sensitive fields
     */
    addConnection(connection: DataverseConnection): void {
        const connections = this.store.get("connections");

        // Encrypt sensitive fields before storing
        const encryptedConnection = this.encryptionManager.encryptFields(connection, SENSITIVE_CONNECTION_FIELDS);

        connections.push(encryptedConnection);
        this.store.set("connections", connections);
    }

    /**
     * Update a Dataverse connection with encryption for sensitive fields
     */
    updateConnection(id: string, updates: Partial<DataverseConnection>): void {
        const connections = this.store.get("connections");
        const index = connections.findIndex((c) => c.id === id);
        if (index !== -1) {
            // Encrypt any sensitive fields in the updates
            const encryptedUpdates = this.encryptionManager.encryptFields(updates as DataverseConnection, SENSITIVE_CONNECTION_FIELDS);

            connections[index] = { ...connections[index], ...encryptedUpdates };
            this.store.set("connections", connections);
        }
    }

    /**
     * Delete a Dataverse connection
     */
    deleteConnection(id: string): void {
        const connections = this.store.get("connections");
        const filtered = connections.filter((c) => c.id !== id);
        this.store.set("connections", filtered);
    }

    /**
     * Get all connections with decrypted sensitive fields
     */
    getConnections(): DataverseConnection[] {
        const connections = this.store.get("connections");

        // Decrypt sensitive fields for each connection
        return connections.map((conn) => this.encryptionManager.decryptFields(conn, SENSITIVE_CONNECTION_FIELDS));
    }

    /**
     * Update connection tokens with encryption (called after authentication/refresh)
     */
    updateConnectionTokens(id: string, authTokens: { accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string }): void {
        const connections = this.store.get("connections");
        const connection = connections.find((c) => c.id === id);

        if (!connection) {
            throw new Error("Connection not found");
        }

        // Update lastUsedAt timestamp
        connection.lastUsedAt = new Date().toISOString();

        // Encrypt tokens before storing
        connection.accessToken = this.encryptionManager.encrypt(authTokens.accessToken);
        connection.refreshToken = authTokens.refreshToken ? this.encryptionManager.encrypt(authTokens.refreshToken) : undefined;
        connection.tokenExpiry = authTokens.expiresOn.toISOString();

        // Store MSAL account ID for silent token acquisition (not encrypted - just an identifier)
        if (authTokens.msalAccountId !== undefined) {
            connection.msalAccountId = authTokens.msalAccountId;
        }

        this.store.set("connections", connections);
    }

    /**
     * Clear authentication tokens for a connection
     * This is useful when MSAL cache is cleared (e.g., after app restart) and tokens are no longer valid
     */
    clearConnectionTokens(id: string): void {
        const connections = this.store.get("connections");
        const connection = connections.find((c) => c.id === id);

        if (!connection) {
            throw new Error("Connection not found");
        }

        // Clear all authentication tokens
        connection.accessToken = undefined;
        connection.refreshToken = undefined;
        connection.tokenExpiry = undefined;
        connection.msalAccountId = undefined;

        this.store.set("connections", connections);
        logInfo(`[ConnectionsManager] Cleared tokens for connection: ${connection.name}`);
    }

    /**
     * Clear authentication tokens for all connections
     * This is useful when MSAL cache is cleared (e.g., after app restart) and tokens are no longer valid
     */
    clearAllConnectionTokens(): void {
        const connections = this.store.get("connections");

        for (const connection of connections) {
            // Clear all authentication tokens
            connection.accessToken = undefined;
            connection.refreshToken = undefined;
            connection.tokenExpiry = undefined;
            connection.msalAccountId = undefined;
        }

        this.store.set("connections", connections);
        logInfo(`[ConnectionsManager] Cleared tokens for all connections`);
    }

    /**
     * Get connection by ID with decrypted sensitive fields
     */
    getConnectionById(id: string): DataverseConnection | null {
        const connections = this.store.get("connections");
        const connection = connections.find((c) => c.id === id);

        if (!connection) {
            return null;
        }

        // Decrypt sensitive fields
        return this.encryptionManager.decryptFields(connection, SENSITIVE_CONNECTION_FIELDS);
    }

    /**
     * Check if a connection's token is expired
     */
    isConnectionTokenExpired(connectionId: string): boolean {
        const connections = this.store.get("connections");
        const connection = connections.find((c) => c.id === connectionId);

        if (!connection || !connection.tokenExpiry) {
            return false;
        }

        const expiryDate = new Date(connection.tokenExpiry);
        const now = new Date();

        return expiryDate.getTime() <= now.getTime();
    }

    /**
     * Export connections as a sanitized JSON object (no secrets/tokens).
     * @param ids Optional array of connection IDs to export. If omitted, all connections are exported.
     * @returns A JSON-serializable export payload.
     */
    exportConnections(ids?: string[]): { version: 1; exportedAt: string; connections: Partial<DataverseConnection>[] } {
        const decrypted = this.getConnections();
        const toExport = ids && ids.length > 0 ? decrypted.filter((c) => ids.includes(c.id)) : decrypted;

        const sanitized = toExport.map((conn) => {
            const sanitizedConn = { ...conn } as Partial<DataverseConnection>;
            for (const field of EXPORT_EXCLUDED_FIELDS) {
                delete sanitizedConn[field];
            }
            // Never export the hasIncompleteCredentials flag – it is internal state
            delete sanitizedConn.hasIncompleteCredentials;
            return sanitizedConn;
        });

        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            connections: sanitized,
        };
    }

    /**
     * Import connections from a parsed JSON export payload.
     * Validates structure; marks connections with missing required secrets as incomplete.
     * @throws Error if the payload is structurally invalid.
     * @returns Summary of imported and skipped connections.
     */
    importConnections(data: unknown): { imported: number; skipped: number; warnings: string[] } {
        // --- Top-level structure validation ---
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("Invalid import file: expected a JSON object.");
        }

        const payload = data as Record<string, unknown>;

        if (payload.version !== 1) {
            throw new Error(`Unsupported export version: ${String(payload.version)}. Expected version 1.`);
        }

        if (!Array.isArray(payload.connections)) {
            throw new Error("Invalid import file: 'connections' must be an array.");
        }

        if (payload.connections.length === 0) {
            throw new Error("Import file contains no connections.");
        }

        const existingConnections = this.store.get("connections");
        const existingIds = new Set(existingConnections.map((c) => c.id));

        let imported = 0;
        let skipped = 0;
        const warnings: string[] = [];

        for (const raw of payload.connections as unknown[]) {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
                skipped++;
                warnings.push(`Skipped an entry that is not a valid object.`);
                continue;
            }

            const entry = raw as Record<string, unknown>;
            const connName = typeof entry.name === "string" ? entry.name : "(unknown)";

            // Validate required fields
            const missingRequiredFields: string[] = [];
            for (const field of REQUIRED_IMPORT_FIELDS) {
                if (!entry[field] || typeof entry[field] !== "string") {
                    missingRequiredFields.push(field);
                }
            }

            if (missingRequiredFields.length > 0) {
                skipped++;
                warnings.push(`Skipped "${connName}": missing required fields: ${missingRequiredFields.join(", ")}.`);
                continue;
            }

            if (!VALID_ENVIRONMENTS.has(entry.environment as string)) {
                skipped++;
                warnings.push(`Skipped "${connName}": invalid environment "${String(entry.environment)}". Must be Dev, Test, UAT, or Production.`);
                continue;
            }

            if (!VALID_AUTH_TYPES.has(entry.authenticationType as string)) {
                skipped++;
                warnings.push(`Skipped "${connName}": invalid authenticationType "${String(entry.authenticationType)}".`);
                continue;
            }

            // Determine if credentials are incomplete for this auth type
            const authType = entry.authenticationType as string;
            let hasIncompleteCredentials = false;

            if (authType === "clientSecret") {
                if (!entry.clientSecret || typeof entry.clientSecret !== "string") {
                    hasIncompleteCredentials = true;
                    warnings.push(`Connection "${connName}" imported with warning: missing clientSecret.`);
                }
            } else if (authType === "usernamePassword") {
                if (!entry.password || typeof entry.password !== "string") {
                    hasIncompleteCredentials = true;
                    warnings.push(`Connection "${connName}" imported with warning: missing password.`);
                }
            }

            // Generate a new unique ID if the existing one is already taken
            let newId = typeof entry.id === "string" && entry.id ? entry.id : randomUUID();
            if (existingIds.has(newId)) {
                newId = randomUUID();
            }
            existingIds.add(newId);

            const newConnection: DataverseConnection = {
                id: newId,
                name: entry.name as string,
                url: entry.url as string,
                environment: entry.environment as DataverseConnection["environment"],
                authenticationType: entry.authenticationType as DataverseConnection["authenticationType"],
                createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
                clientId: typeof entry.clientId === "string" ? entry.clientId : undefined,
                clientSecret: typeof entry.clientSecret === "string" ? entry.clientSecret : undefined,
                tenantId: typeof entry.tenantId === "string" ? entry.tenantId : undefined,
                username: typeof entry.username === "string" ? entry.username : undefined,
                password: typeof entry.password === "string" ? entry.password : undefined,
                browserType: typeof entry.browserType === "string" ? (entry.browserType as DataverseConnection["browserType"]) : undefined,
                browserProfile: typeof entry.browserProfile === "string" ? entry.browserProfile : undefined,
                browserProfileName: typeof entry.browserProfileName === "string" ? entry.browserProfileName : undefined,
                category: typeof entry.category === "string" ? entry.category : undefined,
                environmentColor: typeof entry.environmentColor === "string" ? entry.environmentColor : undefined,
                categoryColor: typeof entry.categoryColor === "string" ? entry.categoryColor : undefined,
                hasIncompleteCredentials,
            };

            // Encrypt sensitive fields and persist
            const encryptedConnection = this.encryptionManager.encryptFields(newConnection, SENSITIVE_CONNECTION_FIELDS);
            existingConnections.push(encryptedConnection);
            imported++;
        }

        if (imported > 0) {
            this.store.set("connections", existingConnections);
            logInfo(`[ConnectionsManager] Imported ${imported} connection(s), skipped ${skipped}.`);
        }

        return { imported, skipped, warnings };
    }
}
