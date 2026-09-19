/**
 * Types for user-submitted "Report a Concern" tool reports.
 * See docs/TOOL_CONCERN_REPORTING_SCHEMA.md for the backing Supabase table.
 */

export type ToolConcernReportReason = "spam" | "malicious" | "inappropriate" | "community-values" | "other";

export type ToolConcernReportSource = "tool-detail" | "sidebar-menu" | "app-menu";

/** Payload sent from the renderer when a user submits a concern report. */
export interface ToolConcernReportSubmission {
    toolId: string;
    toolName: string;
    toolVersion?: string;
    reason: ToolConcernReportReason;
    description?: string;
    email?: string;
    source: ToolConcernReportSource;
    maturity?: string;
}

export interface ToolConcernReportResult {
    success: boolean;
    error?: string;
}
