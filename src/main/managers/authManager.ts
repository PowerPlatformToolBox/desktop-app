import { AccountInfo, ConfidentialClientApplication, LogLevel, PublicClientApplication } from "@azure/msal-node";
import { BrowserWindow } from "electron";
import * as http from "http";
import * as https from "https";
import { EVENT_CHANNELS } from "../../common/ipc/channels";
import { captureMessage, logInfo, logWarn } from "../../common/sentryHelper";
import { DataverseConnection } from "../../common/types";
import { DATAVERSE_API_VERSION } from "../constants";
import { BrowserManager } from "./browserManager";

/**
 * Manages authentication for Power Platform connections
 */
export class AuthManager {
    // MSAL instances per connection (isolated by connection ID)
    private msalApps: Map<string, PublicClientApplication> = new Map();
    // Confidential client instances per connection (isolated by connection ID)
    private confidentialApps: Map<string, ConfidentialClientApplication> = new Map();
    private activeServer: http.Server | null = null;
    private activeServerTimeout: NodeJS.Timeout | null = null;
    private activePort: number | null = null;
    private browserManager: BrowserManager;

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

    constructor(browserManager: BrowserManager) {
        this.browserManager = browserManager;
        // MSAL will be initialized on-demand for interactive auth
    }

    /**
     * Get or create ConfidentialClientApplication for client secret flow
     * Uses connection ID to ensure each connection has its own isolated MSAL instance
     * This prevents issues when multiple connections share the same clientId/tenantId
     */
    private getConfidentialApp(connectionId: string, clientId: string, clientSecret: string, tenantId: string): ConfidentialClientApplication {
        const key = connectionId; // Use connection ID for isolation

        if (!this.confidentialApps.has(key)) {
            const msalConfig = {
                auth: {
                    clientId,
                    clientSecret,
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
                cache: {
                    // MSAL will use in-memory cache by default
                    // This cache persists for the lifetime of the app process
                },
            };

            this.confidentialApps.set(key, new ConfidentialClientApplication(msalConfig));
        }

        return this.confidentialApps.get(key)!;
    }

    /**
     * Get or create MSAL instance for a given connection
     * Uses connection ID to ensure each connection has its own isolated MSAL instance
     * This prevents account cache collisions when testing with multiple users
     */
    private getMsalApp(connectionId: string, clientId: string, tenantId: string): PublicClientApplication {
        const key = connectionId; // Use connection ID for isolation

        if (!this.msalApps.has(key)) {
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
                cache: {
                    // MSAL will use in-memory cache by default
                    // This cache persists for the lifetime of the app process
                },
            };

            this.msalApps.set(key, new PublicClientApplication(msalConfig));
        }

        return this.msalApps.get(key)!;
    }

    /**
     * Authenticate using interactive Microsoft login with Authorization Code Flow
     */
    async authenticateInteractive(connection: DataverseConnection): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string }> {
        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d"; // Default Azure CLI client ID
        const tenantId = connection.tenantId || "organizations"; // Use 'organizations' for work/school accounts only
        const msalApp = this.getMsalApp(connection.id, clientId, tenantId);

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

            const authCodeUrl = await msalApp.getAuthCodeUrl(authCodeUrlParameters);

            // Start local HTTP server and wait for auth code, then validate before showing success
            const authResult = await this.listenForAuthCodeAndValidate(port, authCodeUrl, connection, scopes, redirectUri, msalApp);

            return authResult;
        } catch (error) {
            captureMessage("Interactive authentication failed:", "error", {
                extra: { error },
            });
            // Error is already displayed in the localhost browser page during listenForAuthCodeAndValidate
            // No need to show modal dialog as it causes UI conflicts
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
     * Escape HTML special characters to prevent XSS
     */
    private escapeHtml(text: string): string {
        return text.replace(/[&<>"'/]/g, (char) => AuthManager.HTML_ESCAPE_MAP[char]);
    }

    /**
     * Start a local HTTP server to listen for OAuth redirect, validate access, then show success/error
     * This method performs token exchange and environment validation BEFORE showing the success page
     */
    private async listenForAuthCodeAndValidate(
        port: number,
        authCodeUrl: string,
        connection: DataverseConnection,
        scopes: string[],
        redirectUri: string,
        msalApp: PublicClientApplication,
    ): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string }> {
        // Close any existing server before starting a new one
        await this.closeActiveServer();

        return new Promise((resolve, reject) => {
            const cleanupAndResolve = (authResult: { accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string }) => {
                this.performImmediateCleanup("Authentication server closed after successful auth");
                resolve(authResult);
            };

            const cleanupAndReject = (error: Error) => {
                this.performImmediateCleanup("Authentication server closed after error");
                reject(error);
            };

            const server = http.createServer(async (req, res) => {
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
                    // Show a "Validating..." message while we check environment access
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.write(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1 style="color: #0078d4;">Validating Access...</h1>
                <p>Please wait while we verify your permissions.</p>
              </body>
            </html>
          `);

                    try {
                        // Exchange authorization code for tokens
                        const tokenRequest = {
                            code: code,
                            scopes: scopes,
                            redirectUri: redirectUri,
                        };

                        const response = await msalApp.acquireTokenByCode(tokenRequest);

                        if (!response.account) {
                            throw new Error("No account information returned from authentication");
                        }

                        const authResult = {
                            accessToken: response.accessToken,
                            refreshToken: undefined, // MSAL handles refresh internally via cache
                            expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
                            msalAccountId: response.account.homeAccountId,
                        };

                        // Validate user has access to the environment by performing a WhoAmI check
                        // This happens BEFORE showing the success message
                        await this.validateEnvironmentAccess(connection, authResult.accessToken);

                        // Validation successful - now show success page
                        res.write(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1 style="color: #107c10;">Authentication Successful!</h1>
                <p>You can close this window and return to the application.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);
                        res.end();

                        cleanupAndResolve(authResult);
                    } catch (validationError) {
                        // Validation failed - show error page
                        const safeError = this.escapeHtml((validationError as Error).message);
                        res.write(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1 style="color: #d13438;">Authentication Failed</h1>
                <p>${safeError}</p>
                <p>You can close this window and return to the application.</p>
              </body>
            </html>
          `);
                        res.end();

                        cleanupAndReject(validationError as Error);
                    }
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
            this.activeServer = server;
            this.activePort = port;
            this.activeServerTimeout = setTimeout(() => {
                cleanupAndReject(new Error("Authentication timeout - no response received within 5 minutes"));
            }, AuthManager.AUTH_TIMEOUT_MS);

            server.listen(port, "localhost", () => {
                logInfo(`Listening for OAuth redirect on ${redirectUri}`);
                // Server is ready, now open the browser with profile support
                this.browserManager.openBrowserWithProfile(authCodeUrl, connection).catch((err) => {
                    cleanupAndReject(new Error(`Failed to open browser: ${err.message}`));
                });
            });

            server.on("error", (err) => {
                cleanupAndReject(new Error(`Failed to start local server: ${err.message}`));
            });
        });
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
     * Authenticate using client ID and secret with automatic token caching
     * Uses ConfidentialClientApplication which handles token refresh automatically
     */
    async authenticateClientSecret(connection: DataverseConnection): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
        if (!connection.clientId || !connection.clientSecret || !connection.tenantId) {
            throw new Error("Client ID, Client Secret, and Tenant ID are required for client secret authentication");
        }

        const confidentialApp = this.getConfidentialApp(connection.id, connection.clientId, connection.clientSecret, connection.tenantId);
        const scopes = [`${connection.url}/.default`];

        try {
            // MSAL ConfidentialClientApplication automatically caches tokens
            // and only acquires new ones when expired
            const response = await confidentialApp.acquireTokenByClientCredential({
                scopes: scopes,
            });

            if (!response) {
                throw new Error("No response from token acquisition");
            }

            const authResult = {
                accessToken: response.accessToken,
                refreshToken: undefined, // Client credentials flow doesn't provide refresh tokens
                expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
            };

            // Validate user has access to the environment by performing a WhoAmI check
            await this.validateEnvironmentAccess(connection, authResult.accessToken);

            return authResult;
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
     * Uses MSAL's acquireTokenByUsernamePassword for proper token caching and management
     * Note: This flow is not recommended and may not work with MFA-enabled accounts
     * Note: Only delegated access is supported - uses user_impersonation scope
     */
    async authenticateUsernamePassword(connection: DataverseConnection): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string }> {
        if (!connection.username || !connection.password) {
            throw new Error("Username and password are required for password authentication");
        }

        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
        const tenantId = connection.tenantId || "organizations"; // Use 'organizations' for work/school accounts
        const msalApp = this.getMsalApp(connection.id, clientId, tenantId);
        // Username/password flow only supports delegated access (user_impersonation)
        const scopes = [`${connection.url}/user_impersonation`];

        try {
            // Use MSAL's acquireTokenByUsernamePassword method
            const usernamePasswordRequest = {
                scopes: scopes,
                username: connection.username,
                password: connection.password,
            };

            const response = await msalApp.acquireTokenByUsernamePassword(usernamePasswordRequest);

            if (!response || !response.accessToken) {
                throw new Error("Failed to acquire access token");
            }

            // Validate user has access to the environment by performing a WhoAmI check
            await this.validateEnvironmentAccess(connection, response.accessToken);

            // Return tokens with MSAL account ID for silent token acquisition
            return {
                accessToken: response.accessToken,
                refreshToken: undefined, // MSAL handles refresh internally via cache
                expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
                msalAccountId: response.account?.homeAccountId, // Store for silent token acquisition
            };
        } catch (error) {
            captureMessage("Username/password authentication failed:", "error", {
                extra: { error },
            });

            // Extract error message from MSAL error or generic error
            let errorMessage = "";
            if (error && typeof error === "object") {
                // MSAL errors have errorCode and errorMessage properties
                const msalError = error as { errorCode?: string; errorMessage?: string; message?: string };
                errorMessage = msalError.errorMessage || msalError.message || String(error);
            } else {
                errorMessage = String(error);
            }

            // Detect MFA or Conditional Access errors and provide helpful guidance
            if (errorMessage.includes("AADSTS50079") || errorMessage.includes("multi-factor authentication") || errorMessage.includes("MFA")) {
                throw new Error(
                    "Multi-factor authentication (MFA) is required for this account. " +
                        "Username/password authentication does not support MFA. " +
                        "Please use 'Microsoft Login (OAuth)' authentication type instead.",
                );
            }

            if (errorMessage.includes("AADSTS50076") || errorMessage.includes("AADSTS50158") || errorMessage.includes("Conditional Access") || errorMessage.includes("CA policy")) {
                throw new Error(
                    "Conditional Access policies are blocking this authentication method. " +
                        "Username/password authentication does not support Conditional Access. " +
                        "Please use 'Microsoft Login (OAuth)' authentication type instead.",
                );
            }

            if (errorMessage.includes("AADSTS50126") || errorMessage.includes("invalid_grant")) {
                throw new Error("Invalid username or password. Please check your credentials and try again.");
            }

            // Generic error with suggestion to use OAuth
            throw new Error(`Authentication failed: ${errorMessage}`);
        }
    }

    /**
     * Test connection by verifying the URL and attempting a simple authenticated request
     */
    async testConnection(connection: DataverseConnection): Promise<boolean> {
        try {
            // First, validate the URL format
            if (!connection.url || !connection.url.startsWith("https://")) {
                throw new Error("Invalid URL format. URL must start with https://");
            }

            // Authenticate based on the authentication type
            let accessToken: string;

            switch (connection.authenticationType) {
                case "interactive": {
                    const interactiveResult = await this.authenticateInteractive(connection);
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
     * Validate user has access to the environment by performing a WhoAmI check
     * @param connection The connection to validate
     * @param accessToken The access token to use for the WhoAmI call
     * @throws Error if the user does not have access to the environment
     */
    private async validateEnvironmentAccess(connection: DataverseConnection, accessToken: string): Promise<void> {
        try {
            const whoAmIUrl = `${connection.url}/api/data/${DATAVERSE_API_VERSION}/WhoAmI`;
            const response = await this.makeAuthenticatedRequest(whoAmIUrl, accessToken);
            const data = JSON.parse(response);

            // If we get a UserId back, the user has access to the environment
            if (!data.UserId) {
                throw new Error("Unable to verify user identity in the selected environment");
            }

            logInfo("Environment access validated successfully", { userId: data.UserId });
        } catch (error) {
            // Enhance error message for permission-related failures
            const errorMessage = (error as Error).message;
            if (errorMessage.includes("401") || errorMessage.includes("403")) {
                throw new Error("You do not have permission to access this environment. Please verify the user account matches the selected environment.");
            }
            throw new Error(`Environment access validation failed: ${errorMessage}`);
        }
    }

    /**
     * Helper method to find MSAL account for a connection
     * @param connection The connection to find account for
     * @returns Promise with the account or undefined if not found
     */
    private async findMsalAccount(connection: DataverseConnection): Promise<AccountInfo | undefined> {
        try {
            const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
            const tenantId = connection.tenantId || "organizations";
            const msalApp = this.getMsalApp(connection.id, clientId, tenantId);

            const accounts = await msalApp.getTokenCache().getAllAccounts();
            return connection.msalAccountId ? accounts.find((acc) => acc.homeAccountId === connection.msalAccountId) : accounts[0];
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Check if a connection has a valid MSAL account in cache
     * @param connection The connection to check
     * @returns Promise<boolean> true if account exists in cache, false otherwise
     */
    async hasAccountInCache(connection: DataverseConnection): Promise<boolean> {
        const account = await this.findMsalAccount(connection);
        return account !== undefined;
    }

    /**
     * Acquire access token silently using MSAL's built-in token cache and refresh logic
     * MSAL automatically handles token refresh if the access token is expired
     * @param connection The connection to acquire token for
     * @returns Promise with access token (MSAL handles refresh internally)
     */
    async acquireTokenSilently(connection: DataverseConnection): Promise<{ accessToken: string; expiresOn: Date }> {
        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
        const tenantId = connection.tenantId || "organizations"; // Use 'organizations' for work/school accounts only
        const msalApp = this.getMsalApp(connection.id, clientId, tenantId);
        // Use user_impersonation scope for username/password flow (delegated access only)
        // For interactive flow, both .default and user_impersonation work
        const scopes = connection.authenticationType === "usernamePassword" ? [`${connection.url}/user_impersonation`] : [`${connection.url}/.default`];

        // Get the account from MSAL cache
        const account = await this.findMsalAccount(connection);

        if (!account) {
            throw new Error("No cached account found. Please authenticate again.");
        }

        try {
            // MSAL will automatically:
            // 1. Return cached token if still valid
            // 2. Refresh using refresh token if access token expired
            // 3. Throw error if refresh token also expired
            const response = await msalApp.acquireTokenSilent({
                account: account,
                scopes: scopes,
            });

            return {
                accessToken: response.accessToken,
                expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
            };
        } catch (error) {
            // Silent acquisition failed - likely refresh token expired
            captureMessage("Silent token acquisition failed - re-authentication required", "warning", {
                extra: { error, connectionId: connection.id },
            });
            throw new Error("Token refresh failed. Please authenticate again.");
        }
    }

    /**
     * Refresh an access token using a refresh token
     * This is used for username/password flow and legacy interactive connections
     * For modern interactive connections, use acquireTokenSilently() instead
     */
    async refreshAccessToken(connection: DataverseConnection, refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date }> {
        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
        const tokenEndpoint = `https://login.microsoftonline.com/organizations/oauth2/v2.0/token`;
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

    /**
     * Cleanup method to clear all MSAL instances when the app is closing
     * This ensures a clean state on next app launch
     */
    cleanup(): void {
        logInfo("[AuthManager] Cleaning up MSAL instances");
        this.msalApps.clear();
        this.confidentialApps.clear();
    }
}
