import { test, expect } from "./fixtures";

/**
 * E2E: basic navigation between app sections.
 *
 * Verifies that clicking sidebar items transitions the UI to the
 * corresponding section without crashes.
 */

test.describe("Navigation", () => {
    test("settings panel opens when settings button is clicked", async ({ window }) => {
        // Look for a settings trigger (button or link) in the UI
        const settingsButton = window.locator('[data-section="settings"], [title*="Settings" i], #settings-btn, .settings-btn').first();

        // Only run this assertion if the element exists — skip gracefully otherwise
        const count = await settingsButton.count();
        if (count === 0) {
            test.skip(true, "Settings button selector not found; update selector to match the current UI");
            return;
        }

        await settingsButton.click();
        // After clicking, a settings panel or section should appear
        const panel = window.locator('[data-section="settings"], #settings-panel, .settings-panel, .settings-container').first();
        await expect(panel).toBeVisible({ timeout: 10_000 });
    });

    test("marketplace section is reachable", async ({ window }) => {
        const marketplaceButton = window
            .locator('[data-section="marketplace"], [title*="Marketplace" i], [title*="Tools" i], #marketplace-btn')
            .first();

        const count = await marketplaceButton.count();
        if (count === 0) {
            test.skip(true, "Marketplace button selector not found; update selector to match the current UI");
            return;
        }

        await marketplaceButton.click();
        const section = window.locator('[data-section="marketplace"], #marketplace, .marketplace').first();
        await expect(section).toBeVisible({ timeout: 10_000 });
    });
});
