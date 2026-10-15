/** F&O OData API exposed to desktop and headless tools. */
declare namespace FinanceOperationsAPI {
    type ConnectionTarget = "primary" | "secondary" | number;
    type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    /** Supply every key field from $metadata. Use explicit literals for Int64/decimal/enum/date keys. */
    type Key = Record<string, string | number | boolean | { odataLiteral: string }>;
    interface Options {
        connectionTarget?: ConnectionTarget;
        /** Custom headers require per-tool F&O consent. Authorization and transport headers cannot be overridden. */
        headers?: Record<string, string>;
        /** Between 1,000 and 120,000; default 30,000, or 120,000 for metadata. */
        timeoutMs?: number;
    }
    interface Response<T = unknown> {
        status: number;
        headers: Record<string, string>;
        body?: T;
    }
    interface Page<T = Record<string, unknown>> {
        value: T[];
        "@odata.context"?: string;
        "@odata.nextLink"?: string;
        "@odata.count"?: number;
    }
    interface ServiceDocument {
        value: Array<{ name: string; kind: string; url: string }>;
        "@odata.context"?: string;
    }
    /** Structured rejection: Electron does not preserve custom properties on bridged Error instances. */
    interface RequestError {
        name: string;
        message: string;
        code?: string;
        status?: number;
        requestId?: string;
        retryAfter?: string;
    }
    interface API {
        /** Paths are relative to /data, or same-environment absolute OData URLs. Redirects are rejected. */
        request<T = unknown>(method: Method, path: string, body?: unknown, options?: Options): Promise<Response<T>>;
        /** Returns one page; pass @odata.nextLink back to queryData to continue. */
        queryData<T = Record<string, unknown>>(path: string, options?: Options): Promise<Page<T>>;
        retrieve<T = Record<string, unknown>>(entitySet: string, key: Key, select?: string[], options?: Options): Promise<T>;
        create<T = Record<string, unknown>>(entitySet: string, data: Record<string, unknown>, options?: Options): Promise<Response<T>>;
        update(entitySet: string, key: Key, data: Record<string, unknown>, options?: Options): Promise<Response>;
        delete(entitySet: string, key: Key, options?: Options): Promise<Response>;
        getServiceDocument(options?: Options): Promise<ServiceDocument>;
        getMetadata(options?: Options): Promise<string>;
    }
}
declare global {
    var financeOperationsAPI: FinanceOperationsAPI.API;
    interface Window { financeOperationsAPI: FinanceOperationsAPI.API; }
    interface GlobalThis { financeOperationsAPI: FinanceOperationsAPI.API; }
}
export = FinanceOperationsAPI;
export as namespace FinanceOperationsAPI;
