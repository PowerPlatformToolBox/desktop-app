import { defineConfig } from "@playwright/test";
import path from "path";

export default defineConfig({
    // E2e test location
    testDir: "./tests/e2e",

    // Global timeout per test
    timeout: 60_000,

    // Run tests in parallel (one worker per test file keeps Electron instances isolated)
    workers: 1,

    // Retry on CI
    retries: process.env.CI ? 1 : 0,

    // Reporters
    reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

    use: {
        // Screenshot on failure
        screenshot: "only-on-failure",

        // Path to the built Electron app (must be built before running e2e)
        // Playwright's electron launch picks up dist/main/index.js
    },

    // Output folder for test artifacts
    outputDir: "test-results",

    // Project configuration — single "electron" project
    projects: [
        {
            name: "electron",
            use: {
                // Electron main entry point (requires `pnpm run build` first)
                // Passed via test fixture; see tests/e2e/fixtures.ts
            },
        },
    ],

    // Shared metadata
    metadata: {
        app: "PowerPlatform ToolBox",
        mainEntry: path.resolve(__dirname, "dist/main/index.js"),
    },
});
