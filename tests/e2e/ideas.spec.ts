import { expect, test } from "./fixtures";
import { IDEA_STATUSES, IDEA_TYPES, ToolIdea, ToolIdeaSubmission } from "../../src/common/types/toolIdea";
import type { Page } from "playwright";

interface IdeasTestState {
    rows: ToolIdea[];
    submissions: ToolIdeaSubmission[];
    calls: string[];
    urls: string[];
    failList: boolean;
    rejectVote: boolean;
    delayVote: boolean;
}

type TestGlobal = typeof globalThis & { ideasTest: IdeasTestState };

const rows: ToolIdea[] = Object.keys(IDEA_TYPES).flatMap((type, typeIndex) =>
    Object.keys(IDEA_STATUSES).map((status, statusIndex) => ({
        id: `00000000-0000-4000-8000-${String(typeIndex * 5 + statusIndex + 1).padStart(12, "0")}`,
        title: `${type} ${status}`,
        description: "Community suggestion",
        ideaType: type as ToolIdea["ideaType"],
        status: status as ToolIdea["status"],
        resolution: status === "closed" ? "implemented" : null,
        publicNote: status === "closed" ? "Maintainer explanation: delivered." : null,
        duplicateOf: status === "duplicate" ? "00000000-0000-4000-8000-000000000001" : null,
        githubIssueUrl: status === "planned" && type !== "tool" ? `https://github.com/PowerPlatformToolBox/${type === "pptb_desktop" ? "desktop-app" : "vscode-extension"}/issues/123` : null,
        upvotes: status === "open" ? 5 : 4,
        hasUpvoted: status === "closed" || status === "duplicate",
        createdAt: `2026-10-${String(typeIndex * 5 + statusIndex + 1).padStart(2, "0")}T00:00:00Z`,
        updatedAt: "2026-10-20T00:00:00Z",
    })),
);

test.beforeEach(async ({ electronApp }) => {
    await electronApp.evaluate(({ ipcMain }, initialRows) => {
        const state: IdeasTestState = { rows: initialRows, submissions: [], calls: [], urls: [], failList: false, rejectVote: false, delayVote: false };
        (globalThis as TestGlobal).ideasTest = state;
        const replace = (channel: string, handler: (...args: unknown[]) => unknown) => {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, (_event, ...args) => handler(...args));
        };
        replace("tool-idea:fetch", () => {
            if (state.failList) throw new Error("get_ideas is unavailable");
            return state.rows;
        });
        replace("tool-idea:submit", (submission) => {
            const idea = submission as ToolIdeaSubmission;
            if (idea.title === "Rejected") throw new Error("Submission rejected");
            state.submissions.push(idea);
            state.rows.push({ ...state.rows[0], ...idea, id: "00000000-0000-4000-8000-000000000099", status: "open", upvotes: 0, hasUpvoted: false, githubIssueUrl: null });
        });
        for (const remove of [false, true]) {
            replace(remove ? "tool-idea:remove-vote" : "tool-idea:upvote", async (id) => {
                state.calls.push(remove ? "remove" : "add");
                if (state.delayVote) await new Promise((resolve) => setTimeout(resolve, 700));
                const idea = state.rows.find((row) => row.id === id)!;
                if (state.rejectVote) {
                    idea.status = "closed";
                    idea.resolution = "not_planned";
                    idea.publicNote = "Closed during voting.";
                    throw new Error("Votes cannot be changed for this idea");
                }
                if (!["open", "under_review", "planned"].includes(idea.status)) throw new Error("Ineligible idea");
                if (remove && idea.hasUpvoted) idea.upvotes--;
                if (!remove && !idea.hasUpvoted) idea.upvotes++;
                idea.hasUpvoted = !remove;
                return { upvotes: idea.upvotes, hasUpvoted: idea.hasUpvoted };
            });
        }
        replace("open-external", (url) => {
            state.urls.push(String(url));
        });
    }, rows);
});

test("Ideas tab composes filters, retains closed votes, and shows review context and safe issue links", async ({ window, electronApp }) => {
    await window.locator("#ideas-activity-btn").click();
    await expect(window.locator(".idea-card")).toHaveCount(15);
    expect(
        await window.locator("#ideas-activity-btn").evaluate((button) => button.compareDocumentPosition(document.getElementById("settings-activity-btn")!) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBeTruthy();
    expect(
        await window
            .locator(".idea-card")
            .first()
            .evaluate((card) => card.children[0]?.classList.contains("idea-badges") && !!card.children[1]?.querySelector("h2")),
    ).toBe(true);
    const filterBottoms = await window.locator("#ideas-type-filter, #ideas-status-filter, #ideas-refresh").evaluateAll((elements) =>
        elements.map((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.bottom;
        }),
    );
    expect(Math.max(...filterBottoms) - Math.min(...filterBottoms)).toBeLessThanOrEqual(1);
    const selectStyles = await window.locator("#ideas-type-filter").evaluate((element) => ({
        appearance: getComputedStyle(element).appearance,
        backgroundImage: getComputedStyle(element).backgroundImage,
        chevron: getComputedStyle(element.parentElement!, "::after").content,
    }));
    expect(selectStyles.appearance).toBe("none");
    expect(selectStyles.backgroundImage).toBe("none");
    expect(selectStyles.chevron).toBe('""');
    await window.screenshot({ path: test.info().outputPath("ideas-board.png") });
    await window.locator("#ideas-activity-btn").click();
    await expect(window.locator("#tool-tab-app-ideas")).toHaveCount(1);
    for (const [type, label] of Object.entries(IDEA_TYPES)) {
        await window.locator("#ideas-type-filter").selectOption(type);
        await expect(window.locator(".idea-card")).toHaveCount(5);
        for (const [status, statusLabel] of Object.entries(IDEA_STATUSES)) {
            await window.locator("#ideas-status-filter").selectOption(status);
            const card = window.locator(".idea-card");
            await expect(card).toHaveCount(1);
            await expect(card.locator(".idea-badges")).toContainText(label);
            await expect(card.locator(".idea-badges")).toContainText(statusLabel);
            if (status === "closed" || status === "duplicate") {
                await expect(card.locator(".idea-vote")).toBeDisabled();
                await expect(card.locator(".idea-vote")).toContainText("4");
            }
            if (status === "closed") {
                await expect(card).toContainText("Implemented");
                await expect(card).toContainText("Maintainer explanation: delivered.");
            }
            if (status === "duplicate") {
                await expect(card).toContainText("Duplicate of: pptb_desktop open");
                await expect(card.locator("a")).toHaveCount(0);
            }
            if (type !== "tool" && status === "planned") {
                await card.getByRole("button", { name: "View GitHub issue" }).click();
                expect(await electronApp.evaluate(() => (globalThis as TestGlobal).ideasTest.urls)).toContain(
                    `https://github.com/PowerPlatformToolBox/${type === "pptb_desktop" ? "desktop-app" : "vscode-extension"}/issues/123`,
                );
            } else {
                await expect(card.getByRole("button", { name: "View GitHub issue" })).toHaveCount(0);
            }
        }
        await window.locator("#ideas-status-filter").selectOption("");
    }
    await expect(window.locator(".ideas-triage-note")).toContainText("GitHub is authoritative");
});

test("adds, removes, re-votes, re-sorts, prevents concurrent requests and refreshes a status rejection", async ({ window, electronApp }) => {
    await window.locator("#ideas-activity-btn").click();
    await expect(window.locator(".idea-card")).toHaveCount(15);
    const target = window.locator('[data-idea-id="00000000-0000-4000-8000-000000000001"] .idea-vote');
    await electronApp.evaluate(() => {
        (globalThis as TestGlobal).ideasTest.delayVote = true;
    });
    await target.click();
    await expect(target).toBeDisabled();
    await target.dispatchEvent("click");
    await window.locator("#ideas-activity-btn").click();
    await expect(target).toHaveAttribute("aria-pressed", "true");
    await expect(window.locator(".idea-card").first()).toHaveAttribute("data-idea-id", "00000000-0000-4000-8000-000000000001");
    await target.click();
    await expect(target).toHaveAttribute("aria-pressed", "false");
    await expect(target).toContainText("5");
    await expect(window.locator(".idea-card").first()).not.toHaveAttribute("data-idea-id", "00000000-0000-4000-8000-000000000001");
    await target.click();
    await expect(target).toHaveAttribute("aria-pressed", "true");
    expect(await electronApp.evaluate(() => (globalThis as TestGlobal).ideasTest.calls)).toEqual(["add", "remove", "add"]);
    await electronApp.evaluate(() => {
        (globalThis as TestGlobal).ideasTest.rejectVote = true;
    });
    await target.click();
    await expect(window.locator("#ideas-feedback")).toContainText("Votes cannot be changed");
    await expect(target).toBeDisabled();
    await expect(target).toContainText("6");
    await expect(window.locator('[data-idea-id="00000000-0000-4000-8000-000000000001"]')).toContainText("Closed during voting.");
});

test("submission requires an explicit type, preserves failed input, closes on success and refreshes filtered board", async ({ window, electronApp }) => {
    await window.locator("#ideas-activity-btn").click();
    await expect(window.locator(".idea-card")).toHaveCount(15);
    await window.locator("#ideas-type-filter").selectOption("tool");
    for (const ideaType of Object.keys(IDEA_TYPES)) {
        let existing: Page | undefined;
        for (const page of electronApp.windows()) {
            if (page !== window && (await page.locator("#tool-ideas-close-btn").count())) existing = page;
        }
        const modalPromise = existing ? Promise.resolve(existing) : electronApp.waitForEvent("window");
        const navigated = existing?.waitForEvent("domcontentloaded");
        await window.locator("#ideas-share").click();
        const modal = await modalPromise;
        await navigated;
        await modal.waitForLoadState("domcontentloaded");
        await expect(modal.locator("#tool-idea-type")).toHaveValue("");
        if (ideaType === "pptb_desktop") await modal.screenshot({ path: test.info().outputPath("share-idea.png") });
        await modal.locator("#tool-idea-title").fill("Rejected");
        await modal.locator("#tool-idea-description").fill("A useful improvement.");
        await modal.locator("#tool-idea-submit-btn").click();
        expect(await electronApp.evaluate(() => (globalThis as TestGlobal).ideasTest.submissions.length)).toBe(Object.keys(IDEA_TYPES).indexOf(ideaType));
        await modal.locator("#tool-idea-type").selectOption(ideaType);
        await modal.locator("#tool-idea-submit-btn").click();
        await expect(modal.locator("#tool-ideas-feedback")).toContainText("Submission rejected");
        await expect(modal.locator("#tool-idea-title")).toHaveValue("Rejected");
        await modal.locator("#tool-idea-title").fill("An improvement");
        await modal.locator("#tool-idea-submit-btn").click();
        await expect(window.locator("#modal-backdrop")).not.toBeVisible();
        await expect(window.locator("#ideas-feedback")).toContainText("Your filters may hide");
        await expect(window.locator("#ideas-type-filter")).toHaveValue("tool");
    }
    expect(await electronApp.evaluate(() => (globalThis as TestGlobal).ideasTest.submissions.map((idea) => idea.ideaType))).toEqual(Object.keys(IDEA_TYPES));
});

test("shows explicit migration errors, retry, empty states and rejects unsupported issue links", async ({ window, electronApp }) => {
    await electronApp.evaluate(() => {
        (globalThis as TestGlobal).ideasTest.failList = true;
    });
    await window.locator("#ideas-activity-btn").click();
    await expect(window.locator("#ideas-feedback")).toContainText("get_ideas is unavailable");
    await expect(window.locator(".idea-card")).toHaveCount(0);
    await electronApp.evaluate(() => {
        const state = (globalThis as TestGlobal).ideasTest;
        state.failList = false;
        state.rows = [{ ...state.rows[0], githubIssueUrl: "https://github.com/other/repo/issues/1" }];
    });
    await window.locator("#ideas-refresh").click();
    await expect(window.locator(".idea-card")).toHaveCount(1);
    await expect(window.locator(".idea-card")).toContainText("Unsupported GitHub issue link");
    await expect(window.getByRole("button", { name: "View GitHub issue" })).toHaveCount(0);
    await window.locator("#ideas-status-filter").selectOption("planned");
    await expect(window.locator("#ideas-list")).toContainText("No ideas match");
    await electronApp.evaluate(() => {
        (globalThis as TestGlobal).ideasTest.rows = [];
    });
    await window.locator("#ideas-refresh").click();
    await expect(window.locator("#ideas-list")).toContainText("No ideas yet");
});
