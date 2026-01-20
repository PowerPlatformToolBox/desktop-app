import { DataverseConnection, UIConnectionData } from "../../common/types/connection";
import { ConnectionsSortOption } from "../../common/types/settings";

/**
 * Environment sort order for connection sorting
 */
export const ENVIRONMENT_SORT_ORDER: Record<string, number> = {
    Dev: 1,
    Test: 2,
    UAT: 3,
    Production: 4,
};

/**
 * Get the timestamp to use for last-used sorting.
 * Falls back to createdAt if lastUsedAt is not available or invalid.
 * Returns 0 if neither timestamp is available.
 */
export function getLastUsedTimestamp(conn: DataverseConnection | UIConnectionData): number {
    if (conn.lastUsedAt) {
        const parsedLastUsed = Date.parse(conn.lastUsedAt);
        if (!Number.isNaN(parsedLastUsed)) {
            return parsedLastUsed;
        }
    }

    const parsedCreated = conn.createdAt ? Date.parse(conn.createdAt) : NaN;
    if (!Number.isNaN(parsedCreated)) {
        return parsedCreated;
    }

    return 0;
}

/**
 * Sort connections based on the specified sort option.
 * Returns a new sorted array without modifying the original.
 */
export function sortConnections<T extends DataverseConnection | UIConnectionData>(connections: T[], sortOption: ConnectionsSortOption): T[] {
    return [...connections].sort((a, b) => {
        switch (sortOption) {
            case "last-used": {
                const diff = getLastUsedTimestamp(b) - getLastUsedTimestamp(a);
                if (diff !== 0) {
                    return diff;
                }
                return a.name.localeCompare(b.name);
            }
            case "name-desc":
                return b.name.localeCompare(a.name);
            case "environment": {
                const aOrder = ENVIRONMENT_SORT_ORDER[a.environment] ?? Number.MAX_SAFE_INTEGER;
                const bOrder = ENVIRONMENT_SORT_ORDER[b.environment] ?? Number.MAX_SAFE_INTEGER;
                if (aOrder !== bOrder) {
                    return aOrder - bOrder;
                }
                return a.name.localeCompare(b.name);
            }
            case "name-asc":
            default:
                return a.name.localeCompare(b.name);
        }
    });
}

/**
 * Returns the JavaScript code for connection sorting utilities.
 * This is used for inline scripts in modal controllers.
 */
export function getConnectionSortingUtilitiesScript(): string {
    return `
    const ENVIRONMENT_SORT_ORDER = { Dev: 1, Test: 2, UAT: 3, Production: 4 };

    const getLastUsedTimestamp = (conn) => {
        if (!conn) {
            return 0;
        }

        if (conn.lastUsedAt) {
            const parsedLastUsed = Date.parse(conn.lastUsedAt);
            if (!Number.isNaN(parsedLastUsed)) {
                return parsedLastUsed;
            }
        }

        if (conn.createdAt) {
            const parsedCreated = Date.parse(conn.createdAt);
            if (!Number.isNaN(parsedCreated)) {
                return parsedCreated;
            }
        }

        return 0;
    };

    const sortConnections = (a, b, sortOption) => {
        const resolvedSort = sanitizeSortOption(sortOption);
        const nameA = (a.name || "");
        const nameB = (b.name || "");

        switch (resolvedSort) {
            case "last-used": {
                const diff = getLastUsedTimestamp(b) - getLastUsedTimestamp(a);
                if (diff !== 0) {
                    return diff;
                }
                return nameA.localeCompare(nameB);
            }
            case "name-desc":
                return nameB.localeCompare(nameA);
            case "environment": {
                const aOrder = ENVIRONMENT_SORT_ORDER[a.environment] ?? Number.MAX_SAFE_INTEGER;
                const bOrder = ENVIRONMENT_SORT_ORDER[b.environment] ?? Number.MAX_SAFE_INTEGER;
                if (aOrder !== bOrder) {
                    return aOrder - bOrder;
                }
                return nameA.localeCompare(nameB);
            }
            case "name-asc":
            default:
                return nameA.localeCompare(nameB);
        }
    };
`;
}
