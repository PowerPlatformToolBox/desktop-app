import { test, expect } from "@playwright/test";
import { getAddConnectionModalView } from "../../src/renderer/modals/addConnection/view";
import { getEditConnectionModalView } from "../../src/renderer/modals/editConnection/view";
import { getAddConnectionModalControllerScript } from "../../src/renderer/modals/addConnection/controller";
import { getEditConnectionModalControllerScript } from "../../src/renderer/modals/editConnection/controller";

const channels = { submit: "submit", submitReady: "ready", test: "test", testReady: "test-ready", testFeedback: "feedback", populateConnection: "populate" };

for (const dark of [false, true]) {
    for (const edit of [false, true]) {
        test(`${edit ? "Edit" : "New"} connection preserves optional API settings (${dark ? "dark" : "light"})`, async ({ page }, testInfo) => {
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.setViewportSize({ width: 1008, height: 768 });
            await page.setContent("<html><body></body></html>");
            await page.evaluate(() => {
                const messages: Array<{ channel: string; data: unknown }> = [];
                Object.assign(window, {
                    mockMessages: messages,
                    toolboxAPI: { connections: { checkBrowserInstalled: async () => true, getBrowserProfiles: async () => [], getCategories: async () => [] } },
                    modalBridge: {
                        send: (channel: string, data: unknown) => messages.push({ channel, data }),
                        onMessage: (listener: (payload: unknown) => void) => window.addEventListener("mock:host", (event) => listener((event as CustomEvent).detail)),
                        close: () => undefined,
                    },
                });
            });
            const view = edit ? getEditConnectionModalView(dark) : getAddConnectionModalView(dark);
            const controller = edit ? getEditConnectionModalControllerScript(channels) : getAddConnectionModalControllerScript(channels);
            await page.setContent(`${view.styles}${view.body}${controller}`);
            if (edit) {
                await expect.poll(() => page.evaluate(() => Reflect.get(window, "mockMessages").length)).toBeGreaterThan(0);
                await page.evaluate(() => {
                    window.dispatchEvent(
                        new CustomEvent("mock:host", {
                            detail: {
                                channel: "populate",
                                data: {
                                    id: "connection",
                                    name: "Existing",
                                    url: "https://org.crm.dynamics.com",
                                    authenticationType: "interactive",
                                    enabledForPowerPlatformAPI: true,
                                    optionalClientId: "11111111-1111-4111-8111-111111111111",
                                    enabledForAzureAPI: true,
                                    enabledForGraphAPI: false,
                                },
                            },
                        }),
                    );
                });
                await expect(page.locator("#connection-enabled-for-azure-api")).toBeChecked();
                await expect(page.locator("#connection-enabled-for-graph-api")).not.toBeChecked();
                await expect(page.getByRole("checkbox", { name: "Enable Power Platform API", exact: true })).toBeChecked();
            } else {
                await expect(page.locator("#connection-enabled-for-azure-api")).not.toBeChecked();
                await expect(page.locator("#connection-enabled-for-graph-api")).not.toBeChecked();
                await page.locator("#connection-name").fill("New connection");
                await page.locator("#connection-url").fill("https://org.crm.dynamics.com");
                await expect(page.getByRole("checkbox", { name: "Enable Power Platform API", exact: true })).not.toBeChecked();
            }
            const apiSection = page.getByRole("group", { name: "Additional APIs (Optional)", exact: true });
            await expect(apiSection.getByRole("checkbox")).toHaveCount(3);
            await expect(apiSection.getByRole("checkbox", { name: "Enable Power Platform API", exact: true })).toBeVisible();
            await expect(page.locator(".additional-api-details")).not.toHaveAttribute("open", "");
            const requirements = apiSection.locator("summary");
            await requirements.focus();
            await page.keyboard.press("Enter");
            await expect(page.locator(".additional-api-details")).toHaveAttribute("open", "");
            await expect(apiSection.getByText(/Username\/password cannot bypass MFA/)).toBeVisible();
            await page.keyboard.press("Enter");

            const ppApi = page.locator("#connection-enabled-for-powerplatform-api");
            const azureApi = page.locator("#connection-enabled-for-azure-api");
            const graphApi = page.locator("#connection-enabled-for-graph-api");
            await ppApi.uncheck();
            await azureApi.uncheck();
            await graphApi.uncheck();
            const clientId = page.locator("#connection-optional-client-id");
            const usernameClientId = page.locator("#connection-optional-client-id-up");
            await clientId.fill("");
            await expect(clientId).not.toHaveAttribute("required", "");
            await expect(page.locator("#connection-optional-client-id-label")).toHaveText("Client ID (Optional)");

            for (const checkbox of [ppApi, azureApi, graphApi]) {
                await checkbox.check();
                if (checkbox === ppApi) await page.locator("#pp-api-consent-ok").click();
                await expect(clientId).toHaveAttribute("required", "");
                await expect(page.locator("#connection-optional-client-id-label")).toHaveText("Client ID (Required for additional APIs)");
                expect(await clientId.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
                await page.locator("#connection-authentication-type").selectOption("usernamePassword");
                await expect(usernameClientId).toHaveAttribute("required", "");
                await expect(page.locator("#connection-optional-client-id-up-label")).toHaveText("Client ID (Required for additional APIs)");
                await page.locator("#connection-authentication-type").selectOption("interactive");
                await checkbox.uncheck();
                await expect(clientId).not.toHaveAttribute("required", "");
                await expect(usernameClientId).not.toHaveAttribute("required", "");
            }
            await azureApi.check();
            await graphApi.check();
            await azureApi.uncheck();
            await expect(clientId).toHaveAttribute("required", "");
            await graphApi.uncheck();
            await expect(clientId).not.toHaveAttribute("required", "");

            await page.locator("#connection-authentication-type").selectOption("clientSecret");
            await expect(apiSection.getByRole("checkbox")).toHaveCount(2);
            await expect(page.locator("#power-platform-api-wrapper")).toBeHidden();
            await page.locator("#connection-authentication-type").selectOption("interactive");
            await expect(apiSection.getByRole("checkbox")).toHaveCount(3);
            await page.getByRole("checkbox", { name: "Enable Power Platform API", exact: true }).check();
            await page.locator("#pp-api-consent-ok").click();
            await page.locator("#connection-optional-client-id").fill("11111111-1111-4111-8111-111111111111");
            await page.locator("#connection-enabled-for-azure-api").check();
            await page.locator("#connection-enabled-for-graph-api").check();

            for (const width of [560, 1008]) {
                await page.setViewportSize({ width, height: 768 });
                const layout = await apiSection.evaluate((section) => {
                    const checkboxes = [...section.querySelectorAll("input")].map((input) => input.getBoundingClientRect().left);
                    return { fits: section.scrollWidth <= section.clientWidth, aligned: checkboxes.every((left) => left === checkboxes[0]) };
                });
                expect(layout).toEqual({ fits: true, aligned: true });
            }
            if (edit) {
                await page.locator(".modal-body").evaluate((body) => body.scrollTo(0, 0));
                await page.screenshot({ path: testInfo.outputPath(`additional-apis-${dark ? "dark" : "light"}.png`) });
            }
            await page.locator("#confirm-connection-btn").click();
            await expect
                .poll(() => page.evaluate(() => Reflect.get(window, "mockMessages").find((message: { channel: string }) => message.channel === "submit")?.data))
                .toMatchObject({
                    enabledForAzureAPI: true,
                    enabledForGraphAPI: true,
                    enabledForPowerPlatformAPI: true,
                    authenticationType: "interactive",
                });
            expect(errors).toEqual([]);
        });
    }
}
