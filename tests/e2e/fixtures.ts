import { test as base, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import fs from "fs";
import { createServer, type Server } from "http";
import os from "os";
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
    maturityData: boolean;
    multiConnectionData: boolean;
    connectionEdgeData: boolean;
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

async function waitForRendererInitialization(window: Page): Promise<void> {
    await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible({ timeout: 30_000 });
}

export const test = base.extend<AppFixtures>({
    maturityData: [false, { option: true }],
    multiConnectionData: [false, { option: true }],
    connectionEdgeData: [false, { option: true }],

    // Playwright fixtures require object destructuring for the first argument.
    electronApp: async ({ maturityData, multiConnectionData, connectionEdgeData }, use) => {
        const mainEntry = path.resolve(__dirname, "../../dist/main/index.js");
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), maturityData ? "pptb-maturity-e2e-" : multiConnectionData ? "pptb-multiconnection-e2e-" : "pptb-e2e-"));
        const userDataDirectory = path.join(tempRoot, "user-data");
        let maturityEnvironment: Record<string, string> = {};
        let releaseServer: Server | undefined;

        fs.mkdirSync(userDataDirectory, { recursive: true });
        fs.writeFileSync(path.join(userDataDirectory, "user-settings.json"), JSON.stringify({ sentryTelemetryConsent: "no" }, null, 2));

        if (maturityData) {
            const toolsDirectory = path.join(tempRoot, "tools");
            const registryPath = path.resolve(__dirname, "data/maturity-registry.json");
            const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as { tools: Array<Record<string, unknown>> };
            const installedToolIds = new Set(["alpha-unverified", "zulu-verified"]);
            const installedTools = registry.tools
                .filter((tool) => installedToolIds.has(String(tool.id)))
                .map((tool) => ({
                    ...tool,
                    installPath: path.join(toolsDirectory, String(tool.id)),
                    installedAt: "2026-08-24T00:00:00.000Z",
                    source: "registry",
                    sourceUrl: tool.downloadUrl,
                }));

            fs.mkdirSync(toolsDirectory, { recursive: true });
            fs.mkdirSync(userDataDirectory, { recursive: true });
            fs.writeFileSync(path.join(toolsDirectory, "manifest.json"), JSON.stringify({ tools: installedTools }, null, 2));
            maturityEnvironment = {
                PPTB_TEST_MODE: "1",
                SUPABASE_URL: "",
                SUPABASE_ANON_KEY: "",
                AZURE_BLOB_BASE_URL: "",
                PPTB_TEST_REGISTRY_PATH: registryPath,
                PPTB_TEST_TOOLS_DIRECTORY: toolsDirectory,
            };
        }

        if (multiConnectionData) {
            const toolsDirectory = path.join(userDataDirectory, "tools");
            const toolDefinitions = [
                { id: "e2e-required-connections", name: "E2E Required Connections", features: { connections: 2 } },
                { id: "e2e-optional-connections", name: "E2E Optional Connections", features: { multiConnection: "optional" } },
                { id: "e2e-optional-zero-to-three", name: "E2E Optional Zero To Three", features: { connections: { min: 0, max: 3 } } },
                { id: "e2e-api-four-connections", name: "E2E API Four Connections", features: { connections: { min: 0, max: 4 } } },
                { id: "e2e-invocation-caller", name: "E2E Invocation Caller", features: { connections: { min: 0, max: 4 } } },
                { id: "e2e-invocation-callee", name: "E2E Invocation Callee", features: { connections: { min: 1, max: 4 } } },
                { id: "e2e-four-connection-range", name: "E2E Four Connection Range", features: { connections: { min: 3, max: 4 } } },
                { id: "e2e-single-connection", name: "E2E Single Connection" },
                { id: "e2e-no-connection", name: "E2E No Connection", features: { connections: 0 } },
            ];
            const installedTools = toolDefinitions.map((tool) => {
                const installPath = path.join(toolsDirectory, tool.id);
                fs.mkdirSync(path.join(installPath, "dist"), { recursive: true });
                fs.writeFileSync(path.join(installPath, "package.json"), JSON.stringify({ name: tool.id, version: "1.0.0", ...(tool.features ? { features: tool.features } : {}) }, null, 2));
                fs.writeFileSync(path.join(installPath, "dist", "index.html"), `<!doctype html><html><body><main>${tool.id} E2E fixture</main></body></html>`);
                return {
                    ...tool,
                    description: "Static tool fixture for multi-connection E2E tests.",
                    version: "1.0.0",
                    installPath,
                    installedAt: "2026-10-01T00:00:00.000Z",
                    source: "registry",
                    sourceUrl: "https://example.test/fixture.tgz",
                };
            });
            fs.mkdirSync(toolsDirectory, { recursive: true });
            fs.writeFileSync(path.join(toolsDirectory, "manifest.json"), JSON.stringify({ tools: installedTools }, null, 2));
            fs.writeFileSync(
                path.join(userDataDirectory, "connections.json"),
                JSON.stringify(
                    {
                        connections: [
                            {
                                id: "e2e-dev-connection",
                                name: "E2E Development",
                                url: "https://dev.crm.dynamics.com",
                                environment: "Dev",
                                authenticationType: "interactive",
                                createdAt: "2026-10-01T00:00:00.000Z",
                            },
                            {
                                id: "e2e-test-connection",
                                name: "E2E Test",
                                url: "https://test.crm.dynamics.com",
                                environment: "Test",
                                authenticationType: "interactive",
                                createdAt: "2026-10-01T00:00:00.000Z",
                            },
                            {
                                id: "e2e-uat-connection",
                                name: "E2E UAT",
                                url: "https://uat.crm.dynamics.com",
                                environment: "UAT",
                                authenticationType: "interactive",
                                createdAt: "2026-10-01T00:00:00.000Z",
                            },
                            {
                                id: "e2e-production-connection",
                                name: "E2E Production",
                                url: "https://prod.crm.dynamics.com",
                                environment: "Production",
                                authenticationType: "interactive",
                                createdAt: "2026-10-01T00:00:00.000Z",
                            },
                        ],
                    },
                    null,
                    2,
                ),
            );
            maturityEnvironment = {
                PPTB_TEST_MODE: "1",
                SUPABASE_URL: "",
                SUPABASE_ANON_KEY: "",
                AZURE_BLOB_BASE_URL: "",
                PPTB_TEST_TOOLS_DIRECTORY: toolsDirectory,
            };
        }

        if (multiConnectionData) {
            const registryPath = path.join(tempRoot, "registry.json");
            fs.writeFileSync(registryPath, JSON.stringify({ tools: [] }));
            maturityEnvironment.PPTB_TEST_REGISTRY_PATH = registryPath;
            if (connectionEdgeData) {
                fs.writeFileSync(
                    path.join(userDataDirectory, "user-settings.json"),
                    JSON.stringify({
                        sentryTelemetryConsent: "no",
                        toolConnectionSlots: {
                            "e2e-api-four-connections": ["e2e-dev-connection", "removed-connection", "e2e-uat-connection", "e2e-production-connection"],
                        },
                        toolSecondaryConnections: { "e2e-api-four-connections": "removed-connection" },
                    }),
                );
                const packageDirectory = path.join(tempRoot, "update-package");
                fs.mkdirSync(path.join(packageDirectory, "dist"), { recursive: true });
                fs.writeFileSync(path.join(packageDirectory, "package.json"), JSON.stringify({ name: "e2e-api-four-connections", version: "2.0.0", features: { connections: { min: 1, max: 2 } } }));
                fs.writeFileSync(path.join(packageDirectory, "dist", "index.html"), "<!doctype html><html><body>Updated connection fixture</body></html>");
                const archivePath = path.join(tempRoot, "update.tar.gz");
                execFileSync("tar", ["-czf", archivePath, "-C", packageDirectory, "."]);
                releaseServer = createServer((_request, response) => fs.createReadStream(archivePath).pipe(response));
                await new Promise<void>((resolve) => releaseServer!.listen(0, "127.0.0.1", resolve));
                const address = releaseServer.address();
                if (!address || typeof address === "string") throw new Error("Release server did not bind a port");
                fs.writeFileSync(
                    registryPath,
                    JSON.stringify({
                        tools: [
                            {
                                id: "e2e-api-four-connections",
                                name: "E2E API Four Connections",
                                version: "2.0.0",
                                description: "Local update fixture",
                                status: "active",
                                features: { connections: { min: 1, max: 2 } },
                                downloadUrl: `http://127.0.0.1:${address.port}/update.tar.gz`,
                            },
                        ],
                    }),
                );
            }
        }

        const app = await electron.launch({
            args: [mainEntry, `--user-data-dir=${userDataDirectory}`],
            env: {
                ...process.env,
                // Prevent the app from opening the real OS keychain in CI
                NODE_ENV: "test",
                // Suppress update checks during e2e
                PPTB_DISABLE_AUTO_UPDATE: "1",
                ...maturityEnvironment,
            },
        });

        const appProcess = app.process();
        try {
            await use(app);
        } finally {
            if (appProcess.exitCode === null) await app.close();
            if (releaseServer) await new Promise<void>((resolve, reject) => releaseServer!.close((error) => (error ? reject(error) : resolve())));
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    },

    window: async ({ electronApp }, use) => {
        await dismissTelemetryConsentModalIfPresent(electronApp);
        const win = await resolveMainWindow(electronApp);
        await expect(win.locator("#modal-backdrop")).toBeHidden({ timeout: 15_000 });
        await waitForRendererInitialization(win);
        await use(win);
    },
});

export { expect };
