import { IDEA_RESOLUTIONS, IDEA_STATUSES, IDEA_TYPES, IdeaStatus, IdeaType, ToolIdea, ToolIdeaSubmission, ToolIdeaUpvoteResult } from "../types/toolIdea";

export function isIdeaType(value: unknown): value is IdeaType {
    return typeof value === "string" && Object.hasOwn(IDEA_TYPES, value);
}

export function canChangeIdeaVote(status: IdeaStatus): boolean {
    return status === "open" || status === "under_review" || status === "planned";
}

export function validateIdeaId(value: unknown): asserts value is string {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        throw new Error("A valid idea ID is required.");
    }
}

export function validateIdeaSubmission(idea: ToolIdeaSubmission): ToolIdeaSubmission {
    if (!idea || !isIdeaType(idea.ideaType)) throw new Error("Select an idea type.");
    if (typeof idea.title !== "string" || !idea.title.trim() || idea.title.trim().length > 120) throw new Error("The title must be between 1 and 120 characters.");
    if (typeof idea.description !== "string" || !idea.description.trim() || idea.description.trim().length > 3000) throw new Error("The description must be between 1 and 3000 characters.");
    if (idea.email !== undefined && typeof idea.email !== "string") throw new Error("Enter a valid contact email address.");
    const email = idea.email?.trim() || "";
    if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Enter a valid contact email address.");
    return { ideaType: idea.ideaType, title: idea.title.trim(), description: idea.description.trim(), email: email || undefined };
}

export function isSupportedIdeaIssueUrl(ideaType: IdeaType, url: string): boolean {
    const repository = ideaType === "pptb_desktop" ? "desktop-app" : ideaType === "pptb_vscode" ? "vscode-extension" : null;
    return repository !== null && new RegExp("^https://github\\.com/PowerPlatformToolBox/" + repository + "/issues/[1-9][0-9]*$").test(url);
}

export function sortIdeas(ideas: ToolIdea[]): ToolIdea[] {
    return [...ideas].sort((a, b) => b.upvotes - a.upvotes || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function filterIdeas(ideas: ToolIdea[], type: IdeaType | "", status: IdeaStatus | ""): ToolIdea[] {
    return sortIdeas(ideas.filter((idea) => (!type || idea.ideaType === type) && (!status || idea.status === status)));
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Ideas response. Check the registry migration.");
    return value as Record<string, unknown>;
}

function voteCount(value: unknown): number {
    const count = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new Error("Invalid Ideas vote count.");
    return count;
}

export function mapIdeaVoteResult(value: unknown): ToolIdeaUpvoteResult {
    if (Array.isArray(value) && value.length !== 1) throw new Error("Invalid Ideas vote response.");
    const row = record(Array.isArray(value) ? value[0] : value);
    if (typeof row.has_upvoted !== "boolean") throw new Error("Invalid Ideas vote state.");
    return { upvotes: voteCount(row.upvotes), hasUpvoted: row.has_upvoted };
}

export function mapIdeas(value: unknown): ToolIdea[] {
    if (!Array.isArray(value)) throw new Error("Invalid Ideas response. Check that get_ideas is deployed.");
    return sortIdeas(
        value.map((value) => {
            const row = record(value);
            validateIdeaId(row.id);
            if (typeof row.title !== "string" || typeof row.description !== "string" || !isIdeaType(row.idea_type) || typeof row.status !== "string" || !Object.hasOwn(IDEA_STATUSES, row.status))
                throw new Error("Invalid Ideas content or classification.");
            const status = row.status as IdeaStatus;
            if (typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at)) || typeof row.updated_at !== "string" || !Number.isFinite(Date.parse(row.updated_at)))
                throw new Error("Invalid Ideas timestamp.");
            for (const field of ["resolution", "public_note", "duplicate_of", "github_issue_url"]) {
                if (row[field] !== null && typeof row[field] !== "string") throw new Error("Invalid Ideas maintainer metadata.");
            }
            if (status === "closed" ? typeof row.resolution !== "string" || !Object.hasOwn(IDEA_RESOLUTIONS, row.resolution) || !String(row.public_note ?? "").trim() : row.resolution !== null) {
                throw new Error("Invalid Ideas resolution.");
            }
            if (status === "duplicate") {
                validateIdeaId(row.duplicate_of);
                if (row.duplicate_of === row.id) throw new Error("Invalid Ideas duplicate reference.");
            } else if (row.duplicate_of !== null) throw new Error("Invalid Ideas duplicate reference.");
            return {
                id: row.id,
                title: row.title,
                description: row.description,
                ideaType: row.idea_type,
                status,
                resolution: row.resolution as ToolIdea["resolution"],
                publicNote: row.public_note as string | null,
                duplicateOf: row.duplicate_of as string | null,
                githubIssueUrl: row.github_issue_url as string | null,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                ...mapIdeaVoteResult(row),
            };
        }),
    );
}
