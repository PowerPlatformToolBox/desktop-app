import type { Locator } from "playwright";
import { expect, test } from "./fixtures";

test.use({ maturityData: true });

const verifiedDescription = "Verified tools have passed Power Platform ToolBox quality and safety checks.";

async function getToolIds(locator: Locator): Promise<string[]> {
    return locator.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-tool-id") || ""));
}

test.describe("Tool maturity", () => {
    test("Marketplace badges and sorts Verified tools first", async ({ electronApp, window }) => {
        const testEnvironment = await electronApp.evaluate(() => ({
            mode: process.env.PPTB_TEST_MODE,
            registryPath: process.env.PPTB_TEST_REGISTRY_PATH,
            toolsDirectory: process.env.PPTB_TEST_TOOLS_DIRECTORY,
        }));
        expect(testEnvironment.mode).toBe("1");
        expect(testEnvironment.registryPath).toContain("maturity-registry.json");
        expect(testEnvironment.toolsDirectory).toContain("pptb-maturity-e2e-");

        await window.locator('[data-sidebar="marketplace"]').click();

        const cards = window.locator("#marketplace-tools-list .marketplace-item-pptb");
        await expect(cards).toHaveCount(4);
        await expect.poll(() => getToolIds(cards)).toEqual(["bravo-verified", "zulu-verified", "alpha-unverified", "community-recommended"]);

        const verifiedBadges = window.locator("#marketplace-tools-list .tool-verified-badge");
        await expect(verifiedBadges).toHaveCount(2);
        await expect(verifiedBadges.first()).toHaveAttribute("aria-label", verifiedDescription);
        await expect(window.locator('#marketplace-tools-list [data-tool-id="bravo-verified"] .marketplace-item-name-pptb > .tool-verified-badge')).toHaveCount(1);
        await expect(window.locator('#marketplace-tools-list .marketplace-item-pptb[data-tool-id="bravo-verified"]')).toHaveClass(/\bverified\b/);
        await expect(window.locator('#marketplace-tools-list .marketplace-item-pptb[data-tool-id="alpha-unverified"]')).not.toHaveClass(/\bverified\b/);
        await expect(window.locator('[data-tool-id="alpha-unverified"] .tool-verified-badge')).toHaveCount(0);
        await expect(window.locator('[data-tool-id="community-recommended"] .tool-verified-badge')).toHaveCount(0);
    });

    test("Marketplace Verified-only filter supports its empty state", async ({ window }) => {
        await window.locator('[data-sidebar="marketplace"]').click();
        await window.locator("#marketplace-filter-btn").click();
        await window.locator("#marketplace-verified-only-filter").check();

        const cards = window.locator("#marketplace-tools-list .marketplace-item-pptb");
        await expect(cards).toHaveCount(2);
        await expect.poll(() => getToolIds(cards)).toEqual(["bravo-verified", "zulu-verified"]);

        await window.locator("#marketplace-search-input").fill("Alpha");
        await expect(window.locator("#marketplace-tools-list .empty-state")).toBeVisible();
        await expect(window.locator("#marketplace-tools-list")).toContainText("No matching tools");
    });

    test("Installed view badges, filters, and sorts by maturity", async ({ window }) => {
        const rows = window.locator("#sidebar-tools-list .tool-item-pptb");
        await expect(rows).toHaveCount(2);
        await expect(window.locator('#sidebar-tools-list [data-tool-id="zulu-verified"] .tool-item-name-pptb > .tool-verified-badge')).toHaveAttribute("aria-label", verifiedDescription);
        await expect(window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="zulu-verified"]')).toHaveClass(/\bverified\b/);
        await expect(window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="alpha-unverified"]')).not.toHaveClass(/\bverified\b/);
        await expect(window.locator('#sidebar-tools-list [data-tool-id="alpha-unverified"] .tool-verified-badge')).toHaveCount(0);

        await window.locator("#tools-filter-btn").click();
        await window.locator("#tools-sort-select").selectOption("maturity");
        await expect.poll(() => getToolIds(rows)).toEqual(["zulu-verified", "alpha-unverified"]);

        await window.locator("#tools-verified-only-filter").check();
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toHaveAttribute("data-tool-id", "zulu-verified");

        await window.locator("#tools-search-input").fill("Alpha");
        await expect(window.locator("#sidebar-tools-list .empty-state")).toBeVisible();
        await expect(window.locator("#sidebar-tools-list")).toContainText("No matching tools");
    });
});
