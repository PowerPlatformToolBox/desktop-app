/** Existing count/range behavior, or opt-in fixed slot definitions in a tool package.json. */
export type ToolConnectionRequirement = number | ToolConnectionRange | ToolConnectionSlots;

export interface ToolConnectionSlot {
    /** Purpose shown in the selection dialog. Defaults to Primary/Secondary/Connection N. */
    label?: string;
    /** Allowed products for this slot; defaults to Dataverse. */
    connectionTypes?: Array<"dataverse" | "financeOperations">;
    /** Whether an assignment is mandatory; defaults to true. */
    required?: boolean;
}

export interface ToolConnectionSlots {
    /** One to ten fixed, ordered slots. Optional holes preserve their indexes. */
    slots: ToolConnectionSlot[];
    min?: never;
    max?: never;
}

export interface ToolConnectionRange {
    slots?: never;
    /** Minimum number of connections required; defaults to 1. */
    min?: number;
    /** Maximum number of connections available; defaults to min. */
    max?: number;
}

/** Feature declarations supported in a tool package.json `features` object. */
export interface ToolPackageFeatures {
    /** Count/range supported products; defaults to Dataverse. Cannot be combined with slots. */
    connectionTypes?: Array<"dataverse" | "financeOperations">;
    /** Exact count from 0 to 10, a range, or one to ten explicit slot definitions. */
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
