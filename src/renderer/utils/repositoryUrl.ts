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
        const cleanPath = url.pathname.replace(/\/(issues|pulls|discussions).*$/, "").replace(/\/+$/, "");
        url.pathname = `${cleanPath}/issues/new`;
        url.search = "";
        url.hash = "";
        url.searchParams.set("title", `[Issue]: ${toolName || "Tool"}`);
        url.searchParams.set("body", `Tool: ${toolName || "Tool"}\n\nDescribe the issue or feature request here.`);
        return url.toString();
    } catch {
        return null;
    }
}
