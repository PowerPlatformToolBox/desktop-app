import type { ElectronApplication, Page } from "playwright";
import { expect } from "./fixtures";

export async function modalWith(app: ElectronApplication, selector = "#connection-slot-rail"): Promise<Page> {
    let modal: Page | undefined;
    await expect
        .poll(
            async () => {
                for (const candidate of app.windows())
                    if (
                        await candidate
                            .locator(selector)
                            .count()
                            .catch(() => 0)
                    ) {
                        modal = candidate;
                        return true;
                    }
                return false;
            },
            { timeout: 15000 },
        )
        .toBe(true);
    return modal!;
}

export async function stubSelectionAuthentication(app: ElectronApplication): Promise<void> {
    await app.evaluate(({ ipcMain }) => {
        (globalThis as any).selectionAuthIds = [];
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async (_event, id) => {
            (globalThis as any).selectionAuthIds.push(id);
        });
    });
}

export async function clickTool(window: Page, id = "e2e-scenario"): Promise<void> {
    if (!(await window.locator(`#sidebar-tools-list .tool-item-pptb[data-tool-id="${id}"]`).isVisible())) await window.locator('[data-sidebar="tools"]').click();
    await window.locator(`#sidebar-tools-list .tool-item-pptb[data-tool-id="${id}"]`).click();
}

export async function assign(modal: Page, index: number, id = "e2e-dev-connection"): Promise<void> {
    await modal.locator(`[data-slot-row="${index}"] .connection-slot-button`).click();
    await modal.locator(`.connect-button[data-connection-id="${id}"]`).click();
    await expect(modal.locator(`[data-slot-row="${index}"] .connection-slot-connected-check`)).toBeVisible();
}

export async function toolValue<T = unknown>(app: ElectronApplication, id: string, code: string): Promise<T> {
    return app.evaluate(
        async ({ BrowserWindow }, input) => {
            for (const main of BrowserWindow.getAllWindows())
                for (const view of main.getBrowserViews()) {
                    if (view.webContents.getURL().includes(input.id)) return view.webContents.executeJavaScript(`(async () => { ${input.code} })()`);
                }
            throw new Error(`Tool view missing: ${input.id}`);
        },
        { id, code },
    ) as Promise<T>;
}

export async function sessionSlots(window: Page, id = "e2e-scenario"): Promise<Array<string | null> | undefined> {
    return window.evaluate((id) => JSON.parse(localStorage.getItem("toolbox-session") ?? "{}").openTools?.find((entry: any) => entry.toolId === id)?.connectionIds, id);
}
