/**
 * Launch argument parsing for the `--debug-tool` CLI flag.
 *
 * This module is deliberately free of Electron imports so it can be unit tested
 * as a pure function. It scans the WHOLE argv array — there is no packaged /
 * unpackaged slice heuristic — which makes it robust against Electron switches
 * preceding the script path, Chromium-injected switches, and the `commandLine`
 * array forwarded by the `second-instance` event.
 */

import { createHash } from "crypto";
import * as os from "os";
import * as path from "path";

/** Upper bound on an accepted path argument, guarding against absurd input. */
const MAX_PATH_LENGTH = 4096;

const DEBUG_TOOL_FLAG = "--debug-tool";
const DEBUG_TOOL_CONNECTION_FLAG = "--debug-tool-connection";
const DEVTOOLS_FLAG = "--devtools";

export interface LaunchArgs {
    /** Absolute, resolved path of the tool directory to mount, or null when not requested. */
    debugToolPath: string | null;
    /** Connection id or name supplied via `--debug-tool-connection`, or null. */
    debugToolConnection: string | null;
    /** True when `--devtools` was supplied. */
    openDevTools: boolean;
}

/**
 * Produce a Sentry-safe description of a filesystem path.
 *
 * Every logger function in this app forwards to Sentry, so raw user paths must
 * never be passed to one. `basename#sha8` keeps entries correlatable across log
 * lines without disclosing the directory structure or the user's name.
 */
export function describePath(fullPath: string): string {
    if (typeof fullPath !== "string" || fullPath.length === 0) {
        return "unknown";
    }

    const hash = createHash("sha256").update(fullPath).digest("hex").slice(0, 8);
    return `${path.basename(fullPath)}#${hash}`;
}

function isFlagLike(value: string): boolean {
    return value.startsWith("-");
}

function expandHome(value: string, homeDir: string): string {
    if (value === "~") {
        return homeDir;
    }

    if (value.startsWith("~/") || value.startsWith("~\\")) {
        return path.join(homeDir, value.slice(2));
    }

    return value;
}

function normalizePathValue(rawValue: string, cwd: string, homeDir: string): string | null {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_PATH_LENGTH || trimmed.includes("\0")) {
        return null;
    }

    return path.resolve(cwd, expandHome(trimmed, homeDir));
}

function normalizeConnectionValue(rawValue: string): string | null {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_PATH_LENGTH || trimmed.includes("\0")) {
        return null;
    }

    return trimmed;
}

/**
 * Parse launch arguments for the debug-tool flags.
 *
 * Last occurrence wins for each flag. Unknown switches are ignored. A flag that
 * expects a value never consumes a following switch as that value.
 */
export function parseLaunchArgs(argv: readonly string[], cwd: string, homeDir: string = os.homedir()): LaunchArgs {
    const result: LaunchArgs = {
        debugToolPath: null,
        debugToolConnection: null,
        openDevTools: false,
    };

    if (!Array.isArray(argv)) {
        return result;
    }

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (typeof arg !== "string") {
            continue;
        }

        if (arg === DEVTOOLS_FLAG) {
            result.openDevTools = true;
            continue;
        }

        if (arg.startsWith(`${DEBUG_TOOL_CONNECTION_FLAG}=`)) {
            result.debugToolConnection = normalizeConnectionValue(arg.slice(DEBUG_TOOL_CONNECTION_FLAG.length + 1));
            continue;
        }

        if (arg === DEBUG_TOOL_CONNECTION_FLAG) {
            const next = argv[index + 1];
            if (typeof next === "string" && !isFlagLike(next)) {
                result.debugToolConnection = normalizeConnectionValue(next);
                index++;
            }
            continue;
        }

        if (arg.startsWith(`${DEBUG_TOOL_FLAG}=`)) {
            result.debugToolPath = normalizePathValue(arg.slice(DEBUG_TOOL_FLAG.length + 1), cwd, homeDir);
            continue;
        }

        if (arg === DEBUG_TOOL_FLAG) {
            const next = argv[index + 1];
            if (typeof next === "string" && !isFlagLike(next)) {
                result.debugToolPath = normalizePathValue(next, cwd, homeDir);
                index++;
            }
            continue;
        }
    }

    return result;
}
