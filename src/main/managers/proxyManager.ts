import { app, session, type AuthInfo } from "electron";
import Store from "electron-store";
import * as fs from "fs";
import * as http from "http";
import { HttpProxyAgent } from "http-proxy-agent";
import * as https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";
import type * as net from "net";
import * as tls from "tls";
import { Agent as UndiciAgent, ProxyAgent as UndiciProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { logInfo, logWarn } from "../../common/logger";
import { captureException } from "../../common/sentryHelper";
import type { ProxySettings } from "../../common/types";
import { categorizeTargetHost, classifyProxyConnectStatus, classifyProxyError, describeProxyFailure, type ProxyFailure, type ProxyFailureNotice } from "../utils/proxyFailure";
import { EncryptionManager } from "./encryptionManager";
import { SettingsManager } from "./settingsManager";

interface ProxyAuthEntry {
    username: string;
    encryptedPassword: string;
}

type ProxyAuthStore = Record<string, ProxyAuthEntry>;

interface EffectiveProxySettings {
    mode: "manual" | "auto" | "none";
    proxyUrl?: string;
    noProxyList: string[];
    caBundlePath?: string;
}

type CredentialPromptHandler = (authInfo: AuthInfo) => Promise<{ username: string; password: string } | null>;
type ProxyFailureNotifier = (notice: ProxyFailureNotice) => void;
type ProxyFailureListener = (failure: ProxyFailure, targetHost: string) => void;
type HttpsProxyConnectOpts = Parameters<HttpsProxyAgent<string>["connect"]>[1];

class ReportingHttpsProxyAgent extends HttpsProxyAgent<string> {
    constructor(
        proxyUrl: string,
        private readonly targetCa: string | undefined,
        private readonly onFailure?: ProxyFailureListener,
    ) {
        super(proxyUrl, targetCa ? { ca: targetCa } : undefined);
        if (onFailure) {
            this.on("proxyConnect", (connect: { statusCode: number }, req: http.ClientRequest) => {
                const failure = classifyProxyConnectStatus(connect.statusCode);
                if (failure) {
                    onFailure(failure, req.host);
                }
            });
        }
    }

    async connect(req: http.ClientRequest, opts: HttpsProxyConnectOpts): Promise<net.Socket> {
        // https-proxy-agent builds the target TLS connection from per-request options only,
        // so the custom CA bundle must be injected here for TLS-inspecting proxies.
        const connectOpts = this.targetCa && opts.secureEndpoint && !opts.ca ? ({ ...opts, ca: this.targetCa } as HttpsProxyConnectOpts) : opts;
        try {
            const socket = await super.connect(req, connectOpts);
            if (this.onFailure && socket instanceof tls.TLSSocket) {
                socket.once("error", (error) => {
                    const failure = classifyProxyError(error);
                    if (failure?.kind === "tls-untrusted") {
                        this.onFailure?.(failure, opts.host || "");
                    }
                });
            }
            return socket;
        } catch (error) {
            const failure = classifyProxyError(error);
            if (failure) {
                this.onFailure?.(failure, opts.host || "");
            }
            throw error;
        }
    }
}

function toReadableFetchError(error: unknown): unknown {
    // undici reports every network failure as "fetch failed"; surface the underlying reason.
    if (error instanceof Error && error.message === "fetch failed" && error.cause instanceof Error) {
        const code = (error.cause as { code?: unknown }).code;
        return new Error(`fetch failed: ${error.cause.message}${typeof code === "string" && !error.cause.message.includes(code) ? ` (${code})` : ""}`, { cause: error });
    }
    return error;
}

function normalizeProxySettings(input?: ProxySettings): ProxySettings {
    const mode = input?.mode === "manual" || input?.mode === "none" ? input.mode : "auto";
    const noProxyList = Array.isArray(input?.noProxyList)
        ? input.noProxyList
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
        : [];

    return {
        mode,
        manualProxyUrl: typeof input?.manualProxyUrl === "string" ? input.manualProxyUrl.trim() : "",
        noProxyList,
        caBundlePath: typeof input?.caBundlePath === "string" ? input.caBundlePath.trim() : "",
    };
}

function normalizeProxyUrl(urlValue: string): string | undefined {
    if (!urlValue || typeof urlValue !== "string") {
        return undefined;
    }

    const trimmedValue = urlValue.trim();
    if (!trimmedValue) {
        return undefined;
    }

    try {
        const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmedValue) ? trimmedValue : `http://${trimmedValue}`;
        const parsed = new URL(withProtocol);
        if (!parsed.hostname) {
            return undefined;
        }
        return parsed.toString();
    } catch {
        return undefined;
    }
}

function parseResolvedProxyResult(value: string): string | undefined {
    if (!value || typeof value !== "string") {
        return undefined;
    }

    const entries = value
        .split(";")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    for (const entry of entries) {
        if (/^DIRECT$/i.test(entry)) {
            continue;
        }

        const match = entry.match(/^(PROXY|HTTP|HTTPS)\s+(.+)$/i);
        if (!match) {
            if (/^SOCKS/i.test(entry)) {
                logWarn("[ProxyManager] SOCKS proxy detected from system settings, which is not supported in this phase");
            }
            continue;
        }

        const hostPort = match[2].trim();
        const normalized = normalizeProxyUrl(`http://${hostPort}`);
        if (normalized) {
            return normalized;
        }
    }

    return undefined;
}

function matchesNoProxy(hostname: string, noProxyList: string[]): boolean {
    if (!hostname || noProxyList.length === 0) {
        return false;
    }

    return noProxyList.some((rawEntry) => {
        const entry = rawEntry.trim();
        if (!entry) {
            return false;
        }

        if (entry === "*") {
            return true;
        }

        const normalized = entry.startsWith(".") ? entry.slice(1) : entry;
        return hostname === normalized || hostname.endsWith(`.${normalized}`);
    });
}

function describeProxy(proxyUrl?: string): string {
    if (!proxyUrl) {
        return "direct";
    }

    try {
        const parsed = new URL(proxyUrl);
        return `${parsed.protocol}//${parsed.host}${parsed.username ? " (with credentials)" : ""}`;
    } catch {
        return "invalid";
    }
}

function hasProxyCredentials(proxyUrl?: string): boolean {
    try {
        return Boolean(proxyUrl && new URL(proxyUrl).username);
    } catch {
        return false;
    }
}

export function applyProxyEnvironmentBootstrap(): void {
    try {
        const store = new Store<{ proxy?: ProxySettings }>({ name: "user-settings" });
        const proxySettings = normalizeProxySettings(store.get("proxy"));
        const proxyUrl = proxySettings.mode === "manual" ? normalizeProxyUrl(proxySettings.manualProxyUrl || "") : undefined;

        if (proxySettings.mode === "none" || !proxyUrl) {
            delete process.env.HTTP_PROXY;
            delete process.env.HTTPS_PROXY;
        } else {
            process.env.HTTP_PROXY = proxyUrl;
            process.env.HTTPS_PROXY = proxyUrl;
        }

        if (proxySettings.noProxyList && proxySettings.noProxyList.length > 0) {
            process.env.NO_PROXY = proxySettings.noProxyList.join(",");
        } else {
            delete process.env.NO_PROXY;
        }
    } catch (error) {
        logWarn("[ProxyManager] Failed to apply proxy environment bootstrap", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

export class ProxyManager {
    private readonly settingsManager: SettingsManager;
    private readonly encryptionManager: EncryptionManager;
    private readonly authStore: Store<ProxyAuthStore>;
    private readonly agentCache = new Map<string, http.RequestOptions["agent"]>();
    private readonly fetchDispatcherCache = new Map<string, Dispatcher>();
    private readonly loggedRoutes = new Set<string>();
    private readonly failureLastReportedAt = new Map<string, number>();
    private systemProxyUrl?: string;
    private credentialPromptHandler?: CredentialPromptHandler;
    private failureNotifier?: ProxyFailureNotifier;

    // Throttle notifications and telemetry for the same failure kind + host so a failing tool
    // making many requests does not flood the user or Sentry.
    private static readonly FAILURE_REPORT_INTERVAL_MS = 5 * 60_000;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
        this.encryptionManager = new EncryptionManager();
        this.authStore = new Store<ProxyAuthStore>({
            name: "proxy-auth",
            defaults: {},
        });
    }

    async initialize(): Promise<void> {
        const probeTarget = process.env.SUPABASE_URL || "https://api.github.com";
        await this.detectSystemProxy(probeTarget);
        this.applyProxyEnvironment();
    }

    setCredentialPromptHandler(handler: CredentialPromptHandler): void {
        this.credentialPromptHandler = handler;
    }

    setFailureNotifier(notifier: ProxyFailureNotifier): void {
        this.failureNotifier = notifier;
    }

    async detectSystemProxy(targetUrl: string): Promise<void> {
        try {
            if (!app.isReady()) {
                return;
            }

            const resolved = await session.defaultSession.resolveProxy(targetUrl);
            const detectedProxyUrl = parseResolvedProxyResult(resolved);
            this.systemProxyUrl = detectedProxyUrl;

            logInfo("[ProxyManager] System proxy auto-detection completed", {
                hasProxy: Boolean(detectedProxyUrl),
                mode: detectedProxyUrl ? "proxy" : "direct",
            });
        } catch (error) {
            logWarn("[ProxyManager] System proxy auto-detection failed", {
                error: error instanceof Error ? error.message : String(error),
            });
            this.systemProxyUrl = undefined;
        }
    }

    getEffectiveProxySettings(override?: ProxySettings): EffectiveProxySettings {
        const proxySettings = normalizeProxySettings(override || this.settingsManager.getSetting("proxy"));
        const normalizedNoProxyList = proxySettings.noProxyList || [];

        if (proxySettings.mode === "none") {
            return { mode: "none", noProxyList: normalizedNoProxyList };
        }

        if (proxySettings.mode === "manual") {
            const manualProxyUrl = normalizeProxyUrl(proxySettings.manualProxyUrl || "");
            if (manualProxyUrl) {
                return {
                    mode: "manual",
                    proxyUrl: manualProxyUrl,
                    noProxyList: normalizedNoProxyList,
                    caBundlePath: proxySettings.caBundlePath || undefined,
                };
            }

            return {
                mode: "none",
                noProxyList: normalizedNoProxyList,
            };
        }

        if (this.systemProxyUrl) {
            return {
                mode: "auto",
                proxyUrl: this.systemProxyUrl,
                noProxyList: normalizedNoProxyList,
                caBundlePath: proxySettings.caBundlePath || undefined,
            };
        }

        return {
            mode: "none",
            noProxyList: normalizedNoProxyList,
            caBundlePath: proxySettings.caBundlePath || undefined,
        };
    }

    applyProxyEnvironment(override?: ProxySettings): void {
        const effective = this.getEffectiveProxySettings(override);

        if (effective.mode === "none" || !effective.proxyUrl) {
            delete process.env.HTTP_PROXY;
            delete process.env.HTTPS_PROXY;
        } else {
            process.env.HTTP_PROXY = effective.proxyUrl;
            process.env.HTTPS_PROXY = effective.proxyUrl;
        }

        if (effective.noProxyList.length > 0) {
            process.env.NO_PROXY = effective.noProxyList.join(",");
        } else {
            delete process.env.NO_PROXY;
        }

        this.agentCache.clear();
        this.fetchDispatcherCache.clear();
        this.loggedRoutes.clear();
        this.failureLastReportedAt.clear();

        logInfo("[ProxyManager] Effective proxy configuration applied", {
            mode: effective.mode,
            proxy: describeProxy(effective.proxyUrl),
            noProxyCount: effective.noProxyList.length,
            hasCaBundle: Boolean(effective.caBundlePath),
        });
    }

    getProxyEnvironmentVariables(): Record<string, string> {
        const output: Record<string, string> = {};
        if (process.env.HTTP_PROXY) output.HTTP_PROXY = process.env.HTTP_PROXY;
        if (process.env.HTTPS_PROXY) output.HTTPS_PROXY = process.env.HTTPS_PROXY;
        if (process.env.NO_PROXY) output.NO_PROXY = process.env.NO_PROXY;
        return output;
    }

    getAgentForUrl(targetUrl: string, override?: ProxySettings): http.RequestOptions["agent"] | undefined {
        const effective = this.getEffectiveProxySettings(override);
        if (!effective.proxyUrl) {
            this.logRoute(targetUrl, "direct", "node-http");
            return this.createDirectAgent(targetUrl, effective.caBundlePath);
        }

        try {
            const parsedTarget = new URL(targetUrl);
            if (matchesNoProxy(parsedTarget.hostname, effective.noProxyList)) {
                this.logRoute(targetUrl, "direct (no-proxy match)", "node-http");
                return this.createDirectAgent(targetUrl, effective.caBundlePath);
            }

            this.logRoute(targetUrl, describeProxy(effective.proxyUrl), "node-http");
            // Agents built for a settings override (Test Connection) are not cached or reported centrally.
            const cacheKey = `${parsedTarget.protocol}:${effective.proxyUrl}:${effective.caBundlePath || ""}`;
            const cached = override ? undefined : this.agentCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            const ca = this.resolveCombinedCaBundle(effective.caBundlePath);
            const onFailure: ProxyFailureListener | undefined = override ? undefined : (failure, targetHost) => this.reportProxyFailure(failure, targetHost, "node-http", effective);
            const agent: http.Agent =
                parsedTarget.protocol === "http:" ? new HttpProxyAgent(effective.proxyUrl, ca ? { ca } : undefined) : new ReportingHttpsProxyAgent(effective.proxyUrl, ca, onFailure);

            if (!override) {
                this.agentCache.set(cacheKey, agent);
            }
            return agent;
        } catch (error) {
            logWarn("[ProxyManager] Failed to resolve proxy agent for URL", {
                error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    }

    createProxyAwareFetch(override?: ProxySettings): typeof fetch {
        return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
            // Request objects come from Node's bundled undici and can't be passed to the undici package's fetch.
            const targetUrl = typeof input === "string" || input instanceof URL ? input.toString() : undefined;
            if (!targetUrl) {
                return fetch(input, init).catch((error: unknown) => Promise.reject(toReadableFetchError(error)));
            }

            const effective = this.getEffectiveProxySettings(override);
            const dispatcher = this.getFetchDispatcher(targetUrl, effective);
            if (!dispatcher) {
                return fetch(input, init).catch((error: unknown) => Promise.reject(toReadableFetchError(error)));
            }

            // Use undici's own fetch with its own dispatcher: Node's built-in fetch ignores `agent`,
            // and mixing dispatcher instances across undici versions is not reliable.
            const request = undiciFetch(targetUrl, { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher }) as unknown as Promise<Response>;
            return request.catch((error: unknown) => {
                const targetHost = new URL(targetUrl).hostname;
                const failure = this.isProxiedRoute(targetHost, effective) ? classifyProxyError(error) : undefined;
                if (!failure) {
                    return Promise.reject(toReadableFetchError(error));
                }

                const notice = override ? undefined : this.reportProxyFailure(failure, targetHost, "fetch", effective);
                const message = notice?.message ?? describeProxyFailure(failure, targetHost, describeProxy(effective.proxyUrl)).message;
                return Promise.reject(Object.assign(new Error(message, { cause: error }), { code: failure.code, proxyFailureKind: failure.kind }));
            });
        }) as typeof fetch;
    }

    async testConnection(override?: ProxySettings): Promise<{ success: boolean; message: string }> {
        const configuredSupabaseUrl = process.env.SUPABASE_URL?.trim();
        const testUrl = configuredSupabaseUrl ? new URL("/auth/v1/health", configuredSupabaseUrl).toString() : "https://api.github.com/zen";
        const effective = this.getEffectiveProxySettings(override);

        return new Promise((resolve) => {
            const protocol = testUrl.startsWith("https:") ? https : http;
            const agent = this.getAgentForUrl(testUrl, override);
            const ca = this.resolveCombinedCaBundle(effective.caBundlePath);
            const targetHost = new URL(testUrl).hostname;
            const proxied = this.isProxiedRoute(targetHost, effective);
            let tunnelFailure: ProxyFailure | undefined;
            let settled = false;

            const succeed = (message: string) => {
                if (settled) return;
                settled = true;
                resolve({ success: true, message });
            };
            const fail = (message: string, failure?: ProxyFailure) => {
                if (settled) return;
                settled = true;
                captureException(new Error(`Proxy test connection failed: ${failure?.kind ?? "unclassified"}`), {
                    tags: { component: "proxy", proxy_failure: failure?.kind ?? "unclassified", proxy_mode: effective.mode, proxied: String(proxied) },
                    extra: { code: failure?.code, status_code: failure?.statusCode, has_ca_bundle: Boolean(effective.caBundlePath) },
                });
                resolve({ success: false, message });
            };
            const describe = (failure: ProxyFailure) => describeProxyFailure(failure, targetHost, describeProxy(effective.proxyUrl)).message;

            const request = protocol.request(
                testUrl,
                {
                    method: "GET",
                    timeout: 10000,
                    headers: { "User-Agent": "PowerPlatformToolBox" },
                    agent,
                    ca: ca || undefined,
                },
                (response) => {
                    response.resume();
                    // A non-200 CONNECT response is replayed as the request's response; it came from the proxy, not the endpoint.
                    if (tunnelFailure) {
                        fail(describe(tunnelFailure), tunnelFailure);
                        return;
                    }

                    if (response.statusCode && response.statusCode >= 100 && response.statusCode < 400) {
                        succeed(`Connection successful (HTTP ${response.statusCode})`);
                        return;
                    }

                    if (response.statusCode && response.statusCode >= 400 && response.statusCode < 600) {
                        succeed(`Connection reached endpoint (HTTP ${response.statusCode}). Proxy route is working.`);
                        return;
                    }

                    fail(`Connection failed with HTTP ${response.statusCode || "unknown"}`);
                },
            );

            request.on("proxyConnect", (connect: { statusCode: number }) => {
                tunnelFailure = classifyProxyConnectStatus(connect.statusCode);
            });

            request.on("error", (error) => {
                const failure = proxied ? classifyProxyError(error) : undefined;
                fail(failure ? `${describe(failure)} (${error.message})` : error.message, failure);
            });

            request.on("timeout", () => {
                request.destroy();
                fail("Connection test timed out after 10 seconds", proxied ? { kind: "proxy-timeout", code: "ETIMEDOUT" } : undefined);
            });

            request.end();
        });
    }

    async handleProxyAuthChallenge(authInfo: AuthInfo, callback: (username: string, password: string) => void): Promise<boolean> {
        if (!authInfo.isProxy) {
            return false;
        }

        const credentialsKey = this.getProxyCredentialKey(authInfo.host, authInfo.port);
        const existingCredentials = this.authStore.get(credentialsKey);
        if (existingCredentials?.username && existingCredentials.encryptedPassword) {
            callback(existingCredentials.username, this.encryptionManager.decrypt(existingCredentials.encryptedPassword));
            return true;
        }

        if (!this.credentialPromptHandler) {
            return false;
        }

        const prompted = await this.credentialPromptHandler(authInfo);
        if (!prompted || !prompted.username || !prompted.password) {
            return false;
        }

        this.authStore.set(credentialsKey, {
            username: prompted.username,
            encryptedPassword: this.encryptionManager.encrypt(prompted.password),
        });

        callback(prompted.username, prompted.password);
        return true;
    }

    private createDirectAgent(targetUrl: string, caBundlePath?: string): http.RequestOptions["agent"] | undefined {
        try {
            const parsedUrl = new URL(targetUrl);
            if (parsedUrl.protocol !== "https:") {
                return undefined;
            }

            const ca = this.resolveCombinedCaBundle(caBundlePath);
            if (!ca) {
                return undefined;
            }

            const cacheKey = `direct:${caBundlePath || ""}`;
            const cached = this.agentCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            const agent = new https.Agent({ ca });
            this.agentCache.set(cacheKey, agent);
            return agent;
        } catch {
            return undefined;
        }
    }

    private resolveCombinedCaBundle(caBundlePath?: string): string | undefined {
        if (!caBundlePath) {
            return undefined;
        }

        try {
            if (!fs.existsSync(caBundlePath)) {
                return undefined;
            }

            const customCa = fs.readFileSync(caBundlePath, "utf-8");
            if (!customCa.trim()) {
                return undefined;
            }

            return `${tls.rootCertificates.join("\n")}\n${customCa}`;
        } catch (error) {
            logWarn("[ProxyManager] Failed to read custom CA bundle", {
                error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    }

    private getProxyCredentialKey(host?: string, port?: number): string {
        return `${host || "unknown"}:${typeof port === "number" ? port : "0"}`;
    }

    private isProxiedRoute(targetHost: string, effective: EffectiveProxySettings): boolean {
        return Boolean(effective.proxyUrl) && !matchesNoProxy(targetHost, effective.noProxyList);
    }

    /**
     * Report a failure on a proxied request: log it, capture it in Sentry, and notify the user.
     * Throttled per failure kind + host. Telemetry only receives a coarse host category, never the hostname.
     */
    private reportProxyFailure(failure: ProxyFailure, targetHost: string, channel: "node-http" | "fetch", effective: EffectiveProxySettings): ProxyFailureNotice {
        const displayHost = targetHost || "the requested host";
        const notice: ProxyFailureNotice = { ...describeProxyFailure(failure, displayHost, describeProxy(effective.proxyUrl)), targetHost: displayHost };

        const key = `${failure.kind}|${targetHost}`;
        const now = Date.now();
        const lastReportedAt = this.failureLastReportedAt.get(key);
        if (lastReportedAt !== undefined && now - lastReportedAt < ProxyManager.FAILURE_REPORT_INTERVAL_MS) {
            return notice;
        }
        this.failureLastReportedAt.set(key, now);

        const target = categorizeTargetHost(targetHost);
        logWarn("[ProxyManager] Proxy connection failure", { kind: failure.kind, code: failure.code, statusCode: failure.statusCode, channel, target });
        captureException(new Error(`Proxy connection failure: ${failure.kind}`), {
            tags: { component: "proxy", proxy_failure: failure.kind, proxy_mode: effective.mode, proxy_channel: channel, proxy_target: target },
            extra: {
                code: failure.code,
                status_code: failure.statusCode,
                has_ca_bundle: Boolean(effective.caBundlePath),
                proxy_has_credentials: hasProxyCredentials(effective.proxyUrl),
            },
        });

        try {
            this.failureNotifier?.(notice);
        } catch (error) {
            logWarn("[ProxyManager] Failed to show proxy failure notification", { error: error instanceof Error ? error.message : String(error) });
        }

        return notice;
    }

    private logRoute(targetUrl: string, route: string, channel: "node-http" | "fetch"): void {
        let hostname = "";
        try {
            hostname = new URL(targetUrl).hostname;
        } catch {
            return;
        }

        const target = categorizeTargetHost(hostname);
        const key = `${channel}|${hostname}|${route}`;
        if (this.loggedRoutes.has(key)) {
            return;
        }
        this.loggedRoutes.add(key);
        logInfo("[ProxyManager] Outbound route resolved", { target, route, channel });
    }

    private getFetchDispatcher(targetUrl: string, effective: EffectiveProxySettings): Dispatcher | undefined {
        let targetHost = "";
        try {
            targetHost = new URL(targetUrl).hostname;
        } catch {
            return undefined;
        }

        const bypassProxy = !effective.proxyUrl || matchesNoProxy(targetHost, effective.noProxyList);
        this.logRoute(targetUrl, bypassProxy ? (effective.proxyUrl ? "direct (no-proxy match)" : "direct") : describeProxy(effective.proxyUrl), "fetch");

        const cacheKey = `${bypassProxy ? "direct" : effective.proxyUrl}|${effective.caBundlePath || ""}`;
        const cached = this.fetchDispatcherCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const ca = this.resolveCombinedCaBundle(effective.caBundlePath);

        try {
            // Direct routes also get an explicit Agent: undici's default global dispatcher is shared with
            // Electron's bundled (older, unpatched) undici through a global symbol.
            const dispatcher: Dispatcher = bypassProxy
                ? new UndiciAgent(ca ? { connect: { ca } } : undefined)
                : new UndiciProxyAgent({
                      uri: effective.proxyUrl as string,
                      requestTls: ca ? { ca } : undefined,
                      proxyTls: ca ? { ca } : undefined,
                  });
            this.fetchDispatcherCache.set(cacheKey, dispatcher);
            return dispatcher;
        } catch (error) {
            logWarn("[ProxyManager] Failed to create fetch dispatcher", {
                error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    }
}
