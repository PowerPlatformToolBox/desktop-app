import { randomUUID } from "crypto";
import { DATAVERSE_API_VERSION } from "../constants";
import { DataverseAdditionalHeaders, DataverseBatchRequest, DataverseBatchResult } from "../../common/types";

export const MAX_DATAVERSE_HEADERS = 64;
export const MAX_DATAVERSE_HEADER_NAME_LENGTH = 256;
export const MAX_DATAVERSE_HEADER_VALUE_LENGTH = 8192;
export const MAX_DATAVERSE_BATCH_OPERATIONS = 1000;
export const MAX_DATAVERSE_BATCH_REQUEST_BYTES = 16 * 1024 * 1024;
export const MAX_DATAVERSE_BATCH_RESPONSE_BYTES = 16 * 1024 * 1024;
export const MAX_DATAVERSE_BATCH_TOTAL_HEADERS = 4096;

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const CONTENT_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
function hasControlCharacters(value: string): boolean {
    return Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
    });
}

export interface EncodedDataverseBatch {
    body: string;
    contentType: string;
    boundary: string;
}

export function validateAndSnapshotHeaders(headers?: Record<string, string>): DataverseAdditionalHeaders {
    if (headers === undefined) {
        return Object.freeze({});
    }
    if (headers === null || typeof headers !== "object" || Array.isArray(headers)) {
        throw new Error("Additional Dataverse headers must be a string record");
    }

    const entries = Object.entries(headers);
    if (entries.length > MAX_DATAVERSE_HEADERS) {
        throw new Error(`Additional Dataverse headers cannot exceed ${MAX_DATAVERSE_HEADERS} entries`);
    }

    const normalized = new Map<string, { name: string; value: string }>();
    for (const [name, value] of entries) {
        if (!HEADER_NAME_PATTERN.test(name) || name.length > MAX_DATAVERSE_HEADER_NAME_LENGTH) {
            throw new Error(`Invalid Dataverse header name: ${name}`);
        }
        if (typeof value !== "string") {
            throw new Error(`Dataverse header ${name} must have a string value`);
        }
        if (hasControlCharacters(value) || value.length > MAX_DATAVERSE_HEADER_VALUE_LENGTH) {
            throw new Error(`Invalid Dataverse header value for ${name}`);
        }

        const key = name.toLowerCase();
        const existing = normalized.get(key);
        if (existing && existing.value !== value) {
            throw new Error(`Conflicting duplicate Dataverse header: ${name}`);
        }
        if (!existing) {
            normalized.set(key, { name, value });
        }
    }

    return Object.freeze(Object.fromEntries(Array.from(normalized.values(), ({ name, value }) => [name, value])));
}

export function mergeDataverseHeaders(...sources: Array<Record<string, string> | undefined>): DataverseAdditionalHeaders {
    const merged: Record<string, string> = {};
    const names = new Map<string, string>();
    for (const source of sources) {
        for (const [name, value] of Object.entries(validateAndSnapshotHeaders(source))) {
            const key = name.toLowerCase();
            const existingName = names.get(key);
            if (existingName && merged[existingName] !== value) throw new Error(`Conflicting duplicate Dataverse header: ${name}`);
            if (!existingName) {
                names.set(key, name);
                merged[name] = value;
            }
        }
    }
    return Object.freeze(merged);
}

export function overrideDataverseHeaders(base: Record<string, string>, overrides?: Record<string, string>): DataverseAdditionalHeaders {
    const result = { ...validateAndSnapshotHeaders(base) };
    const names = new Map(Object.keys(result).map((name) => [name.toLowerCase(), name]));
    for (const [name, value] of Object.entries(validateAndSnapshotHeaders(overrides))) {
        const existingName = names.get(name.toLowerCase());
        if (existingName) delete result[existingName];
        result[name] = value;
        names.set(name.toLowerCase(), name);
    }
    return Object.freeze(result);
}

export function validateDataverseRelativeUrl(url: string): string {
    if (typeof url !== "string" || !url.trim()) {
        throw new Error("Dataverse batch request URL cannot be empty");
    }
    const trimmed = url.trim();
    if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) || trimmed.startsWith("//") || trimmed.includes("\\") || hasControlCharacters(trimmed)) {
        throw new Error("Dataverse batch request URL must be relative");
    }

    const [path, query = ""] = trimmed.replace(/^\//, "").split("?", 2);
    let decodedPath = path;
    for (let pass = 0; pass < 3; pass += 1) {
        try {
            const next = decodeURIComponent(decodedPath);
            if (next === decodedPath) break;
            decodedPath = next;
        } catch {
            throw new Error("Dataverse batch request URL contains invalid encoding");
        }
    }
    if (decodedPath.includes("\\") || hasControlCharacters(decodedPath)) {
        throw new Error("Dataverse batch request URL must be relative");
    }
    const decodedSegments = decodedPath.split("/");
    if (decodedSegments.some((segment) => segment === ".." || segment === "." || hasControlCharacters(segment))) {
        throw new Error("Dataverse batch request URL cannot contain traversal or control characters");
    }
    if (decodedSegments.some((segment) => segment.toLowerCase() === "$batch")) {
        throw new Error("Nested Dataverse batch requests are not allowed");
    }

    const apiPrefix = `api/data/${DATAVERSE_API_VERSION}/`;
    const normalizedPath = path.toLowerCase().startsWith("api/data/") ? path : `${apiPrefix}${path}`;
    if (!normalizedPath.toLowerCase().startsWith(apiPrefix.toLowerCase())) {
        throw new Error(`Dataverse batch request URL must target ${apiPrefix}`);
    }
    return `/${normalizedPath}${query ? `?${query}` : ""}`;
}

export function validateBatchRequests(requests: DataverseBatchRequest[], transaction: boolean): ReadonlyArray<Readonly<DataverseBatchRequest>> {
    if (!Array.isArray(requests) || requests.length === 0) {
        throw new Error("Dataverse batch requests cannot be empty");
    }
    if (requests.length > MAX_DATAVERSE_BATCH_OPERATIONS) {
        throw new Error(`Dataverse batch requests cannot exceed ${MAX_DATAVERSE_BATCH_OPERATIONS} operations`);
    }

    const contentIds = new Set<string>();
    let totalHeaderCount = 0;
    let estimatedRequestBytes = 0;
    return Object.freeze(
        requests.map((request, index) => {
            if (!request || typeof request !== "object") {
                throw new Error(`Invalid Dataverse batch request at index ${index}`);
            }
            const method = String(request.method).toUpperCase();
            if (!(["GET", "POST", "PATCH", "PUT", "DELETE"] as string[]).includes(method)) {
                throw new Error(`Unsupported Dataverse batch method: ${request.method}`);
            }
            if (transaction && method === "GET") {
                throw new Error("Dataverse transactions cannot contain read operations");
            }
            const contentId = request.contentId ?? String(index + 1);
            if (!CONTENT_ID_PATTERN.test(contentId) || contentIds.has(contentId)) {
                throw new Error(`Invalid or duplicate Dataverse content ID: ${contentId}`);
            }
            contentIds.add(contentId);

            const headers = validateAndSnapshotHeaders(request.headers);
            totalHeaderCount += Object.keys(headers).length;
            if (totalHeaderCount > MAX_DATAVERSE_BATCH_TOTAL_HEADERS) {
                throw new Error(`Dataverse batch headers cannot exceed ${MAX_DATAVERSE_BATCH_TOTAL_HEADERS} total entries`);
            }
            let serializedBody = "";
            if (request.body !== undefined) {
                try {
                    serializedBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
                } catch {
                    throw new Error(`Dataverse batch request body at index ${index} must be JSON serializable`);
                }
            }
            estimatedRequestBytes += Buffer.byteLength(`${method} ${request.url}${serializedBody}`, "utf8");
            for (const [name, value] of Object.entries(headers)) estimatedRequestBytes += Buffer.byteLength(name, "utf8") + Buffer.byteLength(value, "utf8") + 4;
            if (estimatedRequestBytes > MAX_DATAVERSE_BATCH_REQUEST_BYTES) {
                throw new Error("Dataverse batch request exceeds the maximum size");
            }

            return Object.freeze({
                ...request,
                method: method as DataverseBatchRequest["method"],
                url: validateDataverseRelativeUrl(request.url),
                contentId,
                headers,
            });
        }),
    );
}

function encodeHttpPart(request: Readonly<DataverseBatchRequest>): string {
    const headers = Object.entries(request.headers ?? {})
        .map(([name, value]) => `${name}: ${value}`)
        .join("\r\n");
    const serializedBody = request.body === undefined ? "" : typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    const contentHeaders =
        serializedBody && !Object.keys(request.headers ?? {}).some((name) => name.toLowerCase() === "content-type") ? `${headers ? `${headers}\r\n` : ""}Content-Type: application/json` : headers;
    return [
        `Content-Type: application/http`,
        `Content-Transfer-Encoding: binary`,
        `Content-ID: ${request.contentId}`,
        "",
        `${request.method} ${request.url} HTTP/1.1`,
        contentHeaders,
        "",
        serializedBody,
    ].join("\r\n");
}

export function encodeDataverseBatch(requests: DataverseBatchRequest[], transaction = false): EncodedDataverseBatch {
    const validated = validateBatchRequests(requests, transaction);
    const boundary = `batch_${randomUUID()}`;
    let body: string;

    if (transaction) {
        const changesetBoundary = `changeset_${randomUUID()}`;
        const changeset = validated.map((request) => `--${changesetBoundary}\r\n${encodeHttpPart(request)}\r\n`).join("") + `--${changesetBoundary}--\r\n`;
        body = `--${boundary}\r\nContent-Type: multipart/mixed; boundary=${changesetBoundary}\r\n\r\n${changeset}--${boundary}--\r\n`;
    } else {
        body = validated.map((request) => `--${boundary}\r\n${encodeHttpPart(request)}\r\n`).join("") + `--${boundary}--\r\n`;
    }

    if (Buffer.byteLength(body, "utf8") > MAX_DATAVERSE_BATCH_REQUEST_BYTES) {
        throw new Error("Dataverse batch request exceeds the maximum size");
    }
    return { body, contentType: `multipart/mixed; boundary=${boundary}`, boundary };
}

function parseHeaders(lines: string[]): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const line of lines) {
        const separator = line.indexOf(":");
        if (separator <= 0) throw new Error("Malformed Dataverse batch response header");
        const name = line.slice(0, separator).trim().toLowerCase();
        if (!HEADER_NAME_PATTERN.test(name)) throw new Error("Malformed Dataverse batch response header name");
        const value = line.slice(separator + 1).trim();
        headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
    }
    return headers;
}

function parseMultipartParts(body: string, boundary: string): string[] {
    const delimiter = `--${boundary}`;
    if (!body.startsWith(delimiter)) throw new Error("Malformed Dataverse batch response: missing opening boundary");
    const parts: string[] = [];
    let cursor = 0;
    while (cursor < body.length) {
        if (!body.startsWith(delimiter, cursor)) throw new Error("Malformed Dataverse batch response boundary");
        cursor += delimiter.length;
        if (body.startsWith("--", cursor)) return parts;
        if (!body.startsWith("\r\n", cursor)) throw new Error("Malformed Dataverse batch response boundary delimiter");
        const partStart = cursor + 2;
        const nextBoundary = body.indexOf(`\r\n${delimiter}`, partStart);
        if (nextBoundary < 0) throw new Error("Malformed Dataverse batch response: missing closing boundary");
        parts.push(body.slice(partStart, nextBoundary));
        cursor = nextBoundary + 2;
    }
    throw new Error("Malformed Dataverse batch response: missing closing boundary");
}

function parsePart(part: string): DataverseBatchResult[] {
    const separator = part.indexOf("\r\n\r\n");
    if (separator < 0) throw new Error("Malformed Dataverse batch response part");
    const mimeHeaders = parseHeaders(part.slice(0, separator).split("\r\n"));
    const payload = part.slice(separator + 4);
    const nestedBoundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(mimeHeaders["content-type"] ?? "");
    if (nestedBoundary) {
        return parseMultipartParts(payload, nestedBoundary[1] || nestedBoundary[2]).flatMap(parsePart);
    }

    const statusIndex = payload.search(/HTTP\/1\.[01]\s+\d{3}/i);
    if (statusIndex < 0) throw new Error("Malformed Dataverse batch HTTP response");
    const httpPayload = payload.slice(statusIndex);
    const httpSeparator = httpPayload.indexOf("\r\n\r\n");
    if (httpSeparator < 0) throw new Error("Malformed Dataverse batch HTTP response headers");
    const headerLines = httpPayload.slice(0, httpSeparator).split("\r\n");
    const statusMatch = /^HTTP\/1\.[01]\s+(\d{3})(?:\s+(.*))?$/.exec(headerLines.shift() ?? "");
    if (!statusMatch) throw new Error("Malformed Dataverse batch HTTP status line");
    const headers = parseHeaders(headerLines);
    const rawBody = httpPayload.slice(httpSeparator + 4).replace(/\r\n$/, "");
    let parsedBody: unknown = undefined;
    if (rawBody) {
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            parsedBody = rawBody;
        }
    }
    return [{ contentId: mimeHeaders["content-id"], status: Number(statusMatch[1]), statusText: statusMatch[2], headers, ...(parsedBody === undefined ? {} : { body: parsedBody }) }];
}

export function parseDataverseBatchResponse(body: string, contentType: string, expectedContentIds?: readonly string[], allowPartialFailure = false): DataverseBatchResult[] {
    if (Buffer.byteLength(body, "utf8") > MAX_DATAVERSE_BATCH_RESPONSE_BYTES) {
        throw new Error("Dataverse batch response exceeds the maximum size");
    }
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
    if (!boundaryMatch) throw new Error("Malformed Dataverse batch response: missing boundary");
    const results = parseMultipartParts(body, boundaryMatch[1] || boundaryMatch[2]).flatMap(parsePart);
    if (expectedContentIds) {
        const expected = new Set(expectedContentIds);
        const seen = new Set<string>();
        for (const result of results) {
            if (!result.contentId || !expected.has(result.contentId) || seen.has(result.contentId)) {
                throw new Error("Malformed Dataverse batch response: invalid content ID correlation");
            }
            seen.add(result.contentId);
        }
        if (seen.size !== expected.size) {
            if (allowPartialFailure && results.some((result) => result.status >= 400)) {
                const byContentId = new Map(results.map((result) => [result.contentId, result]));
                return expectedContentIds.flatMap((contentId) => {
                    const result = byContentId.get(contentId);
                    return result ? [result] : [];
                });
            }
            throw new Error("Malformed Dataverse batch response: missing operation results");
        }
        const byContentId = new Map(results.map((result) => [result.contentId, result]));
        return expectedContentIds.map((contentId) => byContentId.get(contentId) as DataverseBatchResult);
    }
    return results;
}
