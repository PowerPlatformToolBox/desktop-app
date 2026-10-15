import type { ConnectionTarget } from "./connectionSlots";

export type FinanceOperationsMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export type FinanceOperationsKey = Record<string, string | number | boolean | { odataLiteral: string }>;
export interface FinanceOperationsOptions {
    connectionTarget?: ConnectionTarget;
    headers?: Record<string, string>;
    timeoutMs?: number;
}
export interface FinanceOperationsResponse<T = unknown> {
    status: number;
    headers: Record<string, string>;
    body?: T;
}
export interface FinanceOperationsPage<T = Record<string, unknown>> {
    value: T[];
    "@odata.context"?: string;
    "@odata.nextLink"?: string;
    "@odata.count"?: number;
}
export interface FinanceOperationsServiceDocument {
    value: Array<{ name: string; kind: string; url: string }>;
    "@odata.context"?: string;
}
export type FinanceOperationsRequest = <T = unknown>(method: FinanceOperationsMethod, path: string, body?: unknown, options?: FinanceOperationsOptions) => Promise<FinanceOperationsResponse<T>>;

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function financeOperationsRecordPath(entitySet: string, key: FinanceOperationsKey): string {
    if (!identifier.test(entitySet)) throw new Error("Invalid F&O entity-set name.");
    if (!key || typeof key !== "object" || Array.isArray(key) || Object.keys(key).length === 0) throw new Error("Provide all entity-key fields.");
    const fields = Object.entries(key).map(([name, value]) => {
        if (!identifier.test(name)) throw new Error("Invalid F&O key field.");
        let literal: string;
        if (typeof value === "string") literal = `'${value.replace(/'/g, "''")}'`;
        else if (typeof value === "boolean") literal = String(value);
        else if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) literal = String(value);
        else if (value && typeof value === "object" && Object.keys(value).length === 1 && typeof value.odataLiteral === "string") {
            literal = value.odataLiteral;
            // Explicit literals cover decimal/int64, GUID, date/time and named enum keys.
            if (!/^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}|\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?|[A-Za-z_][\w.]*'[A-Za-z_][\w]*')$/.test(literal)) {
                throw new Error("Unsupported OData key literal.");
            }
        } else throw new Error("Unsupported F&O key value; use an explicit literal for large numeric keys.");
        return `${name}=${encodeURIComponent(literal)}`;
    });
    return `${entitySet}(${fields.join(",")})`;
}

/** One shared facade keeps desktop and unattended API behavior identical. */
export function createFinanceOperationsAPI(request: FinanceOperationsRequest) {
    return {
        request,
        queryData: async <T = Record<string, unknown>>(path: string, options?: FinanceOperationsOptions): Promise<FinanceOperationsPage<T>> => {
            const result = await request<FinanceOperationsPage<T>>("GET", path, undefined, options);
            if (!result.body || !Array.isArray(result.body.value)) throw new Error("F&O did not return an OData collection.");
            return result.body;
        },
        retrieve: async <T = Record<string, unknown>>(entitySet: string, key: FinanceOperationsKey, select?: string[], options?: FinanceOperationsOptions): Promise<T> => {
            let path = financeOperationsRecordPath(entitySet, key);
            if (select?.length) {
                if (select.some((field) => !identifier.test(field))) throw new Error("Invalid selected field name.");
                path += `?$select=${select.join(",")}`;
            }
            const result = await request<T>("GET", path, undefined, options);
            if (result.body === undefined) throw new Error("F&O returned an empty record response.");
            return result.body;
        },
        create: <T = Record<string, unknown>>(entitySet: string, data: Record<string, unknown>, options?: FinanceOperationsOptions) => {
            if (!identifier.test(entitySet)) throw new Error("Invalid F&O entity-set name.");
            return request<T>("POST", entitySet, data, options);
        },
        update: (entitySet: string, key: FinanceOperationsKey, data: Record<string, unknown>, options?: FinanceOperationsOptions) => request("PATCH", financeOperationsRecordPath(entitySet, key), data, options),
        delete: (entitySet: string, key: FinanceOperationsKey, options?: FinanceOperationsOptions) => request("DELETE", financeOperationsRecordPath(entitySet, key), undefined, options),
        getServiceDocument: async (options?: FinanceOperationsOptions): Promise<FinanceOperationsServiceDocument> => {
            const result = await request<FinanceOperationsServiceDocument>("GET", "", undefined, options);
            if (!result.body || !Array.isArray(result.body.value)) throw new Error("F&O did not return an OData service document.");
            return result.body;
        },
        getMetadata: async (options?: FinanceOperationsOptions): Promise<string> => {
            const result = await request<string>("GET", "$metadata", undefined, options);
            if (typeof result.body !== "string") throw new Error("F&O did not return XML metadata.");
            return result.body;
        },
    };
}

export type FinanceOperationsAPI = ReturnType<typeof createFinanceOperationsAPI>;
