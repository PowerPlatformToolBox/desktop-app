import { marked } from "marked";
import { escapeHtml } from "./toolIconResolver";

function isAllowedLink(href: string): boolean {
    const trimmed = href.trim().toLowerCase();
    return trimmed.startsWith("https://") || trimmed.startsWith("http://") || trimmed.startsWith("mailto:");
}

// Disable raw HTML pass-through in markdown rendering to prevent XSS via inline event handlers.
// marked's html() renderer is invoked for both block HTML and inline HTML, so escaping here covers all raw HTML in markdown.
marked.use({
    renderer: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        html({ text }: any): string {
            return escapeHtml(String(text ?? ""));
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        link({ href, title, text }: any): string {
            const safeText = escapeHtml(String(text ?? ""));
            const safeTitle = title ? escapeHtml(String(title)) : "";
            const rawHref = typeof href === "string" ? href : "";

            if (!rawHref || !isAllowedLink(rawHref)) {
                return safeText;
            }

            const safeHref = escapeHtml(rawHref);
            const titleAttr = safeTitle ? ` title="${safeTitle}"` : "";
            return `<a href="${safeHref}"${titleAttr} rel="noopener noreferrer">${safeText}</a>`;
        },
    },
});

export function renderMarkdownToSafeHtml(markdown: string): string {
    return marked.parse(markdown) as string;
}

export function wireExternalLinks(container: HTMLElement, openExternal: (url: string) => Promise<void>): void {
    container.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
        a.addEventListener("click", (e) => {
            e.preventDefault();
            const href = a.getAttribute("href");
            if (!href) {
                return;
            }
            if (!isAllowedLink(href)) {
                return;
            }
            openExternal(href).catch(() => undefined);
        });
    });
}
