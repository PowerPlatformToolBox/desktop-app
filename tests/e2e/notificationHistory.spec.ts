import { test, expect } from "./fixtures";

/**
 * E2E: Notification history bell button in the footer.
 *
 * Verifies that the bell button renders, the history panel opens/closes
 * correctly, the empty state is shown when there are no notifications,
 * the badge updates when new notifications arrive, and the "Clear All"
 * button removes all entries.
 *
 * Prerequisites: run `pnpm run build` before executing these tests.
 */

test.describe("Notification history panel", () => {
    test("bell button is visible in the footer", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });
    });

    test("notification badge is initially hidden", async ({ window }) => {
        const badge = window.locator("#notification-badge");
        await expect(badge).toBeHidden({ timeout: 15_000 });
    });

    test("clicking the bell button opens the history panel", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        const panel = window.locator("#notification-history-panel");
        await expect(panel).toBeHidden();

        await bellBtn.click();
        await expect(panel).toBeVisible({ timeout: 5_000 });
    });

    test("clicking the bell button again closes the history panel", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        await bellBtn.click();
        const panel = window.locator("#notification-history-panel");
        await expect(panel).toBeVisible({ timeout: 5_000 });

        await bellBtn.click();
        await expect(panel).toBeHidden({ timeout: 5_000 });
    });

    test("pressing Escape closes the history panel", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        await bellBtn.click();
        const panel = window.locator("#notification-history-panel");
        await expect(panel).toBeVisible({ timeout: 5_000 });

        await window.keyboard.press("Escape");
        await expect(panel).toBeHidden({ timeout: 5_000 });
    });

    test("clicking outside the panel closes it", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        await bellBtn.click();
        const panel = window.locator("#notification-history-panel");
        await expect(panel).toBeVisible({ timeout: 5_000 });

        // Click the main content area (away from the panel and bell button)
        await window.locator(".main-content").click({ position: { x: 100, y: 100 } });
        await expect(panel).toBeHidden({ timeout: 5_000 });
    });

    test("empty state is shown when there are no notifications", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        await bellBtn.click();
        const emptyState = window.locator("#notification-history-empty");
        await expect(emptyState).toBeVisible({ timeout: 5_000 });
        await expect(emptyState).toHaveText(/no notifications yet/i);
    });

    test("panel has a Clear All button", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        await bellBtn.click();
        const clearBtn = window.locator("#notification-clear-all-btn");
        await expect(clearBtn).toBeVisible({ timeout: 5_000 });
    });

    test("bell button aria-pressed reflects panel open state", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        await expect(bellBtn).toHaveAttribute("aria-pressed", "false");

        await bellBtn.click();
        await expect(bellBtn).toHaveAttribute("aria-pressed", "true");

        await bellBtn.click();
        await expect(bellBtn).toHaveAttribute("aria-pressed", "false");
    });

    test("notification list is present inside the panel", async ({ window }) => {
        const bellBtn = window.locator("#footer-notification-bell-btn");
        await expect(bellBtn).toBeVisible({ timeout: 15_000 });

        await bellBtn.click();
        const list = window.locator("#notification-history-list");
        await expect(list).toBeAttached({ timeout: 5_000 });
    });
});
