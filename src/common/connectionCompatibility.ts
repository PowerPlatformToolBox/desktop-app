import type { ToolFeatures } from "./types/tool";
import { resolveConnectionType, type Connection, type ConnectionType } from "./types/connection";
import { hasConnectionSlotDefinitions, resolveConnectionRequirements, type ConnectionIds } from "./connectionSlots";

/** Validate a draft or complete slot assignment. Returns fixed indexes with explicit optional holes. */
export function validateConnectionAssignments(
    connectionIds: ConnectionIds,
    features: ToolFeatures | undefined,
    getConnection: (id: string) => Connection | null | undefined,
    complete = true,
): ConnectionIds {
    const requirements = resolveConnectionRequirements(features);
    if (connectionIds.length > requirements.max) throw new Error(`Tool accepts at most ${requirements.max} connection slots.`);
    const normalized = requirements.explicit ? Array.from({ length: requirements.max }, (_, index) => connectionIds[index] ?? null) : [...connectionIds];
    for (const [index, slot] of requirements.slots.entries()) {
        const id = normalized[index];
        if (!id) {
            if (complete && slot.required) throw new Error(`Connection slot ${index + 1} (${slot.label}) is required.`);
            continue;
        }
        const connection = getConnection(id);
        if (!connection) throw new Error(`Connection '${id}' for slot ${index + 1} (${slot.label}) not found.`);
        if (!isConnectionCompatible(connection, { connectionTypes: slot.connectionTypes, enabledForPowerPlatformAPI: features?.enabledForPowerPlatformAPI })) {
            throw new Error(`Connection '${connection.name}' (${resolveConnectionType(connection.connectionType)}) is not compatible with slot ${index + 1} (${slot.label}).`);
        }
    }
    return normalized;
}

export function resolveSupportedConnectionTypes(features?: ToolFeatures | null): ConnectionType[] {
    if (hasConnectionSlotDefinitions(features?.connections)) return [...new Set(resolveConnectionRequirements(features).slots.flatMap((slot) => slot.connectionTypes))];
    const types = features?.connectionTypes;
    if (types === undefined) return ["dataverse"];
    if (!Array.isArray(types) || types.length === 0 || new Set(types).size !== types.length) {
        throw new Error("Supported connection types must be a non-empty, unique list.");
    }
    return types.map((type) => {
        if (type === undefined) throw new Error("Invalid supported connection type.");
        return resolveConnectionType(type);
    });
}

export function isConnectionCompatible(connection: Pick<Connection, "connectionType" | "authenticationType" | "enabledForPowerPlatformAPI">, features?: ToolFeatures | null): boolean {
    const type = resolveConnectionType(connection.connectionType);
    if (!resolveSupportedConnectionTypes(features).includes(type)) return false;
    if (features?.enabledForPowerPlatformAPI) {
        return type === "dataverse" && connection.authenticationType === "clientSecret" && connection.enabledForPowerPlatformAPI === true;
    }
    return true;
}

export function assertConnectionCompatible(connection: Connection, features?: ToolFeatures | null): void {
    if (!isConnectionCompatible(connection, features)) {
        throw new Error(`Connection '${connection.name}' (${resolveConnectionType(connection.connectionType)}) is not compatible with this tool's connection requirements.`);
    }
}
