import { BrowserWindow } from 'electron';
import { PublicClientApplication, LogLevel } from '@azure/msal-node';
import { DataverseConnection } from '../../types';
import * as https from 'https';

/**
 * Manages authentication for Power Platform connections
 */
export class AuthManager {
  private msalApp: PublicClientApplication | null = null;

  constructor() {
    // MSAL will be initialized on-demand for interactive auth
  }

  /**
   * Initialize MSAL for interactive authentication
   */
  private initializeMsal(clientId?: string): PublicClientApplication {
    const msalConfig = {
      auth: {
        clientId: clientId || '51f81489-12ee-4a9e-aaae-a2591f45987d', // Default Azure CLI client ID
        authority: 'https://login.microsoftonline.com/common',
      },
      system: {
        loggerOptions: {
          loggerCallback(loglevel: LogLevel, message: string) {
            console.log(message);
          },
          piiLoggingEnabled: false,
          logLevel: LogLevel.Warning,
        },
      },
    };

    return new PublicClientApplication(msalConfig);
  }

  /**
   * Authenticate using interactive Microsoft login
   */
  async authenticateInteractive(
    connection: DataverseConnection,
    parentWindow?: BrowserWindow
  ): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
    const clientId = connection.clientId || '51f81489-12ee-4a9e-aaae-a2591f45987d';
    this.msalApp = this.initializeMsal(clientId);

    const scopes = [`${connection.url}/.default`];

    try {
      // For interactive authentication, we'll use device code flow which is simpler
      // and doesn't require a browser window redirect
      const deviceCodeRequest = {
        scopes: scopes,
        deviceCodeCallback: (response: any) => {
          // Show the device code to the user
          console.log('Device Code:', response.message);
          // In a real implementation, show this in a dialog
          parentWindow?.webContents.send('device-code', response.message);
        },
      };

      const response: any = await (this.msalApp as any).acquireTokenByDeviceCode(deviceCodeRequest);

      return {
        accessToken: response.accessToken,
        refreshToken: response.account?.homeAccountId, // Store account ID for token refresh
        expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
      };
    } catch (error) {
      console.error('Interactive authentication failed:', error);
      throw new Error(`Authentication failed: ${(error as Error).message}`);
    }
  }

  /**
   * Authenticate using client ID and secret
   */
  async authenticateClientSecret(
    connection: DataverseConnection
  ): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
    if (!connection.clientId || !connection.clientSecret || !connection.tenantId) {
      throw new Error('Client ID, Client Secret, and Tenant ID are required for client secret authentication');
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${connection.tenantId}/oauth2/v2.0/token`;
    const scope = `${connection.url}/.default`;

    const postData = new URLSearchParams({
      client_id: connection.clientId,
      client_secret: connection.clientSecret,
      scope: scope,
      grant_type: 'client_credentials',
    }).toString();

    try {
      const response = await this.makeHttpsRequest(tokenEndpoint, postData);
      const data = JSON.parse(response);

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      return {
        accessToken: data.access_token,
        refreshToken: undefined, // Client credentials flow doesn't provide refresh tokens
        expiresOn: new Date(Date.now() + data.expires_in * 1000),
      };
    } catch (error) {
      console.error('Client secret authentication failed:', error);
      throw new Error(`Authentication failed: ${(error as Error).message}`);
    }
  }

  /**
   * Authenticate using username and password (Resource Owner Password Credentials flow)
   * Note: This flow is not recommended and may not work with MFA-enabled accounts
   */
  async authenticateUsernamePassword(
    connection: DataverseConnection
  ): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
    if (!connection.username || !connection.password) {
      throw new Error('Username and password are required for password authentication');
    }

    const clientId = connection.clientId || '51f81489-12ee-4a9e-aaae-a2591f45987d';
    const tokenEndpoint = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
    const scope = `${connection.url}/.default`;

    const postData = new URLSearchParams({
      client_id: clientId,
      scope: scope,
      username: connection.username,
      password: connection.password,
      grant_type: 'password',
    }).toString();

    try {
      const response = await this.makeHttpsRequest(tokenEndpoint, postData);
      const data = JSON.parse(response);

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresOn: new Date(Date.now() + data.expires_in * 1000),
      };
    } catch (error) {
      console.error('Username/password authentication failed:', error);
      throw new Error(`Authentication failed: ${(error as Error).message}`);
    }
  }

  /**
   * Test connection by verifying the URL and attempting a simple authenticated request
   */
  async testConnection(connection: DataverseConnection): Promise<boolean> {
    try {
      // First, validate the URL format
      if (!connection.url || !connection.url.startsWith('https://')) {
        throw new Error('Invalid URL format. URL must start with https://');
      }

      // Authenticate based on the authentication type
      let accessToken: string;

      switch (connection.authenticationType) {
        case 'interactive': {
          const interactiveResult = await this.authenticateInteractive(connection);
          accessToken = interactiveResult.accessToken;
          break;
        }
        case 'clientSecret': {
          const clientSecretResult = await this.authenticateClientSecret(connection);
          accessToken = clientSecretResult.accessToken;
          break;
        }
        case 'usernamePassword': {
          const passwordResult = await this.authenticateUsernamePassword(connection);
          accessToken = passwordResult.accessToken;
          break;
        }
        default:
          throw new Error('Invalid authentication type');
      }

      // Make a simple API call to verify the connection
      const whoAmIUrl = `${connection.url}/api/data/v9.2/WhoAmI`;
      const response = await this.makeAuthenticatedRequest(whoAmIUrl, accessToken);
      const data = JSON.parse(response);

      // If we get a UserId back, the connection is successful
      if (data.UserId) {
        return true;
      }

      throw new Error('Connection test failed: Unable to verify identity');
    } catch (error) {
      console.error('Test connection failed:', error);
      throw error;
    }
  }

  /**
   * Make an HTTPS POST request
   */
  private makeHttpsRequest(url: string, postData: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Make an authenticated HTTPS GET request
   */
  private makeAuthenticatedRequest(url: string, accessToken: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshAccessToken(
    connection: DataverseConnection,
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
    const clientId = connection.clientId || '51f81489-12ee-4a9e-aaae-a2591f45987d';
    const tokenEndpoint = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
    const scope = `${connection.url}/.default`;

    const postData = new URLSearchParams({
      client_id: clientId,
      scope: scope,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString();

    try {
      const response = await this.makeHttpsRequest(tokenEndpoint, postData);
      const data = JSON.parse(response);

      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresOn: new Date(Date.now() + data.expires_in * 1000),
      };
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw new Error(`Token refresh failed: ${(error as Error).message}`);
    }
  }
}
