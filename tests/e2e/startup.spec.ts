import { expect, test } from "./fixtures";

test.describe("Startup", () => {
    test("test launch skips telemetry consent prompt and reaches initialized renderer", async ({ electronApp, window }) => {
        await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible({ timeout: 10_000 });

        for (const candidate of electronApp.windows()) {
            await expect(candidate.locator("#sentry-consent-no-btn")).toHaveCount(0);
        }
    });
});
