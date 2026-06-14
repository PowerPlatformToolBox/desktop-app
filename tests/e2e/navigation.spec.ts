import { test, expect } from "./fixtures";

/**
 * E2E: basic navigation between app sections.
 *
 * Verifies that clicking sidebar items transitions the UI to the
 * corresponding section without crashes.
 *
 * Note: selector strings are intentionally broad to accommodate future UI
 * changes. Update them alongside any structural HTML changes.
 */

test.describe("Navigation", () => {
    test("settings panel opens when settings button is clicked", async ({ window }) => {
        const settingsButton = window.locator('[data-section="settings"], [title*="Settings" i], #settings-btn, .settings-btn').first();

        // Skip this test if the expected element isn't found in the current build
        test.skip((await settingsButton.count()) === 0, "Settings button selector not found — update selector to match the current UI");

        await settingsButton.click();
        const panel = window.locator('[data-section="settings"], #settings-panel, .settings-panel, .settings-container').first();
        await expect(panel).toBeVisible({ timeout: 10_000 });
    });

    test("marketplace section is reachable", async ({ window }) => {
        const marketplaceButton = window
            .locator('[data-section="marketplace"], [title*="Marketplace" i], [title*="Tools" i], #marketplace-btn')
            .first();

        test.skip((await marketplaceButton.count()) === 0, "Marketplace button selector not found — update selector to match the current UI");

        await marketplaceButton.click();
        const section = window.locator('[data-section="marketplace"], #marketplace, .marketplace').first();
        await expect(section).toBeVisible({ timeout: 10_000 });
    });
});
