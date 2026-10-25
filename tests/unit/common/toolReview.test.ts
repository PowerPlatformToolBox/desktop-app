/// <reference types="jest" />

import { buildToolIssuesUrl, isToolReviewEligible, normalizeReviewVersion, resolveReviewVersion, TOOL_REVIEW_NOT_INSTALLED_MESSAGE } from "../../../src/common/utils/toolReview";

describe("tool review helpers", () => {
    it("only treats a resolved installed context as eligible", () => {
        expect(isToolReviewEligible({ toolId: "a", installed: true, version: "1.0.0" })).toBe(true);
        expect(isToolReviewEligible({ toolId: "a", installed: false })).toBe(false);
        expect(isToolReviewEligible(null)).toBe(false);
        expect(isToolReviewEligible(undefined)).toBe(false);
    });

    it("trims versions and enforces 1-100 characters", () => {
        expect(normalizeReviewVersion("  1.2.3 ")).toBe("1.2.3");
        expect(normalizeReviewVersion("   ")).toBeNull();
        expect(normalizeReviewVersion("")).toBeNull();
        expect(normalizeReviewVersion(undefined)).toBeNull();
        expect(normalizeReviewVersion("v".repeat(100))).toHaveLength(100);
        expect(normalizeReviewVersion("v".repeat(101))).toBeNull();
    });

    it("rejects review submission for uninstalled tools", () => {
        expect(() => resolveReviewVersion({ toolId: "a", installed: false }, "1.0.0")).toThrow(TOOL_REVIEW_NOT_INSTALLED_MESSAGE);
    });

    it("uses the installed version and requires confirmation when it changed", () => {
        const context = { toolId: "a", installed: true, version: "2.0.0" };
        expect(resolveReviewVersion(context, " 2.0.0 ")).toBe("2.0.0");
        expect(() => resolveReviewVersion(context, "1.0.0")).toThrow(/now 2\.0\.0/);
        expect(() => resolveReviewVersion(context, undefined)).toThrow(/now 2\.0\.0/);
    });

    it("requires explicit, valid entry when no installed version metadata exists", () => {
        const context = { toolId: "a", installed: true };
        expect(resolveReviewVersion(context, " 3.1 ")).toBe("3.1");
        expect(() => resolveReviewVersion(context, "")).toThrow(/Enter the tool version/);
        expect(() => resolveReviewVersion(context, "   ")).toThrow(/Enter the tool version/);
        expect(() => resolveReviewVersion(context, "9".repeat(101))).toThrow(/Enter the tool version/);
    });

    it.each([
        ["https://github.com/owner/repo", "https://github.com/owner/repo/issues"],
        ["git+https://github.com/owner/repo.git", "https://github.com/owner/repo/issues"],
        ["https://github.com/owner/repo/tree/main/sub", "https://github.com/owner/repo/issues"],
    ])("builds the tool's issues link from %s", (repository, expected) => {
        expect(buildToolIssuesUrl(repository)).toBe(expected);
    });

    it.each([
        undefined,
        "",
        "not a url",
        "http://github.com/o/r",
        "https://gitlab.com/o/r",
        "https://github.com/owner",
        "https://evil.com/github.com/o/r",
        "https://user:pw@github.com/o/r",
        "git@github.com:o/r.git",
    ])("does not invent an issues link for %p", (repository) => {
        expect(buildToolIssuesUrl(repository as string | undefined)).toBeNull();
    });
});
