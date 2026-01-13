import Store from "electron-store";
import { captureMessage } from "../../common/sentryHelper";
import { DataverseConnection } from "../../common/types";
import { EncryptionManager } from "./encryptionManager";

/**
 * Sensitive fields that should be encrypted in DataverseConnection objects
 */
const SENSITIVE_CONNECTION_FIELDS: (keyof DataverseConnection)[] = ["clientId", "clientSecret", "accessToken", "refreshToken", "password"];

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
            captureMessage("Migrating connections to encrypted storage...");
            const encryptedConnections = connections.map((conn) => this.encryptionManager.encryptFields(conn, SENSITIVE_CONNECTION_FIELDS));
            this.store.set("connections", encryptedConnections);
            captureMessage("Connection migration complete");
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
    updateConnectionTokens(id: string, authTokens: { accessToken: string; refreshToken?: string; expiresOn: Date }): void {
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

        this.store.set("connections", connections);
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
}
