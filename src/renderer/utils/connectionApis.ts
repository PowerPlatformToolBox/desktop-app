import { resolveToolApis } from "../../../packages/validation/src/apiFeatures";
import type { ToolFeatures } from "../../common/types/tool";

export type ApiKey = "pp" | "arm" | "graph";
export type ApiRequirements = boolean | ApiKey[];

export function getRequiredApis(features?: ToolFeatures): ApiKey[] {
    const resolved = resolveToolApis(features);
    if (resolved.errors.length) throw new Error(resolved.errors.join(" "));
    return (["pp", "arm", "graph"] as const).filter((key) => resolved.apis[key]?.required);
}

export function getConnectionApiUtilitiesScript(requirements: ApiRequirements): string {
    const required = typeof requirements === "boolean" ? (requirements ? ["pp"] : []) : requirements;
    return `
    const REQUIRED_APIS = ${JSON.stringify(required)};
    const API_LABELS = { pp: "PP", arm: "ARM", graph: "Graph" };
    const API_NAMES = { pp: "Power Platform API", arm: "Azure Resource Manager API", graph: "Microsoft Graph API" };
    const getEnabledApis = (connection) => ["pp", "arm", "graph"].filter((key) =>
        connection?.[{ pp: "enabledForPowerPlatformAPI", arm: "enabledForAzureAPI", graph: "enabledForGraphAPI" }[key]] === true);
    const getApiBadgeMarkup = (connection) => {
        const enabled = getEnabledApis(connection);
        if (!enabled.length) return "";
        const description = "Enabled: " + enabled.map((key) => API_NAMES[key]).join(", ") + ". Not a verification of authentication or authorization.";
        return '<span class="power-platform-api-badge" tabindex="0" title="' + description + '" data-api-tooltip="' + description + '" aria-label="' + description + '">' +
            enabled.map((key) => API_LABELS[key]).join(", ") + '</span>';
    };
    const updateApiRequirementBanner = (selectedConnections = []) => {
        const banner = document.getElementById("power-platform-api-info") || document.getElementById("power-platform-api-info-multi");
        if (!banner) return;
        banner.style.display = REQUIRED_APIS.length ? "block" : "none";
        banner.setAttribute("role", "status");
        banner.setAttribute("aria-live", "polite");
        const missing = REQUIRED_APIS.filter((key) => selectedConnections.some((connection) => !getEnabledApis(connection).includes(key)));
        banner.textContent = missing.length
            ? "Selected connection" + (selectedConnections.length > 1 ? "s" : "") + " missing: " + missing.map((key) => API_LABELS[key]).join(", ") + "."
            : "Required APIs: " + REQUIRED_APIS.map((key) => API_LABELS[key]).join(", ") + ". Choose connections with matching tags.";
        banner.title = REQUIRED_APIS.map((key) => API_NAMES[key]).join(", ") + ". Enablement does not verify authentication or authorization.";
        banner.setAttribute("data-api-tooltip", banner.title);
        banner.setAttribute("aria-label", banner.textContent + " " + banner.title);
        banner.tabIndex = 0;
    };
    `;
}
