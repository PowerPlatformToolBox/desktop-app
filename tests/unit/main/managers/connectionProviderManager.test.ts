/// <reference types="jest" />

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ConnectionProviderChildMessage, ConnectionProviderParentMessage } from "../../../../src/common/types";
import {
    ConnectionProviderManager,
    ConnectionProviderProcess,
    buildExternalConnectionId,
    parseExternalConnectionId,
    readConnectionProviderDeclarations,
} from "../../../../src/main/managers/connectionProviderManager";

jest.mock("../../../../src/common/logger", () => ({ logInfo: jest.fn(), logWarn: jest.fn(), logError: jest.fn() }));

type FakeProvider = Record<string, (...args: unknown[]) => unknown>;

interface FakeHost {
    acquireEntraToken(request: unknown): Promise<unknown>;
    prompt(request: unknown): Promise<unknown>;
}

/**
 * In-process stand-in for the utility process: speaks the same message protocol as connectionProviderHost.
 */
function createFakeProcessFactory(createProvider: (host: FakeHost) => FakeProvider) {
    const processes: { exit: (code: number) => void; killed: boolean }[] = [];

    const factory = (): ConnectionProviderProcess => {
        let messageListener: (message: ConnectionProviderChildMessage) => void = () => undefined;
        let exitListener: (code: number) => void = () => undefined;
        const hostCalls = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
        let nextHostCallId = 1;
        let provider: FakeProvider | null = null;
        const send = (message: ConnectionProviderChildMessage) => setImmediate(() => messageListener(message));
        const callHost = (method: "acquireEntraToken" | "prompt", args: unknown[]) =>
            new Promise((resolve, reject) => {
                const id = nextHostCallId++;
                hostCalls.set(id, { resolve, reject });
                send({ type: "host-call", id, method, args });
            });
        const handle = { exit: (code: number) => exitListener(code), killed: false };
        processes.push(handle);

        return {
            postMessage(message: ConnectionProviderParentMessage) {
                if (message.type === "init") {
                    provider = createProvider({ acquireEntraToken: (request) => callHost("acquireEntraToken", [request]), prompt: (request) => callHost("prompt", [request]) });
                    send({ type: "ready", methods: Object.keys(provider).filter((key) => ["getConnectionById", "signOut", "dispose"].includes(key)) as never });
                } else if (message.type === "call") {
                    const fn = provider?.[message.method];
                    if (!fn) return;
                    Promise.resolve()
                        .then(() => fn(...message.args))
                        .then(
                            (result) => send({ type: "result", id: message.id, result }),
                            (error: Error) => send({ type: "error", id: message.id, error: error.message }),
                        );
                } else if (message.type === "host-result" || message.type === "host-error") {
                    const pending = hostCalls.get(message.id);
                    hostCalls.delete(message.id);
                    if (message.type === "host-result") pending?.resolve(message.result);
                    else pending?.reject(new Error(message.error));
                }
            },
            onMessage(listener) {
                messageListener = listener;
            },
            onExit(listener) {
                exitListener = listener;
            },
            kill() {
                handle.killed = true;
            },
        };
    };

    return { factory: jest.fn(factory), processes };
}

function createExtensionFolder(packageJson: object, files: Record<string, string> = { "provider.js": "" }): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-provider-"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(packageJson));
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), content);
    }
    return dir;
}

describe("connection provider helpers", () => {
    it("round-trips external connection IDs, keeping colons in the provider's ID", () => {
        const id = buildExternalConnectionId("ext_a/data8", "client:conn");
        expect(id).toBe("ext:ext_a/data8:client:conn");
        expect(parseExternalConnectionId(id)).toEqual({ providerKey: "ext_a/data8", providerConnectionId: "client:conn" });
        expect(parseExternalConnectionId("local-id")).toBeNull();
        expect(parseExternalConnectionId("ext:no-separator")).toBeNull();
    });

    it("reads valid declarations and skips invalid ones", () => {
        const dir = createExtensionFolder({
            name: "ext",
            pptbConnectionProviders: [{ id: "good", main: "provider.js", displayName: "Good" }, { id: "bad id!", main: "provider.js" }, { id: "nomain" }],
        });
        expect(readConnectionProviderDeclarations(dir)).toEqual([{ id: "good", main: "provider.js", displayName: "Good" }]);
    });
});

describe("ConnectionProviderManager", () => {
    const acquireEntraToken = jest.fn(async () => ({ accessToken: "entra", expiresOn: new Date(Date.now() + 3600_000).toISOString() }));
    const prompt = jest.fn(async () => ({ justification: "because" }));
    let manager: ConnectionProviderManager;

    afterEach(() => manager?.dispose());

    function createManager(createProvider: (host: FakeHost) => FakeProvider) {
        const fake = createFakeProcessFactory(createProvider);
        manager = new ConnectionProviderManager({ processFactory: fake.factory, acquireEntraToken, prompt, callTimeoutMs: 2000, authenticateTimeoutMs: 2000 });
        return fake;
    }

    const extensionDir = () => createExtensionFolder({ name: "ext", pptbConnectionProviders: [{ id: "data8", displayName: "Data8", main: "provider.js" }] });

    it("loads and normalises connections from a provider", async () => {
        createManager(() => ({
            getConnections: async () => [
                { id: "a", name: "A", url: "https://a.crm.dynamics.com/main.aspx", environment: "Dev", category: "Client A" },
                { id: "b", name: "Insecure", url: "http://b.crm.dynamics.com" },
                { id: "a", name: "Duplicate", url: "https://dup.crm.dynamics.com" },
                { id: "c", name: "C", url: "https://c.crm.dynamics.com", environment: "Bogus" },
            ],
            authenticate: async () => ({ accessToken: "t", expiresOn: new Date().toISOString() }),
        }));
        const changed = jest.fn();
        manager.on("connections-changed", changed);

        await manager.registerExtension("local-ext", extensionDir());

        const connections = manager.getConnections();
        expect(connections.map((c) => c.id)).toEqual(["ext:local-ext/data8:a", "ext:local-ext/data8:c"]);
        expect(connections[0]).toMatchObject({ url: "https://a.crm.dynamics.com", environment: "Dev", category: "Client A", authenticationType: "external", readOnly: true, providerName: "Data8" });
        expect(connections[1]).toMatchObject({ environment: "Production", category: "Data8" });
        expect(changed).toHaveBeenCalledWith("local-ext/data8");
        expect(manager.getProviders()).toEqual([expect.objectContaining({ id: "local-ext/data8", status: "ready", connectionCount: 2 })]);
    });

    it("routes authentication to the provider, bridging host prompts and Entra token requests", async () => {
        createManager((host) => ({
            getConnections: async () => [{ id: "a", name: "A", url: "https://a.crm.dynamics.com" }],
            authenticate: async (id: unknown, context: unknown) => {
                const api = (await host.acquireEntraToken({ clientId: "66ad15f6-28bc-4493-9c02-249542121410", scopes: ["api://x/.default"] })) as { accessToken: string };
                const answer = (await host.prompt({ title: "Why?", fields: [{ id: "justification", type: "multiline", required: true }] })) as { justification: string };
                return { accessToken: `${id}|${(context as { reason: string }).reason}|${api.accessToken}|${answer.justification}`, expiresOn: "2030-01-01T00:00:00Z" };
            },
        }));
        await manager.registerExtension("local-ext", extensionDir());

        const result = await manager.authenticate("ext:local-ext/data8:a", "connect");

        expect(result.accessToken).toBe("a|connect|entra|because");
        expect(result.expiresOn.toISOString()).toBe("2030-01-01T00:00:00.000Z");
        expect(acquireEntraToken).toHaveBeenCalledWith("local-ext/data8", expect.objectContaining({ clientId: "66ad15f6-28bc-4493-9c02-249542121410" }));
        expect(prompt).toHaveBeenCalledWith("Data8", { title: "Why?", fields: [{ id: "justification", type: "multiline", required: true }] });
    });

    it("includes the requesting tool's identity in the authenticate context when given", async () => {
        let receivedContext: unknown;
        createManager(() => ({
            getConnections: async () => [{ id: "a", name: "A", url: "https://a.crm.dynamics.com" }],
            authenticate: async (_id: unknown, context: unknown) => {
                receivedContext = context;
                return { accessToken: "t", expiresOn: "2030-01-01T00:00:00Z" };
            },
        }));
        await manager.registerExtension("local-ext", extensionDir());

        const tool = { toolId: "fetchxml-studio", toolName: "FetchXML Studio", toolVersion: "1.0.0", instanceId: "fetchxml-studio-1-x" };
        await manager.authenticate("ext:local-ext/data8:a", "connect", tool);

        expect(receivedContext).toEqual({ reason: "connect", tool });
    });

    it("rejects invalid Entra token requests from providers", async () => {
        createManager((host) => ({
            getConnections: async () => [{ id: "a", name: "A", url: "https://a.crm.dynamics.com" }],
            authenticate: async () => host.acquireEntraToken({ clientId: "not-a-guid", scopes: ["x"] }),
        }));
        await manager.registerExtension("local-ext", extensionDir());
        await expect(manager.authenticate("ext:local-ext/data8:a", "connect")).rejects.toThrow("valid clientId");
    });

    it("surfaces provider errors and invalid token results", async () => {
        createManager(() => ({
            getConnections: async () => [
                { id: "denied", name: "D", url: "https://d.crm.dynamics.com" },
                { id: "notoken", name: "N", url: "https://n.crm.dynamics.com" },
            ],
            authenticate: async (id: unknown) => {
                if (id === "denied") throw new Error("Access denied");
                return { expiresOn: "2030-01-01T00:00:00Z" };
            },
        }));
        await manager.registerExtension("local-ext", extensionDir());

        await expect(manager.authenticate("ext:local-ext/data8:denied", "connect")).rejects.toThrow("Access denied");
        await expect(manager.authenticate("ext:local-ext/data8:notoken", "connect")).rejects.toThrow("did not return an access token");
        await expect(manager.authenticate("ext:other/x:a", "connect")).rejects.toThrow("not available");
    });

    it("records an error when listing fails, and clears it after a successful refresh", async () => {
        let fail = true;
        createManager(() => ({
            getConnections: async () => {
                if (fail) throw new Error("API down");
                return [{ id: "a", name: "A", url: "https://a.crm.dynamics.com" }];
            },
            authenticate: async () => null,
        }));
        await manager.registerExtension("local-ext", extensionDir());
        expect(manager.getProviders()[0]).toMatchObject({ error: "API down", connectionCount: 0 });

        fail = false;
        await manager.refreshConnections();
        expect(manager.getProviders()[0]).toMatchObject({ error: undefined, connectionCount: 1 });
    });

    it("skips providers whose module is outside the extension folder", async () => {
        const fake = createManager(() => ({ getConnections: async () => [], authenticate: async () => null }));
        const dir = createExtensionFolder({ name: "ext", pptbConnectionProviders: [{ id: "evil", main: "../outside.js" }] });
        await manager.registerExtension("local-ext", dir);
        expect(manager.getProviders()).toHaveLength(0);
        expect(fake.factory).not.toHaveBeenCalled();
    });

    it("removes connections and stops the process when an extension is unregistered", async () => {
        const fake = createManager(() => ({ getConnections: async () => [{ id: "a", name: "A", url: "https://a.crm.dynamics.com" }], authenticate: async () => null }));
        await manager.registerExtension("local-ext", extensionDir());
        const changed = jest.fn();
        manager.on("connections-changed", changed);

        manager.unregisterExtension("local-ext");

        expect(manager.getConnections()).toHaveLength(0);
        expect(fake.processes[0].killed).toBe(true);
        expect(changed).toHaveBeenCalledWith("local-ext/data8");
    });

    it("rejects pending calls and restarts the process after it crashes", async () => {
        let hang = false;
        const fake = createManager(() => ({
            getConnections: async () => [{ id: "a", name: "A", url: "https://a.crm.dynamics.com" }],
            authenticate: () => (hang ? new Promise(() => undefined) : Promise.resolve({ accessToken: "t", expiresOn: "2030-01-01T00:00:00Z" })),
        }));
        await manager.registerExtension("local-ext", extensionDir());

        hang = true;
        const pending = manager.authenticate("ext:local-ext/data8:a", "connect");
        await new Promise((resolve) => setImmediate(resolve));
        fake.processes[0].exit(1);
        await expect(pending).rejects.toThrow("stopped unexpectedly");

        hang = false;
        await expect(manager.authenticate("ext:local-ext/data8:a", "connect")).resolves.toMatchObject({ accessToken: "t" });
        expect(fake.factory).toHaveBeenCalledTimes(2);
    });
});
