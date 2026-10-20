import * as http from "http";
import * as https from "https";
import type { AddressInfo } from "net";
import { ProxyManager } from "../../../../src/main/managers/proxyManager";
import type { SettingsManager } from "../../../../src/main/managers/settingsManager";
import type { ProxyFailureNotice } from "../../../../src/main/utils/proxyFailure";

function createSettings(manualProxyUrl: string): SettingsManager {
    return { getSetting: () => ({ mode: "manual", manualProxyUrl, noProxyList: [], caBundlePath: "" }) } as unknown as SettingsManager;
}

describe("ProxyManager failure reporting against a local proxy", () => {
    let proxy: http.Server;
    let proxyUrl: string;
    const connectTargets: string[] = [];

    beforeAll(async () => {
        proxy = http.createServer();
        proxy.on("connect", (req, socket) => {
            connectTargets.push(req.url || "");
            socket.end("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic\r\nContent-Length: 0\r\n\r\n");
        });
        await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
        proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => proxy.close(() => resolve()));
    });

    it("notifies once per host when the proxy rejects a Node https request with 407", async () => {
        const manager = new ProxyManager(createSettings(proxyUrl));
        const notices: ProxyFailureNotice[] = [];
        manager.setFailureNotifier((notice) => notices.push(notice));
        const url = "https://contoso.crm.dynamics.com/api/data/v9.2/WhoAmI";

        const request = () =>
            new Promise<number | undefined>((resolve, reject) => {
                https
                    .request(url, { agent: manager.getAgentForUrl(url) }, (res) => {
                        res.resume();
                        resolve(res.statusCode);
                    })
                    .on("error", reject)
                    .end();
            });

        await expect(request()).resolves.toBe(407);
        await expect(request()).resolves.toBe(407);

        expect(connectTargets).toContain("contoso.crm.dynamics.com:443");
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({ kind: "proxy-auth-required", targetHost: "contoso.crm.dynamics.com" });
    });

    it("rejects proxy-aware fetch with a readable proxy error and notifies", async () => {
        const manager = new ProxyManager(createSettings(proxyUrl));
        const notices: ProxyFailureNotice[] = [];
        manager.setFailureNotifier((notice) => notices.push(notice));

        await expect(manager.createProxyAwareFetch()("https://example.supabase.co/rest/v1/tools_catalog")).rejects.toThrow(/requires credentials \(HTTP 407\)/);
        expect(notices).toEqual([expect.objectContaining({ kind: "proxy-auth-required", targetHost: "example.supabase.co" })]);
    });

    it("reports an unreachable proxy", async () => {
        const closed = http.createServer();
        await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
        const closedPort = (closed.address() as AddressInfo).port;
        await new Promise<void>((resolve) => closed.close(() => resolve()));

        const manager = new ProxyManager(createSettings(`http://127.0.0.1:${closedPort}`));
        const notices: ProxyFailureNotice[] = [];
        manager.setFailureNotifier((notice) => notices.push(notice));
        const url = "https://login.microsoftonline.com/common/discovery/instance";

        await expect(
            new Promise((resolve, reject) => {
                https
                    .request(url, { agent: manager.getAgentForUrl(url) }, resolve)
                    .on("error", reject)
                    .end();
            }),
        ).rejects.toMatchObject({ code: "ECONNREFUSED" });
        expect(notices).toEqual([expect.objectContaining({ kind: "proxy-unreachable", targetHost: "login.microsoftonline.com" })]);
    });

    it("fails Test Connection when the proxy rejects the tunnel instead of reporting success", async () => {
        const manager = new ProxyManager(createSettings(proxyUrl));
        const notifier = jest.fn();
        manager.setFailureNotifier(notifier);

        const result = await manager.testConnection({ mode: "manual", manualProxyUrl: proxyUrl, noProxyList: [], caBundlePath: "" });

        expect(result.success).toBe(false);
        expect(result.message).toContain("requires credentials");
        expect(notifier).not.toHaveBeenCalled();
    });
});
