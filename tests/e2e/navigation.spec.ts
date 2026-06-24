import { expect, test } from "./fixtures";

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
    test("activity bar toggles sidebar collapse when active item is clicked", async ({ window }) => {
        const sidebar = window.locator("#sidebar");
        const toolsActivity = window.locator('[data-sidebar="tools"]');

        await expect(toolsActivity).toBeVisible({ timeout: 10_000 });
        await expect(sidebar).not.toHaveClass(/collapsed/);

        await toolsActivity.click();
        await expect(sidebar).toHaveClass(/collapsed/);

        await toolsActivity.click();
        await expect(sidebar).not.toHaveClass(/collapsed/);
    });

    test("settings panel opens when settings button is clicked", async ({ window }) => {
        const settingsButton = window.locator("#settings-activity-btn");
        await expect(settingsButton).toBeVisible({ timeout: 10_000 });
        await settingsButton.click();
        const settingsTab = window.locator("#settings-tab-scroll-area");
        await expect(settingsTab).toBeVisible({ timeout: 10_000 });
    });

    test("settings tab smoke renders key controls", async ({ window }) => {
        const settingsButton = window.locator("#settings-activity-btn");
        await settingsButton.click();

        await expect(window.locator("#settings-tab-scroll-area")).toBeVisible({ timeout: 10_000 });
        await expect(window.locator("#sidebar-theme-select")).toBeVisible({ timeout: 10_000 });
        await expect(window.locator("#sidebar-save-settings-btn")).toBeVisible({ timeout: 10_000 });
    });

    test("marketplace section is reachable", async ({ window }) => {
        const marketplaceButton = window.locator('[data-sidebar="marketplace"]');
        await expect(marketplaceButton).toBeVisible({ timeout: 10_000 });

        await marketplaceButton.click();
        const section = window.locator("#sidebar-marketplace.sidebar-content.active");
        await expect(section).toBeVisible({ timeout: 10_000 });
    });

    test("marketplace shows loaded content or empty state", async ({ window }) => {
        const marketplaceButton = window.locator('[data-sidebar="marketplace"]');
        await marketplaceButton.click();

        await expect(window.locator("#marketplace-search-input")).toBeVisible({ timeout: 10_000 });
        const marketplaceList = window.locator("#marketplace-tools-list");
        await expect(marketplaceList).toBeVisible({ timeout: 10_000 });

        await expect
            .poll(async () => {
                const itemCount = await marketplaceList.locator(".marketplace-item-pptb").count();
                const emptyStateCount = await marketplaceList.locator(".empty-state").count();
                return itemCount + emptyStateCount;
            })
            .toBeGreaterThan(0);
    });

    test("connections add flow opens and closes modal window", async ({ electronApp, window }) => {
        const connectionsButton = window.locator('[data-sidebar="connections"]');
        await connectionsButton.click();

        const addConnectionButton = window.locator("#sidebar-add-connection-btn");
        await expect(addConnectionButton).toBeVisible({ timeout: 10_000 });

        const [modalWindow] = await Promise.all([electronApp.waitForEvent("window", { timeout: 10_000 }), addConnectionButton.click()]);

        await modalWindow.waitForLoadState("domcontentloaded");
        await expect(modalWindow.locator("#connection-name")).toBeVisible({ timeout: 10_000 });
        await expect(modalWindow.locator("#connection-url")).toBeVisible({ timeout: 10_000 });

        await modalWindow.locator("#cancel-connection-btn").click();
        await expect(window.locator("#modal-backdrop")).toBeHidden({ timeout: 10_000 });
    });

    test("global search opens with keyboard shortcut and closes with escape", async ({ window }) => {
        await window.keyboard.press("Meta+Shift+P");

        const overlay = window.locator("#global-search-overlay");
        const input = window.locator("#global-search-input");
        await expect(overlay).toBeVisible({ timeout: 10_000 });
        await expect(input).toBeFocused({ timeout: 10_000 });

        await window.keyboard.press("Escape");
        await expect(overlay).toBeHidden({ timeout: 10_000 });
    });
});
