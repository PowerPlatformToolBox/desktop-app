import { EventEmitter } from "events";
import * as https from "https";
import type { AzureAPI } from "../../../../src/common/azureApi";
import { azureError } from "../../../../src/common/azureApi";
import type { Connection } from "../../../../src/common/types";
import { AzureApiManager, azureTarget, validateCostQuery, type AzureCaller } from "../../../../src/main/managers/azureApiManager";

jest.mock("https", () => ({ request: jest.fn() }));
jest.mock("../../../../src/common/logger", () => ({ logWarn: jest.fn() }));

const scope = "/subscriptions/00000000-0000-0000-0000-000000000001";
const costPath = `${scope}/providers/Microsoft.CostManagement/query?api-version=2025-03-01`;
const query: AzureAPI.CostQuery = { type: "ActualCost", timeframe: "MonthToDate", dataset: { granularity: "Daily", aggregation: { total: { name: "Cost", function: "Sum" } } } };

describe("Azure host API", () => {
    let manager: AzureApiManager;
    let caller: AzureCaller;
    let connection: Connection;
    const token = jest.fn();
    const getAgentForUrl = jest.fn();
    const changed = jest.fn();
    let responses: Array<{ status?: number; headers?: Record<string, string>; data?: unknown; pending?: boolean }>;
    let requests: Array<{ url: URL; options: https.RequestOptions; body?: string }>;

    beforeEach(() => {
        jest.clearAllMocks();
        connection = {
            id: "connection",
            name: "Test connection",
            url: "https://org.crm.dynamics.com",
            authenticationType: "interactive",
            environment: "Dev",
            createdAt: "",
            enabledForAzureAPI: true,
            enabledForGraphAPI: true,
            accessToken: "dataverse-only",
            msalAccountId: "account-tenant",
            tenantId: "tenant",
        };
        token.mockResolvedValue("host-only-arm-token");
        getAgentForUrl.mockReturnValue({ proxy: true });
        manager = new AzureApiManager(
            { getConnectionById: () => connection },
            { acquireAzureToken: token, getAzureAccount: async () => ({ accountId: connection.msalAccountId ?? "application", tenantId: connection.tenantId, displayName: "Test User" }) },
            { getAgentForUrl },
            changed,
        );
        caller = { owner: 1, connectionId: connection.id, permissions: { arm: true, graph: ["User.Read"] }, isCurrent: () => true, approve: jest.fn().mockResolvedValue(true) };
        responses = [];
        requests = [];
        (https.request as jest.Mock).mockImplementation((url: URL, options: https.RequestOptions, callback: (response: EventEmitter) => void) => {
            const request = Object.assign(new EventEmitter(), {
                end: (body?: string) => {
                    requests.push({ url, options, body });
                    const response = responses.shift() ?? { data: { value: [] } };
                    const abort = () => request.emit("error", options.signal?.reason);
                    options.signal?.addEventListener("abort", abort, { once: true });
                    if (response.pending) return;
                    queueMicrotask(() => {
                        const incoming = Object.assign(new EventEmitter(), { statusCode: response.status ?? 200, headers: response.headers ?? {} });
                        callback(incoming);
                        incoming.emit("data", Buffer.from(JSON.stringify(response.data ?? null)));
                        incoming.emit("end");
                        options.signal?.removeEventListener("abort", abort);
                    });
                },
                destroy: (error: Error) => request.emit("error", error),
            });
            return request;
        });
    });

    const authenticate = () => manager.invoke(caller, "authenticate", "arm", undefined);

    it("keeps optional Azure disabled without changing the Dataverse token", async () => {
        connection.enabledForAzureAPI = false;
        await expect(manager.invoke(caller, "state", "arm", undefined)).resolves.toMatchObject({ configured: false, signedIn: true, status: "disabled", access: "unverified" });
        await expect(manager.invoke(caller, "get", "arm", costPath)).rejects.toMatchObject({ code: "notConfigured" });
        expect(token).not.toHaveBeenCalled();
        expect(connection.accessToken).toBe("dataverse-only");
    });

    it("requires installed manifest capability and explicit host approval before token acquisition", async () => {
        await expect(manager.invoke({ ...caller, permissions: {} }, "state", "arm", undefined)).rejects.toMatchObject({ code: "capabilityDenied" });
        await expect(manager.invoke(caller, "get", "arm", costPath)).rejects.toMatchObject({ code: "consentRequired" });
        await expect(manager.invoke({ ...caller, approve: async () => false }, "authenticate", "arm", undefined)).rejects.toMatchObject({ code: "consentRequired" });
        expect(token).not.toHaveBeenCalled();
        expect(https.request).not.toHaveBeenCalled();
    });

    it("acquires headless tokens on demand without approval but retains capability and enablement checks", async () => {
        caller.headless = true;
        await manager.invoke(caller, "get", "arm", "/subscriptions?api-version=2022-12-01");
        expect(caller.approve).not.toHaveBeenCalled();
        expect(token).toHaveBeenCalledWith(connection, ["https://management.azure.com/.default"], true, false, expect.any(AbortSignal));
        await manager.invoke(caller, "authenticate", "graph", undefined);
        expect(caller.approve).not.toHaveBeenCalled();
        expect(token).toHaveBeenLastCalledWith(connection, ["https://graph.microsoft.com/User.Read"], true, false, expect.any(AbortSignal));
        await expect(manager.invoke({ ...caller, permissions: {} }, "get", "arm", costPath)).rejects.toMatchObject({ code: "capabilityDenied" });
        connection.enabledForGraphAPI = false;
        await expect(manager.invoke(caller, "get", "graph", "/v1.0/me")).rejects.toMatchObject({ code: "notConfigured" });
        expect(token).toHaveBeenCalledTimes(2);
    });

    it("isolates headless pagination, cancellation and events by invocation owner", async () => {
        caller.headless = true;
        const event = jest.fn();
        manager.subscribeOwner(caller.owner, event);
        responses.push({ data: { value: [], nextLink: "https://management.azure.com/subscriptions?api-version=2022-12-01&page=2" } });
        const page = (await manager.invoke(caller, "get", "arm", "/subscriptions?api-version=2022-12-01")) as AzureAPI.Response;
        await expect(manager.invoke({ ...caller, owner: -2 }, "next", "arm", page.continuation)).rejects.toMatchObject({ code: "invalidContinuation" });
        await expect(manager.invoke(caller, "next", "arm", page.continuation)).resolves.toMatchObject({ status: 200 });
        responses.push({ pending: true });
        const pending = manager.invoke(caller, "get", "arm", costPath, { requestId: "headless-request" });
        while (requests.length < 3) await Promise.resolve();
        manager.cancel(-2, "headless-request");
        manager.invalidate(connection.id);
        await expect(pending).rejects.toMatchObject({ code: "connectionChanged" });
        expect(event).toHaveBeenCalledWith({ connectionId: connection.id, reason: "connectionChanged" });
        manager.disposeOwner(caller.owner);
        event.mockClear();
        manager.invalidate(connection.id);
        expect(event).not.toHaveBeenCalled();
    });

    it("renews once on 401, routes through the configured proxy, and strips secret headers", async () => {
        await authenticate();
        responses.push({ status: 401 }, { data: { value: [] }, headers: { "set-cookie": "private", "x-ms-request-id": "safe", "retry-after": "5" } });
        const result = await manager.invoke(caller, "get", "arm", "/subscriptions?api-version=2022-12-01");
        expect(result).toEqual({ status: 200, data: { value: [] }, headers: { "x-ms-request-id": "safe", "retry-after": "5" } });
        expect(token).toHaveBeenLastCalledWith(connection, ["https://management.azure.com/.default"], false, true, expect.any(AbortSignal));
        expect(requests).toHaveLength(2);
        expect(requests[0].options.agent).toEqual({ proxy: true });
        expect(getAgentForUrl).toHaveBeenCalledWith("https://management.azure.com/subscriptions?api-version=2022-12-01");
        expect(JSON.stringify(result)).not.toContain("host-only-arm-token");
    });

    it.each([
        [401, "authenticationFailed"],
        [403, "accessDenied"],
        [429, "throttled"],
    ])("returns structured HTTP %i diagnostics without guessing a missing role", async (status, code) => {
        await authenticate();
        const response = {
            status,
            data: { error: { code: "DeniedByPolicy", message: "private details" } },
            headers: { "x-ms-request-id": "request", "x-ms-correlation-request-id": "correlation", "retry-after": "7" },
        };
        responses.push(response, response);
        await expect(manager.invoke(caller, "get", "arm", costPath)).rejects.toMatchObject({
            name: "AzureApiError",
            code,
            status,
            serviceCode: "DeniedByPolicy",
            requestId: "request",
            correlationId: "correlation",
            retryAfterMs: 7000,
        });
    });

    it("retains a successful empty or no-content response instead of reporting zero spend", async () => {
        await authenticate();
        responses.push({ status: 204 });
        await expect(manager.invoke(caller, "costs", "arm", { scope, query })).resolves.toMatchObject({ status: 204, data: null });
    });

    it("reports independent cost prerequisite checks and uses a single bounded host operation", async () => {
        connection.enabledForAzureAPI = false;
        await expect(manager.invoke(caller, "checkCosts", "arm", scope)).resolves.toMatchObject({ configured: false, signedIn: true, scopeSelected: true, costData: "unverified" });
        connection.enabledForAzureAPI = true;
        await authenticate();
        responses.push({ status: 403 });
        await expect(manager.invoke(caller, "checkCosts", "arm", scope)).resolves.toMatchObject({
            configured: true,
            signedIn: true,
            scopeSelected: true,
            costData: "accessDenied",
            error: { code: "accessDenied" },
        });
        responses.push({ status: 204 });
        await expect(manager.invoke(caller, "checkCosts", "arm", scope)).resolves.toMatchObject({ costData: "accessible" });
        expect(requests[1].body).toContain("PreTaxCost");
    });

    it("follows query pagination with the original POST body and preserves currencies", async () => {
        await authenticate();
        const url = `https://management.azure.com${costPath}&$skiptoken=next`;
        responses.push({
            data: {
                properties: {
                    columns: [{ name: "Currency" }, { name: "Cost" }],
                    rows: [
                        ["USD", 5],
                        ["EUR", 7],
                    ],
                    nextLink: url,
                },
            },
        });
        const first = (await manager.invoke(caller, "costs", "arm", { scope, query })) as AzureAPI.Response<AzureAPI.CostQueryResult>;
        expect(first.data?.properties.rows).toEqual([
            ["USD", 5],
            ["EUR", 7],
        ]);
        expect(first.data?.properties).not.toHaveProperty("nextLink");
        const second = (await manager.invoke(caller, "next", "arm", first.continuation)) as AzureAPI.Response;
        expect(second.status).toBe(200);
        expect(requests[1].options.method).toBe("POST");
        expect(requests[1].body).toBe(JSON.stringify(query));
        await expect(manager.invoke(caller, "next", "arm", first.continuation)).rejects.toMatchObject({ code: "invalidContinuation" });
    });

    it("rejects foreign, cross-scope and cyclic next links", async () => {
        await authenticate();
        for (const nextLink of ["https://evil.test/private", `https://management.azure.com/subscriptions?api-version=2025-03-01`, `https://management.azure.com${costPath}`]) {
            responses.push({ data: { properties: { nextLink } } });
            await expect(manager.invoke(caller, "costs", "arm", { scope, query })).rejects.toMatchObject({ name: "AzureApiError" });
        }
    });

    it("binds continuations and cancellation to the owning tool", async () => {
        await authenticate();
        const other = { ...caller, owner: 2 };
        await manager.invoke(other, "authenticate", "arm", undefined);
        responses.push({ data: { nextLink: `https://management.azure.com/subscriptions?api-version=2022-12-01&$skiptoken=next` } });
        const first = (await manager.invoke(caller, "get", "arm", "/subscriptions?api-version=2022-12-01")) as AzureAPI.Response;
        await expect(manager.invoke(other, "next", "arm", first.continuation)).rejects.toMatchObject({ code: "invalidContinuation" });
        responses.push({ pending: true });
        const pending = manager.invoke(caller, "get", "arm", costPath, { requestId: "cancel-me" });
        await new Promise<void>((resolve) => setImmediate(resolve));
        manager.cancel(2, "cancel-me");
        manager.cancel(1, "cancel-me");
        await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    });

    it("uses the longest valid retry delay across date-form and Cost Management throttle headers", async () => {
        await authenticate();
        const now = Date.parse("2026-11-15T00:00:00Z");
        const clock = jest.spyOn(Date, "now").mockReturnValue(now);
        try {
            responses.push({ status: 429, headers: { "retry-after": new Date(now + 5000).toUTCString(), "x-ms-ratelimit-microsoft.costmanagement-entity-retry-after": "9" } });
            await expect(manager.invoke(caller, "get", "arm", costPath)).rejects.toMatchObject({ code: "throttled", retryAfterMs: 9000 });
        } finally {
            clock.mockRestore();
        }
    });

    it("bounds cancellation and deadlines even when token acquisition has not completed", async () => {
        await authenticate();
        token.mockImplementationOnce(() => new Promise(() => undefined));
        const pending = manager.invoke(caller, "get", "arm", costPath, { requestId: "token-pending" });
        await new Promise<void>((resolve) => setImmediate(resolve));
        manager.cancel(1, "token-pending");
        await expect(pending).rejects.toMatchObject({ code: "cancelled" });
        expect(https.request).not.toHaveBeenCalled();
        jest.useFakeTimers();
        try {
            token.mockImplementationOnce(() => new Promise(() => undefined));
            const timed = manager.invoke(caller, "get", "arm", costPath, { timeoutMs: 1000 });
            const expectation = expect(timed).rejects.toMatchObject({ code: "timeout" });
            await jest.advanceTimersByTimeAsync(1001);
            await expectation;
        } finally {
            jest.useRealTimers();
        }
    });

    it("invalidates old work and approval when tenant/account settings change", async () => {
        await authenticate();
        responses.push({ pending: true });
        const pending = manager.invoke(caller, "get", "arm", costPath);
        await new Promise<void>((resolve) => setImmediate(resolve));
        connection = { ...connection, tenantId: "new-tenant", msalAccountId: "new-account" };
        manager.invalidate(connection.id);
        await expect(pending).rejects.toMatchObject({ code: "connectionChanged" });
        expect(changed).toHaveBeenCalledWith(1, { connectionId: connection.id, reason: "connectionChanged" });
        await expect(manager.invoke(caller, "get", "arm", costPath)).rejects.toMatchObject({ code: "consentRequired" });
    });

    it("reports interaction-required without unexpectedly opening a browser", async () => {
        await authenticate();
        token.mockRejectedValueOnce(azureError("interactionRequired", "MFA required"));
        await expect(manager.invoke(caller, "get", "arm", costPath)).rejects.toMatchObject({ code: "interactionRequired" });
        await expect(manager.invoke(caller, "state", "arm", undefined)).resolves.toMatchObject({ status: "interactionRequired" });
    });

    it("keeps claims challenges host-only and supplies them on explicit reconnect", async () => {
        await authenticate();
        const claims = JSON.stringify({ access_token: { test: { essential: true } } });
        responses.push({ status: 401, headers: { "www-authenticate": `Bearer claims="${Buffer.from(claims).toString("base64")}"` } });
        await expect(manager.invoke(caller, "get", "arm", costPath)).rejects.toMatchObject({ code: "interactionRequired" });
        await authenticate();
        expect(token).toHaveBeenLastCalledWith(connection, ["https://management.azure.com/.default"], true, false, expect.any(AbortSignal), claims);
        expect(JSON.stringify(changed.mock.calls)).not.toContain("access_token");
    });

    it("aborts pending requests and invalidates page handles when the tool switches slots", async () => {
        await authenticate();
        responses.push({ pending: true });
        const pending = manager.invoke(caller, "get", "arm", costPath);
        await new Promise<void>((resolve) => setImmediate(resolve));
        manager.connectionChanged(caller.owner);
        await expect(pending).rejects.toMatchObject({ code: "connectionChanged" });
        await expect(manager.invoke(caller, "get", "arm", costPath)).rejects.toMatchObject({ code: "consentRequired" });
    });

    it("uses separately declared Graph scopes and denies arbitrary/write operations", async () => {
        await manager.invoke(caller, "authenticate", "graph", undefined);
        await manager.invoke(caller, "get", "graph", "/v1.0/me");
        expect(token).toHaveBeenLastCalledWith(connection, ["https://graph.microsoft.com/User.Read"], false, false, expect.any(AbortSignal));
        await expect(manager.invoke(caller, "post", "graph", "/v1.0/users")).rejects.toMatchObject({ code: "invalidRequest" });
        await expect(manager.invoke(caller, "costs", "graph", { scope, query })).rejects.toMatchObject({ code: "invalidRequest" });
    });
});

describe("Azure request validation", () => {
    it.each(["https://evil.test/", "//evil.test/", "/subscriptions/../tenants?api-version=1", "/%2e%2e/tenants?api-version=1", "/subscriptions?api-version=1#fragment", "/subscriptions"])(
        "rejects unsafe ARM path %s",
        (path) => {
            expect(() => azureTarget("arm", path)).toThrow();
        },
    );
    it("validates actual/amortized query limits and filter operators", () => {
        expect(validateCostQuery(query)).toBe(JSON.stringify(query));
        expect(validateCostQuery({ ...query, type: "AmortizedCost" })).toContain("AmortizedCost");
        expect(() => validateCostQuery({ ...query, type: "Usage" })).toThrow();
        expect(() => validateCostQuery({ ...query, dataset: { filter: { dimensions: { name: "ServiceName", operator: "NotIn", values: ["x"] } } } })).toThrow();
        expect(() => validateCostQuery({ ...query, dataset: { grouping: Array(3).fill({ type: "Dimension", name: "ServiceName" }) } })).toThrow();
    });
});
