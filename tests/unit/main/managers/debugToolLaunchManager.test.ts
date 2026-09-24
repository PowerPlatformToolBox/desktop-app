/// <reference types="jest" />

import type { DebugToolLaunchRequest } from "../../../../src/common/types";
import type { LaunchArgs } from "../../../../src/main/launchArgs";
import { DebugToolLaunchManager } from "../../../../src/main/managers/debugToolLaunchManager";

function args(overrides: Partial<LaunchArgs> = {}): LaunchArgs {
    return {
        debugToolPath: "/tools/my-tool",
        debugToolConnection: null,
        openDevTools: false,
        ...overrides,
    };
}

describe("DebugToolLaunchManager", () => {
    let manager: DebugToolLaunchManager;
    let handler: jest.Mock<void, [DebugToolLaunchRequest]>;

    beforeEach(() => {
        manager = new DebugToolLaunchManager();
        handler = jest.fn();
    });

    it("buffers a cold-launch request and flushes it when the handler is registered", () => {
        manager.initialize(args({ debugToolConnection: "conn-1", openDevTools: true }));
        expect(handler).not.toHaveBeenCalled();

        manager.setupHandler(handler);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ localPath: "/tools/my-tool", connection: "conn-1", openDevTools: true });
    });

    it("buffers nothing when no debug tool path was supplied", () => {
        manager.initialize(args({ debugToolPath: null }));
        manager.setupHandler(handler);
        expect(handler).not.toHaveBeenCalled();
    });

    it("keeps a buffer depth of one, so a newer request supersedes a queued one", () => {
        manager.initialize(args({ debugToolPath: "/tools/first" }));
        manager.handleRequest(args({ debugToolPath: "/tools/second" }));

        manager.setupHandler(handler);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ localPath: "/tools/second" }));
    });

    it("dispatches immediately once a handler is registered", () => {
        manager.setupHandler(handler);
        manager.handleRequest(args({ debugToolPath: "/tools/warm" }));

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ localPath: "/tools/warm" }));
    });

    it("rate limits repeated second-instance requests within the window", () => {
        manager.setupHandler(handler);

        manager.handleRequest(args());
        manager.handleRequest(args());
        manager.handleRequest(args());
        manager.handleRequest(args());

        expect(handler).toHaveBeenCalledTimes(3);
    });

    it("swallows a rejecting handler instead of producing an unhandled rejection", async () => {
        const rejecting = jest.fn(() => Promise.reject(new Error("boom")));
        manager.setupHandler(rejecting);
        manager.handleRequest(args());

        await Promise.resolve();
        expect(rejecting).toHaveBeenCalledTimes(1);
    });
});
