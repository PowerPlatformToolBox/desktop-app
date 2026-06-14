import { test as base, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import path from "path";

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

export const test = base.extend<AppFixtures>({
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
        // Wait for the first BrowserWindow to be visible
        const win = await electronApp.firstWindow();
        await win.waitForLoadState("domcontentloaded");
        await use(win);
    },
});

export { expect };
