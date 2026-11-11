import { EventEmitter } from "events";
import * as https from "https";
import { PassThrough } from "stream";
import { DOTNET_NUGET_FLAT_CONTAINER, dotNetNuGetPackageUrl, downloadDotNetPackage } from "../../../../src/main/utils/dotnetPackage";

jest.mock("https", () => ({ get: jest.fn() }));

class FakeResponse extends PassThrough {
    complete = false;
    constructor(
        readonly statusCode: number,
        readonly headers: Record<string, string> = {},
    ) {
        super();
    }
    finish(body?: Buffer | string): void {
        if (body) this.write(body);
        this.complete = true;
        this.end();
    }
}

class FakeRequest extends EventEmitter {
    readonly destroy = jest.fn();
}

type Responder = (url: URL, options: https.RequestOptions) => FakeResponse;

function serve(...responders: Responder[]): { requests: { url: URL; options: https.RequestOptions; request: FakeRequest }[] } {
    const requests: { url: URL; options: https.RequestOptions; request: FakeRequest }[] = [];
    let index = 0;
    jest.mocked(https.get).mockImplementation(((url: URL, options: https.RequestOptions, callback: (response: FakeResponse) => void) => {
        const request = new FakeRequest();
        requests.push({ url, options, request });
        const responder = responders[index++];
        if (responder) setImmediate(() => callback(responder(url, options)));
        return request;
    }) as unknown as typeof https.get);
    return { requests };
}

const ok =
    (body: string, headers: Record<string, string> = {}): Responder =>
    () => {
        const response = new FakeResponse(200, headers);
        setImmediate(() => response.finish(body));
        return response;
    };

const status =
    (code: number, headers: Record<string, string> = {}): Responder =>
    () => {
        const response = new FakeResponse(code, headers);
        setImmediate(() => response.finish());
        return response;
    };

describe("dotnet package download", () => {
    afterEach(() => jest.mocked(https.get).mockReset());

    test("builds lowercase flat-container URLs from normalized identities", () => {
        expect(dotNetNuGetPackageUrl("MarkMpn.Sql4Cds.LanguageServer", "0.1.0")).toBe(`${DOTNET_NUGET_FLAT_CONTAINER}markmpn.sql4cds.languageserver/0.1.0/markmpn.sql4cds.languageserver.0.1.0.nupkg`);
        expect(dotNetNuGetPackageUrl("Contoso.Worker", "1.0.0-Beta.1")).toBe(`${DOTNET_NUGET_FLAT_CONTAINER}contoso.worker/1.0.0-beta.1/contoso.worker.1.0.0-beta.1.nupkg`);
    });

    test("downloads the body through the app proxy agent", async () => {
        const agent = { proxy: "sentinel" } as unknown as https.Agent;
        const { requests } = serve(ok("package bytes"));
        const agentForUrl = jest.fn(() => agent);
        await expect(downloadDotNetPackage("https://api.nuget.org/x.nupkg", { agentForUrl })).resolves.toEqual(Buffer.from("package bytes"));
        expect(agentForUrl).toHaveBeenCalledWith("https://api.nuget.org/x.nupkg");
        expect(requests[0].options.agent).toBe(agent);
    });

    test("follows HTTPS redirects", async () => {
        const { requests } = serve(status(302, { location: "https://cdn.example/x.nupkg" }), ok("redirected"));
        await expect(downloadDotNetPackage("https://api.nuget.org/x.nupkg")).resolves.toEqual(Buffer.from("redirected"));
        expect(requests.map((entry) => entry.url.href)).toEqual(["https://api.nuget.org/x.nupkg", "https://cdn.example/x.nupkg"]);
    });

    test.each([
        ["an HTTP URL", "http://api.nuget.org/x.nupkg", [] as Responder[], "DOWNLOAD_FAILED"],
        ["a redirect to HTTP", "https://api.nuget.org/x.nupkg", [status(301, { location: "http://cdn.example/x.nupkg" })], "DOWNLOAD_FAILED"],
        ["too many redirects", "https://api.nuget.org/x.nupkg", Array.from({ length: 6 }, () => status(302, { location: "https://api.nuget.org/x.nupkg" })), "DOWNLOAD_FAILED"],
        ["a missing package", "https://api.nuget.org/x.nupkg", [status(404)], "PACKAGE_NOT_FOUND"],
        ["a server error", "https://api.nuget.org/x.nupkg", [status(503)], "DOWNLOAD_FAILED"],
        ["an oversized declared length", "https://api.nuget.org/x.nupkg", [ok("12345", { "content-length": "999999" })], "PACKAGE_INVALID"],
        ["an oversized body", "https://api.nuget.org/x.nupkg", [ok("123456789")], "PACKAGE_INVALID"],
    ])("rejects %s", async (_label, url, responders, code) => {
        const { requests } = serve(...responders);
        await expect(downloadDotNetPackage(url, { maxBytes: 8 })).rejects.toMatchObject({ code });
        if (url.startsWith("http:")) expect(requests).toHaveLength(0);
    });

    test("a response that ends early is not accepted", async () => {
        serve(() => {
            const response = new FakeResponse(200);
            setImmediate(() => {
                response.write("partial");
                response.end();
            });
            return response;
        });
        await expect(downloadDotNetPackage("https://api.nuget.org/x.nupkg")).rejects.toMatchObject({ code: "DOWNLOAD_FAILED", details: "Package download ended early" });
    });

    test("network errors are reported as DOWNLOAD_FAILED", async () => {
        const { requests } = serve();
        const pending = downloadDotNetPackage("https://api.nuget.org/x.nupkg");
        requests[0].request.emit("error", new Error("ECONNRESET"));
        await expect(pending).rejects.toMatchObject({ code: "DOWNLOAD_FAILED", details: "ECONNRESET" });
    });

    test("aborting cancels the request", async () => {
        const { requests } = serve();
        const abort = new AbortController();
        const pending = downloadDotNetPackage("https://api.nuget.org/x.nupkg", { signal: abort.signal });
        abort.abort();
        await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
        expect(requests[0].request.destroy).toHaveBeenCalled();
    });

    test("times out a stalled download", async () => {
        const { requests } = serve();
        await expect(downloadDotNetPackage("https://api.nuget.org/x.nupkg", { timeoutMs: 10 })).rejects.toMatchObject({ code: "DOWNLOAD_FAILED", details: "Package download timed out" });
        expect(requests[0].request.destroy).toHaveBeenCalled();
    });
});
