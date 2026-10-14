import { resolveConnectionRequirements, type ConnectionIds } from "../../common/connectionSlots";
import { isConnectionCompatible } from "../../common/connectionCompatibility";
import type { Connection } from "../../common/types/connection";
import type { ToolFeatures } from "../../common/types/tool";

/** Reconcile remembered IDs with the current manifest before attempting authentication. */
export async function revalidateSavedConnectionSlots(
    connectionIds: ConnectionIds,
    features: ToolFeatures | undefined,
    getConnection: (id: string) => Promise<Connection | null>,
): Promise<ConnectionIds> {
    const requirements = resolveConnectionRequirements(features);
    const ids = connectionIds.slice(0, requirements.max);
    if (requirements.explicit) while (ids.length < requirements.max) ids.push(null);
    return Promise.all(
        ids.map(async (id, index) => {
            if (!id) return null;
            const connection = await getConnection(id);
            const slot = requirements.slots[index];
            return connection && isConnectionCompatible(connection, { connectionTypes: slot.connectionTypes, enabledForPowerPlatformAPI: features?.enabledForPowerPlatformAPI }) ? id : null;
        }),
    );
}

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
