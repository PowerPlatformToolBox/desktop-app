export const IDEA_TYPES = {
    pptb_desktop: "PPTB Desktop",
    pptb_vscode: "PPTB VSCode Extension",
    tool: "Tool Ideas",
} as const;

export const IDEA_STATUSES = {
    open: "Open",
    under_review: "Under review",
    planned: "Planned",
    closed: "Closed",
    duplicate: "Duplicate",
} as const;

export const IDEA_RESOLUTIONS = {
    implemented: "Implemented",
    not_planned: "Not planned",
    out_of_scope: "Out of scope",
    withdrawn: "Withdrawn",
} as const;

export type IdeaType = keyof typeof IDEA_TYPES;
export type IdeaStatus = keyof typeof IDEA_STATUSES;
export type IdeaResolution = keyof typeof IDEA_RESOLUTIONS;

export interface ToolIdea {
    id: string;
    title: string;
    description: string;
    upvotes: number;
    createdAt: string;
    hasUpvoted: boolean;
    ideaType: IdeaType;
    status: IdeaStatus;
    resolution: IdeaResolution | null;
    publicNote: string | null;
    duplicateOf: string | null;
    githubIssueUrl: string | null;
    updatedAt: string;
}

export interface ToolIdeaSubmission {
    ideaType: IdeaType;
    title: string;
    description: string;
    email?: string;
}

export interface ToolIdeaUpvoteResult {
    upvotes: number;
    hasUpvoted: boolean;
}
