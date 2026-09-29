/// <reference types="jest" />

import { DataverseManager } from "../../../../src/main/managers/dataverseManager";
import type { AuthManager } from "../../../../src/main/managers/authManager";
import type { ConnectionsManager } from "../../../../src/main/managers/connectionsManager";

describe("Dataverse impersonation user search", () => {
    const manager = new DataverseManager({} as ConnectionsManager, {} as AuthManager);
    const internal = manager as unknown as {
        getConnectionWithToken: jest.Mock;
        makeHttpRequest: jest.Mock;
    };

    beforeEach(() => {
        internal.getConnectionWithToken = jest.fn().mockResolvedValue({ connection: { url: "https://example.crm.dynamics.com" }, accessToken: "test-token" });
        internal.makeHttpRequest = jest.fn().mockResolvedValue({ data: { value: [], "@odata.nextLink": null } });
    });

    it("requests only one page and escapes search terms in the server-side name/email filter", async () => {
        await manager.searchSystemUsers("connection-1", " O'Brien ");
        const [requestUrl, method, token, body, prefer] = internal.makeHttpRequest.mock.calls[0];
        const url = new URL(requestUrl);
        expect(url.pathname).toMatch(/\/systemusers$/);
        expect(url.searchParams.get("$filter")).toBe("isdisabled eq false and azureactivedirectoryobjectid ne null and (contains(fullname,'O''Brien') or contains(internalemailaddress,'O''Brien'))");
        expect(url.searchParams.get("$orderby")).toBe("fullname,systemuserid");
        expect(prefer).toEqual(["odata.maxpagesize=50"]);
        expect([method, token, body]).toEqual(["GET", "test-token", undefined]);
    });

    it("follows a continuation on the same query and rejects different hosts or filters", async () => {
        await manager.searchSystemUsers("connection-1", "Alex");
        const first = new URL(internal.makeHttpRequest.mock.calls[0][0]);
        first.searchParams.set("$skiptoken", "paging-cookie");
        internal.makeHttpRequest.mockResolvedValue({ data: { value: [{ systemuserid: "id", fullname: "Alex" }], "@odata.nextLink": first.toString() } });
        await expect(manager.searchSystemUsers("connection-1", "Alex", first.toString())).resolves.toMatchObject({ users: [{ systemuserid: "id" }], nextLink: first.toString() });

        first.hostname = "other.example.com";
        await expect(manager.searchSystemUsers("connection-1", "Alex", first.toString())).rejects.toThrow("Invalid user search continuation");
        first.hostname = "example.crm.dynamics.com";
        await expect(manager.searchSystemUsers("connection-1", "Different", first.toString())).rejects.toThrow("Invalid user search continuation");
        expect(internal.makeHttpRequest).toHaveBeenCalledTimes(2);
    });

    it("rejects invalid search input", async () => {
        await expect(manager.searchSystemUsers("connection-1", "a".repeat(201))).rejects.toThrow("Invalid user search request");
        expect(internal.makeHttpRequest).not.toHaveBeenCalled();
    });
});
