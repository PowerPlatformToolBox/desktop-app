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

async function dismissTelemetryConsentModalIfPresent(electronApp: ElectronApplication): Promise<void> {
    const deadline = Date.now() + 20_000;

    while (Date.now() < deadline) {
        for (const candidate of electronApp.windows()) {
            try {
                const declineButton = candidate.locator("#sentry-consent-no-btn");
                if ((await declineButton.count()) === 0) {
                    continue;
                }

                const isVisible = await declineButton
                    .first()
                    .isVisible()
                    .catch(() => false);

                if (!isVisible) {
                    continue;
                }

                await declineButton.first().click();
                await candidate
                    .waitForEvent("close", {
                        timeout: 5_000,
                    })
                    .catch(() => {
                        // Modal may hide in-place depending on platform window behavior.
                    });
                return;
            } catch {
                // Ignore transient windows while the app is still loading.
            }
        }

        for (const candidate of electronApp.windows()) {
            try {
                const settingsButton = candidate.locator("#settings-activity-btn");
                const hasSettingsButton = (await settingsButton.count()) > 0;
                if (!hasSettingsButton) {
                    continue;
                }

                const settingsVisible = await settingsButton
                    .first()
                    .isVisible()
                    .catch(() => false);
                if (!settingsVisible) {
                    continue;
                }

                const backdropVisible = await candidate
                    .locator("#modal-backdrop")
                    .isVisible()
                    .catch(() => false);
                if (!backdropVisible) {
                    return;
                }
            } catch {
                // Ignore transient windows while the app is still loading.
            }
        }

        await electronApp
            .waitForEvent("window", {
                timeout: 500,
            })
            .catch(() => {
                // No new window on every poll iteration.
            });
    }
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
        await dismissTelemetryConsentModalIfPresent(electronApp);
        const win = await resolveMainWindow(electronApp);
        await expect(win.locator("#modal-backdrop")).toBeHidden({ timeout: 15_000 });
        await use(win);
    },
});

export { expect };
