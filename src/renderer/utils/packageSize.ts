/**
 * Format a package size value (in bytes) for display.
 */
export function formatPackageSize(sizeBytes: number | undefined): string {
    if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        return "";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = sizeBytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    if (unitIndex === 0) {
        return `${Math.round(value)} ${units[unitIndex]}`;
    }

    const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1);
    const normalized = rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
    return `${normalized} ${units[unitIndex]}`;
}
