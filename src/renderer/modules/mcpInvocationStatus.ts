import type { AgentInvocationLogEntry, HeadlessJobDetails } from "../../common/types";

type InvocationStatus = HeadlessJobDetails["status"] | "rejected" | "no-result";

export function getMcpInvocationStatus(outcome: AgentInvocationLogEntry["outcome"] | undefined, jobStatus?: HeadlessJobDetails["status"]): InvocationStatus {
    return jobStatus ?? (outcome === "in-progress" ? "in_progress" : (outcome ?? "pending"));
}

export function getMcpInvocationStatusBadgeStyle(status: InvocationStatus): string {
    switch (status) {
        case "completed":
            return "background: #107c10; color: white;";
        case "failed":
        case "rejected":
            return "background: #d13438; color: white;";
        case "in_progress":
            return "background: #0f6cbd; color: white;";
        case "pending":
        case "no-result":
            return "background: #8a8886; color: white;";
    }
}
