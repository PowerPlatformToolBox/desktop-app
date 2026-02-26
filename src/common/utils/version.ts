export function compareVersions(v1: string, v2: string): number {
    const parseVersion = (version: string) => {
        const [numericPart, preRelease] = version.split("-");
        const numeric = numericPart.split(".").map((part) => parseInt(part, 10) || 0);
        return { numeric, preRelease: preRelease || null };
    };

    const parsed1 = parseVersion(v1);
    const parsed2 = parseVersion(v2);

    const maxLength = Math.max(parsed1.numeric.length, parsed2.numeric.length);
    for (let i = 0; i < maxLength; i++) {
        const p1 = parsed1.numeric[i] || 0;
        const p2 = parsed2.numeric[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
    }

    if (parsed1.preRelease === null && parsed2.preRelease !== null) return 1;
    if (parsed1.preRelease !== null && parsed2.preRelease === null) return -1;
    if (parsed1.preRelease !== null && parsed2.preRelease !== null) {
        if (parsed1.preRelease < parsed2.preRelease) return -1;
        if (parsed1.preRelease > parsed2.preRelease) return 1;
    }

    return 0;
}
