import type { ConnectionType } from "./types/connection";

export const CONNECTION_PRODUCTS: Record<ConnectionType, { label: string; description: string }> = {
    dataverse: { label: "Dataverse", description: "Dataverse" },
    financeOperations: { label: "F&O", description: "Dynamics 365 Finance & Operations" },
};

export function connectionProductLabel(type?: ConnectionType): string {
    return CONNECTION_PRODUCTS[type === undefined ? "dataverse" : type]?.label ?? "Unknown product";
}

/** Shared labels for sandboxed modal controller scripts (no module imports there). */
export function connectionProductScript(): string {
    return `const CONNECTION_PRODUCTS = ${JSON.stringify(CONNECTION_PRODUCTS)};
    const productLabel = type => CONNECTION_PRODUCTS[type === undefined ? "dataverse" : type]?.label ?? "Unknown product";
    const productDescription = type => CONNECTION_PRODUCTS[type === undefined ? "dataverse" : type]?.description ?? "Unknown product";
    const productBadge = type => '<span class="auth-type-badge connection-product-badge" title="' + escapeHtml(productDescription(type)) + '" aria-label="' + escapeHtml(productDescription(type)) + '">' + escapeHtml(productLabel(type)) + '</span>';`;
}
