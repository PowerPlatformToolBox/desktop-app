import { utilityProcess } from "electron";
import * as path from "path";
import { logInfo, logWarn } from "../../common/logger";
import type { ConnectionProviderChildMessage } from "../../common/types";
import type { ConnectionProviderProcess, ConnectionProviderProcessFactory } from "./connectionProviderManager";

/**
 * Set to a truthy value (e.g. "1") to expose a Node inspector port on each provider's utility
 * process, or to "brk"/"break" to additionally pause the process until a debugger attaches.
 * Dev-only: never enabled in production builds unless a developer sets this explicitly.
 */
const DEBUG_ENV_VAR = "PPTB_DEBUG_CONNECTION_PROVIDERS";
const DEBUG_BASE_PORT = 9230;

let nextDebugPort = DEBUG_BASE_PORT;

function getDebugExecArgv(): string[] | null {
    const value = process.env[DEBUG_ENV_VAR]?.trim().toLowerCase();
    if (!value || value === "0" || value === "false") return null;

    const flag = value === "brk" || value === "break" ? "--inspect-brk" : "--inspect";
    const port = nextDebugPort++;
    return [`${flag}=${port}`];
}

/**
 * Creates provider processes using Electron utility processes running the bundled connectionProviderHost.js script
 */
export function createUtilityProcessProviderFactory(hostScriptPath = path.join(__dirname, "connectionProviderHost.js")): ConnectionProviderProcessFactory {
    return ({ displayName, cwd }) => {
        const execArgv = getDebugExecArgv();
        const debugging = execArgv !== null;

        const child = utilityProcess.fork(hostScriptPath, [], {
            serviceName: `PPTB connection provider: ${displayName}`,
            cwd,
            stdio: debugging ? "pipe" : "ignore",
            execArgv: execArgv ?? [],
        });

        if (debugging) {
            logInfo(`[ConnectionProviders] Debugging enabled for "${displayName}" (${execArgv.join(" ")}). Attach with chrome://inspect or VS Code's "Attach to Node Process".`);
            child.stdout?.on("data", (chunk: Buffer) => logInfo(`[ConnectionProviders] [${displayName}] ${chunk.toString().trimEnd()}`));
            child.stderr?.on("data", (chunk: Buffer) => logWarn(`[ConnectionProviders] [${displayName}] ${chunk.toString().trimEnd()}`));
        }

        const process: ConnectionProviderProcess = {
            postMessage: (message) => child.postMessage(message),
            onMessage: (listener) => {
                child.on("message", (message: unknown) => listener(message as ConnectionProviderChildMessage));
            },
            onExit: (listener) => {
                child.on("exit", (code: number) => listener(code));
            },
            kill: () => {
                child.kill();
            },
        };
        return process;
    };
}
