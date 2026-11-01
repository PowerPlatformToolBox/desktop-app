import * as fs from "fs";
import * as path from "path";

/** Largest tool icon SVG the host will read. */
export const MAX_TOOL_ICON_BYTES = 512 * 1024;

/**
 * Resolve a manifest `icon` path to a file under the tool's `dist/` folder.
 * Returns null for anything that isn't an SVG inside `dist/`, including URLs (marketplace icons).
 */
export function resolveToolIconFile(toolBaseDir: string, iconPath: string): string | null {
    if (/^[a-z][a-z\d+.-]*:/i.test(iconPath)) return null;
    const normalized = iconPath
        .replace(/\\/g, "/")
        .replace(/^\.?\//, "")
        .replace(/^dist\//, "");
    if (!normalized.toLowerCase().endsWith(".svg")) return null;

    const distDir = path.resolve(toolBaseDir, "dist");
    const fullPath = path.resolve(distDir, normalized);
    const relative = path.relative(distDir, fullPath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return fullPath;
}

/**
 * Read a tool's bundled SVG icon. Returns null when missing, too large, or not an SVG.
 *
 * Only bundled icons (installed, npm and locally loaded tools) are read here. Marketplace icons
 * come from the tool's package folder in blob storage, and the renderer loads those by URL.
 */
export function readToolIconSvg(toolBaseDir: string, iconPath: string): string | null {
    const filePath = resolveToolIconFile(toolBaseDir, iconPath);
    if (!filePath || !fs.existsSync(filePath)) return null;

    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > MAX_TOOL_ICON_BYTES) return null;

    const svg = fs.readFileSync(filePath, "utf8");
    return looksLikeSvg(svg) ? svg : null;
}

function looksLikeSvg(content: string): boolean {
    return /<svg[\s>]/i.test(content);
}
