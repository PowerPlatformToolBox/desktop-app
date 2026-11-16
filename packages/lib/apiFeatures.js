// Generated from packages/validation/src/apiFeatures.ts; keep in sync.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRAPH_READ_PERMISSION = void 0;
exports.resolveToolApis = resolveToolApis;
exports.GRAPH_READ_PERMISSION = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*\.Read(?:Basic)?(?:\.All|\.Selected)?$/;
function object(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function validScopes(value) {
    return Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every((scope) => typeof scope === "string" && scope.length <= 150 && exports.GRAPH_READ_PERMISSION.test(scope));
}
/** Resolves legacy and current declarations; ambiguous declarations must not broaden host access. */
function resolveToolApis(features) {
    const apis = {};
    const errors = [];
    if (features === undefined) return { apis, errors };
    if (!object(features)) return { apis, errors: ["features must be an object."] };
    if (features.enabledForPowerPlatformAPI !== undefined) {
        if (typeof features.enabledForPowerPlatformAPI !== "boolean") errors.push("features.enabledForPowerPlatformAPI must be a boolean.");
        else if (features.enabledForPowerPlatformAPI) apis.pp = { required: true };
    }
    if ("azure" in features) errors.push("features.azure is not supported. Declare ARM and Graph using features.apis.");
    if (features.apis !== undefined) {
        if (!object(features.apis)) {
            errors.push("features.apis must be an object containing pp, arm and/or graph declarations.");
        } else {
            for (const [key, declaration] of Object.entries(features.apis)) {
                if (
                    !["pp", "arm", "graph"].includes(key) ||
                    !object(declaration) ||
                    Object.keys(declaration).some((property) => property !== "required" && !(key === "graph" && property === "scopes")) ||
                    (declaration.required !== undefined && typeof declaration.required !== "boolean") ||
                    (key === "graph" && !validScopes(declaration.scopes))
                ) {
                    errors.push(`features.apis.${key} is invalid. Use { required?: boolean } and, for graph, scopes with 1..20 read-only delegated permission names.`);
                    continue;
                }
                const required = declaration.required === true;
                const conflicts = key === "pp" && features.enabledForPowerPlatformAPI !== undefined && features.enabledForPowerPlatformAPI !== required;
                if (conflicts) errors.push(`features.apis.${key} conflicts with its legacy API declaration. Remove the legacy field or use matching settings.`);
                if (key === "pp" || key === "arm") apis[key] = { required };
                if (key === "graph") apis.graph = { required, scopes: [...declaration.scopes] };
            }
        }
    }
    return { apis: errors.length ? {} : apis, errors };
}
