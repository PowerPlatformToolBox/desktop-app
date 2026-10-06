import * as fs from "fs";
import { createHash } from "crypto";
import * as path from "path";
import type { Tool } from "../../common/types";
import type { NativeWorkerIdentity } from "../managers/nativeWorkerConsentManager";
import { readWorkerMetadata } from "./workerMetadata";

export interface LoadedToolIdentity {
    readonly toolId: string;
    readonly toolName: string;
    readonly toolVersion: string;
    readonly sourcePath: string | null;
}

export function nativeWorkerSourceFingerprint(loaded: LoadedToolIdentity): string {
    if (!loaded.sourcePath) throw new Error("Missing native worker source");
    return createHash("sha256")
        .update(
            JSON.stringify({
                path: loaded.sourcePath,
                realPath: fs.realpathSync(loaded.sourcePath),
                package: createHash("sha256")
                    .update(fs.readFileSync(path.join(loaded.sourcePath, "package.json")))
                    .digest("hex"),
                config: createHash("sha256")
                    .update(fs.readFileSync(path.join(loaded.sourcePath, "pptb.config.json")))
                    .digest("hex"),
            }),
        )
        .digest("hex");
}

export function resolveNativeWorkerIdentity(loaded: LoadedToolIdentity | null, tool: Tool | undefined, currentSourcePath: string | undefined, workerId: string): NativeWorkerIdentity | null {
    if (!loaded?.sourcePath || !tool || !currentSourcePath || tool.id !== loaded.toolId || tool.version !== loaded.toolVersion || path.resolve(currentSourcePath) !== loaded.sourcePath) return null;
    try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(loaded.sourcePath, "package.json"), "utf-8"));
        if (packageJson.version !== loaded.toolVersion) return null;
        const declaration = readWorkerMetadata(loaded.sourcePath, packageJson)?.[workerId];
        if (!declaration) return null;
        return { toolId: loaded.toolId, toolName: loaded.toolName, toolVersion: loaded.toolVersion, declaration };
    } catch {
        return null;
    }
}
