import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { logError, logInfo, logWarn } from "../../common/logger";
import {
    Connection,
    ConnectionProviderChildMessage,
    ConnectionProviderDeclaration,
    ConnectionProviderHostMethod,
    ConnectionProviderInfo,
    ConnectionProviderMethod,
    ConnectionProviderParentMessage,
    EXTERNAL_CONNECTION_ID_PREFIX,
    ProviderAuthenticateContext,
    ProviderConnectionInfo,
    ProviderEntraTokenRequest,
    ProviderEntraTokenResult,
    ProviderPromptRequest,
    ProviderPromptResult,
    isExternalConnectionId,
} from "../../common/types";

/**
 * Handle to a provider's isolated process. Abstracted so tests can substitute an in-process fake.
 */
export interface ConnectionProviderProcess {
    postMessage(message: ConnectionProviderParentMessage): void;
    onMessage(listener: (message: ConnectionProviderChildMessage) => void): void;
    onExit(listener: (code: number) => void): void;
    kill(): void;
}

export type ConnectionProviderProcessFactory = (options: { providerId: string; displayName: string; cwd: string }) => ConnectionProviderProcess;

export interface ConnectionProviderManagerOptions {
    processFactory: ConnectionProviderProcessFactory;
    acquireEntraToken: (providerId: string, request: ProviderEntraTokenRequest) => Promise<ProviderEntraTokenResult>;
    prompt: (providerName: string, request: ProviderPromptRequest) => Promise<ProviderPromptResult | null>;
    callTimeoutMs?: number;
    authenticateTimeoutMs?: number;
}

interface PendingCall {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
}

interface ProviderRuntime {
    key: string;
    extensionId: string;
    declarationId: string;
    displayName: string;
    rootPath: string;
    modulePath: string;
    status: ConnectionProviderInfo["status"];
    error?: string;
    process: ConnectionProviderProcess | null;
    ready: Promise<void> | null;
    methods: Set<ConnectionProviderMethod>;
    pending: Map<number, PendingCall>;
    nextCallId: number;
    connections: Connection[];
    authInFlight: Map<string, Promise<{ accessToken: string; expiresOn: Date }>>;
}

const DECLARATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const TENANT_PATTERN = /^[A-Za-z0-9.-]{1,128}$/;
const VALID_ENVIRONMENTS = new Set<Connection["environment"]>(["Dev", "Test", "UAT", "Production"]);
const MAX_CONNECTIONS_PER_PROVIDER = 5000;
const INIT_TIMEOUT_MS = 30_000;

/**
 * Read the connection provider declarations from an extension's package.json.
 * Invalid entries are skipped with a warning.
 */
export function readConnectionProviderDeclarations(rootPath: string): ConnectionProviderDeclaration[] {
    const packageJsonPath = path.join(rootPath, "package.json");
    if (!fs.existsSync(packageJsonPath)) return [];

    let packageJson: { pptbConnectionProviders?: unknown };
    try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    } catch (error) {
        logWarn(`[ConnectionProviders] Could not parse ${packageJsonPath}`, error);
        return [];
    }

    const raw = packageJson.pptbConnectionProviders;
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
        logWarn(`[ConnectionProviders] pptbConnectionProviders in ${packageJsonPath} must be an array`);
        return [];
    }

    const declarations: ConnectionProviderDeclaration[] = [];
    for (const entry of raw) {
        const candidate = entry as Partial<ConnectionProviderDeclaration> | null;
        if (!candidate || typeof candidate.id !== "string" || !DECLARATION_ID_PATTERN.test(candidate.id) || typeof candidate.main !== "string" || !candidate.main) {
            logWarn(`[ConnectionProviders] Skipping invalid connection provider declaration in ${packageJsonPath}`);
            continue;
        }
        declarations.push({
            id: candidate.id,
            main: candidate.main,
            displayName: typeof candidate.displayName === "string" && candidate.displayName.trim() ? candidate.displayName.trim() : candidate.id,
        });
    }
    return declarations;
}

/**
 * Build the connection ID used by the app for a provider-supplied connection
 */
export function buildExternalConnectionId(providerKey: string, providerConnectionId: string): string {
    return `${EXTERNAL_CONNECTION_ID_PREFIX}${providerKey}:${providerConnectionId}`;
}

/**
 * Split an external connection ID into the provider key and the provider's own connection ID
 */
export function parseExternalConnectionId(id: string): { providerKey: string; providerConnectionId: string } | null {
    if (!isExternalConnectionId(id)) return null;
    const rest = id.slice(EXTERNAL_CONNECTION_ID_PREFIX.length);
    const separator = rest.indexOf(":");
    if (separator <= 0 || separator === rest.length - 1) return null;
    return { providerKey: rest.slice(0, separator), providerConnectionId: rest.slice(separator + 1) };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Manages connection providers contributed by extensions.
 *
 * Each provider runs in its own isolated process. The manager caches the connections each provider
 * returns (exposed with `authenticationType: "external"` and namespaced IDs) and routes authentication
 * requests for those connections to the owning provider. Providers can ask the host to sign the user in
 * to Microsoft Entra ID or to prompt the user for text.
 *
 * Emits `connections-changed` (providerKey) whenever a provider's connection list changes.
 */
export class ConnectionProviderManager extends EventEmitter {
    private readonly providers = new Map<string, ProviderRuntime>();
    private readonly callTimeoutMs: number;
    private readonly authenticateTimeoutMs: number;
    private disposed = false;

    constructor(private readonly options: ConnectionProviderManagerOptions) {
        super();
        this.callTimeoutMs = options.callTimeoutMs ?? 60_000;
        this.authenticateTimeoutMs = options.authenticateTimeoutMs ?? 15 * 60_000;
    }

    /**
     * Register the providers declared by an extension and load their connections.
     * Re-registering an extension restarts its providers.
     */
    async registerExtension(extensionId: string, rootPath: string): Promise<void> {
        if (this.disposed) return;
        const declarations = readConnectionProviderDeclarations(rootPath);
        this.unregisterExtension(extensionId, declarations.length === 0);
        if (declarations.length === 0) return;

        const resolvedRoot = path.resolve(rootPath);
        const runtimes: ProviderRuntime[] = [];
        for (const declaration of declarations) {
            const modulePath = path.resolve(resolvedRoot, declaration.main);
            const relative = path.relative(resolvedRoot, modulePath);
            if (relative.startsWith("..") || path.isAbsolute(relative)) {
                logWarn(`[ConnectionProviders] Provider ${declaration.id} in ${extensionId} points outside the extension folder; skipping`);
                continue;
            }
            if (!fs.existsSync(modulePath)) {
                logWarn(`[ConnectionProviders] Provider module not found for ${declaration.id} in ${extensionId}: ${modulePath}`);
                continue;
            }

            const key = `${extensionId.replace(/:/g, "_")}/${declaration.id}`;
            const runtime: ProviderRuntime = {
                key,
                extensionId,
                declarationId: declaration.id,
                displayName: declaration.displayName,
                rootPath: resolvedRoot,
                modulePath,
                status: "stopped",
                process: null,
                ready: null,
                methods: new Set(),
                pending: new Map(),
                nextCallId: 1,
                connections: [],
                authInFlight: new Map(),
            };
            this.providers.set(key, runtime);
            runtimes.push(runtime);
            logInfo(`[ConnectionProviders] Registered provider ${key} (${declaration.displayName})`);
        }

        await Promise.all(runtimes.map((runtime) => this.refreshProvider(runtime)));
    }

    /**
     * Stop and remove all providers contributed by an extension
     */
    unregisterExtension(extensionId: string, notify = true): void {
        for (const runtime of [...this.providers.values()]) {
            if (runtime.extensionId !== extensionId) continue;
            this.stopProvider(runtime, "Provider was unregistered");
            this.providers.delete(runtime.key);
            if (notify && runtime.connections.length > 0) this.emit("connections-changed", runtime.key);
        }
    }

    getProviders(): ConnectionProviderInfo[] {
        return [...this.providers.values()].map((runtime) => ({
            id: runtime.key,
            displayName: runtime.displayName,
            extensionId: runtime.extensionId,
            status: runtime.status,
            connectionCount: runtime.connections.length,
            error: runtime.error,
        }));
    }

    /**
     * Cached connections from all providers
     */
    getConnections(): Connection[] {
        return [...this.providers.values()].flatMap((runtime) => runtime.connections.map((connection) => ({ ...connection })));
    }

    getConnectionById(id: string): Connection | null {
        const parsed = parseExternalConnectionId(id);
        if (!parsed) return null;
        const connection = this.providers.get(parsed.providerKey)?.connections.find((c) => c.id === id);
        return connection ? { ...connection } : null;
    }

    /**
     * Reload connections from one provider, or all providers when no key is given
     */
    async refreshConnections(providerKey?: string): Promise<void> {
        const runtimes = providerKey ? [this.providers.get(providerKey)].filter((r): r is ProviderRuntime => !!r) : [...this.providers.values()];
        await Promise.all(runtimes.map((runtime) => this.refreshProvider(runtime)));
    }

    /**
     * Ask the owning provider for an access token for a connection.
     * Concurrent requests for the same connection share a single provider call.
     */
    async authenticate(connectionId: string, reason: ProviderAuthenticateContext["reason"], tool?: ProviderAuthenticateContext["tool"]): Promise<{ accessToken: string; expiresOn: Date }> {
        const parsed = parseExternalConnectionId(connectionId);
        const runtime = parsed ? this.providers.get(parsed.providerKey) : undefined;
        if (!parsed || !runtime) {
            throw new Error("The extension that provides this connection is not available. Make sure it is installed and loaded.");
        }

        const existing = runtime.authInFlight.get(parsed.providerConnectionId);
        if (existing) return existing;

        const promise = (async () => {
            const context: ProviderAuthenticateContext = tool ? { reason, tool } : { reason };
            const result = (await this.call(runtime, "authenticate", [parsed.providerConnectionId, context], this.authenticateTimeoutMs)) as { accessToken?: unknown; expiresOn?: unknown } | null;
            if (!result || typeof result.accessToken !== "string" || !result.accessToken) {
                throw new Error(`${runtime.displayName} did not return an access token`);
            }
            const expiresOn = typeof result.expiresOn === "number" || typeof result.expiresOn === "string" ? new Date(result.expiresOn) : new Date(NaN);
            if (Number.isNaN(expiresOn.getTime())) {
                throw new Error(`${runtime.displayName} returned an invalid token expiry`);
            }
            return { accessToken: result.accessToken, expiresOn };
        })().finally(() => runtime.authInFlight.delete(parsed.providerConnectionId));

        runtime.authInFlight.set(parsed.providerConnectionId, promise);
        return promise;
    }

    /**
     * Let the provider discard any cached credentials for a connection (optional provider capability)
     */
    async signOut(connectionId: string): Promise<void> {
        const parsed = parseExternalConnectionId(connectionId);
        const runtime = parsed ? this.providers.get(parsed.providerKey) : undefined;
        if (!parsed || !runtime || !runtime.methods.has("signOut")) return;
        await this.call(runtime, "signOut", [parsed.providerConnectionId], this.callTimeoutMs);
    }

    dispose(): void {
        this.disposed = true;
        for (const runtime of this.providers.values()) this.stopProvider(runtime, "Application is shutting down");
        this.providers.clear();
    }

    private async refreshProvider(runtime: ProviderRuntime): Promise<void> {
        try {
            // Listing connections may require the provider to sign the user in interactively
            const result = await this.call(runtime, "getConnections", [], this.authenticateTimeoutMs);
            runtime.connections = this.normalizeConnections(runtime, result);
            runtime.error = undefined;
            logInfo(`[ConnectionProviders] ${runtime.key} returned ${runtime.connections.length} connection(s)`);
        } catch (error) {
            runtime.error = errorMessage(error);
            logError(`[ConnectionProviders] Failed to load connections from ${runtime.key}`, error);
        }
        if (this.providers.get(runtime.key) === runtime) this.emit("connections-changed", runtime.key);
    }

    private normalizeConnections(runtime: ProviderRuntime, raw: unknown): Connection[] {
        if (!Array.isArray(raw)) throw new Error("getConnections() must return an array");

        const seen = new Set<string>();
        const connections: Connection[] = [];
        for (const item of raw.slice(0, MAX_CONNECTIONS_PER_PROVIDER)) {
            const info = item as Partial<ProviderConnectionInfo> | null;
            if (!info || typeof info.id !== "string" || !info.id || typeof info.name !== "string" || typeof info.url !== "string") continue;
            if (info.id.length > 512 || [...info.id].some((char) => char.charCodeAt(0) < 32)) continue;
            if (seen.has(info.id)) continue;

            let url: URL;
            try {
                url = new URL(info.url);
            } catch {
                continue;
            }
            if (url.protocol !== "https:") continue;

            seen.add(info.id);
            connections.push({
                id: buildExternalConnectionId(runtime.key, info.id),
                name: info.name,
                url: url.origin,
                environment: info.environment && VALID_ENVIRONMENTS.has(info.environment) ? info.environment : "Production",
                authenticationType: "external",
                createdAt: new Date(0).toISOString(),
                username: typeof info.username === "string" ? info.username : undefined,
                category: typeof info.category === "string" && info.category ? info.category : runtime.displayName,
                description: typeof info.description === "string" ? info.description : undefined,
                providerId: runtime.key,
                providerName: runtime.displayName,
                readOnly: true,
                enabledForPowerPlatformAPI: false,
            });
        }
        if (raw.length > connections.length) {
            logWarn(`[ConnectionProviders] ${runtime.key} returned ${raw.length - connections.length} invalid or duplicate connection(s) that were ignored`);
        }
        return connections;
    }

    private ensureStarted(runtime: ProviderRuntime): Promise<void> {
        if (runtime.ready) return runtime.ready;

        runtime.status = "starting";
        runtime.error = undefined;
        runtime.ready = new Promise<void>((resolve, reject) => {
            let proc: ConnectionProviderProcess;
            try {
                proc = this.options.processFactory({ providerId: runtime.key, displayName: runtime.displayName, cwd: runtime.rootPath });
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            runtime.process = proc;

            let initialized = false;
            const initTimer = setTimeout(() => {
                if (initialized) return;
                initialized = true;
                reject(new Error(`${runtime.displayName} did not start within ${INIT_TIMEOUT_MS / 1000} seconds`));
                this.stopProvider(runtime, "Provider failed to start");
            }, INIT_TIMEOUT_MS);

            proc.onMessage((message) => {
                if (runtime.process !== proc || !message || typeof message !== "object") return;
                switch (message.type) {
                    case "ready":
                        if (initialized) return;
                        initialized = true;
                        clearTimeout(initTimer);
                        runtime.methods = new Set(Array.isArray(message.methods) ? message.methods : []);
                        runtime.status = "ready";
                        resolve();
                        break;
                    case "init-error":
                        if (initialized) return;
                        initialized = true;
                        clearTimeout(initTimer);
                        reject(new Error(`${runtime.displayName} failed to start: ${message.error}`));
                        this.stopProvider(runtime, "Provider failed to start");
                        break;
                    default:
                        this.handleChildMessage(runtime, message);
                }
            });

            proc.onExit((code) => {
                if (runtime.process !== proc) return;
                clearTimeout(initTimer);
                const error = new Error(`${runtime.displayName} stopped unexpectedly (exit code ${code})`);
                if (!initialized) {
                    initialized = true;
                    reject(error);
                }
                logWarn(`[ConnectionProviders] ${error.message}`);
                this.resetRuntime(runtime, error, "error");
            });

            proc.postMessage({ type: "init", providerId: runtime.key, modulePath: runtime.modulePath });
        }).catch((error: Error) => {
            runtime.status = "error";
            runtime.error = error.message;
            runtime.ready = null;
            throw error;
        });

        return runtime.ready;
    }

    private async call(runtime: ProviderRuntime, method: ConnectionProviderMethod, args: unknown[], timeoutMs: number): Promise<unknown> {
        await this.ensureStarted(runtime);
        const proc = runtime.process;
        if (!proc) throw new Error(`${runtime.displayName} is not running`);
        if (method !== "getConnections" && method !== "authenticate" && !runtime.methods.has(method)) {
            throw new Error(`${runtime.displayName} does not support ${method}()`);
        }

        const id = runtime.nextCallId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                runtime.pending.delete(id);
                reject(new Error(`${runtime.displayName} did not respond to ${method}() in time`));
            }, timeoutMs);
            runtime.pending.set(id, { resolve, reject, timer });
            proc.postMessage({ type: "call", id, method, args });
        });
    }

    private handleChildMessage(runtime: ProviderRuntime, message: ConnectionProviderChildMessage): void {
        switch (message.type) {
            case "result":
            case "error": {
                const pending = runtime.pending.get(message.id);
                if (!pending) return;
                runtime.pending.delete(message.id);
                clearTimeout(pending.timer);
                if (message.type === "result") pending.resolve(message.result);
                else pending.reject(new Error(String(message.error)));
                break;
            }
            case "host-call":
                void this.handleHostCall(runtime, message.id, message.method, Array.isArray(message.args) ? message.args : []);
                break;
            case "log": {
                const text = `[ConnectionProviders] [${runtime.key}] ${String(message.message).slice(0, 2000)}`;
                if (message.level === "error") logError(text);
                else if (message.level === "warn") logWarn(text);
                else logInfo(text);
                break;
            }
        }
    }

    private async handleHostCall(runtime: ProviderRuntime, id: number, method: ConnectionProviderHostMethod, args: unknown[]): Promise<void> {
        const proc = runtime.process;
        try {
            let result: unknown;
            if (method === "acquireEntraToken") {
                result = await this.options.acquireEntraToken(runtime.key, this.validateEntraTokenRequest(args[0]));
            } else if (method === "prompt") {
                const request = args[0] as ProviderPromptRequest | null;
                if (!request || typeof request !== "object" || typeof request.title !== "string") throw new Error("prompt() requires a title");
                if (!Array.isArray(request.fields) || request.fields.length === 0) throw new Error("prompt() requires at least one field");
                result = await this.options.prompt(runtime.displayName, request);
            } else {
                throw new Error(`Unknown host method: ${String(method)}`);
            }
            if (runtime.process === proc) proc?.postMessage({ type: "host-result", id, result: result ?? null });
        } catch (error) {
            if (runtime.process === proc) proc?.postMessage({ type: "host-error", id, error: errorMessage(error) });
        }
    }

    private validateEntraTokenRequest(raw: unknown): ProviderEntraTokenRequest {
        const request = raw as Partial<ProviderEntraTokenRequest> | null;
        if (!request || typeof request !== "object") throw new Error("acquireEntraToken() requires a request object");
        if (typeof request.clientId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(request.clientId)) throw new Error("acquireEntraToken() requires a valid clientId");
        if (request.tenantId !== undefined && (typeof request.tenantId !== "string" || !TENANT_PATTERN.test(request.tenantId))) throw new Error("acquireEntraToken() received an invalid tenantId");
        if (!Array.isArray(request.scopes) || request.scopes.length === 0 || !request.scopes.every((scope) => typeof scope === "string" && scope.length > 0 && scope.length < 512)) {
            throw new Error("acquireEntraToken() requires at least one scope");
        }
        return {
            clientId: request.clientId,
            tenantId: request.tenantId,
            scopes: [...request.scopes],
            loginHint: typeof request.loginHint === "string" ? request.loginHint : undefined,
            forceInteractive: request.forceInteractive === true,
        };
    }

    private stopProvider(runtime: ProviderRuntime, reason: string): void {
        const proc = runtime.process;
        this.resetRuntime(runtime, new Error(reason), "stopped");
        if (proc) {
            try {
                proc.postMessage({ type: "call", id: 0, method: "dispose", args: [] });
            } catch {
                // Process may already be gone
            }
            try {
                proc.kill();
            } catch (error) {
                logWarn(`[ConnectionProviders] Failed to stop ${runtime.key}`, error);
            }
        }
    }

    private resetRuntime(runtime: ProviderRuntime, error: Error, status: ConnectionProviderInfo["status"]): void {
        runtime.process = null;
        runtime.ready = null;
        runtime.status = status;
        runtime.error = status === "error" ? error.message : runtime.error;
        for (const pending of runtime.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        runtime.pending.clear();
    }
}
