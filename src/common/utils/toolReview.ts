import type { ToolReviewContext } from "../types/tool";

export const TOOL_REVIEW_VERSION_MAX_LENGTH = 100;

export const TOOL_REVIEW_NOT_INSTALLED_MESSAGE = "This tool must be installed to submit a review.";
export const TOOL_REVIEW_GITHUB_REMINDER = "Reviews are for sharing your experience. Please log bugs and issues on the tool's GitHub page, not in a review.";

/** Trim a version string; returns null when it is empty or longer than the database allows. */
export function normalizeReviewVersion(version: unknown): string | null {
    if (typeof version !== "string") return null;
    const trimmed = version.trim();
    if (trimmed.length < 1 || trimmed.length > TOOL_REVIEW_VERSION_MAX_LENGTH) return null;
    return trimmed;
}

/**
 * Single eligibility rule shared by every rating entry point: a tool can be reviewed only when
 * its own installation state resolved successfully and reports it as installed.
 */
export function isToolReviewEligible(context: ToolReviewContext | null | undefined): context is ToolReviewContext & { installed: true } {
    return !!context && context.installed === true;
}

/**
 * Authoritative pre-submission check. `installedVersion` comes from local installation metadata;
 * `submittedVersion` is what the reviewer saw/entered. Returns the version to persist or throws.
 */
export function resolveReviewVersion(context: ToolReviewContext, submittedVersion: unknown): string {
    if (!isToolReviewEligible(context)) {
        throw new Error(TOOL_REVIEW_NOT_INSTALLED_MESSAGE);
    }

    const installed = normalizeReviewVersion(context.version);
    const submitted = normalizeReviewVersion(submittedVersion);

    if (installed) {
        if (submitted !== installed) {
            throw new Error(`The installed version of this tool is now ${installed}. Please confirm the new version before submitting your review.`);
        }
        return installed;
    }

    if (!submitted) {
        throw new Error(`Enter the tool version you are reviewing (1-${TOOL_REVIEW_VERSION_MAX_LENGTH} characters).`);
    }
    return submitted;
}

/** Build `https://github.com/<owner>/<repo>/issues` from a tool repository URL; null unless it is a valid HTTPS github.com repository. */
export function buildToolIssuesUrl(repository?: string): string | null {
    if (typeof repository !== "string") return null;
    let value = repository.trim().replace(/^git\+/, "");
    if (!value.startsWith("https://")) return null;
    value = value.replace(/\.git$/i, "");
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port) return null;
        const [owner, repo] = url.pathname.split("/").filter(Boolean);
        if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo.replace(/\.git$/i, ""))) return null;
        return `https://github.com/${owner}/${repo.replace(/\.git$/i, "")}/issues`;
    } catch {
        return null;
    }
}
