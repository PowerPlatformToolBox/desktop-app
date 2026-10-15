import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { createServer } from "http";
import { expect, test } from "./fixtures";
import { clickTool, modalWith, stubSelectionAuthentication } from "./connectionTestHelpers";

test.use({ multiConnectionData: true });
const features = { connections: { slots: [{ label: "Catalog accounts" }, { label: "Catalog customers", connectionTypes: ["financeOperations"] }] } };

test("registry archive install retains package slots over stale catalog counts and renders marketplace purposes", async ({ electronApp, window }) => {
    const paths = await electronApp.evaluate(() => ({ tools: process.env.PPTB_TEST_TOOLS_DIRECTORY!, registry: process.env.PPTB_TEST_REGISTRY_PATH! }));
    const directory = path.join(path.dirname(paths.tools), "typed-package-source");
    fs.mkdirSync(path.join(directory, "dist"), { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "e2e-catalog-slots", version: "1.0.0", features }));
    fs.writeFileSync(path.join(directory, "dist", "index.html"), "<!doctype html><html><body>Typed installed archive</body></html>");
    const archive = path.join(directory, "package.tar.gz");
    execFileSync("tar", ["-czf", archive, "-C", directory, "package.json", "dist"]);
    const server = createServer((_request, response) => fs.createReadStream(archive).pipe(response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Package server missing");
    const downloadUrl = `http://127.0.0.1:${address.port}/package.tar.gz`;
    const catalog = [
        {
            id: "e2e-catalog-slots",
            name: "E2E Catalog Slots",
            version: "1.0.0",
            description: "Stale catalog count",
            features: { connections: 2, connectionTypes: ["dataverse"] },
            status: "active",
            downloadUrl,
        },
        { id: "e2e-catalog-purpose", name: "E2E Catalog Purpose", version: "1.0.0", description: "Native typed catalog", features, status: "active", downloadUrl },
    ];
    fs.writeFileSync(paths.registry, JSON.stringify({ tools: catalog }));
    await electronApp.evaluate(() => {
        const original = Date.now;
        Date.now = () => original() + 600000;
    });
    await window.reload();
    await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible();
    try {
        await window.locator('[data-sidebar="marketplace"]').click();
        await window.locator('#marketplace-tools-list .marketplace-item-pptb[data-tool-id="e2e-catalog-purpose"]').click();
        const details = window.locator("#tool-detail-content-panel");
        const summary = details.locator('[title*="Catalog accounts"]');
        await expect(summary).toHaveAttribute("title", /Catalog customers.*F&O.*required/i);
        await expect(summary).toHaveAttribute("aria-label", /Catalog accounts/);
        await window.locator('#marketplace-tools-list .marketplace-item-pptb[data-tool-id="e2e-catalog-slots"]').click();
        await details.locator("#tool-detail-install-btn").click();
        await expect(details.locator("#tool-detail-launch-btn")).toBeVisible({ timeout: 15000 });
        const installed = await window.evaluate(() => globalThis.window.toolboxAPI.loadTool("e2e-catalog-slots"));
        expect(installed.features).toEqual(features);
        const saved = JSON.parse(fs.readFileSync(path.join(paths.tools, "manifest.json"), "utf8"));
        expect(saved.tools.find((tool: any) => tool.id === "e2e-catalog-slots").features).toEqual(features);
        await window.reload();
        await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible();
        await stubSelectionAuthentication(electronApp);
        await clickTool(window, "e2e-catalog-slots");
        const picker = await modalWith(electronApp);
        await expect(picker.locator("[data-slot-row]")).toHaveCount(2);
        await picker.locator('[data-slot-row="1"] .connection-slot-button').click();
        await expect(picker.locator("#connection-slot-purpose")).toContainText("Catalog customers");
        await expect(picker.locator("#slot-connection-list .connection-item")).toHaveCount(1);
        await picker.locator("#cancel-select-multi-connection-btn").click();
        // Invalid package metadata must fail before installed state is committed.
        fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "e2e-catalog-slots", version: "1.0.0", features: { connections: { slots: [] } } }));
        execFileSync("tar", ["-czf", archive, "-C", directory, "package.json", "dist"]);
        const error = await window.evaluate(async () => {
            try {
                await globalThis.window.toolboxAPI.installToolFromRegistry("e2e-catalog-purpose");
                return "";
            } catch (error) {
                return (error as Error).message;
            }
        });
        expect(error).toContain("1 to 10");
        expect(await window.evaluate(() => globalThis.window.toolboxAPI.loadTool("e2e-catalog-slots"))).toMatchObject({ features });
        expect(fs.existsSync(path.join(paths.tools, "e2e-catalog-purpose"))).toBe(false);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});

test("local development and npm installation preserve typed definitions and reject malformed packages", async ({ electronApp, window }) => {
    const paths = await electronApp.evaluate(() => ({ tools: process.env.PPTB_TEST_TOOLS_DIRECTORY! }));
    const directory = path.join(path.dirname(paths.tools), "local-typed-package");
    fs.mkdirSync(path.join(directory, "dist"), { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "e2e-local-slots", version: "1.0.0", features }));
    fs.writeFileSync(path.join(directory, "dist", "index.html"), "<!doctype html><html><body>Typed local entry</body></html>");
    const local = await window.evaluate((directory) => globalThis.window.toolboxAPI.loadLocalTool(directory), directory);
    expect(local.features).toEqual(features);
    await stubSelectionAuthentication(electronApp);
    expect(
        await window.evaluate((tool) => globalThis.window.toolboxAPI.launchToolWindow(`${tool.id}-123-valid`, tool, "e2e-dev-connection", "e2e-finops", ["e2e-dev-connection", "e2e-finops"]), local),
    ).toBe(true);
    expect(
        await window.evaluate((tool) => globalThis.window.toolboxAPI.launchToolWindow(`${tool.id}-456-invalid`, tool, "e2e-finops", "e2e-dev-connection", ["e2e-finops", "e2e-dev-connection"]), local),
    ).toBe(false);
    // Only the external package-manager process is simulated; real npm loading,
    // feature validation, trusted installation IPC and tool-view launch remain.
    await electronApp.evaluate((_electron, directory) => {
        const childProcess: any = process.getBuiltinModule("child_process");
        const { EventEmitter } = process.getBuiltinModule("events");
        const fs = process.getBuiltinModule("fs");
        const path = process.getBuiltinModule("path");
        const original = childProcess.spawn;
        childProcess.spawn = (command: string, args: string[], options: any) => {
            if (args.includes("--version") && /pnpm|npm/.test(command)) {
                const child: any = new EventEmitter();
                child.stdout = new EventEmitter();
                child.stderr = new EventEmitter();
                process.nextTick(() => {
                    child.stdout.emit("data", Buffer.from("10.0.0"));
                    child.emit("close", 0);
                });
                return child;
            }
            if (!args.includes("e2e-local-slots") || !(args.includes("add") || args.includes("install"))) return original(command, args, options);
            fs.cpSync(directory, path.join(process.env.PPTB_TEST_TOOLS_DIRECTORY!, "node_modules", "e2e-local-slots"), { recursive: true });
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            process.nextTick(() => child.emit("close", 0));
            return child;
        };
    }, directory);
    const npm = await window.evaluate(() => globalThis.window.toolboxAPI.installTool("e2e-local-slots"));
    expect(npm).toMatchObject({ id: "npm-e2e-local-slots", features });
    expect(
        await window.evaluate((tool) => globalThis.window.toolboxAPI.launchToolWindow(`${tool.id}-123-valid`, tool, "e2e-dev-connection", "e2e-finops", ["e2e-dev-connection", "e2e-finops"]), npm),
    ).toBe(true);
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "e2e-local-invalid", version: "1.0.0", features: { ...features, connectionTypes: ["dataverse"] } }));
    const invalid = await window.evaluate(async (directory) => {
        try {
            await globalThis.window.toolboxAPI.loadLocalTool(directory);
            return "";
        } catch (error) {
            return (error as Error).message;
        }
    }, directory);
    expect(invalid).toContain("cannot be combined");
    for (const [definition, message] of [
        [{ slots: [{ required: "true" }] }, "required must be a boolean"],
        [{ slots: [{ label: "   " }] }, "label must be a nonempty"],
        [{ slots: [{ connectionTypes: ["unsupportedProduct"] }] }, "connectionTypes must be"],
        [{ slots: [{ unknownKey: true }] }, "unsupported properties"],
        [{ slots: [{}], min: 1 }, "cannot be combined"],
    ] as const) {
        fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "e2e-local-invalid", version: "1.0.0", features: { connections: definition } }));
        const error = await window.evaluate(async (directory) => {
            try {
                await globalThis.window.toolboxAPI.loadLocalTool(directory);
                return "";
            } catch (error) {
                return (error as Error).message;
            }
        }, directory);
        expect(error).toContain(message);
        expect(await window.evaluate(() => globalThis.window.toolboxAPI.getOpenToolWindows())).toHaveLength(2);
    }
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "e2e-local-slots", version: "1.0.0", features: { connections: { slots: [] } } }));
    const invalidNpm = await window.evaluate(async () => {
        try {
            await globalThis.window.toolboxAPI.installTool("e2e-local-slots");
            return "";
        } catch (error) {
            return (error as Error).message;
        }
    });
    expect(invalidNpm).toContain("1 to 10");
});
