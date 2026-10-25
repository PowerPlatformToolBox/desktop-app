import { categorizeTargetHost, classifyProxyConnectStatus, classifyProxyError, describeProxyFailure } from "../../../../src/main/utils/proxyFailure";

describe("proxy failure classification", () => {
    it("classifies undici tunnel rejections wrapped by fetch", () => {
        const cause = Object.assign(new Error("Proxy response (407) !== 200 when HTTP Tunneling"), { code: "UND_ERR_ABORTED" });
        const error = new TypeError("fetch failed", { cause });

        expect(classifyProxyError(error)).toEqual({ kind: "proxy-auth-required", statusCode: 407 });
        expect(classifyProxyError(new Error("Proxy response (403) !== 200 when HTTP Tunneling"))).toEqual({ kind: "proxy-rejected", statusCode: 403 });
    });

    it.each([
        ["ECONNREFUSED", "proxy-unreachable"],
        ["ENOTFOUND", "proxy-unreachable"],
        ["ETIMEDOUT", "proxy-timeout"],
        ["UND_ERR_CONNECT_TIMEOUT", "proxy-timeout"],
        ["ECONNRESET", "connection-reset"],
        ["SELF_SIGNED_CERT_IN_CHAIN", "tls-untrusted"],
        ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "tls-untrusted"],
    ])("classifies %s as %s", (code, kind) => {
        expect(classifyProxyError(Object.assign(new Error(`failure ${code}`), { code }))).toEqual({ kind, code });
    });

    it("ignores errors that are not network or proxy failures", () => {
        expect(classifyProxyError(new Error("Dataverse API request failed with status 400"))).toBeUndefined();
        expect(classifyProxyError(undefined)).toBeUndefined();
    });

    it("classifies CONNECT status codes", () => {
        expect(classifyProxyConnectStatus(200)).toBeUndefined();
        expect(classifyProxyConnectStatus(407)).toEqual({ kind: "proxy-auth-required", statusCode: 407 });
        expect(classifyProxyConnectStatus(502)).toEqual({ kind: "proxy-rejected", statusCode: 502 });
    });

    it("describes failures with actionable guidance", () => {
        const notice = describeProxyFailure({ kind: "proxy-auth-required", statusCode: 407 }, "contoso.crm.dynamics.com", "http://proxy.corp:8080");
        expect(notice.title).toBe("Proxy authentication required");
        expect(notice.message).toContain("HTTP 407");
        expect(notice.message).toContain("contoso.crm.dynamics.com");
    });

    it("categorizes hosts without exposing customer-specific names", () => {
        expect(categorizeTargetHost("contoso.crm4.dynamics.com")).toBe("dataverse");
        expect(categorizeTargetHost("login.microsoftonline.com")).toBe("microsoft-login");
        expect(categorizeTargetHost("abc.supabase.co")).toBe("supabase");
        expect(categorizeTargetHost("pptbtools.blob.core.windows.net")).toBe("azure-blob");
        expect(categorizeTargetHost("marketplace.contoso.internal")).toBe("other");
    });
});
