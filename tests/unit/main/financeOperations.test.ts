import { EventEmitter } from "events";
import * as https from "https";
import { gzipSync } from "zlib";
import { readFileSync } from "fs";
import { join } from "path";
import { createFinanceOperationsAPI, financeOperationsRecordPath } from "../../../src/common/financeOperationsApi";
import type { FinanceOperationsMethod, FinanceOperationsOptions, FinanceOperationsResponse } from "../../../src/common/financeOperationsApi";
import { buildFinanceOperationsUrl, financeOperationsHttp, validateFinanceOperationsHeaders } from "../../../src/main/utilities/financeOperationsHttp";

jest.mock("https", () => ({ request: jest.fn() }));

const fixtureText = (name: string) => readFileSync(join(__dirname, "../../fixtures/financeOperations", name), "utf8");
const fixtureJson = (name: string) => JSON.parse(fixtureText(name));
async function fixtureRequest<T>(method: FinanceOperationsMethod, path: string, body?: unknown, options?: FinanceOperationsOptions): Promise<FinanceOperationsResponse<T>> {
    return await financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", path), method, "test-token", body, options?.headers) as FinanceOperationsResponse<T>;
}

describe("F&O OData boundaries and keys", () => {
    const root = "https://erp.operations.dynamics.com";
    it("preserves queries and same-environment next links", () => {
        expect(buildFinanceOperationsUrl(root, "CustomersV3?$top=5&cross-company=true").href).toBe(`${root}/data/CustomersV3?$top=5&cross-company=true`);
        expect(buildFinanceOperationsUrl(root, `${root}/data/CustomersV3?$skiptoken=abc`).search).toBe("?$skiptoken=abc");
        expect(buildFinanceOperationsUrl(root, "$metadata").pathname).toBe("/data/$metadata");
    });
    it.each(["https://other.example/data/Customers", "https://erp.operations.dynamics.com/api/data", "../secret", "%2e%2e/secret", "%252e%252e/secret", "//other.example/data", "https://user:secret@erp.operations.dynamics.com/data", "Customers#fragment", "Customers\\..\\secret", "http://erp.operations.dynamics.com/data"])("rejects unsafe path %s", (path) => {
        expect(() => buildFinanceOperationsUrl(root, path)).toThrow();
    });
    it.each(["Authorization", "Host", "Content-Length", "Cookie", "MSCRMCallerID"])("protects header %s", (name) => {
        expect(() => validateFinanceOperationsHeaders({ [name]: "value" })).toThrow();
    });
    it("escapes composite keys and preserves explicit Int64 values", () => {
        expect(financeOperationsRecordPath("CustomersV3", { dataAreaId: "usmf", CustomerAccount: "O'Brien/a?b" })).toBe("CustomersV3(dataAreaId='usmf',CustomerAccount='O''Brien%2Fa%3Fb')");
        expect(financeOperationsRecordPath("Rows", { RecId: { odataLiteral: "9223372036854775807" } })).toBe("Rows(RecId=9223372036854775807)");
        expect(() => financeOperationsRecordPath("Rows", { RecId: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
        expect(() => financeOperationsRecordPath("Rows", {})).toThrow();
    });
});

describe("F&O HTTP transport", () => {
    function respond(status: number, text: string | Buffer | { length: number }, headers: Record<string, string> = {}) {
        const request = new EventEmitter() as EventEmitter & { end: jest.Mock; destroy: jest.Mock };
        let activeResponse: EventEmitter | undefined;
        request.destroy = jest.fn((error) => { activeResponse?.emit("aborted"); request.emit("error", error); request.emit("close"); });
        (https.request as jest.Mock).mockImplementation((_url, _options, callback) => {
            request.end = jest.fn(() => {
                const response = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string>; destroy: jest.Mock };
                activeResponse = response;
                response.destroy = jest.fn(() => response.emit("aborted"));
                response.statusCode = status; response.headers = headers;
                callback(response);
                response.emit("data", typeof text === "string" ? Buffer.from(text) : text);
                response.emit("end"); request.emit("close");
            });
            return request;
        });
        return request;
    }
    afterEach(() => jest.clearAllMocks());
    it("reads sanitized live customer fields and uses the complete composite key", async () => {
        respond(200, fixtureText("customers-page.json"));
        const api = createFinanceOperationsAPI(fixtureRequest);
        const page = await api.queryData("CustomersV3?$top=1&cross-company=true");
        const customer = page.value[0];
        respond(200, JSON.stringify(customer));
        await expect(api.retrieve("CustomersV3", { dataAreaId: String(customer.dataAreaId), CustomerAccount: String(customer.CustomerAccount) })).resolves.toEqual(customer);
        expect((https.request as jest.Mock).mock.calls[1][0].pathname).toBe("/data/CustomersV3(dataAreaId='test',CustomerAccount='TEST_0001')");
    });
    it("invokes the supplied collection-bound action and parses its sanitized string result", async () => {
        const action = fixtureJson("action-metadata.json");
        const response = fixtureJson("installed-modules.json");
        respond(response.status, JSON.stringify(response.body), response.headers);
        const api = createFinanceOperationsAPI(fixtureRequest);
        await expect(api.request("POST", `SystemNotifications/${action.namespace}.${action.name}`, {})).resolves.toEqual(response);
        expect((https.request as jest.Mock).mock.calls[0][1].method).toBe("POST");
        expect(https.request).toHaveBeenCalledTimes(1);
    });
    it("surfaces live-derived validation and permission denials without server stack traces", async () => {
        respond(400, fixtureText("customer-account-validation.json"));
        const validation = financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "CustomersV3"), "POST", "test-token");
        await expect(validation).rejects.toThrow("does not match format TEST_####");
        await expect(validation).rejects.not.toThrow("[redacted server stack trace]");
        respond(403, fixtureText("permission-denied.json"));
        const denial = financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "CustomersV3"), "GET", "test-token");
        await expect(denial).rejects.toMatchObject({ status: 403, message: "F&O HTTP 403: An error has occurred. | User is not authorized to read view CustCustomerV3Entity.  Request denied." });
        await expect(denial).rejects.not.toThrow("[redacted server stack trace]");
    });
    it("preserves live-derived next links and follows each page only on explicit request", async () => {
        const api = createFinanceOperationsAPI(fixtureRequest);
        respond(200, fixtureText("customers-paged.json"));
        const first = await api.queryData("CustomersV3?cross-company=true");
        expect(https.request).toHaveBeenCalledTimes(1);
        respond(200, fixtureText("customers-next-page.json"));
        const next = await api.queryData(first["@odata.nextLink"]!);
        expect(next.value[0].CustomerAccount).not.toBe(first.value[0].CustomerAccount);
        expect(next["@odata.nextLink"]).toBe("https://erp.example/data/CustomersV3?cross-company=true&$select=dataAreaId%2CCustomerAccount&$skip=4&$top=2");
        expect(next.value).toHaveLength(2);
        expect(https.request).toHaveBeenCalledTimes(2);
        expect((https.request as jest.Mock).mock.calls[1][0].href).toBe(first["@odata.nextLink"]);
    });
    it("reads the reduced live service document and preserves the live CSDL excerpt", async () => {
        const api = createFinanceOperationsAPI(fixtureRequest);
        respond(200, fixtureText("service-document.json"));
        await expect(api.getServiceDocument()).resolves.toEqual(fixtureJson("service-document.json"));
        respond(200, fixtureText("metadata.xml"), { "content-type": "application/xml" });
        await expect(api.getMetadata()).resolves.toBe(fixtureText("metadata.xml"));
    });
    it("reads gzip JSON, XML metadata and empty 204 responses", async () => {
        const url = buildFinanceOperationsUrl("https://erp.example", "Rows");
        respond(200, gzipSync('{"value":[]}'), { "content-encoding": "gzip" });
        await expect(financeOperationsHttp(url, "GET", "token")).resolves.toMatchObject({ body: { value: [] } });
        respond(200, "<Edmx />");
        await expect(financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "$metadata"), "GET", "token")).resolves.toMatchObject({ body: "<Edmx />" });
        respond(204, "");
        await expect(financeOperationsHttp(url, "DELETE", "token")).resolves.toEqual({ status: 204, headers: {} });
    });
    it("accepts metadata larger than 20 MB, both plain and compressed", async () => {
        const xml = "<Edmx>" + " ".repeat(21 * 1024 * 1024) + "</Edmx>";
        const url = buildFinanceOperationsUrl("https://erp.example", "$metadata");
        for (const compressed of [false, true]) {
            respond(200, compressed ? gzipSync(xml) : xml, compressed ? { "content-encoding": "gzip" } : {});
            const response = await financeOperationsHttp(url, "GET", "token");
            expect(typeof response.body).toBe("string");
            expect((response.body as string).length).toBe(xml.length);
        }
    });
    it.each([
        ["Rows", 21, "F&O response exceeds the 20 MB size limit."],
        ["$metadata", 101, "F&O metadata exceeds the 100 MB size limit."],
    ])("retains the size-limit reason when cancelling %s aborts the response", async (path, sizeMb, message) => {
        // Only length is inspected before rejecting the oversized chunk.
        respond(200, { length: Number(sizeMb) * 1024 * 1024 });
        await expect(financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", String(path)), "GET", "token")).rejects.toThrow(String(message));
    });
    it("surfaces throttling metadata and redacts tokens", async () => {
        respond(429, '{"error":{"message":"secret-token throttled"}}', { "retry-after": "10", "x-ms-request-id": "trace" });
        await expect(financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "Rows"), "GET", "secret-token")).rejects.toMatchObject({ status: 429, requestId: "trace", retryAfter: "10", message: "F&O HTTP 429: [redacted] throttled" });
    });
    it("rejects redirects without following them", async () => {
        respond(302, "", { location: "https://other.example" });
        await expect(financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "Rows"), "GET", "token")).rejects.toMatchObject({ status: 302 });
        expect(https.request).toHaveBeenCalledTimes(1);
    });
    it("includes nested F&O validation messages without stack traces or tokens", async () => {
        respond(400, JSON.stringify({ error: { message: "An error has occurred.", innererror: {
            message: "Write failed for table CustTable.", stacktrace: "private-server-stack",
            internalexception: { message: "Customer group secret-token does not exist.", type: "PrivateServerType" },
        } } }));
        const result = financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "CustomersV3"), "POST", "secret-token");
        await expect(result).rejects.toMatchObject({ status: 400, message: "F&O HTTP 400: An error has occurred. | Write failed for table CustTable. | Customer group [redacted] does not exist." });
    });
    it("handles OData message objects and detail arrays, deduplicating messages", async () => {
        respond(400, JSON.stringify({ error: { message: { value: "Validation failed" },
            details: [{ message: "Name is required" }, { message: "Name is required" }, { message: null }],
        } }));
        await expect(financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "Rows"), "POST", "token")).rejects.toThrow("F&O HTTP 400: Validation failed | Name is required");
    });
    it("bounds validation messages and handles malformed error envelopes", async () => {
        respond(400, JSON.stringify({ error: { message: "x".repeat(4000) } }));
        const result = financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "Rows"), "POST", "token");
        await expect(result).rejects.toMatchObject({ message: "F&O HTTP 400: " + "x".repeat(2000) });
        respond(400, JSON.stringify({ error: "unknown" }));
        await expect(financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "Rows"), "POST", "token")).rejects.toThrow("F&O HTTP 400: Request failed");
    });
    it("terminates a stalled request at the total timeout", async () => {
        jest.useFakeTimers();
        try {
            const request = new EventEmitter() as EventEmitter & { end: jest.Mock; destroy: jest.Mock };
            request.end = jest.fn();
            request.destroy = jest.fn((error) => { request.emit("error", error); request.emit("close"); });
            (https.request as jest.Mock).mockReturnValue(request);
            const promise = financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "Rows"), "GET", "token", undefined, undefined, 1000);
            const result = expect(promise).rejects.toThrow("timed out");
            jest.advanceTimersByTime(1000);
            await result;
            expect(request.destroy).toHaveBeenCalledTimes(1);
        } finally { jest.useRealTimers(); }
    });
    it("retains the timeout reason when cancellation aborts an active response", async () => {
        jest.useFakeTimers();
        try {
            const request = new EventEmitter() as EventEmitter & { end: jest.Mock; destroy: jest.Mock };
            const response = new EventEmitter();
            request.end = jest.fn();
            request.destroy = jest.fn((error) => { response.emit("aborted"); request.emit("error", error); request.emit("close"); });
            (https.request as jest.Mock).mockImplementation((_url, _options, callback) => { callback(response); return request; });
            const result = expect(financeOperationsHttp(buildFinanceOperationsUrl("https://erp.example", "$metadata"), "GET", "token", undefined, undefined, 1000)).rejects.toThrow("timed out");
            jest.advanceTimersByTime(1000);
            await result;
        } finally { jest.useRealTimers(); }
    });
    it("forwards facade targets and exposes a single page", async () => {
        const request = jest.fn().mockResolvedValue({ status: 200, headers: {}, body: { value: [], "@odata.nextLink": "next" } });
        const api = createFinanceOperationsAPI(request);
        await expect(api.queryData("Rows?$top=1", { connectionTarget: 2 })).resolves.toEqual({ value: [], "@odata.nextLink": "next" });
        expect(request).toHaveBeenCalledWith("GET", "Rows?$top=1", undefined, { connectionTarget: 2 });
    });
});
