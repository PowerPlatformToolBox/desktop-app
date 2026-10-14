import type { ToolFeatures } from "./types/tool";
import type { ConnectionType } from "./types/connection";
import { hasConnectionSlotDefinitions, validateConnectionSlotDefinitions } from "../../packages/validation/src/connectionSlots";

export interface ResolvedConnectionSlot {
    label: string;
    connectionTypes: ConnectionType[];
    required: boolean;
}

export interface ConnectionRequirements extends ConnectionSlotRange {
    explicit: boolean;
    slots: ResolvedConnectionSlot[];
}

export { hasConnectionSlotDefinitions };

export function hasRequiredConnectionAssignments(features: ToolFeatures | undefined, ids: ConnectionIds): boolean {
    return resolveConnectionRequirements(features).slots.every((slot, index) => !slot.required || Boolean(ids[index]));
}

export function connectionSlotFeatures(features: ToolFeatures | undefined, index: number): ToolFeatures {
    const slot = resolveConnectionRequirements(features).slots[index];
    if (!slot) throw new Error(`Connection slot ${index + 1} is not declared.`);
    return { connectionTypes: slot.connectionTypes, enabledForPowerPlatformAPI: features?.enabledForPowerPlatformAPI };
}

/** Normalize requirements without changing existing count/range/legacy defaults. */
export function resolveConnectionRequirements(features?: ToolFeatures | null): ConnectionRequirements {
    if (hasConnectionSlotDefinitions(features?.connections)) {
        const errors = validateConnectionSlotDefinitions(features.connections, features ?? {});
        if (errors.length) throw new Error(errors.join("\n"));
        const slots = features.connections.slots.map((slot, index) => ({
            label: slot.label?.trim() ?? connectionTargetLabel(index),
            connectionTypes: [...(slot.connectionTypes ?? ["dataverse"])] as ConnectionType[],
            required: slot.required ?? true,
        }));
        return { explicit: true, min: slots.filter((slot) => slot.required).length, max: slots.length, slots };
    }
    const range = resolveLegacyConnectionSlots(features);
    return {
        ...range,
        explicit: false,
        slots: Array.from({ length: range.max }, (_, index) => ({
            label: connectionTargetLabel(index),
            connectionTypes: [...(features?.connectionTypes ?? ["dataverse"])],
            required: index < range.min,
        })),
    };
}

export interface ConnectionSlotRange {
    min: number;
    max: number;
}

export type ConnectionTarget = "primary" | "secondary" | number;
export type ConnectionIds = Array<string | null>;

export function resolveConnectionSlots(features?: ToolFeatures | null): ConnectionSlotRange {
    // Counts are summaries; assignment enforcement must use ordered requirements.
    const { min, max } = resolveConnectionRequirements(features);
    return { min, max };
}

function resolveLegacyConnectionSlots(features?: ToolFeatures | null): ConnectionSlotRange {
    if (!features) {
        return { min: 1, max: 1 };
    }

    if (features.connections !== undefined) {
        if (typeof features.connections === "number") {
            return { min: features.connections, max: features.connections };
        }

        const min = features.connections.min ?? 1;
        return { min, max: features.connections.max ?? min };
    }

    const multiConnection = features.multiConnection ?? "none";
    const connectionRequirement = features.connectionRequirement ?? "required";

    if (multiConnection === "none") {
        return connectionRequirement === "optional" ? { min: 0, max: 1 } : { min: 1, max: 1 };
    }

    if (connectionRequirement === "optional") {
        return { min: 0, max: 2 };
    }

    return multiConnection === "required" ? { min: 2, max: 2 } : { min: 1, max: 2 };
}

export function normalizeConnectionTarget(target: ConnectionTarget): number {
    if (target === "primary") return 0;
    if (target === "secondary") return 1;
    if (Number.isInteger(target) && target >= 0) return target;
    throw new RangeError(`Invalid connection target: ${String(target)}`);
}

export function legacyConnectionIds(primaryConnectionId: string | null | undefined, secondaryConnectionId?: string | null): ConnectionIds {
    return [primaryConnectionId ?? null, secondaryConnectionId ?? null];
}

export function connectionTargetLabel(index: number): string {
    if (!Number.isInteger(index) || index < 0) {
        throw new RangeError(`Invalid connection slot index: ${index}`);
    }
    if (index === 0) return "Primary";
    if (index === 1) return "Secondary";
    return `Connection ${index + 1}`;
}
