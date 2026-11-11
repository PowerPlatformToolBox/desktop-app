/// <reference types="jest" />

import { getMcpServerStatusPresentation } from "../../../src/renderer/modules/mcpServerStatus";

describe("MCP server status presentation", () => {
    it.each([
        ["starting", "Checking status", "MCP Server: Checking status"],
        ["running", "Running", "MCP Server: Running"],
        ["stopped", "Stopped", "MCP Server: Stopped"],
        ["error", "Error", "MCP Server: Error"],
    ] as const)("presents the %s state accessibly", (status, label, title) => {
        expect(getMcpServerStatusPresentation(status)).toEqual({ label, title });
    });

    it("includes an error message in the MCP button tooltip", () => {
        expect(getMcpServerStatusPresentation("error", "Address already in use").title).toBe("MCP Server: Error — Address already in use");
    });
});
