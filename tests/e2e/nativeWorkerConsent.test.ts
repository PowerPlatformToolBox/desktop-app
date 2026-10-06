import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import ts from "typescript";

const source = readFileSync(path.resolve("src/renderer/modules/consent/nativeWorkerConsentModal.ts"), "utf8");
const script = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const assets = path.resolve("dist/renderer/assets");
const stylesheet = readFileSync(path.join(assets, readdirSync(assets).find((file) => file.endsWith(".css"))!), "utf8");

test.beforeEach(async ({ page }) => {
    await page.setContent('<button id="previous">Previous Focus</button>');
    await page.addStyleTag({ content: stylesheet });
    await page.addScriptTag({ content: `(() => { const exports = {}; ${script}; window.nativeConsent = exports; })();` });
    await page.evaluate(() => {
        const fixture = window as unknown as {
            toolboxAPI: Record<string, unknown>;
            nativeConsent: { initializeNativeWorkerConsentModal(): void };
            emitConsent: (request: unknown) => void;
            decisions: unknown[];
            failConsent: boolean;
            lastRequest: Record<string, unknown>;
        };
        fixture.decisions = [];
        fixture.toolboxAPI = {
            onNativeWorkerConsentRequest: (listener: typeof fixture.emitConsent) => {
                fixture.emitConsent = listener;
                return () => {};
            },
            onNativeWorkerConsentClosed: () => () => {},
            respondToNativeWorkerConsent: async (requestId: string, decision: string) => {
                fixture.decisions.push({ requestId, decision });
                if (fixture.failConsent) throw new Error("Simulated persistence failure");
                return true;
            },
        };
        fixture.nativeConsent.initializeNativeWorkerConsentModal();
        document.getElementById("previous")?.focus();
        fixture.lastRequest = {
            requestId: "request-1",
            toolId: "fixture",
            toolName: "Fixture Tool",
            toolVersion: "1.0.0",
            workerId: "engine",
            source: "https://api.nuget.org/v3/index.json",
            platformMatrixVersion: 1,
            protocolVersion: "jsonrpc-stdio-v1",
            declaration: {
                kind: "dotnet-tool",
                packageId: "Fixture.Worker",
                packageVersion: "1.0.0",
                command: "fixture-worker",
                platforms: ["all"],
                dotnet: { targetFramework: "net8.0", minimumRuntimeVersion: "8.0.0", rollForward: "Major" },
            },
        };
        fixture.emitConsent(fixture.lastRequest);
    });
});

test("discloses native access, traps focus and rejects with Escape", async ({ page }) => {
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/NOT in a sandbox/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Trust This Tool Version and Worker" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("#previous")).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { decisions: unknown[] }).decisions)).toEqual([{ requestId: "request-1", decision: "reject" }]);
});

test("allows once and recovers from a failed approval save", async ({ page }) => {
    await page.evaluate(() => {
        (window as unknown as { failConsent: boolean }).failConsent = true;
    });
    await page.getByRole("button", { name: "Allow Once", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Approval was not saved. Reject or try again.");
    await page.evaluate(() => {
        (window as unknown as { failConsent: boolean }).failConsent = false;
    });
    await page.getByRole("button", { name: "Allow Once", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("fits the consent disclosure on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/native-worker-consent-mobile.png", fullPage: true });
});

test("reviews and revokes a persistent approval", async ({ page }) => {
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
        const fixture = window as unknown as {
            toolboxAPI: Record<string, unknown>;
            lastRequest: Record<string, unknown>;
            nativeConsent: { appendNativeWorkerConsentReview(container: HTMLElement): void };
        };
        let approved = true;
        fixture.toolboxAPI.getNativeWorkerConsents = async () => (approved ? [{ ...fixture.lastRequest, fingerprint: "a".repeat(64), approvedAt: "2026-10-05T00:00:00.000Z" }] : []);
        fixture.toolboxAPI.revokeNativeWorkerConsent = async (fingerprint: string) => {
            if (fingerprint !== "a".repeat(64)) throw new Error("Wrong approval");
            approved = false;
            return true;
        };
        fixture.nativeConsent.appendNativeWorkerConsentReview(document.body);
    });
    await expect(page.getByText("Approved: 2026-10-05T00:00:00.000Z")).toBeVisible();
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(page.getByText("No persistent native-worker approvals.")).toBeVisible();
});

test("frames the disclosure on a desktop dark theme", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
        document.body.classList.add("dark-theme");
    });
    await expect(page.getByRole("dialog")).toBeVisible();
    const dialogColor = await page.getByRole("dialog").evaluate((dialog) => getComputedStyle(dialog).color);
    await expect.poll(() => page.getByRole("button", { name: "Reject", exact: true }).evaluate((button) => getComputedStyle(button).color)).toBe(dialogColor);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/native-worker-consent-desktop.png", fullPage: true });
});
