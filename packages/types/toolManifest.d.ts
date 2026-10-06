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
    /** Restrict connection selection to connections enabled for the Power Platform API. */
    enabledForPowerPlatformAPI?: boolean;
}
