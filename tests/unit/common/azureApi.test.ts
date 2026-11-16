import { createAzureAPI, validAzurePermissions } from "../../../src/common/azureApi";
import { AZURE_CHANNELS } from "../../../src/common/ipc/channels";

describe("Azure preload contract", () => {
    const invoke = jest.fn();
    const dispose = jest.fn();
    const subscribe = jest.fn(() => dispose);
    const api = createAzureAPI(invoke, subscribe);
    beforeEach(() => jest.clearAllMocks());

    it("preserves structured failures instead of losing error metadata", async () => {
        const error = { name: "AzureApiError", code: "throttled", status: 429, headers: { "retry-after": "2" }, message: "Wait" };
        invoke.mockResolvedValue({ ok: false, error });
        await expect(api.arm.Get("/subscriptions?api-version=2022-12-01")).rejects.toEqual(error);
    });

    it("routes options, resource, pagination and cancellation without exposing a token getter", async () => {
        invoke.mockResolvedValue({ ok: true, value: { status: 200, headers: {}, data: {} } });
        await api.graph.Get("/v1.0/me", { connectionTarget: 3, requestId: "graph" });
        expect(invoke).toHaveBeenLastCalledWith(AZURE_CHANNELS.INVOKE, "get", "graph", "/v1.0/me", { connectionTarget: 3, requestId: "graph" });
        await api.arm.nextPage("opaque-handle", { connectionTarget: "secondary" });
        expect(invoke).toHaveBeenLastCalledWith(AZURE_CHANNELS.INVOKE, "next", "arm", "opaque-handle", { connectionTarget: "secondary" });
        await api.cancelRequest("graph");
        expect(invoke).toHaveBeenLastCalledWith(AZURE_CHANNELS.CANCEL, "graph");
        expect(api).not.toHaveProperty("getToken");
        expect(api.onConnectionChanged(jest.fn())).toBe(dispose);
    });

    it("provides prerequisite checks without treating denied or unverified access as success", async () => {
        const error = { name: "AzureApiError", code: "accessDenied", message: "Verify billing policies" };
        invoke.mockResolvedValueOnce({ ok: true, value: { configured: true, signedIn: true, scopeSelected: true, costData: "accessDenied", error } });
        await expect(api.arm.checkCostAccess("/subscriptions/00000000-0000-0000-0000-000000000001")).resolves.toMatchObject({
            configured: true,
            signedIn: true,
            scopeSelected: true,
            costData: "accessDenied",
            error,
        });
    });

    it.each([{ arm: true }, { graph: ["User.Read", "Reports.Read.All"] }, { arm: true, graph: ["Directory.Read.All"] }])("accepts supported read permissions %p", (permissions) => {
        expect(validAzurePermissions(permissions)).toBe(true);
    });
    it.each([{ graph: ["User.ReadWrite.All"] }, { graph: ["https://graph.microsoft.com/User.Read"] }, { graph: [] }, { arm: "true" }, { token: true }])(
        "rejects invalid permissions %p",
        (permissions) => {
            expect(validAzurePermissions(permissions)).toBe(false);
        },
    );
});
