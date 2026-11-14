import type { ConnectionTarget } from "./connectionSlots";

export interface PowerPlatformRawResponse {
    status: number;
    /** Lowercase header names; repeated values are joined with ", ". */
    headers: Record<string, string>;
    body: Uint8Array;
}

export interface PowerPlatformRawOptions {
    requireDelegatedAuthentication?: boolean;
}

/** A plain rejection value so metadata survives Electron's contextBridge. */
export interface PowerPlatformHttpError extends PowerPlatformRawResponse {
    name: "PowerPlatformHttpError";
    message: string;
    code?: string;
}

export type PowerPlatformMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export function getPowerPlatformErrorDetails(body: Uint8Array, status: number): { message: string; code?: string } {
    const text = new TextDecoder().decode(body);
    try {
        const data: unknown = JSON.parse(text);
        if (data && typeof data === "object") {
            const nested = "error" in data ? data.error : undefined;
            const details = nested && typeof nested === "object" ? nested : data;
            if ("message" in details && typeof details.message === "string") {
                const code = "code" in details && typeof details.code === "string" ? details.code : undefined;
                return { message: code ? `${code}: ${details.message}` : details.message, ...(code ? { code } : {}) };
            }
        }
    } catch {
        // Non-JSON error bodies remain available on the response.
    }
    return { message: `HTTP ${status}` };
}

type RawRequest = (
    method: PowerPlatformMethod,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    connectionTarget?: ConnectionTarget,
    options?: PowerPlatformRawOptions,
) => Promise<PowerPlatformRawResponse>;

export function createPowerPlatformRawClient(request: RawRequest) {
    const invoke: RawRequest = async (...args) => {
        const response = await request(...args);
        if (response.status < 200 || response.status >= 300) {
            // Error instances lose custom fields across contextBridge; reject a cloneable object instead.
            const error: PowerPlatformHttpError = { ...response, name: "PowerPlatformHttpError", ...getPowerPlatformErrorDetails(response.body, response.status) };
            throw error;
        }
        return response;
    };
    return {
        Get: (path = "", target?: ConnectionTarget, headers?: Record<string, string>, options?: PowerPlatformRawOptions) => invoke("GET", path, undefined, headers, target, options),
        Post: (path = "", body?: unknown, target?: ConnectionTarget, headers?: Record<string, string>, options?: PowerPlatformRawOptions) => invoke("POST", path, body, headers, target, options),
        Put: (path = "", body?: unknown, target?: ConnectionTarget, headers?: Record<string, string>, options?: PowerPlatformRawOptions) => invoke("PUT", path, body, headers, target, options),
        Patch: (path = "", body?: unknown, target?: ConnectionTarget, headers?: Record<string, string>, options?: PowerPlatformRawOptions) => invoke("PATCH", path, body, headers, target, options),
        Delete: (path = "", target?: ConnectionTarget, headers?: Record<string, string>, body?: unknown, options?: PowerPlatformRawOptions) => invoke("DELETE", path, body, headers, target, options),
    };
}
