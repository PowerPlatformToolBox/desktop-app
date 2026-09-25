import { encodeDataverseBatch, parseDataverseBatchResponse, validateAndSnapshotHeaders, validateBatchRequests, validateDataverseRelativeUrl } from "../../../../src/main/utilities/dataverseBatch";

describe("Dataverse batch utilities", () => {
    it("snapshots valid headers and rejects conflicting case-insensitive duplicates", () => {
        const headers = validateAndSnapshotHeaders({ Prefer: "return=representation" });
        expect(headers).toEqual({ Prefer: "return=representation" });
        expect(Object.isFrozen(headers)).toBe(true);
        expect(() => validateAndSnapshotHeaders({ Prefer: "a", prefer: "b" })).toThrow("Conflicting duplicate");
    });

    it("rejects invalid names, non-string values, and CRLF injection", () => {
        expect(() => validateAndSnapshotHeaders({ "Bad Header": "value" })).toThrow("Invalid Dataverse header name");
        expect(() => validateAndSnapshotHeaders({ Header: 1 } as unknown as Record<string, string>)).toThrow("string value");
        expect(() => validateAndSnapshotHeaders({ Header: "safe\r\ninjected: true" })).toThrow("Invalid Dataverse header value");
    });

    it("normalizes supported relative URLs under the configured API version", () => {
        expect(validateDataverseRelativeUrl("accounts?$select=name")).toBe("/api/data/v9.2/accounts?$select=name");
        expect(validateDataverseRelativeUrl("/api/data/v9.2/contacts(1)")).toBe("/api/data/v9.2/contacts(1)");
    });

    it.each(["https://evil.example/accounts", "//evil.example/accounts", "../accounts", "%2e%2e/accounts", "%252e%252e%252faccounts", "accounts%2f$batch", "accounts%252f$batch", "accounts/$batch"])(
        "rejects unsafe URL %s",
        (url) => {
            expect(() => validateDataverseRelativeUrl(url)).toThrow();
        },
    );

    it("rejects reads and duplicate content IDs in transactions", () => {
        expect(() => validateBatchRequests([{ method: "GET", url: "accounts" }], true)).toThrow("cannot contain read operations");
        expect(() =>
            validateBatchRequests(
                [
                    { method: "POST", url: "accounts", contentId: "1" },
                    { method: "DELETE", url: "accounts(1)", contentId: "1" },
                ],
                false,
            ),
        ).toThrow("duplicate Dataverse content ID");
    });

    it("encodes independent batch operations using CRLF and application/http", () => {
        const encoded = encodeDataverseBatch([
            { method: "GET", url: "accounts?$top=1" },
            { method: "POST", url: "contacts", body: { firstname: "Ada" } },
        ]);
        expect(encoded.contentType).toContain(`boundary=${encoded.boundary}`);
        expect(encoded.body).toContain("GET /api/data/v9.2/accounts?$top=1 HTTP/1.1\r\n");
        expect(encoded.body).toContain('Content-Type: application/json; type=entry\r\n\r\n{"firstname":"Ada"}');
        expect(encoded.body.endsWith(`--${encoded.boundary}--\r\n`)).toBe(true);
    });

    it("parses ordered JSON, text, and empty responses with all headers", () => {
        const boundary = "batch_response";
        const body = [
            `--${boundary}`,
            "Content-Type: application/http",
            "Content-ID: 1",
            "",
            "HTTP/1.1 200 OK",
            "Content-Type: application/json",
            "x-ms-ratelimit-burst-remaining-xrm-requests: 4999",
            "",
            '{"value":1}',
            `--${boundary}`,
            "Content-Type: application/http",
            "Content-ID: 2",
            "",
            "HTTP/1.1 400 Bad Request",
            "Content-Type: text/plain",
            "",
            "invalid",
            `--${boundary}`,
            "Content-Type: application/http",
            "Content-ID: 3",
            "",
            "HTTP/1.1 204 No Content",
            "",
            "",
            `--${boundary}--`,
            "",
        ].join("\r\n");

        expect(parseDataverseBatchResponse(body, `multipart/mixed; boundary=${boundary}`)).toEqual([
            {
                contentId: "1",
                status: 200,
                statusText: "OK",
                headers: { "content-type": "application/json", "x-ms-ratelimit-burst-remaining-xrm-requests": "4999" },
                body: { value: 1 },
            },
            { contentId: "2", status: 400, statusText: "Bad Request", headers: { "content-type": "text/plain" }, body: "invalid" },
            { contentId: "3", status: 204, statusText: "No Content", headers: {} },
        ]);
    });

    it("rejects truncated MIME responses", () => {
        expect(() => parseDataverseBatchResponse("--batch\r\nContent-Type: application/http", "multipart/mixed; boundary=batch")).toThrow("missing closing boundary");
    });

    it("correlates reordered responses using content IDs", () => {
        const boundary = "batch_response";
        const body = [
            `--${boundary}`,
            "Content-Type: application/http",
            "Content-ID: 2",
            "",
            "HTTP/1.1 204 No Content",
            "",
            "",
            `--${boundary}`,
            "Content-Type: application/http",
            "Content-ID: 1",
            "",
            "HTTP/1.1 200 OK",
            "Content-Type: text/plain",
            "",
            "value containing --batch_response without a delimiter line",
            `--${boundary}--`,
            "",
        ].join("\r\n");

        const results = parseDataverseBatchResponse(body, `multipart/mixed; boundary=${boundary}`, ["1", "2"]);
        expect(results.map((result) => result.contentId)).toEqual(["1", "2"]);
        expect(results[0].body).toContain("--batch_response");
    });

    it("correlates ordered responses when Dataverse omits Content-ID headers", () => {
        const boundary = "batch_response";
        const body = [
            `--${boundary}`,
            "Content-Type: application/http",
            "",
            "HTTP/1.1 200 OK",
            "Content-Type: application/json",
            "",
            '{"value":[{"name":"Account"}]}',
            `--${boundary}`,
            "Content-Type: application/http",
            "",
            "HTTP/1.1 200 OK",
            "Content-Type: application/json",
            "",
            '{"value":[{"fullname":"Contact"}]}',
            `--${boundary}--`,
            "",
        ].join("\r\n");

        expect(parseDataverseBatchResponse(body, `multipart/mixed; boundary=${boundary}`, ["1", "2"]).map((result) => result.contentId)).toEqual(["1", "2"]);
    });

    it("rejects duplicate or missing response content IDs", () => {
        const boundary = "batch_response";
        const body = [`--${boundary}`, "Content-Type: application/http", "Content-ID: 1", "", "HTTP/1.1 204 No Content", "", "", `--${boundary}--`, ""].join("\r\n");

        expect(() => parseDataverseBatchResponse(body, `multipart/mixed; boundary=${boundary}`, ["1", "2"])).toThrow("missing operation results");
        expect(() => parseDataverseBatchResponse(body, `multipart/mixed; boundary=${boundary}`, ["2"])).toThrow("invalid content ID correlation");
    });

    it("returns the correlated failure when an atomic changeset stops early", () => {
        const boundary = "changeset_response";
        const body = [
            `--${boundary}`,
            "Content-Type: application/http",
            "Content-ID: 2",
            "",
            "HTTP/1.1 400 Bad Request",
            "Content-Type: application/json",
            "",
            '{"error":{"message":"Validation failed"}}',
            `--${boundary}--`,
            "",
        ].join("\r\n");

        expect(parseDataverseBatchResponse(body, `multipart/mixed; boundary=${boundary}`, ["1", "2", "3"], true)).toEqual([
            {
                contentId: "2",
                status: 400,
                statusText: "Bad Request",
                headers: { "content-type": "application/json" },
                body: { error: { message: "Validation failed" } },
            },
        ]);
        expect(() => parseDataverseBatchResponse(body, `multipart/mixed; boundary=${boundary}`, ["1", "2", "3"])).toThrow("missing operation results");
    });
});
