// @ts-check
"use strict";

/**
 * Tool validation logic for Power Platform ToolBox tools.
 * Mirrors the validation rules used during the official review process.
 */

/** @typedef {{ name: string; url?: string }} Contributor */
/** @typedef {{ "connect-src"?: string[]; "script-src"?: string[]; "style-src"?: string[]; "img-src"?: string[]; "font-src"?: string[]; "frame-src"?: string[] }} CspExceptions */
/** @typedef {{ repository?: string; website?: string; funding?: string; readmeUrl?: string }} Configurations */
/** @typedef {{ multiConnection?: "required" | "optional" | "none"; minAPI?: string }} Features */
/**
 * @typedef {{
 *   name: string;
 *   version: string;
 *   displayName?: string;
 *   description?: string;
 *   contributors?: Contributor[];
 *   cspExceptions?: CspExceptions;
 *   license?: string;
 *   icon?: string;
 *   configurations?: Configurations;
 *   features?: Features;
 * }} ToolPackageJson
 */
/**
 * @typedef {{
 *   valid: boolean;
 *   errors: string[];
 *   warnings: string[];
 *   packageInfo?: object;
 * }} ValidationResult
 */

// List of approved open source licenses
const APPROVED_LICENSES = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "GPL-2.0", "GPL-3.0", "LGPL-3.0", "ISC", "AGPL-3.0-only"];

// Valid multiConnection values
const VALID_MULTI_CONNECTION_VALUES = ["required", "optional", "none"];

// Semver regex for minAPI validation
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/;

/**
 * Checks if a string is a valid URL.
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if a URL hostname is a GitHub domain.
 * @param {string} url
 * @returns {boolean}
 */
function isGithubDomain(url) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname === "github.com" || hostname.endsWith(".github.com");
    } catch {
        return false;
    }
}

/**
 * Validates an icon path string.
 * @param {string} fieldName
 * @param {string} iconPath
 * @param {string[]} errors
 */
function validateIconPath(fieldName, iconPath, errors) {
    if (iconPath.startsWith("http://") || iconPath.startsWith("https://")) {
        errors.push(`${fieldName} cannot be an HTTP(S) URL - icons must be bundled under dist`);
        return;
    }
    if (iconPath.startsWith("/")) {
        errors.push(`${fieldName} must be a relative path (e.g., 'icon.svg' or 'icons/icon.svg')`);
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

/**
 * Checks if a URL is accessible by making a HEAD request.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function isUrlAccessible(url) {
    try {
        const response = await fetch(url, { method: "HEAD", redirect: "follow" });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Validates a tool's package.json against the official review criteria.
 *
 * @param {ToolPackageJson} packageJson - The parsed package.json object.
 * @param {{ skipUrlChecks?: boolean }} [options] - Validation options.
 * @returns {Promise<ValidationResult>}
 */
async function validatePackageJson(packageJson, options = {}) {
    const { skipUrlChecks = false } = options;
    const errors = /** @type {string[]} */ ([]);
    const warnings = /** @type {string[]} */ ([]);

    // Required fields
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

    // License validation
    if (!packageJson.license) {
        errors.push("license is required");
    } else if (!APPROVED_LICENSES.includes(packageJson.license)) {
        errors.push(`License "${packageJson.license}" is not in the approved list. Approved licenses: ${APPROVED_LICENSES.join(", ")}`);
    }

    // Icon validation (optional, but must be a relative SVG path if provided)
    if (packageJson.icon === undefined || packageJson.icon === null) {
        warnings.push("icon is not set; consider adding a bundled SVG icon so your tool displays properly in the marketplace");
    } else if (typeof packageJson.icon !== "string") {
        errors.push("icon must be a string (relative path to bundled SVG under dist)");
    } else {
        validateIconPath("icon", packageJson.icon, errors);
    }

    // Contributors validation
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

    // Configurations validation
    if (!packageJson.configurations || typeof packageJson.configurations !== "object") {
        errors.push("configurations is required and must include repository and readmeUrl");
    } else {
        const configs = packageJson.configurations;

        // configurations.iconUrl is no longer supported
        if (/** @type {Record<string, unknown>} */ (configs).iconUrl !== undefined) {
            errors.push("configurations.iconUrl is no longer supported; use top-level 'icon' for bundled SVG path");
        }

        // Repository validation
        if (!configs.repository || typeof configs.repository !== "string") {
            errors.push("configurations.repository is required and must be a URL");
        } else if (!isValidUrl(configs.repository)) {
            errors.push("configurations.repository has an invalid URL format");
        } else if (!skipUrlChecks) {
            const accessible = await isUrlAccessible(configs.repository);
            if (!accessible) {
                errors.push("configurations.repository URL is not accessible");
            }
        }

        // Website validation (optional but recommended)
        if (!configs.website) {
            warnings.push("configurations.website is not set; consider adding a URL where users can learn more about your tool");
        } else if (!isValidUrl(configs.website)) {
            warnings.push("configurations.website has an invalid URL format");
        } else if (!skipUrlChecks) {
            const accessible = await isUrlAccessible(configs.website);
            if (!accessible) {
                warnings.push("configurations.website URL is not accessible");
            }
        }

        // Funding validation (optional but recommended)
        if (configs.funding) {
            if (!isValidUrl(configs.funding)) {
                warnings.push("configurations.funding has an invalid URL format");
            } else if (!skipUrlChecks) {
                const accessible = await isUrlAccessible(configs.funding);
                if (!accessible) {
                    warnings.push("configurations.funding URL is not accessible");
                }
            }
        }

        // ReadmeUrl validation
        if (!configs.readmeUrl || typeof configs.readmeUrl !== "string") {
            errors.push("configurations.readmeUrl is required and must be a URL");
        } else if (!isValidUrl(configs.readmeUrl)) {
            errors.push("configurations.readmeUrl has an invalid URL format");
        } else if (isGithubDomain(configs.readmeUrl)) {
            errors.push("configurations.readmeUrl cannot be hosted on github.com; use raw.githubusercontent.com or another domain");
        } else if (!skipUrlChecks) {
            const accessible = await isUrlAccessible(configs.readmeUrl);
            if (!accessible) {
                errors.push("configurations.readmeUrl is not accessible");
            }
        }
    }

    // CSP Exceptions validation (optional, but validated if present)
    if (packageJson.cspExceptions) {
        const validCspDirectives = ["connect-src", "script-src", "style-src", "img-src", "font-src", "frame-src"];

        const hasAnyDirectives = Object.keys(packageJson.cspExceptions).length > 0;
        if (!hasAnyDirectives) {
            errors.push("cspExceptions cannot be empty. If CSP exceptions are not needed, remove the cspExceptions field");
        }

        Object.keys(packageJson.cspExceptions).forEach((directive) => {
            if (!validCspDirectives.includes(directive)) {
                warnings.push(`Unknown CSP directive: ${directive}`);
            }
            const values = packageJson.cspExceptions?.[/** @type {keyof CspExceptions} */ (directive)];
            if (values && !Array.isArray(values)) {
                errors.push(`CSP directive "${directive}" must be an array of strings`);
            } else if (values && values.length === 0) {
                errors.push(`CSP directive "${directive}" cannot be an empty array`);
            }
        });
    }

    // Features validation (optional, but validated if present)
    if (packageJson.features) {
        const VALID_FEATURE_KEYS = ["multiConnection", "minAPI"];
        const featureKeys = Object.keys(packageJson.features);
        const invalidKeys = featureKeys.filter((key) => !VALID_FEATURE_KEYS.includes(key));

        if (invalidKeys.length > 0) {
            errors.push(`features can only contain ${VALID_FEATURE_KEYS.map((k) => `'${k}'`).join(", ")} properties. Invalid properties: ${invalidKeys.join(", ")}`);
        }

        if (packageJson.features.multiConnection === undefined) {
            errors.push("features.multiConnection is required when features object is provided");
        } else if (!VALID_MULTI_CONNECTION_VALUES.includes(packageJson.features.multiConnection)) {
            errors.push(`features.multiConnection must be one of: ${VALID_MULTI_CONNECTION_VALUES.join(", ")}`);
        }

        if (packageJson.features.minAPI !== undefined) {
            if (typeof packageJson.features.minAPI !== "string" || !SEMVER_REGEX.test(packageJson.features.minAPI)) {
                errors.push("features.minAPI must be a valid semantic version string (e.g., '1.0.0')");
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

module.exports = { validatePackageJson, isValidUrl, APPROVED_LICENSES };
