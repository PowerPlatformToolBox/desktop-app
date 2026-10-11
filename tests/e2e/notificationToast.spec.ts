import type { Page } from "playwright";
import { test, expect } from "./fixtures";

test("long unbroken notification messages stay inside the toast", async ({ electronApp, window }) => {
    const body = `Exported 4 plugin assembly steps to ${"Microsoft.CDS.AdvancedAnalyticsInfra.Plugins_documentation".repeat(4)}`;
    await window.evaluate((message) => window.api.invoke("notification:show", { title: "Export Successful", body: message, type: "success", duration: 0 }), body);

    let toastWindow: Page | undefined;
    await expect
        .poll(async () => {
            for (const page of electronApp.windows()) {
                if (await page.locator(".notification-message").count()) {
                    toastWindow = page;
                    return true;
                }
            }
            return false;
        })
        .toBe(true);

    const message = toastWindow!.locator(".notification-message");
    await expect(message).toHaveText(body);

    const dimensions = await message.evaluate((element) => ({
        visibleWidth: element.clientWidth,
        contentWidth: element.scrollWidth,
        visibleHeight: element.clientHeight,
        lineHeight: parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.visibleWidth);
    expect(dimensions.visibleHeight).toBeLessThanOrEqual(dimensions.lineHeight * 2 + 1);
});
