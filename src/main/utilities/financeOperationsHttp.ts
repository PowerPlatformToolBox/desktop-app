import * as https from "https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "zlib";
import type { FinanceOperationsMethod, FinanceOperationsResponse } from "../../common/financeOperationsApi";
import { normalizeFinanceOperationsUrl } from "../../common/types/connection";
import { validateAndSnapshotHeaders } from "./dataverseBatch";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_METADATA_BYTES = 100 * 1024 * 1024;

/** Extract validation messages without exposing raw bodies or server stack traces. */
function serviceErrorMessage(body: unknown, accessToken: string): string {
    const messages: string[] = [];
    function visit(value: unknown, depth = 0): void {
        if (!value || typeof value !== "object" || depth > 5 || messages.length >= 8) return;
        const record = value as Record<string, unknown>;
        const message = typeof record.message === "string" ? record.message :
            record.message && typeof record.message === "object" ? (record.message as Record<string, unknown>).value : undefined;
        if (typeof message === "string" && message.trim()) {
            const bounded = message.trim().slice(0, 2000);
            if (!messages.includes(bounded)) messages.push(bounded);
        }
        for (const field of ["innererror", "innerError", "internalexception", "internalException"]) visit(record[field], depth + 1);
        if (Array.isArray(record.details)) {
            for (const detail of record.details.slice(0, 8)) visit(detail, depth + 1);
        }
    }
    if (body && typeof body === "object") visit((body as Record<string, unknown>).error);
    const message = messages.join(" | ") || "Request failed";
    return (accessToken ? message.split(accessToken).join("[redacted]") : message).slice(0, 2000);
}

export class FinanceOperationsHttpError extends Error {
    readonly code = "FINANCE_OPERATIONS_HTTP_ERROR";
    constructor(message: string, readonly status?: number, readonly requestId?: string, readonly retryAfter?: string) {
        super(message);
        this.name = "FinanceOperationsHttpError";
    }
}

export function buildFinanceOperationsUrl(root: string, path: string): URL {
    if (typeof path !== "string" || /[\\\r\n]/.test(path) || path.includes(String.fromCharCode(0)) || path.startsWith("//")) throw new Error("Invalid F&O request path.");
    const origin = normalizeFinanceOperationsUrl(root);
    const absolute = /^https:\/\//i.test(path);
    if (!absolute && /^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error("Only HTTPS F&O URLs are supported.");
    const rawPath = absolute ? path.replace(/^https:\/\/[^/]+/i, "").split(/[?#]/)[0] : path.split(/[?#]/)[0];
    let decoded = rawPath;
    for (let i = 0; i < 5; i++) {
        if (decoded.includes("\\") || decoded.split("/").some((part) => part === "." || part === "..")) throw new Error("F&O paths cannot contain traversal segments.");
        let next: string;
        try { next = decodeURIComponent(decoded); } catch { break; }
        if (next === decoded) break;
        decoded = next;
        if (i === 4) throw new Error("F&O path encoding is too deeply nested.");
    }
    const relative = path.startsWith("/data/") || path === "/data" ? path : `/data/${path.replace(/^\//, "")}`;
    const url = new URL(absolute ? path : relative, origin);
    if (url.origin !== origin || url.username || url.password || url.hash || (url.pathname !== "/data" && !url.pathname.startsWith("/data/"))) {
        throw new Error("F&O requests must stay within the selected environment's /data endpoint.");
    }
    if (url.pathname === "/data") url.pathname = "/data/";
    return url;
}

export function validateFinanceOperationsHeaders(headers?: Record<string, string>): Record<string, string> {
    const result = { ...validateAndSnapshotHeaders(headers) };
    for (const name of Object.keys(result)) {
        if (/^(authorization|proxy-authorization|host|content-length|transfer-encoding|connection|cookie|accept-encoding)$/i.test(name) || /^mscrm/i.test(name)) {
            throw new Error(`Header '${name}' cannot be overridden for F&O requests.`);
        }
    }
    return result;
}

export function financeOperationsHttp(url: URL, method: FinanceOperationsMethod, accessToken: string, body?: unknown, headers?: Record<string, string>, timeoutMs = 30_000): Promise<FinanceOperationsResponse> {
    const metadata = url.pathname.endsWith("/$metadata");
    const responseLimit = metadata ? MAX_METADATA_BYTES : MAX_BYTES;
    const customHeaders = validateFinanceOperationsHeaders(headers);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) throw new Error("F&O timeout must be between 1,000 and 120,000 milliseconds.");
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    if (serialized !== undefined && Buffer.byteLength(serialized) > MAX_BYTES) throw new Error("F&O request exceeds the 20 MB size limit.");
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method, headers: {
            Accept: metadata ? "application/xml" : "application/json",
            "OData-Version": "4.0", "OData-MaxVersion": "4.0", "Accept-Encoding": "gzip, deflate, br",
            ...(serialized !== undefined ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(serialized) } : {}),
            ...customHeaders, Authorization: `Bearer ${accessToken}`,
        } }, (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > responseLimit) {
                    const error = new Error(`F&O ${metadata ? "metadata" : "response"} exceeds the ${responseLimit / (1024 * 1024)} MB size limit.`);
                    // Destroying the request can synchronously abort its response. Settle
                    // first so the generic aborted event cannot hide the real cause.
                    reject(error);
                    req.destroy(error);
                    res.destroy();
                }
                else chunks.push(chunk);
            });
            res.on("error", reject);
            res.on("aborted", () => reject(new Error("F&O response was interrupted.")));
            res.on("end", () => {
                try {
                    let bytes = Buffer.concat(chunks);
                    const decompressOptions = { maxOutputLength: responseLimit };
                    if (res.headers["content-encoding"] === "gzip") bytes = gunzipSync(bytes, decompressOptions);
                    else if (res.headers["content-encoding"] === "deflate") bytes = inflateSync(bytes, decompressOptions);
                    else if (res.headers["content-encoding"] === "br") bytes = brotliDecompressSync(bytes, decompressOptions);
                    const text = bytes.toString("utf8");
                    const status = res.statusCode ?? 0;
                    const responseHeaders = Object.fromEntries(Object.entries(res.headers).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value)]));
                    let parsed: unknown;
                    if (text) {
                        try { parsed = JSON.parse(text); } catch {
                            if (url.pathname.endsWith("/$metadata") && status >= 200 && status < 300) parsed = text;
                            else if (status >= 200 && status < 300) throw new Error("F&O returned a non-JSON response.");
                        }
                    }
                    if (status < 200 || status >= 300) {
                        const safeMessage = serviceErrorMessage(parsed, accessToken);
                        reject(new FinanceOperationsHttpError(`F&O HTTP ${status}: ${safeMessage}`, status, responseHeaders["x-ms-request-id"] || responseHeaders["request-id"], responseHeaders["retry-after"]));
                    } else resolve({ status, headers: responseHeaders, ...(parsed !== undefined ? { body: parsed } : {}) });
                } catch (error) { reject(error); }
            });
        });
        const timeout = setTimeout(() => {
            const error = new Error("F&O request timed out.");
            reject(error);
            req.destroy(error);
        }, timeoutMs);
        req.on("close", () => clearTimeout(timeout));
        req.on("error", reject);
        req.end(serialized);
    });
}
