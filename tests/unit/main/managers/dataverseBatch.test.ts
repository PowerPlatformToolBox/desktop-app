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
});
