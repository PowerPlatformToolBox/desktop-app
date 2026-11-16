import type { AzureAPI } from "../../packages/types/azureAPI";
import { GRAPH_READ_PERMISSION } from "../../packages/validation/src/apiFeatures";
import { AZURE_CHANNELS } from "./ipc/channels";
export { GRAPH_READ_PERMISSION } from "../../packages/validation/src/apiFeatures";

export type { AzureAPI };
export type AzureResult<T> = { ok: true; value: T } | { ok: false; error: AzureAPI.ApiError };

export function azureError(code: AzureAPI.ErrorCode, message: string, details?: Partial<AzureAPI.ApiError>): AzureAPI.ApiError {
    return { ...details, name: "AzureApiError", code, message };
}

export function isAzureError(error: unknown): error is AzureAPI.ApiError {
    return !!error && typeof error === "object" && "name" in error && error.name === "AzureApiError" && "code" in error;
}

export function validAzurePermissions(value: unknown): value is AzureAPI.Permissions {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const permissions = value as Record<string, unknown>;
    return (
        Object.keys(permissions).every((key) => key === "arm" || key === "graph") &&
        (permissions.arm === undefined || typeof permissions.arm === "boolean") &&
        (permissions.graph === undefined ||
            (Array.isArray(permissions.graph) &&
                permissions.graph.length > 0 &&
                permissions.graph.length <= 20 &&
                permissions.graph.every((scope) => typeof scope === "string" && scope.length <= 150 && GRAPH_READ_PERMISSION.test(scope))))
    );
}

export function subscriptionScope(scope: string): string {
    if (typeof scope !== "string" || !/^\/subscriptions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(scope)) {
        throw azureError("invalidRequest", "Only /subscriptions/{subscription-guid} scopes are supported for cost queries.");
    }
    return scope.replace(/\/$/, "");
}

export function createAzureAPI(invoke: (channel: string, ...args: unknown[]) => Promise<unknown>, subscribe: (listener: (event: AzureAPI.ConnectionChangedEvent) => void) => () => void): AzureAPI.API {
    async function call<T>(action: string, resource: AzureAPI.Resource, payload?: unknown, options?: AzureAPI.Options): Promise<T> {
        const result = (await invoke(AZURE_CHANNELS.INVOKE, action, resource, payload, options)) as AzureResult<T>;
        if (!result.ok) throw result.error;
        return result.value;
    }
    const client = (resource: AzureAPI.Resource): AzureAPI.ReadClient => ({
        getConnectionState: (connectionTarget) => call("state", resource, undefined, { connectionTarget }),
        authenticate: (options) => call("authenticate", resource, undefined, options),
        Get: (path, options) => call("get", resource, path, options),
        nextPage: (continuation, options) => call("next", resource, continuation, options),
    });
    return {
        arm: {
            ...client("arm"),
            queryCosts: (scope, query, options) => call("costs", "arm", { scope, query }, options),
            listSubscriptions: (options) => call("get", "arm", "/subscriptions?api-version=2022-12-01", options),
            checkCostAccess: (scope, options) => call("checkCosts", "arm", scope, options),
        },
        graph: client("graph"),
        cancelRequest: async (requestId) => {
            const result = (await invoke(AZURE_CHANNELS.CANCEL, requestId)) as AzureResult<void>;
            if (!result.ok) throw result.error;
        },
        onConnectionChanged: subscribe,
    };
}
