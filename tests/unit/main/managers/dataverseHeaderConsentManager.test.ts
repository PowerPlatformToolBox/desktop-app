/// <reference types="jest" />

import { EventEmitter } from "events";
import type { WebContents } from "electron";
import { DATAVERSE_HEADER_CONSENT_CHANNELS } from "../../../../src/common/ipc/channels";
import { DataverseHeaderConsentManager } from "../../../../src/main/managers/dataverseHeaderConsentManager";
import type { SettingsManager } from "../../../../src/main/managers/settingsManager";

class FakeWebContents extends EventEmitter {
    readonly send = jest.fn();
    private destroyed = false;

    constructor(readonly id: number) {
        super();
    }

    isDestroyed(): boolean {
        return this.destroyed;
    }

    destroy(): void {
        this.destroyed = true;
        this.emit("destroyed");
    }
}

function asWebContents(value: FakeWebContents): WebContents {
    return value as unknown as WebContents;
}

describe("DataverseHeaderConsentManager", () => {
    let sender: FakeWebContents;
    let main: FakeWebContents;
    let settings: Pick<SettingsManager, "hasDataverseHeaderConsent" | "grantDataverseHeaderConsent">;
    let manager: DataverseHeaderConsentManager;

    beforeEach(() => {
        sender = new FakeWebContents(10);
        main = new FakeWebContents(1);
        settings = {
            hasDataverseHeaderConsent: jest.fn().mockReturnValue(false),
            grantDataverseHeaderConsent: jest.fn(),
        };
        manager = new DataverseHeaderConsentManager(
            settings as SettingsManager,
            () => asWebContents(main),
            () => ({ toolId: "tool-a", toolName: "Tool A" }),
            1_000,
        );
    });

    afterEach(() => manager.dispose());

    it("does not prompt when no additional headers are present", async () => {
        await expect(manager.authorize(asWebContents(sender), "Retrieve", undefined)).resolves.toEqual({});
        expect(main.send).not.toHaveBeenCalled();
    });

    it("releases the exact frozen snapshot for allow once without persisting", async () => {
        const result = manager.authorize(asWebContents(sender), "Retrieve", { Prefer: "odata.maxpagesize=10" });
        const request = main.send.mock.calls[0][1];

        expect(main.send).toHaveBeenCalledWith(DATAVERSE_HEADER_CONSENT_CHANNELS.REQUEST, expect.objectContaining({ toolId: "tool-a", operation: "Retrieve" }));
        expect(manager.respond(request.requestId, "allow-once")).toBe(true);
        await expect(result).resolves.toEqual({ Prefer: "odata.maxpagesize=10" });
        expect(settings.grantDataverseHeaderConsent).not.toHaveBeenCalled();
    });

    it("persists allow-for-tool and skips later prompts", async () => {
        const result = manager.authorize(asWebContents(sender), "Update", { "If-Match": "*" });
        const request = main.send.mock.calls[0][1];
        manager.respond(request.requestId, "allow-tool");
        await result;
        expect(settings.grantDataverseHeaderConsent).toHaveBeenCalledWith("tool-a");

        (settings.hasDataverseHeaderConsent as jest.Mock).mockReturnValue(true);
        main.send.mockClear();
        await expect(manager.authorize(asWebContents(sender), "Update", { Prefer: "return=minimal" })).resolves.toEqual({ Prefer: "return=minimal" });
        expect(main.send).not.toHaveBeenCalled();
    });

    it("rejects the pending request without releasing headers", async () => {
        const result = manager.authorize(asWebContents(sender), "Delete", { "MSCRM.BypassCustomPluginExecution": "true" });
        const request = main.send.mock.calls[0][1];
        manager.respond(request.requestId, "reject");
        await expect(result).rejects.toThrow("rejected");
    });

    it("shows outer and per-operation batch headers in one consent request", async () => {
        const result = manager.authorizeBatch(
            asWebContents(sender),
            "Execute batch",
            [
                { method: "GET", url: "accounts", headers: { Prefer: "odata.maxpagesize=5" } },
                { method: "PATCH", url: "contacts(1)", headers: { Prefer: "return=minimal" } },
            ],
            false,
            { Consistency: "Strong" },
        );
        const request = main.send.mock.calls[0][1];
        expect(request.headers).toEqual([
            { name: "Consistency", value: "Strong", scope: "Batch request" },
            { name: "Prefer", value: "odata.maxpagesize=5", scope: "Operation 1: GET /api/data/v9.2/accounts" },
            { name: "Prefer", value: "return=minimal", scope: "Operation 2: PATCH /api/data/v9.2/contacts(1)" },
        ]);
        manager.respond(request.requestId, "allow-once");
        await expect(result).resolves.toEqual(expect.objectContaining({ additionalHeaders: { Consistency: "Strong" } }));
    });

    it("rejects when the caller closes while consent is pending", async () => {
        const result = manager.authorize(asWebContents(sender), "Retrieve", { Prefer: "return=minimal" });
        sender.destroy();
        await expect(result).rejects.toThrow("caller closed");
    });

    it("queues concurrent prompts and advances after a decision", async () => {
        const first = manager.authorize(asWebContents(sender), "First", { Prefer: "return=minimal" });
        const second = manager.authorize(asWebContents(sender), "Second", { Consistency: "Strong" });
        expect(main.send).toHaveBeenCalledTimes(1);

        manager.respond(main.send.mock.calls[0][1].requestId, "allow-once");
        await first;
        expect(main.send).toHaveBeenCalledTimes(2);
        expect(main.send.mock.calls[1][1].operation).toBe("Second");

        manager.respond(main.send.mock.calls[1][1].requestId, "reject");
        await expect(second).rejects.toThrow("rejected");
    });

    it("rejects an active prompt when the trusted renderer closes", async () => {
        const result = manager.authorize(asWebContents(sender), "Retrieve", { Prefer: "return=minimal" });
        main.destroy();
        await expect(result).rejects.toThrow("UI closed");
    });
});
