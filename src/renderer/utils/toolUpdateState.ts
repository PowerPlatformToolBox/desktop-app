export type ToolUpdateStatus = "queued" | "updating" | "updated" | "failed" | "check-failed";

interface ToolUpdateStateEntry {
    status: ToolUpdateStatus;
    message?: string;
}

export class ToolUpdateState {
    private readonly toolStates = new Map<string, ToolUpdateStateEntry>();

    markQueued(toolIds: Iterable<string>): void {
        for (const toolId of toolIds) {
            this.toolStates.set(toolId, { status: "queued" });
        }
    }

    markUpdating(toolId: string): void {
        this.toolStates.set(toolId, { status: "updating" });
    }

    markComplete(toolId: string): void {
        this.toolStates.set(toolId, { status: "updated" });
    }

    markFailed(toolId: string, status: "failed" | "check-failed", message: string): void {
        this.toolStates.set(toolId, { status, message });
    }

    isUpdating(toolId: string): boolean {
        return this.toolStates.get(toolId)?.status === "updating";
    }

    getStatus(toolId: string): ToolUpdateStateEntry | undefined {
        return this.toolStates.get(toolId);
    }

    clear(): void {
        this.toolStates.clear();
    }
}
