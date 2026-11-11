import { buildToolIssuesUrl } from "../../common/utils/toolReview";

export function normalizeRepositoryUrl(repository?: string): string | null {
    if (typeof repository !== "string") return null;
    const trimmed = repository.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("git+https://")) return normalizeHttpsUrl(trimmed.replace(/^git\+/, ""))?.replace(/\.git$/i, "") ?? null;
    if (trimmed.startsWith("https://")) return normalizeHttpsUrl(trimmed)?.replace(/\.git$/i, "") ?? null;
    return null;
}

export function normalizeHttpsUrl(url?: string): string | null {
    if (typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith("https://")) return null;
    try {
        return new URL(trimmed).toString();
    } catch {
        return null;
    }
}

export function buildToolIssueUrl(repository?: string, toolName?: string): string | null {
    const normalized = normalizeRepositoryUrl(repository);
    if (!normalized) return null;

    try {
        const url = new URL(normalized);
        if (url.hostname !== "github.com") return null;
        const [owner, repository] = url.pathname.split("/").filter(Boolean);
        if (!owner || !repository) return null;
        url.pathname = `/${owner}/${repository}/issues/new`;
        url.search = "";
        url.hash = "";
        url.searchParams.set("title", `[Feedback]: ${toolName || "Tool"}`);
        url.searchParams.set("body", `Tool: ${toolName || "Tool"}\n\nShare feedback, report a bug, or request a feature here.`);
        return url.toString();
    } catch {
        return null;
    }
}

/** `https://github.com/<owner>/<repo>/issues` for a tool repository, or null when it is not a valid HTTPS github.com repository. */
export function buildToolIssuesListUrl(repository?: string): string | null {
    return buildToolIssuesUrl(repository);
}
