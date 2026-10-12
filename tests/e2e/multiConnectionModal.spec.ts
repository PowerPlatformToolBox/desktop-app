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

async function executeInToolView<T>(electronApp: ElectronApplication, instanceId: string, fixtureMarker: string, script: string, connectionIds?: Array<string | null>): Promise<T> {
    return electronApp.evaluate(
        async ({ BrowserWindow }, payload) => {
            const mainWindow = BrowserWindow.getAllWindows().find((candidate) => candidate.getTitle().includes("Power Platform ToolBox"));
            if (!mainWindow) throw new Error("Main ToolBox window not found");

            if (payload.connectionIds) {
                await mainWindow.webContents.executeJavaScript(`window.toolboxAPI.updateToolConnections(${JSON.stringify(payload.instanceId)}, ${JSON.stringify(payload.connectionIds)})`);
            }

            for (const view of mainWindow.getBrowserViews()) {
                const containsFixture = await view.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(payload.fixtureMarker)})`).catch(() => false);
                if (containsFixture) return view.webContents.executeJavaScript(`(async () => { ${payload.script} })()`);
            }

            throw new Error(`Tool BrowserView not found for fixture: ${payload.fixtureMarker}`);
        },
        { instanceId, fixtureMarker, script, connectionIds },
    ) as Promise<T>;
}

test.describe("Multi-connection selection modal", () => {
    test("shows the required slots for an existing two-connection declaration", async ({ electronApp, window }) => {
        const modal = await launchFixtureTool(window, electronApp, "e2e-required-connections");

        await expect(modal.locator("[data-slot-row]")).toHaveCount(2);
        await expect(modal.locator(".connection-badge.required")).toHaveCount(2);
        await expect(modal.locator(".slot-connections-pane #multi-connection-search")).toHaveCount(1);
        await expect(modal.locator("#active-connection-slot-label")).toHaveCount(0);
        await expect(modal.locator(".connection-slot-copy strong")).toHaveCount(2);
        await expect(modal.locator("#slot-connection-list .connection-item")).toHaveCount(4);
        await expect(modal.locator("#slot-connection-list")).toContainText("E2E Development");
        await expect(modal.locator("#slot-connection-list")).toContainText("E2E Test");
        const scrollMetrics = await modal.evaluate(() => {
            const body = document.querySelector(".modal-body")!;
            const list = document.querySelector("#slot-connection-list")!;
            list.querySelectorAll<HTMLElement>(".connection-item").forEach((item) => (item.style.minHeight = "220px"));
            return {
                bodyClientHeight: body.clientHeight,
                bodyScrollHeight: body.scrollHeight,
                listClientHeight: list.clientHeight,
                listScrollHeight: list.scrollHeight,
            };
        });
        expect(scrollMetrics.listScrollHeight).toBeGreaterThan(scrollMetrics.listClientHeight);
        expect(scrollMetrics.bodyScrollHeight).toBeLessThanOrEqual(scrollMetrics.bodyClientHeight);
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
        await expect(modal.locator("[data-slot-row]")).toHaveCount(1);
        await expect(modal.locator('[data-slot-row="1"]')).toHaveCount(0);
        await expect(modal.locator("#add-connection-slot-btn")).toBeEnabled();
        await modal.locator("#add-connection-slot-btn").click();
        await expect(modal.locator("[data-slot-row]")).toHaveCount(2);
        await modal.locator("#cancel-select-multi-connection-btn").click();
    });

    test("opens the multi-slot selector for a zero-to-three optional connection range", async ({ electronApp, window }) => {
        const modal = await launchFixtureTool(window, electronApp, "e2e-optional-zero-to-three");

        await expect(modal.locator(".info-message")).toContainText("Choose at least 0 connections");
        await expect(modal.locator(".info-message")).toContainText("up to 3 slots");
        await expect(modal.locator("[data-slot-row]")).toHaveCount(0);
        await expect(modal.locator("#add-connection-slot-btn")).toBeEnabled();
        await expect(modal.locator("#confirm-multi-connection-btn")).toBeEnabled();
        await modal.locator("#confirm-multi-connection-btn").click();

        await expect(window.locator("#tool-tabs")).toContainText("E2E Optional Zero To Three", { timeout: 10_000 });
        await expect(window.locator("#connection-status")).toContainText("not connected");
        await expect(window.locator('#connection-slot-squares [data-slot-index="1"]')).toHaveClass(/available/);
        await expect(window.locator('#connection-slot-squares [data-slot-index="2"]')).toHaveClass(/available/);
        await window.locator('#connection-slot-squares [data-slot-index="2"]').click();
        let connectionPicker: Page | null = null;
        await expect
            .poll(
                async () => {
                    connectionPicker = await findWindowWithSelector(electronApp.windows(), "#connections-list-container");
                    return connectionPicker !== null;
                },
                { timeout: 10_000 },
            )
            .toBe(true);
        await connectionPicker!.locator("#cancel-select-connection-btn").click();
    });

    test("routes tool connection access to slot four and rejects missing API targets clearly", async ({ electronApp, window }) => {
        const modal = await launchFixtureTool(window, electronApp, "e2e-api-four-connections");
        await expect(modal.locator(".info-message")).toContainText("up to 4 slots");
        await modal.locator("#confirm-multi-connection-btn").click();
        await expect(window.locator("#tool-tabs")).toContainText("E2E API Four Connections", { timeout: 10_000 });

        const toolInstanceId = await window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E API Four Connections" }).getAttribute("data-instance-id");
        expect(toolInstanceId).toBeTruthy();
        const connectionIds = ["e2e-dev-connection", null, "e2e-uat-connection", "e2e-production-connection"];
        const connectionResult = await executeInToolView<{
            connectionIds: Array<string | null>;
            fourthConnectionId: string | null;
            secondaryConnectionId: string | null;
            invalidTargetError: string;
        }>(
            electronApp,
            toolInstanceId!,
            "e2e-api-four-connections",
            `const connections = await window.toolboxAPI.connections.getConnections();
             let invalidTargetError = "";
             try { await window.toolboxAPI.connections.getConnection(-1); } catch (error) { invalidTargetError = error.message; }
             return {
                 connectionIds: connections.map((connection) => connection?.id ?? null),
                 fourthConnectionId: (await window.toolboxAPI.connections.getConnection(3))?.id ?? null,
                 secondaryConnectionId: (await window.toolboxAPI.connections.getConnection("secondary"))?.id ?? null,
                 invalidTargetError,
             };`,
            connectionIds,
        );

        expect(connectionResult.connectionIds).toEqual(connectionIds);
        expect(connectionResult.fourthConnectionId).toBe("e2e-production-connection");
        expect(connectionResult.secondaryConnectionId).toBeNull();
        expect(connectionResult.invalidTargetError).toContain("Invalid connection target");
    });

    test("rejects Dataverse and Power Platform calls with an unassigned target clearly", async ({ electronApp, window }) => {
        await expandToolsSidebar(window);
        await window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="e2e-no-connection"]').click();
        await expect(window.locator("#tool-tabs")).toContainText("E2E No Connection", { timeout: 10_000 });
        const toolInstanceId = await window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E No Connection" }).getAttribute("data-instance-id");
        expect(toolInstanceId).toBeTruthy();

        const apiErrors = await executeInToolView<{ dataverse: string; powerPlatform: string }>(
            electronApp,
            toolInstanceId!,
            "e2e-no-connection",
            `let dataverse = "";
             let powerPlatform = "";
             try { await window.dataverseAPI.retrieveMultiple("<fetch />", 3); } catch (error) { dataverse = error.message; }
             try { await window.powerplatformAPI.Analytics.Get("", 3); } catch (error) { powerPlatform = error.message; }
             return { dataverse, powerPlatform };`,
        );

        expect(apiErrors.dataverse).toContain("No connection slot 4 found");
        expect(apiErrors.powerPlatform).toContain("No connection slot 4 found");
    });

    test("passes inherited slot arrays through a successful inter-tool invocation", async ({ electronApp, window }) => {
        const modal = await launchFixtureTool(window, electronApp, "e2e-invocation-caller");
        await modal.locator("#confirm-multi-connection-btn").click();
        await expect(window.locator("#tool-tabs")).toContainText("E2E Invocation Caller", { timeout: 10_000 });
        const callerInstanceId = await window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E Invocation Caller" }).getAttribute("data-instance-id");
        expect(callerInstanceId).toBeTruthy();
        const connectionIds = ["e2e-dev-connection", "e2e-test-connection", "e2e-uat-connection", "e2e-production-connection"];

        const callerConnectionIds = await executeInToolView<Array<string | null>>(
            electronApp,
            callerInstanceId!,
            "e2e-invocation-caller",
            `return (await window.toolboxAPI.getToolContext()).connectionIds;`,
            connectionIds,
        );
        expect(callerConnectionIds).toEqual(connectionIds);

        await executeInToolView(
            electronApp,
            callerInstanceId!,
            "e2e-invocation-caller",
            `
            window.toolboxAPI.invocation.launchTool("e2e-invocation-callee").catch(() => {});
            return true;
        `,
            connectionIds,
        );

        const calleeTab = window.locator("#tool-tabs .tool-tab").filter({ hasText: "E2E Invocation Callee" });
        await expect(calleeTab).toBeVisible({ timeout: 10_000 });
        await expect(calleeTab.locator(".tool-tab-subtext")).toHaveAttribute("title", "E2E Development / E2E Test / E2E UAT / E2E Production");
        await calleeTab.locator(".tool-tab-close").click();
        await expect(window.locator("#tool-tabs")).toContainText("E2E Invocation Caller");
    });

    test("supports runtime slot arrays through the declared four-slot maximum", async ({ electronApp, window }) => {
        const modal = await launchFixtureTool(window, electronApp, "e2e-four-connection-range");

        await expect(modal.locator("[data-slot-row]")).toHaveCount(3);
        await expect(modal.locator(".info-message")).toContainText("up to 4 slots");
        await modal.locator("#add-connection-slot-btn").click();

        await expect(modal.locator("[data-slot-row]")).toHaveCount(4);
        await expect(modal.locator('[data-slot-row="3"]')).toBeVisible();
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
