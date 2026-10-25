/// <reference types="jest" />

import { DataverseManager } from "../../../../src/main/managers/dataverseManager";
import type { AuthManager } from "../../../../src/main/managers/authManager";
import type { ConnectionsManager } from "../../../../src/main/managers/connectionsManager";

describe("Dataverse batch response headers", () => {
    it("includes selected outer headers without mixing them into per-operation headers", async () => {
        const manager = new DataverseManager({} as ConnectionsManager, {} as AuthManager);
        const internal = manager as unknown as {
            getConnectionWithToken: jest.Mock;
            makeHttpRequest: jest.Mock;
        };
        internal.getConnectionWithToken = jest.fn().mockResolvedValue({ connection: { url: "https://example.crm.dynamics.com" }, accessToken: "test-token" });
        internal.makeHttpRequest = jest.fn().mockResolvedValue({
            rawBody: [
                "--batch_response",
                "Content-Type: application/http",
                "Content-ID: 1",
                "",
                "HTTP/1.1 200 OK",
                "Content-Type: application/json",
                "x-ms-ratelimit-burst-remaining-xrm-requests: 100",
                "",
                '{"value":1}',
                "--batch_response--",
                "",
            ].join("\r\n"),
            headers: {
                "content-type": "multipart/mixed; boundary=batch_response",
                "content-length": "321",
                "x-ms-dop-hint": "4",
                "x-ms-ratelimit-burst-remaining-xrm-requests": "4999",
            },
        });

        await expect(manager.executeBatch("connection-1", [{ method: "GET", url: "accounts" }])).resolves.toEqual([
            {
                contentId: "1",
                status: 200,
                statusText: "OK",
                headers: { "content-type": "application/json", "x-ms-ratelimit-burst-remaining-xrm-requests": "100" },
                batchHeaders: {
                    "x-ms-dop-hint": "4",
                    "x-ms-ratelimit-burst-remaining-xrm-requests": "4999",
                },
                body: { value: 1 },
            },
        ]);
    });

    it("returns a failed operation when a changeset stops early in a mixed batch", async () => {
        const manager = new DataverseManager({} as ConnectionsManager, {} as AuthManager);
        const internal = manager as unknown as {
            getConnectionWithToken: jest.Mock;
            makeHttpRequest: jest.Mock;
        };
        internal.getConnectionWithToken = jest.fn().mockResolvedValue({ connection: { url: "https://example.crm.dynamics.com" }, accessToken: "test-token" });
        internal.makeHttpRequest = jest.fn().mockResolvedValue({
            rawBody: [
                "--batch_response",
                "Content-Type: multipart/mixed; boundary=changeset_response",
                "",
                "--changeset_response",
                "Content-Type: application/http",
                "Content-ID: 2",
                "",
                "HTTP/1.1 400 Bad Request",
                "Content-Type: application/json",
                "",
                '{"error":{"message":"Validation failed"}}',
                "--changeset_response--",
                "--batch_response--",
                "",
            ].join("\r\n"),
            headers: { "content-type": "multipart/mixed; boundary=batch_response" },
        });

        await expect(
            manager.executeBatch("connection-1", [
                { method: "POST", url: "accounts", changesetId: "atomic-write" },
                { method: "PATCH", url: "accounts(1)", changesetId: "atomic-write" },
                { method: "GET", url: "accounts" },
            ]),
        ).resolves.toEqual([
            {
                contentId: "2",
                status: 400,
                statusText: "Bad Request",
                headers: { "content-type": "application/json" },
                body: { error: { message: "Validation failed" } },
            },
        ]);
    });
});
