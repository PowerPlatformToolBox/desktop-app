/** Host-proxied, read-only ARM and Microsoft Graph access. Requires PPTB 1.2.9. */
export namespace AzureAPI {
    export type Resource = "arm" | "graph";
    export type ConnectionTarget = "primary" | "secondary" | number;

    /** Host-resolved resource permissions. Graph permissions are delegated short names; tool manifests use features.apis. */
    export interface Permissions {
        arm?: boolean;
        graph?: string[];
    }

    export interface Options {
        connectionTarget?: ConnectionTarget;
        /** Unique per tool instance while active. Use cancelRequest(id), not an AbortSignal across IPC. */
        requestId?: string;
        /** Total deadline, including authentication. Default 30000; range 1000..120000 ms. */
        timeoutMs?: number;
    }

    export interface Response<T = unknown> {
        status: number;
        /** Lowercase, safe response headers only. */
        headers: Record<string, string>;
        /** Null for an empty/204 response. */
        data: T | null;
        /** Opaque handle. nextPage preserves the original HTTP method and query body. */
        continuation?: string;
    }

    export type ErrorCode =
        | "invalidRequest"
        | "capabilityDenied"
        | "consentRequired"
        | "notConfigured"
        | "notConnected"
        | "interactionRequired"
        | "authenticationFailed"
        | "accessDenied"
        | "throttled"
        | "costDataUnavailable"
        | "networkError"
        | "serviceError"
        | "cancelled"
        | "timeout"
        | "connectionChanged"
        | "invalidContinuation"
        | "limitExceeded";

    /** Plain rejection object: fields survive Electron context isolation. */
    export interface ApiError {
        name: "AzureApiError";
        code: ErrorCode;
        message: string;
        status?: number;
        headers?: Record<string, string>;
        serviceCode?: string;
        requestId?: string;
        correlationId?: string;
        retryAfterMs?: number;
    }

    export interface ConnectionState {
        configured: boolean;
        signedIn: boolean;
        status: "disabled" | "notConnected" | "ready" | "interactionRequired";
        connectionId: string;
        connectionName: string;
        tenantId?: string;
        accountId?: string;
        displayName?: string;
        authentication: "delegated" | "application";
        /** Actual cost authorization is unknown until a specific request succeeds. */
        access: "unverified";
    }

    export interface ConnectionChangedEvent {
        connectionId: string;
        reason: "connectionChanged" | "authenticated" | "interactionRequired";
    }

    export interface ReadClient {
        getConnectionState(connectionTarget?: ConnectionTarget): Promise<ConnectionState>;
        /** Windowed: host approval and optional browser sign-in. Headless: host sign-in without an additional PPTB approval dialog. */
        authenticate(options?: Options): Promise<ConnectionState>;
        Get<T = unknown>(path: string, options?: Options): Promise<Response<T>>;
        nextPage<T = unknown>(continuation: string, options?: Options): Promise<Response<T>>;
    }

    export interface ArmClient extends ReadClient {
        /** Only subscription-scoped Microsoft.CostManagement/query POSTs are accepted. */
        queryCosts(scope: string, query: CostQuery, options?: Options): Promise<Response<CostQueryResult>>;
        listSubscriptions(options?: Options): Promise<Response<SubscriptionList>>;
        /** Small actual-cost query. Empty successful data is not zero spend or a permission failure. */
        checkCostAccess(scope: string, options?: Options): Promise<CostAccessCheck>;
    }

    export interface CostAccessCheck {
        configured: boolean;
        signedIn: boolean;
        scopeSelected: boolean;
        costData: "accessible" | "accessDenied" | "unverified";
        checkedAt: string;
        error?: ApiError;
    }

    export interface CostQuery {
        type: "ActualCost" | "AmortizedCost";
        timeframe: "MonthToDate" | "BillingMonthToDate" | "TheLastMonth" | "TheLastBillingMonth" | "WeekToDate" | "Custom";
        timePeriod?: { from: string; to: string };
        dataset: {
            granularity?: "Daily" | "Monthly" | "None";
            aggregation?: Record<string, { name: string; function: "Sum" }>;
            grouping?: Array<{ type: "Dimension" | "TagKey"; name: string }>;
            filter?: CostFilter;
        };
    }

    export interface CostFilter {
        and?: CostFilter[];
        or?: CostFilter[];
        dimensions?: { name: string; operator: "In"; values: string[] };
        tags?: { name: string; operator: "In"; values: string[] };
    }

    export interface CostQueryResult {
        properties: {
            columns: Array<{ name: string; type: string }>;
            /** Currency is preserved in the service's columns/rows; never sum different currencies. */
            rows: Array<Array<string | number | null>>;
        };
    }

    export interface SubscriptionList {
        value: Array<{ subscriptionId: string; displayName: string; tenantId?: string; state: string }>;
    }

    export interface API {
        arm: ArmClient;
        graph: ReadClient;
        cancelRequest(requestId: string): Promise<void>;
        onConnectionChanged(listener: (event: ConnectionChangedEvent) => void): () => void;
    }
}

declare global {
    /** Available while invokeHeadless runs; uses its assigned saved connections and host-managed authentication. */
    var azureAPI: AzureAPI.API;
    interface Window {
        azureAPI: AzureAPI.API;
    }
}
