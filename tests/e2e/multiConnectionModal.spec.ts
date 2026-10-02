import type { ElectronApplication, Page } from "playwright";
import { expect, test } from "./fixtures";

test.use({ multiConnectionData: true });

async function findWindowWithSelector(windows: Page[], selector: string): Promise<Page | null> {
    for (const page of windows) {
        if ((await page.locator(selector).count()) > 0) return page;
    }
    return null;
}

async function launchFixtureTool(window: Page, electronApp: ElectronApplication, toolId: string): Promise<Page> {
    const sidebar = window.locator("#sidebar");
    if (await sidebar.evaluate((element) => element.classList.contains("collapsed"))) {
        await window.locator('[data-sidebar="tools"]').click();
    }
    const toolRow = window.locator(`#sidebar-tools-list .tool-item-pptb[data-tool-id="${toolId}"]`);
    await expect(toolRow).toBeVisible({ timeout: 10_000 });
    await toolRow.click();

    let modalWindow: Page | null = null;
    await expect
        .poll(
            async () => {
                modalWindow = await findWindowWithSelector(electronApp.windows(), "#connection-slot-rail");
                return modalWindow !== null;
            },
            { timeout: 10_000 },
        )
        .toBe(true);
    return modalWindow!;
}

async function launchSingleConnectionFixtureTool(window: Page, electronApp: ElectronApplication): Promise<Page> {
    const sidebar = window.locator("#sidebar");
    if (await sidebar.evaluate((element) => element.classList.contains("collapsed"))) {
        await window.locator('[data-sidebar="tools"]').click();
    }
    const toolRow = window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="e2e-single-connection"]');
    await expect(toolRow).toBeVisible({ timeout: 10_000 });
    await toolRow.click();
    let modalWindow: Page | null = null;
    await expect
        .poll(
            async () => {
                modalWindow = await findWindowWithSelector(electronApp.windows(), "#connections-list-container");
                return modalWindow !== null;
            },
            { timeout: 10_000 },
        )
        .toBe(true);
    return modalWindow!;
}

async function expandToolsSidebar(window: Page): Promise<void> {
    const sidebar = window.locator("#sidebar");
    if (await sidebar.evaluate((element) => element.classList.contains("collapsed"))) {
        await window.locator('[data-sidebar="tools"]').click();
    }
}

test.describe("Multi-connection selection modal", () => {
    test("shows the required slots for an existing two-connection declaration", async ({ electronApp, window }) => {
        const modal = await launchFixtureTool(window, electronApp, "e2e-required-connections");

        await expect(modal.locator("[data-slot-row]")).toHaveCount(2);
        await expect(modal.locator(".connection-badge.required")).toHaveCount(2);
        await expect(modal.locator("#slot-connection-list .connection-item")).toHaveCount(2);
        await expect(modal.locator("#slot-connection-list")).toContainText("E2E Development");
        await expect(modal.locator("#slot-connection-list")).toContainText("E2E Test");
        await expect(modal.locator("#confirm-multi-connection-btn")).toBeDisabled();
        await modal.locator(".slot-impersonate-checkbox").first().check();
        const impersonationIcon = modal.locator('[data-slot-row="0"] .connection-slot-impersonation-icon');
        await expect(impersonationIcon).toBeVisible();
        await expect(impersonationIcon).toHaveAttribute("src", /^data:image\/svg\+xml,/);
        await expect.poll(() => impersonationIcon.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
        await modal.locator("#cancel-select-multi-connection-btn").click();
    });

    test("adds optional slots up to the declared maximum", async ({ electronApp, window }) => {
        const modal = await launchFixtureTool(window, electronApp, "e2e-optional-connections");

        await expect(modal.locator("[data-slot-row]")).toHaveCount(1);
        await expect(modal.locator(".connection-badge.required")).toHaveCount(1);
        const addButton = modal.locator("#add-connection-slot-btn");
        await expect(addButton).toBeEnabled();
        await addButton.click();

        await expect(modal.locator("[data-slot-row]")).toHaveCount(2);
        await expect(modal.locator(".connection-badge.optional")).toHaveCount(1);
        await expect(modal.locator("#add-connection-slot-btn")).toBeDisabled();
        await expect(modal.locator("#confirm-multi-connection-btn")).toBeDisabled();
        await modal.locator('[data-clear-slot="1"]').click();
        await expect(modal.locator('[data-slot-row="1"] .connection-slot-copy small')).toHaveText("Not selected");
        await expect(modal.locator("[data-slot-row]")).toHaveCount(2);
        await expect(modal.locator("#add-connection-slot-btn")).toBeDisabled();
        await modal.locator("#cancel-select-multi-connection-btn").click();
    });

    test("keeps undeclared connection features on the single-connection picker", async ({ electronApp, window }) => {
        const modal = await launchSingleConnectionFixtureTool(window, electronApp);

        await expect(modal.locator("#connections-list-container")).toBeVisible();
        await expect(modal.locator("#connection-slot-rail")).toHaveCount(0);
        await modal.locator("#cancel-select-connection-btn").click();
    });

    test("launches a zero-connection tool without opening a picker", async ({ electronApp, window }) => {
        await expandToolsSidebar(window);
        await window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="e2e-no-connection"]').click();

        await expect(window.locator("#tool-tabs")).toContainText("E2E No Connection", { timeout: 10_000 });
        await expect(window.locator("#connection-status")).toBeHidden();
        await expect(window.locator("#connection-slot-squares")).toHaveAttribute("role", "toolbar");
        await expect(window.locator("#connection-slot-squares")).toHaveAttribute("aria-live", "polite");
        await expect(window.locator("#connection-slot-squares .connection-slot-square")).toHaveCount(0);
        await expect
            .poll(async () => {
                const windows = electronApp.windows();
                for (const page of windows) {
                    if ((await page.locator("#connection-slot-rail, #connections-list-container").count()) > 0) return true;
                }
                return false;
            })
            .toBe(false);
    });
});
