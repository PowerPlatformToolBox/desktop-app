import type { ConnectionIds } from "../../common/connectionSlots";

interface StoredConnectionSlots {
    connectionIds?: ConnectionIds;
    connectionId?: string | null;
    secondaryConnectionId?: string | null;
}

export function copyConnectionSlots(tool: StoredConnectionSlots): ConnectionIds {
    return tool.connectionIds ? [...tool.connectionIds] : [tool.connectionId ?? null, tool.secondaryConnectionId ?? null];
}

export async function authenticateRestoredSlots(
    connectionIds: ConnectionIds,
    authenticate: (connectionId: string) => Promise<void>,
    onFailure: (slotIndex: number, error: unknown) => void,
): Promise<ConnectionIds> {
    const restoredIds = [...connectionIds];
    let nextSlot = 0;
    const worker = async (): Promise<void> => {
        while (nextSlot < restoredIds.length) {
            const slotIndex = nextSlot++;
            const connectionId = restoredIds[slotIndex];
            if (!connectionId) continue;
            try {
                await authenticate(connectionId);
            } catch (error) {
                restoredIds[slotIndex] = null;
                onFailure(slotIndex, error);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(2, restoredIds.length) }, worker));
    return restoredIds;
}
