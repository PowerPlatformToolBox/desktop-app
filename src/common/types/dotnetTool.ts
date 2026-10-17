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
    workspace: string;
    packageId: string;
    packageVersion: string;
    packageSha512: string;
    command: string;
    entryPoint: string;
    runtimeConfigPath: string;
    depsPath: string;
    selection: DotNetDiscoverySelection;
    reused: boolean;
}

export type DotNetToolPreparationErrorCode =
    "CANCELLED" | "APPROVAL_DENIED" | "INVALID_REQUEST" | "PACKAGE_NOT_FOUND" | "DOWNLOAD_FAILED" | "PACKAGE_HASH_MISMATCH" | "PACKAGE_INVALID" | "WORKSPACE_INVALID";
