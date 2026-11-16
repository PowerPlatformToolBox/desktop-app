import { randomUUID } from "crypto";
import * as https from "https";
import type { AzureAPI } from "../../common/azureApi";
import { azureError, isAzureError, subscriptionScope, validAzurePermissions } from "../../common/azureApi";
import { logWarn } from "../../common/logger";
import type { Connection } from "../../common/types";
import type { AuthManager } from "./authManager";
import type { ConnectionsManager } from "./connectionsManager";
import type { ProxyManager } from "./proxyManager";

export interface AzureCaller {
    owner: number;
    connectionId: string;
    permissions: unknown;
    isCurrent(): boolean;
    approve(resource: AzureAPI.Resource, scopes: string[]): Promise<boolean>;
}

interface Page {
    owner: number;
    connectionId: string;
    resource: AzureAPI.Resource;
    generation: number;
    url: string;
    method: "GET" | "POST";
    body?: string;
    expires: number;
    visited: string[];
}

const ORIGINS = { arm: "https://management.azure.com", graph: "https://graph.microsoft.com" } as const;
const MAX_BODY = 10 * 1024 * 1024;
const COST_PATH = /^\/subscriptions\/[0-9a-f-]{36}\/providers\/Microsoft\.CostManagement\/query$/i;

export function azureTarget(resource: AzureAPI.Resource, path: unknown, continuation = false): URL {
    if (
        typeof path !== "string" ||
        path.length > 16384 ||
        [...path].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) ||
        /[\\#]/.test(path) ||
        path.startsWith("//")
    ) {
        throw azureError("invalidRequest", "Invalid API request path.");
    }
    const pathOnly = path.split("?")[0];
    if (/%(?:2e|2f|5c|25)/i.test(pathOnly) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(pathOnly)) throw azureError("invalidRequest", "Invalid API request path.");
    let url: URL;
    try {
        if (!continuation && !path.startsWith("/")) throw new Error("Relative path required");
        url = new URL(path, ORIGINS[resource]);
    } catch {
        throw azureError("invalidRequest", "Use an absolute resource-relative path beginning with /.");
    }
    if (url.origin !== ORIGINS[resource] || url.username || url.password || url.hash) throw azureError("invalidRequest", "The API target must remain on its approved public-cloud origin.");
    if (resource === "graph" && !/^\/v1\.0\/[^/]/.test(url.pathname)) throw azureError("invalidRequest", "Only Microsoft Graph /v1.0 paths are supported.");
    if (resource === "arm" && (url.pathname === "/" || !url.searchParams.get("api-version") || url.searchParams.getAll("api-version").length !== 1)) {
        throw azureError("invalidRequest", "ARM requests require a path and one explicit api-version.");
    }
    return url;
}

function object(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateCostQuery(value: unknown): string {
    const fail = () => {
        throw azureError("invalidRequest", "Invalid cost query. Use ActualCost/AmortizedCost, a supported timeframe, and a bounded dataset/filter.");
    };
    const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));
    const text = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 256;
    if (!object(value) || !keys(value, ["type", "timeframe", "timePeriod", "dataset"])) return fail();
    if (
        !["ActualCost", "AmortizedCost"].includes(String(value.type)) ||
        !["MonthToDate", "BillingMonthToDate", "TheLastMonth", "TheLastBillingMonth", "WeekToDate", "Custom"].includes(String(value.timeframe))
    ) {
        return fail();
    }
    if (value.timeframe === "Custom" || value.timePeriod !== undefined) {
        const period = value.timePeriod;
        if (!object(period) || !keys(period, ["from", "to"]) || !text(period.from) || !text(period.to)) return fail();
        const from = Date.parse(String(period.from));
        const to = Date.parse(String(period.to));
        if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > 366 * 86400000) return fail();
    }
    const dataset = value.dataset;
    if (!object(dataset) || !keys(dataset, ["granularity", "aggregation", "grouping", "filter"])) return fail();
    if (dataset.granularity !== undefined && !["Daily", "Monthly", "None"].includes(String(dataset.granularity))) return fail();
    if (dataset.aggregation !== undefined) {
        if (!object(dataset.aggregation) || Object.keys(dataset.aggregation).length < 1 || Object.keys(dataset.aggregation).length > 2) return fail();
        for (const [name, aggregation] of Object.entries(dataset.aggregation)) {
            if (!text(name) || !object(aggregation) || !keys(aggregation, ["name", "function"]) || !text(aggregation.name) || aggregation.function !== "Sum") return fail();
        }
    }
    if (dataset.grouping !== undefined) {
        if (
            !Array.isArray(dataset.grouping) ||
            dataset.grouping.length > 2 ||
            dataset.grouping.some((group) => !object(group) || !keys(group, ["type", "name"]) || !["Dimension", "TagKey"].includes(String(group.type)) || !text(group.name))
        )
            return fail();
    }
    let nodes = 0;
    const filter = (value: unknown, depth: number): boolean => {
        if (++nodes > 100 || depth > 8 || !object(value) || Object.keys(value).length !== 1) return false;
        if (value.and !== undefined || value.or !== undefined) {
            const children = value.and ?? value.or;
            return keys(value, ["and", "or"]) && Array.isArray(children) && children.length >= 2 && children.length <= 20 && children.every((child) => filter(child, depth + 1));
        }
        const leaf = value.dimensions ?? value.tags;
        return (
            keys(value, ["dimensions", "tags"]) &&
            object(leaf) &&
            keys(leaf, ["name", "operator", "values"]) &&
            text(leaf.name) &&
            leaf.operator === "In" &&
            Array.isArray(leaf.values) &&
            leaf.values.length > 0 &&
            leaf.values.length <= 100 &&
            leaf.values.every(text)
        );
    };
    if (dataset.filter !== undefined && !filter(dataset.filter, 0)) return fail();
    const body = JSON.stringify(value);
    if (Buffer.byteLength(body) > 65536) return fail();
    return body;
}

export class AzureApiManager {
    private generations = new Map<string, number>();
    private approvals = new Set<string>();
    private pages = new Map<string, Page>();
    private active = new Map<string, { connectionId: string; abort: AbortController }>();
    private owners = new Map<number, Set<string>>();
    private states = new Map<string, "ready" | "interactionRequired">();
    private claims = new Map<string, string>();

    constructor(
        private readonly connections: Pick<ConnectionsManager, "getConnectionById">,
        private readonly auth: Pick<AuthManager, "acquireAzureToken" | "getAzureAccount">,
        private readonly proxy: Pick<ProxyManager, "getAgentForUrl">,
        private readonly changed: (owner: number, event: AzureAPI.ConnectionChangedEvent) => void = () => undefined,
    ) {}

    invalidate(connectionId: string): void {
        this.generations.set(connectionId, this.generation(connectionId) + 1);
        for (const operation of this.active.values()) {
            if (operation.connectionId === connectionId) operation.abort.abort(azureError("connectionChanged", "The connection changed. Discard stale data and retry."));
        }
        for (const [handle, page] of this.pages) if (page.connectionId === connectionId) this.pages.delete(handle);
        for (const [owner, connections] of this.owners) {
            if (connections.has(connectionId)) {
                const prefix = `${owner}:${connectionId}:`;
                for (const key of this.approvals) if (key.startsWith(prefix)) this.approvals.delete(key);
                for (const key of this.states.keys()) if (key.startsWith(prefix)) this.states.delete(key);
                for (const key of this.claims.keys()) if (key.startsWith(prefix)) this.claims.delete(key);
                this.changed(owner, { connectionId, reason: "connectionChanged" });
            }
        }
    }

    disposeOwner(owner: number): void {
        for (const [key, operation] of this.active) if (key.startsWith(`${owner}:`)) operation.abort.abort(azureError("cancelled", "The tool closed."));
        for (const [handle, page] of this.pages) if (page.owner === owner) this.pages.delete(handle);
        for (const key of this.approvals) if (key.startsWith(`${owner}:`)) this.approvals.delete(key);
        for (const key of this.states.keys()) if (key.startsWith(`${owner}:`)) this.states.delete(key);
        for (const key of this.claims.keys()) if (key.startsWith(`${owner}:`)) this.claims.delete(key);
        this.owners.delete(owner);
    }

    connectionChanged(owner: number): void {
        for (const [key, operation] of this.active) if (key.startsWith(`${owner}:`)) operation.abort.abort(azureError("connectionChanged", "The tool's connection selection changed."));
        for (const connectionId of this.owners.get(owner) ?? []) this.changed(owner, { connectionId, reason: "connectionChanged" });
        this.disposeOwner(owner);
    }

    cancel(owner: number, requestId: unknown): void {
        if (typeof requestId !== "string" || !/^[\w-]{1,100}$/.test(requestId)) throw azureError("invalidRequest", "Invalid request ID.");
        this.active.get(`${owner}:${requestId}`)?.abort.abort(azureError("cancelled", "The request was cancelled."));
    }

    private generation(id: string): number {
        return this.generations.get(id) ?? 0;
    }

    private scopes(caller: AzureCaller, resource: AzureAPI.Resource): string[] {
        if (!validAzurePermissions(caller.permissions)) throw azureError("capabilityDenied", "Declare features.apis in the installed tool manifest.");
        if (resource === "arm" && caller.permissions.arm === true) return ["https://management.azure.com/.default"];
        if (resource === "graph" && caller.permissions.graph?.length) return [...new Set(caller.permissions.graph)].sort().map((scope) => `https://graph.microsoft.com/${scope}`);
        throw azureError("capabilityDenied", "The tool has not declared this API resource.");
    }

    private connection(caller: AzureCaller): Connection {
        const connection = this.connections.getConnectionById(caller.connectionId);
        if (!connection) throw azureError("notConnected", "Connect this tool to a Dataverse environment first.");
        return connection;
    }

    private async state(connection: Connection, resource: AzureAPI.Resource, key: string): Promise<AzureAPI.ConnectionState> {
        const enabled = (resource === "arm" ? connection.enabledForAzureAPI : connection.enabledForGraphAPI) === true;
        const application = connection.authenticationType === "clientSecret";
        const account = await this.auth.getAzureAccount(connection);
        const signedIn = !!connection.accessToken && account !== null;
        return {
            configured: enabled,
            signedIn,
            status: !enabled ? "disabled" : !signedIn ? "notConnected" : (this.states.get(key) ?? "ready"),
            connectionId: connection.id,
            connectionName: connection.name,
            tenantId: account?.tenantId ?? connection.tenantId,
            accountId: account?.accountId,
            displayName: account?.displayName,
            authentication: application ? "application" : "delegated",
            access: "unverified",
        };
    }

    async invoke(caller: AzureCaller, action: unknown, resource: unknown, payload: unknown, options: AzureAPI.Options = {}): Promise<unknown> {
        if (resource !== "arm" && resource !== "graph") throw azureError("invalidRequest", "Unknown API resource.");
        if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !["requestId", "connectionTarget", "timeoutMs"].includes(key))) {
            throw azureError("invalidRequest", "Invalid request options.");
        }
        const timeout = options.timeoutMs === undefined ? (action === "authenticate" ? 120000 : 30000) : options.timeoutMs;
        const requestId = options.requestId === undefined ? randomUUID() : options.requestId;
        if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000 || typeof requestId !== "string" || !/^[\w-]{1,100}$/.test(requestId)) {
            throw azureError("invalidRequest", "Use a unique request ID and a timeout from 1000 to 120000 milliseconds.");
        }
        const scopes = this.scopes(caller, resource);
        const connection = this.connection(caller);
        const generation = this.generation(connection.id);
        const approvalKey = `${caller.owner}:${connection.id}:${resource}:${JSON.stringify(scopes)}:${generation}`;
        const state = await this.state(connection, resource, approvalKey);
        const owners = this.owners.get(caller.owner) ?? new Set<string>();
        owners.add(connection.id);
        this.owners.set(caller.owner, owners);
        if (!caller.isCurrent() || generation !== this.generation(connection.id)) throw azureError("connectionChanged", "The tool connection changed.");
        if (action === "state") return state;
        const check: AzureAPI.CostAccessCheck | undefined =
            action === "checkCosts" && resource === "arm"
                ? { configured: state.configured, signedIn: state.signedIn, scopeSelected: false, costData: "unverified", checkedAt: new Date().toISOString() }
                : undefined;
        const failure = (error: AzureAPI.ApiError): AzureAPI.CostAccessCheck => {
            if (!check) throw error;
            return { ...check, error, costData: error.code === "accessDenied" ? "accessDenied" : "unverified" };
        };
        let costRequest = action === "costs" && resource === "arm" && object(payload) ? payload : undefined;
        if (check) {
            try {
                const scope = subscriptionScope(typeof payload === "string" ? payload : "");
                check.scopeSelected = true;
                const to = new Date();
                costRequest = {
                    scope,
                    query: {
                        type: "ActualCost",
                        timeframe: "Custom",
                        timePeriod: { from: new Date(to.getTime() - 86400000).toISOString(), to: to.toISOString() },
                        dataset: { granularity: "None", aggregation: { totalCost: { name: "PreTaxCost", function: "Sum" } } },
                    },
                };
            } catch (error) {
                if (!isAzureError(error)) throw error;
                return failure(error);
            }
        }
        if (!state.configured) return failure(azureError("notConfigured", "Enable the selected API in the connection's New/Edit dialog."));
        if (!state.signedIn) return failure(azureError("notConnected", "Authenticate the Dataverse connection first."));

        const operationKey = `${caller.owner}:${requestId}`;
        if (this.active.has(operationKey) || [...this.active.keys()].filter((key) => key.startsWith(`${caller.owner}:`)).length >= 8) {
            throw azureError("limitExceeded", "Duplicate request ID or too many active Azure requests (maximum 8).");
        }
        const abort = new AbortController();
        this.active.set(operationKey, { connectionId: connection.id, abort });
        const timer = setTimeout(() => abort.abort(azureError("timeout", "The API request exceeded its deadline.")), timeout);
        const ensureCurrent = () => {
            abort.signal.throwIfAborted();
            if (!caller.isCurrent() || generation !== this.generation(connection.id)) throw azureError("connectionChanged", "The tool connection changed.");
        };
        const acquireToken = (interactive: boolean, forceRefresh: boolean) => {
            const claims = this.claims.get(approvalKey);
            return claims
                ? this.auth.acquireAzureToken(connection, scopes, interactive, forceRefresh, abort.signal, claims)
                : this.auth.acquireAzureToken(connection, scopes, interactive, forceRefresh, abort.signal);
        };
        const wait = async <T>(promise: Promise<T>): Promise<T> =>
            new Promise<T>((resolve, reject) => {
                const onAbort = () => reject(abort.signal.reason);
                abort.signal.addEventListener("abort", onAbort, { once: true });
                promise.then(resolve, reject).finally(() => abort.signal.removeEventListener("abort", onAbort));
                if (abort.signal.aborted) onAbort();
            });
        try {
            if (action === "authenticate") {
                if (!(await wait(caller.approve(resource, scopes)))) throw azureError("consentRequired", "API access was declined in the host.");
                ensureCurrent();
                await wait(acquireToken(true, false));
                ensureCurrent();
                this.approvals.add(approvalKey);
                this.states.set(approvalKey, "ready");
                this.claims.delete(approvalKey);
                this.changed(caller.owner, { connectionId: connection.id, reason: "authenticated" });
                return this.state(connection, resource, approvalKey);
            }
            if (!this.approvals.has(approvalKey)) throw azureError("consentRequired", "Call authenticate() from a user action to approve this tool's read-only API access.");
            let url: URL;
            let method: "GET" | "POST" = "GET";
            let body: string | undefined;
            let visited: string[] = [];
            if (action === "get") {
                url = azureTarget(resource, payload);
            } else if (costRequest) {
                url = azureTarget(resource, `${subscriptionScope(String(costRequest.scope))}/providers/Microsoft.CostManagement/query?api-version=2025-03-01`);
                body = validateCostQuery(costRequest.query);
                method = "POST";
            } else if (action === "next") {
                const page = typeof payload === "string" ? this.pages.get(payload) : undefined;
                if (!page || page.owner !== caller.owner || page.resource !== resource || page.connectionId !== connection.id || page.generation !== generation || page.expires < Date.now()) {
                    throw azureError("invalidContinuation", "This page handle is invalid, expired or belongs to a different connection/tool.");
                }
                url = azureTarget(resource, page.url, true);
                method = page.method;
                body = page.body;
                visited = page.visited;
            } else throw azureError("invalidRequest", "Unsupported read-only API operation.");
            let token = await wait(acquireToken(false, false));
            ensureCurrent();
            let response = await this.request(url, method, body, token, abort.signal);
            if (response.status === 401) {
                if (response.claims) {
                    this.claims.set(approvalKey, response.claims);
                    throw azureError("interactionRequired", "The API requires additional Conditional Access authentication. Use authenticate() to reconnect.");
                }
                token = await wait(acquireToken(false, true));
                ensureCurrent();
                response = await this.request(url, method, body, token, abort.signal);
                if (response.status === 401 && response.claims) {
                    this.claims.set(approvalKey, response.claims);
                    throw azureError("interactionRequired", "The API requires additional Conditional Access authentication. Use authenticate() to reconnect.");
                }
            }
            ensureCurrent();
            if (response.status < 200 || response.status >= 300) throw this.httpError(response);
            if (check) return { ...check, costData: "accessible" };
            const data = response.data;
            let next: unknown;
            if (object(data)) next = data.nextLink ?? data["@odata.nextLink"] ?? (object(data.properties) ? data.properties.nextLink : undefined);
            if (next !== undefined && next !== null && next !== "") {
                const target = azureTarget(resource, next, true);
                const prefix = resource === "graph" ? "/v1.0/" : "/";
                if (
                    !target.pathname.startsWith(prefix) ||
                    target.pathname !== url.pathname ||
                    (resource === "arm" && target.searchParams.get("api-version") !== url.searchParams.get("api-version")) ||
                    target.href === url.href ||
                    visited.includes(target.href) ||
                    visited.length >= 100
                )
                    throw azureError("invalidContinuation", "The service returned an unsafe or repeated next-page target.");
                for (const [handle, page] of this.pages) if (page.expires < Date.now()) this.pages.delete(handle);
                if ([...this.pages.values()].filter((page) => page.owner === caller.owner).length >= 100)
                    throw azureError("limitExceeded", "Too many pending pages. Close/reopen the tool to clear them.");
                const handle = randomUUID();
                this.pages.set(handle, {
                    owner: caller.owner,
                    connectionId: connection.id,
                    resource,
                    generation,
                    url: target.href,
                    method,
                    body,
                    expires: Date.now() + 15 * 60000,
                    visited: [...visited, url.href],
                });
                response.continuation = handle;
            }
            if (action === "next" && typeof payload === "string") this.pages.delete(payload);
            // Do not hand tools a service nextLink that could be mistaken for an authenticated URL capability.
            if (object(data)) {
                delete data.nextLink;
                delete data["@odata.nextLink"];
                if (object(data.properties)) delete data.properties.nextLink;
            }
            return response;
        } catch (error) {
            if (abort.signal.aborted) throw abort.signal.reason;
            if (isAzureError(error)) {
                if (error.code === "interactionRequired" || error.code === "authenticationFailed") {
                    this.states.set(approvalKey, "interactionRequired");
                    this.changed(caller.owner, { connectionId: connection.id, reason: "interactionRequired" });
                }
                return failure(error);
            }
            logWarn("Azure API operation failed");
            throw azureError("networkError", "The API could not be reached. Check the proxy, network and host logs.");
        } finally {
            clearTimeout(timer);
            this.active.delete(operationKey);
        }
    }

    private httpError(response: AzureAPI.Response): AzureAPI.ApiError {
        const status = response.status;
        const details = object(response.data) && object(response.data.error) ? response.data.error : undefined;
        const serviceCode = typeof details?.code === "string" && /^[A-Za-z0-9_.-]{1,150}$/.test(details.code) ? details.code : undefined;
        const retryDelays = Object.entries(response.headers)
            .filter(([name]) => name === "retry-after" || /^x-ms-ratelimit-microsoft\.costmanagement-.*retry-after$/.test(name))
            .map(([, retry]) => (/^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now())))
            .filter(Number.isFinite);
        const retryAfterMs = retryDelays.length ? Math.max(...retryDelays) : undefined;
        const code = status === 401 ? "authenticationFailed" : status === 403 ? "accessDenied" : status === 429 ? "throttled" : serviceCode === "NoCostData" ? "costDataUnavailable" : "serviceError";
        return azureError(
            code,
            status === 403
                ? "Access denied. Verify effective permissions, billing visibility policies and the selected scope; the response does not identify an exact missing role."
                : `The API returned HTTP ${status}.`,
            {
                status,
                headers: response.headers,
                serviceCode,
                requestId: response.headers["x-ms-request-id"] ?? response.headers["request-id"],
                correlationId: response.headers["x-ms-correlation-request-id"],
                ...(retryAfterMs !== undefined && Number.isFinite(retryAfterMs) ? { retryAfterMs } : {}),
            },
        );
    }

    private request(url: URL, method: "GET" | "POST", body: string | undefined, token: string, signal: AbortSignal): Promise<AzureAPI.Response & { claims?: string }> {
        if (method === "POST" && !COST_PATH.test(url.pathname)) throw azureError("invalidRequest", "Only Cost Management Query POST is allowed.");
        signal.throwIfAborted();
        return new Promise((resolve, reject) => {
            const req = https.request(
                url,
                {
                    method,
                    agent: this.proxy.getAgentForUrl(url.href),
                    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "x-ms-client-request-id": randomUUID(), ...(body ? { "Content-Type": "application/json" } : {}) },
                    signal,
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    let size = 0;
                    res.on("data", (chunk: Buffer) => {
                        size += chunk.length;
                        if (size > MAX_BODY) {
                            reject(azureError("limitExceeded", "API response exceeds 10 MiB. Narrow the query."));
                            req.destroy(new Error("Azure response size limit exceeded"));
                        } else chunks.push(Buffer.from(chunk));
                    });
                    res.on("error", reject);
                    res.on("end", () => {
                        const headers: Record<string, string> = {};
                        for (const [name, value] of Object.entries(res.headers)) {
                            if (
                                value !== undefined &&
                                /^(?:x-ms-(?:request-id|correlation-request-id|ratelimit-[a-z0-9_.-]+)|request-id|client-request-id|retry-after|content-type|date)$/i.test(name)
                            ) {
                                headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
                            }
                        }
                        const text = Buffer.concat(chunks).toString("utf8");
                        let data: unknown = null;
                        try {
                            if (text) data = JSON.parse(text);
                        } catch {
                            if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) {
                                reject(azureError("serviceError", "The API returned a non-JSON response."));
                                return;
                            }
                        }
                        let claims: string | undefined;
                        const challenge = res.headers["www-authenticate"];
                        if (res.statusCode === 401 && typeof challenge === "string" && challenge.length <= 32768) {
                            const encoded = /(?:^|[,\s])claims="([A-Za-z0-9+/_=-]+)"/i.exec(challenge)?.[1];
                            if (encoded) {
                                try {
                                    const decoded: unknown = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
                                    if (object(decoded) && object(decoded.access_token)) claims = JSON.stringify(decoded);
                                } catch {
                                    logWarn("Azure API returned an invalid claims challenge");
                                }
                            }
                        }
                        resolve({ status: res.statusCode ?? 0, headers, data, ...(claims ? { claims } : {}) });
                    });
                },
            );
            req.on("error", reject);
            req.end(body);
        });
    }
}
