export type ProxyFailureKind = "proxy-auth-required" | "proxy-rejected" | "proxy-unreachable" | "proxy-timeout" | "tls-untrusted" | "connection-reset";

export interface ProxyFailure {
    kind: ProxyFailureKind;
    code?: string;
    statusCode?: number;
}

export interface ProxyFailureNotice {
    kind: ProxyFailureKind;
    title: string;
    message: string;
    targetHost: string;
}

const TLS_UNTRUSTED_CODES = new Set([
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_GET_ISSUER_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "CERT_UNTRUSTED",
    "CERT_SIGNATURE_FAILURE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
]);
const UNREACHABLE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT"]);
const TIMEOUT_CODES = new Set(["ETIMEDOUT", "ESOCKETTIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"]);
const RESET_CODES = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CLOSED"]);

/**
 * Classify a non-200 response to an HTTP CONNECT tunnel request sent to the proxy.
 */
export function classifyProxyConnectStatus(statusCode: number): ProxyFailure | undefined {
    if (statusCode === 200) {
        return undefined;
    }

    return { kind: statusCode === 407 ? "proxy-auth-required" : "proxy-rejected", statusCode };
}

/**
 * Classify a network error raised while a request was routed through a proxy.
 * Walks the `cause` chain because undici's fetch wraps the real error in `TypeError("fetch failed")`.
 */
export function classifyProxyError(error: unknown): ProxyFailure | undefined {
    let current: unknown = error;
    for (let depth = 0; current && depth < 5; depth++) {
        const code = typeof (current as { code?: unknown }).code === "string" ? ((current as { code: string }).code as string) : undefined;
        const message = current instanceof Error ? current.message : typeof current === "string" ? current : "";

        // undici ProxyAgent: "Proxy response (407) !== 200 when HTTP Tunneling"
        const tunnelStatus = /Proxy response \((\d{3})\)/i.exec(message);
        if (tunnelStatus) {
            return classifyProxyConnectStatus(Number(tunnelStatus[1]));
        }

        if (code && TLS_UNTRUSTED_CODES.has(code)) return { kind: "tls-untrusted", code };
        if (code && UNREACHABLE_CODES.has(code)) return { kind: "proxy-unreachable", code };
        if (code && TIMEOUT_CODES.has(code)) return { kind: "proxy-timeout", code };
        if (code && RESET_CODES.has(code)) return { kind: "connection-reset", code };
        if (/socket hang up/i.test(message)) return { kind: "connection-reset", code: code || "ECONNRESET" };

        current = (current as { cause?: unknown }).cause;
    }

    return undefined;
}

/**
 * Build a user-facing explanation for a proxy failure.
 */
export function describeProxyFailure(failure: ProxyFailure, targetHost: string, proxyDescription: string): Omit<ProxyFailureNotice, "targetHost"> {
    const detail = failure.statusCode ? `HTTP ${failure.statusCode}` : failure.code || "unknown error";
    const settingsHint = "Review Settings → Network / Proxy.";

    switch (failure.kind) {
        case "proxy-auth-required":
            return {
                kind: failure.kind,
                title: "Proxy authentication required",
                message: `The proxy ${proxyDescription} requires credentials (${detail}) to reach ${targetHost}. Use Manual proxy mode with credentials in the URL (http://user:pass@host:port). ${settingsHint}`,
            };
        case "proxy-rejected":
            return {
                kind: failure.kind,
                title: "Proxy refused the connection",
                message: `The proxy ${proxyDescription} refused the connection to ${targetHost} (${detail}). The host may be blocked by your organization's proxy policy.`,
            };
        case "proxy-unreachable":
            return {
                kind: failure.kind,
                title: "Proxy server unreachable",
                message: `Could not reach the proxy ${proxyDescription} while connecting to ${targetHost} (${detail}). ${settingsHint}`,
            };
        case "proxy-timeout":
            return {
                kind: failure.kind,
                title: "Proxy connection timed out",
                message: `Timed out connecting to ${targetHost} through the proxy ${proxyDescription} (${detail}).`,
            };
        case "tls-untrusted":
            return {
                kind: failure.kind,
                title: "Untrusted certificate through proxy",
                message: `The certificate presented for ${targetHost} is not trusted (${detail}). Your proxy may inspect TLS traffic; set the Custom CA Bundle to your organization's root certificate. ${settingsHint}`,
            };
        case "connection-reset":
            return {
                kind: failure.kind,
                title: "Proxy connection interrupted",
                message: `The connection to ${targetHost} through the proxy ${proxyDescription} was closed unexpectedly (${detail}).`,
            };
    }
}

/**
 * Map a hostname to a coarse, non-identifying category for telemetry.
 * Never send raw hostnames to telemetry: private marketplace and Dataverse org hosts are customer-specific.
 */
export function categorizeTargetHost(hostname: string): string {
    const host = hostname.toLowerCase();
    if (/\.dynamics\.com$/.test(host)) return "dataverse";
    if (/(^|\.)login\.microsoftonline\.com$/.test(host) || /(^|\.)login\.windows\.net$/.test(host)) return "microsoft-login";
    if (/(^|\.)api\.powerplatform\.com$/.test(host) || /(^|\.)api\.bap\.microsoft\.com$/.test(host)) return "power-platform-api";
    if (/\.supabase\.co$/.test(host)) return "supabase";
    if (/\.blob\.core\.windows\.net$/.test(host)) return "azure-blob";
    if (/(^|\.)github\.com$/.test(host) || /\.githubusercontent\.com$/.test(host)) return "github";
    if (/(^|\.)npmjs\.(org|com)$/.test(host)) return "npm";
    if (/(^|\.)nuget\.org$/.test(host)) return "nuget";
    if (/(^|\.)powerplatformtoolbox\.com$/.test(host)) return "pptb";
    return "other";
}
