/// <reference types="jest" />

import { PassThrough } from "stream";
import * as zlib from "zlib";

jest.mock("https", () => ({ ...jest.requireActual("https"), request: jest.fn() }));

import * as https from "https";
import { DataverseManager } from "../../../../src/main/managers/dataverseManager";
import type { AuthManager } from "../../../../src/main/managers/authManager";
import type { ConnectionsManager } from "../../../../src/main/managers/connectionsManager";
import { MAX_DATAVERSE_METADATA_RESPONSE_BYTES } from "../../../../src/main/constants";
import { MAX_DATAVERSE_BATCH_RESPONSE_BYTES } from "../../../../src/main/utils/dataverseBatch";

const requestMock = https.request as unknown as jest.Mock;

/** Respond to the next https.request with `body`, sent as a single gzip chunk. */
function respondWithGzip(body: string): void {
    const gz = zlib.gzipSync(Buffer.from(body, "utf-8"));
    requestMock.mockImplementation((_options: unknown, callback: (res: PassThrough) => void) => {
        const res = Object.assign(new PassThrough(), { statusCode: 200, headers: { "content-encoding": "gzip" } });
        callback(res);
        setImmediate(() => res.end(gz));
        return { on: jest.fn(), end: jest.fn() };
    });
}

function createManager(): DataverseManager {
    const manager = new DataverseManager({} as ConnectionsManager, {} as AuthManager);
    const internal = manager as unknown as { getConnectionWithToken: jest.Mock };
    internal.getConnectionWithToken = jest.fn().mockResolvedValue({ connection: { url: "https://example.crm.dynamics.com" }, accessToken: "test-token" });
    return manager;
}

describe("getCSDLDocument size limits", () => {
    afterEach(() => requestMock.mockReset());

    it("returns a $metadata document larger than the $batch response limit", async () => {
        // Dynamics 365 environments routinely produce CSDL well above 16 MB.
        const size = MAX_DATAVERSE_BATCH_RESPONSE_BYTES + 4 * 1024 * 1024;
        const csdl = `<edmx:Edmx Version="4.0">${"<x/>".repeat(Math.ceil(size / 4))}</edmx:Edmx>`;
        respondWithGzip(csdl);

        const result = await createManager().getCSDLDocument("connection-1");

        expect(result.length).toBe(csdl.length);
        expect(result.length).toBeGreaterThan(MAX_DATAVERSE_BATCH_RESPONSE_BYTES);
    });

    it("uses a metadata limit larger than the $batch limit", () => {
        expect(MAX_DATAVERSE_METADATA_RESPONSE_BYTES).toBeGreaterThan(MAX_DATAVERSE_BATCH_RESPONSE_BYTES);
    });
});
