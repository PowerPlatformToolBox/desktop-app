export class ToolUpdateState {
    private readonly updatingToolIds = new Set<string>();

    markUpdating(toolIds: Iterable<string>): void {
        for (const toolId of toolIds) {
            this.updatingToolIds.add(toolId);
        }
    }

    markComplete(toolId: string): void {
        this.updatingToolIds.delete(toolId);
    }

    isUpdating(toolId: string): boolean {
        return this.updatingToolIds.has(toolId);
    }

    clear(): void {
        this.updatingToolIds.clear();
    }
}
