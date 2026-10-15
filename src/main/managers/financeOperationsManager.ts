import type { FinanceOperationsMethod, FinanceOperationsOptions, FinanceOperationsResponse } from "../../common/financeOperationsApi";
import { normalizeConnection } from "../../common/types/connection";
import { buildFinanceOperationsUrl, financeOperationsHttp, FinanceOperationsHttpError, validateFinanceOperationsHeaders } from "../utilities/financeOperationsHttp";
import { AuthManager } from "./authManager";
import { ConnectionsManager } from "./connectionsManager";

export class FinanceOperationsManager {
    constructor(private readonly connections: ConnectionsManager, private readonly auth: AuthManager) {}

    async request<T = unknown>(connectionId: string, method: FinanceOperationsMethod, path: string, body?: unknown, options: FinanceOperationsOptions = {}): Promise<FinanceOperationsResponse<T>> {
        if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(method)) throw new Error("Unsupported F&O HTTP method.");
        if (method === "GET" && body !== undefined) throw new Error("GET requests cannot contain a body.");
        const saved = this.connections.getConnectionById(connectionId);
        if (!saved) throw new Error("F&O connection not found.");
        const connection = normalizeConnection(saved);
        if (connection.connectionType !== "financeOperations") throw new Error("This API requires a Finance & Operations connection.");
        if (connection.hasIncompleteCredentials) throw new Error("F&O connection has incomplete credentials.");
        const url = buildFinanceOperationsUrl(connection.url, path);
        const headers = validateFinanceOperationsHeaders(options.headers);
        const timeoutMs = options.timeoutMs ?? (url.pathname.endsWith("/$metadata") ? 120_000 : 30_000);
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new Error("F&O timeout must be between 1,000 and 120,000 milliseconds.");
        if (body !== undefined && Buffer.byteLength(JSON.stringify(body)) > 20 * 1024 * 1024) throw new Error("F&O request exceeds the 20 MB size limit.");
        const snapshot = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
        const getToken = async (forceRefresh = false) => {
            const expiry = connection.tokenExpiry ? Date.parse(connection.tokenExpiry) : NaN;
            if (!forceRefresh && connection.accessToken && expiry > Date.now() + 60_000) return connection.accessToken;
            const result = connection.authenticationType === "clientSecret"
                ? await this.auth.authenticateClientSecret(connection, undefined, true, forceRefresh)
                : await this.auth.acquireTokenSilently(connection, forceRefresh);
            this.connections.updateConnectionTokens(connectionId, result);
            return result.accessToken;
        };
        try {
            return await financeOperationsHttp(url, method, await getToken(), snapshot, headers, timeoutMs) as FinanceOperationsResponse<T>;
        } catch (error) {
            // Writes/actions are never replayed after uncertain delivery.
            if (!(error instanceof FinanceOperationsHttpError) || error.status !== 401 || method !== "GET") throw error;
            return await financeOperationsHttp(url, method, await getToken(true), snapshot, headers, timeoutMs) as FinanceOperationsResponse<T>;
        }
    }
}
