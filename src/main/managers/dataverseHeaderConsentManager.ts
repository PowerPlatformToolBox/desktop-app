import { randomUUID } from "crypto";
import { WebContents } from "electron";
import { DATAVERSE_HEADER_CONSENT_CHANNELS } from "../../common/ipc/channels";
import { DataverseAdditionalHeaders, DataverseBatchRequest, DataverseHeaderConsentDecision, DataverseHeaderConsentRequest } from "../../common/types";
import { validateAndSnapshotHeaders, validateBatchRequests } from "../utilities/dataverseBatch";
import { SettingsManager } from "./settingsManager";

interface PendingConsent {
    sender: WebContents;
    mainWebContents?: WebContents;
    request: DataverseHeaderConsentRequest;
    resolve: () => void;
    reject: (error: Error) => void;
    timeout?: NodeJS.Timeout;
    destroyedListener?: () => void;
    mainDestroyedListener?: () => void;
}

export class DataverseHeaderConsentManager {
    private readonly queue: PendingConsent[] = [];
    private active: PendingConsent | null = null;

    constructor(
        private readonly settingsManager: SettingsManager,
        private readonly getMainWebContents: () => WebContents | null,
        private readonly resolveToolIdentity: (webContentsId: number) => { toolId: string; toolName: string } | null,
        private readonly timeoutMs = 120_000,
    ) {}

    async authorize(sender: WebContents, operation: string, additionalHeaders?: Record<string, string>): Promise<DataverseAdditionalHeaders> {
        const headers = validateAndSnapshotHeaders(additionalHeaders);
        if (Object.keys(headers).length === 0) return headers;

        await this.ensureConsent(
            sender,
            operation,
            Object.entries(headers).map(([name, value]) => ({ name, value })),
        );
        return headers;
    }

    async authorizeBatch(
        sender: WebContents,
        operation: string,
        requests: DataverseBatchRequest[],
        transaction: boolean,
        additionalHeaders?: Record<string, string>,
    ): Promise<{ requests: ReadonlyArray<Readonly<DataverseBatchRequest>>; additionalHeaders: DataverseAdditionalHeaders }> {
        const validatedRequests = validateBatchRequests(requests, transaction);
        const headers = validateAndSnapshotHeaders(additionalHeaders);
        const consentHeaders = [
            ...Object.entries(headers).map(([name, value]) => ({ name, value, scope: "Batch request" })),
            ...validatedRequests.flatMap((request, index) =>
                Object.entries(request.headers ?? {}).map(([name, value]) => ({
                    name,
                    value,
                    scope: `Operation ${index + 1}: ${request.method} ${request.url}`,
                })),
            ),
        ];

        if (consentHeaders.length > 0) await this.ensureConsent(sender, operation, consentHeaders);
        return { requests: validatedRequests, additionalHeaders: headers };
    }

    private async ensureConsent(sender: WebContents, operation: string, headers: Array<{ name: string; value: string; scope?: string }>): Promise<void> {
        const identity = this.resolveToolIdentity(sender.id);
        if (!identity) throw new Error("Dataverse header consent denied: untrusted tool sender");
        if (this.settingsManager.hasDataverseHeaderConsent(identity.toolId)) return;

        return new Promise<void>((resolve, reject) => {
            this.queue.push({
                sender,
                request: Object.freeze({
                    requestId: randomUUID(),
                    toolId: identity.toolId,
                    toolName: identity.toolName,
                    operation,
                    headers: Object.freeze(headers.map((header) => Object.freeze({ ...header }))),
                }),
                resolve,
                reject,
            });
            this.showNext();
        });
    }

    respond(requestId: string, decision: DataverseHeaderConsentDecision): boolean {
        const pending = this.active;
        if (!pending || pending.request.requestId !== requestId || !(["allow-tool", "allow-once", "reject"] as string[]).includes(decision)) return false;

        if (decision === "allow-tool") {
            this.settingsManager.grantDataverseHeaderConsent(pending.request.toolId);
        }
        if (decision === "reject") {
            this.finishActive(new Error("Dataverse additional headers were rejected"));
        } else {
            this.finishActive();
        }
        return true;
    }

    dispose(): void {
        if (this.active) this.finishActive(new Error("Dataverse header consent was cancelled"), false);
        while (this.queue.length > 0) this.queue.shift()?.reject(new Error("Dataverse header consent was cancelled"));
    }

    private showNext(): void {
        if (this.active) return;
        const pending = this.queue.shift();
        if (!pending) return;
        if (pending.sender.isDestroyed()) {
            pending.reject(new Error("Dataverse header consent caller closed"));
            this.showNext();
            return;
        }
        const mainWebContents = this.getMainWebContents();
        if (!mainWebContents || mainWebContents.isDestroyed()) {
            pending.reject(new Error("Dataverse header consent UI is unavailable"));
            this.showNext();
            return;
        }

        this.active = pending;
        pending.mainWebContents = mainWebContents;
        pending.destroyedListener = () => this.finishActive(new Error("Dataverse header consent caller closed"));
        pending.mainDestroyedListener = () => this.finishActive(new Error("Dataverse header consent UI closed"));
        pending.sender.once("destroyed", pending.destroyedListener);
        mainWebContents.once("destroyed", pending.mainDestroyedListener);
        pending.timeout = setTimeout(() => this.finishActive(new Error("Dataverse header consent timed out")), this.timeoutMs);
        mainWebContents.send(DATAVERSE_HEADER_CONSENT_CHANNELS.REQUEST, pending.request);
    }

    private finishActive(error?: Error, continueQueue = true): void {
        const pending = this.active;
        if (!pending) return;
        this.active = null;
        if (pending.timeout) clearTimeout(pending.timeout);
        if (pending.destroyedListener && !pending.sender.isDestroyed()) pending.sender.removeListener("destroyed", pending.destroyedListener);
        if (pending.mainDestroyedListener && pending.mainWebContents && !pending.mainWebContents.isDestroyed()) pending.mainWebContents.removeListener("destroyed", pending.mainDestroyedListener);
        if (error) pending.reject(error);
        else pending.resolve();
        if (continueQueue) this.showNext();
    }
}
