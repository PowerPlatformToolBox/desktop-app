import type { DotNetDiscoverySelection } from "./dotnetWorker";
import type { NormalizedWorkerDeclaration } from "./tool";

export interface DotNetToolIdentity {
    toolId: string;
    toolVersion: string;
    workerId: string;
    sourceFingerprint: string;
}

export interface DotNetToolPreparationRequest {
    identity: DotNetToolIdentity;
    declaration: NormalizedWorkerDeclaration;
    selection: DotNetDiscoverySelection;
}

export interface DotNetPreparedTool {
    identity: DotNetToolIdentity;
    declarationFingerprint: string;
    preparationFingerprint: string;
    workspace: string;
    manifestPath: string;
    packageId: string;
    packageVersion: string;
    command: string;
    entryPoint: string;
    runtimeConfigPath: string;
    depsPath: string;
    selection: DotNetDiscoverySelection;
    integrityHash: string;
    reused: boolean;
}

export type DotNetToolPreparationErrorCode =
    | "APPROVAL_DENIED"
    | "INVALID_REQUEST"
    | "DISCOVERY_CHANGED"
    | "SDK_MISMATCH"
    | "WORKSPACE_INVALID"
    | "PREPARATION_BUSY"
    | "RESTORE_FAILED"
    | "ARTIFACT_INVALID"
    | "CACHE_INVALID";
