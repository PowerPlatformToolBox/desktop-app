export interface RatingMarkupOptions {
    className?: string;
    title?: string;
    prefix?: string;
    suffix?: string;
}

export function formatRatingMarkup(rating: number | null | undefined, options: RatingMarkupOptions = {}): string {
    if (typeof rating !== "number") {
        return "";
    }

    const classAttr = options.className ? ` class="${options.className}"` : "";
    const titleAttr = options.title ? ` title="${options.title}"` : "";
    const content = `${options.prefix || ""}${rating.toFixed(1)}${options.suffix || ""}`;

    return `<span${classAttr}${titleAttr}>${content}</span>`;
}
