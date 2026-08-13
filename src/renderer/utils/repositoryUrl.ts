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
