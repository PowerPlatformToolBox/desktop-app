import Store from 'electron-store';
import { DataverseConnection } from '../../types';
import { EncryptionManager } from './encryptionManager';

/**
 * Sensitive fields that should be encrypted in DataverseConnection objects
 */
const SENSITIVE_CONNECTION_FIELDS: (keyof DataverseConnection)[] = [
  'clientId',
  'clientSecret',
  'accessToken',
  'refreshToken',
  'password',
];

/**
 * Manages Dataverse connections with encryption for sensitive data
 */
export class ConnectionsManager {
  private store: Store<{ connections: DataverseConnection[] }>;
  private encryptionManager: EncryptionManager;

  constructor() {
    this.encryptionManager = new EncryptionManager();
    
    this.store = new Store<{ connections: DataverseConnection[] }>({
      name: 'connections',
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
    const connections = this.store.get('connections');
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
      console.log('Migrating connections to encrypted storage...');
      const encryptedConnections = connections.map(conn => 
        this.encryptionManager.encryptFields(conn, SENSITIVE_CONNECTION_FIELDS)
      );
      this.store.set('connections', encryptedConnections);
      console.log('Connection migration complete');
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
    const connections = this.store.get('connections');
    // If this is the first connection or marked as active, make it active
    if (connections.length === 0 || connection.isActive) {
      // Deactivate all other connections
      connections.forEach(c => c.isActive = false);
      connection.isActive = true;
    }
    
    // Encrypt sensitive fields before storing
    const encryptedConnection = this.encryptionManager.encryptFields(
      connection, 
      SENSITIVE_CONNECTION_FIELDS
    );
    
    connections.push(encryptedConnection);
    this.store.set('connections', connections);
  }

  /**
   * Update a Dataverse connection with encryption for sensitive fields
   */
  updateConnection(id: string, updates: Partial<DataverseConnection>): void {
    const connections = this.store.get('connections');
    const index = connections.findIndex(c => c.id === id);
    if (index !== -1) {
      // Encrypt any sensitive fields in the updates
      const encryptedUpdates = this.encryptionManager.encryptFields(
        updates as DataverseConnection, 
        SENSITIVE_CONNECTION_FIELDS
      );
      
      connections[index] = { ...connections[index], ...encryptedUpdates };
      this.store.set('connections', connections);
    }
  }

  /**
   * Delete a Dataverse connection
   */
  deleteConnection(id: string): void {
    const connections = this.store.get('connections');
    const filtered = connections.filter(c => c.id !== id);
    this.store.set('connections', filtered);
  }

  /**
   * Get all connections with decrypted sensitive fields
   */
  getConnections(): DataverseConnection[] {
    const connections = this.store.get('connections');
    
    // Decrypt sensitive fields for each connection
    return connections.map(conn => 
      this.encryptionManager.decryptFields(conn, SENSITIVE_CONNECTION_FIELDS)
    );
  }

  /**
   * Set active connection (only one can be active at a time) with encrypted tokens
   */
  setActiveConnection(id: string, authTokens?: { accessToken: string; refreshToken?: string; expiresOn: Date }): void {
    const connections = this.store.get('connections');
    connections.forEach(c => {
      c.isActive = c.id === id;
      if (c.isActive) {
        c.lastUsedAt = new Date().toISOString();
        if (authTokens) {
          // Encrypt tokens before storing
          c.accessToken = this.encryptionManager.encrypt(authTokens.accessToken);
          c.refreshToken = authTokens.refreshToken 
            ? this.encryptionManager.encrypt(authTokens.refreshToken)
            : undefined;
          c.tokenExpiry = authTokens.expiresOn.toISOString();
        }
      }
    });
    this.store.set('connections', connections);
  }

  /**
   * Get the currently active connection with decrypted sensitive fields
   */
  getActiveConnection(): DataverseConnection | null {
    const connections = this.store.get('connections');
    const activeConnection = connections.find(c => c.isActive);
    
    if (!activeConnection) {
      return null;
    }
    
    // Decrypt sensitive fields
    return this.encryptionManager.decryptFields(activeConnection, SENSITIVE_CONNECTION_FIELDS);
  }

  /**
   * Disconnect (deactivate) the current connection
   */
  disconnectActiveConnection(): void {
    const connections = this.store.get('connections');
    connections.forEach(c => c.isActive = false);
    this.store.set('connections', connections);
  }
}
