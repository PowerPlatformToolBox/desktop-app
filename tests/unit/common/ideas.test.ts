import { IDEA_RESOLUTIONS, IDEA_STATUSES, IDEA_TYPES, ToolIdeaSubmission } from "../../../src/common/types/toolIdea";
import { canChangeIdeaVote, filterIdeas, isSupportedIdeaIssueUrl, mapIdeas, mapIdeaVoteResult, validateIdeaSubmission } from "../../../src/common/utils/ideas";

const row = {
    id: "00000000-0000-4000-8000-000000000001",
    title: "An idea",
    description: "Details",
    idea_type: "tool",
    status: "open",
    resolution: null,
    public_note: null,
    duplicate_of: null,
    github_issue_url: null,
    created_at: "2026-10-01T12:00:00+00:00",
    updated_at: "2026-10-02T12:00:00+00:00",
    upvotes: "2",
    has_upvoted: false,
};

describe("Ideas contract", () => {
    it.each(Object.keys(IDEA_TYPES))("maps and submits %s without maintainer metadata", (ideaType) => {
        const [idea] = mapIdeas([{ ...row, idea_type: ideaType }]);
        expect(idea.ideaType).toBe(ideaType);
        expect(idea.upvotes).toBe(2);
        expect(validateIdeaSubmission({ ideaType: idea.ideaType, title: "  Title ", description: " Details ", email: " " })).toEqual({
            ideaType,
            title: "Title",
            description: "Details",
            email: undefined,
        });
    });

    it.each(Object.keys(IDEA_STATUSES))("maps %s and enforces client vote eligibility", (status) => {
        const [idea] = mapIdeas([
            {
                ...row,
                status,
                resolution: status === "closed" ? "implemented" : null,
                public_note: status === "closed" ? "Delivered." : null,
                duplicate_of: status === "duplicate" ? "00000000-0000-4000-8000-000000000002" : null,
            },
        ]);
        expect(idea.status).toBe(status);
        expect(canChangeIdeaVote(idea.status)).toBe(["open", "under_review", "planned"].includes(status));
    });

    it.each(Object.keys(IDEA_RESOLUTIONS))("preserves closed resolution %s", (resolution) => {
        expect(mapIdeas([{ ...row, status: "closed", resolution, public_note: "Explanation" }])[0].resolution).toBe(resolution);
    });

    it("composes filters and sorts by returned votes then date", () => {
        const ideas = mapIdeas([
            row,
            { ...row, id: "00000000-0000-4000-8000-000000000002", idea_type: "pptb_desktop", status: "planned", upvotes: 5 },
            { ...row, id: "00000000-0000-4000-8000-000000000003", idea_type: "pptb_desktop", status: "planned", upvotes: 5, created_at: "2026-10-03T00:00:00Z" },
        ]);
        expect(filterIdeas(ideas, "", "")).toHaveLength(3);
        expect(filterIdeas(ideas, "pptb_desktop", "planned").map((idea) => idea.id.slice(-1))).toEqual(["3", "2"]);
        expect(filterIdeas(ideas, "tool", "planned")).toEqual([]);
        expect(filterIdeas(ideas, "", "open")).toHaveLength(1);
    });

    it.each([
        null,
        {},
        [{ ...row, idea_type: "unknown" }],
        [{ ...row, status: "unknown" }],
        [{ ...row, updated_at: undefined }],
        [{ ...row, public_note: undefined }],
        [{ ...row, status: "closed" }],
        [{ ...row, status: "duplicate" }],
        [{ ...row, upvotes: -1 }],
        [{ ...row, upvotes: "9223372036854775807" }],
        [{ ...row, has_upvoted: null }],
    ])("rejects malformed list data rather than returning defaults: %j", (data) => {
        expect(() => mapIdeas(data)).toThrow();
    });

    it.each([null, [], [{ upvotes: 0 }], { upvotes: NaN, has_upvoted: false }, { upvotes: 0, has_upvoted: "false" }])("rejects malformed vote results: %j", (data) => {
        expect(() => mapIdeaVoteResult(data)).toThrow();
    });

    it("accepts returned add/remove counts including idempotent zero", () => {
        expect(mapIdeaVoteResult([{ upvotes: "0", has_upvoted: false }])).toEqual({ upvotes: 0, hasUpvoted: false });
        expect(mapIdeaVoteResult({ upvotes: 2, has_upvoted: true })).toEqual({ upvotes: 2, hasUpvoted: true });
    });

    it.each([
        { ideaType: "", title: "Title", description: "Description" },
        { ideaType: "tool", title: " ", description: "Description" },
        { ideaType: "tool", title: "x".repeat(121), description: "Description" },
        { ideaType: "tool", title: "Title", description: " " },
        { ideaType: "tool", title: "Title", description: "x".repeat(3001) },
        { ideaType: "tool", title: "Title", description: "Details", email: "invalid" },
        { ideaType: "tool", title: "Title", description: "Details", email: "x".repeat(250) + "@a.com" },
    ])("preserves submission validation: %j", (submission) => {
        expect(() => validateIdeaSubmission(submission as ToolIdeaSubmission)).toThrow();
    });

    it("accepts exact validation limits", () => {
        expect(validateIdeaSubmission({ ideaType: "tool", title: "x".repeat(120), description: "x".repeat(3000), email: "x".repeat(248) + "@a.com" }).email).toHaveLength(254);
    });

    it("only permits matching canonical HTTPS GitHub issue URLs", () => {
        const desktop = "https://github.com/PowerPlatformToolBox/desktop-app/issues/123";
        const vscode = "https://github.com/PowerPlatformToolBox/vscode-extension/issues/5";
        expect(isSupportedIdeaIssueUrl("pptb_desktop", desktop)).toBe(true);
        expect(isSupportedIdeaIssueUrl("pptb_vscode", vscode)).toBe(true);
        for (const url of [
            vscode,
            desktop.replace("https:", "http:"),
            desktop + "?x=1",
            desktop + "#comment",
            desktop + "/",
            desktop.replace("/123", "/0"),
            desktop.replace("github.com", "github.com.evil.test"),
            "javascript:alert(1)",
            "https://user:pass@github.com/PowerPlatformToolBox/desktop-app/issues/1",
        ]) {
            expect(isSupportedIdeaIssueUrl("pptb_desktop", url)).toBe(false);
        }
        expect(isSupportedIdeaIssueUrl("tool", desktop)).toBe(false);
    });
});
