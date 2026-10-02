import type { ToolFeatures } from "./types/tool";

export interface ConnectionSlotRange {
    min: number;
    max: number;
}

export type ConnectionTarget = "primary" | "secondary" | number;
export type ConnectionIds = Array<string | null>;

export function resolveConnectionSlots(features?: ToolFeatures | null): ConnectionSlotRange {
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
