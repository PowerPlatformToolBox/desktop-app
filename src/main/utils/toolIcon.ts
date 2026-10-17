import { net } from "electron";
import * as fs from "fs";
import * as path from "path";

/** Largest tool icon SVG the host will read or download. */
export const MAX_TOOL_ICON_BYTES = 512 * 1024;

const REMOTE_ICON_TIMEOUT_MS = 10_000;

/**
 * Hosts a remote (marketplace) tool icon may be downloaded from. Mirrors the
 * `img-src` allowlist in `src/renderer/index.html`.
 */
const ALLOWED_REMOTE_ICON_HOSTS = [/^github\.com$/i, /\.githubusercontent\.com$/i, /\.supabase\.co$/i, /\.blob\.core\.windows\.net$/i];

/**
 * Resolve a manifest `icon` path to a file under the tool's `dist/` folder.
 * Returns null for anything that isn't an SVG inside `dist/`.
 */
export function resolveToolIconFile(toolBaseDir: string, iconPath: string): string | null {
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

/** Read a tool's bundled SVG icon. Returns null when missing, too large, or not an SVG. */
export function readToolIconSvg(toolBaseDir: string, iconPath: string): string | null {
    const filePath = resolveToolIconFile(toolBaseDir, iconPath);
    if (!filePath || !fs.existsSync(filePath)) return null;

    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > MAX_TOOL_ICON_BYTES) return null;

    const svg = fs.readFileSync(filePath, "utf8");
    return looksLikeSvg(svg) ? svg : null;
}

export function isAllowedRemoteIconUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && parsed.pathname.toLowerCase().endsWith(".svg") && ALLOWED_REMOTE_ICON_HOSTS.some((host) => host.test(parsed.hostname));
    } catch {
        return false;
    }
}

type IconFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Download a remote (marketplace) SVG icon. Returns null when not allowed, too large, or not an SVG.
 *
 * Uses Electron's `net.fetch`, so the session's proxy settings apply. Redirects are refused, so the
 * request can't be bounced to a host outside the allowlist.
 */
export async function fetchRemoteToolIconSvg(url: string, fetchImpl: IconFetch = (input, init) => net.fetch(input, init)): Promise<string | null> {
    if (!isAllowedRemoteIconUrl(url)) return null;

    const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(REMOTE_ICON_TIMEOUT_MS) });
    if (!response.ok || !response.body) return null;

    const declaredLength = Number(response.headers.get("content-length"));
    if (declaredLength > MAX_TOOL_ICON_BYTES) {
        await response.body.cancel();
        return null;
    }

    const body = await readBodyWithLimit(response.body, MAX_TOOL_ICON_BYTES);
    if (!body) return null;

    const svg = body.toString("utf8");
    return looksLikeSvg(svg) ? svg : null;
}

/** Read a response body, giving up (and cancelling the stream) once it passes `limit` bytes. */
async function readBodyWithLimit(stream: ReadableStream<Uint8Array>, limit: number): Promise<Buffer | null> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks);
}

function looksLikeSvg(content: string): boolean {
    return /<svg[\s>]/i.test(content);
}
