import type { NormalizedWorkerDeclaration } from "./tool";
import type { DotNetPackageSource } from "./dotnetTool";

export type NativeWorkerConsentDecision = "allow-tool" | "allow-once" | "reject";

export interface NativeWorkerConsentDescriptor {
    toolId: string;
    toolName: string;
    toolVersion: string;
    workerId: string;
    declaration: NormalizedWorkerDeclaration;
    source: DotNetPackageSource;
    protocolVersion: 1;
    platformMatrixVersion: 1;
}

export interface NativeWorkerConsentRecord extends NativeWorkerConsentDescriptor {
    fingerprint: string;
    approvedAt: string;
}

export interface NativeWorkerConsentRequest extends NativeWorkerConsentDescriptor {
    fingerprint: string;
    requestId: string;
}

export interface NativeWorkerConsentUI {
    getNativeWorkerConsents(): Promise<NativeWorkerConsentRecord[]>;
    revokeNativeWorkerConsent(fingerprint: string): Promise<void>;
    respondToNativeWorkerConsent(requestId: string, decision: NativeWorkerConsentDecision): Promise<boolean>;
    onNativeWorkerConsentRequest(callback: (request: NativeWorkerConsentRequest) => void): () => void;
    onNativeWorkerConsentClosed(callback: (requestId: string) => void): () => void;
}
