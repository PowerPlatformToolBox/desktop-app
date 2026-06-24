import { test as base, expect } from "@playwright/test";
import path from "path";
import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";

/**
 * Extended Playwright test fixture that launches and tears down the Electron app.
 *
 * Each test file that imports `test` from this module gets a fresh Electron
 * process so tests are fully isolated.
 */

interface AppFixtures {
    electronApp: ElectronApplication;
    window: Page;
}

async function resolveMainWindow(electronApp: ElectronApplication): Promise<Page> {
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
        for (const candidate of electronApp.windows()) {
            try {
                const title = await candidate.title();
                const url = candidate.url();
                if (/Power Platform ToolBox/i.test(title) || /index\.html/i.test(url)) {
                    await candidate.waitForLoadState("domcontentloaded");
                    await expect(candidate.locator(".app-container")).toBeVisible({ timeout: 10_000 });
                    return candidate;
                }
            } catch {
                // Ignore transient windows that are not ready and keep scanning.
            }
        }

        await electronApp
            .waitForEvent("window", {
                timeout: 1_000,
            })
            .catch(() => {
                // A new window is not guaranteed on every iteration.
            });
    }

    const fallback = await electronApp.firstWindow();
    await fallback.waitForLoadState("domcontentloaded");
    await expect(fallback.locator(".app-container")).toBeVisible({ timeout: 10_000 });
    return fallback;
}

export const test = base.extend<AppFixtures>({
    // Playwright fixtures require object destructuring for the first argument.
    // eslint-disable-next-line no-empty-pattern
    electronApp: async ({}, use) => {
        const mainEntry = path.resolve(__dirname, "../../dist/main/index.js");

        const app = await electron.launch({
            args: [mainEntry],
            env: {
                ...process.env,
                // Prevent the app from opening the real OS keychain in CI
                NODE_ENV: "test",
                // Suppress update checks during e2e
                PPTB_DISABLE_AUTO_UPDATE: "1",
            },
        });

        await use(app);
        await app.close();
    },

    window: async ({ electronApp }, use) => {
        const win = await resolveMainWindow(electronApp);
        await use(win);
    },
});

export { expect };
