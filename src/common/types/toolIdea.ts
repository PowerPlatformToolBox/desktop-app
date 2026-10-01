export interface ToolIdea {
    id: string;
    title: string;
    description: string;
    upvotes: number;
    createdAt: string;
    hasUpvoted: boolean;
}

export interface ToolIdeaSubmission {
    title: string;
    description: string;
    email?: string;
}

export interface ToolIdeaUpvoteResult {
    upvotes: number;
    hasUpvoted: boolean;
}
