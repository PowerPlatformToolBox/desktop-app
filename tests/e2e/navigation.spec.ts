import type { Page } from "playwright";
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
    async function findWindowWithVisibleSelector(windows: Page[], selector: string): Promise<Page | null> {
        for (const page of windows) {
            const locator = page.locator(selector);
            const exists = (await locator.count()) > 0;
            if (!exists) continue;

            const isVisible = await locator
                .first()
                .isVisible()
                .catch(() => false);
            if (isVisible) return page;
        }
        return null;
    }

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

        await addConnectionButton.click();

        let modalWindow: Page | null = null;
        await expect
            .poll(
                async () => {
                    modalWindow = await findWindowWithVisibleSelector(electronApp.windows(), "#connection-name");
                    return modalWindow !== null;
                },
                {
                    timeout: 10_000,
                },
            )
            .toBe(true);

        await expect(modalWindow!.locator("#connection-name")).toBeVisible({ timeout: 10_000 });
        await expect(modalWindow!.locator("#connection-url")).toBeVisible({ timeout: 10_000 });

        const connectionName = `e2e-${Date.now()}`;
        await modalWindow!.locator("#connection-name").fill(connectionName);
        await modalWindow!.locator("#connection-url").fill("https://org.crm.dynamics.com");

        await modalWindow!.locator("#confirm-connection-btn").click();
        await expect(window.locator("#modal-backdrop")).toBeHidden({ timeout: 10_000 });
        await expect(window.locator("#sidebar-connections-list").getByText(connectionName, { exact: true })).toBeVisible({ timeout: 10_000 });
    });

    test("consent review opens directly in full view", async ({ window }) => {
        const consentButton = window.locator("#consent-review-activity-btn");
        await expect(consentButton).toBeVisible({ timeout: 10_000 });

        await consentButton.click();
        await expect(window.locator("#consent-review-tab-scroll-area")).toBeVisible({ timeout: 10_000 });
        await expect(window.locator("#sidebar-consents")).toHaveCount(0);
        await expect(window.locator("#consent-tab-search-input")).toBeVisible({ timeout: 10_000 });
        await expect(window.locator("#consent-tab-status-filter")).toBeVisible({ timeout: 10_000 });
        await expect(window.locator("#consent-tab-refresh-btn")).toBeVisible({ timeout: 10_000 });

        await window.locator("#consent-tab-status-filter").selectOption("revoked");
        await expect(window.locator("#consent-tab-status-filter")).toHaveValue("revoked");
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
