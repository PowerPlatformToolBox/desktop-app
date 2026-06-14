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
        const win = await electronApp.firstWindow();
        // firstWindow() may return while the BrowserWindow is still on about:blank
        // (before loadFile() navigates to index.html).  waitForURL ensures we're on
        // the actual renderer HTML before assertions run.
        await win.waitForURL(/index\.html/, { timeout: 30_000 });
        // Wait for all resources (CSS, JS) to finish loading so elements have
        // correct dimensions and are considered visible by Playwright.
        await win.waitForLoadState("load");
        await use(win);
    },
});

export { expect };
