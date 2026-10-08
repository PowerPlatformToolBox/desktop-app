import type { DotNetDiscoverySelection } from "./dotnetWorker";
import type { NormalizedWorkerDeclaration } from "./tool";

export const DOTNET_NUGET_ORG_SOURCE = "https://api.nuget.org/v3/index.json" as const;

export type DotNetPackageSource = { kind: "nuget.org"; url: typeof DOTNET_NUGET_ORG_SOURCE } | { kind: "local-feed"; path: string; packageSha512: string };

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
    source: DotNetPackageSource;
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
    | "CANCELLED"
    | "APPROVAL_DENIED"
    | "INVALID_REQUEST"
    | "DISCOVERY_CHANGED"
    | "SDK_MISMATCH"
    | "WORKSPACE_INVALID"
    | "PREPARATION_BUSY"
    | "RESTORE_FAILED"
    | "RESTORE_STOP_UNVERIFIED"
    | "ARTIFACT_INVALID"
    | "ARTIFACT_INVALID_CONFIGURATION"
    | "ARTIFACT_INVALID_PACKAGE_DIRECTORY"
    | "ARTIFACT_INVALID_PACKAGE_ARCHIVE_HASH"
    | "ARTIFACT_INVALID_PACKAGE_SIDECAR"
    | "ARTIFACT_INVALID_PACKAGE_METADATA"
    | "ARTIFACT_INVALID_PACKAGE_SOURCE"
    | "ARTIFACT_INVALID_NUSPEC"
    | "ARTIFACT_INVALID_RESOLVER"
    | "ARTIFACT_INVALID_TOOL_SETTINGS"
    | "ARTIFACT_INVALID_RUNTIME_CONFIG"
    | "ARTIFACT_INVALID_DEPENDENCY_MANIFEST"
    | "ARTIFACT_INVALID_DEPENDENCY_ASSETS"
    | "ARTIFACT_INVALID_INTEGRITY_INVENTORY"
    | "CACHE_INVALID";
