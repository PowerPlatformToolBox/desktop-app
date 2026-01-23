import { LogLevel, PublicClientApplication } from "@azure/msal-node";
import { BrowserWindow, shell } from "electron";
import * as http from "http";
import * as https from "https";
import { EVENT_CHANNELS } from "../../common/ipc/channels";
import { captureMessage, logInfo, logWarn } from "../../common/sentryHelper";
import { DataverseConnection } from "../../common/types";
import { DATAVERSE_API_VERSION } from "../constants";

/**
 * Manages authentication for Power Platform connections
 */
export class AuthManager {
    private msalApp: PublicClientApplication | null = null;
    private activeServer: http.Server | null = null;
    private activeServerTimeout: NodeJS.Timeout | null = null;
    private activePort: number | null = null;

    // Authentication timeout duration (5 minutes)
    private static readonly AUTH_TIMEOUT_MS = 5 * 60 * 1000;

    private static readonly HTML_ESCAPE_MAP: { [key: string]: string } = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
        "/": "&#x2F;",
    };

    constructor() {
        // MSAL will be initialized on-demand for interactive auth
    }

    /**
     * Initialize MSAL for interactive authentication
     */
    private initializeMsal(clientId: string, tenantId: string): PublicClientApplication {
        const msalConfig = {
            auth: {
                clientId, 
                authority: `https://login.microsoftonline.com/${tenantId}`,
            },
            system: {
                loggerOptions: {
                    loggerCallback(loglevel: LogLevel, message: string) {
                        logWarn(message);
                    },
                    piiLoggingEnabled: false,
                    logLevel: LogLevel.Warning,
                },
            },
        };

        return new PublicClientApplication(msalConfig);
    }

    /**
     * Authenticate using interactive Microsoft login with Authorization Code Flow
     */
    async authenticateInteractive(connection: DataverseConnection, parentWindow?: BrowserWindow): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d"; // Default Azure CLI client ID
        const tenantId = connection.tenantId || "common";
        this.msalApp = this.initializeMsal(clientId, tenantId);

        try {
            // Find an available port for the OAuth redirect server
            const port = await this.findAvailablePort();
            const redirectUri = `http://localhost:${port}`;

            const scopes = [`${connection.url}/.default`];

            // Create authorization URL with optional login_hint
            const authCodeUrlParameters: {
                scopes: string[];
                redirectUri: string;
                loginHint?: string;
            } = {
                scopes: scopes,
                redirectUri: redirectUri,
            };

            // Add login_hint if username is provided (for OAuth MFA)
            if (connection.username) {
                authCodeUrlParameters.loginHint = connection.username;
            }

            const authCodeUrl = await this.msalApp.getAuthCodeUrl(authCodeUrlParameters);

            // Start local HTTP server and wait for it to be ready, then open browser
            const authCode = await this.listenForAuthCode(port, authCodeUrl);

            // Exchange authorization code for tokens
            const tokenRequest = {
                code: authCode,
                scopes: scopes,
                redirectUri: redirectUri,
            };

            const response = await this.msalApp.acquireTokenByCode(tokenRequest);

            return {
                accessToken: response.accessToken,
                // MSAL Node does not expose refresh tokens directly. The homeAccountId is returned here for account identification in future token operations.
                refreshToken: response.account?.homeAccountId,
                expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
            };
        } catch (error) {
            captureMessage("Interactive authentication failed:", "error", {
                extra: { error },
            });
            // Show error in a modal dialog
            this.showErrorDialog(`Authentication failed: ${(error as Error).message}`, parentWindow);
            throw new Error(`Authentication failed: ${(error as Error).message}`);
        }
    }

    /**
     * Find an available port for the OAuth redirect server
     */
    private findAvailablePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = http.createServer();

            const cleanup = (callback: () => void) => {
                server.removeAllListeners();
                server.close(() => {
                    callback();
                });
            };

            server.listen(0, "localhost", () => {
                const address = server.address();
                if (address && typeof address !== "string") {
                    const port = address.port;
                    cleanup(() => resolve(port));
                } else {
                    cleanup(() => reject(new Error("Failed to get server address")));
                }
            });

            server.on("error", (err) => {
                cleanup(() => reject(err));
            });
        });
    }

    /**
     * Perform cleanup of active server without waiting for port release
     * Used when completing authentication and we don't need to reuse the port immediately
     */
    private performImmediateCleanup(logMessage?: string): void {
        if (this.activeServerTimeout) {
            clearTimeout(this.activeServerTimeout);
            this.activeServerTimeout = null;
        }
        if (this.activeServer) {
            const server = this.activeServer;
            this.activeServer = null;
            this.activePort = null;
            server.close(() => {
                // Force close any remaining connections after graceful shutdown attempt
                server.closeAllConnections();
                if (logMessage) {
                    logInfo(logMessage);
                }
            });
        }
    }

    /**
     * Close any active authentication server and wait for port release
     * Used before starting new authentication to ensure port is available
     */
    private closeActiveServer(): Promise<void> {
        return new Promise((resolve) => {
            if (this.activeServerTimeout) {
                clearTimeout(this.activeServerTimeout);
                this.activeServerTimeout = null;
            }

            if (this.activeServer) {
                const server = this.activeServer;
                this.activeServer = null;
                this.activePort = null;

                // Close the server and wait for it to fully release the port
                server.close(() => {
                    // Force close any remaining connections after graceful shutdown attempt
                    server.closeAllConnections();
                    logInfo("Authentication server closed and port released");
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Start a local HTTP server to listen for OAuth redirect and extract authorization code
     */
    private async listenForAuthCode(port: number, authCodeUrl: string): Promise<string> {
        // Close any existing server before starting a new one
        await this.closeActiveServer();
        return new Promise((resolve, reject) => {
            const redirectUri = `http://localhost:${port}`;

            const cleanupAndResolve = (code: string) => {
                this.performImmediateCleanup("Authentication server closed after successful auth");
                resolve(code);
            };

            const cleanupAndReject = (error: Error) => {
                this.performImmediateCleanup("Authentication server closed after error");
                reject(error);
            };

            const server = http.createServer((req, res) => {
                const reqUrl = new URL(req.url || "", `http://localhost:${port}`);
                const code = reqUrl.searchParams.get("code");
                const error = reqUrl.searchParams.get("error");
                const errorDescription = reqUrl.searchParams.get("error_description");

                if (error) {
                    // Escape HTML to prevent XSS
                    const safeError = this.escapeHtml(errorDescription || error || "Unknown error");
                    res.writeHead(400, { "Content-Type": "text/html" });
                    res.end(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1 style="color: #d13438;">Authentication Failed</h1>
                <p>${safeError}</p>
                <p>You can close this window and return to the application.</p>
              </body>
            </html>
          `);
                    cleanupAndReject(new Error(errorDescription || error));
                    return;
                }

                if (code) {
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1 style="color: #107c10;">Authentication Successful!</h1>
                <p>You can close this window and return to the application.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);
                    cleanupAndResolve(code);
                    return;
                }

                res.writeHead(400, { "Content-Type": "text/html" });
                res.end(`
          <html>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>Invalid Request</h1>
              <p>No authorization code received.</p>
            </body>
          </html>
        `);
            });

            // Allow Node.js to exit even if the server is still running
            server.unref();

            // Track the server instance and timeout BEFORE starting the server
            // to ensure cleanup handlers have access to them in case of early events
            this.activeServer = server;
            this.activePort = port;
            this.activeServerTimeout = setTimeout(() => {
                cleanupAndReject(new Error("Authentication timeout - no response received within 5 minutes"));
            }, AuthManager.AUTH_TIMEOUT_MS);

            server.listen(port, "localhost", () => {
                logInfo(`Listening for OAuth redirect on ${redirectUri}`);
                // Server is ready, now open the browser
                shell.openExternal(authCodeUrl).catch((err) => {
                    cleanupAndReject(new Error(`Failed to open browser: ${err.message}`));
                });
            });

            server.on("error", (err) => {
                cleanupAndReject(new Error(`Failed to start local server: ${err.message}`));
            });
        });
    }

    /**
     * Escape HTML special characters to prevent XSS
     */
    private escapeHtml(text: string): string {
        return text.replace(/[&<>"'/]/g, (char) => AuthManager.HTML_ESCAPE_MAP[char]);
    }

    /**
     * Show error dialog to the user
     */
    private showErrorDialog(message: string, parentWindow?: BrowserWindow): void {
        if (parentWindow) {
            parentWindow.webContents.send(EVENT_CHANNELS.SHOW_AUTH_ERROR_DIALOG, message);
        }
    }

    /**
     * Authenticate using client ID and secret
     */
    async authenticateClientSecret(connection: DataverseConnection): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
        if (!connection.clientId || !connection.clientSecret || !connection.tenantId) {
            throw new Error("Client ID, Client Secret, and Tenant ID are required for client secret authentication");
        }

        const tokenEndpoint = `https://login.microsoftonline.com/${connection.tenantId}/oauth2/v2.0/token`;
        const scope = `${connection.url}/.default`;

        const postData = new URLSearchParams({
            client_id: connection.clientId,
            client_secret: connection.clientSecret,
            scope: scope,
            grant_type: "client_credentials",
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
            captureMessage("Client secret authentication failed:", "error", {
                extra: { error },
            });
            const errorMessage = `Authentication failed: ${(error as Error).message}`;
            // Show error in a modal dialog (for main window context)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (typeof (error as any).showDialog !== "undefined") {
                this.showErrorDialog(errorMessage);
            }
            throw new Error(errorMessage);
        }
    }

    /**
     * Authenticate using username and password (Resource Owner Password Credentials flow)
     * Note: This flow is not recommended and may not work with MFA-enabled accounts
     */
    async authenticateUsernamePassword(connection: DataverseConnection): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
        if (!connection.username || !connection.password) {
            throw new Error("Username and password are required for password authentication");
        }

        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
        const tokenEndpoint = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
        const scope = `${connection.url}/.default`;

        const postData = new URLSearchParams({
            client_id: clientId,
            scope: scope,
            username: connection.username,
            password: connection.password,
            grant_type: "password",
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
            captureMessage("Username/password authentication failed:", "error", {
                extra: { error },
            });
            const errorMessage = `Authentication failed: ${(error as Error).message}`;
            // Show error in a modal dialog (for main window context)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (typeof (error as any).showDialog !== "undefined") {
                this.showErrorDialog(errorMessage);
            }
            throw new Error(errorMessage);
        }
    }

    /**
     * Test connection by verifying the URL and attempting a simple authenticated request
     */
    async testConnection(connection: DataverseConnection, parentWindow?: BrowserWindow): Promise<boolean> {
        try {
            // First, validate the URL format
            if (!connection.url || !connection.url.startsWith("https://")) {
                throw new Error("Invalid URL format. URL must start with https://");
            }

            // Authenticate based on the authentication type
            let accessToken: string;

            switch (connection.authenticationType) {
                case "interactive": {
                    const interactiveResult = await this.authenticateInteractive(connection, parentWindow);
                    accessToken = interactiveResult.accessToken;
                    break;
                }
                case "clientSecret": {
                    const clientSecretResult = await this.authenticateClientSecret(connection);
                    accessToken = clientSecretResult.accessToken;
                    break;
                }
                case "usernamePassword": {
                    const passwordResult = await this.authenticateUsernamePassword(connection);
                    accessToken = passwordResult.accessToken;
                    break;
                }
                case "connectionString":
                    // Connection string should have been parsed to its actual auth type
                    throw new Error("Connection string must be parsed before testing. Please check the connection configuration.");
                default:
                    throw new Error("Invalid authentication type");
            }

            // Make a simple API call to verify the connection
            const whoAmIUrl = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/WhoAmI`;
            const response = await this.makeAuthenticatedRequest(whoAmIUrl, accessToken);
            const data = JSON.parse(response);

            // If we get a UserId back, the connection is successful
            if (data.UserId) {
                return true;
            }

            throw new Error("Connection test failed: Unable to verify identity");
        } catch (error) {
            captureMessage("Test connection failed:", "error", {
                extra: { error },
            });
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
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(postData),
                },
            };

            const req = https.request(options, (res) => {
                let data = "";

                res.on("data", (chunk) => {
                    data += chunk;
                });

                res.on("end", () => {
                    resolve(data);
                });
            });

            req.on("error", (error) => {
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
                method: "GET",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/json",
                    "OData-MaxVersion": "4.0",
                    "OData-Version": "4.0",
                },
            };

            const req = https.request(options, (res) => {
                let data = "";

                res.on("data", (chunk) => {
                    data += chunk;
                });

                res.on("end", () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on("error", (error) => {
                reject(error);
            });

            req.end();
        });
    }

    /**
     * Refresh an access token using a refresh token
     */
    async refreshAccessToken(connection: DataverseConnection, refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
        const tokenEndpoint = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
        const scope = `${connection.url}/.default`;

        const postData = new URLSearchParams({
            client_id: clientId,
            scope: scope,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
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
            captureMessage("Token refresh failed:", "error", {
                extra: { error },
            });
            throw new Error(`Token refresh failed: ${(error as Error).message}`);
        }
    }
}
