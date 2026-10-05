// @pptb/validate — core validation logic
// Single source of truth for both the pptb-validate CLI and the web intake platform.

export interface Contributor {
    name: string;
    url?: string;
}

export interface CspExceptions {
    "connect-src"?: string[];
    "script-src"?: string[];
    "style-src"?: string[];
    "img-src"?: string[];
    "font-src"?: string[];
    "frame-src"?: string[];
    "media-src"?: string[]; // present in CLI package, was missing from web
}

export interface Configurations {
    repository?: string;
    website?: string;
    funding?: string;
    readmeUrl?: string;
}

export interface Features {
    connections?: number | { min?: number; max?: number };
    multiConnection?: "required" | "optional" | "none";
    connectionRequirement?: "required" | "optional";
    minAPI?: string;
    enabledForPowerPlatformAPI?: boolean;
}

export interface ToolPackageJson {
    name: string;
    version: string;
    displayName?: string;
    description?: string;
    contributors?: Contributor[];
    cspExceptions?: CspExceptions;
    license?: string;
    icon?: string;
    configurations?: Configurations;
    features?: Features;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    packageInfo?: ToolPackageJson | PPTBConfig; // present when valid, used for passing info from package.json validation to CLI for pptb.config.json validation
}

export interface ValidatePackageJsonOptions {
    skipUrlChecks?: boolean; // present in CLI package, was missing from web
}

export type JsonSchemaProperty = {
    type?: string;
    enum?: string[];
    items?: object;
};

export type JsonSchemaObject = {
    properties?: Record<string, JsonSchemaProperty>;
};

export type AgentInvocationMode = "one-way" | "two-way";

export interface AgentsConfig {
    version: string;
    headless: boolean;
    invokable?: boolean;
    modes?: AgentInvocationMode[];
    defaultMode?: AgentInvocationMode;
    timeoutMS?: number;
}

export interface InvocationConfig {
    version: string;
    prefill?: JsonSchemaObject;
    returnTopic?: JsonSchemaObject;
    capabilities?: string[];
}

export interface PPTBConfig {
    invocation?: InvocationConfig;
    agents?: AgentsConfig;
    workers?: Record<string, WorkerDeclaration>;
}

export type WorkerRollForward = "Disable" | "Latest" | "Minor" | "Major";
export type WorkerTargetFramework = "net8.0" | "net9.0" | "net10.0";
export type WorkerPlatform = "all" | "windows-x64" | "windows-arm64" | "macos-x64" | "macos-arm64" | "linux-x64" | "linux-arm64";
export interface WorkerDeclaration {
    kind: "dotnet-tool";
    packageId: string;
    packageVersion: string;
    command: string;
    dotnet: { targetFramework: WorkerTargetFramework; minimumRuntimeVersion: string; rollForward?: WorkerRollForward };
    platforms: WorkerPlatform[];
}
export interface NormalizedWorkerDeclaration extends WorkerDeclaration {
    dotnet: WorkerDeclaration["dotnet"] & { rollForward: WorkerRollForward };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function matchesEntireString(value: unknown, pattern: RegExp): value is string {
    return typeof value === "string" && pattern.exec(value)?.[0] === value;
}

function isExactNuGetVersion(value: unknown): value is string {
    if (!matchesEntireString(value, /^\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/)) return false;
    return value
        .split(/[+-]/, 1)[0]
        .split(".")
        .every((component) => Number(component) <= 2_147_483_647);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: string[], field: string, errors: string[]): void {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) errors.push(`${field}.${key} is not supported`);
    }
}

export function validateWorkers(value: unknown): { workers?: Record<string, NormalizedWorkerDeclaration>; errors: string[] } {
    const errors: string[] = [];
    if (!isRecord(value) || Object.keys(value).length === 0) return { errors: ["workers must be a non-empty object keyed by declaration ID"] };
    const workers: Record<string, NormalizedWorkerDeclaration> = {};
    for (const [workerId, declaration] of Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
        const field = `workers.${workerId}`;
        if (!matchesEntireString(workerId, /^[A-Za-z][A-Za-z0-9_-]{0,63}$/) || ["__proto__", "constructor", "prototype"].includes(workerId)) {
            errors.push(`${field} has an invalid declaration ID`);
        }
        if (!isRecord(declaration)) {
            errors.push(`${field} must be an object`);
            continue;
        }
        rejectUnknownKeys(declaration, ["kind", "packageId", "packageVersion", "command", "dotnet", "platforms"], field, errors);
        if (declaration.kind !== "dotnet-tool") errors.push(`${field}.kind must be dotnet-tool`);
        if (!matchesEntireString(declaration.packageId, /^[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*$/) || declaration.packageId.length > 100) {
            errors.push(`${field}.packageId must be a NuGet package ID`);
        }
        if (!isExactNuGetVersion(declaration.packageVersion)) errors.push(`${field}.packageVersion must be an exact NuGet version`);
        if (!matchesEntireString(declaration.command, /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/)) errors.push(`${field}.command must be a safe registered command name`);
        if (!isRecord(declaration.dotnet)) {
            errors.push(`${field}.dotnet must be an object`);
        } else {
            const dotnet = declaration.dotnet;
            rejectUnknownKeys(dotnet, ["targetFramework", "minimumRuntimeVersion", "rollForward"], `${field}.dotnet`, errors);
            if (!["net8.0", "net9.0", "net10.0"].includes(dotnet.targetFramework as string)) {
                errors.push(`${field}.dotnet.targetFramework must be net8.0, net9.0 or net10.0`);
            }
            if (
                !matchesEntireString(dotnet.minimumRuntimeVersion, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/) ||
                dotnet.minimumRuntimeVersion.split(".").some((component) => Number(component) > 2_147_483_647) ||
                `net${dotnet.minimumRuntimeVersion.split(".").slice(0, 2).join(".")}` !== dotnet.targetFramework
            ) {
                errors.push(`${field}.dotnet.minimumRuntimeVersion must be major.minor.patch matching targetFramework`);
            }
            if (Object.prototype.hasOwnProperty.call(dotnet, "rollForward") && !["Disable", "Latest", "Minor", "Major"].includes(dotnet.rollForward as string)) {
                errors.push(`${field}.dotnet.rollForward must be Disable, Latest, Minor or Major`);
            }
        }
        const platforms = declaration.platforms;
        if (
            !Array.isArray(platforms) ||
            platforms.length === 0 ||
            platforms.some((platform) => !["all", "windows-x64", "windows-arm64", "macos-x64", "macos-arm64", "linux-x64", "linux-arm64"].includes(platform)) ||
            new Set(platforms).size !== platforms.length ||
            (platforms.includes("all") && platforms.length !== 1)
        ) {
            errors.push(`${field}.platforms must be a non-empty unique list of supported PPTB platform aliases; all must appear alone`);
        }
        if (errors.length === 0) {
            const worker = declaration as unknown as WorkerDeclaration;
            workers[workerId] = {
                kind: worker.kind,
                packageId: worker.packageId,
                packageVersion: worker.packageVersion,
                command: worker.command,
                dotnet: { targetFramework: worker.dotnet.targetFramework, minimumRuntimeVersion: worker.dotnet.minimumRuntimeVersion, rollForward: worker.dotnet.rollForward ?? "Major" },
                platforms: [...worker.platforms].sort(),
            };
        }
    }
    return errors.length ? { errors } : { errors, workers };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const APPROVED_LICENSES = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "GPL-2.0", "GPL-3.0", "LGPL-3.0", "ISC", "AGPL-3.0-only"];

export const VALID_MULTI_CONNECTION_VALUES = ["required", "optional", "none"] as const;

export const VALID_CONNECTION_REQUIREMENT_VALUES = ["required", "optional"] as const;

/**
 * Keep in sync with BUILT_IN_CAPABILITY_TAGS in
 * src/main/managers/toolRegistryManager.ts in the desktop app.
 */
export const KNOWN_CAPABILITY_TAGS = ["fetchxml", "entity-picker", "record-selector", "solution-selector", "webresource-editor", "plugin-inspector", "pcf-control-builder"];

const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/;

const VALID_CSP_DIRECTIVES = [
    "connect-src",
    "script-src",
    "style-src",
    "img-src",
    "font-src",
    "frame-src",
    "media-src", // present in CLI package, was missing from web
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function isGithubDomain(url: string): boolean {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname === "github.com" || hostname.endsWith(".github.com");
    } catch {
        return false;
    }
}

function validateIconPath(fieldName: string, iconPath: string, errors: string[]): void {
    if (iconPath.startsWith("http://") || iconPath.startsWith("https://")) {
        errors.push(`${fieldName} cannot be an HTTP(S) URL - icons must be bundled under dist`);
        return;
    }
    if (iconPath.startsWith("/")) {
        errors.push(`${fieldName} must be a relative path (e.g., 'icon.svg' or 'icons/icon.svg')`);
        return;
    }
    // Windows absolute paths — present in CLI package, was missing from web
    if (/^[a-zA-Z]:/.test(iconPath)) {
        errors.push(`${fieldName} must be a relative path (e.g., 'icon.svg' or 'icons/icon.svg')`);
        return;
    }
    // Backslashes — present in CLI package, was missing from web
    if (iconPath.includes("\\")) {
        errors.push(`${fieldName} must use forward slashes, not backslashes (e.g., 'icons/icon.svg')`);
        return;
    }
    if (iconPath.includes("..")) {
        errors.push(`${fieldName} cannot contain '..' (path traversal not allowed)`);
        return;
    }
    if (!iconPath.toLowerCase().endsWith(".svg")) {
        errors.push(`${fieldName} must be an SVG file with .svg extension`);
    }
}

async function isUrlAccessible(url: string): Promise<boolean> {
    try {
        const response = await fetch(url, { method: "HEAD", redirect: "follow" });
        return response.ok;
    } catch {
        return false;
    }
}

function validateJsonSchemaProperties(fieldName: string, properties: unknown, errors: string[]): void {
    if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
        errors.push(`${fieldName}.properties must be a non-array object`);
        return;
    }

    for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            errors.push(`${fieldName}.properties.${key} must be an object`);
            continue;
        }
        const prop = value as Record<string, unknown>;
        if (prop.type !== undefined && typeof prop.type !== "string") {
            errors.push(`${fieldName}.properties.${key}.type must be a string`);
        }
        if (prop.enum !== undefined) {
            if (!Array.isArray(prop.enum)) {
                errors.push(`${fieldName}.properties.${key}.enum must be an array`);
            } else if (prop.enum.length === 0) {
                errors.push(`${fieldName}.properties.${key}.enum must not be empty`);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// validatePackageJson
// ---------------------------------------------------------------------------

export async function validatePackageJson(packageJson: ToolPackageJson, options: ValidatePackageJsonOptions = {}): Promise<ValidationResult> {
    const { skipUrlChecks = false } = options;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!packageJson.name || typeof packageJson.name !== "string") {
        errors.push("Package name is required and must be a string");
    }
    if (!packageJson.version || typeof packageJson.version !== "string") {
        errors.push("Package version is required and must be a string");
    }
    if (!packageJson.displayName || typeof packageJson.displayName !== "string") {
        errors.push("displayName is required and must be a string");
    }
    if (!packageJson.description || typeof packageJson.description !== "string") {
        errors.push("description is required and must be a string");
    }

    // License
    if (!packageJson.license) {
        errors.push("license is required");
    } else if (!APPROVED_LICENSES.includes(packageJson.license)) {
        errors.push(`License "${packageJson.license}" is not in the approved list. Approved licenses: ${APPROVED_LICENSES.join(", ")}`);
    }

    // Icon — warn when absent (present in CLI package, was missing from web)
    if (packageJson.icon === undefined || packageJson.icon === null) {
        warnings.push("icon is not set; consider adding a bundled SVG icon so your tool displays properly in the marketplace");
    } else if (typeof packageJson.icon !== "string") {
        errors.push("icon must be a string (relative path to bundled SVG under dist)");
    } else {
        validateIconPath("icon", packageJson.icon, errors);
    }

    // Contributors
    if (!packageJson.contributors || !Array.isArray(packageJson.contributors)) {
        errors.push("contributors is required and must be an array");
    } else if (packageJson.contributors.length === 0) {
        errors.push("At least one contributor is required");
    } else {
        packageJson.contributors.forEach((contributor, index) => {
            if (!contributor.name || typeof contributor.name !== "string") {
                errors.push(`Contributor at index ${index} must have a name`);
            }
            if (contributor.url && !isValidUrl(contributor.url)) {
                warnings.push(`Contributor "${contributor.name}" has an invalid URL`);
            }
        });
    }

    // Configurations
    if (!packageJson.configurations || typeof packageJson.configurations !== "object") {
        errors.push("configurations is required and must include repository and readmeUrl");
    } else {
        const configs = packageJson.configurations;

        if ((configs as Record<string, unknown>).iconUrl !== undefined) {
            errors.push("configurations.iconUrl is no longer supported; use top-level 'icon' for bundled SVG path");
        }

        if (!configs.repository || typeof configs.repository !== "string") {
            errors.push("configurations.repository is required and must be a URL");
        } else if (!isValidUrl(configs.repository)) {
            errors.push("configurations.repository has an invalid URL format");
        } else if (!skipUrlChecks) {
            if (!(await isUrlAccessible(configs.repository))) {
                errors.push("configurations.repository URL is not accessible");
            }
        }

        if (!configs.website) {
            warnings.push("configurations.website is not set; consider adding a URL where users can learn more about your tool");
        } else if (!isValidUrl(configs.website)) {
            warnings.push("configurations.website has an invalid URL format");
        } else if (!skipUrlChecks) {
            if (!(await isUrlAccessible(configs.website))) {
                warnings.push("configurations.website URL is not accessible");
            }
        }

        if (configs.funding) {
            if (!isValidUrl(configs.funding)) {
                warnings.push("configurations.funding has an invalid URL format");
            } else if (!skipUrlChecks) {
                if (!(await isUrlAccessible(configs.funding))) {
                    warnings.push("configurations.funding URL is not accessible");
                }
            }
        }

        if (!configs.readmeUrl || typeof configs.readmeUrl !== "string") {
            errors.push("configurations.readmeUrl is required and must be a URL");
        } else if (!isValidUrl(configs.readmeUrl)) {
            errors.push("configurations.readmeUrl has an invalid URL format");
        } else if (isGithubDomain(configs.readmeUrl)) {
            errors.push("configurations.readmeUrl cannot be hosted on github.com; use raw.githubusercontent.com or another domain");
        } else if (!skipUrlChecks) {
            if (!(await isUrlAccessible(configs.readmeUrl))) {
                errors.push("configurations.readmeUrl is not accessible");
            }
        }
    }

    // CSP exceptions
    if (packageJson.cspExceptions) {
        const csp = packageJson.cspExceptions;
        if (typeof csp !== "object" || csp === null || Array.isArray(csp)) {
            errors.push("cspExceptions must be an object mapping CSP directives to arrays of strings");
        } else {
            if (Object.keys(csp).length === 0) {
                errors.push("cspExceptions cannot be empty. If CSP exceptions are not needed, remove the cspExceptions field");
            }
            for (const directive of Object.keys(csp)) {
                if (!VALID_CSP_DIRECTIVES.includes(directive)) {
                    warnings.push(`Unknown CSP directive: ${directive}`);
                }
                const values = csp[directive as keyof CspExceptions];
                if (values && !Array.isArray(values)) {
                    errors.push(`CSP directive "${directive}" must be an array of strings`);
                } else if (values && values.length === 0) {
                    errors.push(`CSP directive "${directive}" cannot be an empty array`);
                }
            }
        }
    }

    // Features
    if (packageJson.features !== undefined) {
        const features = packageJson.features;
        if (features === null || typeof features !== "object" || Array.isArray(features)) {
            errors.push("features must be a non-array object with optional 'connections', 'multiConnection', 'connectionRequirement', 'minAPI', and 'enabledForPowerPlatformAPI' properties");
        } else {
            const VALID_FEATURE_KEYS = ["connections", "multiConnection", "connectionRequirement", "minAPI", "enabledForPowerPlatformAPI"];
            const invalidKeys = Object.keys(features).filter((k) => !VALID_FEATURE_KEYS.includes(k));
            if (invalidKeys.length > 0) {
                errors.push(`features can only contain ${VALID_FEATURE_KEYS.map((k) => `'${k}'`).join(", ")} properties. Invalid properties: ${invalidKeys.join(", ")}`);
            }

            const usesModernConnections = features.connections !== undefined;
            const usesLegacyConnectionFields = features.multiConnection !== undefined || features.connectionRequirement !== undefined;
            if (usesModernConnections && usesLegacyConnectionFields) {
                errors.push("features.connections cannot be combined with legacy features.multiConnection or features.connectionRequirement; remove the legacy fields");
            }
            if (usesLegacyConnectionFields) {
                const legacyFields = [
                    features.multiConnection !== undefined ? "features.multiConnection" : null,
                    features.connectionRequirement !== undefined ? "features.connectionRequirement" : null,
                ].filter((field): field is string => field !== null);
                warnings.push(`Legacy connection feature fields (${legacyFields.join(", ")}) are deprecated; use features.connections instead`);
            }

            if (usesModernConnections) {
                const connections = features.connections;
                if (typeof connections === "number") {
                    if (!Number.isInteger(connections) || connections < 0 || connections > 10) {
                        errors.push("features.connections must be an integer between 0 and 10");
                    }
                } else if (connections === null || typeof connections !== "object" || Array.isArray(connections)) {
                    errors.push("features.connections must be an integer or an object with optional 'min' and 'max' properties");
                } else {
                    const invalidConnectionKeys = Object.keys(connections).filter((key) => key !== "min" && key !== "max");
                    if (invalidConnectionKeys.length > 0) {
                        errors.push(`features.connections can only contain 'min' and 'max' properties. Invalid properties: ${invalidConnectionKeys.join(", ")}`);
                    }

                    const min = connections.min ?? 1;
                    const max = connections.max ?? min;
                    if (connections.min !== undefined && (!Number.isInteger(connections.min) || connections.min < 0 || connections.min > 10)) {
                        errors.push("features.connections.min must be an integer between 0 and 10");
                    }
                    if (connections.max !== undefined && (!Number.isInteger(connections.max) || connections.max < 0 || connections.max > 10)) {
                        errors.push("features.connections.max must be an integer between 0 and 10");
                    }
                    if (Number.isInteger(min) && Number.isInteger(max) && min > max) {
                        errors.push("features.connections.min must be less than or equal to features.connections.max");
                    }
                }
            } else if (features.multiConnection === undefined) {
                errors.push("features.multiConnection is required when features object is provided without features.connections");
            } else if (!(VALID_MULTI_CONNECTION_VALUES as readonly string[]).includes(features.multiConnection)) {
                errors.push(`features.multiConnection must be one of: ${VALID_MULTI_CONNECTION_VALUES.join(", ")}`);
            }
            if (features.connectionRequirement !== undefined && !(VALID_CONNECTION_REQUIREMENT_VALUES as readonly string[]).includes(features.connectionRequirement)) {
                errors.push(`features.connectionRequirement must be one of: ${VALID_CONNECTION_REQUIREMENT_VALUES.join(", ")}`);
            }
            if (features.minAPI !== undefined) {
                if (typeof features.minAPI !== "string" || !SEMVER_REGEX.test(features.minAPI)) {
                    errors.push("features.minAPI must be a valid semantic version string (e.g., '1.0.0')");
                }
            }
            if (features.enabledForPowerPlatformAPI !== undefined) {
                if (typeof features.enabledForPowerPlatformAPI !== "boolean") {
                    errors.push("features.enabledForPowerPlatformAPI must be a boolean (true or false)");
                }
            }
        }
    }

    const valid = errors.length === 0;
    return {
        valid,
        errors,
        warnings,
        packageInfo: valid
            ? {
                  name: packageJson.name,
                  version: packageJson.version,
                  displayName: packageJson.displayName,
                  description: packageJson.description,
                  license: packageJson.license,
                  contributors: packageJson.contributors,
                  cspExceptions: packageJson.cspExceptions,
                  icon: packageJson.icon,
                  configurations: packageJson.configurations,
                  features: packageJson.features,
              }
            : undefined,
    };
}

// ---------------------------------------------------------------------------
// validatePPTBConfig
// ---------------------------------------------------------------------------

export function validatePPTBConfig(config: PPTBConfig, packageJson?: Pick<ToolPackageJson, "features">): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (config === null || typeof config !== "object" || Array.isArray(config)) {
        errors.push("pptb.config.json must be a JSON object");
        return { valid: false, errors, warnings };
    }

    const VALID_ROOT_KEYS = ["invocation", "agents", "workers"];
    const unknownRootKeys = Object.keys(config).filter((k) => !VALID_ROOT_KEYS.includes(k));
    if (unknownRootKeys.length > 0) {
        warnings.push(`pptb.config.json contains unrecognised root keys: ${unknownRootKeys.join(", ")}`);
    }

    const workerResult = Object.prototype.hasOwnProperty.call(config, "workers") ? validateWorkers(config.workers) : undefined;
    if (workerResult) errors.push(...workerResult.errors);
    if (workerResult && packageJson !== undefined && !matchesEntireString(packageJson.features?.minAPI, SEMVER_REGEX)) {
        errors.push("Worker declarations require a valid package.json features.minAPI");
    }

    if (config.invocation !== undefined) {
        const inv = config.invocation;
        if (inv === null || typeof inv !== "object" || Array.isArray(inv)) {
            errors.push("invocation must be a non-array object");
        } else {
            if (inv.version === undefined || inv.version === null) {
                errors.push("invocation.version is required");
            } else if (typeof inv.version !== "string") {
                errors.push("invocation.version must be a string");
            } else if (!SEMVER_REGEX.test(inv.version)) {
                errors.push(`invocation.version "${inv.version}" is not a valid semantic version string (e.g. "1.0.0")`);
            }

            if (inv.prefill !== undefined) {
                if (inv.prefill === null || typeof inv.prefill !== "object" || Array.isArray(inv.prefill)) {
                    errors.push("invocation.prefill must be a non-array object");
                } else if (inv.prefill.properties !== undefined) {
                    validateJsonSchemaProperties("invocation.prefill", inv.prefill.properties, errors);
                }
            }

            if (inv.returnTopic !== undefined) {
                if (inv.returnTopic === null || typeof inv.returnTopic !== "object" || Array.isArray(inv.returnTopic)) {
                    errors.push("invocation.returnTopic must be a non-array object");
                } else if (inv.returnTopic.properties !== undefined) {
                    validateJsonSchemaProperties("invocation.returnTopic", inv.returnTopic.properties, errors);
                }
            }

            if (inv.capabilities !== undefined) {
                if (!Array.isArray(inv.capabilities)) {
                    errors.push("invocation.capabilities must be an array");
                } else {
                    inv.capabilities.forEach((cap, idx) => {
                        if (typeof cap !== "string" || cap.trim().length === 0) {
                            errors.push(`invocation.capabilities[${idx}] must be a non-empty string`);
                        } else if (!KNOWN_CAPABILITY_TAGS.includes(cap.trim())) {
                            warnings.push(
                                `invocation.capabilities[${idx}] "${cap}" is not a recognised capability tag. ` +
                                    `Known tags: ${KNOWN_CAPABILITY_TAGS.join(", ")}. ` +
                                    "If this is a new tag, ensure it has been added to the capability registry.",
                            );
                        }
                    });
                }
            }
        }
    }

    if (config.agents !== undefined) {
        const agents = config.agents;
        if (agents === null || typeof agents !== "object" || Array.isArray(agents)) {
            errors.push("agents must be a non-array object");
        } else {
            if (agents.version === undefined || agents.version === null) {
                errors.push("agents.version is required");
            } else if (typeof agents.version !== "string") {
                errors.push("agents.version must be a string");
            } else if (!SEMVER_REGEX.test(agents.version)) {
                errors.push(`agents.version "${agents.version}" is not a valid semantic version string (e.g. "1.0.0")`);
            }

            if (agents.headless === undefined) {
                errors.push("agents.headless is required");
            } else if (typeof agents.headless !== "boolean") {
                errors.push("agents.headless must be a boolean (true or false)");
            }

            if (agents.invokable !== undefined && typeof agents.invokable !== "boolean") {
                errors.push("agents.invokable must be a boolean (true or false)");
            }

            if (agents.modes !== undefined) {
                if (!Array.isArray(agents.modes)) {
                    errors.push("agents.modes must be an array");
                } else {
                    agents.modes.forEach((mode, idx) => {
                        if (mode !== "one-way" && mode !== "two-way") {
                            errors.push(`agents.modes[${idx}] must be either "one-way" or "two-way"`);
                        }
                    });
                }
            }

            if (agents.defaultMode !== undefined) {
                if (agents.defaultMode !== "one-way" && agents.defaultMode !== "two-way") {
                    errors.push('agents.defaultMode must be either "one-way" or "two-way"');
                } else if (agents.modes !== undefined && Array.isArray(agents.modes) && !agents.modes.includes(agents.defaultMode)) {
                    errors.push("agents.defaultMode must be included in agents.modes");
                }
            }

            if (agents.timeoutMS !== undefined) {
                if (typeof agents.timeoutMS !== "number" || !Number.isFinite(agents.timeoutMS) || agents.timeoutMS <= 0) {
                    errors.push("agents.timeoutMS must be a positive number");
                }
            }
        }
    }

    const valid = errors.length === 0;
    return {
        valid,
        errors,
        warnings,
        packageInfo: valid ? { invocation: config.invocation, agents: config.agents, ...(workerResult ? { workers: workerResult.workers } : {}) } : undefined,
    };
}
