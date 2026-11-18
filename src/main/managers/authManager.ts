import { AccountInfo, ConfidentialClientApplication, INetworkModule, LogLevel, NetworkRequestOptions, NetworkResponse, PublicClientApplication } from "@azure/msal-node";
import { BrowserWindow } from "electron";
import { createHash, randomBytes } from "crypto";
import * as http from "http";
import * as https from "https";
import { EVENT_CHANNELS } from "../../common/ipc/channels";
import { logError, logInfo, logWarn } from "../../common/logger";
import { Connection } from "../../common/types";
import { DATAVERSE_API_VERSION } from "../constants";
import { BrowserManager } from "./browserManager";
import type { ProxyManager } from "./proxyManager";
import { azureError, isAzureError } from "../../common/azureApi";

/**
 * Manages authentication for Power Platform connections
 */
export class AuthManager {
    private azureRenewals = new Map<string, Promise<string>>();
    private azureInteractive = new Set<string>();

    invalidateConnection(connectionId: string): void {
        this.msalApps.delete(connectionId);
        this.msalAppFingerprints.delete(connectionId);
        this.confidentialApps.delete(connectionId);
        for (const key of this.azureRenewals.keys()) {
            if (key.startsWith(`${connectionId}:`)) this.azureRenewals.delete(key);
        }
    }

    async getAzureAccount(connection: Connection): Promise<{ accountId: string; tenantId?: string; displayName?: string } | null> {
        if (connection.authenticationType === "clientSecret") {
            return connection.clientId && connection.clientSecret && connection.tenantId ? { accountId: connection.clientId, tenantId: connection.tenantId } : null;
        }
        if (!connection.msalAccountId) return null;
        const app = this.getMsalApp(connection.id, connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d", connection.tenantId || "organizations");
        const accounts = await app.getTokenCache().getAllAccounts();
        const account = accounts.find((candidate) => candidate.homeAccountId === connection.msalAccountId);
        return account ? { accountId: account.homeAccountId, tenantId: account.tenantId, displayName: account.name || account.username } : null;
    }

    async acquireAzureToken(connection: Connection, scopes: string[], interactive: boolean, forceRefresh: boolean, signal: AbortSignal, claims?: string): Promise<string> {
        signal.throwIfAborted();
        const key = `${connection.id}:${JSON.stringify(scopes)}:${forceRefresh}:${claims ?? ""}`;
        if (!interactive && this.azureRenewals.has(key)) return this.azureRenewals.get(key)!;
        const acquire = async (): Promise<string> => {
            try {
                if (connection.authenticationType === "clientSecret") {
                    if (!connection.clientId || !connection.clientSecret || !connection.tenantId) throw azureError("notConfigured", "Configure the connection's client ID, secret and tenant.");
                    const app = this.getConfidentialApp(connection.id, connection.clientId, connection.clientSecret, connection.tenantId);
                    const result = await app.acquireTokenByClientCredential({
                        scopes: [scopes[0].startsWith("https://graph.microsoft.com/") ? "https://graph.microsoft.com/.default" : "https://management.azure.com/.default"],
                        skipCache: forceRefresh,
                        ...(claims ? { claims } : {}),
                    });
                    if (!result?.accessToken) throw azureError("authenticationFailed", "Application authentication returned no access token.");
                    return result.accessToken;
                }
                if (connection.authenticationType !== "interactive" && connection.authenticationType !== "usernamePassword") {
                    throw azureError("notConfigured", "Parse the connection string and authenticate the Dataverse connection first.");
                }
                const app = this.getMsalApp(connection.id, connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d", connection.tenantId || "organizations");
                const accounts = await app.getTokenCache().getAllAccounts();
                const account = accounts.find((candidate) => candidate.homeAccountId === connection.msalAccountId);
                if (!account) throw azureError("notConnected", "Reconnect this Dataverse connection first to establish its account.");
                try {
                    const result = await app.acquireTokenSilent({
                        account,
                        scopes,
                        authority: `https://login.microsoftonline.com/${account.tenantId}`,
                        forceRefresh: forceRefresh || !!claims,
                        ...(claims ? { claims } : {}),
                    });
                    return result.accessToken;
                } catch (error) {
                    if (!interactive || !this.isInteractionRequiredError(error)) throw error;
                    signal.throwIfAborted();
                    return await this.authenticateAzureInteractive(connection, app, account, scopes, signal, claims);
                }
            } catch (error) {
                if (interactive && signal.aborted) throw signal.reason;
                if (isAzureError(error)) throw error;
                if (this.isInteractionRequiredError(error)) throw azureError("interactionRequired", "Additional consent, MFA or Conditional Access requires explicit authentication.");
                logWarn("Additional Azure API authentication failed");
                throw azureError("authenticationFailed", "Could not authenticate to the selected API. Verify application permissions, tenant consent and connection credentials.");
            }
        };
        const result = acquire();
        if (interactive) return result;
        this.azureRenewals.set(key, result);
        try {
            return await result;
        } finally {
            if (this.azureRenewals.get(key) === result) this.azureRenewals.delete(key);
        }
    }

    private async authenticateAzureInteractive(connection: Connection, app: PublicClientApplication, account: AccountInfo, scopes: string[], signal: AbortSignal, claims?: string): Promise<string> {
        if (this.azureInteractive.has(connection.id)) throw azureError("limitExceeded", "Authentication is already in progress for this connection.");
        this.azureInteractive.add(connection.id);
        try {
            return await new Promise<string>((resolve, reject) => {
                const verifier = randomBytes(32).toString("base64url");
                const state = randomBytes(32).toString("base64url");
                let finished = false;
                let exchanging = false;
                const finish = (error?: unknown, token?: string) => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(timer);
                    signal.removeEventListener("abort", abort);
                    server.close();
                    server.closeAllConnections();
                    if (error) reject(error);
                    else resolve(token!);
                };
                const abort = () => finish(signal.reason);
                const server = http.createServer(async (req, res) => {
                    let url: URL;
                    try {
                        url = new URL(req.url || "/", "http://localhost");
                    } catch {
                        logWarn("Rejected malformed Azure authentication callback");
                        res.writeHead(400).end("Invalid authentication callback.");
                        return;
                    }
                    if (req.method !== "GET" || url.pathname !== "/" || url.searchParams.get("state") !== state || exchanging) {
                        res.writeHead(400).end("Invalid authentication callback.");
                        return;
                    }
                    const code = url.searchParams.get("code");
                    if (!code || url.searchParams.has("error")) {
                        res.once("finish", () => finish(azureError("authenticationFailed", "Sign-in or consent was declined.")));
                        res.writeHead(400).end("Authentication was not completed. Return to Power Platform ToolBox.");
                        return;
                    }
                    exchanging = true;
                    try {
                        const address = server.address();
                        if (!address || typeof address === "string") throw new Error("No loopback listener");
                        const result = await app.acquireTokenByCode({
                            code,
                            scopes,
                            authority: `https://login.microsoftonline.com/${account.tenantId}`,
                            redirectUri: `http://localhost:${address.port}`,
                            codeVerifier: verifier,
                        });
                        if (finished) return;
                        if (result.account?.homeAccountId !== account.homeAccountId || result.account?.tenantId !== account.tenantId) {
                            throw azureError("authenticationFailed", "Use the same account and tenant as the Dataverse connection. Reconnect Dataverse to switch identity.");
                        }
                        res.once("finish", () => finish(undefined, result.accessToken));
                        res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" }).end("Authentication completed. Return to Power Platform ToolBox.");
                    } catch (error) {
                        res.once("finish", () => finish(isAzureError(error) ? error : azureError("authenticationFailed", "Unable to complete Azure API authentication.")));
                        res.writeHead(400).end("Authentication failed. Return to Power Platform ToolBox.");
                    }
                });
                const timer = setTimeout(() => finish(azureError("timeout", "Azure authentication timed out.")), AuthManager.AUTH_TIMEOUT_MS);
                server.on("error", () => finish(azureError("networkError", "Unable to open the local authentication listener.")));
                signal.addEventListener("abort", abort, { once: true });
                if (signal.aborted) {
                    abort();
                    return;
                }
                server.listen(0, "localhost", () => {
                    const address = server.address();
                    if (!address || typeof address === "string" || finished) return;
                    void app
                        .getAuthCodeUrl({
                            scopes,
                            authority: `https://login.microsoftonline.com/${account.tenantId}`,
                            redirectUri: `http://localhost:${address.port}`,
                            codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
                            codeChallengeMethod: "S256",
                            state,
                            loginHint: account.username,
                            prompt: "select_account",
                            ...(claims ? { claims } : {}),
                        })
                        .then((url) => {
                            if (!finished) return this.browserManager.openBrowserWithProfile(url, connection);
                        })
                        .catch(() => finish(azureError("authenticationFailed", "Unable to open Azure sign-in in the configured browser.")));
                });
            });
        } finally {
            this.azureInteractive.delete(connection.id);
        }
    }
    // MSAL instances per connection (isolated by connection ID)
    private msalApps: Map<string, PublicClientApplication> = new Map();
    // Client and authority used to build each cached public client, so a tenant change replaces it
    private msalAppFingerprints = new Map<string, string>();
    // Environment directory discovered from the org WhoAmI challenge, keyed by normalized org URL
    private environmentTenantCache = new Map<string, string>();
    private static readonly AUTHORITY_ALIASES = new Set(["organizations", "common", "consumers"]);
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

    constructor(
        browserManager: BrowserManager,
        private readonly proxyManager: ProxyManager,
    ) {
        this.browserManager = browserManager;
        // MSAL will be initialized on-demand for interactive auth
    }

    private createNetworkClient(): INetworkModule {
        return {
            sendGetRequestAsync: <ResponseBody>(url: string, options?: NetworkRequestOptions) => this.makeMsalRequest<ResponseBody>(url, "GET", options),
            sendPostRequestAsync: <ResponseBody>(url: string, options?: NetworkRequestOptions) => this.makeMsalRequest<ResponseBody>(url, "POST", options),
        };
    }

    private makeMsalRequest<ResponseBody>(url: string, method: "GET" | "POST", options?: NetworkRequestOptions): Promise<NetworkResponse<ResponseBody>> {
        return new Promise((resolve, reject) => {
            const request = https.request(
                url,
                {
                    method,
                    headers: options?.headers,
                    agent: this.proxyManager.getAgentForUrl(url),
                    timeout: 30000,
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
                    response.on("error", reject);
                    response.on("end", () => {
                        try {
                            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as ResponseBody;
                            const headers: Record<string, string> = {};
                            for (const [name, value] of Object.entries(response.headers)) {
                                if (value !== undefined) {
                                    headers[name] = Array.isArray(value) ? value.join(", ") : value;
                                }
                            }
                            resolve({ headers, body, status: response.statusCode || 0 });
                        } catch {
                            reject(new Error(`Authentication endpoint returned an invalid JSON response (HTTP ${response.statusCode})`));
                        }
                    });
                },
            );
            request.on("error", reject);
            request.on("timeout", () => request.destroy(new Error("Authentication network request timed out")));
            request.end(options?.body);
        });
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
                    networkClient: this.createNetworkClient(),
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
     * This prevents account cache collisions when testing with multiple users.
     * A new client id or authority replaces the cached instance, including the shared test-connection id.
     */
    private getMsalApp(connectionId: string, clientId: string, tenantId: string): PublicClientApplication {
        const key = connectionId; // Use connection ID for isolation
        const authority = this.authorityUrl(tenantId);
        const fingerprint = `${clientId}|${authority}`;

        if (!this.msalApps.has(key) || this.msalAppFingerprints.get(key) !== fingerprint) {
            const msalConfig = {
                auth: {
                    clientId,
                    authority,
                },
                system: {
                    networkClient: this.createNetworkClient(),
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
            this.msalAppFingerprints.set(key, fingerprint);
        }

        return this.msalApps.get(key)!;
    }

    private authorityUrl(tenantId: string): string {
        return `https://login.microsoftonline.com/${tenantId}`;
    }

    private normalizeEnvironmentUrl(url: string): string {
        return url.replace(/\/$/, "");
    }

    private isAuthorityAlias(tenantId?: string): boolean {
        const value = tenantId?.trim();
        return !value || AuthManager.AUTHORITY_ALIASES.has(value.toLowerCase());
    }

    /**
     * Read the environment directory from Dataverse's unauthenticated WhoAmI challenge.
     * Guest sign-in has to use this tenant; `organizations` selects the user's home directory.
     */
    private async discoverEnvironmentTenant(connection: Connection): Promise<string | undefined> {
        const resource = this.normalizeEnvironmentUrl(connection.url);
        const cached = this.environmentTenantCache.get(resource);
        if (cached) return cached;

        try {
            const header = await this.requestAuthChallenge(`${resource}/api/data/${DATAVERSE_API_VERSION}/WhoAmI`);
            const tenant = this.parseEnvironmentTenant(header);
            if (tenant) this.environmentTenantCache.set(resource, tenant);
            return tenant;
        } catch {
            logWarn("Environment tenant discovery failed");
            return undefined;
        }
    }

    private async resolveAuthorityTenant(connection: Connection): Promise<{ authorityTenant: string; environmentTenant?: string }> {
        const environmentTenant = await this.discoverEnvironmentTenant(connection);
        const configured = connection.tenantId?.trim();
        const authorityTenant = !this.isAuthorityAlias(configured) ? configured! : environmentTenant || configured || "organizations";
        return { authorityTenant, environmentTenant };
    }

    private requestAuthChallenge(url: string): Promise<string | string[] | undefined> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const request = https.request(
                {
                    hostname: urlObj.hostname,
                    port: 443,
                    path: urlObj.pathname + urlObj.search,
                    method: "GET",
                    agent: this.proxyManager.getAgentForUrl(url),
                    timeout: 15000,
                    headers: {
                        Accept: "application/json",
                        "OData-MaxVersion": "4.0",
                        "OData-Version": "4.0",
                    },
                },
                (response) => {
                    const header = response.headers["www-authenticate"];
                    response.resume();
                    resolve(header);
                },
            );
            request.on("error", reject);
            request.on("timeout", () => request.destroy(new Error("Environment tenant discovery timed out")));
            request.end();
        });
    }

    private parseEnvironmentTenant(header: string | string[] | undefined): string | undefined {
        const value = Array.isArray(header) ? header.join(", ") : header;
        if (!value) return undefined;
        const match = /authorization_uri="?https:\/\/login\.microsoftonline\.com\/([^/"\s,]+)/i.exec(value);
        if (!match || this.isAuthorityAlias(match[1])) return undefined;
        return match[1];
    }

    private readAccessTokenTenant(accessToken: string): string | undefined {
        const segment = accessToken.split(".")[1];
        if (!segment) return undefined;
        try {
            const payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as { tid?: unknown };
            return typeof payload.tid === "string" ? payload.tid : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * @returns true when the token directory matches the environment and a guest-access hint is useful
     */
    private assertEnvironmentToken(accessToken: string, environmentTenant?: string): boolean {
        if (!environmentTenant) return false;
        const tokenTenant = this.readAccessTokenTenant(accessToken);
        if (!tokenTenant) return false;
        if (tokenTenant.toLowerCase() !== environmentTenant.toLowerCase()) {
            throw new Error(`Signed in to the wrong directory. This environment is in tenant ${environmentTenant}.`);
        }
        return true;
    }

    private persistedEnvironmentTenant(connection: Connection, environmentTenant?: string): string | undefined {
        return this.isAuthorityAlias(connection.tenantId) ? environmentTenant : undefined;
    }

    /**
     * Authenticate using interactive Microsoft login with Authorization Code Flow
     */
    async authenticateInteractive(
        connection: Connection,
    ): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string; scopes?: string[]; environmentTenantId?: string }> {
        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d"; // Default Azure CLI client ID
        const { authorityTenant, environmentTenant } = await this.resolveAuthorityTenant(connection);
        const authority = this.authorityUrl(authorityTenant);
        const msalApp = this.getMsalApp(connection.id, clientId, authorityTenant);

        try {
            // Find an available port for the OAuth redirect server
            const port = await this.findAvailablePort();
            const redirectUri = `http://localhost:${port}`;

            const scopes = [`${this.normalizeEnvironmentUrl(connection.url)}/.default`];

            // Create authorization URL with optional login_hint. Authority is the environment directory for guests.
            const authCodeUrlParameters: {
                scopes: string[];
                redirectUri: string;
                authority: string;
                loginHint?: string;
            } = {
                scopes: scopes,
                redirectUri: redirectUri,
                authority,
            };

            // Add login_hint if username is provided (for OAuth MFA)
            if (connection.username) {
                authCodeUrlParameters.loginHint = connection.username;
            }

            const authCodeUrl = await msalApp.getAuthCodeUrl(authCodeUrlParameters);

            // Start local HTTP server and wait for auth code, then validate before showing success
            const authResult = await this.listenForAuthCodeAndValidate(port, authCodeUrl, connection, scopes, redirectUri, msalApp, authority, async (accessToken) => {
                const matchedEnvironment = this.assertEnvironmentToken(accessToken, environmentTenant);
                await this.validateEnvironmentAccess(connection, accessToken, matchedEnvironment);
            });

            return { ...authResult, environmentTenantId: this.persistedEnvironmentTenant(connection, environmentTenant) };
        } catch (error) {
            logError("Interactive authentication failed", error);
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
        connection: Connection,
        scopes: string[],
        redirectUri: string,
        msalApp: PublicClientApplication,
        authority: string,
        postTokenValidation?: (accessToken: string) => Promise<void>,
    ): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string; scopes?: string[] }> {
        // Close any existing server before starting a new one
        await this.closeActiveServer();

        return new Promise((resolve, reject) => {
            const cleanupAndResolve = (authResult: { accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string; scopes?: string[] }) => {
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
                    // Show a status message while we complete sign-in and optional validation
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.write(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                                <h1 style="color: #0078d4;">Completing Sign-In...</h1>
                                <p>Please wait while we finalize authentication.</p>
              </body>
            </html>
          `);

                    try {
                        // Exchange authorization code for tokens
                        const tokenRequest = {
                            code: code,
                            scopes: scopes,
                            redirectUri: redirectUri,
                            authority,
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
                            scopes: Array.isArray(response.scopes) ? response.scopes : scopes,
                        };

                        if (postTokenValidation) {
                            // Optional validation before confirming success (used for Dataverse env access checks)
                            await postTokenValidation(authResult.accessToken);
                        }

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

    private isInteractionRequiredError(error: unknown): boolean {
        if (!error || typeof error !== "object") {
            return false;
        }

        const errorObj = error as { errorCode?: string; errorMessage?: string; message?: string };
        const haystack = `${errorObj.errorCode || ""} ${errorObj.errorMessage || ""} ${errorObj.message || ""}`.toLowerCase();

        return (
            haystack.includes("interaction_required") ||
            haystack.includes("consent_required") ||
            haystack.includes("login_required") ||
            haystack.includes("aadsts65001") ||
            haystack.includes("aadsts50058")
        );
    }

    /**
     * Authenticate using client ID and secret with automatic token caching
     * Uses ConfidentialClientApplication which handles token refresh automatically
     * @param scopes Optional array of scopes to request. Defaults to `${connection.url}/.default`
     */
    async authenticateClientSecret(
        connection: Connection,
        scopes?: string[],
        skipValidateEnvAccess: boolean = false,
    ): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date; scopes?: string[] }> {
        if (!connection.clientId || !connection.clientSecret || !connection.tenantId) {
            throw new Error("Client ID, Client Secret, and Tenant ID are required for client secret authentication");
        }

        const confidentialApp = this.getConfidentialApp(connection.id, connection.clientId, connection.clientSecret, connection.tenantId);
        const requestedScopes = scopes || [`${connection.url}/.default`];

        try {
            // MSAL ConfidentialClientApplication automatically caches tokens
            // and only acquires new ones when expired
            const response = await confidentialApp.acquireTokenByClientCredential({
                scopes: requestedScopes,
            });

            if (!response) {
                throw new Error("No response from token acquisition");
            }

            const authResult = {
                accessToken: response.accessToken,
                refreshToken: undefined, // Client credentials flow doesn't provide refresh tokens
                expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
                scopes: Array.isArray(response.scopes) ? response.scopes : requestedScopes,
            };

            if (!skipValidateEnvAccess) {
                // Validate user has access to the environment by performing a WhoAmI check
                await this.validateEnvironmentAccess(connection, authResult.accessToken);
            }

            return authResult;
        } catch (error) {
            logError("Client secret authentication failed", error);
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
    async authenticateUsernamePassword(
        connection: Connection,
    ): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date; msalAccountId?: string; scopes?: string[]; environmentTenantId?: string }> {
        if (!connection.username || !connection.password) {
            throw new Error("Username and password are required for password authentication");
        }

        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
        const { authorityTenant, environmentTenant } = await this.resolveAuthorityTenant(connection);
        const authority = this.authorityUrl(authorityTenant);
        const msalApp = this.getMsalApp(connection.id, clientId, authorityTenant);
        // Username/password flow only supports delegated access (user_impersonation)
        const scopes = [`${this.normalizeEnvironmentUrl(connection.url)}/user_impersonation`];

        try {
            // Use MSAL's acquireTokenByUsernamePassword method
            const usernamePasswordRequest = {
                scopes: scopes,
                username: connection.username,
                password: connection.password,
                authority,
            };

            const response = await msalApp.acquireTokenByUsernamePassword(usernamePasswordRequest);

            if (!response || !response.accessToken) {
                throw new Error("Failed to acquire access token");
            }

            const matchedEnvironment = this.assertEnvironmentToken(response.accessToken, environmentTenant);
            // Validate user has access to the environment by performing a WhoAmI check
            await this.validateEnvironmentAccess(connection, response.accessToken, matchedEnvironment);

            // Return tokens with MSAL account ID for silent token acquisition
            return {
                accessToken: response.accessToken,
                refreshToken: undefined, // MSAL handles refresh internally via cache
                expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
                msalAccountId: response.account?.homeAccountId, // Store for silent token acquisition
                scopes: Array.isArray(response.scopes) ? response.scopes : scopes,
                environmentTenantId: this.persistedEnvironmentTenant(connection, environmentTenant),
            };
        } catch (error) {
            logError("Username/password authentication failed", error);

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
    async testConnection(connection: Connection): Promise<boolean> {
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
            const whoAmIUrl = `${this.normalizeEnvironmentUrl(connection.url)}/api/data/${DATAVERSE_API_VERSION}/WhoAmI`;
            const response = await this.makeAuthenticatedRequest(whoAmIUrl, accessToken);
            const data = JSON.parse(response);

            // If we get a UserId back, the connection is successful
            if (data.UserId) {
                return true;
            }

            throw new Error("Connection test failed: Unable to verify identity");
        } catch (error) {
            logError("Test connection failed", error);
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
                agent: this.proxyManager.getAgentForUrl(url),
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
                agent: this.proxyManager.getAgentForUrl(url),
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
    private async validateEnvironmentAccess(connection: Connection, accessToken: string, guestAccessHint = false): Promise<void> {
        try {
            const whoAmIUrl = `${this.normalizeEnvironmentUrl(connection.url)}/api/data/${DATAVERSE_API_VERSION}/WhoAmI`;
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
                const guestHint = guestAccessHint ? " Guest access to Dataverse may be restricted in this environment." : "";
                throw new Error(`You do not have permission to access this environment. Please verify the user account matches the selected environment.${guestHint}`);
            }
            throw new Error(`Environment access validation failed: ${errorMessage}`);
        }
    }

    /**
     * Helper method to find MSAL account for a connection
     * @param connection The connection to find account for
     * @returns Promise with the account or undefined if not found
     */
    private async findMsalAccount(connection: Connection, tenantId: string): Promise<AccountInfo | undefined> {
        try {
            const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
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
    async hasAccountInCache(connection: Connection): Promise<boolean> {
        const { authorityTenant } = await this.resolveAuthorityTenant(connection);
        const account = await this.findMsalAccount(connection, authorityTenant);
        return account !== undefined;
    }

    /**
     * Acquire access token silently using MSAL's built-in token cache and refresh logic
     * MSAL automatically handles token refresh if the access token is expired
     * @param connection The connection to acquire token for
     * @returns Promise with access token (MSAL handles refresh internally)
     */
    async acquireTokenSilently(connection: Connection): Promise<{ accessToken: string; expiresOn: Date }> {
        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
        const { authorityTenant, environmentTenant } = await this.resolveAuthorityTenant(connection);
        const authority = this.authorityUrl(authorityTenant);
        const msalApp = this.getMsalApp(connection.id, clientId, authorityTenant);
        // Use user_impersonation scope for username/password flow (delegated access only)
        // For interactive flow, both .default and user_impersonation work
        const resource = this.normalizeEnvironmentUrl(connection.url);
        const scopes = connection.authenticationType === "usernamePassword" ? [`${resource}/user_impersonation`] : [`${resource}/.default`];

        // Get the account from MSAL cache
        const account = await this.findMsalAccount(connection, authorityTenant);

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
                authority,
            });

            this.assertEnvironmentToken(response.accessToken, environmentTenant);

            return {
                accessToken: response.accessToken,
                expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
            };
        } catch (error) {
            if (error instanceof Error && error.message.startsWith("Signed in to the wrong directory.")) throw error;
            // Silent acquisition failed - likely refresh token expired
            logWarn("Silent token acquisition failed - re-authentication required");
            throw new Error("Token refresh failed. Please authenticate again.");
        }
    }

    /**
     * Acquire access token for Power Platform API with scope https://api.powerplatform.com/.default
     * This method should only be invoked when using Power Platform API methods
     * @param connection The connection to acquire token for
     * @returns Promise with access token (MSAL handles refresh internally)
     */
    async acquirePowerPlatformToken(connection: Connection): Promise<{ accessToken: string; expiresOn: Date; scopes?: string[] }> {
        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
        const { authorityTenant, environmentTenant } = await this.resolveAuthorityTenant(connection);
        const authority = this.authorityUrl(authorityTenant);
        const msalApp = this.getMsalApp(connection.id, clientId, authorityTenant);
        const scope = "https://api.powerplatform.com/.default";

        // Get the account from MSAL cache
        const account = await this.findMsalAccount(connection, authorityTenant);

        if (!account) {
            throw new Error("No cached account found. Please authenticate again.");
        }

        try {
            const response = await msalApp.acquireTokenSilent({
                account: account,
                scopes: [scope],
                authority,
            });

            this.assertEnvironmentToken(response.accessToken, environmentTenant);

            return {
                accessToken: response.accessToken,
                expiresOn: response.expiresOn || new Date(Date.now() + 3600 * 1000),
                scopes: Array.isArray(response.scopes) ? response.scopes : [scope],
            };
        } catch (error) {
            if (error instanceof Error && error.message.startsWith("Signed in to the wrong directory.")) throw error;
            if (this.isInteractionRequiredError(error)) {
                logInfo("Power Platform token requires interactive consent/sign-in; starting interactive flow");
                return await this.acquirePowerPlatformTokenInteractive(connection, msalApp, authority, environmentTenant);
            }

            logWarn("Power Platform token silent acquisition failed - re-authentication required");
            throw new Error("Token refresh failed. Please authenticate again.");
        }
    }

    private async acquirePowerPlatformTokenInteractive(
        connection: Connection,
        msalApp: PublicClientApplication,
        authority: string,
        environmentTenant?: string,
    ): Promise<{ accessToken: string; expiresOn: Date; scopes?: string[] }> {
        const port = await this.findAvailablePort();
        const redirectUri = `http://localhost:${port}`;
        const scopes = ["https://api.powerplatform.com/.default"];

        const authCodeUrl = await msalApp.getAuthCodeUrl({
            scopes,
            redirectUri,
            authority,
            loginHint: connection.username,
        });

        const authResult = await this.listenForAuthCodeAndValidate(port, authCodeUrl, connection, scopes, redirectUri, msalApp, authority, async (accessToken) => {
            this.assertEnvironmentToken(accessToken, environmentTenant);
        });

        return {
            accessToken: authResult.accessToken,
            expiresOn: authResult.expiresOn,
            scopes: authResult.scopes,
        };
    }

    /**
     * Refresh an access token using a refresh token
     * This is used for username/password flow and legacy interactive connections
     * For modern interactive connections, use acquireTokenSilently() instead
     * @param scopes Optional array of scopes to request. Defaults to `${connection.url}/.default`
     */
    async refreshAccessToken(connection: Connection, refreshToken: string, scopes?: string[]): Promise<{ accessToken: string; refreshToken?: string; expiresOn: Date; scopes?: string[] }> {
        const clientId = connection.clientId || "51f81489-12ee-4a9e-aaae-a2591f45987d";
        const { authorityTenant, environmentTenant } = await this.resolveAuthorityTenant(connection);
        const tokenEndpoint = `${this.authorityUrl(authorityTenant)}/oauth2/v2.0/token`;
        const scope = scopes ? scopes.join(" ") : `${this.normalizeEnvironmentUrl(connection.url)}/.default`;

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

            this.assertEnvironmentToken(data.access_token, environmentTenant);

            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || refreshToken,
                expiresOn: new Date(Date.now() + data.expires_in * 1000),
                scopes: typeof data.scope === "string" ? data.scope.split(" ").filter((scope: string) => scope.length > 0) : scopes,
            };
        } catch (error) {
            logError("Token refresh failed", error);
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
        this.msalAppFingerprints.clear();
        this.environmentTenantCache.clear();
        this.confidentialApps.clear();
        this.azureRenewals.clear();
    }
}
