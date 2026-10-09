import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import ts from "typescript";

const source = readFileSync(path.resolve("src/renderer/modules/consent/nativeWorkerConsentModal.ts"), "utf8");
const script = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modalStylesSource = readFileSync(path.resolve("src/renderer/modals/sharedStyles.ts"), "utf8");
const modalStylesScript = ts.transpileModule(modalStylesSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const assets = path.resolve("dist/renderer/assets");
const stylesheet = readFileSync(path.join(assets, readdirSync(assets).find((file) => file.endsWith(".css"))!), "utf8");

async function emitConsent(page: Page): Promise<FrameLocator> {
    await page.evaluate(() => {
        const fixture = window as unknown as { emitConsent(request: unknown): void; lastRequest: Record<string, unknown> };
        fixture.emitConsent(fixture.lastRequest);
    });
    return page.frameLocator("iframe[title='Native worker consent modal']");
}

async function installModal(page: Page): Promise<void> {
    await page.setContent('<button id="previous">Previous Focus</button>');
    await page.addStyleTag({ content: stylesheet });
    await page.evaluate(
        ({ compiledScript, compiledStyles }) => {
            const exports: Record<string, (...args: any[]) => any> = {};
            const styles: Record<string, (...args: any[]) => any> = {};
            new Function("exports", "require", compiledStyles)(styles, () => ({}));
            const messageListeners = new Set<(payload: { channel: string; data?: unknown }) => void>();
            const closedListeners = new Set<(payload: { id: string | null }) => void>();
            const modalBridge = {
                showBrowserWindowModal: (options: { id: string; html: string; width: number; height: number }) => window.toolboxAPI.utils.showModalWindow(options),
                closeBrowserWindowModal: () => window.toolboxAPI.utils.closeModalWindow(),
                sendBrowserWindowModalMessage: (payload: { channel: string; data?: unknown }) => window.toolboxAPI.utils.sendModalMessage(payload),
                onBrowserWindowModalMessage: (listener: (payload: { channel: string; data?: unknown }) => void) => messageListeners.add(listener),
                offBrowserWindowModalMessage: (listener: (payload: { channel: string; data?: unknown }) => void) => messageListeners.delete(listener),
                onBrowserWindowModalClosed: (listener: (payload: { id: string | null }) => void) => closedListeners.add(listener),
                offBrowserWindowModalClosed: (listener: (payload: { id: string | null }) => void) => closedListeners.delete(listener),
            };
            const mockRequire = (name: string) => {
                if (name === "../../modals/sharedStyles") return styles;
                if (name === "../browserWindowModals") return modalBridge;
                return {};
            };
            new Function("exports", "require", compiledScript)(exports, mockRequire);
            (window as unknown as { nativeConsent: typeof exports }).nativeConsent = exports;
            (window as unknown as { emitBrowserModalClosed(payload: { id: string | null }): void }).emitBrowserModalClosed = (payload) => closedListeners.forEach((listener) => listener(payload));
            (window as unknown as { emitBrowserModalMessage(payload: { channel: string; data?: unknown }): void }).emitBrowserModalMessage = (payload) =>
                messageListeners.forEach((listener) => listener(payload));
        },
        { compiledScript: script, compiledStyles: modalStylesScript },
    );
    await page.evaluate(() => {
        type Fixture = {
            toolboxAPI: Record<string, any>;
            nativeConsent: { initializeNativeWorkerConsentModal(): void; appendNativeWorkerConsentReview(container: HTMLElement): void };
            emitConsent: (request: unknown) => void;
            emitClosed: (requestId: string) => void;
            emitModalClosed: (id: string) => void;
            decisions: unknown[];
            failConsent: boolean;
            approved: boolean;
            lastRequest: Record<string, unknown>;
            currentModal?: HTMLIFrameElement;
            currentModalHtml?: string;
            currentModalSize?: { width: number; height: number };
        };
        const fixture = window as unknown as Fixture;
        const messageListeners = new Set<(payload: { channel: string; data?: unknown }) => void>();
        const closedListeners = new Set<(payload: { id: string | null }) => void>();
        fixture.decisions = [];
        fixture.approved = false;
        fixture.lastRequest = {
            requestId: "request-1",
            toolId: "fixture",
            toolName: "Fixture Tool",
            toolVersion: "1.0.0",
            workerId: "engine",
            source: { kind: "nuget.org", url: "https://api.nuget.org/v3/index.json" },
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
        fixture.toolboxAPI = {
            onNativeWorkerConsentRequest: (listener: Fixture["emitConsent"]) => {
                fixture.emitConsent = listener;
                return () => undefined;
            },
            onNativeWorkerConsentClosed: (listener: Fixture["emitClosed"]) => {
                fixture.emitClosed = listener;
                return () => undefined;
            },
            respondToNativeWorkerConsent: async (requestId: string, decision: string) => {
                fixture.decisions.push({ requestId, decision });
                if (fixture.failConsent) throw new Error("Simulated persistence failure");
                return true;
            },
            utils: {
                showModalWindow: async ({ html, title, width, height }: { html: string; title?: string; width: number; height: number }) => {
                    fixture.currentModalHtml = html;
                    fixture.currentModalSize = { width, height };
                    const frame = document.createElement("iframe");
                    frame.title = title ?? "Native worker consent modal";
                    frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:10001";
                    const bridge =
                        "<script>window.modalBridge={onMessage(handler){window.__modalMessage=handler},offMessage(){window.__modalMessage=undefined},send(channel,data){window.parent.emitBrowserModalMessage({channel,data})},close(){window.parent.toolboxAPI.utils.closeModalWindow()}};document.addEventListener('keydown',event=>{if(event.key==='Escape')window.modalBridge.close()});</scr" +
                        "ipt>";
                    frame.srcdoc = html.replace("</head>", `${bridge}</head>`);
                    fixture.currentModal = frame;
                    document.body.appendChild(frame);
                    document.getElementById("modal-backdrop")?.setAttribute("data-open", "true");
                },
                closeModalWindow: async () => {
                    fixture.currentModal?.remove();
                    fixture.currentModal = undefined;
                    document.getElementById("modal-backdrop")?.removeAttribute("data-open");
                    (window as unknown as { emitBrowserModalClosed(payload: { id: string | null }): void }).emitBrowserModalClosed({ id: "native-worker-consent-browser-modal" });
                },
                sendModalMessage: async (payload: { channel: string; data?: unknown }) => {
                    const frame = fixture.currentModal?.contentWindow as (Window & { __modalMessage?: (message: typeof payload) => void }) | undefined;
                    frame?.__modalMessage?.(payload);
                },
            },
            getNativeWorkerConsents: async () => [],
            revokeNativeWorkerConsent: async () => undefined,
        };
        fixture.nativeConsent.initializeNativeWorkerConsentModal();
        document.getElementById("previous")?.focus();
        Object.defineProperty(fixture, "__consentRequestId", { configurable: true, writable: true, value: fixture.lastRequest.requestId });
        fixture.emitModalClosed = (id) => closedListeners.forEach((listener) => listener({ id }));
        (window as unknown as { fluentButton: (label: string, onClick: () => void) => HTMLButtonElement }).fluentButton = (label, onClick) => {
            const button = document.createElement("button");
            button.textContent = label;
            button.addEventListener("click", onClick);
            return button;
        };
        void messageListeners;
        void closedListeners;
    });
}

test.beforeEach(async ({ page }) => {
    await installModal(page);
});

test("uses the shared BrowserWindow modal bridge and escapes consent content", async ({ page }) => {
    const frame = await emitConsent(page);
    await expect(frame.getByRole("dialog")).toBeVisible();
    await expect(frame.getByText(/not sandboxed/)).toBeVisible();
    await expect(frame.getByRole("button", { name: "Allow once", exact: true })).toBeFocused();
    await expect(frame.locator(".worker-warning")).toHaveText(
        "Native code runs with your user permissions and is not sandboxed. It can access files, use the network, and start processes. Approve only workers you trust.",
    );
    expect(await frame.locator(".worker-details dt").allTextContents()).toEqual(["Tool", "Worker", "Package", "Source", "Command"]);
    await expect(frame.locator(".worker-detail").filter({ has: frame.locator("dt", { hasText: /^Source$/ }) }).locator("dd")).toHaveText("https://api.nuget.org/v3/index.json");
    expect(await page.evaluate(() => (window as unknown as { currentModalSize: unknown }).currentModalSize)).toEqual({ width: 640, height: 500 });
    const html = await page.evaluate(() => (window as unknown as { currentModalHtml: string }).currentModalHtml);
    expect(html).toContain("<dt>Package</dt>");
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("fluent-button-primary");
    await frame.getByRole("button", { name: "Trust this tool version and worker" }).click();
    await expect(frame.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { decisions: unknown[] }).decisions)).toEqual([{ requestId: "request-1", decision: "allow-tool" }]);
});

test("rejects when the BrowserWindow modal is dismissed or Escape is pressed", async ({ page }) => {
    const frame = await emitConsent(page);
    await expect(frame.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(frame.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { decisions: unknown[] }).decisions)).toEqual([{ requestId: "request-1", decision: "reject" }]);
});

test("keeps the BrowserWindow open and re-enables decisions when approval persistence fails", async ({ page }) => {
    const frame = await emitConsent(page);
    await page.evaluate(() => {
        (window as unknown as { failConsent: boolean }).failConsent = true;
    });
    await frame.getByRole("button", { name: "Allow once", exact: true }).click();
    await expect(frame.getByRole("alert")).toHaveText("Approval was not saved. Reject or try again.");
    await expect(frame.getByRole("button", { name: "Allow once", exact: true })).toBeEnabled();
});

test("reviews and revokes a persistent approval in the main window", async ({ page }) => {
    await page.evaluate(() => {
        const fixture = window as unknown as {
            approved: boolean;
            toolboxAPI: Record<string, any>;
            lastRequest: Record<string, unknown>;
            nativeConsent: { appendNativeWorkerConsentReview(container: HTMLElement): void };
        };
        fixture.approved = true;
        fixture.toolboxAPI.getNativeWorkerConsents = async () => (fixture.approved ? [{ ...fixture.lastRequest, fingerprint: "a".repeat(64), approvedAt: "2026-10-06T00:00:00.000Z" }] : []);
        fixture.toolboxAPI.revokeNativeWorkerConsent = async () => {
            fixture.approved = false;
        };
        fixture.nativeConsent.appendNativeWorkerConsentReview(document.body);
    });
    await expect(page.getByText(/Approved: 2026-10-06T00:00:00.000Z/)).toBeVisible();
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(page.getByText("No persistent native-worker approvals.")).toBeVisible();
});

test("fits the shared BrowserWindow dialog on mobile and desktop dark theme", async ({ page }) => {
    let frame = await emitConsent(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(frame.getByRole("dialog")).toBeVisible();
    expect(await frame.locator("html").evaluate((element) => element.scrollWidth <= innerWidth)).toBe(true);
    await frame.locator("body").screenshot({ path: "test-results/native-worker-consent-mobile.png" });
    await page.evaluate(() => {
        (window as unknown as { toolboxAPI: { utils: { closeModalWindow(): void } } }).toolboxAPI.utils.closeModalWindow();
        document.body.classList.add("dark-theme");
    });
    await page.evaluate(() => {
        const fixture = window as unknown as { emitConsent(request: unknown): void; lastRequest: Record<string, unknown> };
        fixture.lastRequest = { ...fixture.lastRequest, requestId: "request-dark" };
        Object.defineProperty(window, "__consentRequestId", { configurable: true, writable: true, value: "request-dark" });
        fixture.emitConsent(fixture.lastRequest);
    });
    frame = page.frameLocator("iframe[title='Native worker consent modal']");
    await expect(frame.getByRole("dialog")).toBeVisible();
    await frame.locator("body").screenshot({ path: "test-results/native-worker-consent-desktop.png" });
});
