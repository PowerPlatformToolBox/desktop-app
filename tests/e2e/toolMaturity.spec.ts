import type { Locator } from "playwright";
import { expect, test } from "./fixtures";

test.use({ maturityData: true });

const verifiedDescription = "Verified tools have passed Power Platform ToolBox quality and safety checks.";

async function getToolIds(locator: Locator): Promise<string[]> {
    return locator.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-tool-id") || ""));
}

test.describe("Tool maturity", () => {
    for (const fail of [false, true]) {
        test(`bulk-update ${fail ? "failure" : "success"} summaries can be dismissed without returning on refresh`, async ({ electronApp, window }) => {
            await electronApp.evaluate(({ ipcMain }, fail) => {
                let updated = false;
                ipcMain.removeHandler("check-tool-updates");
                ipcMain.handle("check-tool-updates", () => ({ hasUpdate: !updated, latestVersion: "2.0.0" }));
                ipcMain.removeHandler("update-tool");
                ipcMain.handle("update-tool", async () => {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    if (fail) throw new Error("Test update failure");
                    updated = true;
                    return { version: "2.0.0" };
                });
            }, fail);
            await window.reload();
            await window.locator("#sidebar-update-all-tools-btn").click();
            const summary = window.locator("#sidebar-bulk-update-status");
            const dismiss = window.getByRole("button", { name: "Dismiss update summary" });
            await expect(summary).toBeVisible();
            await expect(dismiss).toBeHidden();
            await expect(dismiss).toBeVisible({ timeout: 15000 });
            await expect(window.locator("#sidebar-bulk-update-message")).toContainText(fail ? "need attention" : "updated successfully");
            if (fail) await expect(window.locator("#sidebar-bulk-update-retry")).toBeVisible();
            await dismiss.click();
            await expect(summary).toBeHidden();
            await window.locator("#tools-search-input").fill("Zulu");
            await expect(summary).toBeHidden();
        });
    }

    test("Verified status only adds a badge, not special card styling", async ({ window }) => {
        for (const section of ["tools", "marketplace"]) {
            if (section === "marketplace") await window.locator('[data-sidebar="marketplace"]').click();
            const card = window.locator(section === "tools" ? "#sidebar-tools-list .tool-item-pptb.verified" : "#marketplace-tools-list .marketplace-item-pptb.verified").first();
            await expect(card.locator(".tool-verified-badge")).toHaveCount(1);
            for (const hovered of [false, true]) {
                if (hovered) await card.hover();
                const styles = await card.evaluate((element) => {
                    const previousStyle = element.getAttribute("style");
                    (element as HTMLElement).style.transition = "none";
                    const readStyle = () => {
                        const style = getComputedStyle(element);
                        return { border: style.borderColor, background: style.backgroundColor, shadow: style.boxShadow };
                    };
                    const verified = readStyle();
                    element.classList.remove("verified");
                    const ordinary = readStyle();
                    element.classList.add("verified");
                    if (previousStyle === null) element.removeAttribute("style");
                    else element.setAttribute("style", previousStyle);
                    return { verified, ordinary };
                });
                expect(styles.verified).toEqual(styles.ordinary);
            }
        }
    });

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

    test("Tool Details displays the modern connection range", async ({ window }) => {
        await window.locator('[data-sidebar="marketplace"]').click();

        await window.locator('#marketplace-tools-list .marketplace-item-pptb[data-tool-id="bravo-verified"]').click();
        const details = window.locator("#tool-detail-content-panel");
        await expect(details).toContainText("Connections: 1–5");
    });

    test("Tool Details preserves legacy connection range behavior", async ({ window }) => {
        await window.locator('[data-sidebar="marketplace"]').click();
        await window.locator('#marketplace-tools-list .marketplace-item-pptb[data-tool-id="alpha-unverified"]').click();
        await expect(window.locator("#tool-detail-content-panel")).toContainText("Connections: 1–2");
    });

    test("Tool Details displays tools that never need a connection", async ({ window }) => {
        await window.locator('[data-sidebar="marketplace"]').click();
        await window.locator('#marketplace-tools-list .marketplace-item-pptb[data-tool-id="zulu-verified"]').click();
        await expect(window.locator("#tool-detail-content-panel")).toContainText("Connections: None");
    });

    test("Tool Details defaults undeclared connections to one required connection", async ({ window }) => {
        await window.locator('[data-sidebar="marketplace"]').click();
        await window.locator('#marketplace-tools-list .marketplace-item-pptb[data-tool-id="community-recommended"]').click();
        await expect(window.locator("#tool-detail-content-panel")).toContainText("Connections: 1");
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
