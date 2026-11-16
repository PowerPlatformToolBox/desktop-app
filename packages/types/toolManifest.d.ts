/** Exact connection count or permitted connection-count range in a tool package.json. */
export type ToolConnectionRequirement = number | ToolConnectionRange;

export interface ToolConnectionRange {
    /** Minimum number of connections required; defaults to 1. */
    min?: number;
    /** Maximum number of connections available; defaults to min. */
    max?: number;
}

/** Feature declarations supported in a tool package.json `features` object. */
export interface ToolPackageFeatures {
    /** Preferred API declarations. Omitted required defaults to false. Graph needs explicit delegated read scopes. */
    apis?: {
        pp?: { required?: boolean };
        arm?: { required?: boolean };
        graph?: { required?: boolean; scopes: string[] };
    };
    /** Exact count from 0 to 10, or a range with 0 <= min <= max <= 10. */
    connections?: ToolConnectionRequirement;
    /**
     * Legacy connection cardinality setting. Use `connections` for new tools.
     * @deprecated Use `connections` instead.
     */
    multiConnection?: "required" | "optional" | "none";
    /**
     * Legacy connection-required setting. Use `connections` for new tools.
     * @deprecated Use `connections` instead.
     */
    connectionRequirement?: "required" | "optional";
    /** Minimum ToolBox API version required by this tool. */
    minAPI?: string;
    /**
     * Legacy Power Platform requirement hint. Does not block selection.
     * @deprecated Use `apis.pp.required` instead. Retained for backward compatibility.
     */
    enabledForPowerPlatformAPI?: boolean;
}
