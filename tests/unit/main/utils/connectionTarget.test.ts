/// <reference types="jest" />

import { resolveToolConnectionForRequest } from "../../../../src/main/utils/connectionTarget";

describe("resolveToolConnectionForRequest", () => {
    it.each([
        [undefined, "primary-id"],
        ["primary", "primary-id"],
        ["secondary", "secondary-id"],
        [3, "fourth-id"],
    ] as const)("routes target %s to the matching connection", (target, expectedConnectionId) => {
        const manager = {
            getConnectionIdByWebContents: jest.fn((webContentsId: number, requestedTarget?: string | number) => {
                expect(webContentsId).toBe(42);
                expect(requestedTarget).toBe(target);
                return expectedConnectionId;
            }),
        };

        expect(resolveToolConnectionForRequest(manager, 42, target)).toBe(expectedConnectionId);
    });

    it.each([
        [undefined, "No connection found"],
        ["secondary", "No secondary connection found"],
        [3, "No connection slot 4 found"],
    ] as const)("reports a useful error for an unassigned target %s", (target, message) => {
        const manager = { getConnectionIdByWebContents: jest.fn(() => null) };

        expect(() => resolveToolConnectionForRequest(manager, 42, target)).toThrow(message);
    });

    it("reports missing connection when no tool window manager is available", () => {
        expect(() => resolveToolConnectionForRequest(undefined, 42)).toThrow("No connection found");
    });
});
