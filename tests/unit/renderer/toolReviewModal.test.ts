/// <reference types="jest" />

import * as fs from "fs";
import * as path from "path";

const modalApi = {
    show: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(true),
    messageHandlers: [] as Array<(payload: { channel: string; data?: unknown }) => void>,
    closedHandlers: [] as Array<(payload: { id: string }) => void>,
};

jest.mock("../../../src/renderer/modules/browserWindowModals", () => ({
    showBrowserWindowModal: (...args: unknown[]) => modalApi.show(...args),
    closeBrowserWindowModal: (...args: unknown[]) => modalApi.close(...args),
    sendBrowserWindowModalMessage: (...args: unknown[]) => modalApi.send(...args),
    onBrowserWindowModalMessage: (handler: (payload: { channel: string; data?: unknown }) => void) => modalApi.messageHandlers.push(handler),
    onBrowserWindowModalClosed: (handler: (payload: { id: string }) => void) => modalApi.closedHandlers.push(handler),
}));

import { getRateToolModalControllerScript } from "../../../src/renderer/modals/rateTool/controller";
import { getRateToolModalView } from "../../../src/renderer/modals/rateTool/view";
import { openRateToolModal } from "../../../src/renderer/modules/rateToolModal";
import { getToolReviewUnavailableMessage, resolveToolReviewAccess } from "../../../src/renderer/utils/toolReviewAccess";

type Ctx = { toolId: string; installed: boolean; version?: string; repository?: string };

const api = {
    getToolReviewContext: jest.fn<Promise<Ctx>, [string]>(),
    getMyToolRating: jest.fn().mockResolvedValue(null),
    submitToolRating: jest.fn(),
    openExternal: jest.fn().mockResolvedValue(undefined),
    utils: { showNotification: jest.fn().mockResolvedValue(undefined) },
};

const installed = (toolId: string, version = "1.0.0", repository = "https://github.com/o/r"): Ctx => ({ toolId, installed: true, version, repository });
const emit = (channel: string, data?: unknown) => modalApi.messageHandlers.forEach((handler) => handler({ channel, data }));
const closeByUser = () => modalApi.closedHandlers.forEach((handler) => handler({ id: "rate-tool-modal" }));
const flush = async () => {
    for (let i = 0; i < 15; i++) await Promise.resolve();
};
const sentErrors = () => modalApi.send.mock.calls.filter(([m]) => m.channel === "rate-tool:submit:error").map(([m]) => m.data.error as string);

beforeEach(() => {
    jest.clearAllMocks();
    (global as unknown as { window: unknown }).window = { toolboxAPI: api };
    (global as unknown as { document: unknown }).document = { body: { classList: { contains: () => false } } };
    api.getMyToolRating.mockResolvedValue(null);
});

describe("review eligibility", () => {
    it("is eligible only when this tool's installed state resolves", async () => {
        api.getToolReviewContext.mockResolvedValueOnce(installed("tool-a"));
        expect((await resolveToolReviewAccess("tool-a")).status).toBe("eligible");
    });

    it("does not let a different installed tool make this one eligible", async () => {
        api.getToolReviewContext.mockResolvedValueOnce(installed("other-tool"));
        expect((await resolveToolReviewAccess("tool-a")).status).toBe("not-installed");
    });

    it("keeps rating unavailable for uninstalled and unknown state", async () => {
        api.getToolReviewContext.mockResolvedValueOnce({ toolId: "tool-a", installed: false });
        const missing = await resolveToolReviewAccess("tool-a");
        expect(missing.status).toBe("not-installed");
        expect(getToolReviewUnavailableMessage(missing)).toMatch(/must be installed/);

        api.getToolReviewContext.mockRejectedValueOnce(new Error("manifest unreadable"));
        const unknown = await resolveToolReviewAccess("tool-a");
        expect(unknown.status).toBe("unknown");
        expect(getToolReviewUnavailableMessage(unknown)).toMatch(/manifest unreadable/);
    });
});

describe("openRateToolModal", () => {
    it.each([
        ["uninstalled", () => api.getToolReviewContext.mockResolvedValueOnce({ toolId: "tool-a", installed: false })],
        ["unknown", () => api.getToolReviewContext.mockRejectedValueOnce(new Error("boom"))],
    ])("does not open for %s tools and explains why", async (_label, arrange) => {
        arrange();
        await expect(openRateToolModal({ id: "tool-a", name: "A" })).resolves.toBeNull();
        expect(modalApi.show).not.toHaveBeenCalled();
        expect(api.utils.showNotification).toHaveBeenCalledWith(expect.objectContaining({ title: "Review unavailable" }));
    });

    function open(context: Ctx = installed("tool-a")) {
        api.getToolReviewContext.mockResolvedValue(context);
        return openRateToolModal({ id: "tool-a", name: "A" });
    }

    it("shows the installed version and reports success only after persistence", async () => {
        api.submitToolRating.mockResolvedValue({ rating: 4, ratingCount: 2 });
        const pending = open();
        await flush();
        const html = modalApi.show.mock.calls[0][0].html as string;
        expect(html).toContain("Reviewing installed version");
        expect(html).toContain('<strong id="rate-tool-version-value">1.0.0</strong>');
        emit("rate-tool:submit", { toolId: "tool-a", rating: 5, comment: "great", toolVersion: " 1.0.0 " });
        const result = await pending;

        expect(api.submitToolRating).toHaveBeenCalledWith("tool-a", 5, "great", "1.0.0");
        expect(result).toEqual({ rating: 4, ratingCount: 2 });
        expect(api.utils.showNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
    });

    it("requires confirmation when the installed version differs from what the dialog showed", async () => {
        api.submitToolRating.mockResolvedValue({});
        api.getToolReviewContext.mockResolvedValue(installed("tool-a", "1.0.0"));
        const pending = openRateToolModal({ id: "tool-a", name: "A" });
        await flush();

        api.getToolReviewContext.mockResolvedValue(installed("tool-a", "2.0.0"));
        emit("rate-tool:submit", { toolId: "tool-a", rating: 5, toolVersion: "1.0.0" });
        await flush();

        expect(api.submitToolRating).not.toHaveBeenCalled();
        expect(sentErrors()[0]).toMatch(/installed version changed to 2\.0\.0/);
        expect(modalApi.send).toHaveBeenCalledWith({ channel: "rate-tool:context", data: { installed: true, version: "2.0.0" } });

        emit("rate-tool:submit", { toolId: "tool-a", rating: 5, toolVersion: "2.0.0" });
        await pending;
        expect(api.submitToolRating).toHaveBeenCalledWith("tool-a", 5, undefined, "2.0.0");
    });

    it("blocks submission when the tool was uninstalled while the dialog was open", async () => {
        const pending = open();
        await flush();
        api.getToolReviewContext.mockResolvedValue({ toolId: "tool-a", installed: false });

        emit("rate-tool:submit", { toolId: "tool-a", rating: 5, toolVersion: "1.0.0" });
        await flush();

        expect(api.submitToolRating).not.toHaveBeenCalled();
        expect(sentErrors()[0]).toMatch(/must be installed/);
        expect(modalApi.send).toHaveBeenCalledWith({ channel: "rate-tool:context", data: { installed: false } });
        closeByUser();
        await expect(pending).resolves.toBeNull();
    });

    it("rejects submissions for another tool, blank versions and overlong versions", async () => {
        const pending = open();
        await flush();
        emit("rate-tool:submit", { toolId: "someone-else", rating: 5, toolVersion: "1.0.0" });
        emit("rate-tool:submit", { toolId: "tool-a", rating: 5, toolVersion: "   " });
        await flush();
        emit("rate-tool:submit", { toolId: "tool-a", rating: 5, toolVersion: "1".repeat(101) });
        await flush();
        expect(api.submitToolRating).not.toHaveBeenCalled();
        expect(sentErrors()).toHaveLength(2);
        closeByUser();
        await pending;
    });

    it("prevents duplicate submits while saving and preserves the draft on failure", async () => {
        let rejectSave: (error: Error) => void = () => undefined;
        api.submitToolRating.mockImplementationOnce(() => new Promise((_, reject) => (rejectSave = reject)));
        const pending = open();
        await flush();

        emit("rate-tool:submit", { toolId: "tool-a", rating: 5, toolVersion: "1.0.0" });
        emit("rate-tool:submit", { toolId: "tool-a", rating: 5, toolVersion: "1.0.0" });
        await flush();
        expect(api.submitToolRating).toHaveBeenCalledTimes(1);

        rejectSave(new Error("database unavailable"));
        await flush();
        expect(sentErrors()).toContain("database unavailable");
        expect(modalApi.close).not.toHaveBeenCalled();

        closeByUser();
        await expect(pending).resolves.toBeNull();
        expect(api.utils.showNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
    });

    it("opens only the validated tool issues page from the reminder", async () => {
        const pending = open(installed("tool-a", "1.0.0", "git+https://github.com/o/r.git"));
        await flush();
        emit("rate-tool:open-issues", { url: "https://evil.example" });
        expect(api.openExternal).toHaveBeenCalledWith("https://github.com/o/r/issues");
        closeByUser();
        await pending;
    });

    it("does not open any link when the repository is missing or not on github.com", async () => {
        const pending = open(installed("tool-a", "1.0.0", "https://gitlab.com/o/r"));
        await flush();
        expect(modalApi.show.mock.calls[0][0].html).not.toContain('<a id="rate-tool-issues-link"');
        emit("rate-tool:open-issues", {});
        expect(api.openExternal).not.toHaveBeenCalled();
        closeByUser();
        await pending;
    });
});

describe("review dialog markup", () => {
    it("shows the GitHub reminder, with a link only when a valid repository exists", () => {
        const withLink = getRateToolModalView({ toolName: "A", isDarkTheme: false, installedVersion: "1.0.0", hasIssuesLink: true }).body;
        const without = getRateToolModalView({ toolName: "A", isDarkTheme: false, installedVersion: "1.0.0", hasIssuesLink: false }).body;
        expect(withLink).toContain("Reviews are for sharing your experience. Please log bugs and issues on the tool");
        expect(withLink).toContain("GitHub page, not in a review.");
        expect(withLink).toContain('<a id="rate-tool-issues-link"');
        expect(without).toContain("GitHub page, not in a review.");
        expect(without).not.toContain('<a id="rate-tool-issues-link"');
    });

    it("requires explicit version entry when no installed version is known", () => {
        const { body } = getRateToolModalView({ toolName: "A", isDarkTheme: false, installedVersion: "" });
        expect(body).toContain('id="rate-tool-version-input"');
        expect(body).toContain('maxlength="100"');
        expect(body).toMatch(/id="rate-tool-version-installed"[^>]* hidden/);
    });

    it("controller blocks duplicates, validates versions, and requires confirmation on version change", () => {
        const script = getRateToolModalControllerScript({
            channels: { submit: "s", context: "c", openIssues: "o" },
            toolId: "tool-a",
            installedVersion: "1.0.0",
            versionMaxLength: 100,
            notInstalledMessage: "must be installed",
        });
        expect(script).toContain("if (submitting ||");
        expect(script).toContain("CONFIG.versionMaxLength");
        expect(script).toContain("needsConfirm = !!previous && previous !== nextVersion");
        expect(script).toContain("confirmBox.checked = false");
        expect(script).toContain("modalBridge.close()");
    });
});

describe("entry points and scope", () => {
    const read = (file: string) => fs.readFileSync(path.join(__dirname, "../../../src", file), "utf-8");

    it("hides rating on both entry points until installation resolves", () => {
        const sidebar = read("renderer/modules/toolsSidebarManagement.ts");
        const detail = read("renderer/modules/marketplaceManagement.ts");
        expect(sidebar).toMatch(/data-menu-action="rate" style="display:none"/);
        expect(sidebar).toContain("resolveToolReviewAccess(tool.id)");
        expect(detail).toMatch(/id="tool-detail-rate-wrap" style="display:none"/);
        expect(detail).toContain("resolveToolReviewAccess(tool.id)");
        expect(detail).toMatch(/setInstalledState = \(toolInstalled: boolean\): void => \{\s+void refreshRateAvailability\(toolInstalled\)/);
    });

    it("adds no website API dependency, review list, or reply UI", () => {
        const files = [
            "renderer/modules/rateToolModal.ts",
            "renderer/modals/rateTool/view.ts",
            "renderer/modals/rateTool/controller.ts",
            "renderer/utils/toolReviewAccess.ts",
            "common/utils/toolReview.ts",
        ];
        for (const file of files) {
            expect(read(file)).not.toMatch(/fetch\(|powerplatformtoolbox\.com|author[_ -]?repl|rating_author_replies|service_role/i);
        }
    });
});
