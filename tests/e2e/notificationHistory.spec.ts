import type { ElectronApplication, Page } from "playwright";
import { expect, test } from "./fixtures";

/**
 * E2E: Notification history bell button in the footer.
 *
 * The history panel is now a separate always-on-top BrowserWindow managed by
 * the main process (NotificationHistoryWindowManager).  Clicking the bell
 * button in the footer opens/closes that window.
 *
 * Prerequisites: run `pnpm run build` before executing these tests.
 */

/**
 * Click the bell button and wait for the newly-created history BrowserWindow
 * to appear.  The history window is created lazily on first click.
 */
async function openHistoryWindow(electronApp: ElectronApplication, window: Page): Promise<Page> {
    const bellBtn = window.locator("#footer-notification-bell-btn");
    await expect(bellBtn).toBeVisible({ timeout: 15_000 });

    const historyWindowPromise = electronApp.waitForEvent("window", { timeout: 10_000 });
    await bellBtn.click();
    const historyWindow = await historyWindowPromise;
    await historyWindow.waitForLoadState("domcontentloaded");
    return historyWindow;
}

/** Check whether the Notification History BrowserWindow is currently visible. */
async function isHistoryWindowVisible(electronApp: ElectronApplication): Promise<boolean> {
    return electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.getTitle() === "Notification History");
        return win?.isVisible() ?? false;
    });
}

test.describe("Notification history panel", () => {
    test("long notification messages are fully readable in history", async ({ electronApp, window }) => {
        const body = "Visual Studio Code is configured and the PPTB MCP server is running. In VS Code, enable and start pptb from MCP: List Servers, and approve trust if prompted.";
        await window.evaluate((message) => window.api.invoke("notification:show", { title: "MCP Client Configured", body: message, type: "success", duration: 0 }), body);
        const historyWindow = await openHistoryWindow(electronApp, window);
        const message = historyWindow.locator(".notification-history-entry__message").filter({ hasText: body });
        await expect(message).toHaveText(body);
        const dimensions = await message.evaluate((element) => ({
            visibleHeight: element.clientHeight,
            contentHeight: element.scrollHeight,
            visibleWidth: element.clientWidth,
            contentWidth: element.scrollWidth,
        }));
        expect(dimensions.contentHeight).toBeLessThanOrEqual(dimensions.visibleHeight + 1);
        expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.visibleWidth + 1);
    });

    test("bell button is visible in the footer", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });
    });

    test("notification badge is initially hidden", async ({ window }) => {
        const badge = window.locator("#notification-badge");
        await expect(badge).toBeHidden({ timeout: 15_000 });
    });

    test("bell button aria-pressed is false initially", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });
        await expect(bellBtn).toHaveAttribute("aria-pressed", "false");
    });

    test("clicking the bell button opens the history window", async ({ electronApp, window }) => {
        await openHistoryWindow(electronApp, window);

        const isVisible = await isHistoryWindowVisible(electronApp);
        expect(isVisible).toBe(true);
    });

    test("clicking the bell button again closes the history window", async ({ electronApp, window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        // Open the history window
        await openHistoryWindow(electronApp, window);
        await expect(bellBtn).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });

        // Click bell again to close
        await bellBtn.click();
        await expect(bellBtn).toHaveAttribute("aria-pressed", "false", { timeout: 5_000 });

        const isVisible = await isHistoryWindowVisible(electronApp);
        expect(isVisible).toBe(false);
    });

    test("pressing Escape in the history window closes it", async ({ electronApp, window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        const historyWindow = await openHistoryWindow(electronApp, window);
        await expect(bellBtn).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });

        await historyWindow.keyboard.press("Escape");
        await expect(bellBtn).toHaveAttribute("aria-pressed", "false", { timeout: 5_000 });
    });

    test("empty state is shown when there are no notifications", async ({ electronApp, window }) => {
        const historyWindow = await openHistoryWindow(electronApp, window);

        const emptyState = historyWindow.locator("#notification-history-empty");
        await expect(emptyState).toBeVisible({ timeout: 5_000 });
        await expect(emptyState).toHaveText(/no notifications yet/i);
    });

    test("history window has a Clear All button", async ({ electronApp, window }) => {
        const historyWindow = await openHistoryWindow(electronApp, window);

        const clearBtn = historyWindow.locator("#notification-clear-all-btn");
        await expect(clearBtn).toBeVisible({ timeout: 5_000 });
    });

    test("Clear All closes the history window", async ({ electronApp, window }) => {
        const historyWindow = await openHistoryWindow(electronApp, window);

        await historyWindow.locator("#notification-clear-all-btn").click();
        await expect(window.locator("#footer-notification-bell-btn")).toHaveAttribute("aria-pressed", "false", { timeout: 5_000 });

        const isVisible = await isHistoryWindowVisible(electronApp);
        expect(isVisible).toBe(false);
    });

    test("bell button aria-pressed reflects window open state", async ({ electronApp, window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        await expect(bellBtn).toHaveAttribute("aria-pressed", "false");

        await openHistoryWindow(electronApp, window);
        await expect(bellBtn).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });

        await bellBtn.click();
        await expect(bellBtn).toHaveAttribute("aria-pressed", "false", { timeout: 5_000 });
    });

    test("notification list is present inside the history window", async ({ electronApp, window }) => {
        const historyWindow = await openHistoryWindow(electronApp, window);

        const list = historyWindow.locator("#notification-history-list");
        await expect(list).toBeAttached({ timeout: 5_000 });
    });
});
