import { expect, test } from "./fixtures";

/**
 * E2E: basic application launch and window visibility.
 *
 * These tests verify that the app starts without errors, the main window
 * renders, and essential UI regions are present.
 *
 * Prerequisites: run `pnpm run build` before executing these tests.
 */

test.describe("App launch", () => {
    test("main window is visible after launch", async ({ window }) => {
        await expect(window).toHaveTitle(/Power Platform ToolBox/i, { timeout: 30_000 });
    });

    test("main window has content (body is not empty)", async ({ window }) => {
        const body = window.locator("body");
        await expect(body).not.toBeEmpty();
    });

    test("sidebar navigation is present", async ({ window }) => {
        // The sidebar element should exist in the DOM
        const sidebar = window.locator("#sidebar, .sidebar, nav");
        await expect(sidebar.first()).toBeVisible({ timeout: 15_000 });
    });

    test("no JavaScript errors thrown at startup", async ({ electronApp }) => {
        const jsErrors: string[] = [];
        const consoleErrors: string[] = [];

        const win = await electronApp.firstWindow();

        // Track actual unhandled JS exceptions in the renderer.
        win.on("pageerror", (error) => {
            jsErrors.push(error.message);
        });

        // Keep console error tracking for diagnostics only.
        win.on("console", (msg) => {
            if (msg.type() === "error") {
                consoleErrors.push(msg.text());
            }
        });

        // Allow the page to fully load and execute
        await win.waitForLoadState("networkidle").catch(() => {
            // networkidle can time out in Electron — that's OK
        });

        // Assert only on true JavaScript startup errors.
        expect(jsErrors).toHaveLength(0);

        // Optional sanity check: keep known noisy resource/network console errors out of signal.
        const significantConsoleErrors = consoleErrors.filter(
            (e) => !e.includes("favicon") && !e.includes("net::ERR_") && !e.includes("Mixed Content") && !e.includes("Failed to load resource: the server responded with a status of 404"),
        );

        expect(significantConsoleErrors).toHaveLength(0);
    });
});
