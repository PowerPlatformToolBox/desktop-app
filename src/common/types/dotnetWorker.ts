import type { WorkerPlatform } from "./tool";

export type NativeWorkerPlatform = Exclude<WorkerPlatform, "all">;
export type DotNetDiscoveryErrorCode =
    | "INVALID_PLATFORM"
    | "PLATFORM_UNSUPPORTED"
    | "ARCHITECTURE_UNSUPPORTED"
    | "ARCHITECTURE_MISMATCH"
    | "INVALID_RUNTIME_REQUIREMENT"
    | "INVALID_HOST"
    | "HOST_NOT_FOUND"
    | "PROBE_FAILED"
    | "PROBE_TIMEOUT"
    | "PROBE_OUTPUT_INVALID"
    | "SDK_NOT_FOUND"
    | "SDK_CONFIG_INVALID"
    | "SDK_RUNTIME_NOT_FOUND"
    | "RUNTIME_NOT_FOUND";

export interface DotNetDiscoveryFailure {
    code: DotNetDiscoveryErrorCode;
    message: string;
}

export type DotNetResult<Value> = { ok: true; value: Value } | { ok: false; error: DotNetDiscoveryFailure };

export interface DotNetVersion {
    major: number;
    minor: number;
    patch: number;
    version: string;
}

export interface DotNetInstallation extends DotNetVersion {
    directory: string;
}

export interface DotNetHostAttempt {
    hostPath: string;
    error: DotNetDiscoveryFailure;
}

export interface DotNetDiscoverySelection {
    hostPath: string;
    hostRoot: string;
    architecture: "x64" | "arm64";
    platform: NativeWorkerPlatform;
    nativeRid: string;
    platformMatrixVersion: 1;
    sdk: DotNetInstallation;
    sdkRuntime: DotNetInstallation;
    sdkRuntimeConfigPath: string;
    runtime: DotNetInstallation;
    nativeRollForward: "Disable" | "LatestMajor" | "Minor" | "Major";
    sdkPin: { sdk: { version: string; rollForward: "disable"; allowPrerelease: false; paths: ["$host$"] } };
    attempts: DotNetHostAttempt[];
}

export type DotNetDiscoveryResult = { ok: true; value: DotNetDiscoverySelection } | { ok: false; error: DotNetDiscoveryFailure; attempts: DotNetHostAttempt[] };
