export type ToolSafeConnection = {
    id: string;
    name: string;
    url: string;
    environment: "Dev" | "Test" | "UAT" | "Production";
    createdAt?: string;
    lastUsedAt?: string;
    isActive?: boolean;
    category?: string;
    environmentColor?: string;
    categoryColor?: string;
    enabledForPowerPlatformAPI?: boolean;
    scopesForPowerPlatformAPI?: string[];
};

/**
 * Allowlist connection metadata for tools. Never copy credentials or unknown fields.
 */
export function toToolSafeConnectionUpdates(connection: unknown): Partial<ToolSafeConnection> {
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
        throw new Error("Invalid connection metadata");
    }

    const source = connection as Record<string, unknown>;
    const result: Partial<ToolSafeConnection> = {};
    for (const key of ["id", "name", "url", "createdAt", "lastUsedAt", "category", "environmentColor", "categoryColor"] as const) {
        if (typeof source[key] === "string") {
            result[key] = source[key];
        }
    }
    if (source.environment === "Dev" || source.environment === "Test" || source.environment === "UAT" || source.environment === "Production") {
        result.environment = source.environment;
    }
    for (const key of ["isActive", "enabledForPowerPlatformAPI"] as const) {
        if (typeof source[key] === "boolean") {
            result[key] = source[key];
        }
    }
    if (Array.isArray(source.scopesForPowerPlatformAPI) && source.scopesForPowerPlatformAPI.every((scope) => typeof scope === "string")) {
        result.scopesForPowerPlatformAPI = [...source.scopesForPowerPlatformAPI];
    }
    return result;
}

export function toToolSafeConnection(connection: unknown): ToolSafeConnection | null {
    if (!connection || typeof connection !== "object" || Array.isArray(connection)) {
        return null;
    }

    const result = toToolSafeConnectionUpdates(connection);
    if (result.id === undefined || result.name === undefined || result.url === undefined || result.environment === undefined) {
        return null;
    }

    return { ...result, id: result.id, name: result.name, url: result.url, environment: result.environment };
}
