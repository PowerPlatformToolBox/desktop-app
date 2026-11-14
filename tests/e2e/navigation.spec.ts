import type { Page } from "playwright";
import fs from "fs";
import path from "path";
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
    test("homepage values stay aligned with wrapped labels and use two columns at medium widths", async ({ electronApp, window }) => {
        await electronApp.evaluate(({ BrowserWindow }) => {
            const main = BrowserWindow.getAllWindows().find((candidate) => /Power Platform ToolBox/i.test(candidate.getTitle()));
            main?.setSize(1600, 1000);
        });
        const stats = window.locator(".homepage-hero-stats");
        await expect.poll(() => stats.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(4);
        await window.locator("#stat-mcp .hero-stat-label").evaluate((element) => {
            element.textContent = "MCP Enabled\nTools";
            element.style.whiteSpace = "pre-line";
        });
        const tops = await window.locator(".hero-stat-value").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
        await electronApp.evaluate(({ BrowserWindow }) => {
            const main = BrowserWindow.getAllWindows().find((candidate) => /Power Platform ToolBox/i.test(candidate.getTitle()));
            main?.setSize(1100, 900);
        });
        await expect.poll(() => stats.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
        const positions = await window.locator(".hero-stat").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
        expect(positions[0]).toBe(positions[1]);
        expect(positions[2]).toBe(positions[3]);
        expect(positions[2]).toBeGreaterThan(positions[0]);
    });

    test("homepage shows loading states, honest failures, and first-time setup actions", async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }) => {
            ipcMain.removeHandler("get-all-tools");
            ipcMain.handle("get-all-tools", () => []);
            ipcMain.removeHandler("get-connections");
            ipcMain.handle("get-connections", () => []);
            ipcMain.removeHandler("fetch-registry-tools");
            ipcMain.handle("fetch-registry-tools", async () => {
                await new Promise((resolve) => setTimeout(resolve, 1500));
                throw new Error("Registry unavailable in test");
            });
        });
        await window.reload({ waitUntil: "domcontentloaded" });
        await expect(window.locator("#stat-available-count")).toHaveText("Loading");
        await expect(window.locator("#stat-available-count")).toHaveAttribute("aria-busy", "true");
        await expect(window.locator("#stat-available-count")).toHaveText("Unavailable", { timeout: 15000 });
        await expect(window.locator("#stat-mcp-count")).toHaveText("Unavailable");
        await expect(window.locator("#stat-installed-count")).toHaveText("0");
        await expect(window.locator("#stat-connections-count")).toHaveText("0");
        await expect(window.locator("#stat-available-count")).toHaveAttribute("aria-busy", "false");
        await expect(window.locator("#homepage-first-tool")).toBeVisible();
        await expect(window.locator("#homepage-first-connection")).toBeVisible();
        await window.locator("#homepage-install-first-btn").click();
        await expect(window.locator("#sidebar-marketplace.active")).toBeVisible();
        await window.locator("#homepage-updates-btn").click();
        await expect(window.locator("#sidebar-tools.active")).toBeVisible();
        await expect(window.locator("#tools-update-required-filter")).toBeChecked();
        await expect(window.locator("#tools-search-input")).toHaveValue("");
        await window.locator("#homepage-add-first-connection-btn").click();
        let connectionModal: Page | undefined;
        await expect
            .poll(async () => {
                for (const page of electronApp.windows()) {
                    if (page !== window && (await page.locator("#connection-name").isVisible())) {
                        connectionModal = page;
                        return true;
                    }
                }
                return false;
            })
            .toBe(true);
        await connectionModal!.locator("#close-connection-modal").click();
    });

    test("homepage hides setup prompts for existing users and updates shortcut resets competing filters", async ({ electronApp, window }) => {
        await electronApp.evaluate(({ ipcMain }) => {
            ipcMain.removeHandler("get-all-tools");
            ipcMain.handle("get-all-tools", () => [{ id: "setup-test-tool", name: "Setup Test", version: "1.0.0", categories: [], authors: [] }]);
            ipcMain.removeHandler("get-connections");
            ipcMain.handle("get-connections", () => [{ id: "setup-test-connection", name: "Setup Test" }]);
            ipcMain.removeHandler("check-tool-updates");
            ipcMain.handle("check-tool-updates", () => ({ hasUpdate: true, latestVersion: "2.0.0" }));
            ipcMain.removeHandler("is-tool-updating");
            ipcMain.handle("is-tool-updating", () => false);
        });
        await window.reload();
        await expect(window.locator("#stat-installed-count")).toHaveText("1");
        await expect(window.locator("#homepage-first-tool")).toBeHidden();
        await expect(window.locator("#homepage-first-connection")).toBeHidden();
        await expect(window.locator("#homepage-updates-btn")).toHaveText("Updates available (1)");
        await window.locator("#stat-installed").click();
        await window.locator("#tools-search-input").fill("no matches");
        await window.locator("#tools-mcp-enabled-filter").evaluate((element: HTMLInputElement) => {
            element.checked = true;
        });
        await window.locator("#homepage-updates-btn").click();
        await expect(window.locator("#tools-search-input")).toHaveValue("");
        await expect(window.locator("#tools-mcp-enabled-filter")).not.toBeChecked();
        await expect(window.locator("#tools-update-required-filter")).toBeChecked();
        await expect(window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="setup-test-tool"]')).toBeVisible();
    });

    test("homepage statistics are accessible shortcuts and never collapse the selected sidebar", async ({ window }) => {
        await expect(window.locator("#home-view")).toBeVisible();
        await expect(window.locator("#connection-status")).toBeHidden();

        for (const [cardId, sidebarId] of [
            ["stat-installed", "tools"],
            ["stat-available", "marketplace"],
            ["stat-mcp", "marketplace"],
            ["stat-connections", "connections"],
        ]) {
            const card = window.locator(`#${cardId}`);
            await card.focus();
            await card.press("Enter");
            await expect(window.locator(`#sidebar-${sidebarId}.active`)).toBeVisible();
            await card.click();
            await expect(window.locator("#sidebar")).not.toHaveClass(/collapsed/);
        }
        await window.locator("#stat-mcp").click();
        await expect(window.locator("#marketplace-mcp-enabled-filter")).toBeChecked();
        await window.locator("#stat-available").click();
        await expect(window.locator("#marketplace-mcp-enabled-filter")).not.toBeChecked();
    });

    test("non-tool tabs hide the primary connection badge", async ({ window }) => {
        await window.locator("#settings-activity-btn").click();
        await expect(window.locator("#settings-tab-scroll-area")).toBeVisible();
        await expect(window.locator("#connection-status")).toBeHidden();
        await expect(window.locator("#connection-slot-squares")).toBeEmpty();
    });

    test("sponsors render the current API envelope as a marquee, and failures can be retried", async ({ electronApp, window }) => {
        const sponsors = ["Sponsor One", "Sponsor Two"].map((name, index) => ({
            name,
            login: `sponsor-${index}`,
            avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
            githubUrl: `https://github.com/sponsor-${index}`,
            tier: "$10 a month",
            monthlyAmount: 10,
            isActive: true,
            isOneTime: false,
            totalContributed: 10,
        }));
        await electronApp.evaluate(({ ipcMain }, sponsors) => {
            ipcMain.removeHandler("fetch-sponsors");
            ipcMain.handle("fetch-sponsors", () => ({ sponsors, privateSponsorCount: 2 }));
        }, sponsors);
        await window.reload();
        await expect(window.locator("#homepage-sponsors-section")).toBeVisible();
        await expect(window.locator("#homepage-sponsors-count")).toHaveText("2 public sponsors + 2 private");
        await expect(window.locator(".sponsor-marquee-group")).toHaveCount(2);
        await expect(window.locator('.sponsor-marquee-group[aria-hidden="false"] .sponsor-card')).toHaveCount(2);
        await expect(window.locator('.sponsor-marquee-group[aria-hidden="true"] .sponsor-card').first()).toHaveAttribute("tabindex", "-1");

        await electronApp.evaluate(({ ipcMain }) => {
            ipcMain.removeHandler("fetch-sponsors");
            ipcMain.handle("fetch-sponsors", () => {
                throw new Error("Sponsor test outage");
            });
        });
        await window.reload();
        const retry = window.getByRole("button", { name: "Unable to load sponsors. Retry" });
        await expect(retry).toBeVisible();
        await electronApp.evaluate(({ ipcMain }, sponsors) => {
            ipcMain.removeHandler("fetch-sponsors");
            ipcMain.handle("fetch-sponsors", () => sponsors);
        }, sponsors);
        await retry.click();
        await expect(window.locator(".sponsor-marquee-group")).toHaveCount(2);
        await expect(retry).toHaveCount(0);
    });

    for (const daysSinceVisit of [2, 10]) {
        test(`homepage and marketplace agree on new tools after a ${daysSinceVisit}-day absence`, async ({ electronApp, window }) => {
            const now = Date.now();
            const tools = [1, 6, 9, 11].map((age) => ({
                id: `new-window-${age}`,
                name: `Tool aged ${age} days`,
                version: "1.0.0",
                description: "New tools discovery test",
                authors: ["Test Author"],
                categories: ["Test"],
                createdAt: new Date(now - age * 86400000).toISOString(),
                mcpHeadlessEnabled: age === 1,
            }));
            const userDataPath = await electronApp.evaluate(({ app }) => app.getPath("userData"));
            const settingsPath = path.join(userDataPath, "user-settings.json");
            const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
            settings.previousAppOpenedAt = new Date(now - daysSinceVisit * 86400000).toISOString();
            fs.writeFileSync(settingsPath, JSON.stringify(settings));
            await electronApp.evaluate(({ ipcMain }, tools) => {
                ipcMain.removeHandler("fetch-registry-tools");
                ipcMain.handle("fetch-registry-tools", () => tools);
            }, tools);
            await window.reload();
            const expectedCount = daysSinceVisit === 10 ? 3 : 2;
            const banner = window.locator("#new-tools-notification");
            await expect(banner).toContainText(`${expectedCount} new tools added`);
            await expect(banner).toContainText(daysSinceVisit === 10 ? "since your last visit on" : "in the last 7 days");
            await expect(window.locator("#stat-mcp-count")).toHaveText("1");
            await banner.click();
            await expect(window.locator(".marketplace-item-pptb")).toHaveCount(expectedCount);
            await expect(window.locator("#marketplace-new-filter")).toBeChecked();
        });
    }
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

    test("color thickness controls follow their corresponding color settings", async ({ window }) => {
        await window.locator("#settings-activity-btn").click();

        const categoryColor = window.locator("#sidebar-show-category-color-check");
        const categoryThickness = window.locator("#sidebar-category-color-thickness");
        const environmentColor = window.locator("#sidebar-show-environment-color-check");
        const environmentThickness = window.locator("#sidebar-environment-color-thickness");

        await expect(categoryThickness).toBeEnabled({ timeout: 10_000 });
        await expect(environmentThickness).toBeEnabled({ timeout: 10_000 });

        await categoryColor.uncheck();
        await expect(categoryThickness).toBeDisabled();
        await expect(environmentThickness).toBeEnabled();

        await environmentColor.uncheck();
        await expect(environmentThickness).toBeDisabled();

        await categoryColor.check();
        await expect(categoryThickness).toBeEnabled();
        await expect(environmentThickness).toBeDisabled();
    });

    test("color thickness rejects invalid keyboard input and only saves whole numbers from 1 to 10", async ({ electronApp, window }) => {
        await window.locator("#settings-activity-btn").click();
        const userDataPath = await electronApp.evaluate(({ app }) => app.getPath("userData"));
        const readSettings = (): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(userDataPath, "user-settings.json"), "utf8"));
        const saveButton = window.locator("#sidebar-save-settings-btn");
        const controls = [
            { id: "#sidebar-category-color-thickness", key: "categoryColorThickness" },
            { id: "#sidebar-environment-color-thickness", key: "environmentColorThickness" },
        ];

        for (const { id } of controls) {
            await window.locator(id).fill("6");
        }
        await saveButton.click();
        await expect.poll(() => controls.map(({ key }) => readSettings()[key])).toEqual([6, 6]);

        for (const { id, key } of controls) {
            const input = window.locator(id);
            for (const invalidValue of ["500", "0", "-1", "1.5", ""]) {
                await input.fill("");
                if (invalidValue) await input.pressSequentially(invalidValue);
                await saveButton.click();

                await expect(input).toHaveValue(invalidValue);
                expect(await input.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(false);
                expect(readSettings()[key]).toBe(6);
            }
            await input.fill("6");
        }

        for (const validValue of ["1", "10"]) {
            for (const { id } of controls) {
                await window.locator(id).fill(validValue);
            }
            await saveButton.click();
            await expect.poll(() => controls.map(({ key }) => readSettings()[key])).toEqual([Number(validValue), Number(validValue)]);
        }
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
        const cspTab = window.getByRole("tab", { name: /CSP Exceptions/ });
        await expect(cspTab).toHaveAttribute("aria-selected", "true");
        await expect(cspTab).toHaveCSS("font-size", "12px");
        await expect(cspTab).toHaveCSS("border-top-style", "solid");
        const dataverseTab = window.getByRole("tab", { name: /Dataverse Headers/ });
        await expect(dataverseTab).toBeVisible();
        await dataverseTab.click();
        await expect(dataverseTab).toHaveAttribute("aria-selected", "true");

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

    test("global search filters settings through category tabs", async ({ window }) => {
        await window.keyboard.press("Meta+Shift+P");

        const overlay = window.locator("#global-search-overlay");
        const input = window.locator("#global-search-input");
        await expect(overlay).toBeVisible({ timeout: 10_000 });
        await input.fill("Theme");

        const settingsTab = window.getByRole("tab", { name: /Settings/ });
        await expect(settingsTab).toContainText("1");
        await settingsTab.click();
        await expect(settingsTab).toHaveAttribute("aria-selected", "true");
        await expect(window.locator("#global-search-results")).toContainText("Theme");

        const installedTab = window.getByRole("tab", { name: /Installed Tools/ });
        await installedTab.click();
        await expect(installedTab).toHaveAttribute("aria-selected", "true");
        await expect(window.locator("#global-search-results")).toContainText('No results for "Theme"');

        await window.keyboard.press("Escape");
    });
});
