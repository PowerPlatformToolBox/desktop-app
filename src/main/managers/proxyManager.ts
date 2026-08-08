import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import Store from "electron-store";
import { app, session, type AuthInfo } from "electron";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { rootCertificates } from "tls";
import { logInfo, logWarn } from "../../common/logger";
import type { ProxySettings } from "../../common/types";
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

function normalizeProxySettings(input?: ProxySettings): ProxySettings {
    const mode = input?.mode === "manual" || input?.mode === "none" ? input.mode : "auto";
    const noProxyList = Array.isArray(input?.noProxyList) ? input.noProxyList.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter((entry) => entry.length > 0) : [];

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
    private readonly fetchDispatcherCache = new Map<string, RequestInit["dispatcher"]>();
    private systemProxyUrl?: string;
    private credentialPromptHandler?: CredentialPromptHandler;

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
            return this.createDirectAgent(targetUrl, effective.caBundlePath);
        }

        try {
            const parsedTarget = new URL(targetUrl);
            if (matchesNoProxy(parsedTarget.hostname, effective.noProxyList)) {
                return this.createDirectAgent(targetUrl, effective.caBundlePath);
            }

            const cacheKey = `${parsedTarget.protocol}:${effective.proxyUrl}:${effective.caBundlePath || ""}`;
            const cached = this.agentCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            const ca = this.resolveCombinedCaBundle(effective.caBundlePath);
            const proxyUrlObject = new URL(effective.proxyUrl);
            const proxyAgentOptions = {
                protocol: proxyUrlObject.protocol,
                host: proxyUrlObject.hostname,
                port: proxyUrlObject.port || undefined,
                auth: proxyUrlObject.username ? `${decodeURIComponent(proxyUrlObject.username)}:${decodeURIComponent(proxyUrlObject.password)}` : undefined,
                ca: ca || undefined,
            };
            const agent = (parsedTarget.protocol === "http:" ? new HttpProxyAgent(proxyAgentOptions) : new HttpsProxyAgent(proxyAgentOptions)) as unknown as http.Agent;

            this.agentCache.set(cacheKey, agent);
            return agent;
        } catch (error) {
            logWarn("[ProxyManager] Failed to resolve proxy agent for URL", {
                error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    }

    createProxyAwareFetch(override?: ProxySettings): typeof fetch {
        return (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
            const targetUrl = this.resolveFetchTargetUrl(input);
            const requestInit = { ...(init || {}) } as RequestInit & {
                agent?: http.RequestOptions["agent"];
                dispatcher?: RequestInit["dispatcher"];
            };
            if (!targetUrl) {
                return fetch(input, requestInit as Parameters<typeof fetch>[1]);
            }

            const effective = this.getEffectiveProxySettings(override);
            const dispatcher = this.getFetchDispatcher(targetUrl, effective);
            if (dispatcher) {
                requestInit.dispatcher = dispatcher;
                return fetch(input, requestInit as Parameters<typeof fetch>[1]);
            }

            const fallbackAgent = this.getAgentForUrl(targetUrl, override);
            if (fallbackAgent) {
                requestInit.agent = fallbackAgent;
            }
            return fetch(input, requestInit as Parameters<typeof fetch>[1]);
        };
    }

    async testConnection(override?: ProxySettings): Promise<{ success: boolean; message: string }> {
        const testUrl = process.env.SUPABASE_URL || "https://api.github.com/zen";
        const effective = this.getEffectiveProxySettings(override);

        return new Promise((resolve) => {
            const protocol = testUrl.startsWith("https:") ? https : http;
            const agent = this.getAgentForUrl(testUrl, override);
            const ca = this.resolveCombinedCaBundle(effective.caBundlePath);
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
                    if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
                        resolve({ success: true, message: `Connection successful (HTTP ${response.statusCode})` });
                        return;
                    }

                    resolve({
                        success: false,
                        message: `Connection failed with HTTP ${response.statusCode || "unknown"}`,
                    });
                },
            );

            request.on("error", (error) => {
                resolve({
                    success: false,
                    message: error.message,
                });
            });

            request.on("timeout", () => {
                request.destroy();
                resolve({
                    success: false,
                    message: "Connection test timed out after 10 seconds",
                });
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

            return `${rootCertificates.join("\n")}\n${customCa}`;
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

    private resolveFetchTargetUrl(input: Parameters<typeof fetch>[0]): string | undefined {
        if (typeof input === "string") {
            return input;
        }

        if (input instanceof URL) {
            return input.toString();
        }

        if ("url" in input && typeof input.url === "string") {
            return input.url;
        }

        return undefined;
    }

    private getFetchDispatcher(targetUrl: string, effective: EffectiveProxySettings): RequestInit["dispatcher"] | undefined {
        let targetHost = "";
        try {
            targetHost = new URL(targetUrl).hostname;
        } catch {
            return undefined;
        }

        if (!effective.proxyUrl && !effective.caBundlePath) {
            return undefined;
        }

        if (matchesNoProxy(targetHost, effective.noProxyList)) {
            return undefined;
        }

        let undici:
            | {
                  ProxyAgent?: new (options: { uri: string; requestTls?: { ca?: string } }) => unknown;
                  Agent?: new (options: { connect?: { ca?: string } }) => unknown;
              }
            | undefined;
        try {
            // undici is used by Node fetch; configure a dispatcher so fetch traffic (Supabase)
            // follows proxy settings and optional CA bundle.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            undici = require("undici");
        } catch {
            undici = undefined;
        }

        if (!undici) {
            return undefined;
        }

        const ca = this.resolveCombinedCaBundle(effective.caBundlePath);
        const cacheKey = `${effective.proxyUrl || "direct"}|${effective.caBundlePath || ""}`;
        const cached = this.fetchDispatcherCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let dispatcher: RequestInit["dispatcher"] | undefined;
        if (effective.proxyUrl && undici.ProxyAgent) {
            dispatcher = new undici.ProxyAgent({
                uri: effective.proxyUrl,
                requestTls: ca ? { ca } : undefined,
            }) as RequestInit["dispatcher"];
        } else if (ca && undici.Agent) {
            dispatcher = new undici.Agent({
                connect: { ca },
            }) as RequestInit["dispatcher"];
        }

        if (dispatcher) {
            this.fetchDispatcherCache.set(cacheKey, dispatcher);
        }

        return dispatcher;
    }
}
