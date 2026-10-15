import type { Page } from "playwright";
import { expect, test } from "./fixtures";

for (const scenario of [
    {
        name: "long unbroken notification messages",
        title: "Export Successful",
        body: `Exported 4 plugin assembly steps to ${"Microsoft.CDS.AdvancedAnalyticsInfra.Plugins_documentation".repeat(4)}`,
    },
    {
        name: "MCP client setup instructions",
        title: "MCP Client Configured",
        body: "Visual Studio Code is configured and the PPTB MCP server is running. In VS Code, enable and start pptb from MCP: List Servers, and approve trust if prompted.",
    },
]) {
    test(`${scenario.name} stay fully readable inside the toast`, async ({ electronApp, window }) => {
        const { body, title } = scenario;
        await window.evaluate((notification) => window.api.invoke("notification:show", { ...notification, type: "success", duration: 0 }), { body, title });

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
            contentHeight: element.scrollHeight,
            lineHeight: parseFloat(getComputedStyle(element).lineHeight),
        }));
        expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.visibleWidth);
        expect(dimensions.visibleHeight).toBeGreaterThan(dimensions.lineHeight * 2);
        expect(dimensions.contentHeight).toBeLessThanOrEqual(dimensions.visibleHeight + 1);
        await expect.poll(() => message.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
        if (scenario.title === "MCP Client Configured") {
            await toastWindow!.screenshot({ path: "test-results/mcp-notification-toast.png" });
        }
    });
}
