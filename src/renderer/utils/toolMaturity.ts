export function isVerifiedTool(maturity: string | undefined): boolean {
    return maturity?.trim().toLowerCase() === "verified";
}

export function compareVerifiedFirst(aMaturity: string | undefined, bMaturity: string | undefined): number {
    return Number(isVerifiedTool(bMaturity)) - Number(isVerifiedTool(aMaturity));
}

export function renderVerifiedBadge(maturity: string | undefined, isDarkTheme: boolean): string {
    if (!isVerifiedTool(maturity)) return "";

    const iconPath = isDarkTheme ? "icons/dark/verified.svg" : "icons/light/verified.svg";
    const description = "Verified tools have passed Power Platform ToolBox quality and safety checks.";
    return `<span class="tool-verified-badge" title="${description}" aria-label="${description}"><img src="${iconPath}" alt="" aria-hidden="true" /></span>`;
}
