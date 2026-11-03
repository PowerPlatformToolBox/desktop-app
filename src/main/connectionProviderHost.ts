/**
 * Connection provider host
 *
 * Runs inside an Electron utility process (one per provider). Loads the provider module
 * declared by an extension and bridges calls between it and the main process.
 */

import { createRequire } from "module";
import type {
    ConnectionProvider,
    ConnectionProviderChildMessage,
    ConnectionProviderHost,
    ConnectionProviderHostMethod,
    ConnectionProviderMethod,
    ConnectionProviderParentMessage,
    ProviderPromptResult,
} from "../common/types/connectionProvider";

interface ParentPort {
    on(event: "message", listener: (event: { data: unknown }) => void): void;
    postMessage(message: unknown): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
const PROVIDER_METHODS: ConnectionProviderMethod[] = ["getConnections", "authenticate", "getConnectionById", "signOut", "dispose"];

let provider: (ConnectionProvider & Record<string, unknown>) | null = null;
let nextHostCallId = 1;
const pendingHostCalls = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

function send(message: ConnectionProviderChildMessage): void {
    parentPort?.postMessage(message);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function callHost(method: ConnectionProviderHostMethod, args: unknown[]): Promise<unknown> {
    const id = nextHostCallId++;
    return new Promise((resolve, reject) => {
        pendingHostCalls.set(id, { resolve, reject });
        send({ type: "host-call", id, method, args });
    });
}

function createHost(providerId: string): ConnectionProviderHost {
    return {
        providerId,
        acquireEntraToken: (request) => callHost("acquireEntraToken", [request]) as ReturnType<ConnectionProviderHost["acquireEntraToken"]>,
        prompt: (request) => callHost("prompt", [request]) as Promise<ProviderPromptResult | null>,
        log: {
            info: (message) => send({ type: "log", level: "info", message: String(message) }),
            warn: (message) => send({ type: "log", level: "warn", message: String(message) }),
            error: (message) => send({ type: "log", level: "error", message: String(message) }),
        },
    };
}

function resolveProviderConstructor(moduleExports: unknown): new (host: ConnectionProviderHost) => ConnectionProvider {
    const candidates = [moduleExports, (moduleExports as Record<string, unknown> | null)?.default, (moduleExports as Record<string, unknown> | null)?.ConnectionProvider];
    const ctor = candidates.find((candidate) => typeof candidate === "function");
    if (!ctor) {
        throw new Error("Provider module must export a class (module.exports, default or ConnectionProvider)");
    }
    return ctor as new (host: ConnectionProviderHost) => ConnectionProvider;
}

function initialize(providerId: string, modulePath: string): void {
    try {
        const moduleExports = createRequire(modulePath)(modulePath);
        const ProviderClass = resolveProviderConstructor(moduleExports);
        provider = new ProviderClass(createHost(providerId)) as ConnectionProvider & Record<string, unknown>;
        if (typeof provider.getConnections !== "function" || typeof provider.authenticate !== "function") {
            throw new Error("Provider must implement getConnections() and authenticate()");
        }
        const methods = PROVIDER_METHODS.filter((method) => typeof provider?.[method] === "function");
        send({ type: "ready", methods });
    } catch (error) {
        provider = null;
        send({ type: "init-error", error: errorMessage(error) });
    }
}

async function handleCall(id: number, method: ConnectionProviderMethod, args: unknown[]): Promise<void> {
    try {
        if (!provider) throw new Error("Provider is not initialized");
        if (!PROVIDER_METHODS.includes(method)) throw new Error(`Unknown provider method: ${String(method)}`);
        const fn = provider[method];
        if (typeof fn !== "function") throw new Error(`Provider does not implement ${method}()`);
        const result = await (fn as (...params: unknown[]) => unknown).apply(provider, args);
        send({ type: "result", id, result: result === undefined ? null : result });
    } catch (error) {
        send({ type: "error", id, error: errorMessage(error) });
    }
}

parentPort?.on("message", (event) => {
    const message = event.data as ConnectionProviderParentMessage;
    if (!message || typeof message !== "object") return;

    switch (message.type) {
        case "init":
            initialize(message.providerId, message.modulePath);
            break;
        case "call":
            void handleCall(message.id, message.method, Array.isArray(message.args) ? message.args : []);
            break;
        case "host-result": {
            const pending = pendingHostCalls.get(message.id);
            pendingHostCalls.delete(message.id);
            pending?.resolve(message.result);
            break;
        }
        case "host-error": {
            const pending = pendingHostCalls.get(message.id);
            pendingHostCalls.delete(message.id);
            pending?.reject(new Error(message.error));
            break;
        }
    }
});
