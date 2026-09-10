import GithubSlugger from "github-slugger";
import { marked } from "marked";
import { escapeHtml } from "./toolIconResolver";

function isAllowedLink(href: string): boolean {
    const trimmed = href.trim().toLowerCase();
    return trimmed.startsWith("https://") || trimmed.startsWith("http://") || trimmed.startsWith("mailto:");
}

// TOC entries in READMEs are same-document fragment links (e.g. "#installation").
function isFragmentLink(href: string): boolean {
    const trimmed = href.trim();
    return trimmed.length > 1 && trimmed.startsWith("#");
}

function isAbsoluteImageSrc(src: string): boolean {
    const trimmed = src.trim().toLowerCase();
    return trimmed.startsWith("https://") || trimmed.startsWith("http://") || trimmed.startsWith("data:");
}

// Base URL used to resolve README-relative image paths; set per render call, see renderMarkdownToSafeHtml.
let currentReadmeBaseUrl: string | undefined;

// Shared across a single render so duplicate headings get GitHub's "-1", "-2" suffixes; reset per call.
const headingSlugger = new GithubSlugger();

// Disable raw HTML pass-through in markdown rendering to prevent XSS via inline event handlers.
// marked's html() renderer is invoked for both block HTML and inline HTML, so escaping here covers all raw HTML in markdown.
marked.use({
    renderer: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        html({ text }: any): string {
            return escapeHtml(String(text ?? ""));
        },
        // Assigns GitHub-compatible heading ids so README table-of-contents links resolve to a target.
        heading({ tokens, depth }): string {
            const html = this.parser.parseInline(tokens);
            const plainText = tokens.map((token) => ("raw" in token ? token.raw : "")).join("");
            const slug = headingSlugger.slug(plainText);
            return `<h${depth} id="${escapeHtml(slug)}">${html}</h${depth}>\n`;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        link({ href, title, text }: any): string {
            const safeText = escapeHtml(String(text ?? ""));
            const safeTitle = title ? escapeHtml(String(title)) : "";
            const rawHref = typeof href === "string" ? href : "";

            if (!rawHref) {
                return safeText;
            }

            if (isFragmentLink(rawHref)) {
                const titleAttr = safeTitle ? ` title="${safeTitle}"` : "";
                return `<a href="${escapeHtml(rawHref)}"${titleAttr}>${safeText}</a>`;
            }

            if (!isAllowedLink(rawHref)) {
                return safeText;
            }

            const safeHref = escapeHtml(rawHref);
            const titleAttr = safeTitle ? ` title="${safeTitle}"` : "";
            return `<a href="${safeHref}"${titleAttr} rel="noopener noreferrer">${safeText}</a>`;
        },
        // Resolves README-relative image paths (e.g. "assets/demo.gif") against the tool's readmeUrl.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        image({ href, title, text }: any): string {
            const rawSrc = typeof href === "string" ? href : "";
            const safeAlt = escapeHtml(String(text ?? ""));
            if (!rawSrc) {
                return safeAlt;
            }

            let resolvedSrc = rawSrc;
            if (!isAbsoluteImageSrc(rawSrc)) {
                if (!currentReadmeBaseUrl) {
                    return safeAlt;
                }
                try {
                    resolvedSrc = new URL(rawSrc, currentReadmeBaseUrl).href;
                } catch {
                    return safeAlt;
                }
                if (!isAbsoluteImageSrc(resolvedSrc)) {
                    return safeAlt;
                }
            }

            const safeSrc = escapeHtml(resolvedSrc);
            const titleAttr = title ? ` title="${escapeHtml(String(title))}"` : "";
            return `<img src="${safeSrc}" alt="${safeAlt}"${titleAttr} />`;
        },
    },
});

export function renderMarkdownToSafeHtml(markdown: string, baseUrl?: string): string {
    currentReadmeBaseUrl = baseUrl;
    headingSlugger.reset();
    return marked.parse(markdown) as string;
}

export function wireExternalLinks(container: HTMLElement, openExternal: (url: string) => Promise<void>): void {
    container.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
        a.addEventListener("click", (e) => {
            const href = a.getAttribute("href");
            if (!href) {
                return;
            }

            if (isFragmentLink(href)) {
                e.preventDefault();
                const target = container.querySelector(`#${CSS.escape(href.slice(1))}`);
                target?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }

            e.preventDefault();
            if (!isAllowedLink(href)) {
                return;
            }
            openExternal(href).catch(() => undefined);
        });
    });
}
